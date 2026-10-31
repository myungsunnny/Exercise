"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const prefsSchema = z.object({
  default_rest_seconds: z.coerce.number().int().min(0).max(1800),
  weight_increment_kg: z.coerce.number().positive().max(20),
  weekly_workout_target: z.coerce.number().int().min(0).max(14),
  display_name: z.string().trim().max(50),
});

export async function updateSettings(_prev: unknown, formData: FormData) {
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값 오류" };
  const { display_name, ...prefs } = parsed.data;
  const { supabase, userId } = await requireUser();
  const [a, b] = await Promise.all([
    supabase.from("user_preferences").upsert({ user_id: userId, ...prefs }),
    supabase.from("profiles").upsert({ id: userId, display_name: display_name || null }),
  ]);
  if (a.error || b.error) return { ok: false, message: "저장하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했습니다." };
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}

const MUSCLE_IDS = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "glutes", "quads", "hamstrings", "calves"] as const;

export async function updateMuscleTargets(_prev: unknown, formData: FormData) {
  const targets: Record<string, number> = {};
  for (const id of MUSCLE_IDS) {
    const n = Number(formData.get(id));
    if (!Number.isInteger(n) || n < 0 || n > 40) return { ok: false, message: "목표 세트는 0~40 사이 정수여야 합니다." };
    targets[id] = n;
  }
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("user_preferences").update({ muscle_set_targets: targets }).eq("user_id", userId);
  if (error) return { ok: false, message: "저장하지 못했습니다." };
  revalidatePath("/muscles");
  return { ok: true, message: "주간 목표 세트를 저장했습니다." };
}

const CARD_KEYS = ["summary", "coach", "today", "muscles", "prs", "trend", "recent", "goals"] as const;

export async function updateDashboardOrder(order: string[]) {
  const valid = order.filter((k): k is (typeof CARD_KEYS)[number] => (CARD_KEYS as readonly string[]).includes(k));
  if (valid.length !== new Set(valid).size) return { ok: false };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("user_preferences").update({ dashboard_order: valid }).eq("user_id", userId);
  if (error) return { ok: false };
  revalidatePath("/");
  return { ok: true };
}
