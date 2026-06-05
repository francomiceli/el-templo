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
  partitions: TreePartition[];
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
