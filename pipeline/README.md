# Inn2Inn Data Pipeline

Region-parameterized pipeline that loads everything the app needs (lodging, routes, scenic scores, POIs) into Postgres.

## Quick start (Marin)

```bash
# 1. Set up Supabase + apply migrations
supabase init                  # if you haven't already
supabase db push               # applies supabase/migrations/*.sql

# 2. Configure DB credentials
cp .env.local.example .env.local
# Fill in DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# 3. Run the full pipeline for Marin
npm run pipeline -- --region=marin
```

Expected wall-clock time on a fresh Marin run: ~10–20 minutes (most of it spent on Overpass + open-elevation rate-limited round-trips).

## Steps

| # | Name      | What it does                                                                 |
|---|-----------|------------------------------------------------------------------------------|
| 1 | `region`  | Upsert the region row, mark `status='building'`                              |
| 2 | `lodging` | Overpass `tourism=*` + YAML seed → dedupe → filter freeway hotels → upsert   |
| 3 | `routes`  | k-nearest pairs (PostGIS `ST_DWithin` 10mi) → OSRM foot route → upsert       |
| 4 | `scoring` | Overpass features → PostGIS scratch tables → 5 sub-scores per route          |
| 5 | `pois`    | Overpass POIs in bbox → assign to routes within 200m                         |
| 6 | `ready`   | Mark `status='ready'` and write `routes_count`                               |

Run a subset with `--only=lodging,routes` or `--skip=pois`.

## Adding a new region

1. `cp pipeline/regions/_template.yaml pipeline/regions/<slug>.yaml`
2. Fill in `slug`, `name`, `bbox`, optional `seedLodging`.
3. `npm run pipeline -- --region=<slug>`

The new region appears in the app's `<RegionPicker>` automatically once `status='ready'`.

## Production OSRM (vs. the public demo)

By default, the pipeline routes through `https://router.project-osrm.org`, which is rate-limited and not appropriate for large regions. To self-host:

```bash
# Download + build a foot-profile graph for your area
wget https://download.geofabrik.de/north-america/us/california-latest.osm.pbf
docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-extract -p /opt/foot.lua /data/california-latest.osm.pbf
docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-partition /data/california-latest.osrm
docker run -t -v "$(pwd):/data" osrm/osrm-backend osrm-customize  /data/california-latest.osrm
docker run -t -i -p 5000:5000 -v "$(pwd):/data" osrm/osrm-backend osrm-routed --algorithm mld /data/california-latest.osrm

# Then point the pipeline (and the on-demand routing API) at it:
export OSRM_URL=http://localhost:5000
```

For nationwide coverage, build per-state graphs and route to whichever endpoint covers the request. The architecture is designed for this.

## External services used

- **Overpass API** — OSM queries (lodging, roads, features, POIs). Public, rate-limited, polite use only.
- **OSRM** — foot routing. Public demo at `router.project-osrm.org` for v1; self-host for production.
- **Open-Elevation** — elevation lookups along routes. Public, rate-limited.
- **Supabase Postgres + PostGIS** — primary storage.

No paid APIs.

## Idempotency & data freshness

Every step is idempotent and keyed by `(region_slug, source_id)` (or equivalent). Re-running the pipeline for a region:

1. Upserts current data (no duplicates).
2. **Deletes** anything in that region that wasn't seen this run (so dropped OSM tags or removed seed entries clean themselves up).

Other regions are untouched.
