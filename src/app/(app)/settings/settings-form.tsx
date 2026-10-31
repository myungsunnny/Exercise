"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Preferences } from "@/lib/types";

export function SettingsForm({ prefs, displayName }: { prefs: Preferences; displayName: string }) {
  const [state, action, pending] = useActionState(updateSettings, null);
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (state) (state.ok ? toast.success : toast.error)(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader><CardTitle>기본 설정</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <Row id="display_name" label="이름">
            <Input id="display_name" name="display_name" defaultValue={displayName} maxLength={50} className="h-11" />
          </Row>
          <Row id="weekly_workout_target" label="주간 운동 목표(회)">
            <Input id="weekly_workout_target" name="weekly_workout_target" inputMode="numeric" defaultValue={prefs.weekly_workout_target} className="h-11" />
          </Row>
          <Row id="default_rest_seconds" label="기본 휴식 시간(초)">
            <Input id="default_rest_seconds" name="default_rest_seconds" inputMode="numeric" defaultValue={prefs.default_rest_seconds} className="h-11" />
          </Row>
          <Row id="weight_increment_kg" label="기본 중량 증가 단위(kg)">
            <Input id="weight_increment_kg" name="weight_increment_kg" inputMode="decimal" defaultValue={prefs.weight_increment_kg} className="h-11" />
          </Row>
          <Row id="theme" label="화면 테마">
            <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value)} className="h-11 w-full rounded-lg border bg-background px-2 text-sm">
              <option value="dark">다크</option>
              <option value="light">라이트</option>
            </select>
          </Row>
          <div className="sm:col-span-2">
            <Button type="submit" className="h-11" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 저장</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
