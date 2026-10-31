"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendCoachMessage } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";

const EXAMPLES = ["지난달에 비해 벤치프레스가 얼마나 늘었어?", "이번 주 부위별 운동 균형 어때?", "다음 운동 중량 추천해줘", "스쿼트 대신 할 수 있는 운동은?"];

export function ChatInput({ conversationId, disabled }: { conversationId: string | null; disabled?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = (msg: string) => {
    const t = msg.trim();
    if (!t || sending) return;
    setSending(t);
    setText("");
    start(async () => {
      const r = await sendCoachMessage(conversationId, t);
      setSending(null);
      if (!r.ok) {
        toast.error(r.error);
        setText(t);
        return;
      }
      if (r.conversationId !== conversationId) router.replace(`/coach?tab=chat&c=${r.conversationId}`, { scroll: false });
      else router.refresh();
      ref.current?.focus();
    });
  };

  return (
    <div className="space-y-2">
      {sending && (
        <div className="space-y-2">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{sending}</div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> 기록을 조회하고 답변을 작성하는 중…</p>
        </div>
      )}
      {!conversationId && !sending && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} disabled={disabled} onClick={() => send(e)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground">{e}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
          placeholder={disabled ? "GEMINI_API_KEY 설정 후 사용할 수 있습니다" : "운동에 대해 물어보세요"}
          aria-label="AI 트레이너에게 메시지"
          rows={2}
          maxLength={2000}
          disabled={disabled || !!sending}
          className="min-h-12 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon-lg" className="size-12" aria-label="보내기" disabled={disabled || !!sending || !text.trim()}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </div>
  );
}
