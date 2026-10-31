import { describe, expect, it } from "vitest";
import {
  elapsedSeconds, newExercise, newSession, newSet, parseDuration, parseNum, reduceHistory, reduceSession, toPayload,
  type DraftSession, type History,
} from "@/lib/workout/model";
import { workoutPayloadSchema } from "@/lib/workout/schema";

const bench = { id: crypto.randomUUID(), name_ko: "벤치프레스", exercise_type: "weight_reps" as const };
const row = { id: crypto.randomUUID(), name_ko: "바벨 로우", exercise_type: "weight_reps" as const };
const T0 = "2026-10-30T10:00:00.000Z";

function base(): DraftSession {
  return { ...newSession(new Date(T0)), exercises: [newExercise(bench, { setCount: 2 }), newExercise(row, { setCount: 1 })] };
}

describe("parsing", () => {
  it("parses numbers with comma decimal and blanks", () => {
    expect(parseNum("62,5")).toBe(62.5);
    expect(parseNum(" ")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });
  it("parses m:ss and plain seconds", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("1:75")).toBeNull();
  });
});

describe("reducer", () => {
  it("adds a set copying the previous set's values", () => {
    let s = base();
    const ex = s.exercises[0];
    s = reduceSession(s, { type: "updateSet", exId: ex.id, setId: ex.sets[1].id, patch: { weight: "60", reps: "8" } });
    s = reduceSession(s, { type: "addSet", exId: ex.id });
    expect(s.exercises[0].sets).toHaveLength(3);
    expect(s.exercises[0].sets[2]).toMatchObject({ weight: "60", reps: "8", done: false });
  });

  it("copies, moves and deletes sets", () => {
    let s = base();
    const ex = s.exercises[0];
    const [a, b] = ex.sets;
    s = reduceSession(s, { type: "updateSet", exId: ex.id, setId: a.id, patch: { weight: "50" } });
    s = reduceSession(s, { type: "copySet", exId: ex.id, setId: a.id });
    expect(s.exercises[0].sets.map((x) => x.weight)).toEqual(["50", "50", ""]);
    expect(new Set(s.exercises[0].sets.map((x) => x.id)).size).toBe(3);
    s = reduceSession(s, { type: "moveSet", exId: ex.id, setId: b.id, dir: -1 });
    expect(s.exercises[0].sets[1].id).toBe(b.id);
    s = reduceSession(s, { type: "removeSet", exId: ex.id, setId: b.id });
    expect(s.exercises[0].sets.map((x) => x.id)).not.toContain(b.id);
  });

  it("moves, replaces and removes exercises", () => {
    let s = base();
    const [e1, e2] = s.exercises;
    s = reduceSession(s, { type: "moveExercise", exId: e1.id, dir: 1 });
    expect(s.exercises.map((e) => e.id)).toEqual([e2.id, e1.id]);
    s = reduceSession(s, { type: "moveExercise", exId: e2.id, dir: -1 }); // 범위 밖 → 그대로
    expect(s.exercises[0].id).toBe(e2.id);
    s = reduceSession(s, { type: "replaceExercise", exId: e1.id, ex: { id: "x", name_ko: "덤벨 프레스", exercise_type: "weight_reps" } });
    expect(s.exercises[1]).toMatchObject({ id: e1.id, exercise_id: "x", exercise_name: "덤벨 프레스" });
    s = reduceSession(s, { type: "removeExercise", exId: e1.id });
    expect(s.exercises).toHaveLength(1);
  });

  it("toggles a superset group and ungroups it", () => {
    let s = base();
    const [e1, e2] = s.exercises;
    s = reduceSession(s, { type: "toggleSuperset", exId: e1.id });
    expect(s.exercises.map((e) => e.superset_group)).toEqual([1, 1]);
    s = reduceSession(s, { type: "toggleSuperset", exId: e1.id });
    expect(s.exercises.map((e) => e.superset_group)).toEqual([null, null]);
    expect(e2.superset_group).toBeNull();
  });

  it("completes a set with fill values and records rest on the previous completed set", () => {
    let s = base();
    const ex = s.exercises[0];
    s = reduceSession(s, { type: "toggleDone", exId: ex.id, setId: ex.sets[0].id, now: "2026-10-30T10:05:00.000Z", fill: { weight: "60", reps: "10" } });
    expect(s.exercises[0].sets[0]).toMatchObject({ done: true, weight: "60", reps: "10", completed_at: "2026-10-30T10:05:00.000Z" });
    s = reduceSession(s, { type: "toggleDone", exId: ex.id, setId: ex.sets[1].id, now: "2026-10-30T10:07:30.000Z" });
    expect(s.exercises[0].sets[0].rest_seconds).toBe(150);
    s = reduceSession(s, { type: "toggleDone", exId: ex.id, setId: ex.sets[1].id, now: "2026-10-30T10:08:00.000Z" });
    expect(s.exercises[0].sets[1]).toMatchObject({ done: false, completed_at: null });
  });

  it("excludes paused time from elapsed time", () => {
    let s = base();
    s = reduceSession(s, { type: "pause", now: "2026-10-30T10:10:00.000Z" });
    expect(elapsedSeconds(s, Date.parse("2026-10-30T10:30:00.000Z"))).toBe(600);
    s = reduceSession(s, { type: "resume", now: "2026-10-30T10:20:00.000Z" });
    expect(s.paused_seconds).toBe(600);
    s = reduceSession(s, { type: "finish", now: "2026-10-30T10:50:00.000Z" });
    expect(s.status).toBe("completed");
    expect(elapsedSeconds(s, Date.now())).toBe(40 * 60);
  });
});

describe("undo history", () => {
  it("coalesces consecutive typing in one field and undoes structural changes", () => {
    const s = base();
    const ex = s.exercises[0];
    let h: History = { present: s, past: [], lastKey: null };
    for (const w of ["6", "60", "60.5"]) h = reduceHistory(h, { type: "updateSet", exId: ex.id, setId: ex.sets[0].id, patch: { weight: w } });
    expect(h.past).toHaveLength(1);
    h = reduceHistory(h, { type: "removeSet", exId: ex.id, setId: ex.sets[1].id });
    h = reduceHistory(h, { type: "undo" });
    expect(h.present.exercises[0].sets).toHaveLength(2);
    expect(h.present.exercises[0].sets[0].weight).toBe("60.5");
    h = reduceHistory(h, { type: "undo" });
    expect(h.present.exercises[0].sets[0].weight).toBe("");
  });
});

describe("payload", () => {
  it("produces a payload that passes server validation", () => {
    let s = base();
    const ex = s.exercises[0];
    s = reduceSession(s, { type: "updateSet", exId: ex.id, setId: ex.sets[0].id, patch: { weight: "62.5", reps: "8", rpe: "8.5", rir: "2" } });
    const p = toPayload(s);
    expect(p.exercises[0].sets[0]).toMatchObject({ weight_kg: 62.5, reps: 8, rpe: 8.5, rir: 2, is_completed: false });
    expect(workoutPayloadSchema.safeParse(p).success).toBe(true);
  });

  it("rejects out-of-range values and completed sessions without an end time", () => {
    const s = base();
    s.exercises[0].sets[0] = { ...newSet(), weight: "5000" };
    expect(workoutPayloadSchema.safeParse(toPayload(s)).success).toBe(false);
    expect(workoutPayloadSchema.safeParse({ ...toPayload(base()), status: "completed", ended_at: null }).success).toBe(false);
  });
});
