/**
 * Phase 146 — COBRO-03 / COBRO-04: imputar un cobro suelto pendiente
 * (advance_payment) al asignar un plan.
 *
 * Mecánica (atómica, dentro de la db.transaction de assignPlan):
 *   - se ANULA el advance_payment elegido (voidInTx) y
 *   - se RECREA un plan_charge vinculado a la nueva sub con la MISMA
 *     caja/monto/método del anticipo.
 *
 * Cobertura:
 *   - Happy: monto = precio → advance anulado, EXACTAMENTE 1 plan_charge
 *     validado vinculado a la sub con la misma caja/método, balance = 0.
 *   - COBRO-04: monto > precio → 400, el advance sigue pendiente (no anulado),
 *     no se crea sub ni plan_charge.
 *   - Guard T-146-08: anticipo de otro socio / ya validado → 400.
 *   - Atomicidad: un fallo POSTERIOR al void (applyDelta del recreate revienta)
 *     → el advance NO queda anulado (rollback total).
 *   - Sin regresión: assignPlan sin appliedMiscChargeId se comporta igual.
 *
 * El advance se siembra directo en DB (un cobro suelto no tiene links y no
 * toca el balance del socio) para controlar caja/método de forma determinista.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  ensureEfectivoCaja,
} from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  assignPlan,
  createMember,
  createPlan,
  todayStr,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura";
import {
  BalanceService,
  TransactionService,
  CashRegisterService,
} from "../../src/modules/finance";
import { BookingService } from "../../src/modules/scheduling/booking-service";
import { NotificationService } from "../../src/modules/notifications/service";

describe("Phase 146 — Imputar cobro suelto al asignar plan (COBRO-03/04)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: number;
  let cajaId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "admin@test.com"))
      .limit(1);
    if (!admin) throw new Error("admin@test.com seed missing");
    adminId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await ensureEfectivoCaja(app, 1, "ARS");
    const [caja] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, 1),
        ),
      )
      .limit(1);
    if (!caja) throw new Error("efectivo caja not seeded");
    cajaId = caja.id;
  });

  /** Seed a cobro suelto (advance_payment pendiente, sin links) directo en DB. */
  async function seedAdvance(opts: {
    memberId: number;
    amount: number;
    paymentMethod?: "cash" | "transfer" | "card";
    cashRegisterId?: number | null;
    validationStatus?: "pendiente" | "validado";
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.financialTransactions)
      .values({
        memberId: opts.memberId,
        kind: "advance_payment",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.paymentMethod ?? "transfer",
        transactionDate: todayStr(),
        effectiveDate: todayStr(),
        branchId: 1,
        cashRegisterId:
          opts.cashRegisterId === undefined ? cajaId : opts.cashRegisterId,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? "pendiente",
        miscReason: "otro",
        notes: "Cobro suelto de prueba",
      })
      .$returningId();
    return res.id;
  }

  /** All non-voided plan_charge rows linked to a given subscription. */
  async function planChargesForSub(subId: number) {
    const linkRows = await app.db
      .select({ transactionId: schema.transactionLinks.transactionId })
      .from(schema.transactionLinks)
      .where(
        and(
          eq(schema.transactionLinks.targetKind, "subscription"),
          eq(schema.transactionLinks.targetId, subId),
        ),
      );
    if (linkRows.length === 0) return [];
    return app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          inArray(
            schema.financialTransactions.id,
            linkRows.map((l) => l.transactionId),
          ),
          eq(schema.financialTransactions.kind, "plan_charge"),
        ),
      );
  }

  it("Happy — anticipo monto = precio → advance anulado + EXACTAMENTE 1 plan_charge validado con misma caja/método + balance 0", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute Happy Plan",
      priceRegular: 50000,
    });
    const member = await createMember(app);
    const advanceId = await seedAdvance({
      memberId: member.id,
      amount: 50000,
      paymentMethod: "transfer",
      cashRegisterId: cajaId,
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      paymentMethod: "cash", // debe ser overridden por el método del anticipo
      appliedMiscChargeId: advanceId,
    });
    expect(res.statusCode).toBe(201);
    const subId = res.body.id as number;

    // El anticipo quedó anulado.
    const [advance] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, advanceId))
      .limit(1);
    expect(advance?.voidedAt).not.toBeNull();
    expect(advance?.voidReason).toBe("Imputado al alta de plan");

    // EXACTAMENTE 1 plan_charge (no doble ingreso) — conteo de filas, no exists.
    const allPlanCharges = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.memberId, member.id),
          eq(schema.financialTransactions.kind, "plan_charge"),
        ),
      );
    expect(allPlanCharges).toHaveLength(1);

    const linked = await planChargesForSub(subId);
    expect(linked).toHaveLength(1);
    const charge = linked[0];
    expect(charge.amount).toBe(50000);
    expect(charge.paymentMethod).toBe("transfer"); // método del anticipo, no 'cash'
    expect(charge.cashRegisterId).toBe(cajaId); // caja del anticipo preservada
    expect(charge.validationStatus).toBe("validado"); // camino admin

    // Balance de la sub saldado a 0.
    const [bal] = await app.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, member.id),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subId),
        ),
      )
      .limit(1);
    expect(bal?.amount ?? 0).toBe(0);
  });

  it("COBRO-04 — anticipo monto > precio → 400 y el advance sigue pendiente (no anulado), sin sub ni plan_charge", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute Excedente Plan",
      priceRegular: 50000,
    });
    const member = await createMember(app);
    const advanceId = await seedAdvance({
      memberId: member.id,
      amount: 60000, // > pricePaid
      paymentMethod: "transfer",
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      appliedMiscChargeId: advanceId,
    });
    expect(res.statusCode).toBe(400);
    expect((res.body as { message?: string }).message ?? "").toMatch(
      /excede el precio del plan/i,
    );

    // El advance NO fue anulado y sigue pendiente.
    const [advance] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, advanceId))
      .limit(1);
    expect(advance?.voidedAt).toBeNull();
    expect(advance?.validationStatus).toBe("pendiente");

    // No se creó subscription ni plan_charge.
    const subs = await app.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, member.id));
    expect(subs).toHaveLength(0);

    const planCharges = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.memberId, member.id),
          eq(schema.financialTransactions.kind, "plan_charge"),
        ),
      );
    expect(planCharges).toHaveLength(0);
  });

  it("Guard T-146-08 — anticipo de OTRO socio → 400, nada se anula ni asigna", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute OtherOwner Plan",
      priceRegular: 50000,
    });
    const owner = await createMember(app, {
      email: "impute-owner@test.com",
    });
    const other = await createMember(app, {
      email: "impute-other@test.com",
    });
    const advanceId = await seedAdvance({
      memberId: owner.id,
      amount: 50000,
    });

    const res = await assignPlan(app, adminToken, other.id, {
      planId: plan.id,
      appliedMiscChargeId: advanceId,
    });
    expect(res.statusCode).toBe(400);

    const [advance] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, advanceId))
      .limit(1);
    expect(advance?.voidedAt).toBeNull();

    const subs = await app.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, other.id));
    expect(subs).toHaveLength(0);
  });

  it("Guard T-146-08 — anticipo ya VALIDADO (no pendiente) → 400", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute AlreadyValidated Plan",
      priceRegular: 50000,
    });
    const member = await createMember(app);
    const advanceId = await seedAdvance({
      memberId: member.id,
      amount: 50000,
      validationStatus: "validado",
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      appliedMiscChargeId: advanceId,
    });
    expect(res.statusCode).toBe(400);

    const subs = await app.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, member.id));
    expect(subs).toHaveLength(0);
  });

  it("Atomicidad — fallo POSTERIOR al void (applyDelta del recreate revienta) → el advance NO queda anulado", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute Atomicity Plan",
      priceRegular: 50000,
    });
    const member = await createMember(app);
    const advanceId = await seedAdvance({
      memberId: member.id,
      amount: 50000,
    });

    // applyDelta revienta SOLO en el recreate (plan_charge inflow). El void del
    // advance reversa con sign=-1 sobre kind='advance_payment' y pasa; el
    // create posterior del plan_charge dispara el throw → rollback total.
    const failingBalance = new BalanceService(app.db, app.log);
    const realApplyDelta = failingBalance.applyDelta.bind(failingBalance);
    failingBalance.applyDelta = async (tx, row, links, sign) => {
      if (row.kind === "plan_charge") {
        throw new Error("simulated post-void failure");
      }
      return realApplyDelta(tx, row, links, sign);
    };
    const cashRegisterSvc = new CashRegisterService(app.db, app.log);
    const txSvc = new TransactionService(
      app.db,
      app.log,
      failingBalance,
      cashRegisterSvc,
    );
    const auraSvc = new AuraService(app.db);
    const subSvc = new SubscriptionService(app.db, app.log, auraSvc, txSvc);
    const notifSvc = new NotificationService(app.db, app.log);
    const bookings = new BookingService(app.db, app.log, subSvc, notifSvc);
    subSvc.setBookingService(bookings);

    await expect(
      subSvc.assignPlan(
        member.id,
        {
          planId: plan.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          appliedMiscChargeId: advanceId,
        },
        adminId,
      ),
    ).rejects.toThrow(/simulated post-void failure/);

    // Invariante: el advance NO quedó anulado (rollback total del void).
    const [advance] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, advanceId))
      .limit(1);
    expect(advance?.voidedAt).toBeNull();
    expect(advance?.validationStatus).toBe("pendiente");

    // No subscription ni plan_charge persistidos.
    const subs = await app.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, member.id));
    expect(subs).toHaveLength(0);

    const planCharges = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.memberId, member.id),
          eq(schema.financialTransactions.kind, "plan_charge"),
        ),
      );
    expect(planCharges).toHaveLength(0);
  });

  it("Sin regresión — assignPlan sin appliedMiscChargeId crea el plan_charge normal", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Impute NoRegression Plan",
      priceRegular: 50000,
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      amountReceived: 50000,
    });
    expect(res.statusCode).toBe(201);
    const subId = res.body.id as number;

    const linked = await planChargesForSub(subId);
    expect(linked).toHaveLength(1);
    expect(linked[0].amount).toBe(50000);
    expect(linked[0].paymentMethod).toBe("cash");
  });
});
