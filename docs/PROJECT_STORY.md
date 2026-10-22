## Inspiration

A founder on r/IndiaCoffee was planning a coffee-only café in Indore and asked which neighbourhoods would draw young professionals, students and coffee lovers ([thread](https://www.reddit.com/r/IndiaCoffee/comments/1hmk8bt/thinking_of_opening_a_coffeeonly_cafe_in_indore)). The replies said to run a market survey, hire a consultant, or go and talk to people.

Most independent café, bar and restaurant founders are in that position before opening day. The colours, materials, music, street and first menu all get decided in a few weeks, usually on instinct. Café architects start with a *precedent study*: a look at the rooms the client's customers already love. A small founder can't pay for one, so they guess, or ask a chatbot whose answer sounds right and can't be checked.

We wanted to give that founder the precedent study, built from what their crowd actually loves, with proof behind every line. So we set one rule for the agent: **it can't recommend anything Qloo didn't return.**

## What it does

TasteForge is a cultural briefing agent. You describe your place in a sentence and name a city. TasteForge walks Qloo's taste graph and hands back a one-page creative brief:

- **The audience:** who your crowd is, described by what they love: the films, shows, artists and brands they over-index on, with age and gender skew as context.
- **The look:** a palette of named colours, lighting and materials, derived from the decor and ambience tags of real local places this audience likes, plus those places as reference rooms you can visit.
- **The sound:** a playlist of artists this crowd plays, with Spotify links.
- **Pairings:** brands for collaborations, and a menu idea built only from Qloo's cuisine and dish tags.
- **Where they are:** a map of the neighbourhoods where the audience clusters, from Qloo's heatmap.
- **Voice:** three short copy lines in the audience's language.
- **The Monday list:** the brief turned into a to-do list you can download, print or copy.

Every line carries a receipt: a "why" button that opens the exact Qloo question and what it returned. Code, not the prompt, removes anything without a valid citation, and the brief shows its **citation coverage**.

**Taste Proof** runs on every brief. It asks a plain AI the same question with no Qloo data, then Qloo checks each pick from both sides: verified, wrong type, only in another city, or not in Qloo's data.

There are two modes. **I know my audience** works when you can describe your crowd ("young professionals who like indie folk and slow living"). **Find my audience** works when you can only describe what you make ("earthy, Japanese-inspired ceramics"), and the agent works out whose taste fits it.

## A walkthrough: a record-store bar in Chicago

The screenshots come from the live site, using one of the six finished briefs on the home page.

**1. Start on the home page.** The headline says what TasteForge is. Below it are six finished briefs built by the same agent: a Chicago record-store bar, an Indore café, a New York wine bar, a Paris pop-up, a Brooklyn boutique and a London ceramics studio. Each card shows its palette and citation coverage. You can open one instantly, or brief your own project.

![Home page](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/01-home.png)

**2. The brief cover.** The Chicago brief opens with its title, the palette drawn as bands, and a stamp showing that 97% of its lines cite a Qloo record. A menu across the top jumps between Audience, Look, Sound, Pairings, Where, Voice, Taste Proof and the Monday list. Picks ranked with Chicago's location signal carry a small "Popular with Chicago listeners" chip.

![Brief cover](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/02-brief-cover.png)

**3. The look.** The palette isn't invented. Code reads the tags Qloo attached to real Chicago places this crowd likes, maps them to colour families with a published table, and picks neutrals plus an accent. The model only names each colour, and every swatch is captioned with the tags behind it. Lighting and materials follow, then reference places: real local rooms with addresses, so a founder can go and stand in them.

![The look](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/03-the-look.png)

**4. Every line has a receipt.** Click "why" on any item and a drawer opens. It shows the Qloo question in plain words ("Places in Chicago liked by people who like…"), what Qloo returned, and one sentence on why this pick follows from it. The raw query is one click further down for anyone who wants to reproduce it.

![Evidence drawer](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/04-evidence-drawer.png)

**5. Taste Proof.** The same question went to a plain AI with no Qloo data. Qloo couldn't verify 3 of its 16 picks in Chicago; every TasteForge pick checked out. The panel leads with a one-sentence verdict, then shows each side as dot rows anyone can read. "Couldn't verify" covers names Qloo doesn't have, names of the wrong type, and places that exist only in another city. We never call them invented.

![Taste Proof](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/05-taste-proof.png)

**6. The Monday list.** The brief becomes things to do this week:
- a playlist
- the palette as a downloadable PNG
- three places to visit
- a menu idea and a brand collaboration
- three copy lines
- the neighbourhoods to hand out flyers in

A founder can print it and start.

![Monday list](https://raw.githubusercontent.com/Kunsh162007/tasteforge/main/docs/media/06-monday-list.png)

From any brief you can also:

- **Refine.** Mark items 👍, 👎 or 🔒 and press Refine. Only the affected sections are asked again. A disliked item is sent to Qloo as an exclusion, so it can't come back, locked items stay word for word, and a "What changed" note lists the differences.
- **Compare cities.** Run the same audience in a second city and see what's only in one, only in the other, and shared by both.
- **Share.** Copy a link that opens the brief read-only, with a "verified" banner, because the evidence is signed by the server.

When you brief your own project, you watch the agent work live. Each Qloo question appears as it's asked, with what came back, until the brief opens.

## Why not just ask a chatbot?

We tested this with 20 prompts in 5 cities (Indore, London, Brooklyn, Chicago and Paris) against live Qloo data:

- Qloo **couldn't verify 30% of a plain LLM's 276 picks** in the requested city, including 26% of its places.
- TasteForge's unverified rate was **0% of 312 picks**, because it can only return what Qloo returned.

We sorted the 84 misses with AI assistance. This is a judgement from general knowledge, not a per-name check:

| What the unverified picks were | Picks |
| --- | --- |
| Likely invented | 10 |
| Real, but not in Qloo or listed under another type | 54 |
| A place of that name exists only in another city | 15 |
| Not classified | 5 |

Most of the misses are real names, so the point isn't that chatbots invent things. **A founder can only act on a reference that's real, local and checkable**, and a chatbot doesn't tell you which of its picks pass that test. On audience fit, a strong LLM and Qloo roughly agree. We claim verifiability, not better taste.

## How Qloo powers it

Qloo chooses every artist, place, brand, hotspot and style tag. The language model writes the names, captions and copy around them.

- `/search` resolves the names you mention (asking "which did you mean?" when a name is ambiguous) and verifies the plain AI's picks across every entity type.
- `/v2/tags` turns phrases like "slow living" into taste signals, which is what makes "Find my audience" work from a description alone.
- `/v2/insights` for artists, films, TV and brands uses `signal.location.query`, so taste is weighted toward people in that city.
- `/v2/insights` for places uses `filter.location.query` to find local places this audience likes.
- `/v2/insights` with `urn:tag` on those places returns decor and ambience tags for the look, and cuisine and dish tags for the menu, ranked by lift over the city's ordinary places.
- `urn:demographics` gives age and gender skew, as context only.
- `urn:heatmap` shows where the audience clusters, named from Qloo place addresses and map data.
- `/v2/trending` shows whether the top artists are rising.
- `filter.results.entities` lets Qloo score a shortlist we supply, so Qloo, not us, referees Taste Proof.
- `filter.exclude.entities` and `filter.exclude.tags` make refining real: a disliked item is excluded in Qloo, not just hidden on screen.

## How we built it

TasteForge is a Next.js and TypeScript app. The agent's work streams to the browser over Server-Sent Events. The pipeline is a hybrid: code runs the predictable steps, and the model is used only where judgement is needed.

1. **Seeds:** a fast LLM call pulls out the names, phrases and city from your description.
2. **Resolve:** Qloo search and tag lookups run in parallel, and the agent asks when a name is ambiguous.
3. **Graph walk:** parallel Qloo queries for each section of the brief, all recorded in an **evidence ledger**.
4. **Critic:** checks coverage per section and may request follow-up queries from a fixed menu, such as widening the search or switching to tag signals.
5. **Synthesis:** writes the brief in JSON mode, from ledger evidence only.
6. **Validator:** plain code that removes any item without a valid citation and computes citation coverage.
7. **Taste Proof:** scores the plain AI's answer and TasteForge's with Qloo.

That's 3 to 5 LLM calls per brief, down from 10 to 15 when the model chose every step. The palette is computed in code from the brief's own tags, so different audiences get visibly different looks. Model calls go through a cascade of fast models with automatic fallback. Shared links are signed with HMAC. The test suite (over 700 unit tests plus browser end-to-end tests) asserts the exact Qloo parameter strings, because Qloo silently ignores parameters it doesn't recognise.

## Challenges we ran into

- **Being fair to the chatbot.** Our first matcher marked real venues like The Green Mill and Café de Flore as "not found". It now searches every entity type, tolerates accents, articles and suffixes, checks the city, and labels results as "couldn't verify" rather than "invented".
- **Local taste.** An indie café crowd in Indore first got American rock radio. Adding Qloo's location signal to audience queries brought in local acts.
- **Keeping the model honest.** Telling a model not to make things up isn't enough. Grounding works as a data structure: every item carries evidence ids, and a validator checks them against the ledger.
- **Thin and unstable results.** Some briefs came back nearly empty, and repeat runs shared only about 17% of their picks. We fixed the root cause (one malformed seed rejected a whole plan), added minimum content per section with automatic widening, and made the pipeline deterministic. Repeat runs now share about 80% of their picks (3 prompts, 2 runs each; indicative).
- **Speed.** Briefs once took over a minute. Parallel queries, backup requests for slow calls, caching, and a deadline that writes an honest partial brief instead of failing brought the median time to a brief down to about 16 seconds.
- **The map.** Qloo returns hotspots as unnamed grid cells. Naming them reliably, from Qloo place addresses first and map data second, without ever hiding valid hotspots, took several passes.

## Accomplishments that we're proud of

- A recommendation can't reach the screen without a citation to a real Qloo result, and anyone can open that result.
- Taste Proof turns "trust me" into a check that Qloo referees.
- The design comes from real rooms: the palette and materials trace back to tags on places this audience loves.
- The Monday list turns cultural data into something a founder can act on the same week.

## What we learned

Grounding belongs in the data structure, not the prompt. Letting code run the predictable steps made the agent faster, cheaper and testable, and kept the model for the parts that need judgement. Qloo adds the most where a language model has nothing reliable to say: which local rooms a crowd loves, what those rooms look like, and where that crowd gathers. Coverage still varies by city: Indore is thinner than Chicago or London, so thin sections are labelled low-confidence rather than padded.

## What's next

- **Taste Proof as a verification layer for AI assistants:** an API that checks any assistant's local recommendations against Qloo before someone acts on them.
- **The designer channel:** interior and hospitality designers already run a precedent study for each client, and a TasteForge brief is a ready-made one they can turn into renders.
- **A 30-day pilot with 10 cafés:** each café makes one ambience or menu change from its brief, and we measure dwell time and repeat visits against its own baseline, publishing every result.
