import fp from "fastify-plugin";
import { exerciseAdjustmentRoutes } from "../modules/exercise-adjustments";

export default fp(
  async (fastify) => {
    fastify.register(exerciseAdjustmentRoutes, {
      prefix: "/api/exercise-adjustments",
    });
  },
  {
    name: "exercise-adjustments-plugin",
    dependencies: ["database", "auth"],
  },
);
