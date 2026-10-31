import { z } from "zod";

const num = (min: number, max: number) => z.number().min(min).max(max).nullable();
const int = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const iso = z.iso.datetime({ offset: true });

export const setSchema = z.object({
  id: z.uuid(),
  set_type: z.enum(["warmup", "normal", "drop", "failure"]),
  weight_kg: num(0, 1000),
  reps: int(0, 1000),
  duration_seconds: int(0, 86400),
  distance_km: num(0, 1000),
  rpe: num(1, 10),
  rir: int(0, 10),
  is_completed: z.boolean(),
  completed_at: iso.nullable(),
  rest_seconds: int(0, 86400),
  notes: z.string().max(500).nullable(),
});

export const workoutPayloadSchema = z
  .object({
    id: z.uuid(),
    routine_id: z.uuid().nullable(),
    title: z.string().min(1).max(80),
    status: z.enum(["in_progress", "completed"]),
    started_at: iso,
    ended_at: iso.nullable(),
    paused_at: iso.nullable(),
    paused_seconds: z.number().int().min(0),
    notes: z.string().max(2000).nullable(),
    exercises: z
      .array(
        z.object({
          id: z.uuid(),
          exercise_id: z.uuid(),
          exercise_name: z.string().min(1).max(100),
          superset_group: int(1, 20),
          rest_seconds: int(0, 1800),
          rep_min: int(1, 100),
          rep_max: int(1, 100),
          notes: z.string().max(1000).nullable(),
          sets: z.array(setSchema).max(50),
        }),
      )
      .max(40),
  })
  .refine((s) => s.status === "in_progress" || s.ended_at != null, { message: "완료된 운동에는 종료 시각이 필요합니다." })
  .refine((s) => !s.ended_at || Date.parse(s.ended_at) >= Date.parse(s.started_at), { message: "종료 시각이 시작 시각보다 빠릅니다." });
