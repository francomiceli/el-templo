/**
 * Fase 173 Plan 12 (ADO-07, D-05b/D-18) — la FK compuesta que cierra la mina M10.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * La migración `0200_anclas_tenant_branch.sql` agrega la FK compuesta
 * `fk_users_tenant_branch` `(tenant_id, branch_id) -> branches(tenant_id, id)`.
 * Los tests de `test/db/tenant-tables.test.ts` prueban METADATA (que la lista
 * de tablas esté bien clasificada); ninguno prueba que la FK realmente RECHACE
 * la divergencia del par de anclas contra la base VIVA. `pnpm exec tsc --noEmit`
 * tampoco lo prueba: los tipos salen del schema TS, no de la base, así que el
 * test pasaría en verde aunque la migración jamás se hubiera aplicado
 * (T-173-12-05, la tarea [BLOCKING] del plan existe justamente por esto).
 *
 * LOS TRES CASOS Y POR QUÉ IMPORTAN LOS TRES
 * -------------------------------------------
 * 1. Control positivo — un usuario del gimnasio 2 apuntando a una sede DEL
 *    MISMO gimnasio tiene que seguir funcionando: la FK no puede convertirse en
 *    un bloqueo del camino legítimo.
 * 2. Rechazo — apuntar a una sede de OTRO gimnasio (mismo país, para que el
 *    aislador alternativo que nadie nombra —D-14— no pueda estar dando el
 *    resultado en su lugar) tiene que fallar, y el motivo del fallo tiene que
 *    ser la FK. Un `catch` que acepte "falló por lo que sea" pasaría en verde
 *    con un error de tipos, una columna faltante o cualquier otro accidente, y
 *    no probaría absolutamente nada sobre ADO-07 (mismo idioma que
 *    `test/tenancy/con-01-uniques-cross-tenant.test.ts`).
 * 3. `branch_id NULL` — ver el aviso grande de abajo: el caso real que se
 *    puede probar hoy es distinto del que describe el plan, y la razón está
 *    documentada en el propio test.
 *
 * ⚠️ DESVIACIÓN DOCUMENTADA — EL CASO "branch_id NULL" NO PASA, Y ESTÁ BIEN
 * ---------------------------------------------------------------------------
 * La semántica MATCH SIMPLE de MySQL (el único modo que soporta, no
 * configurable) dice que una FK compuesta se cumple si CUALQUIERA de las
 * columnas referenciantes es NULL. El plan 173-12 pedía probar que "un usuario
 * sin sede" PASA la FK por esa razón. Pero `users.branch_id` es **NOT NULL
 * para TODOS los roles** (REQ-4, ver el comentario en
 * `src/db/schema/users.ts` junto a la columna): nunca existe ni puede existir
 * una fila de `users` con `branch_id IS NULL`, así que esa rama de la FK es
 * hoy INALCANZABLE en la práctica — no por la FK, sino por una constraint
 * distinta y anterior (la propia columna).
 *
 * Forzar `branch_id: NULL` en un INSERT no ejercita el "MATCH SIMPLE pasa":
 * ejercita el NOT NULL de la columna, que rechaza la fila ANTES de que el
 * motor llegue a evaluar la FK. Afirmar "pasa" ahí sería un falso comprobante
 * (el mismo tipo de error que este archivo existe para evitar en el caso 2).
 * Por eso el tercer `it` de abajo prueba la realidad exacta: el rechazo
 * ocurre, es por NOT NULL (`ER_BAD_NULL_ERROR` / errno 1048), y explícitamente
 * NO por la FK compuesta — dejando escrito, para el día en que alguien
 * relaje esa NOT NULL pensando que es inofensivo, que la FK compuesta SÍ dejaría
 * pasar esa fila (MATCH SIMPLE), y que esa combinación es una decisión
 * consciente, no un descuido.
 *
 * FIXTURE Y CICLO DE VIDA
 * ------------------------
 * Usa `seedSecondTenant`/`limpiarSegundoGimnasio` (fase 171, ISO-02): TENANT_DOS
 * = 90671 con una sede propia (país AR). La sede de El Templo usada en el caso
 * de rechazo es la `TEST` que siembra `test/setup.ts` (país AR también — la
 * precondición se afirma en el propio test, no se asume).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import * as schema from "../../src/db/schema";

// ─── Detección específica del motivo de rechazo (idioma de con-01) ──────────

interface ErrorDeMySql extends Error {
  code?: unknown;
  errno?: unknown;
  cause?: unknown;
}

function describirError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as ErrorDeMySql;
  const code = typeof e.code === "string" ? e.code : "sin code";
  const errno = typeof e.errno === "number" ? e.errno : 0;
  return `${code} / errno ${errno} / ${e.message}`;
}

/**
 * Busca en la cadena de `cause` (el driver puede envolver el error real en
 * `DrizzleQueryError.cause`) el primer error que cumpla `predicate`.
 * Devuelve `null` si ninguno de la cadena cumple.
 */
function buscarEnCadena(
  err: unknown,
  predicate: (e: ErrorDeMySql) => boolean,
): ErrorDeMySql | null {
  let actual: unknown = err;
  for (let profundidad = 0; profundidad < 5; profundidad += 1) {
    if (!(actual instanceof Error)) return null;
    const candidato = actual as ErrorDeMySql;
    if (predicate(candidato)) return candidato;
    actual = candidato.cause;
  }
  return null;
}

function esErrorDeFkCompuesta(e: ErrorDeMySql): boolean {
  const code = typeof e.code === "string" ? e.code : "";
  const errno = typeof e.errno === "number" ? e.errno : 0;
  return (
    code === "ER_NO_REFERENCED_ROW_2" ||
    errno === 1452 ||
    /foreign key constraint fails/i.test(e.message)
  );
}

function esErrorDeNotNull(e: ErrorDeMySql): boolean {
  const code = typeof e.code === "string" ? e.code : "";
  const errno = typeof e.errno === "number" ? e.errno : 0;
  return (
    code === "ER_BAD_NULL_ERROR" ||
    errno === 1048 ||
    /cannot be null/i.test(e.message)
  );
}

describe("FK compuesta users(tenant_id, branch_id) -> branches(tenant_id, id) [ADO-07, migración 0200]", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    // PRIMERO limpiar, DESPUÉS sembrar (ver el docblock de seedSecondTenant):
    // invertido, cleanAllTestData borraría el staff/socios recién sembrados.
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
  });

  afterAll(async () => {
    // Obligatorio: la base la comparten los archivos del worker (isolate: false).
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  it("control positivo: un usuario del gimnasio 2 apuntando a una sede DEL MISMO gimnasio pasa la FK (insert y update)", async () => {
    const socio = await createTestMember(app, {
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
    });

    const [filaTrasInsert] = await app.db
      .select({
        tenantId: schema.users.tenantId,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, socio.id));

    expect(filaTrasInsert?.tenantId).toBe(TENANT_DOS);
    expect(filaTrasInsert?.branchId).toBe(gym2.branchId);

    // UPDATE que reafirma la MISMA sede propia — el camino que D-05/D-07
    // ejercen en producción (reasignaciones dentro del propio gimnasio) tiene
    // que seguir funcionando sin fricción.
    await app.db
      .update(schema.users)
      .set({ branchId: gym2.branchId })
      .where(eq(schema.users.id, socio.id));

    const [filaTrasUpdate] = await app.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, socio.id));

    expect(filaTrasUpdate?.branchId).toBe(gym2.branchId);
  });

  it("rechazo: apuntar a un usuario del gimnasio 2 a una sede de El Templo (mismo país) — la base lo rechaza por la FK, no por otro motivo", async () => {
    const socio = await createTestMember(app, {
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
    });

    // Sede de El Templo (TENANT_TEMPLO = 1) sembrada por test/setup.ts. Se
    // afirma el país ANTES del intento de UPDATE: si algún día dejara de ser
    // AR, la precondición de "mismo país" (para que D-14 no pueda estar
    // dando el resultado) se rompería en silencio.
    const [sedeTemplo] = await app.db
      .select({ id: schema.branches.id, country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));

    expect(
      sedeTemplo,
      "el seed global de test/setup.ts no sembró la sede 'TEST' de El Templo — precondición del test rota",
    ).toBeDefined();
    expect(
      sedeTemplo!.country,
      "la sede 'TEST' de El Templo dejó de ser del mismo país que la del gimnasio 2 (AR): " +
        "sin esa precondición, un rechazo correcto podría deberse al aislador de país (D-14) " +
        "y no a la FK compuesta que este test dice estar probando",
    ).toBe("AR");

    let capturado: unknown = null;
    let paso = false;
    try {
      await app.db
        .update(schema.users)
        .set({ branchId: sedeTemplo!.id })
        .where(eq(schema.users.id, socio.id));
      paso = true;
    } catch (err: unknown) {
      capturado = err;
    }

    expect(
      paso,
      `MySQL ACEPTÓ un UPDATE que apunta al usuario ${socio.id} (gimnasio ${TENANT_DOS}) ` +
        `a la sede ${sedeTemplo!.id} de El Templo (gimnasio ${TENANT_TEMPLO}). La FK compuesta ` +
        `fk_users_tenant_branch de la migración 0200 dejó de proteger la mina M10 (ADO-07): ` +
        `un usuario puede volver a quedar apuntando a la sede de otro gimnasio sin que la base lo impida.`,
    ).toBe(false);

    const fk = buscarEnCadena(capturado, esErrorDeFkCompuesta);
    expect(
      fk,
      `El UPDATE falló, pero NO por la FK compuesta fk_users_tenant_branch. Un test que acepte ` +
        `"falló por lo que sea" pasaría en verde con cualquier otro error y no probaría el contrato ` +
        `de ADO-07. Error real: ${describirError(capturado)}`,
    ).not.toBeNull();

    // Y la fila no quedó modificada — RESTRICT no permite escritura parcial.
    const [filaFinal] = await app.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, socio.id));
    expect(filaFinal?.branchId).toBe(gym2.branchId);
  });

  it("branch_id NULL: users.branch_id es NOT NULL para TODOS los roles (REQ-4) — el rechazo es por esa columna, NO por la FK compuesta (ver docblock de cabecera)", async () => {
    let capturado: unknown = null;
    let paso = false;
    try {
      // INSERT crudo (bypass del tipado de Drizzle, que ya prohíbe `branchId: null`
      // en tiempo de compilación): es la única forma de ejercer contra la base
      // viva qué constraint dispara primero cuando `branch_id` viene NULL.
      await app.db.execute(sql`
        INSERT INTO users (tenant_id, branch_id, password_hash, role)
        VALUES (${TENANT_DOS}, NULL, ${"x".repeat(64)}, 'member')
      `);
      paso = true;
    } catch (err: unknown) {
      capturado = err;
    }

    expect(
      paso,
      "MySQL aceptó un INSERT en `users` con `branch_id` NULL. Si `branch_id` dejó de ser NOT NULL " +
        "(REQ-4 relajada), este test ya no prueba nada sobre el caso NULL de la FK compuesta y hay " +
        "que revisar además si eso fue una decisión consciente o una regresión de schema.",
    ).toBe(false);

    const notNull = buscarEnCadena(capturado, esErrorDeNotNull);
    expect(
      notNull,
      "El INSERT con branch_id NULL falló, pero NO por la NOT NULL de la columna. " +
        `Error real: ${describirError(capturado)}`,
    ).not.toBeNull();

    // Afirmación explícita del porqué: el rechazo NO es la FK compuesta
    // ejerciendo su semántica MATCH SIMPLE (que SÍ dejaría pasar un branch_id
    // NULL) — es una constraint distinta y anterior que actúa primero. Si
    // alguna vez se relaja el NOT NULL sin tocar la FK, este `it` empieza a
    // fallar en la aserción de `paso` de arriba (deja de rechazar), lo cual es
    // la señal correcta de que el contrato del schema cambió.
    const fk = buscarEnCadena(capturado, esErrorDeFkCompuesta);
    expect(
      fk,
      "El rechazo de branch_id NULL no debería ser por la FK compuesta (MATCH SIMPLE la dejaría pasar): " +
        `la NOT NULL de la columna actúa primero. Error real: ${describirError(capturado)}`,
    ).toBeNull();
  });
});
