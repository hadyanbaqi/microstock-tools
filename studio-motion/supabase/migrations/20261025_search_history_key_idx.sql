-- Supabase advisor: the search_history.key foreign key had no covering index (joins from search_results / deletes).
create index if not exists search_history_key_idx on public.search_history (key);
