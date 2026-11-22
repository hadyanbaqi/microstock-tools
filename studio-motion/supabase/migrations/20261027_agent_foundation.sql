-- Agent AI foundation (27 Oct 2026). Built subscription-ready: every row belongs to an account. While the site is
-- personal there is one account, 'owner' (lib/account.js); when auth lands, account_id becomes the user's id.
-- Server-only like every other table: RLS on, no policies (the server uses the secret key).

-- Accounts and plans. 'owner' = unlimited, never billed.
create table if not exists public.accounts (
  id text primary key,
  email text,
  plan text not null default 'free',
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
insert into public.accounts (id, plan) values ('owner', 'owner') on conflict (id) do nothing;

-- AI providers per account (OpenRouter, Ciora, any OpenAI-compatible endpoint). Keys AES-256-GCM encrypted
-- (lib/secretStore.js, key from MCP_SECRET); key_source 'byok' = the account's own key, 'platform' = the site's key
-- billed through credits (subscription later).
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('openrouter', 'ciora', 'custom')),
  label text not null default '' check (char_length(label) <= 40),
  base_url text not null,
  key_enc text,
  hint text not null default '',
  key_source text not null default 'byok' check (key_source in ('byok', 'platform')),
  enabled boolean not null default true,
  status text not null default 'ok' check (status in ('ok', 'ditolak')),
  last_error text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_providers_account_idx on public.ai_providers (account_id);
alter table public.ai_providers enable row level security;

-- One settings row per account: preset + provider/model per task + monthly budget.
-- tasks = {"prompt": {"provider_id": "...", "model": "..."}, "metadata": {...}, "quality": {...}, "image": {...}, "video": {...}}
create table if not exists public.ai_settings (
  account_id text primary key references public.accounts (id) on delete cascade,
  preset text not null default 'seimbang' check (preset in ('hemat', 'seimbang', 'kualitas', 'custom')),
  tasks jsonb not null default '{}'::jsonb,
  monthly_budget_usd numeric(10, 2),
  updated_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;

-- Every AI call: what, which model, tokens, cost, who paid. Drives the budget check, the usage view and billing later.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  account_id text not null references public.accounts (id) on delete cascade,
  task text not null,
  provider text not null,
  model text not null,
  job_id uuid,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6),
  cost_estimated boolean not null default false,
  paid_by text not null default 'byok' check (paid_by in ('byok', 'platform', 'env')),
  ok boolean not null default true,
  error text,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_account_time_idx on public.ai_usage (account_id, created_at desc);
alter table public.ai_usage enable row level security;

-- Credit ledger for subscriptions (top-ups, monthly grants, usage debits). Balance = sum(delta). Unused while personal.
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  account_id text not null references public.accounts (id) on delete cascade,
  delta numeric(12, 4) not null,
  reason text not null check (reason in ('grant', 'topup', 'usage', 'refund', 'adjust')),
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_account_idx on public.credit_ledger (account_id, created_at desc);
alter table public.credit_ledger enable row level security;

-- Long-running agent work (prompt packs, metadata, quality checks, image/video generation). Video finishes by webhook.
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('prompt_pack', 'metadata', 'quality', 'image', 'video')),
  status text not null default 'menunggu' check (status in ('menunggu', 'berjalan', 'selesai', 'gagal', 'batal')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  provider_job_id text,
  cost_usd numeric(12, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_jobs_account_idx on public.ai_jobs (account_id, created_at desc);
alter table public.ai_jobs enable row level security;

-- Prompt Studio (stage 2): one pack per research brief, one row per prompt with its code (P<pack>-<n>).
create table if not exists public.prompt_packs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('image', 'video')),
  keyword text not null,
  research_key text,
  brief jsonb not null default '{}'::jsonb,
  target_model text,
  created_at timestamptz not null default now(),
  unique (account_id, code)
);
alter table public.prompt_packs enable row level security;

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  pack_id uuid not null references public.prompt_packs (id) on delete cascade,
  code text not null,
  concept text,
  text text not null,
  draft jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, code)
);
alter table public.prompts enable row level security;

-- Uploaded/generated assets (stage 3): quality check + metadata + per-platform status, then CSV/ZIP exports.
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  prompt_id uuid references public.prompts (id) on delete set null,
  kind text not null check (kind in ('image', 'video', 'vector')),
  filename text not null,
  storage_path text,
  width int,
  height int,
  duration_s numeric(8, 2),
  ai_generated boolean not null default true,
  quality jsonb,
  title text,
  keywords text[],
  category int,
  status text not null default 'baru' check (status in ('baru', 'dicek', 'siap', 'ditolak', 'diekspor')),
  platforms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, filename)
);
alter table public.assets enable row level security;

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts (id) on delete cascade,
  platform text not null,
  asset_ids uuid[] not null,
  storage_path text,
  created_at timestamptz not null default now()
);
alter table public.exports enable row level security;
