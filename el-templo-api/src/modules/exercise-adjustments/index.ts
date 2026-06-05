// Module: exercise-adjustments — Phase 131 Plan 01 (ADJUST-01/02/03) + Plan 02
export { exerciseAdjustmentRoutes } from "./routes";
export { exerciseAdjustmentCoachRoutes } from "./coach-routes";
export { ExerciseAdjustmentService } from "./service";
export { ExerciseAdjustmentCoachService } from "./coach-service";
export type {
  AdjustmentStatus,
  AdjustmentContext,
  AdjustmentResult,
} from "./service";
export type { MemberAdjustmentRow } from "./coach-service";
