import { TZDate } from "@date-fns/tz";
import { addDays, endOfMonth, endOfYear, startOfMonth, startOfWeek, startOfYear, subWeeks } from "date-fns";
import type { Granularity } from "@/lib/analytics";
import { DEFAULT_TZ } from "@/lib/format";
import { dateKey, fromKey } from "@/lib/schedule";

export const PERIODS = { week: "이번 주", month: "이번 달", "12w": "최근 12주", year: "올해", all: "전체", custom: "직접 선택" } as const;
export type PeriodKey = keyof typeof PERIODS;
export type Range = { from: Date; to: Date; g: Granularity };

const isKey = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const endOfDayKey = (k: string, tz: string) => new Date(fromKey(k, tz).getTime() + 86400_000 - 1);

function autoG(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / 86400_000;
  return days <= 45 ? "day" : days <= 200 ? "week" : days <= 900 ? "month" : "year";
}

export function resolveRange(period: string | undefined, fromS: string | undefined, toS: string | undefined, now: Date, firstSession: Date | null, tz = DEFAULT_TZ): Range & { key: PeriodKey } {
  const z = new TZDate(now, tz);
  const ms = (d: Date) => new Date(d.getTime());
  switch (period) {
    case "week": return { key: "week", from: ms(startOfWeek(z, { weekStartsOn: 1 })), to: new Date(addDays(startOfWeek(z, { weekStartsOn: 1 }), 7).getTime() - 1), g: "day" };
    case "12w": return { key: "12w", from: ms(subWeeks(startOfWeek(z, { weekStartsOn: 1 }), 11)), to: now, g: "week" };
    case "year": return { key: "year", from: ms(startOfYear(z)), to: ms(endOfYear(z)), g: "month" };
    case "all": {
      const from = firstSession ?? ms(startOfYear(z));
      return { key: "all", from, to: now, g: autoG(from, now) };
    }
    case "custom":
      if (isKey(fromS) && isKey(toS) && fromS! <= toS!) {
        const from = fromKey(fromS!, tz), to = endOfDayKey(toS!, tz);
        return { key: "custom", from, to, g: autoG(from, to) };
      }
    // fallthrough: 잘못된 입력이면 이번 달
    default: return { key: "month", from: ms(startOfMonth(z)), to: ms(endOfMonth(z)), g: "day" };
  }
}

// 비교 기간: 직접 지정하지 않으면 같은 길이의 직전 기간
export function compareRange(r: Range, cfrom: string | undefined, cto: string | undefined, tz = DEFAULT_TZ): { from: Date; to: Date } {
  if (isKey(cfrom) && isKey(cto) && cfrom! <= cto!) return { from: fromKey(cfrom!, tz), to: endOfDayKey(cto!, tz) };
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len - 1), to: new Date(r.from.getTime() - 1) };
}

export const toKey = (d: Date, tz = DEFAULT_TZ) => dateKey(d, tz);
