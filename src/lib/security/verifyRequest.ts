import type { CompareRequest } from "@/lib/agent/compare/request";
import type { RefineRequest } from "@/lib/agent/refine/request";
import type { LedgerSigner } from "./ledgerSig";

/**
 * Checks the signatures a browser echoes back. Each function returns a user-safe message when the data is
 * not what the server issued, or undefined when it is.
 */

const NOT_VERIFIED = "This brief's evidence could not be verified, so it cannot be used for this request. Please start a new brief.";

export function verifyRefineRequest(r: RefineRequest, signer: LedgerSigner): string | undefined {
  if (!signer.verifyRecords(r.evidence, r.signatures?.records)) return NOT_VERIFIED;
  if (r.signals && !signer.verifySignals(r.signals, r.signatures?.signals)) return NOT_VERIFIED;
  return undefined;
}

export function verifyCompareRequest(r: CompareRequest, signer: LedgerSigner): string | undefined {
  if (r.signals && !signer.verifySignals(r.signals, r.signatures?.signals)) return NOT_VERIFIED;
  return undefined;
}
