import type { CSSProperties } from "react";
import type { Brief } from "@/ui/contract";
import { inkFor } from "./Swatches";

const MAX_BANDS = 5;
const MAX_NAMES = 3;

/**
 * A miniature brief cover for the home page: the brief's own palette as colour bands, its title and a few
 * grounded names. Decorative; the real brief is one click away in the showcase.
 */
export function Specimen({ brief, city, real }: { brief: Brief; city?: string; real: boolean }) {
  const bands = brief.aesthetic.palette.slice(0, MAX_BANDS);
  const names = brief.sound.artists.slice(0, MAX_NAMES).map((a) => a.label);
  // Real reference places (the cafes themselves) come first; hotspot directions are only a fallback.
  const reference = brief.aesthetic.referencePlaces;
  const places = (reference.length > 0 ? reference : (brief.whereTheyAre?.hotspots ?? [])).slice(0, MAX_NAMES).map((p) => p.label);
  return (
    <figure className="specimen" aria-label={real ? "Preview of a real brief" : "Preview of a sample brief"}>
      <div className="specimen__sheet" aria-hidden="true">
        <p className="specimen__kicker">
          {real ? "From a real run" : "Sample brief"}
          {city ? `, ${city}` : ""}
        </p>
        <p className="specimen__title">{brief.title}</p>
        <div className="specimen__bands">
          {bands.map((s, i) => (
            <span key={`${s.hex}-${s.label}`} className="specimen__band" style={{ background: s.hex, color: inkFor(s.hex), "--i": i } as CSSProperties}>
              <span className="specimen__bandlabel">{s.label}</span>
            </span>
          ))}
        </div>
        <dl className="specimen__facts">
          {names.length > 0 ? (
            <div>
              <dt>Sound</dt>
              <dd>{names.join(", ")}</dd>
            </div>
          ) : null}
          {places.length > 0 ? (
            <div>
              <dt>Places</dt>
              <dd>{places.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        <p className="specimen__stamp">
          {Math.round(brief.groundingScore * 100)}
          <small>%</small> of lines cite a Qloo record
        </p>
      </div>
    </figure>
  );
}
