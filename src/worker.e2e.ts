import { expect, test } from "@playwright/test";

test("renders the attendee question page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Questions" })).toBeVisible();
  await expect(page.getByPlaceholder("Question for the panel")).toBeVisible();
  await expect(page.getByText("No questions yet.")).toBeVisible();
});

test("serves the health endpoint", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    name: "vibe-template-worker",
    routes: ["/", "/mc", "/moderator", "/screen", "/api/health"],
  });
});

test("serves the generated stylesheet", async ({ request }) => {
  const response = await request.get("/styles.css");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/css");
  await expect(response.text()).resolves.toContain("--color-app-canvas:#f3eee6");
});
