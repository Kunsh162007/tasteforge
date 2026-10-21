import type { AgentEvent, Brief, BriefMode, BriefSignals, Evidence } from "@/lib/agent";

/**
 * UI view of the backend contract (docs/IMPLEMENTATION_PLAN.md sections 3 and 8.4).
 * Everything is re-exported from @/lib/agent so the two sides cannot drift. Type-only: nothing
 * from the server bundle reaches the browser.
 */
export type {
  AgentEvent,
  Brief,
  BriefMode,
  BriefSignals,
  Confidence,
  DroppedItem,
  LedgerSignatures,
  Evidence,
  Item,
  NeedsInputEvent,
  NeedsInputOption,
  ProofEvent,
  QueueEvent,
  ScoredPick,
  SectionConfidence,
  SectionKey,
  StageEvent,
  StageName,
  TasteProof,
} from "@/lib/agent";

/** Events the UI consumes: the agent events plus the route's terminal `done`. */
export type UiEvent = AgentEvent | { type: "done"; ok: boolean };

export type BriefRequestBody = {
  prompt: string;
  mode: BriefMode;
  city?: string;
  selections?: { label: string; qlooId: string; kind: string }[];
};

/** POST /api/brief/refine body (see docs/IMPLEMENTATION_PLAN.md section 8.5). */
export type RefineRequestBody = {
  prompt: string;
  mode: BriefMode;
  city?: string;
  brief: Brief;
  /** The evidence records the brief cites. */
  evidence: Evidence[];
  signals?: BriefSignals;
  signatures?: RequestSignatures;
  feedback: { liked: string[]; disliked: string[]; locked: string[] };
};

/** The server signatures a request echoes back (see LedgerSignatures); opaque to the UI. */
export type RequestSignatures = { records?: Record<string, string>; signals?: string };

export type Swatch = Brief["aesthetic"]["palette"][number];

/** POST /api/brief/compare body: rerun a brief for a second city, reusing the first run's seeds. */
export type CompareRequestBody = {
  prompt: string;
  mode: BriefMode;
  city: string;
  signals?: BriefSignals;
  signatures?: RequestSignatures;
};
