import { PageHeader } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getCoachProfile, getPreferences } from "@/lib/data";
import { CoachProfileForm, DeleteAiDataButton } from "./coach-form";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const { supabase, email } = await requireUser();
  const [prefs, { data: profile }, coach] = await Promise.all([getPreferences(), supabase.from("profiles").select("display_name").maybeSingle(), getCoachProfile()]);
  return (
    <>
      <PageHeader title="설정" description={email} />
      <div className="space-y-4">
        <SettingsForm prefs={prefs} displayName={profile?.display_name ?? ""} />
        <CoachProfileForm profile={coach} />
        <Card size="sm">
          <CardHeader><CardTitle>AI 데이터</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <DeleteAiDataButton />
            <p className="text-xs text-muted-foreground">AI 대화·제안·리포트·변경 이력을 삭제합니다. 운동 기록과 적용된 루틴은 그대로 남습니다.</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>데이터 내보내기</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <a href="/api/export/sets" download className="inline-flex h-11 items-center rounded-lg border px-4 hover:bg-muted">운동 기록 CSV 다운로드</a>
            <p className="text-xs text-muted-foreground">완료한 모든 운동의 세트를 한 줄씩 내보냅니다. Excel·Numbers·구글 시트에서 열 수 있습니다.</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>준비 중인 설정</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>· JSON 백업·복원(미리보기, 중복 처리), 운동 기록·전체 데이터 일괄 삭제 — Phase 5</p>
            <p>· 알림 설정, 언어, lb 단위 — 추후 (현재 한국어·kg 고정, 시간대 Asia/Seoul)</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
