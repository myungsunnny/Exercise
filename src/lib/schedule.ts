// 캘린더 일정 계산: 루틴 요일 배치(매주 반복) + 날짜 지정 일정(프로그램·이동·건너뜀)
import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { DEFAULT_TZ } from "@/lib/format";

export type PlanItem = { routineId: string; source: "weekly" | "schedule"; scheduleId?: string; isDeload?: boolean };
type RoutineLite = { id: string; weekdays: number[] };
type ScheduleLite = { id: string; routine_id: string | null; scheduled_date: string; status: "planned" | "skipped"; is_deload: boolean };

export const dateKey = (d: Date, tz = DEFAULT_TZ) => format(new TZDate(d, tz), "yyyy-MM-dd");

// "yyyy-MM-dd"를 해당 시간대 자정으로
export function fromKey(key: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, tz).getTime());
}

export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function eachDay(fromKeyStr: string, toKeyStr: string): string[] {
  const out: string[] = [];
  const [y, m, d] = fromKeyStr.split("-").map(Number);
  for (let t = new Date(Date.UTC(y, m - 1, d)); out.length < 800; t = addDays(t, 1)) {
    const k = t.toISOString().slice(0, 10);
    if (k > toKeyStr) break;
    out.push(k);
  }
  return out;
}

// 'skipped' 일정은 같은 날 같은 루틴의 주간 반복 일정을 지운다(일정 이동 = 원래 날짜 skipped + 새 날짜 planned)
export function expandPlan(routines: RoutineLite[], schedules: ScheduleLite[], fromKeyStr: string, toKeyStr: string): Map<string, PlanItem[]> {
  const plan = new Map<string, PlanItem[]>();
  const skipped = new Set(schedules.filter((s) => s.status === "skipped").map((s) => `${s.scheduled_date}|${s.routine_id ?? "*"}`));
  for (const day of eachDay(fromKeyStr, toKeyStr)) {
    const wd = weekdayOf(day);
    const items: PlanItem[] = [];
    if (!skipped.has(`${day}|*`))
      for (const r of routines) if (r.weekdays.includes(wd) && !skipped.has(`${day}|${r.id}`)) items.push({ routineId: r.id, source: "weekly" });
    for (const s of schedules)
      if (s.scheduled_date === day && s.status === "planned" && s.routine_id) items.push({ routineId: s.routine_id, source: "schedule", scheduleId: s.id, isDeload: s.is_deload });
    if (items.length) plan.set(day, items);
  }
  return plan;
}

// 프로그램 일정 생성: 시작일부터 weeks주, pattern 요일마다. deloadEvery주마다 가벼운 주 표시
export function programDates(startKey: string, weeks: number, pattern: { weekday: number; routine_id: string }[], deloadEvery: number | null) {
  const out: { date: string; routine_id: string; is_deload: boolean }[] = [];
  const days = eachDay(startKey, addDays(new Date(`${startKey}T00:00:00Z`), weeks * 7 - 1).toISOString().slice(0, 10));
  days.forEach((day, i) => {
    const week = Math.floor(i / 7) + 1;
    for (const p of pattern) if (p.weekday === weekdayOf(day)) out.push({ date: day, routine_id: p.routine_id, is_deload: !!deloadEvery && week % deloadEvery === 0 });
  });
  return out;
}
