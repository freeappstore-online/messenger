import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Only run end-to-end specs located in tests/e2e
  testDir: "./tests/e2e",
  // Match Playwright E2E files only (e.g. chat.spec.ts)
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "line",
  // We'll start the dev server manually before running tests
  webServer: {
    command:
      "node --experimental-global-webcrypto node_modules/vite/bin/vite.js --host --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes
    stdout: "pipe",
    stderr: "pipe",
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    screenshot: "off",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--disable-features=WebRtcHideLocalIpsWithMdns",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
