-- 기본 근육 부위와 운동 종목 시드. slug 기준으로 멱등.
-- 자세 설명은 직접 작성한 요약이며 외부 이미지·영상은 포함하지 않는다.

insert into public.muscles (id, name_ko, sort_order) values
  ('chest', '가슴', 1),
  ('back', '등', 2),
  ('shoulders', '어깨', 3),
  ('biceps', '이두', 4),
  ('triceps', '삼두', 5),
  ('forearms', '전완', 6),
  ('abs', '복근', 7),
  ('glutes', '둔근', 8),
  ('quads', '대퇴사두', 9),
  ('hamstrings', '햄스트링', 10),
  ('calves', '종아리', 11)
on conflict (id) do update set name_ko = excluded.name_ko, sort_order = excluded.sort_order;

with src (slug, name_ko, name_en, exercise_type, equipment, difficulty, primary_m, secondary_m, instructions, cautions) as (values
  -- 가슴
  ('barbell-bench-press', '바벨 벤치프레스', 'Barbell Bench Press', 'weight_reps', 'barbell', 'intermediate', '{chest}', '{triceps,shoulders}',
   '벤치에 누워 견갑을 모으고 발을 바닥에 고정한다. 바를 가슴 중앙(명치 위)으로 내렸다가 밀어 올린다.', '반드시 세이프티 바나 보조자와 함께 무거운 중량을 다룬다. 손목이 뒤로 꺾이지 않게 한다.'),
  ('incline-barbell-bench-press', '인클라인 바벨 벤치프레스', 'Incline Barbell Bench Press', 'weight_reps', 'barbell', 'intermediate', '{chest}', '{shoulders,triceps}',
   '벤치 각도를 30~45도로 세우고 바를 쇄골 아래 윗가슴으로 내린다.', '각도가 너무 높으면 어깨 부담이 커진다.'),
  ('dumbbell-bench-press', '덤벨 벤치프레스', 'Dumbbell Bench Press', 'weight_reps', 'dumbbell', 'beginner', '{chest}', '{triceps,shoulders}',
   '덤벨을 가슴 옆까지 내렸다가 위에서 모이듯 밀어 올린다.', '덤벨을 내려놓을 때 어깨가 비틀리지 않도록 무릎을 이용한다.'),
  ('incline-dumbbell-press', '인클라인 덤벨프레스', 'Incline Dumbbell Press', 'weight_reps', 'dumbbell', 'beginner', '{chest}', '{shoulders,triceps}',
   '30~45도 벤치에서 덤벨을 윗가슴 옆으로 내렸다가 밀어 올린다.', null),
  ('dumbbell-fly', '덤벨 플라이', 'Dumbbell Fly', 'weight_reps', 'dumbbell', 'beginner', '{chest}', '{shoulders}',
   '팔꿈치를 살짝 굽힌 채 원을 그리듯 팔을 벌렸다가 모은다.', '과도하게 깊이 내리지 않는다.'),
  ('cable-crossover', '케이블 크로스오버', 'Cable Crossover', 'weight_reps', 'cable', 'beginner', '{chest}', '{shoulders}',
   '양쪽 케이블 손잡이를 잡고 몸 앞에서 모으며 가슴을 수축한다.', null),
  ('chest-press-machine', '체스트 프레스 머신', 'Chest Press Machine', 'weight_reps', 'machine', 'beginner', '{chest}', '{triceps,shoulders}',
   '손잡이가 가슴 중앙 높이에 오도록 시트를 맞추고 앞으로 민다.', null),
  ('pec-deck', '펙덱 플라이', 'Pec Deck Fly', 'weight_reps', 'machine', 'beginner', '{chest}', '{shoulders}',
   '팔꿈치를 살짝 굽힌 채 패드를 몸 앞으로 모은다.', null),
  ('push-up', '푸시업', 'Push-up', 'bodyweight_reps', 'bodyweight', 'beginner', '{chest}', '{triceps,shoulders,abs}',
   '손을 어깨너비보다 약간 넓게 두고 몸을 일직선으로 유지하며 가슴을 바닥 가까이 내린다.', '허리가 처지지 않게 복부에 힘을 준다.'),
  ('chest-dip', '딥스', 'Dip', 'weighted_bodyweight', 'bodyweight', 'intermediate', '{chest,triceps}', '{shoulders}',
   '평행봉에서 몸을 약간 앞으로 기울여 내려갔다 올라온다.', '어깨 통증이 있으면 깊이를 줄이거나 다른 종목으로 대체한다.'),

  -- 등
  ('deadlift', '데드리프트', 'Deadlift', 'weight_reps', 'barbell', 'advanced', '{back,hamstrings,glutes}', '{forearms,quads}',
   '바를 정강이 가까이 두고 허리를 중립으로 유지한 채 엉덩이와 무릎을 함께 펴며 들어 올린다.', '허리가 굽은 상태로 들지 않는다. 무리한 고중량은 피한다.'),
  ('barbell-row', '바벨 로우', 'Barbell Row', 'weight_reps', 'barbell', 'intermediate', '{back}', '{biceps,forearms}',
   '상체를 45도 정도 숙이고 바를 배꼽 쪽으로 당긴다.', '허리 중립을 유지한다.'),
  ('dumbbell-row', '원암 덤벨 로우', 'One-arm Dumbbell Row', 'weight_reps', 'dumbbell', 'beginner', '{back}', '{biceps}',
   '벤치에 한 손과 무릎을 대고 덤벨을 골반 쪽으로 당긴다.', null),
  ('pull-up', '풀업', 'Pull-up', 'weighted_bodyweight', 'bodyweight', 'intermediate', '{back}', '{biceps,forearms}',
   '오버핸드 그립으로 매달려 턱이 바 위로 올라올 때까지 당긴다.', null),
  ('chin-up', '친업', 'Chin-up', 'weighted_bodyweight', 'bodyweight', 'intermediate', '{back,biceps}', '{forearms}',
   '언더핸드 그립으로 매달려 가슴을 바 쪽으로 당긴다.', null),
  ('assisted-pull-up', '어시스트 풀업 머신', 'Assisted Pull-up', 'assisted_bodyweight', 'machine', 'beginner', '{back}', '{biceps}',
   '보조 중량을 설정하고 풀업 동작을 수행한다. 보조 중량이 낮을수록 어렵다.', null),
  ('lat-pulldown', '랫풀다운', 'Lat Pulldown', 'weight_reps', 'cable', 'beginner', '{back}', '{biceps}',
   '바를 쇄골 쪽으로 당기며 견갑을 아래로 내린다.', '목 뒤로 당기지 않는다.'),
  ('seated-cable-row', '시티드 케이블 로우', 'Seated Cable Row', 'weight_reps', 'cable', 'beginner', '{back}', '{biceps}',
   '허리를 세운 채 손잡이를 배 쪽으로 당기며 견갑을 모은다.', null),
  ('t-bar-row', '티바 로우', 'T-bar Row', 'weight_reps', 'barbell', 'intermediate', '{back}', '{biceps}',
   '상체를 숙여 바를 가슴 아래로 당긴다.', null),
  ('machine-row', '머신 로우', 'Machine Row', 'weight_reps', 'machine', 'beginner', '{back}', '{biceps}',
   '가슴 패드에 몸을 기대고 손잡이를 당긴다.', null),
  ('back-extension', '백 익스텐션', 'Back Extension', 'bodyweight_reps', 'bodyweight', 'beginner', '{back,glutes}', '{hamstrings}',
   '골반을 패드에 걸치고 상체를 내렸다가 일직선까지 들어 올린다.', '과신전하지 않는다.'),

  -- 어깨
  ('overhead-press', '오버헤드 프레스', 'Overhead Press', 'weight_reps', 'barbell', 'intermediate', '{shoulders}', '{triceps}',
   '선 자세에서 바를 쇄골 앞에서 머리 위로 밀어 올린다.', '허리를 과하게 젖히지 않는다.'),
  ('dumbbell-shoulder-press', '덤벨 숄더프레스', 'Dumbbell Shoulder Press', 'weight_reps', 'dumbbell', 'beginner', '{shoulders}', '{triceps}',
   '앉거나 선 자세에서 덤벨을 귀 옆에서 머리 위로 민다.', null),
  ('shoulder-press-machine', '숄더 프레스 머신', 'Shoulder Press Machine', 'weight_reps', 'machine', 'beginner', '{shoulders}', '{triceps}',
   '손잡이가 어깨 높이에 오도록 시트를 맞추고 위로 민다.', null),
  ('lateral-raise', '사이드 레터럴 레이즈', 'Lateral Raise', 'weight_reps', 'dumbbell', 'beginner', '{shoulders}', '{}',
   '팔꿈치를 살짝 굽히고 덤벨을 옆으로 어깨 높이까지 들어 올린다.', '반동을 쓰지 않는다.'),
  ('cable-lateral-raise', '케이블 레터럴 레이즈', 'Cable Lateral Raise', 'weight_reps', 'cable', 'beginner', '{shoulders}', '{}',
   '낮은 케이블을 반대 손으로 잡고 옆으로 들어 올린다.', null),
  ('rear-delt-fly', '리어 델트 플라이', 'Rear Delt Fly', 'weight_reps', 'dumbbell', 'beginner', '{shoulders}', '{back}',
   '상체를 숙이고 덤벨을 옆으로 벌려 후면 삼각근을 수축한다.', null),
  ('face-pull', '페이스풀', 'Face Pull', 'weight_reps', 'cable', 'beginner', '{shoulders}', '{back}',
   '로프를 얼굴 쪽으로 당기며 팔꿈치를 높게 벌린다.', null),
  ('front-raise', '프론트 레이즈', 'Front Raise', 'weight_reps', 'dumbbell', 'beginner', '{shoulders}', '{}',
   '덤벨을 몸 앞으로 어깨 높이까지 들어 올린다.', null),

  -- 이두 / 삼두 / 전완
  ('barbell-curl', '바벨 컬', 'Barbell Curl', 'weight_reps', 'barbell', 'beginner', '{biceps}', '{forearms}',
   '팔꿈치를 옆구리에 고정하고 바를 들어 올린다.', '상체 반동을 쓰지 않는다.'),
  ('ez-bar-curl', '이지바 컬', 'EZ-bar Curl', 'weight_reps', 'ez_bar', 'beginner', '{biceps}', '{forearms}',
   '이지바의 굽은 부분을 잡고 컬을 수행한다.', null),
  ('dumbbell-curl', '덤벨 컬', 'Dumbbell Curl', 'weight_reps', 'dumbbell', 'beginner', '{biceps}', '{forearms}',
   '덤벨을 들어 올리며 손바닥이 위를 보도록 회전한다.', null),
  ('hammer-curl', '해머 컬', 'Hammer Curl', 'weight_reps', 'dumbbell', 'beginner', '{biceps,forearms}', '{}',
   '손바닥이 서로 마주 보게 덤벨을 들어 올린다.', null),
  ('preacher-curl', '프리처 컬', 'Preacher Curl', 'weight_reps', 'machine', 'beginner', '{biceps}', '{}',
   '팔을 패드에 올리고 컬을 수행한다.', '팔을 완전히 편 상태에서 반동을 주지 않는다.'),
  ('cable-curl', '케이블 컬', 'Cable Curl', 'weight_reps', 'cable', 'beginner', '{biceps}', '{forearms}',
   '낮은 케이블에서 바를 잡고 컬을 수행한다.', null),
  ('triceps-pushdown', '트라이셉스 푸시다운', 'Triceps Pushdown', 'weight_reps', 'cable', 'beginner', '{triceps}', '{}',
   '팔꿈치를 옆구리에 고정하고 케이블을 아래로 민다.', null),
  ('overhead-triceps-extension', '오버헤드 트라이셉스 익스텐션', 'Overhead Triceps Extension', 'weight_reps', 'dumbbell', 'beginner', '{triceps}', '{}',
   '덤벨을 머리 뒤로 내렸다가 팔을 펴 올린다.', null),
  ('skull-crusher', '라잉 트라이셉스 익스텐션', 'Skull Crusher', 'weight_reps', 'ez_bar', 'intermediate', '{triceps}', '{}',
   '누운 자세에서 이지바를 이마 쪽으로 내렸다가 편다.', '팔꿈치 통증이 있으면 중량을 낮춘다.'),
  ('close-grip-bench-press', '클로즈그립 벤치프레스', 'Close-grip Bench Press', 'weight_reps', 'barbell', 'intermediate', '{triceps}', '{chest,shoulders}',
   '어깨너비 정도로 좁게 잡고 벤치프레스를 수행한다.', null),
  ('wrist-curl', '리스트 컬', 'Wrist Curl', 'weight_reps', 'dumbbell', 'beginner', '{forearms}', '{}',
   '전완을 벤치에 올리고 손목만 굽혀 덤벨을 들어 올린다.', null),

  -- 하체
  ('back-squat', '바벨 백스쿼트', 'Barbell Back Squat', 'weight_reps', 'barbell', 'intermediate', '{quads,glutes}', '{hamstrings,abs}',
   '바를 승모근 위에 얹고 엉덩이를 뒤로 빼며 허벅지가 바닥과 평행해질 때까지 앉았다 일어난다.', '무릎이 안쪽으로 모이지 않게 한다. 세이프티 바를 설정한다.'),
  ('front-squat', '프론트 스쿼트', 'Front Squat', 'weight_reps', 'barbell', 'advanced', '{quads}', '{glutes,abs}',
   '바를 쇄골 앞에 얹고 상체를 세운 채 스쿼트한다.', null),
  ('goblet-squat', '고블릿 스쿼트', 'Goblet Squat', 'weight_reps', 'dumbbell', 'beginner', '{quads,glutes}', '{abs}',
   '덤벨이나 케틀벨을 가슴 앞에 들고 스쿼트한다.', null),
  ('leg-press', '레그 프레스', 'Leg Press', 'weight_reps', 'machine', 'beginner', '{quads,glutes}', '{hamstrings}',
   '발판에 발을 어깨너비로 두고 무릎을 굽혔다가 민다.', '무릎을 완전히 잠그지 않는다. 허리가 패드에서 뜨지 않게 한다.'),
  ('hack-squat', '핵 스쿼트', 'Hack Squat', 'weight_reps', 'machine', 'intermediate', '{quads}', '{glutes}',
   '머신에 등을 기대고 스쿼트한다.', null),
  ('leg-extension', '레그 익스텐션', 'Leg Extension', 'weight_reps', 'machine', 'beginner', '{quads}', '{}',
   '무릎 관절이 머신 축과 맞게 앉아 다리를 편다.', null),
  ('romanian-deadlift', '루마니안 데드리프트', 'Romanian Deadlift', 'weight_reps', 'barbell', 'intermediate', '{hamstrings,glutes}', '{back}',
   '무릎을 살짝 굽히고 엉덩이를 뒤로 빼며 바를 허벅지를 따라 내린다.', '허리가 굽기 전까지만 내린다.'),
  ('lying-leg-curl', '라잉 레그컬', 'Lying Leg Curl', 'weight_reps', 'machine', 'beginner', '{hamstrings}', '{calves}',
   '엎드려 패드를 발목에 걸고 무릎을 굽힌다.', null),
  ('seated-leg-curl', '시티드 레그컬', 'Seated Leg Curl', 'weight_reps', 'machine', 'beginner', '{hamstrings}', '{}',
   '앉은 자세에서 패드를 아래로 눌러 무릎을 굽힌다.', null),
  ('bulgarian-split-squat', '불가리안 스플릿 스쿼트', 'Bulgarian Split Squat', 'weight_reps', 'dumbbell', 'intermediate', '{quads,glutes}', '{hamstrings}',
   '뒷발을 벤치에 올리고 앞다리로 앉았다 일어난다.', null),
  ('walking-lunge', '워킹 런지', 'Walking Lunge', 'weight_reps', 'dumbbell', 'beginner', '{quads,glutes}', '{hamstrings}',
   '한 걸음씩 내디디며 뒷무릎이 바닥 가까이 가도록 앉는다.', null),
  ('hip-thrust', '힙 스러스트', 'Hip Thrust', 'weight_reps', 'barbell', 'intermediate', '{glutes}', '{hamstrings}',
   '등 상부를 벤치에 걸치고 바를 골반 위에 올려 엉덩이를 들어 올린다.', '패드를 사용해 골반을 보호한다.'),
  ('hip-abduction', '힙 어브덕션 머신', 'Hip Abduction Machine', 'weight_reps', 'machine', 'beginner', '{glutes}', '{}',
   '앉은 자세에서 다리를 바깥으로 벌린다.', null),
  ('standing-calf-raise', '스탠딩 카프 레이즈', 'Standing Calf Raise', 'weight_reps', 'machine', 'beginner', '{calves}', '{}',
   '발 앞쪽으로 서서 뒤꿈치를 최대한 들어 올렸다 내린다.', null),
  ('seated-calf-raise', '시티드 카프 레이즈', 'Seated Calf Raise', 'weight_reps', 'machine', 'beginner', '{calves}', '{}',
   '앉은 자세에서 무릎 위 패드를 들어 올리듯 뒤꿈치를 든다.', null),

  -- 복근 / 코어
  ('plank', '플랭크', 'Plank', 'duration', 'bodyweight', 'beginner', '{abs}', '{shoulders}',
   '팔꿈치와 발끝으로 몸을 지탱하고 일직선을 유지한다.', '허리가 처지면 중단한다.'),
  ('crunch', '크런치', 'Crunch', 'bodyweight_reps', 'bodyweight', 'beginner', '{abs}', '{}',
   '누워 무릎을 세우고 상체를 말아 올린다.', null),
  ('hanging-leg-raise', '행잉 레그 레이즈', 'Hanging Leg Raise', 'bodyweight_reps', 'bodyweight', 'intermediate', '{abs}', '{forearms}',
   '바에 매달려 다리를 들어 올린다.', '반동을 줄인다.'),
  ('cable-crunch', '케이블 크런치', 'Cable Crunch', 'weight_reps', 'cable', 'beginner', '{abs}', '{}',
   '무릎 꿇고 로프를 머리 옆에 잡은 채 상체를 말아 내린다.', null),
  ('ab-wheel', 'AB 롤아웃', 'Ab Wheel Rollout', 'bodyweight_reps', 'other', 'intermediate', '{abs}', '{shoulders}',
   'AB 휠을 잡고 몸을 앞으로 뻗었다가 돌아온다.', '허리가 꺾이면 범위를 줄인다.'),

  -- 유산소
  ('treadmill', '트레드밀', 'Treadmill', 'distance_duration', 'cardio', 'beginner', '{quads}', '{calves,hamstrings}',
   '걷기 또는 달리기. 거리와 시간을 기록한다.', null),
  ('stationary-bike', '실내 자전거', 'Stationary Bike', 'distance_duration', 'cardio', 'beginner', '{quads}', '{hamstrings,calves}',
   '안장 높이를 맞추고 페달을 돌린다.', null),
  ('rowing-machine', '로잉 머신', 'Rowing Machine', 'distance_duration', 'cardio', 'intermediate', '{back}', '{quads,biceps}',
   '다리로 밀고 상체를 젖힌 뒤 팔로 당기는 순서로 수행한다.', null),
  ('stair-climber', '스텝밀', 'Stair Climber', 'duration', 'cardio', 'beginner', '{quads,glutes}', '{calves}',
   '계단을 오르듯 일정한 속도로 걷는다.', null)
),
ins as (
  insert into public.exercises (slug, name_ko, name_en, exercise_type, equipment, difficulty, instructions, cautions)
  select slug, name_ko, name_en, exercise_type, equipment, difficulty, instructions, cautions from src
  on conflict (slug) do update set
    name_ko = excluded.name_ko, name_en = excluded.name_en, exercise_type = excluded.exercise_type,
    equipment = excluded.equipment, difficulty = excluded.difficulty,
    instructions = excluded.instructions, cautions = excluded.cautions
  returning id, slug
)
insert into public.exercise_muscles (exercise_id, muscle_id, role)
select ins.id, m.muscle_id, m.role
from ins
join src on src.slug = ins.slug
cross join lateral (
  select unnest(src.primary_m::text[]) as muscle_id, 'primary' as role
  union all
  select unnest(src.secondary_m::text[]), 'secondary'
) m
on conflict (exercise_id, muscle_id) do update set role = excluded.role;
