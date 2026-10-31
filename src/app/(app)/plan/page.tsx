import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences, getPrograms, getRoutines, getSchedules, listCompletedSessions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { dateKey } from "@/lib/schedule";
import { ProgramForm, ProgramDelete, WeekdayGrid } from "./plan-client";

export const metadata = { title: "주간·월간 계획" };

export default async function PlanPage() {
  const [routines, programs, prefs] = await Promise.all([getRoutines(), getPrograms(), getPreferences()]);
  const tz = prefs.timezone;
  const today = dateKey(new Date(), tz);

  // 프로그램별 진행률: 생성된 일정 중 지난 날짜, 그날 같은 루틴 완료 여부
  const progress = await Promise.all(
    programs.map(async (p) => {
      const end = new Date(Date.parse(`${p.start_date}T00:00:00Z`) + (p.weeks * 7 - 1) * 86400_000).toISOString().slice(0, 10);
      const [sch, sessions] = await Promise.all([
        getSchedules(p.start_date, end),
        listCompletedSessions({ from: new Date(`${p.start_date}T00:00:00+09:00`) }),
      ]);
      const mine = sch.filter((s) => s.program_id === p.id && s.status === "planned");
      const past = mine.filter((s) => s.scheduled_date <= today);
      const done = past.filter((s) => sessions.some((x) => x.routine_id === s.routine_id && dateKey(new Date(x.started_at), tz) === s.scheduled_date)).length;
      return { id: p.id, end, total: mine.length, past: past.length, done };
    }),
  );

  return (
    <>
      <PageHeader title="주간·월간 계획" description="요일별 반복 루틴과 4·8·12주 장기 프로그램을 관리합니다. 월간 일정은 캘린더에서 확인하세요." />
      {routines.length === 0 ? (
        <EmptyState icon={CalendarDays} title="먼저 루틴을 만들어 주세요">
          <Link href="/routines" className="text-sm text-primary hover:underline">루틴 만들기</Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>주간 루틴 배치 (매주 반복)</CardTitle></CardHeader>
            <CardContent>
              <WeekdayGrid routines={routines.map((r) => ({ id: r.id, name: r.name, weekdays: r.weekdays }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>장기 프로그램</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {programs.length === 0 && <p className="text-sm text-muted-foreground">진행 중인 프로그램이 없습니다.</p>}
              {programs.map((p) => {
                const pr = progress.find((x) => x.id === p.id)!;
                const pct = pr.past ? Math.round((pr.done / pr.past) * 100) : 0;
                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(`${p.start_date}T00:00:00+09:00`, "yyyy.M.d", tz)} ~ {formatDate(`${pr.end}T00:00:00+09:00`, "yyyy.M.d", tz)} · {p.weeks}주
                          {p.deload_every && ` · ${p.deload_every}주마다 가벼운 주`}
                        </p>
                      </div>
                      <ProgramDelete id={p.id} />
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-muted-foreground">수행 {pr.done}/{pr.past}회 (지난 일정 기준 {pct}%) · 전체 {pr.total}회 예정</p>
                  </div>
                );
              })}
              <ProgramForm routines={routines.map((r) => ({ id: r.id, name: r.name }))} today={today} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
