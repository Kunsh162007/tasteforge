"use client";

import type { CSSProperties } from "react";
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
      aria-label={`Trace: ${pick.name}`}
      aria-haspopup="dialog"
      onClick={(e) => open(pick.evidence ?? [], pick.name, e.currentTarget)}
    >
      trace {pick.evidence.join(", ")}
    </button>
  );
}

function PickRow({ pick }: { pick: ScoredPick }) {
  const found = pick.affinity !== null;
  const value = found ? Math.max(0, Math.min(1, pick.affinity as number)) : 0;
  return (
    <li className="pick">
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
          <span className="pick__val pick__val--missing">Not found in Qloo</span>
        </div>
      )}
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
}: {
  heading: string;
  note: string;
  picks: readonly ScoredPick[];
  avg: number | null;
  variant: "plain" | "forge";
}) {
  return (
    <section className={`proof-col proof-col--${variant}`} aria-label={heading}>
      <h3 className="proof-col__title">{heading}</h3>
      <p className="proof-col__avg">
        <span className="proof-col__num" data-na={avg === null}>
          {avg === null ? "n/a" : avg.toFixed(2)}
        </span>
        <span className="proof-col__avglabel">average affinity</span>
      </p>
      <p className="proof-col__basis">{avg === null ? "none of these picks could be scored" : "over the picks Qloo found"}</p>
      <p className="proof-col__note">{note}</p>
      <ul className="picks">
        {picks.map((p) => (
          <PickRow key={`${p.kind}-${p.name}`} pick={p} />
        ))}
      </ul>
    </section>
  );
}

function Check({
  title,
  plain,
  forge,
  note,
  tone,
}: {
  title: string;
  plain?: string;
  forge: string;
  note: string;
  tone?: "lead" | "minor";
}) {
  return (
    <li className={`check check--${tone ?? "lead"}`}>
      <h3 className="check__title">{title}</h3>
      <p className="check__pair">
        {plain ? (
          <span className="check__side check__side--plain">
            <span className="check__num">{plain}</span>
            <span className="check__who">plain LLM</span>
          </span>
        ) : null}
        <span className="check__side check__side--forge">
          <span className="check__num">{forge}</span>
          <span className="check__who">TasteForge</span>
        </span>
      </p>
      <p className="check__note">{note}</p>
    </li>
  );
}

function fitVerdict(plain: number | null, forge: number | null): string {
  const base = "Average affinity with this audience, over the picks Qloo found.";
  if (plain === null || forge === null) return base;
  return forge >= plain ? `${base} TasteForge is at least as close.` : `${base} The plain answer scores a little higher on the picks it did find.`;
}

export function TasteProofPanel({ proof, pending }: { proof?: TasteProof; pending?: boolean }) {
  if (!proof) {
    return pending ? (
      <section className="proof" aria-busy="true" aria-labelledby="proof-h">
        <h2 id="proof-h" className="proof__title">
          Taste proof
        </h2>
        <p className="muted">Scoring a plain language-model answer against the same audience. This takes a few seconds.</p>
      </section>
    ) : null;
  }
  const found = proof.baseline.length - proof.baselineNotFound;
  const forgeMissing = proof.tasteforge.filter((p) => p.affinity === null).length;
  const forgePlaces = proof.tasteforge.filter((p) => p.kind === "place");
  const forgeLocal = forgePlaces.filter((p) => p.local).length;
  const plainPlaces = proof.baseline.filter((p) => p.kind === "place");
  const plainPlacesFound = plainPlaces.filter((p) => p.affinity !== null).length;
  const where = proof.city ? `in ${proof.city}` : "with an address";
  return (
    <section className="proof" aria-labelledby="proof-h">
      <header className="proof__head">
        <h2 id="proof-h" className="proof__title">
          Taste proof
        </h2>
        <p className="proof__deck">
          Same audience, same questions. First: can the picks be found at all? Then: are they real places in the right city? Last, and least: how close is
          the fit?
        </p>
      </header>
      <ul className="checks" aria-label="What the proof checks">
        <Check
          title="Picks Qloo couldn't find"
          plain={ofTotal(proof.baselineNotFound, proof.baseline.length)}
          forge={ofTotal(forgeMissing, proof.tasteforge.length)}
          note="A pick Qloo has no record of is likely invented or not local. Every TasteForge pick is a Qloo result."
        />
        {forgePlaces.length > 0 ? (
          <Check
            title={`Real places ${where}`}
            plain={plainPlaces.length > 0 ? ofTotal(plainPlacesFound, plainPlaces.length) : undefined}
            forge={ofTotal(forgeLocal, forgePlaces.length)}
            note="TasteForge places were located by Qloo with an address on file; places outside the city are removed. For the plain answer Qloo only says whether it knows the name."
          />
        ) : null}
        <Check
          tone="minor"
          title="Audience fit"
          plain={proof.baselineAvg === null ? "n/a" : proof.baselineAvg.toFixed(2)}
          forge={proof.tasteforgeAvg === null ? "n/a" : proof.tasteforgeAvg.toFixed(2)}
          note={fitVerdict(proof.baselineAvg, proof.tasteforgeAvg)}
        />
      </ul>
      <div className="proof__cols">
        <Column
          heading="Plain LLM"
          variant="plain"
          avg={proof.baselineAvg}
          picks={proof.baseline}
          note={
            proof.baselineNotFound > 0
              ? `${proof.baselineNotFound} of ${proof.baseline.length} picks not found in Qloo; ${found} scored.`
              : `All ${proof.baseline.length} picks found in Qloo.`
          }
        />
        <Column
          heading="TasteForge"
          variant="forge"
          avg={proof.tasteforgeAvg}
          picks={proof.tasteforge}
          note="Every pick comes from Qloo results. Use trace to see the evidence behind it."
        />
      </div>
      <p className="proof__caption">Affinity with this audience&rsquo;s taste signals, scored by Qloo.</p>
      <dl className="sr-only">
        <dt>Plain LLM not found in Qloo</dt>
        <dd>{proof.baselineNotFound}</dd>
      </dl>
    </section>
  );
}
