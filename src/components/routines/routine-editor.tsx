"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveRoutine } from "@/app/actions/routines";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Routine } from "@/lib/data";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";
import { parseNum } from "@/lib/workout/model";
import { estimateRoutineMinutes } from "@/lib/workout/stats";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Item = { key: string; exercise_id: string; name: string; target_sets: string; rep_min: string; rep_max: string; target_weight_kg: string; rest_seconds: string; superset_group: number | null; notes: string };
const s = (n: number | null | undefined) => (n == null ? "" : String(n));

export function RoutineEditor({ routine, exercises, defaultRest }: { routine: Routine | null; exercises: Exercise[]; defaultRest: number }) {
  const router = useRouter();
  const [name, setName] = useState(routine?.name ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(routine?.weekdays ?? []);
  const [items, setItems] = useState<Item[]>(
    routine?.routine_exercises.map((x) => ({
      key: x.id, exercise_id: x.exercise_id, name: x.exercises?.name_ko ?? "운동", target_sets: String(x.target_sets),
      rep_min: s(x.rep_min), rep_max: s(x.rep_max), target_weight_kg: s(x.target_weight_kg), rest_seconds: s(x.rest_seconds),
      superset_group: x.superset_group, notes: x.notes ?? "",
    })) ?? [],
  );
  const [picker, setPicker] = useState(false);
  const [pending, start] = useTransition();

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggleSuperset = (i: number) =>
    setItems((list) => {
      const cur = list[i], nxt = list[i + 1];
      if (!nxt) return list;
      const next = list.slice();
      if (cur.superset_group != null && cur.superset_group === nxt.superset_group) {
        next[i + 1] = { ...nxt, superset_group: null };
        if (!next.some((x, k) => k !== i && x.superset_group === cur.superset_group)) next[i] = { ...cur, superset_group: null };
        return next;
      }
      const used = new Set(list.map((x) => x.superset_group));
      let g = cur.superset_group ?? nxt.superset_group ?? 1;
      while (cur.superset_group == null && nxt.superset_group == null && used.has(g)) g++;
      next[i] = { ...cur, superset_group: g };
      next[i + 1] = { ...nxt, superset_group: g };
      return next;
    });

  const minutes = estimateRoutineMinutes(
    items.map((it) => ({ target_sets: Number(it.target_sets) || 1, rest_seconds: parseNum(it.rest_seconds) })),
    defaultRest,
  );

  const save = () =>
    start(async () => {
      const res = await saveRoutine({
        id: routine?.id ?? null,
        name,
        description: description.trim() || null,
        weekdays: [...weekdays].sort(),
        items: items.map((it) => ({
          exercise_id: it.exercise_id,
          target_sets: Number(it.target_sets) || 1,
          rep_min: parseNum(it.rep_min),
          rep_max: parseNum(it.rep_max),
          target_weight_kg: parseNum(it.target_weight_kg),
          rest_seconds: parseNum(it.rest_seconds),
          superset_group: it.superset_group,
          notes: it.notes.trim() || null,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("루틴을 저장했습니다.");
      router.push("/routines");
    });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="rname">루틴 이름</Label>
        <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" placeholder="예: 상체 A" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rdesc">설명</Label>
        <Textarea id="rdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">운동 요일</legend>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={weekdays.includes(i)}
              onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}
              className={cn("size-11 rounded-full border text-sm", weekdays.includes(i) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {d}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">종목 {items.length}개</h2>
        <span className="text-sm text-muted-foreground">예상 약 {minutes}분</span>
      </div>

      <ol className="space-y-3">
        {items.map((it, i) => {
          const linked = it.superset_group != null && items[i + 1]?.superset_group === it.superset_group;
          return (
            <li key={it.key} className={cn("rounded-xl bg-card p-3 ring-1 ring-foreground/10", it.superset_group != null && "border-l-4 border-l-primary")}>
              <div className="flex items-center gap-1">
                <p className="min-w-0 flex-1 truncate font-medium">
                  {i + 1}. {it.name}
                  {it.superset_group != null && <span className="ml-2 text-xs text-primary">슈퍼세트 {it.superset_group}</span>}
                </p>
                <Button variant="ghost" size="icon" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon" aria-label="아래로" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                <Button variant="ghost" size="icon" aria-label={linked ? "슈퍼세트 해제" : "다음 종목과 슈퍼세트"} aria-pressed={linked} disabled={i === items.length - 1} onClick={() => toggleSuperset(i)}>
                  <Link2 className={linked ? "text-primary" : undefined} />
                </Button>
                <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}><Trash2 /></Button>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2">
                <Field label="세트" value={it.target_sets} onChange={(v) => patch(it.key, { target_sets: v })} mode="numeric" />
                <Field label="최소 회" value={it.rep_min} onChange={(v) => patch(it.key, { rep_min: v })} mode="numeric" />
                <Field label="최대 회" value={it.rep_max} onChange={(v) => patch(it.key, { rep_max: v })} mode="numeric" />
                <Field label="목표 kg" value={it.target_weight_kg} onChange={(v) => patch(it.key, { target_weight_kg: v })} mode="decimal" />
                <Field label="휴식 초" value={it.rest_seconds} placeholder={String(defaultRest)} onChange={(v) => patch(it.key, { rest_seconds: v })} mode="numeric" />
              </div>
            </li>
          );
        })}
      </ol>

      <Button variant="secondary" className="h-12 w-full" onClick={() => setPicker(true)}><Plus /> 종목 추가</Button>

      <div className="flex gap-2">
        <Button variant="outline" className="h-12" onClick={() => router.back()}>취소</Button>
        <Button className="h-12 flex-1 text-base" onClick={save} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} 저장
        </Button>
      </div>

      <ExercisePicker
        open={picker}
        onOpenChange={setPicker}
        exercises={exercises}
        multiple
        onPick={(refs) => {
          setItems((l) => [
            ...l,
            ...refs.map((r) => ({ key: crypto.randomUUID(), exercise_id: r.id, name: r.name_ko, target_sets: "3", rep_min: "8", rep_max: "12", target_weight_kg: "", rest_seconds: "", superset_group: null, notes: "" })),
          ]);
          setPicker(false);
        }}
      />
    </div>
  );
}

function Field({ label, value, onChange, mode, placeholder }: { label: string; value: string; onChange: (v: string) => void; mode: "numeric" | "decimal"; placeholder?: string }) {
  return (
    <label className="space-y-1 text-center">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <input inputMode={mode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="num h-11 w-full min-w-0 rounded-md bg-muted text-center text-base outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );
}
