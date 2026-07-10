/**
 * MemberFlowsService — altas vs bajas mensuales + detalle de bajas
 * (pedido staff 2026-07-10, tab Miembros).
 *
 * Real-MySQL integration, modeled on churn.test.ts (same expiry-cohort
 * engine for bajas). Covers:
 *   - Bajas share the churn cohort: a matured non-renewer counts as 1 baja in
 *     their expiry month; a renewer does not.
 *   - Altas are coverage-streak starts: a chained renewal is NOT an alta; a
 *     re-join after a gap larger than the window IS.
 *   - Legacy-import subs (createdAt < LEGACY_IMPORT_CUTOFF) never produce
 *     startDate-based altas; imported persons count in their registration
 *     month instead. The NOT EXISTS still SEES legacy subs, so a post-import
 *     renewal of an imported active member is not an alta, while a post-import
 *     re-join after a gap is.
 *   - In-grace expiries mark the month provisional and count in
 *     `bajasEnGracia` (not in `bajas`); an early renewer counts in neither.
 *   - Churned-members detail carries the ficha context (tenure, memberships
 *     paid, price) and excludes renewers.
 *   - Auth: gestion gets 403 (ADMIN_ROLES-only); admin 200; export streams an
 *     XLSX content type.
 *
 * TZ note (MEMORY analytics seed flake): every date is derived in SQL from
 * CURDATE() so maturity assertions stay aligned with maturedExpr's CURDATE().
 *
 * Do NOT run this suite locally (real MySQL — CI runs it on staging push).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { MemberFlowsService } from "../../src/modules/analytics/member-flows-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

const ANALYTICS_URL = "/api/admin/analytics";

describe("MemberFlowsService (altas vs bajas + detalle)", () => {
  let app: FastifyInstance;
  let svc: MemberFlowsService;
  let branchA: number;
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    svc = new MemberFlowsService(app.db, app.log);

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const [p] = await app.db.insert(subscriptionPlans).values({
      name: "Flows AR Mensual",
      country: "AR",
      currency: "ARS",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  let __memberSeq = 0;
  async function insertMember(): Promise<number> {
    __memberSeq += 1;
    const [u] = await app.db.insert(users).values({
      email: `flows-m${__memberSeq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Flo",
      lastName: "Ws",
      branchId: branchA,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    startDate: string;
    endDate: string;
    status?: "active" | "expired" | "paused";
    /** Simula una fila de la importación legacy: `createdAt` pre-cutoff. */
    legacy?: boolean;
  }): Promise<void> {
    const [r] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId,
      branchId: branchA,
      status: opts.status ?? "expired",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
    if (opts.legacy) {
      // Bien lejos del cutoff (2026-03-17) para que ningún corrimiento de TZ
      // lo cruce.
      await app.db
        .update(subscriptions)
        .set({ createdAt: sql`'2026-03-01 12:00:00'` })
        .where(eq(subscriptions.id, (r as { insertId: number }).insertId));
    }
  }

  /** Bucket mensual (`YYYY-MM`) del día CURDATE()+days. */
  async function monthBucket(days: number): Promise<string> {
    return (await dateOffset(days)).slice(0, 7);
  }

  /** Resolve `DATE_ADD/SUB(CURDATE(), INTERVAL n DAY)` to a literal YYYY-MM-DD. */
  async function dateOffset(days: number): Promise<string> {
    const interval = sql.raw(String(Math.abs(days)));
    const dateExpr =
      days >= 0
        ? sql`DATE_ADD(CURDATE(), INTERVAL ${interval} DAY)`
        : sql`DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
    const result = await app.db.execute(
      sql`SELECT DATE_FORMAT(${dateExpr}, '%Y-%m-%d') AS d`,
    );
    const rows = (Array.isArray(result) ? result[0] : result) as Array<{
      d: string;
    }>;
    return String(rows[0].d);
  }

  async function wideRange(): Promise<{ dateFrom: string; dateTo: string }> {
    return {
      dateFrom: await dateOffset(-120),
      dateTo: await dateOffset(1),
    };
  }

  function totals(series: Array<{ altas: number; bajas: number }>): {
    altas: number;
    bajas: number;
  } {
    return series.reduce(
      (acc, p) => ({ altas: acc.altas + p.altas, bajas: acc.bajas + p.bajas }),
      { altas: 0, bajas: 0 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Serie de flujos
  // ═══════════════════════════════════════════════════════════════════════

  it("cuenta 1 alta (inicio de racha) y 1 baja (vencimiento madurado sin renovar)", async () => {
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    expect(res.windowDays).toBe(15);
    const t = totals(res.series);
    expect(t.altas).toBe(1);
    expect(t.bajas).toBe(1);
  });

  it("una renovación encadenada NO es alta y el renovador NO es baja", async () => {
    const renewer = await insertMember();
    // Primer período (-80 → -50) renovado en cadena por el segundo (-50 → -20).
    await insertSub({
      userId: renewer,
      startDate: await dateOffset(-80),
      endDate: await dateOffset(-50),
    });
    await insertSub({
      userId: renewer,
      startDate: await dateOffset(-50),
      endDate: await dateOffset(-20),
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    // Una sola alta (la primera sub) — la renovación no arranca racha nueva.
    expect(t.altas).toBe(1);
    // Una sola baja: el ÚLTIMO vencimiento (-20, madurado) sin renovar.
    // El primero fue renovado dentro de la ventana.
    expect(t.bajas).toBe(1);
  });

  it("un reingreso después de un gap mayor a la ventana SÍ es alta", async () => {
    const rejoiner = await insertMember();
    // Primer ciclo: venció hace 60 días sin renovación en ventana → baja.
    await insertSub({
      userId: rejoiner,
      startDate: await dateOffset(-90),
      endDate: await dateOffset(-60),
    });
    // Reingreso 30 días después del vencimiento (gap > 15d) → alta nueva.
    await insertSub({
      userId: rejoiner,
      startDate: await dateOffset(-30),
      endDate: await dateOffset(10),
      status: "active",
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    expect(t.altas).toBe(2);
    // La baja del primer ciclo cuenta: el reingreso llegó fuera de la ventana.
    expect(t.bajas).toBe(1);
  });

  it("un vencimiento en gracia cuenta en bajasEnGracia (no en bajas) y marca el mes provisional", async () => {
    const inGrace = await insertMember();
    await insertSub({
      userId: inGrace,
      startDate: await dateOffset(-35),
      endDate: await dateOffset(-5), // dentro de la ventana de 15 días
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    expect(t.bajas).toBe(0);
    expect(res.series.reduce((a, p) => a + p.bajasEnGracia, 0)).toBe(1);
    expect(res.series.some((p) => p.bajasProvisional)).toBe(true);
  });

  it("un vencido en gracia que YA renovó no cuenta ni como baja ni en gracia", async () => {
    const earlyRenewer = await insertMember();
    await insertSub({
      userId: earlyRenewer,
      startDate: await dateOffset(-35),
      endDate: await dateOffset(-5),
    });
    await insertSub({
      userId: earlyRenewer,
      startDate: await dateOffset(-3),
      endDate: await dateOffset(27),
      status: "active",
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    expect(t.bajas).toBe(0);
    expect(res.series.reduce((a, p) => a + p.bajasEnGracia, 0)).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Importación legacy (altas híbridas)
  // ═══════════════════════════════════════════════════════════════════════

  it("una sub importada no genera alta por startDate: el importado cuenta en su mes de registro", async () => {
    const imported = await insertMember();
    // Registro real hace 100 días — el único dato de inicio confiable.
    await app.db
      .update(users)
      .set({ createdAt: sql`DATE_SUB(NOW(), INTERVAL 100 DAY)` })
      .where(eq(users.id, imported));
    // Sub importada "invertida" como las de prod: startDate placeholder
    // reciente, endDate histórico real.
    await insertSub({
      userId: imported,
      startDate: await dateOffset(-40),
      endDate: await dateOffset(-80),
      legacy: true,
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    expect(t.altas).toBe(1);
    // El alta cae en el mes de registro (-100d), no en el del placeholder (-40d).
    const altaPoint = res.series.find((p) => p.altas > 0);
    expect(altaPoint?.bucket).toBe(await monthBucket(-100));
    // La baja usa el endDate real (madurado, sin renovar).
    expect(t.bajas).toBe(1);
    const bajaPoint = res.series.find((p) => p.bajas > 0);
    expect(bajaPoint?.bucket).toBe(await monthBucket(-80));
  });

  it("la renovación post-importación de un importado activo NO es alta (el NOT EXISTS ve la sub importada)", async () => {
    const importedActive = await insertMember();
    // Registrado hace 300 días — su alta de registro queda FUERA del rango.
    await app.db
      .update(users)
      .set({ createdAt: sql`DATE_SUB(NOW(), INTERVAL 300 DAY)` })
      .where(eq(users.id, importedActive));
    // Período vigente al importar (fechas reales) + renovación encadenada
    // post-importación.
    await insertSub({
      userId: importedActive,
      startDate: await dateOffset(-60),
      endDate: await dateOffset(-20),
      legacy: true,
    });
    await insertSub({
      userId: importedActive,
      startDate: await dateOffset(-20),
      endDate: await dateOffset(10),
      status: "active",
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    // Ni alta por registro (fuera de rango) ni por la renovación encadenada.
    expect(t.altas).toBe(0);
    expect(t.bajas).toBe(0);
  });

  it("un reingreso post-importación de un importado SÍ es alta", async () => {
    const rejoiner = await insertMember();
    await app.db
      .update(users)
      .set({ createdAt: sql`DATE_SUB(NOW(), INTERVAL 300 DAY)` })
      .where(eq(users.id, rejoiner));
    // Último período del sistema viejo: venció hace 90 días.
    await insertSub({
      userId: rejoiner,
      startDate: await dateOffset(-120),
      endDate: await dateOffset(-90),
      legacy: true,
    });
    // Vuelve hace 10 días (gap >> ventana) → alta nueva del sistema.
    await insertSub({
      userId: rejoiner,
      startDate: await dateOffset(-10),
      endDate: await dateOffset(20),
      status: "active",
    });

    const res = await svc.getMonthlyFlows(await wideRange());
    const t = totals(res.series);
    expect(t.altas).toBe(1);
    const altaPoint = res.series.find((p) => p.altas > 0);
    expect(altaPoint?.bucket).toBe(await monthBucket(-10));
    // El vencimiento viejo madura como baja: el reingreso llegó fuera de ventana.
    expect(t.bajas).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Detalle de bajas (ficha)
  // ═══════════════════════════════════════════════════════════════════════

  it("el detalle trae antigüedad, membresías pagadas y precio; excluye renovadores", async () => {
    // Churner con historia: 2 períodos, registrado hace ~13 meses.
    const churner = await insertMember();
    await app.db
      .update(users)
      .set({ createdAt: sql`DATE_SUB(NOW(), INTERVAL 400 DAY)` })
      .where(eq(users.id, churner));
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-100),
      endDate: await dateOffset(-70),
    });
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    // Renovador activo: NO debe aparecer.
    const renewer = await insertMember();
    await insertSub({
      userId: renewer,
      startDate: await dateOffset(-60),
      endDate: await dateOffset(-30),
    });
    await insertSub({
      userId: renewer,
      startDate: await dateOffset(-30),
      endDate: await dateOffset(5),
      status: "active",
    });

    const members = await svc.getChurnedMembers(await wideRange());
    expect(members).toHaveLength(1);
    const row = members[0];
    expect(row.userId).toBe(churner);
    expect(row.membershipsPaid).toBe(2);
    expect(row.pricePaid).toBe(15000);
    expect(row.currency).toBe("ARS");
    expect(row.planName).toBe("Flows AR Mensual");
    // ~360 días entre registro (-400d) y baja (-40d) → 11 o 12 meses.
    expect(row.tenureMonths).toBeGreaterThanOrEqual(11);
    expect(row.tenureMonths).toBeLessThanOrEqual(12);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth + wire
  // ═══════════════════════════════════════════════════════════════════════

  describe("auth y wire shape", () => {
    it("gestion recibe 403 en /member-flows y /churned-members", async () => {
      await createStaffUser(app, {
        email: "gestion-flows@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-flows@test.com",
        "gestionpass123",
      );
      for (const path of ["member-flows", "churned-members"]) {
        const res = await app.inject({
          method: "GET",
          url: `${ANALYTICS_URL}/${path}`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it("admin recibe 200 con la forma de la serie y el export como XLSX", async () => {
      const churner = await insertMember();
      await insertSub({
        userId: churner,
        startDate: await dateOffset(-70),
        endDate: await dateOffset(-40),
      });
      const adminToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );
      const range = await wideRange();

      const flowsRes = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/member-flows?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(flowsRes.statusCode).toBe(200);
      const flows = JSON.parse(flowsRes.body);
      expect(flows.windowDays).toBe(15);
      expect(Array.isArray(flows.series)).toBe(true);
      const point = flows.series.find((p: { bajas: number }) => p.bajas > 0);
      expect(point).toBeDefined();
      expect(point).toHaveProperty("bucket");
      expect(point).toHaveProperty("altas");
      expect(point).toHaveProperty("bajasEnGracia");
      expect(point).toHaveProperty("bajasProvisional");

      const exportRes = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/churned-members/export?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toContain("spreadsheetml");
      expect(exportRes.headers["content-disposition"]).toContain("bajas-");
    });
  });
});
