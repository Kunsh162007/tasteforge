import type { DroppedItem } from "@/ui/contract";

const REASON: Record<DroppedItem["reason"], string> = {
  no_evidence: "no evidence cited",
  unknown_evidence: "cited evidence not found",
  not_in_evidence: "words that appear nowhere in the Qloo tags",
};

export function DroppedNote({ dropped }: { dropped: readonly DroppedItem[] }) {
  if (dropped.length === 0) return null;
  return (
    <details className="dropped">
      <summary>
        Removed for lack of evidence <span className="dropped__count">{dropped.length}</span>
      </summary>
      <p className="muted">The writer proposed these, but nothing in the Qloo results backed them, so they were cut.</p>
      <ul>
        {dropped.map((d, i) => (
          <li key={`${d.section}-${d.label}-${i}`}>
            <span className="dropped__label">{d.label}</span>
            <span className="muted">
              {" "}
              in {d.section}: {REASON[d.reason]}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
