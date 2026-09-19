import { defineConfig, devices } from "@playwright/test";
import server from "./config/server.json" with { type: "json" };
import testing from "./config/testing.json" with { type: "json" };

delete process.env.NO_COLOR;
const host = server.local.host.includes(":") ? "[" + server.local.host + "]" : server.local.host;
const baseURL = "http://" + host + ":" + server.local.testPort;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: testing.workers,
  timeout: testing.testTimeoutMs,
  expect: { timeout: testing.expectTimeoutMs },
  reporter: "list",
  use: { baseURL, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: testing.browserChannel, use: { ...devices["Desktop Chrome"], channel: testing.browserChannel } }],
  webServer: {
    command: "npm run start -- --port " + server.local.testPort,
    url: baseURL + "/login",
    reuseExistingServer: false,
    timeout: testing.serverTimeoutMs,
    env: { SITE_URL: baseURL, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
