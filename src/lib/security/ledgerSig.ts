import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BriefSignals, LedgerSignatures } from "@/lib/agent/events";
import type { Evidence } from "@/lib/agent/ledger";
import { slimEvidence } from "@/lib/share/codec";
import { singleton } from "@/lib/singleton";

/**
 * HMAC signatures over the evidence ledger. Refine, compare and share links carry data the browser held in
 * between, so the server signs what it produced and checks the signature when the data comes back. A signature
 * covers one record (or the signal set) exactly as issued, so edited, invented or swapped records fail.
 */

const SIGNATURE_CHARS = 22; // 128 bits of the HMAC-SHA256, base64url
const MIN_SECRET_CHARS = 16;
const SECRET_BYTES = 32;

type Env = Readonly<Record<string, string | undefined>>;

/** JSON with sorted keys and no undefined values, so equal data always serialises equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type LedgerSigner = {
  sign(input: { evidence: readonly Evidence[]; signals?: BriefSignals }): LedgerSignatures;
  signSignals(signals: BriefSignals): string;
  /** True when every record has a matching full-record signature. */
  verifyRecords(records: readonly Evidence[], signatures: Readonly<Record<string, string>> | undefined): boolean;
  /** True when every (slimmed) record has a matching share signature. */
  verifyShared(records: readonly Evidence[], signatures: Readonly<Record<string, string>> | undefined): boolean;
  verifySignals(signals: BriefSignals, signature: string | undefined): boolean;
};

export function createLedgerSigner(secret: string | Buffer): LedgerSigner {
  const mac = (domain: string, value: unknown): string =>
    createHmac("sha256", secret).update(`${domain}\n${canonicalJson(value)}`).digest("base64url").slice(0, SIGNATURE_CHARS);
  const matches = (expected: string, given: string | undefined): boolean => {
    if (typeof given !== "string" || given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  };
  const allMatch = (domain: string, records: readonly Evidence[], sigs: Readonly<Record<string, string>> | undefined): boolean =>
    sigs !== undefined && records.every((r) => matches(mac(domain, r), Object.hasOwn(sigs, r.id) ? sigs[r.id] : undefined));

  const signSignals = (s: BriefSignals): string => mac("signals", s);
  return {
    signSignals,
    sign({ evidence, signals }) {
      return {
        records: Object.fromEntries(evidence.map((r) => [r.id, mac("record", r)])),
        shared: Object.fromEntries(evidence.map((r) => [r.id, mac("shared", slimEvidence(r))])),
        ...(signals ? { signals: signSignals(signals) } : {}),
      };
    },
    verifyRecords: (records, sigs) => allMatch("record", records, sigs),
    verifyShared: (records, sigs) => allMatch("shared", records, sigs),
    verifySignals: (signals, sig) => matches(signSignals(signals), sig),
  };
}

/** The secret from LEDGER_SECRET, or a random one for this process (links and sessions then expire on restart). */
export function resolveLedgerSecret(env: Env, warn: (message: string) => void = console.warn): string {
  const configured = env.LEDGER_SECRET?.trim();
  if (configured && configured.length >= MIN_SECRET_CHARS) return configured;
  warn(
    configured
      ? `[tasteforge] LEDGER_SECRET is shorter than ${MIN_SECRET_CHARS} characters: using a random per-process secret instead.`
      : "[tasteforge] LEDGER_SECRET is not set: using a random per-process secret. Shared links and in-flight briefs stop verifying after a restart; set LEDGER_SECRET to keep them valid.",
  );
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/** The signer for this server process. */
export const getLedgerSigner = (): LedgerSigner => singleton("ledgerSigner", () => createLedgerSigner(resolveLedgerSecret(process.env)));
