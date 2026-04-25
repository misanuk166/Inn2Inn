import { test, expect, type Page, type Request } from "@playwright/test";

// "Tiles rendered" is true when:
//  - The MapLibre canvas is mounted and has non-zero size
//  - At least a handful of tile requests (vector .pbf tiles) returned 200
//  - MapLibre fired the 'idle' event (all current tiles loaded + drawn)
//  - No "Style is not done loading" warning in the console (the regression
//    we're guarding against — map looked blank even though tiles fetched)

// Tile responses can come from any of our supported style providers
// (OpenFreeMap, OpenTopoMap, Esri). Match by URL shape, not host.
const TILE_URL_PATTERN = /\/(\d+)\/(\d+)\/(\d+)\.(png|pbf|jpg|webp)/;
const MIN_TILE_SUCCESSES = 3;

test.describe("Explorer map", () => {
  test("renders MapLibre tiles on /explorer", async ({ page }) => {
    // Collect network + console signal while the page loads.
    const tileResponses: Array<{ url: string; status: number }> = [];
    const consoleWarnings: string[] = [];
    const consoleErrors: string[] = [];

    page.on("response", async (res) => {
      const url = res.url();
      if (TILE_URL_PATTERN.test(url)) {
        tileResponses.push({ url, status: res.status() });
      }
    });
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "warning") consoleWarnings.push(text);
      if (msg.type() === "error") consoleErrors.push(text);
    });

    await page.goto("/explorer", { waitUntil: "domcontentloaded" });

    // Canvas must exist and have real size.
    const canvas = page.locator(".maplibregl-canvas").first();
    await expect(canvas, "maplibre canvas should mount").toBeVisible({ timeout: 10_000 });
    const box = await canvas.boundingBox();
    expect(box, "canvas has bounding box").not.toBeNull();
    expect(box!.width, "canvas width > 200").toBeGreaterThan(200);
    expect(box!.height, "canvas height > 200").toBeGreaterThan(200);

    // Wait for MapLibre to signal idle — all tiles in the current viewport
    // are loaded and rendered.
    await waitForMaplibreIdle(page, 20_000);

    // Introspect the live map to prove it actually has tiles, not just that
    // tile fetches returned 200 (which they can do even when nothing renders).
    const debug = await readMapDebugState(page);
    console.log("map debug state:", debug);
    // Our own sources — these should be populated from /api/lodging and
    // /api/routes via the Zustand store. If they're empty the user sees
    // a bare basemap with no pins/lines.
    const ourSources = await page.evaluate(() => {
      const m = (window as unknown as {
        __inn2innMap?: {
          querySourceFeatures: (id: string) => unknown[];
        };
      }).__inn2innMap;
      if (!m) return null;
      let hotelFeatures = -1;
      let routeFeatures = -1;
      try {
        hotelFeatures = m.querySourceFeatures("explorer-hotels").length;
      } catch {}
      try {
        routeFeatures = m.querySourceFeatures("explorer-routes").length;
      } catch {}
      return { hotelFeatures, routeFeatures };
    });
    console.log("explorer sources:", ourSources);
    expect(ourSources, "__inn2innMap exposed").not.toBeNull();
    expect(ourSources!.hotelFeatures, "hotels source has features").toBeGreaterThan(0);
    expect(ourSources!.routeFeatures, "routes source has features").toBeGreaterThan(0);

    const layoutChain = await page.evaluate(() => {
      const container = (window as unknown as { __inn2innMap?: { getContainer: () => HTMLElement } })
        .__inn2innMap?.getContainer();
      const out: Array<{ tag: string; cls: string; h: number; w: number }> = [];
      let el: HTMLElement | null = container ?? null;
      while (el) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className.toString().slice(0, 80),
          h: el.clientHeight,
          w: el.clientWidth,
        });
        el = el.parentElement;
      }
      return out;
    });
    console.log("layout chain (map container → html):", layoutChain);
    expect(debug, "map instance should be attached to window").not.toBeNull();
    expect(debug!.canvasWidth, "canvas has non-zero width").toBeGreaterThan(0);
    expect(debug!.canvasHeight, "canvas has non-zero height").toBeGreaterThan(0);
    expect(
      debug!.renderedFeaturesCount,
      "map should have rendered features (tiles visible)"
    ).toBeGreaterThan(0);

    // Take screenshots early so we can inspect them even if later assertions fail.
    await page.screenshot({ path: "test-results/explorer-map.png", fullPage: false });
    await page.locator(".maplibregl-canvas").first().screenshot({
      path: "test-results/explorer-map-canvas.png",
    });

    // At least N successful tile fetches.
    const ok = tileResponses.filter((r) => r.status === 200);
    const bad = tileResponses.filter((r) => r.status >= 400);
    expect(
      ok.length,
      `expected >= ${MIN_TILE_SUCCESSES} successful tile responses; got ${ok.length} ok / ${bad.length} bad`
    ).toBeGreaterThanOrEqual(MIN_TILE_SUCCESSES);

    // The specific regression we just fixed.
    const styleReload = consoleWarnings.find((w) =>
      w.includes("Style is not done loading")
    );
    expect(
      styleReload,
      "map triggered 'Style is not done loading. Rebuilding...' — initial setStyle is racing"
    ).toBeUndefined();

    // We also take a screenshot (above) for human verification. Pixel-level
    // drawImage sampling is unreliable across timing — rely on the canvas
    // dimensions + MapLibre's own renderedFeaturesCount instead.
  });

  test("clicking a hotel filters routes; clicking elsewhere clears", async ({ page }) => {
    await page.goto("/explorer", { waitUntil: "domcontentloaded" });
    await waitForMaplibreIdle(page, 20_000);

    // Sidebar shows "<filtered> routes of <total>". The default sliders
    // (max distance, max gain) already filter some out — use the filtered
    // count *before any hotel click* as the baseline.
    const baselineText = await page
      .locator("aside :text-matches('routes? of [0-9]+')")
      .first()
      .textContent();
    const baselineFiltered = Number(baselineText?.match(/^(\d+)/)?.[1] ?? 0);
    expect(baselineFiltered, "expected route count visible in sidebar").toBeGreaterThan(0);

    // Pick the first hotel and click its on-canvas pixel.
    const clicked = await page.evaluate(() => {
      const m = (window as unknown as {
        __inn2innMap?: {
          querySourceFeatures: (id: string) => Array<{
            geometry: { coordinates: [number, number] };
            properties: { id: string; name: string };
          }>;
          project: (lngLat: { lng: number; lat: number }) => { x: number; y: number };
          getCanvas: () => HTMLCanvasElement;
        };
      }).__inn2innMap;
      if (!m) return null;
      const f = m.querySourceFeatures("explorer-hotels")[0];
      if (!f) return null;
      const [lng, lat] = f.geometry.coordinates;
      const p = m.project({ lng, lat });
      const c = m.getCanvas().getBoundingClientRect();
      return { px: c.left + p.x, py: c.top + p.y };
    });
    expect(clicked, "no hotels in source").not.toBeNull();
    await page.mouse.click(clicked!.px, clicked!.py);
    await page.waitForTimeout(400);

    const afterClickText = await page
      .locator("aside :text-matches('routes? of [0-9]+')")
      .first()
      .textContent();
    const afterClickCount = Number(afterClickText?.match(/^(\d+)/)?.[1] ?? baselineFiltered);
    expect(
      afterClickCount,
      `clicking a hotel should narrow the list (was ${baselineFiltered}, now ${afterClickCount})`
    ).toBeLessThan(baselineFiltered);

    // Click somewhere on the canvas that's clearly empty (lower-middle, away
    // from the style switcher in the top-left and the hotel panel on the right).
    const empty = await page.evaluate(() => {
      const c = (
        document.querySelector(".maplibregl-canvas") as HTMLCanvasElement
      ).getBoundingClientRect();
      // Search outward from canvas center for a pixel with no hotel marker.
      const m = (window as unknown as {
        __inn2innMap?: {
          queryRenderedFeatures: (
            point: [number, number],
            opts: { layers: string[] }
          ) => unknown[];
        };
      }).__inn2innMap!;
      for (let dx = 0; dx < c.width; dx += 50) {
        for (let dy = 0; dy < c.height; dy += 50) {
          const px = c.width / 2 + dx;
          const py = c.height / 2 + dy;
          if (px > c.width - 20 || py > c.height - 20) continue;
          const hits = m.queryRenderedFeatures([px, py], {
            layers: ["explorer-hotels-layer"],
          });
          if (hits.length === 0) {
            return { x: c.left + px, y: c.top + py };
          }
        }
      }
      return { x: c.left + c.width - 30, y: c.top + c.height - 30 };
    });
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);

    const clearedText = await page
      .locator("aside :text-matches('routes? of [0-9]+')")
      .first()
      .textContent();
    const clearedCount = Number(clearedText?.match(/^(\d+)/)?.[1] ?? 0);
    expect(
      clearedCount,
      "clicking empty map should restore the route list to its pre-click count"
    ).toBe(baselineFiltered);
  });
});

// --- helpers ---

async function waitForMaplibreIdle(page: Page, timeoutMs: number): Promise<void> {
  // window.__inn2innMap is set by components/map/Map.tsx in dev.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { __inn2innMap?: { loaded?: () => boolean; isStyleLoaded?: () => boolean } })
        .__inn2innMap;
      return Boolean(m && m.loaded?.() && m.isStyleLoaded?.());
    },
    undefined,
    { timeout: timeoutMs }
  );
}

export interface MapDebugState {
  canvasWidth: number;
  canvasHeight: number;
  containerWidth: number;
  containerHeight: number;
  zoom: number;
  center: [number, number];
  sources: string[];
  layers: string[];
  renderedFeaturesCount: number;
  tilesInFlight: number;
}

export async function readMapDebugState(page: Page): Promise<MapDebugState | null> {
  return page.evaluate(() => {
    const m = (window as unknown as {
      __inn2innMap?: {
        getCanvas: () => HTMLCanvasElement;
        getContainer: () => HTMLElement;
        getZoom: () => number;
        getCenter: () => { lng: number; lat: number };
        getStyle: () => { sources: Record<string, unknown>; layers: Array<{ id: string }> };
        queryRenderedFeatures: () => unknown[];
        _sourceCaches?: Record<string, { _tiles?: Record<string, { state?: string }> }>;
      };
    }).__inn2innMap;
    if (!m) return null;
    const canvas = m.getCanvas();
    const container = m.getContainer();
    const style = m.getStyle();
    const caches = m._sourceCaches ?? {};
    let loading = 0;
    for (const id of Object.keys(caches)) {
      const tiles = caches[id]?._tiles ?? {};
      for (const key of Object.keys(tiles)) {
        if (tiles[key].state === "loading") loading++;
      }
    }
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      zoom: m.getZoom(),
      center: [m.getCenter().lng, m.getCenter().lat] as [number, number],
      sources: Object.keys(style.sources),
      layers: style.layers.map((l) => l.id),
      renderedFeaturesCount: m.queryRenderedFeatures().length,
      tilesInFlight: loading,
    };
  });
}

