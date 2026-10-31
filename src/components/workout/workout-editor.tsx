"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudAlert, CloudCheck, Loader2, Pause, Play, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWorkout, fetchPreviousSets } from "@/app/actions/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PrevByExercise } from "@/lib/data";
import { formatClock, formatKg, formatMinutes } from "@/lib/format";
import type { Exercise } from "@/lib/types";
import {
  elapsedSeconds, newExercise, reduceHistory, reduceSession, toPayload,
  type Action, type DraftSession, type ExerciseRef, type History,
} from "@/lib/workout/model";
import { summarize } from "@/lib/workout/stats";
import { ExerciseCard } from "./exercise-card";
import { ExercisePicker } from "./exercise-picker";
import { RestBar } from "./rest-bar";
import { primeAudio, useRestTimer, useWakeLock } from "./use-rest-timer";
import { readUnsavedMirror, useAutosave, type SaveStatus } from "./use-autosave";

type EditorAction = Action | { type: "undo" } | { type: "set"; draft: DraftSession };

function editorReducer(h: History, a: EditorAction): History {
  if (a.type === "set") return { present: a.draft, past: [...h.past, h.present].slice(-50), lastKey: null };
  return reduceHistory(h, a);
}

export type EditorProps = {
  initial: DraftSession;
  revision: number;
  exercises: Exercise[];
  previous: PrevByExercise;
  restDefaults: Record<string, number>; // 종목별 휴식 시간(사용자 설정)
  defaultRest: number;
  mode: "live" | "edit";
};

export function WorkoutEditor({ initial, revision, exercises, previous: initialPrev, restDefaults, defaultRest, mode }: EditorProps) {
  const router = useRouter();
  const [h, dispatch] = useReducer(editorReducer, { present: initial, past: [], lastKey: null });
  const draft = h.present;
  const live = mode === "live";
  const { status, error, flush, retry } = useAutosave(draft, revision, true);
  const timer = useRestTimer();
  const [previous, setPrevious] = useState(initialPrev);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "replace"; exId: string } | null>(null);
  const [confirm, setConfirm] = useState<"finish" | "discard" | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useWakeLock(live && !draft.paused_at);

  // 서버 저장 전에 브라우저가 닫혔다면 기기에 남은 변경분을 복구
  useEffect(() => {
    const local = readUnsavedMirror(initial.id);
    if (local && JSON.stringify(toPayload(local)) !== JSON.stringify(toPayload(initial))) {
      dispatch({ type: "set", draft: local });
      toast.info("저장되지 않았던 변경 사항을 복구했습니다.");
    }
    // 마운트 시 한 번만 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const restFor = useCallback(
    (exId: string) => {
      const e = draft.exercises.find((x) => x.id === exId);
      if (!e) return defaultRest;
      return e.rest_seconds ?? restDefaults[e.exercise_id] ?? defaultRest;
    },
    [draft.exercises, restDefaults, defaultRest],
  );

  const onToggleDone = useCallback(
    (exId: string, setId: string, fill: { weight?: string; reps?: string } | undefined, wasDone: boolean) => {
      primeAudio();
      dispatch({ type: "toggleDone", exId, setId, now: new Date().toISOString(), fill });
      if (wasDone || !live) return;
      // 슈퍼세트 중간 종목이면 휴식 없이 다음 종목으로
      const i = draft.exercises.findIndex((e) => e.id === exId);
      const ex = draft.exercises[i];
      const next = draft.exercises[i + 1];
      if (ex?.superset_group != null && next?.superset_group === ex.superset_group) return;
      timer.start(restFor(exId), ex?.exercise_name ?? "");
    },
    [draft.exercises, live, restFor, timer],
  );

  const addExercises = async (refs: ExerciseRef[]) => {
    const fresh = refs.map((r) => newExercise(r));
    dispatch({ type: "addExercises", exercises: fresh });
    const missing = refs.map((r) => r.id).filter((id) => !previous[id]);
    if (missing.length) {
      try {
        const more = await fetchPreviousSets(missing, draft.id);
        setPrevious((p) => ({ ...p, ...more }));
      } catch {
        /* 이전 기록은 보조 정보라 실패해도 진행 */
      }
    }
  };

  const summary = useMemo(() => {
    const p = toPayload(draft);
    return summarize(p.exercises.map((e, i) => ({ exercise_type: draft.exercises[i].exercise_type, sets: e.sets })));
  }, [draft]);
  const incomplete = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);

  const finish = async (dropIncomplete: boolean) => {
    setBusy(true);
    let next = draft;
    if (dropIncomplete) next = { ...next, exercises: next.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length > 0) };
    next = reduceSession(next, { type: "finish", now: new Date().toISOString() });
    dispatch({ type: "set", draft: next });
    const ok = await flush(next);
    setBusy(false);
    if (!ok) return toast.error("저장하지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.");
    timer.stop();
    toast.success("운동을 저장했습니다.");
    router.push(`/history/${draft.id}`);
  };

  const finishEdit = async () => {
    setBusy(true);
    const ok = await flush();
    setBusy(false);
    if (!ok) return toast.error("저장하지 못했습니다. 다시 시도해 주세요.");
    router.push(`/history/${draft.id}`);
    router.refresh();
  };

  const discard = async () => {
    setBusy(true);
    const res = await deleteWorkout(draft.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    try {
      localStorage.removeItem(`myfit:draft:${draft.id}`);
    } catch {}
    timer.stop();
    router.push(live ? "/workout" : "/history");
    router.refresh();
  };

  const elapsed = elapsedSeconds(draft, now);

  return (
    <div className={timer.rest ? "pb-24" : undefined}>
      {/* 상단: 제목·경과 시간·저장 상태 */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-2">
          <Input
            aria-label="운동 제목"
            value={draft.title}
            onChange={(e) => dispatch({ type: "session", patch: { title: e.target.value } })}
            className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:border-input"
            maxLength={80}
          />
          <Button variant="ghost" size="icon-lg" aria-label="되돌리기" disabled={h.past.length === 0} onClick={() => dispatch({ type: "undo" })}>
            <Undo2 className="size-5" />
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm">
          {live ? (
            <>
              <span className="num text-xl font-semibold" aria-label="운동 경과 시간">{formatClock(elapsed)}</span>
              {draft.paused_at ? (
                <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "resume", now: new Date().toISOString() })}>
                  <Play /> 재개
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "pause", now: new Date().toISOString() })}>
                  <Pause /> 일시정지
                </Button>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">완료된 기록 편집 중</span>
          )}
          <span className="num ml-auto text-muted-foreground">{formatKg(summary.volume)} · {summary.sets}세트</span>
          <SaveBadge status={status} error={error} onRetry={() => void retry()} />
        </div>
        {draft.paused_at && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">일시정지 중입니다. 기록은 계속 수정할 수 있습니다.</p>}
      </div>

      <div className="space-y-4">
        {draft.exercises.map((e, i) => (
          <ExerciseCard
            key={e.id}
            exercise={e}
            index={i}
            count={draft.exercises.length}
            nextInSuperset={draft.exercises[i + 1]?.superset_group != null && draft.exercises[i + 1]?.superset_group === e.superset_group}
            previous={previous[e.exercise_id]}
            restSeconds={restFor(e.id)}
            dispatch={dispatch}
            onToggleDone={onToggleDone}
            onReplace={() => setPicker({ mode: "replace", exId: e.id })}
          />
        ))}

        {draft.exercises.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">운동 종목을 추가해 기록을 시작하세요.</p>
        )}

        <Button variant="secondary" className="h-12 w-full text-base" onClick={() => setPicker({ mode: "add" })}>
          <Plus className="size-5" /> 운동 추가
        </Button>

        <Textarea
          aria-label="운동 메모"
          placeholder="오늘 운동 메모 (컨디션, 특이사항 등)"
          value={draft.notes}
          onChange={(e) => dispatch({ type: "session", patch: { notes: e.target.value } })}
          maxLength={2000}
        />

        <div className="flex gap-2 pt-2">
          <Button variant="destructive" className="h-12" onClick={() => setConfirm("discard")} disabled={busy}>
            <Trash2 /> {live ? "운동 취소" : "기록 삭제"}
          </Button>
          {live ? (
            <Button className="h-12 flex-1 text-base" onClick={() => setConfirm("finish")} disabled={busy}>
              운동 종료
            </Button>
          ) : (
            <Button className="h-12 flex-1 text-base" onClick={finishEdit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} 편집 완료
            </Button>
          )}
        </div>
      </div>

      <ExercisePicker
        open={picker != null}
        onOpenChange={(o) => !o && setPicker(null)}
        exercises={exercises}
        multiple={picker?.mode === "add"}
        onPick={(refs) => {
          if (picker?.mode === "replace") dispatch({ type: "replaceExercise", exId: picker.exId, ex: refs[0] });
          else void addExercises(refs);
          if (picker?.mode === "replace" && !previous[refs[0].id])
            fetchPreviousSets([refs[0].id], draft.id).then((m) => setPrevious((p) => ({ ...p, ...m })), () => {});
          setPicker(null);
        }}
      />

      {live && <RestBar timer={timer} />}

      <AlertDialog open={confirm === "finish"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운동을 종료할까요?</AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-left text-sm text-foreground">
                <SummaryItem label="운동 시간" value={formatMinutes(elapsed)} />
                <SummaryItem label="종목" value={`${draft.exercises.length}개`} />
                <SummaryItem label="완료 세트(본세트)" value={`${summary.sets}세트`} />
                <SummaryItem label="총 운동량" value={formatKg(summary.volume)} />
              </dl>
              {incomplete > 0 && <p className="mt-3 text-sm">완료하지 않은 세트가 {incomplete}개 있습니다. 통계에는 완료한 세트만 반영됩니다.</p>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 운동</AlertDialogCancel>
            {incomplete > 0 && (
              <Button variant="outline" disabled={busy} onClick={() => void finish(true)}>미완료 세트 지우고 종료</Button>
            )}
            <AlertDialogAction disabled={busy} onClick={() => void finish(false)}>
              {busy && <Loader2 className="animate-spin" />} 저장하고 종료
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "discard"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{live ? "진행 중인 운동을 취소할까요?" : "이 운동 기록을 삭제할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>기록한 모든 세트가 삭제되며 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void discard()}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}

function SaveBadge({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  if (status === "error")
    return (
      <button onClick={onRetry} className="flex items-center gap-1 text-destructive" title={error ?? undefined}>
        <CloudAlert className="size-4" /> 저장 실패 · 재시도
      </button>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-muted-foreground" aria-live="polite">
        <CloudCheck className="size-4" /> 저장됨
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground" aria-live="polite">
      <Loader2 className="size-4 animate-spin" /> 저장 중
    </span>
  );
}

