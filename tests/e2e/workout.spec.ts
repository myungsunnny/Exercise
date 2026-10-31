import { expect, test, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD 가 설정되지 않음");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email!);
  await page.getByLabel("비밀번호").fill(password!);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("/");
}

async function discardActive(page: Page) {
  await page.goto("/workout");
  const cancel = page.getByRole("button", { name: "운동 취소" });
  if (await cancel.isVisible()) {
    await cancel.click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.waitForURL("/workout");
  }
}

test("운동 기록 → 새로고침 복원 → 종료 → 수정 → 삭제", async ({ page }) => {
  await login(page);
  await discardActive(page);

  await page.getByRole("button", { name: "빈 운동으로 시작" }).click();
  await expect(page.getByRole("button", { name: "운동 종료" })).toBeVisible();

  await page.getByRole("button", { name: "운동 추가" }).click();
  await page.getByLabel("운동 이름 검색").fill("바벨 벤치");
  await page.getByRole("button", { name: /바벨 벤치프레스/ }).first().click();
  await page.getByRole("button", { name: "1개 추가" }).click();

  const card = page.getByRole("region", { name: "바벨 벤치프레스" });
  const kg = card.getByLabel("kg").first();
  const reps = card.getByLabel("회").first();

  // 숫자 입력 중 포커스가 유지되어야 한다(자동저장으로 화면이 초기화되지 않음)
  await kg.click();
  await page.keyboard.type("62.5");
  await page.waitForTimeout(1500); // 자동저장 대기
  await expect(kg).toBeFocused();
  await expect(kg).toHaveValue("62.5");
  await reps.fill("8");
  await card.getByRole("button", { name: "세트 1 완료" }).click();
  await expect(page.getByText("저장됨")).toBeVisible({ timeout: 10_000 });

  // 세트 추가/삭제
  await card.getByRole("button", { name: "세트 추가" }).click();
  await expect(card.getByLabel("kg")).toHaveCount(4);
  await card.getByRole("button", { name: "세트 4 메뉴" }).click();
  await page.getByRole("menuitem", { name: "세트 삭제" }).click();
  await expect(card.getByLabel("kg")).toHaveCount(3);
  await expect(page.getByText("저장됨")).toBeVisible({ timeout: 10_000 });

  // 새로고침 후 복원
  await page.reload();
  const card2 = page.getByRole("region", { name: "바벨 벤치프레스" });
  await expect(card2.getByLabel("kg").first()).toHaveValue("62.5");
  await expect(card2.getByLabel("회").first()).toHaveValue("8");
  await expect(card2.getByRole("button", { name: "세트 1 완료 취소" })).toBeVisible();
  await expect(card2.getByLabel("kg")).toHaveCount(3);

  // 종료(미완료 세트 제거) → 상세
  await page.getByRole("button", { name: "운동 종료" }).click();
  await page.getByRole("button", { name: "미완료 세트 지우고 종료" }).click();
  await page.waitForURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByText("500kg").first()).toBeVisible(); // 62.5 × 8

  // 수정 → 통계 갱신
  await page.getByRole("link", { name: "수정" }).click();
  const kgEdit = page.getByRole("region", { name: "바벨 벤치프레스" }).getByLabel("kg").first();
  await kgEdit.fill("70");
  await page.getByRole("button", { name: "편집 완료" }).click();
  await page.waitForURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByText("560kg").first()).toBeVisible(); // 70 × 8

  // 삭제 → 히스토리에서 사라짐
  const url = page.url();
  await page.getByRole("link", { name: "수정" }).click();
  await page.getByRole("button", { name: "기록 삭제" }).click();
  await page.getByRole("button", { name: "삭제" }).click();
  await page.waitForURL("/history");
  await page.goto(url);
  await expect(page.getByText("404").or(page.getByText("could not be found"))).toBeVisible();
});

test("API 키(서비스 키 등)가 브라우저 번들에 노출되지 않는다", async ({ page }) => {
  await login(page);
  const html = await page.content();
  expect(html).not.toMatch(/service_role|sb_secret_|ANTHROPIC_API_KEY|OPENAI_API_KEY/);
});
