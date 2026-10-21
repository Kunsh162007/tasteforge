import { ImageResponse } from "next/og";

export const alt = "TasteForge: cultural briefs grounded in what people actually love";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#15171c";
const PAPER = "#f4efe4";
const ACCENT = "#2433d9";
const SWATCHES = ["#C98B3E", "#8E4A3A", "#3F5A45", "#EADFC8", "#1E2230"];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, color: INK, padding: 72, border: `12px solid ${INK}` }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: ACCENT }}>TasteForge</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>A brief for your</div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>café, with receipts.</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#4a4d57" }}>Who your crowd is, what they play, where they gather. Every line backed by a Qloo record.</div>
        </div>
        <div style={{ display: "flex" }}>
          {SWATCHES.map((hex) => (
            <div key={hex} style={{ width: 110, height: 44, background: hex, border: `3px solid ${INK}`, marginRight: 12 }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
