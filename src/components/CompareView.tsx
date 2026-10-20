"use client";

import { useMemo } from "react";
import { diffCities, type SlotDiff } from "@/ui/compareBriefs";
import type { Brief, DroppedItem, Evidence, Item, Swatch } from "@/ui/contract";
import type { RunState } from "@/ui/runState";
import { BriefView } from "./BriefView";
import { EvidenceProvider } from "./EvidenceContext";
import { inkFor } from "./Swatches";
import { WalkView } from "./WalkView";

export type CompareSide = {
  readonly city: string;
  readonly brief: Brief;
  readonly dropped: readonly DroppedItem[];
  readonly evidence: Readonly<Record<string, Evidence>>;
};

type Props = {
  a: CompareSide;
  b: RunState;
  cityB: string;
  onClose: () => void;
  onRetry: () => void;
};

function Entry({ item, slot }: { item: Item; slot: SlotDiff["key"] }) {
  const hex = slot === "palette" ? (item as Swatch).hex : undefined;
  return (
    <li className="cmp-item">
      {hex ? (
        <span className="cmp-item__chip" style={{ background: hex, color: inkFor(hex) }} aria-hidden="true">
          {hex.toUpperCase()}
        </span>
      ) : null}
      <span className="cmp-item__label">{item.label}</span>
      {item.detail && !hex ? <span className="cmp-item__detail">{item.detail}</span> : null}
    </li>
  );
}

function Column({ title, tone, items, slot }: { title: string; tone: "a" | "both" | "b"; items: readonly Item[]; slot: SlotDiff["key"] }) {
  return (
    <div className="cmp-col" data-tone={tone}>
      <h4 className="cmp-col__title">{title}</h4>
      {items.length === 0 ? (
        <p className="muted cmp-col__none">None</p>
      ) : (
        <ul>
          {items.map((item) => (
            <Entry key={`${item.label}-${item.qlooId ?? ""}`} item={item} slot={slot} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotBlock({ diff, cityA, cityB }: { diff: SlotDiff; cityA: string; cityB: string }) {
  const total = diff.shared.length + diff.onlyA.length + diff.onlyB.length;
  if (total === 0) return null;
  return (
    <section className="cmp-slot" aria-labelledby={`cmp-${diff.key}`}>
      <h3 id={`cmp-${diff.key}`} className="cmp-slot__title">
        {diff.title}
      </h3>
      <div className="cmp-grid">
        <Column title={`Only ${cityA}`} tone="a" items={diff.onlyA} slot={diff.key} />
        <Column title="Both cities" tone="both" items={diff.shared.map((p) => p.a)} slot={diff.key} />
        <Column title={`Only ${cityB}`} tone="b" items={diff.onlyB} slot={diff.key} />
      </div>
    </section>
  );
}

function Diff({ a, bBrief, cityB }: { a: CompareSide; bBrief: Brief; cityB: string }) {
  const result = useMemo(() => diffCities(a.brief, bBrief), [a.brief, bBrief]);
  return (
    <>
      <p className="compare__summary" role="status">
        <strong>{result.shared}</strong> in common, <strong>{result.differing}</strong> that differ between {a.city} and {cityB}.
        Grounding {Math.round(a.brief.groundingScore * 100)}% vs {Math.round(bBrief.groundingScore * 100)}%.
      </p>
      {result.slots.map((diff) => (
        <SlotBlock key={diff.key} diff={diff} cityA={a.city} cityB={cityB} />
      ))}
    </>
  );
}

/** Side-by-side comparison of the same audience in two cities. Shows the second run's walk while it streams. */
export function CompareView({ a, b, cityB, onClose, onRetry }: Props) {
  const evidenceB = b.evidence;
  const waiting = b.phase === "running" || b.phase === "error" || !b.brief;
  return (
    <section className="compare" aria-labelledby="compare-h">
      <header className="compare__head">
        <p className="brief__kicker">City comparison</p>
        <h1 id="compare-h" className="compare__title">
          {a.city} <span className="compare__vs">vs</span> {cityB}
        </h1>
        <button type="button" className="link-quiet" onClick={onClose}>
          Back to the {a.city} brief
        </button>
      </header>

      {waiting ? (
        <WalkView state={b} onChoose={() => undefined} onRetry={onRetry} onReset={onClose} />
      ) : b.brief ? (
        <>
          <Diff a={a} bBrief={b.brief} cityB={cityB} />
          <details className="compare__full">
            <summary>Read the full {cityB} brief</summary>
            <EvidenceProvider evidence={evidenceB}>
              <BriefView brief={b.brief} dropped={b.dropped} />
            </EvidenceProvider>
          </details>
        </>
      ) : null}
    </section>
  );
}
