/**
 * Fase 173 Plan 26 (ISO-03) — AISLAMIENTO de las 9 rutas de LISTADO,
 * BÚSQUEDA y EXPORT de `/api/admin/members`, contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el plan 1 de 3 de la batería ISO-03 de `members` (D-09 del CONTEXT de
 * la fase 173): hasta que los 3 archivos estén verdes, el módulo no está
 * "adoptado". Este cubre el grupo que más datos entrega de una vez —
 * `GET /api/admin/members` devuelve el padrón paginado con su total y su
 * deuda agregada; `/export` y `/export-sepa` entregan el padrón completo en
 * un xlsx, con DNIs e IBANs.
 *
 * QUE RUTAS CUBRE (9 de las 30 de members/users/leads del manifiesto)
 * ----------------------------------------------------------------------
 *   GET /api/admin/members
 *   GET /api/admin/members/search
 *   GET /api/admin/members/branches
 *   GET /api/admin/members/check-dni
 *   GET /api/admin/members/check-duplicates
 *   GET /api/admin/members/export
 *   GET /api/admin/members/export-sepa
 *   GET /api/admin/members/:userId
 *   GET /api/admin/members/:userId/session-levels
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del CONTEXT — vale para TODO el milestone)
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: un GET
 * by-id ajeno da 404 (o, para las rutas que no chequean existencia —
 * `session-levels` — un 200 con datos VACÍOS, nunca ajenos); un listado no
 * trae una fila ajena; un check de unicidad de un dato que SÍ existe en el
 * otro gimnasio dice "no existe / sin duplicados". **Nunca un "prohibido"**:
 * el criterio de aceptación de este archivo es un `grep -c` de esa asercion
 * dando CERO. Por eso este párrafo describe el contrato en castellano en vez
 * de escribir el status: un gate que busca por substring no distingue
 * código de comentario (lección pagada en el piloto, `test/setup.ts`).
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08 del piloto)
 * ---------------------------------------------------------------------
 * Un 404 (o un array vacío) puede venir del aislamiento o de una siembra
 * rota, y los dos se ven igual desde afuera. Por eso cada `describe` tiene
 * DOS `it`: el de aislamiento y el de control, que hace la MISMA operación
 * sobre el recurso PROPIO del gimnasio 2 y exige que funcione.
 *
 * LA EVIDENCIA SE LEE DE LA BASE, NO DE LA RESPUESTA HTTP
 * ------------------------------------------------------
 * El barrido de un listado no se afirma con "no aparece el id que sembré",
 * sino leyendo el `tenant_id` de CADA fila devuelta (`tenantDeLaFila`,
 * `test/fixtures/members-gimnasio-dos.ts`): así caza también filas ajenas
 * que este archivo no sembró (seeds de migraciones y de `test/setup.ts`).
 *
 * ROL MÍNIMO REAL (D-10 del piloto)
 * ----------------------------------
 * El actor de cada `describe` es el rol MÁS BARATO que la ruta acepta y que
 * el fixture puede crear, explícito en cada call site:
 *   - `gym2.adminToken` (admin): list, search, branches, check-dni,
 *     check-duplicates, export, get-by-id, session-levels. Ninguna de estas
 *     8 tiene un guard más estricto que el hook de módulo (`MEMBER_ROLES`,
 *     que ya admite hasta `coach`) salvo el gate financiero de
 *     `includeTotalDebt` (`ADMIN_ROLES`), que el propio caso del listado
 *     necesita ejercer.
 *   - `dos.sepa.ownerToken` (owner) SOLO para `export-sepa`: esa ruta exige
 *     `MEMBER_LIFECYCLE_ROLES` (owner/admin/gestion) Y, para cualquier actor
 *     NO-owner, `scope.country === 'ES'` (`members/routes.ts:377`) — el admin
 *     de `seedSecondTenant` tiene su sede en AR (precondición #1 de abajo),
 *     así que no sirve. El owner bypassea ese gate de país sin tocarla.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-listados.test.ts
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md
 * @see .planning/phases/173-.../173-CONTEXT.md — D-06/D-09/D-10/D-14
 * @see test/tenancy/iso-03-finance-cajas.test.ts — el idioma completo de la batería
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, isNull, or } from "drizzle-orm";
import { Workbook } from "exceljs";
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
  sembrarSocioTemplo,
  sembrarSociosGimnasioDos,
  limpiarSociosDeLaBateria,
  tenantDeLaFila,
  campoDeLaFila,
  type FichaTemplo,
  type FichaGimnasioDos,
} from "../fixtures/members-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/admin/members";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaTemplo;
let dos: FichaGimnasioDos;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmetico (mismo criterio que la finance):
  //  1. `cleanAllTestData` vacia TODAS las tablas del modulo (y muchas mas)
  //     sin filtro de gimnasio.
  //  2. `limpiarSociosDeLaBateria` ANTES de `seedSecondTenant`: aquel arranca
  //     borrando la fila de `tenants` del gimnasio 2 y una sede propia
  //     (branches no esta en TABLES_TO_CLEAN) se lo impediria por FK.
  //  3-5. el esqueleto primero, el recurso ajeno despues, lo propio al final.
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarSocioTemplo(app);
  dos = await sembrarSociosGimnasioDos(app, gym2);
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (`isolate: false`), y `branches` no esta en `TABLES_TO_CLEAN`.
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** GET como staff del gimnasio 2, con el token indicado (default: admin). */
async function getComoGimnasioDos(
  url: string,
  token: string = gym2.adminToken,
) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Mensaje compartido de los rojos de AISLAMIENTO en listados/barridos. */
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la fila ${filaId}, que NO es suya. ` +
    `Eso es una fuga de datos entre gimnasios: el listado perdio su \`tenantWhere(tabla, ctx)\`, ` +
    `o el \`ctx\` no salio de \`assertTenant(request.scope, …)\`. Empezar por el metodo que sirve ` +
    `esa ruta en src/modules/members/service.ts y por su handler en src/modules/members/routes.ts. ` +
    `NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio al staff del gimnasio ${TENANT_DOS} su PROPIA fila ${filaId}. ` +
    `Esto no es un problema de aislamiento sino de siembra o de scope de mas: sin este control, ` +
    `el test de aislamiento de al lado pasaria en verde por la razon equivocada. Revisar ` +
    `test/fixtures/members-gimnasio-dos.ts y el filtro de pais/sede de la ruta antes de tocar ` +
    `la capa de tenancy.`
  );
}

/**
 * Afirma que TODAS las filas que la ruta devolvio son del gimnasio 2, leyendo
 * el `tenant_id` de cada una DE LA BASE. Mas fuerte que "no aparece el id que
 * sembre": caza tambien filas ajenas que este archivo no sembro.
 */
async function afirmarQueTodasSonDelGimnasioDos(
  ruta: string,
  tabla: "users" | "branches",
  ids: number[],
): Promise<void> {
  for (const id of ids) {
    expect(
      await tenantDeLaFila(app, tabla, id),
      porQueImportaElListado(ruta, id),
    ).toBe(TENANT_DOS);
  }
}

/**
 * Cuenta, DIRECTO de la base, cuantos socios (role='member', no borrados)
 * del gimnasio dado son visibles bajo el mismo filtro de pais que
 * `listMembers` aplica cuando `request.scope.country` no es `undefined`
 * (branch.country = country, o sede virtual). Replica el filtro base de la
 * ruta para que la asercion de `total` no dependa de un numero literal
 * fragil ante cambios futuros en la composicion del fixture.
 */
async function contarMiembrosVisibles(
  tenantId: number,
  country: string,
): Promise<number> {
  const filas = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, { tenantId }),
        eq(schema.branches.id, schema.users.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.users, { tenantId }),
        eq(schema.users.role, "member"),
        isNull(schema.users.deletedAt),
        or(
          eq(schema.branches.country, country),
          eq(schema.branches.isVirtual, true),
        ),
      ),
    );
  return filas.length;
}

/** Nombres de la columna 1 de una hoja xlsx ya cargada. */
function columnaUno(hoja: ReturnType<Workbook["getWorksheet"]>): string[] {
  const valores: string[] = [];
  hoja?.eachRow((row, i) => {
    if (i === 1) return; // encabezado
    valores.push(String(row.getCell(1).value ?? ""));
  });
  return valores;
}

/** Valores de una columna arbitraria (1-indexed) de una hoja xlsx ya cargada. */
function columna(
  hoja: ReturnType<Workbook["getWorksheet"]>,
  indice: number,
): string[] {
  const valores: string[] = [];
  hoja?.eachRow((row, i) => {
    if (i === 1) return;
    valores.push(String(row.getCell(indice).value ?? ""));
  });
  return valores;
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // `listMembers`/`searchMembers`/`exportMembers` filtran por pais ADEMAS
    // de por gimnasio. Si la sede del gimnasio 2 fuera ES y la de El Templo
    // AR, TODOS los casos de aislamiento de abajo pasarian en verde sin que
    // la capa de tenancy hiciera absolutamente nada (D-14 del CONTEXT).
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
          eq(schema.branches.id, templo.branchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla; con ` +
        `paises distintos el filtro de country escondaria las filas ajenas igual y los casos de ` +
        `abajo pasarian sin ejercer la capa de tenancy. Arreglo: que las dos sedes vuelvan a ser ` +
        `AR, NO relajar estas aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene un socio vivo, con ficha completa, que el gimnasio 2 NO tiene que ver", async () => {
    // Precondicion, no decoracion: si la siembra de El Templo fallara, "el
    // gimnasio 2 no ve nada ajeno" seria trivialmente cierto.
    expect(
      [
        await tenantDeLaFila(app, "users", templo.userId),
        await tenantDeLaFila(app, "member_profiles", templo.profileId),
        await tenantDeLaFila(app, "member_notes", templo.noteId),
        await tenantDeLaFila(
          app,
          "user_status_history",
          templo.statusHistoryId,
        ),
        await tenantDeLaFila(app, "member_logins", templo.loginId),
        await tenantDeLaFila(app, "user_sepa_details", templo.sepa.sepaId),
      ],
      `Alguna de las filas ajenas no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno ` +
        `vivo, todos los casos de aislamiento de este archivo pasan probando nada. Revisar ` +
        `sembrarSocioTemplo en test/fixtures/members-gimnasio-dos.ts.`,
    ).toEqual([
      TENANT_TEMPLO,
      TENANT_TEMPLO,
      TENANT_TEMPLO,
      TENANT_TEMPLO,
      TENANT_TEMPLO,
      TENANT_TEMPLO,
    ]);
  });

  it("el gimnasio 2 tiene su ficha propia, sembrada en el gimnasio 2 (no en El Templo por el DEFAULT 1)", async () => {
    expect(
      [
        await tenantDeLaFila(app, "users", dos.userId),
        await tenantDeLaFila(app, "member_profiles", dos.profileId),
        await tenantDeLaFila(app, "member_notes", dos.noteId),
        await tenantDeLaFila(app, "user_status_history", dos.statusHistoryId),
        await tenantDeLaFila(app, "member_logins", dos.loginId),
        await tenantDeLaFila(app, "user_sepa_details", dos.sepa.sepaId),
        await tenantDeLaFila(app, "branches", dos.virtualBranchId),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ese ` +
        `INSERT perdio su \`tenantValues(CTX_DOS, …)\` y cayo en el DEFAULT 1 de la columna: el ` +
        `"segundo gimnasio" seria en realidad El Templo y TODOS los controles positivos de abajo ` +
        `estarian mirando datos de El Templo.`,
    ).toEqual([
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
    ]);
  });

  it("los valores sembrados (deuda y sesiones) son de otro orden de magnitud entre los dos gimnasios", async () => {
    // Un total contaminado (que sumara la fila ajena) podria dar el mismo
    // numero que el correcto si los importes fueran parecidos.
    expect(
      [
        dos.debtAmount,
        templo.debtAmount,
        dos.sessionCount,
        templo.sessionCount,
      ],
      `Los importes/cantidades sembrados dejaron de ser distinguibles entre gimnasios: un total ` +
        `contaminado (777777 + 111 = 777888) podria confundirse con el correcto si estos valores ` +
        `se acercaran. Revisar test/fixtures/members-gimnasio-dos.ts.`,
    ).toEqual([777777, 111, 5, 2]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Las 9 rutas
// ═══════════════════════════════════════════════════════════════════════════

describe("listado paginado con total y deuda agregada — GET /api/admin/members", () => {
  const RUTA = "GET /api/admin/members";

  it("aislamiento: el listado, el total y la deuda agregada son SOLO del gimnasio 2 (tres queries, tres aserciones)", async () => {
    const res = await getComoGimnasioDos("?limit=50");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      members: Array<{ id: number }>;
      total: number;
      totalDebtByCurrency: Array<{ currency: string; amount: number }>;
    };

    // 1) las FILAS: ni una es de El Templo, y el barrido completo caza
    // tambien filas ajenas que este archivo no sembro.
    expect(
      body.members.map((m) => m.id),
      porQueImportaElListado(RUTA, templo.userId),
    ).not.toContain(templo.userId);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "users",
      body.members.map((m) => m.id),
    );

    // 2) el TOTAL: query DISTINTA de las filas (COUNT(*) propio) — se afirma
    // aparte, contra un conteo independiente con el mismo filtro de pais.
    const totalEsperado = await contarMiembrosVisibles(TENANT_DOS, "AR");
    expect(
      body.total,
      `${RUTA} devolvio un \`total\` (${body.total}) que no coincide con el conteo ` +
        `independiente de socios visibles del gimnasio ${TENANT_DOS} (${totalEsperado}). Si es ` +
        `mayor, el COUNT(*) esta contando socios ajenos.`,
    ).toBe(totalEsperado);

    // 3) la DEUDA AGREGADA: tercera query, sobre `balances`. El importe
    // propio (777777) y el ajeno (111) son de otro orden de magnitud: si el
    // agregado sumara la fila ajena, el numero seria evidentemente otro
    // (777888), no un "de mas" sutil.
    const deudaArs = body.totalDebtByCurrency.find((r) => r.currency === "ARS");
    expect(
      deudaArs?.amount,
      `${RUTA} devolvio totalDebtByCurrency[ARS]=${deudaArs?.amount} para el gimnasio ` +
        `${TENANT_DOS}. Se esperaba EXACTAMENTE ${dos.debtAmount} (la fila propia). Si es ` +
        `${dos.debtAmount + templo.debtAmount}, el SUM de \`balances\` esta sumando la deuda de ` +
        `El Templo: le falta el \`tenantWhere(balances, ctx)\` en \`totalDebtPromise\` ` +
        `(src/modules/members/service.ts, listMembers).`,
    ).toBe(dos.debtAmount);
  });

  it("control: el listado SI trae la ficha propia, con su total y su deuda propia", async () => {
    const res = await getComoGimnasioDos("?limit=50");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      members: Array<{
        id: number;
        firstName: string | null;
        lastName: string | null;
      }>;
      total: number;
      totalDebtByCurrency: Array<{ currency: string; amount: number }>;
    };

    expect(
      body.members.map((m) => m.id),
      porQueImportaElControl(RUTA, dos.userId),
    ).toContain(dos.userId);
    const propio = body.members.find((m) => m.id === dos.userId);
    expect(
      [propio?.firstName, propio?.lastName],
      `${RUTA} devolvio la ficha propia con otro nombre que el sembrado.`,
    ).toEqual([dos.firstName, dos.lastName]);
    expect(body.total, `${RUTA} contesto 200 pero total es 0.`).toBeGreaterThan(
      0,
    );
    expect(
      body.totalDebtByCurrency.find((r) => r.currency === "ARS")?.amount,
      `${RUTA} contesto 200 pero la deuda propia (${dos.debtAmount}) no aparece en ` +
        `totalDebtByCurrency: sin este control, el caso de aislamiento de al lado (que exige ` +
        `EXACTAMENTE ${dos.debtAmount}) podria estar dando 0 = 0 con la agregacion rota para todos.`,
    ).toBe(dos.debtAmount);
  });
});

describe("typeahead de agenda — GET /api/admin/members/search", () => {
  const RUTA = "GET /api/admin/members/search";
  // El apellido esta COMPARTIDO a proposito entre los dos gimnasios (ver
  // docblock del fixture): es el caso mas caro del piloto, un nombre que
  // cualquier gimnasio puede tener.
  const APELLIDO = "Aislado173";

  it("aislamiento: un apellido que TAMBIEN tiene El Templo no devuelve la fila ajena", async () => {
    const res = await getComoGimnasioDos(
      `/search?search=${encodeURIComponent(APELLIDO)}&limit=20`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const members = JSON.parse(res.body).members as Array<{ id: number }>;

    expect(
      members.map((m) => m.id),
      porQueImportaElListado(RUTA, templo.userId),
    ).not.toContain(templo.userId);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "users",
      members.map((m) => m.id),
    );
  });

  it("control: el mismo apellido SI devuelve la ficha propia del gimnasio 2", async () => {
    const res = await getComoGimnasioDos(
      `/search?search=${encodeURIComponent(APELLIDO)}&limit=20`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const members = JSON.parse(res.body).members as Array<{ id: number }>;
    expect(
      members.map((m) => m.id),
      porQueImportaElControl(RUTA, dos.userId),
    ).toContain(dos.userId);
  });
});

describe("selector de sedes — GET /api/admin/members/branches", () => {
  const RUTA = "GET /api/admin/members/branches";

  it("aislamiento: no devuelve ni una sede de El Templo", async () => {
    const res = await getComoGimnasioDos("/branches");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const branches = JSON.parse(res.body).branches as Array<{ id: number }>;

    expect(
      branches.map((b) => b.id),
      porQueImportaElListado(RUTA, templo.branchId),
    ).not.toContain(templo.branchId);
    expect(
      branches.map((b) => b.id),
      porQueImportaElListado(RUTA, templo.sepa.branchId),
    ).not.toContain(templo.sepa.branchId);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "branches",
      branches.map((b) => b.id),
    );
  });

  it("control: SI devuelve la sede propia del gimnasio 2 (y su sede virtual)", async () => {
    const res = await getComoGimnasioDos("/branches");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const branches = JSON.parse(res.body).branches as Array<{
      id: number;
      isVirtual: boolean;
    }>;
    expect(
      branches.map((b) => b.id),
      porQueImportaElControl(RUTA, gym2.branchId),
    ).toContain(gym2.branchId);
    expect(
      branches.map((b) => b.id),
      porQueImportaElControl(RUTA, dos.virtualBranchId),
    ).toContain(dos.virtualBranchId);
  });
});

describe("verificacion de DNI unico — GET /api/admin/members/check-dni", () => {
  const RUTA = "GET /api/admin/members/check-dni";

  it("aislamiento: un DNI existente en El Templo dice 'disponible' (D-06: indistinguible de inexistente)", async () => {
    const res = await getComoGimnasioDos(
      `/check-dni?dni=${encodeURIComponent(templo.dni)}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { available: boolean };
    expect(
      body.available,
      `${RUTA} con el DNI de un socio de El Templo (${templo.dni}) devolvio available=false. ` +
        `Eso delata que el DNI existe EN OTRO GIMNASIO — checkDniUniqueness perdio su ` +
        `\`tenantWhere(users, ctx)\`.`,
    ).toBe(true);
  });

  it("control: el DNI propio del gimnasio 2 SI da 'no disponible', con el nombre propio", async () => {
    const res = await getComoGimnasioDos(
      `/check-dni?dni=${encodeURIComponent(dos.dni)}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      available: boolean;
      existingMemberName?: string;
    };
    expect(
      body.available,
      `${RUTA} con el DNI propio del gimnasio 2 (${dos.dni}) dijo available=true. Sin este ` +
        `control, el caso de aislamiento de al lado (que tambien exige true, pero para un DNI ` +
        `ajeno) podria estar pasando con la ruta rota para TODOS los DNI.`,
    ).toBe(false);
    expect(body.existingMemberName).toBe(`${dos.firstName} ${dos.lastName}`);
  });
});

describe("deteccion de duplicados — GET /api/admin/members/check-duplicates", () => {
  const RUTA = "GET /api/admin/members/check-duplicates";

  it("aislamiento: un DNI duplicado en El Templo da 'sin duplicados'", async () => {
    const res = await getComoGimnasioDos(
      `/check-duplicates?dni=${encodeURIComponent(templo.dni)}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      matches: Array<{ id: number }>;
    };
    expect(
      body.matches.map((m) => m.id),
      porQueImportaElListado(RUTA, templo.userId),
    ).not.toContain(templo.userId);
    expect(
      body.matches,
      `${RUTA} con el DNI de un socio de El Templo (${templo.dni}) devolvio matches no vacio. ` +
        `checkDuplicates perdio su \`tenantWhere(users, ctx)\`.`,
    ).toEqual([]);
  });

  it("control: el DNI propio del gimnasio 2 SI aparece como duplicado (motivo afirmado junto al match)", async () => {
    const res = await getComoGimnasioDos(
      `/check-duplicates?dni=${encodeURIComponent(dos.dni)}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      matches: Array<{ id: number; matchedField: string }>;
    };
    const propio = body.matches.find((m) => m.id === dos.userId);
    expect(propio, porQueImportaElControl(RUTA, dos.userId)).toBeDefined();
    expect(
      propio?.matchedField,
      `${RUTA} encontro el match propio pero con otro motivo que "dni".`,
    ).toBe("dni");
  });
});

describe("export del padron — GET /api/admin/members/export", () => {
  const RUTA = "GET /api/admin/members/export";

  async function nombresDelExport(): Promise<string[]> {
    const res = await getComoGimnasioDos("/export");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const wb = new Workbook();
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const hoja = wb.getWorksheet("Alumnos");
    expect(hoja, `${RUTA} no trajo la hoja "Alumnos"`).toBeDefined();
    return columnaUno(hoja);
  }

  it("aislamiento: el .xlsx no nombra al socio de El Templo", async () => {
    // Nombre releido de la BASE (no del fixture): la evidencia que vale es
    // lo que quedo escrito, no lo que este archivo cree haber sembrado.
    const nombreAjeno =
      `${await campoDeLaFila(app, "users", "first_name", templo.userId)} ` +
      `${await campoDeLaFila(app, "users", "last_name", templo.userId)}`;
    const nombres = await nombresDelExport();
    expect(
      nombres,
      porQueImportaElListado(RUTA, templo.userId) +
        ` (el socio ajeno se llama "${nombreAjeno}")`,
    ).not.toContain(nombreAjeno);
  });

  it("control: el .xlsx SI nombra al socio propio del gimnasio 2", async () => {
    const nombrePropio = `${dos.firstName} ${dos.lastName}`;
    const nombres = await nombresDelExport();
    expect(nombres, porQueImportaElControl(RUTA, dos.userId)).toContain(
      nombrePropio,
    );
  });
});

describe("export SEPA (domiciliacion, solo sedes ES) — GET /api/admin/members/export-sepa", () => {
  const RUTA = "GET /api/admin/members/export-sepa";

  async function hojaSepa() {
    // `status=todos`: nuestros socios SEPA no tienen suscripcion activa (el
    // default 'activo' de la ruta los dejaria afuera del export ANTES de
    // llegar a la pregunta de aislamiento).
    const res = await getComoGimnasioDos(
      "/export-sepa?status=todos",
      dos.sepa.ownerToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const wb = new Workbook();
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const hoja = wb.getWorksheet("Domiciliación");
    expect(hoja, `${RUTA} no trajo la hoja "Domiciliación"`).toBeDefined();
    return hoja;
  }

  it("aislamiento: el .xlsx no nombra al socio SEPA de El Templo, y no trae su IBAN", async () => {
    const hoja = await hojaSepa();
    const socios = columnaUno(hoja);
    const ibans = columna(hoja, 7);
    const nombreAjeno =
      `${await campoDeLaFila(app, "users", "first_name", templo.sepa.userId)} ` +
      `${await campoDeLaFila(app, "users", "last_name", templo.sepa.userId)}`;
    const ibanAjeno = await campoDeLaFila(
      app,
      "user_sepa_details",
      "iban",
      templo.sepa.sepaId,
    );

    expect(
      socios,
      porQueImportaElListado(RUTA, templo.sepa.userId) +
        ` (el socio SEPA ajeno se llama "${nombreAjeno}")`,
    ).not.toContain(nombreAjeno);
    expect(
      ibans,
      `${RUTA} filtro (o partial-mostro) los nombres correctamente pero el IBAN ajeno ` +
        `"${ibanAjeno}" SI aparece en la columna IBAN — la fuga puede estar en un JOIN sin ` +
        `\`tenantWhere(userSepaDetails, ctx)\` aunque \`users\` este bien filtrado.`,
    ).not.toContain(ibanAjeno);
  });

  it("control: el .xlsx SI nombra al socio SEPA propio del gimnasio 2, con su IBAN", async () => {
    const hoja = await hojaSepa();
    const socios = columnaUno(hoja);
    const ibans = columna(hoja, 7);
    const nombrePropio = `${dos.sepa.firstName} ${dos.sepa.lastName}`;

    expect(socios, porQueImportaElControl(RUTA, dos.sepa.userId)).toContain(
      nombrePropio,
    );
    expect(
      ibans,
      `${RUTA} nombro al socio SEPA propio pero sin su IBAN (${dos.sepa.iban}): sin este ` +
        `control, el caso de aislamiento de al lado podria estar pasando con el export SEPA roto ` +
        `para TODOS los gimnasios.`,
    ).toContain(dos.sepa.iban);
  });
});

describe("ficha del socio — GET /api/admin/members/:userId", () => {
  const RUTA = "GET /api/admin/members/:userId";

  it("aislamiento: la ficha de un socio de El Templo da 404", async () => {
    const res = await getComoGimnasioDos(`/${templo.userId}`);
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: la ficha propia del gimnasio 2 SI se puede leer", async () => {
    const res = await getComoGimnasioDos(`/${dos.userId}`);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { id: number; firstName: string };
    expect(body.id).toBe(dos.userId);
    expect(body.firstName).toBe(dos.firstName);
  });
});

describe("conteo de sesiones por nivel — GET /api/admin/members/:userId/session-levels", () => {
  const RUTA = "GET /api/admin/members/:userId/session-levels";

  it("aislamiento: pedir el userId de El Templo devuelve conteos VACIOS, nunca los ajenos", async () => {
    // Esta ruta no chequea existencia del socio contra el gimnasio del
    // actor (a diferencia de GET /:userId): filtra `completed_sessions`
    // directo por ctx+userId. Un userId ajeno simplemente no matchea
    // ninguna fila propia — 200 con `counts: []`, NUNCA las 2 sesiones
    // "omega" reales de El Templo. Sigue el contrato D-06 (indistinguible
    // de un userId inexistente) aunque la forma sea 200-vacio y no 404.
    const res = await getComoGimnasioDos(`/${templo.userId}/session-levels`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      counts: Array<{ level: string; count: number }>;
    };
    expect(
      body.counts,
      porQueImportaElListado(RUTA, templo.userId) +
        ` (se esperaba counts=[] y se recibieron las sesiones "${templo.sessionLevel}" ajenas)`,
    ).toEqual([]);
  });

  it("control: el userId propio del gimnasio 2 SI trae sus conteos reales", async () => {
    const res = await getComoGimnasioDos(`/${dos.userId}/session-levels`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      counts: Array<{ level: string; count: number }>;
    };
    expect(
      body.counts,
      porQueImportaElControl(RUTA, dos.userId),
    ).toContainEqual({ level: dos.sessionLevel, count: dos.sessionCount });
  });
});

/** Mensaje de rojo para las lecturas by-id que SI esperan 404 (D-06). */
function porQueImportaLaLectura(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la ficha ${filaId}, que es de El ` +
    `Templo (${TENANT_TEMPLO}). El contrato del milestone (D-06) es que el recurso ajeno sea ` +
    `indistinguible de uno inexistente: "no encontrado", nunca "prohibido". getMemberById perdio ` +
    `su \`tenantWhere(users, ctx)\`.`
  );
}
