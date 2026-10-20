"use client";

import { useEffect, useState } from "react";
import type { ShowcasePhase } from "@/hooks/useShowcase";
import { retryInSeconds, type ShowcaseItem } from "@/ui/showcase";

type Props = {
  phase: ShowcasePhase;
  items: readonly ShowcaseItem[];
  onOpen: (item: ShowcaseItem) => void;
  onRetry: () => void;
  onClose: () => void;
};

const LABEL: Record<ShowcaseItem["status"], string> = {
  ready: "Ready",
  generating: "Forging now",
  queued: "Queued",
  failed: "Could not be built",
};

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

const LEDE: Partial<Record<ShowcasePhase, string>> = {
  loading: "Checking the studio shelf...",
  polling: "Pre-built briefs are being forged in the background. Open one as soon as it is ready.",
  settled: "Each of these was built by the same agent you are about to use.",
  timeout: "Some briefs are taking longer than expected. Open what is ready, or check again.",
  unavailable: "The showcase is not reachable right now.",
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

function Card({ item, onOpen }: { item: ShowcaseItem; onOpen: Props["onOpen"] }) {
  return (
    <li className="showcase__card" data-status={item.status}>
      <p className="showcase__meta">
        <span className="showcase__dot" aria-hidden="true" />
        {LABEL[item.status]}
        {item.city ? <span> &middot; {item.city}</span> : null}
      </p>
      <h3 className="showcase__title">{item.title}</h3>
      {item.status === "ready" ? (
        <button type="button" className="btn-primary showcase__open" onClick={() => onOpen(item)}>
          Open this brief
        </button>
      ) : item.status === "failed" ? (
        <FailedNote item={item} />
      ) : (
        <span className="showcase__bar" aria-hidden="true" />
      )}
    </li>
  );
}

export function ShowcaseGallery({ phase, items, onOpen, onRetry, onClose }: Props) {
  if (phase === "closed") return null;
  const waiting = phase === "loading" || phase === "polling";
  return (
    <section className="showcase" aria-labelledby="showcase-h" aria-busy={waiting}>
      <div className="showcase__head">
        <h2 id="showcase-h" className="showcase__h">
          Showcase briefs
        </h2>
        <button type="button" className="link-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted showcase__lede" role="status">
        {LEDE[phase]}
      </p>
      {items.length > 0 ? (
        <ul className="showcase__grid">
          {items.map((item) => (
            <Card key={item.id} item={item} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
      {phase === "timeout" || phase === "unavailable" || items.some((i) => i.status === "failed") ? (
        <button type="button" className="link-quiet" onClick={onRetry}>
          Retry failed briefs
        </button>
      ) : null}
    </section>
  );
}
