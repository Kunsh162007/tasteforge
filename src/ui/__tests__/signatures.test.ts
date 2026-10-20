import { describe, expect, it, vi } from "vitest";
import { decodeShare, encodeShare } from "@/lib/share/codec";
import { demoRunState } from "../demoState";
import { signaturesFor } from "../feedback";
import { INITIAL_RUN, reduceEvent } from "../runState";
import { sharePayloadFromRun, verifyShare } from "../share";
import { showcaseToRunState, type ShowcaseItem } from "../showcase";
import { sampleBrief, sampleEvidence } from "../fixtures/sampleBrief";

const shared = Object.fromEntries([...sampleEvidence.map((e) => [e.id, `shared-${e.id}`]), ["ev_77", "shared-unused"]]);
const signatures = { records: { ev_1: "rec-1" }, shared, signals: "sig-signals" };

describe("signatures in run state", () => {
  it("keeps the signatures of the latest brief event", () => {
    const withSigs = reduceEvent(INITIAL_RUN, { type: "brief", brief: sampleBrief, dropped: [], evidence: sampleEvidence, signatures });
    expect(withSigs.signatures).toEqual(signatures);
    const without = reduceEvent(withSigs, { type: "brief", brief: sampleBrief, dropped: [], evidence: sampleEvidence });
    expect(without.signatures).toBeUndefined();
  });

  it("replays signatures from a showcase entry", () => {
    const item = { id: "x", title: "t", prompt: "p", mode: "know_audience", status: "ready", brief: sampleBrief, evidence: sampleEvidence, signatures } as unknown as ShowcaseItem;
    expect(showcaseToRunState(item)?.signatures).toEqual(signatures);
  });
});

describe("signaturesFor", () => {
  it("picks only the signatures of the given records, ignoring inherited names", () => {
    expect(signaturesFor({ ev_1: "a", ev_2: "b" }, [sampleEvidence[0]])).toEqual({ ev_1: "a" });
    expect(signaturesFor(undefined, sampleEvidence)).toEqual({});
    expect(signaturesFor({}, [{ ...sampleEvidence[0], id: "constructor" }])).toEqual({});
  });
});

describe("share links carry the signatures of the cited evidence", () => {
  const done = { ...demoRunState, signatures, request: { prompt: "A couple who love A24.", mode: "know_audience" as const, city: "Brooklyn" } };

  it("includes only cited records' signatures and survives the link", () => {
    const payload = sharePayloadFromRun(done);
    expect(payload?.signatures).toBeDefined();
    expect(Object.keys(payload?.signatures ?? {})).not.toContain("ev_77");
    expect(Object.keys(payload?.signatures ?? {}).sort()).toEqual(payload?.evidence.map((e) => e.id).sort());
    if (!payload) throw new Error("no payload");
    const decoded = decodeShare(encodeShare(payload));
    expect(decoded.ok && decoded.value.signatures).toEqual(payload.signatures);
  });

  it("leaves signatures out when the run has none", () => {
    const payload = sharePayloadFromRun({ ...done, signatures: undefined });
    expect(payload && "signatures" in payload).toBe(false);
  });
});

describe("verifyShare", () => {
  const payload = { ...(sharePayloadFromRun({ ...demoRunState, signatures }) ?? (() => { throw new Error("no payload"); })()) };
  const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

  it("is unverified without calling the server when the link carries no signatures", async () => {
    const fetchImpl = reply({ verified: true });
    expect(await verifyShare({ ...payload, signatures: undefined }, fetchImpl)).toBe("unverified");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the evidence and signatures and reports what the server says", async () => {
    const fetchImpl = reply({ verified: true });
    expect(await verifyShare(payload, fetchImpl)).toBe("verified");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/verify");
    expect(JSON.parse(String(init.body))).toEqual({ evidence: payload.evidence, signatures: payload.signatures });
    expect(await verifyShare(payload, reply({ verified: false }))).toBe("unverified");
  });

  it("treats errors and odd replies as unverified", async () => {
    expect(await verifyShare(payload, reply({ verified: true }, false))).toBe("unverified");
    expect(await verifyShare(payload, reply({}))).toBe("unverified");
    expect(await verifyShare(payload, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("unverified");
  });
});
