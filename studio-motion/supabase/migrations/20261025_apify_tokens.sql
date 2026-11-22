-- Kantong token Apify: several Apify tokens kept on the server (owner's personal site), encrypted with AES-256-GCM
-- (key derived from MCP_SECRET, see lib/secretStore.js). Searches, trend scans and MCP pick the token with the most
-- credit left and move to the next one when Apify refuses (credit used up, token rejected, memory cap full).
-- Server-only: RLS on, no policies.
create table if not exists public.apify_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null default '' check (char_length(label) <= 40),
  token_enc text not null,
  token_hash text not null unique,
  hint text not null default '',
  username text,
  plan text,
  usage_usd numeric(10, 4),
  limit_usd numeric(10, 4),
  checked_at timestamptz,
  enabled boolean not null default true,
  status text not null default 'ok' check (status in ('ok', 'habis', 'ditolak')),
  last_error text,
  last_used_at timestamptz,
  runs int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.apify_tokens enable row level security;

-- Trend scans can now be paid by the token pool.
alter table public.trend_scans drop constraint if exists trend_scans_paid_by_check;
alter table public.trend_scans add constraint trend_scans_paid_by_check check (paid_by in ('server', 'user', 'pool', 'demo'));

-- MCP searches are stored with source 'mcp' (counted for MCP_DAILY_LIMIT); the original check did not allow it.
alter table public.search_results drop constraint if exists search_results_source_check;
alter table public.search_results add constraint search_results_source_check check (source in ('search', 'apify-import', 'asset', 'mcp'));
