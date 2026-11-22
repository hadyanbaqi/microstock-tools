-- Who searched what: makes the "Tersimpan" list private per workspace (a random code kept in the browser)
-- while search_results stays a shared cache of public Adobe data. Server-only (RLS on, no policies).
create table public.search_history (
  owner text not null check (char_length(owner) between 16 and 64),
  key text not null references public.search_results (key) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (owner, key)
);
create index search_history_owner_idx on public.search_history (owner, opened_at desc);
alter table public.search_history enable row level security;
