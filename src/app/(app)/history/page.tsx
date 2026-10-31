import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { getPreferences, listCompletedSessions } from "@/lib/data";
import { formatDate, formatKg, formatMinutes } from "@/lib/format";
import { sessionDurationSec, sessionSummary } from "@/lib/session-stats";

export const metadata = { title: "운동 기록 히스토리" };

export default async function HistoryPage() {
  const [sessions, prefs] = await Promise.all([listCompletedSessions(), getPreferences()]);
  const byMonth = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = formatDate(s.started_at, "yyyy년 M월", prefs.timezone);
    byMonth.set(k, [...(byMonth.get(k) ?? []), s]);
  }

  return (
    <>
      <PageHeader title="운동 기록 히스토리" description={`완료한 운동 ${sessions.length}회`} />
      {sessions.length === 0 ? (
        <EmptyState icon={History} title="완료한 운동이 없습니다">
          <Link href="/workout" className="text-sm text-primary hover:underline">운동 시작하기</Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...byMonth].map(([month, list]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{month} · {list.length}회</h2>
              <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                {list.map((s) => {
                  const sum = sessionSummary(s);
                  return (
                    <li key={s.id}>
                      <Link href={`/history/${s.id}`} className="block px-4 py-3 hover:bg-muted/50">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium">{s.title}</p>
                          <p className="num shrink-0 text-sm">{formatKg(sum.volume)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.started_at, "M월 d일 (EEE) HH:mm", prefs.timezone)} · {formatMinutes(sessionDurationSec(s))} · {sum.sets}세트
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{s.workout_exercises.map((e) => e.exercise_name).join(", ")}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
