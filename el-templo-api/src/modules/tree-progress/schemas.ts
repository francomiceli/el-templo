/**
 * tree-progress / schemas — Phase 127 Plan 01 (TREE-06).
 *
 * Fastify JSON-schema response objects for GET /api/tree-progress/me, mirroring
 * the plain-const style of progression/schemas.ts. The shape is the authoritative
 * DTO consumed by phase 127 Plan 02 (member-app tree view): nested
 * category → subfamily → nodes, with reached/percent at each level.
 */

const treeNodeSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "number" },
    name: { type: "string" },
    dificultadLineal: { type: "number" },
    reached: { type: "boolean" },
    // Phase 134 (D-01..D-08): per-node state + difficulty band. Fastify strips
    // any response prop not declared here, so both MUST be present or the
    // member-app contract silently loses them.
    state: { type: "string" }, // dominado | en_progreso | disponible | bloqueado
    band: { type: "string" }, // alfa | delta | sigma | omega | spartan
  },
} as const;

const treeSubfamilySchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    route: { type: "string" },
    totalNodes: { type: "number" },
    reachedNodes: { type: "number" },
    percent: { type: "number" },
    nodes: { type: "array", items: treeNodeSchema },
  },
} as const;

const treeCategorySchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    totalNodes: { type: "number" },
    reachedNodes: { type: "number" },
    percent: { type: "number" },
    subfamilies: { type: "array", items: treeSubfamilySchema },
  },
} as const;

export const memberTreeResponseSchema = {
  type: "object",
  properties: {
    level: { type: "string" },
    categories: { type: "array", items: treeCategorySchema },
  },
} as const;

export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
} as const;
