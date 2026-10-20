import { connection, NextResponse } from "next/server";
import { buildHealth } from "@/lib/env";
import pkg from "../../../../package.json";

/** Liveness and configuration summary for hosts and uptime checks. Booleans only: no keys, no values. */
export async function GET(): Promise<Response> {
  await connection(); // read the environment at request time, not at build time
  const health = buildHealth(process.env, pkg.version);
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
