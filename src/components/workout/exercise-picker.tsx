"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filterExercises, MUSCLE_NAME, MUSCLE_OPTIONS } from "@/lib/exercise-filter";
import { EQUIPMENT_LABEL, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ExerciseRef } from "@/lib/workout/model";

export function ExercisePicker({
  open, onOpenChange, exercises, multiple, onPick,
}: { open: boolean; onOpenChange: (o: boolean) => void; exercises: Exercise[]; multiple: boolean; onPick: (refs: ExerciseRef[]) => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const list = useMemo(() => filterExercises(exercises, { q, muscle }), [exercises, q, muscle]);

  const done = (ids: string[]) => {
    const refs = ids.map((id) => exercises.find((e) => e.id === id)!).map((e) => ({ id: e.id, name_ko: e.name_ko, exercise_type: e.exercise_type }));
    setPicked([]);
    setQ("");
    onPick(refs);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPicked([]); onOpenChange(o); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 p-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{multiple ? "운동 추가" : "종목 교체"}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="운동 이름 검색" aria-label="운동 이름 검색" className="h-11 pl-9" />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="부위 필터">
          {[["", "전체"] as const, ...MUSCLE_OPTIONS].map(([id, name]) => (
            <button
              key={id}
              onClick={() => setMuscle(id)}
              aria-pressed={muscle === id}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", muscle === id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {name}
            </button>
          ))}
        </div>
        <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {list.map((e) => {
            const sel = picked.includes(e.id);
            const primary = e.exercise_muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_NAME[m.muscle_id]).join("·");
            return (
              <li key={e.id}>
                <button
                  onClick={() => (multiple ? setPicked((p) => (sel ? p.filter((x) => x !== e.id) : [...p, e.id])) : done([e.id]))}
                  aria-pressed={multiple ? sel : undefined}
                  className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted", sel && "bg-primary/10")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name_ko}</span>
                    <span className="block text-xs text-muted-foreground">{primary} · {EQUIPMENT_LABEL[e.equipment]}{e.owner_id && " · 내 운동"}</span>
                  </span>
                  {sel && <Check className="size-5 text-primary" />}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다. 운동 라이브러리에서 직접 추가할 수 있습니다.</li>}
        </ul>
        {multiple && (
          <Button className="h-12 text-base" disabled={picked.length === 0} onClick={() => done(picked)}>
            {picked.length ? `${picked.length}개 추가` : "운동을 선택하세요"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
