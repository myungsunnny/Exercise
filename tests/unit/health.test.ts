import { describe, expect, it } from "vitest";
import { movingAverage, proteinRange, scaleMacros, sumMacros, trendChange } from "@/lib/health";

describe("body trend", () => {
  const pts = [
    { date: "2026-10-01", value: 80 }, { date: "2026-10-02", value: 81 }, { date: "2026-10-05", value: 79 },
    { date: "2026-10-20", value: 78 }, { date: "2026-10-21", value: 77 },
  ];
  it("averages the trailing 7 days", () => {
    const m = movingAverage(pts);
    expect(m[2]).toEqual({ date: "2026-10-05", value: 80 });
    expect(m[4]).toEqual({ date: "2026-10-21", value: 77.5 });
  });
  it("compares smoothed values instead of single days", () => {
    expect(trendChange(pts, 14)).toEqual({ from: 80, to: 77.5, diff: -2.5 });
    expect(trendChange(pts.slice(0, 1), 7)).toBeNull();
    expect(trendChange(pts, 60)).toBeNull();
  });
});

describe("macros", () => {
  it("scales per serving and sums", () => {
    const rice = { kcal: 315, protein_g: 5.5, carbs_g: 70, fat_g: 0.6 };
    expect(scaleMacros(rice, 1.5)).toEqual({ kcal: 472.5, protein_g: 8.3, carbs_g: 105, fat_g: 0.9 });
    expect(sumMacros([rice, { kcal: 165, protein_g: 31 }])).toEqual({ kcal: 480, protein_g: 36.5, carbs_g: 70, fat_g: 0.6 });
  });
  it("gives a protein reference range only when weight is known", () => {
    expect(proteinRange("hypertrophy", 75)).toEqual({ min: 120, max: 165, perKg: [1.6, 2.2] });
    expect(proteinRange(null, null)).toBeNull();
  });
});
