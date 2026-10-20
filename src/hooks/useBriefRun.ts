"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { BriefRequestBody, NeedsInputOption, UiEvent } from "@/ui/contract";
import { citedEvidence, signaturesFor, type RefineFeedback } from "@/ui/feedback";
import { INITIAL_RUN, reduceEvent, startRefine, startRun, type RunState } from "@/ui/runState";
import { BriefStreamError, streamBrief, streamRefine } from "@/ui/stream";

type Action = { kind: "start"; request: BriefRequestBody } | { kind: "refine_start" } | { kind: "event"; event: UiEvent } | { kind: "fail"; message: string; retryable: boolean } | { kind: "reset" } | { kind: "load"; state: RunState };

function reducer(state: RunState, action: Action): RunState {
  switch (action.kind) {
    case "start":
      return startRun({ prompt: action.request.prompt, mode: action.request.mode, ...(action.request.city ? { city: action.request.city } : {}) });
    case "refine_start":
      return startRefine(state);
    case "event":
      return reduceEvent(state, action.event);
    case "fail":
      return reduceEvent(state, { type: "error", message: action.message, retryable: action.retryable });
    case "load":
      return { ...action.state, ended: true };
    case "reset":
      return INITIAL_RUN;
  }
}

function describeStreamError(e: unknown): { message: string; retryable: boolean } {
  if (e instanceof BriefStreamError) return { message: e.message, retryable: e.retryable };
  return { message: "Something interrupted the stream. Try again.", retryable: true };
}

export function useBriefRun(initial: RunState = INITIAL_RUN) {
  const [state, dispatch] = useReducer(reducer, initial);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequest = useRef<BriefRequestBody | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (body: BriefRequestBody) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastRequest.current = body;
    dispatch({ kind: "start", request: body });
    try {
      await streamBrief(body, (event) => dispatch({ kind: "event", event }), controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      dispatch({ kind: "fail", ...describeStreamError(e) });
    }
  }, []);

  /** Sends the user's marks; the current brief stays on screen while the refined one streams in. */
  const refine = useCallback(async (feedback: RefineFeedback) => {
    const { brief, request, evidence, signals, signatures } = state;
    if (!brief || !request) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ kind: "refine_start" });
    const cited = citedEvidence(brief, evidence);
    const echoed = { records: signaturesFor(signatures?.records, cited), ...(signatures?.signals ? { signals: signatures.signals } : {}) };
    const body = { ...request, brief, evidence: cited, ...(signals ? { signals } : {}), signatures: echoed, feedback };
    try {
      await streamRefine(body, (event) => dispatch({ kind: "event", event }), controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      dispatch({ kind: "fail", ...describeStreamError(e) });
    }
  }, [state]);

  const choose = useCallback(
    (selections: NeedsInputOption[]) => {
      if (lastRequest.current) void run({ ...lastRequest.current, selections });
    },
    [run],
  );

  const retry = useCallback(() => {
    if (lastRequest.current) void run(lastRequest.current);
  }, [run]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ kind: "reset" });
  }, []);

  const load = useCallback((next: RunState) => dispatch({ kind: "load", state: next }), []);

  return { state, run, refine, choose, retry, reset, load };
}
