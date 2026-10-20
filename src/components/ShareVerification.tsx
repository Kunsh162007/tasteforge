"use client";

import { useEffect, useState } from "react";
import type { SharePayload } from "@/lib/share/codec";
import { verifyShare, type ShareVerification as Verification } from "@/ui/share";

type Status = Verification | "checking";

/** Checks a share link's evidence signature with the server; "checking" until the answer arrives. */
export function useShareVerification(payload: SharePayload): Status {
  const [result, setResult] = useState<{ payload: SharePayload; status: Verification } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void verifyShare(payload, fetch, controller.signal).then((status) => {
      if (!controller.signal.aborted) setResult({ payload, status });
    });
    return () => controller.abort();
  }, [payload]);
  return result?.payload === payload ? result.status : "checking";
}

const COPY: Record<Status, { title: string; detail: string }> = {
  checking: { title: "Shared link, checking…", detail: "Confirming that the evidence on this link came from TasteForge." },
  verified: {
    title: "Shared link, verified ✓",
    detail: "The Qloo evidence behind this brief was issued by TasteForge and has not been edited.",
  },
  unverified: {
    title: "Shared link, unverified",
    detail: "We could not confirm that the evidence on this link came from TasteForge. It may have been edited, made before the server restarted, or shared from an older version.",
  },
};

export function ShareVerification({ status }: { status: Status }) {
  const { title, detail } = COPY[status];
  return (
    <aside className={`share-verify share-verify--${status}`} role="status" aria-label="Link verification">
      <p className="share-verify__title">{title}</p>
      <p className="share-verify__detail">{detail}</p>
    </aside>
  );
}
