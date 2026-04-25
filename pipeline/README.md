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
3. Make sure your local OSRM covers the region's bbox (see below). If the
   region falls outside, build a wider OSRM with `OSRM_BBOX="..." OSRM_NAME="..." OSRM_PORT="..." bash pipeline/scripts/setup-osrm-local.sh`.
4. `OSRM_URL=http://localhost:<port> npm run pipeline -- --region=<slug>`

The new region appears in the landing page and `<RegionPicker>` automatically
once `status='ready'`.

## California region coverage

Two OSRM extracts cover all currently-defined regions:

| Extract     | Port | Bbox                            | Counties                                   |
|-------------|------|---------------------------------|--------------------------------------------|
| bayarea     | 5000 | -123.5,36.9,-121.4,38.7         | Marin, Napa, Sonoma, San Mateo             |
| norcal      | 5001 | -124.5,35.0,-117.5,42.0         | All of the above plus Mariposa, Tuolumne, El Dorado, Placer, Mono, Inyo, Monterey, San Luis Obispo, Mendocino, Humboldt, Santa Cruz, Madera |

**Not yet covered (need a SoCal extract):** Santa Barbara, San Bernardino.
Build with:

```
OSRM_BBOX="-118.0,33.5,-115.5,35.2" \
OSRM_NAME="socal-foot" \
OSRM_PORT="5002" \
bash pipeline/scripts/setup-osrm-local.sh
```

Then run those counties' pipelines with `OSRM_URL=http://localhost:5002`.

## Foot-routing provider

**`router.project-osrm.org` is car-only**, per the OSRM maintainers' own [README](https://github.com/Project-OSRM/osrm-backend#using-the-api-at-router-project-osrm-org). It accepts `/route/v1/foot/` URLs but silently answers with the car profile. We explicitly refuse to use it for this project.

### Recommended: OpenRouteService (free, hosted)

Sign up for a free key at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) and set `ORS_API_KEY` in `.env.local`. The pipeline uses the `foot-hiking` profile which follows trails, footways, and paths — exactly right for inn-to-inn hiking. Free tier limits: 2000 requests/day and 40 requests/minute. Marin's ~800 pairs (at k-nearest=30) fit comfortably.

### Alternative: self-hosted OSRM (foot profile)

If you want no external dependency:

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

**Important:** the OSRM pipeline above uses `-p /opt/foot.lua` for the extract step — make sure you don't substitute `/opt/car.lua`. The foot profile is what routes via `highway=path|track|footway|bridleway`; the car profile cannot reach trail-only lodgings like West Point Inn.

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
