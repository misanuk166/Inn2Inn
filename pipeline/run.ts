// Entry point for the data pipeline.
//
//   npm run pipeline -- --region=marin             (default: run all steps)
//   npm run pipeline -- --region=marin --only=lodging,routes
//   npm run pipeline -- --region=marin --skip=pois
//
// Steps:
//   1. region   — upsert the region row (status = 'building')
//   2. lodging  — Overpass + seed file → lodging table
//   3. routes   — k-nearest pairs → OSRM → routes table (with elevation profile)
//   4. scoring  — compute scenic sub-scores via PostGIS spatial joins
//   5. pois     — Overpass → POIs within 200m of each route polyline
//   6. ready    — mark the region 'ready'
//
// Heavy network step (lodging/routes/scoring/pois) all hit external APIs
// (Overpass, OSRM, open-elevation). Be patient and respect rate limits.

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv();
import { loadRegionConfig } from "./lib/region";
import { upsertRegion, markRegionReady } from "./01-region";
import { buildLodging } from "./02-build-lodging";
import { computeRoutes } from "./04-compute-routes";
import { scoreRoutes } from "./05-score-routes";
import { extractPois } from "./06-extract-pois";
import { endPgPool } from "./lib/db";
import { log } from "./lib/log";

type StepName = "region" | "lodging" | "routes" | "scoring" | "pois" | "ready";
const ALL_STEPS: StepName[] = ["region", "lodging", "routes", "scoring", "pois", "ready"];

interface Args {
  region: string;
  only?: Set<StepName>;
  skip?: Set<StepName>;
}

function parseArgs(): Args {
  const args: Args = { region: "" };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([a-z]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "region") args.region = v;
    else if (k === "only") args.only = new Set(v.split(",") as StepName[]);
    else if (k === "skip") args.skip = new Set(v.split(",") as StepName[]);
  }
  if (!args.region) {
    console.error("Usage: npm run pipeline -- --region=<slug> [--only=...] [--skip=...]");
    process.exit(1);
  }
  return args;
}

function shouldRun(step: StepName, args: Args): boolean {
  if (args.only && !args.only.has(step)) return false;
  if (args.skip && args.skip.has(step)) return false;
  return true;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const cfg = await loadRegionConfig(args.region);
  log("pipeline", `region=${cfg.slug} (${cfg.name})`);
  log("pipeline", `bbox=${cfg.bbox.join(", ")}`);

  let routesCount = 0;

  for (const step of ALL_STEPS) {
    if (!shouldRun(step, args)) {
      log("pipeline", `skipping ${step}`);
      continue;
    }
    log("pipeline", `── ${step} ──`);
    switch (step) {
      case "region":
        await upsertRegion(cfg);
        break;
      case "lodging":
        await buildLodging(cfg);
        break;
      case "routes":
        routesCount = await computeRoutes(cfg);
        break;
      case "scoring":
        await scoreRoutes(cfg);
        break;
      case "pois":
        await extractPois(cfg);
        break;
      case "ready":
        await markRegionReady(cfg.slug, routesCount);
        break;
    }
  }
  log("pipeline", "complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => endPgPool());
