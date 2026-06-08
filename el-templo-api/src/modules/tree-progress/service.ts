/**
 * tree-progress / service — Phase 127 Plan 01 (TREE-06).
 *
 * buildMemberTree(db, userId, log) computes a member's skill-tree progress as a
 * nested structure: category → route → nodes, with a % "reached" at every level,
 * ALL computed server-side (D-05). The client sends nothing that influences the
 * numbers (T-127-02). (The response keeps the `subfamilies[]` field name for the
 * member-app contract, but each group is now one ROUTE.)
 *
 * STRUCTURE SOURCE (D-04): the node set is the rework backbone scope, read via
 * the shared `backboneNodeConditions()` helper
 * (../exercises/backbone-scope.ts) — the single Drizzle source of truth also
 * consumed by tree-editor, manually mirrored by the raw SQL in
 * rebuild-progression-graph.ts (phase 133 Plan 04).
 * Routes that own zero such nodes are omitted. Every node maps to a route and to
 * a category via patternToCategory(pattern).
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

import { eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { backboneNodeConditions } from "../exercises/backbone-scope";
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

/**
 * The four videogame-style node states (phase 134, D-01..D-04). A separate
 * layer from `reached`/`percent` (D-05) — these describe per-node availability:
 *   - dominado:    evidence-based mastery (D-01); dl ≤ ceiling NEVER dominates.
 *   - en_progreso: the route frontier (D-02) — the first non-dominado,
 *                  prereq-satisfied node; at most one per route.
 *   - disponible:  prereqs satisfied (D-06), not dominado, not the frontier.
 *   - bloqueado:   dl > ceiling AND a graph prereq is not dominado (D-06).
 */
export type NodeState = "dominado" | "en_progreso" | "disponible" | "bloqueado";

/** A single leaf node of the tree. */
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number;
  reached: boolean;
  /** Server-computed availability state (D-01..D-04). Client renders verbatim. */
  state: NodeState;
  /** Difficulty band derived from dificultadLineal (D-08). Never 'kairos' for a node. */
  band: ContentLevel;
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

/**
 * Difficulty band for a node's dificultadLineal (phase 134, D-08): the highest
 * content level whose LEVEL_LINEAR_MIN floor is ≤ dl. The thresholds are read
 * from the single LEVEL_LINEAR_MIN source ({alfa:1, delta:4, sigma:7, omega:9,
 * spartan:11}) — never hardcoded here (DRY). dl ≥ 1 always, so every node lands
 * on at least 'alfa'; 'kairos' has no dl floor distinct from alfa (it draws alfa
 * content), so it is never emitted as a node band.
 */
export function bandForDl(dl: number): ContentLevel {
  let band: ContentLevel = LEVEL_ORDER[0]; // 'alfa' — the floor for dl ≥ 1
  for (const level of LEVEL_ORDER) {
    if (dl >= LEVEL_LINEAR_MIN[level]) band = level;
  }
  return band;
}

/** A confirmed-canonical backbone graph node row joined with its route metadata. */
interface NodeRow {
  exerciseId: number;
  exerciseName: string;
  pattern: string;
  dificultadLineal: number;
  routeId: number;
  routeCode: string;
  routeDisplayName: string;
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
 * Read the rework backbone graph node set (confirmed canonical exercises that
 * sit on the per-route progression) joined with their route metadata. The scope
 * predicate is the shared `backboneNodeConditions()` helper (see
 * ../exercises/backbone-scope.ts for the full funnel contract), so the tree
 * shows the real graph, not a hardcoded list.
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
      routeId: schema.routes.id,
      routeCode: schema.routes.code,
      routeDisplayName: schema.routes.displayName,
    })
    .from(schema.exercises)
    .innerJoin(schema.routes, eq(schema.exercises.route, schema.routes.code))
    .where(and(...backboneNodeConditions()));

  // display_name is nullable; fall back to the route code so a group always has a label.
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    exerciseName: r.exerciseName,
    pattern: r.pattern,
    dificultadLineal: r.dificultadLineal,
    routeId: r.routeId,
    routeCode: r.routeCode,
    routeDisplayName: r.routeDisplayName ?? r.routeCode,
  }));
}

/** A single directed progression edge `from → to` (phase 134, D-06 gating). */
interface EdgeRow {
  fromExerciseId: number;
  toExerciseId: number;
}

/**
 * Read every persisted progression edge (both `auto` backbone and `manual`
 * cross-route overrides) as `from → to` pairs. Together they form the "graph
 * prereqs" used to gate Bloqueado/Disponible (D-06). Mirrors
 * tree-editor/service.ts::loadAllEdges. Global graph data (no per-member rows),
 * so it leaks nothing about other members (T-134-01).
 */
async function loadEdges(
  db: MySql2Database<typeof schema>,
): Promise<EdgeRow[]> {
  const rows = await db
    .select({
      fromExerciseId: schema.exerciseProgressions.fromExerciseId,
      toExerciseId: schema.exerciseProgressions.toExerciseId,
    })
    .from(schema.exerciseProgressions);
  return rows.map((r) => ({
    fromExerciseId: r.fromExerciseId,
    toExerciseId: r.toExerciseId,
  }));
}

/**
 * Build the per-node "graph prereq" map for D-06 gating: node id → set of
 * prereq exercise ids (the `from` of every edge pointing AT that node). Edges
 * may point at off-backbone exercises, so only prereqs that are themselves
 * loaded backbone nodes are kept — a non-backbone prereq must never silently
 * block a node. Degrades gracefully (D-06): a node with no curated incoming
 * edge gets an empty prereq set and is gated by the level ceiling alone.
 */
function buildPrereqMap(
  nodes: NodeRow[],
  edges: EdgeRow[],
): Map<number, Set<number>> {
  const backboneIds = new Set<number>(nodes.map((n) => n.exerciseId));
  const prereqs = new Map<number, Set<number>>();
  for (const edge of edges) {
    // Only gate on prereqs that exist on the backbone the member can see.
    if (!backboneIds.has(edge.toExerciseId)) continue;
    if (!backboneIds.has(edge.fromExerciseId)) continue;
    let set = prereqs.get(edge.toExerciseId);
    if (!set) {
      set = new Set<number>();
      prereqs.set(edge.toExerciseId, set);
    }
    set.add(edge.fromExerciseId);
  }
  return prereqs;
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

  const [nodes, completedExerciseIds, dominatedExerciseIds, edges] =
    await Promise.all([
      loadGraphNodes(db),
      loadCompletedExerciseIds(db, userId),
      loadDominatedExerciseIds(db, userId),
      loadEdges(db),
    ]);

  // node id → set of in-tree prereq ids (D-06 graph gating). Off-backbone
  // prereqs are filtered out so they never block a member-visible node.
  const prereqsByNode = buildPrereqMap(nodes, edges);

  // Bucket nodes by category → subfamily, computing the reached flag per node.
  // Warn once per distinct unmapped pattern so catalog drift surfaces (D-01).
  const warnedPatterns = new Set<string>();

  interface RouteAccumulator {
    id: number;
    name: string;
    route: string;
    nodes: TreeNode[];
  }
  // category key → (routeId → accumulator)
  const byCategory = new Map<Category, Map<number, RouteAccumulator>>();
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

    // ── Node state, a layer separate from `reached` (D-01..D-06) ──────────
    // dominado is evidence-only: dl ≤ ceiling NEVER dominates (D-01).
    const dominado =
      dominatedExerciseIds.has(node.exerciseId) ||
      completedExerciseIds.has(node.exerciseId);
    // disponible-base gating (D-06): reachable by level ceiling OR every graph
    // prereq dominated. A node with no curated prereq is gated by ceiling only.
    const prereqIds = prereqsByNode.get(node.exerciseId);
    const allPrereqsDominated =
      prereqIds === undefined ||
      Array.from(prereqIds).every((id) => dominatedExerciseIds.has(id));
    const disponibleBase =
      node.dificultadLineal <= ceiling || allPrereqsDominated;
    // Provisional state — en_progreso (the frontier) is promoted in a SECOND
    // per-route pass below, because "frontier" depends on the full route order.
    const state: NodeState = dominado
      ? "dominado"
      : disponibleBase
        ? "disponible"
        : "bloqueado";

    const subfamilies = byCategory.get(category);
    if (!subfamilies) continue; // unreachable: every category preallocated
    let acc = subfamilies.get(node.routeId);
    if (!acc) {
      acc = {
        id: node.routeId,
        name: node.routeDisplayName,
        route: node.routeCode,
        nodes: [],
      };
      subfamilies.set(node.routeId, acc);
    }
    acc.nodes.push({
      exerciseId: node.exerciseId,
      name: node.exerciseName,
      dificultadLineal: node.dificultadLineal,
      reached,
      state,
      band: bandForDl(node.dificultadLineal),
    });
  }

  // Assemble the ordered response. All 5 categories always render (D-04);
  // subfamilies ordered by sortOrder then name; nodes by dificultadLineal then id.
  const categories: TreeCategory[] = CATEGORY_ORDER.map((key) => {
    const subfamilyMap =
      byCategory.get(key) ?? new Map<number, RouteAccumulator>();
    const subfamilies: TreeSubfamily[] = Array.from(subfamilyMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((acc) => {
        const sortedNodes = acc.nodes
          .slice()
          .sort(
            (a, b) =>
              a.dificultadLineal - b.dificultadLineal ||
              a.exerciseId - b.exerciseId,
          );
        // SECOND pass (D-02): walking the ordered route, promote the FIRST
        // disponible (non-dominado, prereq-satisfied) node to en_progreso — the
        // route's single "next up" frontier. Computed here, not in the node
        // loop, because the frontier depends on the full route order.
        const frontier = sortedNodes.find((n) => n.state === "disponible");
        if (frontier) frontier.state = "en_progreso";
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
