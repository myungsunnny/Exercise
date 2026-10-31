import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MUSCLE_NAME } from "@/lib/exercise-filter";
import { EQUIPMENT_LABEL } from "@/lib/types";
import { durationSec, muscleStats, personalRecords, PR_LABEL, totals } from "@/lib/analytics";
import { getMuscles } from "@/lib/data";
import { loadContext, recommendedRoutine, routineTargets, type Ctx } from "./context";
import { AIError, generate, generateJson, type Content, type Schema } from "./gemini";
import { runTool, TOOL_DECLS } from "./tools";

export const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);

// 하루 AI 호출 수 제한(대화·계획·리포트 합산, 사용자 시간대 기준이 아닌 최근 24시간)
export async function assertWithinLimit() {
  const { supabase } = await requireUser();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [a, b, c] = await Promise.all([
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since),
    supabase.from("ai_recommendations").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("ai_insights").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const used = (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0);
  if (used >= DAILY_LIMIT) throw new AIError(`AI 요청은 24시간에 ${DAILY_LIMIT}회까지 사용할 수 있습니다. (AI_DAILY_LIMIT 환경변수로 조정)`, "limit");
}

// 통증·부상 관련 표현이 있으면 서버가 고정 안전 안내를 붙인다(LLM 응답과 별개)
const PAIN_RE = /(통증|아파|아프|아픔|부상|다쳤|다친|저림|저려|찌릿|삐끗|붓|부었|어지러|숨이\s*차|가슴이\s*(아|답답)|관절|인대|디스크|염좌|파열|피가|멍)/;
export const SAFETY_NOTICE =
  "통증이나 부상이 의심되면 해당 부위 운동을 즉시 멈추고, 통증이 지속되거나 심하면 의사·물리치료사 등 전문가와 상담하세요. AI는 진단이나 치료를 할 수 없습니다.";
export const safetyNoticeFor = (text: string) => (PAIN_RE.test(text) ? SAFETY_NOTICE : null);

const SAFETY_RULES = `
[안전 규칙]
- 너는 의료인이 아니다. 질병·부상을 진단하거나 치료법을 처방하지 않는다.
- 통증, 저림, 부상, 어지러움, 가슴 통증 등이 언급되면 그 부위 운동을 중단하고 전문가 상담을 권하며, 운동을 무리하게 계속하라고 권하지 않는다.
- 급격한 볼륨 증가(주간 세트 20% 초과 증가), 극단적 감량, 휴식 없는 연속 고강도 훈련을 제안하지 않는다.`;

function systemPrompt(ctx: Ctx) {
  return `너는 MyFit AI의 개인 퍼스널 트레이너다. 한국어로 간결하고 친근하게 답한다.
오늘은 ${ctx.today} (${ctx.tz}). 중량은 kg, 거리는 km, 시간은 분·초로 표기한다.

[데이터 규칙 — 가장 중요]
- 사용자의 운동 기록·목표·루틴에 관한 사실은 반드시 도구(function)로 조회한 결과만 근거로 말한다. 조회하지 않은 기록을 본 것처럼 말하지 않는다.
- 도구 결과에 data_available=false이거나 값이 없으면 "기록이 없어 분석할 수 없다"고 분명히 말하고, 이유(어떤 기간·종목의 데이터가 없는지)를 설명한다. 추측을 사실처럼 표현하지 않는다.
- 숫자는 도구 결과의 값을 그대로 쓰고, 비교할 때는 기간과 날짜를 함께 밝힌다. 계산이 필요하면 결과 값만으로 간단히 계산하고 계산식을 보여준다.
- 다음 운동의 중량·반복 추천은 get_next_targets 결과를 사용하고, 그 근거(reason)를 함께 설명한다. 임의의 다른 중량을 만들지 않는다.
- 추정 1RM은 추정치임을 밝힌다.
- 일반적인 운동 지식 질문(자세, 원리 등)은 도구 없이 답해도 되지만, 개인 데이터와 섞지 않는다.

[계획 변경]
- 대화에서는 루틴·일정·설정을 직접 바꿀 수 없다. 변경이 필요하면 'AI 트레이너 > 계획 생성'에서 제안을 만들고 변경 전후를 비교한 뒤 승인하면 적용된다고 안내한다.
${SAFETY_RULES}`;
}

export type Evidence = { name: string; args: Record<string, unknown>; summary: string };

// 대화 응답: 도구 호출 루프(최대 6단계)
export async function chat(history: { role: "user" | "assistant"; content: string }[], message: string) {
  const ctx = await loadContext();
  const contents: Content[] = [
    ...history.slice(-16).map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const evidence: Evidence[] = [];
  let tokens = 0;
  let model: string | undefined; // 사고 서명이 모델별이라 첫 응답 모델로 고정
  for (let step = 0; step < 6; step++) {
    const r = await generate({ system: systemPrompt(ctx), contents, tools: TOOL_DECLS, maxOutputTokens: 2048, model });
    model = r.model;
    tokens += r.tokens;
    if (!r.calls.length) {
      if (!r.text) throw new AIError("AI가 빈 응답을 보냈습니다. 다시 시도해 주세요.", "invalid");
      return { text: r.text, evidence, tokens };
    }
    // 모델 응답(사고 서명 포함)을 그대로 이어 붙인 뒤 도구 결과를 돌려준다
    contents.push(r.content);
    const responses = [];
    for (const call of r.calls.slice(0, 6)) {
      const out = await runTool(ctx, call.name, call.args).catch(() => ({ result: { error: "조회 중 오류가 발생했습니다." }, summary: `${call.name} 오류` }));
      evidence.push({ name: call.name, args: call.args, summary: out.summary });
      responses.push({ functionResponse: { name: call.name, response: out.result, ...(call.id ? { id: call.id } : {}) } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new AIError("AI가 데이터를 조회하는 데 너무 많은 단계를 사용했습니다. 질문을 나눠 다시 시도해 주세요.", "invalid");
}

// ───────────────────────── 계획 생성(구조화 응답 → 검증 → 승인 대기) ─────────────────────────
function catalog(ctx: Ctx) {
  const owned = new Set(ctx.profile.equipment);
  const list = ctx.exercises.filter((e) => !owned.size || owned.has(e.equipment) || e.equipment === "bodyweight");
  return list.map((e, i) => ({
    key: `e${i + 1}`,
    id: e.id,
    line: `e${i + 1}|${e.name_ko}|${EQUIPMENT_LABEL[e.equipment]}|${e.difficulty}|주:${e.exercise_muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_NAME[m.muscle_id]).join(",")}|보조:${e.exercise_muscles.filter((m) => m.role === "secondary").map((m) => MUSCLE_NAME[m.muscle_id]).join(",")}`,
  }));
}

async function planContext(ctx: Ctx) {
  const muscles = await getMuscles();
  const four = ctx.sessions.filter((s) => Date.parse(s.started_at) >= ctx.now.getTime() - 28 * 86400_000);
  const t = totals(four);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const p = ctx.profile;
  return [
    `목표: ${p.training_goal ?? "미설정"} / 경력: ${p.experience_level ?? "미설정"} / 운동 가능 요일: ${p.available_days.map((d) => days[d]).join(",") || "미설정"} / 1회 운동 시간: ${p.session_minutes ?? "미설정"}분`,
    `보유 기구: ${p.equipment.map((e) => EQUIPMENT_LABEL[e as keyof typeof EQUIPMENT_LABEL] ?? e).join(", ") || "미설정"} / 제한사항·선호: ${p.constraints_note ?? "없음"}`,
    `최근 4주: ${t.sessions}회, 본세트 ${t.sets}세트, 운동량 ${t.volume}kg` + (four.length ? "" : " (기록 없음)"),
    `근육별 최근 2주 세트: ${muscleStats(ctx.sessions, muscles.map((m) => m.id), ctx.now, ctx.tz).map((m) => `${MUSCLE_NAME[m.muscleId]} ${m.setsThisWeek + m.setsLastWeek}`).join(", ")}`,
  ].join("\n");
}

const routineSchema: Schema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "루틴 이름(30자 이내)" },
    description: { type: "STRING" },
    rationale: { type: "STRING", description: "사용자 데이터에 근거한 구성 이유. 데이터가 부족한 부분은 부족하다고 명시" },
    items: {
      type: "ARRAY", minItems: 1, maxItems: 12,
      items: {
        type: "OBJECT",
        properties: {
          exercise_key: { type: "STRING", description: "제공된 목록의 키(e1, e2…)" },
          target_sets: { type: "INTEGER" }, rep_min: { type: "INTEGER" }, rep_max: { type: "INTEGER" }, rest_seconds: { type: "INTEGER" },
          notes: { type: "STRING" },
        },
        required: ["exercise_key", "target_sets", "rep_min", "rep_max", "rest_seconds"],
      },
    },
  },
  required: ["name", "rationale", "items"],
};

const routineOut = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).optional().default(""),
  rationale: z.string().max(4000),
  items: z.array(z.object({
    exercise_key: z.string(),
    target_sets: z.number().int().min(1).max(10),
    rep_min: z.number().int().min(1).max(100),
    rep_max: z.number().int().min(1).max(100),
    rest_seconds: z.number().int().min(15).max(600),
    notes: z.string().max(300).optional().default(""),
  })).min(1).max(12),
});

export type RoutinePayload = {
  name: string;
  description: string | null;
  items: { exercise_id: string; exercise_name: string; target_sets: number; rep_min: number; rep_max: number; rest_seconds: number; notes: string | null }[];
};

export async function proposeRoutine(opts: { instructions: string; targetRoutineId: string | null }) {
  const ctx = await loadContext();
  const cat = catalog(ctx);
  const target = opts.targetRoutineId ? ctx.routines.find((r) => r.id === opts.targetRoutineId) : null;
  if (opts.targetRoutineId && !target) throw new AIError("수정할 루틴을 찾을 수 없습니다.", "invalid");
  const prompt = [
    target ? `다음 기존 루틴을 사용자 조건에 맞게 조정하라. 유지할 종목은 유지하고 꼭 필요한 부분만 바꿔라.\n현재 루틴 "${target.name}": ${target.routine_exercises.map((x) => `${x.exercises?.name_ko} ${x.target_sets}세트 ${x.rep_min ?? "?"}~${x.rep_max ?? "?"}회 휴식${x.rest_seconds ?? ctx.prefs.default_rest_seconds}초`).join(" / ")}` : "사용자에게 맞는 새 운동 루틴(1회 운동 분량)을 만들어라.",
    `\n[사용자 정보]\n${await planContext(ctx)}`,
    `\n[사용자 요청]\n${opts.instructions.trim() || "(추가 요청 없음)"}`,
    `\n[사용 가능한 운동 목록 — 반드시 이 목록의 키만 사용]\n${cat.map((c) => c.line).join("\n")}`,
    "\n규칙: 1회 운동 시간이 설정돼 있으면 휴식 포함 그 안에 끝나도록 종목·세트를 조절한다. 큰 근육 복합 운동을 앞에 배치한다. 제한사항에 해당하는 동작은 제외한다. rep_min ≤ rep_max.",
  ].join("\n");
  const { json, tokens } = await generateJson({ system: `너는 운동 프로그램 설계 전문가다. 한국어로 답한다.${SAFETY_RULES}`, contents: [{ role: "user", parts: [{ text: prompt }] }], schema: routineSchema });
  const parsed = routineOut.safeParse(json);
  if (!parsed.success) throw new AIError("AI가 만든 루틴이 형식 검증을 통과하지 못했습니다. 다시 시도해 주세요.", "invalid");
  const byKey = new Map(cat.map((c) => [c.key, c.id]));
  const nameOf = new Map(ctx.exercises.map((e) => [e.id, e.name_ko]));
  const items = parsed.data.items
    .filter((i) => byKey.has(i.exercise_key))
    .map((i) => ({ exercise_id: byKey.get(i.exercise_key)!, exercise_name: nameOf.get(byKey.get(i.exercise_key)!)!, target_sets: i.target_sets, rep_min: Math.min(i.rep_min, i.rep_max), rep_max: Math.max(i.rep_min, i.rep_max), rest_seconds: i.rest_seconds, notes: i.notes || null }));
  if (!items.length) throw new AIError("AI가 목록에 없는 운동만 제안했습니다. 다시 시도해 주세요.", "invalid");
  const dropped = parsed.data.items.length - items.length;
  const payload: RoutinePayload = { name: parsed.data.name, description: parsed.data.description || null, items };
  const before = target
    ? { name: target.name, description: target.description, items: target.routine_exercises.map((x) => ({ exercise_id: x.exercise_id, exercise_name: x.exercises?.name_ko ?? "", target_sets: x.target_sets, rep_min: x.rep_min, rep_max: x.rep_max, rest_seconds: x.rest_seconds, notes: x.notes })) }
    : null;
  return { payload, before, rationale: parsed.data.rationale + (dropped ? `\n(목록에 없는 운동 ${dropped}개는 제외했습니다.)` : ""), tokens, target };
}

const weeklySchema: Schema = {
  type: "OBJECT",
  properties: {
    rationale: { type: "STRING" },
    assignments: { type: "ARRAY", items: { type: "OBJECT", properties: { routine_key: { type: "STRING" }, weekdays: { type: "ARRAY", items: { type: "INTEGER" } } }, required: ["routine_key", "weekdays"] } },
  },
  required: ["rationale", "assignments"],
};

export type WeeklyPayload = { assignments: { routine_id: string; routine_name: string; weekdays: number[] }[] };

export async function proposeWeeklyPlan(instructions: string) {
  const ctx = await loadContext();
  if (!ctx.routines.length) throw new AIError("주간 계획을 만들려면 먼저 루틴이 하나 이상 있어야 합니다.", "invalid");
  const keyed = ctx.routines.map((r, i) => ({ key: `r${i + 1}`, r }));
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const prompt = [
    "사용자의 루틴들을 요일(0=일 ~ 6=토)에 배치하는 주간 계획을 만들어라. 같은 주동근을 연속된 날에 배치하지 않도록 하고, 운동 가능 요일이 설정돼 있으면 그 요일만 쓴다. 쓰지 않을 루틴은 weekdays를 빈 배열로 둔다.",
    `\n[사용자 정보]\n${await planContext(ctx)}`,
    `\n[루틴]\n${keyed.map(({ key, r }) => `${key}|${r.name}|현재 요일:${r.weekdays.map((d) => days[d]).join(",") || "없음"}|${r.routine_exercises.map((x) => x.exercises?.name_ko).join(",")}`).join("\n")}`,
    `\n[사용자 요청]\n${instructions.trim() || "(추가 요청 없음)"}`,
  ].join("\n");
  const { json, tokens } = await generateJson({ system: `너는 운동 프로그램 설계 전문가다. 한국어로 답한다.${SAFETY_RULES}`, contents: [{ role: "user", parts: [{ text: prompt }] }], schema: weeklySchema });
  const parsed = z.object({ rationale: z.string().max(4000), assignments: z.array(z.object({ routine_key: z.string(), weekdays: z.array(z.number().int()) })) }).safeParse(json);
  if (!parsed.success) throw new AIError("AI가 만든 주간 계획이 형식 검증을 통과하지 못했습니다.", "invalid");
  const map = new Map(parsed.data.assignments.map((a) => [a.routine_key, [...new Set(a.weekdays.filter((d) => d >= 0 && d <= 6))].sort()]));
  const payload: WeeklyPayload = { assignments: keyed.map(({ key, r }) => ({ routine_id: r.id, routine_name: r.name, weekdays: map.get(key) ?? r.weekdays })) };
  const before: WeeklyPayload = { assignments: ctx.routines.map((r) => ({ routine_id: r.id, routine_name: r.name, weekdays: r.weekdays })) };
  return { payload, before, rationale: parsed.data.rationale, tokens };
}

// ───────────────────────── 리포트·코칭 요약 ─────────────────────────
const insightSchema: Schema = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "한 줄 요약(40자 이내)" },
    summary: { type: "STRING" },
    highlights: { type: "ARRAY", items: { type: "STRING" }, maxItems: 5 },
    concerns: { type: "ARRAY", items: { type: "STRING" }, maxItems: 5 },
    suggestions: { type: "ARRAY", items: { type: "STRING" }, maxItems: 5 },
    data_gaps: { type: "ARRAY", items: { type: "STRING" }, maxItems: 5, description: "데이터가 부족해 판단하지 못한 부분" },
  },
  required: ["headline", "summary", "highlights", "concerns", "suggestions", "data_gaps"],
};
export const insightOut = z.object({
  headline: z.string().max(200), summary: z.string().max(3000),
  highlights: z.array(z.string().max(500)).max(5), concerns: z.array(z.string().max(500)).max(5),
  suggestions: z.array(z.string().max(500)).max(5), data_gaps: z.array(z.string().max(500)).max(5),
});
export type Insight = z.infer<typeof insightOut>;

export async function buildInsight(kind: "daily" | "weekly" | "monthly", periodStart: Date) {
  const ctx = await loadContext();
  const muscles = await getMuscles();
  const end = ctx.now;
  const prevStart = new Date(periodStart.getTime() - (end.getTime() - periodStart.getTime()));
  const cur = ctx.sessions.filter((s) => Date.parse(s.started_at) >= periodStart.getTime());
  const prev = ctx.sessions.filter((s) => Date.parse(s.started_at) >= prevStart.getTime() && Date.parse(s.started_at) < periodStart.getTime());
  const fmt = (iso: string) => formatDate(iso, "yyyy-MM-dd", ctx.tz);
  const { events } = personalRecords(ctx.sessions);
  const rr = recommendedRoutine(ctx);
  const t = totals(cur), pt = totals(prev);
  // AI에는 서버에서 계산한 숫자만 제공한다
  const facts = {
    report_type: { daily: "오늘의 코칭 요약(최근 7일 기준)", weekly: "주간 리포트", monthly: "월간 리포트" }[kind],
    period: `${fmt(periodStart.toISOString())} ~ ${fmt(end.toISOString())}`,
    totals: { sessions: t.sessions, minutes: Math.round(t.durationSec / 60), working_sets: t.sets, volume_kg: t.volume },
    previous_period_totals: { sessions: pt.sessions, minutes: Math.round(pt.durationSec / 60), working_sets: pt.sets, volume_kg: pt.volume },
    weekly_target: ctx.prefs.weekly_workout_target,
    sessions: cur.map((s) => ({ date: fmt(s.started_at), title: s.title, minutes: Math.round(durationSec(s) / 60), exercises: s.workout_exercises.map((e) => e.exercise_name) })),
    personal_records_in_period: events.filter((e) => Date.parse(e.date) >= periodStart.getTime()).map((e) => `${e.exerciseName} ${PR_LABEL[e.kind]} ${e.previous}→${e.value}`),
    muscle_sets_this_week: Object.fromEntries(muscleStats(ctx.sessions, muscles.map((m) => m.id), ctx.now, ctx.tz).map((m) => [MUSCLE_NAME[m.muscleId], m.setsThisWeek])),
    next_recommended: rr ? { routine: rr.routine.name, reason: rr.reason, targets: routineTargets(ctx, rr.routine, rr.isDeload).map((x) => `${x.name}: ${x.rec.weight ?? "-"}kg ${x.rec.repsTarget}회 ${x.rec.sets}세트 (${x.rec.reason})`) } : "루틴 없음",
    today_planned: (ctx.plan.get(ctx.today) ?? []).map((p) => ctx.routines.find((r) => r.id === p.routineId)?.name),
  };
  const { json, tokens } = await generateJson({
    system: `너는 MyFit AI의 퍼스널 트레이너다. 한국어로 쓴다. 아래 제공된 수치만 사용하고, 없는 기록을 만들어 내지 않는다. 기록이 적거나 없으면 data_gaps에 적고 판단을 유보한다.${SAFETY_RULES}`,
    contents: [{ role: "user", parts: [{ text: `다음 데이터로 ${facts.report_type}를 작성하라.\n${JSON.stringify(facts)}` }] }],
    schema: insightSchema,
    maxOutputTokens: 2048,
  });
  const parsed = insightOut.safeParse(json);
  if (!parsed.success) throw new AIError("AI 리포트 형식이 올바르지 않습니다. 다시 시도해 주세요.", "invalid");
  return { content: { ...parsed.data, facts_period: facts.period }, tokens };
}
