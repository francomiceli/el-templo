import fp from "fastify-plugin";
import { exerciseAdjustmentCoachRoutes } from "../modules/exercise-adjustments/coach-routes";

/**
 * exercise-adjustments-coach plugin — Phase 131 Plan 02 (ADJUST-04, D-05).
 *
 * Registers the coach/owner-scoped read of a member's dominado/bajado log under
 * /api/admin/exercise-adjustments. Mirrors plugins/tree-editor.ts: depends on
 * database + auth, and the routes' own onRequest hook applies the TRAINING_ROLES
 * gate (403 for members). Kept separate from plugins/exercise-adjustments.ts so
 * the member-scoped POST is never affected by the coach role gate.
 */
export default fp(
  async (fastify) => {
    fastify.register(exerciseAdjustmentCoachRoutes, {
      prefix: "/api/admin/exercise-adjustments",
    });
  },
  {
    name: "exercise-adjustments-coach-plugin",
    dependencies: ["database", "auth"],
  },
);
