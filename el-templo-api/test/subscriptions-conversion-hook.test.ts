/**
 * Phase 114 Plan 03: integration tests for the subscription conversion hook
 * folded into `recomputeUserStatus` (subscriptions/service.ts).
 *
 * Behavior under test (D-32 / D-33 / D-34, hotfix 2026-07):
 *   When a user with status='prueba' AND an existing is_trial=1 booking gets
 *   a first subscription assigned that starts today (i.e. the conversion
 *   moment, also gated by `users.converted_at IS NULL`), the same single
 *   UPDATE statement that already sets `converted_at = NOW()` ALSO:
 *     - Sets `lead_status = 'ganado'` (pre-hotfix: 'cerrado').
 *     - Sets `purchased_plan_id = <plan.id>` ONLY when it is still NULL.
 *     - NEVER touches `lead_notes` (pre-hotfix it prefilled the plan name
 *       there; the plan now has its own column).
 *
 *   The hook MUST NOT fire for non-trial users (no is_trial booking) and
 *   MUST NOT re-set `purchased_plan_id` on a second assignment after the
 *   user has already converted.
 *
 * All assertions read directly from the DB (`app.db.select(...).from(users)`)
 * because the HTTP response shape does not surface lead_status/lead_notes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "./helpers";
import { users } from "../src/db/schema/users";
import { bookings } from "../src/db/schema/bookings";
import { schedules } from "../src/db/schema/schedules";
import { activities } from "../src/db/schema/activities";
import { subscriptionPlans } from "../src/db/schema/subscription-plans";
import { financialTransactions } from "../src/db/schema/financial-transactions";
import { transactionLinks } from "../src/db/schema/transaction-links";
import { tenantWhere } from "../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

/**
 * 172-15: `TEMPLO_CTX` es el gimnasio de este archivo. Las queries directas de
 * los tests pasan por `app.dbPool` igual que las de la app, asi que con
 * `finance` en `TENANT_STRICT_MODULES` una lectura o una siembra sobre las
 * tablas strict sin gimnasio hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const BRANCH_ID = 1; // seeded by test setup

interface LeadColumns {
  leadStatus: "en_seguimiento" | "ganado" | "perdido" | null;
  leadNotes: string | null;
  purchasedPlanId: number | null;
  convertedAt: Date | null;
  status: "freemium" | "prueba" | "activo" | "inactivo" | null;
}

describe("Phase 114-03 — subscription conversion hook (lead_status + lead_notes)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let scheduleId: number;
  let basicPlanId: number;
  let proPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Seed an activity + schedule so trial bookings can FK to a real row.
    const [actRow] = await app.db
      .insert(activities)
      .values({ name: "Calistenia Hook Test", branchId: BRANCH_ID })
      .$returningId();
    const [schRow] = await app.db
      .insert(schedules)
      .values({
        activityId: actRow.id,
        branchId: BRANCH_ID,
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      })
      .$returningId();
    scheduleId = schRow.id;

    // Two distinctly-named plans so Test 1 vs Test 2 lead_notes assertions
    // are unambiguous (matches the plan's example: "Flex Basic" / "Flex Pro").
    const [basicRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Flex Basic",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    basicPlanId = basicRow.id;

    const [proRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Flex Pro",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 20000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    proPlanId = proRow.id;
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Create a "trial lead" via POST /api/admin/members/trial. This guarantees
   * the user lands in the exact state Plan 02 wires up:
   *   - status='prueba', lead_status='en_seguimiento', created_by=<admin id>.
   */
  async function createTrialLead(overrides: {
    firstName: string;
    lastName: string;
    phone: string;
  }): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...overrides, branchId: BRANCH_ID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    return body.id;
  }

  /** Insert a single is_trial=1 booking for the given user. */
  async function seedTrialBooking(userId: number): Promise<void> {
    await app.db.insert(bookings).values({
      memberId: userId,
      scheduleId,
      // -7 keeps the booking in the past which is consistent with a real
      // "user already did the SP and is now being converted" flow.
      bookingDate: shiftDays(todayStr(), -7),
      status: "confirmado",
      isTrial: true,
    });
  }

  /** Plain date-shifter (no timezone fanciness needed for date-only fields). */
  function shiftDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }

  async function assignPlanViaHttp(
    userId: number,
    planId: number,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: BRANCH_ID,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    };
  }

  async function fetchLeadColumns(userId: number): Promise<LeadColumns> {
    const [row] = await app.db
      .select({
        leadStatus: users.leadStatus,
        leadNotes: users.leadNotes,
        purchasedPlanId: users.purchasedPlanId,
        convertedAt: users.convertedAt,
        status: users.status,
      })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));
    if (!row) throw new Error(`user ${userId} not found`);
    return row as LeadColumns;
  }

  // ─── Tests ──────────────────────────────────────────────────────────────

  it("sets lead_status='ganado' + purchased_plan_id on conversion (canonical happy path)", async () => {
    const userId = await createTrialLead({
      firstName: "Lagos",
      lastName: "Rosario",
      phone: "1140000001",
    });
    await seedTrialBooking(userId);

    // Sanity: lead_notes starts NULL, lead_status='en_seguimiento'.
    const before = await fetchLeadColumns(userId);
    expect(before.leadStatus).toBe("en_seguimiento");
    expect(before.leadNotes).toBeNull();
    expect(before.convertedAt).toBeNull();

    const assign = await assignPlanViaHttp(userId, basicPlanId);
    expect(assign.statusCode).toBe(201);

    const after = await fetchLeadColumns(userId);
    expect(after.convertedAt).not.toBeNull();
    expect(after.leadStatus).toBe("ganado");
    expect(after.purchasedPlanId).toBe(basicPlanId);
    // Hotfix 2026-07: lead_notes stays free-text only — the hook no longer
    // prefills the plan name there.
    expect(after.leadNotes).toBeNull();
    expect(after.status).toBe("activo");
  });

  it("preserves pre-existing lead_notes (does NOT overwrite admin comment)", async () => {
    const userId = await createTrialLead({
      firstName: "Antonino",
      lastName: "Flor",
      phone: "1140000002",
    });
    await seedTrialBooking(userId);

    // Admin already wrote a comment before the conversion.
    await app.db
      .update(users)
      .set({ leadNotes: "manual: muy interesado" })
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));

    const assign = await assignPlanViaHttp(userId, proPlanId);
    expect(assign.statusCode).toBe(201);

    const after = await fetchLeadColumns(userId);
    expect(after.leadStatus).toBe("ganado");
    expect(after.purchasedPlanId).toBe(proPlanId);
    // The pre-existing comment is preserved verbatim — NOT prefixed, NOT
    // overwritten with "Flex Pro".
    expect(after.leadNotes).toBe("manual: muy interesado");
  });

  it("leaves empty-string lead_notes untouched and records the plan in purchased_plan_id", async () => {
    const userId = await createTrialLead({
      firstName: "Empty",
      lastName: "String",
      phone: "1140000003",
    });
    await seedTrialBooking(userId);

    // Some flows may have stored '' instead of NULL — the hook handles both.
    await app.db
      .update(users)
      .set({ leadNotes: "" })
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));

    const assign = await assignPlanViaHttp(userId, basicPlanId);
    expect(assign.statusCode).toBe(201);

    const after = await fetchLeadColumns(userId);
    expect(after.leadStatus).toBe("ganado");
    expect(after.purchasedPlanId).toBe(basicPlanId);
    // Hotfix 2026-07: notes are never auto-filled — '' stays as stored.
    expect(after.leadNotes).toBe("");
  });

  it("no-ops for non-trial users (no is_trial booking → no lead_status/lead_notes change)", async () => {
    // Register a regular freemium-style user via direct insert. NOT a trial
    // lead, so no is_trial=1 booking exists.
    const [row] = await app.db
      .insert(users)
      .values({
        email: "regular-noop@test.com",
        passwordHash: "x", // never logged in for this test
        firstName: "Regular",
        lastName: "NoTrial",
        branchId: BRANCH_ID,
        role: "member",
        level: "alfa",
        status: "freemium",
        // lead_status, lead_notes, created_by all stay NULL (non-lead).
      })
      .$returningId();
    const userId = row.id;

    // Sanity: no lead fields set.
    const before = await fetchLeadColumns(userId);
    expect(before.leadStatus).toBeNull();
    expect(before.leadNotes).toBeNull();
    expect(before.convertedAt).toBeNull();

    const assign = await assignPlanViaHttp(userId, basicPlanId);
    expect(assign.statusCode).toBe(201);

    const after = await fetchLeadColumns(userId);
    // The user becomes activo (paying member), but the lead lifecycle
    // columns stay NULL because the conversion predicate requires an
    // is_trial booking.
    expect(after.status).toBe("activo");
    expect(after.convertedAt).toBeNull();
    expect(after.leadStatus).toBeNull();
    expect(after.leadNotes).toBeNull();
    expect(after.purchasedPlanId).toBeNull();
  });

  it("is idempotent: re-assigning after conversion does NOT mutate purchased_plan_id again", async () => {
    const userId = await createTrialLead({
      firstName: "Idem",
      lastName: "Potent",
      phone: "1140000005",
    });
    await seedTrialBooking(userId);

    // First conversion: records basicPlanId as the purchased plan.
    const first = await assignPlanViaHttp(userId, basicPlanId);
    expect(first.statusCode).toBe(201);

    const afterFirst = await fetchLeadColumns(userId);
    expect(afterFirst.leadStatus).toBe("ganado");
    expect(afterFirst.purchasedPlanId).toBe(basicPlanId);
    const firstConvertedAt = afterFirst.convertedAt;
    expect(firstConvertedAt).not.toBeNull();

    // Cancel the active sub so a second assign is allowed. The service
    // enforces "one active/paused sub per member" so the cancel is mandatory.
    // Phase 111 REQ-3: cancel refuses while non-voided charge transactions
    // exist on the sub (the auto-recorded assignment charge), so pre-void
    // them (same pattern used by test/subscriptions/lifecycle.test.ts).
    const subId = first.body.id as number;
    const [adminRow] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(tenantWhere(users, TEMPLO_CTX), eq(users.email, "admin@test.com")),
      )
      .limit(1);
    const linkedTxIds = await app.db
      .select({ id: financialTransactions.id })
      .from(transactionLinks)
      .innerJoin(
        financialTransactions,
        and(
          tenantWhere(financialTransactions, TEMPLO_CTX),
          eq(transactionLinks.transactionId, financialTransactions.id),
        ),
      )
      .where(
        and(
          tenantWhere(transactionLinks, TEMPLO_CTX),
          eq(transactionLinks.targetKind, "subscription"),
          eq(transactionLinks.targetId, subId),
        ),
      );
    for (const t of linkedTxIds) {
      await app.db
        .update(financialTransactions)
        .set({
          voidedAt: new Date(),
          voidedBy: adminRow?.id ?? null,
          voidReason: "test setup — pre-void for idempotence test",
        })
        .where(
          and(
            tenantWhere(financialTransactions, TEMPLO_CTX),
            eq(financialTransactions.id, t.id),
          ),
        );
    }

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${userId}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(cancelRes.statusCode).toBe(200);

    // Now re-assign a DIFFERENT plan. Hook should NOT touch purchased_plan_id
    // because converted_at is already set (the conversion predicate is gated
    // on `converted_at IS NULL`).
    const second = await assignPlanViaHttp(userId, proPlanId);
    expect(second.statusCode).toBe(201);

    const afterSecond = await fetchLeadColumns(userId);
    // lead_status stays 'ganado' (already set by the first conversion);
    // purchased_plan_id keeps the ORIGINAL plan (what they bought when
    // converting), not the re-assigned one.
    expect(afterSecond.leadStatus).toBe("ganado");
    expect(afterSecond.purchasedPlanId).toBe(basicPlanId);
    // converted_at is set-once: same timestamp as the first conversion.
    expect(afterSecond.convertedAt?.toISOString()).toBe(
      firstConvertedAt?.toISOString(),
    );
  });
});
