import { PageHeader } from "@/components/common/empty-state";
import { RoutineEditor } from "@/components/routines/routine-editor";
import { getExercises, getPreferences } from "@/lib/data";

export const metadata = { title: "새 루틴" };

export default async function NewRoutinePage() {
  const [exercises, prefs] = await Promise.all([getExercises(), getPreferences()]);
  return (
    <>
      <PageHeader title="새 루틴" />
      <RoutineEditor routine={null} exercises={exercises} defaultRest={prefs.default_rest_seconds} />
    </>
  );
}
