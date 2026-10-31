import { describe, expect, it } from "vitest";
import type { ASession } from "@/lib/analytics";
import { recommendNext, roundTo } from "@/lib/progression";

const EX = "bench";
const s = (date: string, sets: [number | null, number, number?][], type: ASession["workout_exercises"][0]["exercise_type"] = "weight_reps"): ASession => ({
  id: date, title: "", started_at: date, ended_at: date, paused_seconds: 0, routine_id: null,
  workout_exercises: [{
    exercise_id: EX, exercise_name: "벤치", exercise_type: type, muscles: [],
    workout_sets: sets.map(([w, r, rpe]) => ({ set_type: "normal", weight_kg: w, reps: r, duration_seconds: null, distance_km: null, is_completed: true, rpe: rpe ?? null, rir: null })),
  }],
});
const base = { exerciseId: EX, exerciseType: "weight_reps" as const, repMin: 8, repMax: 10, targetSets: 3, incrementKg: 2.5 };

describe("recommendNext", () => {
  it("suggests a small increase when all sets hit the top of the range at moderate effort", () => {
    const r = recommendNext([s("2026-10-20", [[60, 10, 8], [60, 10, 8], [60, 10, 8.5]])], base);
    expect(r).toMatchObject({ status: "increase", weight: 62.5, repsTarget: "8~10" });
  });
  it("does not increase when fewer sets than planned were done at the top weight", () => {
    expect(recommendNext([s("2026-10-20", [[60, 10], [60, 10]])], base).status).not.toBe("increase");
  });
  it("holds when the top is reached but effort was very high", () => {
    expect(recommendNext([s("2026-10-20", [[60, 10, 9.5], [60, 10, 10], [60, 10, 9.5]])], base).status).toBe("hold");
  });
  it("adds reps when inside the range", () => {
    expect(recommendNext([s("2026-10-20", [[60, 9], [60, 8], [60, 8]])], base)).toMatchObject({ status: "add_reps", weight: 60 });
  });
  it("holds once below min, decreases after two consecutive misses", () => {
    const once = [s("2026-10-20", [[60, 7], [60, 6], [60, 6]])];
    expect(recommendNext(once, base)).toMatchObject({ status: "hold", weight: 60 });
    const twice = [s("2026-10-13", [[60, 7], [60, 7]]), ...once];
    expect(recommendNext(twice, base)).toMatchObject({ status: "decrease", weight: 55 });
  });
  it("flags stalls when the best e1RM has not improved over 3 sessions", () => {
    const h = [s("2026-10-06", [[60, 9]]), s("2026-10-13", [[60, 9]]), s("2026-10-20", [[60, 8]])];
    expect(recommendNext(h, base).stalled).toBe(true);
  });
  it("reduces load on deload weeks", () => {
    expect(recommendNext([s("2026-10-20", [[100, 8], [100, 8], [100, 8]])], { ...base, isDeload: true })).toMatchObject({ status: "deload", weight: 85, sets: 2 });
  });
  it("reports no data instead of guessing", () => {
    expect(recommendNext([], base)).toMatchObject({ status: "new", weight: null, basedOn: null });
  });
  it("uses reps progression for bodyweight and decreasing assistance for assisted machines", () => {
    expect(recommendNext([s("2026-10-20", [[null, 10], [null, 10], [null, 10]], "bodyweight_reps")], { ...base, exerciseType: "bodyweight_reps" })).toMatchObject({ status: "add_reps", repsTarget: "11", weight: null });
    expect(recommendNext([s("2026-10-20", [[30, 10], [30, 10], [30, 10]], "assisted_bodyweight")], { ...base, exerciseType: "assisted_bodyweight" })).toMatchObject({ status: "increase", weight: 27.5 });
  });
  it("rounds to the increment", () => {
    expect(roundTo(54, 2.5)).toBe(55);
  });
});
