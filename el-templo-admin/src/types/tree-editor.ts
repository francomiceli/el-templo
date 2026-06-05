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

/** A subfamily × effort partition with its ordered nodes. */
export interface TreePartition {
  effort: string;
  /** true ⇒ this partition is owned by a profe manual chain (locked over auto). */
  overridden: boolean;
  nodes: TreeNode[];
}

/** A subfamily grouping one or more effort partitions. */
export interface TreeSubfamily {
  id: number;
  name: string;
  route: string;
  partitions: TreePartition[];
}

/** A top-level category (pattern → category map) grouping subfamilies. */
export interface TreeCategory {
  key: string;
  label: string;
  subfamilies: TreeSubfamily[];
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
  subfamilyId: number;
  effort: Effort;
  orderedExerciseIds: number[];
}

/** POST /admin/tree-editor/precedence request body. */
export interface PrecedenceBody {
  fromExerciseId: number;
  toExerciseId: number;
  op: 'add' | 'remove';
}

/** POST /admin/tree-editor/regroup request body. */
export interface RegroupBody {
  exerciseIds: number[];
  targetSubfamilyId: number;
}

/** Shared mutation result for reorder/precedence/regroup. */
export interface MutationResult {
  ok: boolean;
  edgesWritten: number;
  edgesDeleted: number;
}
