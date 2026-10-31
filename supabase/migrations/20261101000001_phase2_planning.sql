-- MyFit AI — Phase 2: 목표, 장기 프로그램, 운동 일정, 대시보드·근육 설정
-- 개인 최고 기록(PR)·통계·배지는 원본 세트에서 매번 계산하므로 별도 테이블을 두지 않는다
-- (수정·삭제 시 자동으로 정확해지고, 재계산 작업이 필요 없다).

-- ───────────────────────── 설정 확장 ─────────────────────────
alter table public.user_preferences
  add column dashboard_order text[] not null default '{}',
  add column muscle_set_targets jsonb not null default '{}'::jsonb
    check (jsonb_typeof(muscle_set_targets) = 'object');

-- ───────────────────────── 목표 ─────────────────────────
create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'weekly_count',     -- 주간 운동 횟수
    'weekly_minutes',   -- 주간 운동 시간(분)
    'exercise_weight',  -- 특정 운동 목표 중량(kg, 1회 이상 수행)
    'exercise_reps',    -- 특정 운동 목표 반복(회, 한 세트)
    'body_weight',      -- 체중 목표(kg) — 신체 기록(Phase 4)과 연결
    'streak_weeks'      -- 연속 운동 주 수
  )),
  exercise_id uuid references public.exercises(id) on delete cascade,
  target_value numeric(8,2) not null check (target_value > 0 and target_value <= 100000),
  start_value numeric(8,2),
  deadline date,
  achieved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind in ('exercise_weight', 'exercise_reps')) = (exercise_id is not null))
);
create index user_goals_user_idx on public.user_goals (user_id) where archived_at is null;
create trigger user_goals_touch before update on public.user_goals
  for each row execute function public.touch_updated_at();

-- ───────────────────────── 장기 프로그램 ─────────────────────────
-- pattern: [{ "weekday": 0-6, "routine_id": uuid }] 주간 반복 패턴
create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date not null,
  weeks smallint not null check (weeks between 1 and 52),
  deload_every smallint check (deload_every between 2 and 12),  -- N주마다 가벼운 주
  pattern jsonb not null check (jsonb_typeof(pattern) = 'array'),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index training_programs_user_idx on public.training_programs (user_id);

-- ───────────────────────── 운동 일정 ─────────────────────────
-- 루틴 요일 배치(routines.weekdays)는 매주 반복 일정으로 캘린더에서 계산하고,
-- 이 테이블은 날짜가 지정된 일정(프로그램 생성분, 직접 추가, 이동, 건너뜀)을 저장한다.
create table public.program_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id uuid,
  routine_id uuid references public.routines(id) on delete cascade,
  scheduled_date date not null,
  status text not null default 'planned' check (status in ('planned', 'skipped')),
  is_deload boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  foreign key (program_id, user_id) references public.training_programs(id, user_id) on delete cascade,
  check (status = 'skipped' or routine_id is not null)
);
create index program_schedules_user_date_idx on public.program_schedules (user_id, scheduled_date);

-- ───────────────────────── RLS ─────────────────────────
alter table public.user_goals enable row level security;
alter table public.training_programs enable row level security;
alter table public.program_schedules enable row level security;

create policy "own goals" on public.user_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own programs" on public.training_programs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own schedules" on public.program_schedules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_goals, public.training_programs, public.program_schedules from anon;
grant select, insert, update, delete on public.user_goals, public.training_programs, public.program_schedules to authenticated;

-- 프로그램 생성과 일정 일괄 생성을 한 트랜잭션으로
create or replace function public.create_program(p_program jsonb, p_schedules jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into training_programs (user_id, name, start_date, weeks, deload_every, pattern)
  values (v_uid, p_program->>'name', (p_program->>'start_date')::date, (p_program->>'weeks')::smallint,
          nullif(p_program->>'deload_every', '')::smallint, p_program->'pattern')
  returning id into v_id;

  insert into program_schedules (user_id, program_id, routine_id, scheduled_date, is_deload)
  select v_uid, v_id, (s->>'routine_id')::uuid, (s->>'date')::date, coalesce((s->>'is_deload')::boolean, false)
  from jsonb_array_elements(p_schedules) s;

  return v_id;
end $$;

grant execute on function public.create_program(jsonb, jsonb) to authenticated;
revoke execute on function public.create_program(jsonb, jsonb) from anon, public;
