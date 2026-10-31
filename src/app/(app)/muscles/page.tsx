import Link from "next/link";
import { PageHeader } from "@/components/common/empty-state";
import { BodyMap } from "@/components/muscles/body-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { muscleStats, recoveryHint } from "@/lib/analytics";
import { getMuscles, getPreferences, listCompletedSessions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { DEFAULT_MUSCLE_SET_TARGET } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MuscleTargetsForm } from "./targets-form";

export const metadata = { title: "근육별 분석" };

export default async function MusclesPage({ searchParams }: PageProps<"/muscles">) {
  const { m } = await searchParams;
  const now = new Date();
  const [muscles, prefs, sessions] = await Promise.all([
    getMuscles(),
    getPreferences(),
    listCompletedSessions({ from: new Date(now.getTime() - 60 * 86400_000) }),
  ]);
  const stats = muscleStats(sessions, muscles.map((x) => x.id), now, prefs.timezone);
  const target = (id: string) => prefs.muscle_set_targets[id] ?? DEFAULT_MUSCLE_SET_TARGET;
  const values = Object.fromEntries(stats.map((s) => [s.muscleId, s.setsThisWeek / target(s.muscleId)]));
  const selected = typeof m === "string" ? m : undefined;
  const name = (id: string) => muscles.find((x) => x.id === id)?.name_ko ?? id;
  const sel = stats.find((s) => s.muscleId === selected);

  return (
    <>
      <PageHeader title="근육별 분석" description="이번 주(월요일 시작) 완료한 본세트 기준 · 색이 진할수록 주간 목표에 가까움" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="space-y-3">
            <BodyMap values={values} selected={selected} />
            {sel ? (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-semibold">{name(sel.muscleId)}</p>
                <p>이번 주 {fmt(sel.setsThisWeek)} / {target(sel.muscleId)}세트 · 지난주 {fmt(sel.setsLastWeek)}세트</p>
                <p className="text-muted-foreground">최근 4주 {sel.sessions28d}회 훈련(주동근) · {recoveryHint(sel.hoursSince).label}</p>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">부위를 누르면 상세가 표시됩니다.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>부위별 현황</CardTitle></CardHeader>
          <CardContent>
            <table className="num w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left font-normal">부위</th><th className="text-right font-normal">이번 주</th><th className="text-right font-normal">변화</th><th className="text-right font-normal">4주 빈도</th><th className="text-right font-normal">최근 훈련</th></tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const diff = s.setsThisWeek - s.setsLastWeek;
                  const hint = recoveryHint(s.hoursSince);
                  return (
                    <tr key={s.muscleId} className={cn("border-t", selected === s.muscleId && "bg-muted/50")}>
                      <td className="py-2"><Link href={`?m=${s.muscleId}`} scroll={false} className="hover:text-primary">{name(s.muscleId)}</Link></td>
                      <td className="text-right">
                        <span className={cn(s.setsThisWeek >= target(s.muscleId) && "text-primary")}>{fmt(s.setsThisWeek)}</span>
                        <span className="text-muted-foreground">/{target(s.muscleId)}</span>
                      </td>
                      <td className={cn("text-right", diff > 0 && "text-primary", diff < 0 && "text-muted-foreground")}>{diff === 0 ? "-" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}</td>
                      <td className="text-right">{s.sessions28d}회</td>
                      <td className={cn("text-right text-xs", hint.tone === "recent" ? "text-amber-500" : "text-muted-foreground")}>
                        {s.lastTrained ? formatDate(s.lastTrained, "M/d", prefs.timezone) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              주동근 1세트, 보조근 0.5세트로 집계합니다. 최근 훈련일의 주황색은 48시간 이내 훈련을 뜻하며, 실제 회복도를 측정한 값이 아닌 기록 기반 참고 정보입니다. 통증이 있다면 운동을 쉬고 전문가와 상담하세요.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>주간 목표 세트</CardTitle></CardHeader>
        <CardContent>
          <MuscleTargetsForm muscles={muscles.map((x) => ({ id: x.id, name: x.name_ko, target: target(x.id) }))} />
        </CardContent>
      </Card>
    </>
  );
}

const fmt = (n: number) => (n % 1 ? n.toFixed(1) : String(n));
