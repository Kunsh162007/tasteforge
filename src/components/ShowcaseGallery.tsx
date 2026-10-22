"use client";

import { useEffect, useState } from "react";
import type { ShowcasePhase } from "@/hooks/useShowcase";
import { retryInSeconds, type ShowcaseItem } from "@/ui/showcase";

type Props = {
  phase: ShowcasePhase;
  items: readonly ShowcaseItem[];
  onOpen: (item: ShowcaseItem) => void;
  onRetry: () => void;
};

const LABEL: Record<ShowcaseItem["status"], string> = {
  ready: "Ready now",
  generating: "Being built",
  queued: "Queued",
  failed: "Could not be built",
};

const MODE_LABEL: Record<ShowcaseItem["mode"], string> = {
  know_audience: "Known audience",
  find_audience: "Audience found for you",
};

const SKELETONS = [0, 1, 2, 3, 4, 5];

/** Ticks once a second while a retry countdown is showing. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const LEDE: Record<ShowcasePhase, string> = {
  closed: "Checking the studio shelf...",
  loading: "Checking the studio shelf...",
  polling: "Some briefs are still being built in the background. Open one as soon as it is ready.",
  settled: "Each of these was built by the same agent you are about to use. Open one to see the evidence behind every line.",
  timeout: "Some briefs are taking longer than expected. Open what is ready, or check again.",
  unavailable: "The showcase is not reachable right now. You can still build your own brief below.",
};

function FailedNote({ item }: { item: ShowcaseItem }) {
  // Only mounted for failed cards, which never exist during the server prerender.
  const now = useNow(item.nextRetryAt !== undefined);
  const wait = retryInSeconds(item, now);
  return (
    <p className="muted showcase__fail">
      {item.error ?? "Try again in a minute."}{" "}
      {item.nextRetryAt === undefined ? null : wait > 0 ? `Retrying automatically in ${wait}s.` : "Retrying now."}
    </p>
  );
}

function Bands({ item }: { item: ShowcaseItem }) {
  const palette = item.brief?.aesthetic.palette ?? [];
  if (palette.length === 0) return <span className="showcase__bands showcase__bands--empty" aria-hidden="true" />;
  const shown = palette.slice(0, 6);
  return (
    <>
      <span className="showcase__bands" aria-hidden="true">
        {shown.map((s) => (
          <span key={`${s.hex}-${s.label}`} style={{ background: s.hex }} title={s.label} />
        ))}
      </span>
      <p className="showcase__colours">{shown.slice(0, 3).map((s) => s.label).join(", ")}</p>
    </>
  );
}

function Card({ item, onOpen }: { item: ShowcaseItem; onOpen: Props["onOpen"] }) {
  const ready = item.status === "ready";
  const grounding = item.brief ? Math.round(item.brief.groundingScore * 100) : null;
  return (
    <li className="showcase__card" data-status={item.status}>
      <Bands item={item} />
      <div className="showcase__body">
        <p className="showcase__meta">
          <span className="showcase__dot" aria-hidden="true" />
          <span>
            {LABEL[item.status]}
            {item.city ? `, ${item.city}` : ""}
          </span>
        </p>
        <h3 className="showcase__title">{item.title}</h3>
        <p className="showcase__sub muted">
          {MODE_LABEL[item.mode]}
          {ready && grounding !== null ? `, ${grounding}% citation coverage` : ""}
        </p>
        {ready ? (
          <button type="button" className="btn-primary showcase__open" onClick={() => onOpen(item)}>
            Open this brief<span className="sr-only">: {item.title}</span>
          </button>
        ) : item.status === "failed" ? (
          <FailedNote item={item} />
        ) : (
          <span className="showcase__bar" aria-hidden="true" />
        )}
      </div>
    </li>
  );
}

function Skeleton() {
  return (
    <li className="showcase__card showcase__card--skeleton" aria-hidden="true">
      <span className="showcase__bands showcase__bands--empty" />
      <div className="showcase__body">
        <span className="skel skel--short" />
        <span className="skel" />
        <span className="skel skel--mid" />
      </div>
    </li>
  );
}

/** The primary path: finished briefs a visitor can open instantly. Loads on mount; never blocks the compose form. */
export function ShowcaseGallery({ phase, items, onOpen, onRetry }: Props) {
  const waiting = phase === "closed" || phase === "loading" || phase === "polling";
  const showRetry = phase === "timeout" || phase === "unavailable" || items.some((i) => i.status === "failed");
  return (
    <section id="showcase" className="showcase" aria-labelledby="showcase-h" aria-busy={waiting}>
      <div className="showcase__head">
        <h2 id="showcase-h" className="section-title">
          Start with a finished brief
        </h2>
        <p className="muted showcase__lede" role="status">
          {LEDE[phase]}
        </p>
      </div>
      {items.length > 0 ? (
        <ul className="showcase__grid">
          {items.map((item) => (
            <Card key={item.id} item={item} onOpen={onOpen} />
          ))}
        </ul>
      ) : phase !== "unavailable" ? (
        <ul className="showcase__grid">
          {SKELETONS.map((i) => (
            <Skeleton key={i} />
          ))}
        </ul>
      ) : null}
      {showRetry ? (
        <button type="button" className="link-quiet" onClick={onRetry}>
          {phase === "unavailable" ? "Try the showcase again" : "Retry failed briefs"}
        </button>
      ) : null}
    </section>
  );
}
