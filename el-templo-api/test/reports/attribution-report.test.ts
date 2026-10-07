import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  AttributionReportService,
  codifiedSede,
  MoneyBag,
  type AttributionFunnel,
  type SearchConsoleReport,
} from "../../src/modules/marketing/report-service";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const CTX = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };

const URL_FUNNEL = "/api/admin/reports/attribution";
const URL_GSC = "/api/admin/reports/attribution/search-console";

/** Rango fijo (no depende del calendario): ambos bordes inclusive. */
const FROM = "2026-03-10";
const TO = "2026-03-20";
const RANGE = `dateFrom=${FROM}&dateTo=${TO}`;

const CODE_A = "SEDEA195R";
const CODE_B = "SEDEB195R";
const CODE_ES = "SEDEES195R";

/** GET autenticado (o sin token) que devuelve estado y cuerpo ya parseado. */
async function getJson<T>(
  app: FastifyInstance,
  url: string,
  token?: string,
): Promise<{ status: number; body: T }> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as T };
}

type Row = AttributionFunnel["rows"][number];
type Campaign = AttributionFunnel["campaigns"][number];

/**
 * Fase 195-10 (D-18/D-20/D-21): reporte de origen de altas.
 *
 * Dos sedes publicadas (`web_slug` + `publish_on_web = 1`: la regla "una sola
 * sede publicada" solo ve las publicadas) y una sede de España sin publicar.
 * El dataset se siembra UNA vez (solo se lee) y los casos lo consultan con
 * distintos filtros y roles.
 */
describe("Reportes de atribución — origen de altas", () => {
  let app: FastifyInstance;
  let branchA: number;
  let branchB: number;
  let branchEs: number;
  let planId: number;
  let scheduleId: number;
  let ownerToken: string;
  let adminArToken: string;
  let adminEsToken: string;
  let gestionToken: string;
  let coachToken: string;
  let seq = 0;

  // ─── helpers de siembra ──────────────────────────────────────────────────

  async function cleanTables(): Promise<void> {
    await app.db
      .delete(schema.adSpendDaily)
      .where(tenantWhere(schema.adSpendDaily, CTX));
    await app.db
      .delete(schema.adSpendDaily)
      .where(tenantWhere(schema.adSpendDaily, CTX_DOS));
    await app.db
      .delete(schema.searchConsoleStats)
      .where(tenantWhere(schema.searchConsoleStats, CTX));
    await app.db
      .delete(schema.searchConsoleStats)
      .where(tenantWhere(schema.searchConsoleStats, CTX_DOS));
    await app.db
      .delete(schema.subscriptions)
      .where(tenantWhere(schema.subscriptions, CTX_DOS));
    await limpiarSegundoGimnasio(app);
  }

  async function deleteTestBranches(): Promise<void> {
    for (const code of [CODE_A, CODE_B, CODE_ES]) {
      await app.db
        .delete(schema.branches)
        .where(
          and(
            eq(schema.branches.code, code),
            tenantWhere(schema.branches, CTX),
          ),
        );
    }
  }

  async function createBranch(
    code: string,
    over: Partial<typeof schema.branches.$inferInsert>,
  ): Promise<number> {
    const [b] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(CTX, {
          name: `Sede ${code}`,
          code,
          country: "AR",
          isVirtual: false,
          isActive: true,
          ...over,
        }),
      )
      .$returningId();
    return b.id;
  }

  interface AltaOpts {
    branch: number;
    channel: string;
    campaign?: string | null;
    referrerHost?: string | null;
    utmSource?: string | null;
    /** `YYYY-MM-DD HH:MM:SS` (se manda como literal: no depende del huso). */
    at: string;
    trial?: "activa" | "cancelada" | "no-prueba";
    subs?: Array<{
      price: number;
      currency?: string;
      type?: "regular" | "zero";
    }>;
  }

  /** Alta completa: usuario + fila de origen + reserva de prueba + suscripciones. */
  async function seedAlta(o: AltaOpts): Promise<number> {
    seq += 1;
    const m = await createTestMember(app, {
      email: `attr-rep-${Date.now().toString(36)}${seq}@test.com`,
      branchId: o.branch,
    });
    // `register` ya dejó una fila de origen ('unknown'): se reemplaza.
    await app.db
      .delete(schema.signupAttributions)
      .where(
        and(
          tenantWhere(schema.signupAttributions, CTX),
          eq(schema.signupAttributions.userId, m.id),
        ),
      );
    await app.db.insert(schema.signupAttributions).values(
      tenantValues(CTX, {
        userId: m.id,
        branchId: o.branch,
        channel: o.channel,
        utmCampaign: o.campaign ?? null,
        referrerHost: o.referrerHost ?? null,
        utmSource: o.utmSource ?? null,
        platform: "web",
        capturedVia: "register" as const,
        createdAt: sql`${o.at}`,
      }),
    );
    if (o.trial !== undefined) {
      await app.db.insert(schema.bookings).values(
        tenantValues(CTX, {
          memberId: m.id,
          scheduleId,
          bookingDate: "2026-03-16",
          status:
            o.trial === "cancelada"
              ? ("cancelado" as const)
              : ("reservado" as const),
          isTrial: o.trial !== "no-prueba",
        }),
      );
    }
    for (const s of o.subs ?? []) {
      await app.db.insert(schema.subscriptions).values(
        tenantValues(CTX, {
          userId: m.id,
          planId,
          branchId: o.branch,
          status: "active" as const,
          startDate: "2026-03-16",
          pricePaid: s.price,
          currency: s.currency ?? "ARS",
          priceTypeApplied: s.type ?? ("regular" as const),
        }),
      );
    }
    return m.id;
  }

  async function seedSpend(
    campaignId: string,
    name: string,
    date: string,
    spend: string,
    currency = "ARS",
    platform = "meta",
  ): Promise<void> {
    await app.db.insert(schema.adSpendDaily).values(
      tenantValues(CTX, {
        platform,
        accountId: "111",
        campaignId,
        campaignName: name,
        spendDate: date,
        spend,
        currency,
      }),
    );
  }

  const get = <T>(url: string, token?: string) => getJson<T>(app, url, token);

  const funnel = (qs = RANGE, token: string = ownerToken) =>
    get<AttributionFunnel>(`${URL_FUNNEL}?${qs}`, token);

  const findRow = (
    rows: Row[],
    channel: string,
    campaign: string | null,
    branchId: number | null,
  ): Row | undefined =>
    rows.find(
      (r) =>
        r.channel === channel &&
        r.utmCampaign === campaign &&
        r.branchId === branchId,
    );
  const findCampaign = (cs: Campaign[], name: string): Campaign | undefined =>
    cs.find((c) => c.utmCampaign === name);

  // ─── ciclo de vida ───────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);
    await cleanTables();
    await deleteTestBranches();

    branchA = await createBranch(CODE_A, {
      name: "Sede A 195",
      webSlug: "sede-a-195",
      publishOnWeb: true,
    });
    branchB = await createBranch(CODE_B, {
      name: "Sede B 195",
      webSlug: "sede-b-195",
      publishOnWeb: true,
    });
    // Tiene slug pero NO está publicada: no cuenta como sede codificable.
    branchEs = await createBranch(CODE_ES, {
      name: "Sede ES 195",
      country: "ES",
      webSlug: "sede-es-195",
      publishOnWeb: false,
    });

    const [activity] = await app.db
      .insert(schema.activities)
      .values(tenantValues(CTX, { name: "Act reporte 195", isActive: true }))
      .$returningId();
    const [schedule] = await app.db
      .insert(schema.schedules)
      .values(
        tenantValues(CTX, {
          branchId: branchA,
          activityId: activity.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
          isActive: true,
        }),
      )
      .$returningId();
    scheduleId = schedule.id;
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values(
        tenantValues(CTX, {
          name: "Plan reporte 195",
          planTier: "flex" as const,
          bookingMode: "flexible" as const,
          planCategory: "presencial" as const,
          priceRegular: 15000,
          priceZero: 10000,
          durationDays: 30,
          classesPerWeek: 3,
        }),
      )
      .$returningId();
    planId = plan.id;

    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const mk = async (
      email: string,
      role: string,
      branchId: number,
      country?: "AR" | "ES",
    ): Promise<string> => {
      await createStaffUser(app, {
        email,
        password: "pass123456",
        firstName: "Staff",
        lastName: role,
        role,
        branchId,
        country,
      });
      return getAuthToken(app, email, "pass123456");
    };
    adminArToken = await mk(
      "admin-ar-rep195@test.local",
      "admin",
      branchA,
      "AR",
    );
    adminEsToken = await mk(
      "admin-es-rep195@test.local",
      "admin",
      branchEs,
      "ES",
    );
    gestionToken = await mk(
      "gestion-rep195@test.local",
      "gestion",
      branchA,
      "AR",
    );
    coachToken = await mk("coach-rep195@test.local", "coach", branchA);

    // ── Altas dentro del rango ──
    // U1: Meta, campaña con mayúsculas (se normaliza), sede A, prueba + pago.
    await seedAlta({
      branch: branchA,
      channel: "meta_ads",
      campaign: "Promo-Octubre",
      at: "2026-03-15 12:00:00",
      trial: "activa",
      subs: [{ price: 1000 }],
    });
    // U2: misma campaña en la sede B; un usuario con dos pagos en monedas
    // distintas cuenta UNA vez y la facturación queda por moneda.
    await seedAlta({
      branch: branchB,
      channel: "meta_ads",
      campaign: "promo-octubre",
      at: "2026-03-15 13:00:00",
      trial: "activa",
      subs: [{ price: 2000 }, { price: 70, currency: "EUR" }],
    });
    // U3: la campaña codifica la sede A; dos pagos del mismo usuario suman.
    await seedAlta({
      branch: branchA,
      channel: "meta_ads",
      campaign: "sede-a-195-octubre",
      at: "2026-03-16 09:00:00",
      trial: "no-prueba",
      subs: [{ price: 300 }, { price: 200 }],
    });
    // U4: IA con referrer, prueba sin pago.
    await seedAlta({
      branch: branchA,
      channel: "ia",
      referrerHost: "chatgpt.com",
      // ChatGPT manda las dos señales: el sitio sale del referrer
      utmSource: "chatgpt",
      at: "2026-03-16 10:00:00",
      trial: "activa",
    });
    // U5: directo con prueba CANCELADA y un "pago" de tier zero: ni prueba ni pago.
    await seedAlta({
      branch: branchB,
      channel: "directo",
      at: "2026-03-17 10:00:00",
      trial: "cancelada",
      subs: [{ price: 800, type: "zero" }],
    });
    // U6: directo en el borde inferior del rango; reserva que NO es de prueba y
    // una suscripción gratis (pricePaid 0): ni prueba ni pago.
    await seedAlta({
      branch: branchB,
      channel: "directo",
      at: `${FROM} 00:00:00`,
      trial: "no-prueba",
      subs: [{ price: 0 }],
    });
    // U7: volante/QR en el borde superior (23:59:59 del último día): entra.
    await seedAlta({
      branch: branchA,
      channel: "qr",
      campaign: "volante-juan",
      at: `${TO} 23:59:59`,
      subs: [{ price: 300 }],
    });
    // U10: IA sin referrer, solo utm_source (cae al sitio del utm).
    await seedAlta({
      branch: branchB,
      channel: "ia",
      utmSource: "perplexity.ai",
      at: "2026-03-18 10:00:00",
      subs: [{ price: 400 }],
    });
    // U11: España (Meta, EUR).
    await seedAlta({
      branch: branchEs,
      channel: "meta_ads",
      campaign: "sede-es-195-promo",
      at: "2026-03-18 11:00:00",
      trial: "activa",
      subs: [{ price: 70, currency: "EUR" }],
    });
    // U10b: segundo alta de IA solo con utm_source (perplexity gana por cantidad).
    await seedAlta({
      branch: branchB,
      channel: "ia",
      utmSource: "perplexity.ai",
      at: "2026-03-18 12:00:00",
    });
    // U12: canal que NO es Meta con el nombre de una campaña con gasto de Meta
    // que codifica la sede A: el gasto no baja a esa fila.
    await seedAlta({
      branch: branchA,
      channel: "qr",
      campaign: "sede-a-195-octubre",
      at: "2026-03-16 11:00:00",
    });
    // U13: la misma campaña (codifica la sede A) con un alta en la sede B: la
    // fila de la sede B no hereda el gasto.
    await seedAlta({
      branch: branchB,
      channel: "meta_ads",
      campaign: "sede-a-195-octubre",
      at: "2026-03-16 12:00:00",
    });
    // U14: campaña con gasto y altas pero ningún alumno pago: sin costo.
    await seedAlta({
      branch: branchA,
      channel: "meta_ads",
      campaign: "sin-pagos",
      at: "2026-03-16 13:00:00",
      trial: "activa",
    });
    // Fuera del rango: un segundo antes y el día siguiente.
    await seedAlta({
      branch: branchA,
      channel: "meta_ads",
      campaign: "promo-octubre",
      at: "2026-03-09 23:59:59",
      trial: "activa",
      subs: [{ price: 9999 }],
    });
    await seedAlta({
      branch: branchB,
      channel: "directo",
      at: "2026-03-21 00:00:00",
      subs: [{ price: 8888 }],
    });

    // ── Gasto de Meta ──
    await seedSpend("c1", "Promo-Octubre ", "2026-03-12", "4000.00");
    await seedSpend("c1", "Promo-Octubre", "2026-03-13", "2000.00");
    await seedSpend("c2", "sede-a-195-octubre", "2026-03-14", "1500.00");
    await seedSpend("c3", "campaña-sin-altas", "2026-03-15", "700.00");
    await seedSpend("c4", "sede-es-195-promo", "2026-03-16", "120.00", "EUR");
    await seedSpend("c5", "sin-pagos", "2026-03-16", "250.00");
    // Bordes del rango: se incluyen los dos días extremos.
    await seedSpend("c6", "borde-desde", FROM, "10.00");
    await seedSpend("c7", "borde-hasta", TO, "20.00");
    // EUR sin altas cuyo nombre ordena PRIMERO: la moneda se ordena por código,
    // no por el orden en que llegan las filas.
    await seedSpend("c8", "aaa-sin-altas", "2026-03-17", "15.00", "EUR");
    // Fuera del rango (un día antes y un día después) y de otra plataforma.
    await seedSpend("c1", "Promo-Octubre", "2026-03-09", "999.00");
    await seedSpend("c1", "Promo-Octubre", "2026-03-21", "111.00");
    await seedSpend(
      "g1",
      "promo-octubre",
      "2026-03-14",
      "300.00",
      "ARS",
      "google",
    );
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanTables();
    await deleteTestBranches();
    await app.close();
  });

  // ─── embudo ──────────────────────────────────────────────────────────────

  describe("embudo por canal, campaña y sede", () => {
    it("agrupa por (canal, campaña normalizada, sede) con prueba y pago por usuario", async () => {
      const { status, body } = await funnel();
      expect(status).toBe(200);
      expect(body.range).toEqual({ dateFrom: FROM, dateTo: TO });

      const summary = body.rows.map((r) => [
        r.channel,
        r.utmCampaign,
        r.branchId,
        r.registros,
        r.conPrueba,
        r.pagaron,
      ]);
      expect(summary).toEqual([
        ["directo", null, branchB, 2, 0, 0],
        ["ia", null, branchA, 1, 1, 0],
        ["ia", null, branchB, 2, 0, 1],
        ["meta_ads", "promo-octubre", branchA, 1, 1, 1],
        ["meta_ads", "promo-octubre", branchB, 1, 1, 1],
        ["meta_ads", "sede-a-195-octubre", branchA, 1, 0, 1],
        ["meta_ads", "sede-a-195-octubre", branchB, 1, 0, 0],
        ["meta_ads", "sede-es-195-promo", branchEs, 1, 1, 1],
        ["meta_ads", "sin-pagos", branchA, 1, 1, 0],
        ["qr", "sede-a-195-octubre", branchA, 1, 0, 0],
        ["qr", "volante-juan", branchA, 1, 0, 1],
      ]);
      expect(findRow(body.rows, "directo", null, branchB)?.branchName).toBe(
        "Sede B 195",
      );
    });

    it("la facturación sale por moneda y nunca mezcla ARS con EUR", async () => {
      const { body } = await funnel();
      expect(
        findRow(body.rows, "meta_ads", "promo-octubre", branchA)?.facturacion,
      ).toEqual([{ currency: "ARS", amount: 1000 }]);
      expect(
        findRow(body.rows, "meta_ads", "promo-octubre", branchB)?.facturacion,
      ).toEqual([
        { currency: "ARS", amount: 2000 },
        { currency: "EUR", amount: 70 },
      ]);
      // dos suscripciones pagas del MISMO usuario: se suman y cuenta un alumno
      const u3 = findRow(body.rows, "meta_ads", "sede-a-195-octubre", branchA);
      expect(u3?.facturacion).toEqual([{ currency: "ARS", amount: 500 }]);
      expect(u3?.pagaron).toBe(1);
      expect(body.totals.facturacion).toEqual([
        { currency: "ARS", amount: 4200 },
        { currency: "EUR", amount: 140 },
      ]);
    });

    it("un pago de tier zero, una suscripción gratis y una prueba cancelada no cuentan", async () => {
      const { body } = await funnel();
      const directo = findRow(body.rows, "directo", null, branchB);
      expect(directo).toMatchObject({
        registros: 2,
        conPrueba: 0,
        pagaron: 0,
        facturacion: [],
      });
    });

    it("el rango es inclusivo en ambos bordes y excluye lo de afuera", async () => {
      const { body } = await funnel();
      // borde inferior (U6, 00:00:00) y superior (U7, 23:59:59) adentro
      expect(findRow(body.rows, "directo", null, branchB)?.registros).toBe(2);
      expect(findRow(body.rows, "qr", "volante-juan", branchA)?.registros).toBe(
        1,
      );
      // 2026-03-09 23:59:59 y 2026-03-21 00:00:00 afuera: ni 9999 ni 8888
      expect(
        findRow(body.rows, "meta_ads", "promo-octubre", branchA),
      ).toMatchObject({
        registros: 1,
        facturacion: [{ currency: "ARS", amount: 1000 }],
      });
      expect(body.totals.facturacion[0]).toEqual({
        currency: "ARS",
        amount: 4200,
      });
    });

    it("los totales suman las filas del embudo", async () => {
      const { body } = await funnel();
      expect(body.totals.registros).toBe(13);
      expect(body.totals.conPrueba).toBe(5);
      expect(body.totals.pagaron).toBe(6);
    });
  });

  // ─── gasto y costo ───────────────────────────────────────────────────────

  describe("gasto de Meta y costo por alumno pago", () => {
    it("la campaña multi-sede muestra el gasto en 'campaigns' y NO en las filas de sede", async () => {
      const { body } = await funnel();
      const promo = findCampaign(body.campaigns, "promo-octubre");
      expect(promo).toMatchObject({
        registros: 2,
        conPrueba: 2,
        pagaron: 2,
        gasto: [{ currency: "ARS", amount: 6000 }],
        costoPorAlumnoPago: [{ currency: "ARS", amount: 3000 }],
        sedeCodificada: null,
        facturacion: [
          { currency: "ARS", amount: 3000 },
          { currency: "EUR", amount: 70 },
        ],
      });
      expect(promo?.porSede).toEqual([
        {
          branchId: branchA,
          branchName: "Sede A 195",
          registros: 1,
          pagaron: 1,
        },
        {
          branchId: branchB,
          branchName: "Sede B 195",
          registros: 1,
          pagaron: 1,
        },
      ]);
      // el gasto no se duplica ni se reparte entre las dos filas de sede
      for (const b of [branchA, branchB]) {
        const row = findRow(body.rows, "meta_ads", "promo-octubre", b);
        expect(row?.gasto).toBeNull();
        expect(row?.costoPorAlumnoPago).toBeNull();
      }
    });

    it("el nombre de la campaña codifica la sede: el gasto baja a la fila de esa sede", async () => {
      const { body } = await funnel();
      const row = findRow(body.rows, "meta_ads", "sede-a-195-octubre", branchA);
      expect(row?.gasto).toEqual([{ currency: "ARS", amount: 1500 }]);
      expect(row?.costoPorAlumnoPago).toEqual([
        { currency: "ARS", amount: 1500 },
      ]);
      const camp = findCampaign(body.campaigns, "sede-a-195-octubre");
      expect(camp?.sedeCodificada).toEqual({
        branchId: branchA,
        branchName: "Sede A 195",
      });
      // en la campaña cuentan TODAS sus sedes y canales: 3 altas, 1 alumno pago
      expect(camp).toMatchObject({
        registros: 3,
        conPrueba: 0,
        pagaron: 1,
        gasto: [{ currency: "ARS", amount: 1500 }],
        costoPorAlumnoPago: [{ currency: "ARS", amount: 1500 }],
      });
      expect(
        camp?.porSede.map((p) => [p.branchId, p.registros, p.pagaron]),
      ).toEqual([
        [branchA, 2, 1],
        [branchB, 1, 0],
      ]);
    });

    it("el gasto solo baja a la fila Meta de la sede codificada, no a otro canal ni a otra sede", async () => {
      const { body } = await funnel();
      // misma campaña (codifica la sede A) pero en la sede B, y en el canal QR
      const enB = findRow(body.rows, "meta_ads", "sede-a-195-octubre", branchB);
      expect(enB).toMatchObject({
        registros: 1,
        gasto: null,
        costoPorAlumnoPago: null,
      });
      const qr = findRow(body.rows, "qr", "sede-a-195-octubre", branchA);
      expect(qr).toMatchObject({
        registros: 1,
        gasto: null,
        costoPorAlumnoPago: null,
      });
    });

    it("una campaña con gasto y altas pero sin alumnos pagos no inventa costo", async () => {
      const { body } = await funnel();
      const camp = findCampaign(body.campaigns, "sin-pagos");
      expect(camp).toMatchObject({
        registros: 1,
        pagaron: 0,
        gasto: [{ currency: "ARS", amount: 250 }],
        costoPorAlumnoPago: null,
      });
    });

    it("una campaña sin gasto cargado (o sin pagos) no inventa costo", async () => {
      const { body } = await funnel();
      const volante = findCampaign(body.campaigns, "volante-juan");
      expect(volante?.gasto).toBeNull();
      expect(volante?.costoPorAlumnoPago).toBeNull();
      expect(
        findRow(body.rows, "qr", "volante-juan", branchA)?.costoPorAlumnoPago,
      ).toBeNull();
    });

    it("totals.gasto sale de ad_spend_daily del rango, por moneda y solo de Meta", async () => {
      const { body } = await funnel();
      // 6000 + 1500 + 250 + 700 (campaña sin altas) + 10 y 20 (los dos días
      // extremos del rango) en ARS, 120 + 15 (sin altas) en EUR. No suma el gasto de un día
      // antes (999) ni de un día después (111) ni el de Google.
      expect(body.totals.gasto).toEqual([
        { currency: "ARS", amount: 8480 },
        { currency: "EUR", amount: 135 },
      ]);
    });

    it("gastoSinAtribuir lista solo las campañas con gasto y sin altas en el rango", async () => {
      const { body } = await funnel();
      expect(body.gastoSinAtribuir).toEqual([
        { campaignName: "aaa-sin-altas", currency: "EUR", amount: 15 },
        { campaignName: "borde-desde", currency: "ARS", amount: 10 },
        { campaignName: "borde-hasta", currency: "ARS", amount: 20 },
        { campaignName: "campaña-sin-altas", currency: "ARS", amount: 700 },
      ]);
    });

    it("la campaña con gasto en una moneda y altas pagas en otra no mezcla monedas", async () => {
      const { body } = await funnel();
      const bcn = findCampaign(body.campaigns, "sede-es-195-promo");
      // el slug de la sede de España no está publicado: no codifica la sede
      expect(bcn?.sedeCodificada).toBeNull();
      expect(
        findRow(body.rows, "meta_ads", "sede-es-195-promo", branchEs)?.gasto,
      ).toBeNull();
      expect(bcn?.gasto).toEqual([{ currency: "EUR", amount: 120 }]);
      expect(bcn?.costoPorAlumnoPago).toEqual([
        { currency: "EUR", amount: 120 },
      ]);
    });
  });

  // ─── IA ──────────────────────────────────────────────────────────────────

  describe("tráfico de IA", () => {
    it("detalla qué sitio mandó el alta (referrer o, sin referrer, utm_source)", async () => {
      const { body } = await funnel();
      expect(body.ia).toEqual([
        // por cantidad de altas, no por orden alfabético
        { referrerHost: "perplexity.ai", registros: 2, pagaron: 1 },
        { referrerHost: "chatgpt.com", registros: 1, pagaron: 0 },
      ]);
    });
  });

  // ─── filtros ─────────────────────────────────────────────────────────────

  describe("filtros de sede y país", () => {
    it("branchId deja solo las altas de esa sede y el gasto de campañas que la codifican", async () => {
      const b = await funnel(`${RANGE}&branchId=${branchB}`);
      expect(b.status).toBe(200);
      expect(
        b.body.rows.map((r) => [r.channel, r.utmCampaign, r.branchId]),
      ).toEqual([
        ["directo", null, branchB],
        ["ia", null, branchB],
        ["meta_ads", "promo-octubre", branchB],
        ["meta_ads", "sede-a-195-octubre", branchB],
      ]);
      // el gasto de 'promo-octubre' es de campaña (A + B): no es de la sede B
      expect(b.body.totals.gasto).toEqual([]);
      expect(b.body.gastoSinAtribuir).toEqual([]);
      expect(findCampaign(b.body.campaigns, "promo-octubre")).toMatchObject({
        registros: 1,
        gasto: null,
        costoPorAlumnoPago: null,
      });

      const a = await funnel(`${RANGE}&branchId=${branchA}`);
      expect(a.body.totals.gasto).toEqual([{ currency: "ARS", amount: 1500 }]);
      expect(
        findCampaign(a.body.campaigns, "sede-a-195-octubre")
          ?.costoPorAlumnoPago,
      ).toEqual([{ currency: "ARS", amount: 1500 }]);
    });

    it("el owner filtra por país: el gasto va en la moneda del país", async () => {
      const es = await funnel(`${RANGE}&country=ES`, ownerToken);
      expect(es.body.rows.map((r) => r.branchId)).toEqual([branchEs]);
      expect(es.body.totals.gasto).toEqual([{ currency: "EUR", amount: 135 }]);
      expect(es.body.ia).toEqual([]);
      expect(es.body.totals.registros).toBe(1);

      const ar = await funnel(`${RANGE}&country=AR`, ownerToken);
      expect(ar.body.rows.some((r) => r.branchId === branchEs)).toBe(false);
      expect(ar.body.totals.gasto).toEqual([{ currency: "ARS", amount: 8480 }]);
      expect(ar.body.totals.registros).toBe(12);
    });

    it("el owner sin filtro ve los dos países", async () => {
      const { status, body } = await funnel(RANGE, ownerToken);
      expect(status).toBe(200);
      expect(body.totals.registros).toBe(13);
    });

    it("un admin de país queda forzado a su país aunque pida otro", async () => {
      const ar = await funnel(`${RANGE}&country=ES`, adminArToken);
      expect(ar.body.rows.some((r) => r.branchId === branchEs)).toBe(false);
      expect(ar.body.totals.gasto).toEqual([{ currency: "ARS", amount: 8480 }]);

      const es = await funnel(`${RANGE}&country=AR`, adminEsToken);
      expect(es.body.rows.map((r) => r.branchId)).toEqual([branchEs]);
      expect(es.body.totals.gasto).toEqual([{ currency: "EUR", amount: 135 }]);
    });

    it("pedir una sede de otro país es 403", async () => {
      const res = await funnel(`${RANGE}&branchId=${branchA}`, adminEsToken);
      expect(res.status).toBe(403);
    });
  });

  // ─── validación y roles ──────────────────────────────────────────────────

  describe("validación y roles", () => {
    it("exige un rango de fechas válido", async () => {
      expect((await get(`${URL_FUNNEL}`, ownerToken)).status).toBe(400);
      expect(
        (await get(`${URL_FUNNEL}?dateFrom=${FROM}`, ownerToken)).status,
      ).toBe(400);
      expect(
        (await get(`${URL_FUNNEL}?dateFrom=ayer&dateTo=${TO}`, ownerToken))
          .status,
      ).toBe(400);
      expect(
        (await get(`${URL_FUNNEL}?dateFrom=${TO}&dateTo=${FROM}`, ownerToken))
          .status,
      ).toBe(400);
    });

    it("gestion y coach reciben 403; sin token 401", async () => {
      for (const url of [`${URL_FUNNEL}?${RANGE}`, URL_GSC]) {
        expect((await get(url, gestionToken)).status).toBe(403);
        expect((await get(url, coachToken)).status).toBe(403);
        expect((await get(url)).status).toBe(401);
      }
    });

    it("owner y admin acceden a los dos endpoints", async () => {
      for (const token of [ownerToken, adminArToken]) {
        expect((await get(`${URL_FUNNEL}?${RANGE}`, token)).status).toBe(200);
        expect((await get(URL_GSC, token)).status).toBe(200);
      }
    });
  });

  // ─── aislamiento de tenant ───────────────────────────────────────────────

  describe("aislamiento entre gimnasios", () => {
    let gym2: SegundoGimnasio;

    async function seedGym2(): Promise<void> {
      gym2 = await seedSecondTenant(app);
      // la sede del gimnasio 2 también está publicada, con su propio slug
      await app.db
        .update(schema.branches)
        .set({ webSlug: "sede-g2-195", publishOnWeb: true })
        .where(
          and(
            eq(schema.branches.id, gym2.branchId),
            tenantWhere(schema.branches, CTX_DOS),
          ),
        );
      const alta = async (
        userId: number,
        campaign: string,
        price: number | null,
      ): Promise<void> => {
        await app.db.insert(schema.signupAttributions).values(
          tenantValues(CTX_DOS, {
            userId,
            branchId: gym2.branchId,
            channel: "meta_ads",
            utmCampaign: campaign,
            platform: "web",
            capturedVia: "register" as const,
            createdAt: sql`${"2026-03-15 12:00:00"}`,
          }),
        );
        if (price !== null) {
          await app.db.insert(schema.subscriptions).values(
            tenantValues(CTX_DOS, {
              userId,
              planId: gym2.planId,
              branchId: gym2.branchId,
              status: "active" as const,
              startDate: "2026-03-16",
              pricePaid: price,
              currency: "ARS",
              priceTypeApplied: "regular" as const,
            }),
          );
        }
      };
      await alta(gym2.socios[0].id, "promo-octubre", 99999);
      // El slug 'sede-a-195' es de una sede de El Templo: no codifica nada acá.
      await alta(gym2.socios[1].id, "sede-a-195-octubre", null);
      await app.db.insert(schema.adSpendDaily).values(
        tenantValues(CTX_DOS, {
          platform: "meta",
          accountId: "999",
          campaignId: "g2c1",
          campaignName: "promo-octubre",
          spendDate: "2026-03-14",
          spend: "55555.00",
          currency: "ARS",
        }),
      );
      await app.db.insert(schema.searchConsoleStats).values(
        tenantValues(CTX_DOS, {
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          page: "https://otro.example/sedes/x",
          query: "otro",
          clicks: 777,
          impressions: 7777,
          ctr: "0.1000",
          position: "1.00",
        }),
      );
    }

    afterAll(async () => {
      await cleanTables();
    });

    it("las filas del gimnasio 2 no cambian ningún número del gimnasio 1", async () => {
      const before = await funnel(RANGE, ownerToken);
      const beforeGsc = await get<SearchConsoleReport>(URL_GSC, ownerToken);
      await seedGym2();
      const after = await funnel(RANGE, ownerToken);
      const afterGsc = await get<SearchConsoleReport>(URL_GSC, ownerToken);
      expect(after.body).toEqual(before.body);
      expect(afterGsc.body).toEqual(beforeGsc.body);
      expect(JSON.stringify(after.body)).not.toContain("99999");
      expect(JSON.stringify(after.body)).not.toContain("55555");
    });

    it("el admin del gimnasio 2 ve solo lo suyo y su gasto no se mezcla con el del 1", async () => {
      const { status, body } = await get<AttributionFunnel>(
        `${URL_FUNNEL}?${RANGE}`,
        gym2.adminToken,
      );
      expect(status).toBe(200);
      expect(body.totals.registros).toBe(2);
      expect(body.totals.pagaron).toBe(1);
      expect(body.totals.facturacion).toEqual([
        { currency: "ARS", amount: 99999 },
      ]);
      expect(body.totals.gasto).toEqual([{ currency: "ARS", amount: 55555 }]);
      expect(body.gastoSinAtribuir).toEqual([]);
      const promo = findCampaign(body.campaigns, "promo-octubre");
      expect(promo?.gasto).toEqual([{ currency: "ARS", amount: 55555 }]);
      expect(promo?.costoPorAlumnoPago).toEqual([
        { currency: "ARS", amount: 55555 },
      ]);
      // el slug publicado de OTRO gimnasio no codifica la campaña
      expect(
        findCampaign(body.campaigns, "sede-a-195-octubre")?.sedeCodificada,
      ).toBeNull();
      expect(body.rows.every((r) => r.branchId === gym2.branchId)).toBe(true);
    });

    it("Search Console del gimnasio 2 muestra solo su período", async () => {
      const { body } = await get<SearchConsoleReport>(URL_GSC, gym2.adminToken);
      expect(body.period).toEqual({
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
      });
      expect(body.pages).toEqual([
        {
          page: "https://otro.example/sedes/x",
          clicks: 777,
          impressions: 7777,
          ctr: 777 / 7777,
          position: 1,
        },
      ]);
    });
  });

  // ─── importes por moneda (puro) ──────────────────────────────────────────

  describe("MoneyBag", () => {
    it("suma por moneda, redondea a 2 decimales y ordena por código", () => {
      const bag = new MoneyBag();
      bag.add("EUR", 10.004);
      bag.add("ARS", 1);
      bag.add("EUR", 20.003);
      bag.add("ARS", 2);
      expect(bag.toList()).toEqual([
        { currency: "ARS", amount: 3 },
        { currency: "EUR", amount: 30.01 },
      ]);
    });
  });

  // ─── codificación de sede (pura) ─────────────────────────────────────────

  describe("codifiedSede", () => {
    const sedes = [
      { id: 1, name: "Juan B. Justo", slug: "juan-b-justo" },
      { id: 2, name: "Alberti", slug: "alberti" },
      { id: 3, name: "Alberti Norte", slug: "alberti-norte" },
    ];

    it("reconoce el slug como palabra entera, sin importar mayúsculas ni acentos", () => {
      expect(codifiedSede("juan-b-justo-octubre", sedes)?.id).toBe(1);
      expect(codifiedSede("Octubre_JUAN B JUSTO", sedes)?.id).toBe(1);
      expect(codifiedSede("Álberti-promo", sedes)?.id).toBe(2);
    });

    it("no matchea fragmentos de palabra ni campañas sin sede", () => {
      expect(codifiedSede("malberti-promo", sedes)).toBeNull();
      expect(codifiedSede("promo-octubre", sedes)).toBeNull();
    });

    it("con más de una sede coincidente no adivina", () => {
      expect(codifiedSede("alberti-norte-promo", sedes)).toBeNull();
      expect(codifiedSede("juan-b-justo-alberti", sedes)).toBeNull();
    });
  });
});

// ─── Search Console ──────────────────────────────────────────────────────────

describe("Reportes de atribución — Search Console", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  const get = <T>(url: string, token?: string) => getJson<T>(app, url, token);

  const OLD = { periodStart: "2026-02-01", periodEnd: "2026-02-07" };
  const LATEST = { periodStart: "2026-03-02", periodEnd: "2026-03-08" };
  const PAGE_A = "https://eltemplo.org/sedes/sede-a-195";
  const PAGE_B = "https://eltemplo.org/es/sedes/sede-b-195";

  async function seedRow(
    period: { periodStart: string; periodEnd: string },
    page: string,
    query: string | null,
    clicks: number,
    impressions: number,
    position: string,
  ): Promise<void> {
    await app.db.insert(schema.searchConsoleStats).values(
      tenantValues(CTX, {
        ...period,
        page,
        query,
        clicks,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions).toFixed(4) : "0.0000",
        position,
      }),
    );
  }

  async function clean(): Promise<void> {
    await app.db
      .delete(schema.searchConsoleStats)
      .where(tenantWhere(schema.searchConsoleStats, CTX));
  }

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  beforeEach(clean);

  it("sin datos devuelve period null y listas vacías", async () => {
    const { status, body } = await get<SearchConsoleReport>(
      URL_GSC,
      ownerToken,
    );
    expect(status).toBe(200);
    expect(body).toEqual({ period: null, pages: [], queries: [] });
  });

  it("usa solo el último período y agrega por página de sede", async () => {
    await seedRow(OLD, PAGE_A, "consulta vieja", 999, 9999, "1.00");
    // sede A: 7 consultas (impresiones, clics, posición)
    await seedRow(LATEST, PAGE_A, "q1", 5, 300, "4.00");
    await seedRow(LATEST, PAGE_A, "q2", 10, 100, "2.00");
    await seedRow(LATEST, PAGE_A, "q3", 1, 50, "10.00");
    await seedRow(LATEST, PAGE_A, "q4", 0, 40, "10.00");
    await seedRow(LATEST, PAGE_A, "q5", 0, 30, "10.00");
    await seedRow(LATEST, PAGE_A, "q6", 0, 20, "10.00");
    await seedRow(LATEST, PAGE_A, "q7", 0, 10, "10.00");
    // fila sin consulta con muchas impresiones: suma en la página, pero NO
    // puede ocupar un lugar del top 5 de consultas
    await seedRow(LATEST, PAGE_A, null, 0, 600, "1.00");
    // sede B (/es/sedes/): una consulta y una fila sin consulta
    await seedRow(LATEST, PAGE_B, "gimnasio barcelona", 3, 40, "1.50");
    await seedRow(LATEST, PAGE_B, null, 0, 0, "9.00");
    // páginas que NO son de sede
    await seedRow(
      LATEST,
      "https://eltemplo.org/blog/algo",
      "blog",
      50,
      5000,
      "1.00",
    );
    await seedRow(
      LATEST,
      "https://eltemplo.org/sedes",
      "listado",
      20,
      900,
      "1.00",
    );

    const { body } = await get<SearchConsoleReport>(URL_GSC, ownerToken);
    expect(body.period).toEqual(LATEST);
    // ordenadas por impresiones; posición ponderada por impresiones
    expect(body.pages).toEqual([
      {
        page: PAGE_A,
        clicks: 16,
        impressions: 1150,
        ctr: 16 / 1150,
        position: 3.04,
      },
      { page: PAGE_B, clicks: 3, impressions: 40, ctr: 0.075, position: 1.5 },
    ]);
    // top 5 por página (por impresiones); la fila sin consulta no aparece
    expect(body.queries.map((q) => [q.page, q.query])).toEqual([
      [PAGE_A, "q1"],
      [PAGE_A, "q2"],
      [PAGE_A, "q3"],
      [PAGE_A, "q4"],
      [PAGE_A, "q5"],
      [PAGE_B, "gimnasio barcelona"],
    ]);
    expect(body.queries[0]).toEqual({
      page: PAGE_A,
      query: "q1",
      clicks: 5,
      impressions: 300,
      ctr: 0.0167, // el ctr de cada consulta es el guardado (4 decimales)
      position: 4,
    });
  });

  it("el límite recorta las páginas y sus consultas", async () => {
    await seedRow(LATEST, PAGE_A, "q1", 5, 300, "4.00");
    await seedRow(LATEST, PAGE_B, "q2", 3, 40, "1.50");
    const service = new AttributionReportService(app.db, app.log);
    const report = await service.getSearchConsole(CTX, { limit: 1 });
    expect(report.pages.map((p) => p.page)).toEqual([PAGE_A]);
    expect(report.queries.map((q) => q.query)).toEqual(["q1"]);
  });

  it("una página con impresiones en cero usa la posición promedio simple", async () => {
    await seedRow(LATEST, PAGE_A, "q1", 0, 0, "7.00");
    await seedRow(LATEST, PAGE_A, "q2", 0, 0, "9.00");
    const { body } = await get<SearchConsoleReport>(URL_GSC, ownerToken);
    expect(body.pages).toEqual([
      { page: PAGE_A, clicks: 0, impressions: 0, ctr: 0, position: 8 },
    ]);
  });
});
