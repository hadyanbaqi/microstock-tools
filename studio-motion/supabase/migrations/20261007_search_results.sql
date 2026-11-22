-- Every paid search result, kept permanently so users never pay twice for the same data.
-- key = sha1 of the normalized search params (same key as lib/cache.js). Server-only (RLS on, no policies).
create table public.search_results (
  key text primary key,
  params jsonb not null,
  query text not null default '',
  creator_id text not null default '',
  item_count int not null default 0,
  result jsonb not null,
  source text not null default 'search' check (source in ('search', 'apify-import', 'asset')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index search_results_updated_idx on public.search_results (updated_at desc);
alter table public.search_results enable row level security;
