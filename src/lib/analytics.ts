// 운동 기록 분석(순수 함수). 모든 값은 원본 세트에서 매번 계산한다.
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import type { ExerciseType, SetType } from "@/lib/types";
import { DEFAULT_TZ } from "@/lib/format";
import { setVolume } from "@/lib/workout/stats";

export type ASet = {
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  is_completed: boolean;
};
export type AExercise = {
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  muscles: { muscle_id: string; role: string }[];
  workout_sets: ASet[];
};
export type ASession = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  routine_id: string | null;
  workout_exercises: AExercise[];
};

const working = (s: ASet) => s.is_completed && s.set_type !== "warmup";

export function durationSec(s: Pick<ASession, "started_at" | "ended_at" | "paused_seconds">) {
  if (!s.ended_at) return 0;
  return Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000) - s.paused_seconds);
}

// ───────────────────────── 추정 1RM ─────────────────────────
// Epley 공식: 1RM = 중량 × (1 + 횟수 / 30). 1~12회 세트만 사용(고반복은 오차가 커서 제외), 1회는 중량 그대로.
export const ONE_RM_FORMULA = "Epley: 중량 × (1 + 횟수 ÷ 30), 1~12회 완료 본세트 기준";
export function estimate1RM(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps < 1 || reps > 12) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

const WEIGHTED: ExerciseType[] = ["weight_reps", "weighted_bodyweight"];

// ───────────────────────── 종목별 추이 ─────────────────────────
export type ExercisePoint = {
  sessionId: string;
  date: string;
  maxWeight: number | null;
  best1RM: number | null;
  bestSet: { weight: number | null; reps: number | null } | null;
  volume: number;
  maxReps: number | null;
  sets: number;
};

export function exerciseHistory(sessions: ASession[], exerciseId: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const sets = s.workout_exercises.filter((e) => e.exercise_id === exerciseId).flatMap((e) => e.workout_sets.map((x) => ({ x, type: e.exercise_type })));
    const done = sets.filter(({ x }) => working(x));
    if (!done.length) continue;
    let maxWeight: number | null = null, best1RM: number | null = null, maxReps: number | null = null;
    let bestSet: ExercisePoint["bestSet"] = null, volume = 0;
    for (const { x, type } of done) {
      volume += setVolume(type, x);
      if (x.reps != null && (maxReps == null || x.reps > maxReps)) maxReps = x.reps;
      if (!WEIGHTED.includes(type)) continue;
      if (x.weight_kg != null && (maxWeight == null || x.weight_kg > maxWeight)) maxWeight = x.weight_kg;
      const e = estimate1RM(x.weight_kg, x.reps);
      if (e != null && (best1RM == null || e > best1RM)) {
        best1RM = e;
        bestSet = { weight: x.weight_kg, reps: x.reps };
      }
    }
    out.push({ sessionId: s.id, date: s.started_at, maxWeight, best1RM, bestSet, volume: Math.round(volume * 10) / 10, maxReps, sets: done.length });
  }
  return out;
}

// ───────────────────────── 개인 최고 기록 ─────────────────────────
export type PRKind = "max_weight" | "best_1rm" | "max_reps" | "max_volume";
export const PR_LABEL: Record<PRKind, string> = {
  max_weight: "최고 중량",
  best_1rm: "추정 1RM",
  max_reps: "최다 반복",
  max_volume: "1회 최대 운동량",
};
export type PREvent = { exerciseId: string; exerciseName: string; kind: PRKind; value: number; previous: number; date: string; sessionId: string };
export type ExerciseBest = { exerciseId: string; exerciseName: string; type: ExerciseType; values: Partial<Record<PRKind, { value: number; date: string; sessionId: string }>>; lastDate: string; sessions: number };

// 시간순으로 훑으며 이전 최고치를 넘는 순간을 PR로 기록한다. 종목을 처음 수행한 세션은 비교 대상이 없어 PR에서 제외.
export function personalRecords(sessions: ASession[]): { best: ExerciseBest[]; events: PREvent[] } {
  const best = new Map<string, ExerciseBest>();
  const events: PREvent[] = [];
  const ids = new Set(sessions.flatMap((s) => s.workout_exercises.map((e) => e.exercise_id)));
  for (const id of ids) {
    const hist = exerciseHistory(sessions, id);
    if (!hist.length) continue;
    const ex = sessions.flatMap((s) => s.workout_exercises).find((e) => e.exercise_id === id)!;
    const name = sessions
      .filter((s) => hist.some((h) => h.sessionId === s.id))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
      .workout_exercises.find((e) => e.exercise_id === id)!.exercise_name;
    const b: ExerciseBest = { exerciseId: id, exerciseName: name, type: ex.exercise_type, values: {}, lastDate: hist[hist.length - 1].date, sessions: hist.length };
    const kinds: [PRKind, (p: ExercisePoint) => number | null][] = WEIGHTED.includes(ex.exercise_type)
      ? [["max_weight", (p) => p.maxWeight], ["best_1rm", (p) => p.best1RM], ["max_volume", (p) => p.volume || null]]
      : [["max_reps", (p) => p.maxReps]];
    hist.forEach((p, i) => {
      for (const [kind, get] of kinds) {
        const v = get(p);
        if (v == null) continue;
        const prev = b.values[kind];
        if (!prev || v > prev.value) {
          if (prev && i > 0) events.push({ exerciseId: id, exerciseName: name, kind, value: v, previous: prev.value, date: p.date, sessionId: p.sessionId });
          b.values[kind] = { value: v, date: p.date, sessionId: p.sessionId };
        }
      }
    });
    best.set(id, b);
  }
  return {
    best: [...best.values()].sort((a, b) => b.sessions - a.sessions || a.exerciseName.localeCompare(b.exerciseName)),
    events: events.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

// ───────────────────────── 기간별 집계 ─────────────────────────
export type Granularity = "day" | "week" | "month" | "year";
export type Bucket = { key: string; label: string; start: Date; sessions: number; volume: number; sets: number; reps: number; durationSec: number };

function bucketStart(d: Date, g: Granularity, tz: string): Date {
  const z = new TZDate(d, tz);
  const s = g === "day" ? new TZDate(z.getFullYear(), z.getMonth(), z.getDate(), tz)
    : g === "week" ? startOfWeek(z, { weekStartsOn: 1 })
    : g === "month" ? startOfMonth(z)
    : startOfYear(z);
  return new Date(s.getTime());
}

const LABEL: Record<Granularity, string> = { day: "M/d", week: "M/d주", month: "yy.M", year: "yyyy" };

function nextBucket(d: Date, g: Granularity, tz: string): Date {
  const z = new TZDate(d, tz);
  const n = g === "day" ? addDays(z, 1)
    : g === "week" ? addDays(z, 7)
    : g === "month" ? new TZDate(z.getFullYear(), z.getMonth() + 1, 1, tz)
    : new TZDate(z.getFullYear() + 1, 0, 1, tz);
  return new Date(n.getTime());
}

export function totals(sessions: ASession[]) {
  let volume = 0, sets = 0, reps = 0, duration = 0;
  for (const s of sessions) {
    duration += durationSec(s);
    for (const e of s.workout_exercises)
      for (const x of e.workout_sets) {
        if (!working(x)) continue;
        sets++;
        reps += x.reps ?? 0;
        volume += setVolume(e.exercise_type, x);
      }
  }
  return { sessions: sessions.length, volume: Math.round(volume * 10) / 10, sets, reps, durationSec: duration };
}

// from~to 범위의 빈 구간까지 포함한 시계열
export function bucketize(sessions: ASession[], g: Granularity, from: Date, to: Date, tz = DEFAULT_TZ): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<number, Bucket>();
  for (let d = bucketStart(from, g, tz); d <= to && buckets.length < 400; d = nextBucket(d, g, tz)) {
    const b: Bucket = { key: d.toISOString(), label: format(new TZDate(d, tz), LABEL[g]), start: d, sessions: 0, volume: 0, sets: 0, reps: 0, durationSec: 0 };
    buckets.push(b);
    index.set(d.getTime(), b);
  }
  for (const s of sessions) {
    const b = index.get(bucketStart(new Date(s.started_at), g, tz).getTime());
    if (!b) continue;
    const t = totals([s]);
    b.sessions++;
    b.volume = Math.round((b.volume + t.volume) * 10) / 10;
    b.sets += t.sets;
    b.reps += t.reps;
    b.durationSec += t.durationSec;
  }
  return buckets;
}

// ───────────────────────── 근육별 ─────────────────────────
export type MuscleStat = { muscleId: string; setsThisWeek: number; setsLastWeek: number; lastTrained: string | null; sessions28d: number; hoursSince: number | null };

// 주동근 1세트, 보조근 0.5세트
export function muscleStats(sessions: ASession[], muscleIds: string[], now: Date, tz = DEFAULT_TZ): MuscleStat[] {
  const weekStart = bucketStart(now, "week", tz).getTime();
  const lastWeekStart = weekStart - 7 * 86400_000;
  const since28 = now.getTime() - 28 * 86400_000;
  const stats = new Map(muscleIds.map((id) => [id, { muscleId: id, setsThisWeek: 0, setsLastWeek: 0, lastTrained: null as string | null, sessions28d: 0, hoursSince: null as number | null }]));
  for (const s of sessions) {
    const t = Date.parse(s.started_at);
    const touched = new Set<string>();
    for (const e of s.workout_exercises) {
      const n = e.workout_sets.filter(working).length;
      if (!n) continue;
      for (const m of e.muscles) {
        const st = stats.get(m.muscle_id);
        if (!st) continue;
        const w = m.role === "primary" ? n : n / 2;
        if (t >= weekStart) st.setsThisWeek += w;
        else if (t >= lastWeekStart) st.setsLastWeek += w;
        if (m.role === "primary") touched.add(m.muscle_id);
        if (!st.lastTrained || s.started_at > st.lastTrained) st.lastTrained = s.started_at;
      }
    }
    if (t >= since28) for (const id of touched) stats.get(id)!.sessions28d++;
  }
  for (const st of stats.values()) if (st.lastTrained) st.hoursSince = Math.max(0, Math.round((now.getTime() - Date.parse(st.lastTrained)) / 3600_000));
  return [...stats.values()];
}

// 회복 참고 정보: 측정값이 아닌 마지막 훈련 경과 시간 기반 안내
export function recoveryHint(hoursSince: number | null): { label: string; tone: "fresh" | "recent" | "none" } {
  if (hoursSince == null) return { label: "기록 없음", tone: "none" };
  if (hoursSince < 48) return { label: `${hoursSince}시간 전 훈련 · 회복 중일 수 있음`, tone: "recent" };
  return { label: `${Math.floor(hoursSince / 24)}일 전 훈련`, tone: "fresh" };
}

// ───────────────────────── 배지 ─────────────────────────
export type Badge = { key: string; label: string; description: string; earned: boolean; progress?: string };

// 꾸준함·기록 향상 중심. 하루 운동량이나 연속 일수처럼 과훈련을 부추기는 배지는 두지 않는다.
export function badges(sessions: ASession[], streakWeeks: number, prCount: number, goalsAchieved: number): Badge[] {
  const n = sessions.length;
  const count = (k: number, label: string): Badge => ({ key: `sessions-${k}`, label, description: `운동 ${k}회 완료`, earned: n >= k, progress: `${Math.min(n, k)}/${k}` });
  return [
    count(1, "첫 운동"),
    count(10, "꾸준한 시작"),
    count(50, "습관 형성"),
    count(100, "백 번의 운동"),
    { key: "streak-4", label: "한 달 꾸준히", description: "4주 연속 주 1회 이상 운동", earned: streakWeeks >= 4, progress: `${Math.min(streakWeeks, 4)}/4주` },
    { key: "streak-12", label: "한 분기 꾸준히", description: "12주 연속 주 1회 이상 운동", earned: streakWeeks >= 12, progress: `${Math.min(streakWeeks, 12)}/12주` },
    { key: "pr-1", label: "첫 개인 기록", description: "개인 최고 기록 1회 경신", earned: prCount >= 1 },
    { key: "pr-10", label: "성장 중", description: "개인 최고 기록 10회 경신", earned: prCount >= 10, progress: `${Math.min(prCount, 10)}/10` },
    { key: "goal-1", label: "목표 달성", description: "설정한 목표 1개 달성", earned: goalsAchieved >= 1 },
  ];
}
