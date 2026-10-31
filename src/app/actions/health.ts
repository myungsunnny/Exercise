"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { scaleMacros } from "@/lib/health";

type R = { ok: true } | { ok: false; error: string };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullable();
const err = (msg: string): R => ({ ok: false, error: msg });
const refresh = (...paths: string[]) => { for (const p of paths) revalidatePath(p); revalidatePath("/"); };

// ───────────────────────── 신체 측정 ─────────────────────────
const measurementSchema = z.object({
  measured_on: day,
  weight_kg: optNum(20, 400), body_fat_pct: optNum(1, 75), skeletal_muscle_kg: optNum(5, 150), muscle_kg: optNum(5, 200),
  waist_cm: optNum(30, 250), chest_cm: optNum(30, 250), arm_cm: optNum(10, 100), thigh_cm: optNum(20, 150),
  custom: z.record(z.string().trim().min(1).max(30), z.number().min(0).max(10000)).refine((o) => Object.keys(o).length <= 10, "사용자 항목은 10개까지 입력할 수 있습니다."),
  notes: z.string().trim().max(500).nullable(),
});

export async function saveMeasurement(input: unknown): Promise<R> {
  const p = measurementSchema.safeParse(input);
  if (!p.success) return err(p.error.issues[0]?.message ?? "입력값 범위를 확인해 주세요.");
  const { custom, ...rest } = p.data;
  const nums = [rest.weight_kg, rest.body_fat_pct, rest.skeletal_muscle_kg, rest.muscle_kg, rest.waist_cm, rest.chest_cm, rest.arm_cm, rest.thigh_cm];
  if (nums.every((v) => v == null) && !Object.keys(custom).length) return err("측정값을 하나 이상 입력하세요.");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("body_measurements").upsert({ ...rest, custom, notes: rest.notes || null, user_id: userId }, { onConflict: "user_id,measured_on" });
  if (error) return err("저장하지 못했습니다.");
  refresh("/body", "/goals");
  return { ok: true };
}

export async function deleteMeasurement(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("body_measurements").delete().eq("id", z.uuid().parse(id));
  if (error) return err("삭제하지 못했습니다.");
  refresh("/body", "/goals");
  return { ok: true };
}

// ───────────────────────── 변화 사진(비공개 저장소) ─────────────────────────
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadBodyPhoto(formData: FormData): Promise<R> {
  const file = formData.get("file");
  const meta = z.object({ taken_on: day, pose: z.enum(["front", "side", "back", "other"]), notes: z.string().trim().max(300) }).safeParse({
    taken_on: formData.get("taken_on"), pose: formData.get("pose"), notes: formData.get("notes") ?? "",
  });
  if (!meta.success) return err("날짜와 자세를 확인해 주세요.");
  if (!(file instanceof File) || !MIME[file.type]) return err("JPG, PNG, WEBP 이미지만 올릴 수 있습니다.");
  if (file.size > 5 * 1024 * 1024) return err("사진은 5MB 이하만 올릴 수 있습니다.");
  const { supabase, userId } = await requireUser();
  const path = `${userId}/${crypto.randomUUID()}.${MIME[file.type]}`;
  const { error: upErr } = await supabase.storage.from("body-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return err("사진을 업로드하지 못했습니다.");
  const { error } = await supabase.from("body_photos").insert({ user_id: userId, taken_on: meta.data.taken_on, pose: meta.data.pose, notes: meta.data.notes || null, storage_path: path });
  if (error) {
    await supabase.storage.from("body-photos").remove([path]);
    return err("사진 정보를 저장하지 못했습니다.");
  }
  refresh("/body");
  return { ok: true };
}

export async function deleteBodyPhoto(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("body_photos").select("storage_path").eq("id", z.uuid().parse(id)).maybeSingle();
  if (!data) return err("사진을 찾을 수 없습니다.");
  const { error: rmErr } = await supabase.storage.from("body-photos").remove([data.storage_path]);
  if (rmErr) return err("사진 파일을 삭제하지 못했습니다.");
  await supabase.from("body_photos").delete().eq("id", id);
  refresh("/body");
  return { ok: true };
}

// ───────────────────────── 식단 ─────────────────────────
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const macro = { kcal: z.number().min(0).max(5000), protein_g: z.number().min(0).max(500), carbs_g: z.number().min(0).max(1000), fat_g: z.number().min(0).max(500) };
const foodSchema = z.object({ name: z.string().trim().min(1, "음식 이름을 입력하세요.").max(80), serving_desc: z.string().trim().min(1, "1회 제공량을 입력하세요.").max(40), ...macro, source: z.enum(["user", "label"]), is_estimate: z.boolean() });

async function mealIdFor(date: string, mealType: (typeof MEAL_TYPES)[number]) {
  const { supabase, userId } = await requireUser();
  const { data: found } = await supabase.from("meals").select("id").eq("eaten_on", date).eq("meal_type", mealType).maybeSingle();
  if (found) return found.id as string;
  const { data, error } = await supabase.from("meals").upsert({ user_id: userId, eaten_on: date, meal_type: mealType }, { onConflict: "user_id,eaten_on,meal_type" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

const addItemSchema = z.object({
  date: day,
  meal_type: z.enum(MEAL_TYPES),
  servings: z.number().positive("섭취량은 0보다 커야 합니다.").max(50),
  food_item_id: z.uuid().nullable(),
  manual: foodSchema.nullable(),
  save_as_food: z.boolean(),
});

export async function addMealItem(input: unknown): Promise<R> {
  const p = addItemSchema.safeParse(input);
  if (!p.success) return err(p.error.issues[0]?.message ?? "입력값 오류");
  const { supabase, userId } = await requireUser();
  let food: z.infer<typeof foodSchema> & { id: string | null };
  if (p.data.food_item_id) {
    const { data } = await supabase.from("food_items").select("id, name, serving_desc, kcal, protein_g, carbs_g, fat_g, source, is_estimate").eq("id", p.data.food_item_id).maybeSingle();
    if (!data) return err("음식을 찾을 수 없습니다.");
    food = { ...data, kcal: +data.kcal, protein_g: +data.protein_g, carbs_g: +data.carbs_g, fat_g: +data.fat_g, source: data.source === "label" ? "label" : "user" };
  } else if (p.data.manual) {
    food = { ...p.data.manual, id: null };
    if (p.data.save_as_food) {
      const { data, error } = await supabase.from("food_items").upsert({ ...p.data.manual, owner_id: userId }, { onConflict: "owner_id,name,serving_desc" }).select("id").single();
      if (error) return err("음식을 등록하지 못했습니다.");
      food.id = data.id;
    }
  } else return err("음식을 선택하거나 직접 입력하세요.");
  try {
    const mealId = await mealIdFor(p.data.date, p.data.meal_type);
    const m = scaleMacros(food, p.data.servings);
    const { error } = await supabase.from("meal_items").insert({
      meal_id: mealId, user_id: userId, food_item_id: food.id, name: food.name, serving_desc: food.serving_desc, servings: p.data.servings, ...m, is_estimate: food.is_estimate,
    });
    if (error) throw error;
  } catch {
    return err("식사를 기록하지 못했습니다.");
  }
  refresh("/nutrition");
  return { ok: true };
}

export async function updateMealItemServings(id: string, servings: number): Promise<R> {
  const p = z.object({ id: z.uuid(), servings: z.number().positive().max(50) }).safeParse({ id, servings });
  if (!p.success) return err("섭취량을 확인해 주세요.");
  const { supabase } = await requireUser();
  const { data } = await supabase.from("meal_items").select("servings, kcal, protein_g, carbs_g, fat_g").eq("id", id).maybeSingle();
  if (!data) return err("기록을 찾을 수 없습니다.");
  // 저장된 값을 1회 제공량 기준으로 되돌린 뒤 새 섭취량으로 다시 계산
  const per = { kcal: +data.kcal / +data.servings, protein_g: +data.protein_g / +data.servings, carbs_g: +data.carbs_g / +data.servings, fat_g: +data.fat_g / +data.servings };
  const { error } = await supabase.from("meal_items").update({ servings: p.data.servings, ...scaleMacros(per, p.data.servings) }).eq("id", id);
  if (error) return err("수정하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function deleteMealItem(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("meal_items").delete().eq("id", z.uuid().parse(id));
  if (error) return err("삭제하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function createFood(input: unknown): Promise<R> {
  const p = foodSchema.safeParse(input);
  if (!p.success) return err(p.error.issues[0]?.message ?? "입력값 오류");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("food_items").insert({ ...p.data, owner_id: userId });
  if (error) return err(error.code === "23505" ? "같은 이름과 제공량의 음식이 이미 있습니다." : "음식을 등록하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function deleteFood(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("food_items").delete().eq("id", z.uuid().parse(id));
  if (error) return err("삭제하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function saveMealTemplate(name: string, date: string, mealType: string): Promise<R> {
  const p = z.object({ name: z.string().trim().min(1, "템플릿 이름을 입력하세요.").max(60), date: day, mealType: z.enum(MEAL_TYPES) }).safeParse({ name, date, mealType });
  if (!p.success) return err(p.error.issues[0]?.message ?? "입력값 오류");
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("meals").select("meal_items(name, serving_desc, servings, kcal, protein_g, carbs_g, fat_g, is_estimate, food_item_id)").eq("eaten_on", date).eq("meal_type", mealType).maybeSingle();
  const items = data?.meal_items ?? [];
  if (!items.length) return err("저장할 음식이 없습니다.");
  const { error } = await supabase.from("meal_templates").insert({ user_id: userId, name: p.data.name, items });
  if (error) return err("템플릿을 저장하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function applyMealTemplate(templateId: string, date: string, mealType: string): Promise<R> {
  const p = z.object({ templateId: z.uuid(), date: day, mealType: z.enum(MEAL_TYPES) }).safeParse({ templateId, date, mealType });
  if (!p.success) return err("입력값 오류");
  const { supabase, userId } = await requireUser();
  const { data: tpl } = await supabase.from("meal_templates").select("items").eq("id", templateId).maybeSingle();
  if (!tpl) return err("템플릿을 찾을 수 없습니다.");
  const items = z.array(z.object({ name: z.string(), serving_desc: z.string().nullable(), servings: z.coerce.number(), ...Object.fromEntries(Object.keys(macro).map((k) => [k, z.coerce.number().min(0)])), is_estimate: z.boolean(), food_item_id: z.uuid().nullable() })).safeParse(tpl.items);
  if (!items.success) return err("템플릿 형식이 올바르지 않습니다.");
  try {
    const mealId = await mealIdFor(p.data.date, p.data.mealType);
    const { error } = await supabase.from("meal_items").insert(items.data.map((i) => ({ ...i, meal_id: mealId, user_id: userId })));
    if (error) throw error;
  } catch {
    return err("템플릿을 적용하지 못했습니다.");
  }
  refresh("/nutrition");
  return { ok: true };
}

export async function deleteMealTemplate(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("meal_templates").delete().eq("id", z.uuid().parse(id));
  if (error) return err("삭제하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

export async function addWater(date: string, ml: number): Promise<R> {
  const p = z.object({ date: day, ml: z.number().int().min(-2000).max(2000) }).safeParse({ date, ml });
  if (!p.success) return err("입력값 오류");
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("daily_wellness_logs").select("water_ml").eq("log_date", date).maybeSingle();
  const next = Math.max(0, Math.min(20000, (data?.water_ml ?? 0) + p.data.ml));
  const { error } = await supabase.from("daily_wellness_logs").upsert({ user_id: userId, log_date: date, water_ml: next }, { onConflict: "user_id,log_date" });
  if (error) return err("저장하지 못했습니다.");
  refresh("/nutrition", "/wellness");
  return { ok: true };
}

export async function saveNutritionGoals(input: unknown): Promise<R> {
  const opt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
  const p = z.object({ kcal: opt(500, 10000), protein_g: opt(0, 500), carbs_g: opt(0, 1500), fat_g: opt(0, 500), water_ml: opt(0, 10000) }).safeParse(input);
  if (!p.success) return err("목표값 범위를 확인해 주세요.");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("nutrition_goals").upsert({ ...p.data, user_id: userId });
  if (error) return err("저장하지 못했습니다.");
  refresh("/nutrition");
  return { ok: true };
}

// ───────────────────────── 수면·건강 ─────────────────────────
const wellnessSchema = z.object({
  log_date: day,
  sleep_hours: optNum(0, 24), sleep_quality: z.number().int().min(1).max(5).nullable(), fatigue: z.number().int().min(1).max(5).nullable(),
  condition: z.number().int().min(1).max(5).nullable(), resting_hr: z.number().int().min(25).max(220).nullable(), steps: z.number().int().min(0).max(200000).nullable(),
  active_minutes: z.number().int().min(0).max(1440).nullable(), notes: z.string().trim().max(500).nullable(),
});

export async function saveWellness(input: unknown): Promise<R> {
  const p = wellnessSchema.safeParse(input);
  if (!p.success) return err(p.error.issues[0]?.message ?? "입력값 범위를 확인해 주세요.");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("daily_wellness_logs").upsert({ ...p.data, notes: p.data.notes || null, user_id: userId }, { onConflict: "user_id,log_date" });
  if (error) return err("저장하지 못했습니다.");
  refresh("/wellness");
  return { ok: true };
}

export async function deleteWellness(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("daily_wellness_logs").delete().eq("id", z.uuid().parse(id));
  if (error) return err("삭제하지 못했습니다.");
  refresh("/wellness");
  return { ok: true };
}
