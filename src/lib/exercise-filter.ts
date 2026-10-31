import type { Exercise } from "@/lib/types";

export const MUSCLE_OPTIONS = [
  ["chest", "가슴"], ["back", "등"], ["shoulders", "어깨"], ["biceps", "이두"], ["triceps", "삼두"], ["forearms", "전완"],
  ["abs", "복근"], ["glutes", "둔근"], ["quads", "대퇴사두"], ["hamstrings", "햄스트링"], ["calves", "종아리"],
] as const;

export const MUSCLE_NAME: Record<string, string> = Object.fromEntries(MUSCLE_OPTIONS);

export type ExerciseFilter = { q?: string; muscle?: string; equipment?: string; difficulty?: string; type?: string; favorites?: Set<string> | null };

// 한글/영문 이름 부분 일치 + 필터
export function filterExercises(list: Exercise[], f: ExerciseFilter): Exercise[] {
  const q = f.q?.trim().toLowerCase().replace(/\s+/g, "");
  return list.filter((e) => {
    if (q && !(e.name_ko.replace(/\s+/g, "").toLowerCase().includes(q) || e.name_en?.replace(/\s+/g, "").toLowerCase().includes(q))) return false;
    if (f.muscle && !e.exercise_muscles.some((m) => m.muscle_id === f.muscle && m.role === "primary")) return false;
    if (f.equipment && e.equipment !== f.equipment) return false;
    if (f.difficulty && e.difficulty !== f.difficulty) return false;
    if (f.type && e.exercise_type !== f.type) return false;
    if (f.favorites && !f.favorites.has(e.id)) return false;
    return true;
  });
}
