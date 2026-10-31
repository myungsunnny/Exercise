import { notFound, redirect } from "next/navigation";
import { WorkoutEditor } from "@/components/workout/workout-editor";
import { getExercises, getPreferences, getPreviousSets, getSession, getUserExerciseSettings } from "@/lib/data";

export const metadata = { title: "운동 기록 수정" };

export default async function EditSessionPage({ params }: PageProps<"/history/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await getSession(id);
  if (!res) notFound();
  if (res.draft.status === "in_progress") redirect("/workout");
  const [exercises, prefs, settings, previous] = await Promise.all([
    getExercises(),
    getPreferences(),
    getUserExerciseSettings(),
    getPreviousSets([...new Set(res.draft.exercises.map((e) => e.exercise_id))], id),
  ]);
  const restDefaults = Object.fromEntries([...settings].filter(([, v]) => v.rest_seconds != null).map(([k, v]) => [k, v.rest_seconds as number]));
  return (
    <WorkoutEditor
      key={id}
      initial={res.draft}
      revision={res.revision}
      exercises={exercises}
      previous={previous}
      restDefaults={restDefaults}
      defaultRest={prefs.default_rest_seconds}
      mode="edit"
    />
  );
}
