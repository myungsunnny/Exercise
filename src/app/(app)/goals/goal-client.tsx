"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { archiveGoal, createGoal } from "@/app/actions/goals";
import { Button } from "@/components/ui/button";
import { GOAL_KIND_LABEL, GOAL_UNIT } from "@/lib/goals";
import type { Goal } from "@/lib/data";

const sel = "h-11 w-full rounded-lg border bg-background px-2 text-sm";

export function GoalForm({ exercises }: { exercises: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<Goal["kind"]>("weekly_count");
  const [pending, start] = useTransition();
  const needsExercise = kind === "exercise_weight" || kind === "exercise_reps";
  const submit = (fd: FormData) =>
    start(async () => {
      const num = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : Number(fd.get(k)));
      const r = await createGoal({
        kind,
        exercise_id: needsExercise ? String(fd.get("exercise_id")) : null,
        target_value: num("target_value"),
        start_value: num("start_value"),
        deadline: String(fd.get("deadline") ?? "") || null,
      });
      if (r.ok) toast.success("목표를 추가했습니다."); else toast.error(r.error);
    });
  return (
    <form action={submit} className="space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="text-sm font-medium">목표 추가</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1 text-xs text-muted-foreground">종류
          <select value={kind} onChange={(e) => setKind(e.target.value as Goal["kind"])} className={sel}>
            {Object.entries(GOAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {needsExercise && (
          <label className="col-span-2 space-y-1 text-xs text-muted-foreground">종목
            <select name="exercise_id" className={sel}>{exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          </label>
        )}
        <label className="space-y-1 text-xs text-muted-foreground">목표값({GOAL_UNIT[kind]})
          <input name="target_value" inputMode="decimal" required className={sel} />
        </label>
        {kind === "body_weight" && (
          <label className="space-y-1 text-xs text-muted-foreground">현재 체중(kg)<input name="start_value" inputMode="decimal" className={sel} /></label>
        )}
        <label className="space-y-1 text-xs text-muted-foreground">기한(선택)<input type="date" name="deadline" className={sel} /></label>
      </div>
      <Button type="submit" className="h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 추가</Button>
    </form>
  );
}

export function GoalDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" aria-label="목표 삭제" disabled={pending}
      onClick={() => confirm("이 목표를 삭제할까요?") && start(async () => { const r = await archiveGoal(id); if (!r.ok) toast.error(r.error); })}>
      <Trash2 />
    </Button>
  );
}
