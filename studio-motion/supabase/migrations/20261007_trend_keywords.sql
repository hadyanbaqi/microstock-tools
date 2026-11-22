-- Tren Keyword: one row per "Perbarui tren" click (scan) and its computed keywords.
-- Only the StockScope server (secret key) reads/writes: RLS on, no policies for anon/authenticated.

create table public.trend_scans (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  themes_total int not null check (themes_total between 1 and 50),
  themes_done text[] not null default '{}',
  items_per_theme int not null check (items_per_theme between 10 and 300),
  cost_estimate numeric(6, 2),
  paid_by text not null check (paid_by in ('server', 'user', 'demo')),
  is_demo boolean not null default false,
  assets_scanned int not null default 0
);

create table public.trend_keywords (
  id bigint generated always as identity primary key,
  scan_id bigint not null references public.trend_scans (id) on delete cascade,
  theme text not null,
  keyword text not null,
  label text not null check (label in ('naik', 'celah', 'stabil', 'jenuh')),
  score numeric(5, 1) not null,
  median_velocity numeric(10, 1) not null,
  ratio numeric(6, 1),
  sold_share int not null,
  supply_share int not null,
  ai_share int not null,
  new_assets int not null,
  best_format text,
  best_orientation text,
  pairs text[] not null default '{}',
  samples jsonb not null default '[]',
  unique (scan_id, theme, keyword)
);

create index trend_keywords_scan_idx on public.trend_keywords (scan_id);
create index trend_scans_status_idx on public.trend_scans (status, is_demo, created_at desc);

alter table public.trend_scans enable row level security;
alter table public.trend_keywords enable row level security;

-- Marks one theme of a scan as done (atomic, so themes can run in parallel).
create or replace function public.trend_theme_done(p_scan bigint, p_theme text, p_assets int)
returns int
language sql
security invoker
set search_path = ''
as $$
  update public.trend_scans
     set themes_done = array_append(themes_done, p_theme),
         assets_scanned = assets_scanned + p_assets
   where id = p_scan and status = 'running' and not (p_theme = any (themes_done))
  returning cardinality(themes_done);
$$;

revoke execute on function public.trend_theme_done(bigint, text, int) from public, anon, authenticated;
grant execute on function public.trend_theme_done(bigint, text, int) to service_role;
