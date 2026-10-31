import { defineConfig, devices } from "@playwright/test";

// 실제 Supabase 프로젝트와 테스트 계정이 필요하다(.env.local 의 E2E_EMAIL / E2E_PASSWORD).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1, // 진행 중 운동은 사용자당 하나라 직렬 실행
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3001", url: "http://localhost:3001/login", reuseExistingServer: true, timeout: 120_000 },
});
