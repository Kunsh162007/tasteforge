import type { Brief, DroppedItem } from "./brief";
import type { Evidence } from "./ledger";

/** Event contract shared with the UI (docs/IMPLEMENTATION_PLAN.md section 8.4). */

export type StageName = "seeds" | "resolve" | "walk" | "critic" | "synthesis" | "proof";

export type SectionKey = "audience" | "aesthetic" | "sound" | "pairings" | "where";
export type Confidence = "high" | "medium" | "low";
export type SectionConfidence = Readonly<Record<SectionKey, Confidence>>;

export type NeedsInputOption = { readonly label: string; readonly qlooId: string; readonly kind: string };

export type ScoredPick = {
  readonly name: string;
  readonly kind: "artist" | "place" | "brand";
  readonly qlooId?: string;
  /** null = Qloo could not find or score this pick. */
  readonly affinity: number | null;
  /** TasteForge picks: the evidence records that surfaced this pick (traceability). */
  readonly evidence?: readonly string[];
  /** Places: the address Qloo has on file. */
  readonly address?: string;
  /** Places: true when Qloo located it (address and coordinates) in the requested city. */
  readonly local?: boolean;
};

export type TasteProof = {
  readonly baseline: readonly ScoredPick[];
  readonly tasteforge: readonly ScoredPick[];
  /** Mean affinity over the picks Qloo found only; null when it found none (shown as "n/a"). */
  readonly baselineAvg: number | null;
  readonly tasteforgeAvg: number | null;
  readonly baselineNotFound: number;
  /** The requested city, when the brief had one (frames the local-verification stat). */
  readonly city?: string;
};

/** The resolved taste signals behind a brief; echoed back by the UI so a refine run can reuse them. */
export type BriefSignals = {
  readonly entityIds: readonly string[];
  readonly tagIds: readonly string[];
  readonly entityNames: readonly string[];
  readonly tagNames: readonly string[];
};

/**
 * Server-issued HMACs over the evidence ledger and the taste signals. The UI echoes them back on refine,
 * compare and share links so client-supplied evidence cannot be forged. Opaque to the UI.
 */
export type LedgerSignatures = {
  /** Evidence id to signature of the full record (refine). */
  readonly records: Readonly<Record<string, string>>;
  /** Evidence id to signature of the slimmed record that share links carry. */
  readonly shared: Readonly<Record<string, string>>;
  /** Signature of the resolved taste signals (refine, compare). */
  readonly signals?: string;
};

export type StageEvent = {
  readonly type: "stage";
  readonly stage: StageName;
  readonly status: "start" | "done";
  readonly detail?: string;
};

export type NeedsInputEvent = {
  readonly type: "needs_input";
  readonly question: string;
  readonly options: readonly NeedsInputOption[];
};

export type ProofEvent = { readonly type: "proof"; readonly proof: TasteProof };

export type AgentEvent =
  /** Free-text note; the pipeline no longer emits it, but the stream contract still accepts it. */
  | { readonly type: "thinking"; readonly text: string }
  | { readonly type: "tool_call"; readonly id: string; readonly name: string; readonly args: Readonly<Record<string, unknown>> }
  | {
      readonly type: "tool_result";
      readonly id: string;
      readonly name: string;
      readonly ok: boolean;
      readonly summary: string;
      readonly evidenceId?: string;
      /** Wall time of the call in ms (additive field, absent on older streams). */
      readonly durationMs?: number;
    }
  | {
      readonly type: "brief";
      readonly brief: Brief;
      readonly dropped: readonly DroppedItem[];
      /** Ledger records the brief cites, for the evidence drawer. */
      readonly evidence: readonly Evidence[];
      readonly signals?: BriefSignals;
      readonly signatures?: LedgerSignatures;
    }
  | StageEvent
  | NeedsInputEvent
  | ProofEvent
  | { readonly type: "error"; readonly message: string; readonly retryable: boolean };
