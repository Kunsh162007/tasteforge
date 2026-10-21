# TasteForge: red-team critique (judge's-eye view)

Reviewed 2026-10-21 against README, DEVPOST, DEMO_SCRIPT, ARCHITECTURE, BENCHMARK, RESEARCH, the live site (home page plus the Indore, London, New York and Chicago showcase briefs, the evidence drawer and Taste Proof; no new briefs run) and the public repo. Blunt by request.

**Context that changes the stakes.** The judges are the same panel as the 2025 Qloo LLM Hackathon (2,893 participants). That year's winner was **GeoTaste**, "your business consultant agent: location to market analysis". Other entries included **TAVA** (taste-aware venture architect), **Marketly** (cultural data to marketing campaign) and **Resonance AI** (culturally authentic messaging, honourable mention). These judges have already seen and rewarded "Qloo plus an LLM helps a small business understand its audience and location". TasteForge will not win on the category. It can only win on what is new: **receipts**, meaning every pick is verifiable and a plain LLM's picks are audited by Qloo itself. Every fix below serves that one message.

---

## 1. First impressions in 30 seconds

**Devpost page.** The tagline reads "A cultural briefing agent that builds a brief for your audience, with every recommendation traced to a Qloo signal and scored against a plain LLM by Qloo itself". It is 28 words and says "brief" twice. A judge skimming 1,700 entries reads "cultural briefing agent" and files it as "persona/marketing generator, like last year". The strongest fact, that a plain LLM's place picks could not be verified in the requested city 56% of the time, is buried in the "Evidence" section. *Verdict: they partly get it, and they get the wrong half.*

**Live site, first screen.** This is strong. "Know who you are making it for." works as a headline, the type is confident, and the "From a real run, Indore" card with its palette and "100% grounded" badge looks like a product rather than a proof of concept. *Verdict: Design judges get it.* The trouble starts one click later (see Weakness 2): the hero brief is the weakest showcase.

**Repo, first screen.** The About box has a description and topics but **no website link**. The README has no screenshot or GIF, and its first screen is two paragraphs followed by a dense six-row table. `AGENTS.md` sits at the root. MIT licence and recent pushes are fine. *Verdict: a CTO will read on because the content is good, but nothing on the first screen shows the product.*

---

## 2. Per-judge critique

### Mike Diolosa (Qloo CTO): the most important judge
- **Cares about:** depth and correctness of API use, and whether Qloo is load-bearing.
- **Will impress:** the breadth of endpoints (search, tags, insights across seven filter types, demographics, heatmap, trending); `filter.results.entities` used as an *independent judge*; refine through `filter.exclude.*`; query builders tested on exact parameter strings; tag specificity ranked against a city baseline (a real lift calculation).
- **Will make him skeptical:**
  - Flat affinities. Every artist in Indore is 0.97 and every TV show is 0.89, so the ranking carries no information.
  - The artist query has no location signal. Indore "indie young professionals" gets Kings of Leon and The Black Keys.
  - The UI says that names Qloo can't find are "likely invented". In practice this blames Qloo's coverage on the LLM.
  - The "Why" drawer shows seed entity UUIDs instead of names.
- **Toughest question:** "Your Taste Proof calls The Green Mill and the Music Box Theatre 'likely invented'. Those are Chicago landmarks. Is that our catalogue's fault or your matcher's?"
- **Answer to give:** "Fair. 'Not found' means 'Qloo can't verify it', and we've relabelled it. We now search across all entity types before calling something unverified, and we report a hand-audited true-fabrication rate separately from the coverage-gap rate." Only say this once it is true.

### Jason Calacanis (investor, $25k)
- **Cares about:** a wedge customer, a business model, the founder's speed, and whether it can be a company.
- **Will impress:** the cost contrast ($5k reports and $10k agency minimums against cents per brief), the shipping velocity, the honesty.
- **Will make him skeptical:** "café owners, makers, small studios and anyone…" means no customer. A one-off brief is not a subscription. Last year's winner did the same job.
- **Toughest question:** "Who pays you $29 a month, and why would they come back?"
- **Answer to give:** "Independent hospitality openings and refreshes, sold through POS marketplaces (Toast has about 164k locations). The recurring hook is a monthly 'taste drift' re-brief: what this audience is trending toward, with playlist and menu updates. A second business is the Taste Proof itself as a verification API, letting any AI assistant fact-check its local recommendations against Qloo." The second business is the more venture-shaped one. Put it in the pitch.

### Michael Abrams (Live Nation EVP, Strategic Initiatives)
- **Cares about:** music, live events, venues and audience-to-market fit.
- **Will impress:** the Chicago record-store bar brief: Dusty Groove, Gramaphone and Shuga Records are real, local and right. Heatmaps for routing pop-ups.
- **Will make him skeptical:** the Indore brief. For an indie audience in Indore, the *plain LLM* named Prateek Kuhad, Anuv Jain, The Local Train and Ritviz, all found in Qloo at 0.85 to 0.89. TasteForge named Kings of Leon, Radiohead, Arcade Fire, Beck and The Black Keys. He will conclude the baseline understands the scene better. In Chicago the proof flags The Green Mill and the Music Box Theatre as "not found". He knows both rooms.
- **Toughest question:** "Would a promoter use this to pick a support act or a venue in a new market?"
- **Answer to give:** "That's the event-planner mode. The same audience gets a two-city comparison for where to route, which neighbourhoods over-index, and which verified venues match the look." This only works if you add a "venues that host this audience" slice (a `place` insights call filtered to music venues) and fix the heatmap (Weakness 3).

### Todd Boehly (Eldridge; sports and media owner)
- **Cares about:** scale, brand and consumer engagement, and whether the idea extends to his assets (teams, venues, hospitality).
- **Will impress:** the concept of a brand/space/sound brief derived from fan taste, and the polished product feel.
- **Will make him skeptical:** small-business framing with no enterprise line.
- **Toughest question:** "Could this tell me how to theme a stadium club or a hotel F&B outlet for a specific fan base?"
- **Answer to give:** "Yes. Seed it with the team as an entity, set the venue city, and you get the fan base's sound, look and brand pairings, each one traceable. Same engine, enterprise brief." Add one sentence to the "What's next" section.

### Cedric the Entertainer
- **Cares about:** whether it is fun, human and culturally right, and whether a regular person gets it in one sentence.
- **Will impress:** the palette with real colour names, the "Sip slowly, think big." voice lines, and the map.
- **Will make him skeptical:** jargon ("grounding score", "evidence ledger", "affinity 0.97"), K-dramas presented as the taste of Indore's indie crowd, and "Post-Punk Pepperoni Pizza".
- **Toughest question:** "So what does the café owner actually do Monday morning?"
- **Answer to give:** "Press play on the playlist, paint the accent wall Goldenrod, hand out flyers in New Palasia, and put two menu items on the board." The product needs a "Monday list" export to make that answer real.

### Nicole Seligman (OpenAI board; lawyer)
- **Cares about:** responsible AI, accuracy claims, and data handling.
- **Will impress:** "code enforces citations", the HMAC-signed shares, no PII, the honest caveats, and the explicit "we don't claim a fit gap".
- **Will make her skeptical:** the claims are slightly overstated in places:
  - The README says "its fit is never lower than the plain answer's in our runs", but BENCHMARK shows artists at 0.90 for the baseline against 0.89 for TasteForge.
  - The UI says "TasteForge is at least as close".
  - The footer on the *live* site says "Sample data in demo mode is synthetic". That raises the question of whether what the judge is seeing is fake.
  - "100% grounded" counts citations that exist. It does not check that each caption is true ("Fantasy series popular among creative crowds" is LLM prose).
- **Toughest question:** "Labelling a real restaurant 'likely invented' is a factual claim about the restaurant. How do you know?"
- **Answer to give:** "We don't, so the UI now says 'Qloo can't verify'. We separate catalogue gaps from fabrication and audit them by hand."

---

## 3. Weaknesses, ranked by points at risk

| # | Weakness | Severity | Evidence | Fix | 8 days? |
|---|---|---|---|---|---|
| 1 | **"Not found in Qloo" is presented as "likely invented"** | CRITICAL | Chicago showcase: The Green Mill Cocktail Lounge, The Violet Hour and Music Box Theatre are "Not found in Qloo", with the copy "likely invented or not local". BENCHMARK's not-found list includes Café de Flore, Brooklyn Museum, PizzaExpress Jazz Club, Amul, Pantone, Bose, Arundhati Roy and Henri Cartier-Bresson (authors and photographers searched as "artist"), and A24 and Neon as "artist". A large share of the 29% is type mismatches and coverage gaps, not fabrication. | Relabel to "Qloo can't verify". Re-check every miss against **all** entity types and fuzzy names before counting it. Hand-audit the misses into three buckets: fabricated, real but missing from Qloo, wrong type. Publish the *true* fabrication rate even if it is small. "Off-city" (26 of 77) is the more robust number; lead with it. | Yes, 1 to 2 days |
| 2 | **The hero showcase makes the baseline look smarter** | CRITICAL | Indore: the baseline names India's indie scene (Kuhad, Anuv Jain, The Local Train); TasteForge names US rock radio. "What they love" is four K-dramas with invented captions. Demographics say 35 to 44 and male, which contradicts "young professionals". Brands Vans, Urban Outfitters, Converse (Urban Outfitters has no India retail). The cause: artist, TV and brand insights use entity and tag signals with no location signal, so you get global popularity at saturated affinity (0.97 each). | Add a location signal to the audience queries, ideally `signal.location` with the city; check the exact name with `qloo:check`. Try a popularity cap so you get audience-specific rather than mega-popular picks. Surface demographic contradictions instead of ignoring them. Make Chicago or London the homepage hero until Indore is fixed. | Yes, 1 to 2 days |
| 3 | **The heatmap puts the audience in the wrong places** | HIGH | New York brief: "Town of Brighton" and "City of Rochester" (upstate, about 500 km away), "Edgewater" (NJ), "Area near 40.715, -73.938". London: Sipson (the Heathrow village, 22 km out). Chicago: O'Hare. "New York" probably geocodes to the state. | Apply the 50 km cluster filter to heatmap cells as it is applied to places. Drop airport and other non-residential cells. Map "New York" to NYC. Never show raw coordinates. | Yes, half a day |
| 4 | **Visible bugs in the showcases** | HIGH | NY "The sound" lists Perfume Genius, Beach House, Weyes Blood and Sampha twice. The London showcase has **no Taste Proof**, the headline feature. NY pairings are Getty Images, Vice and Academy of Art University (an SF school) with truncated raw Qloo descriptions. The footer says the data is synthetic. | Dedupe items by id across citations. Regenerate showcases and refuse to publish one without a proof. Filter brand pairings to consumer categories. Show the synthetic footer only in mock mode. | Yes, 1 day |
| 5 | **"LLM translates, Qloo decides" is only half true** | HIGH | The LLM writes every caption ("K-drama with indie-vibe storytelling", "Skate-culture footwear aligns with indie aesthetic") and invents menu items ("Post-Punk Pepperoni Pizza", "Jazz-Infused Beet Salad", "Vinyl-Spun Cheese Board"). The README says "Nothing in a brief comes from the LLM's memory". | Say precisely: "Qloo chooses every entity; the LLM writes copy around them." Mark menu ideas "creative suggestion from cuisine tags X, Y". Rename the grounding score "citation coverage" and keep "grounded" for entities. | Yes, half a day |
| 6 | **The fit claim contradicts the data, and fit is meaningless at 0.97** | HIGH | README: "never lower". BENCHMARK, artists: 0.90 vs 0.89. Live NY proof: the plain LLM had 0 of 14 not found and 6 of 6 places, so on that showcase the proof shows *no* fabrication. | Delete "never lower" and "at least as close". Make fit a small footnote. On a showcase where the baseline is clean, say so ("this time the plain answer held up; here's what it couldn't do: addresses, hotspots, traceability"). | Yes, 1 hour |
| 7 | **Scope is too broad; target user is vague** | HIGH | Cafés, ceramicists, boutiques, record bars, pop-up bakeries and "a couple who love A24". The couple brief has no business. | Pick one persona: **independent hospitality operators opening or refreshing a venue** (café, bar, restaurant, pop-up). Keep makers as secondary. Replace the couple example with a promoter or event example for Abrams. | Yes, copy only |
| 8 | **Output is a page, not actions** | MEDIUM-HIGH | Spotify search links per artist exist, but there is no playlist, swatch file, flyer or checklist. | A "Monday list": a one-click Spotify playlist (or a copyable track list), the palette as PNG or ASE, the top 3 hotspots for flyers, 2 menu items and 3 copy lines. Printing exists; make the PDF a one-page kit. | Partly; the list and palette PNG take 1 day |
| 9 | **The palette mapping invites a "made up" challenge** | MEDIUM | A hash picks values within ranges. Unknown tags get "a hue from a hash of the tag names". Goldenrod and Teal both come from "Eclectic, Colorful". Midnight Blue comes from "Slow Living". | Pitch it honestly as "a mood palette from the decor tags of places this audience loves, mapped by a published table". Show the rule in the Why drawer ("Slow Living → calm-stone family → indigo"). Drop the hash-hue fallback, or label those swatches as low confidence. | Yes, half a day |
| 10 | **Benchmark is partly tautological** | MEDIUM | TasteForge's 0% is by construction. The 20-prompt run uses a deterministic writer, not the real synthesis. The baseline was a fast Groq model that knows fewer local venues. | Frame it as "the guarantee, plus a measurement of baseline risk". Add one run with a strong baseline (Gemini 2.5 Flash or GPT-class). If that baseline is still off-city 20%+, the claim becomes much harder to dismiss. | Yes, 1 day plus quota |
| 11 | **Too close to last year's winners** | MEDIUM | GeoTaste (1st), TAVA, Marketly and Resonance AI cover the same ground. | Open the Devpost text and video on the *audit* idea, not the brief: "Ask any AI where your audience hangs out and half the places can't be verified. TasteForge only recommends what Qloo can prove." | Yes |
| 12 | **Latency and free-tier fragility** | MEDIUM | Render free tier: about 30 s cold start, and the showcase cache is forgotten after 15 minutes idle. Judging runs for days with no one to run `npm run warm`. A live brief takes 20 to 60 s. | Commit the six showcase briefs as static JSON so they survive sleep, or pay $7 for an always-on instance. Add an external uptime ping. Make the Devpost demo path showcase-first. | Yes, hours |
| 13 | **Coverage limits (India)** | MEDIUM | Indore is the thinnest city and is used as the hero. | Keep an India brief (it is a good global story) but after the location fix. Name the limit on screen: "Qloo coverage here is thinner; 4 verified places". | Yes |
| 14 | **No video / the demo script is fragile** | MEDIUM | DEMO_SCRIPT asks judges to run a 40 s live brief, refine and compare on free tiers. Devpost judges mostly watch the video. | Record a 2:30 video: hook (a plain LLM's Chicago list with a fake or off-city pick highlighted), then the brief, a Why chip, Taste Proof, refine, and the Monday list. Use showcases only, so nothing can fail live. | Yes, 1 day |
| 15 | **Name, tagline, jargon** | LOW-MEDIUM | "TasteForge" is fine. "Cultural brief" is agency jargon to a café owner. | Tagline: "Know who you're making it for, with receipts." Sub-line: "Every song, colour and place in your brief is backed by Qloo data you can click." | Yes |
| 16 | **The evidence drawer is built for engineers** | LOW-MEDIUM | Raw entity UUIDs, `take 8`, no human sentence. | Resolve ids to names. Lead with one sentence: "Qloo: people who like Radiohead and indie rock over-index on Kings of Leon (0.97)." Keep the raw view collapsed. | Yes, half a day |

---

## 4. Strengths we are underselling

1. **Qloo as the referee.** Using `filter.results.entities` so Qloo scores a competitor's list is the most original Qloo use in the project, and probably in the field. It deserves its own line: "We don't grade ourselves."
2. **The audit can be a product of its own.** "Verify any LLM's local recommendations against Qloo" is a B2B API for every AI assistant. It is the most investable framing for Calacanis and the most flattering one for Qloo: Qloo becomes the fact layer for LLMs.
3. **Specificity against a city baseline.** Decor and ambience tags are ranked by lift over ordinary places in that city. That is real taste-graph thinking, but it is buried in Known limits.
4. **Real, local, correct places.** Chicago gets Dusty Groove, Gramaphone, Shuga Records and Bucket O' Blood. London gets 40 Maltby Street, St. JOHN, Brawn and Medlar, all with addresses. Show those, not the Indore brief.
5. **The refine loop uses Qloo's own exclusions.** A dislike becomes `filter.exclude.entities`, not a prompt tweak. Feedback that changes the query is rare and demos well.
6. **Disambiguation before spending.** "Which did you mean?" on mixed-type matches is a mature agent behaviour, and nobody will see it unless the video shows it.
7. **Engineering discipline:** signed share links, a deterministic pipeline (about 80% repeatability, up from 17%), 3 to 5 LLM calls, tests on parameter strings. Compress this to one line for the CTO; don't lead with it for the others.
8. **Honesty.** The caveats section is unusually good. Keep it, but fix the few places (Weaknesses 5 and 6) where the copy is less honest than the doc.

---

## 5. Top 10 changes, ordered by points gained per effort

1. **Relabel "not found" to "Qloo can't verify", re-check misses across all entity types, and hand-audit the benchmark misses** into fabricated, missing from Qloo and wrong type. Lead with off-city plus true fabrication. (1 to 2 days; protects Tech and Idea scores from the CTO's first question.)
2. **Fix the showcase bugs and regenerate:** dedupe artists, require a Taste Proof on every showcase, filter non-consumer "brands", hide the synthetic footer in live mode. (1 day.)
3. **Heatmap sanity:** 50 km filter, no airport cells, no raw coordinates, "New York" mapped to NYC. (Half a day.)
4. **Localise audience queries** (a location signal on artist, TV and brand insights; popularity cap). Swap the homepage hero to Chicago or London until Indore shows local artists. (1 to 2 days.)
5. **Delete the overclaims:** "never lower", "at least as close", "nothing comes from the LLM's memory". Rename the grounding score to citation coverage. (1 hour.)
6. **Record a 2:30 video** that opens on the audit hook and uses only showcases. (1 day.)
7. **Rewrite the Devpost opening, tagline and README first screen:** one persona (independent hospitality), "with receipts", a GIF, and the site URL in the repo About box. (Half a day.)
8. **Keep the demo alive unattended:** static showcase JSON committed or an always-on instance, plus an uptime ping. (Hours.)
9. **Add a "Monday list" export:** playlist, palette PNG, flyer hotspots, two menu items, three lines of copy. (1 day.)
10. **Humanise the Why drawer** (names instead of UUIDs, a one-sentence explanation, the palette rule shown) and add the "verification API for AI assistants" business line to the pitch. (1 day.)
