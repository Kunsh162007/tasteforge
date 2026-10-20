// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleBrief } from "@/ui/fixtures/sampleBrief";
import type { ShowcaseItem } from "@/ui/showcase";
import { BriefView } from "../BriefView";
import { EvidenceProvider } from "../EvidenceContext";
import { Home } from "../Home";
import { ShowcaseGallery } from "../ShowcaseGallery";

afterEach(cleanup);

const base = { id: "a", title: "A cafe in Indore", prompt: "p", mode: "know_audience" as const, city: "Indore" };
const ready: ShowcaseItem = { ...base, status: "ready", brief: sampleBrief };

describe("ShowcaseGallery", () => {
  it("shows placeholders and a busy state while the shelf is being checked", () => {
    render(<ShowcaseGallery phase="loading" items={[]} onOpen={() => {}} onRetry={() => {}} />);
    expect(screen.getByRole("region", { name: "Start with a finished brief" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button", { name: /Open this brief/ })).toBeNull();
  });

  it("opens a ready brief and lists the ones still being built without a button", async () => {
    const onOpen = vi.fn();
    render(<ShowcaseGallery phase="polling" items={[ready, { ...base, id: "b", title: "Second", status: "generating" }]} onOpen={onOpen} onRetry={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Open this brief/ }));
    expect(onOpen).toHaveBeenCalledWith(ready);
    expect(screen.getAllByRole("button", { name: /Open this brief/ })).toHaveLength(1);
    expect(screen.getByText("Being built, Indore")).toBeTruthy();
  });

  it("offers a retry and says the compose form still works when the showcase is unreachable", async () => {
    const onRetry = vi.fn();
    render(<ShowcaseGallery phase="unavailable" items={[]} onOpen={() => {}} onRetry={onRetry} />);
    expect(screen.getByText(/You can still build your own brief below/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try the showcase again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("Home", () => {
  it("sells the product, previews a brief and keeps the compose form as the secondary path", () => {
    render(<Home showcasePhase="settled" showcaseItems={[ready]} onOpenShowcase={() => {}} onRetryShowcase={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Know who you are making it for/);
    expect(screen.getByRole("link", { name: "Open a finished brief" }).getAttribute("href")).toBe("#showcase");
    expect(screen.getByRole("figure", { name: "Preview of a real brief" })).toBeTruthy();
    const form = screen.getByRole("form", { name: "Or brief your own project" });
    expect(within(form).getByRole("button", { name: "Build the brief" })).toBeTruthy();
  });

  it("falls back to a labelled sample preview before any real brief is ready", () => {
    render(<Home showcasePhase="loading" showcaseItems={[]} onOpenShowcase={() => {}} onRetryShowcase={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole("figure", { name: "Preview of a sample brief" })).toBeTruthy();
  });
});

const wrap = (ui: React.ReactElement) => <EvidenceProvider evidence={{}}>{ui}</EvidenceProvider>;

describe("BriefView thin sections", () => {
  const thin = {
    ...sampleBrief,
    aesthetic: { palette: [], lighting: [], materials: [], referencePlaces: [] },
    sound: { direction: "Quiet.", artists: [] },
    pairings: [],
  };

  it("explains what is missing instead of leaving a blank", () => {
    render(wrap(<BriefView brief={thin} dropped={[]} />));
    expect(screen.getByText(/No colours could be tied/)).toBeTruthy();
    expect(screen.getByText(/no playlist to show/)).toBeTruthy();
    expect(screen.getByText(/left out rather than invented/)).toBeTruthy();
  });

  it("links to the proof only when there is one", () => {
    const { rerender } = render(wrap(<BriefView brief={sampleBrief} dropped={[]} />));
    expect(screen.queryByRole("link", { name: "Taste proof" })).toBeNull();
    rerender(wrap(<BriefView brief={sampleBrief} dropped={[]} hasProof />));
    expect(screen.getByRole("link", { name: "Taste proof" }).getAttribute("href")).toBe("#proof");
  });
});
