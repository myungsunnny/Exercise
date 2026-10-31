import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Copy, Pencil } from "lucide-react";
import { startWorkout } from "@/app/actions/workout";
import { PageHeader } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPreferences, getSession } from "@/lib/data";
import { formatClock, formatDate, formatKg, formatMinutes } from "@/lib/format";
import { SET_TYPE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { elapsedSeconds, parseDuration, toPayload } from "@/lib/workout/model";
import { setVolume, summarize } from "@/lib/workout/stats";

export default async function SessionDetailPage({ params }: PageProps<"/history/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [res, prefs] = await Promise.all([getSession(id), getPreferences()]);
  if (!res) notFound();
  const { draft } = res;
  if (draft.status === "in_progress") redirect("/workout");

  const payload = toPayload(draft);
  const sum = summarize(payload.exercises.map((e, i) => ({ exercise_type: draft.exercises[i].exercise_type, sets: e.sets })));

  return (
    <>
      <PageHeader
        title={draft.title}
        description={`${formatDate(draft.started_at, "yyyy년 M월 d일 (EEE) HH:mm", prefs.timezone)} 시작`}
        action={
          <div className="flex gap-2">
            <form action={startWorkout}>
              <input type="hidden" name="mode" value="copy" />
              <input type="hidden" name="sessionId" value={draft.id} />
              <button className={cn(buttonVariants({ variant: "outline" }), "h-10")}><Copy /> 이 운동 다시 하기</button>
            </form>
            <Link href={`/history/${draft.id}/edit`} className={cn(buttonVariants({ variant: "secondary" }), "h-10")}><Pencil /> 수정</Link>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["운동 시간", formatMinutes(elapsedSeconds(draft, Date.parse(draft.ended_at!)))],
          ["총 운동량", formatKg(sum.volume)],
          ["본세트", `${sum.sets}세트`],
          ["총 반복", `${sum.reps}회`],
        ].map(([k, v]) => (
          <Card key={k} size="sm"><CardContent><p className="text-xs text-muted-foreground">{k}</p><p className="num text-xl font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>

      <div className="space-y-3">
        {draft.exercises.map((e, i) => (
          <Card key={e.id} size="sm">
            <CardContent>
              <h2 className="font-semibold">
                {e.exercise_name}
                {e.superset_group != null && <span className="ml-2 text-xs font-normal text-primary">슈퍼세트 {e.superset_group}</span>}
              </h2>
              {e.notes && <p className="mt-1 text-sm text-muted-foreground">{e.notes}</p>}
              <table className="num mt-2 w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="w-12 text-left font-normal">세트</th><th className="text-left font-normal">기록</th><th className="text-right font-normal">RPE/RIR</th><th className="text-right font-normal">운동량</th></tr>
                </thead>
                <tbody>
                  {e.sets.map((s, k) => {
                    const p = payload.exercises[i].sets[k];
                    const rec =
                      e.exercise_type === "duration" ? formatClock(parseDuration(s.duration) ?? 0)
                      : e.exercise_type === "distance_duration" ? `${s.distance || 0}km · ${formatClock(parseDuration(s.duration) ?? 0)}`
                      : e.exercise_type === "bodyweight_reps" ? `${s.reps || 0}회`
                      : `${s.weight || 0}kg × ${s.reps || 0}회`;
                    return (
                      <tr key={s.id} className={cn("border-t", !s.done && "text-muted-foreground line-through")}>
                        <td className="py-1.5">{s.set_type === "normal" ? k + 1 : SET_TYPE_LABEL[s.set_type]}</td>
                        <td>{rec}{s.notes && <span className="ml-2 text-xs text-muted-foreground no-underline">{s.notes}</span>}</td>
                        <td className="text-right">{[s.rpe && `@${s.rpe}`, s.rir && `${s.rir}RIR`].filter(Boolean).join(" ") || "-"}</td>
                        <td className="text-right">{formatKg(setVolume(e.exercise_type, p))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
      {draft.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{draft.notes}</p>}
      <p className="mt-4 text-xs text-muted-foreground">운동량 = 완료한 본세트의 중량 × 횟수 합계 (워밍업·맨몸·유산소 제외). 취소선은 완료하지 않은 세트입니다.</p>
    </>
  );
}
