/**
 * Fase 174.1 Plan 01 (ISO-03, ADO-03) — AISLAMIENTO de las ~14 rutas de
 * LECTURA de `subscriptions`, contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el plan 1 de la batería 174.1: las rutas donde el `userId`/`planId`
 * viaja por la URL (o, en las 4 app-facing, se resuelve del token) y el
 * servidor entrega el estado de una suscripción y su precio. Si algo se
 * filtra —una suscripción ajena, un plan de otro gimnasio, un preview de
 * pricing con el plan equivocado— se filtra acá.
 *
 * QUE RUTAS CUBRE (14 de las 24 del manifiesto de `subscriptions`)
 * ----------------------------------------------------------------------
 *   GET /api/admin/subscriptions/plans
 *   GET /api/admin/subscriptions/plans/:planId
 *   GET /api/admin/subscriptions/promo-plans
 *   GET /api/admin/subscriptions/members/:userId/subscription
 *   GET /api/admin/subscriptions/members/:userId/subscriptions
 *   GET /api/admin/subscriptions/members/:userId/subscription/history
 *   GET /api/admin/subscriptions/members/:userId/subscription/change-plan-preview
 *   GET /api/admin/subscriptions/members/:userId/subscription/pricing-preview
 *   GET /api/admin/subscriptions/members/:userId/class-usage
 *   GET /api/admin/subscriptions/subscriptions/:subscriptionId/schedule-changes
 *   GET /api/members/subscription/coverage
 *   GET /api/members/subscription/me/especial-pass
 *   GET /api/members/subscription/me/subscription
 *   GET /api/members/subscription/plans
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del milestone — cero "prohibido")
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: un GET
 * by-id/by-userId ajeno da 404 (o, para las rutas que no chequean existencia
 * del recurso principal antes de filtrar — `subscriptions`/`history`/
 * `schedule-changes` — un 200 con datos VACÍOS, nunca ajenos). **Nunca un
 * "prohibido"**: el criterio de aceptación de este archivo es un `grep`
 * (sin comentarios) de esa asercion dando CERO.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO
 * ---------------------------------------------------------------------
 * Un 404 (o un array vacío) puede venir del aislamiento o de una siembra
 * rota. Por eso cada `describe` tiene DOS `it`: aislamiento + control, que
 * hace la MISMA operación sobre el recurso PROPIO del gimnasio 2 y exige que
 * funcione.
 *
 * LAS 4 RUTAS APP-FACING SON SELF-SCOPED (D-06 aplicado distinto)
 * -----------------------------------------------------------------
 * `/api/members/subscription/{coverage,me/especial-pass,me/subscription}`
 * NUNCA aceptan un `userId` de la URL — el actor sale de `request.user`
 * (mismo patrón IDOR-safe que `/api/members/attendance`). No existe una
 * combinación de parámetros que le permita a un socio del gimnasio 2 pedir
 * el recurso de OTRO usuario por id: el vector cross-tenant que las 10 rutas
 * admin sí tienen (un `:userId` ajeno en la URL) no existe acá. Sus dos `it`
 * verifican en cambio que la data devuelta es SIEMPRE la propia del actor
 * autenticado (nunca la de otro socio, propio o ajeno) — ver la nota junto a
 * la mutación de cierre (Task 2) sobre por qué esas 4 no se ponen rojas con
 * la misma mutación que las 10 admin.
 *
 * ROL MÍNIMO REAL
 * ----------------
 * Las 10 rutas admin están detrás del guard de módulo `SUBSCRIPTION_ROLES`
 * (coach/admin/owner/gestion/recepcion) SIN un guard más estricto por
 * handler (los guards `PLANES_WRITE_ROLES` solo aplican a POST/PUT/PATCH de
 * planes/promos, no a los GET) — `gym2.coachToken` alcanza para las 10. Las
 * 4 app-facing solo exigen autenticación — un token de socio alcanza.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-subs-lecturas.test.ts
 *
 * @see test/tenancy/iso-03-members-listados.test.ts — el idioma completo de la batería
 * @see test/fixtures/subs-sched-gimnasio-dos.ts — la siembra que este archivo consume
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarSubsSchedGimnasioDos,
  limpiarSubsSchedDeLaBateria,
  tenantDeLaFila,
  campoDeLaFila,
  type SubsSchedFixture,
} from "../fixtures/subs-sched-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ADMIN_BASE = "/api/admin/subscriptions";
const MEMBER_BASE = "/api/members/subscription";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let fx: SubsSchedFixture;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO (mismo criterio que el resto de la batería ISO-03):
  //  1. cleanAllTestData vacia TODAS las tablas del modulo, sin filtro de gimnasio.
  //  2. seedSecondTenant siembra el esqueleto del gimnasio 2.
  //  3. sembrarSubsSchedGimnasioDos siembra el recurso ajeno (El Templo) y lo
  //     propio (gimnasio 2) en una sola llamada.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  fx = await sembrarSubsSchedGimnasioDos(app, gym2);
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (isolate: false).
  await cleanAllTestData(app);
  await limpiarSubsSchedDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** GET admin como staff del gimnasio 2 (default: coach, el rol minimo real). */
async function getAdminComoGimnasioDos(
  url: string,
  token: string = gym2.coachToken,
) {
  return app.inject({
    method: "GET",
    url: `${ADMIN_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** GET app-facing con el token de socio indicado. */
async function getMemberComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${MEMBER_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Mensaje compartido de los rojos de AISLAMIENTO (lectura by-id que espera 404). */
function porQueImportaLaLectura(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} el recurso ${filaId}, ` +
    `que es de El Templo (${TENANT_TEMPLO}). El contrato del milestone (D-06) es que ` +
    `el recurso ajeno sea indistinguible de uno inexistente: "no encontrado", nunca ` +
    `"prohibido". Revisar el metodo que sirve esa ruta en ` +
    `src/modules/subscriptions/service.ts y su handler en routes.ts. NO "arreglar" ` +
    `esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de AISLAMIENTO en listados/barridos. */
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la fila ${filaId}, que NO ` +
    `es suya. Eso es una fuga de datos entre gimnasios: el listado perdio su ` +
    `\`tenantWhere(tabla, ctx)\`, o el \`ctx\` no salio de \`assertTenant(request.scope, ` +
    `…)\`. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio al staff/socio del gimnasio ${TENANT_DOS} su PROPIO ` +
    `recurso ${filaId}. Esto no es un problema de aislamiento sino de siembra o de ` +
    `scope de mas: sin este control, el test de aislamiento de al lado pasaria en ` +
    `verde por la razon equivocada. Revisar test/fixtures/subs-sched-gimnasio-dos.ts.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // GET /plans, GET /promo-plans y GET /api/members/subscription/plans
    // filtran ADEMAS por pais (request.scope.country). Si las sedes tuvieran
    // paises distintos, esos 3 casos pasarian en verde sin que la capa de
    // tenancy hiciera nada (mismo criterio D-14 que la bateria de members).
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const [sedeTemplo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_TEMPLO }),
          eq(schema.branches.id, fx.templo.branchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO ` +
        `aisla; con paises distintos el filtro de country escondaria las filas ajenas ` +
        `igual. Arreglo: que las dos sedes vuelvan a ser AR, NO relajar estas ` +
        `aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene una operacion COMPLETA de subs+scheduling, viva, que el gimnasio 2 NO tiene que ver", async () => {
    const t = fx.templo;
    expect(
      [
        await tenantDeLaFila(app, "subscription_plans", t.planId),
        await tenantDeLaFila(app, "subscriptions", t.subscriptionId),
        await tenantDeLaFila(app, "promo_plans", t.promoPlanId),
        await tenantDeLaFila(app, "schedules", t.scheduleId),
        await tenantDeLaFila(app, "bookings", t.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", t.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", t.holidayId),
        await tenantDeLaFila(app, "subscription_schedule_changes", t.scheduleChangeId),
        await tenantDeLaFila(app, "subscription_schedules", t.subscriptionScheduleId),
      ],
      `Alguna fila ajena no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno ` +
        `vivo, todos los casos de aislamiento de este archivo pasan probando nada. ` +
        `Revisar sembrarLadoTemplo en test/fixtures/subs-sched-gimnasio-dos.ts.`,
    ).toEqual(Array(9).fill(TENANT_TEMPLO));
  });

  it("el gimnasio 2 tiene su propia operacion COMPLETA de subs+scheduling, nacida ahi (no en El Templo por el DEFAULT 1)", async () => {
    const d = fx.dos;
    expect(
      [
        await tenantDeLaFila(app, "subscriptions", d.subscriptionId),
        await tenantDeLaFila(app, "subscription_plans", d.planEspecialId),
        await tenantDeLaFila(app, "subscriptions", d.subscriptionEspecialId),
        await tenantDeLaFila(app, "promo_plans", d.promoPlanId),
        await tenantDeLaFila(app, "schedules", d.scheduleId),
        await tenantDeLaFila(app, "bookings", d.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", d.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", d.holidayId),
        await tenantDeLaFila(app, "subscription_schedule_changes", d.scheduleChangeId),
        await tenantDeLaFila(app, "subscription_schedules", d.subscriptionScheduleId),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ` +
        `ese INSERT perdio su \`tenantValues(CTX_DOS, …)\` y cayo en el DEFAULT 1: el ` +
        `"segundo gimnasio" seria en realidad El Templo y TODOS los controles positivos ` +
        `de abajo estarian mirando datos de El Templo.`,
    ).toEqual(Array(10).fill(TENANT_DOS));
  });

  it("los importes sembrados (pricePaid/priceRegular) son de otro orden de magnitud entre los dos gimnasios", async () => {
    // Mismo criterio que members-gimnasio-dos.ts: un preview de pricing o una
    // lectura contaminada que devolviera/sumara el valor ajeno daria un
    // numero EVIDENTEMENTE otro, no un "de mas" sutil.
    expect(
      [fx.templo.pricePaid, fx.dos.pricePaid, fx.dos.priceRegularEspecial],
      `Los importes sembrados dejaron de ser distinguibles entre gimnasios. Revisar ` +
        `test/fixtures/subs-sched-gimnasio-dos.ts.`,
    ).toEqual([11100, 888800, 850000]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Las 10 rutas admin
// ═══════════════════════════════════════════════════════════════════════════

describe("catalogo de planes — GET /api/admin/subscriptions/plans", () => {
  const RUTA = "GET /api/admin/subscriptions/plans";

  it("aislamiento: el catalogo no trae el plan de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos("/plans");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { plans: Array<{ id: number }> };
    expect(
      body.plans.map((p) => p.id),
      porQueImportaElListado(RUTA, fx.templo.planId),
    ).not.toContain(fx.templo.planId);
    for (const p of body.plans) {
      expect(
        await tenantDeLaFila(app, "subscription_plans", p.id),
        porQueImportaElListado(RUTA, p.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el catalogo SI trae el plan presencial propio y el pase especial propio", async () => {
    const res = await getAdminComoGimnasioDos("/plans");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { plans: Array<{ id: number }> };
    const ids = body.plans.map((p) => p.id);
    expect(ids, porQueImportaElControl(RUTA, gym2.planId)).toContain(
      gym2.planId,
    );
    expect(
      ids,
      porQueImportaElControl(RUTA, fx.dos.planEspecialId),
    ).toContain(fx.dos.planEspecialId);
  });
});

describe("detalle de plan — GET /api/admin/subscriptions/plans/:planId", () => {
  const RUTA = "GET /api/admin/subscriptions/plans/:planId";

  it("aislamiento: el plan de El Templo da 404", async () => {
    const res = await getAdminComoGimnasioDos(`/plans/${fx.templo.planId}`);
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.planId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el plan propio del gimnasio 2 SI se puede leer, con su nombre y precio reales", async () => {
    const res = await getAdminComoGimnasioDos(`/plans/${gym2.planId}`);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.planId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      id: number;
      name: string;
      priceRegular: number;
    };
    const nombreReal = await campoDeLaFila(
      app,
      "subscription_plans",
      "name",
      gym2.planId,
    );
    const precioReal = await campoDeLaFila(
      app,
      "subscription_plans",
      "price_regular",
      gym2.planId,
    );
    expect(body.id).toBe(gym2.planId);
    expect(body.name).toBe(nombreReal);
    expect(String(body.priceRegular)).toBe(precioReal);
  });
});

describe("catalogo de promo-plans — GET /api/admin/subscriptions/promo-plans", () => {
  const RUTA = "GET /api/admin/subscriptions/promo-plans";

  it("aislamiento: el catalogo no trae el promo de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos("/promo-plans");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const promos = JSON.parse(res.body) as Array<{ id: number }>;
    expect(
      promos.map((p) => p.id),
      porQueImportaElListado(RUTA, fx.templo.promoPlanId),
    ).not.toContain(fx.templo.promoPlanId);
    for (const p of promos) {
      expect(
        await tenantDeLaFila(app, "promo_plans", p.id),
        porQueImportaElListado(RUTA, p.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el catalogo SI trae el promo propio del gimnasio 2, con su codigo real", async () => {
    const res = await getAdminComoGimnasioDos("/promo-plans");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const promos = JSON.parse(res.body) as Array<{
      id: number;
      promoCode: string;
    }>;
    const propio = promos.find((p) => p.id === fx.dos.promoPlanId);
    expect(propio, porQueImportaElControl(RUTA, fx.dos.promoPlanId)).toBeDefined();
    expect(propio?.promoCode).toBe(fx.dos.promoCode);
  });
});

describe("suscripcion actual del socio — GET /api/admin/subscriptions/members/:userId/subscription", () => {
  const RUTA =
    "GET /api/admin/subscriptions/members/:userId/subscription";

  it("aislamiento: pedir el userId de El Templo da 404 (no la suscripcion ajena)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/subscription`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el userId propio del gimnasio 2 SI trae su suscripcion real", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscription`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(body.id).toBe(fx.dos.subscriptionId);
    expect(body.pricePaid).toBe(fx.dos.pricePaid);
  });
});

describe("TODAS las suscripciones del socio — GET /api/admin/subscriptions/members/:userId/subscriptions", () => {
  const RUTA =
    "GET /api/admin/subscriptions/members/:userId/subscriptions";

  it("aislamiento: pedir el userId de El Templo da un arreglo VACIO, nunca la suscripcion ajena", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/subscriptions`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      subscriptions: Array<{ id: number }>;
    };
    expect(
      body.subscriptions,
      porQueImportaElListado(RUTA, fx.templo.subscriptionId) +
        ` (se esperaba subscriptions=[] y se recibio ${JSON.stringify(body.subscriptions)})`,
    ).toEqual([]);
  });

  it("control: el userId propio del gimnasio 2 SI trae su suscripcion real en el arreglo", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscriptions`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      subscriptions: Array<{ id: number }>;
    };
    expect(
      body.subscriptions.map((s) => s.id),
      porQueImportaElControl(RUTA, fx.dos.subscriptionId),
    ).toContain(fx.dos.subscriptionId);
  });
});

describe("historial de suscripciones — GET /api/admin/subscriptions/members/:userId/subscription/history", () => {
  const RUTA =
    "GET /api/admin/subscriptions/members/:userId/subscription/history";

  it("aislamiento: pedir el userId de El Templo da un historial VACIO, nunca el ajeno", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/subscription/history`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      subscriptions: Array<{ id: number }>;
    };
    expect(
      body.subscriptions,
      porQueImportaElListado(RUTA, fx.templo.subscriptionId) +
        ` (se esperaba subscriptions=[] y se recibio ${JSON.stringify(body.subscriptions)})`,
    ).toEqual([]);
  });

  it("control: el userId propio del gimnasio 2 SI trae su historial real", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscription/history`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      subscriptions: Array<{ id: number }>;
    };
    expect(
      body.subscriptions.map((s) => s.id),
      porQueImportaElControl(RUTA, fx.dos.subscriptionId),
    ).toContain(fx.dos.subscriptionId);
  });
});

describe("preview de cambio de plan — GET /api/admin/subscriptions/members/:userId/subscription/change-plan-preview", () => {
  const RUTA =
    "GET /api/admin/subscriptions/members/:userId/subscription/change-plan-preview";

  it("aislamiento: el userId de El Templo da 404 (no calcula sobre la suscripcion ajena)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/subscription/change-plan-preview?targetPlanId=${fx.dos.planEspecialId}`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el userId propio con un plan destino propio SI calcula el preview real", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscription/change-plan-preview?targetPlanId=${fx.dos.planEspecialId}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      targetPlan: { id: number };
    };
    expect(body.targetPlan.id).toBe(fx.dos.planEspecialId);
  });
});

describe("preview de pricing — GET /api/admin/subscriptions/members/:userId/subscription/pricing-preview", () => {
  const RUTA =
    "GET /api/admin/subscriptions/members/:userId/subscription/pricing-preview";

  it("aislamiento: NO calcula precio de otro gimnasio ni con socio ajeno ni con plan ajeno (las dos combinaciones)", async () => {
    // Combinacion (a): socio ajeno + plan propio del gimnasio 2.
    const resSocioAjeno = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/subscription/pricing-preview?planId=${gym2.planId}&priceType=regular`,
    );
    expect(
      resSocioAjeno.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.userId) +
        ` (socio ajeno + plan propio) Respuesta: ${resSocioAjeno.body}`,
    ).toBe(404);

    // Combinacion (b): socio propio + plan ajeno (El Templo). La cadena de
    // pricing (T-174.1-01-03) no puede calcular sobre un plan que no es suyo.
    const resPlanAjeno = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscription/pricing-preview?planId=${fx.templo.planId}&priceType=regular`,
    );
    expect(
      resPlanAjeno.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.planId) +
        ` (socio propio + plan ajeno) Respuesta: ${resPlanAjeno.body}`,
    ).toBe(404);
  });

  it("control: socio propio + plan propio SI calcula el precio real, leido de la base", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/subscription/pricing-preview?planId=${gym2.planId}&priceType=regular`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { basePrice: number };
    const precioReal = await campoDeLaFila(
      app,
      "subscription_plans",
      "price_regular",
      gym2.planId,
    );
    expect(String(body.basePrice)).toBe(precioReal);
  });
});

describe("uso de clases de la semana — GET /api/admin/subscriptions/members/:userId/class-usage", () => {
  const RUTA = "GET /api/admin/subscriptions/members/:userId/class-usage";

  it("aislamiento: el userId de El Templo da 404 (no hay suscripcion activa para ese ctx)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${fx.templo.userId}/class-usage`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el userId propio SI trae su uso real, incluido el turno asignado propio", async () => {
    const res = await getAdminComoGimnasioDos(
      `/members/${gym2.socios[0].id}/class-usage`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      weeklyLimit: number | null;
      scheduleIds: number[];
    };
    expect(
      body.scheduleIds,
      porQueImportaElControl(RUTA, fx.dos.scheduleId),
    ).toContain(fx.dos.scheduleId);
  });
});

describe("historial de cambios de turno — GET /api/admin/subscriptions/subscriptions/:subscriptionId/schedule-changes", () => {
  const RUTA =
    "GET /api/admin/subscriptions/subscriptions/:subscriptionId/schedule-changes";

  it("aislamiento: pedir el subscriptionId de El Templo da un historial VACIO, nunca el cambio ajeno", async () => {
    const res = await getAdminComoGimnasioDos(
      `/subscriptions/${fx.templo.subscriptionId}/schedule-changes`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { changes: Array<{ id: number }> };
    expect(
      body.changes,
      porQueImportaElListado(RUTA, fx.templo.scheduleChangeId) +
        ` (se esperaba changes=[] y se recibio ${JSON.stringify(body.changes)})`,
    ).toEqual([]);
  });

  it("control: el subscriptionId propio SI trae su cambio de turno real, con el motivo sembrado", async () => {
    const res = await getAdminComoGimnasioDos(
      `/subscriptions/${fx.dos.subscriptionId}/schedule-changes`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      changes: Array<{ id: number; reason: string | null }>;
    };
    const propio = body.changes.find((c) => c.id === fx.dos.scheduleChangeId);
    expect(
      propio,
      porQueImportaElControl(RUTA, fx.dos.scheduleChangeId),
    ).toBeDefined();
    const motivoReal = await campoDeLaFila(
      app,
      "subscription_schedule_changes",
      "reason",
      fx.dos.scheduleChangeId,
    );
    expect(propio?.reason).toBe(motivoReal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Las 4 rutas app-facing — self-scoped (ver la nota del docblock del archivo)
// ═══════════════════════════════════════════════════════════════════════════

describe("cobertura del socio — GET /api/members/subscription/coverage", () => {
  const RUTA = "GET /api/members/subscription/coverage";

  it("aislamiento: el token del gimnasio 2 nunca devuelve el coveredUntil de El Templo (fechas DISTINTAS a proposito)", async () => {
    const res = await getMemberComo("/coverage", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { coveredUntil: string | null };
    // El Templo vence a los 20 dias, el gimnasio 2 a los 30 (fixture,
    // offsets distintos a proposito): un ctx resuelto mal mostraria la
    // fecha ajena (20 dias) en vez de la propia (30 dias).
    expect(
      body.coveredUntil,
      `${RUTA} devolvio coveredUntil="${body.coveredUntil}" para el token del ` +
        `gimnasio ${TENANT_DOS}, que coincide con el vencimiento AJENO de El Templo ` +
        `(${fx.templo.subscriptionEndDate}). getCoveredUntil (o deriveCoveredUntil) esta ` +
        `mirando la suscripcion equivocada.`,
    ).not.toBe(fx.templo.subscriptionEndDate);
  });

  it("control: el token propio SI trae el coveredUntil real (>= la suscripcion propia)", async () => {
    const res = await getMemberComo("/coverage", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      coveredUntil: string | null;
      daysRemaining: number | null;
    };
    expect(
      body.coveredUntil,
      porQueImportaElControl(RUTA, gym2.socios[0].id),
    ).toBe(fx.dos.subscriptionEndDate);
    expect(body.daysRemaining, porQueImportaElControl(RUTA, gym2.socios[0].id)).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe("pase especial del socio — GET /api/members/subscription/me/especial-pass", () => {
  const RUTA = "GET /api/members/subscription/me/especial-pass";

  it("aislamiento: un socio del gimnasio 2 SIN pase especial da hasPass=false (nunca el pase de otro socio)", async () => {
    // socios[0] tiene la suscripcion presencial, NO la especial (que es de
    // socios[1]): prueba que la ruta nunca devuelve el pase de OTRO usuario,
    // propio o ajeno.
    const res = await getMemberComo("/me/especial-pass", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { hasPass: boolean };
    expect(
      body.hasPass,
      `${RUTA} con el token de un socio SIN pase especial devolvio hasPass=true. La ` +
        `ruta esta devolviendo el pase de otro usuario (propio del gimnasio o, peor, ` +
        `de otro gimnasio).`,
    ).toBe(false);
  });

  it("control: el socio DUEÑO del pase SI lo ve, con los valores reales sembrados", async () => {
    const res = await getMemberComo("/me/especial-pass", gym2.socios[1].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      hasPass: boolean;
      classesRemaining: number;
      classesBudget: number;
      isSocio: boolean;
    };
    expect(body.hasPass, porQueImportaElControl(RUTA, gym2.socios[1].id)).toBe(
      true,
    );
    expect(body.classesRemaining).toBe(1);
    expect(body.classesBudget).toBe(2);
    expect(body.isSocio).toBe(false);
  });
});

describe("suscripcion propia del socio — GET /api/members/subscription/me/subscription", () => {
  const RUTA = "GET /api/members/subscription/me/subscription";

  it("aislamiento: el token del gimnasio 2 nunca trae el pricePaid ni el id de la suscripcion de El Templo", async () => {
    const res = await getMemberComo("/me/subscription", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(
      body.id,
      porQueImportaElListado(RUTA, fx.templo.subscriptionId),
    ).not.toBe(fx.templo.subscriptionId);
    expect(
      body.pricePaid,
      porQueImportaElListado(RUTA, fx.templo.subscriptionId) +
        ` (pricePaid ajeno: ${fx.templo.pricePaid})`,
    ).not.toBe(fx.templo.pricePaid);
  });

  it("control: el token propio SI trae la suscripcion real, con su id y su precio", async () => {
    const res = await getMemberComo("/me/subscription", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      id: number;
      pricePaid: number;
      planCategory: string;
    };
    expect(body.id, porQueImportaElControl(RUTA, gym2.socios[0].id)).toBe(
      fx.dos.subscriptionId,
    );
    expect(body.pricePaid).toBe(fx.dos.pricePaid);
    expect(body.planCategory).toBe("presencial");
  });
});

describe("catalogo de planes del socio — GET /api/members/subscription/plans", () => {
  const RUTA = "GET /api/members/subscription/plans";

  it("aislamiento: el catalogo no trae el plan de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getMemberComo("/plans", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { plans: Array<{ id: number }> };
    expect(
      body.plans.map((p) => p.id),
      porQueImportaElListado(RUTA, fx.templo.planId),
    ).not.toContain(fx.templo.planId);
    for (const p of body.plans) {
      expect(
        await tenantDeLaFila(app, "subscription_plans", p.id),
        porQueImportaElListado(RUTA, p.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el catalogo SI trae el plan presencial propio del gimnasio 2", async () => {
    const res = await getMemberComo("/plans", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { plans: Array<{ id: number }> };
    expect(
      body.plans.map((p) => p.id),
      porQueImportaElControl(RUTA, gym2.planId),
    ).toContain(gym2.planId);
  });
});
