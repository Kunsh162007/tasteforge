import Link from "next/link";
import type { ReactNode } from "react";
import { Colophon } from "./Colophon";
import { Logo } from "./Logo";

/** Masthead, main column and colophon for pages outside the main app flow (shared brief, 404). */
export function PageShell({ children, tools }: { children: ReactNode; tools?: ReactNode }) {
  return (
    <div className="shell">
      <header className="masthead">
        <Link className="masthead__mark" href="/">
          <Logo />
          TasteForge
        </Link>
        <p className="masthead__tag">A brief for your café, with receipts.</p>
        {tools ? <div className="masthead__tools">{tools}</div> : null}
      </header>
      <main id="main" className="stage-area">
        {children}
      </main>
      <Colophon />
    </div>
  );
}
