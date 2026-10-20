# TasteForge

**A cultural briefing agent that turns "who is my audience and what do they love?" into a brief where every recommendation is backed by a Qloo taste-graph signal you can inspect.**

Try it: [LIVE_URL] | Repo: [REPO_URL] | Demo video: [VIDEO_URL]

Built for the Qloo Agentic Hackathon. Licence: MIT.

## The problem

Small businesses and creators make taste decisions blind: what the cafe should look like, what plays on the speakers, which neighbourhood to pop up in, which brands to pair with. Big companies buy audience research. Everyone else guesses, or asks a general-purpose LLM.

A plain LLM answers fluently and confidently, but its picks are not grounded in any data about the audience. Some of them do not exist, and none of them can be traced back to a source. If a brief would read the same without a taste dataset behind it, it is not a brief.

## What it does

You describe a project and, optionally, a city. TasteForge returns a brief with these sections:

| Section | Contents |
|---|---|
| The audience | Affinities (films, shows, other taste signals) and age/gender skew |
| The look | Palette (hex swatches), lighting, materials and reference places, derived from decor and ambience tags of places the audience likes |
| The sound | Artists the audience over-indexes on, with trending direction |
| Pairings | Brands, plus menu or merch ideas inferred from cuisine tags |
| Where they are | Neighbourhood hotspots for the audience in your city, on a map (needs a city) |
| How to talk to them | Tone and phrases, each citing evidence |

Two entry points: **I know my audience** (you name artists, brands, tastes) and **Find my audience** (you describe what you make and the agent works out whose taste fits it).

What makes it different from a chat answer:

- **Why-chips.** Every item has a "Why" button that opens the exact Qloo call (endpoint, parameters, returned entities and affinity scores) behind it.
- **Grounding score.** A server-computed percentage of submitted items that cite real evidence. Ungrounded items are removed and listed, not shown.
- **Taste Proof.** Qloo itself scores a plain LLM's picks and TasteForge's picks against the same audience. See below.
- **Refine loop.** Like, dislike or lock any item. Only the sections you touched are re-walked, with disliked entities excluded and liked ones added as signals.
- **Showcase briefs.** Three example briefs are pre-generated on the server so the first visit is instant even when free LLM tiers are throttled.
- **Two-city comparison.** Re-runs the same audience for a second city, reusing the first run's resolved seeds, and shows what differs. It has no Taste Proof, and usually costs a single LLM call (no seed extraction, no baseline).
- **Shareable `/b#...` links.** The brief and the evidence it cites travel in the URL fragment (never sent to a server). The server signs the evidence it issues, and a shared page asks `POST /api/verify` to check it, then shows a "Shared link, verified" or "unverified" banner, so an edited link cannot pass for Qloo data.
- Print / save as PDF from the brief view.

## How it uses Qloo

Qloo is the source of every recommendation. Nothing in a brief comes from the LLM's memory.

| Qloo endpoint | Used for | Where |
|---|---|---|
| `GET /search` | Resolve names the user mentions (artists, brands, places, films) to Qloo entity ids. Ambiguous matches become a "which did you mean?" question instead of a guess. Also resolves the baseline LLM's picks for Taste Proof. | `pipeline/resolve.ts`, `proof.ts` |
| `GET /v2/tags` | Turn concept phrases ("slow living", "japanese ceramics") into Qloo tag ids that act as taste signals. Required for Find my audience mode. | `pipeline/resolve.ts` |
| `GET /v2/insights` with `filter.type` = `artist`, `movie`, `tv_show`, `brand` | Audience affinities, the sound, brand pairings, using entities and tags as `signal.interests.*`. `feature.explainability` is available on the query builder. | `pipeline/walk.ts` |
| `GET /v2/insights` with `filter.type=place` and `filter.location.query` | Places the audience likes in the chosen city; the top five feed the aesthetic and cuisine lookups. | `pipeline/walk.ts` |
| `GET /v2/insights` with `filter.type=urn:tag` | Tag analysis of those top places, restricted to `urn:tag:decor:qloo` and `urn:tag:ambience:qloo` (look) and `urn:tag:genre:place:restaurant` (menu ideas). | `pipeline/walk.ts` |
| `GET /v2/insights` with `filter.type=urn:demographics` | Age and gender skew of the audience. | `pipeline/walk.ts` |
| `GET /v2/insights` with `filter.type=urn:heatmap` | Where the audience concentrates in the city, by neighbourhood boundary. | `pipeline/walk.ts` |
| `GET /v2/trending` | Whether the top artists are rising in popularity. | `pipeline/walk.ts` |
| `GET /v2/insights` with `filter.results.entities` | Taste Proof: Qloo ranks a supplied shortlist (the baseline LLM's picks and TasteForge's picks) against the same signals. | `proof.ts` |
| `GET /v2/insights` with `filter.exclude.entities` / `filter.exclude.tags` | Refine loop: keep disliked items out of the re-walk. | `refine/`, `pipeline/walk.ts` |

The critic step can also re-issue insight queries with the city dropped, only tags, only entities, or more results when a section comes back thin. All request builders are pure functions with tests that assert the exact query-string parameter names, because Qloo silently ignores unknown parameters (`src/lib/qloo/query.ts`).

### The rule: the LLM translates, Qloo decides

The LLM has three jobs: extract seeds and concepts from your text, decide which allowed follow-up queries to run when coverage is thin, and write the brief's prose and colour mapping. It may not introduce an artist, place, brand or tag that is not in the data.

### The evidence ledger

Every Qloo result becomes an immutable record with an id (`ev_1`, `ev_2`, ...) holding the endpoint, parameters, a summary, and the returned entities and tags with their scores. The synthesis step receives only these records. Each brief item must cite one or more ids.

### The grounding score

`validateBrief` is a pure function. It removes any item whose citations are missing or do not exist in the ledger, records why, and computes `groundingScore = grounded items / submitted items`. Dropped items count against the score. The UI shows the score and a note listing what was dropped.

### Taste Proof

Answers "is a TasteForge brief safer to use than a plain LLM answer?" with Qloo's data rather than our say-so. The panel leads with what a plain answer gets wrong and ends with the fit comparison, because the fit gap on live data is modest:

1. As soon as the seeds are resolved (not earlier, so a run that stops to ask "which did you mean?" spends nothing), ask the LLM with no Qloo data for about 6 artists, 6 places and 4 brands for the same audience (the baseline).
2. Resolve the baseline names to Qloo entities via `/search`. Names Qloo cannot find are counted as "not found".
3. For each kind, call `/v2/insights` with `filter.results.entities` set to the shortlist (baseline plus TasteForge picks) and the same audience signals, so Qloo scores both lists identically.
4. Show, in this order: (a) picks Qloo could not find (likely invented or non-local), (b) local verification: how many TasteForge places Qloo located in the requested city with an address on file, against how many plain-LLM places Qloo knows at all, and (c) the average affinity comparison, as a secondary metric. Every TasteForge pick has a `trace` button that opens the evidence record that surfaced it. Averages cover only picks Qloo found; "not found" is never averaged in as zero. The user's own seeds are left out of both lists.

Proof failure never fails the brief. Honest framing: the score measures fit with the audience's Qloo taste signals, not quality in general.

What it claims, and what it does not: every pick is verified and traceable to a Qloo result, its fit is never lower than the plain answer's in our runs, and it catches picks that do not exist in Qloo or are not local. It does not claim a large fit advantage.

Result: live Qloo data, real LLM, 2026-10-20 (Indore cafe, London ceramic artist, New York A24/Radiohead/Vietnamese date night). Plain-LLM average affinity 0.86, 0.86 and 0.87 against TasteForge 0.93 on all three. Qloo could not find 2, 2 and 0 of the plain answers' 12 to 14 picks (for example "Muskaan" and "O2 Cafe Hill" for Indore), while every TasteForge pick is a Qloo result and every TasteForge place was located by Qloo in its city. Numbers from a local mock run come from synthetic fixtures and mean nothing.

## Architecture

A hybrid pipeline: code does the predictable work, the LLM does the judgement calls. 3 to 5 LLM calls per brief instead of an open-ended tool loop.

```
seeds (LLM, light) -> resolve (Qloo) -> parallel graph walk (Qloo)
  -> critic (LLM, light, max 2 rounds) -> synthesis (LLM) -> validator -> Taste Proof
```

Streaming over Server-Sent Events, so the UI shows the graph walk as it happens. Full diagram, event contract, module map and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

Requires Node.js 20+ (the repo is on Next.js 16 / React 19).

```bash
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

Run with no keys at all (offline, scripted LLM and synthetic Qloo fixtures):

```bash
# .env.local
QLOO_MODE=mock
LLM_PROVIDER=mock
```

Run with a real LLM and mock Qloo: set `QLOO_MODE=mock`, `LLM_PROVIDER=gemini` and `GEMINI_API_KEY` (free key from Google AI Studio). Mock mode returns clearly fake data ("Velvet Static", "Cafe Lumen") shaped like Qloo responses. Switch to real data with `QLOO_MODE=live` and `QLOO_API_KEY`; nothing else changes.

## HTTP API

| Endpoint | Purpose | Request body (JSON) |
|---|---|---|
| `POST /api/brief` | Build a brief (SSE stream) | `{ prompt, mode, city?, selections? }`, max 4 KB |
| `POST /api/brief/refine` | Re-walk the sections with marked items (SSE) | `{ prompt, mode, city?, brief, evidence, signals?, signatures, feedback }`, max 200 KB |
| `POST /api/brief/compare` | Same audience in a second city, no Taste Proof (SSE) | `{ prompt, mode, city, signals?, signatures? }`, max 6 KB |
| `POST /api/verify` | Check the evidence on a shared link | `{ evidence, signatures }` returns `{ verified }` |
| `GET /api/showcase` | Pre-generated example briefs; `?retry=1` retries failed ones (rate limited) | none |
| `GET /api/health` | Liveness and configuration summary (200 ok, 503 misconfigured) | none |

Details, the event contract and the module map are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `QLOO_MODE` | `mock` | `mock` (synthetic fixtures, no key) or `live` |
| `QLOO_API_KEY` | none | Qloo hackathon key; required when `QLOO_MODE=live` |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` | Qloo API base URL |
| `LLM_CHAIN` | `gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash,gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b` | Ordered `provider:model` list. A model that answers 429, quota exhausted or 503 cools down (daily quotas until 00:00 UTC, others for the server's retry-after) and the next one answers, so several small free tiers add up (Gemini free keys allow about 20 requests a day per model). Models whose provider has no key are skipped. The model that wrote a brief is shown in its header. |
| `GEMINI_API_KEY` | none | Google AI Studio key for `gemini:` entries |
| `GROQ_API_KEY` | none | Groq key for `groq:` entries (strongly recommended as the fallback) |
| `LLM_PROVIDER` | unset | `mock` (offline scripted JSON, used by E2E) always wins. `groq` puts the Groq models first. Otherwise legacy and optional. |
| `GEMINI_MODEL`, `GROQ_MODEL` | unset | Legacy: when `LLM_CHAIN` is unset the model is added to the front of its provider's group in the default chain |
| `LEDGER_SECRET` | random per process | Key for the HMAC that signs the evidence handed to the browser (refine, compare, shared links). Use a long random value (16+ characters, e.g. `openssl rand -base64 32`). Without it a random secret is generated at startup and a warning is logged; shared links then stop verifying after each restart. `render.yaml` generates one for you. |
| `MAX_CONCURRENT_BRIEFS` | `4` | Briefs, refinements and comparisons that may run at once, server-wide. Beyond it visitors get a friendly, retryable "demo is busy" message. |
| `DAILY_LLM_BUDGET` | `600` | LLM calls per UTC day, server-wide. Once spent, new runs get a "try again tomorrow" message instead of hammering the free tier. |

Keys are read from the environment only. `.env*` is git-ignored except `.env.example`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm test` | Vitest unit and component tests |
| `npm run test:coverage` | Same, with V8 coverage |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright end-to-end flow (submit, brief, evidence drawer, Taste Proof, map, refine) |
| `npm run smoke` | Real LLM from your env plus mock Qloo; prints stages, LLM call count, duration, grounding and proof averages |
| `npm run qloo:check -- --live` | Probes each Qloo endpoint and parameter and prints PASS/WARN/FAIL. Needs `-- --live` and `QLOO_API_KEY` to test real data; without `--live` it runs against the mock fixtures and proves nothing about the live API. |

## Deploy

- **Render / Docker.** A `Dockerfile` and `render.yaml` are included; set the env vars above in the service settings. Health check at `GET /api/health`: it returns 200 when the environment is valid and **503 when it is misconfigured** (for example `QLOO_MODE=live` without `QLOO_API_KEY`, or no LLM key), so the first Render deploy reports unhealthy until you have set the keys marked `sync: false` in the dashboard. `LEDGER_SECRET` is generated by the blueprint.
- **Vercel.** Import the repo, set the env vars, deploy. Brief routes set `maxDuration = 120` seconds (a live brief takes 30 to 60 s); if your plan's function limit is lower, use the container route.

The showcase cache and rate limiter are per server instance (in memory, with a git-ignored on-disk cache), which suits a single container. On serverless platforms each cold instance regenerates showcases.

## Data handling

- No personal data. The app sends only the project description you type, the optional city, and Qloo results to the LLM provider. Do not paste personal information. Google's free Gemini tier may use prompts to improve its products.
- Qloo responses are never committed. The repo contains only synthetic fixtures. Caching is server-side and private: an in-memory LRU (500 entries, one hour) for live Qloo calls and a git-ignored `.cache/` directory for showcase briefs.
- A brief sent to your browser contains the evidence records it cites (needed for the Why drawer); that is the only Qloo-derived data that leaves the server.
- No accounts, no database, no analytics.
- In live mode, neighbourhood names for coordinate-only hotspots come from OpenStreetMap Nominatim reverse geocoding (rate-limited, cached). Mock mode makes no such calls.
- Abuse limits: brief, refine and compare share one allowance of 12 requests per 10 minutes per visitor. The visitor is identified by the platform header (`true-client-ip` on Render, `x-real-ip` on Vercel) or the last `X-Forwarded-For` hop, never the client-controlled first entry. On top of that sit a server-wide cap on concurrent runs, a daily LLM-call budget (`MAX_CONCURRENT_BRIEFS`, `DAILY_LLM_BUDGET`), a limit on manual showcase retries (one per minute for the whole server) and size limits that are enforced on the bytes read, not just the `Content-Length` header.
- Request bodies are schema-validated, Qloo ids from the browser must look like Qloo ids, and user-provided text is fenced (`<<< >>>`) in every LLM prompt with an instruction to treat it as data.
- Evidence and taste signals that come back from the browser (refine, compare, shared links) must carry the server's HMAC signature (`LEDGER_SECRET`); edited or invented evidence is rejected.

## Known limits

- **No item-level products.** Qloo has no SKU or product catalogue. Pairings are brands plus menu or merch ideas inferred from cuisine tags, not "buy this exact item".
- **Affinity measures fit with taste signals.** Taste Proof shows that picks are real, local and at least as close to the audience's Qloo signals as an ungrounded LLM list (the fit gap is modest on live data). It does not measure sales, quality or novelty.
- **Result hygiene.** In code, before the writer sees Qloo results: the user's own seeds are removed (by id and normalized name), places more than 50 km from the city's result cluster are dropped (with a same-city widening query if that leaves too few), film and TV picks below the batch median affinity are omitted, and style tags are ranked by how specific they are to the top places versus the city's ordinary places.
- **Coverage varies by city.** Places, decor/ambience tags and heatmaps depend on Qloo's coverage. Thin sections get a lower confidence label and the critic tries fallbacks (drop the city, tags only).
- **Free-tier LLM limits.** Gemini and Groq free tiers are rate-limited. The app walks the `LLM_CHAIN` cascade (see above), cooling down any model that hits its quota or an outage, and paces showcase generation. Under heavy load you may see a "busy, retrying" state.
- **Demo capacity.** A server-wide cap on concurrent runs and a daily LLM budget protect the free tiers; when either is hit the app says it is busy and to retry. Limits and caches are per server instance.
- **Pipeline deadline.** A brief has a 60 second budget (live Qloo calls take 1 to 10 s each); very slow upstreams end in a friendly retryable error.
- Parameter spellings that could not be confirmed offline are marked `VERIFY with live key` in `src/lib/qloo/` and are checked by `qloo:check`.

## Licence

MIT. See [LICENSE](LICENSE).
