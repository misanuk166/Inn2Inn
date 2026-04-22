-- Regions: each row is a curated geographic area (e.g. "marin", "whitemtns").
-- Adding a region = inserting a row + running the pipeline against its bbox.
create table regions (
  slug         text primary key,
  name         text not null,
  bbox         geometry(Polygon, 4326) not null,
  status       text not null default 'building'
                 check (status in ('building','ready','disabled')),
  routes_count int not null default 0,
  updated_at   timestamptz not null default now()
);

-- Lodging properties. source_id is the OSM id (e.g. "node/123") or a seed-file id.
create table lodging (
  id            uuid primary key default gen_random_uuid(),
  region_slug   text not null references regions(slug) on delete cascade,
  source_id     text not null,
  name          text not null,
  type          text not null,
  geog          geography(Point, 4326) not null,
  city          text,
  state         text,
  address       text,
  elevation_ft  int,
  price_range   text,
  description   text,
  photo_url     text,
  website       text,
  unique (region_slug, source_id)
);
create index lodging_geog_gix    on lodging using gist (geog);
create index lodging_region_ix   on lodging (region_slug);

-- Pre-computed hiking routes between lodging pairs within ~10 mi.
-- a_id < b_id is the canonical ordering for unordered pairs.
create table routes (
  id           uuid primary key default gen_random_uuid(),
  region_slug  text not null references regions(slug) on delete cascade,
  a_id         uuid not null references lodging(id) on delete cascade,
  b_id         uuid not null references lodging(id) on delete cascade,
  distance_mi  numeric(6,2) not null,
  duration_min int not null,
  gain_ft      int not null,
  loss_ft      int not null,
  polyline     geography(LineString, 4326) not null,
  elevation_profile jsonb not null,  -- [{distMi, elevFt}, ...] sampled along polyline
  scenic_score int not null,
  sub_scores   jsonb not null,       -- {naturalness, elevation, water, surface, distance}
  category     text not null
                 check (category in ('highly_scenic','scenic','moderately_scenic','urban_road')),
  check (a_id < b_id),
  unique (a_id, b_id)
);
create index routes_polyline_gix on routes using gist (polyline);
create index routes_region_ix    on routes (region_slug);
create index routes_a_ix         on routes (a_id);
create index routes_b_ix         on routes (b_id);
create index routes_scenic_ix    on routes (scenic_score desc);

-- Points of interest along each route.
create table pois (
  id           uuid primary key default gen_random_uuid(),
  region_slug  text not null references regions(slug) on delete cascade,
  route_id     uuid not null references routes(id) on delete cascade,
  osm_id       text not null,
  geog         geography(Point, 4326) not null,
  kind         text not null
                 check (kind in ('restaurant','cafe','viewpoint','peak')),
  name         text,
  unique (route_id, osm_id)
);
create index pois_route_ix  on pois (route_id);
create index pois_geog_gix  on pois using gist (geog);

-- Catalog tables are world-readable via the anon key.
alter table regions enable row level security;
alter table lodging enable row level security;
alter table routes  enable row level security;
alter table pois    enable row level security;

create policy "regions readable" on regions for select using (true);
create policy "lodging readable" on lodging for select using (true);
create policy "routes readable"  on routes  for select using (true);
create policy "pois readable"    on pois    for select using (true);

-- Writes happen only via the pipeline, which uses the service-role key (bypasses RLS).
