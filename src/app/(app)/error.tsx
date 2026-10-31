"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState icon={TriangleAlert} title="데이터를 불러오지 못했습니다" className="mt-10">
      <p className="text-sm text-muted-foreground">네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
      <Button onClick={reset} className="h-11">다시 시도</Button>
    </EmptyState>
  );
}
