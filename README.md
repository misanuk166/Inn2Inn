# Inn2Inn

A web app for planning multi-day inn-to-inn hiking trips across the United States. Discover lodging properties that are walkable between each other via trail, see how scenic each route is, and assemble routes into a multi-day itinerary.

**v1 region:** Marin County, CA. The architecture is region-aware — adding a new region is a YAML drop and a pipeline run, no app code changes.

See [`docs/inn2inn_product_prompt.md`](docs/inn2inn_product_prompt.md) for the full product spec.

## Stack

- **App:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS
- **Maps:** MapLibre GL JS + free vector tiles
- **Data:** Supabase (Postgres + PostGIS + Auth)
- **Routing:** OSM extracts → local OSRM (foot profile) at pipeline time

## Pages

- `/explorer` — discover lodging and routes on an interactive map, filter by scenic rating / distance / elevation
- `/routes/[id]` — single-route detail with elevation profile, scenic sub-scores, POIs
- `/planner` — build multi-day itineraries with custom waypoints, save and load (auth required)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase keys
npm run dev                          # http://localhost:3000
```

To populate data for a region:

```bash
npm run pipeline -- --region=marin
```

See [`pipeline/README.md`](pipeline/README.md) for the full data-pipeline runbook (OSM extracts, OSRM, scenic scoring) and [`pipeline/regions/_template.yaml`](pipeline/regions/_template.yaml) for adding a new region.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check
- `npm run test` — Vitest
- `npm run pipeline -- --region=<slug>` — run the data pipeline for a region
