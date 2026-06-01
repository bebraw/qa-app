import { expect, test } from "@playwright/test";

test("renders the attendee question page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Questions" })).toBeVisible();
  await expect(page.getByPlaceholder("Question")).toBeVisible();
  await expect(page.locator('script[src="/panel-live.js"]')).toHaveCount(1);
});

test("serves the health endpoint", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    name: "vibe-template-worker",
    routes: ["/", "/present", "/mc", "/moderate", "/screen", "/words/screen", "/api/health"],
  });
});

test("serves the generated stylesheet", async ({ request }) => {
  const response = await request.get("/styles.css");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/css");
  await expect(response.text()).resolves.toContain("--color-app-canvas:#fff");
});

test("serves the generated live-update script", async ({ request }) => {
  const response = await request.get("/panel-live.js");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/javascript");
});

test("serves the bundled Finlandica font", async ({ request }) => {
  const response = await request.get("/fonts/FinlandicaHeadline-Regular.ttf");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("font/ttf");
});
