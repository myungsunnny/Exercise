"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createExercise } from "@/app/actions/exercises";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MUSCLE_OPTIONS } from "@/lib/exercise-filter";
import { DIFFICULTY_LABEL, EQUIPMENT_LABEL, EXERCISE_TYPE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectCls = "h-11 w-full rounded-lg border bg-background px-2 text-sm";

export function NewExerciseDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const submit = (fd: FormData) =>
    start(async () => {
      const str = (k: string) => (String(fd.get(k) ?? "").trim() || null);
      const r = await createExercise({
        name_ko: String(fd.get("name_ko") ?? ""),
        name_en: str("name_en"),
        exercise_type: fd.get("exercise_type"),
        equipment: fd.get("equipment"),
        difficulty: fd.get("difficulty"),
        instructions: str("instructions"),
        cautions: str("cautions"),
        media_url: str("media_url"),
        primary,
        secondary,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("운동을 추가했습니다.");
      setPrimary([]);
      setSecondary([]);
      onOpenChange(false);
      onCreated();
    });

  const chips = (sel: string[], set: (v: string[]) => void, label: string) => (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_OPTIONS.map(([id, n]) => (
          <button key={id} type="button" aria-pressed={sel.includes(id)} onClick={() => set(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])}
            className={cn("rounded-full border px-3 py-1.5 text-xs", sel.includes(id) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>운동 직접 추가</DialogTitle></DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="name_ko">한국어 이름 *</Label><Input id="name_ko" name="name_ko" required maxLength={100} className="h-11" /></div>
            <div className="space-y-1.5"><Label htmlFor="name_en">영어 이름</Label><Input id="name_en" name="name_en" maxLength={100} className="h-11" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="exercise_type">기록 유형</Label>
              <select id="exercise_type" name="exercise_type" className={selectCls} defaultValue="weight_reps">
                {Object.entries(EXERCISE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equipment">기구</Label>
              <select id="equipment" name="equipment" className={selectCls} defaultValue="machine">
                {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="difficulty">난이도</Label>
              <select id="difficulty" name="difficulty" className={selectCls} defaultValue="beginner">
                {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {chips(primary, setPrimary, "주요 근육 *")}
          {chips(secondary, setSecondary, "보조 근육")}
          <div className="space-y-1.5"><Label htmlFor="instructions">자세 설명</Label><Textarea id="instructions" name="instructions" maxLength={4000} /></div>
          <div className="space-y-1.5"><Label htmlFor="cautions">주의사항</Label><Textarea id="cautions" name="cautions" maxLength={2000} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="media_url">이미지/영상 URL (https, 사용 허가된 자료만)</Label>
            <Input id="media_url" name="media_url" type="url" placeholder="https://" className="h-11" />
          </div>
          <Button type="submit" className="h-12 w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 추가</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
