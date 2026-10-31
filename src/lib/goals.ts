import type { ExerciseBest } from "@/lib/analytics";
import type { Goal } from "@/lib/data";

export const GOAL_KIND_LABEL: Record<Goal["kind"], string> = {
  weekly_count: "주간 운동 횟수",
  weekly_minutes: "주간 운동 시간",
  exercise_weight: "운동 목표 중량",
  exercise_reps: "운동 목표 반복",
  body_weight: "체중 목표",
  streak_weeks: "연속 운동 주",
};
export const GOAL_UNIT: Record<Goal["kind"], string> = {
  weekly_count: "회", weekly_minutes: "분", exercise_weight: "kg", exercise_reps: "회", body_weight: "kg", streak_weeks: "주",
};

export type GoalProgress = { current: number | null; pct: number; achieved: boolean; note?: string };

// 진행률 계산. 체중 목표는 신체 기록(Phase 4)이 생기기 전에는 계산하지 않는다.
export function goalProgress(g: Goal, ctx: { weekSessions: number; weekMinutes: number; streak: number; best: ExerciseBest[]; bodyWeight?: number | null }): GoalProgress {
  const pct = (cur: number, start = 0) => Math.max(0, Math.min(100, Math.round(((cur - start) / (g.target_value - start || 1)) * 100)));
  const done = (cur: number) => ({ current: cur, pct: pct(cur, g.start_value ?? 0), achieved: cur >= g.target_value });
  switch (g.kind) {
    case "weekly_count": return { ...done(ctx.weekSessions), pct: pct(ctx.weekSessions) };
    case "weekly_minutes": return { ...done(ctx.weekMinutes), pct: pct(ctx.weekMinutes) };
    case "streak_weeks": return { ...done(ctx.streak), pct: pct(ctx.streak) };
    case "exercise_weight": {
      const b = ctx.best.find((x) => x.exerciseId === g.exercise_id)?.values.max_weight?.value;
      return b == null ? { current: null, pct: 0, achieved: false, note: "아직 기록 없음" } : done(b);
    }
    case "exercise_reps": {
      const v = ctx.best.find((x) => x.exerciseId === g.exercise_id)?.values;
      const b = v?.max_reps?.value ?? null;
      return b == null ? { current: null, pct: 0, achieved: false, note: "맨몸 종목의 한 세트 최다 반복 기준" } : done(b);
    }
    case "body_weight": {
      if (ctx.bodyWeight == null) return { current: null, pct: 0, achieved: false, note: "신체 변화 메뉴에서 체중을 기록하면 계산됩니다" };
      const start = g.start_value ?? ctx.bodyWeight;
      const losing = g.target_value < start;
      const p = start === g.target_value ? 100 : Math.max(0, Math.min(100, Math.round(((start - ctx.bodyWeight) / (start - g.target_value)) * 100)));
      return { current: ctx.bodyWeight, pct: p, achieved: losing ? ctx.bodyWeight <= g.target_value : ctx.bodyWeight >= g.target_value };
    }
  }
}
