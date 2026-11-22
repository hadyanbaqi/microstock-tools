-- Owner's encrypted settings (e.g. the Apify token the MCP endpoint may use). Server-only: RLS on, no policies.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
