"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MoreVertical, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createFromTemplate, deleteRoutine, duplicateRoutine } from "@/app/actions/routines";
import { startWorkout } from "@/app/actions/workout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function RoutineActions({ id, canStart }: { id: string; canStart: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 items-center">
      <form action={startWorkout}>
        <input type="hidden" name="mode" value="routine" />
        <input type="hidden" name="routineId" value={id} />
        <Button type="submit" size="icon-lg" variant="ghost" aria-label="이 루틴으로 운동 시작" disabled={!canStart} title={canStart ? undefined : "진행 중인 운동이 있습니다"}>
          <Play className="size-5 text-primary" />
        </Button>
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="루틴 메뉴" />}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : <MoreVertical className="size-5" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/routines/${id}`} />}><Pencil /> 수정</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              start(async () => {
                const r = await duplicateRoutine(id);
                if (r.ok) { toast.success("루틴을 복사했습니다."); router.refresh(); } else toast.error(r.error);
              })
            }
          >
            <Copy /> 복사
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}><Trash2 /> 삭제</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>루틴을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>이 루틴으로 수행한 운동 기록은 그대로 남습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                start(async () => {
                  const r = await deleteRoutine(id);
                  if (r.ok) toast.success("삭제했습니다."); else toast.error(r.error);
                })
              }
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TemplateButton({ tplKey }: { tplKey: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      className="h-10 shrink-0"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await createFromTemplate(tplKey);
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Plus />} 추가
    </Button>
  );
}
