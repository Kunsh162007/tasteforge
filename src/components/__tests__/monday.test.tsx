// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleBrief, sampleEvidence } from "@/ui/fixtures/sampleBrief";
import { EvidenceProvider } from "../EvidenceContext";
import { MondayList } from "../MondayList";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const evidence = Object.fromEntries(sampleEvidence.map((e) => [e.id, e]));
const setup = () =>
  render(
    <EvidenceProvider evidence={evidence}>
      <MondayList brief={sampleBrief} />
    </EvidenceProvider>,
  );

describe("MondayList", () => {
  it("shows the six parts of the list", () => {
    setup();
    const section = screen.getByRole("region", { name: "Your Monday list" });
    const headings = within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["1. Press play", "2. Paint and style", "3. Visit three rooms", "4. Put these on the board", "5. Say it three ways", "6. Hand out flyers in"]);
  });

  it("links every playlist artist to a Spotify search that opens safely in a new tab", () => {
    setup();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\/open\.spotify\.com\/search\//);
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("offers download, print, copy and a palette PNG", () => {
    setup();
    expect(screen.getByRole("button", { name: "Download the list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print this page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy as text" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the palette as a PNG" })).toBeTruthy();
  });

  it("prints only this page: it marks the document while the print dialog is open", async () => {
    const user = userEvent.setup();
    const seen: (string | undefined)[] = [];
    vi.stubGlobal("print", () => seen.push(document.body.dataset.printOnly));
    setup();
    await user.click(screen.getByRole("button", { name: "Print this page" }));
    expect(seen).toEqual(["monday"]);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body.dataset.printOnly).toBeUndefined();
  });

  it("copies the list as text and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain("MONDAY LIST");
    expect(screen.getByRole("status").textContent).toBe("Copied as plain text.");
  });
});
