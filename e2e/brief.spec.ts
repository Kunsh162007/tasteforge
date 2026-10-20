import { expect, test } from "@playwright/test";

test("submit -> brief -> evidence drawer -> taste proof -> map -> refine", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "I know my audience" }).check();
  await page
    .getByLabel("Tell us about the project")
    .fill("A cafe for young professionals who love Radiohead, indie music and slow living.");
  await page.getByLabel(/City/).fill("Indore");
  await page.getByRole("button", { name: "Build the brief" }).click();

  // The brief streams in and is fully grounded.
  await expect(page.getByRole("article")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("The sound")).toBeVisible();

  // A why-chip opens the evidence drawer with the Qloo call behind the item.
  await page.getByRole("button", { name: /^why/i }).first().click();
  await expect(page.getByText("Evidence from Qloo")).toBeVisible();
  await expect(page.getByText("/v2/insights").first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // Taste Proof compares a plain LLM against the Qloo-grounded picks.
  await expect(page.getByRole("heading", { name: /taste proof/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("average affinity").first()).toBeVisible();
  await expect(page.getByText(/not found in Qloo/i).first()).toBeVisible();

  // "Where they are" names neighbourhoods (no raw coordinates) and shows them on a map.
  await expect(page.getByText("Vijay Nagar").first()).toBeVisible();
  await expect(page.locator(".hotmap")).toBeVisible();
  await expect(page.getByText(/Area near/)).toHaveCount(0);

  // Refine loop: dislike the first artist, refine, and get a brief without it plus a "what changed" note.
  const sound = page.getByRole("region", { name: "The sound" });
  const firstRow = sound.locator("li.item").first();
  const dropped = (await firstRow.locator(".item__label").innerText()).trim();
  await firstRow.getByRole("button", { name: /^Dislike/ }).click();
  await expect(firstRow.getByRole("button", { name: /^Dislike/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Refine brief" }).click();

  await expect(page.getByRole("status", { name: "What changed" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status", { name: "What changed" })).toContainText(dropped);
  await expect(sound.getByText(dropped, { exact: true })).toHaveCount(0);
  await expect(page.getByText("New").first()).toBeVisible();
  // The proof is re-scored for the refined brief.
  await expect(page.getByText("average affinity").first()).toBeVisible({ timeout: 30_000 });
});

test("home leads with finished briefs, and one click opens one", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /know who you are making it for/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start with a finished brief" })).toBeVisible();
  // The compose form stays available as the secondary path.
  await expect(page.getByRole("form", { name: "Or brief your own project" })).toBeVisible();

  await page.getByRole("button", { name: /Open this brief/ }).first().click({ timeout: 60_000 });
  await expect(page.getByRole("article")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "In this brief" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /taste proof/i })).toBeVisible();
});
