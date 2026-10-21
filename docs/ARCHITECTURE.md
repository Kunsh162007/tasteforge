# TasteForge architecture

One Next.js app (App Router, TypeScript, Node runtime). The browser posts a request, the server runs a hybrid pipeline and streams progress and results back as Server-Sent Events.

Core rule: **the LLM translates, Qloo decides.** The LLM turns text into Qloo queries and Qloo results into prose. It never supplies a recommendation. Everything it writes must cite evidence ids from a ledger of real Qloo results, and a pure validator removes anything that does not.

## Pipeline

```mermaid
flowchart TD
    U[Browser: prompt, mode, optional city] -->|POST /api/brief| R[Route: shared rate limit, byte-limited body,<br/>zod validation, run slot + daily budget]
    R --> S1

    subgraph Pipeline [Hybrid pipeline: 3 to 5 LLM calls]
      S1[1. Seeds - LLM fast chain, JSON<br/>seeds, concept tags, city] --> S2
      S2[2. Resolve - Qloo<br/>/search + /v2/tags in parallel] -->|ambiguous| NI[needs_input event<br/>user picks, request re-sent with selections]
      S2 --> S3
      S3[3. Graph walk - Qloo, parallel branches<br/>audience / sound / pairings / aesthetic / where<br/>soft deadline 28 s, partial result allowed]
      S3 --> S4
      S4{4. Critic - LLM fast chain<br/>sections thin?}
      S4 -->|yes, one round, ~10 s budget, allowed strategies only| F[Follow-up insights queries<br/>drop city, tags only, entities only, more results]
      F --> S5
      S4 -->|coverage ok, or walk was partial| S5
      S5[5. Synthesis - LLM main chain, JSON schema<br/>ledger evidence only, palette derived by code<br/>(the LLM names the swatches)] --> V
      V[Validator - pure code<br/>drop uncited items, grounding score] --> B[brief event]
    end

    L[(Evidence ledger<br/>ev_1, ev_2, ...)]
    S2 -. records .-> L
    S3 -. records .-> L
    F -. records .-> L
    L -. only input .-> S5
    L -. validates citations .-> V

    S2 -. once resolved .-> BL[Baseline - plain LLM, fast chain, no Qloo data<br/>artists, places, brands]
    BL --> P
    B --> P[6. Taste Proof<br/>/search resolves baseline, insights with<br/>filter.results.entities scores both lists]
    P --> PE[proof event]

    B --> UI[UI: brief, why-chips, grounding score]
    PE --> UI
    UI -->|like / dislike / lock| RF[POST /api/brief/refine<br/>verify signatures, re-walk touched sections only,<br/>exclusions + liked signals,<br/>merge, same validator, re-run proof]
    RF --> UI
    UI -->|second city| CP[POST /api/brief/compare<br/>verify signals, reuse seeds, one synthesis call,<br/>no Taste Proof]
    CP --> UI
```

The baseline LLM call starts as soon as the seeds have resolved (a run that stops with `needs_input` never starts it), so Taste Proof only waits on scoring. A proof failure or timeout (12 s) never fails the brief. The comparison route runs the pipeline with the first run's resolved signals and skips extraction, resolution and the proof.

## Stages in detail

| Stage | Who | What | Failure behaviour |
|---|---|---|---|
| seeds | fast-chain LLM, JSON | Extract named entities (never invented), 2 to 6 concept phrases, city, audience hint | Unusable JSON falls back to using the prompt text as a tag query; provider errors propagate |
| resolve | code, Qloo | `/search` per seed (typed first, then untyped), `/v2/tags` per concept, all in parallel. Exact name matches win; mixed-type matches become `needs_input`. When the user answers, the chosen ids go straight into the signals (and nobody is asked twice) | Nothing resolved: look the prompt up as a tag; still nothing: friendly non-retryable error |
| walk | code, Qloo | One parallel branch per section (see below). Qloo requests are hedged: a call still unanswered after 8 s gets one duplicate request, the first answer wins, and each request times out at 15 s | Failed calls are recorded as unusable evidence; the run fails only if nothing usable came back. A **soft deadline of 28 s** after the walk starts (shorter on a short run deadline) ends the data gathering: optional calls get 4 s more, calls still in flight are reported as `ok: false` with a summary starting "Left out:", the stage detail says "partial", the critic is skipped ("skipped, out of time") and the brief is written from what arrived, with lower section confidence |
| critic | fast-chain LLM, JSON | Sees per-section coverage (calls usable, items, failures); picks up to 3 follow-ups from a fixed menu. **One round** with a budget of about 10 s (at most a quarter of the time left); skipped when no section is thin or the walk was partial | A failing or late critic is ignored |
| synthesis | main-chain LLM, JSON schema | Writes the brief from usable ledger records, citing `ev_N` ids. The palette (4 to 5 swatches) is derived by code from the evidence (see "Palette derivation"); the model names each swatch (`label` is a real colour name such as "Clay terracotta"), and `tags`, `evidence` and `role` come from code. The prompt is the lean view of the ledger (see "Load handling") | One repair round on invalid output; the first valid draft is kept if the repair fails |
| validate | pure code | Strip items without valid citations, compute grounding score, attach per-section confidence | Cannot fail |
| proof | code, Qloo + baseline | See README | Returns "unavailable", brief unaffected |

### Graph walk per section

| Section | Qloo calls |
|---|---|
| audience | `/v2/insights` movie (8), tv_show (6), `urn:demographics` |
| sound | `/v2/insights` artist (10), then `/v2/trending` for the top 3 artists |
| pairings | `/v2/insights` brand (10); cuisine tags of the top places |
| aesthetic | `/v2/insights` place in the city (10); `urn:tag` analysis of the top 5 places, filtered to decor and ambience tag types |
| where | `/v2/insights` `urn:heatmap` in the city; coordinate-only hotspots get a neighbourhood name via reverse geocoding (live mode only) |

Place-based sections run only when a city is known.

## Palette derivation

The palette is computed in code from the evidence of that brief. The model only names the swatches. Code: `src/lib/agent/colour/`.

```
ledger + signals -> cues (colour/cues.ts) -> families, weighted (colour/derive.ts, families.ts)
                 -> light / deep / accent / mid / extra swatches, values picked inside ranges by a stable hash
                 -> prompt lists the swatches -> model returns {label, hex?} per swatch (colour/apply.ts)
                 -> final swatch = code's hex (nudged at most 36 RGB units), role, tags and evidence + the model's name
```

**Cues.** The tags of the brief's own evidence that say something about how the place should look, each with a weight = `(0.35 + 0.65 x score) x source weight / (1 + 0.1 x rank)`:

| Source | Tags | Source weight |
|---|---|---|
| style | decor and ambience tags of the reference places. They are already ranked by specificity: share among the top places minus share among the city's ordinary places (the city baseline), and generic tags are dropped | 1.0 |
| genre | music tags that became signals (from the request's own genres) | 0.85 |
| audience | concept tags that became signals ("young professionals", "slow living") | 0.6 |
| cuisine | cuisines and signature dishes of the top places, and the venue type that became a signal | 0.5 |

**Curated mapping** (`colour/families.ts`). 36 colour families, each with keywords (matched at word starts; `=word` and keywords of 3 letters or fewer must be whole words, so "bar" is not "barbecue" and "chic" is not "chicken") and, per role, HSL ranges for a light ground, a mid-tone, a deep anchor and one or more accents. Examples:

| Tags | Family | What it gives |
|---|---|---|
| vintage, retro, nostalgic, traditional | vintage-ochre | aged cream, faded ochre-tan, brown, mustard or rust accent |
| minimalist, modern, sleek, contemporary | minimal-cool | cool whites and greys, ink, slate-blue or copper accent |
| cozy, rustic, farmhouse, warm | warm-wood | oat, walnut, copper-rust accent |
| industrial, loft, concrete, brick | industrial-steel | concrete, steel, charcoal, safety-orange or amber accent |
| botanical, garden, plant, natural | botanical-green | sage, forest, fern accent |
| elegant, upscale, luxurious, art deco | jewel-elegant | champagne, emerald or burgundy deep tones, brass or ruby accent |
| slow living, wabi-sabi, japanese, ceramic, handmade | calm-stone | rice paper, greige, indigo, persimmon accent |
| intimate, romantic, date night, cocktail | moody-plum | blush, mauve, aubergine, amber accent |
| indie, folk, jazz, rock, electronic, hip hop, classical, reggae, bollywood... | one family per music genre | dusty blues, brass and midnight, ember red, neon, gold, ivory and burgundy... |
| coffee, italian, mediterranean, mexican, vietnamese, sushi, bbq, wine... | one family per cuisine | mocha and caramel, tomato and olive, aegean white and blue, agave, lacquer red and lime... |
| casual, informal, welcoming, charming | easy-linen, counted at 0.3 | words every venue uses barely move the palette |

Decor and ambience words the table does not know still colour the palette: a pseudo-family takes its hue from a hash of the tag names, at half weight. Dishes, genres and concepts the table does not know are left out.

**Algorithm.** Family weight = the sum of its cues' weights (a cue matching several families splits its weight). The strongest four families, at least 25% of the top weight, shape the palette:

1. light ground from the strongest family; deep anchor from the third (else the first);
2. accent: tried in turn from the fourth, second, third and first family, using the family's own accent tones (counted three times in the draw) and a shared pool of eight accents (saffron, teal, cobalt, emerald, magenta, olive, violet, coral). It must be saturated (>= 0.34) and at least 100 RGB units from the light and the deep colour; lightness is nudged until it is, and the complement of the lead hue is the last resort;
3. mid-tone from the second family and a fifth colour from the others, both kept 60 units from the accent and 45 from each other.

Values inside the ranges come from `hash01` (FNV-1a) of the sorted Qloo tag ids behind the cues plus a salt. Different evidence gives a different palette, the same evidence gives the same one on every run (ledger ids such as `ev_7` depend on call order, so they are not hashed). Each swatch carries the three strongest tag names of the family that supplied its colour, and the ledger records holding them (`tags`, `evidence`), so every colour is traceable to Qloo tags.

**The model's part.** The synthesis prompt lists the swatches (`1. #E9E1D0 base; tags: Vintage, Retro`). The reply schema for the palette is `[{label, hex?}]`. `finishPalette` keeps the model's label unless it is empty, repeated, over 60 characters or just a tag name, in which case the nearest entry of a table of 93 designer colour names is used. A hex nudge is accepted only within 36 RGB units and only if the accent keeps its gap and saturation. The refine loop derives the palette again from the whole ledger with the rejected colours as salt (a different result), names it from the table and spends no model tokens on it. Disliking a swatch excludes the tags it came from from the next place walk.

**Live check (2026-10-21, Qloo live, real LLM, one run each).** Indore cafe: Alabaster `#F3F2EF`, Mushroom `#969089`, Espresso `#382217`, Cinnabar `#E7351A` (accent), Olive Drab `#6F8B40`. London ceramics: Pale Ivory `#F1EFE7`, Soft Grey `#97A1AC`, Deep Plum `#301C2A`, Vibrant Blue `#3953CE` (accent), Sage Green `#8EA07C`. Brooklyn-style couple (New York date night): Warm Ivory `#E8DBD7`, Stormy Slate `#969DA5`, Midnight Charcoal `#171A21`, Lime Green `#98B927` (accent), Olive Taupe `#9C9079`. Before this change all three were "Bone Linen, Clay Terracotta, Deep Teal, Warm Grey".

## Load handling

Free LLM tiers meter tokens per minute **per model** (Groq: 8000 for each of gpt-oss-120b, gpt-oss-20b and qwen3.8-27b). Three pieces keep a burst of visitors inside those limits.

**Fewer tokens per brief.** Measured with `npm run prompt:size` (live Qloo, scripted LLM, prompts as Groq receives them, 3.3 characters per token), mean of the Indore, London and New York briefs:

| Call | Before | After | How |
|---|---|---|---|
| seeds | 954 | 682 | tighter instructions, schema without description texts |
| synthesis | 5290 (the compact variant, the full one was over 5500) | 3327 | `promptView.ts`: coordinates, affinities and tag ids dropped, summaries kept only where they carry the content, per-record item caps, long Qloo ids replaced by `q1`, `q2` and mapped back by code, system prompt 22% shorter, schema without descriptions, palette written by code |
| Taste Proof baseline | 331 | 331 | unchanged |
| **input tokens per brief** | **6575** | **4340** (-34%) | |

The synthesis reply is also shorter (no `qlooId` UUIDs, no palette tags or evidence); measured totals (prompt + reply) after the change were 4.9k to 5.5k tokens for the synthesis.

**Token budget** (`src/lib/llm/tokenBudget.ts`). Per model, a token bucket: the provider's own `x-ratelimit-remaining-tokens` and `x-ratelimit-limit-tokens` headers when present (refilled linearly, as Groq does), else a sliding 60 s window of the `usage.total_tokens` of finished requests. A request reserves its estimate (prompt characters / 3.3 plus the reply cap) at once, so concurrent briefs do not all pick the same model, and the reply's real usage replaces the estimate. Groq requests carry `max_completion_tokens` (3000 for the synthesis, 800 for the short calls) because Groq's up-front check counts the reply you allow: without a cap a 4k-token synthesis prompt was refused with a 429 while the bucket was nearly full (observed 2026-10-21).

**Cascade** (`src/lib/llm/cascade.ts`). For each request it skips models with a cooldown, then orders the rest: models that have room first (keeping chain order), the others last. `LLM_CHAIN_FAST` (seeds, critic, baseline) starts on `gpt-oss-20b` then `qwen3.8-27b`; `LLM_CHAIN_MAIN` (synthesis) starts on `gpt-oss-120b`, then `qwen3.8-27b`, then Gemini 2.5 Flash. Gemini has no token budget (its limits are handled by cooldowns), so a model that is out of tokens sends the request on without a failed attempt. When no model can take the request, it queues for the shortest wait (cooldown end or budget refill) if that is at most 25 s and leaves 12 s of the run's deadline; otherwise it fails or tries anyway, as before. The model that answered a request is reported to that request (`onAnswered`), so `brief.model` is right under concurrency. Model switches are logged one per line (`llm groq:qwen/qwen3.8-27b -> gemini:gemini-2.5-flash: rate_limit HTTP 429 - Limit 8000, Used ..., Requested ...`, identifiers removed).

**Queue notice.** While a request waits, the run emits `{type: "queue", waitSeconds}` (additive; older clients ignore unknown types). The UI shows "High demand: your brief is next, about N seconds." under the stage strip until the next stage, tool or brief event arrives.

**Showcase.** Six briefs (Indore cafe, London ceramics, New York date-night pop-up, Brooklyn boutique, Chicago record-store bar, Paris pop-up bakery) are generated one at a time with a 4 s gap right after the server boots (production and `QLOO_MODE=live`; `SHOWCASE_WARM_ON_BOOT=0` turns it off), cached in memory and on disk. `npm run warm` polls the deployed `/api/showcase` until all six are ready.

**Load test** (`npm run loadtest -- --url=... --n=3`). Local production build, live Qloo, real LLMs, 3 different briefs started at once (2026-10-21):

| Brief | Time to brief | Total (with Taste Proof) | Model that wrote it |
|---|---|---|---|
| 1 | 27.6 s | 27.6 s | groq gpt-oss-120b |
| 2 | 41.3 s | 43.0 s | gemini 2.5 Flash |
| 3 | 31.6 s | 38.1 s | groq qwen3.8-27b |

No errors and no failed model attempts: the three syntheses were spread over three models because the first two reserved most of their minute. The time is mostly Qloo (three briefs share a client with 4 requests in flight), not the LLM. Earlier runs, before the reply cap, showed one 429 on qwen followed by a fall-through to Gemini.

## SSE event contract

`POST /api/brief`, `POST /api/brief/refine` and `POST /api/brief/compare` respond with `text/event-stream`. Each frame is `event: <type>` then `data: <json>` (the JSON repeats `type`). The stream always ends with `done`. Types are defined in `src/lib/agent/events.ts`.

| Event | Payload | Meaning |
|---|---|---|
| `stage` | `stage`: `seeds` \| `resolve` \| `walk` \| `critic` \| `synthesis` \| `proof`; `status`: `start` \| `done`; `detail?` | Progress through the pipeline. Degradation shows in `detail`: the walk says "partial: N calls cut off", the critic "skipped, out of time". The UI shows these as quiet notes, not failures |
| `thinking` | `text` | Free-text note; reserved, the pipeline no longer emits it |
| `tool_call` | `id` (`p_N` in the pipeline), `name`, `args` | A Qloo call started; drives the live graph-walk trail |
| `tool_result` | `id`, `name`, `ok`, `summary`, `evidenceId?`, `durationMs?` | The call finished; `evidenceId` links it to the ledger; `durationMs` is the wall time including queueing (shown subtly in the trail). `ok: false` with a summary starting "Left out:" means the call was dropped to stay on time: the UI shows it as skipped, not as an error |
| `needs_input` | `question`, `options[]` of `{label, qlooId, kind}` | Ambiguous seed; the client re-sends the request with `selections` |
| `brief` | `brief`, `dropped[]`, `evidence[]`, `signals?`, `signatures?` | The validated brief, what was removed and why, the ledger records it cites, the resolved taste signals (echoed back on refine and compare) and the server's HMAC signatures over both (also echoed back; `records`, `shared`, `signals`) |
| `proof` | `proof`: `{baseline[], tasteforge[], baselineAvg, tasteforgeAvg, baselineNotFound, city?}` (picks may carry `evidence[]`, `address`, `local`)` | Taste Proof; averages are `null` when nothing could be scored |
| `queue` | `waitSeconds` | Additive. The run is waiting for model capacity (every fast model cooling down or out of its per-minute tokens). The UI shows "High demand: your brief is next, about N seconds." until the next stage, tool or brief event |
| `error` | `message`, `retryable` | User-safe failure |
| `done` | `ok` | Final frame; `ok: false` also follows `needs_input` and `error` |

Request bodies:

- `/api/brief`: `{ prompt (3-1000 chars), mode: "know_audience" | "find_audience", city?, selections? }`, max 4 KB.
- `/api/brief/refine`: `{ prompt, mode, city?, brief, evidence, signals?, signatures: { records, signals? }, feedback: { liked[], disliked[], locked[] } }`, max 200 KB. The client holds the state, so the server stays stateless. Every evidence record (and the signals) must match a signature the server issued, otherwise the request is rejected with 400.
- `/api/brief/compare`: `{ prompt, mode, city (the second city), signals?, signatures?: { signals } }`, max 6 KB. Reruns the pipeline for the new city with the first run's signals; the stream has the same events as a normal run but no `proof` (the proof stage is skipped).
- `POST /api/verify`: `{ evidence[], signatures }` returns `{ verified: boolean }`; used by `/b#...` pages to show the verified or unverified banner.
- `GET /api/showcase` returns `{ items[] }` with status `queued` | `generating` | `ready` | `failed`; the UI polls until nothing is pending. `?retry=1` clears failure back-off. The service holds six briefs and starts building them, one at a time, when the server boots (see "Load handling"); `npm run warm` waits for all of them.
- `GET /api/health`: liveness and configuration summary for the container platform. Returns 200 when the environment is valid and 503 when it is misconfigured, so a fresh Render deploy fails its health check until the keys are set.

Errors before streaming starts are JSON: 400 (invalid body, or evidence that fails its signature), 413 (body over the limit, rejected on `Content-Length` before reading and cut off at the limit while streaming), 429 with `Retry-After` (rate limit, shared by brief, refine and compare), 503 (server not configured, or the demo is busy / out of its daily LLM budget; with `Retry-After`).

## Module map

```
src/
  app/
    page.tsx, layout.tsx, globals.css
    api/brief/route.ts            SSE brief endpoint (parse spec only; scaffolding in lib/http/streamRoute.ts)
    api/brief/refine/route.ts     SSE refine endpoint (verifies evidence signatures)
    api/brief/compare/route.ts    SSE two-city comparison endpoint (verifies signal signatures)
    api/verify/route.ts           share-link evidence check
    api/showcase/route.ts         cached example briefs (signed), rate-limited retry
    api/health/route.ts           liveness and configuration check (503 when misconfigured)
    b/page.tsx                    read-only shared brief with the verified / unverified banner
  lib/
    qloo/                         typed client for the Qloo API
      query.ts                    pure request builders, asserted param names
      client.ts                   fetch, timeout, error mapping, LRU cache, mock switch
      normalize.ts, types.ts, errors.ts, config.ts, cache.ts
      mock.ts, fixtures/          synthetic data only
    llm/                          provider adapters
      gemini.ts, groq.ts          JSON mode with schema; minimal Gemini thinking; Groq reasoning_effort low
      retry.ts, cache.ts          backoff, prompt-hash response cache
      config.ts, cascade.ts       LLM_CHAIN_FAST / LLM_CHAIN_MAIN parsing; ordered fallback with shared cooldowns
      index.ts                    routes each request to the fast or main cascade (route, else tier)
      tokenBudget.ts              per-model tokens-per-minute bucket (usage fields, x-ratelimit headers, reservations)
      scripted.ts, mock.ts        offline providers for E2E and tests
    agent/
      pipeline/                   seeds, resolve, walk, critic, synthesis, promptView (lean evidence view, id aliases), confidence, context
      ledger.ts                   evidence records
      validator.ts                citation check, grounding score
      brief.ts                    zod schema for the brief
      proof.ts, generate.ts       Taste Proof and the pipeline-plus-proof entry point
      colour/                     palette derivation: cues.ts (tags to weighted cues), families.ts (curated tag to colour mapping),
                                  derive.ts (weights, picks, contrast rules, stable hash), apply.ts (model names + nudges), names.ts, math.ts
      palette.ts                  pure palette quality check (named colours, clear accent), used by the tests
      benchmark.ts, benchmarkReport.ts   pure helpers and the report renderer for docs/BENCHMARK.md
      refine/                     plan, synthesis, merge, request schema
      events.ts, request.ts       SSE event types and request parsing
      compare/                    second-city run and its request schema
      fence.ts                    `<<< >>>` fencing of user text in prompts
      tools.ts                    Qloo call definitions and executor used by the graph walk
    geo/                          Nominatim reverse geocoder (live mode only; coordinates clamped)
    http/
      streamRoute.ts              shared route scaffolding: rate limit, body, parse, verify, deps, budget, SSE
      request.ts                  client address, byte-limited JSON body
      guards.ts, budget.ts        shared limiters; concurrency cap and daily LLM budget
      deps.ts                     process-wide LLM and Qloo clients (caches shared across requests)
      verifyRoute.ts, sse.ts      /api/verify handler; stream plumbing
      showcaseService.ts          the showcase service singleton and the boot warm-up
    security/
      ledgerSig.ts                HMAC signing and verification (LEDGER_SECRET)
      verifyRequest.ts            signature checks for refine and compare bodies
    singleton.ts, log.ts          globalThis singletons; server-side warnings
    rateLimit.ts                  in-memory sliding window
    showcase.ts                   pre-generated briefs, spacing and back-off
  components/                     BriefView, WhyChip, EvidenceDrawer, TasteProofPanel,
                                  ItemFeedback, RefineBar, HotspotMap, WalkView, Stages,
                                  ShowcaseGallery, Compose, TasteForgeApp
  ui/                             UI contract types, SSE client, run state, hotspots
scripts/smoke.mts                 real LLM + mock Qloo end to end
scripts/prompt-size.mts           tokens per call type with live Qloo and a scripted LLM (npm run prompt:size)
scripts/loadtest.mts              N concurrent briefs against a running server (npm run loadtest)
scripts/warm.mts                  waits until the deployed showcase is fully built (npm run warm)
scripts/benchmark.mts             fabrication benchmark (npm run benchmark), writes docs/BENCHMARK.md
scripts/llm-bench.mts             replays captured requests against models (npm run bench:llm)
e2e/                              Playwright flows: brief, refine, share, compare
```

## Design decisions

| Decision | Reason |
|---|---|
| Hybrid pipeline instead of a free tool-calling loop | The first version let the model choose every call: 10 to 15 LLM calls per brief, slow, and it exhausted free-tier rate limits. The walk is predictable, so code runs it in parallel and the LLM is used for seeds, the critic and writing (3 to 5 calls). The old loop (`run.ts`, its prompts and the LLM `chat()` tool-calling path) has been deleted; `tools.ts` keeps only the Qloo call definitions the walk uses. |
| Evidence ledger plus validator | "Grounded" has to be checkable. Citations are ids that either exist in the ledger or do not, so the score is computed by code, not claimed by the model. |
| Dropped items lower the score | Hiding failures would make the score meaningless. |
| Critic limited to a fixed menu of strategies | The model can improve thin coverage but cannot invent queries; off-menu or repeated follow-ups are discarded. Capped at 2 rounds. |
| Ask when a name is ambiguous | A wrong guess at the seed poisons every downstream call. A one-click question is cheaper. Showcases and smoke runs auto-pick instead. |
| Taste Proof uses `filter.results.entities` | Qloo scores a supplied shortlist, so both lists are judged by the same function on the same signals. Unfound picks are reported, not scored as zero. |
| Fast and main LLM chains, spread over the Groq models | Each call type has its own ordered chain: `LLM_CHAIN_FAST` for the short calls (seeds, critic, Taste Proof baseline), `LLM_CHAIN_MAIN` for the brief synthesis. Groq answers the short calls in 0.4 to 1 s and the synthesis in 5 to 6 s, where Gemini's free tier needs 9 to 21 s and 13 to 16 s, so Groq leads both chains and Gemini is the deeper fallback. Because every Groq model has its own minute budget, the short calls start on the small models (gpt-oss-20b, qwen3.8-27b) and gpt-oss-120b is kept for the synthesis, with a token budget steering around a model that is nearly spent (see "Load handling"). The baseline is a plain LLM either way: speed does not change its role as the opponent, but a smaller model writes it. |
| Palette derived in code, named by the model | A palette every brief shares ("Bone Linen, Clay Terracotta, Deep Teal, Warm Grey") is a model default, not evidence. Code maps the brief's own decor, ambience, genre and cuisine tags to colour families with a documented table, weights them, and picks values with a stable hash, so the colours differ with the evidence, repeat for the same evidence, and each carries its tags and evidence ids. The model keeps the part it is good at (names), and a refine run needs no model call for colours. |
| Token budget and reply caps | Per-model minute budgets are the real capacity limit of a free-tier demo. Tracking them (headers and usage) lets the cascade choose a model that has room instead of paying a failed 429 per brief, and lets the UI say "high demand" when nothing has room. |
| Model cascades (`LLM_CHAIN_FAST` / `LLM_CHAIN_MAIN`), JSON response cache | Keeps the demo alive on free tiers. Models are tried in order and the two chains share their cooldowns; one that returns 429, quota exhausted or 503 cools down (until 00:00 UTC for daily quotas, else the retry-after) and is skipped, so a failed request is not paid per brief. The answering model is recorded in `brief.model`. The LLM and Qloo clients (and their caches) are created once per process, so repeat requests actually hit the caches. The Qloo client keeps at most 4 requests in flight with a 250 ms gap between starts (the hackathon key answers 429 for bursts), and retries with jitter on 429 (twice), 5xx and timeouts (once). |
| Stateless server; client echoes brief, evidence and signals on refine | No database, nothing to leak, nothing to clean up. Bodies are schema-validated and size-capped. |
| HMAC-signed evidence ledger (`LEDGER_SECRET`) | The browser holds the evidence between calls, so without a signature it could forge "Qloo data" for refine, compare or a shared link. Each record and the signal set are signed per record; a second signature covers the slimmed form share links carry. Shared pages verify through `/api/verify` and say so. The signature covers the evidence, not the prose of the brief. |
| One shared limiter, run cap and daily LLM budget | Separate per-route limiters tripled a visitor's allowance. One allowance, a cap on concurrent runs and a daily call budget keep a public demo inside free-tier quotas, and the failure is a friendly, retryable "busy" message. |
| User text fenced in prompts, Qloo ids validated | Prompt-injection hygiene: fenced fields plus an instruction to treat them as data; ids from the browser must match Qloo's id formats before they reach a query string. |
| Refine re-walks only touched sections | Faster and keeps liked and locked items verbatim. Dislikes become `filter.exclude.*`; likes are added as signals. The heatmap has no exclude parameter, so disliked cells are filtered after the call. |
| Showcase briefs pre-generated at boot, one at a time with spacing | Judges get an instant first result even when the LLM tier is throttled. Six briefs in six cities are built right after a production boot on live data, cached in memory and in a git-ignored directory only (a Render free instance loses its disk when it sleeps, so `npm run warm` before judging). |
| Mock Qloo and scripted LLM | The whole app, tests and E2E run offline. The switch to live data is one env var. |
| Pure query builders with exact-parameter tests | Qloo ignores unknown parameters silently, so a typo produces plausible but wrong results. Tests assert the query strings. |
| Pipeline deadline (90 s) shared by every LLM call, a 28 s walk soft deadline inside it | Keeps the SSE request inside the 120 s function limit (the proof gets 25 s more) and ends in a friendly retryable error instead of a hang. The soft deadline trades completeness for time: a slow Qloo tail yields a partial, lower-confidence brief rather than a late one. |
| Immutable data, small modules | Records and briefs are never mutated in place; most files are well under 400 lines. |

## Speed pass (2026-10-20)

Where the time went: Qloo calls are 1 to 10 s each with a tail past 30 s, and on Gemini's free tier the LLM calls took 9 to 21 s for the seeds and about 37 s for the synthesis, with 503s forcing fallbacks. Four changes:

1. **One round of the critic, about 10 s** (it used to run up to two), skipped when the walk was partial.
2. **A 28 s soft deadline on the walk.** Slow Qloo calls are reported as "Left out:" and the brief is written from what arrived (see the stage table). Partial briefs show lower section confidence.
3. **Hedged Qloo requests** (a duplicate after 8 s, 15 s timeout), plus `durationMs` on every `tool_result` so slow calls are visible.
4. **Per-call-type LLM chains**, chosen by measurement (below), and minimal Gemini thinking for both tiers.

### LLM measurements

Replayed the real requests of live-Qloo runs (Indore cafe, London ceramic artist) against each model, 2 to 4 runs each. Gemini thinking was at its minimum (`thinkingLevel: minimal` on 3.x, budget 0 on 2.5); Groq `reasoning_effort` low (`none` for Qwen).

| Call | Model | Latency | Valid JSON | Notes |
|---|---|---|---|---|
| seeds | Groq gpt-oss-120b | 0.6 to 1.0 s | 4 of 4 | only model that added the brand seeds that `find_audience` asks for |
| seeds | Groq gpt-oss-20b | 0.4 to 0.7 s | 4 of 4 | no brand seeds |
| seeds | Groq qwen3.8-27b | 0.3 to 0.7 s | 4 of 4 | no brand seeds |
| seeds | Gemini 3.5 Flash-Lite | 20.5 s | 1 of 3 | two HTTP 503 |
| synthesis | Groq gpt-oss-120b | 4.7 to 6.3 s | 4 of 4 | grounding 100%, 3 to 5 artists, 2 to 4 places |
| synthesis | Groq gpt-oss-20b | 1.8 to 2.1 s | 1 of 2 | one reply had the wrong shape |
| synthesis | Groq qwen3.8-27b | 4.4 to 4.6 s | 2 of 2 | thinner lists (2 to 3 artists, 0 to 3 places) |
| synthesis | Gemini 2.5 Flash | 12.9 to 15.7 s | 2 of 2 | richest lists |
| synthesis | Gemini 3.5 Flash | 13.7 s | 1 of 2 | one HTTP 503 |
| synthesis | Gemini 3.5 Flash-Lite | none | 0 of 5 | HTTP 503 or a 60 s timeout every time |

Routing that followed at the time: `LLM_CHAIN_FAST` started with gpt-oss-120b. It was changed on 2026-10-21 to start with gpt-oss-20b and qwen3.8-27b so that gpt-oss-120b keeps its minute budget for the synthesis (see "Load handling"). The 2026-10-20 routing was: `LLM_CHAIN_FAST` (seeds, critic, Taste Proof baseline) starts with gpt-oss-120b, then qwen3.8-27b and gpt-oss-20b, with Gemini 2.5 Flash and 3.5 Flash-Lite behind. `LLM_CHAIN_MAIN` (synthesis) starts with gpt-oss-120b, then Gemini 2.5 Flash (full quality), qwen, the other Gemini models, and gpt-oss-20b last. Groq's free tier allows 8000 tokens a minute per model and one brief needs about 11,000 across its calls, so a second brief within the same minute gets a 429 on gpt-oss-120b and falls through the chain; the chains share cooldowns so the failed model is skipped meanwhile. The compact synthesis prompt (fewer items, no notes, no schema descriptions) keeps one synthesis request under the cap.

### End to end, live Qloo and real LLM

| | Brief on screen | Whole run incl. Taste Proof | LLM calls |
|---|---|---|---|
| Before (Gemini-first chain, same code, Indore cafe) | 47.4 s (seeds 15.7 s, synthesis 22 s, two 503 fallbacks) | 49.4 s | 5 |
| After (5 runs: Indore, London twice, Brooklyn, Chicago) | median 16.1 s, 14.0 to 45.3 s | median 38.4 s, 15.0 to 61.1 s | 3 to 6 |

The slow "after" runs are Qloo walk tails (27 to 30 s to the soft deadline) and, for the proof, one Qloo place-scoring request that timed out at 15 s. The LLM share of a run is now about 7 s.
