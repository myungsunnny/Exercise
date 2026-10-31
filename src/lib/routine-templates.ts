// 기본 분할 템플릿. "내 루틴으로 추가" 시 사용자 루틴으로 복사된다.
// slug는 supabase/migrations/*_seed_exercises.sql 의 기본 종목과 일치해야 한다.
type T = { slug: string; sets: number; reps: [number, number]; rest?: number };
export type RoutineTemplate = { key: string; group: string; name: string; description: string; days: { name: string; items: T[] }[] };

const hyp = (slug: string, sets = 3, reps: [number, number] = [8, 12], rest = 90): T => ({ slug, sets, reps, rest });
const str = (slug: string, sets = 5, reps: [number, number] = [3, 5], rest = 180): T => ({ slug, sets, reps, rest });

const push = [hyp("barbell-bench-press", 4, [6, 10], 120), hyp("incline-dumbbell-press"), hyp("dumbbell-shoulder-press"), hyp("lateral-raise", 3, [12, 15], 60), hyp("triceps-pushdown", 3, [10, 15], 60)];
const pull = [hyp("pull-up", 3, [6, 10], 120), hyp("barbell-row", 4, [6, 10], 120), hyp("lat-pulldown"), hyp("face-pull", 3, [12, 15], 60), hyp("dumbbell-curl", 3, [10, 12], 60)];
const legs = [hyp("back-squat", 4, [6, 10], 150), hyp("romanian-deadlift", 3, [8, 10], 120), hyp("leg-press"), hyp("lying-leg-curl", 3, [10, 12], 60), hyp("standing-calf-raise", 3, [12, 15], 60)];
const upper = [hyp("barbell-bench-press", 4, [6, 10], 120), hyp("barbell-row", 4, [6, 10], 120), hyp("dumbbell-shoulder-press"), hyp("lat-pulldown"), hyp("dumbbell-curl", 2, [10, 12], 60), hyp("triceps-pushdown", 2, [10, 12], 60)];
const lower = [hyp("back-squat", 4, [6, 10], 150), hyp("romanian-deadlift", 3, [8, 10], 120), hyp("bulgarian-split-squat"), hyp("leg-extension", 3, [10, 15], 60), hyp("seated-leg-curl", 3, [10, 15], 60), hyp("plank", 3, [30, 60], 60)];

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  { key: "beginner", group: "초보자", name: "초보자 기본 운동", description: "주 2~3회. 머신·덤벨 위주로 기본 동작을 익힌다.", days: [
    { name: "초보자 전신", items: [hyp("goblet-squat"), hyp("chest-press-machine"), hyp("lat-pulldown"), hyp("shoulder-press-machine", 2), hyp("seated-leg-curl", 2), hyp("plank", 2, [20, 40], 60)] },
  ] },
  { key: "full-body", group: "분할", name: "전신 운동", description: "주 3회(A/B 번갈아). 회당 전신을 고르게 자극한다.", days: [
    { name: "전신 A", items: [hyp("back-squat", 3, [6, 10], 150), hyp("barbell-bench-press", 3, [6, 10], 120), hyp("barbell-row", 3, [8, 10], 120), hyp("lateral-raise", 2, [12, 15], 60), hyp("plank", 2, [30, 60], 60)] },
    { name: "전신 B", items: [hyp("romanian-deadlift", 3, [8, 10], 120), hyp("overhead-press", 3, [6, 10], 120), hyp("lat-pulldown"), hyp("leg-press"), hyp("dumbbell-curl", 2)] },
  ] },
  { key: "split-2", group: "분할", name: "2분할 (상체/하체)", description: "주 4회. 상체와 하체를 번갈아 수행.", days: [{ name: "상체", items: upper }, { name: "하체", items: lower }] },
  { key: "upper-lower", group: "분할", name: "상체 / 하체", description: "2분할과 같은 구성. 주 2~4회로 유연하게 운영.", days: [{ name: "상체", items: upper }, { name: "하체", items: lower }] },
  { key: "split-3", group: "분할", name: "3분할 (가슴·삼두 / 등·이두 / 하체·어깨)", description: "주 3~6회.", days: [
    { name: "가슴·삼두", items: [hyp("barbell-bench-press", 4, [6, 10], 120), hyp("incline-dumbbell-press"), hyp("cable-crossover", 3, [12, 15], 60), hyp("triceps-pushdown"), hyp("overhead-triceps-extension")] },
    { name: "등·이두", items: [hyp("deadlift", 3, [5, 8], 180), hyp("lat-pulldown"), hyp("seated-cable-row"), hyp("barbell-curl"), hyp("hammer-curl")] },
    { name: "하체·어깨", items: [hyp("back-squat", 4, [6, 10], 150), hyp("leg-press"), hyp("lying-leg-curl"), hyp("overhead-press", 3, [6, 10], 120), hyp("lateral-raise", 3, [12, 15], 60)] },
  ] },
  { key: "ppl", group: "분할", name: "Push / Pull / Legs", description: "주 3회 또는 6회.", days: [{ name: "Push", items: push }, { name: "Pull", items: pull }, { name: "Legs", items: legs }] },
  { key: "split-4", group: "분할", name: "4분할 (가슴 / 등 / 어깨 / 하체)", description: "주 4회.", days: [
    { name: "가슴", items: [hyp("barbell-bench-press", 4, [6, 10], 120), hyp("incline-dumbbell-press"), hyp("chest-dip"), hyp("pec-deck", 3, [12, 15], 60)] },
    { name: "등", items: [hyp("pull-up", 3, [6, 10], 120), hyp("barbell-row", 4, [6, 10], 120), hyp("seated-cable-row"), hyp("dumbbell-row")] },
    { name: "어깨·팔", items: [hyp("overhead-press", 4, [6, 10], 120), hyp("lateral-raise", 4, [12, 15], 60), hyp("rear-delt-fly", 3, [12, 15], 60), hyp("ez-bar-curl"), hyp("skull-crusher")] },
    { name: "하체", items: legs },
  ] },
  { key: "split-5", group: "분할", name: "5분할 (가슴 / 등 / 어깨 / 하체 / 팔)", description: "주 5회. 부위당 주 1회 고볼륨.", days: [
    { name: "가슴", items: [hyp("barbell-bench-press", 4, [6, 10], 120), hyp("incline-dumbbell-press", 4), hyp("dumbbell-fly"), hyp("cable-crossover", 3, [12, 15], 60)] },
    { name: "등", items: [hyp("deadlift", 3, [5, 8], 180), hyp("pull-up", 3, [6, 10], 120), hyp("barbell-row"), hyp("lat-pulldown")] },
    { name: "어깨", items: [hyp("overhead-press", 4, [6, 10], 120), hyp("lateral-raise", 4, [12, 15], 60), hyp("cable-lateral-raise", 3, [12, 15], 60), hyp("face-pull", 3, [12, 15], 60)] },
    { name: "하체", items: legs },
    { name: "팔", items: [hyp("barbell-curl"), hyp("close-grip-bench-press"), hyp("hammer-curl"), hyp("triceps-pushdown"), hyp("preacher-curl"), hyp("overhead-triceps-extension")] },
  ] },
  { key: "hypertrophy", group: "목표", name: "근비대 중심 (상/하 4일)", description: "8~12회, 세트 간 60~120초 휴식. 볼륨 중심.", days: [
    { name: "상체 근비대", items: upper.map((t) => ({ ...t, reps: [8, 12] as [number, number] })) },
    { name: "하체 근비대", items: lower.map((t) => ({ ...t, reps: [8, 12] as [number, number] })) },
  ] },
  { key: "strength", group: "목표", name: "근력 중심 (5×5 스타일)", description: "3~5회 고중량, 세트 간 2~3분 휴식. 주 3회 A/B 교대.", days: [
    { name: "근력 A", items: [str("back-squat"), str("barbell-bench-press"), str("barbell-row")] },
    { name: "근력 B", items: [str("back-squat"), str("overhead-press"), str("deadlift", 1, [5, 5], 180)] },
  ] },
];
