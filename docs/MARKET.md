# TasteForge: market, critics and presentation

Compiled 2026-10-21. This file adds to `RESEARCH.md` and does not repeat it. Every claim has a link. **(estimate)** marks our own arithmetic. Prices come from third-party aggregators unless marked "official", and they often disagree with each other, so check them before quoting.

## 0. Read this first: what the judges reward

The 2026 Qloo Agentic Hackathon page (https://qloo.devpost.com/, rules at https://qloo.devpost.com/rules) sets the context for everything below:

- **Four equally weighted criteria:** Technological Implementation (ties are broken on this one first), Design ("a complete, coherent product experience, not just a technical proof of concept"), Potential Impact ("a credible, specific case for solving a real problem for a real audience ... based on what's demonstrated") and Quality of the Idea ("creative, non-obvious use of Qloo ... genuine understanding of the problem space").
- **"Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video"** (rules). No video is required, but most judges will read the page first and some will read nothing else.
- **The judges are mostly business people:** Jason Calacanis, Nicole Seligman, Todd Boehly, Cedric the Entertainer, Michael Abrams (Live Nation) and Mike Diolosa (Qloo CTO). Only one of the six is a technical judge, so the first screen of the page has to persuade a non-engineer.
- The brief cites "250M+ entities". Qloo's own docs say "half a billion+" (https://github.com/qloo/docs-public, `docs/data-foundation.md`) and its website says 3.7 billion. Quote the hackathon's figure or none.

**The hardest finding: the 2025 hackathon already rewarded our space.** The 2025 Grand Prize went to **GeoTaste: Your Business Consultant Agent**, which promises "instant market analysis, competitive intelligence and interactive visualizations" for a location (https://devpost.com/software/geotaste-your-agentic-qloo-taste-business-consultant). **TAVA** ("Tell TAVA what kind of place you want to open, where ... and what inspires you", with a heatmap and a report: https://devpost.com/software/tava-taste-aware-venture-architect) and **Marketly** (cultural data turned into campaigns: https://devpost.com/software/marketly) were also entered and did not place. Under "Quality of the Idea", a judge who remembers 2025 will read "brief for a café owner, with a heatmap" as a repeat. Our page has to show at once what is new: **the physical and sensory design (palette, materials, lighting, sound) taken from the decor and ambience tags of real local places, plus verifiability.** "Location insight for SMBs" is not new.

## 1. Competitors and substitutes

| Tool | What it does for a small venue or maker | Price (as found) | Audience taste data? | Real local places? | Checkable sources? |
|---|---|---|---|---|---|
| **Looka** | AI logo and brand kit from style picks | Logo $20–35 one-off; Brand Kit $96/yr (https://pricingsaas.com/companies/looka) | No: styles from user taste | No | No |
| **Canva Pro / Magic Studio / Brand Kit** | Stores your palette and fonts; 20+ AI design tools | ~$120–144/yr per person (aggregators, e.g. https://stylefactoryproductions.com/blog/canva-pricing) | No | No | No |
| **Adobe Firefly Boards** | AI moodboarding canvas, image and video generation (public beta June 2025) | Within Firefly / Creative Cloud plans; Boards price not listed (https://www.businesswire.com/news/home/20250617120289/en/) | No | No | No |
| **Midjourney moodboards / profiles** | Image style learned from *your* ratings (40 to start, ~200 to stabilise) | Midjourney subscription (https://updates.midjourney.com/profiles-and-moodboards/) | Your own taste, not the audience's | No | No |
| **Pinterest Trends / Predicts** | Free trend search by region and demographic; annual trend report | Free (https://www.tailwindapp.com/pinterest-marketing/course/pinterest-trends) | Yes: Pinterest search behaviour, a few countries | No | Trend charts only |
| **Coolors / Khroma** | Palette generators | Coolors Pro ~$3–5/mo (https://toolradar.com/tools/coolors/pricing); Khroma free (not re-verified) | No | No | No |
| **Interior AI / RoomGPT** | Restyle a photo of a room | Interior AI $39–299/mo (https://www.cutout.pro/learn/interior-ai); RoomGPT credit packs $9–29 (https://aihomedesign.com/blog/real-estate/roomgpt/) | No | No | No |
| **Havenly** (e-design service) | Human designer, moodboard and shoppable plan | **Price not found in this search** | Client brief only | No | Human |
| **SparkToro** | Where an audience spends attention online: sites, podcasts, social accounts | Free tier; ~$50–300/mo (https://tr-web.dev.trustradius.com/products/sparktoro/pricing) | Yes: online behaviour | No | Partly |
| **Audiense / GWI** | Audience segmentation, survey-based panels | Audiense Insights from ~$8.4k/yr (G2, 2024, https://g2.com/products/audiense/pricing); GWI free tier, then sales quote | Yes, strong | No | Survey basis |
| **Meta Business Suite insights** | Your own followers' demographics (the standalone Audience Insights tool was retired in 2021) | Free (https://blog.hootsuite.com/facebook-audience-insights/) | Your own followers only | No | No |
| **Soundtrack Your Brand / Rockbot** | Licensed business music, curated playlists by venue type | Soundtrack ~$29–35/zone/mo (competitor-reported, https://cloudcovermusic.com/compare/pandora-cloudcover-vs-soundtrack); Rockbot ~$25/zone/mo (https://www.g2.com/fr/products/rockbot/software_advice_form_fill/new) | Venue type / "brand fit", not audience data | No | No |
| **Insights by Qloo** (Qloo's own) | Self-serve dashboards over the same taste graph | Per seat, 3 tiers, "contact sales" (https://get.qloo.com/consumer-insights-demo) | Yes, the same data | Yes | Affinity tables |
| **Qloo partners** | JCDecaux (out-of-home ads), Michelin, Samsung and Netflix are named as API ecosystem sources (Qloo FAQ, https://github.com/qloo/docs-public `docs/faqs.md`) | Enterprise | Yes | Yes | n/a |
| **Plain ChatGPT / Claude / Gemini** | Writes a full concept in one prompt | $0–20/mo | No: training-data priors | Often wrong (our benchmark) | No |
| **Past Qloo entrants** (GeoTaste, TAVA, Marketly) | Location and business consultant reports | Free demos | Yes (Qloo) | GeoTaste/TAVA: yes | Not stated as a feature |

### Where TasteForge actually differs

1. **It joins audience taste to physical design.** No tool in the table goes from "who is this for" to "what this place should look and sound like". Design tools start from the owner's taste, and audience tools stop at dashboards and media lists. The decor and ambience tags of places the audience likes in that city are the only data-backed link we found between the two.
2. **Every item is checkable.** The why-chips, grounding score and signed links are not offered by any competitor, Qloo's 2025 winners included.
3. **The references are local and real.** It names real places in the user's own city. Design tools never do this, and LLMs get it wrong (see the benchmark in `DEVPOST.md`).
4. **It costs cents.** Audience tools start at $50/month (SparkToro) and go up to about $8k/year (Audiense).

### Where TasteForge is weaker (say so before a judge does)

- **No visuals.** Canva, Firefly and Midjourney produce images, and we produce words and swatches. A café owner wants to *see* the room. This is the biggest gap in Design.
- **No execution.** Looka gives you a logo and Soundtrack plays the music. We hand over a brief, and the owner still needs a designer and a licensed music service. (Playing Spotify in a venue is not licensed for business use; RESEARCH.md has PRS figures.)
- **Thinner audience data than GWI or Audiense,** which use survey panels with stated methods. Qloo's method is a black box to users (Section 3).
- **Patchy coverage outside big Western cities** (Section 3), which is exactly where the Indore story is set.
- **No outcome data.** Nobody has yet opened a café from a TasteForge brief.

## 2. Do target users want this?

### What owners say (Reddit, quoted from search snippets; the links go to the threads)

- On what a café sells: *"You're not really selling coffee - youre selling a vibe and a meeting space ... If the vibe of your place isn't good, you're toast ... If you don't understand who your customers are and what kinds of people buy coffee at your location, you're toast."* r/smallbusiness, https://www.reddit.com/r/smallbusiness/comments/zzxq1g/how_bad_of_an_idea_is_it_to_open_a_coffee_shop
- **Our exact persona:** *"I'm planning to open a new coffee cafe in Indore ... Which areas are ideal for a coffee-focused cafe that can attract young professionals, students, or coffee enthusiasts?"* The replies: *"You'd have to do a marketing survey as well as consult someone"* and *"Market research will only happen on ground and/or by talking to people."* A reply also warns that *"an average Indori crowd"* takes Starbucks-style dessert coffee as the benchmark. r/IndiaCoffee, https://www.reddit.com/r/IndiaCoffee/comments/1hmk8bt/thinking_of_opening_a_coffeeonly_cafe_in_indore
- Advice given to a new Bangalore restaurant: *"... pick an aesthetic that fits that type, then design to that aesthetic and vibe."* r/IndiaBusiness, https://www.reddit.com/r/IndiaBusiness/comments/1hofs73/opened_new_restaurant_in_bangalore_need_advice_to
- *"Every business has a target CUSTOMER, find your Target audience first. Write down every detail of the kind of people you want to attract."* r/hyderabad, https://www.reddit.com/r/hyderabad/comments/1b6x4z8/opening_a_cafe
- A founder whose lease fell through after doing location research: *"[Cafe] How to identify an area has the right target customers."* r/smallbusiness, https://www.reddit.com/r/smallbusiness/comments/1ii5qah/cafe_how_to_identify_an_area_has_the_right_target
- What branding costs: a full restaurant branding job is quoted at *"$2000 and up"* (r/graphic_design, https://www.reddit.com/r/graphic_design/comments/1dufgr0/pricing_question_regarding_a_logo_for_a_restaurant), and *"logo designers from $125, for $1250 and even one for $12500"* (r/smallbusiness, https://www.reddit.com/r/smallbusiness/comments/xmhzz0/new_food_business_branding).
- Owners looking for cheap background music: *"several restaurant, café and retail business communities where owners are looking for affordable background music solutions"* (r/SunoAI, https://www.reddit.com/r/SunoAI/comments/1vgnrsw/nobody_talks_about_it_but_thats_where_the_money_is). One question about licensing: *"Does the Spotify Commercial subscription include licensing fees so I don't have to pay BMI?"* (r/restaurateur, https://www.reddit.com/r/restaurateur/comments/6k8tno/ambient_music_for_restaurants)
- Designers: a thread titled *"The hidden cost of mood board creation that's killing your client presentations"* (r/InteriorDesignHacks, https://www.reddit.com/r/InteriorDesignHacks/comments/1m77tso/), and a designer writing *"I can have a pretty clear internal vision of the mood ... but often simply don't find the right images to express it clearly"* (r/cinematography, https://www.reddit.com/r/cinematography/comments/1g9gchj/whats_your_approach_to_mood_boards).

Reddit blocked direct fetches, so these quotes come from search-index snippets. Open each thread before reusing a quote publicly.

### What professionals do (trade press)

- Café architects run "a thorough discovery phase ... questionnaires, and a 'precedent study' presentation", and list "Your customer – Who's your space for?" as the second input after the concept (Studio BANAA, https://www.studiobanaa.com/insights/how-to-start-a-coffee-shop-or-cafe-an-architects-perspective/). **That precedent study is the step TasteForge would replace.**
- Agencies define "who the customers were" before naming or designing anything (Good Noise case study, https://restaurantsbrighton.co.uk/jobs/blog/good-noise-branding-case-study/). Toast's own coffee-branding guide says "Start by crafting a mood board" (https://pos.toasttab.com/blog/on-the-line/how-to-do-coffee-shop-branding).
- Music suppliers already match music to "the menu, the customer profile, the ambiance" (Pandora CloudCover musicologist, https://cloudcovermusic.com/choosing-music-guide/playlists-for-restaurants). They do it by hand, from venue type.
- AI is already normal for small businesses: AI use rose from 39% to 55% in a year (Thryv, 2025, https://investor.thryv.com/news/news-details/2025/AI-Adoption-Among-Small-Businesses-Surges-41-in-2025-According-to-New-Survey-from-Thryv/), and 39% plan to put money into branding (Fiverr, 2025, https://block.fiverr.com/news/small-business-survey-2025). **No survey of how much small businesses would pay for a concept brief specifically was found.**

### Willingness to pay

What we have is indirect: $125 to $2,000+ for branding, $5k+ for an agency, $29–35 a month per zone for music, $50+ a month for audience tools. **(estimate)** A one-off $19–49 "opening kit" sits below a freelancer and above free tools. This is untested, so do not put a price on the Devpost page.

### Recommended beachhead: independent café and restaurant founders, before opening (with interior and hospitality designers as the paid channel)

| Candidate | Pain is acute? | Needs local places + audience? | Can reach? | Verdict |
|---|---|---|---|---|
| **Pre-opening café/restaurant founder** | Yes: one-off, high-stakes decisions made in weeks | Yes, all sections | Reddit, POS and lease-signing moments | **Beachhead** |
| Interior / hospitality designer doing client briefs | Yes: concept and precedent work, often unpaid | Yes | 87,100 US interior designers (BLS 2024, https://www.bls.gov/ooh/arts-and-design/interior-designers.htm) | **Channel / second segment** |
| Etsy/Shopify maker | Moderate: packaging and tone matter, and one seller says branding has little value without repeat buyers (https://www.reddit.com/r/Etsy/comments/148zqb8/aesthetic_packaging_on_social_media) | Location matters less | Large (5.6M Etsy sellers) | Later |
| Event planner | Moderate: work is per event, and clients bring Pinterest boards (https://www.reddit.com/r/BigBudgetBrides/comments/1phucv4/) | Yes | Fragmented | Later |
| Landlords / retail leasing | Real but enterprise-shaped | Yes | Long sales cycle | Not for a hackathon |

**Why:** (1) The founder makes every decision in our brief at once (palette, materials, music, siting, messaging), so the whole product is used. (2) It is the moment when a mistake costs most (the failure rates are in RESEARCH.md). (3) The Indore Reddit post *is* our demo prompt, so we can show judges a real person asking our exact question. (4) Designers are the professional channel because they already run this "precedent study" for each client and can turn a brief into renders, which covers our missing visuals. **Pitch it as: "the precedent study a café designer would charge for, before you sign the lease."**

## 3. Weaknesses in our claims: the critic's case and our reframes

### 3.1 "Not found in Qloo" is not "fabricated"

**The critic's case.** Our own benchmark list (`docs/BENCHMARK.md`) is full of *real* entities that came back "not found": Amul, Blue Tokai, Reliance Retail, Hachette India, Pantone, Bose, Moog, Teenage Engineering, Café de Flore, the Brooklyn Museum, PizzaExpress Jazz Club, Sarafa Night Market and Chappan Dukan. Many "artist" misses are real people of the wrong type: Arundhati Roy and Amitav Ghosh are authors, Saul Bass and Paula Scher are designers, Cindy Sherman and Henri Cartier-Bresson are photographers, and A24 and Neon are studios. Some "other city" hits are branch-matching artefacts (Cafe Coffee Day). So the 56% measures **Qloo's coverage plus type mismatches** at least as much as invention. Our own caveat already says Indore coverage is "far thinner".

**Coverage data.** Qloo publishes **no** per-country coverage figures. We found no public statement about India. The docs give only global totals: "half a billion+" entities, "2.7 million+ restaurants worldwide" and a "TasteDive ... 7.5m+ cross-domain panel". They also say Qloo "maintains proper population sampling thresholds" (`docs/processing-methodology.md`), which suggests thin regions are cut off rather than estimated. The data comes from "Fortune 500 financials anonymized transactions, JCDecaux, Michelin, Samsung, Netflix" (`docs/faqs.md`), mostly Western sources. The fair conclusion is that coverage of India is **unknown and probably thinner**. We should not claim it is good.

**Reframe and fix:**
- Rename the metric to **"picks Qloo could not verify in the requested city"** and report it in three parts: *likely invented / real but not in Qloo or wrong type / in another city*. Classifying the 64 failed baseline picks by hand takes about an hour and makes the number defensible. Even if only a few turn out to be invented, the point still holds, because a small business can only act on a reference that exists, is local, and can be checked.
- Say plainly what the trade-off is: **TasteForge gives fewer answers and can stand behind each one. A chatbot gives more answers that no one can check.** In thin cities, TasteForge shows "low confidence" rather than padding the brief. That is the honest version of the Chen et al. 2026 result already in RESEARCH.md.
- Move the Indore demo to a well-covered city (London) for the hero shot, and show Indore as the honest "thin coverage" case.

### 3.2 What the affinity score measures, and whether "fit about equal" undercuts us

Qloo's docs (`docs/interpreting-affinity-scores.md`, https://github.com/qloo/docs-public):
- In basic insights it is "the cosine similarity of their embeddings". For location it is relevance "compared to others in that region and globally". For taste analysis it is tag relevance. **The meaning changes with the query type.**
- "**Because scores are normalized per query**, compare brands based on their relative position in the results, not just the raw score."
- "A slight difference, like 91 versus 92, usually indicates similar relevance."
- It "is not based on survey data or percentages of a sample ... 95 ... not that 95% of people in a survey preferred it."

**What this means for us.** Averaging affinities across picks from two lists, then comparing 0.78 with 0.79, is outside what Qloo intends the score for. The equal result is **expected**: a strong LLM picks popular, culturally obvious items, and Qloo rates those as relevant. This does not undercut the pitch as long as we never claimed better fit, and the current DEVPOST text already says so. It **does** undercut the tagline "scored against a plain LLM by Qloo itself", which implies we win on Qloo's score.

**Reframe:** "On fit, a good LLM and Qloo agree. The difference is that half the LLM's places could not be verified in the city, and none of ours fail that check." Report ranks or "share of picks in Qloo's top-N for this audience" rather than averaged raw scores.

### 3.3 Can you really get colours and materials from taste data?

**Evidence for, from strongest to weakest:**
- **Music to colour, via emotion** (strong, but narrow): Palmer, Schloss et al. (2013, PNAS) found that faster, major-key music was matched to lighter, more saturated, yellower colours, and that the matching runs through emotion. The result was similar in the US and Mexico (https://pmc.ncbi.nlm.nih.gov/articles/PMC3670360). This supports "upbeat audience music → brighter palette". It used only 18 classical excerpts, and the authors say other cultures are untested.
- **Personality shows in rooms** (moderate): in Gosling et al. (2002, JPSP), observers judged occupants' personality from bedrooms with accuracy correlations around .37 on average, strongest for Openness ("distinctiveness ... level of decoration") (https://gosling.psy.utexas.edu/wp-content/uploads/2014/09/JPSP02-Roomwithacue.pdf). Rentfrow & Gosling (2003) tie music clusters to Openness (https://news.utexas.edu/2003/06/18/university-researchers-find-clues-to-personality-traits-in-musical-preferences). Openness is the common factor across domains, but each link is only modest.
- **Art taste and personality** (moderate, large sample): in Chamorro-Premuzic et al. (2009), with N=91,692, Openness was "the strongest and only consistent personality correlate of artistic preferences" (https://research.gold.ac.uk/id/eprint/4898). A Croatian study found music and visual-art preferences related, with only a "modest contribution of personality traits" (https://www.bib.irb.hr/773931).
- **Class homology across domains** (contested): results conflict. Veenstra (2015) finds homology in music (https://doi.org/10.1111/cars.12068). Chan & Goldthorpe find "little support for the homology" (https://voidnetwork.gr/wp-content/uploads/2016/08/Social-stratification-and-cultural-consumption-Music-in-England-by-Tak-Wing-Chan-and-John-H.-Goldthorpe-.pdf). Lemel & Coulangeon (2022) find strict homology "basically invalidated" in France (https://sciencespo.hal.science/hal-03595718). A qualitative Swiss study of home décor found it strongly class-coded (https://www.socio-journal.ch/article/download/5698/4985/10445).

**Verdict:** "Your audience's music *predicts* their ideal colour palette" is **weak** and we should not say it. TasteForge does something easier to defend: it **reads decor and ambience tags of real places this audience already likes** and turns them into colours. The inference goes place → design, about the same kind of object, not music → colour. Make that the claim, and add that the colour-naming step is the LLM's interpretation. The why-chip shows the tags it worked from.

### 3.4 Does ambience research transfer to matching the audience's taste?

- Most **congruence** research measures fit with the *venue, brand or product*, not with the audience. Examples: French or German music selling French or German wine (in RESEARCH.md); music matched to scent arousal raising satisfaction and impulse buying (Mattila & Wirtz 2001, https://pure.psu.edu/en/publications/congruency-of-scent-and-music-as-a-driver-of-in-store-evaluations/); congruent music raising pleasure, perceived service quality and intention to return (Demoulin 2011, https://ideas.repec.org/a/eee/joreco/v18y2011i1p10-18.html); and "brand-fit" playlists lifting sales 9.1% against popular hits across about 2M transactions in 16 restaurants. That last study was **vendor-run** with Soundtrack Your Brand (https://swopec.hhs.se/huiwps/abs/huiwps0121.htm, https://www.qsrmagazine.com/news/report-music-can-increase-restaurant-sales-9-percent/).
- The closest evidence for **audience** match: Caldwell & Hibbert (2002) found that diners' *liking* of the music explained time spent better than tempo did, and that time spent best predicted money spent (https://journals.sagepub.com/doi/10.1177/0305735602302007). This is a single study.

**Reframe:** "Research shows music that fits the place and that guests like changes how long they stay and what they spend. TasteForge gives you a data-backed starting point for both, and the pilot measures whether it worked." Don't claim "audience-matched music increases revenue X%". The 9.1% figure is about brand fit and came from a vendor.

### 3.5 Privacy, stereotyping and how to frame them

- Qloo is privacy-first: "No PII is transferred to Qloo", it works on "cultural entities rather than personal identities", and it is GDPR-compliant as a processor (`docs/data-foundation.md`). This is a judging point in its own right (2025 criteria mentioned the "privacy-first data approach").
- The risk is that our "age and gender skew" line pushes owners towards stereotyped design. Friedman & Toubia (Columbia; 14 experiments, n=9,399, plus Facebook tests with 513k people) found that targeting which feels discriminatory lowers willingness to engage and buy, most of all when the attribute seems irrelevant and cannot be changed (https://business.columbia.edu/press-release/cbs-press-releases/target-targeted-demographic-targeting-may-drive-consumers-away). Identity appeals can cause "categorization threat" (Kim et al., https://merit.url.edu/en/publications/calculators-for-women-when-identity-based-appeals-alienate-consum/).
- Regulators are moving the same way: Meta removed sensitive targeting options in 2022 (https://searchengineland.com/meta-will-remove-targeting-options-for-sensitive-topics-on-january-19-378095), and EU DSA Art. 26(3) bans ads based on profiling with special-category data (https://dsa-observatory.eu/?p=2231).

**Framing:** describe the audience as **"people who love X, Y and Z" (taste-first), not "women 25–34"**. Show demographics as context, collapsed by default and never as the input. TasteForge's "Find my audience" mode starts from the *product*, which is the opposite of starting from a demographic. Add one line to the page: "We describe audiences by what they love, never by who they are. No personal data is collected or sent to Qloo."

## 4. How winners present

### What the 2025 Qloo winners did

| Project (prize) | First line | Structure | Visuals | What worked |
|---|---|---|---|---|
| **GeoTaste** (Grand Prize) | "GeoTaste transforms location into business insights. Get instant market analysis ..." | Emoji headings: Inspiration / Vision / How I Built It / Learned / Challenges / Achievements (871 words) | YouTube video, map UI | Business value in the first line ("instant ... without the weeks of traditional market research"), a map, a consultant metaphor |
| **Alloy** (Hon. Mention) | "The Cultural Due Diligence Engine. De-risking multi-billion dollar deals ..." | Problem → Solution → How it works → "Our Unfair Advantage" → "Why We Win Against Deloitte & McKinsey" | **10 captioned screenshots**, video | A money-sized problem, a named incumbent, honest fallbacks ("when a Qloo query ... doesn't yield results, the agent pivots") |
| **Resonance AI** (Hon. Mention) | "AI-powered political intelligence that creates culturally authentic campaign messaging" | Standard Devpost template (1,023 words) | Video | Big, specific market; "complete campaign packages" as output |
| **Zesty** (Hon. Mention) | "The Unrecommendation Engine that flips your feed" | Standard template (508 words) | Video | One inverted, memorable idea; a named feature ("Taste Nemesis") |

Sources: https://qloo-hackathon.devpost.com/project-gallery and the four `devpost.com/software/...` pages linked above. (The project the brief called "Alloy" has the URL slug `axiom-2bn391`.)

### Other large AI hackathon winners

- **SalesShortcut**, Grand Prize, Google ADK Hackathon (10,349 registrants; https://devpost.com/software/salesshortcut): the first image is an architecture diagram. It opens with a story ("A friend of ours was working as a freelance developer ..."), then a verb-led feature list (Finds / Researches / Generates / Makes Outreach) and one scale number ("34 specialized AI agents").
- **Nutshell**, Chrome Built-in AI Challenge 2025 (14,088 registrants; https://devpost.com/software/nutshell-auftp2): **16 captioned screenshots** set out in user-flow order before any prose, a named human beneficiary ("millions with motor disabilities"), and privacy as a value ("runs securely on your own device").
- **Phonaify**, same challenge (https://devpost.com/software/phonaify): "Why X?" headings ("Why a Chrome Extension?", "Why is AI essential in this case?") that answer the judge's doubts before they arise, plus one cited statistic on user pain.

### Template for our page

1. **Tagline (≤ 20 words, outcome first):** *"Before you sign the lease: a design brief for your café's audience, where every colour, song and reference place is real and checkable."*
2. **Gallery first, 6–8 captioned images in flow order:** prompt → live agent trail → palette with tag captions → map → why-chip open → Taste Proof "56% unverifiable" → refine. The first image is the brief itself, not the architecture.
3. **One-paragraph story with a real person:** quote the Indore Reddit post (with link), then "TasteForge answers that question in 16 seconds."
4. **"Why not just ask ChatGPT?"** in Phonaify style: one chart (the 56% split three ways) and one sentence.
5. **"What's new vs. past Qloo projects":** "from audience to physical design via decor/ambience tags", in one line. This answers the GeoTaste question directly.
6. **What it does:** verb-led bullets (Finds your audience / Reads the places they love / Turns tags into a palette and materials / Maps where they are / Proves every pick).
7. **How Qloo powers it** (we already have this).
8. **Honest limits** (coverage, fit about equal, no renders). Alloy shows that admitting fallbacks reads as maturity, not weakness.
9. **Pilot plan and what's next** (from RESEARCH.md).
10. Keep total length about 900–1,300 words. The winners ran from 508 to 1,292. Ours is about 1,950, so cut "Built with" detail and the Challenges section.

**Demo flow for a judge who clicks once:** the default prompt is pre-filled, the result streams in under 20 s, and the first visible element is the palette with real place names. Add a "Show me the proof" button that opens a Taste Proof example with no wait.

## 5. Lines we can safely say

- "Every recommendation cites a Qloo result you can open. Items without a valid citation are removed by code, not by a prompt."
- "In our 20-prompt, 5-city benchmark, 56% of a plain LLM's place picks could not be verified by Qloo in the requested city. TasteForge's rate is 0% by construction, because it can only return what Qloo returned."
- "On audience fit, a strong LLM and Qloo roughly agree (0.78 vs 0.79). Our claim is verifiability, not better taste."
- "The look of the brief comes from decor and ambience tags Qloo attached to real places this audience likes in your city."
- "No personal data is collected or sent; audiences are described by what they love."
- "It replaces the 'precedent study' step of a café design brief" (supported by Studio BANAA's process).
- "Music that fits the place and that guests like is linked to longer stays and more spending" (Caldwell & Hibbert 2002; congruence studies).

## 6. Lines we should stop saying

| Stop | Why | Say instead |
|---|---|---|
| "scored against a plain LLM by Qloo itself" (tagline) | Implies we win on Qloo's score; we tie | "checked by Qloo: every pick real, local and traceable" |
| "56% fabricated" / implying "not found" = invented | Our own list includes Amul, Café de Flore, the Brooklyn Museum | "could not be verified in the city" (and publish the three-way split) |
| "palette derived from the audience's taste" | Music → colour evidence is narrow (Palmer 2013) | "palette read from decor/ambience tags of places they love" |
| "brand-fit music raises sales 9%" | Vendor study, brand fit not audience fit | "fitting, liked music is linked to longer stays" |
| "works in any city" / India-first framing | Qloo coverage in India is unpublished and visibly thin | "best in well-covered cities; thin areas are flagged, not padded" |
| "taste graph of 575M / 3.7B entities" | Qloo's own figures conflict | the hackathon's "250M+" or no number |
| Leading with "age and gender skew" | Stereotyping backlash (Friedman & Toubia) | taste-first audience description |
| "for cafés, homestays, boutiques, makers, event planners" | Five audiences reads as unfocused; judges reward "a real audience" | "for café founders before opening (and the designers who brief them)" |
| Any willingness-to-pay or time-saved figure stated as fact | Untested | mark as an estimate, or leave it out |

## 7. Gaps we could not fill

- Havenly's current pricing; an official Soundtrack rate card; current SparkToro prices from its own page.
- Any public Qloo coverage figure by country, including India.
- A study that directly tests audience-taste-matched décor (as opposed to music) against outcomes.
- Survey data on what small businesses would pay for a concept or design brief.
