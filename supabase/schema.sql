create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  french text not null,
  english text not null default '',
  example text not null default '',
  notes text not null default '',
  tags jsonb not null default '[]'::jsonb,
  confidence integer not null default 1 check (confidence between 1 and 4),
  part_of_speech text not null default '',
  ipa text not null default '',
  gender text not null default '',
  conjugation jsonb not null default '{}'::jsonb,
  adjective_forms jsonb not null default '{}'::jsonb,
  last_reviewed text not null default 'Not reviewed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_id_created_at_idx
  on public.notes (user_id, created_at desc);

create unique index if not exists notes_user_category_french_idx
  on public.notes (user_id, category, lower(french));

alter table public.notes enable row level security;

drop policy if exists "Users can read their notes" on public.notes;
create policy "Users can read their notes"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their notes" on public.notes;
create policy "Users can create their notes"
  on public.notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their notes" on public.notes;
create policy "Users can update their notes"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their notes" on public.notes;
create policy "Users can delete their notes"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_notes_updated_at on public.notes;

create trigger set_notes_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'zh')),
  quiz_vocabulary_limit integer not null default 50 check (quiz_vocabulary_limit between 1 and 200),
  study_vocabulary_limit integer not null default 50 check (study_vocabulary_limit between 0 and 200),
  study_grammar_limit integer not null default 20 check (study_grammar_limit between 0 and 100),
  study_phrase_limit integer not null default 20 check (study_phrase_limit between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences
  add column if not exists quiz_vocabulary_limit integer not null default 50 check (quiz_vocabulary_limit between 1 and 200);

alter table public.user_preferences
  add column if not exists study_vocabulary_limit integer not null default 50 check (study_vocabulary_limit between 0 and 200);

alter table public.user_preferences
  add column if not exists study_grammar_limit integer not null default 20 check (study_grammar_limit between 0 and 100);

alter table public.user_preferences
  add column if not exists study_phrase_limit integer not null default 20 check (study_phrase_limit between 0 and 100);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read their preferences" on public.user_preferences;
create policy "Users can read their preferences"
  on public.user_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their preferences" on public.user_preferences;
create policy "Users can create their preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their preferences" on public.user_preferences;
create policy "Users can update their preferences"
  on public.user_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;

create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.set_updated_at();

create table if not exists public.daily_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  add_note boolean not null default false,
  study boolean not null default false,
  quiz boolean not null default false,
  quiz_state jsonb not null default '{}'::jsonb,
  study_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_learning_state
  add column if not exists study_state jsonb not null default '{}'::jsonb;

alter table public.daily_learning_state enable row level security;

drop policy if exists "Users can read their daily learning state" on public.daily_learning_state;
create policy "Users can read their daily learning state"
  on public.daily_learning_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their daily learning state" on public.daily_learning_state;
create policy "Users can create their daily learning state"
  on public.daily_learning_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their daily learning state" on public.daily_learning_state;
create policy "Users can update their daily learning state"
  on public.daily_learning_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_daily_learning_state_updated_at on public.daily_learning_state;

create trigger set_daily_learning_state_updated_at
  before update on public.daily_learning_state
  for each row
  execute function public.set_updated_at();

create table if not exists public.user_subscription_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'subscriber')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscription_roles enable row level security;

drop policy if exists "Users can read their subscription role" on public.user_subscription_roles;
create policy "Users can read their subscription role"
  on public.user_subscription_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.user_subscription_roles from public, anon, authenticated;
grant select on table public.user_subscription_roles to authenticated;

drop trigger if exists set_user_subscription_roles_updated_at on public.user_subscription_roles;

create trigger set_user_subscription_roles_updated_at
  before update on public.user_subscription_roles
  for each row
  execute function public.set_updated_at();

create table if not exists public.ai_autofill_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

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

drop trigger if exists set_ai_autofill_usage_updated_at on public.ai_autofill_usage;

create trigger set_ai_autofill_usage_updated_at
  before update on public.ai_autofill_usage
  for each row
  execute function public.set_updated_at();

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
