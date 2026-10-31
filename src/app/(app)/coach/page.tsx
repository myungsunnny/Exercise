import Link from "next/link";
import { Bot, Database, KeyRound, MessageSquarePlus, ShieldAlert } from "lucide-react";
import { startWorkout } from "@/app/actions/workout";
import { ChatInput } from "@/components/coach/chat-input";
import { Markdown } from "@/components/coach/markdown";
import { InsightCard } from "@/components/coach/insight-card";
import { DeleteConversationButton, InsightButton, PlanGenerator, RecommendationButtons } from "@/components/coach/plan-actions";
import { PageHeader } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DAILY_LIMIT, type Insight, type RoutinePayload, type WeeklyPayload } from "@/lib/ai/coach";
import { loadContext, recommendedRoutine, routineTargets } from "@/lib/ai/context";
import { aiConfigured, GEMINI_MODEL } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/progression";
import { cn } from "@/lib/utils";

export const metadata = { title: "AI 트레이너" };

const TABS = { chat: "대화", plans: "추천·계획", reports: "리포트" } as const;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Rec = { id: string; kind: "routine_new" | "routine_update" | "weekly_plan"; status: string; title: string; rationale: string | null; before: unknown; payload: unknown; created_at: string; decided_at: string | null };

export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "chat") as keyof typeof TABS;
  const convId = typeof sp.c === "string" && /^[0-9a-f-]{36}$/i.test(sp.c) ? sp.c : null;
  const configured = aiConfigured();
  const { supabase } = await requireUser();

  return (
    <>
      <PageHeader title="AI 트레이너" description={configured ? `Gemini (${GEMINI_MODEL}) · 저장된 실제 기록을 조회해 답합니다 · 24시간 ${DAILY_LIMIT}회 제한` : "Gemini API 키 설정이 필요합니다"} />
      {!configured && <SetupCard />}
      <nav className="mb-4 flex gap-1 rounded-lg border p-1 text-sm" aria-label="AI 트레이너 탭">
        {Object.entries(TABS).map(([k, v]) => (
          <Link key={k} href={`/coach?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("flex-1 rounded-md py-2 text-center", tab === k ? "bg-muted font-medium" : "text-muted-foreground")}>{v}</Link>
        ))}
      </nav>
      {tab === "chat" && <ChatTab supabase={supabase} convId={convId} configured={configured} />}
      {tab === "plans" && <PlansTab supabase={supabase} configured={configured} />}
      {tab === "reports" && <ReportsTab supabase={supabase} configured={configured} />}
      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" /> AI는 의료 진단이나 치료를 하지 않습니다. 통증이나 부상이 의심되면 운동을 멈추고 전문가와 상담하세요.
      </p>
    </>
  );
}

type SB = Awaited<ReturnType<typeof requireUser>>["supabase"];

function SetupCard() {
  return (
    <Card className="mb-4 border-primary/40">
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Gemini API 키 설정</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>1. Google AI Studio(aistudio.google.com)에서 API 키를 발급합니다.</p>
        <p>2. 프로젝트의 <code className="rounded bg-muted px-1">.env.local</code>에 <code className="rounded bg-muted px-1">GEMINI_API_KEY=발급받은키</code>를 추가합니다.</p>
        <p>3. 개발 서버를 다시 시작합니다. 키는 서버에서만 사용되며 브라우저에 전달되지 않습니다.</p>
        <p className="text-xs text-muted-foreground">키 없이도 &quot;추천·계획&quot; 탭의 규칙 기반 다음 운동 추천은 사용할 수 있습니다.</p>
      </CardContent>
    </Card>
  );
}

async function ChatTab({ supabase, convId, configured }: { supabase: SB; convId: string | null; configured: boolean }) {
  const [{ data: convs }, { data: msgs }] = await Promise.all([
    supabase.from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30),
    convId ? supabase.from("ai_messages").select("id, role, content, evidence, safety_notice, created_at").eq("conversation_id", convId).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const messages = (msgs ?? []) as { id: string; role: "user" | "assistant"; content: string; evidence: { name: string; summary: string }[]; safety_notice: string | null }[];
  const current = convs?.find((c) => c.id === convId);

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="space-y-1">
        <Link href="/coach?tab=chat" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full justify-start")}><MessageSquarePlus /> 새 대화</Link>
        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          {convs?.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/coach?tab=chat&c=${c.id}`} className={cn("block max-w-56 truncate rounded-lg px-3 py-2 text-sm", c.id === convId ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}>{c.title}</Link>
            </li>
          ))}
        </ul>
      </aside>
      <Card>
        <CardContent className="space-y-4">
          {current && (
            <div className="flex items-center justify-between border-b pb-2">
              <p className="truncate text-sm font-medium">{current.title}</p>
              <DeleteConversationButton id={current.id} />
            </div>
          )}
          {messages.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Bot className="mx-auto mb-2 size-8" />
              운동 기록, 중량 추천, 부위별 균형, 대체 운동 등을 물어보세요. 답변 아래에 AI가 실제로 조회한 데이터가 표시됩니다.
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{m.content}</div>
            ) : (
              <div key={m.id} className="max-w-[95%] space-y-2 text-sm">
                {m.safety_notice && <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs"><ShieldAlert className="size-4 shrink-0 text-amber-500" />{m.safety_notice}</p>}
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2"><Markdown text={m.content} /></div>
                <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <Database className="size-3" />
                  {m.evidence.length ? m.evidence.map((e, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5">{e.summary}</span>) : "조회한 개인 데이터 없음(일반 지식 답변)"}
                </p>
              </div>
            ),
          )}
          <ChatInput conversationId={convId} disabled={!configured} />
        </CardContent>
      </Card>
    </div>
  );
}

async function PlansTab({ supabase, configured }: { supabase: SB; configured: boolean }) {
  const ctx = await loadContext();
  const rr = recommendedRoutine(ctx);
  const targets = rr ? routineTargets(ctx, rr.routine, rr.isDeload) : [];
  const { data } = await supabase.from("ai_recommendations").select("id, kind, status, title, rationale, before, payload, created_at, decided_at").order("created_at", { ascending: false }).limit(20);
  const recs = (data ?? []) as Rec[];
  const pending = recs.filter((r) => r.status === "pending");
  const past = recs.filter((r) => r.status !== "pending");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>오늘의 추천 운동 <span className="text-xs font-normal text-muted-foreground">· 규칙 기반 점진적 과부하</span></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!rr ? (
            <p className="text-sm text-muted-foreground">저장된 루틴이 없어 추천할 수 없습니다. <Link href="/routines" className="text-primary hover:underline">루틴을 만들거나</Link> 아래에서 AI에게 새 루틴을 요청하세요.</p>
          ) : (
            <>
              <p className="text-sm"><span className="font-semibold">{rr.routine.name}</span> <span className="text-muted-foreground">· {rr.reason}{rr.isDeload && " · 가벼운 주"}</span></p>
              <ul className="divide-y text-sm">
                {targets.map((t) => (
                  <li key={t.item.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{t.name}</span>
                      <span className="num shrink-0">{t.rec.weight != null ? `${t.rec.weight}kg · ` : ""}{t.rec.repsTarget}회 × {t.rec.sets}세트</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className={cn("mr-1 rounded px-1", t.rec.status === "increase" ? "bg-primary/15 text-primary" : "bg-muted")}>{STATUS_LABEL[t.rec.status]}</span>
                      {t.rec.stalled && <span className="mr-1 rounded bg-amber-500/15 px-1 text-amber-600 dark:text-amber-400">정체</span>}
                      {t.rec.reason}
                    </p>
                  </li>
                ))}
              </ul>
              <form action={startWorkout}>
                <input type="hidden" name="mode" value="recommended" />
                <button className={cn(buttonVariants(), "h-11 w-full")}>이 추천으로 운동 시작</button>
              </form>
              <p className="text-xs text-muted-foreground">추천은 지난 기록·목표 반복 범위·RPE/RIR·중량 증가 단위로 계산한 제안입니다. 컨디션에 맞게 자유롭게 바꾸세요. 정체는 최근 3회 추정 1RM(맨몸은 최다 반복)이 늘지 않은 경우입니다.</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>AI 계획 생성</CardTitle></CardHeader>
        <CardContent><PlanGenerator routines={ctx.routines.map((r) => ({ id: r.id, name: r.name }))} disabled={!configured} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>승인 대기 중인 제안 {pending.length > 0 && <span className="text-primary">{pending.length}</span>}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">대기 중인 제안이 없습니다.</p>}
          {pending.map((r) => (
            <div key={r.id} className="space-y-3 rounded-lg border p-3">
              <p className="font-medium">{r.title}</p>
              {r.rationale && <div className="rounded-md bg-muted p-2 text-xs"><Markdown text={r.rationale} /></div>}
              <Diff rec={r} />
              <RecommendationButtons id={r.id} />
            </div>
          ))}
          {past.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">처리된 제안 {past.length}개</summary>
              <ul className="mt-2 space-y-1">
                {past.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{r.title}</span>
                    <span className={cn("shrink-0", r.status === "approved" ? "text-primary" : "text-muted-foreground")}>{{ approved: "적용됨", rejected: "거절", failed: "적용 실패" }[r.status]} · {formatDate(r.decided_at ?? r.created_at, "M/d HH:mm", ctx.tz)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Diff({ rec }: { rec: Rec }) {
  if (rec.kind === "weekly_plan") {
    const after = (rec.payload as WeeklyPayload).assignments;
    const before = new Map((rec.before as WeeklyPayload | null)?.assignments.map((a) => [a.routine_id, a.weekdays]) ?? []);
    return (
      <table className="w-full text-xs">
        <thead className="text-muted-foreground"><tr><th className="text-left font-normal">루틴</th><th className="text-left font-normal">변경 전</th><th className="text-left font-normal">변경 후</th></tr></thead>
        <tbody>
          {after.map((a) => {
            const b = before.get(a.routine_id) ?? [];
            const changed = b.join() !== a.weekdays.join();
            return (
              <tr key={a.routine_id} className={cn("border-t", changed && "font-medium")}>
                <td className="py-1">{a.routine_name}</td>
                <td className="text-muted-foreground">{b.map((d) => DAYS[d]).join(" ") || "-"}</td>
                <td className={cn(changed && "text-primary")}>{a.weekdays.map((d) => DAYS[d]).join(" ") || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  const after = rec.payload as RoutinePayload;
  const before = rec.before as RoutinePayload | null;
  const fmt = (i: RoutinePayload["items"][number]) => `${i.target_sets}세트 ${i.rep_min ?? "?"}~${i.rep_max ?? "?"}회 휴식 ${i.rest_seconds ?? "기본"}초`;
  const beforeMap = new Map(before?.items.map((i) => [i.exercise_id, i]) ?? []);
  const afterIds = new Set(after.items.map((i) => i.exercise_id));
  return (
    <div className="space-y-1 text-xs">
      {before && <p className="text-muted-foreground">이름: {before.name} → <span className="text-foreground">{after.name}</span></p>}
      <ul className="space-y-1">
        {after.items.map((i) => {
          const b = beforeMap.get(i.exercise_id);
          const tag = !before ? null : !b ? "추가" : fmt(b) !== fmt(i) ? "변경" : null;
          return (
            <li key={i.exercise_id} className="flex justify-between gap-2">
              <span className="truncate">{tag && <span className="mr-1 rounded bg-primary/15 px-1 text-primary">{tag}</span>}{i.exercise_name}</span>
              <span className="num shrink-0 text-muted-foreground">{b && tag === "변경" && <s className="mr-1">{fmt(b)}</s>}{fmt(i)}</span>
            </li>
          );
        })}
        {before?.items.filter((i) => !afterIds.has(i.exercise_id)).map((i) => (
          <li key={i.exercise_id} className="flex justify-between gap-2 text-muted-foreground">
            <span className="truncate"><span className="mr-1 rounded bg-destructive/15 px-1 text-destructive">삭제</span><s>{i.exercise_name}</s></span>
            <span className="num shrink-0"><s>{fmt(i)}</s></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ReportsTab({ supabase, configured }: { supabase: SB; configured: boolean }) {
  const { data } = await supabase.from("ai_insights").select("id, kind, period_start, content, created_at").order("created_at", { ascending: false }).limit(12);
  const items = (data ?? []) as { id: string; kind: "daily" | "weekly" | "monthly"; period_start: string; content: Insight & { facts_period?: string }; created_at: string }[];
  const label = { daily: "오늘의 코칭 요약", weekly: "주간 리포트", monthly: "월간 리포트" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <InsightButton kind="daily" label="오늘의 코칭 요약" disabled={!configured} />
        <InsightButton kind="weekly" label="주간 리포트" disabled={!configured} />
        <InsightButton kind="monthly" label="월간 리포트" disabled={!configured} />
      </div>
      <p className="text-xs text-muted-foreground">리포트는 서버에서 계산한 실제 수치만 AI에 전달해 작성합니다. 같은 기간을 다시 만들면 최신 내용으로 바뀝니다.</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">아직 만든 리포트가 없습니다.</p>}
      {items.map((it) => <InsightCard key={it.id} title={label[it.kind]} insight={it.content} period={it.content.facts_period} />)}
    </div>
  );
}
