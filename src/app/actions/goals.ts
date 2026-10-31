"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const goalSchema = z
  .object({
    kind: z.enum(["weekly_count", "weekly_minutes", "exercise_weight", "exercise_reps", "body_weight", "streak_weeks"]),
    exercise_id: z.uuid().nullable(),
    target_value: z.number().positive("목표값은 0보다 커야 합니다.").max(100000),
    start_value: z.number().min(0).nullable(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .refine((g) => ["exercise_weight", "exercise_reps"].includes(g.kind) === (g.exercise_id != null), { message: "운동 목표에는 종목을 선택하세요." })
  .refine((g) => g.kind !== "weekly_count" || g.target_value <= 14, { message: "주간 운동 횟수는 14회 이하로 설정하세요." });

export async function createGoal(input: unknown) {
  const p = goalSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "입력값 오류" };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("user_goals").insert({ ...p.data, user_id: userId });
  if (error) return { ok: false as const, error: "목표를 저장하지 못했습니다." };
  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true as const };
}

export async function archiveGoal(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("user_goals").update({ archived_at: new Date().toISOString() }).eq("id", z.uuid().parse(id));
  if (error) return { ok: false as const, error: "삭제하지 못했습니다." };
  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true as const };
}
