/**
 * Hotfix seguridad tanda 2 (hallazgo #5) — mass-assignment en assign / renew /
 * change-plan de suscripciones.
 *
 * Los bodies de esas tres rutas ahora son CERRADOS (`additionalProperties:
 * false`). Con el Ajv de Fastify eso NO da 400: las claves que no están
 * declaradas se QUITAN en silencio (`removeAdditional`). Por eso estos tests no
 * esperan un 400: mandan un body válido MÁS las claves solo-server
 * (`cashRegisterIdOverride`, `createdMemberId`, `endDateOverride` en assign,
 * `recorderRole`, `idempotencyKey`, `branchId` en renew) y verifican el EFECTO
 * en la base:
 *
 *   - la caja del cobro es la que resuelve el server, no la inyectada;
 *   - `created_member_id` queda NULL;
 *   - `validation_status` queda 'validado' (recorderRole='coach' ignorado);
 *   - `idempotency_key` queda NULL;
 *   - `subscriptions.end_date` no es el 2099 inyectado;
 *   - el cobro de la renovación se imputa a la sede de la suscripción/socio,
 *     no a la sede ajena del body.
 *
 * Además verifica la fila de `audit_log` de la renovación (F4).
 *
 * Actor: recepcion (rol de SUBSCRIPTION_ROLES, el menos privilegiado que llega
 * a estas rutas junto con coach).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  createStaffUser,
  ensureEfectivoCaja,
} from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  SUBSCRIPTIONS_URL,
  createMember,
  createPlan,
  todayStr,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

/** Claves solo-server que un cliente NUNCA debería poder fijar. */
function claveInyectadas(extra: {
  cajaAjena: number;
  otroSocioId: number;
}): Record<string, unknown> {
  return {
    cashRegisterIdOverride: extra.cajaAjena,
    createdMemberId: extra.otroSocioId,
    recorderRole: "coach",
    idempotencyKey: "x-inyectada",
  };
}

describe("Subscriptions — mass-assignment (bodies cerrados)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let recepcionToken: string;
  let recepcionId: number;
  let gym2: SegundoGimnasio;
  let cajaBancoTemplo: number;
  let cajaGimnasioDos: number;
  let cajaEfectivoTemplo: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
    recepcionId = await createStaffUser(app, {
      email: "recepcion-massassign@test.com",
      password: "recepcion123",
      firstName: "Rec",
      lastName: "Mass",
      role: "recepcion",
      branchId: 1,
    });
    recepcionToken = await getAuthToken(
      app,
      "recepcion-massassign@test.com",
      "recepcion123",
    );

    // Caja efectivo de la sede 1 (la que el server resuelve para pago "cash").
    await ensureEfectivoCaja(app, 1);
    const [efectivo] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, 1),
        ),
      )
      .limit(1);
    cajaEfectivoTemplo = efectivo.id;

    // Caja ajena 1: una cuenta banco del MISMO gimnasio (no es la que resuelve el server).
    const [banco] = await app.db
      .insert(schema.cashRegisters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: `Banco inyectada ${Date.now()}`,
          type: "banco" as const,
          branchId: null,
          currency: "ARS",
          cutoffDate: "2020-01-01",
        }),
      )
      .$returningId();
    cajaBancoTemplo = banco.id;

    // Caja ajena 2: la caja efectivo de la sede del OTRO gimnasio.
    await ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS);
    const [efectivoDos] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, { tenantId: TENANT_DOS }),
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, gym2.branchId),
        ),
      )
      .limit(1);
    cajaGimnasioDos = efectivoDos.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, cajaBancoTemplo),
        ),
      );
    await app.close();
  });

  async function cobrosDelSocio(memberId: number) {
    return app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.memberId, memberId),
        ),
      )
      .orderBy(desc(schema.financialTransactions.id));
  }

  async function subPorId(id: number) {
    const [row] = await app.db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, id),
        ),
      )
      .limit(1);
    return row;
  }

  function assertCobroLimpio(
    cobro: Awaited<ReturnType<typeof cobrosDelSocio>>[number],
    sede: number,
  ): void {
    expect(cobro.cashRegisterId, "caja resuelta por el server").toBe(
      cajaEfectivoTemplo,
    );
    expect(cobro.cashRegisterId).not.toBe(cajaBancoTemplo);
    expect(cobro.cashRegisterId).not.toBe(cajaGimnasioDos);
    expect(cobro.createdMemberId, "created_member_id").toBeNull();
    expect(cobro.validationStatus, "recorderRole='coach' se ignora").toBe(
      "validado",
    );
    expect(cobro.idempotencyKey, "idempotency_key").toBeNull();
    expect(cobro.branchId).toBe(sede);
  }

  const bodyAssign = (planId: number): Record<string, unknown> => ({
    planId,
    branchId: 1,
    startDate: todayStr(),
    priceTypeApplied: "regular",
    paymentMethod: "cash",
  });

  it("assign: cashRegisterIdOverride, createdMemberId, endDateOverride, recorderRole e idempotencyKey del body se ignoran", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Mass assign plan",
      priceRegular: 15000,
      durationDays: 30,
    });
    const socio = await createMember(app);
    const otro = await createMember(app, { email: "otro-socio-ma@test.com" });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/assign`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: {
        ...bodyAssign(plan.id),
        ...claveInyectadas({
          cajaAjena: cajaBancoTemplo,
          otroSocioId: otro.id,
        }),
        endDateOverride: "2099-01-01",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const sub = JSON.parse(res.body) as { id: number; endDate: string };

    // La sub: vigencia normal del plan, NO el 2099 inyectado.
    const fila = await subPorId(sub.id);
    expect(fila.endDate).not.toBe("2099-01-01");
    expect(sub.endDate).not.toBe("2099-01-01");

    const cobros = await cobrosDelSocio(socio.id);
    expect(cobros.length).toBeGreaterThan(0);
    for (const cobro of cobros) assertCobroLimpio(cobro, 1);
  });

  it("assign con caja de OTRO gimnasio inyectada: el cobro cae en la caja del server", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Mass assign plan caja ajena",
      priceRegular: 15000,
    });
    const socio = await createMember(app);

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/assign`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: {
        ...bodyAssign(plan.id),
        cashRegisterIdOverride: cajaGimnasioDos,
      },
    });
    expect(res.statusCode, res.body).toBe(201);

    const cobros = await cobrosDelSocio(socio.id);
    expect(cobros.length).toBeGreaterThan(0);
    for (const cobro of cobros) assertCobroLimpio(cobro, 1);
  });

  it("renew: cashRegisterIdOverride, branchId de otra sede, recorderRole e idempotencyKey se ignoran, y queda audit_log", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Mass renew plan",
      priceRegular: 15000,
    });
    const socio = await createMember(app);
    const otro = await createMember(app, { email: "otro-socio-mr@test.com" });

    const alta = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: bodyAssign(plan.id),
    });
    expect(alta.statusCode, alta.body).toBe(201);
    const cobrosAntes = await cobrosDelSocio(socio.id);
    const idsAntes = new Set(cobrosAntes.map((c) => c.id));

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/renew`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: {
        paymentMethod: "cash",
        ...claveInyectadas({
          cajaAjena: cajaGimnasioDos,
          otroSocioId: otro.id,
        }),
        branchId: gym2.branchId,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const nueva = JSON.parse(res.body) as { id: number };

    const nuevos = (await cobrosDelSocio(socio.id)).filter(
      (c) => !idsAntes.has(c.id),
    );
    expect(nuevos.length).toBeGreaterThan(0);
    // La sede del cobro sale del socio/suscripción (sede 1), NO de la sede ajena del body.
    for (const cobro of nuevos) assertCobroLimpio(cobro, 1);

    const [audit] = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.action, "subscription_renewed"),
          eq(schema.auditLog.targetKind, "subscription"),
          eq(schema.auditLog.targetId, nueva.id),
        ),
      )
      .limit(1);
    expect(audit, "fila de audit_log de la renovación").toBeDefined();
    expect(audit.actorId).toBe(recepcionId);
    expect(audit.payloadJson).toMatchObject({
      subId: nueva.id,
      targetUserId: socio.id,
      planId: plan.id,
      branchId: 1,
      paymentMethod: "cash",
    });
  });

  it("change-plan: createdMemberId, cashRegisterIdOverride, recorderRole e idempotencyKey se ignoran", async () => {
    const planBarato = await createPlan(app, adminToken, {
      name: "Mass change plan A",
      priceRegular: 10000,
    });
    const planCaro = await createPlan(app, adminToken, {
      name: "Mass change plan B",
      priceRegular: 30000,
    });
    const socio = await createMember(app);
    const otro = await createMember(app, { email: "otro-socio-mc@test.com" });

    const alta = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: bodyAssign(planBarato.id),
    });
    expect(alta.statusCode, alta.body).toBe(201);
    const idsAntes = new Set((await cobrosDelSocio(socio.id)).map((c) => c.id));

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: {
        ...bodyAssign(planCaro.id),
        startMode: "now",
        ...claveInyectadas({
          cajaAjena: cajaBancoTemplo,
          otroSocioId: otro.id,
        }),
      },
    });
    expect(res.statusCode, res.body).toBe(201);

    const nuevos = (await cobrosDelSocio(socio.id)).filter(
      (c) => !idsAntes.has(c.id),
    );
    expect(nuevos.length).toBeGreaterThan(0);
    for (const cobro of nuevos) assertCobroLimpio(cobro, 1);
  });

  it("las claves legítimas del admin siguen funcionando (assign con priceOverride y notas)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Mass legit plan",
      priceRegular: 15000,
    });
    const socio = await createMember(app);

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ...bodyAssign(plan.id),
        priceOverrideAmount: 9000,
        priceOverrideReason: "Precio acordado",
        notes: "nota",
        amountReceived: 9000,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const fila = await subPorId((JSON.parse(res.body) as { id: number }).id);
    expect(fila.pricePaid).toBe(9000);
  });
});
