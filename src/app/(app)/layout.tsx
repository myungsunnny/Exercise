import Link from "next/link";
import { Dumbbell, LogOut } from "lucide-react";
import { signOut } from "@/app/actions/settings";
import { SidebarLink, TabLink } from "@/components/shell/nav-link";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { MOBILE_TABS, NAV } from "@/lib/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-5 text-lg font-semibold">
          <Dumbbell className="size-5 text-primary" aria-hidden /> MyFit AI
        </Link>
        <nav aria-label="주 메뉴" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map((n) => (
            <SidebarLink key={n.href} href={n.href} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
            <Dumbbell className="size-5 text-primary" aria-hidden /> MyFit AI
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon-lg" aria-label="로그아웃">
              <LogOut className="size-5" />
            </Button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 lg:px-6 lg:pb-10">{children}</main>
      </div>

      <nav aria-label="하단 탭" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-end px-2 pt-1">
          {MOBILE_TABS.map((href) => (
            <TabLink key={href} href={href} primary={href === "/workout"} />
          ))}
        </div>
      </nav>
    </div>
  );
}
