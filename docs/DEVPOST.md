# TasteForge: Devpost submission text

Live demo: [LIVE_URL] | Repo (MIT): [REPO_URL] | Video: [VIDEO_URL]

**Tagline:** A cultural briefing agent that builds a brief for your audience, with every recommendation traced to a Qloo signal and scored against a plain LLM by Qloo itself.

## Inspiration

A cafe owner in Indore, a ceramic artist in London and a couple planning a pop-up all make the same kind of decision: what should this place look like, sound like, and be near, for the people it is for? Large brands pay for audience research. Small businesses and creators guess, or ask a chatbot.

A chatbot's answer sounds right and cannot be checked. Some of the named venues or brands may not exist, and none of the picks come from data about the audience. The Qloo brief says that if a submission would work the same without Qloo, it is the wrong thing to build. We took that as a design constraint: the agent should be unable to recommend anything Qloo did not return.

## What it does

You describe a project, and optionally a city. TasteForge returns a brief:

- **The audience:** films, shows and other taste signals they over-index on, plus age and gender skew.
- **The look:** a palette with hex swatches, lighting and materials, derived from the decor and ambience tags of places this audience likes, plus reference places.
- **The sound:** artists, with trending direction.
- **Pairings:** brands, and menu or merch ideas inferred from cuisine tags.
- **Where they are:** neighbourhood hotspots for the audience in your city, on a map.
- **How to talk to them:** tone and phrases.

Two modes: "I know my audience" (you name artists, brands, tastes) and "Find my audience" (you describe what you make and the agent works out whose taste fits it).

What you can check:

- **Why-chips.** Each item opens the Qloo call behind it: endpoint, parameters, returned entities and affinity scores.
- **Grounding score.** The share of submitted items that cite real evidence, computed by code. Items without valid citations are removed and listed.
- **Taste Proof.** Every pick verified and traceable: Qloo checks a plain LLM's picks and TasteForge's for the same audience. It catches picks Qloo cannot find, confirms TasteForge's places are real and located in the requested city, and scores fit as a secondary metric (0.86 vs 0.93 on average over three live runs on 2026-10-20: Indore, London, New York)
- **Refine.** Like, dislike or lock items; only the affected sections are re-queried, with dislikes sent to Qloo as exclusions and likes added as signals.
- **Two-city comparison** (same audience, second city, no Taste Proof) and **shareable `/b#...` links.** Shared links carry an HMAC signature from the server, so a link that was edited shows as unverified instead of passing for Qloo data.

## How we built it

A Next.js (App Router) and TypeScript app with a hybrid agent pipeline, streamed to the browser over Server-Sent Events so the user watches the graph walk happen.

1. **Seeds** (light LLM, JSON): extract the named artists, brands and places the user mentioned, plus 2 to 6 concept phrases and the city. It is told never to invent entities.
2. **Resolve** (Qloo): `/search` and `/v2/tags` in parallel. If a name could mean two things, the agent asks instead of guessing.
3. **Graph walk** (Qloo, parallel by section): audience, sound, pairings, aesthetic, location.
4. **Critic** (light LLM): looks at coverage per section and may request follow-up queries from a fixed menu (drop the city, tags only, entities only, more results), at most two rounds.
5. **Synthesis** (main LLM, JSON schema): writes the brief from the evidence ledger only.
6. **Validator** (plain code): removes uncited items and computes the grounding score.
7. **Taste Proof**: baseline versus TasteForge, scored by Qloo.

This takes 3 to 5 LLM calls per brief. Our first version let the model pick every tool call and needed 10 to 15, which was slow and hit free-tier rate limits. Moving the predictable work into code fixed both.

The stack is tested: unit tests for the Qloo query builders (asserting exact parameter names), ledger, validator, pipeline, refine and Taste Proof; component tests for the evidence drawer, feedback and proof panel; a Playwright test for the full flow. A model cascade (three Gemini models, then two Groq models, each cooling down on quota errors) and a prompt-hash cache keep the demo alive on free tiers.

## How Qloo powers it

Qloo is the only source of recommendations. Concretely:

- `/search` resolves every name to a Qloo entity id.
- `/v2/tags` maps concept phrases to tag ids, which become taste signals. This is what makes "Find my audience" work from a description alone.
- `/v2/insights` with `signal.interests.entities` and `signal.interests.tags` returns the audience's movies, TV shows, artists and brands.
- `/v2/insights` for `place` with `filter.location.query` returns places the audience likes in the chosen city. We then run `urn:tag` analysis on the top five, filtered to `urn:tag:decor:qloo` and `urn:tag:ambience:qloo`, and the LLM maps those tags to colours, lighting and materials. The look of the brief comes from tags Qloo attached to real places.
- `urn:tag:genre:place:restaurant` tags on those places become menu ideas.
- `urn:demographics` gives age and gender skew.
- `urn:heatmap` gives the neighbourhoods where the audience concentrates.
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
- Taste Proof replaces "trust me" with checks produced by Qloo: every pick verified and traceable, never lower-fit than a plain LLM answer (0.86 vs 0.93 on average over three live runs on 2026-10-20), and non-existent or non-local picks caught. We do not claim a large fit gap.
- The refine loop re-queries only what changed, uses Qloo's own exclude filters, and keeps locked items verbatim.
- The full app, test suite and end-to-end test run offline with a mock Qloo and a scripted LLM, so every claim is reproducible without keys.
- Accessible by default: keyboard-operable evidence drawer with focus handling, labelled meters, toggle buttons with pressed state, a print stylesheet.

## What we learned

- Grounding works best as a data structure (ids and a validator), not as a prompt instruction.
- Qloo adds the most where an LLM has nothing reliable to say: audience-specific, place-specific facts such as which neighbourhoods over-index for a taste, and which decor tags the places they love share.
- Letting code run the predictable parts of an agent and keeping the model for judgement made it faster, cheaper and easier to test.
- Putting the evidence one click away makes the output easier to trust and to argue with, which is the point of a brief.

## What's next

- Run the full set of live checks across more cities and publish the Taste Proof results per audience type.
- Item-level pairings once product-level taste data is available; today Qloo has brands and categories, not SKUs.
- Export a brief as a design-ready kit (palette file, playlist seed list, venue shortlist).
- Persisted briefs and teams, with an opt-in store, so a brief can be revisited and compared over time.
- A confidence interval on Taste Proof using more picks per kind.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS, Zod, Leaflet with OpenStreetMap, Server-Sent Events, Vitest, Testing Library, Playwright, Qloo Taste AI API (`/search`, `/v2/tags`, `/v2/insights`, `/v2/trending`), Google Gemini 2.5 Flash with Groq (gpt-oss-120b) as fallback, Docker and Render (or Vercel).
