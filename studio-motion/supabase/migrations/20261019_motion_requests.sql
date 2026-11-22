-- Studio Motion "Kirim ke Claude": video ideas (text and/or reference image) the owner sends from StockScope.
-- Claude reads them through MCP (permintaan_video) and answers with buat_video (html), so generation runs on the
-- owner's Claude subscription instead of the API. Server-only: RLS on, no policies.
create table if not exists public.motion_requests (
  id uuid primary key default gen_random_uuid(),
  idea text not null default '',
  image text,
  aspect text not null default '16:9',
  duration int not null default 10,
  status text not null default 'baru',
  job_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motion_requests_created_idx on public.motion_requests (created_at desc);
alter table public.motion_requests enable row level security;
alter table public.motion_requests add column if not exists has_image boolean generated always as (image is not null) stored;
