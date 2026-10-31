import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { SimpleBarChart, SimpleLineChart } from "@/components/charts/charts";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bucketize, exerciseHistory, ONE_RM_FORMULA, personalRecords, PR_LABEL, totals, type ASession } from "@/lib/analytics";
import { getMuscles, getPreferences, getRoutines, getSchedules, listCompletedSessions } from "@/lib/data";
import { formatDate, formatKg, formatMinutes } from "@/lib/format";
import { compareRange, PERIODS, resolveRange, toKey } from "@/lib/periods";
import { expandPlan } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "통계·성과" };
const sel = "h-10 rounded-lg border bg-background px-2 text-sm";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const sp = await searchParams;
  const [all, prefs, muscles, routines] = await Promise.all([listCompletedSessions(), getPreferences(), getMuscles(), getRoutines()]);
  const tz = prefs.timezone;
  const now = new Date();

  if (all.length === 0)
    return (
      <>
        <PageHeader title="통계·성과" />
        <EmptyState icon={BarChart3} title="분석할 운동 기록이 없습니다">
          <Link href="/workout" className="text-sm text-primary hover:underline">첫 운동 기록하기</Link>
        </EmptyState>
      </>
    );

  const first = new Date(all[all.length - 1].started_at);
  const r = resolveRange(one(sp.period), one(sp.from), one(sp.to), now, first, tz);
  const c = compareRange(r, one(sp.cfrom), one(sp.cto), tz);
  const inRange = (s: ASession, f: Date, t: Date) => { const x = Date.parse(s.started_at); return x >= f.getTime() && x <= t.getTime(); };
  const cur = all.filter((s) => inRange(s, r.from, r.to));
  const prev = all.filter((s) => inRange(s, c.from, c.to));
  const t = totals(cur), pt = totals(prev);
  const buckets = bucketize(cur, r.g, r.from, r.to, tz).map((b) => ({ label: b.label, volume: b.volume, sessions: b.sessions, minutes: Math.round(b.durationSec / 60) }));

  // 기간 내 근육별 세트
  const perMuscle = muscles.map((m) => {
    let sets = 0;
    for (const s of cur) for (const e of s.workout_exercises) {
      const n = e.workout_sets.filter((x) => x.is_completed && x.set_type !== "warmup").length;
      const role = e.muscles.find((mm) => mm.muscle_id === m.id)?.role;
      if (role) sets += role === "primary" ? n : n / 2;
    }
    return { label: m.name_ko, sets };
  });

  // 종목 추이
  const { best, events } = personalRecords(all);
  const weighted = best.filter((b) => b.values.best_1rm || b.values.max_weight);
  const exId = one(sp.ex) && best.some((b) => b.exerciseId === one(sp.ex)) ? one(sp.ex)! : weighted[0]?.exerciseId ?? best[0]?.exerciseId;
  const exBest = best.find((b) => b.exerciseId === exId);
  const hist = exId ? exerciseHistory(cur, exId).map((p) => ({ label: formatDate(p.date, "M/d", tz), maxWeight: p.maxWeight, best1RM: p.best1RM, maxReps: p.maxReps, volume: p.volume })) : [];

  // 목표 달성률(주간 운동 횟수 목표 기준) & 루틴 수행률
  const weekBuckets = bucketize(cur, "week", r.from, new Date(Math.min(r.to.getTime(), now.getTime())), tz);
  const target = prefs.weekly_workout_target;
  const weeksHit = target ? weekBuckets.filter((b) => b.sessions >= target).length : 0;
  const fromK = toKey(r.from, tz), toK = toKey(new Date(Math.min(r.to.getTime(), now.getTime())), tz);
  const schedules = await getSchedules(fromK, toK);
  const plan = expandPlan(routines, schedules, fromK, toK);
  let planned = 0, done = 0;
  for (const [day, items] of plan) for (const it of items) {
    planned++;
    if (cur.some((s) => s.routine_id === it.routineId && toKey(new Date(s.started_at), tz) === day)) done++;
  }

  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? "신규" : "-") : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`);

  return (
    <>
      <PageHeader title="통계·성과" description={`${formatDate(r.from, "yyyy.M.d", tz)} ~ ${formatDate(r.to, "yyyy.M.d", tz)}`} />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">기간
          <select name="period" defaultValue={r.key} className={cn(sel, "block")}>
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">시작<input type="date" name="from" defaultValue={one(sp.from) ?? toKey(r.from, tz)} className={cn(sel, "block")} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">종료<input type="date" name="to" defaultValue={one(sp.to) ?? toKey(r.to, tz)} className={cn(sel, "block")} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">비교 시작<input type="date" name="cfrom" defaultValue={toKey(c.from, tz)} className={cn(sel, "block")} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">비교 종료<input type="date" name="cto" defaultValue={toKey(c.to, tz)} className={cn(sel, "block")} /></label>
        {exId && <input type="hidden" name="ex" value={exId} />}
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">적용</button>
      </form>
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">시작·종료 날짜는 &quot;직접 선택&quot;일 때 적용됩니다. 비교 기간을 비우면 같은 길이의 직전 기간과 비교합니다.</p>

      <section aria-label="기간 합계" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["운동 횟수", `${t.sessions}회`, delta(t.sessions, pt.sessions)],
          ["총 운동량", formatKg(t.volume), delta(t.volume, pt.volume)],
          ["총 운동 시간", formatMinutes(t.durationSec), delta(t.durationSec, pt.durationSec)],
          ["총 세트(본세트)", `${t.sets}세트`, delta(t.sets, pt.sets)],
          ["총 반복", `${t.reps.toLocaleString("ko-KR")}회`, delta(t.reps, pt.reps)],
        ].map(([k, v, d]) => (
          <Card key={k} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="num text-xl font-semibold">{v}</p>
              <p className="text-xs text-muted-foreground">비교 기간 대비 <span className={cn(d.startsWith("+") && "text-primary", d.startsWith("-") && d !== "-" && "text-destructive")}>{d}</span></p>
            </CardContent>
          </Card>
        ))}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        비교 기간 {formatDate(c.from, "yyyy.M.d", tz)}~{formatDate(c.to, "yyyy.M.d", tz)}: {pt.sessions}회 · {formatKg(pt.volume)} · {formatMinutes(pt.durationSec)}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>운동량 추이 (kg)</CardTitle></CardHeader>
          <CardContent>
            <SimpleBarChart data={buckets} x="label" y="volume" unit="kg" label="운동량" />
            <p className="mt-2 text-xs text-muted-foreground">완료한 본세트의 중량 × 횟수 합계 · 단위 {({ day: "일", week: "주", month: "월", year: "년" })[r.g]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>운동 빈도 (회)</CardTitle></CardHeader>
          <CardContent>
            <SimpleBarChart data={buckets} x="label" y="sessions" unit="회" label="운동 횟수" />
            <p className="mt-2 text-xs text-muted-foreground">
              주간 목표({target}회) 달성 {weeksHit}/{weekBuckets.length}주 · 루틴 수행률 {planned ? `${Math.round((done / planned) * 100)}% (${done}/${planned})` : "예정된 루틴 없음"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>운동 시간 (분)</CardTitle></CardHeader>
          <CardContent><SimpleBarChart data={buckets} x="label" y="minutes" unit="분" label="운동 시간" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>근육 부위별 세트</CardTitle></CardHeader>
          <CardContent>
            <SimpleBarChart data={perMuscle} x="label" y="sets" unit="세트" label="근육별 세트" />
            <p className="mt-2 text-xs text-muted-foreground">주동근 1세트, 보조근 0.5세트 · 워밍업 제외</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>종목별 기록 변화</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form method="get" className="flex gap-2">
            {(["period", "from", "to", "cfrom", "cto"] as const).map((k) => one(sp[k]) && <input key={k} type="hidden" name={k} value={one(sp[k])} />)}
            <select name="ex" defaultValue={exId} className={cn(sel, "min-w-0 flex-1")} aria-label="종목 선택">
              {best.map((b) => <option key={b.exerciseId} value={b.exerciseId}>{b.exerciseName} ({b.sessions}회)</option>)}
            </select>
            <button className="h-10 rounded-lg border px-3 text-sm">보기</button>
          </form>
          {hist.length === 0 ? (
            <p className="text-sm text-muted-foreground">선택한 기간에 이 종목의 완료 기록이 없습니다.</p>
          ) : exBest?.values.best_1rm || exBest?.values.max_weight ? (
            <SimpleLineChart data={hist} x="label" unit="kg" label="중량 추이"
              lines={[{ key: "maxWeight", name: "최고 중량" }, { key: "best1RM", name: "추정 1RM", dashed: true }]} />
          ) : (
            <SimpleLineChart data={hist} x="label" unit="회" label="반복 추이" lines={[{ key: "maxReps", name: "최다 반복" }]} />
          )}
          {exBest && (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {Object.entries(exBest.values).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-2">
                  <dt className="text-xs text-muted-foreground">{PR_LABEL[k as keyof typeof PR_LABEL]}</dt>
                  <dd className="num font-semibold">{k === "max_reps" ? `${v!.value}회` : formatKg(v!.value)}</dd>
                  <dd className="text-xs text-muted-foreground">{formatDate(v!.date, "yy.M.d", tz)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-muted-foreground">추정 1RM은 실제 측정값이 아닌 추정치입니다 · {ONE_RM_FORMULA}</p>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>종목별 최고 기록</CardTitle></CardHeader>
          <CardContent>
            <table className="num w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left font-normal">종목</th><th className="text-right font-normal">최고 중량</th><th className="text-right font-normal">추정 1RM</th><th className="text-right font-normal">최근</th></tr></thead>
              <tbody>
                {best.slice(0, 15).map((b) => (
                  <tr key={b.exerciseId} className="border-t">
                    <td className="max-w-40 truncate py-1.5">{b.exerciseName}</td>
                    <td className="text-right">{b.values.max_weight ? formatKg(b.values.max_weight.value) : b.values.max_reps ? `${b.values.max_reps.value}회` : "-"}</td>
                    <td className="text-right">{b.values.best_1rm ? formatKg(b.values.best_1rm.value) : "-"}</td>
                    <td className="text-right text-muted-foreground">{formatDate(b.lastDate, "M/d", tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>최근 개인 기록 경신</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 ? <p className="text-sm text-muted-foreground">같은 종목을 두 번 이상 기록하면 경신 내역이 표시됩니다.</p> : (
              <ul className="space-y-2 text-sm">
                {events.slice(0, 10).map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <Link href={`/history/${e.sessionId}`} className="truncate hover:text-primary">{e.exerciseName} · {PR_LABEL[e.kind]}</Link>
                    <span className="num shrink-0">{e.kind === "max_reps" ? `${e.previous}→${e.value}회` : `${e.previous}→${e.value}kg`} <span className="text-xs text-muted-foreground">{formatDate(e.date, "M/d", tz)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">근육별 상세(주간 목표·최근 훈련일·회복 참고)는 <Link href="/muscles" className="text-primary hover:underline">근육별 분석</Link>에서 볼 수 있습니다.</p>
    </>
  );
}

