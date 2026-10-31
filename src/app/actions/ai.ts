"use server";

import { revalidatePath } from "next/cache";
import { TZDate } from "@date-fns/tz";
import { startOfMonth, startOfWeek } from "date-fns";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertWithinLimit, buildInsight, buildNutritionInsight, chat, proposeRoutine, proposeWeeklyPlan, safetyNoticeFor, type RoutinePayload, type WeeklyPayload } from "@/lib/ai/coach";
import { AIError, aiConfigured } from "@/lib/ai/gemini";
import { getPreferences } from "@/lib/data";
import { dateKey } from "@/lib/schedule";

type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => {
  if (e instanceof AIError) return { ok: false, error: e.message };
  console.error("[ai]", e);
  return { ok: false, error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
};
const ensureConfigured = () => {
  if (!aiConfigured()) throw new AIError("GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣고 서버를 다시 시작하세요.", "no_key");
};

// ───────────────────────── 대화 ─────────────────────────
export async function sendCoachMessage(conversationId: string | null, text: string): Promise<{ ok: true; conversationId: string } | Fail> {
  const msg = z.string().trim().min(1, "메시지를 입력하세요.").max(2000, "메시지는 2000자 이내로 입력하세요.").safeParse(text);
  if (!msg.success) return { ok: false, error: msg.error.issues[0].message };
  try {
    ensureConfigured();
    await assertWithinLimit();
    const { supabase, userId } = await requireUser();
    let convId = conversationId;
    if (convId) {
      z.uuid().parse(convId);
    } else {
      const { data, error } = await supabase.from("ai_conversations").insert({ user_id: userId, title: msg.data.slice(0, 40) }).select("id").single();
      if (error) throw error;
      convId = data.id as string;
    }
    const { data: history, error: hErr } = await supabase.from("ai_messages").select("role, content").eq("conversation_id", convId).order("created_at").limit(40);
    if (hErr) throw hErr;
    const { error: uErr } = await supabase.from("ai_messages").insert({ conversation_id: convId, user_id: userId, role: "user", content: msg.data });
    if (uErr) throw uErr;

    const notice = safetyNoticeFor(msg.data);
    let reply: Awaited<ReturnType<typeof chat>>;
    try {
      reply = await chat(history as { role: "user" | "assistant"; content: string }[], msg.data);
    } catch (e) {
      revalidatePath("/coach");
      throw e;
    }
    const { error: aErr } = await supabase.from("ai_messages").insert({
      conversation_id: convId, user_id: userId, role: "assistant", content: reply.text.slice(0, 20000), evidence: reply.evidence, safety_notice: notice, tokens: reply.tokens,
    });
    if (aErr) throw aErr;
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    revalidatePath("/coach");
    return { ok: true, conversationId: convId };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteConversation(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("ai_conversations").delete().eq("id", z.uuid().parse(id));
  revalidatePath("/coach");
  return error ? { ok: false as const, error: "삭제하지 못했습니다." } : { ok: true as const };
}

// ───────────────────────── 계획 제안 ─────────────────────────
export async function generateRoutinePlan(instructions: string, targetRoutineId: string | null): Promise<{ ok: true } | Fail> {
  try {
    ensureConfigured();
    const ins = z.string().max(1000).parse(instructions);
    if (targetRoutineId) z.uuid().parse(targetRoutineId);
    await assertWithinLimit();
    const r = await proposeRoutine({ instructions: ins, targetRoutineId });
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("ai_recommendations").insert({
      user_id: userId, kind: r.target ? "routine_update" : "routine_new", title: r.target ? `루틴 조정: ${r.target.name}` : `새 루틴: ${r.payload.name}`,
      rationale: r.rationale.slice(0, 4000), target_routine_id: r.target?.id ?? null, before: r.before, payload: r.payload, tokens: r.tokens,
    });
    if (error) throw error;
    revalidatePath("/coach");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateWeeklyPlan(instructions: string): Promise<{ ok: true } | Fail> {
  try {
    ensureConfigured();
    const ins = z.string().max(1000).parse(instructions);
    await assertWithinLimit();
    const r = await proposeWeeklyPlan(ins);
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("ai_recommendations").insert({
      user_id: userId, kind: "weekly_plan", title: "주간 계획(요일 배치)", rationale: r.rationale.slice(0, 4000), before: r.before, payload: r.payload, tokens: r.tokens,
    });
    if (error) throw error;
    revalidatePath("/coach");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const routinePayloadSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).nullable(),
  items: z.array(z.object({
    exercise_id: z.uuid(), exercise_name: z.string(), target_sets: z.number().int().min(1).max(20),
    rep_min: z.number().int().min(1).max(100), rep_max: z.number().int().min(1).max(100), rest_seconds: z.number().int().min(0).max(1800), notes: z.string().max(500).nullable(),
  })).min(1).max(40),
});
const weeklyPayloadSchema = z.object({ assignments: z.array(z.object({ routine_id: z.uuid(), routine_name: z.string(), weekdays: z.array(z.number().int().min(0).max(6)).max(7) })).max(50) });

// 승인: pending → approved 로 먼저 선점(중복 적용 방지) → 서버 검증 후 적용 → 변경 이력 저장
export async function approveRecommendation(id: string): Promise<{ ok: true; routineId?: string } | Fail> {
  const { supabase, userId } = await requireUser();
  const recId = z.uuid().parse(id);
  const { data: rec, error } = await supabase
    .from("ai_recommendations")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", recId)
    .eq("status", "pending")
    .select("id, kind, payload, before, target_routine_id")
    .maybeSingle();
  if (error || !rec) return { ok: false, error: "이미 처리됐거나 찾을 수 없는 제안입니다." };

  const revert = async (msg: string): Promise<Fail> => {
    await supabase.from("ai_recommendations").update({ status: "failed" }).eq("id", recId);
    revalidatePath("/coach");
    return { ok: false, error: msg };
  };

  try {
    if (rec.kind === "weekly_plan") {
      const p: WeeklyPayload = weeklyPayloadSchema.parse(rec.payload);
      for (const a of p.assignments) {
        const { error: e } = await supabase.from("routines").update({ weekdays: a.weekdays }).eq("id", a.routine_id);
        if (e) return revert("요일 배치를 적용하지 못했습니다.");
      }
      await supabase.from("ai_plan_versions").insert({ user_id: userId, recommendation_id: recId, before: rec.before, after: p });
      revalidatePath("/", "layout");
      return { ok: true };
    }
    const p: RoutinePayload = routinePayloadSchema.parse(rec.payload);
    // 승인 시점에도 종목이 여전히 접근 가능한지 확인
    const { data: ex } = await supabase.from("exercises").select("id").in("id", p.items.map((i) => i.exercise_id));
    if ((ex?.length ?? 0) !== new Set(p.items.map((i) => i.exercise_id)).size) return revert("제안에 포함된 운동 중 사용할 수 없는 종목이 있습니다.");
    let weekdays: number[] = [];
    if (rec.kind === "routine_update") {
      if (!rec.target_routine_id) return revert("수정할 루틴이 삭제되었습니다.");
      const { data: cur } = await supabase.from("routines").select("weekdays").eq("id", rec.target_routine_id).maybeSingle();
      if (!cur) return revert("수정할 루틴이 삭제되었습니다.");
      weekdays = cur.weekdays;
    }
    const { data: routineId, error: sErr } = await supabase.rpc("save_routine", {
      p_routine: {
        id: rec.kind === "routine_update" ? rec.target_routine_id : null,
        name: p.name, description: p.description, weekdays,
        items: p.items.map((i) => ({ exercise_id: i.exercise_id, target_sets: i.target_sets, rep_min: i.rep_min, rep_max: i.rep_max, target_weight_kg: null, rest_seconds: i.rest_seconds, superset_group: null, notes: i.notes })),
      },
    });
    if (sErr) return revert("루틴을 저장하지 못했습니다.");
    await supabase.from("ai_plan_versions").insert({ user_id: userId, recommendation_id: recId, routine_id: routineId, before: rec.before, after: p });
    revalidatePath("/", "layout");
    return { ok: true, routineId: routineId as string };
  } catch {
    return revert("제안 내용 검증에 실패했습니다.");
  }
}

export async function rejectRecommendation(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("ai_recommendations").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", z.uuid().parse(id)).eq("status", "pending");
  revalidatePath("/coach");
  return error ? { ok: false as const, error: "처리하지 못했습니다." } : { ok: true as const };
}

// ───────────────────────── 리포트 ─────────────────────────
export async function generateInsight(kind: "daily" | "weekly" | "monthly"): Promise<{ ok: true } | Fail> {
  try {
    ensureConfigured();
    const k = z.enum(["daily", "weekly", "monthly"]).parse(kind);
    await assertWithinLimit();
    const prefs = await getPreferences();
    const z0 = new TZDate(new Date(), prefs.timezone);
    // daily는 최근 7일, weekly는 이번 주(월요일~), monthly는 이번 달
    const start = k === "daily" ? new Date(Date.now() - 7 * 86400_000) : new Date((k === "weekly" ? startOfWeek(z0, { weekStartsOn: 1 }) : startOfMonth(z0)).getTime());
    const periodKey = k === "daily" ? dateKey(new Date(), prefs.timezone) : dateKey(start, prefs.timezone);
    const { content, tokens } = await buildInsight(k, start);
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("ai_insights").upsert({ user_id: userId, kind: k, period_start: periodKey, content, tokens, created_at: new Date().toISOString() }, { onConflict: "user_id,kind,period_start" });
    if (error) throw error;
    revalidatePath("/coach");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateNutritionInsight(): Promise<{ ok: true } | Fail> {
  try {
    ensureConfigured();
    await assertWithinLimit();
    const prefs = await getPreferences();
    const { content, tokens } = await buildNutritionInsight();
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("ai_insights").upsert(
      { user_id: userId, kind: "nutrition", period_start: dateKey(new Date(), prefs.timezone), content, tokens, created_at: new Date().toISOString() },
      { onConflict: "user_id,kind,period_start" },
    );
    if (error) throw error;
    revalidatePath("/nutrition");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────── 코치 프로필·피드백·데이터 삭제 ─────────────────────────
const profileSchema = z.object({
  training_goal: z.enum(["hypertrophy", "strength", "fat_loss", "general_fitness", "endurance"]).nullable(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  available_days: z.array(z.number().int().min(0).max(6)).max(7),
  session_minutes: z.number().int().min(10).max(240).nullable(),
  equipment: z.array(z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "smith", "ez_bar", "cardio", "other"])).max(11),
  constraints_note: z.string().trim().max(1000).nullable(),
});

export async function updateCoachProfile(input: unknown) {
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: "입력값을 확인해 주세요." };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").update({ ...p.data, available_days: [...new Set(p.data.available_days)].sort(), constraints_note: p.data.constraints_note || null }).eq("id", userId);
  if (error) return { ok: false as const, error: "저장하지 못했습니다." };
  revalidatePath("/settings");
  revalidatePath("/coach");
  return { ok: true as const };
}

export async function saveWorkoutFeedback(input: unknown) {
  const p = z.object({
    session_id: z.uuid(), fatigue: z.number().int().min(1).max(5).nullable(), energy: z.number().int().min(1).max(5).nullable(),
    pain: z.boolean(), notes: z.string().trim().max(1000).nullable(),
  }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "입력값을 확인해 주세요." };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("workout_feedback").upsert({ ...p.data, notes: p.data.notes || null, user_id: userId }, { onConflict: "session_id" });
  if (error) return { ok: false as const, error: "저장하지 못했습니다." };
  revalidatePath(`/history/${p.data.session_id}`);
  return { ok: true as const };
}

// AI 대화·제안·리포트·변경 이력 삭제(운동 기록과 적용된 루틴은 유지)
export async function deleteAiData() {
  const { supabase, userId } = await requireUser();
  const results = await Promise.all([
    supabase.from("ai_conversations").delete().eq("user_id", userId),
    supabase.from("ai_plan_versions").delete().eq("user_id", userId),
    supabase.from("ai_recommendations").delete().eq("user_id", userId),
    supabase.from("ai_insights").delete().eq("user_id", userId),
  ]);
  revalidatePath("/", "layout");
  return results.some((r) => r.error) ? { ok: false as const, error: "일부 데이터를 삭제하지 못했습니다." } : { ok: true as const };
}
