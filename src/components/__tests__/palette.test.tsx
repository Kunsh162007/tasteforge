// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleBrief } from "@/ui/fixtures/sampleBrief";
import type { ShowcaseItem } from "@/ui/showcase";
import { EvidenceProvider } from "../EvidenceContext";
import { ShowcaseGallery } from "../ShowcaseGallery";
import { Specimen } from "../Specimen";
import { inkFor, Swatches } from "../Swatches";
import { Stages } from "../Stages";
import { INITIAL_RUN } from "@/ui/runState";

afterEach(cleanup);

describe("palette display", () => {
  it("shows the colour name as the label and the Qloo tags as a caption, marking the accent", () => {
    render(
      <EvidenceProvider evidence={{}}>
        <Swatches palette={sampleBrief.aesthetic.palette} />
      </EvidenceProvider>,
    );
    expect(screen.getByText("Lantern amber")).toBeTruthy();
    expect(screen.getByText("From Qloo tags: Warm, Cozy")).toBeTruthy();
    expect(screen.getByText(/#C98B3E . accent/)).toBeTruthy();
  });

  it("names the first colours on a showcase card", () => {
    const item: ShowcaseItem = { id: "a", title: "A cafe", prompt: "p", mode: "know_audience", status: "ready", brief: sampleBrief };
    render(<ShowcaseGallery phase="settled" items={[item]} onOpen={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("Lantern amber, Brick ember, Fern shadow")).toBeTruthy();
  });
});

describe("Specimen places", () => {
  it("lists the real reference places, not hotspot directions", () => {
    render(<Specimen brief={sampleBrief} real />);
    expect(screen.getByText(/Sunday Lantern Cafe/)).toBeTruthy();
    expect(screen.queryByText(/Williamsburg/)).toBeNull();
  });

  it("falls back to hotspots when there are no reference places", () => {
    const brief = { ...sampleBrief, aesthetic: { ...sampleBrief.aesthetic, referencePlaces: [] } };
    render(<Specimen brief={brief} real={false} />);
    expect(screen.getByText(/Williamsburg/)).toBeTruthy();
  });
});

describe("stage notes", () => {
  it("marks a partial walk and a skipped critic as quiet notes, not failures", () => {
    const stages = {
      ...INITIAL_RUN.stages,
      walk: { status: "done" as const, detail: "9 evidence records, partial: 2 calls cut off" },
      critic: { status: "done" as const, detail: "skipped, out of time" },
    };
    const { container } = render(<Stages stages={stages} />);
    const notes = [...container.querySelectorAll(".stage__detail")].map((n) => n.getAttribute("data-note"));
    expect(notes).toEqual(["partial", "skipped"]);
    expect(container.querySelector('[data-status="failed"]')).toBeNull();
  });
});

describe("inkFor", () => {
  const ratio = (a: string, b: string): number => {
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      const lin = (c: number): number => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it("keeps text readable (4.5:1) on every mid-tone, using pure black or white where the house inks fall short", () => {
    for (const hex of ["#738089", "#808080", "#777777", "#6D9D81", "#985765", "#F3F0EB", "#1C234B"]) {
      expect(ratio(hex, inkFor(hex)), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
});
