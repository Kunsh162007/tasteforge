import { describe, expect, it, vi } from "vitest";
import type { BriefSignals } from "@/lib/agent/events";
import type { Evidence } from "@/lib/agent/ledger";
import { slimEvidence } from "@/lib/share/codec";
import { canonicalJson, createLedgerSigner, resolveLedgerSecret } from "./ledgerSig";

const records: Evidence[] = [
  {
    id: "ev_1",
    endpoint: "/v2/insights",
    params: { type: "artist", take: "10" },
    summary: "10 artists",
    entities: Array.from({ length: 12 }, (_, i) => ({ id: `MOCK-ARTIST-${i}`, name: `Artist ${i}`, affinity: 0.5 + i / 100 })),
  },
  { id: "ev_2", endpoint: "/v2/tags", params: {}, summary: "tags", tags: [{ id: "urn:tag:genre:media:indie", name: "Indie" }] },
];
const signals: BriefSignals = { entityIds: ["MOCK-ARTIST-1"], tagIds: ["urn:tag:genre:media:indie"], entityNames: ["Artist 1"], tagNames: ["Indie"] };

describe("canonicalJson", () => {
  it("is independent of key order and drops undefined values", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe(canonicalJson({ a: { c: [2, 1] }, b: 1 }));
  });
});

describe("ledger signer", () => {
  const signer = createLedgerSigner("a-test-secret-of-length");
  const sigs = signer.sign({ evidence: records, signals });

  it("verifies untouched records and signals", () => {
    expect(signer.verifyRecords(records, sigs.records)).toBe(true);
    expect(signer.verifySignals(signals, sigs.signals)).toBe(true);
  });

  it("verifies share records after they were slimmed and sent through JSON", () => {
    const slim = JSON.parse(JSON.stringify(records.map(slimEvidence))) as Evidence[];
    expect(signer.verifyShared(slim, sigs.shared)).toBe(true);
    expect(signer.verifyShared([{ ...slim[0], summary: "edited" }], sigs.shared)).toBe(false);
  });

  it("rejects an edited record, an invented record and a swapped signature", () => {
    expect(signer.verifyRecords([{ ...records[0], summary: "tampered" }], sigs.records)).toBe(false);
    expect(signer.verifyRecords([{ ...records[1], id: "ev_9" }], sigs.records)).toBe(false);
    expect(signer.verifyRecords([records[1]], { ev_2: sigs.records.ev_1 })).toBe(false);
  });

  it("rejects missing signatures and inherited property names", () => {
    expect(signer.verifyRecords(records, undefined)).toBe(false);
    expect(signer.verifyRecords([{ ...records[1], id: "constructor" }], {})).toBe(false);
    expect(signer.verifySignals(signals, undefined)).toBe(false);
  });

  it("rejects edited signals and signatures made with another secret", () => {
    expect(signer.verifySignals({ ...signals, entityIds: ["MOCK-ARTIST-2"] }, sigs.signals)).toBe(false);
    const other = createLedgerSigner("another-secret-entirely").sign({ evidence: records });
    expect(signer.verifyRecords(records, other.records)).toBe(false);
  });

  it("does not let a record signature pass as a share signature", () => {
    expect(signer.verifyShared([records[1]], sigs.records)).toBe(false);
  });
});

describe("resolveLedgerSecret", () => {
  it("uses LEDGER_SECRET when it is long enough", () => {
    const warn = vi.fn();
    expect(resolveLedgerSecret({ LEDGER_SECRET: " 0123456789abcdef-long " }, warn)).toBe("0123456789abcdef-long");
    expect(warn).not.toHaveBeenCalled();
  });

  it("generates a random per-process secret and warns when it is missing or too short", () => {
    const warn = vi.fn();
    const a = resolveLedgerSecret({}, warn);
    const b = resolveLedgerSecret({ LEDGER_SECRET: "abc123" }, warn);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1][0])).not.toContain("abc123");
  });
});
