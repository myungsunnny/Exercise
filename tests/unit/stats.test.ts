import { describe, expect, it } from "vitest";
import { formatClock, weekRange, weekStreak } from "@/lib/format";
import { filterExercises } from "@/lib/exercise-filter";
import { restRemaining } from "@/components/workout/use-rest-timer";
import { estimateRoutineMinutes, summarize } from "@/lib/workout/stats";
import type { Exercise } from "@/lib/types";

const set = (o: Partial<Parameters<typeof summarize>[0][0]["sets"][0]>) => ({
  set_type: "normal" as const, weight_kg: null, reps: null, duration_seconds: null, distance_km: null, is_completed: true, ...o,
});

describe("summarize", () => {
  it("counts only completed non-warmup weight × reps as volume", () => {
    const r = summarize([
      { exercise_type: "weight_reps", sets: [set({ weight_kg: 60, reps: 10 }), set({ weight_kg: 40, reps: 10, set_type: "warmup" }), set({ weight_kg: 60, reps: 8, is_completed: false })] },
      { exercise_type: "bodyweight_reps", sets: [set({ reps: 15 })] },
      { exercise_type: "distance_duration", sets: [set({ distance_km: 2.5, duration_seconds: 900 })] },
    ]);
    expect(r).toEqual({ volume: 600, sets: 3, reps: 35, durationSeconds: 900, distanceKm: 2.5 });
  });

  it("recomputes when a set changes or is removed", () => {
    const a = summarize([{ exercise_type: "weight_reps", sets: [set({ weight_kg: 100, reps: 5 }), set({ weight_kg: 100, reps: 5 })] }]);
    const b = summarize([{ exercise_type: "weight_reps", sets: [set({ weight_kg: 105, reps: 5 })] }]);
    expect(a.volume).toBe(1000);
    expect(b.volume).toBe(525);
  });
});

describe("routine estimate", () => {
  it("uses per-item rest or default", () => {
    // 3세트: 3×40 + 2×90 + 60 = 360초 = 6분
    expect(estimateRoutineMinutes([{ target_sets: 3, rest_seconds: null }], 90)).toBe(6);
    expect(estimateRoutineMinutes([{ target_sets: 3, rest_seconds: 30 }], 90)).toBe(4);
  });
});

describe("time helpers", () => {
  it("formats clock", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("computes the KST week (Mon–Sun) even when UTC is still the previous day", () => {
    // 2026-11-02(월) 08:00 KST = 2026-11-01(일) 23:00 UTC
    const { start, end } = weekRange(new Date("2026-11-01T23:00:00Z"), "Asia/Seoul");
    expect(start.toISOString()).toBe("2026-11-01T15:00:00.000Z"); // 11/2 00:00 KST
    expect(end.toISOString()).toBe("2026-11-08T14:59:59.999Z");
  });

  it("counts consecutive training weeks", () => {
    const now = new Date("2026-10-30T12:00:00+09:00"); // 금
    const starts = ["2026-10-27T10:00:00+09:00", "2026-10-21T10:00:00+09:00", "2026-10-13T10:00:00+09:00", "2026-09-20T10:00:00+09:00"];
    expect(weekStreak(starts, now)).toBe(3);
    expect(weekStreak(starts.slice(1), now)).toBe(2); // 이번 주 미운동이면 지난주부터
    expect(weekStreak([], now)).toBe(0);
  });

  it("rest timer remaining is based on the end timestamp (background-safe)", () => {
    const rest = { endsAt: 100_000, total: 90, label: "" };
    expect(restRemaining(rest, 10_000)).toBe(90);
    expect(restRemaining(rest, 99_001)).toBe(1);
    expect(restRemaining(rest, 500_000)).toBe(0); // 백그라운드에서 오래 지나도 음수 없음
    expect(restRemaining(null, 0)).toBe(0);
  });
});

describe("exercise filter", () => {
  const ex = (o: Partial<Exercise>): Exercise => ({
    id: crypto.randomUUID(), owner_id: null, name_ko: "", name_en: null, exercise_type: "weight_reps", equipment: "barbell",
    difficulty: "beginner", instructions: null, cautions: null, media_url: null, archived_at: null, exercise_muscles: [], ...o,
  });
  const list = [
    ex({ name_ko: "바벨 벤치프레스", name_en: "Barbell Bench Press", exercise_muscles: [{ muscle_id: "chest", role: "primary" }, { muscle_id: "triceps", role: "secondary" }] }),
    ex({ name_ko: "트라이셉스 푸시다운", equipment: "cable", exercise_muscles: [{ muscle_id: "triceps", role: "primary" }] }),
  ];
  it("matches Korean/English ignoring spaces and filters by primary muscle", () => {
    expect(filterExercises(list, { q: "벤치 프레스" })).toHaveLength(1);
    expect(filterExercises(list, { q: "bench" })).toHaveLength(1);
    expect(filterExercises(list, { muscle: "triceps" }).map((e) => e.name_ko)).toEqual(["트라이셉스 푸시다운"]);
    expect(filterExercises(list, { equipment: "cable" })).toHaveLength(1);
    expect(filterExercises(list, { favorites: new Set([list[0].id]) })).toHaveLength(1);
  });
});
