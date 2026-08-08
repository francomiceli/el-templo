/**
 * Integration tests for shared/audit-log helper.
 *
 * Phase 111 D-14: helper accepts a REQUIRED tx handle and writes a row
 * inside the caller's db.transaction. Atomicity is the contract — if the
 * surrounding transaction rolls back, the audit row vanishes too.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>) per
 * test/setup.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";
import { auditLog } from "../../src/modules/shared/audit-log";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

// 173-04 (D-01): `auditLog.write` ahora pide `ctx` PRIMERO. El gimnasio 1 es
// el unico tenant de este archivo — cero fixtures de segundo gimnasio, la
// prueba de aislamiento por tenant vive en la bateria ISO-03, no aca.
const CTX: TenantContext = { tenantId: 1 };

let app: FastifyInstance;
let actorId: number;
let memberId: number;
let branchId: number;

beforeAll(async () => {
  app = await createTestApp();

  // Use the seeded admin as the actor (role/user must satisfy the
  // actor_id FK to users.id).
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!admin) {
    throw new Error(
      "Seeded admin@test.com user not found — check test/setup.ts seed",
    );
  }
  actorId = admin.id;
  branchId = admin.branchId ?? 1;

  // Register a member to use as the audit target.
  const member = await registerUser(app, {
    email: `audit-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Audit",
    lastName: "Target",
    branchId,
  });
  memberId = (member.user as { id: number }).id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Fase 173 (ADO-02): `audit_log` entra a TENANT_STRICT_MODULES — el DELETE
  // de conveniencia se acota por gimnasio (categoría 2, docblock de
  // `test/helpers.ts`); este archivo no siembra en el gimnasio 2.
  await app.db.execute(
    sql`DELETE FROM audit_log WHERE tenant_id = ${CTX.tenantId}`,
  );
});

describe("auditLog.write — atomicity contract", () => {
  it("Test 1: happy path — row is persisted after transaction commits", async () => {
    await app.db.transaction(async (tx) => {
      await auditLog.write(CTX, tx, {
        actorId,
        action: "subscription_cancelled",
        targetKind: "subscription",
        targetId: 999,
        payload: {
          subId: 999,
          prevStatus: "active",
          newStatus: "cancelled",
          cancelledAt: "2026-05-01",
          notes: null,
          hasActiveTx: false,
        },
        reason: "Test cancellation",
      });
    });

    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.actorId, actorId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("subscription_cancelled");
    expect(rows[0].targetKind).toBe("subscription");
    expect(rows[0].targetId).toBe(999);
    expect(rows[0].reason).toBe("Test cancellation");
  });

  it("Test 2: rollback path — row vanishes when caller's transaction rolls back", async () => {
    const baselineCount = await countRows();
    expect(baselineCount).toBe(0);

    await expect(
      app.db.transaction(async (tx) => {
        await auditLog.write(CTX, tx, {
          actorId,
          action: "transaction_voided",
          targetKind: "transaction",
          targetId: 42,
          payload: { txId: 42, amount: 100, currency: "ARS" },
          reason: "Should not persist",
        });
        // Force rollback by throwing inside the caller's transaction.
        throw new Error("Simulated downstream failure");
      }),
    ).rejects.toThrow("Simulated downstream failure");

    const afterCount = await countRows();
    expect(afterCount).toBe(baselineCount);
  });

  it("Test 3: reason omitted — DB row has reason IS NULL", async () => {
    await app.db.transaction(async (tx) => {
      await auditLog.write(CTX, tx, {
        actorId,
        action: "plan_assigned",
        targetKind: "subscription",
        targetId: 1234,
        payload: { subId: 1234, planId: 7, branchId, pricePaid: 50000 },
        // reason intentionally omitted
      });
    });

    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.targetId, 1234),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBeNull();
  });

  it("Test 4: payload preserved as JSON — round-trip equality", async () => {
    const payload = {
      foo: "bar",
      n: 42,
      nested: { a: [1, 2, 3], b: true },
      currency: "ARS",
    };

    await app.db.transaction(async (tx) => {
      await auditLog.write(CTX, tx, {
        actorId,
        action: "reconciliation",
        targetKind: "member",
        targetId: memberId,
        payload,
      });
    });

    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.targetId, memberId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].payloadJson).toEqual(payload);
  });
});

async function countRows(): Promise<number> {
  const rows = await app.db
    .select()
    .from(schema.auditLog)
    .where(tenantWhere(schema.auditLog, CTX));
  return rows.length;
}
