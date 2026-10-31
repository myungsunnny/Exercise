import { Dumbbell } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Dumbbell className="mx-auto size-10 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold">MyFit AI</h1>
          <p className="text-sm text-muted-foreground">개인 전용 서비스입니다. 등록된 계정으로 로그인하세요.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
