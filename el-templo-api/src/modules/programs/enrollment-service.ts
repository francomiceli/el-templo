// Module: programs — phase 112
//
// EnrollmentService is the single chokepoint for every write to
// `program_enrollments`. Phase 111 surfaced the cost of the spaghetti:
// adding `tearDownBundleEnrollments` required hunting 6 duplicated insert
// sites in subscriptions/service.ts to understand which teardowns were
// missing. This service collapses that surface into a small set of named
// methods that own the lifecycle.
//
// Atomicity contract (D-07, mirrors phase 111-02 auditLog.write pattern):
//   - Every mutator accepts `tx?: TxHandle` as a trailing optional param.
//   - The service NEVER opens its own transaction. If a caller is already
//     inside a `db.transaction(tx => ...)` it MUST pass `tx` through so
//     the enrollment write rolls back atomically with the parent op.
//   - Read methods accept `tx?` as well so they observe in-flight tx
//     state when a caller is composing them with mutators.
//
// Source semantics (D-01):
//   - plan_linked   : derived from subscription_plans.linked_program_id
//   - plan_bundle   : derived from subscription_plans.grants_all_programs
//   - admin_addon   : assigned manually by an admin via the add-on endpoint
//
// Plan 02 ships the surface + bodies for the read method, enrollFromPlan,
// and tearDownForSubscription. Plans 03/04 fill the remaining 4 stubs
// (enrollAddon, transferAddons, pauseForSubscription, resumeForSubscription).

import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import type { TransactionService } from "../finance/transaction-service";
import type { PaymentMethod } from "../finance/types";
import { auditLog } from "../shared/audit-log";
import type { TenantContext } from "../shared/tenant";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";

type DbInstance = MySql2Database<typeof schema>;
type DbOrTx = DbInstance | TxHandle;

export interface EnrollFromPlanInput {
  id: number;
  linkedProgramId: number | null;
  grantsAllPrograms: boolean;
  /**
   * Explicit list of programs granted by the plan (D-06/D-07, phase 156-02
   * join table `plan_programs`). Resolution is all → list → nothing:
   * `grantsAllPrograms` keeps priority (list ignored when true); when false a
   * non-empty list IS the access set; empty list grants no online program.
   * The list INHERITS the bundle's anti-piracy filter (goalPlanType IS NOT
   * NULL) — it can NEVER grant Foundation (phase 104 R7).
   */
  programIds: number[];
}

export interface EnrollAddonInput {
  programId: number;
  pricePaid?: number | null;
  assignedBy: number;
  notes?: string | null;
  /** Optional payment method when pricePaid > 0. Defaults to 'cash' (D-13). */
  paymentMethod?: PaymentMethod;
  /**
   * Optional branch override for the financial_transaction. Defaults to the
   * member's active subscription branchId so add-on revenue lands in the same
   * sucursal as the parent plan_charge.
   */
  branchId?: number;
}

export interface ActiveEnrollmentSummary {
  id: number;
  programId: number;
  userId: number;
  source: "plan_linked" | "plan_bundle" | "admin_addon";
  status: "active" | "paused";
}

export class EnrollmentService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    /**
     * Phase 112 D-13: TransactionService is required only by enrollAddon
     * when pricePaid > 0. Other entry points (enrollFromPlan, teardown,
     * pause/resume/transfer) do NOT touch finance, so the param stays
     * optional to keep Plan 02's DI rollout shape (test files instantiate
     * `new EnrollmentService(db, log)` without finance wiring).
     */
    private readonly transactionService?: TransactionService,
  ) {}

  /**
   * Resolve which db handle to use. If the caller passed `tx`, all queries
   * inside the method body MUST go through it; otherwise we fall back to
   * the service's own db connection. Phase 111-02 pattern.
   */
  private runner(tx?: TxHandle): DbOrTx {
    return tx ?? this.db;
  }

  // =========================================================================
  // Reads
  // =========================================================================

  /**
   * Return active|paused enrollments tied to a given subscription. Used by
   * Plans 03/04 to discover which rows to pause / resume / transfer when
   * the parent subscription's lifecycle changes.
   */
  async getActiveEnrollmentsForSubscription(
    subscriptionId: number,
    tx?: TxHandle,
  ): Promise<ActiveEnrollmentSummary[]> {
    const runner = this.runner(tx);
    const rows = await runner
      .select({
        id: schema.programEnrollments.id,
        programId: schema.programEnrollments.programId,
        userId: schema.programEnrollments.userId,
        source: schema.programEnrollments.source,
        status: schema.programEnrollments.status,
      })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          inArray(schema.programEnrollments.status, ["active", "paused"]),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      programId: r.programId,
      userId: r.userId,
      source: r.source,
      // Narrow status from the wider DB enum to the active|paused subset
      // that this method's WHERE clause already enforces.
      status: r.status as "active" | "paused",
    }));
  }

  // =========================================================================
  // Mutators
  // =========================================================================

  /**
   * Auto-enroll a user in the program(s) implied by their plan. Replaces
   * the 6 dispersed `tx.insert(programEnrollments)` callsites in
   * subscriptions/service.ts.
   *
   * Branches:
   *   - plan.linkedProgramId  → cancel any existing active enrollment for
   *                             (userId, linkedProgramId), then insert one
   *                             new row with source='plan_linked'.
   *   - multi-program access  → resolve all → list → nothing (D-07):
   *                             grantsAllPrograms=true bulk-enrolls every
   *                             active program with goalPlanType IS NOT NULL
   *                             (Foundation excluded, phase 104 R3+R7);
   *                             grantsAllPrograms=false + non-empty programIds
   *                             enrolls exactly those programs, keeping the
   *                             SAME Foundation filter (the list can NOT grant
   *                             Foundation); empty list enrolls nothing. Only
   *                             programs the user is not already actively
   *                             enrolled in are inserted (source='plan_bundle',
   *                             reused to avoid migrating the enum).
   *
   * Both branches are independent; if the plan has a linkedProgramId AND a
   * multi-program grant, both run.
   */
  async enrollFromPlan(
    userId: number,
    plan: EnrollFromPlanInput,
    subscriptionId: number,
    tx?: TxHandle,
  ): Promise<void> {
    const runner = this.runner(tx);

    if (plan.linkedProgramId !== null) {
      const linkedProgramId = plan.linkedProgramId;
      // Cancel any existing active enrollment for this user in this program.
      await runner
        .update(schema.programEnrollments)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.programId, linkedProgramId),
            eq(schema.programEnrollments.status, "active"),
          ),
        );

      // Create new enrollment.
      await runner.insert(schema.programEnrollments).values({
        userId,
        programId: linkedProgramId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
        source: "plan_linked",
        subscriptionId,
      });

      this.log.info(
        { userId, programId: linkedProgramId, subscriptionId },
        "Auto-created program enrollment from plan (linkedProgramId)",
      );
    }

    // Multi-program access resolution (D-07): all → list → nothing.
    // Phase 104 R3 + Foundation exclusion: only programs with goalPlanType IS
    // NOT NULL are auto-enrolled. Foundation (goalPlanType=null) re-uses W*
    // templo session content, so granting Foundation enrollments would let a
    // user hit /sessions/* without a presencial sub (R7's anti-piracy intent).
    // The explicit list (grantsAllPrograms=false + non-empty programIds)
    // INHERITS the same filter — a plan can NEVER grant Foundation by list.
    let programsToConsider: Array<{ id: number }> = [];
    if (plan.grantsAllPrograms) {
      programsToConsider = await runner
        .select({ id: schema.programs.id })
        .from(schema.programs)
        .where(
          and(
            eq(schema.programs.isActive, true),
            isNotNull(schema.programs.goalPlanType),
          ),
        );
    } else if (plan.programIds.length > 0) {
      programsToConsider = await runner
        .select({ id: schema.programs.id })
        .from(schema.programs)
        .where(
          and(
            eq(schema.programs.isActive, true),
            isNotNull(schema.programs.goalPlanType),
            inArray(schema.programs.id, plan.programIds),
          ),
        );
    }

    if (programsToConsider.length > 0) {
      const existingActiveEnrollments = await runner
        .select({ programId: schema.programEnrollments.programId })
        .from(schema.programEnrollments)
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.status, "active"),
          ),
        );
      const alreadyEnrolledIds = new Set(
        existingActiveEnrollments.map((r) => r.programId),
      );

      const toCreate = programsToConsider.filter(
        (p) => !alreadyEnrolledIds.has(p.id),
      );

      if (toCreate.length > 0) {
        await runner.insert(schema.programEnrollments).values(
          toCreate.map((p) => ({
            userId,
            programId: p.id,
            status: "active" as const,
            currentWeek: 1,
            sessionsCompletedThisWeek: 0,
            weekUnlockedAt: new Date(),
            source: "plan_bundle" as const,
            subscriptionId,
          })),
        );
      }

      this.log.info(
        {
          userId,
          planId: plan.id,
          grantsAllPrograms: plan.grantsAllPrograms,
          listSize: plan.programIds.length,
          enrolledCount: toCreate.length,
          alreadyEnrolledCount: alreadyEnrolledIds.size,
        },
        "Multi-program auto-enroll completed (all -> list -> nothing, Foundation excluded)",
      );
    }
  }

  /**
   * Phase 112 D-10..D-15, D-22, D-24 — admin add-on creation.
   *
   * Validates that the member has an active|paused subscription, that the
   * program exists+is active, and that no duplicate active enrollment exists
   * (D-12: any source — plan_linked, plan_bundle, admin_addon — counts).
   * Inserts the enrollment row with source='admin_addon', subscriptionId set,
   * and pricePaid recorded. When pricePaid > 0 ALSO creates a
   * financial_transaction (kind='plan_charge', direction='inflow', currency
   * inherited from the active sub plan per D-15) plus the corresponding
   * transaction_links row (target_kind='enrollment'), atomic with the
   * enrollment insert.
   *
   * D-14: pricePaid = 0 OR null → enrollment-only path (regalo). No
   * financial transaction is emitted.
   *
   * D-24: writes an audit_log row (action='plan_assigned', targetKind='member')
   * with payload describing the assignment. Atomic with the rest.
   *
   * Errors carry machine-readable `code` properties so the route layer can
   * map to structured 4xx bodies (mirrors phase 111-03 cancelSubscription
   * pattern):
   *   - "ASSIGN_PLAN_FIRST" (no active|paused sub) → 400
   *   - "PROGRAM_ALREADY_ACTIVE" (D-12 dup) → 409
   * NotFoundError ("Programa no encontrado o inactivo") → 404 via
   * handleServiceError.
   */
  async enrollAddon(
    ctx: TenantContext,
    userId: number,
    subscriptionId: number,
    input: EnrollAddonInput,
    tx?: TxHandle,
  ): Promise<{ enrollmentId: number }> {
    const runner = tx
      ? <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> => cb(tx)
      : <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> =>
          this.db.transaction(cb);

    return await runner<{ enrollmentId: number }>(async (txHandle) => {
      // Step 1 (D-11) — validate active|paused sub belongs to user AND id
      // matches subscriptionId. Pull plan.currency for D-15 inheritance and
      // sub.branchId for the financial transaction default.
      const [activeSub] = await txHandle
        .select({
          id: schema.subscriptions.id,
          status: schema.subscriptions.status,
          branchId: schema.subscriptions.branchId,
          planId: schema.subscriptions.planId,
          currency: schema.subscriptionPlans.currency,
        })
        .from(schema.subscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
        )
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.id, subscriptionId),
            or(
              eq(schema.subscriptions.status, "active"),
              eq(schema.subscriptions.status, "paused"),
            ),
          ),
        )
        .limit(1);
      if (!activeSub) {
        const err = new BadRequestError(
          "El miembro no tiene suscripcion activa",
        );
        (err as { code?: string }).code = "ASSIGN_PLAN_FIRST";
        throw err;
      }

      // Step 2 — validate program exists + is active.
      const [program] = await txHandle
        .select({ id: schema.programs.id, isActive: schema.programs.isActive })
        .from(schema.programs)
        .where(eq(schema.programs.id, input.programId))
        .limit(1);
      if (!program || !program.isActive) {
        throw new NotFoundError("Programa no encontrado o inactivo");
      }

      // Step 3 (D-12) — duplicate active|paused enrollment for this program
      // across ALL sources (plan_linked, plan_bundle, admin_addon). Bundle
      // edge case is automatically covered: a bundle subscription lazy-enrolls
      // the user in every program when assigned (Plan 02 enrollFromPlan +
      // grantsAllPrograms branch), so a row already exists at admin_addon
      // time and this lookup catches it.
      const dupes = await txHandle
        .select({ id: schema.programEnrollments.id })
        .from(schema.programEnrollments)
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.programId, input.programId),
            or(
              eq(schema.programEnrollments.status, "active"),
              eq(schema.programEnrollments.status, "paused"),
            ),
          ),
        )
        .limit(1);
      if (dupes.length > 0) {
        const err = new ConflictError(
          "El miembro ya tiene una inscripcion activa para este programa",
        );
        (err as { code?: string }).code = "PROGRAM_ALREADY_ACTIVE";
        throw err;
      }

      // Step 4 — insert the enrollment row.
      const insertResult = await txHandle
        .insert(schema.programEnrollments)
        .values({
          userId,
          programId: input.programId,
          status: "active",
          currentWeek: 1,
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
          source: "admin_addon",
          subscriptionId,
          pricePaid: input.pricePaid ?? null,
          assignedBy: input.assignedBy,
          notes: input.notes ?? null,
        });
      const enrollmentId = Number(
        (insertResult as unknown as Array<{ insertId: number }>)[0].insertId,
      );

      // Step 5 (D-13/D-14) — emit financial_transaction iff pricePaid > 0.
      if ((input.pricePaid ?? 0) > 0) {
        if (!this.transactionService) {
          throw new Error(
            "TransactionService not injected — enrollAddon with pricePaid > 0 requires it",
          );
        }
        const today = new Date().toISOString().split("T")[0];
        const amount = input.pricePaid as number;
        await this.transactionService.create(
          ctx,
          {
            memberId: userId,
            kind: "plan_charge",
            direction: "inflow",
            amount,
            currency: activeSub.currency,
            paymentMethod: input.paymentMethod ?? "cash",
            transactionDate: today,
            effectiveDate: today,
            branchId: input.branchId ?? activeSub.branchId,
            links: [
              {
                targetKind: "enrollment",
                targetId: enrollmentId,
                allocatedAmount: amount,
              },
            ],
            notes: `Add-on programa ${input.programId} asignado por admin`,
          },
          input.assignedBy,
          txHandle,
        );
      }

      // Step 6 (D-24) — audit log row. Same tx as the rest, so a downstream
      // failure rolls everything back.
      await auditLog.write(ctx, txHandle, {
        actorId: input.assignedBy,
        action: "plan_assigned",
        targetKind: "member",
        targetId: userId,
        payload: {
          enrollmentId,
          programId: input.programId,
          pricePaid: input.pricePaid ?? null,
          subscriptionId,
          currency: activeSub.currency,
          source: "admin_addon",
        },
        reason: input.notes ?? null,
      });

      this.log.info(
        {
          userId,
          programId: input.programId,
          enrollmentId,
          pricePaid: input.pricePaid ?? null,
          subscriptionId,
        },
        "Admin add-on enrollment created",
      );

      return { enrollmentId };
    });
  }

  /**
   * Generalized teardown — replaces phase 111's `tearDownBundleEnrollments`
   * + `tearDownLinkedProgramEnrollment` helpers. Primarily driven by
   * `subscription_id` (the column added in Plan 01) so it works for ALL
   * sources, not just bundle plans.
   *
   * Backward-compat fallback (D-08 no-regression gate): also includes
   * pre-Phase-112 enrollments whose `subscription_id IS NULL` but match
   * the cancelled sub's plan binding (linkedProgramId or grantsAllPrograms).
   * Plan 01 backfill resolves most of these, but ambiguous rows remain null
   * and the legacy helpers (which scanned by user+plan) caught them. The
   * fallback preserves that semantics so phase 111 regression tests pass
   * without modification.
   *
   * Phase 112-03 (D-19 support): callers can pass `excludeSources` to keep
   * specific source types alive across the teardown. The `changePlanNow` /
   * `activateScheduledSub` flows pass `['admin_addon']` so admin add-ons
   * survive the closing sub's teardown and can then be relocated to the
   * new sub via `transferAddons`. Default = empty (preserves D-18:
   * cancel/expire teardowns ALL sources, including admin_addon).
   *
   * Algorithm:
   *   1. Resolve the sub's userId + planId + plan flags. Silent return if
   *      sub missing.
   *   2. Compute the protected-program set: programIds covered by ANOTHER
   *      active|paused sub of the same user. If any protector has
   *      `grantsAllPrograms=true`, every program is protected.
   *   3. Select active|paused enrollments either (a) owned by this sub via
   *      subscription_id, OR (b) matching the cancelled sub's plan binding
   *      with subscription_id IS NULL (legacy-row fallback). Filter out
   *      rows whose source is in `excludeSources`.
   *   4. Filter out rows whose programId is protected.
   *   5. Cancel survivors atomically (`status='cancelled', cancelledAt=NOW`).
   *   6. NULL `users.current_program_enrollment_id` if it pointed to any
   *      cancelled row (stale-pointer cleanup, mirrors phase 111 helpers).
   */
  async tearDownForSubscription(
    subscriptionId: number,
    tx?: TxHandle,
    options?: {
      excludeSources?: ReadonlyArray<
        "plan_linked" | "plan_bundle" | "admin_addon"
      >;
    },
  ): Promise<void> {
    const runner = this.runner(tx);
    const excludeSet = new Set(options?.excludeSources ?? []);

    // Step 1 — resolve userId + plan flags. Silent return if sub missing.
    const [sub] = await runner
      .select({
        userId: schema.subscriptions.userId,
        planLinkedProgramId: schema.subscriptionPlans.linkedProgramId,
        planGrantsAllPrograms: schema.subscriptionPlans.grantsAllPrograms,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
      )
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);

    if (!sub) return;

    const { userId } = sub;

    // Step 2 — compute protected set from OTHER active|paused subs.
    const protectorRows = await runner
      .select({
        planId: schema.subscriptionPlans.id,
        linkedProgramId: schema.subscriptionPlans.linkedProgramId,
        grantsAllPrograms: schema.subscriptionPlans.grantsAllPrograms,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
          ),
          ne(schema.subscriptions.id, subscriptionId),
        ),
      );

    const anyProtectorIsBundle = protectorRows.some(
      (r) => r.grantsAllPrograms === true,
    );
    const protectedProgramIds = new Set<number>(
      protectorRows
        .map((r) => r.linkedProgramId)
        .filter((id): id is number => id !== null),
    );

    // A protector with an explicit program list (D-07) also protects every
    // program in its list — mirror the linked/bundle coverage so a teardown
    // never revokes access still granted by ANOTHER active|paused sub's list.
    const protectorPlanIds = protectorRows.map((r) => r.planId);
    if (protectorPlanIds.length > 0) {
      const protectorListRows = await runner
        .select({ programId: schema.planPrograms.programId })
        .from(schema.planPrograms)
        .where(
          inArray(schema.planPrograms.subscriptionPlanId, protectorPlanIds),
        );
      for (const r of protectorListRows) protectedProgramIds.add(r.programId);
    }

    // Step 3a — owned enrollments via subscription_id (the post-Phase-112
    // canonical wiring). `source` projected so the excludeSources filter
    // below can drop sources the caller wants to preserve (e.g. admin_addon
    // during plan-change so transferAddons can relocate them).
    const ownedEnrollments = await runner
      .select({
        id: schema.programEnrollments.id,
        programId: schema.programEnrollments.programId,
        source: schema.programEnrollments.source,
      })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          inArray(schema.programEnrollments.status, ["active", "paused"]),
        ),
      );

    // Step 3b — legacy fallback: include user's active|paused enrollments
    // with subscription_id IS NULL that match the cancelled sub's plan
    // binding. Bundle (grantsAllPrograms) sweeps every such row; linked
    // (linkedProgramId) only the matching programId. Mirrors the legacy
    // helpers which scanned by user+plan, not by subscription_id.
    let legacyOrphanRows: Array<{
      id: number;
      programId: number;
      source: "plan_linked" | "plan_bundle" | "admin_addon";
    }> = [];
    if (sub.planGrantsAllPrograms) {
      legacyOrphanRows = await runner
        .select({
          id: schema.programEnrollments.id,
          programId: schema.programEnrollments.programId,
          source: schema.programEnrollments.source,
        })
        .from(schema.programEnrollments)
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            inArray(schema.programEnrollments.status, ["active", "paused"]),
            isNull(schema.programEnrollments.subscriptionId),
          ),
        );
    } else if (sub.planLinkedProgramId !== null) {
      legacyOrphanRows = await runner
        .select({
          id: schema.programEnrollments.id,
          programId: schema.programEnrollments.programId,
          source: schema.programEnrollments.source,
        })
        .from(schema.programEnrollments)
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.programId, sub.planLinkedProgramId),
            inArray(schema.programEnrollments.status, ["active", "paused"]),
            isNull(schema.programEnrollments.subscriptionId),
          ),
        );
    }

    // Merge owned + legacy-orphan candidates, dedupe by id, then drop any
    // sources the caller wants to preserve (excludeSources).
    const candidateMap = new Map<
      number,
      {
        id: number;
        programId: number;
        source: "plan_linked" | "plan_bundle" | "admin_addon";
      }
    >();
    for (const e of ownedEnrollments) candidateMap.set(e.id, e);
    for (const e of legacyOrphanRows) candidateMap.set(e.id, e);
    const candidates = Array.from(candidateMap.values()).filter(
      (e) => !excludeSet.has(e.source),
    );

    if (candidates.length === 0) {
      this.log.info(
        {
          subscriptionId,
          userId,
          cancelledCount: 0,
          protectedProgramCount: protectedProgramIds.size,
          anyProtectorIsBundle,
        },
        "Enrollment teardown completed (tearDownForSubscription)",
      );
      return;
    }

    // Step 4 — filter out protected programs. If any protector is a bundle,
    // every program is implicitly protected.
    const toCancel = anyProtectorIsBundle
      ? []
      : candidates.filter((e) => !protectedProgramIds.has(e.programId));

    if (toCancel.length === 0) {
      this.log.info(
        {
          subscriptionId,
          userId,
          cancelledCount: 0,
          protectedProgramCount: protectedProgramIds.size,
          anyProtectorIsBundle,
        },
        "Enrollment teardown completed (tearDownForSubscription)",
      );
      return;
    }

    const cancelIds = toCancel.map((e) => e.id);

    // Step 5 — cancel survivors atomically.
    await runner
      .update(schema.programEnrollments)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(inArray(schema.programEnrollments.id, cancelIds));

    // Step 6 — clear stale current_program_enrollment_id pointer.
    await runner
      .update(schema.users)
      .set({ currentProgramEnrollmentId: null })
      .where(
        and(
          eq(schema.users.id, userId),
          inArray(schema.users.currentProgramEnrollmentId, cancelIds),
        ),
      );

    this.log.info(
      {
        subscriptionId,
        userId,
        cancelledCount: cancelIds.length,
        protectedProgramCount: protectedProgramIds.size,
        anyProtectorIsBundle,
      },
      "Enrollment teardown completed (tearDownForSubscription)",
    );
  }

  /**
   * Phase 112 D-19 — transfer admin add-on enrollments from one subscription
   * to another (used by changePlanNow + activateScheduledSub when a member
   * switches plans). Only `source='admin_addon'` rows in `active`/`paused`
   * status are transferred; `plan_linked` and `plan_bundle` rows are
   * recreated by `enrollFromPlan` against the new plan flags, NOT moved.
   *
   * No re-charge is performed (decision A in CONTEXT.md). The financial
   * transaction created at `enrollAddon` time stays linked to its original
   * subscription via `transaction_links`; the enrollment row is repointed
   * via `subscription_id`.
   *
   * Zero-add-on case (D-20): clean no-op — no UPDATE issued, returns
   * { transferred: 0 }.
   */
  async transferAddons(
    fromSubId: number,
    toSubId: number,
    tx?: TxHandle,
  ): Promise<{ transferred: number }> {
    const runner = this.runner(tx);

    const candidates = await runner
      .select({ id: schema.programEnrollments.id })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, fromSubId),
          eq(schema.programEnrollments.source, "admin_addon"),
          or(
            eq(schema.programEnrollments.status, "active"),
            eq(schema.programEnrollments.status, "paused"),
          ),
        ),
      );

    if (candidates.length === 0) {
      // D-20: zero-add-on case is a clean no-op.
      this.log.info(
        { fromSubId, toSubId, transferred: 0 },
        "transferAddons no-op (no admin_addon rows on source sub)",
      );
      return { transferred: 0 };
    }

    const ids = candidates.map((c) => c.id);
    await runner
      .update(schema.programEnrollments)
      .set({ subscriptionId: toSubId })
      .where(inArray(schema.programEnrollments.id, ids));

    this.log.info(
      { fromSubId, toSubId, transferred: ids.length },
      "Add-ons transferred (transferAddons)",
    );
    return { transferred: ids.length };
  }

  /**
   * Phase 112 D-16 — pause cascade. Updates EVERY enrollment with
   * `subscription_id=subscriptionId` whose status is `active` to `paused`.
   * Applies to ALL sources (plan_linked, plan_bundle, admin_addon) — not
   * just admin add-ons. Closes the pre-Phase-112 gap where pauseSubscription
   * left enrollments in 'active' state.
   *
   * Idempotency: cancelled / completed / expired rows are NOT touched. Rows
   * already in 'paused' are no-ops. Calling on a sub with no active
   * enrollments is a clean no-op.
   */
  async pauseForSubscription(
    subscriptionId: number,
    tx?: TxHandle,
  ): Promise<void> {
    const runner = this.runner(tx);
    await runner
      .update(schema.programEnrollments)
      .set({ status: "paused" })
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          eq(schema.programEnrollments.status, "active"),
        ),
      );

    const [pausedCountRow] = await runner
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          eq(schema.programEnrollments.status, "paused"),
        ),
      );

    this.log.info(
      { subscriptionId, pausedCount: Number(pausedCountRow?.count ?? 0) },
      "Enrollments paused (pauseForSubscription)",
    );
  }

  /**
   * Phase 112 D-17 — resume cascade. Updates rows previously paused by this
   * sub (`subscription_id=subscriptionId AND status='paused'`) back to
   * `active`. NEVER resurrects cancelled / completed / expired rows — only
   * the last-paused state can be reverted.
   *
   * Mirror inverse of pauseForSubscription. Idempotent: a no-op if no rows
   * are currently paused on this sub.
   */
  async resumeForSubscription(
    subscriptionId: number,
    tx?: TxHandle,
  ): Promise<void> {
    const runner = this.runner(tx);
    await runner
      .update(schema.programEnrollments)
      .set({ status: "active" })
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          eq(schema.programEnrollments.status, "paused"),
        ),
      );

    const [activeCountRow] = await runner
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          eq(schema.programEnrollments.status, "active"),
        ),
      );

    this.log.info(
      { subscriptionId, activeCount: Number(activeCountRow?.count ?? 0) },
      "Enrollments resumed (resumeForSubscription)",
    );
  }
}
