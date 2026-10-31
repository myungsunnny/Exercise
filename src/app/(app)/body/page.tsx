import { Ruler } from "lucide-react";
import { SimpleLineChart } from "@/components/charts/charts";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { BodyHistory, MeasurementForm, PhotoSection } from "@/components/health/body-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBodyMeasurements, getBodyPhotos, getPreferences } from "@/lib/data";
import { movingAverage, trendChange, type Point } from "@/lib/health";
import { dateKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "신체 변화" };

const METRICS = [
  { key: "weight_kg", label: "체중", unit: "kg" },
  { key: "body_fat_pct", label: "체지방률", unit: "%" },
  { key: "skeletal_muscle_kg", label: "골격근량", unit: "kg" },
  { key: "muscle_kg", label: "근육량", unit: "kg" },
  { key: "waist_cm", label: "허리둘레", unit: "cm" },
  { key: "chest_cm", label: "가슴둘레", unit: "cm" },
  { key: "arm_cm", label: "팔둘레", unit: "cm" },
  { key: "thigh_cm", label: "허벅지둘레", unit: "cm" },
] as const;

export default async function BodyPage() {
  const [rows, photos, prefs] = await Promise.all([getBodyMeasurements(), getBodyPhotos(), getPreferences()]);
  const today = dateKey(new Date(), prefs.timezone);
  const series = (key: (typeof METRICS)[number]["key"]): Point[] => rows.filter((r) => r[key] != null).map((r) => ({ date: r.measured_on, value: r[key] as number }));
  const weight = series("weight_kg");
  const weightAvg = movingAverage(weight);
  const chartData = weight.map((p, i) => ({ label: p.date.slice(5).replace("-", "/"), value: p.value, avg: weightAvg[i].value }));
  const customKeys = [...new Set(rows.flatMap((r) => Object.keys(r.custom ?? {})))];

  return (
    <>
      <PageHeader title="신체 변화" description="체성분 측정값은 수분·식사·측정 시간에 따라 하루 단위로 오차가 커서, 7일 평균 추세로 비교합니다." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle>측정 기록</CardTitle></CardHeader>
          <CardContent><MeasurementForm today={today} rows={rows} customKeys={customKeys} /></CardContent>
        </Card>

        <div className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState icon={Ruler} title="아직 측정 기록이 없습니다"><p className="text-sm text-muted-foreground">왼쪽에서 체중부터 기록해 보세요.</p></EmptyState>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="최근 측정값">
                {METRICS.map((m) => {
                  const s = series(m.key);
                  if (!s.length) return null;
                  const c30 = trendChange(s, 30);
                  return (
                    <Card key={m.key} size="sm">
                      <CardContent>
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <p className="num text-xl font-semibold">{s[s.length - 1].value}{m.unit}</p>
                        <p className="text-xs text-muted-foreground">
                          {c30 ? <>30일 추세 <span className={cn(c30.diff !== 0 && "text-foreground")}>{c30.diff > 0 ? "+" : ""}{c30.diff}{m.unit}</span></> : `${s[s.length - 1].date.slice(5).replace("-", "/")} 측정`}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
              {weight.length > 1 && (
                <Card>
                  <CardHeader><CardTitle>체중 추이 (kg)</CardTitle></CardHeader>
                  <CardContent>
                    <SimpleLineChart data={chartData} x="label" unit="kg" label="체중 추이" lines={[{ key: "value", name: "측정값" }, { key: "avg", name: "7일 평균", dashed: true }]} />
                    <p className="mt-1 text-xs text-muted-foreground">점선은 직전 7일 측정값의 평균입니다. 하루 이틀의 변화보다 평균선의 방향을 보세요.</p>
                  </CardContent>
                </Card>
              )}
              {(["body_fat_pct", "skeletal_muscle_kg", "waist_cm"] as const).map((k) => {
                const s = series(k);
                if (s.length < 2) return null;
                const m = METRICS.find((x) => x.key === k)!;
                return (
                  <Card key={k}>
                    <CardHeader><CardTitle>{m.label} ({m.unit})</CardTitle></CardHeader>
                    <CardContent><SimpleLineChart data={s.map((p) => ({ label: p.date.slice(5).replace("-", "/"), value: p.value }))} x="label" unit={m.unit} height={180} label={m.label} lines={[{ key: "value", name: m.label }]} /></CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>측정 내역</CardTitle></CardHeader>
          <CardContent><BodyHistory rows={[...rows].reverse()} customKeys={customKeys} /></CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>변화 사진 <span className="text-xs font-normal text-muted-foreground">· 비공개 저장소, 본인만 볼 수 있음</span></CardTitle></CardHeader>
        <CardContent><PhotoSection photos={photos} today={today} /></CardContent>
      </Card>
    </>
  );
}
