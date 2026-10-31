import Link from "next/link";
import { CalendarCheck, Dumbbell, Flame, Play, Timer, Trophy, Weight } from "lucide-react";
import { SimpleLineChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { DashboardGrid, type DashCard } from "@/components/dashboard/dashboard-grid";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exerciseHistory, personalRecords, PR_LABEL } from "@/lib/analytics";
import { getActiveSession, getGoals, getMuscles, getPreferences, getRoutines, getSchedules, listCompletedSessions } from "@/lib/data";
import { formatDate, formatKg, formatMinutes, weekRange, weekStreak } from "@/lib/format";
import { GOAL_KIND_LABEL, GOAL_UNIT, goalProgress } from "@/lib/goals";
import { dateKey, expandPlan } from "@/lib/schedule";
import { muscleSets, sessionDurationSec, sessionSummary } from "@/lib/session-stats";
import { cn } from "@/lib/utils";
import { startWorkout } from "@/app/actions/workout";

export const metadata = { title: "홈" };

export default async function DashboardPage() {
  const now = new Date();
  const prefs = await getPreferences();
  const tz = prefs.timezone;
  const { start, end } = weekRange(now, tz);
  const today = dateKey(now, tz);
  const [active, routines, muscles, all, schedules, goals] = await Promise.all([
    getActiveSession(),
    getRoutines(),
    getMuscles(),
    listCompletedSessions(),
    getSchedules(today, today),
    getGoals(),
  ]);
  const week = all.filter((s) => s.started_at >= start.toISOString() && s.started_at <= end.toISOString());

  const todays = expandPlan(routines, schedules, today, today).get(today) ?? [];
  const routineById = new Map(routines.map((r) => [r.id, r]));
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
  const streak = weekStreak(all.map((s) => s.started_at), now, tz);
  const perMuscle = muscleSets(week);
  const maxSets = Math.max(1, ...perMuscle.values());
  const { best, events } = personalRecords(all);
  const main = best.find((b) => b.values.best_1rm);
  const trend = main ? exerciseHistory(all, main.exerciseId).slice(-12).map((p) => ({ label: formatDate(p.date, "M/d", tz), best1RM: p.best1RM, maxWeight: p.maxWeight })) : [];
  const goalCtx = { weekSessions: week.length, weekMinutes: Math.round(weekly.duration / 60), streak, best, bodyWeight: null };

  const cards: DashCard[] = [
    {
      key: "summary",
      title: "이번 주 요약",
      wide: true,
      node: (
        <section aria-label="이번 주 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={CalendarCheck} label="이번 주 운동" value={`${week.length}회`} sub={target ? `목표 ${target}회 · ${rate}%` : "목표 미설정"} progress={target ? rate : undefined} />
          <Stat icon={Weight} label="이번 주 운동량" value={formatKg(weekly.volume)} sub={`본세트 ${weekly.sets}세트`} />
          <Stat icon={Timer} label="이번 주 운동 시간" value={formatMinutes(weekly.duration)} />
          <Stat icon={Flame} label="연속 운동 주" value={`${streak}주`} sub="주 1회 이상 운동한 연속 주" />
        </section>
      ),
    },
    {
      key: "today",
      title: "오늘 예정",
      node: (
        <Card className="h-full">
          <CardHeader><CardTitle>오늘 예정된 운동</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {todays.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                오늘은 예정된 운동이 없습니다(휴식일). <Link href="/plan" className="text-primary underline-offset-4 hover:underline">주간 계획</Link>에서 요일별 루틴을 배치할 수 있습니다.
              </p>
            ) : (
              todays.map((p, i) => {
                const r = routineById.get(p.routineId);
                return (
                  <form key={i} action={startWorkout} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <input type="hidden" name="mode" value="routine" />
                    <input type="hidden" name="routineId" value={p.routineId} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r?.name ?? "루틴"}</p>
                      <p className="text-xs text-muted-foreground">{r?.routine_exercises.length ?? 0}개 종목{p.isDeload && " · 가벼운 주"}</p>
                    </div>
                    <button disabled={!!active} className={cn(buttonVariants({ variant: "secondary" }), "h-10")}>시작</button>
                  </form>
                );
              })
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "muscles",
      title: "근육별 세트",
      node: (
        <Card className="h-full">
          <CardHeader><CardTitle><Link href="/muscles" className="hover:text-primary">이번 주 근육별 세트</Link></CardTitle></CardHeader>
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
      ),
    },
    {
      key: "prs",
      title: "최근 개인 기록",
      node: (
        <Card className="h-full">
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-primary" /> 최근 개인 최고 기록</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">같은 종목을 두 번 이상 기록하면 경신한 기록이 여기에 표시됩니다.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {events.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <Link href={`/history/${e.sessionId}`} className="truncate hover:text-primary">{e.exerciseName} <span className="text-muted-foreground">· {PR_LABEL[e.kind]}</span></Link>
                    <span className="num shrink-0">{e.kind === "max_reps" ? `${e.value}회` : formatKg(e.value)} <span className="text-xs text-muted-foreground">{formatDate(e.date, "M/d", tz)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "trend",
      title: "중량 추이",
      node: (
        <Card className="h-full">
          <CardHeader><CardTitle><Link href={main ? `/stats?period=all&ex=${main.exerciseId}` : "/stats"} className="hover:text-primary">{main ? `${main.exerciseName} 중량 추이` : "주요 운동 중량 추이"}</Link></CardTitle></CardHeader>
          <CardContent>
            {trend.length < 2 ? (
              <p className="text-sm text-muted-foreground">중량 운동을 두 번 이상 기록하면 추이 그래프가 표시됩니다.</p>
            ) : (
              <>
                <SimpleLineChart data={trend} x="label" unit="kg" height={180} label="중량 추이"
                  lines={[{ key: "maxWeight", name: "최고 중량" }, { key: "best1RM", name: "추정 1RM", dashed: true }]} />
                <p className="mt-1 text-xs text-muted-foreground">가장 자주 수행한 중량 종목 · 최근 12회 · 1RM은 Epley 추정치</p>
              </>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "goals",
      title: "목표",
      node: (
        <Card className="h-full">
          <CardHeader><CardTitle><Link href="/goals" className="hover:text-primary">목표 진행률</Link></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground"><Link href="/goals" className="text-primary hover:underline">목표</Link>를 설정하면 진행률이 표시됩니다.</p>
            ) : (
              goals.slice(0, 4).map((g) => {
                const p = goalProgress(g, goalCtx);
                return (
                  <div key={g.id} className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{GOAL_KIND_LABEL[g.kind]}{g.exercises && ` · ${g.exercises.name_ko}`}</span>
                      <span className="num shrink-0 text-muted-foreground">{p.current ?? "-"}/{g.target_value}{GOAL_UNIT[g.kind]}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "recent",
      title: "최근 운동",
      wide: true,
      node: (
        <Card>
          <CardHeader><CardTitle>최근 운동</CardTitle></CardHeader>
          <CardContent>
            {all.length === 0 ? (
              <EmptyState icon={Dumbbell} title="아직 운동 기록이 없습니다">
                <p className="text-sm text-muted-foreground">위의 운동 시작 버튼이나 루틴으로 첫 운동을 기록해 보세요.</p>
              </EmptyState>
            ) : (
              <ul className="divide-y">
                {all.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={`/history/${s.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.started_at, "M월 d일 (EEE)", tz)} · {s.workout_exercises.length}종목 · {formatMinutes(sessionDurationSec(s))}
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm">{formatKg(sessionSummary(s).volume)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(now, "yyyy년 M월 d일 EEEE", tz)}</p>
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
      <DashboardGrid cards={cards} saved={prefs.dashboard_order} />
      <p className="text-xs text-muted-foreground">AI 코칭 요약·운동 추천은 Phase 3, 체중 변화는 Phase 4에서 추가됩니다.</p>
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
