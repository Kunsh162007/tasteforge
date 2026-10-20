/** Runs once when the server starts: checks the environment and fails fast, with clear messages, in production. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateEnv } = await import("./lib/env");
  const { errors, warnings } = validateEnv(process.env);
  for (const warning of warnings) console.warn(`[tasteforge] warning: ${warning}`);
  if (errors.length === 0) return;
  const report = errors.map((e) => `  - ${e}`).join("\n");
  if (process.env.NODE_ENV === "production") {
    throw new Error(`TasteForge cannot start: invalid environment.\n${report}`);
  }
  console.error(`[tasteforge] environment problems (briefs will fail until fixed):\n${report}`);
}
