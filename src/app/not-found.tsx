import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <PageShell>
      <section className="lost" aria-labelledby="lost-h">
        <p className="lost__code" aria-hidden="true">
          404
        </p>
        <h1 id="lost-h" className="lost__title">
          That page is off the map.
        </h1>
        <p className="lost__lede">The link may be old or mistyped. The taste graph is still here, and so is the way back to a fresh brief.</p>
        <div className="lost__actions">
          <Link className="btn-primary" href="/">
            Build a brief
          </Link>
          <Link className="link-quiet" href="/?demo=1">
            See a sample brief
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
