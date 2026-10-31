"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { updateDashboardOrder } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DashCard = { key: string; title: string; wide?: boolean; node: React.ReactNode };

// 저장된 순서를 적용하고, 새로 추가된 카드는 기본 순서대로 뒤에 붙인다
export function orderCards(cards: { key: string }[], saved: string[]) {
  const known = saved.filter((k) => cards.some((c) => c.key === k));
  return [...known, ...cards.map((c) => c.key).filter((k) => !known.includes(k))];
}

export function DashboardGrid({ cards, saved }: { cards: DashCard[]; saved: string[] }) {
  const [order, setOrder] = useState(() => orderCards(cards, saved));
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const byKey = new Map(cards.map((c) => [c.key, c]));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const finish = () =>
    start(async () => {
      const r = await updateDashboardOrder(order);
      if (r.ok) setEditing(false); else toast.error("순서를 저장하지 못했습니다.");
    });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {editing ? (
          <Button size="sm" onClick={finish} disabled={pending}><Check /> 순서 저장</Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><LayoutGrid /> 카드 순서 변경</Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {order.map((k, i) => {
          const c = byKey.get(k)!;
          return (
            <div key={k} className={cn("relative min-w-0", c.wide && "lg:col-span-2", editing && "rounded-xl ring-2 ring-primary/40")}>
              {editing && (
                <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-lg bg-popover p-1 shadow">
                  <span className="self-center px-1 text-xs text-muted-foreground">{c.title}</span>
                  <Button size="icon" variant="ghost" aria-label={`${c.title} 위로`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" aria-label={`${c.title} 아래로`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                </div>
              )}
              {c.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}
