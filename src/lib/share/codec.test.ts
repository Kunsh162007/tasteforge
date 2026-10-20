import { describe, expect, it } from "vitest";
import { sampleBrief, sampleEvidence, sampleProof } from "@/ui/fixtures/sampleBrief";
import { citedEvidence } from "@/ui/feedback";
import { decodeShare, encodeShare, MAX_SHARE_CHARS, type SharePayload } from "./codec";

const payload: SharePayload = {
  brief: sampleBrief,
  evidence: citedEvidence(sampleBrief, Object.fromEntries(sampleEvidence.map((e) => [e.id, e]))),
  proof: sampleProof,
  prompt: "A couple who love A24 films, Radiohead and Vietnamese food.",
  mode: "know_audience",
  city: "Brooklyn",
};

describe("share codec", () => {
  it("round-trips a brief, its cited evidence and the proof", () => {
    const res = decodeShare(encodeShare(payload));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.brief.title).toBe(sampleBrief.title);
    expect(res.value.evidence).toHaveLength(payload.evidence.length);
    expect(res.value.proof?.tasteforgeAvg).toBe(sampleProof.tasteforgeAvg);
    expect(res.value.city).toBe("Brooklyn");
    expect(res.value.mode).toBe("know_audience");
  });

  it("produces a URL-fragment-safe string that is shorter than the raw JSON", () => {
    const encoded = encodeShare(payload);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(encoded.length).toBeLessThan(JSON.stringify(payload).length);
  });

  it("drops long Qloo ids that a read-only view never uses", () => {
    const withIds = { ...payload, proof: { ...sampleProof, tasteforge: sampleProof.tasteforge.map((p) => ({ ...p, qlooId: "a1b2c3d4e5f60718293a4b5c6d7e8f90" })) } };
    const res = decodeShare(encodeShare(withIds));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const json = JSON.stringify(res.value);
    expect(json).not.toContain("qlooId");
    expect(json).not.toContain("a1b2c3d4e5f6");
    expect(res.value.evidence[0].entities?.[0].name).toBe(payload.evidence[0].entities?.[0].name);
  });

  it("keeps at most 8 rows per evidence record", () => {
    const many = { id: "ev_1", endpoint: "/v2/insights", params: {}, summary: "s", entities: Array.from({ length: 12 }, (_, i) => ({ id: `E${i}`, name: `N${i}` })) };
    const res = decodeShare(encodeShare({ ...payload, evidence: [many] }));
    expect(res.ok && res.value.evidence[0].entities?.length).toBe(8);
  });

  it("works without proof and city", () => {
    const { proof: _p, city: _c, ...rest } = payload;
    void _p;
    void _c;
    const res = decodeShare(encodeShare(rest));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.proof).toBeUndefined();
  });

  it("rejects empty and garbage data with a friendly message", () => {
    for (const bad of ["", "   ", "!!!not-lz!!!", "N4Ig"]) {
      const res = decodeShare(bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(/link/i);
    }
  });

  it("rejects valid compression of the wrong shape", () => {
    const wrong = encodeShare({ ...payload, brief: { title: "x" } } as unknown as SharePayload);
    expect(decodeShare(wrong).ok).toBe(false);
  });

  it("rejects oversized data before decompressing", () => {
    expect(decodeShare("A".repeat(MAX_SHARE_CHARS + 1)).ok).toBe(false);
  });

  it("tolerates a leading # and URL-encoded characters", () => {
    expect(decodeShare(`#${encodeShare(payload)}`).ok).toBe(true);
  });
});
