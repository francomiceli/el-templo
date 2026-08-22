/**
 * Fase 176 Plan 11 — aislamiento de `POST /api/admin/users/:userId/program-addons`,
 * ahora que es una ruta de MÓDULO (`templo-module`/`templo-training`).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Esta ruta vivía originalmente en la batería ISO-03 de members
 * (`iso-03-members-altas-y-staff.test.ts`, plan 173-28) porque en ese
 * momento `test/tenant-manifest.ts` la clasificaba `tenant-scoped`. El plan
 * 176-05 la reclasificó a `templo-module`/`templo-training`: en runtime YA
 * corría gateada dentro de `moduleScope(app, "templo-training",
 * programRoutes, ...)` desde 176-03 — lo que estaba desactualizado era el
 * manifiesto, no el código. Eso dejó la batería de members probando una ruta
 * que ya no le pertenece: el gimnasio 2 no tiene el módulo `templo-training`
 * prendido por defecto (fail-closed), así que el caso de control positivo
 * original empezó a dar 404 del guard en vez de 200.
 *
 * Este archivo es la migración de ESE caso (aislamiento + control positivo),
 * sembrando el flag `templo-training` del gimnasio 2 para poder seguir
 * ejerciendo el aislamiento de tenant sobre la ruta — más un tercer caso
 * nuevo que la batería de members nunca pudo cubrir: el guard de módulo en
 * sí (`templo-training` OFF ⇒ 404, sin llegar siquiera al service).
 *
 * NO ESTÁ EN `ARCHIVOS_BATERIA` DE `iso-03-cobertura-members.test.ts`
 * ---------------------------------------------------------------------
 * A propósito. Esa batería (y su gate de cobertura) es específica de las
 * rutas `tenant-scoped` de members/users/leads del manifiesto — 29 rutas
 * después de este plan. `program-addons` ya no es una de ellas: es una ruta
 * de módulo, con su propio dueño de cobertura (`iso-01-manifiesto.test.ts` /
 * la cobertura de `templo-module` de la fase 176). Este archivo prueba el
 * aislamiento como caso independiente, sin inscribirse en ningún gate de
 * conteo.
 *
 * EL BUG PREEXISTENTE QUE NO SE AFIRMA ACÁ
 * ------------------------------------------
 * El INSERT de `EnrollmentService.enrollAddon` (`program_enrollments`) NO
 * usa `tenantValues` — es un bug PREEXISTENTE y adyacente, fuera de alcance
 * de este plan (pertenece a la adopción de `programs`/`subscriptions` en
 * 174/175, documentado en `deferred-items.md` de esa fase). Por eso el
 * control positivo de abajo cuenta FILAS nuevas en `program_enrollments`
 * pero nunca afirma el `tenant_id` de esa fila — afirmarlo daría un falso
 * rojo sobre algo que este plan no arregla.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-programs-modulo.test.ts --hookTimeout=250000
 *
 * @see test/tenancy/iso-03-members-altas-y-staff.test.ts — origen del caso migrado (173-28), ver su nota "ACTUALIZACIÓN (fase 176 plan 11)"
 * @see test/tenancy/iso-03-cobertura-members.test.ts — baseline bajado de 30 a 29 por esta migración
 * @see test/tenancy/mod-01-guard.test.ts — mismo idioma de siembra de flags (176-03/04)
 * @see src/modules/programs/routes.ts — el fix de seguridad D-02 de la fase 173 (SELECT users con tenantWhere antes del lookup de suscripción)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, type SQL } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  dateOffsetStr,
  ensureEfectivoCaja,
} from "../helpers";
import { createPlan, assignPlan } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import type { TenantContext } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarSocioTemplo,
  sembrarSociosGimnasioDos,
  limpiarSociosDeLaBateria,
  type FichaTemplo,
  type FichaGimnasioDos,
} from "../fixtures/members-gimnasio-dos";
import {
  setModuleFlag,
  clearModuleFlags,
  restoreTemploFlags,
} from "../fixtures/module-flags";

const USERS_BASE = "/api/admin/users";
const RUTA = "POST /api/admin/users/:userId/program-addons";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaTemplo;
let dos: FichaGimnasioDos;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Mismo orden obligado que iso-03-members-altas-y-staff.test.ts (173-28).
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarSocioTemplo(app);
  dos = await sembrarSociosGimnasioDos(app, gym2);

  // El Templo con los 4 flags ON (estado de la mig 0207) y el gimnasio 2 con
  // templo-training prendido: sin esto, TODO caso de acá pegaría contra el
  // 404 del guard en vez de contra el aislamiento de tenant que este archivo
  // existe para probar.
  await restoreTemploFlags(app);
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  // No filtrar flags al worker (isolate: false): el siguiente archivo no
  // puede heredar templo-training prendido para el gimnasio 2, ni ningún
  // flag de El Templo distinto del default ON.
  await clearModuleFlags(app, TENANT_DOS);
  await restoreTemploFlags(app);
  await app.close();
});

/** Como staff del gimnasio 2, rol `admin` (acepta `FINANCE_WRITE_ROLES`, incluye admin). */
async function comoGimnasioDos(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/** Cuenta inscripciones de programa para un userId, sin filtrar por gimnasio. */
async function contarInscripciones(userId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar program_enrollments de un userId (sin filtro de gimnasio) es la asercion de "cero filas nuevas"/"una fila nueva" — filtrar la volveria tautologica */ COUNT(*) AS c FROM program_enrollments WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

/** Programa GLOBAL (catálogo compartido, sin tenant_id propio en el negocio hoy) + suscripción activa. */
async function prepararSocioConSuscripcion(
  ownerToken: string,
  ctx: TenantContext,
  branchId: number,
  userId: number,
): Promise<{ programId: number }> {
  const suf = sufijo();
  // `assignPlan` con `paymentMethod: "cash"` (default) exige una caja
  // efectivo para la sucursal — `second-tenant.ts` NO la siembra (D-05 de
  // ese fixture: es opt-in por archivo). El Templo la tiene desde
  // `test/setup.ts`, pero el gimnasio 2 no.
  await ensureEfectivoCaja(app, branchId, "ARS", ctx.tenantId);
  const plan = await createPlan(app, ownerToken, {
    name: `Plan addon ${suf}`,
    planTier: "flex",
    bookingMode: "flexible",
  });
  const asignacion = await assignPlan(app, ownerToken, userId, {
    planId: plan.id,
    branchId,
    startDate: dateOffsetStr(-1),
  });
  expect(
    asignacion.statusCode,
    `No se pudo sembrar la suscripcion previa para este test: ${JSON.stringify(asignacion.body)}`,
  ).toBe(201);
  const [programResult] = await app.db.insert(schema.programs).values({
    name: `Programa addon ${suf}`,
    description: "programa de prueba",
    durationWeeks: 4,
    sessionsPerWeekToAdvance: 3,
    isActive: true,
    goalPlanType: "tren_superior",
  });
  const programId = Number(
    (programResult as unknown as { insertId: number }).insertId,
  );
  return { programId };
}

describe("add-on de programa (templo-module) — POST /api/admin/users/:userId/program-addons", () => {
  it("aislamiento: con templo-training ON, el gimnasio 2 NO puede inscribir a un socio de El Templo", async () => {
    const ownerTemplo = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const { programId } = await prepararSocioConSuscripcion(
      ownerTemplo,
      CTX_TEMPLO,
      templo.branchId,
      templo.userId,
    );
    const antes = await contarInscripciones(templo.userId);
    // El 404 acá es aislamiento de tenant, NO el guard de módulo — el
    // gimnasio 2 tiene templo-training prendido (ver beforeEach). Si este
    // caso diera 404 por el guard en vez de por el aislamiento, el caso "c"
    // de guard de abajo dejaría de probar nada distinto.
    const res = await comoGimnasioDos(
      "POST",
      `${USERS_BASE}/${templo.userId}/program-addons`,
      { programId },
    );
    expect(
      res.statusCode,
      `${RUTA}: le dejo operar al staff del gimnasio ${TENANT_DOS} sobre el socio ${templo.userId}, ` +
        `que es de El Templo (${TENANT_TEMPLO}). Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarInscripciones(templo.userId);
    expect(
      despues,
      `${RUTA}: el rechazo no puede dejar una fila nueva en program_enrollments para el socio de ` +
        `El Templo.`,
    ).toBe(antes);
  });

  it("control positivo: el gimnasio 2 inscribe a un socio propio", async () => {
    const { programId } = await prepararSocioConSuscripcion(
      gym2.adminToken,
      CTX_DOS,
      gym2.branchId,
      dos.userId,
    );
    const antes = await contarInscripciones(dos.userId);
    const res = await comoGimnasioDos(
      "POST",
      `${USERS_BASE}/${dos.userId}/program-addons`,
      { programId },
    );
    expect(
      res.statusCode,
      `${RUTA}: NO le dejo operar al staff del gimnasio ${TENANT_DOS} sobre su PROPIA fila ${dos.userId}. ` +
        `Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await contarInscripciones(dos.userId);
    expect(
      despues,
      `${RUTA}: la inscripcion propia tiene que crear exactamente una fila nueva.`,
    ).toBe(antes + 1);
    // NO se afirma el tenant_id de la fila de program_enrollments: ver el
    // docblock de cabecera, "EL BUG PREEXISTENTE QUE NO SE AFIRMA ACÁ".
  });

  it("guard: con templo-training OFF para el gimnasio 2, inscribir a un socio propio da 404 del guard", async () => {
    const { programId } = await prepararSocioConSuscripcion(
      gym2.adminToken,
      CTX_DOS,
      gym2.branchId,
      dos.userId,
    );
    await setModuleFlag(app, TENANT_DOS, "templo-training", false);
    try {
      const res = await comoGimnasioDos(
        "POST",
        `${USERS_BASE}/${dos.userId}/program-addons`,
        { programId },
      );
      expect(
        res.statusCode,
        `${RUTA}: con templo-training OFF para el gimnasio ${TENANT_DOS}, el guard tiene que cortar ` +
          `la ruta ANTES del service — incluso para un socio PROPIO. Respuesta: ${res.body}`,
      ).toBe(404);
    } finally {
      // Restaurar a ON: el próximo beforeEach lo hace igual, pero este
      // archivo no depende de esa carrera para dejar el flag consistente
      // dentro de su propia corrida.
      await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    }
  });
});
