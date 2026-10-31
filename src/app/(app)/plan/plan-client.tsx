"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createProgram, deleteProgram, setRoutineWeekdays } from "@/app/actions/plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const NAME = ["일", "월", "화", "수", "목", "금", "토"];

export function WeekdayGrid({ routines }: { routines: { id: string; name: string; weekdays: number[] }[] }) {
  const [state, setState] = useState(() => Object.fromEntries(routines.map((r) => [r.id, r.weekdays])));
  const [pending, start] = useTransition();
  const toggle = (id: string, d: number) => {
    const prev = state[id];
    const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    setState((s) => ({ ...s, [id]: next }));
    start(async () => {
      const r = await setRoutineWeekdays(id, next);
      if (!r.ok) {
        toast.error(r.error);
        setState((s) => ({ ...s, [id]: prev }));
      }
    });
  };
  const perDay = (d: number) => routines.filter((r) => state[r.id].includes(d)).length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal">루틴</th>
            {DAYS.map((d) => <th key={d} className="w-11 font-normal">{NAME[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {routines.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="max-w-40 truncate py-1.5 pr-2">{r.name}</td>
              {DAYS.map((d) => {
                const on = state[r.id].includes(d);
                return (
                  <td key={d} className="text-center">
                    <button aria-pressed={on} aria-label={`${r.name} ${NAME[d]}요일`} onClick={() => toggle(r.id, d)}
                      className={cn("size-9 rounded-full border text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      {on ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t text-xs text-muted-foreground">
            <td className="py-1.5">운동/휴식</td>
            {DAYS.map((d) => <td key={d} className="text-center">{perDay(d) ? `${perDay(d)}개` : "휴식"}</td>)}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">{pending ? "저장 중…" : "변경 즉시 저장됩니다. 캘린더와 홈의 '오늘 예정된 운동'에 반영됩니다."}</p>
    </div>
  );
}

export function ProgramForm({ routines, today }: { routines: { id: string; name: string }[]; today: string }) {
  const [pattern, setPattern] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const deload = String(fd.get("deload_every") ?? "");
      const r = await createProgram({
        name: String(fd.get("name") ?? ""),
        start_date: String(fd.get("start_date")),
        weeks: Number(fd.get("weeks")),
        deload_every: deload ? Number(deload) : null,
        pattern: Object.entries(pattern).filter(([, v]) => v).map(([k, v]) => ({ weekday: Number(k), routine_id: v })),
      });
      if (r.ok) { toast.success("프로그램을 만들고 캘린더에 일정을 추가했습니다."); setPattern({}); } else toast.error(r.error);
    });
  const sel = "h-11 w-full rounded-lg border bg-background px-2 text-sm";
  return (
    <form action={submit} className="space-y-3 rounded-lg bg-muted/40 p-3">
      <p className="font-medium">새 프로그램</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 space-y-1 text-xs text-muted-foreground">이름<Input name="name" required maxLength={80} placeholder="예: 8주 근비대" className="h-11" /></label>
        <label className="space-y-1 text-xs text-muted-foreground">시작일<input type="date" name="start_date" required defaultValue={today} className={sel} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">기간
          <select name="weeks" defaultValue="8" className={sel}>
            {[4, 6, 8, 10, 12, 16].map((w) => <option key={w} value={w}>{w}주</option>)}
          </select>
        </label>
        <label className="col-span-2 space-y-1 text-xs text-muted-foreground">가벼운 주(디로드)
          <select name="deload_every" defaultValue="4" className={sel}>
            <option value="">없음</option>
            {[3, 4, 5, 6].map((w) => <option key={w} value={w}>{w}주마다</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DAYS.map((d) => (
          <label key={d} className="space-y-1 text-xs text-muted-foreground">{NAME[d]}요일
            <select value={pattern[d] ?? ""} onChange={(e) => setPattern((p) => ({ ...p, [d]: e.target.value }))} className={sel}>
              <option value="">휴식</option>
              {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">프로그램 일정은 날짜별로 캘린더에 추가됩니다. 같은 루틴을 주간 배치에도 지정해 두면 중복 표시되니, 프로그램을 쓸 때는 주간 배치를 비워 두세요. 가벼운 주에는 평소보다 중량이나 세트를 줄여 회복에 집중하세요.</p>
      <Button type="submit" className="h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 프로그램 만들기</Button>
    </form>
  );
}

export function ProgramDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" aria-label="프로그램 삭제" disabled={pending}
      onClick={() => {
        if (!confirm("프로그램과 생성된 일정을 삭제할까요? 완료한 운동 기록은 남습니다.")) return;
        start(async () => { const r = await deleteProgram(id); if (!r.ok) toast.error(r.error); });
      }}>
      <Trash2 />
    </Button>
  );
}
