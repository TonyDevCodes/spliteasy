import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: {
      executablePath:
        process.env.BROWSER_PATH ??
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
