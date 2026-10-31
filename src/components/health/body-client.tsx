"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { deleteBodyPhoto, deleteMeasurement, saveMeasurement, uploadBodyPhoto } from "@/app/actions/health";
import { Button } from "@/components/ui/button";
import type { BodyRow } from "@/lib/data";

const FIELDS = [
  ["weight_kg", "체중(kg)"], ["body_fat_pct", "체지방률(%)"], ["skeletal_muscle_kg", "골격근량(kg)"], ["muscle_kg", "근육량(kg)"],
  ["waist_cm", "허리(cm)"], ["chest_cm", "가슴(cm)"], ["arm_cm", "팔(cm)"], ["thigh_cm", "허벅지(cm)"],
] as const;
const inp = "num h-11 w-full rounded-lg border bg-background px-2 text-sm";

export function MeasurementForm({ today, rows, customKeys }: { today: string; rows: BodyRow[]; customKeys: string[] }) {
  const [date, setDate] = useState(today);
  const existing = rows.find((r) => r.measured_on === date);
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">측정 날짜
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inp} />
      </label>
      {existing && <p className="text-xs text-muted-foreground">이 날짜의 기록이 있어 수정합니다.</p>}
      {/* 날짜가 바뀌면 입력 칸을 그 날짜 값으로 초기화 */}
      <MeasurementFields key={date} date={date} existing={existing} customKeys={customKeys} />
    </div>
  );
}

function MeasurementFields({ date, existing, customKeys }: { date: string; existing: BodyRow | undefined; customKeys: string[] }) {
  const [custom, setCustom] = useState(() => customKeys.map((k) => ({ k, v: existing?.custom?.[k] == null ? "" : String(existing.custom[k]) })));
  const [pending, start] = useTransition();
  const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")));
  const setAt = (i: number, patch: Partial<{ k: string; v: string }>) => setCustom((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = (fd: FormData) =>
    start(async () => {
      const customObj: Record<string, number> = {};
      for (const c of custom) if (c.k.trim() && c.v.trim() !== "") customObj[c.k.trim()] = Number(c.v.replace(",", "."));
      const r = await saveMeasurement({
        measured_on: date, ...Object.fromEntries(FIELDS.map(([k]) => [k, num(fd.get(k))])), custom: customObj, notes: String(fd.get("notes") ?? "") || null,
      });
      if (r.ok) toast.success("측정값을 저장했습니다."); else toast.error(r.error);
    });

  return (
    <form action={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="space-y-1 text-xs text-muted-foreground">{label}
            <input name={k} inputMode="decimal" defaultValue={existing?.[k] ?? ""} className={inp} />
          </label>
        ))}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground">사용자 정의 항목</legend>
        {custom.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input value={c.k} onChange={(e) => setAt(i, { k: e.target.value })} placeholder="항목명(예: 엉덩이 cm)" maxLength={30} aria-label="항목명" className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
            <input value={c.v} onChange={(e) => setAt(i, { v: e.target.value })} inputMode="decimal" placeholder="값" aria-label="값" className="num h-10 w-24 rounded-lg border bg-background px-2 text-sm" />
            <Button type="button" variant="ghost" size="icon" aria-label="항목 삭제" onClick={() => setCustom((l) => l.filter((_, j) => j !== i))}><X /></Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setCustom((l) => [...l, { k: "", v: "" }])}><Plus /> 항목 추가</Button>
      </fieldset>
      <label className="block space-y-1 text-xs text-muted-foreground">메모
        <input name="notes" defaultValue={existing?.notes ?? ""} maxLength={500} placeholder="예: 아침 공복, 인바디" className="h-11 w-full rounded-lg border bg-background px-2 text-sm" />
      </label>
      <Button type="submit" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />} 저장</Button>
    </form>
  );
}

export function BodyHistory({ rows, customKeys }: { rows: BodyRow[]; customKeys: string[] }) {
  const [pending, start] = useTransition();
  const cols = FIELDS.filter(([k]) => rows.some((r) => r[k] != null));
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[32rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr><th className="text-left font-normal">날짜</th>{cols.map(([k, l]) => <th key={k} className="text-right font-normal">{l}</th>)}{customKeys.map((k) => <th key={k} className="text-right font-normal">{k}</th>)}<th className="text-left font-normal">메모</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1.5">{r.measured_on}</td>
              {cols.map(([k]) => <td key={k} className="text-right">{r[k] ?? "-"}</td>)}
              {customKeys.map((k) => <td key={k} className="text-right">{r.custom?.[k] ?? "-"}</td>)}
              <td className="max-w-40 truncate text-xs text-muted-foreground">{r.notes}</td>
              <td className="text-right">
                <Button variant="ghost" size="icon" aria-label={`${r.measured_on} 기록 삭제`} disabled={pending}
                  onClick={() => confirm(`${r.measured_on} 측정 기록을 삭제할까요?`) && start(async () => { const x = await deleteMeasurement(r.id); if (!x.ok) toast.error(x.error); })}>
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 업로드 전 브라우저에서 긴 변 1600px JPEG로 축소(용량·전송 시간 절감, EXIF 위치정보 제거)
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("이미지를 처리하지 못했습니다.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

type Photo = { id: string; taken_on: string; pose: string; notes: string | null; url: string | null };
const POSE: Record<string, string> = { front: "정면", side: "측면", back: "후면", other: "기타" };

export function PhotoSection({ photos, today }: { photos: Photo[]; today: string }) {
  const [pending, start] = useTransition();
  const [pose, setPose] = useState("front");
  const dates = useMemo(() => [...new Set(photos.map((p) => p.taken_on))], [photos]);
  const [a, setA] = useState(dates[dates.length - 1] ?? "");
  const [b, setB] = useState(dates[0] ?? "");
  const pick = (d: string) => photos.find((p) => p.taken_on === d && p.pose === pose) ?? photos.find((p) => p.taken_on === d);

  const upload = (fd: FormData) =>
    start(async () => {
      const f = fd.get("file");
      if (!(f instanceof File) || !f.size) return void toast.error("사진을 선택하세요.");
      try {
        fd.set("file", await shrink(f));
      } catch {
        return void toast.error("이미지를 읽지 못했습니다. JPG 또는 PNG로 시도해 주세요.");
      }
      const r = await uploadBodyPhoto(fd);
      if (r.ok) toast.success("사진을 저장했습니다."); else toast.error(r.error);
    });

  return (
    <div className="space-y-5">
      <form action={upload} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="space-y-1 text-xs text-muted-foreground">사진
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">날짜<input name="taken_on" type="date" defaultValue={today} max={today} className="h-10 w-full rounded-lg border bg-background px-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-muted-foreground">자세
          <select name="pose" className="h-10 w-full rounded-lg border bg-background px-2 text-sm">{Object.entries(POSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <input type="hidden" name="notes" value="" />
        <Button type="submit" className="h-10" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Upload />} 올리기</Button>
      </form>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">저장된 사진이 없습니다. 같은 장소·조명·자세로 찍으면 비교하기 좋습니다.</p>
      ) : (
        <>
          {dates.length > 1 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">비교</span>
                <select value={a} onChange={(e) => setA(e.target.value)} aria-label="이전 날짜" className="h-10 rounded-lg border bg-background px-2">{dates.map((d) => <option key={d}>{d}</option>)}</select>
                <span>↔</span>
                <select value={b} onChange={(e) => setB(e.target.value)} aria-label="이후 날짜" className="h-10 rounded-lg border bg-background px-2">{dates.map((d) => <option key={d}>{d}</option>)}</select>
                <select value={pose} onChange={(e) => setPose(e.target.value)} aria-label="자세" className="h-10 rounded-lg border bg-background px-2">{Object.entries(POSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[a, b].map((d, i) => {
                  const p = pick(d);
                  return (
                    <figure key={i} className="overflow-hidden rounded-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL이라 이미지 최적화 캐시를 쓰지 않음 */}
                      {p?.url ? <img src={p.url} alt={`${d} ${POSE[p.pose]} 사진`} className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">사진 없음</div>}
                      <figcaption className="p-1 text-center text-xs">{d}</figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          )}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p) => (
              <li key={p.id} className="group relative overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.url ? <img src={p.url} alt={`${p.taken_on} ${POSE[p.pose]}`} loading="lazy" className="aspect-[3/4] w-full object-cover" /> : <div className="aspect-[3/4]" />}
                <div className="flex items-center justify-between p-1 text-[11px]">
                  <span>{p.taken_on.slice(5).replace("-", "/")} · {POSE[p.pose]}</span>
                  <button aria-label="사진 삭제" disabled={pending} onClick={() => confirm("이 사진을 삭제할까요?") && start(async () => { const r = await deleteBodyPhoto(p.id); if (!r.ok) toast.error(r.error); })}><Trash2 className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
