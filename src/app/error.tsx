"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";

/** Last-resort boundary for render errors; the message never exposes details. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell>
      <section className="lost" aria-labelledby="oops-h">
        <h1 id="oops-h" className="lost__title">
          Something snagged on our side.
        </h1>
        <p className="lost__lede">Nothing you did. Try again, or start a fresh brief.</p>
        <div className="lost__actions">
          <button type="button" className="btn-primary" onClick={reset}>
            Try again
          </button>
          <Link className="link-quiet" href="/">
            Back to the start
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
