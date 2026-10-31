"use client";

import { memo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Link2, MoreVertical, Plus, Repeat, StickyNote, Timer, Trash2, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PrevByExercise, PrevSet } from "@/lib/data";
import { formatClock } from "@/lib/format";
import { SET_TYPE_LABEL, SET_TYPE_SHORT, type ExerciseType, type SetType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDurationInput, type Action, type DraftExercise, type DraftSet } from "@/lib/workout/model";

const SET_TYPES: SetType[] = ["normal", "warmup", "drop", "failure"];

type Field = "weight" | "reps" | "duration" | "distance";
const FIELDS: Record<ExerciseType, { key: Field; label: string; mode: "decimal" | "numeric" | "text" }[]> = {
  weight_reps: [{ key: "weight", label: "kg", mode: "decimal" }, { key: "reps", label: "회", mode: "numeric" }],
  weighted_bodyweight: [{ key: "weight", label: "+kg", mode: "decimal" }, { key: "reps", label: "회", mode: "numeric" }],
  assisted_bodyweight: [{ key: "weight", label: "보조kg", mode: "decimal" }, { key: "reps", label: "회", mode: "numeric" }],
  bodyweight_reps: [{ key: "reps", label: "회", mode: "numeric" }],
  duration: [{ key: "duration", label: "분:초", mode: "text" }],
  distance_duration: [{ key: "distance", label: "km", mode: "decimal" }, { key: "duration", label: "분:초", mode: "text" }],
};

function prevText(type: ExerciseType, p: PrevSet | undefined) {
  if (!p) return "—";
  const n = (v: number | null) => (v == null ? "-" : String(v));
  switch (type) {
    case "bodyweight_reps": return `${n(p.reps)}회`;
    case "duration": return p.duration_seconds == null ? "—" : formatClock(p.duration_seconds);
    case "distance_duration": return `${n(p.distance_km)}km`;
    default: return `${n(p.weight_kg)}×${n(p.reps)}`;
  }
}

function prevValue(field: Field, p: PrevSet | undefined): string {
  if (!p) return "";
  const v = field === "weight" ? p.weight_kg : field === "reps" ? p.reps : field === "distance" ? p.distance_km : null;
  if (field === "duration") return formatDurationInput(p.duration_seconds);
  return v == null ? "" : String(v);
}

type Props = {
  exercise: DraftExercise;
  index: number;
  count: number;
  nextInSuperset: boolean;
  previous: PrevByExercise[string] | undefined;
  restSeconds: number;
  dispatch: (a: Action | { type: "undo" }) => void;
  onToggleDone: (exId: string, setId: string, fill: Partial<Record<Field, string>> | undefined, wasDone: boolean) => void;
  onReplace: () => void;
};

export const ExerciseCard = memo(function ExerciseCard({ exercise: e, index, count, nextInSuperset, previous, restSeconds, dispatch, onToggleDone, onReplace }: Props) {
  const [showDetail, setShowDetail] = useState(() => e.sets.some((s) => s.rpe || s.rir));
  const [showNotes, setShowNotes] = useState(() => !!e.notes);
  const fields = FIELDS[e.exercise_type];
  const repTarget = e.rep_min != null ? (e.rep_max != null && e.rep_max !== e.rep_min ? `${e.rep_min}~${e.rep_max}회` : `${e.rep_min}회`) : null;
  let workingNo = 0;

  return (
    <section
      aria-label={e.exercise_name}
      className={cn("rounded-xl bg-card ring-1 ring-foreground/10", e.superset_group != null && "border-l-4 border-l-primary")}
    >
      <header className="flex items-start gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-primary">{e.exercise_name}</h2>
          <p className="text-xs text-muted-foreground">
            {e.superset_group != null && <span className="mr-1 font-medium text-foreground">슈퍼세트 {e.superset_group} ·</span>}
            {repTarget && <>목표 {repTarget} · </>}휴식 {formatClock(restSeconds)}
            {previous && <> · 지난 기록 {new Date(previous.started_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</>}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label={`${e.exercise_name} 메뉴`} />}>
            <MoreVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={onReplace}><Repeat /> 종목 교체</DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onClick={() => dispatch({ type: "moveExercise", exId: e.id, dir: -1 })}><ArrowUp /> 위로 이동</DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onClick={() => dispatch({ type: "moveExercise", exId: e.id, dir: 1 })}><ArrowDown /> 아래로 이동</DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1 && !nextInSuperset} onClick={() => dispatch({ type: "toggleSuperset", exId: e.id })}>
              <Link2 /> {nextInSuperset ? "다음 종목과 슈퍼세트 해제" : "다음 종목과 슈퍼세트"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowDetail((v) => !v)}><Gauge /> RPE/RIR {showDetail ? "숨기기" : "입력"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowNotes((v) => !v)}><StickyNote /> 메모</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const v = prompt("이 종목의 휴식 시간(초)", String(restSeconds));
                if (v == null) return;
                const n = Number(v);
                if (Number.isInteger(n) && n >= 0 && n <= 1800) dispatch({ type: "updateExercise", exId: e.id, patch: { rest_seconds: n } });
              }}
            >
              <Timer /> 휴식 시간 변경
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => dispatch({ type: "removeExercise", exId: e.id })}><Trash2 /> 종목 삭제</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {showNotes && (
        <div className="px-3 pb-2">
          <textarea
            aria-label={`${e.exercise_name} 메모`}
            value={e.notes}
            maxLength={1000}
            rows={2}
            placeholder="종목 메모"
            onChange={(ev) => dispatch({ type: "updateExercise", exId: e.id, patch: { notes: ev.target.value } })}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      )}

      <div role="table" aria-label="세트" className="px-2 pb-2">
        <div role="row" className="grid items-center gap-1.5 px-1 pb-1 text-[11px] text-muted-foreground" style={{ gridTemplateColumns: gridCols(fields.length) }}>
          <span role="columnheader" className="text-center">세트</span>
          <span role="columnheader">이전</span>
          {fields.map((f) => <span role="columnheader" key={f.key} className="text-center">{f.label}</span>)}
          <span role="columnheader" className="sr-only">완료</span>
          <span role="columnheader" className="sr-only">메뉴</span>
        </div>

        {e.sets.map((s, i) => {
          const label = s.set_type === "warmup" ? "W" : `${++workingNo}${SET_TYPE_SHORT[s.set_type]}`;
          const p = previous?.sets[i];
          return (
            <SetRow
              key={s.id}
              exId={e.id}
              set={s}
              label={label}
              fields={fields}
              prev={p}
              prevText={prevText(e.exercise_type, p)}
              repFallback={e.rep_max != null ? String(e.rep_max) : ""}
              showDetail={showDetail}
              isFirst={i === 0}
              isLast={i === e.sets.length - 1}
              dispatch={dispatch}
              onToggleDone={onToggleDone}
            />
          );
        })}

        <Button variant="ghost" className="mt-1 h-11 w-full text-muted-foreground" onClick={() => dispatch({ type: "addSet", exId: e.id })}>
          <Plus /> 세트 추가
        </Button>
      </div>
    </section>
  );
});

const gridCols = (n: number) => `2.5rem 3.75rem repeat(${n}, minmax(0, 1fr)) 2.75rem 2rem`;

type RowProps = {
  exId: string;
  set: DraftSet;
  label: string;
  fields: (typeof FIELDS)[ExerciseType];
  prev: PrevSet | undefined;
  prevText: string;
  repFallback: string;
  showDetail: boolean;
  isFirst: boolean;
  isLast: boolean;
  dispatch: Props["dispatch"];
  onToggleDone: Props["onToggleDone"];
};

const SetRow = memo(function SetRow({ exId, set: s, label, fields, prev, prevText, repFallback, showDetail, isFirst, isLast, dispatch, onToggleDone }: RowProps) {
  const placeholder = (f: Field) => prevValue(f, prev) || (f === "reps" ? repFallback : "");
  const update = (patch: Partial<DraftSet>) => dispatch({ type: "updateSet", exId, setId: s.id, patch });
  const toggle = () => {
    const fill: Partial<Record<Field, string>> = {};
    if (!s.done) for (const { key } of fields) if (!s[key].trim() && placeholder(key)) fill[key] = placeholder(key);
    onToggleDone(exId, s.id, Object.keys(fill).length ? fill : undefined, s.done);
  };
  const cycleType = () => update({ set_type: SET_TYPES[(SET_TYPES.indexOf(s.set_type) + 1) % SET_TYPES.length] });

  return (
    <div role="row" className={cn("rounded-lg px-1 py-1 transition-colors", s.done && "bg-primary/12")}>
      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: gridCols(fields.length) }}>
        <button
          role="cell"
          onClick={cycleType}
          aria-label={`세트 ${label}, 유형 ${SET_TYPE_LABEL[s.set_type]}. 눌러서 유형 변경`}
          className={cn(
            "num h-10 rounded-md text-sm font-semibold",
            s.set_type === "warmup" && "text-amber-500",
            s.set_type === "drop" && "text-sky-500",
            s.set_type === "failure" && "text-destructive",
          )}
        >
          {label}
        </button>
        <span role="cell" className="num truncate text-xs text-muted-foreground">{prevText}</span>
        {fields.map((f) => (
          <input
            key={f.key}
            role="cell"
            aria-label={f.label}
            inputMode={f.mode}
            enterKeyHint="next"
            autoComplete="off"
            value={s[f.key]}
            placeholder={placeholder(f.key)}
            onFocus={(ev) => ev.currentTarget.select()}
            onChange={(ev) => update({ [f.key]: ev.target.value })}
            className="num h-11 w-full min-w-0 rounded-md bg-muted px-1 text-center text-base font-medium outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
          />
        ))}
        <button
          onClick={toggle}
          aria-pressed={s.done}
          aria-label={s.done ? `세트 ${label} 완료 취소` : `세트 ${label} 완료`}
          className={cn(
            "flex h-11 items-center justify-center rounded-md transition-colors",
            s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Check className="size-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button role="cell" aria-label={`세트 ${label} 메뉴`} className="flex h-11 items-center justify-center text-muted-foreground" />}>
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SET_TYPES.map((t) => (
              <DropdownMenuItem key={t} onClick={() => update({ set_type: t })}>
                {s.set_type === t ? <Check /> : <span className="size-4" />} {SET_TYPE_LABEL[t]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dispatch({ type: "copySet", exId, setId: s.id })}><Copy /> 세트 복사</DropdownMenuItem>
            <DropdownMenuItem disabled={isFirst} onClick={() => dispatch({ type: "moveSet", exId, setId: s.id, dir: -1 })}><ArrowUp /> 위로</DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onClick={() => dispatch({ type: "moveSet", exId, setId: s.id, dir: 1 })}><ArrowDown /> 아래로</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => dispatch({ type: "removeSet", exId, setId: s.id })}><Trash2 /> 세트 삭제</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showDetail && (
        <div className="mt-1 grid grid-cols-[2.5rem_1fr_1fr_2fr] items-center gap-1.5 text-xs">
          <span />
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">RPE</span>
            <input inputMode="decimal" aria-label={`세트 ${label} RPE`} value={s.rpe} placeholder="1-10" onChange={(ev) => update({ rpe: ev.target.value })}
              className="num h-9 w-full min-w-0 rounded-md bg-muted text-center text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">RIR</span>
            <input inputMode="numeric" aria-label={`세트 ${label} RIR`} value={s.rir} placeholder="0-10" onChange={(ev) => update({ rir: ev.target.value })}
              className="num h-9 w-full min-w-0 rounded-md bg-muted text-center text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <input aria-label={`세트 ${label} 메모`} value={s.notes} placeholder="세트 메모" maxLength={500} onChange={(ev) => update({ notes: ev.target.value })}
            className="h-9 w-full min-w-0 rounded-md bg-muted px-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      )}
    </div>
  );
});
