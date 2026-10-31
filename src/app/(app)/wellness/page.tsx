import { addDays } from "date-fns";
import { SimpleBarChart, SimpleLineChart } from "@/components/charts/charts";
import { PageHeader } from "@/components/common/empty-state";
import { WellnessForm, WellnessHistory } from "@/components/health/wellness-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferences, getWellness } from "@/lib/data";
import { dateKey, eachDay } from "@/lib/schedule";
import { INTEGRATIONS } from "@/lib/integrations";

export const metadata = { title: "수면·건강" };

export default async function WellnessPage() {
  const prefs = await getPreferences();
  const tz = prefs.timezone;
  const today = dateKey(new Date(), tz);
  const from = dateKey(addDays(new Date(), -29), tz);
  const logs = await getWellness(from, today);
  const byDay = new Map(logs.map((l) => [l.log_date, l]));
  const series = eachDay(from, today).map((d) => ({ label: d.slice(5).replace("-", "/"), sleep: byDay.get(d)?.sleep_hours ?? null, steps: byDay.get(d)?.steps ?? null, hr: byDay.get(d)?.resting_hr ?? null, condition: byDay.get(d)?.condition ?? null }));
  const avg = (k: "sleep_hours" | "steps" | "resting_hr") => {
    const v = logs.map((l) => l[k]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const has = (k: "sleep" | "steps" | "hr") => series.some((s) => s[k] != null);

  return (
    <>
      <PageHeader title="수면·건강" description="매일의 수면과 컨디션을 직접 기록합니다. AI 트레이너가 운동 강도를 조언할 때 참고합니다." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle>기록하기</CardTitle></CardHeader>
          <CardContent><WellnessForm today={today} logs={logs} /></CardContent>
        </Card>
        <div className="space-y-4">
          <section className="grid grid-cols-3 gap-3" aria-label="최근 30일 평균">
            {[["평균 수면", avg("sleep_hours"), "시간"], ["평균 걸음", avg("steps"), "보"], ["평균 안정시 심박", avg("resting_hr"), "bpm"]].map(([k, v, u]) => (
              <Card key={k as string} size="sm"><CardContent><p className="text-xs text-muted-foreground">{k} · 30일</p><p className="num text-xl font-semibold">{v == null ? "-" : `${(v as number).toLocaleString("ko-KR")}${u}`}</p></CardContent></Card>
            ))}
          </section>
          {has("sleep") && <Card><CardHeader><CardTitle>수면 시간 (시간)</CardTitle></CardHeader><CardContent><SimpleBarChart data={series} x="label" y="sleep" unit="시간" height={180} label="수면 시간" /></CardContent></Card>}
          {has("steps") && <Card><CardHeader><CardTitle>걸음 수 (보)</CardTitle></CardHeader><CardContent><SimpleBarChart data={series} x="label" y="steps" unit="보" height={180} label="걸음 수" /></CardContent></Card>}
          {has("hr") && <Card><CardHeader><CardTitle>안정시 심박수 (bpm)</CardTitle></CardHeader><CardContent><SimpleLineChart data={series} x="label" unit="bpm" height={180} label="안정시 심박수" lines={[{ key: "hr", name: "안정시 심박" }]} /></CardContent></Card>}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">최근 30일 기록이 없습니다.</p>}
        </div>
      </div>
      {logs.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>최근 기록</CardTitle></CardHeader>
          <CardContent><WellnessHistory logs={[...logs].reverse()} /></CardContent>
        </Card>
      )}
      <Card className="mt-4" size="sm">
        <CardHeader><CardTitle>외부 기기·앱 연동</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {INTEGRATIONS.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2"><span>{i.name}</span><span className="text-xs text-muted-foreground">{i.status}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">자동 연동은 아직 구현되지 않았습니다. 기록은 &apos;수동 입력&apos;으로 저장되며, 연동이 추가되면 출처가 구분되어 저장됩니다.</p>
        </CardContent>
      </Card>
    </>
  );
}
