import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/empty-state";
import { RoutineEditor } from "@/components/routines/routine-editor";
import { getExercises, getPreferences, getRoutine } from "@/lib/data";

export const metadata = { title: "루틴 수정" };

export default async function EditRoutinePage({ params }: PageProps<"/routines/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [routine, exercises, prefs] = await Promise.all([getRoutine(id), getExercises(), getPreferences()]);
  if (!routine) notFound();
  return (
    <>
      <PageHeader title="루틴 수정" />
      <RoutineEditor routine={routine} exercises={exercises} defaultRest={prefs.default_rest_seconds} />
    </>
  );
}
