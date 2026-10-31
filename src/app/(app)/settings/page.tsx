import { PageHeader } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getPreferences } from "@/lib/data";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const { supabase, email } = await requireUser();
  const [prefs, { data: profile }] = await Promise.all([getPreferences(), supabase.from("profiles").select("display_name").maybeSingle()]);
  return (
    <>
      <PageHeader title="설정" description={email} />
      <div className="space-y-4">
        <SettingsForm prefs={prefs} displayName={profile?.display_name ?? ""} />
        <Card size="sm">
          <CardHeader><CardTitle>준비 중인 설정</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>· CSV 내보내기 — Phase 2</p>
            <p>· JSON 백업·복원(미리보기, 중복 처리), 기록·AI 분석·전체 데이터 삭제 — Phase 5</p>
            <p>· 알림 설정, 언어, lb 단위 — 추후 (현재 한국어·kg 고정, 시간대 Asia/Seoul)</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
