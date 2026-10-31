"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarArrowUp, Play, Plus, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { addSchedule, moveSchedule, skipSchedule } from "@/app/actions/plan";
import { startWorkout } from "@/app/actions/workout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlanRow = { routineId: string; source: "weekly" | "schedule"; scheduleId?: string; isDeload?: boolean; name: string };

export function DayPanel({ date, isPast, sessions, plan, routines, canStart }: {
  date: string; isPast: boolean; sessions: { id: string; title: string; exercises: number }[]; plan: PlanRow[]; routines: { id: string; name: string }[]; canStart: boolean;
}) {
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState<number | null>(null);
  const [addRoutine, setAddRoutine] = useState(routines[0]?.id ?? "");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg); else toast.error(r.error ?? "실패했습니다.");
      setMoving(null);
    });

  return (
    <Card>
      <CardHeader><CardTitle>{date.replace(/-/g, ".")}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">완료한 운동</h3>
          {sessions.length === 0 ? <p className="text-muted-foreground">{isPast ? "기록 없음" : "-"}</p> : sessions.map((s) => (
            <Link key={s.id} href={`/history/${s.id}`} className="block rounded-lg border p-2 hover:border-primary">{s.title} <span className="text-xs text-muted-foreground">· {s.exercises}종목</span></Link>
          ))}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">예정 운동</h3>
          {plan.length === 0 && <p className="text-muted-foreground">예정 없음 (휴식일)</p>}
          <ul className="space-y-2">
            {plan.map((p, i) => (
              <li key={i} className="rounded-lg border p-2">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    <span className="ml-1 text-xs text-muted-foreground">{p.source === "weekly" ? "매주 반복" : p.isDeload ? "가벼운 주" : "지정 일정"}</span>
                  </span>
                  {canStart && (
                    <form action={startWorkout}>
                      <input type="hidden" name="mode" value="routine" />
                      <input type="hidden" name="routineId" value={p.routineId} />
                      <Button type="submit" size="icon" variant="ghost" aria-label="시작"><Play className="text-primary" /></Button>
                    </form>
                  )}
                  <Button size="icon" variant="ghost" aria-label="날짜 이동" onClick={() => setMoving(moving === i ? null : i)}><CalendarArrowUp /></Button>
                  <Button size="icon" variant="ghost" aria-label={p.source === "weekly" ? "이 날짜만 건너뛰기" : "일정 삭제"} disabled={pending}
                    onClick={() => run(() => skipSchedule({ scheduleId: p.scheduleId ?? null, routineId: p.routineId, date }), p.source === "weekly" ? "이 날짜를 건너뜁니다." : "일정을 삭제했습니다.")}>
                    <SkipForward />
                  </Button>
                </div>
                {moving === i && (
                  <form
                    className="mt-2 flex gap-2"
                    action={(fd) => {
                      const to = String(fd.get("to"));
                      run(() => moveSchedule({ scheduleId: p.scheduleId ?? null, routineId: p.routineId, from: date, to }), `${to}로 이동했습니다.`);
                    }}
                  >
                    <input type="date" name="to" required defaultValue={date} className="h-10 flex-1 rounded-lg border bg-background px-2" />
                    <Button type="submit" className="h-10" disabled={pending}>이동</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {routines.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">이 날짜에 루틴 추가</h3>
            <div className="flex gap-2">
              <select value={addRoutine} onChange={(e) => setAddRoutine(e.target.value)} aria-label="루틴" className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2">
                {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button className="h-10" disabled={pending || !addRoutine} onClick={() => run(() => addSchedule(addRoutine, date), "일정을 추가했습니다.")}><Plus /> 추가</Button>
            </div>
          </section>
        )}
        <p className="text-xs text-muted-foreground">매주 반복 일정은 <Link href="/plan" className="text-primary hover:underline">주간·월간 계획</Link>에서 요일을 바꿀 수 있습니다.</p>
      </CardContent>
    </Card>
  );
}
