"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { startCompare } from "@/ui/compareRun";
import type { BriefMode, BriefSignals, RequestSignatures, UiEvent } from "@/ui/contract";
import { reduceEvent, type RunState } from "@/ui/runState";
import { BriefStreamError, streamCompare } from "@/ui/stream";

type Action =
  | { kind: "start"; request: NonNullable<RunState["request"]> }
  | { kind: "event"; event: UiEvent }
  | { kind: "fail"; message: string; retryable: boolean }
  | { kind: "close" };

function reducer(state: RunState | null, action: Action): RunState | null {
  switch (action.kind) {
    case "start":
      return startCompare(action.request);
    case "event":
      return state ? reduceEvent(state, action.event) : state;
    case "fail":
      return state ? reduceEvent(state, { type: "error", message: action.message, retryable: action.retryable }) : state;
    case "close":
      return null;
  }
}

export type CompareBase = { prompt: string; mode: BriefMode; signals?: BriefSignals; signatures?: RequestSignatures };

/** Streams a second-city run for the side-by-side view; `state` is null while no comparison is open. */
export function useCompare() {
  const [state, dispatch] = useReducer(reducer, null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRef = useRef<{ base: CompareBase; city: string } | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async (base: CompareBase, city: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastRef.current = { base, city };
    dispatch({ kind: "start", request: { prompt: base.prompt, mode: base.mode, city } });
    try {
      await streamCompare({ prompt: base.prompt, mode: base.mode, city, ...(base.signals ? { signals: base.signals } : {}), ...(base.signatures ? { signatures: base.signatures } : {}) }, (event) => dispatch({ kind: "event", event }), controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      const known = e instanceof BriefStreamError;
      dispatch({ kind: "fail", message: known ? e.message : "Something interrupted the stream. Try again.", retryable: known ? e.retryable : true });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRef.current) void start(lastRef.current.base, lastRef.current.city);
  }, [start]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ kind: "close" });
  }, []);

  return { state, start, retry, close };
}
