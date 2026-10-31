"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import type { useRestTimer } from "./use-rest-timer";

export function RestBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  const { rest, remaining, adjust, stop } = timer;
  const [canAsk, setCanAsk] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanAsk(typeof Notification !== "undefined" && Notification.permission === "default");
  }, []);
  if (!rest) return null;
  const done = remaining === 0;
  const pct = Math.min(100, (1 - remaining / rest.total) * 100);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 lg:bottom-4 lg:left-60">
      <div role="timer" aria-live="off" className="mx-auto max-w-xl overflow-hidden rounded-2xl border bg-popover shadow-xl">
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 p-2 pl-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{done ? "휴식 종료 · 다음 세트" : `휴식 중 · ${rest.label}`}</p>
            <p className={`num text-2xl font-semibold ${done ? "text-primary" : ""}`} aria-label={`남은 휴식 ${remaining}초`}>{formatClock(remaining)}</p>
          </div>
          {canAsk && (
            <Button variant="ghost" size="icon-lg" aria-label="휴식 종료 알림 켜기" onClick={() => Notification.requestPermission().then(() => setCanAsk(false))}>
              <Bell className="size-5" />
            </Button>
          )}
          <Button variant="secondary" className="h-11 px-3" onClick={() => adjust(-15)} disabled={done}>-15</Button>
          <Button variant="secondary" className="h-11 px-3" onClick={() => adjust(15)}>+15</Button>
          <Button variant="ghost" size="icon-lg" aria-label="휴식 타이머 닫기" onClick={stop}><X className="size-5" /></Button>
        </div>
      </div>
    </div>
  );
}
