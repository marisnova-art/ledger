-- Daily AI call counter per user (for the free/paid limit). Touches only new v2_ objects.
create table if not exists public.v2_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.v2_ai_usage enable row level security;
create policy v2_ai_usage_read on public.v2_ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Adds one call for the signed-in user (Korea date) and says whether it is within the limit.
create or replace function public.v2_ai_bump(p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.v2_ai_usage as u (user_id, day, n)
  values (auth.uid(), (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (user_id, day) do update set n = u.n + 1
  returning n into v;
  return v <= p_limit;
end $$;
revoke all on function public.v2_ai_bump(int) from public, anon;
grant execute on function public.v2_ai_bump(int) to authenticated;
