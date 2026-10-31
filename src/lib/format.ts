import { TZDate } from "@date-fns/tz";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ko } from "date-fns/locale";

export const DEFAULT_TZ = "Asia/Seoul";

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

export function formatMinutes(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function formatKg(n: number): string {
  return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}kg`;
}

export function formatDate(iso: string | Date, pattern = "M월 d일 (EEE)", tz = DEFAULT_TZ): string {
  return format(new TZDate(new Date(iso), tz), pattern, { locale: ko });
}

// 사용자 시간대 기준 이번 주(월요일 시작) 범위
export function weekRange(now: Date, tz = DEFAULT_TZ): { start: Date; end: Date } {
  const z = new TZDate(now, tz);
  return {
    start: new Date(startOfWeek(z, { weekStartsOn: 1 }).getTime()),
    end: new Date(endOfWeek(z, { weekStartsOn: 1 }).getTime()),
  };
}

// 연속 운동 주(週) 수: 이번 주 또는 지난주부터 거꾸로, 운동한 주가 끊길 때까지
export function weekStreak(sessionStarts: string[], now: Date, tz = DEFAULT_TZ): number {
  const weekKey = (d: Date) => startOfWeek(new TZDate(d, tz), { weekStartsOn: 1 }).getTime();
  const weeks = new Set(sessionStarts.map((s) => weekKey(new Date(s))));
  const WEEK = 7 * 24 * 3600 * 1000;
  let cursor = weekKey(now);
  if (!weeks.has(cursor)) cursor = weekKey(new Date(cursor - WEEK / 2));
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = weekKey(new Date(cursor - WEEK / 2));
  }
  return streak;
}
