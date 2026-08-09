/**
 * Fase 173 Plan 16 (D-07, T-173-16-01/02/05) — el criterio 3 de la fase (SC3):
 * el cron de recategorización multisucursal NUNCA mueve a un socio a una sede
 * de OTRO gimnasio, aunque los datos hagan que esa sede parezca la dominante,
 * y un caso raro lo saltea en vez de tumbar el barrido de todos los gimnasios.
 *
 * POR QUÉ ESTE ARCHIVO Y NO UN describe DE ISO-03
 * ------------------------------------------------
 * `reassign-multibranch.ts` no es una ruta HTTP: es un JOB de batch que corre
 * una vez por gimnasio activo (`forEachActiveTenant`, fases 169/171). Su forma
 * de aislamiento no es "un staff pide el recurso ajeno y recibe 404" (D-06),
 * es "el ALGORITMO nunca considera una sede ajena como candidata, y si por
 * cualquier motivo llega a intentar escribirla, la guarda de escritura la
 * rechaza y el barrido SIGUE con el resto" (D-07). Por eso vive en
 * `test/tenancy/` junto al resto de la batería 2-tenant, pero como su propio
 * archivo — mismo criterio que `ancla-autorregistro.test.ts` (173-15).
 *
 * LA GUARDA ES DOBLE, A PROPÓSITO (defensa en profundidad, mina M10)
 * -------------------------------------------------------------------
 * 1. Query 3 (`branchRows`/`countryByBranch`, mapa de sedes → país) filtrada
 *    por `ctx`: una sede ajena simplemente NO ESTÁ en el mapa, y el filtro de
 *    `buckets` de más abajo la descarta ANTES de que compita por ser la sede
 *    "dominante" — la asistencia registrada ahí ni siquiera entra al cómputo.
 * 2. `reassignMemberBranch` resuelve la sede con `resolveBranchDelGimnasio`
 *    JUSTO ANTES del UPDATE: si por cualquier motivo (carrera, dato corrupto)
 *    la sede ya no es del gimnasio, NO escribe nada y el llamador saltea al
 *    socio sin abortar el barrido.
 *
 * Con las DOS capas intactas, la capa 2 por sí sola YA garantiza que un
 * UPDATE cross-tenant nunca llega a la base — así que un socio cuya ÚNICA
 * señal es la sede ajena (sin ninguna sede propia alternativa) queda
 * protegido diga lo que diga la capa 1: el caso "aislamiento" de abajo lo
 * prueba con ESE escenario simple y literal (la sede ajena "ganaría" si no
 * hubiera filtro).
 *
 * Pero esa misma redundancia vuelve INVISIBLE, para una mutación que solo
 * rompe la capa 1 (la query 3), cualquier aserción que compare "¿terminó en
 * la sede ajena?" — la capa 2 la salva igual y el resultado final en la base
 * es IDÉNTICO con o sin la capa 1. La mutación de cierre de este archivo por
 * eso usa un escenario de DILUCIÓN (ver el `it` de aislamiento): un socio con
 * asistencia en una sede AJENA que por sí sola no alcanzaría el margen de
 * dominancia, pero SUMADA a la asistencia de una sede PROPIA hace que ninguna
 * de las dos domine (ratio/margen insuficientes) — mientras que, filtrando la
 * ajena (capa 1 intacta), la propia domina SOLA y el socio se recategoriza
 * correctamente. Sacar el filtro de la query 3 hace que el socio quede SIN
 * recategorizar (el ruido de la sede ajena diluye la dominancia) en vez de
 * moverse a su sede propia correcta — una diferencia de estado en la BASE que
 * depende EXCLUSIVAMENTE de la query 3, sin pasar por la capa 2 en absoluto.
 *
 * EL THROW DEL SENTINEL Y `users`
 * --------------------------------
 * `users` es tabla strict desde 173-25: los dos lectores locales de evidencia
 * (`tenantDeLaFila` / `campoDeLaFila`) llevan la exención `tenant-safe`
 * embebida en el SQL — leer el valor REAL de la fila ES la aserción, filtrar
 * por tenant la volvería tautológica. El throw del sentinel llega envuelto en
 * `DrizzleQueryError.cause`.
 *
 * CERO 403 A PROPÓSITO
 * ---------------------
 * Este job no es una ruta: no hay status HTTP que afirmar. La ausencia se
 * describe en castellano ("no se movió", "sigue siendo del gimnasio X"), sin
 * escribir el número 403 en ningún lado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { runReassignMultibranch } from "../../src/jobs/reassign-multibranch";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Orden obligado (mismo criterio que toda la batería 2-tenant): limpiar
  // ANTES de sembrar, `seedSecondTenant` arranca borrando su propio rastro.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  // Obligatorio: la base la comparten los archivos del worker (isolate: false).
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades locales ──────────────────────────────────────────────────────

let secuencia = 0;
function unico(): string {
  secuencia += 1;
  return `${Date.now().toString(36)}${secuencia}${Math.random().toString(36).slice(2, 6)}`;
}

/** Hoy, en formato DATE (YYYY-MM-DD) — dentro de la ventana de 30 días del cron sin fake timers. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

type TablaInspeccionada = "users";

/**
 * Lee el `tenant_id` REAL de una fila de `users`, SQL crudo. Exención
 * `tenant-safe` embebida: mismo patrón que `ancla-autorregistro.test.ts`.
 */
async function tenantDeLaFila(
  tabla: TablaInspeccionada,
  filaId: number,
): Promise<number | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el la volveria tautologica */ tenant_id AS tenantId FROM ${sql.raw(tabla)} WHERE id = ${filaId}`,
  )) as unknown as [Array<{ tenantId: number | null }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ tenantId: number | null }>);
  if (filas.length === 0 || filas[0].tenantId === null) return null;
  return Number(filas[0].tenantId);
}

/** El valor de una columna de `users`, leído de la base por id, SQL crudo. */
async function campoDeLaFila(
  tabla: TablaInspeccionada,
  columna: "branch_id" | "branch_source",
  filaId: number,
): Promise<string | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el valor REAL de la columna ES la asercion; filtrar por tenant la volveria tautologica */ ${sql.raw(columna)} AS v FROM ${sql.raw(tabla)} WHERE id = ${filaId}`,
  )) as unknown as [Array<{ v: unknown }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ v: unknown }>);
  if (filas.length === 0 || filas[0].v === null) return null;
  return String(filas[0].v);
}

async function insertBranch(
  ctx: TenantContext,
  country: string,
): Promise<number> {
  const code = `ACR-${unico()}`.toUpperCase().slice(0, 20);
  const [row] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(ctx, {
        name: code,
        code,
        country,
        timezone: "America/Argentina/Buenos_Aires",
        isActive: true,
      }),
    )
    .$returningId();
  return row.id;
}

async function insertMultiBranchPlan(ctx: TenantContext): Promise<number> {
  const [row] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(ctx, {
        name: `ACR multi ${unico()}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "presencial" as const,
        priceRegular: 15000,
        priceZero: 10000,
        priceCreditCard: 15000,
        durationDays: 30,
        multiBranch: true,
      }),
    )
    .$returningId();
  return row.id;
}

/** Socio de PRUEBA, por INSERT directo (el job no pasa por ninguna ruta). */
async function insertMember(
  ctx: TenantContext,
  branchId: number,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(ctx, {
        email: `acr-${unico()}@test.com`,
        passwordHash: "x",
        firstName: "ACR",
        lastName: `Test ${unico()}`,
        role: "member" as const,
        branchId,
        branchSource: null,
        branchUpdatedAt: null,
      }),
    )
    .$returningId();
  return row.id;
}

async function insertSub(
  ctx: TenantContext,
  userId: number,
  planId: number,
  branchId: number,
): Promise<void> {
  await app.db.insert(schema.subscriptions).values(
    tenantValues(ctx, {
      userId,
      planId,
      branchId,
      status: "active" as const,
      startDate: "2026-01-01",
      endDate: "2099-01-01",
      pricePaid: 15000,
      priceTypeApplied: "regular" as const,
    }),
  );
}

async function addAttendance(
  ctx: TenantContext,
  memberId: number,
  branchId: number,
  n: number,
): Promise<void> {
  const sessionDate = hoy();
  for (let i = 0; i < n; i += 1) {
    await app.db.insert(schema.attendance).values(
      tenantValues(ctx, {
        memberId,
        branchId,
        sessionDate,
      }),
    );
  }
}

// ─── Precondición ────────────────────────────────────────────────────────────

describe("cron de recategorización (SC3) — precondición de la batería", () => {
  it("las sedes candidatas de El Templo y del gimnasio 2 comparten país, así que el aislamiento no lo puede estar dando el filtro de país del propio cron", async () => {
    const branchTemplo = await insertBranch(CTX_TEMPLO, "AR");

    const [templo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(sql`${schema.branches.id} = ${branchTemplo}`);
    const [dos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(sql`${schema.branches.id} = ${gym2.branchId}`);

    expect(
      [templo?.country, dos?.country],
      "Si la sede del gimnasio 2 estuviera en otro país que la de El Templo, el " +
        "guardrail de país del propio cron (independiente de la tenancy) daría el " +
        "aislamiento por su cuenta y los casos de abajo pasarían sin ejercer D-07.",
    ).toEqual(["AR", "AR"]);
  });
});

// ─── Criterio 3 de la fase (SC3) ─────────────────────────────────────────────

describe("cron de recategorización (SC3) — nunca mueve a un socio a una sede de otro gimnasio", () => {
  it("aislamiento: la sede ajena NUNCA es candidata — con dilución, el ruido de la sede ajena no puede ni bloquear la recategorización legítima a la sede PROPIA", async () => {
    const home = await insertBranch(CTX_TEMPLO, "AR");
    const dominantePropia = await insertBranch(CTX_TEMPLO, "AR");
    const plan = await insertMultiBranchPlan(CTX_TEMPLO);

    const socio = await insertMember(CTX_TEMPLO, home);
    await insertSub(CTX_TEMPLO, socio, plan, home);

    // La sede AJENA (gym2.branchId) "ganaría" si no hubiera filtro: sola, 6
    // asistencias sería dominante (6/6 = 1.0). Pero acá conviven con 5
    // asistencias en una sede PROPIA — con la query 3 filtrada (D-07), la
    // ajena queda AFUERA del cómputo de entrada y la propia domina SOLA
    // (5/5 = 1.0). Sin el filtro, las dos compiten: 6/11 = 0.545 (< 0.6) y
    // margen 6-5 = 1 (< 3) — NINGUNA domina, y el socio queda sin
    // recategorizar. Ver el docblock de cabecera para el porqué de este
    // diseño (la guarda del UPDATE, por sí sola, ya protege el escenario
    // simple y vuelve esa mutación invisible para una aserción que solo mire
    // "¿terminó en la sede ajena?").
    await addAttendance(CTX_TEMPLO, socio, gym2.branchId, 6);
    await addAttendance(CTX_TEMPLO, socio, dominantePropia, 5);

    await runReassignMultibranch(app.db);

    expect(
      await campoDeLaFila("users", "branch_id", socio),
      `El socio ${socio} terminó con la sede del gimnasio ${TENANT_DOS} como su branch_id. ` +
        `La query 3 (mapa de sedes → país) de reassign-multibranch.ts dejó de estar filtrada ` +
        `por tenantWhere(schema.branches, ctx) — T-173-16-02.`,
    ).not.toBe(String(gym2.branchId));

    expect(
      await tenantDeLaFila("users", socio),
      `El socio ${socio} cambió de gimnasio en la base — el ancla user.tenant_id divergió ` +
        `de su sede (mina M10).`,
    ).toBe(TENANT_TEMPLO);

    // La aserción que la mutación de cierre efectivamente rompe (ver el
    // Task 3 del SUMMARY): con la query 3 filtrada, la sede propia domina SOLA
    // y el socio SÍ se recategoriza — a su sede propia, nunca a la ajena.
    expect(
      await campoDeLaFila("users", "branch_id", socio),
      `El socio ${socio} no se recategorizó a su sede PROPIA dominante (${dominantePropia}). ` +
        `Si la query 3 no está filtrada, el ruido de la sede ajena diluye la dominancia y el ` +
        `socio queda sin mover — este es el efecto observable de sacar tenantWhere de la query 3.`,
    ).toBe(String(dominantePropia));
  });

  it("control positivo: un socio de El Templo cuya sede dominante PROPIA cambia — el cron SÍ lo mueve", async () => {
    const home = await insertBranch(CTX_TEMPLO, "AR");
    const dominante = await insertBranch(CTX_TEMPLO, "AR");
    const plan = await insertMultiBranchPlan(CTX_TEMPLO);

    const socio = await insertMember(CTX_TEMPLO, home);
    await insertSub(CTX_TEMPLO, socio, plan, home);
    // Ninguna asistencia ajena en este caso: escenario limpio, sin ruido de
    // otro gimnasio, para probar que el cron sigue reasignando con normalidad
    // dentro del MISMO gimnasio después de los cambios de este plan.
    await addAttendance(CTX_TEMPLO, socio, dominante, 6);

    await runReassignMultibranch(app.db);

    expect(await campoDeLaFila("users", "branch_id", socio)).toBe(
      String(dominante),
    );
    expect(await campoDeLaFila("users", "branch_source", socio)).toBe("auto");
    expect(await tenantDeLaFila("users", socio)).toBe(TENANT_TEMPLO);
  });

  it("el barrido no aborta: un socio problemático (solo asistencia en sede ajena) no frena la recategorización del resto", async () => {
    const homeProblema = await insertBranch(CTX_TEMPLO, "AR");
    const planProblema = await insertMultiBranchPlan(CTX_TEMPLO);
    const socioProblema = await insertMember(CTX_TEMPLO, homeProblema);
    await insertSub(CTX_TEMPLO, socioProblema, planProblema, homeProblema);
    // Sin ninguna sede propia alternativa: la única señal es la sede AJENA.
    await addAttendance(CTX_TEMPLO, socioProblema, gym2.branchId, 6);

    const homeSano = await insertBranch(CTX_TEMPLO, "AR");
    const dominanteSano = await insertBranch(CTX_TEMPLO, "AR");
    const planSano = await insertMultiBranchPlan(CTX_TEMPLO);
    const socioSano = await insertMember(CTX_TEMPLO, homeSano);
    await insertSub(CTX_TEMPLO, socioSano, planSano, homeSano);
    await addAttendance(CTX_TEMPLO, socioSano, dominanteSano, 6);

    const resultado = await runReassignMultibranch(app.db);

    // El socio sano SÍ se recategorizó: prueba que el problemático no tumbó
    // el barrido (D-03/D-07 — el `continue`, nunca un abort).
    expect(await campoDeLaFila("users", "branch_id", socioSano)).toBe(
      String(dominanteSano),
    );
    // El problemático quedó salteado (few_attendances: sin sede propia con
    // asistencia, su total filtrado es 0) — el resumen lo cuenta.
    expect(resultado.skipped.length).toBeGreaterThanOrEqual(1);
    expect(await campoDeLaFila("users", "branch_id", socioProblema)).toBe(
      String(homeProblema),
    );
  });

  it("simetría: un socio del gimnasio 2 tampoco puede ser movido a una sede de El Templo", async () => {
    const homeTemplo = await insertBranch(CTX_TEMPLO, "AR");
    const ctxDos: TenantContext = { tenantId: TENANT_DOS };
    const planDos = await insertMultiBranchPlan(ctxDos);

    const socioDos = gym2.socios[0].id;
    await insertSub(ctxDos, socioDos, planDos, gym2.branchId);
    // Único socio con sub multi_branch del gimnasio 2 en esta corrida: su
    // única señal de asistencia es una sede de El Templo (ajena para ÉL).
    await addAttendance(ctxDos, socioDos, homeTemplo, 6);

    await runReassignMultibranch(app.db);

    expect(
      await campoDeLaFila("users", "branch_id", socioDos),
      `El socio ${socioDos} (gimnasio ${TENANT_DOS}) terminó con una sede de El Templo ` +
        `como su branch_id.`,
    ).toBe(String(gym2.branchId));
    expect(await tenantDeLaFila("users", socioDos)).toBe(TENANT_DOS);
  });
});
