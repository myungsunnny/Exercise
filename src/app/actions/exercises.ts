"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const exerciseSchema = z.object({
  name_ko: z.string().trim().min(1, "운동명을 입력하세요.").max(100),
  name_en: z.string().trim().max(100).nullable(),
  exercise_type: z.enum(["weight_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance_duration"]),
  equipment: z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "smith", "ez_bar", "cardio", "other"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  instructions: z.string().max(4000).nullable(),
  cautions: z.string().max(2000).nullable(),
  media_url: z.url({ protocol: /^https$/ }).nullable(),
  primary: z.array(z.string()).min(1, "주요 근육을 하나 이상 선택하세요."),
  secondary: z.array(z.string()),
});

export async function createExercise(input: unknown) {
  const parsed = exerciseSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  const { primary, secondary, ...row } = parsed.data;
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from("exercises").insert({ ...row, owner_id: userId }).select("id").single();
  if (error) return { ok: false as const, error: "운동을 추가하지 못했습니다." };
  const muscles = [
    ...primary.map((m) => ({ exercise_id: data.id, muscle_id: m, role: "primary" })),
    ...secondary.filter((m) => !primary.includes(m)).map((m) => ({ exercise_id: data.id, muscle_id: m, role: "secondary" })),
  ];
  const { error: mErr } = await supabase.from("exercise_muscles").insert(muscles);
  if (mErr) {
    await supabase.from("exercises").delete().eq("id", data.id);
    return { ok: false as const, error: "근육 정보를 저장하지 못했습니다." };
  }
  revalidatePath("/exercises");
  return { ok: true as const, id: data.id as string };
}

// 사용자 종목 삭제. 기록에 쓰였으면 보관 처리해 과거 기록을 보존한다.
export async function removeCustomExercise(id: string) {
  const exId = z.uuid().parse(id);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("exercises").delete().eq("id", exId);
  if (error?.code === "23503") {
    const { error: aErr } = await supabase.from("exercises").update({ archived_at: new Date().toISOString() }).eq("id", exId);
    if (aErr) return { ok: false as const, error: "삭제하지 못했습니다." };
  } else if (error) return { ok: false as const, error: "삭제하지 못했습니다." };
  revalidatePath("/exercises");
  return { ok: true as const };
}

const settingsSchema = z.object({
  exercise_id: z.uuid(),
  is_favorite: z.boolean().optional(),
  rest_seconds: z.number().int().min(0).max(1800).nullable().optional(),
});

export async function updateExerciseSettings(input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "입력값 오류" };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("user_exercises").upsert({ user_id: userId, ...parsed.data }, { onConflict: "user_id,exercise_id" });
  if (error) return { ok: false as const, error: "저장하지 못했습니다." };
  revalidatePath("/exercises");
  return { ok: true as const };
}
