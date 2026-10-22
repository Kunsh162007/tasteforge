# TasteForge: project memory for Claude Code

Read this first. It is the only design document left in the repo (the Devpost text, demo scripts, benchmark report and
research notes were deleted after submission). `README.md` is the judge-facing front page; `AGENTS.md` only carries the
Next.js 16 warning block that `next dev` rewrites. Do not delete either.

## 1. What it is

TasteForge builds a **cultural brief for a new café, bar, shop or studio** from Qloo's taste graph. The user describes the
place in a sentence and names a city; the app returns the audience (films, shows, demographics), the look (a palette
derived in code from decor/ambience tags of real local places the audience likes), the sound (artists, trending), pairings
(brands, menu ideas), where they are (neighbourhood hotspots on a map), how to talk to them, a **Taste Proof** (a plain LLM's
answer checked against Qloo) and a **Monday list** of six actions. Every item cites an evidence record (a real Qloo result)
that opens in a "Why" drawer.

For: independent café/bar/restaurant founders before opening, and the interior designers who brief them.

- Site: https://tasteforge-fa98.onrender.com
- Repo: https://github.com/Kunsh162007/tasteforge (Render deploys `main` automatically)
- Licence: MIT. Stack: Next.js 16.4 (App Router), React 19, TypeScript, Tailwind 4, zod 4, Leaflet, Vitest, Playwright.
  Node 20+ locally, Node 22 in the Dockerfile.

## 2. Hackathon context

Built for the **Qloo Agentic Hackathon** (Devpost). Submitted October 2026 (the work ran 2026-10-20 to 2026-10-22).
Judging runs **2 to 16 November 2026**; winners are expected around **23 November**. The submission is frozen in the sense
that the user considers it done; changes now are polish or fixes, and the live site must stay up and fast for judges.
`docs/media/*.png` are kept on purpose: the submitted Devpost story embeds them from GitHub raw URLs and
`docs/media/thumbnail.png` is the project image. Never delete or rename them.

## 3. Core principle and key decisions

**"The LLM translates, Qloo decides."** The LLM turns text into Qloo queries and Qloo results into prose. Qloo chooses every
artist, place, brand, hotspot and style tag. The LLM names colours, writes captions, playlist direction, menu wording and copy
lines around that evidence. Everything it writes cites evidence ids; a pure validator removes anything that does not.

| Decision | Why |
|---|---|
| Hybrid pipeline (3 to 5 LLM calls), not a free tool loop | First version let the model pick every call: 10 to 15 LLM calls, slow, burned free-tier limits. The old loop (`run.ts`, `chat()` tool path) is deleted. |
| Evidence ledger plus validator | "Grounded" must be checkable: ids exist in the ledger or they do not. Score is computed by code. |
| Say "couldn't verify", never "invented" | Qloo's catalogue is not the world. A pick can be real but missing from Qloo, listed under another type, or in another city. Applies to UI copy, README and any new text. |
| No Qloo response data committed | Qloo terms. Repo holds synthetic fixtures only; `.cache/` is git-ignored. |
| Free-tier LLMs only (Groq + Gemini) | No spend. Cascade with cooldowns and a token budget keeps the demo alive. |
| **Spending guards removed on purpose** | An earlier Qloo quota guard and cost caps could pause the demo. Judges must never be paused. Quota is shown in `/api/health` for information only; nothing stops on it. Do not re-add a hard stop. |
| Palette derived in code, named by the model | A model-written palette converged on the same four colours for every brief. Code maps the brief's own tags to colours (stable hash, so repeatable). |
| Stateless server, client echoes brief + evidence + signals | No database. Evidence is HMAC-signed (`LEDGER_SECRET`) so the browser cannot forge "Qloo data". |
| Taste Proof claims verifiability, not better fit | Fit is roughly equal between plain LLM and TasteForge; do not claim a fit advantage. |
| Ask when a seed name is ambiguous | A wrong guess poisons every downstream call. Showcases auto-pick instead. |
| One shared rate limiter and a run cap | Separate per-route limiters tripled an allowance. Cap gives a friendly retryable "busy" message. |

## 4. Architecture

```
POST /api/brief -> route guard (rate limit, byte-limited body, zod, run slot)
 1 seeds      LLM fast chain, JSON: named seeds, 2-6 concepts, city        (lenient reader, one retry)
 2 resolve    Qloo /search + /v2/tags in parallel; ambiguous -> needs_input event
 3 walk       Qloo, parallel branches: audience / sound / pairings / aesthetic / where
              soft deadline 28 s: late calls become "Left out:" evidence, brief still written (partial)
 4 critic     LLM fast chain, ONE round, ~10 s, fixed menu of follow-ups (drop city, tags only, entities only, more)
              skipped when nothing is thin or the walk was partial
 (floors)     widen.ts: if places<4, artists<5, brands<3, palette tags<3 -> one round of broader queries
 5 synthesis  LLM main chain, JSON schema, reads only the lean ledger view; palette from code
 6 validate   pure code: drop uncited items, groundingScore = cited / submitted, per-section confidence
 (repair)     repair.ts: a section still under its floor gets one repair call, then is filled from the ledger
 7 proof      Taste Proof (baseline LLM started as soon as seeds resolve; 12 s cap, failure never fails the brief)
```

Pipeline deadline is 90 s (`PIPELINE_TIMEOUT_MS`), shared by every LLM call; routes set `maxDuration = 120`.

### Evidence ledger
Every Qloo result becomes an immutable record `ev_1, ev_2, ...` (endpoint, params, summary, entities and tags with scores,
`signal_location` when used). Synthesis sees only these. Ids depend on call order, so never hash them for stability.

### Validator and citation coverage
`validateBrief` is pure. It strips items with missing or unknown citations, records why (`dropped[]`) and computes
`groundingScore` (UI label: "citation coverage"). Dropped items count against the score. It proves a citation exists, not
that every caption is true. Menu/merch ideas may only use words that appear in Qloo tags or names (`menuRule.ts`: "Post-Punk
Pepperoni Pizza" is removed, "Pizza" kept).

### Taste Proof (`proof.ts`, `verify.ts`, `proofStats.ts`)
1. Plain LLM (fast chain, no Qloo data) names ~6 artists, 6 places, 4 brands for the same audience (the baseline).
2. Each name is searched in Qloo across all types; names compared after removing accents, "The", punctuation, descriptors
   ("Cafe"). Result: verified, wrong type, other city (>50 km from the city centre) or not in Qloo's data.
3. `filter.results.entities` makes Qloo score the shortlist (baseline plus TasteForge picks) with the same signals.
4. UI order: unverified picks first, local verification second, average affinity last as a sanity check only (Qloo
   normalizes affinity per query; unverified picks are never averaged in as zero). The user's own seeds are excluded.

### Refine (`agent/refine/`)
`POST /api/brief/refine`: like, dislike, lock items. Only touched sections are re-walked. Dislikes go to Qloo as
`filter.exclude.entities/tags`, likes are added as signals; locked and liked items are kept verbatim. The heatmap has no
exclude parameter, so disliked cells are filtered after the call. Palette is re-derived from the whole ledger with the
rejected colours as salt and named from a table of 93 colour names (no LLM tokens). Disliking a swatch excludes its tags
from the next place walk.

### Compare (`agent/compare/`)
`POST /api/brief/compare`: same audience in a second city, reuses the first run's signed signals, one synthesis call, no
Taste Proof.

### Share links and signing (`security/ledgerSig.ts`, `share/codec.ts`, `app/b/`)
The brief travels in the URL fragment (`/b#...`, lz-string). The server HMAC-signs each evidence record, the signal set,
and a slimmed form for share links. `/api/verify` lets the shared page show "Shared link, verified" or "unverified". The
signature covers evidence, not the prose. Without `LEDGER_SECRET` a random per-process secret is used and shared links stop
verifying after a restart (Render's blueprint generates one).

### Palette derivation (`agent/colour/`)
Tags in the brief's evidence become weighted **cues** (`cues.ts`): style (decor, ambience) 1.0, genre 0.85, audience concept
0.6, cuisine 0.5, weight = `(0.35 + 0.65*score) * sourceWeight / (1 + 0.1*rank)`. Decor/ambience tags are ranked by
specificity: share among the top places minus share among the city's ordinary places (the baseline), generic tags dropped.
`families.ts` is a curated table of 36 colour families (keywords, HSL ranges per role: light, mid, deep, accents; words of
3 letters or fewer must match whole words). The top four families (>= 25% of top weight) produce light ground, deep anchor,
saturated accent (>= 0.34 saturation, >= 100 RGB units from light and deep, shared accent pool as fallback), mid-tone and a
fifth colour. Values inside ranges come from an FNV-1a hash of sorted Qloo tag ids plus a salt, so the same evidence gives
the same palette. `undertone.ts` leans neutrals warm or cool. The model only names swatches (`apply.ts`/`names.ts`): label
kept unless empty, repeated, >60 chars or just a tag name; hex nudges allowed within 36 RGB units. Each swatch carries its
three strongest tag names and evidence ids. Palette captions never show dish tags (`ui/paletteCaptions.ts`).

### Hotspots (`pipeline/hotspots.ts`, `areaNames.ts`, `hotspotFill.ts`, `cityCentre.ts`, `geo/`)
Qloo's heatmap returns geohash cells with no names and is not limited to the city ("New York" ranks Rochester first). Cells
are kept only within a per-city radius (12 to 25 km, built-in table or Nominatim forward lookup). Naming order: the area
most of the nearest top places name in their addresses ("Vijay Nagar"), then Nominatim reverse geocoding, then a direction
from the city centre. Airport and industrial-land cells and unnameable cells are dropped, so raw coordinates never show.
Geocoder slowness must not drop hotspots (fix `5fda812`): fall back, do not vanish.

### Local picks
`signal.location.query` weights artist/brand/film/TV signals toward people in the city (Indore indie-folk: Kings of Leon
without it, Prateek Kuhad with it). Evidence keeps it as `signal_location`; UI marks those picks "local" (local listeners,
not necessarily local artists). Places use `filter.location.query`.

### Result hygiene
Seeds removed from results (id and normalized name); places > 50 km from the result cluster dropped (with a same-city
widening query if too few); film/TV below batch median affinity omitted; brands filtered to consumer/hospitality by tags
(`brandScope.ts`); possessives repaired (`displayName.ts`, Qloo returns "Dante s"); results sorted by affinity then id.

### Quota header recording (`qloo/quota.ts`)
Every Qloo response's `X-Second-RateLimit-*` and `X-Month-RateLimit-*` headers are recorded per process. Used to skip hedged
duplicates when under 3 requests remain in the second, to wait briefly on the per-second window (max 5 s), and shown in
`/api/health` as `qloo.quota`. Information only.

### Qloo client behaviour (`qloo/client.ts`)
Max 4 requests in flight, 250 ms gap between starts, 15 s timeout, hedged duplicate after 8 s (first answer wins), retries
with jitter on 429 (twice), 5xx and timeouts (once). In-memory LRU (500 entries, 1 h) and a git-ignored `.cache/`.
`QLOO_MODE=mock` swaps in synthetic fixtures ("Velvet Static", "Cafe Lumen").

### LLM layer (`llm/`)
- Two ordered **cascades**: `LLM_CHAIN_FAST` for seeds, critic and the Taste Proof baseline (starts gpt-oss-20b, qwen3.8-27b
  so gpt-oss-120b keeps its minute budget); `LLM_CHAIN_MAIN` for synthesis (starts gpt-oss-120b, then qwen, then Gemini
  2.5 Flash). Entries are `provider:model`, models without a key are skipped.
- A model answering 429, quota exhausted or 503 gets a **cooldown** (daily quotas until 00:00 UTC, else retry-after); the two
  chains share cooldowns. Switches are logged one per line (`llm groq:... -> gemini:...: rate_limit HTTP 429`).
- **Token budget** (`tokenBudget.ts`): per-model bucket from `x-ratelimit-*` headers else a 60 s window of usage; requests
  reserve an estimate (chars/3.3 plus reply cap). Groq requests carry `max_completion_tokens` (3000 synthesis, 800 short)
  because Groq's up-front check counts the reply you allow. Free Groq tier is 8000 tokens/min PER MODEL.
- When nothing has room it queues up to 25 s and emits a `queue` event ("High demand: your brief is next, about N seconds").
- Temperature 0 everywhere; seed plans cached per normalized prompt (`SEED_CACHE=0` disables, for tests); minimal Gemini
  thinking (3.x takes `thinkingLevel`, 2.5 budget 0; a budget of 0 on 3.x is HTTP 400); Groq `reasoning_effort` low.
- `LLM_PROVIDER=mock` (scripted offline JSON, used by e2e and tests) always wins.
- Measured 2026-10-20/21: Groq 0.4 to 1 s for short calls, ~5 s synthesis; Gemini free 9 to 21 s / 13 to 16 s, Gemini 3.5
  Flash-Lite mostly 503. Typical live brief: median ~16 s to brief, ~38 s with Taste Proof; slow runs are Qloo tails.
- Prompt hygiene: user text fenced `<<< >>>` (`fence.ts`), ids from the browser must look like Qloo ids. `promptView.ts` gives
  the lean ledger view (~4.3k input tokens per brief, down from 6.6k).

### Showcase (`lib/showcase.ts`, `http/showcaseService.ts`)
Six pre-generated briefs: Indore cafe, London ceramics, New York date-night pop-up, Brooklyn boutique, Chicago record-store
bar, Paris pop-up bakery. Built one at a time with a 4 s gap right after boot (production + `QLOO_MODE=live` +
`SHOWCASE_WARM_ON_BOOT=1`), cached in memory and in `.cache/`. A Render free instance forgets them when it sleeps, hence
`npm run warm`. Statuses: `queued | generating | ready | failed`; `?retry=1` clears back-off (1 per minute server-wide).

## 5. SSE event contract (`src/lib/agent/events.ts`)

`/api/brief`, `/refine`, `/compare` return `text/event-stream`; each frame is `event: <type>` + `data: <json>` (json repeats
`type`). The stream always ends with `done`. Unknown types must be ignored by clients (additive evolution).

| Event | Payload |
|---|---|
| `stage` | `stage`: seeds, resolve, walk, critic, synthesis, proof; `status`: start, done; `detail?` ("partial: N calls cut off", "skipped, out of time", "widened places and artists", "repaired artists") |
| `thinking` | `text` (reserved, no longer emitted) |
| `tool_call` | `id` (`p_N`), `name`, `args` |
| `tool_result` | `id`, `name`, `ok`, `summary`, `evidenceId?`, `durationMs?`; `ok:false` + summary starting "Left out:" = dropped to stay on time (UI shows skipped) |
| `needs_input` | `question`, `options[]` of `{label, qlooId, kind}`; client re-sends with `selections` |
| `brief` | `brief`, `dropped[]`, `evidence[]`, `signals?`, `signatures?` (HMAC over records, shared, signals; echoed back on refine/compare) |
| `proof` | `{baseline[], tasteforge[], baselineAvg, tasteforgeAvg, baselineNotFound, city?}`; averages `null` when nothing scored |
| `queue` | `waitSeconds` |
| `error` | `message`, `retryable` (user-safe) |
| `done` | `ok` (false also after `needs_input` and `error`) |

Request bodies: `/api/brief` `{prompt (3-1000), mode: "know_audience"|"find_audience", city?, selections?}` max 4 KB;
`/refine` adds `brief, evidence, signals?, signatures, feedback{liked,disliked,locked}` max 200 KB; `/compare` `{prompt, mode,
city, signals?, signatures?}` max 6 KB; `POST /api/verify` `{evidence, signatures}` -> `{verified}`; `GET /api/showcase`;
`GET /api/health` (200 ok, 503 misconfigured, includes `qloo.quota`). Errors before streaming are JSON: 400 (bad body or
failed signature), 413, 429 + `Retry-After` (12 requests per 10 min per visitor, shared), 503 (not configured, or busy).
Visitor identity: `true-client-ip` (Render) or `x-real-ip` (Vercel) or the last `X-Forwarded-For` hop, never the first.

## 6. Module map

```
src/app/            page.tsx, layout.tsx, b/page.tsx (shared brief), opengraph-image.tsx, icon/apple-icon,
                    error.tsx, not-found.tsx, globals.css
src/app/api/        brief/route.ts, brief/refine, brief/compare, verify, showcase, health   (thin: parse spec only)
src/lib/qloo/       client.ts (fetch, hedge, retry, LRU, mock switch), query.ts (PURE builders, exact param names),
                    normalize.ts, types.ts (ENTITY_TYPES), ids.ts, errors.ts, config.ts, cache.ts, quota.ts,
                    describe.ts, displayName.ts, mock.ts + fixtures/ (synthetic only), index.ts
src/lib/qloo/check/ qloo:check probes (apiChecks, placeChecks, verifyItems, report, helpers, types)
src/lib/llm/        gemini.ts, groq.ts, http.ts, retry.ts, cache.ts, config.ts (chain parsing + defaults), cascade.ts,
                    route.ts + index.ts (fast vs main routing), tokenBudget.ts, ratelimit.ts, json.ts, types.ts,
                    scripted.ts + mock.ts (offline providers)
src/lib/agent/
  pipeline/         index.ts (orchestrator), seeds, resolve, routing (which signals suit which query), walk, critic,
                    minimum + widen (floors), synthesis, promptView, repair, confidence, context, guard,
                    hotspots, areaNames, placeFacts
  colour/           cues, families, derive, apply, names, undertone, math
  refine/ compare/  plan, merge, synthesis, request schema, index
  ledger.ts validator.ts brief.ts briefItems.ts events.ts request.ts failure.ts fence.ts tools.ts toolSchemas.ts
  proof.ts proofStats.ts verify.ts generate.ts (pipeline + proof entry) palette.ts (quality check) menuRule.ts
  brandScope.ts dedupe.ts summaries.ts cityCentre.ts hotspotFill.ts testing.ts index.ts
src/lib/geo/        Nominatim geocoder (live mode only; coordinates clamped), forward lookup
src/lib/http/       streamRoute.ts (route scaffolding), request.ts, guards.ts, budget.ts (run cap), deps.ts (process-wide
                    LLM + Qloo clients), verifyRoute.ts, sse.ts, showcaseService.ts (singleton + boot warm-up)
src/lib/security/   ledgerSig.ts (HMAC), verifyRequest.ts, headers.ts (CSP etc.)
src/lib/share/      codec.ts (lz-string fragment)
src/lib/            env.ts (startup validation), rateLimit.ts, showcase.ts, singleton.ts (globalThis), log.ts,
                    mondayList.ts + mondayExport.ts, sentences.ts
src/components/     TasteForgeApp (client shell), Home, Compose, Stages, WalkView, BriefView, Section, ItemList,
                    WhyChip, EvidenceDrawer, EvidenceContext, TasteProofPanel, ItemFeedback, FeedbackContext, RefineBar,
                    Swatches, Specimen, HotspotMap(+Loader), MondayList, CompareBar, CompareView, ShareButton,
                    ShareVerification, SharedBrief, ShowcaseGallery, DroppedNote, PageShell, Logo, Colophon
src/ui/             contract.ts (UI types), sse.ts + stream.ts (client), runState.ts, demoState.ts, hotspots.ts,
                    compare*.ts, briefChanges.ts, feedback.ts, evidenceText.ts, paletteCaptions.ts, paletteImage.ts,
                    share.ts, showcase.ts, fixtures/, styles/
scripts/            warm.mts (npm run warm), qloo-check.mts (npm run qloo:check)
e2e/                brief.spec.ts, share-compare.spec.ts (Playwright, mock Qloo + scripted LLM)
docs/media/         screenshots embedded by the Devpost story and README. KEEP.
```

Functions under 50 lines where possible, files under 400 (800 hard max). Records and briefs are never mutated in place.

## 7. Environment variables

Read from the environment only. `.env*` is git-ignored except `.env.example`. **Never read, print or commit `.env.local`.**

| Variable | Default | Purpose |
|---|---|---|
| `QLOO_MODE` | `mock` | `mock` (fixtures) or `live` |
| `QLOO_API_KEY` | none | Hackathon key; required when live |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` | Hackathon key only works here |
| `LLM_CHAIN_FAST` | gpt-oss-20b, qwen3.8-27b, gpt-oss-120b (Groq), gemini-2.5-flash, gemini-3.5-flash-lite | seeds, critic, baseline |
| `LLM_CHAIN_MAIN` | gpt-oss-120b, qwen3.8-27b (Groq), gemini-2.5-flash, gemini-3.5-flash, gemini-3.5-flash-lite, gpt-oss-20b | synthesis |
| `LLM_CHAIN` | unset | Legacy single chain, used when a call type's own chain is unset |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | none | Keys for `groq:` / `gemini:` entries; set at least one |
| `GROQ_TOKENS_PER_MINUTE` | `8000` | Per-model minute budget until `x-ratelimit-*` headers refine it |
| `GROQ_TOKEN_LIMITS` | unset | Per-model overrides, e.g. `qwen/qwen3.8-27b=6000` |
| `LLM_PROVIDER` | unset | `mock` (always wins; e2e), `groq` puts Groq first, `gemini` legacy |
| `GEMINI_MODEL`, `GROQ_MODEL` | unset | Legacy: fronts that provider's group in the default chains |
| `LEDGER_SECRET` | random per process | HMAC key for evidence signatures; 16+ chars; Render generates it |
| `MAX_CONCURRENT_BRIEFS` | `4` | Server-wide concurrent runs (brief, refine, compare) |
| `SHOWCASE_WARM_ON_BOOT` | `1` | Build the six showcase briefs after boot (production + live); `0` off |
| `SHOWCASE_ADMIN_TOKEN` | none | Server side of `npm run warm -- --regenerate`; Render generates it |
| `WARM_TOKEN` | none | Local side of the same token (sent as `x-warm-token` header) |
| `WARM_URL` | site URL | Default target of `npm run warm` |
| `PIPELINE_TIMEOUT_MS` | 90000 | Whole-run budget |
| `SEED_CACHE` | `1` | `0` turns the seed-plan cache off (tests) |
| `NEXT_PUBLIC_SITE_URL` | unset | Absolute URL for link-preview images (falls back to `RENDER_EXTERNAL_URL`) |
| `NOMINATIM_USER_AGENT` | built-in | User-Agent for OpenStreetMap geocoding |

`/api/health` returns 503 when `QLOO_MODE=live` lacks `QLOO_API_KEY` or no LLM key exists, so the first Render deploy is
unhealthy until the `sync: false` keys are set in the dashboard.

## 8. npm scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next dev server, production build (standalone), production server |
| `npm test` | Vitest (735 unit and component tests) |
| `npm run test:coverage` | Same with V8 coverage |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check (no script; run directly) |
| `npm run test:e2e` | Playwright, 7 tests, mock Qloo + scripted LLM, starts its own server |
| `npm run warm` | Wake the deployed site and wait for all six showcase briefs; flags `--url= --timeout= --interval= --regenerate --token=` |
| `npm run qloo:check -- --live` | Probes each Qloo endpoint/param, prints PASS/WARN/FAIL and remaining quota (~21 live calls, counts against the monthly quota; without `--live` it only tests mocks) |

Offline dev: `.env.local` with `QLOO_MODE=mock` and `LLM_PROVIDER=mock`. Never make live Qloo or LLM calls from tests or from
routine verification.

## 9. Deploy and runbook

- **Render** web service from `render.yaml` (Docker, free plan, `autoDeploy: true` on `main`, health check `/api/health`).
  Blueprint sets `QLOO_MODE=live`, `QLOO_BASE_URL`, `GROQ_TOKENS_PER_MINUTE`, `MAX_CONCURRENT_BRIEFS`,
  `SHOWCASE_WARM_ON_BOOT`, generates `LEDGER_SECRET` and `SHOWCASE_ADMIN_TOKEN`. Keys marked `sync: false`
  (`QLOO_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`) live only in the Render dashboard.
- Blueprint also pins `LLM_CHAIN_FAST` / `LLM_CHAIN_MAIN`. **Do not set `LLM_CHAIN_*` in the dashboard**: a dashboard value
  overrides the blueprint and silently freezes old model names. Change chains in `render.yaml` (and `config.ts` defaults).
- **After every deploy or restart run `npm run warm`.** A free instance sleeps after 15 min idle (cold start ~30 s) and
  forgets its showcase cache; warm wakes it and waits (~5 min on live data) for all six briefs. It exits 0 when ready, 1 on
  timeout (run again; the server keeps building).
- **UptimeRobot** pings the site to keep the free instance awake during judging (check it is still active before 2 Nov).
- To rebuild all showcase briefs after a pipeline change: set `WARM_TOKEN` locally to the value of `SHOWCASE_ADMIN_TOKEN`
  from the Render dashboard, then `npm run warm -- --regenerate`. Never put the token in a URL or commit it.
- Judging-day checks: `GET /api/health` is 200 with `"problems":[]`; open two or three showcase briefs (each has its own
  palette, Why chips and a Taste Proof); build one live brief; read `qloo.quota` (information only).
- If LLM free tiers are spent, `/api/health` stays ok, live briefs say "busy", showcases still open instantly. The Render log
  shows model switches.
- Vercel also works (`maxDuration = 120` on brief routes) but each cold instance regenerates showcases; Render is the target.
- Showcase cache and rate limiter are per instance (in memory plus a git-ignored on-disk cache): suits one container.

## 10. Qloo API facts learned live

- Base URL for the hackathon key is `https://hackathon.api.qloo.com`; auth header `X-Api-Key`. The key works nowhere else.
- Qloo **silently ignores invalid or unknown parameters** and returns plausible data. Hence `qloo/query.ts` builders are pure
  and their tests assert exact query-string names. Never trust a 200 as proof a parameter worked.
- Entity type spellings: `urn:entity:videogame` (not `video_game`, HTTP 400), `urn:entity:destination` accepted by insights;
  our types are `artist, movie, tv_show, brand, place, ...` via `ENTITY_TYPES`.
- Tag search text param is `filter.query`. Tags have `parents: [{type}]` listing applicable entity kinds. Music-genre tags fed
  to a film query return blockbusters; tags only mean something for some query types (`pipeline/routing.ts`).
- `/v2/trending` takes **exactly one entity** and returns nothing for windows under about 173 days; we use a **180-day window**.
- Heatmap: `output.heatmap.boundary` only accepts `urn:geohash` (default) or `urn:entity:locality`; the locality boundary is not
  usable, so cells are geohashes with `location.{latitude,longitude,geohash}` and `query.affinity` and **no area name**, and
  results spill beyond the city.
- `signal.location.query` works for artists, brands and media (weights toward people in the place); places use
  `filter.location.query`.
- Entity tag analysis (`urn:tag` filter) returns data for decor, ambience and `urn:tag:genre:place:restaurant` on cafe and
  restaurant results. Tag-only queries saturate at 0.97 to 1.00, so order is not a ranking (UI says so).
- Insights with seed entities plus five or more tags can take 35 s; broad queries take 5 to 10 s, sometimes 25 to 40 s,
  and slow queries are slow every time (so do not retry on timeout).
- Bursts of more than about 5 requests answer 429 on the hackathon key; keep 4 in flight with 250 ms spacing.
- Rate limits arrive as headers on every response: `X-Second-RateLimit-{Limit,Remaining,Reset}` = 10 per second;
  `X-Month-RateLimit-{...}` = **50,000 per month**, resetting around **20 November**.
- Search hits can share only a common word with the seed ("Studio Ghibli" matched a Taylor Swift session title);
  `isPlausibleMatch` rejects those. Possessives come back broken ("Dante s"); `displayName.ts` repairs them.
- Noise tag families exist ("A24 Motorway" for film tags) and are filtered in `resolve.ts`.

## 11. Benchmark result (the script and report were deleted)

Method: 20 prompts across 5 cities (Indore, London, Brooklyn, Chicago, Paris; cafe, shop, studio, event; both modes). For
each, a plain LLM with no Qloo data named ~6 artists, 6 places, 4 brands (the Taste Proof baseline), TasteForge's picks were
the Qloo entities its walk returned (deterministic writer, to save quota), and every pick was checked against live Qloo
(search across all types, city for places, 50 km rule). Run 2026-10-21 on the Groq/Gemini fast chain.

- Plain LLM: **30% of 276 picks unverified** in the requested city (artists 36%, places 26%, brands 29%). TasteForge: **0% of 312**,
  by construction (it can only return what Qloo returned).
- Sorting the 84 misses **with AI assistance** (judgement from general knowledge, no per-name web check; not ground truth):
  **10 likely invented, 54 real but not in Qloo or listed under another type** (authors named as artists, companies, etc.),
  **15 only in another city**, **5 unclassified**. So the claim is verifiability, not that chatbots invent most things.
- Fit (average Qloo affinity of verified picks) is roughly equal (artists 0.89 vs 0.93, places 0.77 vs 0.83, brands 0.82 vs
  0.86); no fit advantage is claimed.
- Repeat-run overlap of picks (3 prompts, 2 runs, indicative): TasteForge about 80%, plain LLM 87% (before the stability work
  TasteForge was 0 to 42%). Stability came from temperature 0, seed-plan cache, sorted Qloo results, floors, repair.
- Caveats: Indore coverage in Qloo is thin; one day, one model; name matching can be generous for chain names.
- If rebuilding the benchmark, `git show 4dbca60:scripts/benchmark.mts` and `:docs/BENCHMARK.md` still hold the old code and
  report in history.

## 12. Known quirks and limits

- No item-level products (Qloo has no SKU catalogue): pairings are brands plus menu/merch ideas from cuisine tags.
- Citation coverage proves citations exist, not that captions are true. Affinity is a fit-with-signals sanity check only.
- Coverage varies by city; thin sections get a lower confidence label and the critic or floors try fallbacks.
- Free-tier LLM limits: about 1.5 briefs a minute fit on gpt-oss-120b; bursts spill to qwen then Gemini; beyond that the user
  sees "High demand" and a short queue (max 25 s). 3 simultaneous briefs measured 28 to 41 s each.
- A partial walk (28 s soft deadline) gives a lower-confidence brief rather than a late one; only a wholly unusable run errors.
- Render free instance: sleeps after 15 min, cold start ~30 s, loses showcase cache and `.cache/` when it sleeps.
- Nominatim reverse geocoding is rate-limited; live mode only. Mock mode makes no network calls.
- Hotspot naming from addresses can be wrong when Qloo's nearest places sit in a neighbouring area; the fallback is direction
  from centre. Brand names with Qloo's "other type" listings (people, companies) are not shown as venues.
- Model names in chains change quickly on free tiers; check Groq/Gemini availability before editing defaults.
- `AGENTS.md` says this is a newer Next.js than training data: read `node_modules/next/dist/docs/` before changing framework
  APIs.
- Data handling: no personal data, no accounts, no database, no analytics. Qloo data is never committed. A brief sent to the
  browser contains only the evidence records it cites. CSP and security headers are in `security/headers.ts`.

## 13. Conventions

- **TDD**: write the failing test first, make it pass, refactor; keep 80%+ coverage. Tests sit next to code (`*.test.ts`),
  component tests in `__tests__`. Query builders get exact-string assertions. Fix the implementation, not the test, unless
  the test is wrong.
- **Immutability**: never mutate records, briefs, ledgers; return new copies.
- **Size**: files under 400 lines (800 max), functions under 50, nesting under 4. Many small modules by feature.
- **Errors**: handle explicitly; user-safe messages in UI; detailed logs server-side; never swallow silently. A Taste Proof
  failure must never fail a brief. Validate input at boundaries with zod; fence user text in prompts.
- **Commits**: conventional (`feat|fix|refactor|docs|test|chore|perf|ci: description`). Commit messages end with the
  `Co-Authored-By: Claude ...` line the harness supplies. Do not commit unless asked. Never `--no-verify`.
- **Copy**: plain, specific, no "invented"; use "couldn't verify". No emojis. Keep README honest about the AI-assisted
  classification.
- **Verification before claiming done**: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`.
  Use `QLOO_MODE=mock LLM_PROVIDER=mock` for anything local. No live Qloo or LLM calls unless the user asks (Qloo has a
  50k/month cap and the free LLM tiers are shared with the live site).
- **Environment quirks**: Windows + Git Bash. A GateGuard hook may demand facts before the first Bash use or before
  creating/editing/deleting files (list the files affected, a one-line rollback, and quote the user's instruction verbatim),
  then retry; if Bash keeps refusing destructive commands, PowerShell `Remove-Item` works. Never kill all `node.exe`
  processes (the user's other tools run on Node); stop only the PID you started.

## 14. History (all on `main`)

| Date | Commit | What |
|---|---|---|
| 2026-10-20 | `ce9c31d` | Initial TasteForge agent grounded in Qloo's taste graph |
| 2026-10-20 | `74a9835` | Render blueprint with live Qloo data |
| 2026-10-20 | `07cb460` | 90 s pipeline budget for slow Qloo calls; live and repo URLs in docs |
| 2026-10-20 | `2548761`, `02489f4` | Docs match heatmap geohash naming and the model cascade |
| 2026-10-21 | `42a94e1` | Faster briefs (hybrid, soft deadline, hedging), redesigned UI, real palettes, fabrication benchmark |
| 2026-10-21 | `26b7179` | Evidence-derived palettes, Groq load spreading and token budget, high-demand queue, six showcase briefs |
| 2026-10-21 | `f6fa18b` | No thin briefs (floors, repair, lenient seeds), stable repeat runs, named hotspots, varied neutrals |
| 2026-10-21 | `f5ff977` | Honest verification wording, local audience picks, accurate hotspots, Monday list |
| 2026-10-22 | `cb70a6e` | Qloo quota guard, judge-ready docs and gallery, UI polish |
| 2026-10-22 | `4fd4eec` | Spending guards and one-off dev tooling removed on purpose; final live polish |
| 2026-10-22 | `de9596b`, `5fda812` | Palette captions without dish tags, possessive repair; hotspots survive a slow geocoder |
| 2026-10-22 | `a1ef985`..`4dbca60` | Final gallery, benchmark wording as AI-assisted, Devpost text/story and thumbnail |
| 2026-10-22 | (cleanup) | Post-submission cleanup: removed Devpost/demo/benchmark docs and the benchmark script; added this file |

Ideas if the user asks for changes: more showcase cities, a cheaper proof, per-city radius table growth, a Qloo-locality
heatmap if Qloo fixes the boundary parameter, exportable PDF brief.
