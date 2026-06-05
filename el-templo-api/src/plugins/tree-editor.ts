import fp from "fastify-plugin";
import { treeEditorRoutes } from "../modules/tree-editor";

/**
 * tree-editor plugin — Phase 128 Plan 02 (TREE-07).
 *
 * Registers the admin/coach-scoped skill-tree editor routes under
 * /api/admin/tree-editor. Mirrors plugins/tree-progress.ts; depends on the
 * database + auth plugins (the routes use fastify.db and fastify.authenticate).
 */
export default fp(
  async (fastify) => {
    fastify.register(treeEditorRoutes, { prefix: "/api/admin/tree-editor" });
  },
  {
    name: "tree-editor-plugin",
    dependencies: ["database", "auth"],
  },
);
