"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveWorkout } from "@/app/actions/workout";
import { toPayload, type DraftSession } from "@/lib/workout/model";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

const mirrorKey = (id: string) => `myfit:draft:${id}`;

// 서버 저장 전 변경분을 기기에 임시 보관한다(네트워크 오류·브라우저 종료 대비).
// 영구 저장소는 Supabase이며, 이 값은 서버 저장이 끝나면 지워진다.
export function readUnsavedMirror(id: string): DraftSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(mirrorKey(id)) ?? "null");
    return v?.id === id ? v : null;
  } catch {
    return null;
  }
}

export function useAutosave(draft: DraftSession, initialRevision: number, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(initialRevision);
  const latest = useRef(draft);
  const savedRef = useRef(draft); // 마지막으로 서버에 저장된 스냅샷
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 한 번에 하나의 요청만 보낸다. 저장 중에 바뀐 내용은 끝난 뒤 이어서 저장한다.
  const run = useCallback(async (): Promise<void> => {
    for (;;) {
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      const snapshot = latest.current;
      if (snapshot === savedRef.current) return;
      setStatus("saving");
      let ok = false;
      const p = (async () => {
        try {
          const res = await saveWorkout(toPayload(snapshot), ++revision.current);
          if (!res.ok) throw new Error(res.error);
          if (res.revision > revision.current) revision.current = res.revision;
          savedRef.current = snapshot;
          ok = true;
          setError(null);
          if (latest.current === snapshot) {
            setStatus("saved");
            try {
              localStorage.removeItem(mirrorKey(snapshot.id));
            } catch {}
          }
        } catch (e) {
          setStatus("error");
          setError(e instanceof Error && e.message ? e.message : "저장하지 못했습니다.");
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = p;
      await p;
      if (!ok) return;
    }
  }, []);

  useEffect(() => {
    latest.current = draft;
    if (!enabled || draft === savedRef.current) return;
    setStatus("pending");
    try {
      localStorage.setItem(mirrorKey(draft.id), JSON.stringify(draft));
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), 700);
  }, [draft, enabled, run]);

  // 실패 시 재시도: 온라인 복귀, 화면 복귀, 10초 주기
  useEffect(() => {
    if (status !== "error") return;
    const retry = () => void run();
    const id = setInterval(retry, 10_000);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [status, run]);

  // 저장 안 된 변경이 있으면 페이지 이탈 경고
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current !== savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 즉시 저장(운동 종료 등). 성공 여부를 돌려준다.
  const flush = useCallback(async (snapshot?: DraftSession) => {
    if (timer.current) clearTimeout(timer.current);
    if (snapshot) latest.current = snapshot;
    await run();
    return latest.current === savedRef.current;
  }, [run]);

  return { status, error, flush, retry: run };
}
