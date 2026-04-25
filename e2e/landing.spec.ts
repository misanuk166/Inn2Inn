import { test, expect } from "@playwright/test";

// The landing page used to be a redirect to /explorer. It now lists every
// ready region as a clickable card. This test makes sure the page renders
// at all and that clicking a region navigates into Explorer.

test.describe("Landing page", () => {
  test("renders region grid and links into explorer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText(/Hike between inns/i);

    // At least the Marin card should be present since Marin is the v1 region.
    const marinCard = page.locator("a", { hasText: "Marin" }).first();
    await expect(marinCard).toBeVisible();

    await marinCard.click();
    await page.waitForURL(/\/explorer\?region=marin/, { timeout: 10_000 });
    expect(page.url()).toContain("region=marin");
  });
});
