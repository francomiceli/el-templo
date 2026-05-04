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

import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";

type DbInstance = MySql2Database<typeof schema>;
type DbOrTx = DbInstance | TxHandle;

export interface EnrollFromPlanInput {
  id: number;
  linkedProgramId: number | null;
  grantsAllPrograms: boolean;
}

export interface EnrollAddonInput {
  programId: number;
  pricePaid?: number | null;
  assignedBy: number;
  notes?: string | null;
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
   *   - plan.grantsAllPrograms→ bulk-enroll the user in every active program
   *                             with goalPlanType IS NOT NULL (Foundation
   *                             excluded, phase 104 R3+R7) that they are
   *                             not already actively enrolled in.
   *
   * Both branches are independent; if both flags are set, both run.
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

    if (plan.grantsAllPrograms) {
      // Phase 104 R3 + Foundation exclusion: only programs with
      // goalPlanType IS NOT NULL are auto-enrolled by the bundle. Foundation
      // (goalPlanType=null) re-uses W* templo session content, so granting
      // bundle users Foundation enrollments would let them hit /sessions/*
      // without a presencial sub (R7's anti-piracy intent).
      const activePrograms = await runner
        .select({ id: schema.programs.id })
        .from(schema.programs)
        .where(
          and(
            eq(schema.programs.isActive, true),
            isNotNull(schema.programs.goalPlanType),
          ),
        );

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

      const toCreate = activePrograms.filter(
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
          enrolledCount: toCreate.length,
          alreadyEnrolledCount: alreadyEnrolledIds.size,
        },
        "Bundle (Todos los Programas) auto-enroll completed (Foundation excluded)",
      );
    }
  }

  /**
   * Plan 04 — admin add-on creation. Stub.
   */
  async enrollAddon(
    _userId: number,
    _subscriptionId: number,
    _input: EnrollAddonInput,
    _tx?: TxHandle,
  ): Promise<{ enrollmentId: number }> {
    throw new Error(
      "Plan 04 — admin add-on creation not yet implemented (enrollAddon)",
    );
  }

  /**
   * Generalized teardown — replaces phase 111's `tearDownBundleEnrollments`
   * + `tearDownLinkedProgramEnrollment` helpers. Driven by `subscription_id`
   * (the column added in Plan 01) so it works for ALL sources, not just
   * bundle plans.
   *
   * Algorithm:
   *   1. Resolve the sub's userId + planId. If missing, return silently
   *      (the sub may have been deleted concurrently).
   *   2. Compute the protected-program set: programIds covered by ANOTHER
   *      active|paused sub of the same user. If any protector has
   *      `grantsAllPrograms=true`, every program is protected.
   *   3. Select active|paused enrollments for `subscription_id = subId`.
   *   4. Filter out rows whose programId is protected.
   *   5. Cancel survivors atomically (`status='cancelled', cancelledAt=NOW`).
   *   6. NULL `users.current_program_enrollment_id` if it pointed to any
   *      cancelled row (stale-pointer cleanup, mirrors phase 111 helpers).
   */
  async tearDownForSubscription(
    subscriptionId: number,
    tx?: TxHandle,
  ): Promise<void> {
    const runner = this.runner(tx);

    // Step 1 — resolve userId + planId. Silent return if sub missing.
    const [sub] = await runner
      .select({
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);

    if (!sub) return;

    const { userId } = sub;

    // Step 2 — compute protected set from OTHER active|paused subs.
    const protectorRows = await runner
      .select({
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

    // Step 3 — select active|paused enrollments owned by this sub.
    const ownedEnrollments = await runner
      .select({
        id: schema.programEnrollments.id,
        programId: schema.programEnrollments.programId,
      })
      .from(schema.programEnrollments)
      .where(
        and(
          eq(schema.programEnrollments.subscriptionId, subscriptionId),
          inArray(schema.programEnrollments.status, ["active", "paused"]),
        ),
      );

    if (ownedEnrollments.length === 0) {
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
      : ownedEnrollments.filter((e) => !protectedProgramIds.has(e.programId));

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
   * Plan 03 — addon transfer between subs on changePlan. Stub.
   */
  async transferAddons(
    _fromSubId: number,
    _toSubId: number,
    _tx?: TxHandle,
  ): Promise<{ transferred: number }> {
    throw new Error(
      "Plan 03 — addon transfer not yet implemented (transferAddons)",
    );
  }

  /**
   * Plan 03 — pause hook (mirror parent sub status). Stub.
   */
  async pauseForSubscription(
    _subscriptionId: number,
    _tx?: TxHandle,
  ): Promise<void> {
    throw new Error(
      "Plan 03 — pause hook not yet implemented (pauseForSubscription)",
    );
  }

  /**
   * Plan 03 — resume hook (mirror parent sub status). Stub.
   */
  async resumeForSubscription(
    _subscriptionId: number,
    _tx?: TxHandle,
  ): Promise<void> {
    throw new Error(
      "Plan 03 — resume hook not yet implemented (resumeForSubscription)",
    );
  }
}
