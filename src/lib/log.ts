/**
 * Server-side warnings for failures the app deliberately recovers from. Only the error message is logged:
 * the clients behind it never put keys or request details into their messages.
 */
export function logWarn(scope: string, error: unknown): void {
  const message = error instanceof Error && error.message ? error.message : "unknown error";
  console.warn(`[tasteforge] ${scope}: ${message}`);
}
