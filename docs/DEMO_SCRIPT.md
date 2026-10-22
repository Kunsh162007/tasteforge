# TasteForge: 3-minute judge walkthrough

For a judge on the live site: https://tasteforge-fa98.onrender.com. Start with the showcase briefs. They are pre-built on the server, so they open instantly and nothing has to run live. Each step says what to do and what to notice.

If the first load takes about 30 seconds, that is the free Render instance waking up. If the showcase cards still say they are being built, wait a minute or click **Try the showcase again**.

## 0:00 to 0:20: the home page

Read the headline, **"A brief for your café, with receipts."** The card beside it is a real brief (Chicago), not a mock-up.

Notice: it is made for independent café, bar and restaurant founders before opening day. The whole pitch is that every line comes with a receipt.

## 0:20 to 1:00: open the Chicago brief

1. Click **Open a finished brief**, then open **A record-store bar in Chicago**.
2. The cover shows the prompt, the city, a citation coverage badge (the share of items that cite a real Qloo record, computed by code) and the model that wrote the prose.
3. Scroll to **The look**. Each palette swatch is captioned with the Qloo tags it came from, and **Places that set the tone** lists the real Chicago places those tags were read from.

Notice: the look of the room comes from what real local places this audience likes actually look like, not from the model's imagination.

## 1:00 to 1:30: open a receipt

1. In **The sound**, click a **Why** button next to an artist.
2. The evidence drawer shows the Qloo question behind that pick, the entities and scores it returned, and the raw query. "Local" means the Qloo query was weighted toward people in Chicago: these are artists Chicago listeners over-index on, not necessarily Chicago artists.
3. Close it with Escape.

Notice: every item has one of these. Anything the model cited wrongly is removed and listed in a "dropped" note rather than shown.

## 1:30 to 2:15: Taste Proof

Use the section links at the top of the brief to jump to **Taste proof**.

- The proof asks a plain LLM, which has no Qloo data, the same question. Then it looks up each of its picks in Qloo, across every entity type, in the requested city.
- Each plain pick is labelled **verified**, **wrong type in Qloo**, **in Qloo, but in another city**, or **not in Qloo's data**. None of these labels says "invented": Qloo's catalogue is not the whole world.
- Click **trace** on a TasteForge pick to open the evidence behind it.
- Be straight about fit: the affinity row is only a sanity check, and the two lists fit the audience about equally. The claim is verifiability. In our 20-prompt benchmark, Qloo couldn't verify 30% of a plain LLM's picks. Of the 84 misses, 10 looked invented, 54 were real but not in Qloo or filed under another type, and 15 were in another city (`docs/BENCHMARK.md`).

## 2:15 to 2:45: the Monday list

Jump to **Monday list**.

Notice: it has six actions taken from the brief. Press play on a playlist, paint with the palette (there is a PNG download), visit three rooms, put a menu idea or brand collab on the board (menu wording only from Qloo's tags), say it three ways, and hand out flyers in the listed neighbourhoods. **Download the list**, **Print this page** and **Copy as text** all work offline.

## 2:45 to 3:00: a second city, or your own

- Go back and open **A cafe for young professionals in Indore**. It shows the honest case: Qloo's coverage is thinner there, so sections carry lower confidence labels instead of padding.
- Optional, live (20 to 60 s): scroll to **Brief your own project**, pick **I know my audience** or **Find my audience**, and build one. You will watch every Qloo question in the trail as it is asked. If a name is ambiguous, the agent stops and asks "which did you mean?".

## If you only have 60 seconds

Open the Chicago showcase. Click one **Why** button, then jump to **Taste proof** and **Monday list**.

## Also worth trying

- **Refine:** dislike an artist and like another, then click **Refine brief**. Only the touched sections re-run, and the disliked artist is excluded in the Qloo query itself.
- **Share:** a shared `/b#...` link opens with a "Shared link, verified" banner. An edited link shows as unverified.
- **Compare:** run the same audience in a second city to see how the look and hotspots change.

## What to take away

1. Every recommendation cites a Qloo result you can open, and code removes anything that doesn't.
2. The look of the room comes from the decor and ambience tags of real local places this audience loves.
3. Taste Proof checks a plain AI answer against Qloo, and Qloo is the referee, not us.
4. The output is a Monday list of actions, not just a page to read.
