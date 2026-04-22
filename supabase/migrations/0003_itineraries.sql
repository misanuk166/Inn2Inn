-- Saved trips. Cross-region by design — a leg may span any loaded region.
create table itineraries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  legs       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index itineraries_user_ix on itineraries (user_id, updated_at desc);

alter table itineraries enable row level security;

create policy "owner read"   on itineraries for select using (auth.uid() = user_id);
create policy "owner insert" on itineraries for insert with check (auth.uid() = user_id);
create policy "owner update" on itineraries for update using (auth.uid() = user_id);
create policy "owner delete" on itineraries for delete using (auth.uid() = user_id);

-- Auto-bump updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger itineraries_touch
  before update on itineraries
  for each row execute function touch_updated_at();
