# TasteForge: 3-minute walkthrough

For a judge on the live site: [LIVE_URL]. Every step says what to do and what to notice.

Before you start: if the page shows "busy, retrying" at any point, wait a few seconds; the server is pacing a free-tier LLM. If a live brief is slow, step 7 (showcase briefs) is the instant fallback.

## 0:00 to 0:20 - The question

TasteForge makes a cultural brief for a small business or creator. The test it is built around: would the brief be the same without Qloo? Watch for the places where it could not be.

## 0:20 to 1:10 - Build a brief (about 40 s of streaming)

1. Choose **I know my audience**.
2. Click the example **A couple, A24, Radiohead, pho**, or paste:
   > A couple who love A24 films, Radiohead and Vietnamese food.
3. City: **Brooklyn** (the example fills it). Click **Build the brief**.

Notice:

- The graph-walk trail fills in live: seeds, resolve, walk, critic, synthesis, proof. Each line is a real Qloo call with its result.
- If a name is ambiguous the agent stops and asks "which did you mean?" instead of guessing. Answer it and it continues.
- A grounding percentage appears with the brief. It is computed by code from how many items cite real evidence.

## 1:10 to 1:50 - Why-chips: nothing is unsourced

1. In **The sound** click a **Why** button next to an artist.
2. The drawer shows the Qloo call behind it: endpoint (`/v2/insights`), parameters, returned entities with affinity scores.
3. In **The look**, open the Why on a palette swatch. The colour comes from decor and ambience tags that Qloo attached to places the audience likes; the LLM only maps tag to hex.
4. In **Where they are**, find the neighbourhood list and the map. These are heatmap results for the audience in the chosen city.

Notice: if a section had thin data it carries a lower confidence label rather than filler. Anything the model cited wrongly is removed and listed in the "dropped" note.

## 1:50 to 2:20 - Taste Proof

Scroll to **Taste proof**.

- Lead with the three checks, in this order: picks Qloo could not find (a plain LLM names places and artists that do not exist in Qloo; TasteForge's are all Qloo results), real places in the city (TasteForge's places were located by Qloo with addresses), and only then audience fit.
- Click a `trace` button on a TasteForge pick: it opens the Qloo call behind it.
- Be straight about the fit gap: 0.86 vs 0.93 on average over three live runs on 2026-10-20 (Indore, London, New York). The claim is "every pick verified and traceable, never lower-fit, and catches non-existent local picks", not "10x better".

Notice the caption: affinity is fit with this audience's taste signals. It is Qloo's number, not ours.

## 2:20 to 2:40 - Refine

1. In **The sound**, click **Dislike** on the first artist and **Like** on another.
2. Click **Refine brief**.

Notice: only the sections you touched re-run; the disliked artist is excluded from the new Qloo query (not just hidden); liked items stay and become extra signals; a "What changed" note lists additions and removals; Taste Proof re-scores. **Lock** keeps an item exactly as it is.

## 2:40 to 3:00 - Two cities and sharing

1. Run the same prompt for a second city and open the two-city comparison to see how the same audience's look and hotspots differ. It reuses the first run's seeds and has no Taste Proof, so it is quick.
2. Click the share control and open the `/b#...` link in a private window: the same brief loads, with a "Shared link, verified" banner showing the evidence is what the server issued. (If the server restarted without `LEDGER_SECRET` set, old links show "unverified".)
3. Optional: **Print or save as PDF** for a client-ready copy.

## If you only have 60 seconds

Open **See showcase briefs**, open the Indore cafe brief, click one Why-chip, scroll to Taste proof. Showcase briefs are pre-generated on the server, so they open instantly.

## Other prompts that work well

- **Find my audience**: "I am a ceramic artist making handmade, Japanese-inspired tableware. Find the audience that would love it and where to reach them." City: London.
- **I know my audience**: "I am opening a cafe in Indore for young professionals who love indie music and slow living." City: Indore.

## What to take away

1. Every item in the brief links to a real Qloo result.
2. A grounding score computed by code, with failures shown.
3. A comparison against a plain LLM, scored by Qloo.
4. Feedback goes back to Qloo as filters, not back to the LLM as vibes.
