/**
 * tree-progress / service — Phase 127 Plan 01 (TREE-06).
 *
 * buildMemberTree(db, userId, log) computes a member's skill-tree progress as a
 * nested structure: category → subfamily → nodes, with a % "reached" at every
 * level, ALL computed server-side (D-05). The client sends nothing that
 * influences the numbers (T-127-02).
 *
 * STRUCTURE SOURCE (D-04): the node set is the phase-126 DAG node scope, read
 * with the EXACT predicate from rebuild-progression-graph.ts:
 *   subfamily_id IS NOT NULL AND canonical_exercise_id IS NULL
 *   AND effort IN ('CON','EXC','ISO')
 * Subfamilies that own zero such nodes are omitted. Every node maps to a
 * subfamily (subfamily_id) and to a category via patternToCategory(pattern).
 *
 * REACHED PROXY (D-03; AUGMENTED — not replaced — by phase 131's "dominado"
 * registry, D-05/D-06):
 *   A node is "reached" iff ANY of:
 *     (a) its dificultadLineal ≤ the member's level ceiling
 *         (alfa→3, delta→6, sigma→8, omega→10, spartan→12), derived from
 *         LEVEL_LINEAR_MIN of the NEXT level minus 1, spartan capped at the
 *         dl scale max 12 — the always-available dominant signal; OR
 *     (b) its exerciseId appears in the member's completed sessions. Branch (b)
 *         is ACTIVE here: completed_sessions.exercisesCompleted stores
 *         *prescription* ids (not exercise ids), so we resolve prescription →
 *         exercise via session_prescriptions.exercise_id; OR
 *     (c) the member's LATEST `exercise_adjustments` record for that node is
 *         `dominado` (phase 131, ADJUST-04). This is the third branch the
 *         dominado registry ADDS on top of (a)/(b) — it never replaces them.
 *         "Latest-per-node wins" (D-05): for each exercise the most recent row
 *         (MAX created_at, id as tie-break) decides; a later `bajado` un-counts
 *         an earlier `dominado`. This only widens the READ of "reached" — it
 *         never touches the member's level or SPOM (D-06).
 *
 * PERCENT: percent = total === 0 ? 0 : round(reached / total * 100). Integer
 * counts are authoritative and aggregate upward (category counts = sum of its
 * subfamilies' counts); rounding happens only at display time.
 */

import { eq, and, isNull, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  LEVEL_LINEAR_MIN,
  toContentLevel,
} from "../sessions/pipeline/utils/level-mapping";
import type {
  ExerciseLevel,
  ContentLevel,
} from "../sessions/pipeline/utils/level-mapping";
import {
  type Category,
  CATEGORY_ORDER,
  patternToCategory,
  isMappedPattern,
} from "./category-map";

/** A minimal logger surface (request.log / app.log compatible). No console.log. */
export interface TreeLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** A single leaf node of the tree. */
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number;
  reached: boolean;
}

/** A subfamily grouping nodes under a category. */
export interface TreeSubfamily {
  id: number;
  name: string;
  route: string;
  totalNodes: number;
  reachedNodes: number;
  percent: number;
  nodes: TreeNode[];
}

/** A top-level thematic category section. */
export interface TreeCategory {
  key: Category;
  label: Category;
  totalNodes: number;
  reachedNodes: number;
  percent: number;
  subfamilies: TreeSubfamily[];
}

/** The full member tree response shape. */
export interface MemberTree {
  level: ExerciseLevel;
  categories: TreeCategory[];
}

/**
 * Level → dl ceiling: the max dificultadLineal the member is assumed to have
 * reached. Derived from LEVEL_LINEAR_MIN of the NEXT level minus 1 (so a member
 * at `alfa` reaches everything strictly below the `delta` floor), with `spartan`
 * capped at the dl scale max (12). Kept here next to the proxy so 131 can swap
 * the whole "reached" definition without touching level-mapping.
 */
const DL_SCALE_MAX = 12;
const LEVEL_ORDER: readonly ContentLevel[] = [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
];

export function levelCeiling(level: ExerciseLevel): number {
  // Phase 129 (D-03): kairos draws Alfa content, so its ceiling is Alfa's.
  const contentLevel = toContentLevel(level);
  const idx = LEVEL_ORDER.indexOf(contentLevel);
  const next = LEVEL_ORDER[idx + 1];
  if (!next) return DL_SCALE_MAX; // spartan → 12
  return LEVEL_LINEAR_MIN[next] - 1;
}

/** A confirmed-canonical graph node row joined with its subfamily metadata. */
interface NodeRow {
  exerciseId: number;
  exerciseName: string;
  pattern: string;
  dificultadLineal: number;
  subfamilyId: number;
  subfamilyName: string;
  subfamilyRoute: string;
  subfamilySortOrder: number;
}

function round(n: number): number {
  return Math.round(n);
}

function percentOf(reached: number, total: number): number {
  return total === 0 ? 0 : round((reached / total) * 100);
}

/**
 * Collect the member's reached exercise ids from completed sessions (branch b).
 * exercisesCompleted is `{ role: [prescriptionId, ...] }`; we flatten all numeric
 * prescription ids and resolve them to exercise ids via session_prescriptions.
 * Returns an empty set when the member has no completed sessions.
 */
async function loadCompletedExerciseIds(
  db: MySql2Database<typeof schema>,
  userId: number,
): Promise<Set<number>> {
  const sessions = await db
    .select({ exercisesCompleted: schema.completedSessions.exercisesCompleted })
    .from(schema.completedSessions)
    .where(eq(schema.completedSessions.userId, userId));

  const prescriptionIds = new Set<number>();
  for (const row of sessions) {
    const completed = row.exercisesCompleted;
    if (completed === null || typeof completed !== "object") continue;
    for (const value of Object.values(completed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      for (const id of value) {
        const num = Number(id);
        if (Number.isFinite(num)) prescriptionIds.add(num);
      }
    }
  }

  if (prescriptionIds.size === 0) return new Set<number>();

  const rows = await db
    .select({ exerciseId: schema.sessionPrescriptions.exerciseId })
    .from(schema.sessionPrescriptions)
    .where(
      inArray(schema.sessionPrescriptions.id, Array.from(prescriptionIds)),
    );

  const exerciseIds = new Set<number>();
  for (const r of rows) exerciseIds.add(r.exerciseId);
  return exerciseIds;
}

/**
 * Collect the exercise ids whose LATEST exercise_adjustments record for this
 * member is `dominado` (branch c — phase 131, ADJUST-04). Mirrors
 * loadCompletedExerciseIds: read the member's rows, reduce to the latest per
 * exercise_id (MAX created_at, id as deterministic tie-break for equal
 * timestamps), and keep only those whose latest status is `dominado`. A later
 * `bajado` therefore un-counts an earlier `dominado` (D-05, latest-per-node
 * wins). Returns an empty set when the member has no adjustment records.
 *
 * READ-ONLY: this widens the "reached" definition only; level/SPOM are never
 * written here (D-06).
 */
async function loadDominatedExerciseIds(
  db: MySql2Database<typeof schema>,
  userId: number,
): Promise<Set<number>> {
  const rows = await db
    .select({
      exerciseId: schema.exerciseAdjustments.exerciseId,
      status: schema.exerciseAdjustments.status,
      createdAt: schema.exerciseAdjustments.createdAt,
      id: schema.exerciseAdjustments.id,
    })
    .from(schema.exerciseAdjustments)
    .where(eq(schema.exerciseAdjustments.memberId, userId));

  // Reduce to the latest row per exercise_id. Tie-break on id so that rows
  // sharing a created_at (same-second taps) resolve deterministically to the
  // higher id (the more recent insert).
  interface LatestRow {
    status: "dominado" | "bajado";
    createdAt: Date;
    id: number;
  }
  const latestByExercise = new Map<number, LatestRow>();
  for (const row of rows) {
    const current = latestByExercise.get(row.exerciseId);
    const rowTime = row.createdAt.getTime();
    const isNewer =
      current === undefined ||
      rowTime > current.createdAt.getTime() ||
      (rowTime === current.createdAt.getTime() && row.id > current.id);
    if (isNewer) {
      latestByExercise.set(row.exerciseId, {
        status: row.status,
        createdAt: row.createdAt,
        id: row.id,
      });
    }
  }

  const dominated = new Set<number>();
  for (const [exerciseId, latest] of latestByExercise) {
    if (latest.status === "dominado") dominated.add(exerciseId);
  }
  return dominated;
}

/**
 * Read the phase-126 DAG node set (confirmed canonical exercises participating
 * in the graph) joined with their subfamily metadata. Mirrors the
 * rebuild-progression-graph scope predicate exactly so the tree shows the real
 * graph, not a hardcoded list.
 */
async function loadGraphNodes(
  db: MySql2Database<typeof schema>,
): Promise<NodeRow[]> {
  const rows = await db
    .select({
      exerciseId: schema.exercises.id,
      exerciseName: schema.exercises.exercise,
      pattern: schema.exercises.pattern,
      dificultadLineal: schema.exercises.dificultadLineal,
      subfamilyId: schema.exercises.subfamilyId,
      subfamilyName: schema.exerciseSubfamilies.name,
      subfamilyRoute: schema.exerciseSubfamilies.route,
      subfamilySortOrder: schema.exerciseSubfamilies.sortOrder,
    })
    .from(schema.exercises)
    .innerJoin(
      schema.exerciseSubfamilies,
      eq(schema.exercises.subfamilyId, schema.exerciseSubfamilies.id),
    )
    .where(
      and(
        // canonical_exercise_id IS NULL — only canonical nodes (D-04).
        isNull(schema.exercises.canonicalExerciseId),
        // effort IN ('CON','EXC','ISO') — real contraction axis only (D-04).
        inArray(schema.exercises.effort, ["CON", "EXC", "ISO"]),
      ),
    );

  // The inner join already enforces subfamily_id IS NOT NULL (a NULL FK cannot
  // match a subfamilies row); narrow the type to a non-null subfamilyId.
  return rows
    .filter((r): r is NodeRow => r.subfamilyId !== null)
    .map((r) => ({
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      pattern: r.pattern,
      dificultadLineal: r.dificultadLineal,
      subfamilyId: r.subfamilyId,
      subfamilyName: r.subfamilyName,
      subfamilyRoute: r.subfamilyRoute,
      subfamilySortOrder: r.subfamilySortOrder,
    }));
}

/**
 * Build the member's nested skill-tree progress. Read-only; never accepts a
 * target user id from input (the caller passes request.user.userId — T-127-01).
 */
export async function buildMemberTree(
  db: MySql2Database<typeof schema>,
  userId: number,
  log: TreeLogger,
): Promise<MemberTree> {
  const [user] = await db
    .select({ level: schema.users.level })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  // Default to the lowest level if (defensively) the row is missing a level.
  const level: ExerciseLevel = (user?.level as ExerciseLevel | null) ?? "alfa";
  const ceiling = levelCeiling(level);

  const [nodes, completedExerciseIds, dominatedExerciseIds] = await Promise.all(
    [
      loadGraphNodes(db),
      loadCompletedExerciseIds(db, userId),
      loadDominatedExerciseIds(db, userId),
    ],
  );

  // Bucket nodes by category → subfamily, computing the reached flag per node.
  // Warn once per distinct unmapped pattern so catalog drift surfaces (D-01).
  const warnedPatterns = new Set<string>();

  interface SubfamilyAccumulator {
    id: number;
    name: string;
    route: string;
    sortOrder: number;
    nodes: TreeNode[];
  }
  // category key → (subfamilyId → accumulator)
  const byCategory = new Map<Category, Map<number, SubfamilyAccumulator>>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, new Map());

  for (const node of nodes) {
    if (!isMappedPattern(node.pattern) && !warnedPatterns.has(node.pattern)) {
      warnedPatterns.add(node.pattern);
      log.warn(
        { pattern: node.pattern, exerciseId: node.exerciseId },
        "tree-progress: unmapped exercises.pattern routed to fallback category",
      );
    }
    const category = patternToCategory(node.pattern);
    const reached =
      node.dificultadLineal <= ceiling ||
      completedExerciseIds.has(node.exerciseId) ||
      dominatedExerciseIds.has(node.exerciseId);

    const subfamilies = byCategory.get(category);
    if (!subfamilies) continue; // unreachable: every category preallocated
    let acc = subfamilies.get(node.subfamilyId);
    if (!acc) {
      acc = {
        id: node.subfamilyId,
        name: node.subfamilyName,
        route: node.subfamilyRoute,
        sortOrder: node.subfamilySortOrder,
        nodes: [],
      };
      subfamilies.set(node.subfamilyId, acc);
    }
    acc.nodes.push({
      exerciseId: node.exerciseId,
      name: node.exerciseName,
      dificultadLineal: node.dificultadLineal,
      reached,
    });
  }

  // Assemble the ordered response. All 5 categories always render (D-04);
  // subfamilies ordered by sortOrder then name; nodes by dificultadLineal then id.
  const categories: TreeCategory[] = CATEGORY_ORDER.map((key) => {
    const subfamilyMap =
      byCategory.get(key) ?? new Map<number, SubfamilyAccumulator>();
    const subfamilies: TreeSubfamily[] = Array.from(subfamilyMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((acc) => {
        const sortedNodes = acc.nodes
          .slice()
          .sort(
            (a, b) =>
              a.dificultadLineal - b.dificultadLineal ||
              a.exerciseId - b.exerciseId,
          );
        const reachedNodes = sortedNodes.filter((n) => n.reached).length;
        return {
          id: acc.id,
          name: acc.name,
          route: acc.route,
          totalNodes: sortedNodes.length,
          reachedNodes,
          percent: percentOf(reachedNodes, sortedNodes.length),
          nodes: sortedNodes,
        };
      });

    const totalNodes = subfamilies.reduce((s, sf) => s + sf.totalNodes, 0);
    const reachedNodes = subfamilies.reduce((s, sf) => s + sf.reachedNodes, 0);
    return {
      key,
      label: key,
      totalNodes,
      reachedNodes,
      percent: percentOf(reachedNodes, totalNodes),
      subfamilies,
    };
  });

  return { level, categories };
}
