import fp from "fastify-plugin";
import { sessionRoutes } from "../modules/sessions";

export default fp(
  async (fastify) => {
    fastify.register(sessionRoutes, { prefix: "/api/sessions" });
  },
  {
    name: "sessions-plugin",
    dependencies: ["database", "auth", "spom-plugin"],
  },
);
