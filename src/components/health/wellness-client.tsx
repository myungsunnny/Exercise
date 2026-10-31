"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWellness, saveWellness } from "@/app/actions/health";
import { Button } from "@/components/ui/button";
import type { Wellness } from "@/lib/data";
import { cn } from "@/lib/utils";

const inp = "num h-11 w-full rounded-lg border bg-background px-2 text-sm";
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")));

function Scale({ name, label, value, low, high }: { name: string; label: string; value: number | null; low: string; high: string }) {
  const [v, setV] = useState(value);
  return (
    <fieldset>
      <legend className="mb-1 text-sm">{label}</legend>
      <input type="hidden" name={name} value={v ?? ""} />
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={v === n} onClick={() => setV(v === n ? null : n)} className={cn("size-11 rounded-lg border text-sm", v === n ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{n}</button>
        ))}
      </div>
      <p className="mt-0.5 flex max-w-[15.5rem] justify-between text-[11px] text-muted-foreground"><span>{low}</span><span>{high}</span></p>
    </fieldset>
  );
}

export function WellnessForm({ today, logs }: { today: string; logs: Wellness[] }) {
  const [date, setDate] = useState(today);
  const cur = logs.find((l) => l.log_date === date) ?? null;
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">날짜<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inp} /></label>
      <WellnessFields key={date + (cur?.id ?? "")} date={date} cur={cur} />
    </div>
  );
}

function WellnessFields({ date, cur }: { date: string; cur: Wellness | null }) {
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveWellness({
        log_date: date, sleep_hours: num(fd.get("sleep_hours")), sleep_quality: num(fd.get("sleep_quality")), fatigue: num(fd.get("fatigue")), condition: num(fd.get("condition")),
        resting_hr: num(fd.get("resting_hr")), steps: num(fd.get("steps")), active_minutes: num(fd.get("active_minutes")), notes: String(fd.get("notes") ?? "") || null,
      });
      if (r.ok) toast.success("기록을 저장했습니다."); else toast.error(r.error);
    });
  return (
    <form action={submit} className="space-y-3">
      <label className="block space-y-1 text-sm">수면 시간(시간)<input name="sleep_hours" inputMode="decimal" defaultValue={cur?.sleep_hours ?? ""} placeholder="예: 7.5" className={inp} /></label>
      <Scale name="sleep_quality" label="수면의 질" value={cur?.sleep_quality ?? null} low="나쁨" high="매우 좋음" />
      <Scale name="condition" label="컨디션" value={cur?.condition ?? null} low="나쁨" high="매우 좋음" />
      <Scale name="fatigue" label="피로도" value={cur?.fatigue ?? null} low="가벼움" high="매우 피곤" />
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">안정시 심박(bpm)<input name="resting_hr" inputMode="numeric" defaultValue={cur?.resting_hr ?? ""} className={inp} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">걸음 수<input name="steps" inputMode="numeric" defaultValue={cur?.steps ?? ""} className={inp} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">활동 시간(분)<input name="active_minutes" inputMode="numeric" defaultValue={cur?.active_minutes ?? ""} className={inp} /></label>
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">메모<input name="notes" defaultValue={cur?.notes ?? ""} maxLength={500} className="h-11 w-full rounded-lg border bg-background px-2 text-sm" /></label>
      <Button type="submit" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 저장</Button>
      <p className="text-xs text-muted-foreground">수동 입력값은 의학적 측정이 아닙니다. 심박이나 컨디션 이상이 계속되면 전문가와 상담하세요.</p>
    </form>
  );
}

export function WellnessHistory({ logs }: { logs: Wellness[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[34rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr><th className="text-left font-normal">날짜</th><th className="text-right font-normal">수면</th><th className="text-right font-normal">질</th><th className="text-right font-normal">컨디션</th><th className="text-right font-normal">피로</th><th className="text-right font-normal">심박</th><th className="text-right font-normal">걸음</th><th className="text-right font-normal">수분</th><th /></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="py-1.5">{l.log_date.slice(5)}</td>
              <td className="text-right">{l.sleep_hours ?? "-"}</td><td className="text-right">{l.sleep_quality ?? "-"}</td><td className="text-right">{l.condition ?? "-"}</td>
              <td className="text-right">{l.fatigue ?? "-"}</td><td className="text-right">{l.resting_hr ?? "-"}</td><td className="text-right">{l.steps?.toLocaleString("ko-KR") ?? "-"}</td>
              <td className="text-right">{l.water_ml ? `${l.water_ml}ml` : "-"}</td>
              <td className="text-right"><Button variant="ghost" size="icon" aria-label={`${l.log_date} 기록 삭제`} disabled={pending} onClick={() => confirm(`${l.log_date} 기록을 삭제할까요? (수분 기록도 함께 삭제됩니다)`) && start(async () => { const r = await deleteWellness(l.id); if (!r.ok) toast.error(r.error); })}><Trash2 /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
