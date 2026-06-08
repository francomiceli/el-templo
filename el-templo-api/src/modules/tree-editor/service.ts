/**
 * tree-editor / service — Phase 128 Plan 02 (TREE-07), reworked for
 * "Progresión por ruta + Habilidad".
 *
 * The admin/coach-scoped persistence layer that lets profes refine the
 * auto-built skill tree (D-06). All ORDER overrides persist in the EXISTING
 * `exercise_progressions` table as `source='manual'` (D-01) — no new table, no
 * new column. Regroup is a data UPDATE of `exercises.route` (move a misrouted
 * exercise to another route), also no migration.
 *
 * Node scope is the shared backbone predicate from
 * `../exercises/backbone-scope.ts` (`backboneNodeConditions()`), the single
 * Drizzle source of truth also consumed by tree-progress (phase 133 Plan 04 —
 * end of the VERBATIM copies). The partition is now `(route × effort)` (the
 * sub-family axis is gone). The same predicate is reused for the READ and for
 * partition-membership validation of every write input (T-128-04).
 *
 * Pairs with Plan 01's locked-partition guard: writing a same-partition manual
 * chain LOCKS that `(route × effort)` partition so a rebuild never clobbers it.
 * On first override of a partition the editor deletes that partition's
 * `source='auto'` edges and writes the manual chain (D-02/D-03).
 */

import { eq, and, inArray, asc } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  acceptInTransaction,
  type AcceptOverrides,
  type ProposalTx,
} from "../admin/proposal-service";
import { AppError } from "../shared/errors";
import {
  backboneNodeConditions,
  VALID_EFFORTS,
} from "../exercises/backbone-scope";
import {
  type Category,
  CATEGORY_ORDER,
  FALLBACK_CATEGORY,
  patternToCategory,
  isMappedPattern,
} from "../tree-progress/category-map";

/**
 * Re-exported from `../exercises/backbone-scope.ts` (its home since phase 133
 * Plan 04) so existing imports keep working.
 */
export { VALID_EFFORTS };
export type Effort = (typeof VALID_EFFORTS)[number];

function isEffort(value: string): value is Effort {
  return (VALID_EFFORTS as readonly string[]).includes(value);
}

/** A minimal logger surface (request.log / app.log compatible). No console.log. */
export interface TreeEditorLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * Typed domain error so routes map it to the right HTTP status via
 * handleServiceError (extends the shared AppError hierarchy — instanceof works).
 */
export class TreeEditorError extends AppError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
  }
}

// ── READ DTO shapes (also the Plan-03 contract) ──────────────────────────────

const EDGE_SOURCES = ["auto", "manual"] as const;
export type EdgeSource = (typeof EDGE_SOURCES)[number];

export interface EditableNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number;
  effort: string;
  /** 'manual' when this node's partition is profe-overridden, else 'auto'. */
  orderSource: EdgeSource;
}

export interface EditablePartition {
  effort: string;
  overridden: boolean;
  nodes: EditableNode[];
}

/** One route group (kept the field shape; the axis is now route, not sub-family). */
export interface EditableRoute {
  /** routes.id (the group key for the UI). */
  id: number;
  /** routes.display_name (or the code as fallback). */
  name: string;
  /** routes.code — also the partition dimension. */
  route: string;
  /**
   * R3 sub-group: the dominant fine `exercises.category` among the route's
   * backbone nodes (variantes never vote — they are off the node set). UPPERCASE
   * straight from the DB (e.g. "PULL VERTICAL"); title-casing is the frontend's
   * job (UI-SPEC C3). Ties resolve to the alphabetically smaller category;
   * "" when no backbone node carries a category.
   */
  subGroup: string;
  partitions: EditablePartition[];
}

export interface EditableCategory {
  key: Category;
  label: Category;
  routes: EditableRoute[];
}

export interface PrecedenceEdge {
  fromExerciseId: number;
  toExerciseId: number;
  source: EdgeSource;
}

export interface EditableTree {
  categories: EditableCategory[];
  precedenceEdges: PrecedenceEdge[];
}

export interface MutationResult {
  ok: true;
  edgesWritten: number;
  edgesDeleted: number;
  /**
   * Set on a reorder of a single-node partition: there is nothing to chain, so
   * no manual edge is written and the partition CANNOT be marked overridden.
   * Returned explicitly (instead of a confusing silent {edgesWritten:0}) so the
   * UI can disable/explain the reorder control for single-node partitions.
   */
  singleNode?: true;
  /** Optional human-readable note accompanying a no-op result (e.g. singleNode). */
  message?: string;
}

// ── Milestone review DTOs (phase 133 Plan 05 — R1-REV, also the Plan-06 contract) ──

export const MILESTONE_ROLES = ["hito", "variante"] as const;
export type MilestoneRole = (typeof MILESTONE_ROLES)[number];

/** One pending hito/variante proposal row for the /tree-map review drawer. */
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
  status: "pending" | "accepted" | "rejected";
  confidence: number | null;
}

/** A variante hanging off a milestone (TRUTH column, not proposals). */
export interface MilestoneVariant {
  id: number;
  name: string;
  dl: number;
}

/**
 * Inline dimension overrides the profe can supply in the SAME pass (locked
 * decision 2). `undefined` = keep the proposed value; `null` = explicit clear
 * (mirrors AcceptOverrides' `!== undefined` semantics).
 */
export interface MilestoneDimensionOverrides {
  step?: number | null;
  habilidad?: string | null;
}

export interface AcceptMilestoneReviewInput {
  exerciseId: number;
  role: MilestoneRole;
  /** Required when role='variante': the hito the exercise hangs off. */
  milestoneExerciseId?: number;
  dimensionOverrides?: MilestoneDimensionOverrides;
}

// ── Internal row shapes ──────────────────────────────────────────────────────

/** A confirmed-canonical backbone graph node joined with its route metadata. */
interface NodeRow {
  exerciseId: number;
  name: string;
  pattern: string;
  /** Fine DB category (UPPERCASE) — votes for the route's subGroup (R3). */
  category: string;
  dificultadLineal: number;
  /**
   * progression_step — NULL for linear/leg routes and for token-strategy rows
   * whose step is still unresolved. Used to order auto (non-overridden)
   * partitions in lock-step with the rebuild's persisted backbone chain (CR-01).
   */
  progressionStep: number | null;
  effort: string;
  routeId: number;
  routeCode: string;
  routeDisplayName: string;
}

/** A persisted edge row (both endpoints). */
interface EdgeRow {
  fromExerciseId: number;
  toExerciseId: number;
  source: EdgeSource;
}

/** Partition key over the `(route × effort)` axis. */
function partitionKey(route: string, effort: string): string {
  return `${route}|${effort}`;
}

export class TreeEditorService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log?: TreeEditorLogger,
  ) {}

  /**
   * Read the rework backbone node set (confirmed canonical exercises on the
   * per-route progression) joined with route metadata. The scope predicate is
   * the shared `backboneNodeConditions()` helper — the same node set
   * tree-progress serves to members (D-06), with no member 'reached' branch.
   */
  private async loadGraphNodes(): Promise<NodeRow[]> {
    const rows = await this.db
      .select({
        exerciseId: schema.exercises.id,
        name: schema.exercises.exercise,
        pattern: schema.exercises.pattern,
        category: schema.exercises.category,
        dificultadLineal: schema.exercises.dificultadLineal,
        progressionStep: schema.exercises.progressionStep,
        effort: schema.exercises.effort,
        routeId: schema.routes.id,
        routeCode: schema.routes.code,
        routeDisplayName: schema.routes.displayName,
      })
      .from(schema.exercises)
      .innerJoin(schema.routes, eq(schema.exercises.route, schema.routes.code))
      .where(and(...backboneNodeConditions()));

    return rows.map((r) => ({
      exerciseId: r.exerciseId,
      name: r.name,
      pattern: r.pattern,
      category: r.category,
      dificultadLineal: r.dificultadLineal,
      progressionStep: r.progressionStep,
      effort: r.effort,
      routeId: r.routeId,
      routeCode: r.routeCode,
      routeDisplayName: r.routeDisplayName ?? r.routeCode,
    }));
  }

  /** Load every persisted edge (both auto and manual), typed. */
  private async loadAllEdges(): Promise<EdgeRow[]> {
    const rows = await this.db
      .select({
        fromExerciseId: schema.exerciseProgressions.fromExerciseId,
        toExerciseId: schema.exerciseProgressions.toExerciseId,
        source: schema.exerciseProgressions.source,
      })
      .from(schema.exerciseProgressions);
    return rows.map((r) => ({
      fromExerciseId: r.fromExerciseId,
      toExerciseId: r.toExerciseId,
      source: r.source as EdgeSource,
    }));
  }

  /**
   * buildEditableTree — category → route → (effort) partition → ordered nodes,
   * every partition tagged auto vs overridden (D-06). When a partition is
   * overridden (owns a same-partition manual chain) the nodes are ordered by that
   * manual chain; otherwise by progression_step then dificultad_lineal then id
   * (the auto order). The cross-partition precedence edges are returned separately
   * so the UI can draw the DAG branches/convergences (D-04).
   */
  async buildEditableTree(): Promise<EditableTree> {
    const [nodes, edges] = await Promise.all([
      this.loadGraphNodes(),
      this.loadAllEdges(),
    ]);

    const nodeById = new Map<number, NodeRow>();
    for (const n of nodes) nodeById.set(n.exerciseId, n);

    // Classify edges: a same-partition manual edge LOCKS its partition (D-02);
    // a cross-partition edge (any source) is a precedence/branch edge (D-04).
    const lockedPartitions = new Set<string>();
    // partitionKey → ordered list of fromExerciseId chain links (manual order).
    const manualChainNext = new Map<string, Map<number, number>>();
    const manualChainHasIncoming = new Map<string, Set<number>>();
    const precedenceEdges: PrecedenceEdge[] = [];

    for (const e of edges) {
      const from = nodeById.get(e.fromExerciseId);
      const to = nodeById.get(e.toExerciseId);
      // Off-graph endpoint → treat as precedence (cannot lock a backbone).
      const samePartition =
        from !== undefined &&
        to !== undefined &&
        from.routeCode === to.routeCode &&
        from.effort === to.effort;

      if (samePartition && e.source === "manual") {
        const key = partitionKey(from.routeCode, from.effort);
        lockedPartitions.add(key);
        let next = manualChainNext.get(key);
        if (!next) {
          next = new Map<number, number>();
          manualChainNext.set(key, next);
        }
        next.set(e.fromExerciseId, e.toExerciseId);
        let incoming = manualChainHasIncoming.get(key);
        if (!incoming) {
          incoming = new Set<number>();
          manualChainHasIncoming.set(key, incoming);
        }
        incoming.add(e.toExerciseId);
      } else if (!samePartition) {
        precedenceEdges.push(e);
      }
      // same-partition auto edges are the backbone — implicit in step ordering.
    }

    // Bucket nodes: category → route → effort partition.
    const warnedPatterns = new Set<string>();
    interface PartitionAcc {
      effort: string;
      nodes: NodeRow[];
    }
    interface RouteAcc {
      id: number;
      name: string;
      route: string;
      partitions: Map<string, PartitionAcc>; // keyed by effort
      /** Fine-category vote count over the route's backbone nodes (R3). */
      categoryVotes: Map<string, number>;
    }
    const byCategory = new Map<Category, Map<number, RouteAcc>>();
    for (const cat of CATEGORY_ORDER) byCategory.set(cat, new Map());

    for (const node of nodes) {
      if (!isMappedPattern(node.pattern) && !warnedPatterns.has(node.pattern)) {
        warnedPatterns.add(node.pattern);
        this.log?.warn(
          { pattern: node.pattern, exerciseId: node.exerciseId },
          "tree-editor: unmapped exercises.pattern routed to fallback category",
        );
      }
      const category = patternToCategory(node.pattern);
      // A node must NEVER silently disappear from the editable tree. If the
      // mapped category is not one of the seeded CATEGORY_ORDER buckets (a
      // future category-map change), route the node into FALLBACK_CATEGORY
      // (guaranteed seeded) and warn so the drift surfaces operationally.
      let routesInCat = byCategory.get(category);
      if (!routesInCat) {
        this.log?.warn(
          { pattern: node.pattern, category, exerciseId: node.exerciseId },
          "tree-editor: mapped category absent from CATEGORY_ORDER — node routed to fallback category",
        );
        routesInCat = byCategory.get(FALLBACK_CATEGORY);
        if (!routesInCat) continue; // unreachable: FALLBACK_CATEGORY is seeded.
      }
      let rt = routesInCat.get(node.routeId);
      if (!rt) {
        rt = {
          id: node.routeId,
          name: node.routeDisplayName,
          route: node.routeCode,
          partitions: new Map(),
          categoryVotes: new Map(),
        };
        routesInCat.set(node.routeId, rt);
      }
      let part = rt.partitions.get(node.effort);
      if (!part) {
        part = { effort: node.effort, nodes: [] };
        rt.partitions.set(node.effort, part);
      }
      part.nodes.push(node);
      // subGroup vote (R3): count the fine category IN MEMORY over the already
      // loaded backbone nodes — no correlated subqueries (Pitfall 3). Variantes
      // never reach this loop (filtered out of the node set by the backbone
      // predicate), so they never vote. Empty categories don't vote.
      if (node.category !== "") {
        rt.categoryVotes.set(
          node.category,
          (rt.categoryVotes.get(node.category) ?? 0) + 1,
        );
      }
    }

    /**
     * Resolve a route's subGroup: the category with the most votes; on a count
     * tie the alphabetically smaller category wins (plain code-point comparison
     * — deterministic, locale-independent). "" when the route has no votes.
     */
    const dominantCategory = (votes: ReadonlyMap<string, number>): string => {
      let winner = "";
      let winnerCount = 0;
      for (const [category, count] of votes) {
        if (
          count > winnerCount ||
          (count === winnerCount && winner !== "" && category < winner)
        ) {
          winner = category;
          winnerCount = count;
        }
      }
      return winner;
    };

    /**
     * Order a partition's nodes: by the manual chain if overridden, else by
     * progression_step then dl/id (the auto backbone order). progression_step is
     * NULL for linear routes (legs), so dl is the effective key there.
     */
    const orderNodes = (
      key: string,
      overridden: boolean,
      partNodes: NodeRow[],
    ): EditableNode[] => {
      const toEditable = (n: NodeRow): EditableNode => ({
        exerciseId: n.exerciseId,
        name: n.name,
        dificultadLineal: n.dificultadLineal,
        effort: n.effort,
        orderSource: overridden ? "manual" : "auto",
      });

      if (!overridden) {
        // Mirror the rebuild's TOTAL order so the canvas/GET /tree chain agrees
        // with the persisted `exercise_progressions` backbone that getNeighbor
        // serves to members (CR-01). A partition can legitimately MIX NULL and
        // int progression_step (token-strategy routes leave unmatched names
        // step=null while accepted siblings get ints), so NULL must be ordered
        // too: treat it as +Infinity (step-less rows sink to the tail), then
        // dl, then id — keeping the comparator transitive. This must stay in
        // lock-step with `stepOf` in rebuild-progression-graph.ts (WR-05).
        const stepOf = (n: NodeRow): number =>
          n.progressionStep === null
            ? Number.POSITIVE_INFINITY
            : n.progressionStep;
        return partNodes
          .slice()
          .sort(
            (a, b) =>
              stepOf(a) - stepOf(b) ||
              a.dificultadLineal - b.dificultadLineal ||
              a.exerciseId - b.exerciseId,
          )
          .map(toEditable);
      }

      // Walk the manual chain from its head (the node with no incoming manual
      // edge inside the partition). Defensive: if the chain is malformed (cycle
      // or fork), fall back to dl/id order for any nodes not reachable.
      const next = manualChainNext.get(key) ?? new Map<number, number>();
      const incoming = manualChainHasIncoming.get(key) ?? new Set<number>();
      const present = new Set(partNodes.map((n) => n.exerciseId));
      const heads = partNodes
        .filter((n) => !incoming.has(n.exerciseId))
        .map((n) => n.exerciseId)
        .sort((a, b) => a - b);
      const ordered: number[] = [];
      const seen = new Set<number>();
      for (const head of heads) {
        let cursor: number | undefined = head;
        while (
          cursor !== undefined &&
          present.has(cursor) &&
          !seen.has(cursor)
        ) {
          seen.add(cursor);
          ordered.push(cursor);
          cursor = next.get(cursor);
        }
      }
      // Append any node not reached by the walk (deterministic dl/id order).
      const leftovers = partNodes
        .filter((n) => !seen.has(n.exerciseId))
        .sort(
          (a, b) =>
            a.dificultadLineal - b.dificultadLineal ||
            a.exerciseId - b.exerciseId,
        )
        .map((n) => n.exerciseId);
      for (const id of leftovers) ordered.push(id);

      const byId = new Map(partNodes.map((n) => [n.exerciseId, n]));
      return ordered
        .map((id) => byId.get(id))
        .filter((n): n is NodeRow => n !== undefined)
        .map(toEditable);
    };

    const categories: EditableCategory[] = CATEGORY_ORDER.map((key) => {
      const routeMap = byCategory.get(key) ?? new Map<number, RouteAcc>();
      const routes: EditableRoute[] = Array.from(routeMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((rt) => {
          const partitions: EditablePartition[] = Array.from(
            rt.partitions.values(),
          )
            .sort((a, b) => a.effort.localeCompare(b.effort))
            .map((part) => {
              const pKey = partitionKey(rt.route, part.effort);
              const overridden = lockedPartitions.has(pKey);
              return {
                effort: part.effort,
                overridden,
                nodes: orderNodes(pKey, overridden, part.nodes),
              };
            });
          return {
            id: rt.id,
            name: rt.name,
            route: rt.route,
            subGroup: dominantCategory(rt.categoryVotes),
            partitions,
          };
        });
      return { key, label: key, routes };
    });

    return { categories, precedenceEdges };
  }

  /**
   * reorderPartition — rewrite a `(route × effort)` partition as a consecutive
   * `source='manual'` chain in the given order (D-03). The id set must EXACTLY
   * match the partition's node set (no extra/missing ids). In ONE transaction:
   * delete that partition's `source='auto'` edges AND any existing same-partition
   * `source='manual'` edges, then insert the new manual chain. Idempotent:
   * re-applying the same order converges (UNIQUE(from,to) dedupes).
   */
  async reorderPartition(
    route: string,
    effort: string,
    orderedExerciseIds: number[],
  ): Promise<MutationResult> {
    if (!isEffort(effort)) {
      throw new TreeEditorError(
        `effort invalido: ${effort} (esperado CON/EXC/ISO)`,
      );
    }

    const nodes = await this.loadGraphNodes();
    const partitionNodes = nodes.filter(
      (n) => n.routeCode === route && n.effort === effort,
    );
    if (partitionNodes.length === 0) {
      throw new TreeEditorError(
        `Particion (ruta ${route} × ${effort}) sin nodos`,
        404,
      );
    }

    const partitionIds = new Set(partitionNodes.map((n) => n.exerciseId));
    const orderedSet = new Set(orderedExerciseIds);
    if (orderedSet.size !== orderedExerciseIds.length) {
      throw new TreeEditorError("orderedExerciseIds contiene ids duplicados");
    }
    if (orderedSet.size !== partitionIds.size) {
      throw new TreeEditorError(
        "orderedExerciseIds no coincide con el conjunto de nodos de la particion",
      );
    }
    for (const id of orderedExerciseIds) {
      if (!partitionIds.has(id)) {
        throw new TreeEditorError(
          `El ejercicio ${id} no pertenece a la particion (ruta ${route} × ${effort})`,
        );
      }
    }

    // A single-node partition has nothing to chain: a manual edge needs two
    // distinct endpoints, so no chain can be written and the partition can
    // NEVER be marked overridden. Return an EXPLICIT no-op result and touch
    // NOTHING — a single-node partition owns no intra-partition edges to delete,
    // so this leaves no half-locked state (WR-04).
    if (partitionNodes.length === 1) {
      return {
        ok: true,
        edgesWritten: 0,
        edgesDeleted: 0,
        singleNode: true,
        message:
          "La particion tiene un solo nodo: no hay nada que reordenar y no puede marcarse como override.",
      };
    }

    const partitionIdList = [...partitionIds];

    let edgesDeleted = 0;
    let edgesWritten = 0;
    await this.db.transaction(async (tx) => {
      // Delete every edge whose BOTH endpoints are in this partition (the auto
      // backbone + any prior manual chain) — scoped, never a bulk wipe (T-128-05).
      const existing = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(
          and(
            inArray(
              schema.exerciseProgressions.fromExerciseId,
              partitionIdList,
            ),
            inArray(schema.exerciseProgressions.toExerciseId, partitionIdList),
          ),
        );
      const idsToDelete = existing.map((e) => e.id);
      if (idsToDelete.length > 0) {
        await tx
          .delete(schema.exerciseProgressions)
          .where(inArray(schema.exerciseProgressions.id, idsToDelete));
        edgesDeleted = idsToDelete.length;
      }

      // Insert the consecutive manual chain in the requested order.
      for (let i = 0; i < orderedExerciseIds.length - 1; i += 1) {
        await tx.insert(schema.exerciseProgressions).values({
          fromExerciseId: orderedExerciseIds[i],
          toExerciseId: orderedExerciseIds[i + 1],
          source: "manual",
        });
        edgesWritten += 1;
      }
    });

    return { ok: true, edgesWritten, edgesDeleted };
  }

  /**
   * setPrecedenceEdge — add or remove a single `source='manual'` cross-edge
   * between two in-graph nodes (D-04). add: reject from===to; both ids must be
   * in-graph nodes; insert manual (idempotent if the (from,to) row already
   * exists, any source — UNIQUE(from,to) backs the dedupe). remove: delete the
   * row WHERE from=? AND to=? AND source='manual' only — NEVER deletes an auto
   * edge.
   */
  async setPrecedenceEdge(
    fromExerciseId: number,
    toExerciseId: number,
    op: "add" | "remove",
  ): Promise<MutationResult> {
    if (fromExerciseId === toExerciseId) {
      throw new TreeEditorError("Una arista no puede ir de un nodo a si mismo");
    }

    const nodes = await this.loadGraphNodes();
    const nodeById = new Map<number, NodeRow>();
    for (const n of nodes) nodeById.set(n.exerciseId, n);
    const fromNode = nodeById.get(fromExerciseId);
    const toNode = nodeById.get(toExerciseId);
    if (!fromNode) {
      throw new TreeEditorError(
        `El ejercicio ${fromExerciseId} no es un nodo del grafo`,
        404,
      );
    }
    if (!toNode) {
      throw new TreeEditorError(
        `El ejercicio ${toExerciseId} no es un nodo del grafo`,
        404,
      );
    }

    if (op === "add") {
      // D-04 boundary: a precedence/cross-edge MUST connect two DIFFERENT
      // (route × effort) partitions. A same-partition manual edge is a
      // reorder/chain concern (D-03), and writing one here would (a) lock the
      // partition's auto backbone in rebuild (readManualEdgePartitions) and
      // (b) coexist with the auto backbone → getNeighbor ambiguity. Reject it
      // so reorderPartition stays the only path that locks a partition.
      if (
        fromNode.routeCode === toNode.routeCode &&
        fromNode.effort === toNode.effort
      ) {
        throw new TreeEditorError(
          "Una arista de precedencia debe cruzar particiones; " +
            "use reordenar para cambiar el orden dentro de una particion",
        );
      }

      const existing = await this.db
        .select({ id: schema.exerciseProgressions.id })
        .from(schema.exerciseProgressions)
        .where(
          and(
            eq(schema.exerciseProgressions.fromExerciseId, fromExerciseId),
            eq(schema.exerciseProgressions.toExerciseId, toExerciseId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        // Idempotent: the edge already exists (any source). Do not duplicate.
        return { ok: true, edgesWritten: 0, edgesDeleted: 0 };
      }
      await this.db.insert(schema.exerciseProgressions).values({
        fromExerciseId,
        toExerciseId,
        source: "manual",
      });
      return { ok: true, edgesWritten: 1, edgesDeleted: 0 };
    }

    // remove: only ever delete a manual edge — leave the auto backbone intact.
    const deleted = await this.db
      .delete(schema.exerciseProgressions)
      .where(
        and(
          eq(schema.exerciseProgressions.fromExerciseId, fromExerciseId),
          eq(schema.exerciseProgressions.toExerciseId, toExerciseId),
          eq(schema.exerciseProgressions.source, "manual"),
        ),
      );
    const affected = readAffectedRows(deleted);
    return { ok: true, edgesWritten: 0, edgesDeleted: affected };
  }

  /**
   * reassignRoute — move misrouted exercises to another route by updating
   * `exercises.route` (data UPDATE, NO migration). In ONE transaction: validate
   * the target route exists + every exercise id exists, UPDATE route, then prune
   * the now-inconsistent edges incident to a moved node.
   *
   * ORPHAN POLICY (bounded + reversible, D-05): only edges INCIDENT to a moved
   * exercise are considered. We delete an incident edge iff, AFTER the move, its
   * two endpoints no longer share the same `(route × effort)` partition — a
   * same-partition backbone link that the move broke. Cross-partition precedence
   * edges that were ALREADY cross-partition before the move are left untouched
   * (intentional DAG branches, D-04). Edges between two non-moved nodes are never
   * touched. The profe re-runs reorder to rebuild a destination backbone.
   */
  async reassignRoute(
    exerciseIds: number[],
    targetRoute: string,
  ): Promise<MutationResult> {
    const uniqueIds = [...new Set(exerciseIds)];
    if (uniqueIds.length === 0) {
      throw new TreeEditorError("exerciseIds vacio");
    }

    // Validate the target route exists in the routes catalog.
    const [targetRow] = await this.db
      .select({ code: schema.routes.code })
      .from(schema.routes)
      .where(eq(schema.routes.code, targetRoute))
      .limit(1);
    if (!targetRow) {
      throw new TreeEditorError(
        `La ruta destino ${targetRoute} no existe`,
        404,
      );
    }

    // Validate every exercise id exists; capture its current partition coords
    // and its milestone link (for the hito/variante invariant check below).
    const exRows = await this.db
      .select({
        id: schema.exercises.id,
        route: schema.exercises.route,
        effort: schema.exercises.effort,
        milestoneExerciseId: schema.exercises.milestoneExerciseId,
      })
      .from(schema.exercises)
      .where(inArray(schema.exercises.id, uniqueIds));
    if (exRows.length !== uniqueIds.length) {
      const found = new Set(exRows.map((r) => r.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new TreeEditorError(
        `Ejercicios inexistentes: ${missing.join(", ")}`,
        404,
      );
    }

    const movedIds = new Set(uniqueIds);

    let edgesDeleted = 0;
    await this.db.transaction(async (tx) => {
      // 0. Guard the "variante same (route × effort) partition as its hito"
      // invariant that acceptMilestoneReview enforces (WR-02). Moving a hito
      // (or a variante) by route alone can strand the other side in a
      // different route, manufacturing cross-route milestone links that no
      // profe authored. Reject with a typed 400 asking the profe to resolve
      // the variantes first, rather than silently corrupting the graph.
      //
      // (a) A moved variante whose hito is NOT also being moved would end up
      //     in a different route than its hito.
      const movedVarianteWithStayingHito = exRows.find(
        (r) =>
          r.milestoneExerciseId !== null &&
          !movedIds.has(r.milestoneExerciseId),
      );
      if (movedVarianteWithStayingHito) {
        throw new TreeEditorError(
          "No se puede mover una variante sin su hito — promové la variante a hito o mové el hito también primero",
        );
      }

      // (b) A moved hito (milestone target) that still has variantes left
      //     behind (not in the moved set) would strand those variantes.
      const movedHitoIds = exRows
        .filter((r) => r.milestoneExerciseId === null)
        .map((r) => r.id);
      if (movedHitoIds.length > 0) {
        const strandedVariants = await tx
          .select({ id: schema.exercises.id })
          .from(schema.exercises)
          .where(inArray(schema.exercises.milestoneExerciseId, movedHitoIds));
        const strandedBehind = strandedVariants.filter(
          (v) => !movedIds.has(v.id),
        );
        if (strandedBehind.length > 0) {
          throw new TreeEditorError(
            "No se puede mover un hito con variantes asignadas que quedan en la ruta original — mové también sus variantes o reasignalas primero",
          );
        }
      }

      // 1. Reassign route for the moved exercises.
      await tx
        .update(schema.exercises)
        .set({ route: targetRoute })
        .where(inArray(schema.exercises.id, uniqueIds));

      // 2. Load every edge incident to a moved node.
      const incident = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(inArray(schema.exerciseProgressions.fromExerciseId, uniqueIds));
      const incidentTo = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(inArray(schema.exerciseProgressions.toExerciseId, uniqueIds));

      const incidentById = new Map<
        number,
        { id: number; fromExerciseId: number; toExerciseId: number }
      >();
      for (const e of [...incident, ...incidentTo]) incidentById.set(e.id, e);
      if (incidentById.size === 0) return;

      // Collect the endpoint ids we need post-move coords for.
      const endpointIds = new Set<number>();
      for (const e of incidentById.values()) {
        endpointIds.add(e.fromExerciseId);
        endpointIds.add(e.toExerciseId);
      }
      const coordRows = await tx
        .select({
          id: schema.exercises.id,
          route: schema.exercises.route,
          effort: schema.exercises.effort,
        })
        .from(schema.exercises)
        .where(inArray(schema.exercises.id, [...endpointIds]));
      const coordById = new Map<number, { route: string; effort: string }>();
      for (const r of coordRows) {
        coordById.set(r.id, { route: r.route, effort: r.effort });
      }

      // 3. Delete an incident edge iff its two endpoints no longer share the
      //    same (route × effort) partition AFTER the move.
      const toDelete: number[] = [];
      for (const e of incidentById.values()) {
        const a = coordById.get(e.fromExerciseId);
        const b = coordById.get(e.toExerciseId);
        if (!a || !b) {
          // An endpoint vanished (shouldn't happen) — prune defensively.
          toDelete.push(e.id);
          continue;
        }
        const samePartition = a.route === b.route && a.effort === b.effort;
        if (!samePartition) {
          toDelete.push(e.id);
        }
      }
      if (toDelete.length > 0) {
        await tx
          .delete(schema.exerciseProgressions)
          .where(inArray(schema.exerciseProgressions.id, toDelete));
        edgesDeleted = toDelete.length;
      }
    });

    return { ok: true, edgesWritten: 0, edgesDeleted };
  }

  // ── Milestone review (phase 133 Plan 05 — R1-REV) ───────────────────────────

  /**
   * acceptMilestoneReview — ONE coach pass = ONE transaction (locked decision
   * 2). This is the ONLY write path of the truth column
   * `exercises.milestone_exercise_id` (the phase-125 boundary: heuristics only
   * ever propose; profes confirm here, under the plugin role guard).
   *
   * Inside a single `db.transaction`:
   *   (a) accept the exercise's PENDING dimension proposal (if one exists) via
   *       the shared `acceptInTransaction`, applying `dimensionOverrides`;
   *   (b) validate the variante target (exists 404 / same (route × effort)
   *       partition 400 / itself a hito 400 / no variantes hanging off the
   *       degraded exercise 400) — validation failures AFTER (a) roll the
   *       whole pass back, which is exactly the all-or-nothing the drawer
   *       relies on;
   *   (c) write the truth: NULL for role='hito', the hito id for 'variante';
   *   (d) role='variante' → bounded prune of the degraded exercise's incident
   *       edges (Pitfall 2 — covers LOCKED partitions the rebuild never
   *       touches), re-chaining prev→next inside the partition;
   *   (e) flip the PENDING milestone proposal to 'accepted' if one exists —
   *       when none exists the pass proceeds anyway (ad-hoc classification
   *       from the side panel).
   */
  async acceptMilestoneReview(
    input: AcceptMilestoneReviewInput,
  ): Promise<MutationResult> {
    const { exerciseId, role } = input;

    let targetId: number | null = null;
    if (role === "variante") {
      if (input.milestoneExerciseId === undefined) {
        throw new TreeEditorError(
          "milestoneExerciseId es requerido cuando role='variante'",
        );
      }
      if (input.milestoneExerciseId === exerciseId) {
        throw new TreeEditorError(
          "Un ejercicio no puede ser variante de si mismo",
        );
      }
      targetId = input.milestoneExerciseId;
    }

    let edgesDeleted = 0;
    let edgesWritten = 0;

    await this.db.transaction(async (tx) => {
      const [exercise] = await tx
        .select({
          id: schema.exercises.id,
          route: schema.exercises.route,
          effort: schema.exercises.effort,
          habilidad: schema.exercises.habilidad,
          milestoneExerciseId: schema.exercises.milestoneExerciseId,
        })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, exerciseId));
      if (!exercise) {
        throw new TreeEditorError(`Ejercicio ${exerciseId} no encontrado`, 404);
      }
      // Backbone membership BEFORE this pass (funnel condition 3): a NULL
      // habilidad means the exercise is on the backbone. We compare against the
      // final habilidad below to detect a NULL → NOT NULL transition that
      // silently pushes the node off-backbone and must prune its edges (WR-01).
      const wasOnBackbone = exercise.habilidad === null;

      // (a) Accept the pending DIMENSION proposal first — same tx, so any
      // later validation failure rolls this back too (all-or-nothing).
      const [dimProposal] = await tx
        .select({ id: schema.exerciseDimensionProposals.id })
        .from(schema.exerciseDimensionProposals)
        .where(
          and(
            eq(schema.exerciseDimensionProposals.exerciseId, exerciseId),
            eq(schema.exerciseDimensionProposals.status, "pending"),
          ),
        )
        .orderBy(asc(schema.exerciseDimensionProposals.id))
        .limit(1);
      if (dimProposal) {
        let overrides: AcceptOverrides | undefined;
        const o = input.dimensionOverrides;
        if (o !== undefined) {
          overrides = {};
          if (o.step !== undefined) overrides.proposedStep = o.step;
          if (o.habilidad !== undefined) {
            overrides.proposedHabilidad = o.habilidad;
          }
        }
        await acceptInTransaction(tx, dimProposal.id, overrides);
      }

      // (b) Variante target validations (T-133-41: typed 400/404, never 500).
      if (role === "variante" && targetId !== null) {
        const [target] = await tx
          .select({
            id: schema.exercises.id,
            route: schema.exercises.route,
            effort: schema.exercises.effort,
            milestoneExerciseId: schema.exercises.milestoneExerciseId,
          })
          .from(schema.exercises)
          .where(eq(schema.exercises.id, targetId));
        if (!target) {
          throw new TreeEditorError(`El hito ${targetId} no existe`, 404);
        }
        if (
          target.route !== exercise.route ||
          target.effort !== exercise.effort
        ) {
          throw new TreeEditorError(
            "El hito debe pertenecer a la misma particion (ruta × esfuerzo) que el ejercicio",
          );
        }
        if (target.milestoneExerciseId !== null) {
          throw new TreeEditorError(
            "El hito destino es a su vez una variante — elegi un hito del backbone",
          );
        }
        const [hanging] = await tx
          .select({ id: schema.exercises.id })
          .from(schema.exercises)
          .where(eq(schema.exercises.milestoneExerciseId, exerciseId))
          .limit(1);
        if (hanging) {
          throw new TreeEditorError(
            "El ejercicio tiene variantes asignadas — promové otra variante a hito primero",
          );
        }
      }

      // (b2) Re-promotion guard (WR-03): accepting role='hito' on an exercise
      // that is ALREADY a truth-variante would set milestone_exercise_id back
      // to NULL and re-enter the backbone with ZERO edges — its neighbors were
      // re-chained around it at degrade time and this path never undoes that.
      // In a LOCKED partition the rebuild never repairs it, so the node floats
      // disconnected forever (getNeighbor → null both ways). The intended
      // inverse is promoteToMilestone, which re-points edges. Reject and steer
      // the profe there instead of silently corrupting the chain.
      if (role === "hito" && exercise.milestoneExerciseId !== null) {
        throw new TreeEditorError(
          "El ejercicio ya es una variante — usá 'promover a hito' para reintegrarlo al backbone con sus aristas",
        );
      }

      // (c) Truth write — the ONLY place milestone_exercise_id is set.
      await tx
        .update(schema.exercises)
        .set({ milestoneExerciseId: targetId })
        .where(eq(schema.exercises.id, exerciseId));

      // (d) Bounded prune of the degraded exercise's incident edges.
      if (role === "variante") {
        const pruned = await this.pruneDegradedVariantEdges(tx, exercise);
        edgesDeleted = pruned.deleted;
        edgesWritten = pruned.written;
      } else {
        // role='hito': the truth write above keeps the exercise on the
        // backbone via condition 4, BUT step (a)'s dimension accept (proposal
        // value or override) can set `habilidad` to a non-null value, which
        // removes the node via funnel condition 3 (habilidad IS NULL). When
        // that NULL → NOT NULL transition happens the node leaves the backbone
        // yet keeps every incident edge — getNeighbor would keep serving it and
        // buildEditableTree would render phantom precedence edges (WR-01). Prune
        // those edges with the SAME bounded re-chain used for variantes.
        const [afterRow] = await tx
          .select({ habilidad: schema.exercises.habilidad })
          .from(schema.exercises)
          .where(eq(schema.exercises.id, exerciseId));
        const nowOffBackbone =
          afterRow !== undefined && afterRow.habilidad !== null;
        if (wasOnBackbone && nowOffBackbone) {
          const pruned = await this.pruneDegradedVariantEdges(tx, exercise);
          edgesDeleted = pruned.deleted;
          edgesWritten = pruned.written;
        }
      }

      // (e) Flip the pending milestone proposal — if none exists, proceed
      // (ad-hoc classification from the panel).
      await tx
        .update(schema.exerciseMilestoneProposals)
        .set({ status: "accepted" })
        .where(
          and(
            eq(schema.exerciseMilestoneProposals.exerciseId, exerciseId),
            eq(schema.exerciseMilestoneProposals.status, "pending"),
          ),
        );
    });

    return { ok: true, edgesWritten, edgesDeleted };
  }

  /**
   * listMilestoneReview — the pending hito/variante proposals of a route, for
   * the /tree-map review drawer (R1-REV). A flat join proposals × exercises
   * (no correlated subqueries — Pitfall 3); the visual grouping by
   * (movementToken, stepRank) is the frontend's job. Only `pending` rows are
   * served: accepted/rejected proposals are done reviewing.
   */
  async listMilestoneReview(route: string): Promise<MilestoneReviewRow[]> {
    const rows = await this.db
      .select({
        exerciseId: schema.exerciseMilestoneProposals.exerciseId,
        name: schema.exercises.exercise,
        dl: schema.exercises.dificultadLineal,
        effort: schema.exercises.effort,
        movementToken: schema.exerciseMilestoneProposals.movementToken,
        stepRank: schema.exerciseMilestoneProposals.stepRank,
        proposedMilestoneExerciseId:
          schema.exerciseMilestoneProposals.proposedMilestoneExerciseId,
        status: schema.exerciseMilestoneProposals.status,
        confidence: schema.exerciseMilestoneProposals.confidence,
      })
      .from(schema.exerciseMilestoneProposals)
      .innerJoin(
        schema.exercises,
        eq(schema.exerciseMilestoneProposals.exerciseId, schema.exercises.id),
      )
      .where(
        and(
          eq(schema.exercises.route, route),
          eq(schema.exerciseMilestoneProposals.status, "pending"),
        ),
      )
      .orderBy(
        asc(schema.exercises.dificultadLineal),
        asc(schema.exerciseMilestoneProposals.exerciseId),
      );
    return rows;
  }

  /**
   * getVariants — the exercises hanging off a milestone via the TRUTH column
   * (`exercises.milestone_exercise_id`), for the side panel. Proposals never
   * show here: only what a profe already accepted. Unknown/variant-less hito →
   * empty array (the panel mirrors it).
   */
  async getVariants(exerciseId: number): Promise<MilestoneVariant[]> {
    return this.db
      .select({
        id: schema.exercises.id,
        name: schema.exercises.exercise,
        dl: schema.exercises.dificultadLineal,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.milestoneExerciseId, exerciseId))
      .orderBy(
        asc(schema.exercises.dificultadLineal),
        asc(schema.exercises.id),
      );
  }

  /**
   * promoteToMilestone — swap a variante with its hito, transactionally:
   *
   *   (1) free the NEW hito first (milestone → NULL) so the "a variante points
   *       at a hito" invariant never breaks mid-flight;
   *   (2) the ex-hito becomes a variante of the new one;
   *   (3) every OTHER variante of the ex-hito re-points to the new hito;
   *   (4) incident edges of the ex-hito re-point to the new hito — an edge
   *       that would become a self-edge (it connected the pair) is deleted,
   *       and a re-point that would collide with an existing UNIQUE(from,to)
   *       row deletes the old edge instead of updating.
   *
   * Leaves zero dangling references: after the swap no exercise's
   * milestone_exercise_id can point at a variante.
   */
  async promoteToMilestone(exerciseId: number): Promise<MutationResult> {
    let edgesDeleted = 0;
    let edgesWritten = 0;

    await this.db.transaction(async (tx) => {
      const [exercise] = await tx
        .select({
          id: schema.exercises.id,
          route: schema.exercises.route,
          effort: schema.exercises.effort,
          milestoneExerciseId: schema.exercises.milestoneExerciseId,
        })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, exerciseId));
      if (!exercise) {
        throw new TreeEditorError(`Ejercicio ${exerciseId} no encontrado`, 404);
      }
      if (exercise.milestoneExerciseId === null) {
        throw new TreeEditorError(
          "El ejercicio no es una variante — solo una variante puede promoverse a hito",
        );
      }
      const oldHito = exercise.milestoneExerciseId;

      // Guard the same-partition invariant before swapping (WR-02). If a prior
      // route move stranded this variante in a different (route × effort)
      // partition than its hito, re-pointing the ex-hito's incident edges to
      // the promoted exercise would manufacture cross-route precedence edges
      // the R4 UI renders as bogus "prerequisitos". Reject and ask the profe
      // to fix the routing first.
      const [oldHitoRow] = await tx
        .select({
          route: schema.exercises.route,
          effort: schema.exercises.effort,
        })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, oldHito));
      if (
        oldHitoRow !== undefined &&
        (oldHitoRow.route !== exercise.route ||
          oldHitoRow.effort !== exercise.effort)
      ) {
        throw new TreeEditorError(
          "La variante y su hito están en particiones (ruta × esfuerzo) distintas — reasigná la ruta primero",
        );
      }

      // (1) The promoted exercise becomes the hito (frees the target of the
      // re-points below before anything points at it).
      await tx
        .update(schema.exercises)
        .set({ milestoneExerciseId: null })
        .where(eq(schema.exercises.id, exerciseId));

      // (2) The ex-hito hangs off the new hito.
      await tx
        .update(schema.exercises)
        .set({ milestoneExerciseId: exerciseId })
        .where(eq(schema.exercises.id, oldHito));

      // (3) Every other variante of the ex-hito re-points to the new hito
      // (the ex-hito itself no longer matches: its milestone is exerciseId).
      await tx
        .update(schema.exercises)
        .set({ milestoneExerciseId: exerciseId })
        .where(eq(schema.exercises.milestoneExerciseId, oldHito));

      // (4) Re-point the ex-hito's incident edges to the new hito.
      const outgoing = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(eq(schema.exerciseProgressions.fromExerciseId, oldHito));
      const incoming = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(eq(schema.exerciseProgressions.toExerciseId, oldHito));
      const incidentById = new Map<
        number,
        { id: number; fromExerciseId: number; toExerciseId: number }
      >();
      for (const e of [...outgoing, ...incoming]) incidentById.set(e.id, e);

      for (const e of incidentById.values()) {
        const newFrom =
          e.fromExerciseId === oldHito ? exerciseId : e.fromExerciseId;
        const newTo = e.toExerciseId === oldHito ? exerciseId : e.toExerciseId;

        // An edge between the pair would become a self-edge — delete it.
        if (newFrom === newTo) {
          await tx
            .delete(schema.exerciseProgressions)
            .where(eq(schema.exerciseProgressions.id, e.id));
          edgesDeleted += 1;
          continue;
        }

        // UNIQUE(from,to): when the re-pointed row already exists, drop the
        // old edge instead of updating into a duplicate.
        const [existing] = await tx
          .select({ id: schema.exerciseProgressions.id })
          .from(schema.exerciseProgressions)
          .where(
            and(
              eq(schema.exerciseProgressions.fromExerciseId, newFrom),
              eq(schema.exerciseProgressions.toExerciseId, newTo),
            ),
          )
          .limit(1);
        if (existing && existing.id !== e.id) {
          await tx
            .delete(schema.exerciseProgressions)
            .where(eq(schema.exerciseProgressions.id, e.id));
          edgesDeleted += 1;
          continue;
        }

        await tx
          .update(schema.exerciseProgressions)
          .set({ fromExerciseId: newFrom, toExerciseId: newTo })
          .where(eq(schema.exerciseProgressions.id, e.id));
        edgesWritten += 1;
      }
    });

    return { ok: true, edgesWritten, edgesDeleted };
  }

  /**
   * rejectMilestoneReview — status-only flip of the PENDING milestone proposal
   * to 'rejected'. NEVER touches `exercises` (any column). 404 when the
   * exercise has no pending proposal.
   */
  async rejectMilestoneReview(exerciseId: number): Promise<MutationResult> {
    const result = await this.db
      .update(schema.exerciseMilestoneProposals)
      .set({ status: "rejected" })
      .where(
        and(
          eq(schema.exerciseMilestoneProposals.exerciseId, exerciseId),
          eq(schema.exerciseMilestoneProposals.status, "pending"),
        ),
      );
    if (readAffectedRows(result) === 0) {
      throw new TreeEditorError(
        `No hay propuesta de hito pendiente para el ejercicio ${exerciseId}`,
        404,
      );
    }
    return { ok: true, edgesWritten: 0, edgesDeleted: 0 };
  }

  /**
   * Bounded orphan policy when an exercise is degraded to variante (Pattern 3
   * / Pitfall 2 — works for LOCKED partitions too, where the rebuild never
   * enters). Mirrors reassignRoute's incident-edge handling, INSIDE the
   * caller's transaction:
   *
   *   - Load every edge incident to the degraded exercise (from + to).
   *   - Delete them ALL by id (`inArray` — bounded, never a bulk wipe,
   *     T-128-05). A variante must keep ZERO incident edges so getNeighbor can
   *     never serve it again.
   *   - If the exercise sat in the MIDDLE of a same-partition chain (had at
   *     least one same-partition predecessor AND successor), re-chain
   *     prev→next (skipping rows that already exist — UNIQUE(from,to)). The
   *     new edge is 'manual' when ANY pruned same-partition edge was manual
   *     (preserves the partition lock), else 'auto'.
   *   - Cross-partition incident edges are deleted WITHOUT re-chaining
   *     (precedence branches are never invented across partitions).
   */
  private async pruneDegradedVariantEdges(
    tx: ProposalTx,
    exercise: { id: number; route: string; effort: string },
  ): Promise<{ deleted: number; written: number }> {
    const outgoing = await tx
      .select({
        id: schema.exerciseProgressions.id,
        fromExerciseId: schema.exerciseProgressions.fromExerciseId,
        toExerciseId: schema.exerciseProgressions.toExerciseId,
        source: schema.exerciseProgressions.source,
      })
      .from(schema.exerciseProgressions)
      .where(eq(schema.exerciseProgressions.fromExerciseId, exercise.id));
    const incoming = await tx
      .select({
        id: schema.exerciseProgressions.id,
        fromExerciseId: schema.exerciseProgressions.fromExerciseId,
        toExerciseId: schema.exerciseProgressions.toExerciseId,
        source: schema.exerciseProgressions.source,
      })
      .from(schema.exerciseProgressions)
      .where(eq(schema.exerciseProgressions.toExerciseId, exercise.id));

    const incidentById = new Map<
      number,
      {
        id: number;
        fromExerciseId: number;
        toExerciseId: number;
        source: string;
      }
    >();
    for (const e of [...outgoing, ...incoming]) incidentById.set(e.id, e);
    if (incidentById.size === 0) return { deleted: 0, written: 0 };

    // Coords of every OTHER endpoint, to classify same- vs cross-partition.
    const otherIds = new Set<number>();
    for (const e of incidentById.values()) {
      otherIds.add(
        e.fromExerciseId === exercise.id ? e.toExerciseId : e.fromExerciseId,
      );
    }
    const coordRows = await tx
      .select({
        id: schema.exercises.id,
        route: schema.exercises.route,
        effort: schema.exercises.effort,
      })
      .from(schema.exercises)
      .where(inArray(schema.exercises.id, [...otherIds]));
    const coordById = new Map<number, { route: string; effort: string }>();
    for (const r of coordRows) {
      coordById.set(r.id, { route: r.route, effort: r.effort });
    }

    // Same-partition predecessors/successors of the degraded exercise.
    const prevs: { otherId: number; source: string }[] = [];
    const nexts: { otherId: number; source: string }[] = [];
    for (const e of incidentById.values()) {
      const otherId =
        e.fromExerciseId === exercise.id ? e.toExerciseId : e.fromExerciseId;
      const coords = coordById.get(otherId);
      const samePartition =
        coords !== undefined &&
        coords.route === exercise.route &&
        coords.effort === exercise.effort;
      if (!samePartition) continue;
      if (e.toExerciseId === exercise.id) {
        prevs.push({ otherId, source: e.source });
      } else {
        nexts.push({ otherId, source: e.source });
      }
    }

    // Delete every incident edge by id — bounded, never a bulk wipe.
    const idsToDelete = [...incidentById.keys()];
    await tx
      .delete(schema.exerciseProgressions)
      .where(inArray(schema.exerciseProgressions.id, idsToDelete));
    const deleted = idsToDelete.length;
    let written = 0;

    // Re-chain prev→next when the exercise sat in the MIDDLE of a chain.
    if (prevs.length > 0 && nexts.length > 0) {
      const anyManual = [...prevs, ...nexts].some((e) => e.source === "manual");
      const newSource: EdgeSource = anyManual ? "manual" : "auto";
      for (const prev of prevs) {
        for (const next of nexts) {
          if (prev.otherId === next.otherId) continue; // never a self-edge
          const [existing] = await tx
            .select({ id: schema.exerciseProgressions.id })
            .from(schema.exerciseProgressions)
            .where(
              and(
                eq(schema.exerciseProgressions.fromExerciseId, prev.otherId),
                eq(schema.exerciseProgressions.toExerciseId, next.otherId),
              ),
            )
            .limit(1);
          if (existing) continue; // UNIQUE(from,to) — already chained
          await tx.insert(schema.exerciseProgressions).values({
            fromExerciseId: prev.otherId,
            toExerciseId: next.otherId,
            source: newSource,
          });
          written += 1;
        }
      }
    }

    return { deleted, written };
  }
}

/**
 * Read the affected-row count from a Drizzle mysql2 delete/update result without
 * `any`. The mysql2 driver returns a ResultSetHeader with `affectedRows`; the
 * Drizzle wrapper surfaces it as the first element of a tuple. Defensive: any
 * shape we don't recognize yields 0 (never throws).
 */
function readAffectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const header = result[0];
    if (
      typeof header === "object" &&
      header !== null &&
      "affectedRows" in header
    ) {
      const n = Number((header as { affectedRows: unknown }).affectedRows);
      return Number.isFinite(n) ? n : 0;
    }
  }
  if (
    typeof result === "object" &&
    result !== null &&
    "affectedRows" in result
  ) {
    const n = Number((result as { affectedRows: unknown }).affectedRows);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
