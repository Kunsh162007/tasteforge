# TasteForge: Devpost submission text

Live demo: https://tasteforge-fa98.onrender.com | Repo (MIT): https://github.com/Kunsh162007/tasteforge

---

**Tagline (copy-paste, 137 characters):**

> Before you sign the lease: a design brief for your café's crowd, where every song, colour and place is a real Qloo result you can check.

**Elevator pitch (copy-paste, about 60 words):**

> Ask a chatbot to design your café and you get a confident answer you can't check. TasteForge asks Qloo instead: who your crowd is, what they play, how the rooms they love look and where they gather. You get a one-page brief and a Monday to-do list. Every line links to the Qloo record behind it, and Taste Proof checks a plain AI answer against Qloo.

---

## Inspiration

A founder on r/IndiaCoffee was planning a coffee-only café in Indore and asked which neighbourhoods would draw young professionals, students and coffee lovers ([thread](https://www.reddit.com/r/IndiaCoffee/comments/1hmk8bt/thinking_of_opening_a_coffeeonly_cafe_in_indore)). The replies said to run a market survey, hire a consultant, or go and talk to people.

Most independent café founders are in that position before opening. The colours, materials, music, street and first menu all get decided in a few weeks. Café architects start with a "precedent study" of rooms the client's customers already love. A small founder can't pay for one, so they guess, or ask a chatbot whose answer sounds right and can't be checked.

So we set one rule: **the agent can't recommend anything Qloo didn't return**.

## What it does

TasteForge gives a café founder (or the interior designer working for them) that precedent study before the lease is signed:

- **It finds your crowd and reads the rooms they love.** Describe the place in a sentence and name a city. TasteForge asks Qloo who loves it, what they listen to, which local places they like, and where in the city they cluster.
- **It designs from real places.** The palette, lighting and materials come from the tags Qloo attached to real local places this audience likes, decor and ambience first, then genre and cuisine. Code maps tags to colours with a published table, the model names each colour, and every swatch is captioned with its tags.
- **It hands you a Monday list.** A playlist, a palette PNG, three rooms to visit, a menu idea built only from Qloo's tags (or a brand collab), three copy lines and the neighbourhoods for flyers. You can download, print or copy it.

Every recommendation cites a Qloo result you can open. Code, not the prompt, removes any item without a valid citation. Audiences are described by what they love, never by who they are. No personal data is collected or sent to Qloo.

## Walk through it (no video needed)

The gallery images follow this path, and the live site has the same briefs ready to open with no waiting.

1. **Start on the home page (image 1).** The headline says what it is: a brief for your café, with receipts. Below it are six finished briefs built by the same agent: a Chicago record-store bar, an Indore café, a New York wine bar, a Paris pop-up, a Brooklyn boutique and a London ceramics studio. Each card shows its palette and its citation coverage. Open the Chicago one.
2. **The brief cover (image 2).** A title, the palette drawn as bands, and a stamp showing what share of the brief cites a Qloo record. A menu across the top jumps between sections: Audience, Look, Sound, Pairings, Where, Voice, Taste Proof and Monday list.
3. **The audience.** Who this crowd is, described by what they love: films, shows and taste signals Qloo says they over-index on. Age and gender skew appear only as context. Picks ranked with the city's location signal carry a small "Popular with Chicago listeners" chip.
4. **The look (image 3).** Four or five colours with real names. They weren't invented: code derives them from the tags Qloo attached to real Chicago places this audience likes (decor and ambience first, then genre and cuisine), and each swatch is captioned with the tags behind it. Lighting and materials follow, then **reference places**: real local rooms with addresses, so the founder can go and stand in them.
5. **The sound.** A playlist card of artists this crowd plays, each with an "Open in Spotify" link.
6. **Pairings, where they are, and voice.** Brands this audience over-indexes on (collaboration ideas), a menu idea built only from Qloo's cuisine and dish tags, a map of the neighbourhoods where the crowd clusters (from Qloo's heatmap), and three short lines of copy in their language.
7. **Open any "why" (image 4).** Every line has a "why" button. It opens the exact Qloo question in plain words (for example, "Places in Chicago liked by people who like…"), what Qloo returned, and one sentence on why this pick follows. The raw query is one click further down for engineers.
8. **Taste Proof (image 5).** The same question went to a plain AI with no Qloo data, and Qloo checked every pick on both sides. The panel leads with a one-sentence verdict, then shows which picks Qloo could verify in the city and which it couldn't, as dot rows anyone can read. "Couldn't verify" covers names Qloo doesn't have, names of the wrong type, and places that exist only in another city. We never call them invented.
9. **Change it.** Each item has 👍, 👎 and 🔒. Dislike an artist and press **Refine**: only the affected section is asked again, the disliked item is sent to Qloo as an exclusion so it can't come back, locked items stay word for word, and a "What changed" note lists the difference. **Compare with another city** runs the same audience in, say, London and shows what's only in A, what's only in B, and what both share.
10. **The Monday list (image 6).** The brief becomes a to-do list: the playlist, the palette as a downloadable PNG, three places to visit, a menu idea and a brand collab, three copy lines, and the neighbourhoods to hand out flyers in. It can be downloaded, printed or copied. **Copy share link** gives a link that opens the same brief read-only, with a "verified" banner because the evidence is signed by the server.

**Try your own (about a minute):** on the home page choose "Brief your own project", describe the place in a sentence (for example, "a slow-coffee bar for young professionals who like indie folk"), pick a city, and start it. You watch the agent work live: each Qloo question appears as it's asked, with what came back, until the brief opens. If many people are using it at once, a "high demand" note says how long the wait is.

## Why not just ask ChatGPT?

We tested it with 20 prompts in 5 cities (Indore, London, Brooklyn, Chicago, Paris), checked against live Qloo. Qloo **couldn't verify 30% of a plain LLM's 276 picks** in the requested city (26% of its places). We sorted the 84 misses with AI assistance (a judgement from general knowledge, not a per-name check):

| What the unverified picks were | Picks |
| --- | --- |
| Likely invented (no evidence the name exists) | 10 |
| Real, but not in Qloo or listed under another type (authors named as artists, a chain filed as a place) | 54 |
| A place of that name exists only in another city | 15 |
| Not classified | 5 |

Most of the misses are real names, so we don't claim the chatbot invents things. The point is that **a founder can only act on a reference that is real, local and checkable**, and a chatbot doesn't tell you which of its picks pass that test. TasteForge's unverified rate is 0% of 312 picks. That comes from how it's built, not from a smarter model: it can only return what Qloo returned. On audience fit, a strong LLM and Qloo roughly agree. We claim verifiability, not better taste. Method and caveats: `docs/BENCHMARK.md`.

**Taste Proof** runs this check on every brief: it asks a plain LLM the same question, then labels each pick verified, wrong type, other city, or not in Qloo's data. When the plain answer comes out clean, the panel says so.

**What's new compared with past Qloo winners:** earlier entries turned location data into market reports. TasteForge goes from audience taste to physical design, through the tags of real local places, and every pick comes with a receipt.

## How Qloo powers it

Qloo chooses every artist, place, brand, hotspot and style tag. The model writes the names, captions and copy around them.

- `/search`: resolves the names you mention (asking "which did you mean?" when ambiguous) and verifies the baseline's picks.
- `/v2/tags`: turns phrases like "slow living" into signals, so "Find my audience" works from a description.
- `/v2/insights` (artist, film, TV, brand) with `signal.location.query`: taste weighted toward people in that city (marked "local").
- `/v2/insights` (place) with `filter.location.query`: local places this audience likes.
- `/v2/insights` (`urn:tag`) on those places: decor and ambience tags for the look, cuisine tags for the menu, ranked by lift over the city's ordinary places.
- `urn:demographics`: age and gender skew, as context only.
- `urn:heatmap`: the neighbourhoods where the audience clusters.
- `/v2/trending`: whether the top artists are rising.
- `filter.results.entities`: Qloo scores a shortlist we supply, so we don't grade ourselves.
- `filter.exclude.entities` / `.tags`: refining excludes a disliked item in Qloo, not just on screen.

## How we built it

Next.js and TypeScript, streamed over Server-Sent Events so you watch every Qloo question as it's asked. A fast LLM extracts seeds, Qloo resolves them, a parallel graph walk covers each section, a critic may request follow-ups from a fixed menu, synthesis writes only from an evidence ledger, and a pure validator drops uncited items and computes **citation coverage**. That's 3 to 5 LLM calls per brief (our first tool-calling version needed 10 to 15), and the median time to a brief was about 16 s over five live runs. Shared links are HMAC-signed. Tests assert the exact Qloo parameter strings, because Qloo silently ignores unknown ones.

## Challenges and accomplishments

- **Being fair to the chatbot.** Our first matcher called real places "not found". It now searches every entity type, tolerates accents and suffixes, checks the city, and we sort the misses into categories, labelling that sorting as a judgement.
- **Local taste.** An indie crowd in Indore first got US rock radio. Adding `signal.location.query` brought in local acts.
- **Repeatable briefs.** Pick overlap between repeat runs rose from 17% to about 80% (3 prompts, 2 runs each; indicative).
- In Taste Proof, Qloo is the referee, not us.

## Honest limits

- **Coverage varies.** Indore is visibly thinner than Chicago or London. Thin sections are labelled low confidence, not padded.
- **No renders.** Swatches, tags and reference places, not pictures of the room; the designer channel fills that gap.
- **The prose is the model's.** Citation coverage checks that each citation exists, not that every caption is true.
- **A small benchmark:** one baseline model, one day, 20 prompts. No café has opened from a brief yet.

## What we learned

Grounding works as a data structure (ids plus a validator), not as an instruction in a prompt. Qloo adds the most where an LLM has nothing reliable to say: which local rooms a crowd loves, and what those rooms look like.

## What's next

- **Taste Proof as a verification layer for AI assistants:** an API that checks any assistant's local recommendations against Qloo before someone acts on them.
- **The designer channel:** interior and hospitality designers already run a precedent study for each client, and they can turn a brief into renders.
- **A 30-day pilot with 10 cafés.** In week 1, each café makes one ambience or menu change from its brief. We then measure dwell time and repeat visits against the café's own baseline and publish every result, failures included.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS, Zod, Leaflet and OpenStreetMap, Server-Sent Events, Vitest, Testing Library, Playwright, the Qloo Taste AI API (`/search`, `/v2/tags`, `/v2/insights`, `/v2/trending`), Groq and Google Gemini free-tier model cascades, Docker, Render.
