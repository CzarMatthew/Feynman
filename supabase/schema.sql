-- Feynman schema. Run once in the Supabase SQL editor.

-- Public part of each day's pair: what everyone sees on the Today page.
create table if not exists public.daily_sets (
  date date primary key,
  status text not null default 'pending' check (status in ('pending','generating','ready','failed')),
  field text,
  article jsonb,      -- {title,url,source,published_at,summary,paywalled}
  podcast jsonb,      -- {title,url,audio_url,show,published_at,summary,duration}
  connection_note text, -- why these two go together (shown after you write)
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private part: source text and questions. No user policies, so only the
-- server (service role) can read it. Questions are revealed per session.
create table if not exists public.daily_private (
  date date primary key references public.daily_sets(date) on delete cascade,
  article_text text,
  podcast_text text,
  questions jsonb not null, -- {easy:{question,guide}, medium:..., advanced:..., extreme:...}
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null references public.daily_sets(date),
  tier text not null check (tier in ('easy','medium','advanced','extreme')),
  question text not null,
  status text not null default 'writing'
    check (status in ('writing','grading','graded','discussing','complete')),
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  draft text not null default '',
  response text,
  word_count int,
  integrity jsonb,
  grade jsonb,
  overall_score int,
  acknowledged_at timestamptz,
  discussion jsonb not null default '[]'::jsonb,
  wrap_up jsonb,
  completed_at timestamptz,
  unique (user_id, date, tier)
);

create index if not exists sessions_user_started on public.sessions (user_id, started_at desc);

alter table public.daily_sets enable row level security;
alter table public.daily_private enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "signed-in users read daily sets" on public.daily_sets;
create policy "signed-in users read daily sets" on public.daily_sets
  for select to authenticated using (true);

drop policy if exists "users read own sessions" on public.sessions;
create policy "users read own sessions" on public.sessions
  for select to authenticated using (auth.uid() = user_id);

-- All writes go through the app's server routes with the service role key.
