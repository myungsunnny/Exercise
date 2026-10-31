import { Award, Lock } from "lucide-react";
import { PageHeader } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { badges, durationSec, personalRecords } from "@/lib/analytics";
import { getExercises, getGoals, getPreferences, listCompletedSessions } from "@/lib/data";
import { formatDate, weekRange, weekStreak } from "@/lib/format";
import { GOAL_KIND_LABEL, GOAL_UNIT, goalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { GoalDelete, GoalForm } from "./goal-client";

export const metadata = { title: "목표·성취" };

export default async function GoalsPage() {
  const now = new Date();
  const [goals, sessions, prefs, exercises] = await Promise.all([getGoals(), listCompletedSessions(), getPreferences(), getExercises()]);
  const tz = prefs.timezone;
  const { start, end } = weekRange(now, tz);
  const week = sessions.filter((s) => s.started_at >= start.toISOString() && s.started_at <= end.toISOString());
  const streak = weekStreak(sessions.map((s) => s.started_at), now, tz);
  const { best, events } = personalRecords(sessions);
  const ctx = { weekSessions: week.length, weekMinutes: Math.round(week.reduce((a, s) => a + durationSec(s), 0) / 60), streak, best, bodyWeight: null };
  const rows = goals.map((g) => ({ g, p: goalProgress(g, ctx) }));
  const list = badges(sessions, streak, events.length, rows.filter((r) => r.p.achieved).length);

  return (
    <>
      <PageHeader title="목표·성취" description="진행률은 운동 기록에서 자동으로 계산됩니다." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>내 목표</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">설정한 목표가 없습니다. 아래에서 추가하세요.</p>}
            {rows.map(({ g, p }) => (
              <div key={g.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {GOAL_KIND_LABEL[g.kind]}{g.exercises && ` · ${g.exercises.name_ko}`}
                      {p.achieved && <span className="ml-2 text-xs text-primary">달성!</span>}
                    </p>
                    <p className="num text-sm text-muted-foreground">
                      {p.current == null ? "-" : `${p.current}${GOAL_UNIT[g.kind]}`} / {g.target_value}{GOAL_UNIT[g.kind]}
                      {g.deadline && ` · 기한 ${formatDate(`${g.deadline}T00:00:00+09:00`, "yyyy.M.d", tz)}`}
                    </p>
                  </div>
                  <GoalDelete id={g.id} />
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn("h-full rounded-full", p.achieved ? "bg-primary" : "bg-primary/70")} style={{ width: `${p.pct}%` }} />
                </div>
                {p.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
              </div>
            ))}
            <GoalForm exercises={exercises.map((e) => ({ id: e.id, name: e.name_ko }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>배지</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {list.map((b) => (
                <li key={b.key} className={cn("rounded-lg border p-3 text-center", b.earned ? "border-primary/50 bg-primary/10" : "opacity-60")}>
                  {b.earned ? <Award className="mx-auto size-6 text-primary" /> : <Lock className="mx-auto size-6 text-muted-foreground" />}
                  <p className="mt-1 text-sm font-medium">{b.label}</p>
                  <p className="text-xs text-muted-foreground">{b.description}</p>
                  {!b.earned && b.progress && <p className="num mt-1 text-xs">{b.progress}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">배지는 꾸준함과 기록 향상을 기준으로 합니다. 휴식도 훈련의 일부이니 무리한 운동은 피하세요.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
