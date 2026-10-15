/**
 * Patrocinadores (Fase 199, D-18..D-25) — integración HTTP contra
 * `createTestApp()` de las 2 rutas del socio bajo `/api/members/sponsors`:
 *   GET  /            feed de marcas visibles + `canRedeem`
 *   POST /:id/event   { type: "seen" | "tapped" | "redeem" }
 * y de las métricas que el admin lee en `GET /api/admin/sponsors`.
 *
 * Cobertura:
 *   (1) País y vigencia (D-20): el socio AR ve las marcas AR y no las ES (y al
 *       revés); inactiva no aparece; vigencia evaluada con `todayInTz` de la
 *       zona de SU sede (AR y Madrid), bordes inclusivos; orden por
 *       `sortOrder`; el feed respeta el límite vigente.
 *   (2) Canje (D-21): todos ven las marcas; `redeemCode` solo con plan activo
 *       y solo en marcas `code`; plan `active` vencido sin barrer NO habilita
 *       (misma regla que `/me/plan-status`); `paused` con fecha pasada SÍ;
 *       cancelada/expirada NO.
 *   (3) Eventos (D-25): `seen` crea una fila y no duplica; `tapped` y `redeem`
 *       conservan la PRIMERA marca de tiempo; `redeem` sin plan 400; 404 para
 *       marca inactiva, de otro país, vencida, futura o inexistente; 400 por
 *       tipo/params inválidos; 401 sin token; el `userId` sale del token.
 *   (4) Métricas (D-25): views/taps/redeems por marca en el listado admin y
 *       cascade al borrar la marca.
 *   (5) Aislamiento (D-18): el socio de otro gimnasio recibe feed vacío, 404 en
 *       los eventos y no crea filas ni contamina las métricas de El Templo.
 *
 * FECHAS: nada de calendario fijo ni helpers de fecha UTC de helpers.ts. Cada `it`
 * calcula `todayInTz(<zona de la sede>)` + `addDays` en el momento (entre las
 * 21:00 y las 24:00 ART el día UTC ya es el siguiente y el feed compara contra
 * el día de la sede).
 *
 * LIMPIEZA: `sponsor_brands` / `sponsor_views` / `system_settings` /
 * `subscriptions` están en `TABLES_TO_CLEAN`; `cleanAllTestData` las vacía.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/sponsors/sponsors-member.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  assignTestPlan,
  cleanAllTestData,
  createTestApp,
  createTestMember,
  createTestPlan,
  getAuthToken,
} from "../helpers";
import {
  branches,
  sponsorBrands,
  sponsorViews,
  subscriptions,
} from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const MEMBER_URL = "/api/members/sponsors";
const ADMIN_URL = "/api/admin/sponsors";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
/** Zona de la sede ES: la MISMA que va en el INSERT de la sede. */
const TZ_ES = "Europe/Madrid";
/** Id inexistente (rango alto de INT, no choca con el autoincrement de test). */
const MISSING_ID = 2_000_000_000;
const HOUR_MS = 60 * 60 * 1000;

// ─── Fixtures de sedes ───────────────────────────────────────────────────────

let app: FastifyInstance;
let ownerToken: string;
let branchAr: number;
/** Zona horaria de la sede `TEST`, leída de la base (no se asume). */
let tzAr: string;
let branchEs: number;

/** Sede ES creada una vez por archivo (se borra en `afterAll`). */
async function createEsBranch(): Promise<number> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [row] = await app.db
    .insert(branches)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: `Sede ES sponsors ${suffix}`,
        code: `SP${suffix}`.toUpperCase().slice(0, 20),
        country: "ES" as const,
        isActive: true,
        timezone: TZ_ES,
        isVirtual: false,
      }),
    )
    .$returningId();
  return row.id;
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [testBranch] = await app.db
    .select({
      id: branches.id,
      timezone: branches.timezone,
      country: branches.country,
    })
    .from(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.code, "TEST")))
    .limit(1);
  if (!testBranch)
    throw new Error("Sede 'TEST' no encontrada — ¿corrió test/setup.ts?");
  if (testBranch.country !== "AR")
    throw new Error(`La sede TEST debería ser AR y es ${testBranch.country}`);
  branchAr = testBranch.id;
  tzAr = testBranch.timezone;

  branchEs = await createEsBranch();
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.db
    .delete(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.id, branchEs)));
  await app.close();
});

let planId: number | null;

beforeEach(async () => {
  await cleanAllTestData(app);
  planId = null;
});

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

interface FeedBrand {
  id: number;
  name: string;
  redeemType: "code" | "carnet";
  redeemCode: string | null;
}

interface Feed {
  sponsors: FeedBrand[];
  canRedeem: boolean;
}

interface AdminBrand {
  id: number;
  name: string;
  views: number;
  taps: number;
  redeems: number;
}

type EventType = "seen" | "tapped" | "redeem";

function getFeed(token: string | null) {
  return app.inject({
    method: "GET",
    url: MEMBER_URL,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function feedOf(token: string): Promise<Feed> {
  const res = await getFeed(token);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as Feed;
}

async function namesOf(token: string): Promise<string[]> {
  return (await feedOf(token)).sponsors.map((s) => s.name);
}

function postEvent(
  token: string | null,
  brandId: number | string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${MEMBER_URL}/${brandId}/event`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
}

function evento(token: string | null, brandId: number, type: EventType) {
  return postEvent(token, brandId, { type });
}

async function adminList(): Promise<AdminBrand[]> {
  const res = await app.inject({
    method: "GET",
    url: ADMIN_URL,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (JSON.parse(res.body) as { sponsors: AdminBrand[] }).sponsors;
}

// ─── Fixtures de datos ───────────────────────────────────────────────────────

let brandSeq = 0;

/**
 * Inserta una marca directo (tabla exenta: sin `tenantValues`). Default:
 * activa, solo AR, canje por carnet, sin vigencia.
 */
async function insertBrand(
  over: Partial<typeof sponsorBrands.$inferInsert> = {},
): Promise<number> {
  brandSeq += 1;
  const [row] = await app.db
    .insert(sponsorBrands)
    .values({
      name: `Marca ${brandSeq}`,
      category: "Salud",
      bgColor: "#4c6b3c",
      textColor: "#f2ede5",
      benefit: "20% OFF",
      detail: "en tu primera consulta",
      redeemType: "carnet" as const,
      countryAr: true,
      countryEs: false,
      isActive: true,
      sortOrder: brandSeq,
      ...over,
    })
    .$returningId();
  return row.id;
}

/** Socio de El Templo en la sede dada, ya autenticado. */
async function socioEn(
  branchId: number,
): Promise<{ id: number; token: string }> {
  const member = await createTestMember(app, { branchId });
  return { id: member.id, token: member.token };
}

const socioAr = () => socioEn(branchAr);
const socioEs = () => socioEn(branchEs);

/** Plan de prueba, uno por test (el nombre es único por gimnasio). */
async function ensurePlan(): Promise<number> {
  if (planId === null) {
    const plan = await createTestPlan(app, ownerToken);
    planId = plan.id;
  }
  return planId;
}

/** Le asigna a un socio AR un plan por la API (queda `active`). */
async function darPlan(userId: number): Promise<void> {
  const res = await assignTestPlan(
    app,
    ownerToken,
    userId,
    await ensurePlan(),
    { branchId: branchAr, startDate: todayInTz(tzAr) },
  );
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
}

/** Pisa estado / vencimiento de la suscripción del socio por UPDATE directo. */
async function setSub(
  userId: number,
  patch: {
    status?: "active" | "paused" | "cancelled" | "expired";
    endDate?: string | null;
  },
): Promise<void> {
  await app.db
    .update(subscriptions)
    .set(patch)
    .where(
      and(
        tenantWhere(subscriptions, CTX_TEMPLO),
        eq(subscriptions.userId, userId),
      ),
    );
}

async function viewsOf(
  brandId: number,
  userId?: number,
  ctx: TenantContext = CTX_TEMPLO,
) {
  return app.db
    .select()
    .from(sponsorViews)
    .where(
      and(
        tenantWhere(sponsorViews, ctx),
        eq(sponsorViews.brandId, brandId),
        userId === undefined ? undefined : eq(sponsorViews.userId, userId),
      ),
    );
}

/** Todas las filas de sponsor_views sin filtro de gimnasio (tabla de prueba). */
async function allViewsCount(): Promise<number> {
  const rows = await app.db
    .select({ id: sponsorViews.id })
    .from(sponsorViews)
    .where(tenantWhere(sponsorViews, CTX_TEMPLO));
  const other = await app.db
    .select({ id: sponsorViews.id })
    .from(sponsorViews)
    .where(tenantWhere(sponsorViews, { tenantId: TENANT_DOS }));
  return rows.length + other.length;
}

/** Retrasa una marca de tiempo (a segundos exactos) para probar "se conserva la primera". */
function pasado(hours: number): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000 - hours * HOUR_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// (1) País y vigencia
// ═══════════════════════════════════════════════════════════════════════════

describe("feed — país y vigencia (D-20)", () => {
  it("el socio AR ve las marcas AR y no las ES; el socio ES, al revés", async () => {
    await insertBrand({ name: "Solo AR" });
    await insertBrand({ name: "Solo ES", countryAr: false, countryEs: true });
    await insertBrand({ name: "Ambos", countryAr: true, countryEs: true });
    const ar = await socioAr();
    const es = await socioEs();

    expect(await namesOf(ar.token)).toEqual(["Solo AR", "Ambos"]);
    expect(await namesOf(es.token)).toEqual(["Solo ES", "Ambos"]);
  });

  it("una marca inactiva no aparece", async () => {
    await insertBrand({ name: "Activa" });
    await insertBrand({ name: "Apagada", isActive: false });
    const ar = await socioAr();
    expect(await namesOf(ar.token)).toEqual(["Activa"]);
  });

  it("sin marcas el feed es vacío y 200", async () => {
    const ar = await socioAr();
    expect(await feedOf(ar.token)).toEqual({ sponsors: [], canRedeem: false });
  });

  it("vigencia en la zona de la sede AR: bordes inclusivos, futura y vencida fuera", async () => {
    const hoy = todayInTz(tzAr);
    await insertBrand({ name: "Empieza mañana", startsOn: addDays(hoy, 1) });
    await insertBrand({ name: "Venció ayer", endsOn: addDays(hoy, -1) });
    await insertBrand({ name: "Empieza hoy", startsOn: hoy });
    await insertBrand({ name: "Termina hoy", endsOn: hoy });
    await insertBrand({ name: "Solo hoy", startsOn: hoy, endsOn: hoy });
    await insertBrand({
      name: "Rango amplio",
      startsOn: addDays(hoy, -5),
      endsOn: addDays(hoy, 5),
    });
    await insertBrand({ name: "Sin vigencia" });
    const ar = await socioAr();

    expect(await namesOf(ar.token)).toEqual([
      "Empieza hoy",
      "Termina hoy",
      "Solo hoy",
      "Rango amplio",
      "Sin vigencia",
    ]);
  });

  it("vigencia en la zona de la sede ES (Madrid): el día es el de Madrid", async () => {
    const hoyEs = todayInTz(TZ_ES);
    const es = { countryAr: false, countryEs: true };
    await insertBrand({ name: "Termina hoy ES", endsOn: hoyEs, ...es });
    await insertBrand({
      name: "Venció ayer ES",
      endsOn: addDays(hoyEs, -1),
      ...es,
    });
    await insertBrand({ name: "Empieza hoy ES", startsOn: hoyEs, ...es });
    await insertBrand({
      name: "Empieza mañana ES",
      startsOn: addDays(hoyEs, 1),
      ...es,
    });
    const socio = await socioEs();

    expect(await namesOf(socio.token)).toEqual([
      "Termina hoy ES",
      "Empieza hoy ES",
    ]);
  });

  it("una misma marca AR+ES con vigencia hasta 'hoy en Madrid' respeta el día de cada sede", async () => {
    const hoyAr = todayInTz(tzAr);
    const hoyEs = todayInTz(TZ_ES);
    await insertBrand({
      name: "Vigente hasta hoy Madrid",
      countryAr: true,
      countryEs: true,
      endsOn: hoyEs,
    });
    const ar = await socioAr();
    const es = await socioEs();

    // Para la sede ES siempre vigente (endsOn = su hoy).
    expect(await namesOf(es.token)).toEqual(["Vigente hasta hoy Madrid"]);
    // Para la sede AR depende de si su día ya pasó el de Madrid: se compara
    // contra el día de ESA sede, no contra el de Madrid ni el UTC.
    const esperadoAr = hoyAr <= hoyEs ? ["Vigente hasta hoy Madrid"] : [];
    expect(await namesOf(ar.token)).toEqual(esperadoAr);
  });

  it("ordena por sortOrder (y por id si empatan)", async () => {
    await insertBrand({ name: "Tercera", sortOrder: 30 });
    await insertBrand({ name: "Primera", sortOrder: 10 });
    await insertBrand({ name: "Segunda A", sortOrder: 20 });
    await insertBrand({ name: "Segunda B", sortOrder: 20 });
    const ar = await socioAr();
    expect(await namesOf(ar.token)).toEqual([
      "Primera",
      "Segunda A",
      "Segunda B",
      "Tercera",
    ]);
  });

  it("el feed no devuelve más marcas que el límite vigente por país", async () => {
    for (let n = 1; n <= 4; n += 1) {
      await insertBrand({ name: `AR ${n}`, sortOrder: n });
    }
    const limite = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/settings`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { maxActivePerCountry: 2 },
    });
    expect(limite.statusCode, limite.body).toBe(200);
    const ar = await socioAr();
    expect(await namesOf(ar.token)).toEqual(["AR 1", "AR 2"]);
  });

  it("sin token el feed da 401", async () => {
    expect((await getFeed(null)).statusCode).toBe(401);
  });

  it("la respuesta no expone campos internos (país, vigencia, orden, métricas)", async () => {
    await insertBrand({ name: "Con todo" });
    const ar = await socioAr();
    const res = await getFeed(ar.token);
    const [item] = (
      JSON.parse(res.body) as { sponsors: Record<string, unknown>[] }
    ).sponsors;
    for (const campo of [
      "countries",
      "startsOn",
      "endsOn",
      "isActive",
      "sortOrder",
      "views",
      "taps",
      "redeems",
      "createdBy",
    ]) {
      expect(item, campo).not.toHaveProperty(campo);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) Canje con plan
// ═══════════════════════════════════════════════════════════════════════════

describe("canje — código solo con plan activo (D-21)", () => {
  it("socio SIN plan: ve las marcas, redeemCode null y canRedeem false", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    await insertBrand({ name: "Carnet", redeemType: "carnet" });
    const socio = await socioAr();

    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(false);
    expect(feed.sponsors.map((s) => s.name)).toEqual(["Con código", "Carnet"]);
    for (const s of feed.sponsors) expect(s.redeemCode).toBeNull();
    expect(JSON.stringify(feed)).not.toContain("TEMPLO20");
  });

  it("el mismo socio con plan activo recibe el código real y canRedeem true", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    expect((await feedOf(socio.token)).canRedeem).toBe(false);

    await darPlan(socio.id);
    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(true);
    expect(feed.sponsors[0].redeemCode).toBe("TEMPLO20");
  });

  it("una marca carnet NUNCA lleva redeemCode, ni con plan activo ni con código guardado", async () => {
    await insertBrand({
      name: "Carnet con resto de código",
      redeemType: "carnet",
      redeemCode: "RESTO",
    });
    const socio = await socioAr();
    await darPlan(socio.id);
    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(true);
    expect(feed.sponsors[0].redeemCode).toBeNull();
    expect(JSON.stringify(feed)).not.toContain("RESTO");
  });

  it("plan 'active' con end_date vencida y sin barrer: no habilita el canje (alineado con /me/plan-status)", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    await darPlan(socio.id);
    // −2 días: no depende de la diferencia UTC/AR. Status sigue 'active'.
    await setSub(socio.id, {
      status: "active",
      endDate: addDays(todayInTz(tzAr), -2),
    });

    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(false);
    expect(feed.sponsors[0].redeemCode).toBeNull();

    const redeem = await evento(socio.token, feed.sponsors[0].id, "redeem");
    expect(redeem.statusCode, redeem.body).toBe(400);
    expect(await viewsOf(feed.sponsors[0].id)).toHaveLength(0);
  });

  it("plan 'active' con end_date en el futuro: canRedeem true", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    await darPlan(socio.id);
    await setSub(socio.id, {
      status: "active",
      endDate: addDays(todayInTz(tzAr), 2),
    });

    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(true);
    expect(feed.sponsors[0].redeemCode).toBe("TEMPLO20");
  });

  it("plan 'active' sin end_date: canRedeem true", async () => {
    await insertBrand({ name: "Marca" });
    const socio = await socioAr();
    await darPlan(socio.id);
    await setSub(socio.id, { status: "active", endDate: null });
    expect((await feedOf(socio.token)).canRedeem).toBe(true);
  });

  it("plan 'paused' con end_date pasada: canRedeem true (el sweep no vence las pausadas)", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    await darPlan(socio.id);
    await setSub(socio.id, {
      status: "paused",
      endDate: addDays(todayInTz(tzAr), -2),
    });

    const feed = await feedOf(socio.token);
    expect(feed.canRedeem).toBe(true);
    expect(feed.sponsors[0].redeemCode).toBe("TEMPLO20");
  });

  it.each(["cancelled", "expired"] as const)(
    "plan '%s': no habilita el canje",
    async (status) => {
      await insertBrand({
        name: "Con código",
        redeemType: "code",
        redeemCode: "TEMPLO20",
      });
      const socio = await socioAr();
      await darPlan(socio.id);
      await setSub(socio.id, { status, endDate: addDays(todayInTz(tzAr), 20) });

      const feed = await feedOf(socio.token);
      expect(feed.canRedeem).toBe(false);
      expect(feed.sponsors[0].redeemCode).toBeNull();
    },
  );

  it("el plan de otro socio no habilita al que no tiene", async () => {
    await insertBrand({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const conPlan = await socioAr();
    const sinPlan = await socioAr();
    await darPlan(conPlan.id);

    expect((await feedOf(conPlan.token)).canRedeem).toBe(true);
    const feed = await feedOf(sinPlan.token);
    expect(feed.canRedeem).toBe(false);
    expect(feed.sponsors[0].redeemCode).toBeNull();
  });

  it("un socio ES sin plan ve la marca ES sin código", async () => {
    await insertBrand({
      name: "ES con código",
      redeemType: "code",
      redeemCode: "ESPANA10",
      countryAr: false,
      countryEs: true,
    });
    const socio = await socioEs();
    const feed = await feedOf(socio.token);
    expect(feed.sponsors).toHaveLength(1);
    expect(feed.sponsors[0].redeemCode).toBeNull();
    expect(feed.canRedeem).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) Eventos
// ═══════════════════════════════════════════════════════════════════════════

describe("eventos (D-25)", () => {
  it("seen crea una fila con first_seen_at y sin tapped_at / redeem_at, del gimnasio y socio del token", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();

    const res = await evento(socio.token, brandId, "seen");
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });

    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(socio.id);
    expect(rows[0].tenantId).toBe(TENANT_TEMPLO);
    expect(rows[0].firstSeenAt).toBeInstanceOf(Date);
    expect(rows[0].tappedAt).toBeNull();
    expect(rows[0].redeemAt).toBeNull();
  });

  it("un segundo seen no duplica la fila ni mueve first_seen_at", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();
    await evento(socio.token, brandId, "seen");

    const antes = pasado(5);
    await app.db
      .update(sponsorViews)
      .set({ firstSeenAt: antes })
      .where(
        and(
          tenantWhere(sponsorViews, CTX_TEMPLO),
          eq(sponsorViews.brandId, brandId),
        ),
      );

    const otra = await evento(socio.token, brandId, "seen");
    expect(otra.statusCode, otra.body).toBe(200);
    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstSeenAt.getTime()).toBe(antes.getTime());
  });

  it("tapped setea tapped_at y un segundo tapped NO lo cambia", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();
    await evento(socio.token, brandId, "seen");

    expect((await evento(socio.token, brandId, "tapped")).statusCode).toBe(200);
    const [primera] = await viewsOf(brandId);
    expect(primera.tappedAt).toBeInstanceOf(Date);
    expect(primera.redeemAt).toBeNull();

    // Se retrasa la marca para que "no cambia" no dependa de la resolución en segundos.
    const antes = pasado(5);
    await app.db
      .update(sponsorViews)
      .set({ tappedAt: antes })
      .where(
        and(
          tenantWhere(sponsorViews, CTX_TEMPLO),
          eq(sponsorViews.brandId, brandId),
        ),
      );

    expect((await evento(socio.token, brandId, "tapped")).statusCode).toBe(200);
    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tappedAt?.getTime()).toBe(antes.getTime());
  });

  it("tapped sin seen previo crea la fila ya con tapped_at", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();

    expect((await evento(socio.token, brandId, "tapped")).statusCode).toBe(200);
    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstSeenAt).toBeInstanceOf(Date);
    expect(rows[0].tappedAt).toBeInstanceOf(Date);
    expect(rows[0].redeemAt).toBeNull();
  });

  it("seen → tapped → redeem completan UNA sola fila", async () => {
    const brandId = await insertBrand({
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    await darPlan(socio.id);

    for (const type of ["seen", "tapped", "redeem"] as const) {
      const res = await evento(socio.token, brandId, type);
      expect(res.statusCode, `${type}: ${res.body}`).toBe(200);
    }
    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tappedAt).toBeInstanceOf(Date);
    expect(rows[0].redeemAt).toBeInstanceOf(Date);
  });

  it("redeem sin plan activo → 400 y no crea fila", async () => {
    const brandId = await insertBrand({
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();

    const res = await evento(socio.token, brandId, "redeem");
    expect(res.statusCode, res.body).toBe(400);
    expect(await viewsOf(brandId)).toHaveLength(0);

    // Con la fila ya creada por seen, redeem tampoco la completa.
    await evento(socio.token, brandId, "seen");
    expect((await evento(socio.token, brandId, "redeem")).statusCode).toBe(400);
    const [fila] = await viewsOf(brandId);
    expect(fila.redeemAt).toBeNull();
  });

  it("redeem con plan activo setea redeem_at y un segundo redeem NO lo cambia", async () => {
    const brandId = await insertBrand({
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const socio = await socioAr();
    await darPlan(socio.id);

    expect((await evento(socio.token, brandId, "redeem")).statusCode).toBe(200);
    const [primera] = await viewsOf(brandId);
    expect(primera.redeemAt).toBeInstanceOf(Date);
    expect(primera.tappedAt).toBeNull();

    const antes = pasado(5);
    await app.db
      .update(sponsorViews)
      .set({ redeemAt: antes })
      .where(
        and(
          tenantWhere(sponsorViews, CTX_TEMPLO),
          eq(sponsorViews.brandId, brandId),
        ),
      );
    expect((await evento(socio.token, brandId, "redeem")).statusCode).toBe(200);
    const rows = await viewsOf(brandId);
    expect(rows).toHaveLength(1);
    expect(rows[0].redeemAt?.getTime()).toBe(antes.getTime());
  });

  it("redeem sobre una marca carnet con plan activo también se registra", async () => {
    const brandId = await insertBrand({ redeemType: "carnet" });
    const socio = await socioAr();
    await darPlan(socio.id);
    expect((await evento(socio.token, brandId, "redeem")).statusCode).toBe(200);
    expect((await viewsOf(brandId))[0].redeemAt).toBeInstanceOf(Date);
  });

  describe("404 cuando la marca no es visible para el socio (y no se crea ninguna fila)", () => {
    it("marca inactiva", async () => {
      const brandId = await insertBrand({ isActive: false });
      const socio = await socioAr();
      const res = await evento(socio.token, brandId, "seen");
      expect(res.statusCode, res.body).toBe(404);
      expect(await viewsOf(brandId)).toHaveLength(0);
    });

    it("marca de otro país", async () => {
      const soloEs = await insertBrand({ countryAr: false, countryEs: true });
      const soloAr = await insertBrand({ countryAr: true, countryEs: false });
      const ar = await socioAr();
      const es = await socioEs();

      expect((await evento(ar.token, soloEs, "seen")).statusCode).toBe(404);
      expect((await evento(es.token, soloAr, "tapped")).statusCode).toBe(404);
      expect(await viewsOf(soloEs)).toHaveLength(0);
      expect(await viewsOf(soloAr)).toHaveLength(0);
    });

    it("marca vencida o que todavía no empezó", async () => {
      const hoy = todayInTz(tzAr);
      const vencida = await insertBrand({ endsOn: addDays(hoy, -1) });
      const futura = await insertBrand({ startsOn: addDays(hoy, 1) });
      const socio = await socioAr();

      expect((await evento(socio.token, vencida, "seen")).statusCode).toBe(404);
      expect((await evento(socio.token, futura, "seen")).statusCode).toBe(404);
      expect(await viewsOf(vencida)).toHaveLength(0);
      expect(await viewsOf(futura)).toHaveLength(0);
    });

    it("marca inexistente", async () => {
      const socio = await socioAr();
      const res = await evento(socio.token, MISSING_ID, "seen");
      expect(res.statusCode, res.body).toBe(404);
      expect(await allViewsCount()).toBe(0);
    });

    it("redeem sobre marca no visible da 404 (no 400), aunque tenga plan", async () => {
      const brandId = await insertBrand({ isActive: false });
      const socio = await socioAr();
      await darPlan(socio.id);
      expect((await evento(socio.token, brandId, "redeem")).statusCode).toBe(
        404,
      );
    });
  });

  it("un tipo desconocido o un body inválido → 400", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();

    expect(
      (await postEvent(socio.token, brandId, { type: "otro" })).statusCode,
    ).toBe(400);
    expect((await postEvent(socio.token, brandId, {})).statusCode).toBe(400);
    expect(
      (await postEvent(socio.token, brandId, { type: "SEEN" })).statusCode,
    ).toBe(400);
    expect(
      (await postEvent(socio.token, "abc", { type: "seen" })).statusCode,
    ).toBe(400);
    expect((await postEvent(socio.token, 0, { type: "seen" })).statusCode).toBe(
      400,
    );
    expect(await viewsOf(brandId)).toHaveLength(0);
  });

  it("sin token el evento da 401 y no crea filas", async () => {
    const brandId = await insertBrand();
    expect((await evento(null, brandId, "seen")).statusCode).toBe(401);
    expect(await viewsOf(brandId)).toHaveLength(0);
  });

  it("el userId sale del token: un userId en el body se descarta", async () => {
    const brandId = await insertBrand();
    const yo = await socioAr();
    const otro = await socioAr();

    const res = await postEvent(yo.token, brandId, {
      type: "seen",
      userId: otro.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await viewsOf(brandId, yo.id)).toHaveLength(1);
    expect(await viewsOf(brandId, otro.id)).toHaveLength(0);
  });

  it("dos socios generan dos filas independientes sobre la misma marca", async () => {
    const brandId = await insertBrand();
    const a = await socioAr();
    const b = await socioAr();
    await evento(a.token, brandId, "seen");
    await evento(b.token, brandId, "seen");
    await evento(a.token, brandId, "tapped");

    expect(await viewsOf(brandId)).toHaveLength(2);
    expect((await viewsOf(brandId, a.id))[0].tappedAt).toBeInstanceOf(Date);
    expect((await viewsOf(brandId, b.id))[0].tappedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) Métricas
// ═══════════════════════════════════════════════════════════════════════════

describe("métricas por marca (D-25)", () => {
  it("dos socios ven la marca, uno toca y uno canjea → views 2, taps 1, redeems 1", async () => {
    const medida = await insertBrand({
      name: "Medida",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    const intacta = await insertBrand({ name: "Intacta" });
    const a = await socioAr();
    const b = await socioAr();
    await darPlan(b.id);

    await evento(a.token, medida, "seen");
    await evento(a.token, medida, "tapped");
    await evento(b.token, medida, "seen");
    await evento(b.token, medida, "redeem");

    const lista = await adminList();
    const m = lista.find((s) => s.id === medida);
    const i = lista.find((s) => s.id === intacta);
    expect(m).toMatchObject({ views: 2, taps: 1, redeems: 1 });
    expect(i).toMatchObject({ views: 0, taps: 0, redeems: 0 });
  });

  it("repetir los eventos no infla las métricas", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();
    for (let n = 0; n < 3; n += 1) {
      await evento(socio.token, brandId, "seen");
      await evento(socio.token, brandId, "tapped");
    }
    const [m] = (await adminList()).filter((s) => s.id === brandId);
    expect(m).toMatchObject({ views: 1, taps: 1, redeems: 0 });
  });

  it("borrar la marca elimina sus vistas (cascade)", async () => {
    const brandId = await insertBrand();
    const socio = await socioAr();
    await evento(socio.token, brandId, "seen");
    expect(await viewsOf(brandId)).toHaveLength(1);

    const res = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/${brandId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await viewsOf(brandId)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Aislamiento cross-tenant
// ═══════════════════════════════════════════════════════════════════════════

describe("aislamiento entre gimnasios (D-18)", () => {
  let gym2: SegundoGimnasio;
  let ctxDos: TenantContext;

  beforeEach(async () => {
    gym2 = await seedSecondTenant(app);
    ctxDos = { tenantId: gym2.tenantId };
  });

  it("el socio del otro gimnasio recibe 200 con sponsors vacío aunque haya marcas activas", async () => {
    await insertBrand({ name: "De la plataforma" });
    const feed = await feedOf(gym2.socios[0].token);
    expect(feed).toEqual({ sponsors: [], canRedeem: false });

    // El socio de El Templo sí la ve (control: la marca existe y está vigente).
    const propio = await socioAr();
    expect(await namesOf(propio.token)).toEqual(["De la plataforma"]);
  });

  it("su evento da 404 en los tres tipos y no crea filas en ningún gimnasio", async () => {
    const brandId = await insertBrand();
    const ajeno = gym2.socios[0];

    for (const type of ["seen", "tapped", "redeem"] as const) {
      const res = await evento(ajeno.token, brandId, type);
      expect(res.statusCode, `${type}: ${res.body}`).toBe(404);
    }
    expect(await viewsOf(brandId, undefined, ctxDos)).toHaveLength(0);
    expect(await viewsOf(brandId)).toHaveLength(0);
    expect(await allViewsCount()).toBe(0);
  });

  it("las métricas de El Templo no cambian por los intentos del otro gimnasio y solo cuentan a sus socios", async () => {
    const brandId = await insertBrand();
    const propio = await socioAr();

    await evento(gym2.socios[0].token, brandId, "seen");
    await evento(gym2.socios[1].token, brandId, "tapped");
    let m = (await adminList()).find((s) => s.id === brandId);
    expect(m).toMatchObject({ views: 0, taps: 0, redeems: 0 });

    await evento(propio.token, brandId, "seen");
    m = (await adminList()).find((s) => s.id === brandId);
    expect(m).toMatchObject({ views: 1, taps: 0, redeems: 0 });
    expect(await allViewsCount()).toBe(1);
  });

  it("si el otro gimnasio tuviera una fila de vistas, no se suma a las métricas de El Templo", async () => {
    const brandId = await insertBrand();
    // Fila sembrada a mano en el gimnasio 2 (el servicio nunca la crea).
    await app.db.insert(sponsorViews).values(
      tenantValues(ctxDos, {
        brandId,
        userId: gym2.socios[0].id,
        firstSeenAt: pasado(1),
      }),
    );

    const m = (await adminList()).find((s) => s.id === brandId);
    expect(m).toMatchObject({ views: 0, taps: 0, redeems: 0 });
    expect(await viewsOf(brandId)).toHaveLength(0);
    expect(await viewsOf(brandId, undefined, ctxDos)).toHaveLength(1);
  });

  it("el admin del otro gimnasio no puede leer las métricas (403)", async () => {
    await insertBrand();
    const res = await app.inject({
      method: "GET",
      url: ADMIN_URL,
      headers: { authorization: `Bearer ${gym2.adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
