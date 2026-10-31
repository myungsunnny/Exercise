"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAiData, updateCoachProfile } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachProfile } from "@/lib/data";
import { EQUIPMENT_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

const GOALS = { hypertrophy: "근비대", strength: "근력", fat_loss: "체지방 감량", general_fitness: "건강·체력", endurance: "지구력" };
const LEVELS = { beginner: "초보(1년 미만)", intermediate: "중급(1~3년)", advanced: "고급(3년 이상)" };
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const sel = "h-11 w-full rounded-lg border bg-background px-2 text-sm";
const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground");

export function CoachProfileForm({ profile }: { profile: CoachProfile }) {
  const [days, setDays] = useState(profile.available_days);
  const [equipment, setEquipment] = useState(profile.equipment);
  const [pending, start] = useTransition();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = (fd: FormData) =>
    start(async () => {
      const mins = String(fd.get("session_minutes") ?? "").trim();
      const r = await updateCoachProfile({
        training_goal: fd.get("training_goal") || null,
        experience_level: fd.get("experience_level") || null,
        available_days: days,
        session_minutes: mins ? Number(mins) : null,
        equipment,
        constraints_note: String(fd.get("constraints_note") ?? "") || null,
      });
      if (r.ok) toast.success("코치 프로필을 저장했습니다."); else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader><CardTitle>AI 코치 프로필</CardTitle></CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">운동 목표
              <select name="training_goal" defaultValue={profile.training_goal ?? ""} className={sel}>
                <option value="">선택 안 함</option>
                {Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">운동 경력
              <select name="experience_level" defaultValue={profile.experience_level ?? ""} className={sel}>
                <option value="">선택 안 함</option>
                {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">1회 운동 가능 시간(분)
              <input name="session_minutes" inputMode="numeric" defaultValue={profile.session_minutes ?? ""} className={sel} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm">운동 가능 요일</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => setDays(toggle(days, i))} className={chip(days.includes(i))}>{d}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm">사용 가능한 기구 <span className="text-xs text-muted-foreground">(비워 두면 AI가 기구를 제한하지 않음)</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <button key={k} type="button" aria-pressed={equipment.includes(k)} onClick={() => setEquipment(toggle(equipment, k))} className={chip(equipment.includes(k))}>{v}</button>)}
            </div>
          </fieldset>
          <label className="block space-y-1 text-sm">운동 제한·선호 사항
            <textarea name="constraints_note" defaultValue={profile.constraints_note ?? ""} maxLength={1000} rows={3} placeholder="예: 왼쪽 어깨가 불편해서 오버헤드 프레스는 피하고 싶어요 / 데드리프트는 좋아해요"
              className="w-full rounded-lg border bg-background px-3 py-2" />
          </label>
          <Button type="submit" className="h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 저장</Button>
          <p className="text-xs text-muted-foreground">AI 트레이너가 계획을 만들고 질문에 답할 때 참고합니다. 건강 문제는 진단 대상이 아니라 운동 선택 시 피할 조건으로만 사용됩니다.</p>
        </form>
      </CardContent>
    </Card>
  );
}

export function DeleteAiDataButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="destructive" className="h-11" disabled={pending}
      onClick={() => confirm("AI 대화, 제안, 리포트, 변경 이력을 모두 삭제할까요? 운동 기록과 이미 적용된 루틴은 유지됩니다.") &&
        start(async () => { const r = await deleteAiData(); if (r.ok) toast.success("AI 분석 기록을 삭제했습니다."); else toast.error(r.error); })}>
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} AI 분석 기록 삭제
    </Button>
  );
}
