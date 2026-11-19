-- 003: per-type detail for assets/accounts, and soft delete (trash) for settings items. Additive only.
alter table public.v2_assets add column if not exists detail jsonb not null default '{}'::jsonb, add column if not exists deleted_at timestamptz;
alter table public.v2_accounts add column if not exists detail jsonb not null default '{}'::jsonb, add column if not exists deleted_at timestamptz;
alter table public.v2_categories add column if not exists deleted_at timestamptz;
alter table public.v2_recurring add column if not exists deleted_at timestamptz;
