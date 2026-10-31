import "server-only";
import { addDays, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { bucketize, durationSec, exerciseHistory, muscleStats, ONE_RM_FORMULA, personalRecords, PR_LABEL, recoveryHint, totals } from "@/lib/analytics";
import { getMuscles, getRecentFeedback } from "@/lib/data";
import { MUSCLE_NAME } from "@/lib/exercise-filter";
import { formatDate, weekStreak } from "@/lib/format";
import { goalProgress, GOAL_KIND_LABEL, GOAL_UNIT } from "@/lib/goals";
import { recommendNext, STATUS_LABEL } from "@/lib/progression";
import { DEFAULT_MUSCLE_SET_TARGET, EQUIPMENT_LABEL } from "@/lib/types";
import { findExercise, incrementFor, recommendedRoutine, routineTargets, type Ctx } from "./context";
import type { FunctionDecl } from "./gemini";

const PERIODS = ["this_week", "last_week", "last_4_weeks", "this_month", "last_month", "last_3_months", "last_12_months", "all"] as const;
type Period = (typeof PERIODS)[number];

const periodSchema = { type: "STRING" as const, enum: [...PERIODS], description: "조회 기간. this_week=이번 주(월요일 시작), last_week=지난주, last_4_weeks=최근 4주, this_month=이번 달, last_month=지난달, last_3_months=최근 3개월, last_12_months=최근 12개월, all=전체" };

export const TOOL_DECLS: FunctionDecl[] = [
  { name: "get_user_context", description: "사용자의 운동 목표, 경력, 운동 가능 요일·시간, 사용 가능한 기구, 제한사항, 주간 목표, 설정된 목표와 진행률, 저장된 루틴, 향후 7일 운동 일정을 조회한다." },
  { name: "get_training_summary", description: "기간별 운동 횟수·시간·세트·반복·운동량, 주별 추이, 근육별 세트, 세션 목록을 조회한다.", parameters: { type: "OBJECT", properties: { period: periodSchema }, required: ["period"] } },
  {
    name: "get_exercise_progress",
    description: "특정 운동 종목의 기간 내 세션별 최고 중량·추정 1RM·최고 세트·운동량·최다 반복과 역대 최고 기록을 조회한다. 기간 비교 질문(예: 지난달 대비 벤치프레스 증가량)에 사용한다.",
    parameters: { type: "OBJECT", properties: { exercise: { type: "STRING", description: "운동 이름(한국어 또는 영어)" }, period: periodSchema }, required: ["exercise"] },
  },
  { name: "get_personal_records", description: "종목별 역대 최고 기록(최고 중량, 추정 1RM, 최다 반복, 1회 최대 운동량)과 최근 기록 경신 내역을 조회한다." },
  { name: "get_muscle_balance", description: "근육 부위별 이번 주·지난주 세트 수, 주간 목표 세트, 최근 4주 훈련 빈도, 마지막 훈련 시점을 조회한다. 부위별 균형·빈도 분석에 사용한다." },
  {
    name: "get_next_targets",
    description: "규칙 기반 점진적 과부하 엔진으로 다음 운동의 추천 중량·반복·세트와 근거, 정체 여부를 계산한다. exercise를 비우면 오늘 추천 루틴 전체를 계산한다. 중량·반복 추천은 반드시 이 결과를 사용한다.",
    parameters: { type: "OBJECT", properties: { exercise: { type: "STRING", description: "운동 이름(선택)" } } },
  },
  {
    name: "get_alternatives",
    description: "특정 운동과 주요 근육이 같은 대체 운동 목록을 조회한다. 사용자가 보유한 기구가 설정돼 있으면 그 기구로 할 수 있는 운동을 우선한다.",
    parameters: { type: "OBJECT", properties: { exercise: { type: "STRING", description: "교체하려는 운동 이름" } }, required: ["exercise"] },
  },
  { name: "get_recent_feedback", description: "최근 운동 후 사용자가 입력한 피로도(1~5)·에너지(1~5)·통증 여부·메모를 조회한다." },
];

function rangeOf(ctx: Ctx, p: Period): { from: Date; to: Date; label: string } {
  const z = new TZDate(ctx.now, ctx.tz);
  const wk = startOfWeek(z, { weekStartsOn: 1 });
  const d = (x: Date) => new Date(x.getTime());
  switch (p) {
    case "this_week": return { from: d(wk), to: ctx.now, label: "이번 주" };
    case "last_week": return { from: d(addDays(wk, -7)), to: new Date(wk.getTime() - 1), label: "지난주" };
    case "last_4_weeks": return { from: d(addDays(wk, -21)), to: ctx.now, label: "최근 4주" };
    case "this_month": return { from: d(startOfMonth(z)), to: ctx.now, label: "이번 달" };
    case "last_month": return { from: d(startOfMonth(subMonths(z, 1))), to: new Date(startOfMonth(z).getTime() - 1), label: "지난달" };
    case "last_3_months": return { from: d(subMonths(z, 3)), to: ctx.now, label: "최근 3개월" };
    case "last_12_months": return { from: d(subMonths(z, 12)), to: ctx.now, label: "최근 12개월" };
    default: return { from: new Date(0), to: ctx.now, label: "전체 기간" };
  }
}

const inRange = (iso: string, r: { from: Date; to: Date }) => { const t = Date.parse(iso); return t >= r.from.getTime() && t <= r.to.getTime(); };
const day = (ctx: Ctx, iso: string) => formatDate(iso, "yyyy-MM-dd", ctx.tz);

export type ToolResult = { result: Record<string, unknown>; summary: string };

export async function runTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const period = (PERIODS as readonly string[]).includes(String(args.period)) ? (args.period as Period) : "last_4_weeks";
  switch (name) {
    case "get_user_context": {
      const p = ctx.profile;
      const weekStart = rangeOf(ctx, "this_week");
      const week = ctx.sessions.filter((s) => inRange(s.started_at, weekStart));
      const { best } = personalRecords(ctx.sessions);
      const streak = weekStreak(ctx.sessions.map((s) => s.started_at), ctx.now, ctx.tz);
      const gctx = { weekSessions: week.length, weekMinutes: Math.round(week.reduce((a, s) => a + durationSec(s), 0) / 60), streak, best, bodyWeight: null };
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      return {
        summary: "사용자 프로필·목표·루틴·일정",
        result: {
          today: ctx.today,
          profile: {
            training_goal: p.training_goal ?? "미설정", experience_level: p.experience_level ?? "미설정",
            available_days: p.available_days.map((d) => days[d]), session_minutes: p.session_minutes,
            equipment: p.equipment.length ? p.equipment.map((e) => EQUIPMENT_LABEL[e as keyof typeof EQUIPMENT_LABEL] ?? e) : "미설정(모든 기구 가능으로 간주하지 말고 확인 필요)",
            constraints_and_preferences: p.constraints_note ?? "없음",
          },
          preferences: { weekly_workout_target: ctx.prefs.weekly_workout_target, default_rest_seconds: ctx.prefs.default_rest_seconds, weight_increment_kg: ctx.prefs.weight_increment_kg },
          total_completed_sessions: ctx.sessions.length,
          first_session: ctx.sessions.length ? day(ctx, ctx.sessions[ctx.sessions.length - 1].started_at) : null,
          goals: ctx.goals.map((g) => { const pr = goalProgress(g, gctx); return { goal: GOAL_KIND_LABEL[g.kind] + (g.exercises ? ` (${g.exercises.name_ko})` : ""), target: `${g.target_value}${GOAL_UNIT[g.kind]}`, current: pr.current, progress_pct: pr.pct, achieved: pr.achieved, deadline: g.deadline }; }),
          routines: ctx.routines.map((r) => ({ name: r.name, weekdays: r.weekdays.map((d) => days[d]), exercises: r.routine_exercises.map((x) => `${x.exercises?.name_ko} ${x.target_sets}세트 ${x.rep_min ?? "?"}~${x.rep_max ?? "?"}회${x.target_weight_kg ? ` ${x.target_weight_kg}kg` : ""}`) })),
          next_7_days_plan: [...ctx.plan].map(([d, items]) => ({ date: d, routines: items.map((i) => (ctx.routines.find((r) => r.id === i.routineId)?.name ?? "?") + (i.isDeload ? "(가벼운 주)" : "")) })),
        },
      };
    }
    case "get_training_summary": {
      const r = rangeOf(ctx, period);
      const list = ctx.sessions.filter((s) => inRange(s.started_at, r));
      if (!list.length) return { summary: `운동 요약(${r.label}): 기록 없음`, result: { period: r.label, data_available: false, message: "이 기간에 완료한 운동 기록이 없습니다." } };
      const muscles = await getMuscles();
      const ms = muscleStats(list, muscles.map((m) => m.id), ctx.now, ctx.tz);
      const perMuscle: Record<string, number> = {};
      for (const s of list) for (const e of s.workout_exercises) {
        const n = e.workout_sets.filter((x) => x.is_completed && x.set_type !== "warmup").length;
        for (const m of e.muscles) perMuscle[MUSCLE_NAME[m.muscle_id] ?? m.muscle_id] = (perMuscle[MUSCLE_NAME[m.muscle_id] ?? m.muscle_id] ?? 0) + (m.role === "primary" ? n : n / 2);
      }
      const from = period === "all" ? new Date(list[list.length - 1].started_at) : r.from;
      const t = totals(list);
      return {
        summary: `운동 요약(${r.label}): ${t.sessions}회`,
        result: {
          period: r.label, from: day(ctx, from.toISOString()), to: day(ctx, r.to.toISOString()), data_available: true,
          totals: { sessions: t.sessions, minutes: Math.round(t.durationSec / 60), working_sets: t.sets, reps: t.reps, volume_kg: t.volume },
          weekly: bucketize(list, "week", from, r.to, ctx.tz).map((b) => ({ week_of: b.label, sessions: b.sessions, volume_kg: b.volume, sets: b.sets })),
          sets_per_muscle: perMuscle,
          muscles_not_trained: ms.filter((m) => !perMuscle[MUSCLE_NAME[m.muscleId]]).map((m) => MUSCLE_NAME[m.muscleId]),
          sessions: list.slice(0, 30).map((s) => ({ date: day(ctx, s.started_at), title: s.title, exercises: s.workout_exercises.map((e) => e.exercise_name), minutes: Math.round(durationSec(s) / 60) })),
          notes: "운동량=완료 본세트의 중량×횟수 합(워밍업·맨몸·유산소 제외). 근육별 세트는 주동근 1, 보조근 0.5.",
        },
      };
    }
    case "get_exercise_progress": {
      const f = findExercise(ctx, String(args.exercise ?? ""));
      if (!f.match) return { summary: `종목 추이: "${args.exercise}" 찾지 못함`, result: { data_available: false, message: "해당 이름의 운동을 찾지 못했습니다.", similar: f.candidates } };
      const r = rangeOf(ctx, args.period ? period : "all");
      const allHist = exerciseHistory(ctx.sessions, f.match.id);
      const hist = allHist.filter((h) => inRange(h.date, r));
      const { best } = personalRecords(ctx.sessions);
      const b = best.find((x) => x.exerciseId === f.match!.id);
      return {
        summary: `종목 추이: ${f.match.name}(${r.label}) ${hist.length}회`,
        result: {
          exercise: f.match.name, period: r.label, data_available: hist.length > 0,
          ...(hist.length === 0 ? { message: allHist.length ? `이 기간에는 기록이 없습니다. 전체 기록 ${allHist.length}회, 마지막 ${day(ctx, allHist[allHist.length - 1].date)}.` : "이 종목의 완료 기록이 없습니다." } : {}),
          sessions: hist.map((h) => ({ date: day(ctx, h.date), max_weight_kg: h.maxWeight, est_1rm_kg: h.best1RM, best_set: h.bestSet ? `${h.bestSet.weight}kg×${h.bestSet.reps}` : null, max_reps: h.maxReps, volume_kg: h.volume, working_sets: h.sets })),
          all_time_best: b ? Object.fromEntries(Object.entries(b.values).map(([k, v]) => [PR_LABEL[k as keyof typeof PR_LABEL], { value: v!.value, date: day(ctx, v!.date) }])) : null,
          one_rm_note: `추정 1RM은 측정값이 아닌 추정치. ${ONE_RM_FORMULA}`,
          other_matches: f.candidates,
        },
      };
    }
    case "get_personal_records": {
      const { best, events } = personalRecords(ctx.sessions);
      if (!best.length) return { summary: "개인 기록: 기록 없음", result: { data_available: false } };
      return {
        summary: `개인 기록: ${best.length}종목`,
        result: {
          data_available: true,
          best: best.slice(0, 25).map((b) => ({ exercise: b.exerciseName, sessions: b.sessions, last: day(ctx, b.lastDate), ...Object.fromEntries(Object.entries(b.values).map(([k, v]) => [PR_LABEL[k as keyof typeof PR_LABEL], `${v!.value} (${day(ctx, v!.date)})`])) })),
          recent_prs: events.slice(0, 10).map((e) => ({ date: day(ctx, e.date), exercise: e.exerciseName, kind: PR_LABEL[e.kind], from: e.previous, to: e.value })),
          one_rm_note: ONE_RM_FORMULA,
        },
      };
    }
    case "get_muscle_balance": {
      const muscles = await getMuscles();
      const st = muscleStats(ctx.sessions, muscles.map((m) => m.id), ctx.now, ctx.tz);
      return {
        summary: "근육별 훈련 균형",
        result: {
          data_available: ctx.sessions.length > 0,
          muscles: st.map((m) => ({
            muscle: MUSCLE_NAME[m.muscleId], sets_this_week: m.setsThisWeek, sets_last_week: m.setsLastWeek,
            weekly_target_sets: ctx.prefs.muscle_set_targets[m.muscleId] ?? DEFAULT_MUSCLE_SET_TARGET,
            sessions_last_28_days: m.sessions28d, last_trained: m.lastTrained ? day(ctx, m.lastTrained) : null, recovery_note: recoveryHint(m.hoursSince).label,
          })),
          note: "회복 정보는 측정값이 아닌 마지막 훈련 시점 기반 참고. 주동근 1세트, 보조근 0.5세트.",
        },
      };
    }
    case "get_next_targets": {
      if (args.exercise) {
        const f = findExercise(ctx, String(args.exercise));
        if (!f.match) return { summary: `다음 목표: "${args.exercise}" 찾지 못함`, result: { data_available: false, similar: f.candidates } };
        const item = ctx.routines.flatMap((r) => r.routine_exercises).find((x) => x.exercise_id === f.match!.id);
        const lastEx = ctx.sessions.flatMap((s) => s.workout_exercises).find((e) => e.exercise_id === f.match!.id);
        const rec = recommendNext(ctx.sessions, {
          exerciseId: f.match.id, exerciseType: f.match.type, repMin: item?.rep_min ?? null, repMax: item?.rep_max ?? null,
          targetSets: item?.target_sets ?? Math.max(1, lastEx?.workout_sets.filter((x) => x.is_completed && x.set_type !== "warmup").length ?? 3), incrementKg: incrementFor(ctx, f.match.id),
        });
        return { summary: `다음 목표: ${f.match.name} ${STATUS_LABEL[rec.status]}`, result: { exercise: f.match.name, rep_range_source: item ? "루틴 설정" : "지난 기록", ...recOut(ctx, rec) } };
      }
      const rr = recommendedRoutine(ctx);
      if (!rr) return { summary: "다음 목표: 루틴 없음", result: { data_available: false, message: "저장된 루틴이 없어 추천할 수 없습니다." } };
      return {
        summary: `다음 목표: ${rr.routine.name}`,
        result: { routine: rr.routine.name, reason: rr.reason, deload_week: rr.isDeload, exercises: routineTargets(ctx, rr.routine, rr.isDeload).map((t) => ({ exercise: t.name, ...recOut(ctx, t.rec) })) },
      };
    }
    case "get_alternatives": {
      const f = findExercise(ctx, String(args.exercise ?? ""));
      const ex = f.match && ctx.exercises.find((e) => e.id === f.match!.id);
      if (!ex) return { summary: `대체 운동: "${args.exercise}" 찾지 못함`, result: { data_available: false, similar: f.candidates } };
      const prim = new Set(ex.exercise_muscles.filter((m) => m.role === "primary").map((m) => m.muscle_id));
      const owned = new Set(ctx.profile.equipment);
      const alts = ctx.exercises
        .filter((e) => e.id !== ex.id && e.exercise_muscles.some((m) => m.role === "primary" && prim.has(m.muscle_id)))
        .map((e) => ({ name: e.name_ko, equipment: EQUIPMENT_LABEL[e.equipment], available_with_my_equipment: owned.size ? owned.has(e.equipment) || e.equipment === "bodyweight" : null, difficulty: e.difficulty, primary: e.exercise_muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_NAME[m.muscle_id]) }))
        .sort((a, b) => Number(b.available_with_my_equipment) - Number(a.available_with_my_equipment))
        .slice(0, 12);
      return { summary: `대체 운동: ${ex.name_ko} ${alts.length}개`, result: { exercise: ex.name_ko, primary_muscles: [...prim].map((m) => MUSCLE_NAME[m]), equipment_profile_set: owned.size > 0, alternatives: alts } };
    }
    case "get_recent_feedback": {
      const fb = await getRecentFeedback(10);
      return {
        summary: `운동 후 피드백 ${fb.length}건`,
        result: fb.length
          ? { data_available: true, feedback: fb.map((f) => ({ date: f.workout_sessions ? day(ctx, f.workout_sessions.started_at) : null, workout: f.workout_sessions?.title, fatigue_1to5: f.fatigue, energy_1to5: f.energy, pain: f.pain, notes: f.notes })) }
          : { data_available: false, message: "입력된 운동 후 피드백이 없습니다." },
      };
    }
    default:
      return { summary: `알 수 없는 도구 ${name}`, result: { error: "unknown tool" } };
  }
}

function recOut(ctx: Ctx, rec: ReturnType<typeof recommendNext>) {
  return {
    status: STATUS_LABEL[rec.status], recommended_weight_kg: rec.weight, reps_target: rec.repsTarget, sets: rec.sets, stalled: rec.stalled, reason: rec.reason,
    based_on: rec.basedOn ? { date: day(ctx, rec.basedOn.date), sets: rec.basedOn.sets.map((x) => `${x.weight ?? "맨몸"}${x.weight != null ? "kg" : ""}×${x.reps}${x.rpe ? ` @RPE${x.rpe}` : ""}`) } : null,
  };
}
