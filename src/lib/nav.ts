import {
  BarChart3, BookOpen, Bot, CalendarDays, ClipboardList, Dumbbell, History,
  House, Moon, PersonStanding, Ruler, Settings, Target, Utensils,
} from "lucide-react";

// phase: 해당 메뉴가 구현될 개발 단계. 1 = 현재 사용 가능
export const NAV = [
  { href: "/", label: "홈", icon: House, phase: 1 },
  { href: "/workout", label: "운동 기록", icon: Dumbbell, phase: 1 },
  { href: "/history", label: "히스토리", icon: History, phase: 1 },
  { href: "/routines", label: "루틴", icon: ClipboardList, phase: 1 },
  { href: "/plan", label: "주간·월간 계획", icon: CalendarDays, phase: 1 },
  { href: "/calendar", label: "캘린더", icon: CalendarDays, phase: 1 },
  { href: "/coach", label: "AI 트레이너", icon: Bot, phase: 1 },
  { href: "/stats", label: "통계·성과", icon: BarChart3, phase: 1 },
  { href: "/muscles", label: "근육별 분석", icon: PersonStanding, phase: 1 },
  { href: "/exercises", label: "운동 라이브러리", icon: BookOpen, phase: 1 },
  { href: "/body", label: "신체 변화", icon: Ruler, phase: 1 },
  { href: "/nutrition", label: "식단·영양", icon: Utensils, phase: 1 },
  { href: "/wellness", label: "수면·건강", icon: Moon, phase: 1 },
  { href: "/goals", label: "목표·성취", icon: Target, phase: 1 },
  { href: "/settings", label: "설정", icon: Settings, phase: 1 },
] as const;

export const MOBILE_TABS = ["/", "/history", "/workout", "/routines", "/exercises"] as const;
