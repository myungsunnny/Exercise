// Supabase 마이그레이션을 PGlite(인메모리 Postgres)에서 실행해 RPC와 RLS를 검증한다.
// auth 스키마는 Supabase와 같은 방식(JWT sub 클레임 → auth.uid())으로 최소 구현한다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { newExercise, newSession, newSet, reduceSession, toPayload, type DraftSession } from "@/lib/workout/model";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
let db: PGlite;

const AUTH_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant references on auth.users to authenticated;
`;

// 사용자로 전환해 쿼리 실행(트랜잭션 단위로 role/클레임 설정)
async function as<T>(uid: string | null, fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    return fn(tx as unknown as Pick<PGlite, "query" | "exec">);
  });
}

async function save(uid: string, draft: DraftSession, rev: number) {
  return as(uid, async (tx) => {
    const r = await tx.query<{ save_workout: string }>(`select public.save_workout($1::jsonb, $2) as save_workout`, [JSON.stringify(toPayload(draft)), rev]);
    return Number(r.rows[0].save_workout);
  });
}

async function count(uid: string, table: string, where = "true") {
  return as(uid, async (tx) => Number((await tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`)).rows[0].n));
}

let bench: { id: string; name_ko: string; exercise_type: "weight_reps" };
let squat: typeof bench;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_SHIM);
  const dir = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@test'), ($2, 'b@test')`, [A, B]);
  const rows = (await db.query<{ id: string; slug: string; name_ko: string }>(`select id, slug, name_ko from public.exercises where slug in ('barbell-bench-press','back-squat')`)).rows;
  const pick = (slug: string) => {
    const r = rows.find((x) => x.slug === slug)!;
    return { id: r.id, name_ko: r.name_ko, exercise_type: "weight_reps" as const };
  };
  bench = pick("barbell-bench-press");
  squat = pick("back-squat");
});

function sampleSession(): DraftSession {
  const s = newSession(new Date("2026-10-30T10:00:00+09:00"));
  const ex = newExercise(bench, { setCount: 0, sets: [newSet({ weight: "60", reps: "10" }), newSet({ weight: "60", reps: "9" })] });
  return { ...s, exercises: [ex] };
}

describe("migrations", () => {
  it("seeds muscles and exercises with muscle links", async () => {
    expect(await count(A, "muscles")).toBe(11);
    expect(await count(A, "exercises")).toBeGreaterThanOrEqual(60);
    const orphan = await db.query<{ n: number }>(
      `select count(*)::int as n from public.exercises e where not exists (select 1 from public.exercise_muscles m where m.exercise_id = e.id and m.role = 'primary')`,
    );
    expect(orphan.rows[0].n).toBe(0);
  });

  it("creates profile and preferences rows for new auth users", async () => {
    expect(await count(A, "user_preferences")).toBe(1);
    expect(await count(A, "profiles")).toBe(1);
  });
});

describe("save_workout", () => {
  it("is idempotent: saving the same snapshot repeatedly creates no duplicates", async () => {
    const s = sampleSession();
    await save(A, s, 1);
    await save(A, s, 2);
    await save(A, s, 3);
    expect(await count(A, "workout_sessions", `id = '${s.id}'`)).toBe(1);
    expect(await count(A, "workout_exercises", `session_id = '${s.id}'`)).toBe(1);
    expect(await count(A, "workout_sets")).toBe(2);
    await as(A, (tx) => tx.query(`delete from public.workout_sessions where id = $1`, [s.id]));
  });

  it("ignores stale (out-of-order) saves", async () => {
    const s = sampleSession();
    await save(A, s, 5);
    const older = { ...s, title: "오래된 요청" };
    const rev = await save(A, older, 4);
    expect(rev).toBe(5);
    const title = await as(A, async (tx) => (await tx.query<{ title: string }>(`select title from public.workout_sessions where id = $1`, [s.id])).rows[0].title);
    expect(title).toBe("운동");
    await as(A, (tx) => tx.query(`delete from public.workout_sessions where id = $1`, [s.id]));
  });

  it("applies edits, set removal, exercise add/reorder and completion; reload returns the same data", async () => {
    let s = sampleSession();
    await save(A, s, 1);
    const exId = s.exercises[0].id;
    s = reduceSession(s, { type: "updateSet", exId, setId: s.exercises[0].sets[0].id, patch: { weight: "62.5" } });
    s = reduceSession(s, { type: "removeSet", exId, setId: s.exercises[0].sets[1].id });
    s = reduceSession(s, { type: "addExercises", exercises: [newExercise(squat, { setCount: 1 })] });
    s = reduceSession(s, { type: "moveExercise", exId, dir: 1 });
    s = reduceSession(s, { type: "toggleDone", exId, setId: s.exercises[1].sets[0].id, now: "2026-10-30T10:10:00+09:00" });
    s = reduceSession(s, { type: "finish", now: "2026-10-30T11:00:00+09:00" });
    await save(A, s, 2);

    const rows = await as(A, async (tx) =>
      (await tx.query<{ exercise_name: string; position: number; weight_kg: string; is_completed: boolean; status: string }>(
        `select we.exercise_name, we.position, ws.weight_kg, ws.is_completed, s.status
         from public.workout_sessions s join public.workout_exercises we on we.session_id = s.id
         join public.workout_sets ws on ws.workout_exercise_id = we.id where s.id = $1 order by we.position, ws.position`, [s.id])).rows,
    );
    expect(rows.map((r) => [r.exercise_name, r.position])).toEqual([["바벨 백스쿼트", 0], ["바벨 벤치프레스", 1]]);
    expect(rows[1]).toMatchObject({ weight_kg: "62.50", is_completed: true, status: "completed" });
    expect(rows).toHaveLength(2);
  });

  it("previous_sets returns the most recent completed session's completed sets", async () => {
    const prev = await as(A, async (tx) =>
      (await tx.query<{ weight_kg: string }>(`select * from public.previous_sets($1::uuid[], null)`, [`{${bench.id}}`])).rows,
    );
    expect(prev.map((r) => r.weight_kg)).toEqual(["62.50"]);
  });

  it("allows only one in-progress session per user", async () => {
    const a = sampleSession();
    const b = sampleSession();
    await save(A, a, 1);
    await expect(save(A, b, 1)).rejects.toThrow(/workout_sessions_one_active|duplicate/);
    await as(A, (tx) => tx.query(`delete from public.workout_sessions where id = $1`, [a.id]));
  });

  it("deleting a session cascades so it no longer counts", async () => {
    const s = sampleSession();
    await save(A, s, 1);
    const before = await count(A, "workout_sets");
    await as(A, (tx) => tx.query(`delete from public.workout_sessions where id = $1`, [s.id]));
    expect(await count(A, "workout_sets")).toBe(before - 2);
  });

  it("rejects anonymous calls", async () => {
    await expect(as(null, (tx) => tx.query(`select public.save_workout('{}'::jsonb, 1)`))).rejects.toThrow();
  });
});

describe("RLS", () => {
  it("user B cannot read, modify, or hijack user A's data", async () => {
    const s = { ...sampleSession(), status: "completed" as const, ended_at: "2026-10-30T11:00:00+09:00" };
    await save(A, s, 1);
    expect(await count(B, "workout_sessions")).toBe(0);
    expect(await count(B, "workout_sets")).toBe(0);
    await as(B, (tx) => tx.query(`update public.workout_sessions set title = 'hacked' where id = $1`, [s.id]));
    await as(B, (tx) => tx.query(`delete from public.workout_sessions where id = $1`, [s.id]));
    expect(await count(A, "workout_sessions", `id = '${s.id}' and title = '운동'`)).toBe(1);
    // 같은 UUID로 덮어쓰기 시도
    await expect(save(B, { ...s, title: "hacked" }, 99)).rejects.toThrow();
    const prev = await as(B, async (tx) => (await tx.query(`select * from public.previous_sets($1::uuid[], null)`, [`{${bench.id}}`])).rows);
    expect(prev).toHaveLength(0);
  });

  it("anon cannot read anything", async () => {
    await expect(as(null, (tx) => tx.query(`select * from public.exercises`))).rejects.toThrow(/permission denied/);
  });

  it("users can create custom exercises but not modify built-ins", async () => {
    await as(B, (tx) => tx.query(`insert into public.exercises (owner_id, name_ko, exercise_type, equipment) values ($1, '내 운동', 'weight_reps', 'machine')`, [B]));
    expect(await count(B, "exercises", "owner_id is not null")).toBe(1);
    expect(await count(A, "exercises", "owner_id is not null")).toBe(0);
    await as(B, (tx) => tx.query(`update public.exercises set name_ko = 'x' where slug = 'deadlift'`));
    expect(await count(A, "exercises", "slug = 'deadlift' and name_ko = '데드리프트'")).toBe(1);
  });

  it("save_routine stores a routine atomically and is private", async () => {
    const id = await as(A, async (tx) =>
      (await tx.query<{ id: string }>(`select public.save_routine($1::jsonb) as id`, [
        JSON.stringify({ id: null, name: "상체", description: null, weekdays: [1, 4], items: [{ exercise_id: bench.id, target_sets: 3, rep_min: 8, rep_max: 10, target_weight_kg: 60, rest_seconds: 120, superset_group: null, notes: null }] }),
      ])).rows[0].id,
    );
    expect(await count(A, "routine_exercises", `routine_id = '${id}'`)).toBe(1);
    expect(await count(B, "routines")).toBe(0);
    // 잘못된 항목이 있으면 전체가 롤백
    await expect(
      as(A, (tx) => tx.query(`select public.save_routine($1::jsonb)`, [JSON.stringify({ id, name: "상체", description: null, weekdays: [], items: [{ exercise_id: bench.id, target_sets: 99 }] })])),
    ).rejects.toThrow();
    expect(await count(A, "routine_exercises", `routine_id = '${id}'`)).toBe(1);
  });
});

describe("phase 2", () => {
  it("create_program inserts program and schedules atomically, private to the owner", async () => {
    const routineId = (await as(A, (tx) => tx.query<{ id: string }>(`select id from public.routines limit 1`))).rows[0].id;
    const pid = await as(A, async (tx) =>
      (await tx.query<{ id: string }>(`select public.create_program($1::jsonb, $2::jsonb) as id`, [
        JSON.stringify({ name: "8주", start_date: "2026-11-02", weeks: 8, deload_every: 4, pattern: [{ weekday: 1, routine_id: routineId }] }),
        JSON.stringify([{ date: "2026-11-02", routine_id: routineId, is_deload: false }, { date: "2026-11-23", routine_id: routineId, is_deload: true }]),
      ])).rows[0].id,
    );
    expect(await count(A, "program_schedules", `program_id = '${pid}'`)).toBe(2);
    expect(await count(B, "program_schedules")).toBe(0);
    expect(await count(B, "training_programs")).toBe(0);
    await as(A, (tx) => tx.query(`delete from public.training_programs where id = $1`, [pid]));
    expect(await count(A, "program_schedules", `program_id = '${pid}'`)).toBe(0);
  });

  it("goals require an exercise for exercise goals and are private", async () => {
    await expect(as(A, (tx) => tx.query(`insert into public.user_goals (user_id, kind, target_value) values ($1, 'exercise_weight', 100)`, [A]))).rejects.toThrow();
    await as(A, (tx) => tx.query(`insert into public.user_goals (user_id, kind, target_value) values ($1, 'weekly_count', 4)`, [A]));
    expect(await count(A, "user_goals")).toBe(1);
    expect(await count(B, "user_goals")).toBe(0);
  });

  it("preferences store dashboard order and muscle targets", async () => {
    await as(A, (tx) => tx.query(`update public.user_preferences set dashboard_order = '{recent,summary}', muscle_set_targets = '{"chest":12}' where user_id = $1`, [A]));
    const r = await as(A, (tx) => tx.query<{ dashboard_order: string[] }>(`select dashboard_order from public.user_preferences`));
    expect(r.rows[0].dashboard_order).toEqual(["recent", "summary"]);
  });
});

describe("phase 3", () => {
  it("AI tables are private and approval can be claimed only once", async () => {
    const conv = await as(A, async (tx) => (await tx.query<{ id: string }>(`insert into public.ai_conversations (user_id, title) values ($1, 't') returning id`, [A])).rows[0].id);
    await as(A, (tx) => tx.query(`insert into public.ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'hi')`, [conv, A]));
    expect(await count(B, "ai_messages")).toBe(0);
    await expect(as(B, (tx) => tx.query(`insert into public.ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'x')`, [conv, B]))).rejects.toThrow();

    const rec = await as(A, async (tx) => (await tx.query<{ id: string }>(`insert into public.ai_recommendations (user_id, kind, title, payload) values ($1, 'routine_new', 'r', '{}') returning id`, [A])).rows[0].id);
    const routinesBefore = await count(A, "routines");
    const claim = () => as(A, async (tx) => (await tx.query(`update public.ai_recommendations set status = 'approved' where id = $1 and status = 'pending' returning id`, [rec])).rows.length);
    expect(await claim()).toBe(1);
    expect(await claim()).toBe(0);
    expect(await count(A, "routines")).toBe(routinesBefore); // 제안 저장만으로는 루틴이 바뀌지 않음
    expect(await count(B, "ai_recommendations")).toBe(0);
  });

  it("workout feedback must belong to the user's own session", async () => {
    const s = { ...sampleSession(), status: "completed" as const, ended_at: "2026-10-30T11:00:00+09:00" };
    await save(A, s, 1);
    await as(A, (tx) => tx.query(`insert into public.workout_feedback (session_id, user_id, fatigue, pain) values ($1, $2, 3, false)`, [s.id, A]));
    await expect(as(B, (tx) => tx.query(`insert into public.workout_feedback (session_id, user_id, fatigue) values ($1, $2, 3)`, [s.id, B]))).rejects.toThrow();
    expect(await count(B, "workout_feedback")).toBe(0);
  });
});
