"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { decodeShare, type SharePayload } from "@/lib/share/codec";
import { BriefView } from "./BriefView";
import { EvidenceProvider } from "./EvidenceContext";
import { PageShell } from "./PageShell";
import { ShareVerification, useShareVerification } from "./ShareVerification";
import { TasteProofPanel } from "./TasteProofPanel";

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = (): string | null => window.location.hash;
/** The fragment is invisible to the server, so the prerendered page shows a placeholder until hydration. */
const serverHash = (): string | null => null;

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <div className="calm" role="alert">
      <p className="calm__title">{title}</p>
      <p>{children}</p>
      <div className="calm__actions">
        <Link className="btn-primary" href="/">
          Build a brief
        </Link>
      </div>
    </div>
  );
}

function Shared({ payload }: { payload: SharePayload }) {
  const evidence = useMemo(() => Object.fromEntries(payload.evidence.map((e) => [e.id, e])), [payload]);
  const verification = useShareVerification(payload);
  return (
    <EvidenceProvider evidence={evidence}>
      <ShareVerification status={verification} />
      <aside className="shared-note" aria-label="About this shared brief">
        <p>
          <strong>Shared brief, read-only.</strong>
          {payload.city ? ` ${payload.city}.` : ""} Open any &ldquo;why&rdquo; to see the Qloo evidence behind a line.
        </p>
        {payload.prompt ? <p className="muted">Brief asked for: &ldquo;{payload.prompt}&rdquo;</p> : null}
      </aside>
      <BriefView brief={payload.brief} dropped={[]} />
      <TasteProofPanel proof={payload.proof} pending={false} />
      <p className="shared-cta">
        <Link className="btn-primary" href="/">
          Build your own brief
        </Link>
      </p>
    </EvidenceProvider>
  );
}

/** Read-only view of a brief carried entirely in the URL fragment (`/b#<data>`). */
export function SharedBrief() {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const result = useMemo(() => (hash !== null && hash.length > 1 ? decodeShare(hash) : null), [hash]);

  return (
    <PageShell
      tools={
        <button type="button" className="link-quiet" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      }
    >
      {hash === null ? (
        <p className="muted" role="status">
          Opening the shared brief...
        </p>
      ) : result === null ? (
        <Notice title="This link has no brief in it.">Share links look like /b# followed by a long code. Ask the sender to copy the link again, or build a new brief.</Notice>
      ) : result.ok ? (
        <Shared payload={result.value} />
      ) : (
        <Notice title="We could not open this brief.">{result.message}</Notice>
      )}
    </PageShell>
  );
}
