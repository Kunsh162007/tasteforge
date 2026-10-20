import type { ReactNode } from "react";
import type { Confidence } from "@/ui/contract";

const CONF_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
const CONF_PIPS: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function ConfidenceMark({ level }: { level?: Confidence }) {
  if (!level) return null;
  return (
    <p className="confidence" data-level={level}>
      <span className="confidence__pips" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= CONF_PIPS[level] ? "is-on" : undefined} />
        ))}
      </span>
      <span>{CONF_LABEL[level]} confidence</span>
    </p>
  );
}

/** Editorial section: title and confidence in the margin, content in the main column. */
export function Section({
  id,
  title,
  confidence,
  children,
}: {
  id: string;
  title: string;
  confidence?: Confidence;
  children: ReactNode;
}) {
  return (
    <section className="bsection" aria-labelledby={`${id}-h`}>
      <header className="bsection__margin">
        <h2 id={`${id}-h`} className="bsection__title">
          {title}
        </h2>
        <ConfidenceMark level={confidence} />
      </header>
      <div className="bsection__body">{children}</div>
    </section>
  );
}
