/**
 * Integration tests — módulo de Renovaciones (2026-09-24, brief Nacho).
 *
 * Endpoints:
 *   GET   /api/admin/renewals
 *   PATCH /api/admin/renewals/:subscriptionId
 *   POST  /api/admin/renewals/:subscriptionId/notes
 *   GET   /api/admin/renewals/reasons
 *   POST  /api/admin/renewals/reasons
 *   PATCH /api/admin/renewals/reasons/:id
 *
 * Cambio de alcance (2026-09-24, mismo día): sin `/templates` — el negocio no
 * manda WhatsApp desde el admin, usa su CRM (Kommo). El listado expone
 * `phoneE164` en su lugar (normalización propia, con unit tests en
 * `test/shared/phone.test.ts`).
 *
 * Convenciones (SPEC §"Tests de integración" + skill de migraciones):
 *   - Nunca hardcodear el id de `admin@test.com` — se resuelve desde la DB.
 *   - Fechas SIEMPRE relativas a hoy (`todayStr`/`dateOffsetStr`), nunca
 *     fijas al calendario.
 *   - Queries directas del test a tablas con tenant llevan
 *     `tenantWhere(tabla, TEMPLO_CTX)`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import type { RenewalRow } from "../../src/modules/renewals/types";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/admin/renewals";
const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

describe("Renewals API (módulo de Renovaciones)", () => {
  let app: FastifyInstance;
  let adminToken: string; // admin@test.com, rol owner (ADMIN_ROLES)
  let adminUserId: number;
  let branchAId: number;
  let branchBId: number;

  let planPresencialId: number; // durationDays 30, "Foundation"
  let planFlexId: number; // durationDays 30, "Flex" — para el cambio de plan
  let planOnlineId: number; // planCategory online_regular
  let planClaseUnicaId: number; // durationDays 5 (< 7, excluida)
  let planAuraId: number; // planCategory especial ("Actividades con Aura")

  let memberSeq = 0;

  beforeAll(async () => {
    app = await createTestApp();

    const [existingA] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));
    branchAId = existingA.id;

    await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Renovaciones B",
        code: "RENB",
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .onDuplicateKeyUpdate({ set: { name: "Sede Renovaciones B" } });
    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "RENB"));
    branchBId = b.id;

    const [adminRow] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    adminUserId = adminRow.id;
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    planPresencialId = await insertPlan("Foundation", "presencial", 30);
    planFlexId = await insertPlan("Flex", "presencial", 30);
    planOnlineId = await insertPlan("Online Regular", "online_regular", 30);
    planClaseUnicaId = await insertPlan("Clase Suelta", "presencial", 5);
    planAuraId = await insertPlan("Actividades con Aura", "especial", 30);
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function insertPlan(
    name: string,
    planCategory: "presencial" | "online_regular" | "especial",
    durationDays: number,
  ): Promise<number> {
    const [result] = await app.db.insert(schema.subscriptionPlans).values({
      tenantId: TENANT_TEMPLO,
      name: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory,
      priceRegular: 15000,
      priceZero: 10000,
      durationDays,
      classesPerWeek: 3,
      country: "AR",
      currency: "ARS",
    });
    return (result as unknown as { insertId: number }).insertId;
  }

  async function insertMember(branchId = branchAId): Promise<number> {
    memberSeq += 1;
    const [result] = await app.db.insert(schema.users).values({
      tenantId: TENANT_TEMPLO,
      email: `renov-m${memberSeq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Socio",
      lastName: `Renov${memberSeq}`,
      branchId,
      role: "member",
    });
    return (result as unknown as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    planId: number;
    branchId?: number;
    status?:
      | "active"
      | "paused"
      | "cancelled"
      | "expired"
      | "completed"
      | "changed"
      | "scheduled";
    startDate: string;
    endDate: string | null;
    pauseEndDate?: string | null;
    /** Cuándo se registró la sub (default: ahora, como en la DB). */
    createdAt?: Date;
  }): Promise<number> {
    const [result] = await app.db.insert(schema.subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId: opts.userId,
      planId: opts.planId,
      branchId: opts.branchId ?? branchAId,
      status: opts.status ?? "active",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pauseEndDate: opts.pauseEndDate ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
    return (result as unknown as { insertId: number }).insertId;
  }

  function listUrl(
    dateFrom: string,
    dateTo: string,
    branchId?: number,
    activityType?: string,
  ): string {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (branchId !== undefined) params.set("branchId", String(branchId));
    if (activityType !== undefined) params.set("activityType", activityType);
    return `${BASE}?${params.toString()}`;
  }

  async function getList(
    token: string,
    dateFrom: string,
    dateTo: string,
    branchId?: number,
    activityType?: string,
  ) {
    const res = await app.inject({
      method: "GET",
      url: listUrl(dateFrom, dateTo, branchId, activityType),
      headers: { Authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  function findRow(
    body: { rows: RenewalRow[] },
    subId: number,
  ): RenewalRow | undefined {
    return body.rows.find((r) => r.subscriptionId === subId);
  }

  // ─── Derivación de estado ───────────────────────────────────────────────

  describe("GET /api/admin/renewals — derivación de estado", () => {
    it("renovó ANTES de vencer (programada) → renovo, con el plan nuevo correcto", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "active",
      });
      // La programada arranca ANTES del vencimiento (renovación anticipada,
      // sin piso — SPEC línea 30).
      await insertSub({
        userId,
        planId: planFlexId,
        startDate: dateOffsetStr(-1),
        endDate: dateOffsetStr(29),
        status: "scheduled",
      });

      const { statusCode, body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(statusCode).toBe(200);
      const row = findRow(body, subId);
      expect(row?.status).toBe("renovo");
      expect(row?.newPlanId).toBe(planFlexId);
      expect(row?.newPlanName).toContain("Flex");
    });

    it("renovó DENTRO de la ventana (+5 días) → renovo", async () => {
      const userId = await insertMember();
      const endDate = dateOffsetStr(-2);
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-32),
        endDate,
        status: "expired",
      });
      await insertSub({
        userId,
        planId: planPresencialId,
        // end + 5 días exactos → todavía cuenta como renovó.
        startDate: dateOffsetStr(3),
        endDate: dateOffsetStr(33),
        status: "active",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("renovo");
    });

    it("renovó FUERA de la ventana (+6 días) → volvio_tarde", async () => {
      const userId = await insertMember();
      const endDate = dateOffsetStr(-7);
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-37),
        endDate,
        status: "expired",
      });
      // Registrada Y arrancando en end + 6 días.
      await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-1),
        endDate: dateOffsetStr(29),
        status: "active",
        createdAt: new Date(`${dateOffsetStr(-1)}T15:00:00Z`),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("volvio_tarde");
    });

    it("renovó ANTES de vencer con inicio diferido (+6 días) → renovo (cuenta el registro)", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      // Caso real del Excel 22-28/09: renueva 2 días antes, arranca 6 días después.
      await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(6),
        endDate: dateOffsetStr(36),
        status: "scheduled",
        createdAt: new Date(`${dateOffsetStr(-2)}T15:00:00Z`),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subId)?.status).toBe("renovo");
    });

    it("cambio de sede SÍ cuenta como renovación", async () => {
      const userId = await insertMember(branchAId);
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        branchId: branchAId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId,
        planId: planPresencialId,
        branchId: branchBId, // otra sede
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "active",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("renovo");
    });

    it("sub siguiente CANCELLED no cuenta", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "cancelled",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("en_proceso");
    });

    it("comprar una CLASE ÚNICA/SUELTA después de vencer NO cuenta como renovación", async () => {
      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      await insertSub({
        userId,
        planId: planClaseUnicaId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(6),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("en_proceso");
      expect(row?.newPlanId).toBeNull();
    });

    it("sub ONLINE no cuenta como renovación de una PRESENCIAL", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId,
        planId: planOnlineId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "active",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("en_proceso");
    });

    it("pausada → status pausada con pauseEndDate expuesto", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const pauseEndDate = dateOffsetStr(10);
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "paused",
        pauseEndDate,
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("pausada");
      expect(row?.pauseEndDate).toBe(pauseEndDate);
    });

    it("completed incluida; cancelled/changed/scheduled EXCLUIDAS del listado", async () => {
      const uCompleted = await insertMember();
      const endDate = todayStr();
      const subCompleted = await insertSub({
        userId: uCompleted,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "completed",
      });

      const uCancelled = await insertMember();
      const subCancelled = await insertSub({
        userId: uCancelled,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "cancelled",
      });

      const uChanged = await insertMember();
      const subChanged = await insertSub({
        userId: uChanged,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "changed",
      });

      const uScheduled = await insertMember();
      const subScheduled = await insertSub({
        userId: uScheduled,
        planId: planPresencialId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "scheduled",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subCompleted)).toBeDefined();
      expect(findRow(body, subCancelled)).toBeUndefined();
      expect(findRow(body, subChanged)).toBeUndefined();
      expect(findRow(body, subScheduled)).toBeUndefined();
    });

    it("plan con duration_days < 7 (clase única/suelta) EXCLUIDO del listado", async () => {
      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planClaseUnicaId,
        startDate: dateOffsetStr(-5),
        endDate: todayStr(),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subId)).toBeUndefined();
    });

    it("rango de fechas INCLUSIVE en ambos extremos, orden fijo por end_date asc", async () => {
      const dateFrom = dateOffsetStr(-3);
      const dateTo = dateOffsetStr(3);

      const uFrom = await insertMember();
      const subFrom = await insertSub({
        userId: uFrom,
        planId: planPresencialId,
        startDate: dateOffsetStr(-33),
        endDate: dateFrom,
      });
      const uTo = await insertMember();
      const subTo = await insertSub({
        userId: uTo,
        planId: planPresencialId,
        startDate: dateOffsetStr(-27),
        endDate: dateTo,
      });
      const uMid = await insertMember();
      const subMid = await insertSub({
        userId: uMid,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      // Fuera del rango — no debe aparecer.
      const uOutside = await insertMember();
      await insertSub({
        userId: uOutside,
        planId: planPresencialId,
        startDate: dateOffsetStr(-40),
        endDate: dateOffsetStr(-10),
      });

      const { body } = await getList(adminToken, dateFrom, dateTo);
      expect(findRow(body, subFrom)).toBeDefined();
      expect(findRow(body, subTo)).toBeDefined();

      const ids = body.rows.map(
        (r: { subscriptionId: number }) => r.subscriptionId,
      );
      const idxFrom = ids.indexOf(subFrom);
      const idxMid = ids.indexOf(subMid);
      const idxTo = ids.indexOf(subTo);
      expect(idxFrom).toBeLessThan(idxMid);
      expect(idxMid).toBeLessThan(idxTo);
    });
  });

  // ─── Tipo de actividad (membresía vs Actividades con Aura) ──────────────

  describe("GET /api/admin/renewals — activityType", () => {
    /** Un socio con membresía presencial Y pase Aura que vencen en el rango. */
    async function seedMembresiaYAura(): Promise<{
      subMembresia: number;
      subAura: number;
    }> {
      const userId = await insertMember();
      const subMembresia = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      const subAura = await insertSub({
        userId,
        planId: planAuraId,
        startDate: dateOffsetStr(-29),
        endDate: dateOffsetStr(1),
      });
      return { subMembresia, subAura };
    }

    it("activityType=membresia excluye el pase Aura (filas Y KPIs)", async () => {
      const { subMembresia, subAura } = await seedMembresiaYAura();

      const { statusCode, body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
        undefined,
        "membresia",
      );
      expect(statusCode).toBe(200);
      expect(findRow(body, subMembresia)).toBeDefined();
      expect(findRow(body, subAura)).toBeUndefined();
      expect(body.kpis.total).toBe(body.rows.length);
      expect(body.kpis.total).toBe(1);
    });

    it("activityType=aura trae SOLO el pase Aura (filas Y KPIs)", async () => {
      const { subMembresia, subAura } = await seedMembresiaYAura();

      const { statusCode, body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
        undefined,
        "aura",
      );
      expect(statusCode).toBe(200);
      expect(findRow(body, subAura)).toBeDefined();
      expect(findRow(body, subMembresia)).toBeUndefined();
      expect(body.kpis.total).toBe(1);
    });

    it("sin activityType trae ambos (compatibilidad)", async () => {
      const { subMembresia, subAura } = await seedMembresiaYAura();

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subMembresia)).toBeDefined();
      expect(findRow(body, subAura)).toBeDefined();
      expect(body.kpis.total).toBe(2);
    });

    it("activityType inválido → 400", async () => {
      const { statusCode } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
        undefined,
        "yoga",
      );
      expect(statusCode).toBe(400);
    });

    it("un plan ONLINE no cuenta como renovación de un pase Aura", async () => {
      const userId = await insertMember();
      const subAura = await insertSub({
        userId,
        planId: planAuraId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      await insertSub({
        userId,
        planId: planOnlineId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subAura)?.status).toBe("en_proceso");
    });

    it("un pase Aura no cuenta como renovación de un plan ONLINE", async () => {
      const userId = await insertMember();
      const subOnline = await insertSub({
        userId,
        planId: planOnlineId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      await insertSub({
        userId,
        planId: planAuraId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subOnline)?.status).toBe("en_proceso");
    });

    it("un pase Aura nuevo SÍ renueva el pase Aura que vence", async () => {
      const userId = await insertMember();
      const subAura = await insertSub({
        userId,
        planId: planAuraId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
      await insertSub({
        userId,
        planId: planAuraId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subAura);
      expect(row?.status).toBe("renovo");
      expect(row?.newPlanId).toBe(planAuraId);
    });
  });

  // ─── KPIs ───────────────────────────────────────────────────────────────

  describe("GET /api/admin/renewals — KPIs y distribución de plan", () => {
    it("cuenta renovo/volvioTarde/noRenovo/pausada/enProceso, renewalRate y newPlanDistribution", async () => {
      const endDate = todayStr();

      // 1) renovo (mismo plan)
      const u1 = await insertMember();
      const s1 = await insertSub({
        userId: u1,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId: u1,
        planId: planPresencialId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "active",
      });

      // 2) renovo (cambia a Flex) — para newPlanDistribution
      const u2 = await insertMember();
      const s2 = await insertSub({
        userId: u2,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId: u2,
        planId: planFlexId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "active",
      });

      // 3) volvio_tarde
      const u3 = await insertMember();
      const s3 = await insertSub({
        userId: u3,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      await insertSub({
        userId: u3,
        planId: planPresencialId,
        startDate: dateOffsetStr(6),
        endDate: dateOffsetStr(36),
        status: "active",
        createdAt: new Date(`${dateOffsetStr(6)}T15:00:00Z`),
      });

      // 4) no_renovo (manual, con motivo)
      const u4 = await insertMember();
      const s4 = await insertSub({
        userId: u4,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });
      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Precio"),
          ),
        )
        .limit(1);
      await app.inject({
        method: "PATCH",
        url: `${BASE}/${s4}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo", reasonId: reasonRow.id },
      });

      // 5) pausada (fuera del denominador)
      const u5 = await insertMember();
      await insertSub({
        userId: u5,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
        status: "paused",
        pauseEndDate: dateOffsetStr(5),
      });

      // 6) en_proceso, sin contactar
      const u6 = await insertMember();
      await insertSub({
        userId: u6,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, s1)?.status).toBe("renovo");
      expect(findRow(body, s2)?.status).toBe("renovo");
      expect(findRow(body, s3)?.status).toBe("volvio_tarde");
      expect(findRow(body, s4)?.status).toBe("no_renovo");

      const kpis = body.kpis;
      expect(kpis.total).toBe(6);
      expect(kpis.renovo).toBe(2);
      expect(kpis.volvioTarde).toBe(1);
      expect(kpis.noRenovo).toBe(1);
      expect(kpis.pausadas).toBe(1);
      expect(kpis.enProceso).toBe(1);
      expect(kpis.sinContactar).toBe(1);
      // "Sobre gestionados" (brief §6): renovo/(renovo+noRenovo+volvioTarde) —
      // pausada y en_proceso quedan FUERA del denominador.
      expect(kpis.renewalRate).toBeCloseTo((2 / 4) * 100, 5);

      const flexEntry = kpis.newPlanDistribution.find(
        (d: { planId: number }) => d.planId === planFlexId,
      );
      const foundationEntry = kpis.newPlanDistribution.find(
        (d: { planId: number }) => d.planId === planPresencialId,
      );
      expect(flexEntry?.count).toBe(1);
      expect(foundationEntry?.count).toBe(1);
      expect(flexEntry?.percentage).toBeCloseTo(50, 5);
    });

    it("dateFrom > dateTo → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: listUrl(dateOffsetStr(5), dateOffsetStr(-5)),
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rango mayor a 93 días → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: listUrl(dateOffsetStr(-50), dateOffsetStr(50)),
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── PATCH /:subscriptionId ───────────────────────────────────────────

  describe("PATCH /api/admin/renewals/:subscriptionId", () => {
    async function makeExpiringRow(): Promise<number> {
      const userId = await insertMember();
      return insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });
    }

    it("sub CANCELADA (fuera del listado) → 404 y no escribe followup", async () => {
      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
        status: "cancelled",
      });
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { messageCount: 1 },
      });
      expect(res.statusCode).toBe(404);

      const followups = await app.db
        .select({ id: schema.renewalFollowups.id })
        .from(schema.renewalFollowups)
        .where(
          and(
            tenantWhere(schema.renewalFollowups, TEMPLO_CTX),
            eq(schema.renewalFollowups.subscriptionId, subId),
          ),
        );
      expect(followups).toHaveLength(0);
    });

    it("manualStatus=no_renovo SIN motivo → 400 REASON_REQUIRED", async () => {
      const subId = await makeExpiringRow();
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe("REASON_REQUIRED");
    });

    it("manualStatus=no_renovo con reasonId=null explícito → 400 REASON_REQUIRED (no se cuela)", async () => {
      const subId = await makeExpiringRow();
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo", reasonId: null },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe("REASON_REQUIRED");
    });

    it("manualStatus=no_renovo con motivo inactivo → 400 REASON_REQUIRED", async () => {
      const subId = await makeExpiringRow();
      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Otro"),
          ),
        )
        .limit(1);
      await app.db
        .update(schema.renewalReasons)
        .set({ isActive: false })
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.id, reasonRow.id),
          ),
        );

      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo", reasonId: reasonRow.id },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe("REASON_REQUIRED");

      // `renewal_reasons` es catálogo sembrado, no se limpia entre tests (ver
      // docblock de TABLES_TO_CLEAN) — reactiva "Otro" para no dejarlo
      // inactivo para el resto del archivo (rompería "GET /reasons trae los
      // 6 motivos seed activos", más abajo en "Motivos de no renovación").
      await app.db
        .update(schema.renewalReasons)
        .set({ isActive: true })
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.id, reasonRow.id),
          ),
        );
    });

    it("manualStatus=no_renovo CON motivo → persiste, audita y devuelve la fila", async () => {
      const subId = await makeExpiringRow();
      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Viaje"),
          ),
        )
        .limit(1);

      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          manualStatus: "no_renovo",
          reasonId: reasonRow.id,
          reasonNote: "Se va 2 meses",
        },
      });
      expect(res.statusCode).toBe(200);
      const row = JSON.parse(res.body);
      expect(row.status).toBe("no_renovo");
      expect(row.reasonId).toBe(reasonRow.id);
      expect(row.reasonNote).toBe("Se va 2 meses");

      const [auditRow] = await app.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            tenantWhere(schema.auditLog, TEMPLO_CTX),
            eq(schema.auditLog.action, "renewal_followup_updated"),
          ),
        )
        .orderBy(schema.auditLog.id);
      expect(auditRow).toBeDefined();
      expect(auditRow.actorId).toBe(adminUserId);
      expect(auditRow.targetKind).toBe("renewal_followup");
    });

    it("no_renovo pisado por una renovación derivada → renovo + manualOverridden=true", async () => {
      const userId = await insertMember();
      const endDate = todayStr();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate,
      });

      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Precio"),
          ),
        )
        .limit(1);
      await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo", reasonId: reasonRow.id },
      });

      // Aparece el pago/renovación DESPUÉS.
      await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(1),
        endDate: dateOffsetStr(31),
        status: "active",
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.status).toBe("renovo");
      expect(row?.manualOverridden).toBe(true);
    });

    it("messageCount=4 + en_proceso → paraCerrar=true; setea lastMessageAt", async () => {
      const subId = await makeExpiringRow();
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { messageCount: 4 },
      });
      expect(res.statusCode).toBe(200);
      const row = JSON.parse(res.body);
      expect(row.messageCount).toBe(4);
      expect(row.status).toBe("en_proceso");
      expect(row.paraCerrar).toBe(true);
      expect(row.lastMessageAt).not.toBeNull();
    });

    it("volver a en_proceso limpia el motivo", async () => {
      const subId = await makeExpiringRow();
      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Lesión"),
          ),
        )
        .limit(1);
      await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "no_renovo", reasonId: reasonRow.id },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { manualStatus: "en_proceso" },
      });
      expect(res.statusCode).toBe(200);
      const row = JSON.parse(res.body);
      expect(row.status).toBe("en_proceso");
      expect(row.reasonId).toBeNull();
    });

    it("subscriptionId inexistente → 404", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE}/999999999`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { messageCount: 1 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /:subscriptionId/notes ──────────────────────────────────────

  describe("POST /api/admin/renewals/:subscriptionId/notes", () => {
    it("crea una member_note y aparece como lastNote en el listado", async () => {
      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const res = await app.inject({
        method: "POST",
        url: `${BASE}/${subId}/notes`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          content:
            "Contactada por WhatsApp, dice que renueva la semana que viene",
        },
      });
      expect(res.statusCode).toBe(201);
      const note = JSON.parse(res.body);
      expect(note.userId).toBe(userId);
      expect(note.content).toContain("WhatsApp");

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.lastNote?.content).toContain("WhatsApp");
    });

    it("subscriptionId inexistente → 404", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/999999999/notes`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { content: "x" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── Motivos y plantillas ──────────────────────────────────────────────

  describe("Motivos de no renovación", () => {
    it("GET /reasons trae los 6 motivos seed activos por default", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/reasons`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const reasons = JSON.parse(res.body);
      expect(reasons.length).toBe(6);
      expect(reasons.every((r: { isActive: boolean }) => r.isActive)).toBe(
        true,
      );
    });

    it("POST crea un motivo nuevo (ADMIN_ROLES)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/reasons`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { label: "Horarios" },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).label).toBe("Horarios");

      // `renewal_reasons` es catálogo SEMBRADO (no está en TABLES_TO_CLEAN,
      // ver docblock de test/helpers.ts) — se limpia acá para que una
      // corrida local repetida contra la misma DB tibia no choque con la
      // unique (tenant_id, label) del PRÓXIMO run.
      await app.db
        .delete(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Horarios"),
          ),
        );
    });

    it("PATCH desactiva un motivo; queda afuera del listado default (includeInactive=false)", async () => {
      const [reasonRow] = await app.db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.label, "Otro"),
          ),
        )
        .limit(1);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `${BASE}/reasons/${reasonRow.id}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });
      expect(patchRes.statusCode).toBe(200);

      const listRes = await app.inject({
        method: "GET",
        url: `${BASE}/reasons`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const reasons = JSON.parse(listRes.body);
      expect(
        reasons.find((r: { id: number }) => r.id === reasonRow.id),
      ).toBeUndefined();

      const listAllRes = await app.inject({
        method: "GET",
        url: `${BASE}/reasons?includeInactive=true`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const allReasons = JSON.parse(listAllRes.body);
      expect(
        allReasons.find((r: { id: number }) => r.id === reasonRow.id)?.isActive,
      ).toBe(false);

      // Reactiva "Otro" — `renewal_reasons` es catálogo sembrado (no se
      // limpia entre corridas, ver docblock de TABLES_TO_CLEAN), así que sin
      // esto una corrida local repetida arrancaría con "Otro" ya inactivo.
      await app.db
        .update(schema.renewalReasons)
        .set({ isActive: true })
        .where(
          and(
            tenantWhere(schema.renewalReasons, TEMPLO_CTX),
            eq(schema.renewalReasons.id, reasonRow.id),
          ),
        );
    });

    it("gestion NO puede crear/editar motivos → 403 (pero SÍ puede leerlos)", async () => {
      const u = `gestion-ren-${Date.now()}@test.local`;
      await createStaffUser(app, {
        email: u,
        password: "test1234",
        firstName: "Gestion",
        lastName: "Renov",
        role: "gestion",
        branchId: branchAId,
        country: "AR",
      });
      const gestionToken = await getAuthToken(app, u, "test1234");

      const postRes = await app.inject({
        method: "POST",
        url: `${BASE}/reasons`,
        headers: { Authorization: `Bearer ${gestionToken}` },
        payload: { label: "Otro motivo" },
      });
      expect(postRes.statusCode).toBe(403);

      const getRes = await app.inject({
        method: "GET",
        url: `${BASE}/reasons`,
        headers: { Authorization: `Bearer ${gestionToken}` },
      });
      expect(getRes.statusCode).toBe(200);
    });
  });

  // ─── phoneE164 ──────────────────────────────────────────────────────────

  describe("GET /api/admin/renewals — phoneE164", () => {
    it("normaliza un celular AR de 10 dígitos a +549…, según el país de la SEDE", async () => {
      const userId = await insertMember();
      await app.db
        .update(schema.users)
        .set({ phone: "1123456789" })
        .where(
          and(
            tenantWhere(schema.users, TEMPLO_CTX),
            eq(schema.users.id, userId),
          ),
        );
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        branchId: branchAId, // country "AR"
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.phone).toBe("1123456789");
      expect(row?.phoneE164).toBe("+5491123456789");
    });

    it("celular con largo inválido para el país de la sede → phoneE164 null", async () => {
      const userId = await insertMember();
      await app.db
        .update(schema.users)
        .set({ phone: "12345" })
        .where(
          and(
            tenantWhere(schema.users, TEMPLO_CTX),
            eq(schema.users.id, userId),
          ),
        );
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        branchId: branchAId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.phoneE164).toBeNull();
    });

    it("sin celular cargado → phoneE164 null", async () => {
      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const { body } = await getList(
        adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      const row = findRow(body, subId);
      expect(row?.phone).toBeNull();
      expect(row?.phoneE164).toBeNull();
    });
  });

  // ─── Aislamiento ────────────────────────────────────────────────────────

  describe("Aislamiento", () => {
    it("admin_sede solo ve/gestiona vencimientos de SU sede (404 en la ajena)", async () => {
      const u = `admin-sede-ren-${Date.now()}@test.local`;
      await createStaffUser(app, {
        email: u,
        password: "test1234",
        firstName: "AdminSede",
        lastName: "Renov",
        role: "admin_sede",
        branchId: branchBId,
        country: "AR",
      });
      const adminSedeToken = await getAuthToken(app, u, "test1234");

      const userOwn = await insertMember(branchBId);
      const subOwn = await insertSub({
        userId: userOwn,
        planId: planPresencialId,
        branchId: branchBId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const userOther = await insertMember(branchAId);
      const subOther = await insertSub({
        userId: userOther,
        planId: planPresencialId,
        branchId: branchAId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const { body } = await getList(
        adminSedeToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subOwn)).toBeDefined();
      expect(findRow(body, subOther)).toBeUndefined();

      const patchOwnRes = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subOwn}`,
        headers: { Authorization: `Bearer ${adminSedeToken}` },
        payload: { messageCount: 1 },
      });
      expect(patchOwnRes.statusCode).toBe(200);

      const patchOtherRes = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subOther}`,
        headers: { Authorization: `Bearer ${adminSedeToken}` },
        payload: { messageCount: 1 },
      });
      expect(patchOtherRes.statusCode).toBe(404);
    });

    it("tenant 2 no ve ni puede PATCHear/anotar subs del tenant 1 (404, no 403)", async () => {
      await limpiarSegundoGimnasio(app);
      const gym2 = await seedSecondTenant(app);

      const userId = await insertMember();
      const subId = await insertSub({
        userId,
        planId: planPresencialId,
        startDate: dateOffsetStr(-30),
        endDate: todayStr(),
      });

      const { body } = await getList(
        gym2.adminToken,
        dateOffsetStr(-7),
        dateOffsetStr(7),
      );
      expect(findRow(body, subId)).toBeUndefined();

      const patchRes = await app.inject({
        method: "PATCH",
        url: `${BASE}/${subId}`,
        headers: { Authorization: `Bearer ${gym2.adminToken}` },
        payload: { messageCount: 1 },
      });
      expect(patchRes.statusCode).toBe(404);

      const noteRes = await app.inject({
        method: "POST",
        url: `${BASE}/${subId}/notes`,
        headers: { Authorization: `Bearer ${gym2.adminToken}` },
        payload: { content: "x" },
      });
      expect(noteRes.statusCode).toBe(404);

      await limpiarSegundoGimnasio(app);
    });
  });
});
