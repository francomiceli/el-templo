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

const editableRouteSchema = {
  type: "object",
  required: ["subGroup"],
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    route: { type: "string" },
    /**
     * R3 sub-group: dominant fine `exercises.category` among the route's
     * backbone nodes, UPPERCASE from the DB (e.g. "PULL VERTICAL"). Always a
     * string ("" when the route has no categorized nodes) — never undefined.
     * Title-casing es-AR is the frontend's responsibility (UI-SPEC C3).
     */
    subGroup: { type: "string" },
    partitions: { type: "array", items: editablePartitionSchema },
  },
} as const;

const editableCategorySchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    routes: { type: "array", items: editableRouteSchema },
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
  required: ["route", "effort", "orderedExerciseIds"],
  additionalProperties: false,
  properties: {
    route: { type: "string" },
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

/** POST /regroup body — move misrouted exercises to a target route. */
export const regroupBodySchema = {
  type: "object",
  required: ["exerciseIds", "targetRoute"],
  additionalProperties: false,
  properties: {
    exerciseIds: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
    },
    targetRoute: { type: "string" },
  },
} as const;

// ── Milestone review (phase 133 Plan 05 — R1-REV) ────────────────────────────

/** GET /milestone-review querystring — the route whose proposals to review. */
export const milestoneReviewQuerySchema = {
  type: "object",
  required: ["route"],
  additionalProperties: false,
  properties: {
    route: { type: "string", minLength: 1 },
  },
} as const;

/** One pending hito/variante proposal row (drawer contract, Plan 06). */
const milestoneReviewRowSchema = {
  type: "object",
  required: [
    "exerciseId",
    "name",
    "dl",
    "effort",
    "movementToken",
    "stepRank",
    "proposedMilestoneExerciseId",
    "status",
    "confidence",
  ],
  properties: {
    exerciseId: { type: "number" },
    name: { type: "string" },
    /** dificultad_lineal. */
    dl: { type: "number" },
    effort: { type: "string" },
    movementToken: { type: ["string", "null"] },
    stepRank: { type: ["number", "null"] },
    /** NULL = proposed as HITO; NOT NULL = proposed as variante of that hito. */
    proposedMilestoneExerciseId: { type: ["number", "null"] },
    status: { type: "string", enum: ["pending", "accepted", "rejected"] },
    confidence: { type: ["number", "null"] },
  },
} as const;

/** GET /milestone-review response. */
export const milestoneReviewResponseSchema = {
  type: "object",
  properties: {
    rows: { type: "array", items: milestoneReviewRowSchema },
  },
} as const;

/** GET /milestone/:exerciseId/variants params. */
export const milestoneVariantsParamsSchema = {
  type: "object",
  required: ["exerciseId"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "number" },
  },
} as const;

/** GET /milestone/:exerciseId/variants response (truth column, not proposals). */
export const milestoneVariantsResponseSchema = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "dl"],
        properties: {
          id: { type: "number" },
          name: { type: "string" },
          dl: { type: "number" },
        },
      },
    },
  },
} as const;

/**
 * POST /milestone-review/accept body. `milestoneExerciseId` is conditionally
 * required (role='variante') — enforced in the handler (JSON schema can't
 * express it without if/then noise). `dimensionOverrides` rides the SAME
 * transaction (locked decision 2): undefined keeps the proposed value, null is
 * an explicit clear.
 */
export const milestoneAcceptBodySchema = {
  type: "object",
  required: ["exerciseId", "role"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "number" },
    role: { type: "string", enum: ["hito", "variante"] },
    milestoneExerciseId: { type: "number" },
    dimensionOverrides: {
      type: "object",
      additionalProperties: false,
      properties: {
        step: { type: ["number", "null"] },
        habilidad: { type: ["string", "null"] },
      },
    },
  },
} as const;

/** POST /milestone-review/reject body — status-only flip, never touches exercises. */
export const milestoneRejectBodySchema = {
  type: "object",
  required: ["exerciseId"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "number" },
  },
} as const;

/** POST /milestone/promote body — the VARIANTE to swap with its hito. */
export const milestonePromoteBodySchema = {
  type: "object",
  required: ["exerciseId"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "number" },
  },
} as const;

/** Shared success envelope for the mutating endpoints. */
export const mutationResultSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    edgesWritten: { type: "number" },
    edgesDeleted: { type: "number" },
    /**
     * Present and true only on a reorder of a single-node partition: nothing
     * was chained and the partition cannot be marked overridden (WR-04). Lets
     * the UI disable/explain the reorder control instead of showing a silent
     * no-op success.
     */
    singleNode: { type: "boolean" },
    /** Optional human-readable note accompanying a no-op result. */
    message: { type: "string" },
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
