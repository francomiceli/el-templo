/**
 * tree-editor / schemas — Phase 128 Plan 02 (TREE-07).
 *
 * Fastify JSON-schema objects for the admin/coach-scoped skill-tree editor
 * (D-06), mirroring the plain-const style of tree-progress/schemas.ts. These are
 * the authoritative request/response DTOs consumed by the Wave-2 admin UI
 * (Plan 03).
 *
 * The editable-tree READ is the 127 read MINUS the member 'reached' filter:
 * every node and partition is tagged auto vs manual so the UI can badge what the
 * profe is overriding (specifics §). Effort is constrained to the three real
 * contraction axes (CON/EXC/ISO) and precedence op to add/remove so a malformed
 * body is rejected at the schema boundary (T-128-04) before any DB write.
 */

const EFFORT_ENUM = ["CON", "EXC", "ISO"] as const;

/** A single editable leaf node (no member 'reached' field — D-06). */
const editableNodeSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "number" },
    name: { type: "string" },
    dificultadLineal: { type: "number" },
    effort: { type: "string" },
    /** 'manual' when this node's partition order is profe-owned, else 'auto'. */
    orderSource: { type: "string", enum: ["auto", "manual"] },
  },
} as const;

/** A precedence (cross-partition) edge incident to a node, tagged by source. */
const precedenceEdgeSchema = {
  type: "object",
  properties: {
    fromExerciseId: { type: "number" },
    toExerciseId: { type: "number" },
    source: { type: "string", enum: ["auto", "manual"] },
  },
} as const;

/**
 * A (subfamily × effort) partition: the ordered backbone the editor reorders.
 * `overridden` is true when the partition owns a same-partition manual chain
 * (it is LOCKED against rebuild — Plan 01 D-02).
 */
const editablePartitionSchema = {
  type: "object",
  properties: {
    effort: { type: "string" },
    overridden: { type: "boolean" },
    nodes: { type: "array", items: editableNodeSchema },
  },
} as const;

const editableSubfamilySchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    route: { type: "string" },
    partitions: { type: "array", items: editablePartitionSchema },
  },
} as const;

const editableCategorySchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    subfamilies: { type: "array", items: editableSubfamilySchema },
  },
} as const;

/** GET /tree response: the editable structure + the cross-partition edges. */
export const editableTreeResponseSchema = {
  type: "object",
  properties: {
    categories: { type: "array", items: editableCategorySchema },
    precedenceEdges: { type: "array", items: precedenceEdgeSchema },
  },
} as const;

/** POST /reorder body — rewrite a partition's manual chain in a new order. */
export const reorderBodySchema = {
  type: "object",
  required: ["subfamilyId", "effort", "orderedExerciseIds"],
  additionalProperties: false,
  properties: {
    subfamilyId: { type: "number" },
    effort: { type: "string", enum: EFFORT_ENUM },
    orderedExerciseIds: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
    },
  },
} as const;

/** POST /precedence body — add/remove a single manual cross-edge. */
export const precedenceBodySchema = {
  type: "object",
  required: ["fromExerciseId", "toExerciseId", "op"],
  additionalProperties: false,
  properties: {
    fromExerciseId: { type: "number" },
    toExerciseId: { type: "number" },
    op: { type: "string", enum: ["add", "remove"] },
  },
} as const;

/** POST /regroup body — reassign exercises to a target subfamily. */
export const regroupBodySchema = {
  type: "object",
  required: ["exerciseIds", "targetSubfamilyId"],
  additionalProperties: false,
  properties: {
    exerciseIds: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
    },
    targetSubfamilyId: { type: "number" },
  },
} as const;

/** Shared success envelope for the mutating endpoints. */
export const mutationResultSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    edgesWritten: { type: "number" },
    edgesDeleted: { type: "number" },
  },
} as const;

/** Shared error response schema (matches handleServiceError envelope). */
export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;
