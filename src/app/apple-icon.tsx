import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#15171c" }}>
        <div style={{ width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "#f4efe4", color: "#2433d9", fontSize: 110, fontWeight: 800 }}>
          T
        </div>
      </div>
    ),
    size,
  );
}
