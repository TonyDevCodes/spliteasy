import { expect, test, type Page } from "@playwright/test";

async function demoLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

async function openFirstGroup(page: Page) {
  await page.locator('a[href^="/groups/"]:not([href="/groups/new"])').first().click();
  await page.waitForURL(/\/groups\/[^/]+$/);
}

test("demo login opens a group with its expenses", async ({ page }) => {
  await demoLogin(page);
  await openFirstGroup(page);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
  await expect(page.locator('h2:has-text("Expenses") ~ ul')).toBeVisible();
});

test("receipt thumbnail opens and closes", async ({ page }) => {
  await demoLogin(page);
  await openFirstGroup(page);

  const receipt = page.locator('button[aria-label^="View receipt for"]').first();
  if ((await receipt.count()) === 0) {
    test.skip(true, "demo group has no expense with a receipt");
    return;
  }

  const thumb = receipt.locator("img");
  await expect(thumb).toBeVisible();
  await expect
    .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await receipt.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("invalid invite token shows the invalid message", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/invite/not-a-real-token");
  await expect(page.getByText("This invite link is invalid.")).toBeVisible();
});
