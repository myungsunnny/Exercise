import "server-only";
import { addDays } from "date-fns";
import { getBodyMeasurements, getCoachProfile, getExercises, getGoals, getMeals, getNutritionGoals, getPreferences, getRoutines, getSchedules, getUserExerciseSettings, getWellness, listCompletedSessions, type Routine } from "@/lib/data";
import { dateKey, expandPlan } from "@/lib/schedule";
import { recommendNext } from "@/lib/progression";

// AI 요청 한 번에 필요한 사용자 데이터를 모아 둔다(조회는 모두 RLS 적용).
export async function loadContext() {
  const now = new Date();
  const [prefs, profile, sessions, routines, goals, exercises, settings] = await Promise.all([
    getPreferences(), getCoachProfile(), listCompletedSessions(), getRoutines(), getGoals(), getExercises(), getUserExerciseSettings(),
  ]);
  const tz = prefs.timezone;
  const today = dateKey(now, tz);
  const weekAhead = dateKey(addDays(now, 7), tz);
  const back = (days: number) => dateKey(addDays(now, -days), tz);
  const [schedules, body, wellness, meals, nutritionGoals] = await Promise.all([
    getSchedules(today, weekAhead), getBodyMeasurements(back(180)), getWellness(back(30), today), getMeals(back(13), today), getNutritionGoals(),
  ]);
  const plan = expandPlan(routines, schedules, today, weekAhead);
  const weights = body.filter((b) => b.weight_kg != null);
  const latestWeight = weights.length ? weights[weights.length - 1].weight_kg : null;
  return { now, tz, today, prefs, profile, sessions, routines, goals, exercises, settings, plan, body, wellness, meals, nutritionGoals, latestWeight };
}
export type Ctx = Awaited<ReturnType<typeof loadContext>>;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// 이름으로 종목 찾기: 라이브러리 + 기록에 남은 이름(보관된 종목 포함)
export function findExercise(ctx: Ctx, name: string) {
  const q = norm(name);
  if (!q) return { match: null, candidates: [] as string[] };
  const pool = new Map<string, { id: string; name: string; type: (typeof ctx.exercises)[number]["exercise_type"] }>();
  for (const e of ctx.exercises) pool.set(e.id, { id: e.id, name: e.name_ko, type: e.exercise_type });
  for (const s of ctx.sessions) for (const e of s.workout_exercises) if (!pool.has(e.exercise_id)) pool.set(e.exercise_id, { id: e.exercise_id, name: e.exercise_name, type: e.exercise_type });
  const all = [...pool.values()];
  const en = new Map(ctx.exercises.map((e) => [e.id, norm(e.name_en ?? "")]));
  const exact = all.find((e) => norm(e.name) === q || en.get(e.id) === q);
  if (exact) return { match: exact, candidates: [] };
  const partial = all.filter((e) => norm(e.name).includes(q) || q.includes(norm(e.name)) || (en.get(e.id) ?? "").includes(q));
  // 기록이 많은 종목을 우선
  const count = (id: string) => ctx.sessions.filter((s) => s.workout_exercises.some((e) => e.exercise_id === id)).length;
  partial.sort((a, b) => count(b.id) - count(a.id));
  return partial.length === 1 || (partial[0] && count(partial[0].id) > 0) ? { match: partial[0], candidates: partial.slice(1, 6).map((e) => e.name) } : { match: null, candidates: partial.slice(0, 8).map((e) => e.name) };
}

export const incrementFor = (ctx: Ctx, exerciseId: string) => Number(ctx.settings.get(exerciseId)?.weight_increment_kg ?? ctx.prefs.weight_increment_kg);

// 오늘 추천 루틴: 오늘 예정된 루틴 → 없으면 가장 오래 수행하지 않은 루틴
export function recommendedRoutine(ctx: Ctx): { routine: Routine; reason: string; isDeload: boolean } | null {
  const todays = ctx.plan.get(ctx.today) ?? [];
  for (const p of todays) {
    const r = ctx.routines.find((x) => x.id === p.routineId);
    if (r) return { routine: r, reason: "오늘 예정된 루틴", isDeload: !!p.isDeload };
  }
  const withItems = ctx.routines.filter((r) => r.routine_exercises.length > 0);
  if (!withItems.length) return null;
  const last = (id: string) => ctx.sessions.find((s) => s.routine_id === id)?.started_at ?? "";
  const r = [...withItems].sort((a, b) => last(a.id).localeCompare(last(b.id)))[0];
  return { routine: r, reason: last(r.id) ? "가장 오래 수행하지 않은 루틴" : "아직 수행하지 않은 루틴", isDeload: false };
}

export function routineTargets(ctx: Ctx, routine: Routine, isDeload = false) {
  return routine.routine_exercises.map((it) => ({
    item: it,
    name: it.exercises?.name_ko ?? "운동",
    rec: recommendNext(ctx.sessions, {
      exerciseId: it.exercise_id,
      exerciseType: it.exercises?.exercise_type ?? "weight_reps",
      repMin: it.rep_min,
      repMax: it.rep_max,
      targetSets: it.target_sets,
      incrementKg: incrementFor(ctx, it.exercise_id),
      isDeload,
    }),
  }));
}
