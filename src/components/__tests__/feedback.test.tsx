// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SlotPath } from "@/lib/agent/briefItems";
import type { Item } from "@/ui/contract";
import { itemKey, NO_FEEDBACK, toggleLock, toggleMark, type FeedbackState, type Mark } from "@/ui/feedback";
import { sampleBrief, sampleEvidence } from "@/ui/fixtures/sampleBrief";
import { EvidenceProvider } from "../EvidenceContext";
import { FeedbackContext, type FeedbackApi } from "../FeedbackContext";
import { ItemList } from "../ItemList";
import { RefineBar } from "../RefineBar";
import { Stages } from "../Stages";
import { INITIAL_RUN } from "@/ui/runState";

afterEach(cleanup);

const evidence = Object.fromEntries(sampleEvidence.map((e) => [e.id, e]));

function Harness({ changedKeys = [] as string[] }) {
  const [state, setState] = useState<FeedbackState>(NO_FEEDBACK);
  const api = useMemo<FeedbackApi>(
    () => ({
      stateOf: (path: SlotPath, item: Item) => {
        const key = itemKey(path, item);
        return { mark: state.marks[key], locked: state.locked[key] === true, changed: changedKeys.includes(key) };
      },
      toggleMark: (path: SlotPath, item: Item, mark: Mark) => setState((s) => toggleMark(s, itemKey(path, item), mark)),
      toggleLock: (path: SlotPath, item: Item) => setState((s) => toggleLock(s, itemKey(path, item))),
    }),
    [state, changedKeys],
  );
  return (
    <EvidenceProvider evidence={evidence}>
      <FeedbackContext.Provider value={api}>
        <ItemList items={sampleBrief.sound.artists} path="sound.artists" />
      </FeedbackContext.Provider>
    </EvidenceProvider>
  );
}

describe("item feedback controls", () => {
  it("renders three named toggle buttons per item with a pressed state", () => {
    render(<Harness />);
    const like = screen.getByRole("button", { name: "Like Mitski" });
    expect(like.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(like);
    expect(screen.getByRole("button", { name: "Like Mitski" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Dislike Mitski" }));
    expect(screen.getByRole("button", { name: "Like Mitski" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Dislike Mitski" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Lock Mitski" })).toBeTruthy();
  });

  it("marks the row so disliked and locked items look different, and lock clears a dislike", () => {
    render(<Harness />);
    const row = screen.getByText("Bon Iver").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Dislike Bon Iver" }));
    expect(row.getAttribute("data-mark")).toBe("disliked");
    fireEvent.click(within(row).getByRole("button", { name: "Lock Bon Iver" }));
    expect(row.getAttribute("data-mark")).toBeNull();
    expect(row.getAttribute("data-locked")).toBe("true");
  });

  it("flags items that came in with the last refinement", () => {
    render(<Harness changedKeys={[itemKey("sound.artists", sampleBrief.sound.artists[2])]} />);
    const row = screen.getByText("Big Thief").closest("li") as HTMLElement;
    expect(row.getAttribute("data-changed")).toBe("true");
    expect(within(row).getByText("New")).toBeTruthy();
    expect((screen.getByText("Mitski").closest("li") as HTMLElement).getAttribute("data-changed")).toBeNull();
  });

  it("shows no controls without a feedback provider", () => {
    render(
      <EvidenceProvider evidence={evidence}>
        <ItemList items={sampleBrief.sound.artists} path="sound.artists" />
      </EvidenceProvider>,
    );
    expect(screen.queryByRole("button", { name: /^Like/ })).toBeNull();
  });
});

describe("RefineBar", () => {
  const base = { counts: { liked: 1, disliked: 2, locked: 0 }, canRefine: true, refine: undefined, stages: INITIAL_RUN.stages };

  it("summarises the marks and triggers a refine", () => {
    const onRefine = vi.fn();
    render(<RefineBar {...base} onRefine={onRefine} onClear={() => {}} />);
    expect(screen.getByText("2 to replace · 1 liked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refine brief" }));
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  it("disables refine when only locks are set, and renders nothing with no marks", () => {
    const { container, rerender } = render(<RefineBar {...base} counts={{ liked: 0, disliked: 0, locked: 2 }} canRefine={false} onRefine={() => {}} onClear={() => {}} />);
    expect((screen.getByRole("button", { name: "Refine brief" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RefineBar {...base} counts={{ liked: 0, disliked: 0, locked: 0 }} onRefine={() => {}} onClear={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows progress while refining and a retry when it failed", () => {
    const { rerender } = render(<RefineBar {...base} refine={{ status: "running" }} onRefine={() => {}} onClear={() => {}} />);
    expect(screen.getByRole("status", { name: "Refining the brief" })).toBeTruthy();
    const onRefine = vi.fn();
    rerender(<RefineBar {...base} refine={{ status: "error", message: "rate limit", retryable: true }} onRefine={onRefine} onClear={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("rate limit");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRefine).toHaveBeenCalled();
  });
});

describe("Stages", () => {
  it("announces failed and skipped stages to screen readers", () => {
    const stages = {
      ...INITIAL_RUN.stages,
      seeds: { status: "done" as const },
      resolve: { status: "failed" as const },
      walk: { status: "skipped" as const },
    };
    render(<Stages stages={stages} />);
    expect(screen.getByText("Resolve").closest("li")?.getAttribute("data-status")).toBe("failed");
    expect(screen.getByText(", failed")).toBeTruthy();
    expect(screen.getByText("Walk").closest("li")?.getAttribute("data-status")).toBe("skipped");
  });
});
