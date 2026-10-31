import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 모든 서버 데이터 접근의 진입점. JWT를 검증하고 RLS가 적용된 클라이언트를 돌려준다.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub as string, email: data.claims.email as string | undefined };
});
