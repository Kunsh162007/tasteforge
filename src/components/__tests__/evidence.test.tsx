// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceProvider } from "../EvidenceContext";
import { WhyChip } from "../WhyChip";
import { sampleEvidence } from "@/ui/fixtures/sampleBrief";

afterEach(cleanup);

const evidence = Object.fromEntries(sampleEvidence.map((e) => [e.id, e]));

function setup(ids: string[] = ["ev_2"]) {
  return render(
    <EvidenceProvider evidence={evidence}>
      <WhyChip ids={ids} label="Pho Hollow" />
    </EvidenceProvider>,
  );
}

describe("WhyChip and EvidenceDrawer", () => {
  it("renders nothing when there are no evidence ids", () => {
    const { container } = setup([]);
    expect(container.querySelector("button")).toBeNull();
  });

  it("opens a dialog with endpoint, params and entity affinities", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Why: Pho Hollow" }));
    const dialog = screen.getByRole("dialog", { name: "Pho Hollow" });
    expect(within(dialog).getByText("/v2/insights")).toBeTruthy();
    expect(within(dialog).getByText("filter.location.query")).toBeTruthy();
    expect(within(dialog).getByText("Brooklyn")).toBeTruthy();
    expect(within(dialog).getByText("Sunday Lantern Cafe")).toBeTruthy();
    expect(within(dialog).getByText("0.93")).toBeTruthy();
  });

  it("shows tags with scores", () => {
    setup(["ev_3"]);
    fireEvent.click(screen.getByRole("button", { name: /why/i }));
    expect(screen.getByText("Warm wood interiors")).toBeTruthy();
    expect(screen.getByText("0.90")).toBeTruthy();
  });

  it("says so when an evidence id is missing from the ledger", () => {
    setup(["ev_404"]);
    fireEvent.click(screen.getByRole("button", { name: /why/i }));
    expect(screen.getByText(/not included with the brief/i)).toBeTruthy();
  });

  it("moves focus into the drawer, closes on Escape and restores focus to the chip", () => {
    setup();
    const chip = screen.getByRole("button", { name: "Why: Pho Hollow" });
    chip.focus();
    fireEvent.click(chip);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});
