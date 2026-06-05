import fp from "fastify-plugin";
import { treeProgressRoutes } from "../modules/tree-progress";

export default fp(
  async (fastify) => {
    fastify.register(treeProgressRoutes, { prefix: "/api/tree-progress" });
  },
  {
    name: "tree-progress-plugin",
    dependencies: ["database", "auth"],
  },
);
