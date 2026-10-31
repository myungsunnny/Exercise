import Link from "next/link";

// 단순화한 인체 근육도(앞·뒤). 값(0~1+)에 따라 색 농도를 바꾼다.
type Shape = { m: string; d: string };
const FRONT: Shape[] = [
  { m: "shoulders", d: "M52 64 q-14 2 -16 20 l14 4 q4 -14 12 -18z M108 64 q14 2 16 20 l-14 4 q-4 -14 -12 -18z" },
  { m: "chest", d: "M62 66 h17 v26 q-12 4 -21 -4 q-2 -14 4 -22z M98 66 h-17 v26 q12 4 21 -4 q2 -14 -4 -22z" },
  { m: "biceps", d: "M36 90 l13 4 l-3 30 l-12 -2z M124 90 l-13 4 l3 30 l12 -2z" },
  { m: "forearms", d: "M33 126 l12 2 l-4 36 l-11 -2z M127 126 l-12 2 l4 36 l11 -2z" },
  { m: "abs", d: "M66 96 h28 v52 q-14 8 -28 0z" },
  { m: "quads", d: "M58 160 h21 l-2 64 h-16 q-6 -30 -3 -64z M102 160 h-21 l2 64 h16 q6 -30 3 -64z" },
  { m: "calves", d: "M61 234 h14 l-1 50 h-11z M99 234 h-14 l1 50 h11z" },
];
const BACK: Shape[] = [
  { m: "shoulders", d: "M52 64 q-14 2 -16 20 l14 4 q4 -14 12 -18z M108 64 q14 2 16 20 l-14 4 q-4 -14 -12 -18z" },
  { m: "back", d: "M62 62 h36 l6 30 l-10 40 h-28 l-10 -40z" },
  { m: "triceps", d: "M36 90 l13 4 l-3 30 l-12 -2z M124 90 l-13 4 l3 30 l12 -2z" },
  { m: "forearms", d: "M33 126 l12 2 l-4 36 l-11 -2z M127 126 l-12 2 l4 36 l11 -2z" },
  { m: "glutes", d: "M60 136 h40 q4 18 -4 26 h-32 q-8 -8 -4 -26z" },
  { m: "hamstrings", d: "M60 166 h18 l-1 58 h-15 q-5 -28 -2 -58z M100 166 h-18 l1 58 h15 q5 -28 2 -58z" },
  { m: "calves", d: "M60 232 h16 l-2 50 h-12z M100 232 h-16 l2 50 h12z" },
];
const SILHOUETTE = "M80 8 a14 16 0 1 1 0.1 0z M66 40 h28 l4 16 q24 4 28 28 l10 80 l-12 2 l-10 -60 l-6 0 l2 80 l-6 130 h-16 l-2 -110 h-4 l-2 110 h-16 l-6 -130 l2 -80 l-6 0 l-10 60 l-12 -2 l10 -80 q4 -24 28 -28z";

function Figure({ shapes, values, title, selected }: { shapes: Shape[]; values: Record<string, number>; title: string; selected?: string }) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 160 300" className="h-72 w-auto" role="img" aria-label={`${title} 근육도`}>
        <path d={SILHOUETTE} fill="var(--muted)" />
        {shapes.map((s) => {
          const v = Math.min(1, values[s.m] ?? 0);
          return (
            <Link key={s.m + s.d.slice(0, 8)} href={`?m=${s.m}`} scroll={false}>
              <path d={s.d} fill="var(--primary)" fillOpacity={0.12 + v * 0.83} stroke={selected === s.m ? "var(--foreground)" : "var(--background)"} strokeWidth={selected === s.m ? 1.5 : 0.8}>
                <title>{s.m}</title>
              </path>
            </Link>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
    </figure>
  );
}

export function BodyMap({ values, selected }: { values: Record<string, number>; selected?: string }) {
  return (
    <div className="flex justify-center gap-6">
      <Figure shapes={FRONT} values={values} title="앞" selected={selected} />
      <Figure shapes={BACK} values={values} title="뒤" selected={selected} />
    </div>
  );
}
