-- MyFit AI — Phase 4: 신체 변화, 변화 사진, 식단·영양, 수면·건강
-- 측정·영양 값은 원본을 그대로 보존하고, 통계는 조회 시 계산한다.

-- ───────────────────────── 신체 측정 ─────────────────────────
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2) check (weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct between 1 and 75),
  skeletal_muscle_kg numeric(5,2) check (skeletal_muscle_kg between 5 and 150),
  muscle_kg numeric(5,2) check (muscle_kg between 5 and 200),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  chest_cm numeric(5,1) check (chest_cm between 30 and 250),
  arm_cm numeric(4,1) check (arm_cm between 10 and 100),
  thigh_cm numeric(5,1) check (thigh_cm between 20 and 150),
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object'),  -- {"엉덩이둘레(cm)": 95}
  notes text check (char_length(notes) <= 500),
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);
create trigger body_measurements_touch before update on public.body_measurements
  for each row execute function public.touch_updated_at();

-- 변화 사진: 파일은 비공개 Storage 버킷(body-photos/{user_id}/...)에, 메타데이터는 테이블에
create table public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_on date not null,
  pose text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/'),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index body_photos_user_idx on public.body_photos (user_id, taken_on desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 본인 폴더({auth.uid()}/...)만 읽기·쓰기·삭제 가능
create policy "body photos read own" on storage.objects for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "body photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "body photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────── 식단·영양 ─────────────────────────
-- 영양 값은 1회 제공량(serving) 기준. source로 출처를, is_estimate로 추정 여부를 구분한다.
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,   -- null = 기본 제공(추정치)
  name text not null check (char_length(name) between 1 and 80),
  serving_desc text not null check (char_length(serving_desc) between 1 and 40),   -- "1공기(210g)"
  kcal numeric(6,1) not null check (kcal between 0 and 5000),
  protein_g numeric(5,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g numeric(5,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g numeric(5,1) not null default 0 check (fat_g between 0 and 500),
  source text not null check (source in ('seed', 'user', 'label')),  -- label = 제품 영양표시 기준
  is_estimate boolean not null default true,
  source_note text check (char_length(source_note) <= 200),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, name, serving_desc)
);
create index food_items_owner_idx on public.food_items (owner_id);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_on date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, eaten_on, meal_type)
);

-- 음식 정보가 나중에 바뀌어도 기록이 변하지 않도록 이름·영양 값을 스냅샷으로 저장
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id uuid not null default auth.uid(),
  food_item_id uuid references public.food_items(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  serving_desc text,
  servings numeric(5,2) not null default 1 check (servings > 0 and servings <= 50),
  kcal numeric(7,1) not null check (kcal >= 0),
  protein_g numeric(6,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6,1) not null default 0 check (fat_g >= 0),
  is_estimate boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals(id, user_id) on delete cascade
);
create index meal_items_meal_idx on public.meal_items (meal_id);

create table public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);

create table public.nutrition_goals (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kcal int check (kcal between 500 and 10000),
  protein_g int check (protein_g between 0 and 500),
  carbs_g int check (carbs_g between 0 and 1500),
  fat_g int check (fat_g between 0 and 500),
  water_ml int check (water_ml between 0 and 10000),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── 수면·건강(일일) ─────────────────────────
create table public.daily_wellness_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  condition smallint check (condition between 1 and 5),
  resting_hr smallint check (resting_hr between 25 and 220),
  steps int check (steps between 0 and 200000),
  active_minutes smallint check (active_minutes between 0 and 1440),
  water_ml int check (water_ml between 0 and 20000),
  notes text check (char_length(notes) <= 500),
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create trigger daily_wellness_logs_touch before update on public.daily_wellness_logs
  for each row execute function public.touch_updated_at();

-- 외부 데이터 가져오기 작업(연동 계층). 실제 연동은 제공자별로 지원 여부를 확인한 뒤 추가한다.
create table public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('csv', 'json_backup', 'apple_health', 'health_connect', 'garmin')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- AI 식단 분석 리포트
alter table public.ai_insights drop constraint ai_insights_kind_check;
alter table public.ai_insights add constraint ai_insights_kind_check check (kind in ('daily', 'weekly', 'monthly', 'nutrition'));

-- ───────────────────────── RLS ─────────────────────────
alter table public.body_measurements enable row level security;
alter table public.body_photos enable row level security;
alter table public.food_items enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_templates enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.daily_wellness_logs enable row level security;
alter table public.data_import_jobs enable row level security;

create policy "own body" on public.body_measurements for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own photos" on public.body_photos for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and storage_path like (select auth.uid())::text || '/%');
create policy "foods readable" on public.food_items for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy "own foods write" on public.food_items for insert to authenticated with check (owner_id = (select auth.uid()) and source <> 'seed');
create policy "own foods update" on public.food_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and source <> 'seed');
create policy "own foods delete" on public.food_items for delete to authenticated using (owner_id = (select auth.uid()));
create policy "own meals" on public.meals for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meal items" on public.meal_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meal templates" on public.meal_templates for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own nutrition goals" on public.nutrition_goals for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own wellness" on public.daily_wellness_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own import jobs" on public.data_import_jobs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.body_measurements, public.body_photos, public.food_items, public.meals, public.meal_items,
  public.meal_templates, public.nutrition_goals, public.daily_wellness_logs, public.data_import_jobs from anon;
grant select, insert, update, delete on public.body_measurements, public.body_photos, public.food_items, public.meals, public.meal_items,
  public.meal_templates, public.nutrition_goals, public.daily_wellness_logs, public.data_import_jobs to authenticated;

-- ───────────────────────── 기본 음식(참고용 추정치) ─────────────────────────
-- 일반적인 1인분 기준 대략값. 제품·조리법에 따라 차이가 크므로 화면에 '추정치'로 표시한다.
insert into public.food_items (owner_id, name, serving_desc, kcal, protein_g, carbs_g, fat_g, source, is_estimate, source_note) values
  (null, '쌀밥', '1공기(210g)', 315, 5.5, 70, 0.6, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '현미밥', '1공기(210g)', 310, 6.5, 67, 2, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '닭가슴살(삶은)', '100g', 165, 31, 0, 3.6, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '삶은 달걀', '1개(50g)', 75, 6.3, 0.6, 5, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '달걀 프라이', '1개', 90, 6.3, 0.4, 7, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '두부', '100g', 80, 8, 2, 4.5, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '김치찌개', '1인분(400g)', 250, 15, 12, 15, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '된장찌개', '1인분(400g)', 180, 12, 14, 8, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '미역국', '1그릇(300g)', 80, 6, 4, 4, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '비빔밥', '1그릇(500g)', 600, 20, 95, 15, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '김밥', '1줄(230g)', 400, 11, 65, 10, 'seed', true, '재료에 따라 차이 큼'),
  (null, '라면', '1봉 조리(500g)', 500, 10, 79, 16, 'seed', true, '제품에 따라 차이 큼'),
  (null, '불고기', '1인분(200g)', 400, 30, 15, 24, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '삼겹살 구이', '150g', 500, 25, 0, 44, 'seed', true, '부위·굽기에 따라 차이 큼'),
  (null, '제육볶음', '1인분(250g)', 450, 28, 20, 28, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '닭볶음탕', '1인분(350g)', 420, 35, 25, 18, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '떡볶이', '1인분(300g)', 480, 9, 100, 5, 'seed', true, '조리법에 따라 차이 큼'),
  (null, '짜장면', '1그릇(650g)', 790, 20, 130, 20, 'seed', true, '가게에 따라 차이 큼'),
  (null, '짬뽕', '1그릇(900g)', 690, 35, 100, 15, 'seed', true, '가게에 따라 차이 큼'),
  (null, '돈가스', '1인분(250g)', 700, 30, 55, 38, 'seed', true, '가게에 따라 차이 큼'),
  (null, '후라이드 치킨', '1조각(100g)', 290, 20, 10, 19, 'seed', true, '부위에 따라 차이 큼'),
  (null, '피자', '1조각(150g)', 400, 17, 45, 17, 'seed', true, '토핑에 따라 차이 큼'),
  (null, '햄치즈 샌드위치', '1개(200g)', 450, 20, 45, 20, 'seed', true, '제품에 따라 차이 큼'),
  (null, '닭가슴살 샐러드', '1인분(250g)', 250, 28, 10, 10, 'seed', true, '드레싱에 따라 차이 큼'),
  (null, '연어 구이', '150g', 310, 33, 0, 19, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '소고기 등심 구이', '150g', 420, 35, 0, 31, 'seed', true, '부위에 따라 차이 큼'),
  (null, '고등어 구이', '150g', 300, 28, 0, 20, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '고구마(찐)', '1개(150g)', 195, 2, 46, 0.2, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '바나나', '1개(120g)', 105, 1.3, 27, 0.4, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '사과', '1개(200g)', 104, 0.5, 28, 0.3, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '오트밀', '40g', 150, 5, 27, 2.7, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '그릭요거트(무가당)', '100g', 97, 9, 4, 5, 'seed', true, '제품에 따라 차이 큼'),
  (null, '우유', '1컵(200ml)', 130, 6.4, 9.6, 7.6, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '프로틴 쉐이크', '1스쿱(30g)', 120, 24, 3, 1.5, 'seed', true, '제품 영양표시를 확인하세요'),
  (null, '아몬드', '30g', 175, 6, 6, 15, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '김(조미)', '1봉(5g)', 25, 2, 1, 2, 'seed', true, '제품에 따라 차이 큼'),
  (null, '아메리카노', '1잔', 10, 0.3, 1.5, 0, 'seed', true, '일반 1인분 기준 추정치'),
  (null, '카페라떼', '1잔(355ml)', 180, 10, 14, 9, 'seed', true, '우유 종류에 따라 차이 큼'),
  (null, '콜라', '1캔(355ml)', 150, 0, 39, 0, 'seed', true, '제품 영양표시를 확인하세요'),
  (null, '맥주', '1캔(500ml)', 210, 1.5, 17, 0, 'seed', true, '알코올 열량 포함 추정치'),
  (null, '소주', '1병(360ml)', 400, 0, 0, 0, 'seed', true, '알코올 열량 포함 추정치')
on conflict (owner_id, name, serving_desc) do nothing;
