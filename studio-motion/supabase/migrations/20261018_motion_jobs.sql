-- Studio Motion: video orders Claude creates through MCP (buat_video) and renders on the owner's Mac.
-- Server-only: RLS on, no policies.
create table if not exists public.motion_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spec jsonb not null,
  outputs text[] not null default '{mp4,matte}',
  title text not null,
  keywords text not null,
  status text not null default 'baru',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motion_jobs_created_idx on public.motion_jobs (created_at desc);
alter table public.motion_jobs enable row level security;
