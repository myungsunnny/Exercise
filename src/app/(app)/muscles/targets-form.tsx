"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateMuscleTargets } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";

export function MuscleTargetsForm({ muscles }: { muscles: { id: string; name: string; target: number }[] }) {
  const [state, action, pending] = useActionState(updateMuscleTargets, null);
  useEffect(() => {
    if (state) (state.ok ? toast.success : toast.error)(state.message);
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {muscles.map((m) => (
          <label key={m.id} className="space-y-1 text-center text-xs text-muted-foreground">
            {m.name}
            <input name={m.id} inputMode="numeric" defaultValue={m.target} className="num block h-11 w-full rounded-md bg-muted text-center text-base text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
        ))}
      </div>
      <Button type="submit" className="h-11" disabled={pending}>저장</Button>
      <p className="text-xs text-muted-foreground">일반적으로 근비대 목적은 부위당 주 10~20세트가 권장 범위로 알려져 있습니다. 회복 상태에 맞게 조절하세요.</p>
    </form>
  );
}
