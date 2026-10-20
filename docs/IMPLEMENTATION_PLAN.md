# TasteForge — Implementation Plan

Cultural briefing agent for creators and small businesses, grounded in Qloo's taste graph.
Deadline: **Oct 30, 2026, 11:45 pm ET** (Devpost). Today: Oct 18.

## 1. Goals and non-goals

**Goals**
- A hosted, working agent that turns a project/audience description into a cultural brief.
- Every recommendation in the brief is backed by a Qloo signal and shows its evidence.
- Visible difference vs. a plain LLM answer (comparison toggle + grounding score).

**Non-goals**
- User accounts, payments, persistence beyond a shareable brief link.
- Product/SKU recommendations (Qloo has no item-level data).
- Storing Qloo responses in the public repo (Qloo terms: private server-side cache only).

## 2. Architecture

```
Browser (Next.js App Router, React)
   │  POST /api/brief  (SSE stream: progress events + final brief)
   ▼
Agent route (Node runtime)
   ├─ LLM adapter (free tiers): Gemini 2.5 Flash primary, Groq gpt-oss-120b fallback,
   │     both with function calling
   │     tools: qloo_search, qloo_find_tags, qloo_insights,
   │            qloo_entity_tags, qloo_demographics, qloo_heatmap,
   │            qloo_trending, submit_brief
   ├─ Qloo client  ──► https://hackathon.api.qloo.com  (X-Api-Key)
   │     └─ mock mode (QLOO_MODE=mock) returns synthetic fixtures
   ├─ Evidence ledger: every Qloo result gets an evidence id (ev_1, ev_2…)
   └─ Brief validator: drops items whose evidence ids are missing/invalid,
                       computes grounding score
```

- **Single Next.js app**, TypeScript, deployed on Vercel (fallback: Render/Railway container if
  function time limits bite). We call Qloo's REST API directly, so the kit's VM-only MCP server
  is not needed.
- **Streaming:** the agent route streams Server-Sent Events so the UI shows the live
  "graph walk" trail (each Qloo call and what it found).
- **Cache:** in-memory LRU + optional on-disk cache keyed by request URL, git-ignored.

### Key design rule: the LLM translates, Qloo decides
The agent may only put an item in the brief if it cites one or more evidence ids from the
ledger. `submit_brief` enforces a schema where each item has `evidence: string[]`.
The validator rejects or strips ungrounded items. Grounding score =
grounded items ÷ total items.

## 3. Brief schema (output contract)

```ts
type Brief = {
  title: string
  mode: 'know_audience' | 'find_audience'
  audienceProfile: { summary: string; affinities: Item[]; demographics?: Item[] }
  aesthetic: { palette: Swatch[]; lighting: Item[]; materials: Item[]; referencePlaces: Item[] }
  sound: { direction: string; artists: Item[] }
  pairings: Item[]          // menu ideas, merch, brand collabs
  whereTheyAre?: { city: string; hotspots: Item[] }   // from heatmap
  messaging: { tone: string; phrases: string[]; evidence: string[] }
  groundingScore: number    // 0..1, computed server-side
}
type Item  = { label: string; detail?: string; evidence: string[]; qlooId?: string }
type Swatch = Item & { hex: string }
type Evidence = { id: string; endpoint: string; params: Record<string,string>;
                  summary: string; entities?: {id:string;name:string;affinity?:number}[];
                  tags?: {id:string;name:string;score?:number}[] }
```

## 4. Graph walk per brief section

| Section | Qloo calls |
|---|---|
| Seed resolution | `/search` (entities), `/v2/tags` (tags); confirm ambiguous matches |
| Audience profile | `/v2/insights` filter.type = artist, movie, tv_show, brand with seeds; `urn:demographics`; `urn:tag` |
| Aesthetic | `/v2/insights` filter.type=place + `filter.location.query`=city → `urn:tag` / entity tags on top places → keep `urn:tag:decor:qloo`, `urn:tag:ambience:qloo` → LLM maps tags to palette/lighting/materials |
| Sound | `/v2/insights` filter.type=artist; `/v2/trending` on top artists |
| Pairings | `/v2/insights` filter.type=brand; cuisine tags from top places |
| Where they are | `urn:heatmap` + `filter.location.query`=city |
| Find-my-audience mode | Description → tags via `/v2/tags` → insights from tags → same pipeline |

All insights calls use `feature.explainability=true` where supported, `take` ≤ 20.
Exact parameter names are verified against the saved docs before coding each call
(invalid params are silently ignored by Qloo, so tests assert the built query strings).

## 5. Phases

| Phase | When | Deliverable |
|---|---|---|
| **P0 Setup** | Oct 18 | Next.js + TS + Tailwind scaffold, Vitest, ESLint, MIT LICENSE, README, `.env.example`, git init |
| **P1 Qloo client** | Oct 18–19 | Typed client for 7 endpoints, query builder, error mapping (401/403/empty), cache, mock mode with synthetic fixtures, unit tests |
| **P2 Agent core** | Oct 19–21 | LLM adapter (Gemini + Groq), tool definitions, agent loop, evidence ledger, `submit_brief` schema + validator, grounding score, SSE route, tests with mocked LLM + mock Qloo |
| **P3 UI** | Oct 21–23 | Input page (both modes, example prompts), live graph-walk trail, brief view: swatches, why-chips with evidence drawer, artists list, reference places, map (Leaflet + OSM) |
| **P4 Live data check** | as soon as key arrives | Run the 3 risk checks (seeds → places, decor/ambience tags present, city coverage); tune prompts/params; choose demo cities |
| **P5 Refine loop** | Oct 24–25 | 👍/👎/🔒 per item → re-query with exclusions/weights, regenerate only affected sections |
| **P6 Wow features** | Oct 26–27 | Plain-LLM comparison toggle, grounding score badge, two-city comparison, shareable brief link |
| **P7 Ship** | Oct 28–29 | Deploy, E2E tests (Playwright) on critical flow, README with setup, Devpost text, licence visible in repo About |
| Buffer | Oct 30 | Fixes only. Submit before 11:45 pm ET. |

## 6. Risks and fallbacks

| Risk | Check | Fallback |
|---|---|---|
| Seeds → places weak in demo city | P4 | Use tag-driven aesthetic (audience tags → place tags) and well-covered demo cities |
| Places lack decor/ambience tags | P4 | Use other place tags (genre, cuisine, ambience variants) + label lower confidence |
| Indian city coverage thin | P4 | Demo Brooklyn/London; keep Indore if it works |
| Vercel time limits | P2 | Stream early; move to Render container |
| Key arrives late | — | Everything built against mock mode; switch with one env var |

## 7. Environment variables

```
QLOO_API_KEY=            # hackathon key
QLOO_BASE_URL=https://hackathon.api.qloo.com
QLOO_MODE=mock           # mock | live
LLM_PROVIDER=gemini      # gemini | groq
GEMINI_API_KEY=          # free key from Google AI Studio
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=            # optional free fallback (console.groq.com)
GROQ_MODEL=openai/gpt-oss-120b   # llama-3.3-70b-versatile is retired on Groq
```

Free-tier notes: requests are rate-limited, so cache Qloo + LLM results per brief and
retry with backoff / fall back to Groq on 429. Google's free tier may use prompts to improve
its products, so never send personal data (we only send project descriptions and Qloo results).

## 8. v2 upgrades (decided Oct 18 after P2)

### 8.1 Hybrid agent: planner → parallel graph walk → critic → synthesis
The P2 loop lets the LLM pick every tool call (10–15 LLM calls per brief), which blows
free-tier rate limits and is slow. v2 keeps the agent but moves the predictable work to code:

1. **Seed extraction** (1 LLM call, JSON mode): prompt → `{seeds:[{name, kind}], tags:[], city?, audienceHints}`.
2. **Resolution** (code): `/search` + `/v2/tags` in parallel. Ambiguous matches (close
   scores / different types) are surfaced as `needs_input` options instead of guessed.
3. **Graph walk** (code, parallel per section, plan §4): audience, aesthetic (places → tags),
   sound (+ trending), pairings (brands + cuisine tags), heatmap, demographics. Every result
   goes to the ledger.
4. **Critic** (1 LLM call, JSON mode, agentic step): sees per-section coverage stats and
   decides follow-up queries from an allowed list (widen radius, drop city, switch to tag
   signals, different entity type). Code executes them. Max 2 rounds.
5. **Synthesis** (1 LLM call, JSON mode with schema, not function calling): writes the brief
   using only ledger evidence ids. Validator unchanged.

Result: 3–5 LLM calls per brief instead of 10–15. The old tool loop stays for the refine
step (P5), where open-ended decisions matter. LLM responses cached by prompt hash.
Default synthesis model Gemini 2.5 Flash; extraction/critic may use `GEMINI_LIGHT_MODEL`
(gemini-3.5-flash-lite) for higher free-tier limits. Groq fallback unchanged.

### 8.2 Taste Proof (the headline feature)
Answers the judges' question "does this beat a plain LLM?" with Qloo's own numbers:
1. Ask the LLM, with no Qloo data, for the same brief's artists, places and brands (baseline).
2. Resolve baseline picks to Qloo entities and score them against the same audience
   signals using insights with `filter.results.entities` (Qloo ranks a supplied shortlist).
3. Score TasteForge's picks the same way.
4. Show: average affinity, how many baseline picks Qloo couldn't even find, and per-item
   scores. Example: "ChatGPT's picks: avg affinity 0.34 · TasteForge: 0.81".
Honest framing in UI: the score measures fit with the audience's Qloo taste signals.

### 8.3 Demo reliability
- **Showcase briefs**: 3–4 example prompts pre-run on the server at deploy/first request and
  cached server-side (not committed; Qloo data stays out of the repo), so judges see instant
  results even when free tiers are throttled.
- Friendly "busy, retrying" states; never a blank error.

### 8.4 Event/brief contract additions (shared by backend and UI)
```ts
type StageEvent = { type: 'stage'; stage: 'seeds'|'resolve'|'walk'|'critic'|'synthesis'|'proof';
                    status: 'start'|'done'; detail?: string }
type NeedsInputEvent = { type: 'needs_input'; question: string;
                         options: { label: string; qlooId: string; kind: string }[] }
type ProofEvent = { type: 'proof'; proof: TasteProof }
type ScoredPick = { name: string; kind: 'artist'|'place'|'brand'; qlooId?: string;
                    affinity: number | null }   // null = not found in Qloo
type TasteProof = { baseline: ScoredPick[]; tasteforge: ScoredPick[];
                    baselineAvg: number; tasteforgeAvg: number; baselineNotFound: number }
```
Existing events (`thinking`, `tool_call`, `tool_result`, `brief`, `error`, `done`) are kept, with these contract details:
- `brief` carries `evidence: Evidence[]` (the ledger records, plan §3 shape) for the why-chip drawer.
- `error` is `{ type: 'error'; message: string; retryable: boolean }`.
- `done` is `{ type: 'done'; ok: boolean }` (`ok: false` also after `needs_input`).
- `POST /api/brief` accepts optional `selections: {label, qlooId, kind}[]` (or plain ids): the answers to a `needs_input` round; those seeds are not re-resolved by guessing.
- `GET /api/showcase` returns `{ items: { id, title, prompt, mode, city?, status: 'ready'|'generating'|'pending'|'failed', error?, brief?, dropped?, evidence?, proof?, trail? }[] }`, ready items first. Missing items are generated lazily in the background on the first request; poll while any item is not ready.
- Walk tool events use ids `p_N`; evidence ids (`ev_N`) are assigned in completion order.
`Brief` gains `sectionConfidence?: Record<'audience'|'aesthetic'|'sound'|'pairings'|'where', 'high'|'medium'|'low'>`.

## 9. Quality bar

- TDD for `lib/` (Qloo client, query builder, ledger, validator): tests first, 80%+ coverage.
- No secrets in code; keys only via env; validate presence at startup.
- No Qloo response data committed (cache dir git-ignored; fixtures are synthetic).
- Files < 400 lines, functions < 50 lines, immutable data handling.
