"use client";

import { useOpenEvidence } from "./EvidenceContext";

/** Small button that opens the evidence drawer for the given ledger ids. Renders nothing without ids. */
export function WhyChip({ ids, label }: { ids: readonly string[]; label: string }) {
  const open = useOpenEvidence();
  if (ids.length === 0) return null;
  return (
    <button
      type="button"
      className="why-chip"
      aria-label={`Why: ${label}`}
      aria-haspopup="dialog"
      onClick={(e) => open(ids, label, e.currentTarget)}
    >
      why
      <span className="why-chip__count" data-count={ids.length} aria-hidden="true" />
    </button>
  );
}
