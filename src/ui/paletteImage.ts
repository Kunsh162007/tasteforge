/** The palette as a PNG: one band per colour with its name and hex code, drawn on a canvas in the browser. */

export type PaletteColour = { readonly name: string; readonly hex: string };

/** The few canvas calls the drawing needs, so the layout can be tested without a browser. */
export type Ctx2D = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
};

export const BAND_HEIGHT = 120;
export const IMAGE_WIDTH = 900;
const PAD = 28;
const HEADER = 90;

export const imageHeight = (n: number): number => HEADER + Math.max(n, 1) * BAND_HEIGHT;

const linear = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Dark or white ink, whichever reads better on the colour (relative luminance). */
export function inkFor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#15171c";
  const [r, g, b] = [0, 2, 4].map((i) => linear(parseInt(m[1].slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#15171c" : "#ffffff";
}

export function drawPalette(ctx: Ctx2D, colours: readonly PaletteColour[], title: string): void {
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, IMAGE_WIDTH, imageHeight(colours.length));
  ctx.fillStyle = "#15171c";
  ctx.textBaseline = "top";
  ctx.font = "700 30px Georgia, serif";
  ctx.fillText(title.slice(0, 60), PAD, PAD);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("Palette from Qloo decor and ambience tags", PAD, PAD + 44);
  colours.forEach((c, i) => {
    const y = HEADER + i * BAND_HEIGHT;
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#cccccc";
    ctx.fillRect(0, y, IMAGE_WIDTH, BAND_HEIGHT);
    ctx.fillStyle = inkFor(c.hex);
    ctx.font = "700 26px Georgia, serif";
    ctx.fillText(c.name.slice(0, 40), PAD, y + 34);
    ctx.font = "22px ui-monospace, monospace";
    ctx.fillText(c.hex.toUpperCase(), IMAGE_WIDTH - PAD - 130, y + 38);
  });
}

/** Renders the palette to a PNG blob; null when the browser has no canvas. */
export function paletteToPng(colours: readonly PaletteColour[], title: string): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = imageHeight(colours.length);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  drawPalette(ctx, colours, title);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Saves a blob under a file name through a temporary link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
