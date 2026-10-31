"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { approveRecommendation, deleteConversation, generateInsight, generateRoutinePlan, generateWeeklyPlan, rejectRecommendation } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";

const sel = "h-11 w-full rounded-lg border bg-background px-2 text-sm";

export function PlanGenerator({ routines, disabled }: { routines: { id: string; name: string }[]; disabled: boolean }) {
  const [kind, setKind] = useState<"new" | "update" | "weekly">("new");
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? "");
  const [instructions, setInstructions] = useState("");
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = kind === "weekly" ? await generateWeeklyPlan(instructions) : await generateRoutinePlan(instructions, kind === "update" ? routineId : null);
      if (r.ok) { toast.success("제안을 만들었습니다. 아래에서 변경 내용을 확인하고 승인하세요."); setInstructions(""); } else toast.error(r.error);
    });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg border p-1 text-sm">
        {([["new", "새 루틴"], ["update", "루틴 조정"], ["weekly", "주간 계획"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={kind === k ? "rounded-md bg-muted py-2 font-medium" : "py-2 text-muted-foreground"}>{l}</button>
        ))}
      </div>
      {kind === "update" && (
        routines.length ? (
          <select value={routineId} onChange={(e) => setRoutineId(e.target.value)} className={sel} aria-label="조정할 루틴">
            {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : <p className="text-sm text-muted-foreground">조정할 루틴이 없습니다.</p>
      )}
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={kind === "weekly" ? "예: 주 4회, 화·목은 시간이 짧아요" : kind === "update" ? "예: 집에서 덤벨만 쓸 수 있게 바꿔줘 / 어깨가 불편해서 오버헤드 동작은 빼줘" : "예: 45분 안에 끝나는 상체 근비대 루틴"}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        aria-label="요청 사항"
      />
      <Button className="h-11 w-full" onClick={run} disabled={disabled || pending || (kind === "update" && !routineId)}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "기록을 분석해 제안을 만드는 중…" : "AI 제안 만들기"}
      </Button>
      <p className="text-xs text-muted-foreground">AI는 바로 적용하지 않습니다. 제안이 만들어지면 변경 전후를 비교한 뒤 승인할 때만 루틴에 반영됩니다. 코치 프로필(목표·기구·제한사항)은 설정에서 입력하세요.</p>
    </div>
  );
}

export function RecommendationButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button variant="outline" className="h-11 flex-1" disabled={pending}
        onClick={() => start(async () => { const r = await rejectRecommendation(id); if (!r.ok) toast.error(r.error); })}>
        <X /> 거절
      </Button>
      <Button className="h-11 flex-1" disabled={pending}
        onClick={() => start(async () => {
          const r = await approveRecommendation(id);
          if (r.ok) { toast.success("승인한 내용을 적용했습니다."); router.refresh(); } else toast.error(r.error);
        })}>
        {pending ? <Loader2 className="animate-spin" /> : <Check />} 승인하고 적용
      </Button>
    </div>
  );
}

export function InsightButton({ kind, label, disabled }: { kind: "daily" | "weekly" | "monthly"; label: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" className="h-10" disabled={disabled || pending}
      onClick={() => start(async () => { const r = await generateInsight(kind); if (r.ok) toast.success("리포트를 만들었습니다."); else toast.error(r.error); })}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {label}
    </Button>
  );
}

export function DeleteConversationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" aria-label="대화 삭제" disabled={pending}
      onClick={() => confirm("이 대화를 삭제할까요?") && start(async () => { await deleteConversation(id); router.replace("/coach?tab=chat"); })}>
      <Trash2 />
    </Button>
  );
}
