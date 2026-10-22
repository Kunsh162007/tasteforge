import { connection, NextResponse } from "next/server";
import { buildHealth } from "@/lib/env";
import { quotaSummary } from "@/lib/qloo/quota";
import pkg from "../../../../package.json";

/** Liveness and configuration summary for hosts and uptime checks. Booleans only: no keys, no values. */
export async function GET(): Promise<Response> {
  await connection(); // read the environment at request time, not at build time
  const health = buildHealth(process.env, pkg.version);
  // Counts only: the latest month allowance Qloo reported on a live call (null until one happened).
  const body = { ...health, qloo: { ...health.qloo, quota: quotaSummary(process.env) } };
  return NextResponse.json(body, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
