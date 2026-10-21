"use client";

import { useMemo } from "react";
import type { ShowcasePhase } from "@/hooks/useShowcase";
import type { BriefRequestBody } from "@/ui/contract";
import { sampleBrief } from "@/ui/fixtures/sampleBrief";
import type { ShowcaseItem } from "@/ui/showcase";
import { Compose } from "./Compose";
import { ShowcaseGallery } from "./ShowcaseGallery";
import { Specimen } from "./Specimen";

type Props = {
  showcasePhase: ShowcasePhase;
  showcaseItems: readonly ShowcaseItem[];
  onOpenShowcase: (item: ShowcaseItem) => void;
  onRetryShowcase: () => void;
  onSubmit: (body: BriefRequestBody) => void;
};

const HERO_SHOWCASE = "record-bar-chicago";

const STEPS: readonly { title: string; text: string }[] = [
  { title: "Describe it", text: "A sentence or two about the café, bar or restaurant you are opening, and its city. Makers can describe what they sell." },
  {
    title: "Watch the graph walk",
    text: "TasteForge asks Qloo who loves it, what they listen to, how their spaces look and where they gather. You see each question as it is asked.",
  },
  {
    title: "Keep a brief you can check",
    text: "Every line has a why button that opens the Qloo record behind it. Taste Proof then checks a plain AI answer to the same question against Qloo, so you can see what could not be verified.",
  },
];

/** First screen: what it is, who it is for, a real brief to look at, and finished briefs to open in one click. */
export function Home({ showcasePhase, showcaseItems, onOpenShowcase, onRetryShowcase, onSubmit }: Props) {
  // The Chicago record-store bar is the strongest brief (real, local places and artists); any ready brief is the fallback.
  const featured = useMemo(() => showcaseItems.find((i) => i.status === "ready" && i.brief && i.id === HERO_SHOWCASE) ?? showcaseItems.find((i) => i.status === "ready" && i.brief), [showcaseItems]);
  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero__copy">
          <h1 id="hero-h" className="hero__title">
            A brief for your café, with receipts.
          </h1>
          <p className="hero__lede">
            Opening a café, bar or restaurant? Describe it in a sentence. TasteForge asks Qloo&rsquo;s taste graph who your crowd is, what they play,
            how their favourite rooms look and where they gather, then hands back a one-page brief. Every line has a receipt: the Qloo record behind
            it, one click away.
          </p>
          <p className="hero__for">Made for independent café, bar and restaurant founders before opening day. Makers and small studios get the same brief.</p>
          <div className="hero__actions">
            <a className="btn-primary" href="#showcase">
              Open a finished brief
            </a>
            <a className="link-quiet" href="#compose">
              Brief your own project
            </a>
          </div>
        </div>
        <Specimen brief={featured?.brief ?? sampleBrief} city={featured?.brief ? featured.city : "Brooklyn"} real={Boolean(featured?.brief)} />
      </section>

      <ShowcaseGallery phase={showcasePhase} items={showcaseItems} onOpen={onOpenShowcase} onRetry={onRetryShowcase} />

      <section className="how" aria-labelledby="how-h">
        <h2 id="how-h" className="section-title">
          How a brief gets made
        </h2>
        <ol className="how__steps">
          {STEPS.map((s) => (
            <li key={s.title} className="how__step">
              <h3 className="how__title">{s.title}</h3>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div id="compose" className="home__compose">
        <Compose busy={false} onSubmit={onSubmit} />
      </div>
    </div>
  );
}
