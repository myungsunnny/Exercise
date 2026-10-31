import type { ExerciseType, SetType } from "@/lib/types";

// 운동 중 편집 상태. 입력값은 문자열로 보관해 입력 도중 포맷이 바뀌거나 포커스를 잃지 않게 한다.
export type DraftSet = {
  id: string;
  set_type: SetType;
  weight: string;
  reps: string;
  duration: string; // "m:ss" 또는 초
  distance: string; // km
  rpe: string;
  rir: string;
  done: boolean;
  completed_at: string | null;
  rest_seconds: number | null;
  notes: string;
};

export type DraftExercise = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  superset_group: number | null;
  rest_seconds: number | null;
  rep_min: number | null;
  rep_max: number | null;
  notes: string;
  sets: DraftSet[];
};

export type DraftSession = {
  id: string;
  routine_id: string | null;
  title: string;
  status: "in_progress" | "completed";
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  notes: string;
  exercises: DraftExercise[];
};

export type ExerciseRef = { id: string; name_ko: string; exercise_type: ExerciseType };

export const uuid = () => crypto.randomUUID();

export function newSet(from?: Partial<DraftSet>): DraftSet {
  return {
    set_type: "normal",
    weight: "",
    reps: "",
    duration: "",
    distance: "",
    rpe: "",
    rir: "",
    notes: "",
    ...from,
    id: uuid(),
    done: false,
    completed_at: null,
    rest_seconds: null,
  };
}

export function newExercise(ex: ExerciseRef, opts: Partial<DraftExercise> & { setCount?: number } = {}): DraftExercise {
  const { setCount = 3, ...rest } = opts;
  return {
    exercise_id: ex.id,
    exercise_name: ex.name_ko,
    exercise_type: ex.exercise_type,
    superset_group: null,
    rest_seconds: null,
    rep_min: null,
    rep_max: null,
    notes: "",
    sets: Array.from({ length: setCount }, () => newSet()),
    ...rest,
    id: uuid(),
  };
}

export function newSession(now: Date, init: Partial<DraftSession> = {}): DraftSession {
  return {
    routine_id: null,
    title: "운동",
    status: "in_progress",
    started_at: now.toISOString(),
    ended_at: null,
    paused_at: null,
    paused_seconds: 0,
    notes: "",
    exercises: [],
    ...init,
    id: uuid(),
  };
}

// ───────────────────────── 파싱 ─────────────────────────
export function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// "1:30" → 90, "90" → 90
export function parseDuration(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  if (t.includes(":")) {
    const [m, sec] = t.split(":");
    const mm = Number(m), ss = Number(sec || 0);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss >= 60) return null;
    return Math.round(mm * 60 + ss);
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function formatDurationInput(sec: number | null | undefined): string {
  if (sec == null) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// ───────────────────────── 경과 시간 ─────────────────────────
export function elapsedSeconds(s: Pick<DraftSession, "started_at" | "ended_at" | "paused_at" | "paused_seconds">, now: number): number {
  const end = s.ended_at ? Date.parse(s.ended_at) : s.paused_at ? Date.parse(s.paused_at) : now;
  return Math.max(0, Math.floor((end - Date.parse(s.started_at)) / 1000) - s.paused_seconds);
}

// ───────────────────────── 리듀서 ─────────────────────────
export type Action =
  | { type: "session"; patch: Partial<Pick<DraftSession, "title" | "notes">> }
  | { type: "addExercises"; exercises: DraftExercise[] }
  | { type: "removeExercise"; exId: string }
  | { type: "replaceExercise"; exId: string; ex: ExerciseRef }
  | { type: "moveExercise"; exId: string; dir: -1 | 1 }
  | { type: "updateExercise"; exId: string; patch: Partial<Pick<DraftExercise, "rest_seconds" | "notes">> }
  | { type: "toggleSuperset"; exId: string }
  | { type: "addSet"; exId: string }
  | { type: "copySet"; exId: string; setId: string }
  | { type: "removeSet"; exId: string; setId: string }
  | { type: "moveSet"; exId: string; setId: string; dir: -1 | 1 }
  | { type: "updateSet"; exId: string; setId: string; patch: Partial<Omit<DraftSet, "id">> }
  | { type: "toggleDone"; exId: string; setId: string; now: string; fill?: Partial<DraftSet> }
  | { type: "pause"; now: string }
  | { type: "resume"; now: string }
  | { type: "finish"; now: string }
  | { type: "reopen" };

const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function mapEx(s: DraftSession, exId: string, fn: (e: DraftExercise) => DraftExercise): DraftSession {
  return { ...s, exercises: s.exercises.map((e) => (e.id === exId ? fn(e) : e)) };
}

function resumed(s: DraftSession, now: string): DraftSession {
  if (!s.paused_at) return s;
  const add = Math.max(0, Math.floor((Date.parse(now) - Date.parse(s.paused_at)) / 1000));
  return { ...s, paused_at: null, paused_seconds: s.paused_seconds + add };
}

export function reduceSession(s: DraftSession, a: Action): DraftSession {
  switch (a.type) {
    case "session":
      return { ...s, ...a.patch };
    case "addExercises":
      return { ...s, exercises: [...s.exercises, ...a.exercises] };
    case "removeExercise":
      return { ...s, exercises: s.exercises.filter((e) => e.id !== a.exId) };
    case "replaceExercise":
      return mapEx(s, a.exId, (e) => ({
        ...e,
        exercise_id: a.ex.id,
        exercise_name: a.ex.name_ko,
        exercise_type: a.ex.exercise_type,
      }));
    case "moveExercise":
      return { ...s, exercises: move(s.exercises, s.exercises.findIndex((e) => e.id === a.exId), a.dir) };
    case "updateExercise":
      return mapEx(s, a.exId, (e) => ({ ...e, ...a.patch }));
    case "toggleSuperset": {
      // 현재 종목을 다음 종목과 같은 그룹으로 묶거나, 이미 묶여 있으면 해제
      const i = s.exercises.findIndex((e) => e.id === a.exId);
      const cur = s.exercises[i];
      const next = s.exercises[i + 1];
      if (!cur) return s;
      const exercises = s.exercises.slice();
      if (cur.superset_group != null && next?.superset_group === cur.superset_group) {
        exercises[i + 1] = { ...next, superset_group: null };
        const stillGrouped = exercises.some((e, k) => k !== i && e.superset_group === cur.superset_group);
        if (!stillGrouped) exercises[i] = { ...cur, superset_group: null };
        return { ...s, exercises };
      }
      if (!next) return s;
      const used = new Set(s.exercises.map((e) => e.superset_group).filter((g): g is number => g != null));
      let g = cur.superset_group ?? next.superset_group;
      if (g == null) {
        g = 1;
        while (used.has(g)) g++;
      }
      exercises[i] = { ...cur, superset_group: g };
      exercises[i + 1] = { ...next, superset_group: g };
      return { ...s, exercises };
    }
    case "addSet":
      return mapEx(s, a.exId, (e) => {
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [...e.sets, newSet(last ? { set_type: last.set_type === "warmup" ? "normal" : last.set_type, weight: last.weight, reps: last.reps, duration: last.duration, distance: last.distance } : {})],
        };
      });
    case "copySet":
      return mapEx(s, a.exId, (e) => {
        const i = e.sets.findIndex((x) => x.id === a.setId);
        if (i < 0) return e;
        const { set_type, weight, reps, duration, distance, rpe, rir, notes } = e.sets[i];
        const sets = e.sets.slice();
        sets.splice(i + 1, 0, newSet({ set_type, weight, reps, duration, distance, rpe, rir, notes }));
        return { ...e, sets };
      });
    case "removeSet":
      return mapEx(s, a.exId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== a.setId) }));
    case "moveSet":
      return mapEx(s, a.exId, (e) => ({ ...e, sets: move(e.sets, e.sets.findIndex((x) => x.id === a.setId), a.dir) }));
    case "updateSet":
      return mapEx(s, a.exId, (e) => ({
        ...e,
        sets: e.sets.map((x) => (x.id === a.setId ? { ...x, ...a.patch } : x)),
      }));
    case "toggleDone": {
      const target = s.exercises.find((e) => e.id === a.exId)?.sets.find((x) => x.id === a.setId);
      if (!target) return s;
      if (target.done) {
        return mapEx(s, a.exId, (e) => ({
          ...e,
          sets: e.sets.map((x) => (x.id === a.setId ? { ...x, done: false, completed_at: null } : x)),
        }));
      }
      // 직전에 완료한 세트에 세트 간 간격(휴식)을 기록
      let prev: { exId: string; setId: string; at: number } | null = null;
      for (const e of s.exercises)
        for (const x of e.sets)
          if (x.done && x.completed_at && (!prev || Date.parse(x.completed_at) > prev.at))
            prev = { exId: e.id, setId: x.id, at: Date.parse(x.completed_at) };
      let next = mapEx(s, a.exId, (e) => ({
        ...e,
        sets: e.sets.map((x) => (x.id === a.setId ? { ...x, ...a.fill, done: true, completed_at: a.now } : x)),
      }));
      if (prev) {
        const p = prev;
        const rest = Math.max(0, Math.round((Date.parse(a.now) - p.at) / 1000));
        next = mapEx(next, p.exId, (e) => ({
          ...e,
          sets: e.sets.map((x) => (x.id === p.setId && x.rest_seconds == null ? { ...x, rest_seconds: rest } : x)),
        }));
      }
      return next;
    }
    case "pause":
      return s.paused_at ? s : { ...s, paused_at: a.now };
    case "resume":
      return resumed(s, a.now);
    case "finish":
      return { ...resumed(s, a.now), status: "completed", ended_at: s.ended_at ?? a.now };
    case "reopen":
      return { ...s, status: "in_progress", ended_at: null };
  }
}

// 되돌리기: 같은 세트의 같은 필드를 연속으로 입력하는 경우는 한 단계로 합친다.
export type History = { present: DraftSession; past: DraftSession[]; lastKey: string | null };
const UNDO_LIMIT = 50;

export function reduceHistory(h: History, a: Action | { type: "undo" }): History {
  if (a.type === "undo") {
    const prev = h.past[h.past.length - 1];
    return prev ? { present: prev, past: h.past.slice(0, -1), lastKey: null } : h;
  }
  const next = reduceSession(h.present, a);
  if (next === h.present) return h;
  const key =
    a.type === "updateSet" ? `set:${a.setId}:${Object.keys(a.patch).join(",")}`
    : a.type === "session" ? `session:${Object.keys(a.patch).join(",")}`
    : a.type === "updateExercise" ? `ex:${a.exId}:${Object.keys(a.patch).join(",")}`
    : null;
  if (key && key === h.lastKey) return { ...h, present: next };
  return { present: next, past: [...h.past, h.present].slice(-UNDO_LIMIT), lastKey: key };
}

// ───────────────────────── 저장 페이로드 ─────────────────────────
export function toPayload(s: DraftSession) {
  return {
    id: s.id,
    routine_id: s.routine_id,
    title: s.title.trim() || "운동",
    status: s.status,
    started_at: s.started_at,
    ended_at: s.ended_at,
    paused_at: s.paused_at,
    paused_seconds: s.paused_seconds,
    notes: s.notes.trim() || null,
    exercises: s.exercises.map((e) => ({
      id: e.id,
      exercise_id: e.exercise_id,
      exercise_name: e.exercise_name,
      superset_group: e.superset_group,
      rest_seconds: e.rest_seconds,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      notes: e.notes.trim() || null,
      sets: e.sets.map((x) => ({
        id: x.id,
        set_type: x.set_type,
        weight_kg: parseNum(x.weight),
        reps: parseNum(x.reps),
        duration_seconds: parseDuration(x.duration),
        distance_km: parseNum(x.distance),
        rpe: parseNum(x.rpe),
        rir: parseNum(x.rir),
        is_completed: x.done,
        completed_at: x.completed_at,
        rest_seconds: x.rest_seconds,
        notes: x.notes.trim() || null,
      })),
    })),
  };
}

export type WorkoutPayload = ReturnType<typeof toPayload>;
