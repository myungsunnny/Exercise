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
  { href: "/plan", label: "주간·월간 계획", icon: CalendarDays, phase: 2 },
  { href: "/calendar", label: "캘린더", icon: CalendarDays, phase: 2 },
  { href: "/coach", label: "AI 트레이너", icon: Bot, phase: 3 },
  { href: "/stats", label: "통계·성과", icon: BarChart3, phase: 2 },
  { href: "/muscles", label: "근육별 분석", icon: PersonStanding, phase: 2 },
  { href: "/exercises", label: "운동 라이브러리", icon: BookOpen, phase: 1 },
  { href: "/body", label: "신체 변화", icon: Ruler, phase: 4 },
  { href: "/nutrition", label: "식단·영양", icon: Utensils, phase: 4 },
  { href: "/wellness", label: "수면·건강", icon: Moon, phase: 4 },
  { href: "/goals", label: "목표·성취", icon: Target, phase: 2 },
  { href: "/settings", label: "설정", icon: Settings, phase: 1 },
] as const;

export const MOBILE_TABS = ["/", "/history", "/workout", "/routines", "/exercises"] as const;

export const COMING_SOON: Record<string, { label: string; phase: number; summary: string }> = {
  plan: { label: "주간·월간 운동 계획", phase: 2, summary: "요일별 루틴 배치와 장기 프로그램(4·8·12주)." },
  calendar: { label: "운동 캘린더", phase: 2, summary: "월·주·일 보기, 예정/완료/휴식일 표시, 일정 이동." },
  coach: { label: "AI 퍼스널 트레이너", phase: 3, summary: "실제 기록을 조회해 답하는 AI 대화, 계획 생성과 승인 후 적용." },
  stats: { label: "운동 통계 및 성과 분석", phase: 2, summary: "기간별 운동량·빈도, 종목별 중량 추이, 추정 1RM, 기간 비교." },
  muscles: { label: "근육별 운동 분석", phase: 2, summary: "근육도 기반 부위별 주간 세트 수와 최근 훈련일." },
  body: { label: "신체 변화 관리", phase: 4, summary: "체중·체성분·둘레 기록, 비공개 변화 사진." },
  nutrition: { label: "식단 및 영양 관리", phase: 4, summary: "식사·칼로리·탄단지·수분 기록과 통계." },
  wellness: { label: "수면·건강 관리", phase: 4, summary: "수면, 피로도, 컨디션, 안정시 심박, 걸음 수 수동 기록." },
  goals: { label: "목표 및 성취 관리", phase: 2, summary: "주간 횟수·중량·체중 목표 진행률과 배지." },
};
