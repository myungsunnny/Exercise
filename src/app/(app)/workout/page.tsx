import Link from "next/link";
import { Bot, ClipboardList, Copy, Play } from "lucide-react";
import { startWorkout } from "@/app/actions/workout";
import { PageHeader } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutEditor } from "@/components/workout/workout-editor";
import {
  getActiveSession, getExercises, getPreferences, getPreviousSets, getRoutines, getUserExerciseSettings, listCompletedSessions,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "운동 기록" };

export default async function WorkoutPage() {
  const active = await getActiveSession();
  if (active) return <ActiveWorkout {...active} />;

  const [routines, recent, prefs] = await Promise.all([getRoutines(), listCompletedSessions({ limit: 5 }), getPreferences()]);
  return (
    <>
      <PageHeader title="운동 시작" description="시작하면 기록이 자동으로 저장됩니다." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <form action={startWorkout}>
              <input type="hidden" name="mode" value="empty" />
              <button className={cn(buttonVariants(), "h-14 w-full text-base")}>
                <Play className="size-5" /> 빈 운동으로 시작
              </button>
            </form>
            <button disabled className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full")} title="Phase 3에서 구현 예정">
              <Bot className="size-5" /> AI 추천 운동으로 시작 (준비 중)
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" /> 루틴으로 시작</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {routines.length === 0 && (
              <p className="text-sm text-muted-foreground">
                저장된 루틴이 없습니다. <Link href="/routines" className="text-primary hover:underline">루틴 만들기</Link>
              </p>
            )}
            {routines.map((r) => (
              <form key={r.id} action={startWorkout}>
                <input type="hidden" name="mode" value="routine" />
                <input type="hidden" name="routineId" value={r.id} />
                <button className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.routine_exercises.map((x) => x.exercises?.name_ko).join(", ") || "종목 없음"}
                    </span>
                  </span>
                  <Play className="size-4 shrink-0 text-primary" />
                </button>
              </form>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Copy className="size-4" /> 지난 운동 복사해서 시작</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">완료한 운동이 아직 없습니다.</p>}
            {recent.map((s) => (
              <form key={s.id} action={startWorkout}>
                <input type="hidden" name="mode" value="copy" />
                <input type="hidden" name="sessionId" value={s.id} />
                <button className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{formatDate(s.started_at, "M월 d일 (EEE)", prefs.timezone)} · {s.workout_exercises.length}종목</span>
                  </span>
                  <Copy className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </form>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function ActiveWorkout({ draft, revision }: NonNullable<Awaited<ReturnType<typeof getActiveSession>>>) {
  const [exercises, prefs, settings, previous] = await Promise.all([
    getExercises(),
    getPreferences(),
    getUserExerciseSettings(),
    getPreviousSets([...new Set(draft.exercises.map((e) => e.exercise_id))], draft.id),
  ]);
  const restDefaults = Object.fromEntries([...settings].filter(([, v]) => v.rest_seconds != null).map(([k, v]) => [k, v.rest_seconds as number]));
  return (
    <WorkoutEditor
      key={draft.id}
      initial={draft}
      revision={revision}
      exercises={exercises}
      previous={previous}
      restDefaults={restDefaults}
      defaultRest={prefs.default_rest_seconds}
      mode="live"
    />
  );
}
