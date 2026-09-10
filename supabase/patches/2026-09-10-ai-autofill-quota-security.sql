alter table public.user_subscription_roles enable row level security;

drop policy if exists "Users can read their subscription role" on public.user_subscription_roles;
create policy "Users can read their subscription role"
  on public.user_subscription_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.user_subscription_roles from public, anon, authenticated;
grant select on table public.user_subscription_roles to authenticated;

alter table public.ai_autofill_usage enable row level security;

drop policy if exists "Users can read their AI auto-fill usage" on public.ai_autofill_usage;
create policy "Users can read their AI auto-fill usage"
  on public.ai_autofill_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their AI auto-fill usage" on public.ai_autofill_usage;
drop policy if exists "Users can update their AI auto-fill usage" on public.ai_autofill_usage;

revoke all on table public.ai_autofill_usage from public, anon, authenticated;
grant select on table public.ai_autofill_usage to authenticated;

create or replace function public.consume_ai_autofill_quota()
returns table (
  allowed boolean,
  request_count integer,
  daily_limit integer,
  subscription_tier text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  usage_date text := ((current_timestamp at time zone 'utc')::date)::text;
  resolved_tier text := 'free';
  resolved_limit integer;
  resolved_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select roles.subscription_tier
    into resolved_tier
  from public.user_subscription_roles as roles
  where roles.user_id = caller_id;

  resolved_tier := case
    when resolved_tier = 'subscriber' then 'subscriber'
    else 'free'
  end;
  resolved_limit := case
    when resolved_tier = 'subscriber' then 1000
    else 10
  end;

  insert into public.ai_autofill_usage as usage (
    user_id,
    date,
    request_count
  )
  values (caller_id, usage_date, 1)
  on conflict (user_id, date) do update
    set request_count = usage.request_count + 1,
        updated_at = current_timestamp
    where usage.request_count < resolved_limit
  returning usage.request_count into resolved_count;

  if resolved_count is null then
    select usage.request_count
      into resolved_count
    from public.ai_autofill_usage as usage
    where usage.user_id = caller_id
      and usage.date = usage_date;

    return query
      select false, coalesce(resolved_count, 0), resolved_limit, resolved_tier;
    return;
  end if;

  return query
    select true, resolved_count, resolved_limit, resolved_tier;
end;
$$;

revoke execute on function public.consume_ai_autofill_quota() from public, anon, authenticated;
grant execute on function public.consume_ai_autofill_quota() to authenticated;
