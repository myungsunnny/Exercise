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
    .select("timezone, weight_unit, default_rest_seconds, weight_increment_kg, weekly_workout_target")
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
         workout_sets(set_type, weight_kg, reps, duration_seconds, distance_km, is_completed))`,
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
          workout_sets: e.workout_sets.map((x) => ({
            ...x,
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
