import { describe, expect, it } from "vitest";
import type { BriefSignals } from "@/lib/agent/events";
import type { Evidence } from "@/lib/agent/ledger";
import type { CompareRequest } from "@/lib/agent/compare/request";
import type { RefineRequest } from "@/lib/agent/refine/request";
import { createLedgerSigner } from "./ledgerSig";
import { verifyCompareRequest, verifyRefineRequest } from "./verifyRequest";

const signer = createLedgerSigner("a-test-secret-of-length");
const evidence: Evidence[] = [
  { id: "ev_1", endpoint: "/v2/insights", params: { type: "artist" }, summary: "1 results; top: A", entities: [{ id: "MOCK-ARTIST-1", name: "A", affinity: 0.9 }] },
  { id: "ev_2", endpoint: "/v2/tags", params: {}, summary: "1 tags; top: Indie", tags: [{ id: "urn:tag:genre:media:indie", name: "Indie" }] },
];
const signals: BriefSignals = { entityIds: ["MOCK-ARTIST-1"], tagIds: [], entityNames: ["A"], tagNames: [] };
const signed = signer.sign({ evidence, signals });

const refine = (over: Partial<RefineRequest> = {}): RefineRequest =>
  ({
    prompt: "p",
    mode: "know_audience",
    brief: {},
    evidence,
    signals,
    signatures: { records: signed.records, signals: signed.signals },
    feedback: { liked: [], disliked: ["x"], locked: [] },
    ...over,
  }) as unknown as RefineRequest;

describe("verifyRefineRequest", () => {
  it("accepts evidence and signals exactly as the server issued them", () => {
    expect(verifyRefineRequest(refine(), signer)).toBeUndefined();
  });

  it("accepts a cited subset of the ledger", () => {
    expect(verifyRefineRequest(refine({ evidence: [evidence[1]] }), signer)).toBeUndefined();
  });

  it("rejects a record the browser edited", () => {
    const forged = { ...evidence[0], entities: [{ id: "MOCK-ARTIST-1", name: "A", affinity: 1 }] };
    expect(verifyRefineRequest(refine({ evidence: [forged, evidence[1]] }), signer)).toMatch(/verified/);
  });

  it("rejects an invented record and missing signatures", () => {
    const invented: Evidence = { ...evidence[1], id: "ev_77", summary: "1 tags; top: Fake" };
    expect(verifyRefineRequest(refine({ evidence: [...evidence, invented] }), signer)).toBeDefined();
    expect(verifyRefineRequest(refine({ signatures: undefined }), signer)).toBeDefined();
  });

  it("rejects edited signals but allows a request without signals", () => {
    expect(verifyRefineRequest(refine({ signals: { ...signals, entityIds: ["MOCK-ARTIST-9"] } }), signer)).toBeDefined();
    expect(verifyRefineRequest(refine({ signals: undefined }), signer)).toBeUndefined();
  });

  it("does not echo the data in its message", () => {
    const message = verifyRefineRequest(refine({ evidence: [{ ...evidence[0], summary: "SECRET-SUMMARY" }] }), signer);
    expect(message).not.toContain("SECRET-SUMMARY");
  });
});

describe("verifyCompareRequest", () => {
  const compare = (over: Partial<CompareRequest> = {}): CompareRequest =>
    ({ prompt: "p", mode: "know_audience", city: "London", signals, signatures: { signals: signed.signals }, ...over }) as CompareRequest;

  it("accepts signed signals and a request without signals", () => {
    expect(verifyCompareRequest(compare(), signer)).toBeUndefined();
    expect(verifyCompareRequest(compare({ signals: undefined, signatures: undefined }), signer)).toBeUndefined();
  });

  it("rejects tampered or unsigned signals", () => {
    expect(verifyCompareRequest(compare({ signals: { ...signals, tagIds: ["urn:tag:x"] } }), signer)).toBeDefined();
    expect(verifyCompareRequest(compare({ signatures: undefined }), signer)).toBeDefined();
  });
});
