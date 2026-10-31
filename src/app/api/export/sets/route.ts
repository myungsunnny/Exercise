import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

// 모든 운동 세트를 CSV로 내보낸다(Excel 한글 호환을 위해 UTF-8 BOM 포함).
export async function GET() {
  const { supabase } = await requireUser();
  const { data: prefs } = await supabase.from("user_preferences").select("timezone").maybeSingle();
  const tz = prefs?.timezone ?? "Asia/Seoul";
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(`id, title, status, started_at, ended_at, paused_seconds, notes,
      workout_exercises(exercise_name, position, superset_group, notes,
        workout_sets(position, set_type, weight_kg, reps, duration_seconds, distance_km, rpe, rir, is_completed, completed_at, rest_seconds, notes))`)
    .eq("status", "completed")
    .order("started_at");
  if (error) return new Response("내보내기에 실패했습니다.", { status: 500 });

  const header = ["날짜", "시작", "세션", "세션ID", "운동", "종목순서", "슈퍼세트", "세트", "유형", "중량(kg)", "횟수", "시간(초)", "거리(km)", "RPE", "RIR", "완료", "휴식(초)", "세트메모"];
  const rows: (string | number | null)[][] = [header];
  for (const s of data) {
    for (const e of [...s.workout_exercises].sort((a, b) => a.position - b.position))
      for (const x of [...e.workout_sets].sort((a, b) => a.position - b.position))
        rows.push([
          formatDate(s.started_at, "yyyy-MM-dd", tz), formatDate(s.started_at, "HH:mm", tz), s.title, s.id, e.exercise_name, e.position + 1,
          e.superset_group, x.position + 1, x.set_type, x.weight_kg, x.reps, x.duration_seconds, x.distance_km, x.rpe, x.rir,
          x.is_completed ? "Y" : "N", x.rest_seconds, x.notes,
        ]);
  }
  const esc = (v: string | number | null) => {
    if (v == null) return "";
    const t = String(v);
    // 수식 주입 방지: = + - @ 로 시작하는 문자열은 작은따옴표를 붙인다
    const safe = typeof v === "string" && /^[=+\-@]/.test(t) ? `'${t}` : t;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const name = `myfit-sets-${formatDate(new Date(), "yyyyMMdd", tz)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
