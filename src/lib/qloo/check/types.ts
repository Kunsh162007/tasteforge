import type { QlooClient } from "../client";
import type { QlooEntity, QlooMode } from "../types";

/** Live-check types. Results hold counts and names only, never raw Qloo payloads (Qloo terms) and never keys. */

export type CheckStatus = "PASS" | "WARN" | "FAIL" | "SKIP";

export type CheckResult = {
  readonly id: string;
  readonly area: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** Recommended fix, set for WARN and FAIL. */
  readonly fix?: string;
};

/** Raw GET used for probing alternative spellings. Resolves to the HTTP status and parsed JSON (if any). */
export type Probe = (pathAndQuery: string) => Promise<{ readonly status: number; readonly body: unknown }>;

export type Seeds = {
  readonly films: readonly QlooEntity[];
  readonly artists: readonly QlooEntity[];
};

/** Names searched to get seed entities; mock mode needs names that exist in the synthetic data. */
export type SeedNames = { readonly films: readonly string[]; readonly artists: readonly string[] };

export type CheckContext = {
  readonly client: QlooClient;
  readonly probe: Probe;
  readonly mode: QlooMode;
  readonly cities: readonly string[];
  readonly seedNames?: SeedNames;
  readonly now: Date;
};

export const result = (id: string, area: string, status: CheckStatus, detail: string, fix?: string): CheckResult => ({
  id,
  area,
  status,
  detail,
  ...(fix ? { fix } : {}),
});
