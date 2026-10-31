-- MyFit AI — Phase 3: AI 퍼스널 트레이너
-- AI는 DB를 직접 수정하지 않는다. 제안은 ai_recommendations(pending)에 저장되고,
-- 사용자가 승인하면 서버 액션이 검증 후 적용하며 ai_plan_versions에 변경 전후를 남긴다.

-- ───────────────────────── 코치 프로필(AI가 참고하는 개인 조건) ─────────────────────────
alter table public.profiles
  add column training_goal text check (training_goal in ('hypertrophy', 'strength', 'fat_loss', 'general_fitness', 'endurance')),
  add column available_days smallint[] not null default '{}' check (available_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  add column session_minutes smallint check (session_minutes between 10 and 240),
  add column equipment text[] not null default '{}',
  add column constraints_note text check (char_length(constraints_note) <= 1000);

-- ───────────────────────── 운동 후 피드백 ─────────────────────────
create table public.workout_feedback (
  session_id uuid primary key,
  user_id uuid not null default auth.uid(),
  fatigue smallint check (fatigue between 1 and 5),        -- 1 매우 가벼움 ~ 5 매우 힘듦
  energy smallint check (energy between 1 and 5),          -- 1 매우 낮음 ~ 5 매우 좋음
  pain boolean not null default false,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.workout_sessions(id, user_id) on delete cascade
);
create trigger workout_feedback_touch before update on public.workout_feedback
  for each row execute function public.touch_updated_at();

-- ───────────────────────── 대화 ─────────────────────────
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '새 대화' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  evidence jsonb not null default '[]'::jsonb,   -- AI가 실제로 조회한 도구 호출 [{name, args, summary}]
  safety_notice text,                            -- 서버가 붙인 안전 안내(통증 언급 등)
  tokens int,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations(id, user_id) on delete cascade
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_day_idx on public.ai_messages (user_id, created_at);

-- ───────────────────────── 제안·승인 ─────────────────────────
create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('routine_new', 'routine_update', 'weekly_plan')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'failed')),
  title text not null check (char_length(title) <= 120),
  rationale text check (char_length(rationale) <= 4000),
  target_routine_id uuid references public.routines(id) on delete set null,
  before jsonb,                                  -- 제안 시점의 현재 상태
  payload jsonb not null,                        -- 검증된 제안 내용
  tokens int,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_recommendations_user_idx on public.ai_recommendations (user_id, created_at desc);

create table public.ai_plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  routine_id uuid references public.routines(id) on delete set null,
  before jsonb,
  after jsonb not null,
  applied_at timestamptz not null default now()
);
create index ai_plan_versions_user_idx on public.ai_plan_versions (user_id, applied_at desc);

-- ───────────────────────── 리포트·코칭 요약 ─────────────────────────
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  content jsonb not null,
  tokens int,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_start)
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.workout_feedback enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_plan_versions enable row level security;
alter table public.ai_insights enable row level security;

create policy "own feedback" on public.workout_feedback for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own conversations" on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own messages" on public.ai_messages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recommendations" on public.ai_recommendations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own plan versions" on public.ai_plan_versions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own insights" on public.ai_insights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.workout_feedback, public.ai_conversations, public.ai_messages,
  public.ai_recommendations, public.ai_plan_versions, public.ai_insights from anon;
grant select, insert, update, delete on public.workout_feedback, public.ai_conversations, public.ai_messages,
  public.ai_recommendations, public.ai_plan_versions, public.ai_insights to authenticated;
