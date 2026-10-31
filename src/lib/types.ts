export type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight"
  | "duration"
  | "distance_duration";

export type Equipment =
  | "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell"
  | "band" | "smith" | "ez_bar" | "cardio" | "other";

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type SetType = "warmup" | "normal" | "drop" | "failure";
export type MuscleRole = "primary" | "secondary";

export type Muscle = { id: string; name_ko: string; sort_order: number };

export type Exercise = {
  id: string;
  owner_id: string | null;
  name_ko: string;
  name_en: string | null;
  exercise_type: ExerciseType;
  equipment: Equipment;
  difficulty: Difficulty;
  instructions: string | null;
  cautions: string | null;
  media_url: string | null;
  archived_at: string | null;
  exercise_muscles: { muscle_id: string; role: MuscleRole }[];
};

export type Preferences = {
  timezone: string;
  weight_unit: "kg" | "lb";
  default_rest_seconds: number;
  weight_increment_kg: number;
  weekly_workout_target: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  timezone: "Asia/Seoul",
  weight_unit: "kg",
  default_rest_seconds: 90,
  weight_increment_kg: 2.5,
  weekly_workout_target: 3,
};

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  weight_reps: "중량 × 횟수",
  bodyweight_reps: "맨몸 횟수",
  weighted_bodyweight: "맨몸 + 추가중량",
  assisted_bodyweight: "보조 중량",
  duration: "시간",
  distance_duration: "거리 + 시간",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "바벨",
  dumbbell: "덤벨",
  machine: "머신",
  cable: "케이블",
  bodyweight: "맨몸",
  kettlebell: "케틀벨",
  band: "밴드",
  smith: "스미스머신",
  ez_bar: "이지바",
  cardio: "유산소 기구",
  other: "기타",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: "워밍업",
  normal: "본세트",
  drop: "드롭",
  failure: "실패",
};

export const SET_TYPE_SHORT: Record<SetType, string> = {
  warmup: "W",
  normal: "",
  drop: "D",
  failure: "F",
};
