import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { RoutineActions, TemplateButton } from "@/components/routines/routine-actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSession, getPreferences, getRoutineUsage, getRoutines } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { ROUTINE_TEMPLATES } from "@/lib/routine-templates";
import { cn } from "@/lib/utils";
import { estimateRoutineMinutes } from "@/lib/workout/stats";

export const metadata = { title: "운동 루틴" };
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function RoutinesPage() {
  const [routines, usage, prefs, active] = await Promise.all([getRoutines(), getRoutineUsage(), getPreferences(), getActiveSession()]);

  return (
    <>
      <PageHeader
        title="운동 루틴"
        description="루틴은 운동 템플릿입니다. 루틴을 수정해도 지난 운동 기록은 바뀌지 않습니다."
        action={<Link href="/routines/new" className={cn(buttonVariants(), "h-10")}><Plus /> 새 루틴</Link>}
      />

      {routines.length === 0 ? (
        <EmptyState icon={ClipboardList} title="저장된 루틴이 없습니다">
          <p className="text-sm text-muted-foreground">직접 만들거나 아래 기본 템플릿을 내 루틴으로 추가하세요.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {routines.map((r) => {
            const u = usage.get(r.id);
            return (
              <Card key={r.id} size="sm">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/routines/${r.id}`} className="min-w-0">
                      <h2 className="truncate font-semibold hover:text-primary">{r.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {r.routine_exercises.length}종목 · 약 {estimateRoutineMinutes(r.routine_exercises, prefs.default_rest_seconds)}분
                        {r.weekdays.length > 0 && <> · {r.weekdays.map((d) => DAYS[d]).join("")}</>}
                      </p>
                    </Link>
                    <RoutineActions id={r.id} canStart={!active} />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{r.routine_exercises.map((x) => x.exercises?.name_ko).join(", ") || "종목 없음"}</p>
                  <p className="text-xs text-muted-foreground">
                    {u ? `${u.count}회 수행 · 최근 ${formatDate(u.last, "M월 d일", prefs.timezone)}` : "아직 수행하지 않음"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <section className="mt-8" aria-labelledby="tpl">
        <h2 id="tpl" className="mb-1 text-lg font-semibold">기본 템플릿</h2>
        <p className="mb-3 text-sm text-muted-foreground">추가하면 분할별 루틴이 내 루틴으로 복사되어 자유롭게 수정할 수 있습니다.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ROUTINE_TEMPLATES.map((t) => (
            <Card key={t.key} size="sm">
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.days.map((d) => d.name).join(" / ")}</p>
                </div>
                <TemplateButton tplKey={t.key} />
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">4·8·12주 장기 프로그램은 Phase 2(주간·월간 계획)에서 추가됩니다.</p>
      </section>
    </>
  );
}
