import { describe, expect, it } from "vitest";
import { badges, bucketize, estimate1RM, exerciseHistory, muscleStats, personalRecords, recoveryHint, totals, type ASession } from "@/lib/analytics";

const BENCH = "bench", PUSHUP = "pushup";
const set = (w: number | null, r: number | null, o: Partial<ASession["workout_exercises"][0]["workout_sets"][0]> = {}) => ({
  set_type: "normal" as const, weight_kg: w, reps: r, duration_seconds: null, distance_km: null, is_completed: true, ...o,
});
function session(id: string, date: string, benchSets: ReturnType<typeof set>[], pushups?: number): ASession {
  const ex: ASession["workout_exercises"] = [
    { exercise_id: BENCH, exercise_name: "벤치프레스", exercise_type: "weight_reps", muscles: [{ muscle_id: "chest", role: "primary" }, { muscle_id: "triceps", role: "secondary" }], workout_sets: benchSets },
  ];
  if (pushups != null) ex.push({ exercise_id: PUSHUP, exercise_name: "푸시업", exercise_type: "bodyweight_reps", muscles: [{ muscle_id: "chest", role: "primary" }], workout_sets: [set(null, pushups)] });
  return { id, title: "운동", started_at: date, ended_at: new Date(Date.parse(date) + 3600_000).toISOString(), paused_seconds: 0, routine_id: null, workout_exercises: ex };
}

const s1 = session("s1", "2026-10-05T10:00:00+09:00", [set(60, 10), set(60, 8), set(40, 10, { set_type: "warmup" })], 20);
const s2 = session("s2", "2026-10-12T10:00:00+09:00", [set(65, 8), set(65, 6, { is_completed: false })], 25);
const s3 = session("s3", "2026-10-19T10:00:00+09:00", [set(62.5, 12), set(100, 20)], 18);

describe("estimate1RM", () => {
  it("uses Epley for 1–12 reps only", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(60, 10)).toBe(80);
    expect(estimate1RM(100, 13)).toBeNull();
    expect(estimate1RM(null, 5)).toBeNull();
  });
});

describe("exerciseHistory", () => {
  it("ignores warmups and incomplete sets", () => {
    const h = exerciseHistory([s2, s1], BENCH);
    expect(h.map((p) => p.sessionId)).toEqual(["s1", "s2"]);
    expect(h[0]).toMatchObject({ maxWeight: 60, best1RM: 80, volume: 1080, sets: 2 });
    expect(h[1]).toMatchObject({ maxWeight: 65, sets: 1, volume: 520 });
  });
});

describe("personalRecords", () => {
  it("records PR events only when a previous best is beaten, excluding the first session", () => {
    const { best, events } = personalRecords([s1, s2, s3]);
    const bench = best.find((b) => b.exerciseId === BENCH)!;
    expect(bench.values.max_weight).toMatchObject({ value: 100, sessionId: "s3" });
    expect(bench.values.best_1rm?.value).toBe(87.5); // 65×8 → 82.3, 62.5×12 → 87.5, 100×20 제외
    const kinds = events.filter((e) => e.exerciseId === BENCH).map((e) => `${e.sessionId}:${e.kind}`);
    expect(kinds).toContain("s2:max_weight");
    expect(kinds).toContain("s3:best_1rm");
    expect(kinds.some((k) => k.startsWith("s1"))).toBe(false);
    const push = events.filter((e) => e.exerciseId === PUSHUP);
    expect(push).toEqual([expect.objectContaining({ kind: "max_reps", value: 25, previous: 20, sessionId: "s2" })]);
  });

  it("drops a PR when its session is deleted (recomputed from raw data)", () => {
    const { best } = personalRecords([s1, s2]);
    expect(best.find((b) => b.exerciseId === BENCH)!.values.max_weight?.value).toBe(65);
  });
});

describe("bucketize / totals", () => {
  it("fills empty weekly buckets in the range", () => {
    const b = bucketize([s1, s3], "week", new Date("2026-10-05T00:00:00+09:00"), new Date("2026-10-25T00:00:00+09:00"));
    expect(b.map((x) => x.sessions)).toEqual([1, 0, 1]);
    expect(b[0].volume).toBe(1080);
  });
  it("totals sessions", () => {
    expect(totals([s1, s2])).toEqual({ sessions: 2, volume: 1600, sets: 5, reps: 71, durationSec: 7200 });
  });
  it("groups by month and year", () => {
    expect(bucketize([s1, s2, s3], "month", new Date("2026-10-01T00:00:00+09:00"), new Date("2026-11-30T00:00:00+09:00")).map((x) => x.sessions)).toEqual([3, 0]);
  });
});

describe("muscleStats", () => {
  it("counts weekly sets with secondary as half and tracks last trained", () => {
    const now = new Date("2026-10-20T10:00:00+09:00");
    const st = muscleStats([s1, s2, s3], ["chest", "triceps", "back"], now);
    const chest = st.find((m) => m.muscleId === "chest")!;
    expect(chest.setsThisWeek).toBe(3); // 벤치 2 + 푸시업 1
    expect(chest.setsLastWeek).toBe(2); // 벤치 1 + 푸시업 1
    expect(chest.hoursSince).toBe(24);
    expect(st.find((m) => m.muscleId === "triceps")!.setsThisWeek).toBe(1);
    expect(st.find((m) => m.muscleId === "back")!.lastTrained).toBeNull();
    expect(recoveryHint(24).tone).toBe("recent");
    expect(recoveryHint(null).tone).toBe("none");
  });
});

describe("badges", () => {
  it("marks earned badges", () => {
    const b = badges([s1, s2, s3], 3, 2, 0);
    expect(b.find((x) => x.key === "sessions-1")!.earned).toBe(true);
    expect(b.find((x) => x.key === "sessions-10")!.progress).toBe("3/10");
    expect(b.find((x) => x.key === "streak-4")!.earned).toBe(false);
  });
});

import { eachDay, expandPlan, programDates, weekdayOf } from "@/lib/schedule";

describe("schedule", () => {
  const routines = [{ id: "upper", weekdays: [1, 4] }, { id: "lower", weekdays: [2] }];
  it("expands weekly routines and dated schedules", () => {
    const plan = expandPlan(routines, [{ id: "x", routine_id: "lower", scheduled_date: "2026-11-07", status: "planned", is_deload: false }], "2026-11-02", "2026-11-08");
    expect([...plan.keys()]).toEqual(["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-07"]);
    expect(plan.get("2026-11-07")).toEqual([{ routineId: "lower", source: "schedule", scheduleId: "x", isDeload: false }]);
  });
  it("moving a weekly item = skip original + plan new date", () => {
    const plan = expandPlan(routines, [
      { id: "a", routine_id: "upper", scheduled_date: "2026-11-02", status: "skipped", is_deload: false },
      { id: "b", routine_id: "upper", scheduled_date: "2026-11-03", status: "planned", is_deload: false },
    ], "2026-11-02", "2026-11-03");
    expect(plan.has("2026-11-02")).toBe(false);
    expect(plan.get("2026-11-03")!.map((p) => p.routineId).sort()).toEqual(["lower", "upper"]);
  });
  it("generates program dates with deload weeks", () => {
    const d = programDates("2026-11-02", 4, [{ weekday: 1, routine_id: "upper" }, { weekday: 4, routine_id: "lower" }], 4);
    expect(d).toHaveLength(8);
    expect(d[0]).toEqual({ date: "2026-11-02", routine_id: "upper", is_deload: false });
    expect(d.filter((x) => x.is_deload).map((x) => x.date)).toEqual(["2026-11-23", "2026-11-26"]);
  });
  it("date helpers", () => {
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
