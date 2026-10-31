"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getRoutine } from "@/lib/data";
import { ROUTINE_TEMPLATES } from "@/lib/routine-templates";

const intOrNull = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

export const routineSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "루틴 이름을 입력하세요.").max(80),
  description: z.string().max(1000).nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  items: z
    .array(
      z
        .object({
          exercise_id: z.uuid(),
          target_sets: z.number().int().min(1).max(20),
          rep_min: intOrNull(1, 100),
          rep_max: intOrNull(1, 100),
          target_weight_kg: z.number().min(0).max(1000).nullable(),
          rest_seconds: intOrNull(0, 1800),
          superset_group: intOrNull(1, 20),
          notes: z.string().max(500).nullable(),
        })
        .refine((i) => i.rep_min == null || i.rep_max == null || i.rep_min <= i.rep_max, { message: "최소 반복이 최대 반복보다 큽니다." }),
    )
    .max(40),
});
export type RoutineInput = z.infer<typeof routineSchema>;

export async function saveRoutine(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = routineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("save_routine", { p_routine: parsed.data });
  if (error) return { ok: false, error: "루틴을 저장하지 못했습니다." };
  revalidatePath("/routines");
  return { ok: true, id: data as string };
}

export async function deleteRoutine(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("routines").delete().eq("id", z.uuid().parse(id));
  if (error) return { ok: false as const, error: "삭제하지 못했습니다." };
  revalidatePath("/routines");
  return { ok: true as const };
}

export async function duplicateRoutine(id: string) {
  const r = await getRoutine(z.uuid().parse(id));
  if (!r) return { ok: false as const, error: "루틴을 찾을 수 없습니다." };
  const res = await saveRoutine({
    id: null,
    name: `${r.name} (복사본)`.slice(0, 80),
    description: r.description,
    weekdays: [],
    items: r.routine_exercises.map(({ exercise_id, target_sets, rep_min, rep_max, target_weight_kg, rest_seconds, superset_group, notes }) => ({
      exercise_id, target_sets, rep_min, rep_max, target_weight_kg, rest_seconds, superset_group, notes,
    })),
  });
  return res;
}

export async function createFromTemplate(key: string) {
  const tpl = ROUTINE_TEMPLATES.find((t) => t.key === key);
  if (!tpl) return { ok: false as const, error: "템플릿을 찾을 수 없습니다." };
  const { supabase } = await requireUser();
  const slugs = [...new Set(tpl.days.flatMap((d) => d.items.map((i) => i.slug)))];
  const { data, error } = await supabase.from("exercises").select("id, slug").in("slug", slugs);
  if (error) return { ok: false as const, error: "운동 종목을 불러오지 못했습니다." };
  const idBySlug = new Map(data.map((r) => [r.slug as string, r.id as string]));

  for (const day of tpl.days) {
    const res = await saveRoutine({
      id: null,
      name: tpl.days.length > 1 ? `${tpl.name} · ${day.name}`.slice(0, 80) : tpl.name,
      description: tpl.description,
      weekdays: [],
      items: day.items
        .filter((i) => idBySlug.has(i.slug))
        .map((i) => ({
          exercise_id: idBySlug.get(i.slug)!,
          target_sets: i.sets,
          rep_min: i.reps[0],
          rep_max: i.reps[1],
          target_weight_kg: null,
          rest_seconds: i.rest ?? null,
          superset_group: null,
          notes: null,
        })),
    });
    if (!res.ok) return res;
  }
  redirect("/routines");
}
