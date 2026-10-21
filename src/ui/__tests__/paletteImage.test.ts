import { describe, expect, it } from "vitest";
import { BAND_HEIGHT, drawPalette, imageHeight, IMAGE_WIDTH, inkFor, type Ctx2D } from "../paletteImage";

function recorder() {
  const rects: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const texts: string[] = [];
  const ctx: Ctx2D = {
    fillStyle: "",
    font: "",
    textBaseline: "top",
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, fill: ctx.fillStyle });
    },
    fillText(text) {
      texts.push(text);
    },
  };
  return { ctx, rects, texts };
}

describe("drawPalette", () => {
  it("paints one band per colour with its name and hex code", () => {
    const { ctx, rects, texts } = recorder();
    drawPalette(ctx, [{ name: "Clay terracotta", hex: "#B5654A" }, { name: "Bone linen", hex: "#E3D3B0" }], "A cafe in Indore");
    const bands = rects.filter((r) => r.fill === "#B5654A" || r.fill === "#E3D3B0");
    expect(bands).toHaveLength(2);
    expect(bands[1].y - bands[0].y).toBe(BAND_HEIGHT);
    expect(bands[0].w).toBe(IMAGE_WIDTH);
    expect(texts).toEqual(expect.arrayContaining(["A cafe in Indore", "Clay terracotta", "#B5654A", "Bone linen", "#E3D3B0"]));
  });

  it("falls back to grey for a malformed colour and sizes the canvas to the palette", () => {
    const { ctx, rects } = recorder();
    drawPalette(ctx, [{ name: "Odd", hex: "nope" }], "t");
    expect(rects.some((r) => r.fill === "#cccccc")).toBe(true);
    expect(imageHeight(3)).toBeGreaterThan(imageHeight(1));
    expect(imageHeight(0)).toBe(imageHeight(1));
  });
});

describe("inkFor", () => {
  it("uses dark ink on light colours and white on dark ones", () => {
    expect(inkFor("#E3D3B0")).toBe("#15171c");
    expect(inkFor("#1E2230")).toBe("#ffffff");
    expect(inkFor("nope")).toBe("#15171c");
  });
});
