import type { CompletedSession } from "@/lib/data";
import { summarize } from "@/lib/workout/stats";

export function sessionDurationSec(s: { started_at: string; ended_at: string | null; paused_seconds: number }) {
  if (!s.ended_at) return 0;
  return Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000) - s.paused_seconds);
}

export function sessionSummary(s: CompletedSession) {
  return summarize(s.workout_exercises.map((e) => ({ exercise_type: e.exercise_type, sets: e.workout_sets })));
}

// 근육별 완료 세트 수(워밍업 제외). 주동근 1세트, 보조근 0.5세트로 집계.
export function muscleSets(sessions: CompletedSession[]) {
  const out = new Map<string, number>();
  for (const s of sessions)
    for (const e of s.workout_exercises) {
      const n = e.workout_sets.filter((x) => x.is_completed && x.set_type !== "warmup").length;
      if (!n) continue;
      for (const m of e.muscles) out.set(m.muscle_id, (out.get(m.muscle_id) ?? 0) + (m.role === "primary" ? n : n / 2));
    }
  return out;
}
