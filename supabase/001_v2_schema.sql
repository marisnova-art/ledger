-- v2 schema: additive only, does not touch public.ledger_state
create table public.v2_books (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, kind text not null default 'personal' check (kind in ('personal','business','corp')),
  icon text, image_url text, theme text, sort int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.v2_categories (
  id text primary key, book_id text not null references public.v2_books(id) on delete cascade,
  name text not null, type text not null check (type in ('income','expense')),
  color text, icon text, hidden boolean not null default false, sort int not null default 0,
  unique (book_id, type, name));
create table public.v2_accounts (
  id text primary key, book_id text not null references public.v2_books(id) on delete cascade,
  name text not null, type text not null default 'bank', color text, initial_balance bigint not null default 0,
  sort int not null default 0, hidden boolean not null default false);
create table public.v2_recurring (
  id text primary key, book_id text not null references public.v2_books(id) on delete cascade,
  name text not null, memo text, type text not null check (type in ('income','expense')),
  amount bigint not null, amount_type text not null default 'fixed', freq text not null default 'monthly', day int,
  usual_time text, next_date date, active boolean not null default true,
  category_id text references public.v2_categories(id) on delete set null,
  account_id text references public.v2_accounts(id) on delete set null, log jsonb not null default '[]');
create table public.v2_transactions (
  id text primary key, book_id text not null references public.v2_books(id) on delete cascade,
  date date not null, time text, type text not null check (type in ('income','expense','transfer')),
  amount bigint not null check (amount >= 0), description text, vendor text, memo text, evidence text,
  category_id text references public.v2_categories(id) on delete set null,
  account_id text references public.v2_accounts(id) on delete set null,
  to_account_id text references public.v2_accounts(id) on delete set null,
  recurring_id text references public.v2_recurring(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create index on public.v2_transactions (book_id, date desc);
create table public.v2_assets (
  id text primary key, book_id text not null references public.v2_books(id) on delete cascade,
  name text not null, type text not null, memo text, color text, cost bigint, value bigint not null default 0,
  sort int not null default 0, created_at timestamptz not null default now());
create table public.v2_asset_snapshots (
  asset_id text not null references public.v2_assets(id) on delete cascade, date date not null,
  value bigint not null, memo text, primary key (asset_id, date));
-- RLS: owner of the book only
alter table public.v2_books enable row level security;
create policy v2_books_own on public.v2_books for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.v2_owns_book(b text) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.v2_books where id = b and user_id = (select auth.uid())) $$;
revoke all on function public.v2_owns_book(text) from public, anon;
grant execute on function public.v2_owns_book(text) to authenticated;
do $$ declare t text; begin
  foreach t in array array['v2_categories','v2_accounts','v2_recurring','v2_transactions','v2_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.v2_owns_book(book_id)) with check (public.v2_owns_book(book_id))', t || '_own', t);
  end loop; end $$;
alter table public.v2_asset_snapshots enable row level security;
create policy v2_asset_snapshots_own on public.v2_asset_snapshots for all to authenticated
  using (exists (select 1 from public.v2_assets a where a.id = asset_id and public.v2_owns_book(a.book_id)))
  with check (exists (select 1 from public.v2_assets a where a.id = asset_id and public.v2_owns_book(a.book_id)));
