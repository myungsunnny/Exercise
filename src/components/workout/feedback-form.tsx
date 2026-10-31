"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveWorkoutFeedback } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FB = { fatigue: number | null; energy: number | null; pain: boolean; notes: string | null } | null;

function Scale({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm">{label}</legend>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}
            className={cn("size-11 rounded-lg border text-sm", value === n ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{n}</button>
        ))}
      </div>
      <p className="mt-0.5 flex justify-between text-[11px] text-muted-foreground" style={{ maxWidth: "15.5rem" }}><span>{low}</span><span>{high}</span></p>
    </fieldset>
  );
}

export function FeedbackForm({ sessionId, initial }: { sessionId: string; initial: FB }) {
  const [fatigue, setFatigue] = useState(initial?.fatigue ?? null);
  const [energy, setEnergy] = useState(initial?.energy ?? null);
  const [pain, setPain] = useState(initial?.pain ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-6">
        <Scale label="피로도" value={fatigue} onChange={setFatigue} low="가벼움" high="매우 힘듦" />
        <Scale label="에너지·컨디션" value={energy} onChange={setEnergy} low="낮음" high="매우 좋음" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} className="size-5" /> 운동 중 통증이나 불편감이 있었음
      </label>
      {pain && <p className="rounded-md bg-amber-500/10 p-2 text-xs">통증이 계속되거나 심하면 해당 부위 운동을 쉬고 전문가와 상담하세요. AI 트레이너는 이 정보를 운동 선택 시 참고만 합니다.</p>}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="메모 (예: 잠을 못 자서 힘들었음)" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" aria-label="피드백 메모" />
      <Button className="h-11" disabled={pending}
        onClick={() => start(async () => {
          const r = await saveWorkoutFeedback({ session_id: sessionId, fatigue, energy, pain, notes: notes || null });
          if (r.ok) toast.success("피드백을 저장했습니다."); else toast.error(r.error);
        })}>
        {pending && <Loader2 className="animate-spin" />} 저장
      </Button>
    </div>
  );
}
