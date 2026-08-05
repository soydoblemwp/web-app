import { defineConfig, devices } from "@playwright/test";

/**
 * Separate from Vitest (Node environment) on purpose — these tests drive a
 * real Chromium instance against a real running server (dev or production
 * local) to validate FFmpeg WebAssembly, MediaRecorder, and download flows
 * that cannot execute inside Vitest's Node environment (Fase 45 correction).
 */
export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  outputDir: "../../test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone", "camera"],
        // Real Chromium fake-media-device flags — getUserMedia returns a genuine
        // MediaStream (synthetic beep-tone microphone + green-frame camera), not
        // a hand-rolled mock, so the recorder tools exercise the real API.
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
      testIgnore: /mobile-and-themes\.spec\.ts/,
    },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile-and-themes\.spec\.ts/ },
  ],
});
