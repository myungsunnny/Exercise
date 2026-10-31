import "server-only";
import { requireUser } from "@/lib/auth";
import { DEFAULT_PREFERENCES, type Exercise, type ExerciseType, type Preferences, type SetType } from "@/lib/types";
import { formatDurationInput, type DraftSession } from "@/lib/workout/model";

const EXERCISE_COLS =
  "id, owner_id, name_ko, name_en, exercise_type, equipment, difficulty, instructions, cautions, media_url, archived_at, exercise_muscles(muscle_id, role)";

export async function getPreferences(): Promise<Preferences> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("user_preferences")
    .select("timezone, weight_unit, default_rest_seconds, weight_increment_kg, weekly_workout_target, dashboard_order, muscle_set_targets")
    .maybeSingle();
  return data ? { ...data, weight_increment_kg: Number(data.weight_increment_kg) } : DEFAULT_PREFERENCES;
}

export async function getExercises(): Promise<Exercise[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("exercises").select(EXERCISE_COLS).is("archived_at", null).order("name_ko");
  if (error) throw error;
  return data as Exercise[];
}

export async function getUserExerciseSettings() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("user_exercises").select("exercise_id, is_favorite, rest_seconds, weight_increment_kg");
  if (error) throw error;
  return new Map(data.map((r) => [r.exercise_id as string, r]));
}

export async function getMuscles() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("muscles").select("id, name_ko, sort_order").order("sort_order");
  if (error) throw error;
  return data;
}

// ───────────────────────── 운동 기록 ─────────────────────────
type SessionRow = {
  id: string;
  routine_id: string | null;
  title: string;
  status: "in_progress" | "completed";
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  notes: string | null;
  client_revision: number;
  workout_exercises: {
    id: string;
    exercise_id: string;
    exercise_name: string;
    position: number;
    superset_group: number | null;
    rest_seconds: number | null;
    rep_min: number | null;
    rep_max: number | null;
    notes: string | null;
    exercises: { exercise_type: ExerciseType } | null;
    workout_sets: {
      id: string;
      position: number;
      set_type: SetType;
      weight_kg: number | null;
      reps: number | null;
      duration_seconds: number | null;
      distance_km: number | null;
      rpe: number | null;
      rir: number | null;
      is_completed: boolean;
      completed_at: string | null;
      rest_seconds: number | null;
      notes: string | null;
    }[];
  }[];
};

const SESSION_COLS = `id, routine_id, title, status, started_at, ended_at, paused_at, paused_seconds, notes, client_revision,
  workout_exercises(id, exercise_id, exercise_name, position, superset_group, rest_seconds, rep_min, rep_max, notes,
    exercises(exercise_type),
    workout_sets(id, position, set_type, weight_kg, reps, duration_seconds, distance_km, rpe, rir, is_completed, completed_at, rest_seconds, notes))`;

const str = (n: number | null) => (n == null ? "" : String(Number(n)));

function rowToDraft(r: SessionRow): DraftSession {
  return {
    id: r.id,
    routine_id: r.routine_id,
    title: r.title,
    status: r.status,
    started_at: r.started_at,
    ended_at: r.ended_at,
    paused_at: r.paused_at,
    paused_seconds: r.paused_seconds,
    notes: r.notes ?? "",
    exercises: [...r.workout_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        exercise_name: e.exercise_name,
        exercise_type: e.exercises?.exercise_type ?? "weight_reps",
        superset_group: e.superset_group,
        rest_seconds: e.rest_seconds,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        notes: e.notes ?? "",
        sets: [...e.workout_sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            id: s.id,
            set_type: s.set_type,
            weight: str(s.weight_kg),
            reps: str(s.reps),
            duration: formatDurationInput(s.duration_seconds),
            distance: str(s.distance_km),
            rpe: str(s.rpe),
            rir: str(s.rir),
            done: s.is_completed,
            completed_at: s.completed_at,
            rest_seconds: s.rest_seconds,
            notes: s.notes ?? "",
          })),
      })),
  };
}

export async function getActiveSession(): Promise<{ draft: DraftSession; revision: number } | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("workout_sessions").select(SESSION_COLS).eq("status", "in_progress").maybeSingle();
  if (error) throw error;
  return data ? { draft: rowToDraft(data as unknown as SessionRow), revision: data.client_revision } : null;
}

export async function getSession(id: string): Promise<{ draft: DraftSession; revision: number } | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("workout_sessions").select(SESSION_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { draft: rowToDraft(data as unknown as SessionRow), revision: data.client_revision } : null;
}

export type PrevSet = { set_type: SetType; weight_kg: number | null; reps: number | null; duration_seconds: number | null; distance_km: number | null; rpe: number | null; rir: number | null };
export type PrevByExercise = Record<string, { started_at: string; sets: PrevSet[] }>;

export async function getPreviousSets(exerciseIds: string[], excludeSession: string | null): Promise<PrevByExercise> {
  if (exerciseIds.length === 0) return {};
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("previous_sets", { p_exercise_ids: exerciseIds, p_exclude_session: excludeSession });
  if (error) throw error;
  const out: PrevByExercise = {};
  for (const r of data as (PrevSet & { exercise_id: string; started_at: string })[]) {
    (out[r.exercise_id] ??= { started_at: r.started_at, sets: [] }).sets.push({
      set_type: r.set_type,
      weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
      reps: r.reps,
      duration_seconds: r.duration_seconds,
      distance_km: r.distance_km == null ? null : Number(r.distance_km),
      rpe: r.rpe == null ? null : Number(r.rpe),
      rir: r.rir,
    });
  }
  return out;
}

// 완료된 세션 목록 + 통계 계산에 필요한 세트 정보
export async function listCompletedSessions(opts: { from?: Date; to?: Date; limit?: number } = {}) {
  const { supabase } = await requireUser();
  let q = supabase
    .from("workout_sessions")
    .select(
      `id, title, started_at, ended_at, paused_seconds, routine_id,
       workout_exercises(id, exercise_name, exercise_id, position, exercises(exercise_type, exercise_muscles(muscle_id, role)),
         workout_sets(set_type, weight_kg, reps, duration_seconds, distance_km, is_completed, rpe, rir, position))`,
    )
    .eq("status", "completed")
    .order("started_at", { ascending: false });
  if (opts.from) q = q.gte("started_at", opts.from.toISOString());
  if (opts.to) q = q.lte("started_at", opts.to.toISOString());
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((s) => ({
    ...s,
    workout_exercises: [...s.workout_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => {
        const ex = e.exercises as unknown as { exercise_type: ExerciseType; exercise_muscles: { muscle_id: string; role: string }[] } | null;
        return {
          ...e,
          exercise_type: ex?.exercise_type ?? ("weight_reps" as ExerciseType),
          muscles: ex?.exercise_muscles ?? [],
          workout_sets: [...e.workout_sets].sort((a, b) => a.position - b.position).map((x) => ({
            ...x,
            rpe: x.rpe == null ? null : Number(x.rpe),
            set_type: x.set_type as SetType,
            weight_kg: x.weight_kg == null ? null : Number(x.weight_kg),
            distance_km: x.distance_km == null ? null : Number(x.distance_km),
          })),
        };
      }),
  }));
}

export type CompletedSession = Awaited<ReturnType<typeof listCompletedSessions>>[number];

// ───────────────────────── 루틴 ─────────────────────────
export type RoutineItem = {
  id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  superset_group: number | null;
  notes: string | null;
  exercises: { name_ko: string; exercise_type: ExerciseType } | null;
};
export type Routine = {
  id: string;
  name: string;
  description: string | null;
  weekdays: number[];
  updated_at: string;
  routine_exercises: RoutineItem[];
};

const ROUTINE_COLS = `id, name, description, weekdays, updated_at,
  routine_exercises(id, exercise_id, position, target_sets, rep_min, rep_max, target_weight_kg, rest_seconds, superset_group, notes, exercises(name_ko, exercise_type))`;

function normRoutine(r: Routine): Routine {
  return {
    ...r,
    routine_exercises: [...r.routine_exercises]
      .sort((a, b) => a.position - b.position)
      .map((x) => ({ ...x, target_weight_kg: x.target_weight_kg == null ? null : Number(x.target_weight_kg) })),
  };
}

export async function getRoutines(): Promise<Routine[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("routines").select(ROUTINE_COLS).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Routine[]).map(normRoutine);
}

export async function getRoutine(id: string): Promise<Routine | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("routines").select(ROUTINE_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normRoutine(data as unknown as Routine) : null;
}

// 루틴별 사용 횟수와 마지막 수행일
export async function getRoutineUsage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("routine_id, started_at")
    .eq("status", "completed")
    .not("routine_id", "is", null);
  if (error) throw error;
  const usage = new Map<string, { count: number; last: string }>();
  for (const r of data) {
    const u = usage.get(r.routine_id!) ?? { count: 0, last: r.started_at };
    u.count++;
    if (r.started_at > u.last) u.last = r.started_at;
    usage.set(r.routine_id!, u);
  }
  return usage;
}

// ───────────────────────── 목표·일정 ─────────────────────────
export type Goal = {
  id: string;
  kind: "weekly_count" | "weekly_minutes" | "exercise_weight" | "exercise_reps" | "body_weight" | "streak_weeks";
  exercise_id: string | null;
  target_value: number;
  start_value: number | null;
  deadline: string | null;
  achieved_at: string | null;
  created_at: string;
  exercises: { name_ko: string } | null;
};

export async function getGoals(): Promise<Goal[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("user_goals")
    .select("id, kind, exercise_id, target_value, start_value, deadline, achieved_at, created_at, exercises(name_ko)")
    .is("archived_at", null)
    .order("created_at");
  if (error) throw error;
  return (data as unknown as Goal[]).map((g) => ({ ...g, target_value: Number(g.target_value), start_value: g.start_value == null ? null : Number(g.start_value) }));
}

export type Schedule = { id: string; program_id: string | null; routine_id: string | null; scheduled_date: string; status: "planned" | "skipped"; is_deload: boolean; notes: string | null };

export async function getSchedules(fromDate: string, toDate: string): Promise<Schedule[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("program_schedules")
    .select("id, program_id, routine_id, scheduled_date, status, is_deload, notes")
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_date");
  if (error) throw error;
  return data as Schedule[];
}

export type Program = { id: string; name: string; start_date: string; weeks: number; deload_every: number | null; pattern: { weekday: number; routine_id: string }[] };

export async function getPrograms(): Promise<Program[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("training_programs").select("id, name, start_date, weeks, deload_every, pattern").order("start_date", { ascending: false });
  if (error) throw error;
  return data as Program[];
}

// ───────────────────────── 코치 프로필·피드백 ─────────────────────────
export type CoachProfile = {
  display_name: string | null;
  experience_level: "beginner" | "intermediate" | "advanced" | null;
  training_goal: "hypertrophy" | "strength" | "fat_loss" | "general_fitness" | "endurance" | null;
  available_days: number[];
  session_minutes: number | null;
  equipment: string[];
  constraints_note: string | null;
  birth_year: number | null;
  sex: string | null;
  height_cm: number | null;
};

export async function getCoachProfile(): Promise<CoachProfile> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, experience_level, training_goal, available_days, session_minutes, equipment, constraints_note, birth_year, sex, height_cm")
    .maybeSingle();
  if (error) throw error;
  return (data as CoachProfile | null) ?? { display_name: null, experience_level: null, training_goal: null, available_days: [], session_minutes: null, equipment: [], constraints_note: null, birth_year: null, sex: null, height_cm: null };
}

export async function getRecentFeedback(limit = 10) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("workout_feedback")
    .select("session_id, fatigue, energy, pain, notes, created_at, workout_sessions(title, started_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as { session_id: string; fatigue: number | null; energy: number | null; pain: boolean; notes: string | null; created_at: string; workout_sessions: { title: string; started_at: string } | null }[];
}

// ───────────────────────── 신체·영양·수면 ─────────────────────────
export type BodyRow = {
  id: string; measured_on: string; weight_kg: number | null; body_fat_pct: number | null; skeletal_muscle_kg: number | null; muscle_kg: number | null;
  waist_cm: number | null; chest_cm: number | null; arm_cm: number | null; thigh_cm: number | null; custom: Record<string, number>; notes: string | null;
};
const BODY_NUM = ["weight_kg", "body_fat_pct", "skeletal_muscle_kg", "muscle_kg", "waist_cm", "chest_cm", "arm_cm", "thigh_cm"] as const;

export async function getBodyMeasurements(fromDate?: string): Promise<BodyRow[]> {
  const { supabase } = await requireUser();
  let q = supabase.from("body_measurements").select("id, measured_on, notes, custom, " + BODY_NUM.join(", ")).order("measured_on");
  if (fromDate) q = q.gte("measured_on", fromDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as BodyRow[]).map((r) => ({ ...r, ...Object.fromEntries(BODY_NUM.map((k) => [k, r[k] == null ? null : Number(r[k])])) }));
}

export async function getLatestWeight(): Promise<{ weight: number; date: string } | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("body_measurements").select("measured_on, weight_kg").not("weight_kg", "is", null).order("measured_on", { ascending: false }).limit(1).maybeSingle();
  return data ? { weight: Number(data.weight_kg), date: data.measured_on } : null;
}

export async function getBodyPhotos() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("body_photos").select("id, taken_on, pose, storage_path, notes").order("taken_on", { ascending: false }).limit(200);
  if (error) throw error;
  if (!data.length) return [];
  // 비공개 버킷: 1시간짜리 서명 URL을 서버에서 발급
  const { data: signed } = await supabase.storage.from("body-photos").createSignedUrls(data.map((p) => p.storage_path), 3600);
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((p) => ({ ...p, url: url.get(p.storage_path) ?? null }));
}

export type Food = { id: string; owner_id: string | null; name: string; serving_desc: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; source: "seed" | "user" | "label"; is_estimate: boolean; source_note: string | null };

export async function getFoods(): Promise<Food[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("food_items").select("id, owner_id, name, serving_desc, kcal, protein_g, carbs_g, fat_g, source, is_estimate, source_note").is("archived_at", null).order("name");
  if (error) throw error;
  return (data as Food[]).map((f) => ({ ...f, kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g) }));
}

export type MealItem = { id: string; name: string; serving_desc: string | null; servings: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; is_estimate: boolean; food_item_id: string | null };
export type Meal = { id: string; eaten_on: string; meal_type: "breakfast" | "lunch" | "dinner" | "snack"; notes: string | null; meal_items: MealItem[] };

export async function getMeals(fromDate: string, toDate: string): Promise<Meal[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("meals")
    .select("id, eaten_on, meal_type, notes, meal_items(id, name, serving_desc, servings, kcal, protein_g, carbs_g, fat_g, is_estimate, food_item_id, created_at)")
    .gte("eaten_on", fromDate).lte("eaten_on", toDate).order("eaten_on");
  if (error) throw error;
  return (data as unknown as Meal[]).map((m) => ({
    ...m,
    meal_items: m.meal_items.map((i) => ({ ...i, servings: Number(i.servings), kcal: Number(i.kcal), protein_g: Number(i.protein_g), carbs_g: Number(i.carbs_g), fat_g: Number(i.fat_g) })),
  }));
}

export type NutritionGoals = { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_ml: number | null };
export async function getNutritionGoals(): Promise<NutritionGoals> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("nutrition_goals").select("kcal, protein_g, carbs_g, fat_g, water_ml").maybeSingle();
  return data ?? { kcal: null, protein_g: null, carbs_g: null, fat_g: null, water_ml: null };
}

export async function getMealTemplates() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("meal_templates").select("id, name, items").order("created_at", { ascending: false });
  if (error) throw error;
  return data as { id: string; name: string; items: Omit<MealItem, "id">[] }[];
}

export type Wellness = { id: string; log_date: string; sleep_hours: number | null; sleep_quality: number | null; fatigue: number | null; condition: number | null; resting_hr: number | null; steps: number | null; active_minutes: number | null; water_ml: number | null; notes: string | null };
export async function getWellness(fromDate: string, toDate: string): Promise<Wellness[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("daily_wellness_logs")
    .select("id, log_date, sleep_hours, sleep_quality, fatigue, condition, resting_hr, steps, active_minutes, water_ml, notes")
    .gte("log_date", fromDate).lte("log_date", toDate).order("log_date");
  if (error) throw error;
  return (data as Wellness[]).map((w) => ({ ...w, sleep_hours: w.sleep_hours == null ? null : Number(w.sleep_hours) }));
}
