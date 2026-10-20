import { defineConfig } from "@playwright/test";

const PORT = 3101;

/** E2E runs against the real app with mock Qloo and the scripted LLM: no network, no keys needed. */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { LLM_PROVIDER: "mock", QLOO_MODE: "mock" },
  },
});
