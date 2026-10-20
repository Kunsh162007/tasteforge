import { diffBriefs, type BriefChanges } from "./briefChanges";
import type { Brief, BriefSignals, DroppedItem, Evidence, LedgerSignatures, NeedsInputEvent, StageName, TasteProof, UiEvent } from "./contract";
import type { BriefRequestBody } from "./contract";

export const STAGES: readonly { key: StageName; label: string; plain: string }[] = [
  { key: "seeds", label: "Seeds", plain: "Reading your description" },
  { key: "resolve", label: "Resolve", plain: "Matching names in Qloo" },
  { key: "walk", label: "Walk", plain: "Walking the taste graph" },
  { key: "critic", label: "Critic", plain: "Checking the evidence" },
  { key: "synthesis", label: "Synthesis", plain: "Writing the brief" },
  { key: "proof", label: "Proof", plain: "Scoring against a plain AI answer" },
];

export type StageStatus = "idle" | "active" | "done" | "failed" | "skipped";
export type TrailLine = {
  id: string;
  text: string;
  /** The question asked, without the answer (for the live walk view). */
  label: string;
  /** What Qloo answered, once it has. */
  summary?: string;
  ok: boolean;
  pending: boolean;
  /** How long the call took, when the server reports it (optional field on tool_result). */
  durationMs?: number;
};

/** How the walk log shows a call: a call the server dropped to stay on time ("Left out: ...") is skipped, not an error. */
export type TrailState = "pending" | "ok" | "skipped" | "failed";

export function trailState(line: Pick<TrailLine, "pending" | "ok" | "summary">): TrailState {
  if (line.pending) return "pending";
  if (line.ok) return "ok";
  return line.summary?.startsWith("Left out") ? "skipped" : "failed";
}

/** A stage note the UI shows quietly: "partial: 2 calls cut off" or "skipped, out of time" are not failures. */
export function stageNote(detail: string | undefined): "partial" | "skipped" | undefined {
  if (!detail) return undefined;
  if (detail.toLowerCase().includes("partial")) return "partial";
  return detail.toLowerCase().startsWith("skipped") ? "skipped" : undefined;
}

export type RunState = {
  phase: "idle" | "running" | "needs_input" | "done" | "error";
  stages: Record<StageName, { status: StageStatus; detail?: string }>;
  trail: readonly TrailLine[];
  evidence: Readonly<Record<string, Evidence>>;
  brief?: Brief;
  dropped: readonly DroppedItem[];
  proof?: TasteProof;
  needsInput?: NeedsInputEvent;
  error?: { message: string; retryable: boolean };
  /** The request behind the current brief; the refine loop sends it back. */
  request?: Pick<BriefRequestBody, "prompt" | "mode" | "city">;
  /** Taste signals behind the brief (echoed back on refine). */
  signals?: BriefSignals;
  /** Server signatures for the evidence and signals above (echoed back on refine, compare and share). */
  signatures?: LedgerSignatures;
  /** Set while a refine run is in flight (the old brief stays on screen) or after it failed. */
  refine?: { status: "running" | "error"; message?: string; retryable?: boolean };
  /** What the last refine run changed. */
  changes?: BriefChanges;
  /** True once the stream has ended (or the run was loaded whole), so nothing more will arrive. */
  ended?: boolean;
};

const idleStages = (): RunState["stages"] =>
  Object.fromEntries(STAGES.map((s) => [s.key, { status: "idle" as StageStatus }])) as RunState["stages"];

export const INITIAL_RUN: RunState = {
  phase: "idle",
  stages: idleStages(),
  trail: [],
  evidence: {},
  dropped: [],
};

export const startRun = (request?: RunState["request"]): RunState => ({
  ...INITIAL_RUN,
  phase: "running",
  stages: idleStages(),
  ...(request ? { request } : {}),
});

/** Stages a refine run never executes: it reuses the original seeds, resolution and critic. */
const REFINE_SKIPPED: readonly StageName[] = ["seeds", "resolve", "critic"];

/** Starts a refine run on top of a finished one: the brief stays visible while the new walk streams in. */
export function startRefine(state: RunState): RunState {
  const stages = Object.fromEntries(
    STAGES.map((s) => [
      s.key,
      REFINE_SKIPPED.includes(s.key) ? { status: "skipped" as StageStatus, detail: "reused" } : { status: "idle" as StageStatus },
    ]),
  ) as RunState["stages"];
  return { ...state, phase: "done", stages, trail: [], proof: undefined, refine: { status: "running" }, changes: undefined, ended: undefined };
}

/**
 * After a failure: finished stages stay done, the stage that was running (or, between stages, the next
 * one) is marked failed, and everything after it is skipped.
 */
export function failStages(stages: RunState["stages"]): RunState["stages"] {
  const failKey = (STAGES.find((s) => stages[s.key].status === "active") ?? STAGES.find((s) => stages[s.key].status === "idle"))?.key;
  return Object.fromEntries(
    STAGES.map((s) => {
      const current = stages[s.key];
      if (s.key === failKey) return [s.key, { ...current, status: "failed" as StageStatus }];
      return [s.key, current.status === "idle" ? { ...current, status: "skipped" as StageStatus } : current];
    }),
  ) as RunState["stages"];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

const TYPE_NOUN: Record<string, string> = {
  place: "places",
  artist: "artists",
  brand: "brands",
  movie: "films",
  tv_show: "shows",
  podcast: "podcasts",
  book: "books",
};

/** Human sentence for a Qloo call, e.g. "Searched places loved by this audience in Indore". */
export function describeCall(name: string, args: Record<string, unknown>): string {
  const city = str(args.location);
  const inCity = city ? ` in ${city}` : "";
  const noun = TYPE_NOUN[str(args.type) ?? ""] ?? str(args.type) ?? "results";
  switch (name) {
    case "qloo_search":
      return `Looked up "${str(args.query) ?? "a name"}" in Qloo`;
    case "qloo_find_tags":
      return `Mapped "${str(args.query) ?? "a concept"}" to taste tags`;
    case "qloo_insights":
      return `Searched ${noun} loved by this audience${inCity}`;
    case "qloo_entity_tags":
      return "Read the decor and ambience tags of top picks";
    case "qloo_demographics":
      return "Checked who this audience is (age and gender skew)";
    case "qloo_heatmap":
      return `Mapped where this audience gathers${inCity}`;
    case "qloo_trending":
      return "Checked what is trending right now";
    default:
      return `Called ${name}`;
  }
}

function withTool(state: RunState, event: Extract<UiEvent, { type: "tool_call" | "tool_result" }>): RunState {
  if (event.type === "tool_call") {
    const label = describeCall(event.name, event.args);
    const line: TrailLine = { id: event.id, text: label, label, ok: true, pending: true };
    return { ...state, trail: [...state.trail, line] };
  }
  // `durationMs` is an optional, newer field: read it defensively so older servers still work.
  const raw = (event as { durationMs?: unknown }).durationMs;
  const durationMs = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  const trail = state.trail.map((l) =>
    l.id === event.id
      ? { ...l, pending: false, ok: event.ok, text: `${l.text}: ${event.summary}`, summary: event.summary, ...(durationMs !== undefined ? { durationMs } : {}) }
      : l,
  );
  return { ...state, trail };
}

/** A failed run: stages are marked, and a refine failure keeps the existing brief on screen. */
export function failRun(state: RunState, message: string, retryable: boolean): RunState {
  const stages = failStages(state.stages);
  if (state.refine?.status === "running") return { ...state, stages, refine: { status: "error", message, retryable } };
  return { ...state, stages, phase: "error", error: { message, retryable } };
}

/** Pure reducer: folds one stream event into run state. */
export function reduceEvent(state: RunState, event: UiEvent): RunState {
  switch (event.type) {
    case "stage": {
      const status: StageStatus = event.status === "start" ? "active" : "done";
      const stages = { ...state.stages, [event.stage]: { status, detail: event.detail } };
      return { ...state, phase: state.phase === "needs_input" ? "running" : state.phase, stages };
    }
    case "tool_call":
    case "tool_result":
      return withTool(state, event);
    case "needs_input":
      return { ...state, phase: "needs_input", needsInput: event };
    case "proof":
      return { ...state, proof: event.proof };
    case "brief": {
      const given = Object.fromEntries(event.evidence.map((e) => [e.id, e]));
      const refined = state.refine?.status === "running" && state.brief;
      return {
        ...state,
        brief: event.brief,
        dropped: event.dropped,
        evidence: given,
        phase: "done",
        signatures: event.signatures,
        ...(event.signals ? { signals: event.signals } : {}),
        ...(refined && state.brief ? { changes: diffBriefs(state.brief, event.brief), refine: undefined } : {}),
      };
    }
    case "error":
      return failRun(state, event.message, event.retryable);
    case "done": {
      if (state.refine?.status === "running" && !event.ok) return failRun(state, "The refinement ended before a new brief was ready.", true);
      if (state.phase === "running" && !state.brief) return failRun(state, "The run ended before a brief was ready.", true);
      return { ...state, ended: true, ...(state.phase === "running" ? { phase: "done" as const } : {}) };
    }
    default:
      return state;
  }
}
