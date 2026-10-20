"use client";

import type { CSSProperties } from "react";
import type { Swatch } from "@/ui/contract";
import { useFeedback } from "./FeedbackContext";
import { ItemFeedback } from "./ItemFeedback";
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

export function Swatches({ palette }: { palette: readonly Swatch[] }) {
  const feedback = useFeedback();
  if (palette.length === 0) return <p className="muted">No palette could be grounded.</p>;
  return (
    <ul className="swatches">
      {palette.map((s, i) => {
        const state = feedback?.stateOf("aesthetic.palette", s);
        return (
          <li
            key={`${s.hex}-${s.label}`}
            className="swatch"
            style={{ "--i": i } as CSSProperties}
            data-mark={state?.mark}
            data-locked={state?.locked ? "true" : undefined}
            data-changed={state?.changed ? "true" : undefined}
          >
            <div className="swatch__chip" style={{ background: s.hex, color: inkFor(s.hex) }}>
              <span className="swatch__hex">{s.hex.toUpperCase()}</span>
            </div>
            <div className="swatch__meta">
              <span className="swatch__label">{s.label}</span>
              <WhyChip ids={s.evidence} label={s.label} />
            </div>
            {s.detail ? <p className="swatch__detail">{s.detail}</p> : null}
            <ItemFeedback path="aesthetic.palette" item={s} />
          </li>
        );
      })}
    </ul>
  );
}
