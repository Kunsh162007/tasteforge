import { encodeShare, type SharePayload } from "@/lib/share/codec";
import { citedEvidence, signaturesFor } from "./feedback";
import type { RunState } from "./runState";

/** What a share link carries for a finished run, or null when there is no brief yet. */
export function sharePayloadFromRun(state: RunState): SharePayload | null {
  const { brief, request } = state;
  if (!brief) return null;
  const city = request?.city ?? brief.whereTheyAre?.city;
  const evidence = citedEvidence(brief, state.evidence);
  const signatures = signaturesFor(state.signatures?.shared, evidence);
  return {
    brief,
    evidence,
    ...(Object.keys(signatures).length > 0 ? { signatures } : {}),
    ...(state.proof ? { proof: state.proof } : {}),
    prompt: request?.prompt ?? "",
    mode: request?.mode ?? brief.mode,
    ...(city ? { city } : {}),
  };
}

export const shareLink = (origin: string, payload: SharePayload): string => `${origin}/b#${encodeShare(payload)}`;

export type ShareVerification = "verified" | "unverified";

/**
 * Asks the server whether the evidence on a share link is what it issued. Links without signatures (older
 * links, or briefs from before a server restart) are unverified without a request; any failure is unverified.
 */
export async function verifyShare(payload: SharePayload, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<ShareVerification> {
  if (!payload.signatures || Object.keys(payload.signatures).length === 0) return "unverified";
  try {
    const res = await fetchImpl("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence: payload.evidence, signatures: payload.signatures }),
      signal,
    });
    if (!res.ok) return "unverified";
    const json = (await res.json()) as { verified?: unknown };
    return json.verified === true ? "verified" : "unverified";
  } catch {
    return "unverified";
  }
}
