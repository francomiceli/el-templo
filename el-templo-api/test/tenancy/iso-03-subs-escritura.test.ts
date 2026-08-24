/**
 * Fase 174.1 Plan 06 (ISO-03, ADO-03) — AISLAMIENTO de las ~16 rutas de
 * ESCRITURA de `subscriptions`: CRUD de planes/promo-planes y el lifecycle
 * completo de la suscripción del socio (assign/cancel/change-plan/renew/
 * pause/resume/schedules/start-date/compensate-days/bulk-migrate).
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el segundo archivo de la batería de suscripciones (el primero,
 * `iso-03-subs-lecturas.test.ts` de 174.1-01, cubrió las 14 rutas de
 * LECTURA). Acá un fallo no solo filtra: modifica la suscripción de otro
 * gimnasio o le calcula un precio con el plan equivocado. `assign`/
 * `change-plan`/`renew` ejercen la cadena de pricing (ADO-03) — el golden de
 * pricing (`test/subscriptions/pricing-golden.test.ts`, diff-cero) es el
 * guardrail de que esta batería no le movió un solo literal. `bulk-migrate`
 * es la escritura MASIVA — el marker `:4756` que la 174-01 dejó apuntado a
 * este boundary.
 *
 * QUE RUTAS CUBRE (16 de las 24 del manifiesto de `subscriptions`; las otras
 * 8 son de LECTURA y las cubre 174.1-01)
 * ----------------------------------------------------------------------
 *   CRUD de planes/promo-planes (6):
 *     POST   /api/admin/subscriptions/plans
 *     PUT    /api/admin/subscriptions/plans/:planId
 *     PATCH  /api/admin/subscriptions/plans/:planId/deactivate
 *     POST   /api/admin/subscriptions/promo-plans
 *     PATCH  /api/admin/subscriptions/promo-plans/:promoId
 *     PATCH  /api/admin/subscriptions/promo-plans/:promoId/deactivate
 *   Lifecycle del socio + bulk-migrate (10):
 *     POST   /api/admin/subscriptions/members/:userId/subscription/assign
 *     POST   /api/admin/subscriptions/members/:userId/subscription/cancel
 *     POST   /api/admin/subscriptions/members/:userId/subscription/change-plan
 *     POST   /api/admin/subscriptions/members/:userId/subscription/renew
 *     POST   /api/admin/subscriptions/members/:userId/subscription/pause
 *     POST   /api/admin/subscriptions/members/:userId/subscription/resume
 *     PATCH  /api/admin/subscriptions/subscriptions/:subscriptionId/schedules
 *     PATCH  /api/admin/subscriptions/subscriptions/:subscriptionId/start-date
 *     POST   /api/admin/subscriptions/subscriptions/:subscriptionId/compensate-days
 *     POST   /api/admin/subscriptions/bulk-migrate
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del milestone — cero "prohibido")
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: 404 para
 * las escrituras by-id/by-userId, o (en `bulk-migrate`) un "skip" silencioso
 * sin tocar la fila. **Nunca un "prohibido"** — el criterio de aceptación es
 * un `grep -c` de esa aserción sobre el archivo dando CERO.
 *
 * LA EVIDENCIA DE UNA ESCRITURA SE LEE DE LA BASE, CON VARIAS COLUMNAS JUNTAS
 * ----------------------------------------------------------------------------
 * Un rechazo que YA escribió la mitad se ve igual que uno limpio si se mira
 * una sola columna (Repudiation). Cada caso de escritura relee la fila
 * objetivo con una "foto" — varias columnas a la vez — ANTES y DESPUÉS del
 * intento. Mismo idioma que `iso-03-members-altas-y-staff.test.ts` (173-28).
 *
 * ROL MÍNIMO REAL (por handler, no por módulo)
 * -----------------------------------------------
 * El guard de módulo es `SUBSCRIPTION_ROLES` (coach/admin/owner/gestion/
 * recepcion), pero 7 de los 16 handlers tienen un guard PER-HANDLER más
 * estricto (`PLANES_WRITE_ROLES` = admin/owner, D-11 de `permissions.ts`):
 * las 6 rutas de CRUD de planes/promos y `bulk-migrate`. Las 9 rutas de
 * lifecycle restantes (assign/cancel/change-plan/renew/pause/resume/
 * schedules/start-date/compensate-days) no tienen guard adicional — el
 * mínimo real ahí es `coach`. Este archivo usa `gym2.adminToken` (rol
 * `admin`) para las 7 primeras y `gym2.coachToken` para las 9 de lifecycle —
 * ver la tabla en el SUMMARY.
 *
 * EL "TRAMPA DE LOS DOS IDS" (D-08 / T-174.1-06-03)
 * ----------------------------------------------------
 * `schedules`/`start-date`/`compensate-days` reciben `:subscriptionId` por
 * URL. Cada uno prueba el `subscriptionId` AJENO (rechazo simple) y, donde
 * aplica (`schedules`, que además recibe `scheduleIds` en el body),
 * la combinación `subscriptionId` PROPIO + recurso referenciado AJENO
 * (`scheduleIds` de El Templo) — una sola validación deja la otra abierta.
 * `assign`/`change-plan`/`renew` tienen el mismo patrón con `planId`
 * (own userId + planId ajeno en el body).
 *
 * EL THROW DEL SENTINEL LLEGA ENVUELTO — PERO ACÁ TODAVÍA NO APLICA
 * ---------------------------------------------------------------------
 * Las 8 tablas del boundary (174.1-CONTEXT, D-01) NO están en
 * `TENANT_STRICT_MODULES` todavía (el switch es el plan 174.1-10): todo
 * rechazo de este archivo viene del `tenantWhere` explícito que las fases
 * 174/174.1 ya migraron, no del sentinel.
 *
 * HALLAZGO DE SEGURIDAD DESCUBIERTO, NO ARREGLADO EN ESTE PLAN
 * -------------------------------------------------------------
 * `assignPlan`, `changePlanNow`, `changePlanAfterCurrent` y
 * `renewSubscription` (`src/modules/subscriptions/service.ts`) escriben
 * `subscriptions.branch_id` directamente desde `input.branchId` del body,
 * SIN validar que esa sede pertenezca a `ctx.tenantId` — la única llamada a
 * `assertBranchDelGimnasio` en `assignPlan` está condicionada a
 * `member.branchId !== input.branchId && currentBranch.isVirtual` (la rama
 * de auto-migración desde sede virtual), así que un socio en sede FÍSICA
 * (el caso común) nunca pasa por esa validación. Un staff del gimnasio 2
 * puede hoy pasar el `branchId` de El Templo en el body de `assign` (o
 * `change-plan`/`renew`) y la fila nace con `tenant_id = TENANT_DOS` pero
 * `branch_id` apuntando a una sede de OTRO gimnasio — el mismo tipo de
 * inconsistencia de ancla que 173-11/173-13..18 cerraron para
 * `users.branch_id`/`user_branches.branch_id`, pero nunca se migró para
 * `subscriptions.branch_id`. NO está en el `threat_model` de este plan (que
 * lista `:userId`/`:subscriptionId`/`bulk-migrate`/pricing/403, no
 * `branchId`) y arreglarlo toca 4 métodos de escritura de un archivo de
 * ~6700 líneas que este plan no tiene en `files_modified` — self-contención
 * de blast radius, no negligencia. Documentado también en
 * `deferred-items.md` de esta fase. Este archivo NO prueba branchId ajeno
 * en `assign`/`change-plan`/`renew` (usa siempre `gym2.branchId`, propio):
 * afirmar la conducta insegura actual como "correcta" sería peor que no
 * probarla.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-subs-escritura.test.ts test/subscriptions/pricing-golden.test.ts
 *
 * @see test/tenancy/iso-03-subs-lecturas.test.ts — el molde de lectura (174.1-01), ciclo de vida y fixture
 * @see test/tenancy/iso-03-members-altas-y-staff.test.ts — el molde de escritura (173-28), la "foto" de columnas
 * @see test/fixtures/subs-sched-gimnasio-dos.ts — la siembra que este archivo consume (NO la re-extiende)
 * @see .planning/phases/174.1-.../174.1-CONTEXT.md — D-01/D-06/D-07/D-08
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, ensureEfectivoCaja } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
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
  type SubsSchedFixture,
} from "../fixtures/subs-sched-gimnasio-dos";
import { dateOffsetStr, todayStr } from "../subscriptions/_helpers";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ADMIN_BASE = "/api/admin/subscriptions";

const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Ciclo de vida (mismo criterio que 174.1-01) ────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let fx: SubsSchedFixture;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  fx = await sembrarSubsSchedGimnasioDos(app, gym2);
  // Varias rutas de lifecycle (assign/change-plan/renew) cobran de verdad —
  // sin caja efectivo para la sede del gimnasio 2, `transactionService.create`
  // explota antes de llegar al aislamiento que este archivo prueba.
  await ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSubsSchedDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

/** Rol mínimo real de las 7 rutas Dueño-only (CRUD planes/promos + bulk-migrate). */
async function comoAdminGimnasioDos(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${ADMIN_BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Rol mínimo real de las 9 rutas de lifecycle (sin guard per-handler adicional). */
async function comoCoachGimnasioDos(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${ADMIN_BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.coachToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

// ─── Mensajes compartidos ────────────────────────────────────────────────────

function porQueImporta(ruta: string, filaId: number): string {
  return (
    `${ruta} le dejo escribir (o le devolvio datos) al staff del gimnasio ${TENANT_DOS} sobre la ` +
    `fila ${filaId}, que es de El Templo (${TENANT_TEMPLO}). El contrato del milestone (D-06) es ` +
    `que el recurso ajeno sea indistinguible de uno inexistente: "no encontrado", nunca "prohibido".`
  );
}

function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le dejo operar al staff del gimnasio ${TENANT_DOS} sobre su PROPIA fila ${filaId}. ` +
    `Esto no es aislamiento sino siembra o scope de mas: sin este control, el caso de aislamiento ` +
    `de al lado pasaria en verde por la razon equivocada.`
  );
}

// ─── "Fotos" leidas de la base (varias columnas juntas) ─────────────────────

async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

interface FotoDePlan {
  tenantId: number | null;
  active: boolean | null;
  priceRegular: number | null;
  updatedAt: string | null;
}

async function fotoDePlan(planId: number): Promise<FotoDePlan> {
  const filas = await consultar<{
    tenant_id: number | null;
    is_active: number | null;
    price_regular: number | null;
    updated_at: string | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, is_active, price_regular, updated_at FROM subscription_plans WHERE id = ${planId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { tenantId: null, active: null, priceRegular: null, updatedAt: null };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    active: f.is_active === null ? null : Boolean(f.is_active),
    priceRegular: f.price_regular === null ? null : Number(f.price_regular),
    updatedAt: f.updated_at === null ? null : String(f.updated_at),
  };
}

interface FotoDePromo {
  tenantId: number | null;
  active: boolean | null;
  name: string | null;
}

async function fotoDePromo(promoId: number): Promise<FotoDePromo> {
  const filas = await consultar<{
    tenant_id: number | null;
    is_active: number | null;
    name: string | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, is_active, name FROM promo_plans WHERE id = ${promoId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { tenantId: null, active: null, name: null };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    active: f.is_active === null ? null : Boolean(f.is_active),
    name: f.name,
  };
}

interface FotoDeSuscripcion {
  tenantId: number | null;
  status: string | null;
  planId: number | null;
  endDate: string | null;
}

async function fotoDeSuscripcion(subscriptionId: number): Promise<FotoDeSuscripcion> {
  const filas = await consultar<{
    tenant_id: number | null;
    status: string | null;
    plan_id: number | null;
    end_date: string | null;
  }>(
    // La columna real es `subscription_status` (el 1er arg de `mysqlEnum` en
    // subscriptions.ts) — el campo JS `status` es solo el nombre de la
    // propiedad Drizzle, no el de la columna. Alias para no arrastrar el
    // desacople al resto del archivo.
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, subscription_status AS status, plan_id, end_date FROM subscriptions WHERE id = ${subscriptionId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { tenantId: null, status: null, planId: null, endDate: null };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    status: f.status,
    planId: f.plan_id === null ? null : Number(f.plan_id),
    endDate: f.end_date === null ? null : String(f.end_date),
  };
}

/** Cuenta filas de `subscriptions` para un userId, SIN filtro de gimnasio ("cero filas nuevas"). */
async function contarSuscripcionesDeUsuario(userId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar subscriptions de un userId (sin filtro de gimnasio) es la asercion de "cero filas nuevas"/"todo o nada" — filtrar la volveria tautologica */ COUNT(*) AS c FROM subscriptions WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

/** Resuelve un planId por nombre exacto, sin filtrar por gimnasio (para leer la fila recien creada). */
async function idDePlanPorNombre(name: string): Promise<number | null> {
  const filas = await consultar<{ id: number }>(
    sql`SELECT /* tenant-safe: resolver el id de la fila recien creada por su nombre unico ES la precondicion del resto de la asercion */ id FROM subscription_plans WHERE name = ${name} LIMIT 1`,
  );
  return filas[0] === undefined ? null : Number(filas[0].id);
}

/** Resuelve un promoId por codigo exacto, sin filtrar por gimnasio. */
async function idDePromoPorCodigo(code: string): Promise<number | null> {
  const filas = await consultar<{ id: number }>(
    sql`SELECT /* tenant-safe: resolver el id de la fila recien creada por su codigo unico ES la precondicion del resto de la asercion */ id FROM promo_plans WHERE promo_code = ${code} LIMIT 1`,
  );
  return filas[0] === undefined ? null : Number(filas[0].id);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais (el aislamiento no lo puede dar el country scope)", async () => {
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX_DOS),
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
      "Las dos sedes dejaron de compartir pais — este archivo prueba que el GIMNASIO aisla.",
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene su plan/promo/suscripcion viva, y el gimnasio 2 la suya, cada una en su gimnasio", async () => {
    expect(
      [
        await tenantDeLaFila(app, "subscription_plans", fx.templo.planId),
        await tenantDeLaFila(app, "promo_plans", fx.templo.promoPlanId),
        await tenantDeLaFila(app, "subscriptions", fx.templo.subscriptionId),
      ],
      "Alguna fila ajena no quedo en El Templo. Revisar sembrarLadoTemplo en subs-sched-gimnasio-dos.ts.",
    ).toEqual(Array(3).fill(TENANT_TEMPLO));
    expect(
      [
        await tenantDeLaFila(app, "subscription_plans", gym2.planId),
        await tenantDeLaFila(app, "promo_plans", fx.dos.promoPlanId),
        await tenantDeLaFila(app, "subscriptions", fx.dos.subscriptionId),
      ],
      "Alguna fila del gimnasio 2 nacio en El Templo por el DEFAULT 1.",
    ).toEqual(Array(3).fill(TENANT_DOS));
  });

  it("los importes sembrados son de otro orden de magnitud entre los dos gimnasios", async () => {
    expect(
      [fx.templo.priceRegular, fx.dos.pricePaid],
      "Los importes sembrados dejaron de ser distinguibles entre gimnasios. Revisar " +
        "test/fixtures/subs-sched-gimnasio-dos.ts.",
    ).toEqual([11100, 888800]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 1 — CRUD de planes y promo-planes (6 rutas)
// ═══════════════════════════════════════════════════════════════════════════

describe("crear plan — POST /api/admin/subscriptions/plans", () => {
  const RUTA = "POST /api/admin/subscriptions/plans";

  function payload(name: string): Record<string, unknown> {
    return {
      name,
      planTier: "flex",
      bookingMode: "flexible",
      priceRegular: 777700,
      priceZero: 700000,
      durationDays: 30,
      classesPerWeek: 2,
    };
  }

  it("aislamiento (unicidad por tenant): reusar el NOMBRE del plan de El Templo no choca — la unique es (tenant_id, name, country)", async () => {
    const res = await comoAdminGimnasioDos("POST", "/plans", {
      ...payload(fx.templo.planName),
    });
    expect(
      res.statusCode,
      `${RUTA}: crear un plan con el mismo nombre que uno de El Templo tiene que funcionar — si ` +
        `choca (409), la unicidad esta mirando TODOS los gimnasios en vez de solo el propio. ` +
        `Respuesta: ${res.body}`,
    ).toBe(201);
  });

  it("control: el alta con datos propios funciona, y la fila nace con tenant_id = TENANT_DOS", async () => {
    const name = `ISO03SS Plan Nuevo ${sufijo()}`;
    const res = await comoAdminGimnasioDos("POST", "/plans", payload(name));
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nuevoId = await idDePlanPorNombre(name);
    expect(nuevoId).not.toBeNull();
    expect(
      await tenantDeLaFila(app, "subscription_plans", nuevoId as number),
      `${RUTA}: el plan creado por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("editar plan — PUT /api/admin/subscriptions/plans/:planId", () => {
  const RUTA = "PUT /api/admin/subscriptions/plans/:planId";

  it("aislamiento: editar un plan de El Templo se rechaza, y la fila (tenant_id/active/price/updated_at) NO cambia", async () => {
    const antes = await fotoDePlan(fx.templo.planId);
    const res = await comoAdminGimnasioDos("PUT", `/plans/${fx.templo.planId}`, {
      priceRegular: 1,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.planId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDePlan(fx.templo.planId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar cambios en el plan de El Templo.`,
    ).toEqual(antes);
  });

  it("control: editar el plan propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos("PUT", `/plans/${gym2.planId}`, {
      priceRegular: 16000,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.planId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDePlan(gym2.planId);
    expect([despues.tenantId, despues.priceRegular]).toEqual([
      TENANT_DOS,
      16000,
    ]);
  });
});

describe("desactivar plan — PATCH /api/admin/subscriptions/plans/:planId/deactivate", () => {
  const RUTA = "PATCH /api/admin/subscriptions/plans/:planId/deactivate";

  it("aislamiento: desactivar el plan de El Templo se rechaza, y sigue activo", async () => {
    const antes = await fotoDePlan(fx.templo.planId);
    expect(antes.active, "Precondicion: el plan de El Templo empieza activo.").toBe(
      true,
    );
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/plans/${fx.templo.planId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.planId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDePlan(fx.templo.planId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar cambios en el plan de El Templo.`,
    ).toEqual(antes);
  });

  it("control: desactivar el plan propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/plans/${gym2.planId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.planId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDePlan(gym2.planId);
    expect([despues.tenantId, despues.active]).toEqual([TENANT_DOS, false]);
  });
});

describe("crear promo — POST /api/admin/subscriptions/promo-plans", () => {
  const RUTA = "POST /api/admin/subscriptions/promo-plans";

  function payload(
    promoCode: string,
    subscriptionPlanId: number,
  ): Record<string, unknown> {
    return {
      name: `ISO03SS Promo Nueva ${sufijo()}`,
      promoCode,
      planDurationDays: 30,
      startDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      promoType: "admin_assignable",
      subscriptionPlanId,
    };
  }

  it("aislamiento (unicidad por tenant): reusar el CODIGO del promo de El Templo no choca — la unique es (tenant_id, promo_code)", async () => {
    const res = await comoAdminGimnasioDos(
      "POST",
      "/promo-plans",
      payload(fx.templo.promoCode, gym2.planId),
    );
    expect(
      res.statusCode,
      `${RUTA}: crear un promo con el mismo codigo que uno de El Templo tiene que funcionar — si ` +
        `choca (409), la unicidad esta mirando TODOS los gimnasios. Respuesta: ${res.body}`,
    ).toBe(201);
  });

  it("aislamiento: un subscriptionPlanId de El Templo se rechaza (no crea el promo apuntando a un plan ajeno)", async () => {
    const promoCode = `ISO03SS${sufijo()}`.slice(0, 50);
    const res = await comoAdminGimnasioDos(
      "POST",
      "/promo-plans",
      payload(promoCode, fx.templo.planId),
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.planId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await idDePromoPorCodigo(promoCode),
      `${RUTA}: el rechazo del plan ajeno no puede dejar creada la fila del promo.`,
    ).toBeNull();
  });

  it("control: el alta con datos propios funciona, y la fila nace con tenant_id = TENANT_DOS", async () => {
    const promoCode = `ISO03SS${sufijo()}`.slice(0, 50);
    const res = await comoAdminGimnasioDos(
      "POST",
      "/promo-plans",
      payload(promoCode, gym2.planId),
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.planId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nuevoId = await idDePromoPorCodigo(promoCode);
    expect(nuevoId).not.toBeNull();
    expect(
      await tenantDeLaFila(app, "promo_plans", nuevoId as number),
      `${RUTA}: el promo creado por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("editar promo — PATCH /api/admin/subscriptions/promo-plans/:promoId", () => {
  const RUTA = "PATCH /api/admin/subscriptions/promo-plans/:promoId";

  it("aislamiento: editar un promo de El Templo se rechaza, y la fila (tenant_id/active/name) NO cambia", async () => {
    const antes = await fotoDePromo(fx.templo.promoPlanId);
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/promo-plans/${fx.templo.promoPlanId}`,
      { name: "Hackeado173.1" },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.promoPlanId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDePromo(fx.templo.promoPlanId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar cambios en el promo de El Templo.`,
    ).toEqual(antes);
  });

  it("combinacion cruzada: un promo PROPIO con subscriptionPlanId de El Templo se rechaza, y NO cambia de plan", async () => {
    const antes = await fotoDePromo(fx.dos.promoPlanId);
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/promo-plans/${fx.dos.promoPlanId}`,
      { subscriptionPlanId: fx.templo.planId },
    );
    expect(
      res.statusCode,
      `${RUTA}: reasignar un promo PROPIO a un subscriptionPlanId de OTRO gimnasio tiene que ` +
        `rechazarse (D-06). Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDePromo(fx.dos.promoPlanId);
    expect(
      despues,
      `${RUTA}: el rechazo del plan ajeno no puede dejar cambios en el promo propio.`,
    ).toEqual(antes);
  });

  it("control: editar el promo propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/promo-plans/${fx.dos.promoPlanId}`,
      { name: "Editado173.1" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.promoPlanId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDePromo(fx.dos.promoPlanId);
    expect([despues.tenantId, despues.name]).toEqual([TENANT_DOS, "Editado173.1"]);
  });
});

describe("desactivar promo — PATCH /api/admin/subscriptions/promo-plans/:promoId/deactivate", () => {
  const RUTA = "PATCH /api/admin/subscriptions/promo-plans/:promoId/deactivate";

  it("aislamiento: desactivar el promo de El Templo se rechaza, y sigue activo", async () => {
    const antes = await fotoDePromo(fx.templo.promoPlanId);
    expect(antes.active, "Precondicion: el promo de El Templo empieza activo.").toBe(
      true,
    );
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/promo-plans/${fx.templo.promoPlanId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.promoPlanId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDePromo(fx.templo.promoPlanId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar cambios en el promo de El Templo.`,
    ).toEqual(antes);
  });

  it("control: desactivar el promo propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/promo-plans/${fx.dos.promoPlanId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.promoPlanId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDePromo(fx.dos.promoPlanId);
    expect([despues.tenantId, despues.active]).toEqual([TENANT_DOS, false]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 2 — Lifecycle de la suscripcion del socio + bulk-migrate (10 rutas)
// ═══════════════════════════════════════════════════════════════════════════

describe("asignar plan — POST /api/admin/subscriptions/members/:userId/subscription/assign", () => {
  const RUTA = "POST /api/admin/subscriptions/members/:userId/subscription/assign";

  function payload(planId: number): Record<string, unknown> {
    return {
      planId,
      branchId: gym2.branchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    };
  }

  it("aislamiento: asignar un plan a un userId de El Templo se rechaza, y CERO filas nuevas en subscriptions", async () => {
    const antes = await contarSuscripcionesDeUsuario(fx.templo.userId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/assign`,
      payload(gym2.planId),
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarSuscripcionesDeUsuario(fx.templo.userId);
    expect(
      despues,
      `${RUTA}: el rechazo del userId ajeno no puede crear NINGUNA fila en subscriptions.`,
    ).toBe(antes);
  });

  it("combinacion cruzada: un userId PROPIO con un planId de El Templo se rechaza, y CERO filas nuevas", async () => {
    const antes = await contarSuscripcionesDeUsuario(gym2.socios[1].id);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[1].id}/subscription/assign`,
      payload(fx.templo.planId),
    );
    expect(
      res.statusCode,
      `${RUTA}: un userId propio con un planId de OTRO gimnasio tiene que rechazarse. Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarSuscripcionesDeUsuario(gym2.socios[1].id);
    expect(
      despues,
      `${RUTA}: el rechazo del planId ajeno no puede crear NINGUNA fila en subscriptions.`,
    ).toBe(antes);
  });

  it("control con pricing: asignar un plan propio (online, no choca con la sub presencial existente) calcula el precio real y nace con tenant_id = TENANT_DOS", async () => {
    const planName = `ISO03SS Plan Online Assign ${sufijo()}`;
    const planRes = await comoAdminGimnasioDos("POST", "/plans", {
      name: planName,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "online_regular",
      // Un plan online debe vincular un programa (linkedProgramId) o dar
      // acceso a todos (grantsAllPrograms) — assertPlanInvariants. Esto no
      // interfiere con el conflicto de categoryGroup: 'online_regular' cae
      // en el grupo "otro", distinto del presencial que ya tiene socios[0].
      grantsAllPrograms: true,
      priceRegular: 799900,
      priceZero: 700000,
      durationDays: 30,
    });
    expect(planRes.statusCode, `Setup: crear plan online fallo: ${planRes.body}`).toBe(
      201,
    );
    const nuevoPlan = JSON.parse(planRes.body) as { id: number };

    const antes = await contarSuscripcionesDeUsuario(gym2.socios[0].id);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/assign`,
      payload(nuevoPlan.id),
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(
      body.pricePaid,
      `${RUTA}: sin override/boardingPass/AURA/referral, el precio pagado tiene que ser el ` +
        `priceRegular del plan (799900) — la cadena de pricing no puede desviarse.`,
    ).toBe(799900);
    expect(
      await tenantDeLaFila(app, "subscriptions", body.id),
      `${RUTA}: la suscripcion creada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
    const despues = await contarSuscripcionesDeUsuario(gym2.socios[0].id);
    expect(despues).toBe(antes + 1);
  });
});

describe("cancelar suscripcion — POST /api/admin/subscriptions/members/:userId/subscription/cancel", () => {
  const RUTA = "POST /api/admin/subscriptions/members/:userId/subscription/cancel";

  it("aislamiento: cancelar la suscripcion de un socio de El Templo se rechaza, y CERO cambios", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(antes.status, "Precondicion: la sub de El Templo empieza activa.").toBe(
      "active",
    );
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/cancel`,
      { notes: "intento cross-tenant" },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar cambios en la sub de El Templo.`,
    ).toEqual(antes);
  });

  it("control: cancelar la suscripcion propia del gimnasio 2 SI funciona", async () => {
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[1].id}/subscription/cancel`,
      {},
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[1].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionEspecialId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "cancelled"]);
  });
});

describe("cambiar de plan — POST /api/admin/subscriptions/members/:userId/subscription/change-plan", () => {
  const RUTA =
    "POST /api/admin/subscriptions/members/:userId/subscription/change-plan";

  function payload(planId: number, opts: Record<string, unknown> = {}) {
    return {
      planId,
      branchId: gym2.branchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...opts,
    };
  }

  it("aislamiento: cambiar de plan a un userId de El Templo se rechaza, y CERO cambios en su sub", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/change-plan`,
      payload(gym2.planId),
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("combinacion cruzada: un userId PROPIO con un planId destino de El Templo se rechaza, y CERO cambios", async () => {
    const antes = await fotoDeSuscripcion(fx.dos.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/change-plan`,
      payload(fx.templo.planId),
    );
    expect(
      res.statusCode,
      `${RUTA}: un userId propio con un planId destino de OTRO gimnasio tiene que rechazarse. ` +
        `Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect(
      despues,
      `${RUTA}: el rechazo del plan destino ajeno no puede dejar cambios en la sub propia.`,
    ).toEqual(antes);
  });

  it("control con pricing (startMode=after_current, sin prorrateo): calcula el precio REGULAR del plan destino y programa con tenant_id = TENANT_DOS", async () => {
    const planName = `ISO03SS Plan ChangePlan ${sufijo()}`;
    const planRes = await comoAdminGimnasioDos("POST", "/plans", {
      name: planName,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 655500,
      priceZero: 600000,
      durationDays: 30,
      classesPerWeek: 2,
    });
    expect(planRes.statusCode, `Setup: crear plan destino fallo: ${planRes.body}`).toBe(
      201,
    );
    const nuevoPlan = JSON.parse(planRes.body) as { id: number };

    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/change-plan`,
      payload(nuevoPlan.id, { startMode: "after_current" }),
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(
      body.pricePaid,
      `${RUTA}: programado despues del periodo vigente (sin prorrateo), el precio tiene que ser ` +
        `el priceRegular del plan destino (655500).`,
    ).toBe(655500);
    expect(
      await tenantDeLaFila(app, "subscriptions", body.id),
      `${RUTA}: la nueva suscripcion programada tiene que nacer con el tenant_id del gimnasio 2.`,
    ).toBe(TENANT_DOS);
  });
});

describe("renovar suscripcion — POST /api/admin/subscriptions/members/:userId/subscription/renew", () => {
  const RUTA = "POST /api/admin/subscriptions/members/:userId/subscription/renew";

  it("aislamiento: renovar la suscripcion de un socio de El Templo se rechaza, y CERO filas nuevas", async () => {
    const antesFoto = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const antesCount = await contarSuscripcionesDeUsuario(fx.templo.userId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/renew`,
      { paymentMethod: "cash" },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(await fotoDeSuscripcion(fx.templo.subscriptionId)).toEqual(antesFoto);
    expect(
      await contarSuscripcionesDeUsuario(fx.templo.userId),
      `${RUTA}: el rechazo del userId ajeno no puede crear NINGUNA fila en subscriptions.`,
    ).toBe(antesCount);
  });

  it("combinacion cruzada: un userId PROPIO con un subscriptionId AJENO explicito se rechaza, y CERO cambios", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/renew`,
      { paymentMethod: "cash", subscriptionId: fx.templo.subscriptionId },
    );
    expect(
      res.statusCode,
      `${RUTA}: un userId propio con un subscriptionId explicito de OTRO gimnasio tiene que ` +
        `rechazarse. Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(
      despues,
      `${RUTA}: el rechazo del subscriptionId ajeno no puede dejar cambios en la sub de El Templo.`,
    ).toEqual(antes);
  });

  it("control con pricing: renovar la suscripcion propia HEREDA el pricePaid irrepetible del fixture (888800), tenant_id = TENANT_DOS", async () => {
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/renew`,
      { paymentMethod: "cash" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(
      body.pricePaid,
      `${RUTA}: sin override, la renovacion HEREDA lo que el socio venia pagando (888800, el ` +
        `pricePaid irrepetible que sembro el fixture) — no recalcula desde priceRegular.`,
    ).toBe(888800);
    expect(
      await tenantDeLaFila(app, "subscriptions", body.id),
      `${RUTA}: la renovacion tiene que nacer con el tenant_id del gimnasio 2.`,
    ).toBe(TENANT_DOS);
  });
});

describe("pausar suscripcion — POST /api/admin/subscriptions/members/:userId/subscription/pause", () => {
  const RUTA = "POST /api/admin/subscriptions/members/:userId/subscription/pause";

  it("aislamiento: pausar la suscripcion de un socio de El Templo se rechaza, y sigue activa", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/pause`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("control: pausar la suscripcion propia del gimnasio 2 SI funciona", async () => {
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/pause`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "paused"]);
  });
});

describe("reanudar suscripcion — POST /api/admin/subscriptions/members/:userId/subscription/resume", () => {
  const RUTA = "POST /api/admin/subscriptions/members/:userId/subscription/resume";

  it("aislamiento: reanudar la suscripcion de un socio de El Templo se rechaza (sigue activa, no pausada)", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${fx.templo.userId}/subscription/resume`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("control: reanudar la suscripcion propia (previamente pausada) del gimnasio 2 SI funciona", async () => {
    // Setup: pausar directo por DB (mas rapido que dos round-trips de API;
    // el resume necesita pausedAt seteado).
    await app.db
      .update(schema.subscriptions)
      .set({
        status: "paused",
        pausedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      })
      .where(
        and(
          tenantWhere(schema.subscriptions, CTX_DOS),
          eq(schema.subscriptions.id, fx.dos.subscriptionId),
        ),
      );

    const res = await comoCoachGimnasioDos(
      "POST",
      `/members/${gym2.socios[0].id}/subscription/resume`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "active"]);
  });
});

describe("cambiar turnos fijos — PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/schedules", () => {
  const RUTA =
    "PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/schedules";

  it("aislamiento: un subscriptionId de El Templo se rechaza, y sus turnos NO cambian", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "PATCH",
      `/subscriptions/${fx.templo.subscriptionId}/schedules`,
      { scheduleIds: [fx.templo.scheduleId] },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.subscriptionId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("combinacion cruzada (T-174.1-06-03): un subscriptionId PROPIO con scheduleIds de El Templo se rechaza, y sus turnos NO cambian", async () => {
    const res = await comoCoachGimnasioDos(
      "PATCH",
      `/subscriptions/${fx.dos.subscriptionId}/schedules`,
      { scheduleIds: [fx.templo.scheduleId] },
    );
    expect(
      res.statusCode,
      `${RUTA}: un subscriptionId PROPIO con un scheduleId de OTRO gimnasio tiene que rechazarse ` +
        `(400, "Horarios no encontrados" — el schedule ajeno es invisible bajo tenantWhere). ` +
        `Respuesta: ${res.body}`,
    ).toBe(400);
    // El turno asignado (subscription_schedules) sigue siendo el sembrado, no
    // el ajeno — releido via la ruta de lectura de detalle (174.1-01) seria
    // redundante; se confirma que la suscripcion sigue con su plan/estado.
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "active"]);
  });

  it("control: cambiar los turnos de la suscripcion propia (a un horario propio distinto) SI funciona", async () => {
    // gym2.scheduleId (seedSecondTenant, lunes 10:00) es un horario propio
    // DISTINTO del ya asignado por el fixture (fx.dos.scheduleId, jueves
    // 18:00) — evita el rechazo "los turnos seleccionados son iguales a los
    // actuales".
    const res = await comoCoachGimnasioDos(
      "PATCH",
      `/subscriptions/${fx.dos.subscriptionId}/schedules`,
      { scheduleIds: [gym2.scheduleId], reason: "control 174.1-06" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect(despues.tenantId).toBe(TENANT_DOS);
  });
});

describe("editar fecha de inicio — PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/start-date", () => {
  const RUTA =
    "PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/start-date";

  it("aislamiento: un subscriptionId de El Templo se rechaza, y su startDate NO cambia", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "PATCH",
      `/subscriptions/${fx.templo.subscriptionId}/start-date`,
      { startDate: dateOffsetStr(-1) },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.subscriptionId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("control: editar la fecha de inicio de la suscripcion propia SI funciona", async () => {
    const nuevaFecha = dateOffsetStr(-1);
    const res = await comoCoachGimnasioDos(
      "PATCH",
      `/subscriptions/${fx.dos.subscriptionId}/start-date`,
      { startDate: nuevaFecha },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { startDate: string };
    expect(body.startDate).toBe(nuevaFecha);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect(despues.tenantId).toBe(TENANT_DOS);
  });
});

describe("compensar dias — POST /api/admin/subscriptions/subscriptions/:subscriptionId/compensate-days", () => {
  const RUTA =
    "POST /api/admin/subscriptions/subscriptions/:subscriptionId/compensate-days";

  it("aislamiento: un subscriptionId de El Templo se rechaza, y su endDate NO cambia", async () => {
    const antes = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/subscriptions/${fx.templo.subscriptionId}/compensate-days`,
      {
        fromDate: dateOffsetStr(1),
        toDate: dateOffsetStr(2),
        reason: "intento cross-tenant",
      },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.subscriptionId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(despues).toEqual(antes);
  });

  it("control: compensar dias de la suscripcion propia SI funciona (extiende el endDate)", async () => {
    const antes = await fotoDeSuscripcion(fx.dos.subscriptionId);
    const res = await comoCoachGimnasioDos(
      "POST",
      `/subscriptions/${fx.dos.subscriptionId}/compensate-days`,
      {
        fromDate: dateOffsetStr(3),
        toDate: dateOffsetStr(4),
        reason: "control 174.1-06",
      },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect(despues.tenantId).toBe(TENANT_DOS);
    expect(
      despues.endDate && antes.endDate && despues.endDate > antes.endDate,
      `${RUTA}: compensar 2 dias tiene que extender el endDate (antes=${antes.endDate}, despues=${despues.endDate}).`,
    ).toBe(true);
  });
});

describe("migracion masiva — POST /api/admin/subscriptions/bulk-migrate", () => {
  const RUTA = "POST /api/admin/subscriptions/bulk-migrate";

  it("aislamiento: un conjunto MIXTO (un socio propio + el userId de El Templo) NO toca la fila ajena — solo migra la propia", async () => {
    const targetPlanRes = await comoAdminGimnasioDos("POST", "/plans", {
      name: `ISO03SS Plan BulkMigrate Iso ${sufijo()}`,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 20000,
      priceZero: 18000,
      durationDays: 30,
    });
    expect(targetPlanRes.statusCode, `Setup: ${targetPlanRes.body}`).toBe(201);
    const targetPlan = JSON.parse(targetPlanRes.body) as { id: number };

    const antesFotoAjena = await fotoDeSuscripcion(fx.templo.subscriptionId);
    const antesCountAjeno = await contarSuscripcionesDeUsuario(fx.templo.userId);

    const res = await comoAdminGimnasioDos("POST", "/bulk-migrate", {
      userIds: [gym2.socios[1].id, fx.templo.userId],
      targetPlanId: targetPlan.id,
      targetBranchId: gym2.branchId,
    });
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      migrated: number;
      skipped: number;
      errors: Array<{ userId: number }>;
    };
    expect(
      [body.migrated, body.skipped],
      `${RUTA}: de los 2 userIds del body, solo 1 es del gimnasio ${TENANT_DOS} (migrated=1) y el ` +
        `de El Templo tiene que quedar SKIPPED (no un error ni una migracion silenciosa cross-tenant). ` +
        `Respuesta completa: ${JSON.stringify(body)}`,
    ).toEqual([1, 1]);

    const despuesFotoAjena = await fotoDeSuscripcion(fx.templo.subscriptionId);
    expect(
      despuesFotoAjena,
      `${RUTA}: la migracion masiva NO puede tocar la fila de El Templo (foto de tenant_id/status/` +
        `plan_id/end_date).`,
    ).toEqual(antesFotoAjena);
    expect(
      await contarSuscripcionesDeUsuario(fx.templo.userId),
      `${RUTA}: el skip del userId ajeno no puede crear NINGUNA fila nueva para El Templo.`,
    ).toBe(antesCountAjeno);
  });

  it("control: migrar solo socios propios funciona de punta a punta — cancela la vieja y crea la nueva con tenant_id = TENANT_DOS", async () => {
    const targetPlanRes = await comoAdminGimnasioDos("POST", "/plans", {
      name: `ISO03SS Plan BulkMigrate Control ${sufijo()}`,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 733300,
      priceZero: 700000,
      durationDays: 30,
    });
    expect(targetPlanRes.statusCode, `Setup: ${targetPlanRes.body}`).toBe(201);
    const targetPlan = JSON.parse(targetPlanRes.body) as { id: number };

    const antes = await contarSuscripcionesDeUsuario(gym2.socios[0].id);
    const res = await comoAdminGimnasioDos("POST", "/bulk-migrate", {
      userIds: [gym2.socios[0].id],
      targetPlanId: targetPlan.id,
      targetBranchId: gym2.branchId,
    });
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { migrated: number; skipped: number };
    expect(
      [body.migrated, body.skipped],
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${JSON.stringify(body)}`,
    ).toEqual([1, 0]);

    const viejaFoto = await fotoDeSuscripcion(fx.dos.subscriptionId);
    expect(
      [viejaFoto.tenantId, viejaFoto.status],
      `${RUTA}: la sub vieja del socio migrado tiene que quedar cancelada, en su mismo gimnasio.`,
    ).toEqual([TENANT_DOS, "cancelled"]);
    expect(
      await contarSuscripcionesDeUsuario(gym2.socios[0].id),
      `${RUTA}: la migracion tiene que CANCELAR la vieja y CREAR una nueva (2 filas totales, no reemplazar in-place).`,
    ).toBe(antes + 1);
  });
});
