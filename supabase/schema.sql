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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
