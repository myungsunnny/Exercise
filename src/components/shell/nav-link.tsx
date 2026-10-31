"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const byHref = (href: string) => NAV.find((n) => n.href === href)!;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function SidebarLink({ href }: { href: string }) {
  const { label, icon: Icon, phase } = byHref(href);
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
      <span className="flex-1">{label}</span>
      {phase > 1 && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">준비 중</span>}
    </Link>
  );
}

export function TabLink({ href, primary }: { href: string; primary?: boolean }) {
  const { label, icon: Icon } = byHref(href);
  const pathname = usePathname();
  const active = isActive(pathname, href);
  if (primary)
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className="-mt-5 flex flex-col items-center gap-1">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Icon className="size-6" aria-hidden />
        </span>
        <span className={cn("text-[11px]", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
      </Link>
    );
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1">
      <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className={cn("text-[11px]", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </Link>
  );
}
