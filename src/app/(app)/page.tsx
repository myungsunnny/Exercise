import Link from "next/link";
import { CalendarCheck, Dumbbell, Flame, Play, Timer, Weight } from "lucide-react";
import { TZDate } from "@date-fns/tz";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveSession, getMuscles, getPreferences, getRoutines, listCompletedSessions } from "@/lib/data";
import { formatDate, formatKg, formatMinutes, weekRange, weekStreak } from "@/lib/format";
import { muscleSets, sessionDurationSec, sessionSummary } from "@/lib/session-stats";
import { cn } from "@/lib/utils";
import { startWorkout } from "@/app/actions/workout";

export const metadata = { title: "홈" };

export default async function DashboardPage() {
  const now = new Date();
  const prefs = await getPreferences();
  const { start, end } = weekRange(now, prefs.timezone);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  const [active, routines, muscles, recent, week] = await Promise.all([
    getActiveSession(),
    getRoutines(),
    getMuscles(),
    listCompletedSessions({ from: yearAgo }),
    listCompletedSessions({ from: start, to: end }),
  ]);

  const today = new TZDate(now, prefs.timezone).getDay();
  const todays = routines.filter((r) => r.weekdays.includes(today));
  const weekly = week.reduce(
    (acc, s) => {
      const sum = sessionSummary(s);
      acc.volume += sum.volume;
      acc.sets += sum.sets;
      acc.duration += sessionDurationSec(s);
      return acc;
    },
    { volume: 0, sets: 0, duration: 0 },
  );
  const target = prefs.weekly_workout_target;
  const rate = target ? Math.min(100, Math.round((week.length / target) * 100)) : 0;
  const streak = weekStreak(recent.map((s) => s.started_at), now, prefs.timezone);
  const perMuscle = muscleSets(week);
  const maxSets = Math.max(1, ...perMuscle.values());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(now, "yyyy년 M월 d일 EEEE", prefs.timezone)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">오늘도 한 세트씩</h1>
        </div>
        {active ? (
          <Link href="/workout" className={cn(buttonVariants(), "h-12 px-5 text-base")}>
            <Play className="size-5" /> 진행 중인 운동 이어하기
          </Link>
        ) : (
          <form action={startWorkout}>
            <input type="hidden" name="mode" value="empty" />
            <button className={cn(buttonVariants(), "h-12 px-5 text-base")}>
              <Play className="size-5" /> 빈 운동 시작
            </button>
          </form>
        )}
      </div>

      <section aria-label="이번 주 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CalendarCheck} label="이번 주 운동" value={`${week.length}회`} sub={target ? `목표 ${target}회 · ${rate}%` : "목표 미설정"} progress={target ? rate : undefined} />
        <Stat icon={Weight} label="이번 주 운동량" value={formatKg(weekly.volume)} sub={`본세트 ${weekly.sets}세트`} />
        <Stat icon={Timer} label="이번 주 운동 시간" value={formatMinutes(weekly.duration)} />
        <Stat icon={Flame} label="연속 운동 주" value={`${streak}주`} sub="주 1회 이상 운동한 연속 주" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>오늘 예정된 운동</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todays.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                오늘 배치된 루틴이 없습니다. <Link href="/routines" className="text-primary underline-offset-4 hover:underline">루틴</Link>에서 요일을 지정할 수 있습니다.
              </p>
            ) : (
              todays.map((r) => (
                <form key={r.id} action={startWorkout} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <input type="hidden" name="mode" value="routine" />
                  <input type="hidden" name="routineId" value={r.id} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.routine_exercises.length}개 종목</p>
                  </div>
                  <button disabled={!!active} className={cn(buttonVariants({ variant: "secondary" }), "h-10")}>시작</button>
                </form>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>이번 주 근육별 세트</CardTitle>
          </CardHeader>
          <CardContent>
            {perMuscle.size === 0 ? (
              <p className="text-sm text-muted-foreground">이번 주 완료한 세트가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {muscles.map((m) => {
                  const v = perMuscle.get(m.id) ?? 0;
                  return (
                    <li key={m.id} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{m.name_ko}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(v / maxSets) * 100}%` }} />
                      </span>
                      <span className="num text-right">{v % 1 ? v.toFixed(1) : v}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">주동근 1세트, 보조근 0.5세트로 집계 · 워밍업 제외</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>최근 운동</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState icon={Dumbbell} title="아직 운동 기록이 없습니다">
              <p className="text-sm text-muted-foreground">위의 운동 시작 버튼이나 루틴으로 첫 운동을 기록해 보세요.</p>
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {recent.slice(0, 5).map((s) => {
                const sum = sessionSummary(s);
                return (
                  <li key={s.id}>
                    <Link href={`/history/${s.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.started_at, "M월 d일 (EEE)", prefs.timezone)} · {s.workout_exercises.length}종목 · {formatMinutes(sessionDurationSec(s))}
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm">{formatKg(sum.volume)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="bg-muted/30">
        <CardContent className="text-xs text-muted-foreground">
          준비 중인 카드: 개인 최고 기록·중량 추이·카드 순서 변경(Phase 2), AI 코칭 요약·운동 추천(Phase 3), 체중 변화(Phase 4)
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, progress }: { icon: React.ElementType; label: string; value: string; sub?: string; progress?: number }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden /> {label}
        </p>
        <p className="num text-2xl font-semibold">{value}</p>
        {progress != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
