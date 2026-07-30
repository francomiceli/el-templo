/**
 * Phase 139 Plan 03 — MovementService integration tests (MOV-01..04).
 *
 * Drives registerMovement / registerExpense / voidMovement / voidExpense
 * directly through the service for the data-integrity assertions, and exercises
 * the routes via app.inject for the RBAC 403 case. Asserts row counts + kinds +
 * links via direct schema selects, firmeBalance via getBalance, the
 * 'reconciliation' audit trail via a select on audit_log, and that the member
 * `balances` table is never touched (applyDelta no-op, D-07).
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>) per
 * test/setup.ts. Reuses the createTestApp + branch/caja bootstrap pattern from
 * cash-register-service.test.ts so the harness wiring is identical.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray, and } from "drizzle-orm";
import { createTestApp, getAuthToken, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { MovementService } from "../../src/modules/finance/movement-service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let cashRegisterService: CashRegisterService;
let movementService: MovementService;
let adminId: number;
// Phase 147 (EGR-02): registerExpense now requires a valid cost center. Resolved
// from the migration-0161 AR seed ("Varios") in beforeAll.
let costCenterId: number;

// An ARS branch + its cajas. Created in beforeAll, torn down in afterAll.
let arsBranchId: number;
const CUTOFF = "2020-01-01"; // well before "today" so movements count
const seededCajaIds: number[] = [];

// Helper: create a fresh efectivo caja with a known opening balance.
async function newCaja(
  opening: number,
  currency = "ARS",
  branchId: number | null = arsBranchId,
): Promise<number> {
  const [caja] = await app.db.insert(schema.cashRegisters).values({
    name: `MOV-Test ${Date.now()}-${Math.random()}`,
    type: "efectivo",
    branchId,
    currency,
    openingBalance: opening,
    cutoffDate: CUTOFF,
  });
  const id = Number(caja.insertId);
  seededCajaIds.push(id);
  return id;
}

beforeAll(async () => {
  app = await createTestApp();
  cashRegisterService = new CashRegisterService(app.db, app.log);
  const balanceService = new BalanceService(app.db, app.log);
  const txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    cashRegisterService,
  );
  movementService = new MovementService(
    app.db,
    app.log,
    txService,
    cashRegisterService,
  );

  const [arsBranch] = await app.db
    .insert(schema.branches)
    .values({ name: "MOV-Test ARS", code: `MOVAR${Date.now() % 100000}` });
  arsBranchId = Number(arsBranch.insertId);

  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  if (!admin) {
    throw new Error(
      "Seeded admin@test.com user not found — check test/setup.ts",
    );
  }
  adminId = admin.id;

  // Phase 147 (EGR-02): a valid AR cost center for the expense tests (seeded by
  // migration 0161). Fallback-insert keeps the harness robust if the seed drifts.
  const [seededCenter] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
      ),
    )
    .limit(1);
  if (seededCenter) {
    costCenterId = seededCenter.id;
  } else {
    const [created] = await app.db
      .insert(schema.costCenters)
      .values({ name: "Varios", country: "AR" });
    costCenterId = Number(created.insertId);
  }
});

afterAll(async () => {
  // Drop every ledger row referencing a seeded caja (NULL-member
  // movimientos/egresos/adjustments the member-keyed cleanup misses) + their
  // links, then the cajas, then the branch. Best-effort isolation.
  if (seededCajaIds.length > 0) {
    const txRows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        inArray(schema.financialTransactions.cashRegisterId, seededCajaIds),
      );
    const txIds = txRows.map((r) => r.id);
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(inArray(schema.transactionLinks.transactionId, txIds));
      await app.db
        .delete(schema.financialTransactions)
        .where(inArray(schema.financialTransactions.id, txIds));
    }
    await app.db
      .delete(schema.cashRegisters)
      .where(inArray(schema.cashRegisters.id, seededCajaIds));
  }
  await app.close();
});

describe("MovementService", () => {
  // ─── MOV-01: 2-row net-0 asiento + same-currency guard ───────────────────
  describe("MOV-01: registerMovement (2-row asiento, net 0)", () => {
    it("inserts exactly 2 linked cash_transfer rows, net 0, in one tx", async () => {
      const origenId = await newCaja(1000);
      const destinoId = await newCaja(500);

      const before =
        (await cashRegisterService.getBalance(TEMPLO_CTX, origenId))
          .firmeBalance +
        (await cashRegisterService.getBalance(TEMPLO_CTX, destinoId))
          .firmeBalance;

      const detail = await movementService.registerMovement(
        TEMPLO_CTX,
        { origenCajaId: origenId, destinoCajaId: destinoId, amount: 250 },
        adminId,
      );

      // Both rows are kind='cash_transfer', one outflow at origen, one inflow at destino.
      const [outflow] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, detail.outflowTxId));
      const [inflow] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, detail.inflowTxId));

      expect(outflow.kind).toBe("cash_transfer");
      expect(outflow.direction).toBe("outflow");
      expect(outflow.cashRegisterId).toBe(origenId);
      expect(outflow.memberId).toBeNull();
      expect(inflow.kind).toBe("cash_transfer");
      expect(inflow.direction).toBe("inflow");
      expect(inflow.cashRegisterId).toBe(destinoId);
      expect(inflow.memberId).toBeNull();

      // Linked both-ways via transaction_links (target_kind='transaction').
      const links = await app.db
        .select()
        .from(schema.transactionLinks)
        .where(
          inArray(schema.transactionLinks.transactionId, [
            detail.outflowTxId,
            detail.inflowTxId,
          ]),
        );
      expect(links.length).toBe(2);
      expect(links.every((l) => l.targetKind === "transaction")).toBe(true);

      // Net 0: the sum of both cajas' firmeBalance is unchanged; money moved.
      const after =
        (await cashRegisterService.getBalance(TEMPLO_CTX, origenId))
          .firmeBalance +
        (await cashRegisterService.getBalance(TEMPLO_CTX, destinoId))
          .firmeBalance;
      expect(after).toBe(before);
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, origenId))
          .firmeBalance,
      ).toBe(750);
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, destinoId))
          .firmeBalance,
      ).toBe(750);
    });

    it("a movement to a branch-less caja stores branch_id NULL on that leg", async () => {
      const origenId = await newCaja(1000, "ARS", arsBranchId);
      // central efectivo (branch-less) — branchId NULL.
      const centralId = await newCaja(0, "ARS", null);

      const detail = await movementService.registerMovement(
        TEMPLO_CTX,
        { origenCajaId: origenId, destinoCajaId: centralId, amount: 100 },
        adminId,
      );

      const [inflow] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, detail.inflowTxId));
      // destino is branch-less → branch_id NULL (Plan 01 made it nullable).
      expect(inflow.branchId).toBeNull();
      expect(inflow.cashRegisterId).toBe(centralId);
    });

    it("rejects a cross-currency movement before any row is written", async () => {
      const arsId = await newCaja(1000, "ARS");
      const eurId = await newCaja(1000, "EUR");

      const beforeCount = (
        await app.db
          .select({ id: schema.financialTransactions.id })
          .from(schema.financialTransactions)
          .where(
            inArray(schema.financialTransactions.cashRegisterId, [
              arsId,
              eurId,
            ]),
          )
      ).length;

      await expect(
        movementService.registerMovement(
          TEMPLO_CTX,
          { origenCajaId: arsId, destinoCajaId: eurId, amount: 100 },
          adminId,
        ),
      ).rejects.toThrow(/Moneda inconsistente/);

      // No partial state: zero rows written for either caja.
      const afterCount = (
        await app.db
          .select({ id: schema.financialTransactions.id })
          .from(schema.financialTransactions)
          .where(
            inArray(schema.financialTransactions.cashRegisterId, [
              arsId,
              eurId,
            ]),
          )
      ).length;
      expect(afterCount).toBe(beforeCount);
    });
  });

  // ─── MOV-02: reconciliation (esperado vs contado) ────────────────────────
  describe("MOV-02: reconciliation (D-04)", () => {
    it("counted < expected: adjustment corrects origen saldo + 'reconciliation' audit", async () => {
      const origenId = await newCaja(1000);
      const destinoId = await newCaja(0);

      // expected saldo of origen = 1000. Physical count is 900 (100 short).
      const detail = await movementService.registerMovement(
        TEMPLO_CTX,
        {
          origenCajaId: origenId,
          destinoCajaId: destinoId,
          amount: 200,
          countedAmount: 900,
        },
        adminId,
      );

      expect(detail.expectedAmount).toBe(1000);
      expect(detail.countedAmount).toBe(900);
      expect(detail.adjustmentTxId).not.toBeNull();

      // An adjustment row exists at origen, outflow (counted < expected), |diff| = 100.
      const [adj] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(
          eq(schema.financialTransactions.id, detail.adjustmentTxId as number),
        );
      expect(adj.kind).toBe("adjustment");
      expect(adj.direction).toBe("outflow");
      expect(adj.amount).toBe(100);
      expect(adj.cashRegisterId).toBe(origenId);

      // origen firmeBalance now reflects the physical count minus the movement:
      // 1000 (opening) − 200 (movement out) − 100 (adjustment) = 700 = counted(900) − 200.
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, origenId))
          .firmeBalance,
      ).toBe(700);

      // A 'reconciliation' audit row exists for this movement.
      const auditRows = await app.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "reconciliation"),
            eq(schema.auditLog.targetId, detail.outflowTxId),
          ),
        );
      expect(auditRows.length).toBe(1);
      const payload = auditRows[0].payloadJson as Record<string, unknown>;
      expect(payload.expected).toBe(1000);
      expect(payload.counted).toBe(900);
      expect(payload.diff).toBe(-100);
    });

    it("counted == expected: no adjustment row, but the audit trail is still written", async () => {
      const origenId = await newCaja(1000);
      const destinoId = await newCaja(0);

      const detail = await movementService.registerMovement(
        TEMPLO_CTX,
        {
          origenCajaId: origenId,
          destinoCajaId: destinoId,
          amount: 200,
          countedAmount: 1000, // matches expected exactly
        },
        adminId,
      );
      expect(detail.adjustmentTxId).toBeNull();

      // No adjustment row at origen (only the cash_transfer outflow leg).
      const origenRows = await app.db
        .select({ kind: schema.financialTransactions.kind })
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.cashRegisterId, origenId));
      expect(origenRows.some((r) => r.kind === "adjustment")).toBe(false);

      // The 'reconciliation' audit row is still written (cheap clean trail).
      const auditRows = await app.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "reconciliation"),
            eq(schema.auditLog.targetId, detail.outflowTxId),
          ),
        );
      expect(auditRows.length).toBe(1);
    });
  });

  // ─── MOV-03: egreso + applyDelta no-op ──────────────────────────────────
  describe("MOV-03: registerExpense (D-05)", () => {
    it("an expense reduces its caja firmeBalance by the amount; row is kind='expense', no links", async () => {
      const cajaId = await newCaja(1000);

      const { expenseTxId } = await movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId, amount: 333, costCenterId, notes: "Compra de agua" },
        adminId,
      );

      const [row] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, expenseTxId));
      expect(row.kind).toBe("expense");
      expect(row.direction).toBe("outflow");
      expect(row.memberId).toBeNull();
      expect(row.cashRegisterId).toBe(cajaId);

      const links = await app.db
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, expenseTxId));
      expect(links.length).toBe(0);

      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
      ).toBe(1000 - 333);
    });

    it("(D-07) registering a movement + an expense does NOT change the balances table", async () => {
      const beforeCount = (
        await app.db.select({ id: schema.balances.id }).from(schema.balances)
      ).length;

      const origenId = await newCaja(1000);
      const destinoId = await newCaja(0);
      await movementService.registerMovement(
        TEMPLO_CTX,
        { origenCajaId: origenId, destinoCajaId: destinoId, amount: 150 },
        adminId,
      );
      await movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId: origenId, amount: 50, costCenterId },
        adminId,
      );

      const afterCount = (
        await app.db.select({ id: schema.balances.id }).from(schema.balances)
      ).length;
      // applyDelta no-op: a movimiento/egreso never touches member balances.
      expect(afterCount).toBe(beforeCount);
    });
  });

  // ─── MOV-04: void-the-pair + void expense ───────────────────────────────
  describe("MOV-04: void (D-08)", () => {
    it("voidMovement voids BOTH legs (and the adjustment) and restores both saldos", async () => {
      const origenId = await newCaja(1000);
      const destinoId = await newCaja(500);

      const detail = await movementService.registerMovement(
        TEMPLO_CTX,
        {
          origenCajaId: origenId,
          destinoCajaId: destinoId,
          amount: 200,
          countedAmount: 950, // forces a −50 adjustment at origen
        },
        adminId,
      );
      expect(detail.adjustmentTxId).not.toBeNull();

      // Void via EITHER leg id — voidMovement discovers the sibling + adjustment.
      await movementService.voidMovement(
        TEMPLO_CTX,
        detail.outflowTxId,
        adminId,
        "Movimiento equivocado",
      );

      // All three rows have voided_at set.
      const rows = await app.db
        .select({
          id: schema.financialTransactions.id,
          voidedAt: schema.financialTransactions.voidedAt,
        })
        .from(schema.financialTransactions)
        .where(
          inArray(schema.financialTransactions.id, [
            detail.outflowTxId,
            detail.inflowTxId,
            detail.adjustmentTxId as number,
          ]),
        );
      expect(rows.length).toBe(3);
      expect(rows.every((r) => r.voidedAt !== null)).toBe(true);

      // Saldos restored to pre-movement values (void reverses the effect).
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, origenId))
          .firmeBalance,
      ).toBe(1000);
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, destinoId))
          .firmeBalance,
      ).toBe(500);
    });

    it("voidExpense voids the single row and restores the caja saldo", async () => {
      const cajaId = await newCaja(1000);
      const { expenseTxId } = await movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId, amount: 400, costCenterId },
        adminId,
      );
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
      ).toBe(600);

      await movementService.voidExpense(
        TEMPLO_CTX,
        expenseTxId,
        adminId,
        "Egreso mal cargado",
      );

      const [row] = await app.db
        .select({ voidedAt: schema.financialTransactions.voidedAt })
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, expenseTxId));
      expect(row.voidedAt).not.toBeNull();
      // Saldo restored.
      expect(
        (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
      ).toBe(1000);
    });
  });

  // ─── RBAC: route-level 403 for non-privileged roles ─────────────────────
  describe("RBAC (T-139-06): coach/recepcion get 403 on the routes", () => {
    it("a coach token gets 403 on POST /movements and POST /expenses", async () => {
      // Create a coach user + token (FINANCE_VOID_ROLES excludes coach).
      const coachEmail = `mov-coach-${Date.now()}@test.com`;
      await createStaffUser(app, {
        email: coachEmail,
        password: "TestPass123!",
        firstName: "Coach",
        lastName: "Mov",
        role: "coach",
        branchId: arsBranchId,
      });
      const coachToken = await getAuthToken(app, coachEmail, "TestPass123!");

      const origenId = await newCaja(1000);
      const destinoId = await newCaja(0);

      const movRes = await app.inject({
        method: "POST",
        url: "/api/admin/finance/movements",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          origenCajaId: origenId,
          destinoCajaId: destinoId,
          amount: 100,
        },
      });
      expect(movRes.statusCode).toBe(403);

      const expRes = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: { cajaId: origenId, amount: 50, costCenterId },
      });
      expect(expRes.statusCode).toBe(403);

      // No rows were written by the rejected requests.
      const rows = await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.financialTransactions)
        .where(
          inArray(schema.financialTransactions.cashRegisterId, [
            origenId,
            destinoId,
          ]),
        );
      expect(rows.length).toBe(0);
    });
  });
});
