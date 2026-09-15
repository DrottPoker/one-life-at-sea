import { defineConfig, devices } from "@playwright/test";

delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "edge", use: { ...devices["Desktop Chrome"], channel: "msedge" } }],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { SITE_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
