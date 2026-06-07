/**
 * ProposalService — profe review of the heuristic dimension proposals (TREE-03).
 *
 * Phase 125 Plan 02. Consumes `exercise_dimension_proposals` (the reviewable
 * pending rows the bootstrap of Plan 01 inserted) and lets a profe accept /
 * correct / reject each one before it becomes truth on `exercises`.
 *
 * Boundary (D-02):
 *   - `accept` is the ONLY write that touches the truth columns. It runs inside a
 *     `db.transaction` so the `exercises` update and the proposal status flip
 *     commit atomically (no half-applied truth). It sets `exercises.progression_step`
 *     + `habilidad`, and — for a `route_pending` row (or when an override supplies
 *     a route) — sets `exercises.route` and clears `route_pending`.
 *   - `reject` writes ONLY the proposal status; it never touches `exercises`.
 *   - NEVER writes the contraction column (D-03 — contraction is trusted as-is)
 *     and NEVER deletes an `exercises` row (historical FKs from
 *     session_prescriptions / program_content_blocks).
 *
 * Instance methods (constructed with `db`) because accept spans multiple tables
 * in a transaction.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface ListProposalsFilters {
  route?: string;
  status?: ProposalStatus;
}

export interface ProposalListItem {
  id: number;
  exerciseId: number;
  exerciseName: string;
  currentRoute: string;
  routePending: boolean;
  proposedStep: number | null;
  proposedHabilidad: string | null;
  proposedRoute: string | null;
  status: ProposalStatus;
  engine: string | null;
  confidence: number | null;
}

export interface ListProposalsResult {
  proposals: ProposalListItem[];
  total: number;
}

/** Inline-edit overrides a profe can supply when accepting (D-07). */
export interface AcceptOverrides {
  /** Step rank; null to mark the exercise off-backbone (linear/unknown). */
  proposedStep?: number | null;
  /** Habilidad variant; null to put the exercise on the backbone. */
  proposedHabilidad?: string | null;
  proposedRoute?: string;
}

/**
 * The Drizzle transaction handle `accept()` runs inside. Derived from the
 * `db.transaction` callback signature so it stays in lockstep with the driver
 * types — shareable by services that embed the dimension accept inside their
 * OWN transaction (phase 133 Plan 05: the tree-editor milestone accept).
 */
export type ProposalTx = Parameters<
  Parameters<MySql2Database<typeof schema>["transaction"]>[0]
>[0];

/**
 * The transactional body of `ProposalService.accept` (D-02), extracted in
 * phase 133 Plan 05 so the tree-editor's ONE-pass milestone accept can run the
 * dimension accept inside ITS transaction (locked decision 2: dimension +
 * hito/variante commit atomically in a single coach pass). Behavior is
 * byte-identical to the pre-extraction accept: writes the phase-124 truth
 * columns + flips the proposal status, NEVER touches the contraction column,
 * NEVER deletes a row. Throws if the proposal or its exercise is missing.
 */
export async function acceptInTransaction(
  tx: ProposalTx,
  id: number,
  overrides?: AcceptOverrides,
): Promise<boolean> {
  const [proposal] = await tx
    .select()
    .from(schema.exerciseDimensionProposals)
    .where(eq(schema.exerciseDimensionProposals.id, id));

  if (!proposal) {
    throw new Error(`Propuesta ${id} no encontrada`);
  }

  const [exercise] = await tx
    .select({
      id: schema.exercises.id,
      route: schema.exercises.route,
      routePending: schema.exercises.routePending,
    })
    .from(schema.exercises)
    .where(eq(schema.exercises.id, proposal.exerciseId));

  if (!exercise) {
    throw new Error(`Ejercicio ${proposal.exerciseId} no encontrado`);
  }

  // Resolve final values from overrides (D-07 inline edit) falling back to
  // the proposed fields. `!== undefined` so a profe can explicitly clear a
  // value (step → null = off-backbone, habilidad → null = on the backbone).
  const finalStep =
    overrides?.proposedStep !== undefined
      ? overrides.proposedStep
      : (proposal.proposedStep ?? null);
  const finalHabilidad =
    overrides?.proposedHabilidad !== undefined
      ? overrides.proposedHabilidad
      : (proposal.proposedHabilidad ?? null);
  const overrideRoute = overrides?.proposedRoute;
  const proposedRoute = proposal.proposedRoute ?? null;

  // Only set the route for a route_pending exercise (D-03: never overwrite
  // an existing route) OR when a profe explicitly overrides it.
  const shouldWriteRoute =
    overrideRoute !== undefined ||
    (exercise.routePending && proposedRoute !== null);
  const finalRoute = overrideRoute ?? proposedRoute;

  // Build the exercises truth-column update: the progression step + Habilidad
  // are the core of the decision and are ALWAYS written on accept. NEVER
  // touches the contraction column (D-03).
  const exerciseUpdate: {
    progressionStep: number | null;
    habilidad: string | null;
    route?: string;
    routePending?: boolean;
  } = {
    progressionStep: finalStep,
    habilidad: finalHabilidad,
  };

  // route + route_pending for route_pending rows (or override).
  if (shouldWriteRoute && finalRoute !== null) {
    exerciseUpdate.route = finalRoute;
    exerciseUpdate.routePending = false;
  }

  await tx
    .update(schema.exercises)
    .set(exerciseUpdate)
    .where(eq(schema.exercises.id, exercise.id));

  // (4) Mark the proposal accepted.
  await tx
    .update(schema.exerciseDimensionProposals)
    .set({ status: "accepted" })
    .where(eq(schema.exerciseDimensionProposals.id, id));

  return true;
}

export class ProposalService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * List proposals, filtered/grouped by route (D-07). Default status is
   * `pending`. Joins `exercises` so each row carries the exercise name + the
   * exercise's REAL current route (grouping uses the exercise route, not the
   * proposed one) + the route_pending flag. Ordered by route then exercise name
   * so the UI can group by route.
   */
  async listProposals(
    filters: ListProposalsFilters,
  ): Promise<ListProposalsResult> {
    const conditions: SQL[] = [];

    conditions.push(
      eq(schema.exerciseDimensionProposals.status, filters.status ?? "pending"),
    );

    if (filters.route !== undefined) {
      conditions.push(eq(schema.exercises.route, filters.route));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.exerciseDimensionProposals)
      .innerJoin(
        schema.exercises,
        eq(schema.exerciseDimensionProposals.exerciseId, schema.exercises.id),
      )
      .where(whereClause);

    const total = Number(countRow?.count ?? 0);

    const rows = await this.db
      .select({
        id: schema.exerciseDimensionProposals.id,
        exerciseId: schema.exerciseDimensionProposals.exerciseId,
        exerciseName: schema.exercises.exercise,
        currentRoute: schema.exercises.route,
        routePending: schema.exercises.routePending,
        proposedStep: schema.exerciseDimensionProposals.proposedStep,
        proposedHabilidad: schema.exerciseDimensionProposals.proposedHabilidad,
        proposedRoute: schema.exerciseDimensionProposals.proposedRoute,
        status: schema.exerciseDimensionProposals.status,
        engine: schema.exerciseDimensionProposals.engine,
        confidence: schema.exerciseDimensionProposals.confidence,
      })
      .from(schema.exerciseDimensionProposals)
      .innerJoin(
        schema.exercises,
        eq(schema.exerciseDimensionProposals.exerciseId, schema.exercises.id),
      )
      .where(whereClause)
      .orderBy(asc(schema.exercises.route), asc(schema.exercises.exercise));

    return { proposals: rows, total };
  }

  /**
   * Accept a proposal (D-02), transactionally writing the phase-124 truth
   * columns. Returns true on success; throws if the proposal does not exist.
   *
   * NEVER writes the contraction column. NEVER deletes any row.
   *
   * The transactional body lives in the exported `acceptInTransaction` so the
   * tree-editor milestone accept (phase 133 Plan 05) can embed it inside its
   * own transaction — this wrapper only supplies the transaction.
   */
  async accept(id: number, overrides?: AcceptOverrides): Promise<boolean> {
    return this.db.transaction((tx) => acceptInTransaction(tx, id, overrides));
  }

  /**
   * Reject a proposal (D-02): status-only flip. NEVER writes any `exercises`
   * truth column. Returns true if a row was updated.
   */
  async reject(id: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.exerciseDimensionProposals)
      .set({ status: "rejected" })
      .where(eq(schema.exerciseDimensionProposals.id, id));

    return result.affectedRows > 0;
  }

  /**
   * Accept every proposal in the list (D-07 "aceptar grupo"). Each accept runs
   * its own transaction (one bad proposal does not roll back the others).
   * Returns the count successfully accepted.
   */
  async bulkAccept(
    ids: number[],
    overridesById?: Record<number, AcceptOverrides>,
  ): Promise<number> {
    let acceptedCount = 0;
    for (const id of ids) {
      await this.accept(id, overridesById?.[id]);
      acceptedCount += 1;
    }
    return acceptedCount;
  }
}
