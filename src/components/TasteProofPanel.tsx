"use client";

import type { CSSProperties } from "react";
import { breakdownOf, describeBreakdown, statusOf } from "@/lib/agent/proofStats";
import type { ScoredPick, TasteProof } from "@/ui/contract";
import { useOpenEvidenceIfAvailable } from "./EvidenceContext";

const KIND_LABEL: Record<ScoredPick["kind"], string> = { artist: "Artist", place: "Place", brand: "Brand" };

const ofTotal = (n: number, total: number): string => `${n} of ${total}`;

/** Opens the evidence drawer for the records behind a pick; absent when the panel renders outside a brief. */
function TraceChip({ pick }: { pick: ScoredPick }) {
  const open = useOpenEvidenceIfAvailable();
  if (!open || !pick.evidence || pick.evidence.length === 0) return null;
  return (
    <button
      type="button"
      className="why-chip pick__trace"
      aria-label={`trace ${pick.evidence.join(", ")}: ${pick.name}`}
      aria-haspopup="dialog"
      onClick={(e) => open(pick.evidence ?? [], pick.name, e.currentTarget)}
    >
      trace {pick.evidence.join(", ")}
    </button>
  );
}

/** What a baseline pick's row says when it has no score to draw. */
function missingText(pick: ScoredPick, city?: string): string {
  switch (statusOf(pick)) {
    case "wrong_type":
      return pick.matchedKind ? `Wrong type: Qloo lists a ${pick.matchedKind}` : "Wrong type in Qloo";
    case "other_city":
      return city ? `In Qloo, but not in ${city}` : "In Qloo, but in another city";
    default:
      return city ? `Not in Qloo's data for ${city}` : "Not in Qloo's data";
  }
}

function PickRow({ pick, city }: { pick: ScoredPick; city?: string }) {
  const status = statusOf(pick);
  const found = pick.affinity !== null;
  const value = found ? Math.max(0, Math.min(1, pick.affinity as number)) : 0;
  return (
    <li className="pick" data-status={status}>
      <div className="pick__head">
        <span className="pick__name">{pick.name}</span>
        <span className="pick__kind">{KIND_LABEL[pick.kind]}</span>
      </div>
      {pick.address ? <p className="pick__address">{pick.address}</p> : null}
      {found ? (
        <div className="pick__row">
          <div
            className="pick__track"
            role="meter"
            aria-label={`Affinity for ${pick.name}`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(value.toFixed(2))}
          >
            <span className="pick__bar" style={{ "--v": value } as CSSProperties} />
          </div>
          <span className="pick__val">{value.toFixed(2)}</span>
        </div>
      ) : (
        <div className="pick__row">
          <div className="pick__track pick__track--missing" aria-hidden="true" />
          <span className="pick__val pick__val--missing">{missingText(pick, city)}</span>
        </div>
      )}
      {found && status === "other_city" ? <p className="pick__address">{missingText(pick, city)}</p> : null}
      <TraceChip pick={pick} />
    </li>
  );
}

function Column({
  heading,
  note,
  picks,
  avg,
  variant,
  city,
}: {
  heading: string;
  note: string;
  picks: readonly ScoredPick[];
  avg: number | null;
  variant: "plain" | "forge";
  city?: string;
}) {
  return (
    <section className={`proof-col proof-col--${variant}`} aria-label={heading}>
      <h3 className="proof-col__title">{heading}</h3>
      <p className="proof-col__avg">
        <span className="proof-col__num" data-na={avg === null}>
          {avg === null ? "n/a" : avg.toFixed(2)}
        </span>
        <span className="proof-col__avglabel">average affinity (sanity check)</span>
      </p>
      <p className="proof-col__basis">{avg === null ? "none of these picks could be scored" : "over the picks Qloo found"}</p>
      <p className="proof-col__note">{note}</p>
      <ul className="picks">
        {picks.map((p) => (
          <PickRow key={`${p.kind}-${p.name}`} pick={p} city={city} />
        ))}
      </ul>
    </section>
  );
}

type Tally = { good: number; bad: number };

/** One dot per pick: filled when it held up, hatched when it did not. Decorative; the numbers beside it say the same. */
function Dots({ good, bad }: Tally) {
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: good }, (_, i) => (
        <span key={`g${i}`} className="dot dot--good" />
      ))}
      {Array.from({ length: bad }, (_, i) => (
        <span key={`b${i}`} className="dot dot--bad" />
      ))}
    </span>
  );
}

function Check({
  title,
  question,
  plain,
  forge,
  plainTally,
  forgeTally,
  note,
  tone,
}: {
  title: string;
  /** The same check in plain words, for someone who has never heard of an affinity score. */
  question?: string;
  plain?: string;
  forge: string;
  plainTally?: Tally;
  forgeTally?: Tally;
  note: string;
  tone?: "lead" | "minor";
}) {
  return (
    <li className={`check check--${tone ?? "lead"}`}>
      <h3 className="check__title">{title}</h3>
      {question ? <p className="check__question">{question}</p> : null}
      <p className="check__pair">
        {plain ? (
          <span className="check__side check__side--plain">
            <span className="check__num">{plain}</span>
            {plainTally ? <Dots {...plainTally} /> : null}
            <span className="check__who">plain LLM</span>
          </span>
        ) : null}
        <span className="check__side check__side--forge">
          <span className="check__num">{forge}</span>
          {forgeTally ? <Dots {...forgeTally} /> : null}
          <span className="check__who">TasteForge</span>
        </span>
      </p>
      <p className="check__note">{note}</p>
    </li>
  );
}

const FIT_NOTE =
  "Average Qloo affinity over the picks Qloo found. Qloo normalizes affinity within each query, so this is a sanity check that both lists fit the audience, not a comparison between them.";

/** One honest sentence a non-technical reader can take away before any numbers. */
function headline(missing: number, total: number, detail: string, city?: string): string {
  if (missing > 0) {
    return `A plain AI answer named ${missing} of its ${total} picks that Qloo couldn't verify${city ? ` in ${city}` : ""} (${detail}). That does not make them fake: Qloo's catalogue is not the world. Every TasteForge pick is a Qloo result, so each one can be checked.`;
  }
  return `Both lists were checked against Qloo and every name was verified. The difference is what TasteForge adds: places located with an address${city ? ` in ${city}` : ""}, and a Qloo record behind every pick.`;
}

export function TasteProofPanel({ proof, pending, note }: { proof?: TasteProof; pending?: boolean; note?: string }) {
  if (!proof && !pending && note?.startsWith("unavailable")) {
    return (
      <section id="proof" className="proof proof--pending" aria-labelledby="proof-h">
        <h2 id="proof-h" className="proof__title">
          Taste proof
        </h2>
        <p className="muted">
          The Taste Proof could not run for this brief: {note.replace(/^unavailable:\s*/, "")}. The brief above does not depend on it; every line still cites its Qloo record.
        </p>
      </section>
    );
  }
  if (!proof) {
    return pending ? (
      <section id="proof" className="proof proof--pending" aria-busy="true" aria-labelledby="proof-h">
        <h2 id="proof-h" className="proof__title">
          Taste proof
        </h2>
        <p className="muted">Scoring a plain language-model answer against the same audience. This takes a few seconds.</p>
        <span className="proof__shimmer" aria-hidden="true" />
      </section>
    ) : null;
  }
  const stats = breakdownOf(proof.baseline);
  const couldntVerify = proof.baseline.length - stats.verified;
  const found = stats.verified;
  const forgeMissing = proof.tasteforge.filter((p) => p.affinity === null).length;
  const forgePlaces = proof.tasteforge.filter((p) => p.kind === "place");
  const forgeLocal = forgePlaces.filter((p) => p.local).length;
  const plainPlaces = proof.baseline.filter((p) => p.kind === "place");
  const plainPlacesFound = plainPlaces.filter((p) => statusOf(p) === "verified").length;
  const where = proof.city ? `in ${proof.city}` : "with an address";
  return (
    <section id="proof" className="proof" aria-labelledby="proof-h">
      <header className="proof__head">
        <h2 id="proof-h" className="proof__title">
          Taste proof
        </h2>
        <p className="proof__deck">{headline(couldntVerify, proof.baseline.length, describeBreakdown(stats, proof.city), proof.city)}</p>
        <p className="proof__legend" aria-hidden="true">
          <span className="dot dot--good" /> verified in Qloo <span className="dot dot--bad" /> couldn&rsquo;t verify
        </p>
      </header>
      <ul className="checks" aria-label="What the proof checks">
        <Check
          title="Picks Qloo couldn't verify"
          question="Does Qloo's data have each name, as the right type, in the right city?"
          plain={ofTotal(couldntVerify, proof.baseline.length)}
          forge={ofTotal(forgeMissing, proof.tasteforge.length)}
          plainTally={{ good: found, bad: couldntVerify }}
          forgeTally={{ good: proof.tasteforge.length - forgeMissing, bad: forgeMissing }}
          note={`${describeBreakdown(stats, proof.city) || "Every plain pick was verified"}. Unverified means Qloo has no matching entity, not that the place does not exist. Every TasteForge pick is a Qloo result.`}
        />
        {forgePlaces.length > 0 ? (
          <Check
            title={`Real places ${where}`}
            question="Can each place be located, with an address, in the right city?"
            plain={plainPlaces.length > 0 ? ofTotal(plainPlacesFound, plainPlaces.length) : undefined}
            forge={ofTotal(forgeLocal, forgePlaces.length)}
            plainTally={plainPlaces.length > 0 ? { good: plainPlacesFound, bad: plainPlaces.length - plainPlacesFound } : undefined}
            forgeTally={{ good: forgeLocal, bad: forgePlaces.length - forgeLocal }}
            note="TasteForge places were located by Qloo with an address on file; places outside the city are removed. For the plain answer Qloo only says whether it knows the name."
          />
        ) : null}
        <Check
          tone="minor"
          title="Sanity check: audience fit"
          plain={proof.baselineAvg === null ? "n/a" : proof.baselineAvg.toFixed(2)}
          forge={proof.tasteforgeAvg === null ? "n/a" : proof.tasteforgeAvg.toFixed(2)}
          note={FIT_NOTE}
        />
      </ul>
      <h3 className="proof__sub">The picks, one by one</h3>
      <div className="proof__cols">
        <Column
          heading="Plain LLM"
          variant="plain"
          avg={proof.baselineAvg}
          picks={proof.baseline}
          city={proof.city}
          note={
            couldntVerify > 0
              ? `${couldntVerify} of ${proof.baseline.length} picks couldn't be verified in Qloo; ${found} scored.`
              : `All ${proof.baseline.length} picks verified in Qloo.`
          }
        />
        <Column
          heading="TasteForge"
          variant="forge"
          avg={proof.tasteforgeAvg}
          picks={proof.tasteforge}
          city={proof.city}
          note="Every pick comes from Qloo results. Use trace to see the evidence behind it."
        />
      </div>
      <p className="proof__caption">Affinity with this audience&rsquo;s taste signals, scored by Qloo.</p>
      <dl className="sr-only">
        <dt>Plain LLM picks Qloo couldn&rsquo;t verify</dt>
        <dd>{couldntVerify}</dd>
      </dl>
    </section>
  );
}
