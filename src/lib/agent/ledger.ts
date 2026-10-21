/**
 * Evidence ledger: every Qloo tool result becomes an immutable record with an id (ev_N).
 * The model may only cite these ids, and the validator checks citations against them.
 */

export type EvidenceEntity = {
  readonly id: string;
  readonly name: string;
  readonly affinity?: number;
  /** Short facts from Qloo (address, price, style...) that the brief writer may use in details. */
  readonly note?: string;
  /** Set for heatmap hotspots so the UI can place them on a map. */
  readonly lat?: number;
  readonly lon?: number;
};
/** Affinity first (best fit first), then id: the same results always come out in the same order. */
export const byAffinityThenId = (a: Pick<EvidenceEntity, "id" | "affinity">, b: Pick<EvidenceEntity, "id" | "affinity">): number =>
  (b.affinity ?? -Infinity) - (a.affinity ?? -Infinity) || a.id.localeCompare(b.id);

export type EvidenceTag = { readonly id: string; readonly name: string; readonly score?: number };

export type Evidence = {
  readonly id: string;
  readonly endpoint: string;
  readonly params: Readonly<Record<string, string>>;
  readonly summary: string;
  readonly entities?: readonly EvidenceEntity[];
  readonly tags?: readonly EvidenceTag[];
};

export type EvidenceDraft = Omit<Evidence, "id">;

export type Ledger = { readonly records: readonly Evidence[] };

export const EMPTY_LEDGER: Ledger = { records: [] };

/** Entities/tags kept in the compact view sent back to the LLM (token budget). */
export const LLM_VIEW_LIMIT = 10;

const round2 = (n: number): number => Math.round(n * 100) / 100;

const idNumber = (id: string): number => Number(/^ev_(\d+)$/.exec(id)?.[1] ?? 0);

/** Returns a new ledger plus the record that was appended (ids continue after the highest existing one). */
export function addEvidence(ledger: Ledger, draft: EvidenceDraft): { ledger: Ledger; evidence: Evidence } {
  const next = ledger.records.reduce((max, r) => Math.max(max, idNumber(r.id)), 0) + 1;
  const evidence: Evidence = { ...draft, id: `ev_${next}` };
  return { ledger: { records: [...ledger.records, evidence] }, evidence };
}

export function hasEvidence(ledger: Ledger, id: string): boolean {
  return ledger.records.some((r) => r.id === id);
}

export function compactEntities(
  entities: readonly { id: string; name: string; affinity?: number; note?: string; lat?: number; lon?: number }[],
  limit = LLM_VIEW_LIMIT,
): EvidenceEntity[] {
  return entities.slice(0, limit).map((e) => ({
    id: e.id,
    name: e.name,
    ...(e.affinity !== undefined ? { affinity: round2(e.affinity) } : {}),
    ...(e.note ? { note: e.note } : {}),
    ...(e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : {}),
  }));
}

export function compactTags(
  tags: readonly { id: string; name: string; score?: number }[],
  limit = LLM_VIEW_LIMIT,
): EvidenceTag[] {
  return tags.slice(0, limit).map((t) => ({
    id: t.id,
    name: t.name,
    ...(t.score !== undefined ? { score: round2(t.score) } : {}),
  }));
}

function withoutCoordinates(e: EvidenceEntity): EvidenceEntity {
  return { id: e.id, name: e.name, ...(e.affinity !== undefined ? { affinity: e.affinity } : {}), ...(e.note ? { note: e.note } : {}) };
}

/** Compact, JSON-serialisable view returned to the model as the tool result. */
export function toLlmView(e: Evidence): Record<string, unknown> {
  // Coordinates are for the map and the city check; the writer only needs them for heatmap hotspots.
  const forModel = e.endpoint.includes("heatmap") ? e.entities : e.entities?.map(withoutCoordinates);
  return {
    evidence_id: e.id,
    summary: e.summary,
    ...(forModel?.length ? { entities: forModel } : {}),
    ...(e.tags?.length ? { tags: e.tags } : {}),
  };
}
