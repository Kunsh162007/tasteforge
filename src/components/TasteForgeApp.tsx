"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBriefRun } from "@/hooks/useBriefRun";
import { useCompare } from "@/hooks/useCompare";
import { useShowcase } from "@/hooks/useShowcase";
import type { SlotPath } from "@/lib/agent/briefItems";
import { cityOf } from "@/ui/compareRun";
import type { Item } from "@/ui/contract";
import { demoRunState } from "@/ui/demoState";
import {
  buildFeedback,
  canRefine,
  countFeedback,
  itemKey,
  NO_FEEDBACK,
  pruneFeedback,
  toggleLock,
  toggleMark,
  type FeedbackState,
  type Mark,
} from "@/ui/feedback";
import { showcaseToRunState, type ShowcaseItem } from "@/ui/showcase";
import { BriefView } from "./BriefView";
import { CompareBar } from "./CompareBar";
import { CompareView } from "./CompareView";
import { EvidenceProvider } from "./EvidenceContext";
import { Home } from "./Home";
import { Logo } from "./Logo";
import { FeedbackContext, type FeedbackApi } from "./FeedbackContext";
import { ChangeSummary, RefineBar, RefineHint } from "./RefineBar";
import { ShareButton } from "./ShareButton";
import { TasteProofPanel } from "./TasteProofPanel";
import { WalkView } from "./WalkView";

export function TasteForgeApp({ demo = false }: { demo?: boolean }) {
  const { state, run, refine, choose, retry, reset, load } = useBriefRun(demo ? demoRunState : undefined);
  const showcase = useShowcase();
  const compare = useCompare();
  const [feedback, setFeedback] = useState<FeedbackState>(NO_FEEDBACK);
  const [seenBrief, setSeenBrief] = useState(state.brief);
  const [dismissedChanges, setDismissedChanges] = useState(state.changes);

  // The showcase is the primary path on the home page, so it loads as soon as the page does.
  const openShowcase = showcase.open;
  useEffect(() => {
    if (!demo) void openShowcase();
  }, [demo, openShowcase]);

  // A new brief arrives: after a refine, keep marks on items that survived; for a fresh run, start clean.
  if (state.brief !== seenBrief) {
    setSeenBrief(state.brief);
    setFeedback((f) => (state.brief && state.changes ? pruneFeedback(f, state.brief) : NO_FEEDBACK));
  }

  const canMark = Boolean(state.request);
  const changed = useMemo(() => new Set(state.changes?.addedKeys ?? []), [state.changes]);
  const api = useMemo<FeedbackApi>(
    () => ({
      stateOf: (path: SlotPath, item: Item) => {
        const key = itemKey(path, item);
        return { mark: feedback.marks[key], locked: feedback.locked[key] === true, changed: changed.has(key) };
      },
      toggleMark: (path: SlotPath, item: Item, mark: Mark) => setFeedback((f) => toggleMark(f, itemKey(path, item), mark)),
      toggleLock: (path: SlotPath, item: Item) => setFeedback((f) => toggleLock(f, itemKey(path, item))),
    }),
    [feedback, changed],
  );

  const openItem = (item: ShowcaseItem) => {
    compare.close();
    const next = showcaseToRunState(item);
    if (!next) return;
    load(next);
  };

  const hasBrief = state.phase === "done" && state.brief;
  const cityA = cityOf(state);
  const comparing = Boolean(hasBrief && compare.state && cityA);
  const startCompare = (cityB: string) => {
    if (!state.request) return;
    const signalSig = state.signatures?.signals;
    void compare.start({ prompt: state.request.prompt, mode: state.request.mode, signals: state.signals, ...(signalSig ? { signatures: { signals: signalSig } } : {}) }, cityB);
  };
  // The brief can arrive before its proof: show a placeholder until the proof lands, the stage fails or the stream ends.
  const proofPending = !state.ended && !state.proof && state.stages.proof.status !== "failed" && state.stages.proof.status !== "skipped";
  const inWalk = state.phase === "running" || state.phase === "needs_input" || state.phase === "error";

  return (
    <div className="shell">
      <header className="masthead">
        <Link className="masthead__mark" href="/" onClick={(e) => { if (state.phase !== "idle") { e.preventDefault(); compare.close(); reset(); } }}>
          <Logo />
          TasteForge
        </Link>
        <p className="masthead__tag">Cultural briefs, grounded in what people actually love.</p>
        {hasBrief ? (
          <div className="masthead__tools">
            <ShareButton run={state} />
            <button type="button" className="link-quiet" onClick={() => window.print()}>
              Print or save as PDF
            </button>
            <button type="button" className="link-quiet" onClick={() => { compare.close(); reset(); }}>
              New brief
            </button>
          </div>
        ) : null}
      </header>

      <main id="main" className="stage-area">
        {state.phase === "idle" ? (
          <Home
            showcasePhase={showcase.phase}
            showcaseItems={showcase.items}
            onOpenShowcase={openItem}
            onRetryShowcase={() => void showcase.open(true)}
            onSubmit={run}
          />
        ) : null}

        {inWalk ? <WalkView state={state} onChoose={choose} onRetry={retry} onReset={reset} /> : null}

        {comparing && state.brief && compare.state && cityA ? (
          <CompareView
            a={{ city: cityA, brief: state.brief, dropped: state.dropped, evidence: state.evidence }}
            b={compare.state}
            cityB={compare.state.request?.city ?? ""}
            onClose={compare.close}
            onRetry={compare.retry}
          />
        ) : null}

        {hasBrief && state.brief && !comparing ? (
          <EvidenceProvider evidence={state.evidence}>
            <FeedbackContext.Provider value={canMark ? api : null}>
              {canMark && !state.changes && !state.refine ? <RefineHint /> : null}
              {state.changes && state.changes !== dismissedChanges ? (
                <ChangeSummary changes={state.changes} onDismiss={() => setDismissedChanges(state.changes)} />
              ) : null}
              <BriefView brief={state.brief} dropped={state.dropped} hasProof={Boolean(state.proof) || proofPending} />
              <TasteProofPanel proof={state.proof} pending={proofPending} />
              {canMark && cityA ? <CompareBar city={cityA} onCompare={startCompare} /> : null}
              {canMark ? (
                <RefineBar
                  counts={countFeedback(feedback)}
                  canRefine={canRefine(feedback)}
                  refine={state.refine}
                  stages={state.stages}
                  onRefine={() => void refine(buildFeedback(feedback))}
                  onClear={() => setFeedback(NO_FEEDBACK)}
                />
              ) : null}
            </FeedbackContext.Provider>
          </EvidenceProvider>
        ) : null}
      </main>

      <footer className="colophon">
        <p>Affinity scores and evidence come from Qloo. Sample data in demo mode is synthetic.</p>
      </footer>
    </div>
  );
}
