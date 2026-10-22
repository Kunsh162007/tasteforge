# TasteForge: 2:30 video script

Showcase briefs only, so nothing has to run live and nothing can stall on camera. Before recording, run `npm run warm -- --url=https://tasteforge-fa98.onrender.com` and confirm all six showcases are ready. Then open the Chicago and Indore briefs once, so they are cached in the browser.

The voiceover runs to about 330 words, roughly 140 words a minute with pauses. Read it slowly.

| # | Time | On screen (action) | Voiceover |
|---|---|---|---|
| 1 | 0:00–0:12 | **Hook.** A plain chat window (any LLM, or the Taste Proof baseline column) answering "Which places in Chicago should inspire my record-store bar?" Highlight two or three names with a yellow box. | "Ask an AI to design your café and you get a confident list of places. Which of them are real? Which are in your city? You can't tell." |
| 2 | 0:12–0:30 | **The founder.** The r/IndiaCoffee post, blurred except the title (or a paraphrase on a title card). Cut to the TasteForge home page: "A brief for your café, with receipts." | "A founder planning a coffee café in Indore asked Reddit where to open and who to design it for. The answer was: run a survey, hire a consultant. Café designers call this the precedent study, and small founders can't afford one. So we built TasteForge." |
| 3 | 0:30–0:42 | Scroll slowly past the hero card to the showcase cards. Click **A record-store bar in Chicago**. | "Describe your place in a sentence and name the city. TasteForge asks Qloo's taste graph who your crowd is, what they play, how the rooms they love look, and where they gather." |
| 4 | 0:42–1:05 | **The brief.** The cover, with the palette visible. Hover over a swatch caption, then scroll to **Places that set the tone**. | "This palette isn't the model's taste. It's read from the tags Qloo attached to real Chicago places this crowd already loves. Every swatch says which tags it came from." |
| 5 | 1:05–1:22 | In **The sound**, click a **Why** button. The evidence drawer opens. Hold for 2 seconds on the entities and scores. Close it. | "Every line has a receipt. Click why, and you see the exact Qloo question and what it returned. If the model cites something Qloo didn't return, code removes it. A prompt isn't trusted to do that." |
| 6 | 1:22–1:50 | **Taste Proof.** Jump to **Taste proof** with the section link. Pan across the plain-LLM picks and their labels (verified, wrong type, other city, not in Qloo's data). Click **trace** on one TasteForge pick. | "Taste Proof asks a plain AI the same question, then checks every answer against Qloo. Across twenty prompts in five cities, Qloo couldn't verify thirty percent of the plain picks. Most were real names, just not local or not the right kind of thing. We don't say the AI invented them. We say you can't act on what you can't check." |
| 7 | 1:50–2:08 | **Monday list.** Jump to **Monday list**. Click **Download the palette as a PNG**, then show **Download the list**. | "Then it tells you what to do on Monday. Press play on this playlist, paint with this palette, visit these three rooms, put a new idea on the board, and hand out flyers in these neighbourhoods." |
| 8 | 2:08–2:22 | **How Qloo powers it.** A title card listing the endpoints: search, tags, insights (artists, places, decor and ambience tags, demographics, heatmap), trending, results filter, exclude filters. Or show the agent trail from a showcase. | "Qloo chooses every artist, place, brand and style tag. Its heatmap finds the neighbourhoods, and its own scoring is the referee in Taste Proof. Without Qloo, there's nothing to write the brief from." |
| 9 | 2:22–2:30 | **Close.** Back to the home hero, with the URL on screen: tasteforge-fa98.onrender.com. | "TasteForge. A brief for your café, with receipts." |

## Shots to avoid

- Starting a live brief. It takes 20 to 60 seconds and uses free LLM quota.
- Lingering on the Indore brief as the hero. Coverage there is thin. If you show it, call it the honest case ("Qloo flags thin coverage instead of padding").
- Saying "fabricated", "fake" or "better taste". Say "couldn't be verified" and "real, local and checkable".

## Recording on Windows

- **Xbox Game Bar** (built in): press `Win + Alt + R` to start and stop recording the active window. Files go to `Videos\Captures`. It records one app window, not the desktop, so keep the browser focused. Turn on "Record audio" in Settings > Gaming > Captures.
- **OBS Studio** (free, more control): add a **Window Capture** source for the browser. Set Settings > Video to a base and output resolution of 1920x1080 at 30 fps, and set Output > Recording format to MP4, quality "High". Record the voiceover on a separate track, or afterwards.
- **Browser:** maximise the window at 1920x1080. Set the zoom to 110–125% (`Ctrl` and `+`) so text reads on a phone. Hide the bookmarks bar (`Ctrl + Shift + B`) and use a clean profile with no extensions. Turn on Do Not Disturb to stop notifications.
- **Cursor:** move it slowly and pause on each thing you name. Highlight a click with a zoom or a circle in the editor (Clipchamp, which comes with Windows 11, does both).
- **Audio:** use a headset microphone in a quiet room, and record the voiceover after the screen capture so you can match the timing. Clipchamp can add captions automatically, so turn them on: many judges watch muted.
- **Export** at 1080p MP4, upload to YouTube as unlisted or public, and paste the link into Devpost.
