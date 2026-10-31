"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RestState = { endsAt: number; total: number; label: string } | null;

const KEY = "myfit:rest";

// 남은 시간은 항상 종료 시각 기준으로 계산하므로 탭이 백그라운드에 있어도 어긋나지 않는다.
export function restRemaining(rest: RestState, now: number): number {
  return rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
}

function readStored(): RestState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.endsAt === "number" && v.endsAt > Date.now() ? v : null;
  } catch {
    return null;
  }
}

let audioCtx: AudioContext | null = null;
// iOS 등은 사용자 제스처 안에서 AudioContext를 만들어야 소리가 난다.
export function primeAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {}
}

function beep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.25, 0.5].forEach((d) => {
    const o = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
    o.connect(g).connect(audioCtx!.destination);
    o.start(t + d);
    o.stop(t + d + 0.2);
  });
}

function notifyDone(label: string) {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
  beep();
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
    try {
      new Notification("휴식 종료", { body: `${label} 다음 세트를 시작하세요.`, tag: "myfit-rest" });
    } catch {}
  }
}

export function useRestTimer() {
  const [rest, setRest] = useState<RestState>(null);
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    // localStorage는 클라이언트에서만 읽을 수 있어 마운트 후 복원한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRest(readStored());
  }, []);

  useEffect(() => {
    try {
      if (rest) localStorage.setItem(KEY, JSON.stringify(rest));
      else localStorage.removeItem(KEY);
    } catch {}
  }, [rest]);

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.endsAt && firedFor.current !== rest.endsAt) {
        firedFor.current = rest.endsAt;
        notifyDone(rest.label);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [rest]);

  const start = useCallback((seconds: number, label: string) => {
    if (seconds <= 0) return setRest(null);
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds, label });
  }, []);

  const adjust = useCallback((delta: number) => {
    setRest((r) => (r ? { ...r, endsAt: Math.max(Date.now() + 1000, Math.max(Date.now(), r.endsAt) + delta * 1000), total: Math.max(1, r.total + delta) } : r));
  }, []);

  const stop = useCallback(() => setRest(null), []);

  return { rest, remaining: restRemaining(rest, now), start, adjust, stop };
}

// 운동 중 화면 꺼짐 방지(지원 브라우저에서만)
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock?.release();
      } catch {}
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [enabled]);
}
