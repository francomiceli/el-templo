// Tree-editor admin-UI types (Phase 128 — TREE-07 profe-facing skill-tree editor).
// Mirrors the DTO contract from el-templo-api/src/modules/tree-editor (Plan 02).
// See 128-02-SUMMARY.md "DTO / Endpoint Contract for Plan 03".

/** Effort partition key. Backend enum CON | EXC | ISO. */
export type Effort = 'CON' | 'EXC' | 'ISO';

/** Where an order/edge comes from: SPOM auto-build vs. profe manual override. */
export type OrderSource = 'auto' | 'manual';

/** A single exercise node inside an (effort) partition, in display order. */
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number | null;
  effort: string;
  orderSource: OrderSource;
  /**
   * Variantes hanging off this hito (Plan 03 backend contract — embedded per
   * hito, ordered by dl ascending, `[]` when the hito has no variants). 1:1
   * mirror of the backend EditableNode.variants shape.
   */
  variants: MilestoneVariant[];
}

/** A route × effort partition with its ordered nodes. */
export interface TreePartition {
  effort: string;
  /** true ⇒ this partition is owned by a profe manual chain (locked over auto). */
  overridden: boolean;
  nodes: TreeNode[];
}

/** A route grouping one or more effort partitions (the partition axis is route). */
export interface TreeRoute {
  /** routes.id (the group key for the UI). */
  id: number;
  /** routes.display_name (or the code as fallback). */
  name: string;
  /** routes.code — also the partition dimension. */
  route: string;
  /**
   * Dominant fine-category of the route's backbone nodes (R3 sub-grupo).
   * UPPERCASE DB value, '' when the route has no votes — mirror of Plan 04's
   * required field in GET /admin/tree-editor/tree.
   */
  subGroup: string;
  partitions: TreePartition[];
}

/**
 * Sub-grupo display names (UI-SPEC C3 — LOCKED es-AR title case list).
 * Keys are the UPPERCASE DB values of exercises.category.
 */
export const SUB_GROUP_DISPLAY_NAMES: Record<string, string> = {
  'PULL VERTICAL': 'Pull Vertical',
  'PULL HORIZONTAL': 'Pull Horizontal',
  'PUSH VERTICAL': 'Push Vertical',
  'PUSH HORIZONTAL': 'Push Horizontal',
  'KNEE DOMINANT': 'Knee Dominant',
  'HIP DOMINANT': 'Hip Dominant',
  'CORE ANTERIOR': 'Core Anterior',
  'CORE POSTERIOR': 'Core Posterior',
  'CORE LATERAL': 'Core Lateral',
  OBLICUOS: 'Oblicuos',
};

/** Display name of a sub-grupo: LOCKED list first, generic title-case fallback. */
export function subGroupDisplayName(subGroup: string): string {
  const locked = SUB_GROUP_DISPLAY_NAMES[subGroup];
  if (locked) return locked;
  return subGroup.toLowerCase().replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}

/** A top-level category (pattern → category map) grouping routes. */
export interface TreeCategory {
  key: string;
  label: string;
  routes: TreeRoute[];
}

/** A cross-partition precedence edge (DAG branch) returned separately. */
export interface PrecedenceEdge {
  fromExerciseId: number;
  toExerciseId: number;
  source: OrderSource;
}

/** GET /admin/tree-editor/tree response. */
export interface EditableTree {
  categories: TreeCategory[];
  precedenceEdges: PrecedenceEdge[];
}

/** POST /admin/tree-editor/reorder request body. */
export interface ReorderBody {
  /** routes.code — the partition dimension. */
  route: string;
  effort: Effort;
  orderedExerciseIds: number[];
}

/** POST /admin/tree-editor/precedence request body. */
export interface PrecedenceBody {
  fromExerciseId: number;
  toExerciseId: number;
  op: 'add' | 'remove';
}

/** POST /admin/tree-editor/regroup request body — move exercises to a target route. */
export interface RegroupBody {
  exerciseIds: number[];
  /** routes.code of the destination route. */
  targetRoute: string;
}

/** Shared mutation result for reorder/precedence/regroup. */
export interface MutationResult {
  ok: boolean;
  edgesWritten: number;
  edgesDeleted: number;
  /** Set on a reorder of a single-node partition (nothing to chain). */
  singleNode?: boolean;
  /** Optional human-readable note accompanying a no-op result. */
  message?: string;
}

// ── Milestone review (Phase 133 Plan 06 — R1-REV) ─────────────────────────────
// Mirrors the Plan-05 endpoint contracts 1:1 (tree-editor/schemas.ts).

/** One pending hito/variante proposal row from GET /milestone-review?route=. */
export interface MilestoneReviewRow {
  exerciseId: number;
  name: string;
  /** dificultad_lineal. */
  dl: number;
  effort: string;
  movementToken: string | null;
  stepRank: number | null;
  /** NULL = proposed as HITO; NOT NULL = proposed as variante of that hito. */
  proposedMilestoneExerciseId: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  confidence: number | null;
}

/** One variante hanging off a hito (truth column) — GET /milestone/:id/variants. */
export interface MilestoneVariant {
  id: number;
  name: string;
  dl: number;
}

/**
 * POST /milestone-review/accept body. `milestoneExerciseId` is required when
 * role='variante'. `dimensionOverrides` rides the SAME transaction (locked
 * decision 2): undefined keeps the proposed value, null is an explicit clear.
 */
export interface AcceptMilestoneBody {
  exerciseId: number;
  role: 'hito' | 'variante';
  milestoneExerciseId?: number;
  dimensionOverrides?: {
    step?: number | null;
    habilidad?: string | null;
  };
}
