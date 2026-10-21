# TasteForge: Devpost submission text

Live demo: https://tasteforge-fa98.onrender.com | Repo (MIT): https://github.com/Kunsh162007/tasteforge

**Tagline:** A cultural briefing agent that builds a brief for your audience, with every recommendation traced to a Qloo signal and scored against a plain LLM by Qloo itself.

## Inspiration

A cafe owner in Indore, a ceramic artist in London and a couple planning a pop-up all make the same kind of decision: what should this place look like, sound like, and be near, for the people it is for? Large brands pay for audience research. Small businesses and creators guess, or ask a chatbot.

A chatbot's answer sounds right and cannot be checked. Some of the named venues or brands may not exist, and none of the picks come from data about the audience. The Qloo brief says that if a submission would work the same without Qloo, it is the wrong thing to build. We took that as a design constraint: the agent should be unable to recommend anything Qloo did not return.

## What it does

You describe a project, and optionally a city. TasteForge returns a brief:

- **The audience:** films, shows and other taste signals they over-index on, plus age and gender skew.
- **The look:** a 4 to 5 colour palette with real colour names ("Clay terracotta"), neutrals plus a clear accent, each captioned with the Qloo decor or ambience tags it came from; lighting and materials from the same tags, plus reference places.
- **The sound:** artists, with trending direction.
- **Pairings:** brands, and menu or merch ideas inferred from cuisine tags.
- **Where they are:** neighbourhood hotspots for the audience in your city, on a map.
- **How to talk to them:** tone and phrases.

Two modes: "I know my audience" (you name artists, brands, tastes) and "Find my audience" (you describe what you make and the agent works out whose taste fits it).

What you can check:

- **Why-chips.** Each item opens the Qloo call behind it: endpoint, parameters, returned entities and affinity scores.
- **Citation coverage.** The share of submitted items that cite a real Qloo record, computed by code. Items without valid citations are removed and listed.
- **Taste Proof.** Every pick verified and traceable: Qloo checks a plain LLM's picks and TasteForge's for the same audience. It catches picks Qloo cannot find, confirms TasteForge's places are real and located in the requested city, and scores fit as a secondary metric (about equal: see the benchmark below)
- **Refine.** Like, dislike or lock items; only the affected sections are re-queried, with dislikes sent to Qloo as exclusions and likes added as signals.
- **Two-city comparison** (same audience, second city, no Taste Proof) and **shareable `/b#...` links.** Shared links carry an HMAC signature from the server, so a link that was edited shows as unverified instead of passing for Qloo data.

## Evidence it works

**Verification benchmark** (20 prompts, 5 cities, live Qloo, 2026-10-21; method, classification and caveats in docs/BENCHMARK.md, reproduce with `npm run benchmark`): Qloo could not verify **30% of a plain LLM's 276 picks** in the requested city (26% of its places, 30 of 114). We checked every name across all Qloo entity types with accent, "The" and suffix-tolerant matching, and hand-classified the 84 misses: 10 likely invented (no evidence they exist), 54 real but missing from Qloo or listed under another type (authors and photographers named as artists, chains listed as places), 15 with a same-named place only in another city, 5 unclassified. An earlier, stricter matcher had reported 56% of places and 29% of picks as "not found"; most of that was the matcher and Qloo's coverage, not the model. TasteForge: 0% of 312, because it can only return what Qloo returned. Affinity is only a sanity check, since Qloo normalizes it within each query. Honest limits: "couldn't be verified" is not "fake", the invented/real split is a judgement from general knowledge, one baseline model (Groq gpt-oss-120b class) and one day. Repeat runs were unstable at first (17% pick overlap); after deterministic settings and seed caching TasteForge repeats about 80% of its picks (3 prompts x 2 runs, indicative).

**Why this matters (sources)**

1. LLMs fabricate venues, most in neighbourhoods with weak digital footprints, and fabrication disappears when the model is given verified venue lists (Chen, Weng & Moro, 2026, https://arxiv.org/abs/2607.06260). That is TasteForge's design.
2. More than 1 million US restaurant locations, over 70% single-unit (National Restaurant Association, 2025, https://go.restaurant.org/rs/078-ZLA-461/images/SOI-2025-PocketGuide.pdf); 26% of independents fail in year one (Parsa et al., 2005; a later BLS-based study puts it at 17%, https://news.osu.edu/restaurant-failure-rate-much-lower-than-commonly-assumed-study-finds/).
3. A meta-analysis of 66 studies (N=15,621): music, scent and colour shape customer behaviour, more strongly in service venues such as cafes (Roschk et al., 2017, https://eprints.gla.ac.uk/214127/).
4. What small businesses pay today: one Mintel market report is $4,995 (https://reports.mintel.com/display/1157789/), hospitality brand agencies list $10k+ minimums (Clutch), design runs $5 to 15 per sq ft (https://www.homeadvisor.com/cost/home-design-and-decor/hire-an-interior-decorator-or-designer/). A TasteForge brief costs cents at paid rates (estimate).
5. Free tool-calling agents succeed on all 8 of 8 repeated tries less than 25% of the time (tau-bench, https://arxiv.org/abs/2406.12045); the hybrid design uses about 70% fewer LLM calls.

## How we built it

A Next.js (App Router) and TypeScript app with a hybrid agent pipeline, streamed to the browser over Server-Sent Events so the user watches the graph walk happen.

1. **Seeds** (fast LLM, JSON): extract the named artists, brands and places the user mentioned, plus 2 to 6 concept phrases and the city. It is told never to invent entities.
2. **Resolve** (Qloo): `/search` and `/v2/tags` in parallel. If a name could mean two things, the agent asks instead of guessing.
3. **Graph walk** (Qloo, parallel by section): audience, sound, pairings, aesthetic, location. Slow Qloo calls are hedged, and after 28 s the walk stops waiting: the brief is written from what arrived and says so.
4. **Critic** (fast LLM): looks at coverage per section and may request follow-up queries from a fixed menu (drop the city, tags only, entities only, more results), one round of about 10 s.
5. **Synthesis** (main LLM, JSON schema): writes the brief from the evidence ledger only, including a named, contrasting palette.
6. **Validator** (plain code): removes uncited items and computes the citation coverage; menu ideas may only use words from Qloo's tags.
7. **Taste Proof**: baseline versus TasteForge, scored by Qloo.

This takes 3 to 5 LLM calls per brief. Our first version let the model pick every tool call and needed 10 to 15, which was slow and hit free-tier rate limits. Moving the predictable work into code fixed both.

The stack is tested: unit tests for the Qloo query builders (asserting exact parameter names), ledger, validator, pipeline, refine and Taste Proof; component tests for the evidence drawer, feedback and proof panel; a Playwright test for the full flow. Two model cascades (a fast chain for the short calls and a main chain for the brief; Groq first, Gemini behind it, each model cooling down on quota errors) and a prompt-hash cache keep the demo alive on free tiers. We chose the order by measuring: Groq answers the short calls in under a second and the brief in about 5 s, where Gemini's free tier took 9 to 21 s and 13 to 16 s. A brief now reaches the screen in about 16 s at the median (live Qloo, real LLM), down from about 47 s.

## How Qloo powers it

Qloo is the only source of recommendations. Concretely:

- `/search` resolves every name to a Qloo entity id.
- `/v2/tags` maps concept phrases to tag ids, which become taste signals. This is what makes "Find my audience" work from a description alone.
- `/v2/insights` with `signal.interests.entities` and `signal.interests.tags` returns the audience's movies, TV shows, artists and brands.
- `/v2/insights` for `place` with `filter.location.query` returns places the audience likes in the chosen city. We then run `urn:tag` analysis on the top five, filtered to `urn:tag:decor:qloo` and `urn:tag:ambience:qloo`, and the LLM maps those tags to colours, lighting and materials. The look of the brief comes from tags Qloo attached to real places.
- `urn:tag:genre:place:restaurant` tags on those places become menu ideas.
- `urn:demographics` gives age and gender skew.
- `urn:heatmap` gives the geohash cells where the audience concentrates; we name them by reverse-geocoding (OpenStreetMap Nominatim) and plot them on a map.
- `/v2/trending` shows whether the top artists are rising.
- `filter.results.entities` lets Qloo rank a shortlist we supply. We use it for Taste Proof, so Qloo, not us, decides which list fits the audience better.
- `filter.exclude.entities` and `filter.exclude.tags` power the refine loop.

If the Qloo calls were removed there would be nothing to write the brief from: the synthesis step receives only ledger records, and a brief with no valid citations scores 0%.

## Challenges

- **Keeping the LLM honest.** Telling a model not to invent things is not enough. The fix was structural: items carry evidence ids, a pure validator checks them against the ledger, and dropped items count against the score.
- **Free-tier limits.** The tool-calling loop used too many calls. The hybrid pipeline, light and main model tiers, caching, backoff, provider fallback and pre-generated showcase briefs got the demo reliable.
- **Ambiguous names.** A name can match entities of different types (a band and a brand, say). The resolver detects mixed-type matches and asks, because one wrong seed contaminates everything downstream.
- **Silent parameter errors.** Qloo ignores unknown query parameters, so a typo returns plausible, wrong data. Every request builder has tests that assert the exact query string.
- **Thin coverage.** Some cities and signals return little. The critic retries with looser queries and each section shows a confidence level instead of padding the brief.
- **A fair comparison.** The baseline needed to be a real attempt (main-tier model, same prompt, same city), and picks Qloo cannot find are reported as "not found" rather than averaged in as zero.

## Accomplishments

- A recommendation cannot reach the screen without a citation to a real Qloo result, and the user can open that result.
- Taste Proof replaces "trust me" with checks produced by Qloo: every TasteForge pick is verified and traceable, and the plain answer's picks that Qloo cannot verify in the city are shown with the reason (30% of its picks, 26% of its places in the 20-prompt benchmark; 10 of the 84 misses look invented, most of the rest are real names Qloo lists elsewhere or under another type). We do not claim a fit gap.
- The refine loop re-queries only what changed, uses Qloo's own exclude filters, and keeps locked items verbatim.
- The full app, test suite and end-to-end test run offline with a mock Qloo and a scripted LLM, so every claim is reproducible without keys.
- Accessible by default: keyboard-operable evidence drawer with focus handling, labelled meters, toggle buttons with pressed state, a print stylesheet.

## What we learned

- Grounding works best as a data structure (ids and a validator), not as a prompt instruction.
- Qloo adds the most where an LLM has nothing reliable to say: audience-specific, place-specific facts such as which neighbourhoods over-index for a taste, and which decor tags the places they love share.
- Letting code run the predictable parts of an agent and keeping the model for judgement made it faster, cheaper and easier to test.
- Putting the evidence one click away makes the output easier to trust and to argue with, which is the point of a brief.

## What's next

- Widen the fabrication benchmark (more prompts, more cities, confidence intervals) and publish Taste Proof results per audience type.
- Item-level pairings once product-level taste data is available; today Qloo has brands and categories, not SKUs.
- Export a brief as a design-ready kit (palette file, playlist seed list, venue shortlist).
- Persisted briefs and teams, with an opt-in store, so a brief can be revisited and compared over time.
- A confidence interval on Taste Proof using more picks per kind.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS, Zod, Leaflet with OpenStreetMap, Server-Sent Events, Vitest, Testing Library, Playwright, Qloo Taste AI API (`/search`, `/v2/tags`, `/v2/insights`, `/v2/trending`), free-tier model cascades (Groq gpt-oss-120b, Qwen and gpt-oss-20b first, Google Gemini 2.5 Flash, 3.5 Flash and 3.5 Flash-Lite behind them), Docker and Render.
