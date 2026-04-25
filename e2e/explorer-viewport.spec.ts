import { test, expect } from "@playwright/test";

// Verifies the Explorer page is genuinely viewport-driven: the page itself
// no longer ships any lodging/routes in the SSR response, and after the map
// settles the client makes /api/lodging?bbox= and /api/routes?bbox= calls
// that populate the store.

test.describe("Explorer viewport loading", () => {
  test("page SSR is empty of bulk catalog; client fetches by bbox after mount", async ({ page }) => {
    const bboxRequests: { url: string }[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (
        (url.includes("/api/lodging") || url.includes("/api/routes")) &&
        url.includes("bbox=")
      ) {
        bboxRequests.push({ url });
      }
    });

    // SSR check first — fetch the raw HTML and confirm it does NOT include any
    // lodging payload. (At Marin scale 86 lodgings would inline as a big
    // JSON blob in the React Server Components stream; we want it absent.)
    const ssrText = await (await page.request.get("/explorer")).text();
    expect(
      ssrText.includes("Pelican Inn") ||
        ssrText.includes("West Point Inn") ||
        ssrText.includes("Mountain Home Inn"),
      "SSR HTML shouldn't include lodging names; the client fetches by bbox"
    ).toBe(false);

    // Now load the page in a real browser and watch network for bbox calls.
    await page.goto("/explorer", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { __inn2innMap?: { loaded?: () => boolean } })
          .__inn2innMap;
        return Boolean(m?.loaded?.());
      },
      undefined,
      { timeout: 20_000 }
    );
    // Give the moveend debounce time to fire.
    await page.waitForTimeout(800);
    // And let the in-flight fetches resolve.
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    expect(
      bboxRequests.some((r) => r.url.includes("/api/lodging")),
      "expected at least one bbox-scoped /api/lodging fetch after map idle"
    ).toBe(true);
    expect(
      bboxRequests.some((r) => r.url.includes("/api/routes")),
      "expected at least one bbox-scoped /api/routes fetch after map idle"
    ).toBe(true);

    // And the store should now hold features.
    const counts = await page.evaluate(() => {
      const m = (window as unknown as {
        __inn2innMap?: { querySourceFeatures: (id: string) => unknown[] };
      }).__inn2innMap;
      if (!m) return null;
      return {
        hotels: m.querySourceFeatures("explorer-hotels").length,
        routes: m.querySourceFeatures("explorer-routes").length,
      };
    });
    expect(counts, "map exposed").not.toBeNull();
    expect(counts!.hotels, "hotels source populated").toBeGreaterThan(0);
    expect(counts!.routes, "routes source populated").toBeGreaterThan(0);
  });
});
