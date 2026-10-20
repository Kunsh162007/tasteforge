# TasteForge: research on architecture ROI and impact

Compiled 2026-10-20 to support the Devpost submission. Every number has a source. Anything marked **(estimate)** is our own arithmetic with its assumptions stated. Where a number could not be found, this file says so.

## Part A: architecture decisions and their ROI

### 1. Hybrid "workflow + agent" instead of a free tool-calling loop

- Anthropic separates *workflows* (LLMs and tools run along code paths fixed in advance) from *agents* (the model picks its own steps). It advises using the simplest design that works, and notes that agentic systems "trade latency and cost for better task performance". https://www.anthropic.com/research/building-effective-agents
- OpenAI's agent guide says agents fit cases where deterministic, rule-based approaches fall short, and that "a deterministic solution may suffice" otherwise. https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- τ-bench (Sierra): on its retail domain, state-of-the-art function-calling agents (gpt-4o) solved fewer than 50% of tasks, and pass^8 (succeeding on all of 8 repeated tries) fell below 25%. Free tool-calling loops are inconsistent from one run to the next. https://arxiv.org/abs/2406.12045, https://sierra.ai/blog/benchmarking-ai-agents

**ROI (measured by us):** 10–15 LLM calls per brief down to 3–5, a 60–75% cut in calls, and with it free-tier quota use. Our walk always issues the same Qloo calls for the same signals, so its query builders can be unit-tested with exact strings. A free loop cannot be tested this way.
**For judges:** "We followed Anthropic's guidance: code runs the predictable graph walk in parallel, and the model only decides what needs judgement. That cut LLM calls per brief by about 70%."

### 2. Evidence ledger, citation ids and a deterministic validator

- ALCE benchmark (Gao et al., EMNLP 2023): even the best models' answers lacked full citation support about 50% of the time on ELI5. Asking a model to cite is not enough, so the citations have to be checked. https://arxiv.org/abs/2305.14627
- Anthropic's Citations API launch: customer Endex reported source hallucinations falling "from 10% to zero" once citations were tied to provided documents (a vendor-reported figure). https://the-decoder.com/anthropic-adds-source-citations-to-claude-models/
- Chen, Weng & Moro (2026) audited three LLMs' restaurant recommendations across 304 neighbourhoods in five US cities. Models **fabricate venues**, mostly in neighbourhoods with weaker digital footprints, and **fabrication disappears when the models are given verified venue lists**. https://arxiv.org/abs/2607.06260

**ROI:** a prompt instruction lowers hallucination but does not remove it. A validator that checks ids makes uncited items impossible to show (structurally 0%), and the grounding score is computed rather than claimed. The validator is a pure function, so it is cheap to test.
**For judges:** "A 2026 audit found LLMs invent restaurants, and that the problem goes away when the model is held to a verified list. TasteForge holds the model to Qloo's list, and code enforces it."

### 3. Critic / reflection with a bounded follow-up menu

- Self-Refine (Madaan et al., NeurIPS 2023): generating, critiquing and revising gave about 20 percentage points of absolute improvement on average across 7 tasks. https://arxiv.org/abs/2303.17651
- Huang et al. (ICLR 2024): without external feedback, LLMs often fail to correct their own reasoning and can get worse. https://arxiv.org/abs/2310.01798

**ROI:** our critic reads an *external* signal (per-section coverage counts computed from the ledger), which is the condition Huang et al. say self-correction needs. It is skipped when no section is thin, capped at 2 rounds and limited to a fixed menu of strategies, so its worst-case cost is bounded (at most 2 extra light-model calls) and it cannot invent queries.
**For judges:** "Reflection only helps with real feedback, so our critic sees measured coverage, not its own prose, and can only choose from a fixed menu."

### 4. JSON-mode / schema-constrained output instead of function calling

- OpenAI Structured Outputs: on OpenAI's own eval of complex JSON-schema following, gpt-4o-2024-08-06 scored 100%, against under 40% for gpt-4-0613 without constraints. https://openai.com/index/introducing-structured-outputs-in-the-api/
- Tam et al. (EMNLP 2024 Industry track), "Let Me Speak Freely?": strict format constraints can **reduce reasoning quality**, though they help classification-like tasks. https://arxiv.org/abs/2408.02442

**ROI:** we do not need tool calls (code makes them), so schema-constrained JSON gives parseable output in a single call with no tool-selection step. The risk Tam et al. raise is mainly to multi-step reasoning, and our synthesis step mostly maps evidence to sections. Schema repair handles the remaining failures.
**For judges:** "Function calling is for letting a model choose actions. Ours doesn't need to choose, so it writes schema-checked JSON in one call."

### 5. Model cascade across free tiers, cooldowns, caching, rate limiting

- FrugalGPT (Chen, Zaharia & Zou, 2023): LLM cascades matched GPT-4 at up to 98% lower cost on their benchmarks. https://arxiv.org/abs/2305.05176
- Anthropic prompt caching: up to 90% lower cost and up to 85% lower latency for long, repeated prompts (79% in their 100k-token example). https://www.anthropic.com/news/prompt-caching

**Honest framing:** FrugalGPT routes queries by confidence. Our cascade is a fallback for availability (the next model takes over on 429 or 503). The ROI is uptime at $0 marginal cost, not quality-aware routing. The prompt-hash cache makes repeat showcase or demo requests free and instant. The cooldowns mean a quota-exhausted model is skipped, not retried, on every brief.
**For judges:** "Five free models in a cascade with per-model cooldowns keep the public demo up at zero marginal cost."

### 6. Taste Proof: an LLM baseline scored by the data provider

- LLM-as-judge (Zheng et al., NeurIPS 2023): GPT-4 judges agree with humans more than 80% of the time, but show position, verbosity and **self-enhancement** bias. https://arxiv.org/abs/2306.05685
- Lichtenberg et al. (2024) find LLM recommenders carry popularity bias (moderate, and lower than collaborative filtering in their setup). Memorisation studies show models favour popular items they saw in training. https://arxiv.org/abs/2406.01285

**ROI:** using Qloo's own `filter.results.entities` scoring as the judge avoids the self-enhancement bias of an LLM grading LLM output. Both lists are scored by the same function on the same signals. The more convincing result is existence and locality: "not found" picks and picks outside the requested city are the fabrication failure that Chen et al. measure. Our measured fit gap is small (0.86 vs 0.93, 3 live runs), so the case rests on verifiability, not on that gap.
**For judges:** "We don't let an LLM grade itself. Qloo scores both lists and also catches picks that don't exist or aren't in the city."

### 7. Streaming the agent's work (SSE trail)

- Nielsen Norman Group's response-time limits: about 1 s keeps the user's flow of thought, and about 10 s is the limit for holding attention. Beyond that, users need progress feedback. https://www.nngroup.com/articles/response-times-3-important-limits/
- Explanation research (Tintarev & Masthoff, 2012) lists transparency and trust among the main aims of explanations in recommenders. https://doi.org/10.1007/s11257-011-9117-5

**ROI:** a brief takes tens of seconds, well past 10 s. Streaming `tool_call`/`tool_result` events makes that wait visible progress, and each event links to evidence, so the trail also explains the result. We have no measured perceived-latency figure of our own.
**For judges:** "A brief takes longer than NN/g's 10-second attention limit, so you watch every Qloo call as it happens, and each one is a receipt."

### 8. HMAC-signed evidence

- HMAC (RFC 2104) is the standard keyed integrity check. https://www.rfc-editor.org/rfc/rfc2104

**ROI:** the server stays stateless (no database, nothing to leak), but neither the browser nor a shared link can forge "Qloo data". Verifying a signature costs microseconds. Scope is limited: the signature covers the evidence, not the prose.
**For judges:** "Shared briefs carry a server signature, so edited evidence shows up as unverified."

## Part B: impact and a real audience

**How many businesses**
- US: 36.2 million small businesses (SBA Office of Advocacy, 2025). https://advocacy.sba.gov/2025/10/28/advocacy-releases-2025-small-business-profiles-for-major-metropolitan-areas/
- US restaurants: more than 1 million locations, and more than 7 in 10 are single-unit operators (National Restaurant Association, 2025). https://go.restaurant.org/rs/078-ZLA-461/images/SOI-2025-PocketGuide.pdf
- Toast alone added about 30,000 net restaurant locations in 2025 (about 164,000 total). This is a proxy for new and switching venues, not a census of openings. https://www.businesswire.com/news/home/20260212058106/en/
- India: food services were worth about ₹5.69 lakh crore in FY24, forecast at ₹7.76 lakh crore by FY28 (NRAI IFSR 2024). https://www.indiaretailing.com/2024/07/10/food-services-sector-set-to-reach-rs-7-76-lakh-crore. No reliable national outlet count was found; NRAI claims to represent 5 lakh restaurants. Branded cafés reached 5,339 outlets, up 12.7% in a year (World Coffee Portal, 2025). Independents hold about 76% of the cafés-and-bars market (Mordor Intelligence, paid estimate). https://www.worldcoffeeportal.com/news/india-a-branded-coffee-shop-market-brimming-with-potential
- Makers: Etsy had about 5.6 million active sellers (2025). https://insideretail.us/etsy-vows-sustained-growth-after-revenue-lift/. UK: about 23,050 contemporary craft businesses (Crafts Council, 2012, dated). 73% of UK adults bought craft in 2019 (Crafts Council, "The Market for Craft", 2020).
- Homestays: about 5 million Airbnb hosts worldwide (aggregator figure, not Airbnb primary). No count of Indian homestays was found.
- Creator economy: about $250B, projected to reach $480B by 2027 (Goldman Sachs Research). https://www.goldmansachs.com/insights/articles/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027
- **Rebranding frequency: no credible data found.**

**Failure rates**
- 26.16% of independent restaurants failed in year one, and about 61% within three years (Parsa et al., 2005, Cornell HRA Quarterly). A later study using BLS data put the first-year rate at 17%. https://news.osu.edu/restaurant-failure-rate-much-lower-than-commonly-assumed-study-finds/
- On concept: summaries of Parsa's qualitative work say concept clarity matters more than strategy for viability. We could not confirm the exact wording against the paper. **No study found puts a percentage of failures on brand or ambience fit**, so we should not claim one.

**What they pay today**
- Interior design: $50–200/hr, or $5–15 per sq ft, for US residential projects (HomeAdvisor). For restaurants, fees run 5–10% of the build budget, with flat fees of $2k–50k+ (one trade guide). https://www.homeadvisor.com/cost/home-design-and-decor/hire-an-interior-decorator-or-designer/. No India fee data found.
- Brand identity: hospitality agencies list minimum projects of $10k–25k+ on Clutch. Freelance logo platforms charge $200–1,500 (iDesign, 2026).
- Market research: one Mintel foodservice report costs $4,995 (US C-store Foodservice 2024). https://reports.mintel.com/display/1157789/
- Music: UK TheMusicLicence for a small café costs about £401 a year (PPL PRS). https://pplprs.co.uk/how-is-the-cost-calculated/. Business streaming such as Soundtrack runs about $29–49 per zone per month (third-party figures).
- TasteForge brief: $0 on free tiers. At paid rates it costs **cents (estimate**: 3–5 flash-class calls of a few thousand tokens each; check against current price sheets).

**Ambience works**
- Milliman (1986, Journal of Consumer Research): slower background music lengthened restaurant meals and raised bar spending. https://academic.oup.com/jcr/article-abstract/13/2/286/1846377
- North, Hargreaves & McKendrick (1999, Journal of Applied Psychology): French music made French wine outsell German wine, and German music reversed it. https://doi.org/10.1037/0021-9010.84.2.271
- Kotler (1973) coined "atmospherics": designing the buying environment for emotional effect.
- Roschk et al. (2017, Journal of Retailing): a meta-analysis of 66 studies (N=15,621) found music, scent and colour affect shopping outcomes, with stronger music and scent effects in **service** settings than in retail. https://eprints.gla.ac.uk/214127/

**LLMs get local recommendations wrong**
- Chen, Weng & Moro (2026): LLMs fabricate venues, most in neighbourhoods with weak digital footprints. Even when choosing from real venues, 47.5% are never recommended. https://arxiv.org/abs/2607.06260
- Pitenin (2026), a census of 4,776 Bali food venues: at least 85.6% were never recommended by ChatGPT, Claude, Gemini or Perplexity. Stale or closed venues were a bigger problem than invented ones. *The study was funded by a vendor of AI-visibility tools (disclosed).* https://arxiv.org/abs/2608.07069
- Popularity bias: LLM recommendations lean towards popular items (Lichtenberg et al., 2024, linked above). This is why an LLM's "audience" tends to be the mainstream one.

## Part C: success scenarios

All time and money figures are **estimates** using the price ranges above.

**1. Indore café owner (new 40-seat specialty café)**
- *Before:* the owner pieces the concept together from Pinterest and chatbot answers. Some named "references" turn out not to exist or are in Mumbai. A consultant would cost more than the décor budget.
- *After:* one brief (minutes, about $0) gives a palette and materials taken from decor and ambience tags of places this audience likes in Indore, artists for a playlist, neighbourhood hotspots for siting and flyers, and menu pairings.
- *Saved (estimate):* about 15–25 hours of research, plus a concept consult. India fees are unknown; a US 10–20 hr consult at $50–150/hr is $500–3,000.
- *Pilot metric:* average dwell time and repeat-visit rate (from POS data) over 30 days against the owner's pre-change baseline or a sister outlet. Secondary: whether the hotspot neighbourhoods shown in the brief are where footfall comes from.

**2. London ceramicist (Etsy and markets)**
- *Before:* the maker guesses at "who buys this" and imitates competitors' packaging and Instagram tone.
- *After:* "Find my audience" turns a product description into the audience's films, music, brands and tone, plus London neighbourhoods where they concentrate (for choosing markets and pop-up stockists).
- *Saved (estimate):* one $3k–5k syndicated report that would not cover her niche anyway, and 10+ hours.
- *Pilot metric:* A/B test of listing photos, copy and packaging (old against brief-led) on Etsy conversion rate and favourites per view over 30 days.

**3. Pop-up / event planner (two-city weekend series)**
- *Before:* each city is planned separately on instinct, and the music and venue look cannot be justified to a client.
- *After:* one audience, two-city comparison, signed shareable links to send the client, and venue references verified as real and local.
- *Saved (estimate):* 1–2 days of pitch research per city.
- *Pilot metric:* ticket sell-through and post-event NPS against the planner's previous events; client approval of the pitch at the first round.

**Path to impact**
- *Who pays:* a freemium tier for owners and makers, a paid per-brief "design kit" export, and B2B2SMB through platforms.
- *Distribution:* POS app marketplaces (Toast, which has about 164k locations, and Square), Shopify and Etsy-adjacent seller tools, interior-design tools (mood-board apps), and Qloo's own partner channels (for example JCDecaux, an existing Qloo partner on out-of-home ad planning).
- *30-day pilot:* 10 cafés (5 in Indore, 5 in London) and 10 makers. Week 0: baseline POS and shop metrics. Week 1: brief and one ambience or packaging change. Weeks 2–4: measure dwell time, repeat visits and conversion. Report results with confidence intervals and all failures.

## Part D: recommendations

**Five most persuasive facts to add to the Devpost text**
1. Chen, Weng & Moro (2026): LLMs fabricate restaurants, and fabrication **disappears when the model is given verified venue lists**. That is TasteForge's design.
2. More than 1 million US restaurant locations, over 70% of them single-unit; 26% of independents fail in year one (Parsa 2005).
3. A meta-analysis of 66 studies: music, scent and colour shape customer behaviour, more strongly in service venues such as cafés (Roschk et al., 2017).
4. What small businesses pay today: about $5k for one market report, $10k+ minimums at hospitality brand agencies, and $5–15 per sq ft for design, against a brief that costs cents.
5. τ-bench: free tool-calling agents succeed on all 8 of 8 repeated tries less than 25% of the time. The hybrid design is why TasteForge is repeatable (and uses about 70% fewer LLM calls).

**High-ROI improvements doable in about 7 days**
1. **Publish a fabrication / not-found rate** (highest ROI). Run Taste Proof over 20–30 prompts × 3–5 cities with a script and report the share of baseline picks Qloo cannot find or that are outside the city, against TasteForge (0% by construction). This mirrors the metric in the 2026 audit papers and is a stronger headline than the 0.86 vs 0.93 fit gap. Commit the script and results so judges can reproduce them.
2. **Report consistency (pass^k).** Run the same prompt k times and report the overlap of items and grounding score across runs. This turns "hybrid is reliable" into a number.
3. **Two-step synthesis, only if quality suffers.** Per Tam et al., let the model draft section notes freely, then format to the schema. Costs one extra call; adopt it only if an A/B on 10 prompts shows better briefs.
4. **Confidence intervals on Taste Proof** (already on the roadmap) using more picks per kind.
5. **Design-kit export** (palette file, playlist seed list, venue shortlist) to make the pilot metric (an ambience change shipped in week 1) easy to carry out.
