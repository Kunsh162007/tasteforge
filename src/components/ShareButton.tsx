"use client";

import { useState } from "react";
import type { RunState } from "@/ui/runState";
import { shareLink, sharePayloadFromRun } from "@/ui/share";

type Status = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies a `/b#<data>` link that carries the whole brief: no account or database involved. */
export function ShareButton({ run }: { run: RunState }) {
  const [status, setStatus] = useState<Status>("idle");
  const [link, setLink] = useState("");

  const share = async () => {
    const payload = sharePayloadFromRun(run);
    if (!payload) return;
    const url = shareLink(window.location.origin, payload);
    setLink(url);
    setStatus((await copyText(url)) ? "copied" : "failed");
  };

  return (
    <>
      <button type="button" className="link-quiet" onClick={() => void share()}>
        Copy share link
      </button>
      <span className="share-status" role="status" aria-live="polite">
        {status === "copied" ? "Link copied" : null}
        {status === "failed" ? (
          <label className="share-fallback">
            <span className="sr-only">Share link</span>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link (copy manually)" />
          </label>
        ) : null}
      </span>
    </>
  );
}
