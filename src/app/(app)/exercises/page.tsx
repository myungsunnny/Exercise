import { PageHeader } from "@/components/common/empty-state";
import { ExerciseLibrary } from "@/components/exercises/exercise-library";
import { getExercises, getUserExerciseSettings } from "@/lib/data";

export const metadata = { title: "운동 라이브러리" };

export default async function ExercisesPage() {
  const [exercises, settings] = await Promise.all([getExercises(), getUserExerciseSettings()]);
  const userSettings = Object.fromEntries([...settings].map(([k, v]) => [k, { is_favorite: v.is_favorite as boolean, rest_seconds: v.rest_seconds as number | null }]));
  return (
    <>
      <PageHeader title="운동 라이브러리" description={`${exercises.length}개 종목 · 자세 설명은 참고용이며 통증이 있으면 운동을 중단하세요.`} />
      <ExerciseLibrary exercises={exercises} userSettings={userSettings} />
    </>
  );
}
