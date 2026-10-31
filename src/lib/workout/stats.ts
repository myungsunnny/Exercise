import type { ExerciseType, SetType } from "@/lib/types";

export type StatSet = {
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  is_completed: boolean;
};
export type StatExercise = { exercise_type: ExerciseType; sets: StatSet[] };

// 운동량(kg) 계산 규칙
// - 완료한 세트만, 워밍업 세트는 제외
// - weight_reps / weighted_bodyweight: 중량 × 횟수 (맨몸+추가중량은 추가중량만 반영)
// - bodyweight_reps / assisted_bodyweight / duration / distance_duration: 운동량 0 (횟수·시간·거리로 따로 집계)
const VOLUME_TYPES: ExerciseType[] = ["weight_reps", "weighted_bodyweight"];

export function setVolume(type: ExerciseType, s: StatSet): number {
  if (!s.is_completed || s.set_type === "warmup" || !VOLUME_TYPES.includes(type)) return 0;
  return (s.weight_kg ?? 0) * (s.reps ?? 0);
}

export function summarize(exercises: StatExercise[]) {
  let volume = 0, sets = 0, reps = 0, duration = 0, distance = 0;
  for (const e of exercises)
    for (const s of e.sets) {
      if (!s.is_completed) continue;
      volume += setVolume(e.exercise_type, s);
      if (s.set_type !== "warmup") sets++;
      reps += s.reps ?? 0;
      duration += s.duration_seconds ?? 0;
      distance += s.distance_km ?? 0;
    }
  return { volume: Math.round(volume * 10) / 10, sets, reps, durationSeconds: duration, distanceKm: Math.round(distance * 1000) / 1000 };
}

// 루틴 예상 소요 시간(분): 세트당 수행 40초 + 세트 간 휴식, 종목 전환 1분
export function estimateRoutineMinutes(items: { target_sets: number; rest_seconds: number | null }[], defaultRest: number): number {
  let sec = 0;
  for (const it of items) {
    const rest = it.rest_seconds ?? defaultRest;
    sec += it.target_sets * 40 + Math.max(0, it.target_sets - 1) * rest + 60;
  }
  return Math.round(sec / 60);
}
