/**
 * tree-editor / service — Phase 128 Plan 02 (TREE-07).
 *
 * The admin/coach-scoped persistence layer that lets profes refine the
 * auto-built skill tree (D-06). All overrides persist in the EXISTING
 * `exercise_progressions` table as `source='manual'` (D-01) — no new table, no
 * new column, no migration. Regroup is a data UPDATE of `exercises.subfamily_id`
 * (D-05), also no migration.
 *
 * Node scope is the EXACT phase-126/127 DAG scope (copied verbatim from
 * tree-progress/service.ts): a node is a confirmed canonical exercise
 *   canonical_exercise_id IS NULL AND effort IN ('CON','EXC','ISO')
 * with a non-null subfamily_id (enforced by the inner join). The same predicate
 * is reused for the READ and for FK/partition-membership validation of every
 * write input (T-128-04).
 *
 * Pairs with Plan 01's locked-partition guard: writing a same-partition manual
 * chain LOCKS that `(subfamily × effort)` partition so a rebuild never clobbers
 * it. On first override of a partition the editor deletes that partition's
 * `source='auto'` edges and writes the manual chain (D-02/D-03).
 */

import { eq, and, isNull, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  type Category,
  CATEGORY_ORDER,
  FALLBACK_CATEGORY,
  patternToCategory,
  isMappedPattern,
} from "../tree-progress/category-map";

/** The three real contraction-axis effort values that form a partition (D-04). */
const VALID_EFFORTS = ["CON", "EXC", "ISO"] as const;
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

export interface EditableSubfamily {
  id: number;
  name: string;
  route: string;
  partitions: EditablePartition[];
}

export interface EditableCategory {
  key: Category;
  label: Category;
  subfamilies: EditableSubfamily[];
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
}

// ── Internal row shapes ──────────────────────────────────────────────────────

/** A confirmed-canonical graph node joined with its subfamily metadata. */
interface NodeRow {
  exerciseId: number;
  name: string;
  pattern: string;
  dificultadLineal: number;
  effort: string;
  subfamilyId: number;
  subfamilyName: string;
  subfamilyRoute: string;
  subfamilySortOrder: number;
}

/** A persisted edge row (both endpoints). */
interface EdgeRow {
  fromExerciseId: number;
  toExerciseId: number;
  source: EdgeSource;
}

function partitionKey(subfamilyId: number, effort: string): string {
  return `${subfamilyId}|${effort}`;
}

export class TreeEditorService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log?: TreeEditorLogger,
  ) {}

  /**
   * Read the phase-126 DAG node set (confirmed canonical exercises) joined with
   * subfamily metadata. Mirrors tree-progress/service.ts loadGraphNodes EXACTLY
   * (D-06): same scope predicate, no member 'reached' branch.
   */
  private async loadGraphNodes(): Promise<NodeRow[]> {
    const rows = await this.db
      .select({
        exerciseId: schema.exercises.id,
        name: schema.exercises.exercise,
        pattern: schema.exercises.pattern,
        dificultadLineal: schema.exercises.dificultadLineal,
        effort: schema.exercises.effort,
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
          isNull(schema.exercises.canonicalExerciseId),
          inArray(schema.exercises.effort, [...VALID_EFFORTS]),
        ),
      );

    // The inner join already enforces subfamily_id IS NOT NULL; narrow the type.
    return rows
      .filter((r): r is NodeRow => r.subfamilyId !== null)
      .map((r) => ({
        exerciseId: r.exerciseId,
        name: r.name,
        pattern: r.pattern,
        dificultadLineal: r.dificultadLineal,
        effort: r.effort,
        subfamilyId: r.subfamilyId,
        subfamilyName: r.subfamilyName,
        subfamilyRoute: r.subfamilyRoute,
        subfamilySortOrder: r.subfamilySortOrder,
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
   * buildEditableTree — category → subfamily → (effort) partition → ordered
   * nodes, every partition tagged auto vs overridden (D-06). When a partition is
   * overridden (owns a same-partition manual chain) the nodes are ordered by that
   * manual chain; otherwise by dificultad_lineal then id (the auto order). The
   * cross-partition precedence edges are returned separately so the UI can draw
   * the DAG branches/convergences (D-04).
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
        from.subfamilyId === to.subfamilyId &&
        from.effort === to.effort;

      if (samePartition && e.source === "manual") {
        const key = partitionKey(from.subfamilyId, from.effort);
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
      // same-partition auto edges are the backbone — implicit in dl ordering.
    }

    // Bucket nodes: category → subfamily → effort partition.
    const warnedPatterns = new Set<string>();
    interface PartitionAcc {
      effort: string;
      nodes: NodeRow[];
    }
    interface SubfamilyAcc {
      id: number;
      name: string;
      route: string;
      sortOrder: number;
      partitions: Map<string, PartitionAcc>; // keyed by effort
    }
    const byCategory = new Map<Category, Map<number, SubfamilyAcc>>();
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
      // (guaranteed seeded — it is a member of CATEGORY_ORDER) and warn so the
      // drift surfaces operationally instead of hiding the node from the profe.
      let subfamilies = byCategory.get(category);
      if (!subfamilies) {
        this.log?.warn(
          { pattern: node.pattern, category, exerciseId: node.exerciseId },
          "tree-editor: mapped category absent from CATEGORY_ORDER — node routed to fallback category",
        );
        subfamilies = byCategory.get(FALLBACK_CATEGORY);
        if (!subfamilies) continue; // unreachable: FALLBACK_CATEGORY is seeded.
      }
      let sf = subfamilies.get(node.subfamilyId);
      if (!sf) {
        sf = {
          id: node.subfamilyId,
          name: node.subfamilyName,
          route: node.subfamilyRoute,
          sortOrder: node.subfamilySortOrder,
          partitions: new Map(),
        };
        subfamilies.set(node.subfamilyId, sf);
      }
      let part = sf.partitions.get(node.effort);
      if (!part) {
        part = { effort: node.effort, nodes: [] };
        sf.partitions.set(node.effort, part);
      }
      part.nodes.push(node);
    }

    /** Order a partition's nodes: by the manual chain if overridden, else dl/id. */
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
        return partNodes
          .slice()
          .sort(
            (a, b) =>
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
      const subfamilyMap =
        byCategory.get(key) ?? new Map<number, SubfamilyAcc>();
      const subfamilies: EditableSubfamily[] = Array.from(subfamilyMap.values())
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((sf) => {
          const partitions: EditablePartition[] = Array.from(
            sf.partitions.values(),
          )
            .sort((a, b) => a.effort.localeCompare(b.effort))
            .map((part) => {
              const pKey = partitionKey(sf.id, part.effort);
              const overridden = lockedPartitions.has(pKey);
              return {
                effort: part.effort,
                overridden,
                nodes: orderNodes(pKey, overridden, part.nodes),
              };
            });
          return {
            id: sf.id,
            name: sf.name,
            route: sf.route,
            partitions,
          };
        });
      return { key, label: key, subfamilies };
    });

    return { categories, precedenceEdges };
  }

  /**
   * reorderPartition — rewrite a `(subfamilyId × effort)` partition as a
   * consecutive `source='manual'` chain in the given order (D-03). The id set
   * must EXACTLY match the partition's node set (no extra/missing ids). In ONE
   * transaction: delete that partition's `source='auto'` edges AND any existing
   * same-partition `source='manual'` edges, then insert the new manual chain.
   * Idempotent: re-applying the same order converges (UNIQUE(from,to) dedupes).
   */
  async reorderPartition(
    subfamilyId: number,
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
      (n) => n.subfamilyId === subfamilyId && n.effort === effort,
    );
    if (partitionNodes.length === 0) {
      throw new TreeEditorError(
        `Particion (subfamily ${subfamilyId} × ${effort}) sin nodos`,
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
          `El ejercicio ${id} no pertenece a la particion (subfamily ${subfamilyId} × ${effort})`,
        );
      }
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
      // (subfamily × effort) partitions. A same-partition manual edge is a
      // reorder/chain concern (D-03), and writing one here would (a) lock the
      // partition's auto backbone in rebuild (readManualEdgePartitions) and
      // (b) coexist with the auto backbone → getNeighbor ambiguity. Reject it
      // so reorderPartition stays the only path that locks a partition.
      if (
        fromNode.subfamilyId === toNode.subfamilyId &&
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
   * reassignSubfamily — group/split subfamilies by reassigning
   * `exercises.subfamily_id` (D-05, data UPDATE, NO migration). In ONE
   * transaction: validate the target subfamily + every exercise id exists, UPDATE
   * subfamily_id, then prune the now-inconsistent edges incident to a moved node.
   *
   * ORPHAN POLICY (bounded + reversible, D-05): only edges INCIDENT to a moved
   * exercise are considered. We delete an incident edge iff, AFTER the move, its
   * two endpoints no longer share the same `(subfamily_id × effort)` partition —
   * a same-partition backbone link that the move broke. Cross-partition
   * precedence edges that were ALREADY cross-partition before the move are left
   * untouched (they are intentional DAG branches, D-04). Edges between two
   * non-moved nodes are never touched. This keeps the cleanup scoped to exactly
   * the partitions the move disturbed; the profe re-runs reorder to rebuild a
   * destination backbone (no auto regeneration is forced here).
   */
  async reassignSubfamily(
    exerciseIds: number[],
    targetSubfamilyId: number,
  ): Promise<MutationResult> {
    const uniqueIds = [...new Set(exerciseIds)];
    if (uniqueIds.length === 0) {
      throw new TreeEditorError("exerciseIds vacio");
    }

    // Validate the target subfamily exists.
    const [targetSf] = await this.db
      .select({ id: schema.exerciseSubfamilies.id })
      .from(schema.exerciseSubfamilies)
      .where(eq(schema.exerciseSubfamilies.id, targetSubfamilyId))
      .limit(1);
    if (!targetSf) {
      throw new TreeEditorError(
        `La sub-familia destino ${targetSubfamilyId} no existe`,
        404,
      );
    }

    // Validate every exercise id exists; capture its current partition coords.
    const exRows = await this.db
      .select({
        id: schema.exercises.id,
        subfamilyId: schema.exercises.subfamilyId,
        effort: schema.exercises.effort,
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

    let edgesDeleted = 0;
    await this.db.transaction(async (tx) => {
      // 1. Reassign subfamily_id for the moved exercises.
      await tx
        .update(schema.exercises)
        .set({ subfamilyId: targetSubfamilyId })
        .where(inArray(schema.exercises.id, uniqueIds));

      // 2. Load every edge incident to a moved node, with BOTH endpoints'
      //    POST-move (subfamily_id, effort) coords (the update above is visible
      //    inside the tx).
      const incident = await tx
        .select({
          id: schema.exerciseProgressions.id,
          fromExerciseId: schema.exerciseProgressions.fromExerciseId,
          toExerciseId: schema.exerciseProgressions.toExerciseId,
        })
        .from(schema.exerciseProgressions)
        .where(
          // incident = from OR to is a moved node
          inArray(schema.exerciseProgressions.fromExerciseId, uniqueIds),
        );
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
          subfamilyId: schema.exercises.subfamilyId,
          effort: schema.exercises.effort,
        })
        .from(schema.exercises)
        .where(inArray(schema.exercises.id, [...endpointIds]));
      const coordById = new Map<
        number,
        { subfamilyId: number | null; effort: string }
      >();
      for (const r of coordRows) {
        coordById.set(r.id, { subfamilyId: r.subfamilyId, effort: r.effort });
      }

      // 3. Delete an incident edge iff its two endpoints no longer share the
      //    same (subfamily_id × effort) partition AFTER the move.
      const toDelete: number[] = [];
      for (const e of incidentById.values()) {
        const a = coordById.get(e.fromExerciseId);
        const b = coordById.get(e.toExerciseId);
        if (!a || !b) {
          // An endpoint vanished (shouldn't happen) — prune defensively.
          toDelete.push(e.id);
          continue;
        }
        const samePartition =
          a.subfamilyId !== null &&
          b.subfamilyId !== null &&
          a.subfamilyId === b.subfamilyId &&
          a.effort === b.effort;
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
