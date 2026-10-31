import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { DayPanel } from "@/components/calendar/day-panel";
import { PageHeader } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getActiveSession, getPreferences, getRoutines, getSchedules, listCompletedSessions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { dateKey, eachDay, expandPlan, fromKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "운동 캘린더" };
const DOW = ["월", "화", "수", "목", "금", "토", "일"];

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const prefs = await getPreferences();
  const tz = prefs.timezone;
  const today = dateKey(new Date(), tz);
  const view = sp.view === "week" ? "week" : sp.view === "day" ? "day" : "month";
  const selected = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const sel = new TZDate(fromKey(selected, tz), tz);

  const gridStart = view === "month" ? startOfWeek(startOfMonth(sel), { weekStartsOn: 1 }) : view === "week" ? startOfWeek(sel, { weekStartsOn: 1 }) : sel;
  const gridEnd = view === "month" ? endOfWeek(endOfMonth(sel), { weekStartsOn: 1 }) : view === "week" ? endOfWeek(sel, { weekStartsOn: 1 }) : sel;
  const fromK = dateKey(gridStart, tz), toK = dateKey(gridEnd, tz);

  const [routines, schedules, sessions, active] = await Promise.all([
    getRoutines(),
    getSchedules(fromK, toK),
    listCompletedSessions({ from: fromKey(fromK, tz), to: new Date(fromKey(toK, tz).getTime() + 86400_000 - 1) }),
    getActiveSession(),
  ]);
  const plan = expandPlan(routines, schedules, fromK, toK);
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = dateKey(new Date(s.started_at), tz);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const routineName = new Map(routines.map((r) => [r.id, r.name]));
  const days = eachDay(fromK, toK);

  const shift = (dir: -1 | 1) => dateKey(view === "month" ? addMonths(sel, dir) : addDays(sel, view === "week" ? 7 * dir : dir), tz);
  const href = (p: Record<string, string>) => `?${new URLSearchParams({ view, date: selected, ...p })}`;
  const status = (k: string) => {
    const done = byDay.get(k)?.length ?? 0;
    const planned = plan.get(k)?.length ?? 0;
    if (done) return "done";
    if (planned && k < today) return "missed";
    if (planned) return "planned";
    return k < today ? "rest" : "none";
  };

  return (
    <>
      <PageHeader
        title="운동 캘린더"
        action={
          <div className="flex rounded-lg border p-0.5 text-sm">
            {(["month", "week", "day"] as const).map((v) => (
              <Link key={v} href={href({ view: v })} className={cn("rounded-md px-3 py-1.5", view === v ? "bg-muted font-medium" : "text-muted-foreground")}>
                {{ month: "월", week: "주", day: "일" }[v]}
              </Link>
            ))}
          </div>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <Link href={href({ date: shift(-1) })} aria-label="이전" className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }))}><ChevronLeft className="size-5" /></Link>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold">
          {view === "month" ? formatDate(sel, "yyyy년 M월", tz) : view === "week" ? `${formatDate(gridStart, "M월 d일", tz)} ~ ${formatDate(gridEnd, "M월 d일", tz)}` : formatDate(sel, "yyyy년 M월 d일 (EEE)", tz)}
        </h2>
        <Link href={href({ date: shift(1) })} aria-label="다음" className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }))}><ChevronRight className="size-5" /></Link>
        <Link href={href({ date: today })} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>오늘</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {view !== "day" && (
          <div>
            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">{DOW.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((k) => {
                const st = status(k);
                const inMonth = view !== "month" || k.slice(0, 7) === selected.slice(0, 7);
                return (
                  <Link
                    key={k}
                    href={href({ date: k })}
                    scroll={false}
                    aria-label={`${k} ${({ done: "운동 완료", missed: "예정 미수행", planned: "운동 예정", rest: "휴식", none: "" })[st]}`}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg border p-1 text-left text-[11px]",
                      view === "month" ? "min-h-16" : "min-h-40",
                      !inMonth && "opacity-40",
                      k === selected && "ring-2 ring-ring",
                      st === "done" && "border-primary/50 bg-primary/10",
                      st === "missed" && "border-destructive/40",
                    )}
                  >
                    <span className={cn("num text-xs", k === today && "font-bold text-primary")}>{Number(k.slice(8))}</span>
                    {byDay.get(k)?.map((s) => <span key={s.id} className="truncate font-medium text-primary">✓ {s.title}</span>)}
                    {st !== "done" && plan.get(k)?.map((p, i) => (
                      <span key={i} className={cn("truncate", st === "missed" ? "text-destructive line-through" : "text-muted-foreground")}>
                        {p.isDeload && "D·"}{routineName.get(p.routineId)}
                      </span>
                    ))}
                    {st === "rest" && view === "week" && <span className="text-muted-foreground">휴식</span>}
                  </Link>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span><span className="text-primary">✓</span> 완료</span><span>회색: 예정</span><span className="text-destructive">취소선: 예정 미수행</span><span>D·: 가벼운 주(디로드)</span>
            </p>
          </div>
        )}
        <DayPanel
          date={selected}
          isPast={selected < today}
          sessions={(byDay.get(selected) ?? []).map((s) => ({ id: s.id, title: s.title, exercises: s.workout_exercises.length }))}
          plan={(plan.get(selected) ?? []).map((p) => ({ ...p, name: routineName.get(p.routineId) ?? "삭제된 루틴" }))}
          routines={routines.map((r) => ({ id: r.id, name: r.name }))}
          canStart={!active && selected === today}
        />
      </div>
    </>
  );
}
