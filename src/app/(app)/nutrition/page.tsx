import Link from "next/link";
import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SimpleBarChart } from "@/components/charts/charts";
import { InsightCard } from "@/components/coach/insight-card";
import { PageHeader } from "@/components/common/empty-state";
import { FoodManager, MealSection, NutritionAiButton, NutritionGoalsForm, TemplateBar, WaterTracker } from "@/components/health/nutrition-client";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/ai/coach";
import { aiConfigured } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth";
import { getCoachProfile, getFoods, getLatestWeight, getMeals, getMealTemplates, getNutritionGoals, getPreferences, getWellness, listCompletedSessions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { proteinRange, sumMacros } from "@/lib/health";
import { dateKey, eachDay, fromKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "식단·영양" };
const MEALS = [["breakfast", "아침"], ["lunch", "점심"], ["dinner", "저녁"], ["snack", "간식"]] as const;

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const sp = await searchParams;
  const prefs = await getPreferences();
  const tz = prefs.timezone;
  const today = dateKey(new Date(), tz);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const weekStart = dateKey(addDays(fromKey(date, tz), -6), tz);
  const { supabase } = await requireUser();
  const [foods, meals, goals, templates, wellness, profile, weight, sessions, { data: ins }] = await Promise.all([
    getFoods(), getMeals(weekStart, date), getNutritionGoals(), getMealTemplates(), getWellness(date, date), getCoachProfile(), getLatestWeight(),
    listCompletedSessions({ from: fromKey(weekStart, tz) }),
    supabase.from("ai_insights").select("content, period_start").eq("kind", "nutrition").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const dayMeals = meals.filter((m) => m.eaten_on === date);
  const total = sumMacros(dayMeals.flatMap((m) => m.meal_items));
  const hasEstimate = dayMeals.some((m) => m.meal_items.some((i) => i.is_estimate));
  const week = eachDay(weekStart, date).map((d) => {
    const t = sumMacros(meals.filter((m) => m.eaten_on === d).flatMap((m) => m.meal_items));
    return { label: d.slice(5).replace("-", "/"), kcal: t.kcal, protein: t.protein_g, trained: sessions.some((s) => dateKey(new Date(s.started_at), tz) === d) ? "운동" : "" };
  });
  const loggedDays = week.filter((w) => w.kcal > 0);
  const avg = loggedDays.length ? sumMacros(loggedDays.map((w) => ({ kcal: w.kcal / loggedDays.length, protein_g: w.protein / loggedDays.length }))) : null;
  const protein = proteinRange(profile.training_goal, weight?.weight ?? null);
  const trainedToday = week[week.length - 1].trained;
  const shift = (n: number) => dateKey(addDays(fromKey(date, tz), n), tz);

  const bar = (label: string, v: number, goal: number | null, unit: string) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="num">{v}{goal ? ` / ${goal}` : ""}{unit}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", goal && v > goal * 1.1 ? "bg-amber-500" : "bg-primary")} style={{ width: `${goal ? Math.min(100, (v / goal) * 100) : 0}%` }} /></div>
    </div>
  );

  return (
    <>
      <PageHeader title="식단·영양" description="음식 영양 정보는 '추정치' 또는 '영양표시' 출처가 함께 표시됩니다." />
      <div className="mb-4 flex items-center gap-2">
        <Link href={`?date=${shift(-1)}`} aria-label="이전 날" className={buttonVariants({ variant: "ghost", size: "icon-lg" })}><ChevronLeft className="size-5" /></Link>
        <h2 className="flex-1 text-center text-lg font-semibold">{formatDate(fromKey(date, tz), "M월 d일 (EEE)", tz)}{date === today && " · 오늘"}</h2>
        <Link href={`?date=${shift(1)}`} aria-label="다음 날" aria-disabled={date >= today} className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), date >= today && "pointer-events-none opacity-30")}><ChevronRight className="size-5" /></Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3">
              {bar("칼로리", total.kcal, goals.kcal, "kcal")}
              <div className="grid gap-3 sm:grid-cols-3">
                {bar("단백질", total.protein_g, goals.protein_g, "g")}
                {bar("탄수화물", total.carbs_g, goals.carbs_g, "g")}
                {bar("지방", total.fat_g, goals.fat_g, "g")}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasEstimate && "추정치가 포함된 합계입니다. "}{trainedToday ? "오늘은 운동한 날입니다." : ""}
                {protein && ` 단백질 참고 범위(${({ hypertrophy: "근비대", strength: "근력", fat_loss: "체지방 감량", endurance: "지구력", general_fitness: "건강" } as Record<string, string>)[profile.training_goal ?? "general_fitness"]}, 체중 ${weight!.weight}kg): 하루 ${protein.min}~${protein.max}g`}
              </p>
            </CardContent>
          </Card>

          <TemplateBar date={date} templates={templates.map((t) => ({ id: t.id, name: t.name, count: t.items.length }))} />
          {MEALS.map(([type, label]) => (
            <MealSection key={type} date={date} mealType={type} label={label} items={dayMeals.find((m) => m.meal_type === type)?.meal_items ?? []} foods={foods} />
          ))}
          <p className="text-xs text-muted-foreground">사진으로 음식 분석은 추후 지원 예정입니다(분석 결과는 저장 전 직접 확인·수정하도록 구현할 계획).</p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>수분</CardTitle></CardHeader>
            <CardContent><WaterTracker date={date} ml={wellness[0]?.water_ml ?? 0} goal={goals.water_ml} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>최근 7일</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <SimpleBarChart data={week} x="label" y="kcal" unit="kcal" height={160} label="일별 칼로리" />
              <p className="text-xs text-muted-foreground">
                {avg ? `기록한 ${loggedDays.length}일 평균 ${avg.kcal}kcal · 단백질 ${avg.protein_g}g` : "기록이 없습니다."} · 운동한 날 {week.filter((w) => w.trained).length}일
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>AI 식단 분석</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <NutritionAiButton disabled={!aiConfigured()} />
              <p className="text-xs text-muted-foreground">최근 7일 식단 합계·목표·운동 기록·체중 추세를 바탕으로 분석합니다. 의학적 식이 처방이 아닙니다.</p>
            </CardContent>
          </Card>
          {ins?.content && <InsightCard title="AI 식단 분석" insight={ins.content as Insight} period={(ins.content as { facts_period?: string }).facts_period} />}
          <Card>
            <CardHeader><CardTitle>영양 목표</CardTitle></CardHeader>
            <CardContent><NutritionGoalsForm goals={goals} proteinHint={protein ? `${protein.min}~${protein.max}` : null} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>내 음식</CardTitle></CardHeader>
            <CardContent><FoodManager foods={foods.filter((f) => f.owner_id)} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
