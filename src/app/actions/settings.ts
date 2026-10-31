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
