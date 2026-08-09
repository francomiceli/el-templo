/**
 * Phase 103 Plan 01: integration tests for migration 0100 user status backfill.
 *
 * Each test seeds fixture rows directly via drizzle (with status=null to simulate
 * the post-ADD-COLUMN state), then runs the same backfill UPDATE statements that
 * the migration applies, and asserts each user lands in the expected status.
 *
 * Coverage:
 *   - Test 1: Member with active subscription -> 'activo'
 *   - Test 2: Member with is_trial booking, no active sub -> 'prueba'
 *   - Test 3: Member on ONLINE branch w/o sub or trial -> 'freemium'
 *   - Test 4: Member on presential branch w/o sub or trial -> 'inactivo'
 *   - Test 5: Staff (role='coach') with status=null stays null
 *   - Test 6: Re-running backfill is a no-op (idempotency)
 *   - Test 7: R4 count gate (fixture-based, non-vacuous)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { and, count, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo): filtro preciso para lecturas por
// id conocido, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";

interface BranchRow {
  id: number;
  code: string;
  isVirtual: boolean;
}

describe("Phase 103 - Migration 0100 backfill correctness", () => {
  let app: FastifyInstance;
  let onlineBranchId: number;
  let presentialBranchId: number;
  let planId: number;
  let scheduleId: number;
  let passwordHash: string;

  beforeAll(async () => {
    app = await createTestApp();
    passwordHash = await argon2.hash("test-password-ignored");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Reset to a known state before every test:
   *  - clean all test data
   *  - resolve the seeded ONLINE and presential branch IDs
   *  - create one plan, one activity, one schedule for fixtures that need them
   */
  beforeEach(async () => {
    await cleanAllTestData(app);

    const branchRows = (await app.db.select().from(branches)) as BranchRow[];
    const online = branchRows.find((b) => b.code === "ONLINE");
    const presential = branchRows.find((b) => b.code !== "ONLINE");
    if (!online || !presential) {
      throw new Error(
        `Test fixture missing branches: online=${online?.id} presential=${presential?.id}`,
      );
    }
    onlineBranchId = online.id;
    presentialBranchId = presential.id;

    const [planRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Backfill Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    planId = planRow.id;

    const [actRow] = await app.db
      .insert(activities)
      .values({ name: "Calistenia BF Test", branchId: presentialBranchId })
      .$returningId();
    const [schRow] = await app.db
      .insert(schedules)
      .values({
        activityId: actRow.id,
        branchId: presentialBranchId,
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      })
      .$returningId();
    scheduleId = schRow.id;
  });

  /**
   * Force every existing row's status back to NULL to simulate the
   * post-ADD-COLUMN state. seedTestData() pre-existed before plan 01 and
   * cleanAllTestData() preserves admin@test.com; the migration already ran on
   * the test DB so admin starts with whatever status the migration assigned.
   * Resetting to NULL gives every test a deterministic pre-backfill snapshot.
   */
  const resetStatusForAllUsers = async (): Promise<void> => {
    await app.db.execute(
      sql`UPDATE /* tenant-safe: reset global deliberado del snapshot pre-backfill, mismo alcance que la migracion 0100 */ users SET status = NULL, staff_disabled = FALSE`,
    );
  };

  /**
   * Run the same SQL UPDATEs that migration 0100 applies. Mirrors sections
   * 2.1 - 2.4 of the migration; 2.5 (legacy is_active=FALSE override) and
   * 2.6 (staff_disabled = NOT is_active) are intentionally omitted because
   * is_active was dropped by the migration before this test ever runs.
   */
  const runBackfill = async (): Promise<void> => {
    await app.db.execute(sql`
      UPDATE /* tenant-safe: mirror deliberado, global, de la migracion 0100 (corrio antes de que tenant_id existiera) */ users u
        SET u.status = 'activo'
        WHERE u.role = 'member'
          AND u.status IS NULL
          AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.subscription_status IN ('active','paused')
              AND (s.end_date IS NULL OR s.end_date >= CURDATE())
          )
    `);
    await app.db.execute(sql`
      UPDATE /* tenant-safe: mirror deliberado, global, de la migracion 0100 (corrio antes de que tenant_id existiera) */ users u
        SET u.status = 'prueba'
        WHERE u.role = 'member'
          AND u.status IS NULL
          AND EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.member_id = u.id AND b.is_trial = 1
          )
    `);
    await app.db.execute(sql`
      UPDATE /* tenant-safe: mirror deliberado, global, de la migracion 0100 (corrio antes de que tenant_id existiera) */ users u
        SET u.status = 'freemium'
        WHERE u.role = 'member'
          AND u.status IS NULL
          AND u.branch_id = (SELECT id FROM branches WHERE code = 'ONLINE')
    `);
    await app.db.execute(sql`
      UPDATE /* tenant-safe: mirror deliberado, global, de la migracion 0100 (corrio antes de que tenant_id existiera) */ users u
        SET u.status = 'inactivo'
        WHERE u.role = 'member'
          AND u.status IS NULL
    `);
  };

  /**
   * Convenience inserts. dni and email per-fixture suffixes guarantee
   * uniqueness across tests (cleanAllTestData wipes between runs but
   * concurrent vitest workers share the same admin@test.com).
   */
  const slug = (s: string): string =>
    `${s}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const insertMember = async (opts: {
    branchId: number;
    label: string;
  }): Promise<number> => {
    const tag = slug(opts.label);
    const [row] = await app.db
      .insert(users)
      .values({
        email: `${tag}@test.com`,
        passwordHash,
        firstName: opts.label,
        lastName: "BackfillTest",
        branchId: opts.branchId,
        role: "member",
        level: "alfa",
        dni: tag.slice(0, 18),
        status: null,
      })
      .$returningId();
    return row.id;
  };

  const insertStaff = async (opts: {
    role: "coach" | "admin" | "owner" | "gestion" | "recepcion";
    label: string;
  }): Promise<number> => {
    const tag = slug(opts.label);
    const [row] = await app.db
      .insert(users)
      .values({
        email: `${tag}@test.com`,
        passwordHash,
        firstName: opts.label,
        lastName: "BackfillStaff",
        branchId: presentialBranchId,
        role: opts.role,
        level: "alfa",
        dni: tag.slice(0, 18),
        status: null,
      })
      .$returningId();
    return row.id;
  };

  const insertActiveSubscription = async (userId: number): Promise<void> => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const futureEnd = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId: presentialBranchId,
      status: "active",
      startDate: todayStr,
      endDate: futureEnd,
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });
  };

  const insertTrialBooking = async (userId: number): Promise<void> => {
    await app.db.insert(bookings).values({
      memberId: userId,
      scheduleId,
      bookingDate: new Date().toISOString().slice(0, 10),
      status: "confirmado",
      isTrial: true,
    });
  };

  const getStatus = async (userId: number): Promise<string | null> => {
    const [row] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(and(tenantWhere(users, CTX_TEMPLO), eq(users.id, userId)));
    return row?.status ?? null;
  };

  // ─── Test 1 ────────────────────────────────────────────────────────────
  it("assigns activo to member with active subscription", async () => {
    await resetStatusForAllUsers();
    const userId = await insertMember({
      branchId: presentialBranchId,
      label: "active-sub",
    });
    await insertActiveSubscription(userId);

    await runBackfill();

    expect(await getStatus(userId)).toBe("activo");
  });

  // ─── Test 2 ────────────────────────────────────────────────────────────
  it("assigns prueba to member with trial booking only", async () => {
    await resetStatusForAllUsers();
    const userId = await insertMember({
      branchId: presentialBranchId,
      label: "trial-only",
    });
    await insertTrialBooking(userId);

    await runBackfill();

    expect(await getStatus(userId)).toBe("prueba");
  });

  // ─── Test 3 ────────────────────────────────────────────────────────────
  it("assigns freemium to member on ONLINE branch with no sub and no trial", async () => {
    await resetStatusForAllUsers();
    const userId = await insertMember({
      branchId: onlineBranchId,
      label: "online-freemium",
    });

    await runBackfill();

    expect(await getStatus(userId)).toBe("freemium");
  });

  // ─── Test 4 ────────────────────────────────────────────────────────────
  it("assigns inactivo to member on presential branch with no sub and no trial", async () => {
    await resetStatusForAllUsers();
    const userId = await insertMember({
      branchId: presentialBranchId,
      label: "ex-alumno",
    });

    await runBackfill();

    expect(await getStatus(userId)).toBe("inactivo");
  });

  // ─── Test 5 ────────────────────────────────────────────────────────────
  it("leaves status NULL for staff (role != member)", async () => {
    await resetStatusForAllUsers();
    const coachId = await insertStaff({ role: "coach", label: "coach-staff" });

    await runBackfill();

    expect(await getStatus(coachId)).toBe(null);
  });

  // ─── Test 6 ────────────────────────────────────────────────────────────
  it("is idempotent — second backfill run changes nothing", async () => {
    await resetStatusForAllUsers();
    const activeUserId = await insertMember({
      branchId: presentialBranchId,
      label: "idem-active",
    });
    await insertActiveSubscription(activeUserId);
    const onlineUserId = await insertMember({
      branchId: onlineBranchId,
      label: "idem-online",
    });

    await runBackfill();
    const firstActive = await getStatus(activeUserId);
    const firstOnline = await getStatus(onlineUserId);

    await runBackfill();

    expect(await getStatus(activeUserId)).toBe(firstActive);
    expect(await getStatus(onlineUserId)).toBe(firstOnline);
    expect(firstActive).toBe("activo");
    expect(firstOnline).toBe("freemium");
  });

  // ─── Test 7 (R4 count gate, fixture-based) ─────────────────────────────
  it("R4 count gate: zero members with NULL status, zero staff with non-NULL status", async () => {
    await resetStatusForAllUsers();

    // Seed one user per scenario so the count assertions are non-vacuous.
    const activeUserId = await insertMember({
      branchId: presentialBranchId,
      label: "r4-active",
    });
    await insertActiveSubscription(activeUserId);

    const trialUserId = await insertMember({
      branchId: presentialBranchId,
      label: "r4-trial",
    });
    await insertTrialBooking(trialUserId);

    await insertMember({
      branchId: onlineBranchId,
      label: "r4-online",
    });

    await insertMember({
      branchId: presentialBranchId,
      label: "r4-ex-alumno",
    });

    await insertStaff({ role: "coach", label: "r4-coach" });

    await runBackfill();

    const [{ membersNullCount }] = await app.db
      .select({ membersNullCount: count() })
      .from(users)
      .where(
        and(
          // tenant-safe: R4 es el gate de integridad de la propia migracion
          // 0100 (cero NULL en TODA la tabla) — corrio antes de que tenant_id
          // existiera y acotarlo por gimnasio le cambiaria lo que audita.
          sql`/* tenant-safe: R4 audita TODA la tabla, mismo alcance que la migracion 0100 */ 1=1`,
          eq(users.role, "member"),
          isNull(users.status),
          isNull(users.deletedAt),
        ),
      );
    expect(membersNullCount).toBe(0);

    const [{ staffWithStatusCount }] = await app.db
      .select({ staffWithStatusCount: count() })
      .from(users)
      .where(
        and(
          sql`/* tenant-safe: R4 audita TODA la tabla, mismo alcance que la migracion 0100 */ 1=1`,
          ne(users.role, "member"),
          isNotNull(users.status),
        ),
      );
    expect(staffWithStatusCount).toBe(0);
  });
});
