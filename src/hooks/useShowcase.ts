"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchShowcase, isSettled, pollDelay, POLL_BUDGET_MS, type ShowcaseItem } from "@/ui/showcase";

export type ShowcasePhase = "closed" | "loading" | "polling" | "settled" | "timeout" | "unavailable";

/** Opens the showcase and polls /api/showcase with backoff until every item is ready (max ~60s). */
export function useShowcase() {
  const [phase, setPhase] = useState<ShowcasePhase>("closed");
  const [items, setItems] = useState<readonly ShowcaseItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const open = useCallback(async (retryFailed = false) => {
    stop();
    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();
    setPhase("loading");
    for (let attempt = 0; ; attempt++) {
      const next = await fetchShowcase(controller.signal, retryFailed && attempt === 0);
      if (controller.signal.aborted) return;
      if (!next) {
        setPhase("unavailable");
        return;
      }
      setItems(next);
      if (isSettled(next)) {
        setPhase("settled");
        return;
      }
      if (Date.now() - started >= POLL_BUDGET_MS) {
        setPhase("timeout");
        return;
      }
      setPhase("polling");
      await new Promise((resolve) => setTimeout(resolve, pollDelay(attempt)));
      if (controller.signal.aborted) return;
    }
  }, [stop]);

  const close = useCallback(() => {
    stop();
    setPhase("closed");
  }, [stop]);

  return { phase, items, open, close };
}
