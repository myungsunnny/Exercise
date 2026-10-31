import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/data", () => ({
  getMuscles: async () => [{ id: "chest", name_ko: "가슴", sort_order: 1 }, { id: "back", name_ko: "등", sort_order: 2 }],
  getRecentFeedback: async () => [],
}));

import { generate } from "@/lib/ai/gemini";
import { runTool } from "@/lib/ai/tools";
import { safetyNoticeFor } from "@/lib/ai/coach";
import type { Ctx } from "@/lib/ai/context";
import { DEFAULT_PREFERENCES } from "@/lib/types";

const BENCH = "00000000-0000-4000-8000-000000000001";
function ctx(sessions: Ctx["sessions"] = []): Ctx {
  return {
    now: new Date("2026-11-01T12:00:00+09:00"), tz: "Asia/Seoul", today: "2026-11-01", prefs: DEFAULT_PREFERENCES,
    profile: { display_name: null, experience_level: null, training_goal: null, available_days: [], session_minutes: null, equipment: [], constraints_note: null, birth_year: null, sex: null, height_cm: null },
    sessions, routines: [], goals: [], settings: new Map(), plan: new Map(),
    body: [], wellness: [], meals: [], nutritionGoals: { kcal: null, protein_g: null, carbs_g: null, fat_g: null, water_ml: null }, latestWeight: null,
    exercises: [{ id: BENCH, owner_id: null, name_ko: "바벨 벤치프레스", name_en: "Barbell Bench Press", exercise_type: "weight_reps", equipment: "barbell", difficulty: "intermediate", instructions: null, cautions: null, media_url: null, archived_at: null, exercise_muscles: [{ muscle_id: "chest", role: "primary" }] }],
  } as Ctx;
}
const session = (date: string, w: number, r: number) => ({
  id: date, title: "상체", started_at: date, ended_at: date, paused_seconds: 0, routine_id: null,
  workout_exercises: [{ id: "x", position: 0, exercise_id: BENCH, exercise_name: "바벨 벤치프레스", exercise_type: "weight_reps" as const, muscles: [{ muscle_id: "chest", role: "primary" }], exercises: null,
    workout_sets: [{ set_type: "normal" as const, weight_kg: w, reps: r, duration_seconds: null, distance_km: null, is_completed: true, rpe: null, rir: null, position: 0 }] }],
}) as unknown as Ctx["sessions"][number];

describe("AI tools never invent records", () => {
  it("reports data_available=false when there is no history", async () => {
    const r = await runTool(ctx(), "get_training_summary", { period: "last_month" });
    expect(r.result).toMatchObject({ data_available: false });
    const p = await runTool(ctx(), "get_exercise_progress", { exercise: "벤치프레스", period: "last_month" });
    expect(p.result).toMatchObject({ data_available: false });
    const n = await runTool(ctx(), "get_next_targets", { exercise: "벤치프레스" });
    expect(n.result).toMatchObject({ recommended_weight_kg: null });
  });

  it("compares bench press month over month from real sessions only", async () => {
    const c = ctx([session("2026-10-20T10:00:00+09:00", 70, 5), session("2026-09-15T10:00:00+09:00", 60, 5)]);
    const r = await runTool(c, "get_exercise_progress", { exercise: "벤치", period: "last_month" });
    expect(r.result).toMatchObject({ exercise: "바벨 벤치프레스", data_available: true });
    expect((r.result.sessions as { max_weight_kg: number }[]).map((s) => s.max_weight_kg)).toEqual([70]);
    const all = await runTool(c, "get_exercise_progress", { exercise: "Barbell Bench Press" });
    expect((all.result.sessions as unknown[]).length).toBe(2);
  });

  it("returns similar names instead of guessing an unknown exercise", async () => {
    const r = await runTool(ctx(), "get_exercise_progress", { exercise: "없는운동" });
    expect(r.result).toMatchObject({ data_available: false });
  });
});

describe("health tools", () => {
  it("say there is no body/nutrition/wellness data instead of guessing", async () => {
    for (const t of ["get_body_trend", "get_nutrition_summary", "get_wellness_summary"]) expect((await runTool(ctx(), t, {})).result).toMatchObject({ data_available: false });
  });
  it("summarize recorded nutrition per day", async () => {
    const c = ctx();
    c.meals = [{ id: "m", eaten_on: "2026-10-31", meal_type: "lunch", notes: null, meal_items: [{ id: "i", name: "쌀밥", serving_desc: "1공기", servings: 1, kcal: 315, protein_g: 5.5, carbs_g: 70, fat_g: 0.6, is_estimate: true, food_item_id: null }] }];
    const r = await runTool(c, "get_nutrition_summary", {});
    expect(r.result.daily).toEqual([expect.objectContaining({ date: "2026-10-31", kcal: 315, includes_estimates: true })]);
  });
});

describe("safety notice", () => {
  it("adds a fixed notice when pain or injury is mentioned", () => {
    expect(safetyNoticeFor("어깨가 아파요")).toContain("전문가");
    expect(safetyNoticeFor("허리 통증이 있어")).not.toBeNull();
    expect(safetyNoticeFor("벤치프레스 중량 추천해줘")).toBeNull();
  });
});

describe("gemini client", () => {
  const original = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });
  afterEach(() => { process.env.GEMINI_API_KEY = original; vi.unstubAllGlobals(); });

  it("sends the key only as a server header and parses function calls with signatures intact", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
      expect(String(_url)).not.toContain("test-key");
      return new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_personal_records", args: {} }, thoughtSignature: "sig123" }] } }],
        usageMetadata: { totalTokenCount: 42 },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generate({ system: "s", contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    expect(r.calls).toEqual([{ name: "get_personal_records", args: {}, id: undefined }]);
    expect(r.content.parts[0].thoughtSignature).toBe("sig123");
    expect(r.tokens).toBe(42);
  });

  it("maps upstream errors to friendly messages and requires a key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    await expect(generate({ system: "s", contents: [] })).rejects.toThrow(/한도/);
    delete process.env.GEMINI_API_KEY;
    await expect(generate({ system: "s", contents: [] })).rejects.toMatchObject({ code: "no_key" });
  });
});

describe("gemini fallback", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("retries on 503 and falls back to the secondary model", async () => {
    process.env.GEMINI_API_KEY = "k";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("gemini-3.8-flash")) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] }));
    }));
    const r = await generate({ system: "s", contents: [] });
    expect(r).toMatchObject({ text: "ok", model: "gemini-3.5-flash" });
    expect(urls.filter((u) => u.includes("3.8")).length).toBe(2);
  }, 10_000);
});
