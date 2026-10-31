"use client";

import { useMemo, useState, useTransition } from "react";
import { Droplet, Loader2, Minus, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateNutritionInsight } from "@/app/actions/ai";
import { addMealItem, addWater, applyMealTemplate, createFood, deleteFood, deleteMealItem, deleteMealTemplate, saveMealTemplate, saveNutritionGoals, updateMealItemServings } from "@/app/actions/health";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Food, MealItem, NutritionGoals } from "@/lib/data";
import { scaleMacros, sumMacros } from "@/lib/health";
import { cn } from "@/lib/utils";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
const inp = "h-11 w-full rounded-lg border bg-background px-2 text-sm";
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const sourceLabel = (f: { source?: string; is_estimate: boolean }) => (f.source === "label" ? "영양표시" : f.is_estimate ? "추정치" : "직접 입력");

export function MealSection({ date, mealType, label, items, foods }: { date: string; mealType: MealType; label: string; items: MealItem[]; foods: Food[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const t = sumMacros(items);
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{label} <span className="num text-xs font-normal text-muted-foreground">{t.kcal}kcal · 단백질 {t.protein_g}g</span></h3>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus /> 추가</Button>
        </div>
        {items.length === 0 ? <p className="text-xs text-muted-foreground">기록 없음</p> : (
          <ul className="divide-y text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{i.name} <span className="text-xs text-muted-foreground">{i.serving_desc} × {i.servings}</span></p>
                  <p className="num text-xs text-muted-foreground">{i.kcal}kcal · 탄 {i.carbs_g} · 단 {i.protein_g} · 지 {i.fat_g}g{i.is_estimate && " · 추정치"}</p>
                </div>
                <div className="flex items-center">
                  <Button size="icon" variant="ghost" aria-label="섭취량 줄이기" disabled={pending || i.servings <= 0.5}
                    onClick={() => start(async () => { const r = await updateMealItemServings(i.id, Math.max(0.5, i.servings - 0.5)); if (!r.ok) toast.error(r.error); })}><Minus /></Button>
                  <Button size="icon" variant="ghost" aria-label="섭취량 늘리기" disabled={pending}
                    onClick={() => start(async () => { const r = await updateMealItemServings(i.id, i.servings + 0.5); if (!r.ok) toast.error(r.error); })}><Plus /></Button>
                  <Button size="icon" variant="ghost" aria-label={`${i.name} 삭제`} disabled={pending}
                    onClick={() => start(async () => { const r = await deleteMealItem(i.id); if (!r.ok) toast.error(r.error); })}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <AddFoodDialog open={open} onOpenChange={setOpen} date={date} mealType={mealType} label={label} foods={foods} />
      </CardContent>
    </Card>
  );
}

function AddFoodDialog({ open, onOpenChange, date, mealType, label, foods }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; mealType: MealType; label: string; foods: Food[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [servings, setServings] = useState("1");
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({ name: "", serving_desc: "1인분", kcal: "", protein_g: "", carbs_g: "", fat_g: "", source: "user" as "user" | "label", save: true });
  const [pending, start] = useTransition();
  const list = useMemo(() => {
    const t = q.trim().replace(/\s+/g, "");
    return (t ? foods.filter((f) => f.name.replace(/\s+/g, "").includes(t)) : foods).slice(0, 50);
  }, [q, foods]);
  const s = num(servings) ?? 0;
  const preview = picked ? scaleMacros(picked, s) : null;

  const reset = () => { setQ(""); setPicked(null); setServings("1"); setManual(false); setM((x) => ({ ...x, name: "", kcal: "", protein_g: "", carbs_g: "", fat_g: "" })); };
  const submit = () =>
    start(async () => {
      const r = await addMealItem({
        date, meal_type: mealType, servings: s,
        food_item_id: manual ? null : picked?.id ?? null,
        manual: manual ? { name: m.name, serving_desc: m.serving_desc, kcal: num(m.kcal) ?? 0, protein_g: num(m.protein_g) ?? 0, carbs_g: num(m.carbs_g) ?? 0, fat_g: num(m.fat_g) ?? 0, source: m.source, is_estimate: m.source !== "label" } : null,
        save_as_food: manual && m.save,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${label}에 추가했습니다.`);
      reset();
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{label} 음식 추가</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 text-sm">
          <button onClick={() => setManual(false)} aria-pressed={!manual} className={!manual ? "rounded-md bg-muted py-2 font-medium" : "py-2 text-muted-foreground"}>음식 검색</button>
          <button onClick={() => setManual(true)} aria-pressed={manual} className={manual ? "rounded-md bg-muted py-2 font-medium" : "py-2 text-muted-foreground"}>직접 입력</button>
        </div>
        {!manual ? (
          <>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="음식 이름 (예: 닭가슴살, 김치찌개)" aria-label="음식 검색" className={cn(inp, "pl-9")} />
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {list.map((f) => (
                <li key={f.id}>
                  <button onClick={() => setPicked(f)} aria-pressed={picked?.id === f.id} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted", picked?.id === f.id && "bg-primary/10")}>
                    <span className="min-w-0"><span className="block truncate">{f.name}{f.owner_id && <span className="ml-1 text-xs text-primary">내 음식</span>}</span><span className="text-xs text-muted-foreground">{f.serving_desc} · {sourceLabel(f)}</span></span>
                    <span className="num shrink-0 text-xs">{f.kcal}kcal · 단 {f.protein_g}g</span>
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">검색 결과가 없습니다. &apos;직접 입력&apos;으로 등록하세요.</li>}
            </ul>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 space-y-1 text-xs text-muted-foreground">음식 이름<input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} maxLength={80} className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">1회 제공량<input value={m.serving_desc} onChange={(e) => setM({ ...m, serving_desc: e.target.value })} maxLength={40} placeholder="예: 1공기, 100g" className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">칼로리(kcal)<input value={m.kcal} onChange={(e) => setM({ ...m, kcal: e.target.value })} inputMode="decimal" className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">단백질(g)<input value={m.protein_g} onChange={(e) => setM({ ...m, protein_g: e.target.value })} inputMode="decimal" className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">탄수화물(g)<input value={m.carbs_g} onChange={(e) => setM({ ...m, carbs_g: e.target.value })} inputMode="decimal" className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">지방(g)<input value={m.fat_g} onChange={(e) => setM({ ...m, fat_g: e.target.value })} inputMode="decimal" className={inp} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">출처
              <select value={m.source} onChange={(e) => setM({ ...m, source: e.target.value as "user" | "label" })} className={inp}>
                <option value="user">직접 추정</option><option value="label">제품 영양표시</option>
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={m.save} onChange={(e) => setM({ ...m, save: e.target.checked })} className="size-5" /> 내 음식으로 저장(다음에 검색 가능)</label>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="w-32 space-y-1 text-xs text-muted-foreground">섭취량(제공량 배수)<input value={servings} onChange={(e) => setServings(e.target.value)} inputMode="decimal" className={inp} /></label>
          <div className="flex gap-1 pb-0.5">{["0.5", "1", "1.5", "2"].map((v) => <Button key={v} type="button" size="sm" variant={servings === v ? "default" : "outline"} onClick={() => setServings(v)}>{v}</Button>)}</div>
        </div>
        {preview && <p className="num text-sm">{picked!.name} {picked!.serving_desc} × {s} = {preview.kcal}kcal · 단 {preview.protein_g} · 탄 {preview.carbs_g} · 지 {preview.fat_g}g <span className="text-xs text-muted-foreground">({sourceLabel(picked!)})</span></p>}
        <Button className="h-12" disabled={pending || s <= 0 || (!manual && !picked) || (manual && (!m.name.trim() || num(m.kcal) == null))} onClick={submit}>
          {pending && <Loader2 className="animate-spin" />} 기록하기
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateBar({ date, templates }: { date: string; templates: { id: string; name: string; count: number }[] }) {
  const [pending, start] = useTransition();
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => { const r = await fn(); if (r.ok) toast.success(msg); else toast.error(r.error); });
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1 text-xs text-muted-foreground">식사
          <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)} className="h-10 rounded-lg border bg-background px-2 text-sm">
            <option value="breakfast">아침</option><option value="lunch">점심</option><option value="dinner">저녁</option><option value="snack">간식</option>
          </select>
        </label>
        {templates.length > 0 && (
          <>
            <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">식단 템플릿
              <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-2 text-sm">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.count}개)</option>)}
              </select>
            </label>
            <Button variant="secondary" className="h-10" disabled={pending || !tpl} onClick={() => run(() => applyMealTemplate(tpl, date, meal), "템플릿을 적용했습니다.")}>불러오기</Button>
            <Button variant="ghost" size="icon" aria-label="템플릿 삭제" disabled={pending || !tpl} onClick={() => confirm("이 템플릿을 삭제할까요?") && run(() => deleteMealTemplate(tpl), "삭제했습니다.")}><Trash2 /></Button>
          </>
        )}
        <Button variant="outline" className="h-10" disabled={pending}
          onClick={() => { const name = prompt("템플릿 이름 (선택한 식사의 음식을 저장)"); if (name) run(() => saveMealTemplate(name, date, meal), "템플릿을 저장했습니다."); }}>
          이 식사를 템플릿으로 저장
        </Button>
      </CardContent>
    </Card>
  );
}

export function WaterTracker({ date, ml, goal }: { date: string; ml: number; goal: number | null }) {
  const [pending, start] = useTransition();
  const add = (n: number) => start(async () => { const r = await addWater(date, n); if (!r.ok) toast.error(r.error); });
  return (
    <div className="space-y-3">
      <p className="num text-2xl font-semibold"><Droplet className="mr-1 inline size-5 text-sky-500" />{ml.toLocaleString("ko-KR")}ml{goal ? <span className="text-sm font-normal text-muted-foreground"> / {goal.toLocaleString("ko-KR")}ml</span> : ""}</p>
      {goal ? <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-sky-500" style={{ width: `${Math.min(100, (ml / goal) * 100)}%` }} /></div> : null}
      <div className="flex flex-wrap gap-2">
        {[250, 500].map((n) => <Button key={n} variant="secondary" className="h-11" disabled={pending} onClick={() => add(n)}>+{n}ml</Button>)}
        <Button variant="ghost" className="h-11" disabled={pending || ml === 0} onClick={() => add(-250)}>-250ml</Button>
      </div>
    </div>
  );
}

export function NutritionGoalsForm({ goals, proteinHint }: { goals: NutritionGoals; proteinHint: string | null }) {
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const g = (k: string) => { const v = num(String(fd.get(k) ?? "")); return v == null ? null : Math.round(v); };
      const r = await saveNutritionGoals({ kcal: g("kcal"), protein_g: g("protein_g"), carbs_g: g("carbs_g"), fat_g: g("fat_g"), water_ml: g("water_ml") });
      if (r.ok) toast.success("영양 목표를 저장했습니다."); else toast.error(r.error);
    });
  const f = (k: keyof NutritionGoals, label: string, ph?: string) => (
    <label className="space-y-1 text-xs text-muted-foreground">{label}<input name={k} inputMode="numeric" defaultValue={goals[k] ?? ""} placeholder={ph} className={inp} /></label>
  );
  return (
    <form action={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {f("kcal", "칼로리(kcal)")}{f("protein_g", "단백질(g)", proteinHint ?? undefined)}{f("carbs_g", "탄수화물(g)")}{f("fat_g", "지방(g)")}{f("water_ml", "수분(ml)", "2000")}
      </div>
      <Button type="submit" className="h-11" disabled={pending}>저장</Button>
      {proteinHint && <p className="text-xs text-muted-foreground">단백질 칸의 회색 값은 운동 목표와 최근 체중 기준 참고 범위입니다.</p>}
    </form>
  );
}

export function FoodManager({ foods }: { foods: Food[] }) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "", serving_desc: "1인분", kcal: "", protein_g: "", carbs_g: "", fat_g: "", source: "user" as "user" | "label" });
  const create = () =>
    start(async () => {
      const r = await createFood({ name: f.name, serving_desc: f.serving_desc, kcal: num(f.kcal) ?? 0, protein_g: num(f.protein_g) ?? 0, carbs_g: num(f.carbs_g) ?? 0, fat_g: num(f.fat_g) ?? 0, source: f.source, is_estimate: f.source !== "label" });
      if (r.ok) { toast.success("음식을 등록했습니다."); setF({ ...f, name: "", kcal: "", protein_g: "", carbs_g: "", fat_g: "" }); } else toast.error(r.error);
    });
  return (
    <div className="space-y-3">
      {foods.length === 0 ? <p className="text-sm text-muted-foreground">등록한 음식이 없습니다. 자주 먹는 한국 음식이나 제품을 등록해 두세요.</p> : (
        <ul className="divide-y text-sm">
          {foods.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">{x.name} <span className="text-xs text-muted-foreground">{x.serving_desc} · {x.kcal}kcal · {sourceLabel(x)}</span></span>
              <Button size="icon" variant="ghost" aria-label={`${x.name} 삭제`} disabled={pending} onClick={() => confirm(`${x.name}을(를) 삭제할까요? 이미 기록한 식사는 유지됩니다.`) && start(async () => { const r = await deleteFood(x.id); if (!r.ok) toast.error(r.error); })}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-primary">음식 직접 등록</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="이름(예: 엄마표 제육)" aria-label="음식 이름" className={cn(inp, "col-span-2")} />
          <input value={f.serving_desc} onChange={(e) => setF({ ...f, serving_desc: e.target.value })} placeholder="1회 제공량" aria-label="1회 제공량" className={inp} />
          <input value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} inputMode="decimal" placeholder="kcal" aria-label="칼로리" className={inp} />
          <input value={f.protein_g} onChange={(e) => setF({ ...f, protein_g: e.target.value })} inputMode="decimal" placeholder="단백질 g" aria-label="단백질" className={inp} />
          <input value={f.carbs_g} onChange={(e) => setF({ ...f, carbs_g: e.target.value })} inputMode="decimal" placeholder="탄수화물 g" aria-label="탄수화물" className={inp} />
          <input value={f.fat_g} onChange={(e) => setF({ ...f, fat_g: e.target.value })} inputMode="decimal" placeholder="지방 g" aria-label="지방" className={inp} />
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as "user" | "label" })} aria-label="출처" className={inp}><option value="user">직접 추정</option><option value="label">제품 영양표시</option></select>
          <Button className="col-span-2 h-11" disabled={pending || !f.name.trim() || num(f.kcal) == null} onClick={create}>등록</Button>
        </div>
      </details>
    </div>
  );
}

export function NutritionAiButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" className="h-10" disabled={disabled || pending}
      onClick={() => start(async () => { const r = await generateNutritionInsight(); if (r.ok) toast.success("식단 분석을 만들었습니다."); else toast.error(r.error); })}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {disabled ? "Gemini 키 설정 필요" : "최근 7일 식단 분석"}
    </Button>
  );
}
