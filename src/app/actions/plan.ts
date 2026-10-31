"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { programDates } from "@/lib/schedule";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
type R = { ok: true } | { ok: false; error: string };
const done = (): R => {
  revalidatePath("/calendar");
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
};

export async function addSchedule(routineId: string, date: string): Promise<R> {
  const p = z.object({ routineId: z.uuid(), date: day }).safeParse({ routineId, date });
  if (!p.success) return { ok: false, error: "입력값 오류" };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("program_schedules").insert({ user_id: userId, routine_id: p.data.routineId, scheduled_date: p.data.date });
  return error ? { ok: false, error: "일정을 추가하지 못했습니다." } : done();
}

// 일정 이동. 주간 반복 일정은 원래 날짜를 건너뜀 처리하고 새 날짜에 일정을 만든다.
export async function moveSchedule(input: { scheduleId: string | null; routineId: string; from: string; to: string }): Promise<R> {
  const p = z.object({ scheduleId: z.uuid().nullable(), routineId: z.uuid(), from: day, to: day }).safeParse(input);
  if (!p.success) return { ok: false, error: "입력값 오류" };
  const { supabase, userId } = await requireUser();
  if (p.data.scheduleId) {
    const { error } = await supabase.from("program_schedules").update({ scheduled_date: p.data.to }).eq("id", p.data.scheduleId);
    return error ? { ok: false, error: "이동하지 못했습니다." } : done();
  }
  const { error } = await supabase.from("program_schedules").insert([
    { user_id: userId, routine_id: p.data.routineId, scheduled_date: p.data.from, status: "skipped" },
    { user_id: userId, routine_id: p.data.routineId, scheduled_date: p.data.to },
  ]);
  return error ? { ok: false, error: "이동하지 못했습니다." } : done();
}

export async function skipSchedule(input: { scheduleId: string | null; routineId: string; date: string }): Promise<R> {
  const p = z.object({ scheduleId: z.uuid().nullable(), routineId: z.uuid(), date: day }).safeParse(input);
  if (!p.success) return { ok: false, error: "입력값 오류" };
  const { supabase, userId } = await requireUser();
  const { error } = p.data.scheduleId
    ? await supabase.from("program_schedules").delete().eq("id", p.data.scheduleId)
    : await supabase.from("program_schedules").insert({ user_id: userId, routine_id: p.data.routineId, scheduled_date: p.data.date, status: "skipped" });
  return error ? { ok: false, error: "처리하지 못했습니다." } : done();
}

export async function setRoutineWeekdays(routineId: string, weekdays: number[]): Promise<R> {
  const p = z.object({ id: z.uuid(), w: z.array(z.number().int().min(0).max(6)).max(7) }).safeParse({ id: routineId, w: weekdays });
  if (!p.success) return { ok: false, error: "입력값 오류" };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("routines").update({ weekdays: [...new Set(p.data.w)].sort() }).eq("id", p.data.id);
  if (error) return { ok: false, error: "저장하지 못했습니다." };
  revalidatePath("/routines");
  return done();
}

const programSchema = z.object({
  name: z.string().trim().min(1, "프로그램 이름을 입력하세요.").max(80),
  start_date: day,
  weeks: z.number().int().min(1).max(52),
  deload_every: z.number().int().min(2).max(12).nullable(),
  pattern: z.array(z.object({ weekday: z.number().int().min(0).max(6), routine_id: z.uuid() })).min(1, "요일별 루틴을 하나 이상 지정하세요.").max(14),
});

export async function createProgram(input: unknown): Promise<R> {
  const p = programSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력값 오류" };
  const schedules = programDates(p.data.start_date, p.data.weeks, p.data.pattern, p.data.deload_every).map((d) => ({ ...d, date: d.date }));
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_program", { p_program: p.data, p_schedules: schedules });
  return error ? { ok: false, error: "프로그램을 만들지 못했습니다." } : done();
}

export async function deleteProgram(id: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("training_programs").delete().eq("id", z.uuid().parse(id));
  return error ? { ok: false, error: "삭제하지 못했습니다." } : done();
}
