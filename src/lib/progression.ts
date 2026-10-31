// 점진적 과부하: 검증 가능한 규칙 기반 다음 운동 목표 계산(LLM 판단에 의존하지 않음)
import type { ASession } from "@/lib/analytics";
import { estimate1RM } from "@/lib/analytics";
import type { ExerciseType } from "@/lib/types";

export type ProgressionInput = {
  exerciseId: string;
  exerciseType: ExerciseType;
  repMin: number | null;
  repMax: number | null;
  targetSets: number;
  incrementKg: number;
  isDeload?: boolean;
};

export type Recommendation = {
  status: "new" | "increase" | "hold" | "add_reps" | "decrease" | "deload";
  weight: number | null;     // 추천 중량(kg). 맨몸 종목은 null
  repsTarget: string;        // "8~10" 또는 "10"
  sets: number;
  stalled: boolean;          // 최근 3회 추정 1RM/최다 반복이 늘지 않음
  reason: string;            // 사용자에게 보여줄 근거
  basedOn: { date: string; sets: { weight: number | null; reps: number | null; rpe: number | null; rir: number | null }[] } | null;
};

const WEIGHTED: ExerciseType[] = ["weight_reps", "weighted_bodyweight", "assisted_bodyweight"];

// 증가 단위의 배수로 반올림
export const roundTo = (v: number, step: number) => Math.round(v / step) * step;

type Perf = { date: string; sets: { weight: number | null; reps: number | null; rpe: number | null; rir: number | null }[] };

function recentPerformances(sessions: ASession[], exerciseId: string, n: number): Perf[] {
  return [...sessions]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((s) => ({
      date: s.started_at,
      sets: s.workout_exercises
        .filter((e) => e.exercise_id === exerciseId)
        .flatMap((e) => e.workout_sets)
        .filter((x) => x.is_completed && x.set_type !== "warmup")
        .map((x) => ({ weight: x.weight_kg, reps: x.reps, rpe: x.rpe ?? null, rir: x.rir ?? null })),
    }))
    .filter((p) => p.sets.length > 0)
    .slice(0, n);
}

// 세션의 대표 점수: 중량 종목은 최고 추정 1RM, 맨몸은 최다 반복
function score(p: Perf, weighted: boolean): number {
  if (!weighted) return Math.max(...p.sets.map((x) => x.reps ?? 0));
  return Math.max(0, ...p.sets.map((x) => estimate1RM(x.weight, x.reps) ?? 0));
}

// 힘든 정도: RPE 평균 또는 (10 - RIR) 평균. 둘 다 없으면 null
function effort(p: Perf): number | null {
  const v = p.sets.map((x) => (x.rpe != null ? x.rpe : x.rir != null ? 10 - x.rir : null)).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function recommendNext(sessions: ASession[], input: ProgressionInput): Recommendation {
  const weighted = WEIGHTED.includes(input.exerciseType);
  const assisted = input.exerciseType === "assisted_bodyweight";
  const perfs = recentPerformances(sessions, input.exerciseId, 3);
  const range = input.repMin != null && input.repMax != null ? `${input.repMin}~${input.repMax}` : input.repMin != null ? `${input.repMin}` : null;
  const last = perfs[0];

  if (!last) {
    return {
      status: "new", weight: null, repsTarget: range ?? "8~12", sets: input.targetSets, stalled: false, basedOn: null,
      reason: "이 종목의 완료 기록이 없어 추천 중량을 계산할 수 없습니다. 자세가 무너지지 않는 가벼운 중량으로 시작하세요.",
    };
  }

  const lastWeight = weighted ? Math.max(...last.sets.map((x) => x.weight ?? 0)) : null;
  const topSets = weighted ? last.sets.filter((x) => (x.weight ?? 0) === lastWeight) : last.sets;
  const minReps = Math.min(...topSets.map((x) => x.reps ?? 0));
  const repMin = input.repMin ?? minReps;
  const repMax = input.repMax ?? input.repMin ?? minReps;
  const eff = effort(last);
  const stalled = perfs.length >= 3 && score(perfs[0], weighted) <= score(perfs[2], weighted);
  const inc = input.incrementKg;
  // 보조 머신은 보조 중량을 줄이는 것이 진전
  const up = (w: number) => (assisted ? Math.max(0, w - inc) : w + inc);
  const down = (w: number) => (assisted ? w + inc : Math.max(0, roundTo(w * 0.9, inc)));
  const base = { sets: input.targetSets, stalled, basedOn: last };

  if (input.isDeload) {
    return {
      ...base, status: "deload", sets: Math.max(1, Math.round(input.targetSets * 0.6)), repsTarget: range ?? String(repMin),
      weight: lastWeight == null ? null : assisted ? lastWeight + inc : roundTo(lastWeight * 0.85, inc),
      reason: "계획된 가벼운 주입니다. 중량을 약 15% 낮추고 세트 수를 줄여 회복에 집중하세요.",
    };
  }

  // 목표 세트 수만큼 같은 최고 중량으로 수행했고 모두 상단 이상일 때만 증량
  const allHitTop = topSets.length >= input.targetSets && topSets.every((x) => (x.reps ?? 0) >= repMax);
  const anyBelowMin = topSets.some((x) => (x.reps ?? 0) < repMin);
  const effTxt = eff == null ? "" : ` (평균 강도 RPE ${eff.toFixed(1)})`;

  if (allHitTop && (eff == null || eff <= 8.5)) {
    return weighted
      ? { ...base, status: "increase", weight: up(lastWeight!), repsTarget: range ?? String(repMin),
          reason: `지난 운동에서 ${lastWeight}kg로 모든 본세트 ${repMax}회 이상 달성${effTxt}. ${inc}kg ${assisted ? "보조 감소" : "증량"}을 제안합니다.` }
      : { ...base, status: "add_reps", weight: null, repsTarget: String(repMax + 1),
          reason: `모든 세트에서 목표 상단(${repMax}회)을 달성했습니다${effTxt}. 반복을 1회 늘려 보세요.` };
  }
  if (allHitTop) {
    return { ...base, status: "hold", weight: lastWeight, repsTarget: range ?? String(repMax),
      reason: `목표 반복은 달성했지만 강도가 높았습니다${effTxt}. 같은 중량을 한 번 더 안정적으로 수행한 뒤 증량하세요.` };
  }
  if (anyBelowMin) {
    const prevBelow = perfs[1] && (weighted ? perfs[1].sets.filter((x) => (x.weight ?? 0) === lastWeight) : perfs[1].sets).some((x) => (x.reps ?? 0) < repMin);
    if (prevBelow && weighted) {
      return { ...base, status: "decrease", weight: down(lastWeight!), repsTarget: range ?? String(repMin),
        reason: `${lastWeight}kg에서 2회 연속 최소 목표(${repMin}회)에 못 미쳤습니다. 중량을 낮춰 목표 범위 안에서 수행하세요.` };
    }
    return { ...base, status: "hold", weight: lastWeight, repsTarget: range ?? String(repMin),
      reason: `일부 세트가 최소 목표(${repMin}회)에 못 미쳤습니다. 같은 ${weighted ? "중량" : "조건"}으로 목표 범위를 채워 보세요.` };
  }
  return { ...base, status: "add_reps", weight: lastWeight, repsTarget: range ?? String(minReps + 1),
    reason: `목표 범위 안에서 수행했습니다. 같은 ${weighted ? "중량" : "조건"}으로 세트당 1회씩 더 늘려 상단(${repMax}회)을 목표로 하세요.` };
}

export const STATUS_LABEL: Record<Recommendation["status"], string> = {
  new: "기록 없음", increase: "증량", hold: "유지", add_reps: "반복 늘리기", decrease: "감량", deload: "가벼운 주",
};
