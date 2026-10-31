"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getActiveSession, getPreviousSets, getRoutine, getSession } from "@/lib/data";
import { workoutPayloadSchema } from "@/lib/workout/schema";
import { newExercise, newSession, newSet, toPayload, type DraftSession } from "@/lib/workout/model";

export type SaveResult = { ok: true; revision: number } | { ok: false; error: string };

// 자동저장. 같은 스냅샷이 여러 번 와도 UUID upsert라 중복되지 않고,
// 리비전이 낮은 요청은 DB 함수에서 무시된다.
export async function saveWorkout(payload: unknown, revision: number): Promise<SaveResult> {
  const parsed = workoutPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요: " + parsed.error.issues[0]?.message };
  if (!Number.isSafeInteger(revision) || revision < 1) return { ok: false, error: "잘못된 리비전" };

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("save_workout", { p_session: parsed.data, p_revision: revision });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 진행 중인 다른 운동이 있습니다." };
    return { ok: false, error: "저장하지 못했습니다. 네트워크 상태를 확인해 주세요." };
  }
  return { ok: true, revision: Number(data) };
}

const startSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("empty") }),
  z.object({ mode: z.literal("routine"), routineId: z.uuid() }),
  z.object({ mode: z.literal("copy"), sessionId: z.uuid() }),
]);

export async function startWorkout(formData: FormData) {
  const input = startSchema.parse(Object.fromEntries(formData));
  if (await getActiveSession()) redirect("/workout");

  let draft: DraftSession;
  const now = new Date();
  if (input.mode === "routine") {
    const routine = await getRoutine(input.routineId);
    if (!routine) throw new Error("루틴을 찾을 수 없습니다.");
    draft = newSession(now, {
      title: routine.name,
      routine_id: routine.id,
      exercises: routine.routine_exercises.map((it) =>
        newExercise(
          { id: it.exercise_id, name_ko: it.exercises?.name_ko ?? "운동", exercise_type: it.exercises?.exercise_type ?? "weight_reps" },
          {
            setCount: it.target_sets,
            superset_group: it.superset_group,
            rest_seconds: it.rest_seconds,
            rep_min: it.rep_min,
            rep_max: it.rep_max,
            notes: it.notes ?? "",
            sets: Array.from({ length: it.target_sets }, () =>
              newSet({ weight: it.target_weight_kg == null ? "" : String(it.target_weight_kg) }),
            ),
          },
        ),
      ),
    });
  } else if (input.mode === "copy") {
    const src = await getSession(input.sessionId);
    if (!src) throw new Error("운동 기록을 찾을 수 없습니다.");
    draft = newSession(now, {
      title: src.draft.title,
      routine_id: src.draft.routine_id,
      exercises: src.draft.exercises.map((e) =>
        newExercise(
          { id: e.exercise_id, name_ko: e.exercise_name, exercise_type: e.exercise_type },
          {
            superset_group: e.superset_group,
            rest_seconds: e.rest_seconds,
            rep_min: e.rep_min,
            rep_max: e.rep_max,
            sets: e.sets.map(({ set_type, weight, reps, duration, distance }) => newSet({ set_type, weight, reps, duration, distance })),
          },
        ),
      ),
    });
  } else {
    draft = newSession(now);
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("save_workout", { p_session: toPayload(draft), p_revision: 1 });
  if (error && error.code !== "23505") throw new Error("운동을 시작하지 못했습니다.");
  redirect("/workout");
}

export async function deleteWorkout(id: string) {
  const sessionId = z.uuid().parse(id);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("workout_sessions").delete().eq("id", sessionId);
  if (error) return { ok: false as const, error: "삭제하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true as const };
}

// 운동 중 종목을 추가할 때 해당 종목의 직전 기록을 가져온다.
export async function fetchPreviousSets(exerciseIds: string[], excludeSession: string) {
  const ids = z.array(z.uuid()).max(40).parse(exerciseIds);
  return getPreviousSets(ids, z.uuid().parse(excludeSession));
}
