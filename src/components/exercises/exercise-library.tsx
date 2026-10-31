"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeCustomExercise, updateExerciseSettings } from "@/app/actions/exercises";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { filterExercises, MUSCLE_NAME, MUSCLE_OPTIONS } from "@/lib/exercise-filter";
import { DIFFICULTY_LABEL, EQUIPMENT_LABEL, EXERCISE_TYPE_LABEL, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NewExerciseDialog } from "./new-exercise-dialog";

type Settings = Record<string, { is_favorite: boolean; rest_seconds: number | null }>;
const selectCls = "h-11 rounded-lg border bg-background px-2 text-sm";

export function ExerciseLibrary({ exercises, userSettings }: { exercises: Exercise[]; userSettings: Settings }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [settings, setSettings] = useState(userSettings);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const favorites = useMemo(() => new Set(Object.entries(settings).filter(([, v]) => v.is_favorite).map(([k]) => k)), [settings]);
  const list = useMemo(
    () => filterExercises(exercises, { q, muscle, equipment, difficulty, type, favorites: favOnly ? favorites : null }),
    [exercises, q, muscle, equipment, difficulty, type, favOnly, favorites],
  );
  const open = exercises.find((e) => e.id === openId) ?? null;

  const toggleFav = (id: string) => {
    const next = !settings[id]?.is_favorite;
    setSettings((s) => ({ ...s, [id]: { rest_seconds: s[id]?.rest_seconds ?? null, is_favorite: next } }));
    start(async () => {
      const r = await updateExerciseSettings({ exercise_id: id, is_favorite: next });
      if (!r.ok) {
        toast.error(r.error);
        setSettings((s) => ({ ...s, [id]: { ...s[id], is_favorite: !next } }));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="운동 이름 검색 (한글/영문)" aria-label="운동 검색" className="h-11 pl-9" />
        </div>
        <Button className="h-11" onClick={() => setAdding(true)}><Plus /> 직접 추가</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select aria-label="부위" value={muscle} onChange={(e) => setMuscle(e.target.value)} className={selectCls}>
          <option value="">전체 부위</option>
          {MUSCLE_OPTIONS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select aria-label="기구" value={equipment} onChange={(e) => setEquipment(e.target.value)} className={selectCls}>
          <option value="">전체 기구</option>
          {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="난이도" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls}>
          <option value="">전체 난이도</option>
          {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="운동 유형" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
          <option value="">전체 유형</option>
          {Object.entries(EXERCISE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={cn(selectCls, "col-span-2 flex items-center justify-center gap-1.5 sm:col-span-1", favOnly && "border-primary text-primary")}>
          <Star className={cn("size-4", favOnly && "fill-current")} /> 즐겨찾기
        </button>
      </div>

      <p className="text-sm text-muted-foreground">{list.length}개</p>
      <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-2 pr-2">
            <button onClick={() => setOpenId(e.id)} className="min-h-14 min-w-0 flex-1 px-4 py-2 text-left hover:text-primary">
              <span className="block truncate font-medium">{e.name_ko}{e.owner_id && <span className="ml-2 text-xs text-primary">내 운동</span>}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {e.exercise_muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_NAME[m.muscle_id]).join("·")} · {EQUIPMENT_LABEL[e.equipment]} · {DIFFICULTY_LABEL[e.difficulty]}
              </span>
            </button>
            <Button variant="ghost" size="icon-lg" aria-label={favorites.has(e.id) ? "즐겨찾기 해제" : "즐겨찾기"} aria-pressed={favorites.has(e.id)} onClick={() => toggleFav(e.id)}>
              <Star className={cn("size-5", favorites.has(e.id) ? "fill-primary text-primary" : "text-muted-foreground")} />
            </Button>
          </li>
        ))}
        {list.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 운동이 없습니다.</li>}
      </ul>

      <Sheet open={open != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.name_ko}</SheetTitle>
                {open.name_en && <p className="text-sm text-muted-foreground">{open.name_en}</p>}
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6 text-sm">
                <dl className="grid grid-cols-2 gap-3">
                  <Info k="주요 근육" v={open.exercise_muscles.filter((m) => m.role === "primary").map((m) => MUSCLE_NAME[m.muscle_id]).join(", ")} />
                  <Info k="보조 근육" v={open.exercise_muscles.filter((m) => m.role === "secondary").map((m) => MUSCLE_NAME[m.muscle_id]).join(", ") || "-"} />
                  <Info k="기구" v={EQUIPMENT_LABEL[open.equipment]} />
                  <Info k="유형" v={EXERCISE_TYPE_LABEL[open.exercise_type]} />
                  <Info k="난이도" v={DIFFICULTY_LABEL[open.difficulty]} />
                </dl>
                {open.instructions && <Section title="자세 설명">{open.instructions}</Section>}
                {open.cautions && <Section title="주의사항">{open.cautions}</Section>}
                {open.media_url && (
                  <a href={open.media_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">참고 자료 열기</a>
                )}
                <RestSetting
                  key={open.id}
                  value={settings[open.id]?.rest_seconds ?? null}
                  onSave={(v) =>
                    start(async () => {
                      const r = await updateExerciseSettings({ exercise_id: open.id, rest_seconds: v });
                      if (r.ok) {
                        setSettings((s) => ({ ...s, [open.id]: { is_favorite: s[open.id]?.is_favorite ?? false, rest_seconds: v } }));
                        toast.success("휴식 시간을 저장했습니다.");
                      } else toast.error(r.error);
                    })
                  }
                  pending={pending}
                />
                <Section title="대체 운동 (같은 주요 근육)">
                  {alternatives(exercises, open).map((a) => (
                    <button key={a.id} onClick={() => setOpenId(a.id)} className="mr-2 mb-2 rounded-full border px-3 py-1 text-xs hover:border-primary">{a.name_ko}</button>
                  ))}
                </Section>
                {open.owner_id && (
                  <Button
                    variant="destructive"
                    className="h-11 w-full"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("이 운동을 삭제할까요? 기록에 사용된 운동은 목록에서만 숨겨지고 과거 기록은 보존됩니다.")) return;
                      start(async () => {
                        const r = await removeCustomExercise(open.id);
                        if (r.ok) { setOpenId(null); router.refresh(); } else toast.error(r.error);
                      });
                    }}
                  >
                    <Trash2 /> 내 운동 삭제
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <NewExerciseDialog open={adding} onOpenChange={setAdding} onCreated={() => router.refresh()} />
    </div>
  );
}

function alternatives(all: Exercise[], ex: Exercise) {
  const prim = new Set(ex.exercise_muscles.filter((m) => m.role === "primary").map((m) => m.muscle_id));
  return all.filter((e) => e.id !== ex.id && e.exercise_muscles.some((m) => m.role === "primary" && prim.has(m.muscle_id))).slice(0, 8);
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3><div className="leading-relaxed whitespace-pre-wrap">{children}</div></section>;
}

function RestSetting({ value, onSave, pending }: { value: number | null; onSave: (v: number | null) => void; pending: boolean }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const n = v.trim() === "" ? null : Number(v);
  const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 1800);
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">이 종목 휴식 시간(초) · 비우면 기본값</h3>
      <div className="flex gap-2">
        <Input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} className="h-11" aria-invalid={!valid} />
        <Button className="h-11" disabled={!valid || pending} onClick={() => onSave(n)}>저장</Button>
      </div>
    </section>
  );
}
