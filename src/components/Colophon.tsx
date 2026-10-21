"use client";

import { useEffect, useState } from "react";

type Mode = "live" | "mock" | "unknown";

export const COLOPHON_TEXT: Record<Mode, string> = {
  live: "Evidence and affinity scores come live from Qloo. A language model writes the names, captions and copy lines around that evidence.",
  mock: "Demo mode: the Qloo data on this page is synthetic sample data, not Qloo's.",
  unknown: "Evidence and affinity scores come from Qloo. A language model writes the names, captions and copy lines around that evidence.",
};

/** What the server is actually running on: live Qloo data or the synthetic mock. Unknown until /api/health answers (or if it cannot). */
async function readMode(signal: AbortSignal): Promise<Mode> {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal });
    const body = (await res.json()) as { qloo?: { mode?: string } };
    return body.qloo?.mode === "live" ? "live" : body.qloo?.mode === "mock" ? "mock" : "unknown";
  } catch {
    return "unknown";
  }
}

/** The footer line. It says "synthetic" only when the server really is in mock mode. */
export function Colophon() {
  const [mode, setMode] = useState<Mode>("unknown");
  useEffect(() => {
    const controller = new AbortController();
    void readMode(controller.signal).then((m) => {
      if (!controller.signal.aborted) setMode(m);
    });
    return () => controller.abort();
  }, []);
  return (
    <footer className="colophon">
      <p data-mode={mode}>{COLOPHON_TEXT[mode]}</p>
    </footer>
  );
}
