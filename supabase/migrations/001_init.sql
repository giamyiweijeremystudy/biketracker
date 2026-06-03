-- Enable PostGIS
create extension if not exists postgis;

-- Routes table
create table routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Untitled route',
  distance_m float,
  duration_s int,
  recorded_at timestamptz default now()
);

-- Route points table
create table route_points (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references routes(id) on delete cascade not null,
  lat float not null,
  lng float not null,
  elevation_m float,
  timestamp timestamptz,
  seq int not null
);

-- Row level security
alter table routes enable row level security;
alter table route_points enable row level security;

-- Users can only see/edit their own routes
create policy "own routes" on routes
  for all using (auth.uid() = user_id);

create policy "own route points" on route_points
  for all using (
    route_id in (select id from routes where user_id = auth.uid())
  );

-- Index for fast user queries
create index on routes(user_id, recorded_at desc);
create index on route_points(route_id, seq);
