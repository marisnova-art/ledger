-- Copy (upsert) from ledger_state into v2_* ; re-runnable. Reads ledger_state only.
with src as (select s.user_id, b.value as book from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_books (id, user_id, name, kind, icon, theme, created_at)
select book->>'id', user_id, book->>'name', 'personal', 'wallet', book->>'theme',
  coalesce(to_timestamp((book->>'createdAt')::bigint/1000.0), now()) from src
on conflict (id) do update set name = excluded.name, theme = excluded.theme, updated_at = now();

with src as (select b.value->>'id' as book_id, b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_categories (id, book_id, name, type, color, sort)
select c.value->>'id', book_id, c.value->>'name', c.value->>'type', c.value->>'color', c.ordinality::int
from src, jsonb_array_elements(d->'categories') with ordinality c
on conflict (id) do update set name = excluded.name, type = excluded.type, color = excluded.color;

with src as (select b.value->>'id' as book_id, b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_accounts (id, book_id, name, type, color, initial_balance, sort)
select a.value->>'id', book_id, a.value->>'name', coalesce(a.value->>'type', 'bank'), a.value->>'color', coalesce((a.value->>'initial')::bigint, 0), a.ordinality::int
from src, jsonb_array_elements(d->'accounts') with ordinality a
on conflict (id) do update set name = excluded.name, type = excluded.type, color = excluded.color, initial_balance = excluded.initial_balance;

with src as (select b.value->>'id' as book_id, b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_recurring (id, book_id, name, memo, type, amount, amount_type, freq, day, next_date, active, category_id, account_id, log)
select r->>'id', book_id, r->>'name', r->>'desc', r->>'type', coalesce((r->>'amount')::bigint, 0), coalesce(r->>'amountType', 'fixed'),
  coalesce(r->>'freq', 'monthly'), (r->>'day')::int, nullif(r->>'nextDate', '')::date, coalesce((r->>'active')::boolean, true),
  r->>'categoryId', r->>'accountId', coalesce(r->'log', '[]')
from src, jsonb_array_elements(d->'recurring') r
on conflict (id) do update set name = excluded.name, memo = excluded.memo, amount = excluded.amount, amount_type = excluded.amount_type,
  day = excluded.day, next_date = excluded.next_date, active = excluded.active, category_id = excluded.category_id, account_id = excluded.account_id, log = excluded.log;

with src as (select b.value->>'id' as book_id, b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_transactions (id, book_id, date, time, type, amount, description, vendor, memo, category_id, account_id, to_account_id, recurring_id, created_at, updated_at)
select t->>'id', book_id, (t->>'date')::date,
  to_char(to_timestamp((t->>'createdAt')::bigint/1000.0) at time zone 'Asia/Seoul', 'HH24:MI'),
  t->>'type', abs((t->>'amount')::numeric)::bigint, t->>'desc', nullif(t->>'vendor', ''), nullif(t->>'memo', ''),
  t->>'categoryId', t->>'accountId', t->>'toAccountId', t->>'recurringId',
  coalesce(to_timestamp((t->>'createdAt')::bigint/1000.0), now()), coalesce(to_timestamp((t->>'updatedAt')::bigint/1000.0), now())
from src, jsonb_array_elements(d->'transactions') t
on conflict (id) do update set date = excluded.date, type = excluded.type, amount = excluded.amount, description = excluded.description,
  vendor = excluded.vendor, memo = excluded.memo, category_id = excluded.category_id, account_id = excluded.account_id,
  to_account_id = excluded.to_account_id, recurring_id = excluded.recurring_id, updated_at = excluded.updated_at;

with src as (select b.value->>'id' as book_id, b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_assets (id, book_id, name, type, memo, color, cost, value, sort)
select a.value->>'id', book_id, a.value->>'name', a.value->>'type', a.value->>'memo', a.value->>'color', (a.value->>'cost')::bigint, coalesce((a.value->>'value')::bigint, 0), a.ordinality::int
from src, jsonb_array_elements(d->'assets') with ordinality a
on conflict (id) do update set name = excluded.name, type = excluded.type, memo = excluded.memo, color = excluded.color, cost = excluded.cost, value = excluded.value;

with src as (select b.value->'data' as d from public.ledger_state s, jsonb_array_elements(s.data->'books') b)
insert into public.v2_asset_snapshots (asset_id, date, value, memo)
select distinct on (a->>'id', (h->>'date')::date) a->>'id', (h->>'date')::date, (h->>'value')::bigint, h->>'memo'
from src, jsonb_array_elements(d->'assets') a, jsonb_array_elements(coalesce(a->'history', '[]')) h
order by a->>'id', (h->>'date')::date
on conflict (asset_id, date) do update set value = excluded.value, memo = excluded.memo;
