-- MyFit AI — Phase 1 core schema
-- 운동 종목, 루틴(템플릿), 운동 기록(실제 수행), 사용자 설정.
-- 모든 개인 데이터는 user_id = auth.uid() 기반 RLS로 보호한다.
-- 자식 테이블은 (부모 id, user_id) 복합 FK로 소유자 일관성을 DB에서 강제한다.

-- ───────────────────────── 공통 ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── 사용자 ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 50),
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('male', 'female', 'other')),
  height_cm numeric(5,1) check (height_cm between 50 and 300),
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  default_rest_seconds int not null default 90 check (default_rest_seconds between 0 and 1800),
  weight_increment_kg numeric(4,2) not null default 2.5 check (weight_increment_kg > 0 and weight_increment_kg <= 20),
  weekly_workout_target int not null default 3 check (weekly_workout_target between 0 and 14),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- 새 auth 사용자 생성 시 프로필/설정 행 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 마이그레이션 이전에 만들어진 사용자 보정
insert into public.profiles (id) select id from auth.users on conflict do nothing;
insert into public.user_preferences (user_id) select id from auth.users on conflict do nothing;

-- ───────────────────────── 운동 종목 ─────────────────────────
create table public.muscles (
  id text primary key,                 -- 'chest', 'back', ...
  name_ko text not null,
  sort_order smallint not null
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,   -- null = 기본 제공 종목
  slug text unique,                                            -- 기본 종목 식별자(시드용)
  name_ko text not null check (char_length(name_ko) between 1 and 100),
  name_en text check (char_length(name_en) <= 100),
  exercise_type text not null check (exercise_type in (
    'weight_reps',          -- 중량 × 횟수
    'bodyweight_reps',      -- 맨몸 횟수
    'weighted_bodyweight',  -- 맨몸 + 추가 중량
    'assisted_bodyweight',  -- 보조 중량(머신 어시스트)
    'duration',             -- 시간
    'distance_duration'     -- 거리 + 시간
  )),
  equipment text not null check (equipment in (
    'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell',
    'band', 'smith', 'ez_bar', 'cardio', 'other'
  )),
  difficulty text not null default 'intermediate' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  instructions text check (char_length(instructions) <= 4000),
  cautions text check (char_length(cautions) <= 2000),
  media_url text check (media_url ~ '^https://'),
  archived_at timestamptz,             -- 기록에 쓰인 사용자 종목은 삭제 대신 보관
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id is not null or slug is not null)
);
create index exercises_owner_idx on public.exercises (owner_id);
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_id text not null references public.muscles(id),
  role text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_id)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_id);

-- 사용자별 종목 설정: 즐겨찾기, 종목별 휴식 시간, 중량 증가 단위
create table public.user_exercises (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  is_favorite boolean not null default false,
  rest_seconds int check (rest_seconds between 0 and 1800),
  weight_increment_kg numeric(4,2) check (weight_increment_kg > 0 and weight_increment_kg <= 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create trigger user_exercises_touch before update on public.user_exercises
  for each row execute function public.touch_updated_at();

-- ───────────────────────── 루틴(템플릿) ─────────────────────────
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 1000),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]), -- 0=일
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index routines_user_idx on public.routines (user_id);
create trigger routines_touch before update on public.routines
  for each row execute function public.touch_updated_at();

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null,
  user_id uuid not null default auth.uid(),
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position >= 0),
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  target_weight_kg numeric(6,2) check (target_weight_kg between 0 and 1000),
  rest_seconds int check (rest_seconds between 0 and 1800),
  superset_group smallint check (superset_group between 1 and 20),
  notes text check (char_length(notes) <= 500),
  foreign key (routine_id, user_id) references public.routines(id, user_id) on delete cascade,
  check (rep_min is null or rep_max is null or rep_min <= rep_max)
);
create index routine_exercises_routine_idx on public.routine_exercises (routine_id, position);

-- ───────────────────────── 운동 기록(실제 수행) ─────────────────────────
-- 루틴과 분리된 원본 기록. 종목명은 수행 당시 값을 스냅샷으로 보존한다.
create table public.workout_sessions (
  id uuid primary key,                                          -- 클라이언트 생성 UUID(멱등 저장)
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  title text not null default '운동' check (char_length(title) between 1 and 80),
  status text not null check (status in ('in_progress', 'completed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_at timestamptz,
  paused_seconds int not null default 0 check (paused_seconds >= 0),
  notes text check (char_length(notes) <= 2000),
  client_revision bigint not null default 0,                    -- 늦게 도착한 오래된 자동저장 무시
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (status = 'in_progress' or ended_at is not null),
  check (ended_at is null or ended_at >= started_at)
);
create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);
create unique index workout_sessions_one_active on public.workout_sessions (user_id) where status = 'in_progress';
create trigger workout_sessions_touch before update on public.workout_sessions
  for each row execute function public.touch_updated_at();

create table public.workout_exercises (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_name text not null check (char_length(exercise_name) between 1 and 100),
  position smallint not null check (position >= 0),
  superset_group smallint check (superset_group between 1 and 20),
  rest_seconds int check (rest_seconds between 0 and 1800),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  notes text check (char_length(notes) <= 1000),
  foreign key (session_id, user_id) references public.workout_sessions(id, user_id) on delete cascade,
  unique (id, user_id)
);
create index workout_exercises_session_idx on public.workout_exercises (session_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (user_id, exercise_id);

create table public.workout_sets (
  id uuid primary key,
  workout_exercise_id uuid not null,
  user_id uuid not null default auth.uid(),
  position smallint not null check (position >= 0),
  set_type text not null default 'normal' check (set_type in ('warmup', 'normal', 'drop', 'failure')),
  weight_kg numeric(6,2) check (weight_kg between 0 and 1000),
  reps smallint check (reps between 0 and 1000),
  duration_seconds int check (duration_seconds between 0 and 86400),
  distance_km numeric(7,3) check (distance_km between 0 and 1000),
  rpe numeric(3,1) check (rpe between 1 and 10),
  rir smallint check (rir between 0 and 10),
  is_completed boolean not null default false,
  completed_at timestamptz,
  rest_seconds int check (rest_seconds between 0 and 86400),    -- 이 세트 이후 실제 휴식 시간
  notes text check (char_length(notes) <= 500),
  foreign key (workout_exercise_id, user_id) references public.workout_exercises(id, user_id) on delete cascade
);
create index workout_sets_exercise_idx on public.workout_sets (workout_exercise_id, position);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.muscles enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.user_exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own preferences" on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "muscles readable" on public.muscles for select to authenticated using (true);

create policy "exercises readable" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "own exercises insert" on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()) and slug is null);
create policy "own exercises update" on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and slug is null);
create policy "own exercises delete" on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "exercise muscles readable" on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id
                 and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy "own exercise muscles write" on public.exercise_muscles for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy "own user_exercises" on public.user_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own routines" on public.routines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own routine_exercises" on public.routine_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own workout_sessions" on public.workout_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own workout_exercises" on public.workout_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own workout_sets" on public.workout_sets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────────────────── RPC ─────────────────────────
-- 운동 세션 전체 스냅샷을 원자적으로 저장한다(자동저장).
-- * 클라이언트 UUID 기반 upsert라 같은 스냅샷을 여러 번 보내도 중복 행이 생기지 않는다.
-- * p_revision이 저장된 값보다 작거나 같으면(늦게 도착한 요청) 아무것도 바꾸지 않는다.
-- * 스냅샷에 없는 종목/세트는 삭제한다.
-- security invoker: RLS가 그대로 적용된다.
create or replace function public.save_workout(p_session jsonb, p_revision bigint)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_session->>'id')::uuid;
  v_saved bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into workout_sessions as s (
    id, user_id, routine_id, title, status, started_at, ended_at,
    paused_at, paused_seconds, notes, client_revision
  ) values (
    v_id, v_uid,
    nullif(p_session->>'routine_id', '')::uuid,
    coalesce(nullif(p_session->>'title', ''), '운동'),
    p_session->>'status',
    (p_session->>'started_at')::timestamptz,
    nullif(p_session->>'ended_at', '')::timestamptz,
    nullif(p_session->>'paused_at', '')::timestamptz,
    coalesce((p_session->>'paused_seconds')::int, 0),
    nullif(p_session->>'notes', ''),
    p_revision
  )
  on conflict (id) do update set
    routine_id = excluded.routine_id,
    title = excluded.title,
    status = excluded.status,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    paused_at = excluded.paused_at,
    paused_seconds = excluded.paused_seconds,
    notes = excluded.notes,
    client_revision = excluded.client_revision
  where s.client_revision < excluded.client_revision
  returning client_revision into v_saved;

  if v_saved is null then
    -- 오래된 요청: 현재 저장된 리비전을 돌려주고 종료
    select client_revision into v_saved from workout_sessions where id = v_id;
    return v_saved;
  end if;

  delete from workout_exercises
  where session_id = v_id
    and id not in (
      select (e->>'id')::uuid from jsonb_array_elements(p_session->'exercises') e
    );

  insert into workout_exercises as we (
    id, session_id, user_id, exercise_id, exercise_name, position,
    superset_group, rest_seconds, rep_min, rep_max, notes
  )
  select
    (e->>'id')::uuid, v_id, v_uid, (e->>'exercise_id')::uuid, e->>'exercise_name',
    (ord - 1)::smallint,
    nullif(e->>'superset_group', '')::smallint,
    nullif(e->>'rest_seconds', '')::int,
    nullif(e->>'rep_min', '')::smallint,
    nullif(e->>'rep_max', '')::smallint,
    nullif(e->>'notes', '')
  from jsonb_array_elements(p_session->'exercises') with ordinality as t(e, ord)
  on conflict (id) do update set
    exercise_id = excluded.exercise_id,
    exercise_name = excluded.exercise_name,
    position = excluded.position,
    superset_group = excluded.superset_group,
    rest_seconds = excluded.rest_seconds,
    rep_min = excluded.rep_min,
    rep_max = excluded.rep_max,
    notes = excluded.notes;

  delete from workout_sets ws
  using workout_exercises we
  where ws.workout_exercise_id = we.id
    and we.session_id = v_id
    and ws.id not in (
      select (st->>'id')::uuid
      from jsonb_array_elements(p_session->'exercises') e,
           jsonb_array_elements(e->'sets') st
    );

  insert into workout_sets as ws (
    id, workout_exercise_id, user_id, position, set_type, weight_kg, reps,
    duration_seconds, distance_km, rpe, rir, is_completed, completed_at, rest_seconds, notes
  )
  select
    (st->>'id')::uuid, (e->>'id')::uuid, v_uid, (sord - 1)::smallint,
    coalesce(st->>'set_type', 'normal'),
    nullif(st->>'weight_kg', '')::numeric,
    nullif(st->>'reps', '')::smallint,
    nullif(st->>'duration_seconds', '')::int,
    nullif(st->>'distance_km', '')::numeric,
    nullif(st->>'rpe', '')::numeric,
    nullif(st->>'rir', '')::smallint,
    coalesce((st->>'is_completed')::boolean, false),
    nullif(st->>'completed_at', '')::timestamptz,
    nullif(st->>'rest_seconds', '')::int,
    nullif(st->>'notes', '')
  from jsonb_array_elements(p_session->'exercises') e,
       jsonb_array_elements(e->'sets') with ordinality as t(st, sord)
  on conflict (id) do update set
    workout_exercise_id = excluded.workout_exercise_id,
    position = excluded.position,
    set_type = excluded.set_type,
    weight_kg = excluded.weight_kg,
    reps = excluded.reps,
    duration_seconds = excluded.duration_seconds,
    distance_km = excluded.distance_km,
    rpe = excluded.rpe,
    rir = excluded.rir,
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    rest_seconds = excluded.rest_seconds,
    notes = excluded.notes;

  return v_saved;
end $$;

-- 종목별 직전 완료 세션의 세트(이전 기록 표시용)
create or replace function public.previous_sets(p_exercise_ids uuid[], p_exclude_session uuid)
returns table (
  exercise_id uuid, session_id uuid, started_at timestamptz, set_position smallint,
  set_type text, weight_kg numeric, reps smallint, duration_seconds int,
  distance_km numeric, rpe numeric, rir smallint
)
language sql
stable
security invoker
set search_path = public
as $$
  with last_session as (
    select distinct on (we.exercise_id) we.exercise_id, we.id as workout_exercise_id, s.id as session_id, s.started_at
    from workout_exercises we
    join workout_sessions s on s.id = we.session_id
    where we.exercise_id = any(p_exercise_ids)
      and s.status = 'completed'
      and s.id is distinct from p_exclude_session
      and exists (select 1 from workout_sets x where x.workout_exercise_id = we.id and x.is_completed)
    order by we.exercise_id, s.started_at desc, we.position
  )
  select ls.exercise_id, ls.session_id, ls.started_at, ws.position, ws.set_type,
         ws.weight_kg, ws.reps, ws.duration_seconds, ws.distance_km, ws.rpe, ws.rir
  from last_session ls
  join workout_sets ws on ws.workout_exercise_id = ls.workout_exercise_id
  where ws.is_completed
  order by ls.exercise_id, ws.position;
$$;

grant execute on function public.save_workout(jsonb, bigint) to authenticated;
grant execute on function public.previous_sets(uuid[], uuid) to authenticated;
revoke execute on function public.save_workout(jsonb, bigint) from anon, public;
revoke execute on function public.previous_sets(uuid[], uuid) from anon, public;

-- 명시적 권한: 익명 접근 차단, 인증 사용자만(RLS 적용) 접근
revoke all on all tables in schema public from anon;
grant select on public.muscles to authenticated;
grant select, insert, update, delete on
  public.profiles, public.user_preferences, public.exercises, public.exercise_muscles,
  public.user_exercises, public.routines, public.routine_exercises,
  public.workout_sessions, public.workout_exercises, public.workout_sets
to authenticated;

-- 루틴과 종목 목록을 한 트랜잭션으로 저장(전체 교체)
create or replace function public.save_routine(p_routine jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(nullif(p_routine->>'id', '')::uuid, gen_random_uuid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into routines as r (id, user_id, name, description, weekdays)
  values (
    v_id, v_uid, p_routine->>'name', nullif(p_routine->>'description', ''),
    coalesce(array(select jsonb_array_elements_text(p_routine->'weekdays')::smallint), '{}')
  )
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, weekdays = excluded.weekdays, updated_at = now();

  delete from routine_exercises where routine_id = v_id;

  insert into routine_exercises (
    routine_id, user_id, exercise_id, position, target_sets, rep_min, rep_max,
    target_weight_kg, rest_seconds, superset_group, notes
  )
  select v_id, v_uid, (it->>'exercise_id')::uuid, (ord - 1)::smallint,
    (it->>'target_sets')::smallint,
    nullif(it->>'rep_min', '')::smallint,
    nullif(it->>'rep_max', '')::smallint,
    nullif(it->>'target_weight_kg', '')::numeric,
    nullif(it->>'rest_seconds', '')::int,
    nullif(it->>'superset_group', '')::smallint,
    nullif(it->>'notes', '')
  from jsonb_array_elements(p_routine->'items') with ordinality as t(it, ord);

  return v_id;
end $$;

grant execute on function public.save_routine(jsonb) to authenticated;
revoke execute on function public.save_routine(jsonb) from anon, public;
