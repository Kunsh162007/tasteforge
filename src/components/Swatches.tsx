"use client";

import type { CSSProperties } from "react";
import type { Swatch } from "@/ui/contract";
import { useFeedback } from "./FeedbackContext";
import { ItemFeedback } from "./ItemFeedback";
import { Thin } from "./Section";
import { WhyChip } from "./WhyChip";

const INK = "#15171c";
const PAPER = "#fbf8f0";

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};

const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Picks whichever of the two inks has the higher WCAG contrast ratio against the hex background. */
export function inkFor(hex: string): typeof INK | typeof PAPER {
  const bg = luminance(hex);
  return contrast(bg, luminance(INK)) >= contrast(bg, luminance(PAPER)) ? INK : PAPER;
}

/** The mood board: the first colour is the lead and is drawn largest; label and note sit inside the colour. */
export function Swatches({ palette }: { palette: readonly Swatch[] }) {
  const feedback = useFeedback();
  if (palette.length === 0) return <Thin>No colours could be tied to Qloo&rsquo;s decor and ambience tags for this audience, so none are shown.</Thin>;
  return (
    <ul className="swatches">
      {palette.map((s, i) => {
        const state = feedback?.stateOf("aesthetic.palette", s);
        return (
          <li
            key={`${s.hex}-${s.label}`}
            className="swatch"
            style={{ "--i": i } as CSSProperties}
            data-lead={i === 0 ? "true" : undefined}
            data-mark={state?.mark}
            data-locked={state?.locked ? "true" : undefined}
            data-changed={state?.changed ? "true" : undefined}
          >
            <div className="swatch__chip" style={{ background: s.hex, color: inkFor(s.hex) }}>
              <span className="swatch__hex">
                {s.hex.toUpperCase()}
                {s.role === "accent" ? " · accent" : ""}
              </span>
              <span className="swatch__label">{s.label}</span>
              {s.tags && s.tags.length > 0 ? (
                <span className="swatch__tags">From Qloo tags: {s.tags.join(", ")}</span>
              ) : s.detail ? (
                <span className="swatch__detail">{s.detail}</span>
              ) : null}
            </div>
            <div className="swatch__meta">
              <WhyChip ids={s.evidence} label={s.label} />
              <ItemFeedback path="aesthetic.palette" item={s} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
