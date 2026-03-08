import fp from "fastify-plugin";
import { progressionRoutes } from "../modules/progression";

export default fp(
  async (fastify) => {
    fastify.register(progressionRoutes, { prefix: "/api/progression" });
  },
  {
    name: "progression-plugin",
    dependencies: ["database", "auth"],
  },
);
