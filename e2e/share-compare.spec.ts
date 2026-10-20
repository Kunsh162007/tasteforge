import { expect, test, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function buildBrief(page: Page, city = "Indore"): Promise<void> {
  await page.goto("/");
  await page.getByRole("radio", { name: "I know my audience" }).check();
  // A cold dev page can hydrate after the first keystrokes and reset the form: retry until the input sticks.
  await expect(async () => {
    await page.getByLabel("Tell us about the project").fill("A cafe for young professionals who love Radiohead, indie music and slow living.");
    await page.getByLabel(/City/).fill(city);
    await expect(page.getByRole("button", { name: "Build the brief" })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Build the brief" }).click();
  await expect(page.getByRole("article")).toBeVisible({ timeout: 60_000 });
}

test("share link opens a read-only brief with evidence and proof", async ({ page, context }) => {
  await buildBrief(page);
  await expect(page.getByRole("heading", { name: /taste proof/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("average affinity").first()).toBeVisible();

  await page.getByRole("button", { name: "Copy share link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/b#[A-Za-z0-9+\-$]+$/);
  console.log(`share link length: ${link.length} chars`);

  const shared = await context.newPage();
  await shared.goto(link);
  await expect(shared.getByText("Shared brief, read-only.")).toBeVisible();
  // The link carries the server's signatures, so the evidence checks out.
  await expect(shared.getByRole("status", { name: "Link verification" })).toContainText("verified ✓", { timeout: 15_000 });
  await expect(shared.getByRole("article")).toBeVisible();
  await expect(shared.getByText("100%")).toBeVisible();
  await expect(shared.getByText("Vijay Nagar").first()).toBeVisible();
  await expect(shared.getByRole("heading", { name: /taste proof/i })).toBeVisible();
  // Read-only: no refine controls, and the why-drawer still works from the embedded evidence.
  await expect(shared.getByRole("button", { name: "Refine brief" })).toHaveCount(0);
  await expect(shared.getByRole("button", { name: /^Dislike/ })).toHaveCount(0);
  await shared.getByRole("button", { name: /^why/i }).first().click();
  await expect(shared.getByText("Evidence from Qloo")).toBeVisible();
  await expect(shared.getByText("/v2/insights").first()).toBeVisible();
});

test("corrupt, truncated and empty share links fail gracefully", async ({ page }) => {
  await page.goto("/b#this-is-not-a-brief");
  await expect(page.locator(".calm")).toContainText(/damaged or incomplete/i);
  await expect(page.getByRole("link", { name: "Build a brief" })).toBeVisible();

  await buildBrief(page);
  await page.getByRole("button", { name: "Copy share link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(link.slice(0, link.length - 40));
  await expect(page.locator(".calm")).toContainText(/damaged or incomplete/i);

  await page.goto("/b");
  await expect(page.locator(".calm")).toContainText(/no brief in it/i);
});

test("compare with another city shows what differs and what is shared", async ({ page }) => {
  await buildBrief(page, "Indore");
  await page.getByRole("button", { name: "Compare with another city" }).click();
  await page.getByLabel("Second city").fill("London");
  await page.getByRole("button", { name: "Compare", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Indore\s*vs\s*London/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /in common/ })).toBeVisible({ timeout: 60_000 });
  const hotspots = page.getByRole("region", { name: "Hotspots" });
  await expect(hotspots.getByText("Only Indore")).toBeVisible();
  await expect(hotspots.getByText("Only London")).toBeVisible();
  await expect(hotspots.getByText("Vijay Nagar")).toBeVisible();
  await expect(hotspots.getByText("Shoreditch")).toBeVisible();
  await expect(page.getByRole("region", { name: "Artists" }).getByText("Both cities")).toBeVisible();

  await page.getByText("Read the full London brief").click();
  await expect(page.getByRole("article")).toBeVisible();
  await page.getByRole("button", { name: "Back to the Indore brief" }).click();
  await expect(page.getByRole("button", { name: "Compare with another city" })).toBeVisible();
});

test("404 page and health endpoint", async ({ page, request }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /off the map/i })).toBeVisible();

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body).toMatchObject({ status: "ok", qloo: { mode: "mock" }, llm: { provider: "mock" } });
  expect(typeof body.llm.gemini).toBe("boolean");
  expect(typeof body.version).toBe("string");
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("tile.openstreetmap.org");
});
