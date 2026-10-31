// 신체·영양 계산(순수 함수)

export type Point = { date: string; value: number }; // date = yyyy-MM-dd

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400_000;

// 측정 오차를 줄이기 위한 이동 평균: 각 날짜 기준 직전 N일(당일 포함) 측정값의 평균
export function movingAverage(points: Point[], days = 7): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const win = sorted.filter((q) => dayNum(q.date) <= dayNum(p.date) && dayNum(q.date) > dayNum(p.date) - days);
    return { date: p.date, value: Math.round((win.reduce((a, q) => a + q.value, 0) / win.length) * 100) / 100 };
  });
}

// 최근 7일 평균과 N일 전 시점의 7일 평균을 비교한다(하루 단위 변화로 단정하지 않기 위해)
export function trendChange(points: Point[], days: number): { from: number; to: number; diff: number } | null {
  const avg = movingAverage(points);
  if (avg.length < 2) return null;
  const last = avg[avg.length - 1];
  const target = dayNum(last.date) - days;
  const past = [...avg].reverse().find((p) => dayNum(p.date) <= target);
  if (!past) return null;
  return { from: past.value, to: last.value, diff: Math.round((last.value - past.value) * 100) / 100 };
}

export type Macro = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
export const EMPTY_MACRO: Macro = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function sumMacros(items: Partial<Macro>[]): Macro {
  const r = items.reduce<Macro>((a, i) => ({
    kcal: a.kcal + Number(i.kcal ?? 0), protein_g: a.protein_g + Number(i.protein_g ?? 0),
    carbs_g: a.carbs_g + Number(i.carbs_g ?? 0), fat_g: a.fat_g + Number(i.fat_g ?? 0),
  }), { ...EMPTY_MACRO });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { kcal: Math.round(r.kcal), protein_g: r1(r.protein_g), carbs_g: r1(r.carbs_g), fat_g: r1(r.fat_g) };
}

// 1회 제공량 값 × 섭취량
export function scaleMacros(m: Macro, servings: number): Macro {
  const r1 = (n: number) => Math.round(n * servings * 10) / 10;
  return { kcal: r1(m.kcal), protein_g: r1(m.protein_g), carbs_g: r1(m.carbs_g), fat_g: r1(m.fat_g) };
}

// 운동 목표에 따른 단백질 섭취 참고 범위(g/체중kg/일). 일반적으로 알려진 범위이며 의학적 처방이 아니다.
const PROTEIN_RANGE: Record<string, [number, number]> = {
  hypertrophy: [1.6, 2.2], strength: [1.6, 2.2], fat_loss: [1.6, 2.4], endurance: [1.2, 1.6], general_fitness: [1.0, 1.6],
};
export function proteinRange(goal: string | null, weightKg: number | null): { min: number; max: number; perKg: [number, number] } | null {
  if (!weightKg) return null;
  const perKg = PROTEIN_RANGE[goal ?? "general_fitness"] ?? PROTEIN_RANGE.general_fitness;
  return { min: Math.round(weightKg * perKg[0]), max: Math.round(weightKg * perKg[1]), perKg };
}
