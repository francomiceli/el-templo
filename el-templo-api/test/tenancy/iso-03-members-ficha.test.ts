/**
 * Fase 173 Plan 27 (ISO-03) — AISLAMIENTO de las 10 rutas de la FICHA del
 * socio (historial financiero, conceptos pendientes, notas, referidos, foto
 * y password), contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el plan 2 de 3 de la batería ISO-03 de `members` (D-09 del CONTEXT de la
 * fase 173). El plan 173-26 (`iso-03-members-listados.test.ts`) cubrió las 9
 * rutas de listado/búsqueda/export; este cubre las 10 rutas donde el `userId`
 * llega por la URL y el servidor decide qué hacer con él. CUATRO escriben
 * (crear/editar/borrar notas, cambiar password) y UNA crea una relación entre
 * dos usuarios (asignar referidor): acá un fallo no solo filtra, ESCRIBE
 * sobre datos de otro gimnasio. `PUT /:userId/password` es el peor caso de
 * toda la fase — un fallo ahí es toma de control de una cuenta ajena.
 *
 * QUE RUTAS CUBRE (10 de las 30 de members/users/leads del manifiesto)
 * ----------------------------------------------------------------------
 *   GET    /api/admin/members/:userId/financial-history
 *   GET    /api/admin/members/:userId/outstanding-concepts
 *   GET    /api/admin/members/:userId/notes
 *   POST   /api/admin/members/:userId/notes
 *   PUT    /api/admin/members/:userId/notes/:noteId
 *   DELETE /api/admin/members/:userId/notes/:noteId
 *   GET    /api/admin/members/:userId/referrals
 *   POST   /api/admin/members/:userId/referrals
 *   POST   /api/admin/members/:userId/photo/upload-url
 *   PUT    /api/admin/members/:userId/password
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del CONTEXT — vale para TODO el milestone)
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: "no
 * encontrado" para las lecturas y escrituras by-id, **nunca un "prohibido"**
 * — ese status confirmaría que el recurso existe en otro gimnasio. El
 * criterio de aceptación de este archivo es un `grep -c` de esa aserción de
 * "prohibido" sobre el archivo dando CERO. Por eso este párrafo describe el
 * contrato en castellano en vez de escribir el status (lección pagada en el
 * piloto, `test/setup.ts`): un gate que busca por substring no distingue
 * código de comentario.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08 del piloto)
 * ---------------------------------------------------------------------
 * Un 404 puede venir del aislamiento o de una siembra rota, y los dos se ven
 * igual desde afuera. Por eso cada `describe` tiene DOS `it`: el de
 * aislamiento y el de control, que hace la MISMA operación sobre el recurso
 * PROPIO del gimnasio 2 y exige que funcione.
 *
 * LA EVIDENCIA DE UNA ESCRITURA SE LEE DE LA BASE, CON VARIAS COLUMNAS JUNTAS
 * ----------------------------------------------------------------------------
 * Un rechazo que YA escribió la mitad se ve igual que uno limpio si se mira
 * una sola columna (T-173-27-05, Repudiation). Por eso cada caso de escritura
 * relee la fila objetivo con una "foto" —varias columnas a la vez— ANTES y
 * DESPUÉS del intento, y compara ambas fotos byte a byte. Mismo idioma que
 * `fotoDeLaTransaccion` de `iso-03-finance-transacciones.test.ts` (172-18).
 *
 * EL ACTOR (D-10 del piloto)
 * ---------------------------
 * `gym2.adminToken` (rol `admin`) en las 10. Es el mínimo REAL disponible:
 * `financial-history`/`outstanding-concepts` exigen `FINANCE_READ_ROLES`
 * (excluye `coach`), `referrals`/`password` exigen `MEMBER_LIFECYCLE_ROLES`
 * (owner/admin/gestion, excluye `coach`), y `seedSecondTenant` no crea ningún
 * `gestion` ni `recepcion` — su único otro staff es un `coach`, excluido de
 * los dos conjuntos. `notes`/`photo` solo exigen el guard de módulo
 * (`MEMBER_ROLES`, admite `coach`), pero se usa `admin` ahí también para que
 * el caso de escritura no se confunda con el gate de autoría de
 * `canEditNote` (que SIEMPRE deja pasar a admin/owner, sea o no el autor de
 * la nota) — el eje que este archivo prueba es tenancy, no autoría.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-ficha.test.ts
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md
 * @see .planning/phases/173-.../173-CONTEXT.md — D-06/D-09/D-10
 * @see test/tenancy/iso-03-members-listados.test.ts — ciclo de vida y helpers de mensaje (173-26)
 * @see test/tenancy/iso-03-finance-transacciones.test.ts — el idioma de la "foto" multi-columna
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
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
  type FichaTemplo,
  type FichaGimnasioDos,
} from "../fixtures/members-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/admin/members";

// ─── Ciclo de vida (idéntico al 173-26) ─────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaTemplo;
let dos: FichaGimnasioDos;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmetico (mismo criterio que 173-26/finance):
  //  1. `cleanAllTestData` vacia TODAS las tablas del modulo (y muchas mas)
  //     sin filtro de gimnasio.
  //  2. `limpiarSociosDeLaBateria` ANTES de `seedSecondTenant`.
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

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

/** GET/POST/PUT/DELETE como staff del gimnasio 2 (rol `admin` — ver docblock). */
async function comoGimnasioDos(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

// ─── Mensajes compartidos ────────────────────────────────────────────────────

/** Mensaje de rojo para las lecturas/escrituras by-id que esperan 404 (D-06). */
function porQueImportaLaFicha(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio (o le dejo escribir) al staff del gimnasio ${TENANT_DOS} ` +
    `la ficha ${filaId}, que es de El Templo (${TENANT_TEMPLO}). El contrato del milestone ` +
    `(D-06) es que el recurso ajeno sea indistinguible de uno inexistente: "no encontrado", ` +
    `nunca "prohibido". Empezar por el metodo que sirve esa ruta en ` +
    `src/modules/members/service.ts y su handler en src/modules/members/routes.ts.`
  );
}

/** Mensaje de rojo para los controles positivos. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio (o no le dejo operar) al staff del gimnasio ${TENANT_DOS} sobre su ` +
    `PROPIA fila ${filaId}. Esto no es un problema de aislamiento sino de siembra o de scope de ` +
    `mas: sin este control, el test de aislamiento de al lado pasaria en verde por la razon ` +
    `equivocada.`
  );
}

// ─── "Fotos" leidas de la base (varias columnas juntas, T-173-27-05) ────────
//
// Mismo idioma que `fotoDeLaTransaccion` (iso-03-finance-transacciones.test.ts,
// 172-18): un rechazo que YA escribio la mitad se ve igual que uno limpio si
// se mira una sola columna. Las exenciones `tenant-safe` van EMBEBIDAS en el
// SQL (unico canal que el sentinel lee): releer la fila (ajena o propia) ES
// la asercion de contenido/tampering; filtrarla por gimnasio la volveria
// tautologica.

async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

interface FotoDelUsuario {
  tenantId: number | null;
  passwordHash: string | null;
  photoUrl: string | null;
}

/** Las columnas de `users` que importan para password/foto: gimnasio, hash, foto. */
async function fotoDelUsuario(id: number): Promise<FotoDelUsuario> {
  const filas = await consultar<{
    tenant_id: number | null;
    password_hash: string | null;
    photo_url: string | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, password_hash, photo_url FROM users WHERE id = ${id}`,
  );
  const fila = filas[0];
  if (fila === undefined) {
    return { tenantId: null, passwordHash: null, photoUrl: null };
  }
  return {
    tenantId: fila.tenant_id === null ? null : Number(fila.tenant_id),
    passwordHash: fila.password_hash,
    photoUrl: fila.photo_url,
  };
}

interface FotoDeLaNota {
  tenantId: number | null;
  userId: number | null;
  content: string | null;
  updatedAt: string | null;
}

/** Las columnas de `member_notes` que importan: gimnasio, dueño, contenido, updated_at. */
async function fotoDeLaNota(id: number): Promise<FotoDeLaNota> {
  const filas = await consultar<{
    tenant_id: number | null;
    user_id: number | null;
    content: string | null;
    updated_at: unknown;
  }>(
    sql`SELECT /* tenant-safe: releer la nota (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, user_id, content, updated_at FROM member_notes WHERE id = ${id}`,
  );
  const fila = filas[0];
  if (fila === undefined) {
    return { tenantId: null, userId: null, content: null, updatedAt: null };
  }
  return {
    tenantId: fila.tenant_id === null ? null : Number(fila.tenant_id),
    userId: fila.user_id === null ? null : Number(fila.user_id),
    content: fila.content,
    updatedAt: fila.updated_at === null ? null : String(fila.updated_at),
  };
}

/** Cuenta, DIRECTO de la base, cuantas notas tiene un socio dado (sin filtro de gimnasio). */
async function contarNotasDe(userId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar notas de un socio (sin filtrar por gimnasio) es la asercion de "cero filas nuevas" — filtrar la volveria tautologica */ COUNT(*) AS c FROM member_notes WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

interface FilaReferral {
  tenantId: number;
  referrerId: number;
  referredId: number;
  status: string;
}

/** La fila de `referrals` para un `referredId` dado, o `null` si no existe. */
async function referralDe(referredId: number): Promise<FilaReferral | null> {
  const filas = await consultar<{
    tenant_id: number;
    referrer_id: number;
    referred_id: number;
    status: string;
  }>(
    sql`SELECT /* tenant-safe: la ausencia (o presencia) de la fila ES la asercion de que la atribucion cross-tenant no persistio; filtrarla por gimnasio la volveria tautologica */ tenant_id, referrer_id, referred_id, status FROM referrals WHERE referred_id = ${referredId}`,
  );
  const fila = filas[0];
  if (fila === undefined) return null;
  return {
    tenantId: Number(fila.tenant_id),
    referrerId: Number(fila.referrer_id),
    referredId: Number(fila.referred_id),
    status: fila.status,
  };
}

/**
 * El `tenant_id` de una fila de `financial_transactions`, por id.
 *
 * `financial_transactions` es tabla strict DESDE LA FASE 172 (no recien con la
 * sonda de esta fase) — un `.select()` de Drizzle sin `tenantWhere` hace throw
 * del sentinel. Raw SQL + exencion EMBEBIDA, mismo criterio que
 * `tenantDeLaFila` del fixture: leer el tenant_id de la fila sembrada ES la
 * precondicion, filtrarla por gimnasio la volveria tautologica.
 */
async function tenantDeLaTransaccion(id: number): Promise<number | null> {
  const filas = await consultar<{ tenant_id: number | null }>(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila sembrada ES la precondicion; filtrarla por gimnasio la volveria tautologica */ tenant_id FROM financial_transactions WHERE id = ${id}`,
  );
  const fila = filas[0];
  return fila === undefined || fila.tenant_id === null
    ? null
    : Number(fila.tenant_id);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
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

  it("El Templo tiene un socio vivo, con ficha completa (nota, historial financiero), que el gimnasio 2 NO tiene que ver", async () => {
    const notaTemplo = await fotoDeLaNota(templo.noteId);
    const transaccionTemplo = await tenantDeLaTransaccion(templo.transactionId);
    expect(
      [notaTemplo.tenantId, transaccionTemplo],
      `Alguna fila ajena no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno vivo, todos ` +
        `los casos de aislamiento de este archivo pasan probando nada. Revisar sembrarSocioTemplo ` +
        `en test/fixtures/members-gimnasio-dos.ts.`,
    ).toEqual([TENANT_TEMPLO, TENANT_TEMPLO]);
  });

  it("el gimnasio 2 tiene su ficha propia, sembrada en el gimnasio 2 (no en El Templo por el DEFAULT 1)", async () => {
    const notaDos = await fotoDeLaNota(dos.noteId);
    const transaccionDos = await tenantDeLaTransaccion(dos.transactionId);
    expect(
      [notaDos.tenantId, transaccionDos],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ese ` +
        `INSERT perdio su \`tenantValues(CTX_DOS, …)\` y cayo en el DEFAULT 1 de la columna.`,
    ).toEqual([TENANT_DOS, TENANT_DOS]);
  });

  it("los importes sembrados (deuda y transaccion) son de otro orden de magnitud entre los dos gimnasios", async () => {
    expect(
      [
        dos.debtAmount,
        templo.debtAmount,
        dos.transactionAmount,
        templo.transactionAmount,
      ],
      `Los importes sembrados dejaron de ser distinguibles entre gimnasios: un total contaminado ` +
        `podria confundirse con el correcto si estos valores se acercaran. Revisar ` +
        `test/fixtures/members-gimnasio-dos.ts.`,
    ).toEqual([777777, 111, 888888, 222]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 1 — Lecturas: historial financiero, conceptos pendientes, notas, referidos
// ═══════════════════════════════════════════════════════════════════════════

describe("historial financiero — GET /api/admin/members/:userId/financial-history", () => {
  const RUTA = "GET /api/admin/members/:userId/financial-history";

  it("aislamiento: pedir el historial de un socio de El Templo da 404 (D-06)", async () => {
    const res = await comoGimnasioDos(
      "GET",
      `/${templo.userId}/financial-history`,
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el historial propio del gimnasio 2 SI se puede leer, con el cobro sembrado", async () => {
    const res = await comoGimnasioDos(
      "GET",
      `/${dos.userId}/financial-history`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      rows: Array<{ transaction: { id: number; amount: number } }>;
      total: number;
    };
    expect(
      body.rows.map((r) => r.transaction.id),
      porQueImportaElControl(RUTA, dos.transactionId),
    ).toContain(dos.transactionId);
    const propia = body.rows.find(
      (r) => r.transaction.id === dos.transactionId,
    );
    expect(
      propia?.transaction.amount,
      `${RUTA} devolvio el cobro propio con otro importe que el sembrado (${dos.transactionAmount}).`,
    ).toBe(dos.transactionAmount);
  });
});

describe("conceptos pendientes — GET /api/admin/members/:userId/outstanding-concepts", () => {
  const RUTA = "GET /api/admin/members/:userId/outstanding-concepts";

  it("aislamiento: pedir los conceptos de un socio de El Templo da 404 (D-06)", async () => {
    const res = await comoGimnasioDos(
      "GET",
      `/${templo.userId}/outstanding-concepts`,
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: los conceptos propios del gimnasio 2 SI se pueden leer, con la deuda sembrada", async () => {
    const res = await comoGimnasioDos(
      "GET",
      `/${dos.userId}/outstanding-concepts`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      concepts: Array<{ balance: number; currency: string }>;
    };
    const propio = body.concepts.find((c) => c.balance === dos.debtAmount);
    expect(
      propio,
      `${RUTA} no devolvio la deuda propia (${dos.debtAmount}) entre los conceptos pendientes: ` +
        porQueImportaElControl(RUTA, dos.userId),
    ).toBeDefined();
  });
});

describe("listado de notas — GET /api/admin/members/:userId/notes", () => {
  const RUTA = "GET /api/admin/members/:userId/notes";

  it("aislamiento: el listado de notas de un socio de El Templo viene VACIO, nunca las notas ajenas", async () => {
    // Esta ruta no chequea existencia del socio (a diferencia de financial-history):
    // filtra `member_notes` directo por ctx+userId. Un userId ajeno no matchea
    // ninguna fila propia — 200 con notes=[], nunca la nota real de El Templo.
    const res = await comoGimnasioDos("GET", `/${templo.userId}/notes`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      notes: Array<{ id: number; content: string }>;
    };
    expect(
      body.notes.map((n) => n.id),
      porQueImportaLaFicha(RUTA, templo.noteId) +
        ` (se esperaba notes=[] y se recibio la nota "${templo.noteContent}" ajena)`,
    ).toEqual([]);
    // Barrido: si por algun motivo el listado no viniera vacio, cada nota
    // devuelta tiene que ser del gimnasio 2 (lee el tenant_id de la BASE).
    for (const n of body.notes) {
      const foto = await fotoDeLaNota(n.id);
      expect(foto.tenantId, porQueImportaLaFicha(RUTA, n.id)).toBe(TENANT_DOS);
    }
  });

  it("control: el listado propio del gimnasio 2 SI trae la nota sembrada", async () => {
    const res = await comoGimnasioDos("GET", `/${dos.userId}/notes`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      notes: Array<{ id: number; content: string }>;
    };
    const propia = body.notes.find((n) => n.id === dos.noteId);
    expect(propia, porQueImportaElControl(RUTA, dos.noteId)).toBeDefined();
    expect(
      propia?.content,
      `${RUTA} devolvio la nota propia con otro contenido que el sembrado.`,
    ).toBe(dos.noteContent);
  });
});

describe("referidos de la ficha — GET /api/admin/members/:userId/referrals", () => {
  const RUTA = "GET /api/admin/members/:userId/referrals";

  it("aislamiento: pedir los referidos de un socio de El Templo da 404 (D-06)", async () => {
    const res = await comoGimnasioDos("GET", `/${templo.userId}/referrals`);
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: los referidos propios del gimnasio 2 SI se pueden leer, y el vinculo sembrado se ve con el nombre propio", async () => {
    // Un referido es una relacion ENTRE DOS usuarios: se siembra un vinculo
    // real (via el propio POST de la ruta, ya con su tenantWhere del 173-08)
    // entre dos socios del gimnasio 2, y se verifica que el `fullName` de la
    // contraparte se resuelve — la resolucion de nombre esta scopeada por ctx
    // (`tenantWhere(users, ctx)` en getReferralOverview), asi que un
    // eventual otro extremo de OTRO gimnasio nunca podria devolver un nombre.
    const asignacion = await comoGimnasioDos(
      "POST",
      `/${dos.userId}/referrals`,
      { referrerId: gym2.socios[0].id },
    );
    expect(
      asignacion.statusCode,
      `No se pudo sembrar el vinculo propio para este control: ${asignacion.body}`,
    ).toBe(201);

    const res = await comoGimnasioDos("GET", `/${dos.userId}/referrals`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      referredBy: { userId: number; fullName: string } | null;
    };
    expect(
      body.referredBy?.userId,
      porQueImportaElControl(RUTA, dos.userId),
    ).toBe(gym2.socios[0].id);
    expect(
      body.referredBy?.fullName,
      `${RUTA} devolvio el vinculo pero sin el nombre de la contraparte propia — la resolucion ` +
        `de nombre en getReferralOverview perdio su tenantWhere(users, ctx).`,
    ).not.toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 2 — Escrituras: notas, referidos, foto y password
// ═══════════════════════════════════════════════════════════════════════════

describe("crear nota — POST /api/admin/members/:userId/notes", () => {
  const RUTA = "POST /api/admin/members/:userId/notes";

  it("aislamiento: crear una nota sobre un socio de El Templo se rechaza, y CERO filas nuevas en member_notes", async () => {
    const antes = await contarNotasDe(templo.userId);
    const res = await comoGimnasioDos("POST", `/${templo.userId}/notes`, {
      content: "nota que no deberia poder escribirse",
    });
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarNotasDe(templo.userId);
    expect(
      despues,
      `${RUTA} rechazo la escritura pero member_notes.userId=${templo.userId} paso de ${antes} a ` +
        `${despues} filas — el rechazo NO impidio el INSERT.`,
    ).toBe(antes);
  });

  it("control: crear una nota sobre el socio propio del gimnasio 2 SI funciona", async () => {
    const antes = await contarNotasDe(dos.userId);
    const res = await comoGimnasioDos("POST", `/${dos.userId}/notes`, {
      content: "nota nueva del control positivo",
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number; content: string };
    const foto = await fotoDeLaNota(body.id);
    expect(
      [foto.tenantId, foto.userId, foto.content],
      `${RUTA} creo la nota pero con datos distintos a los esperados.`,
    ).toEqual([TENANT_DOS, dos.userId, "nota nueva del control positivo"]);
    const despues = await contarNotasDe(dos.userId);
    expect(despues).toBe(antes + 1);
  });
});

describe("editar nota — PUT /api/admin/members/:userId/notes/:noteId", () => {
  const RUTA = "PUT /api/admin/members/:userId/notes/:noteId";

  it("aislamiento (combo 1): noteId AJENO + userId PROPIO se rechaza, la nota ajena queda INTACTA", async () => {
    const fotoAntes = await fotoDeLaNota(templo.noteId);
    const res = await comoGimnasioDos(
      "PUT",
      `/${dos.userId}/notes/${templo.noteId}`,
      { content: "intento de editar la nota ajena" },
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const fotoDespues = await fotoDeLaNota(templo.noteId);
    expect(
      [fotoDespues.tenantId, fotoDespues.content, fotoDespues.updatedAt],
      `${RUTA} (combo noteId ajeno + userId propio) rechazo con 404 pero la nota de El Templo ` +
        `SI cambio de contenido/updated_at — el rechazo no impidio el UPDATE.`,
    ).toEqual([fotoAntes.tenantId, fotoAntes.content, fotoAntes.updatedAt]);
  });

  it("aislamiento (combo 2): noteId PROPIO + userId AJENO se rechaza, la nota propia queda INTACTA", async () => {
    const fotoAntes = await fotoDeLaNota(dos.noteId);
    const res = await comoGimnasioDos(
      "PUT",
      `/${templo.userId}/notes/${dos.noteId}`,
      { content: "intento con userId ajeno" },
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, dos.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const fotoDespues = await fotoDeLaNota(dos.noteId);
    expect(
      [fotoDespues.tenantId, fotoDespues.content, fotoDespues.updatedAt],
      `${RUTA} (combo noteId propio + userId ajeno) rechazo con 404 pero la nota propia SI ` +
        `cambio — el rechazo no impidio el UPDATE.`,
    ).toEqual([fotoAntes.tenantId, fotoAntes.content, fotoAntes.updatedAt]);
  });

  it("control: editar la nota propia con el userId propio SI funciona", async () => {
    const res = await comoGimnasioDos(
      "PUT",
      `/${dos.userId}/notes/${dos.noteId}`,
      { content: "contenido editado por el control" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const foto = await fotoDeLaNota(dos.noteId);
    expect(
      [foto.tenantId, foto.content],
      `${RUTA} no aplico la edicion propia.`,
    ).toEqual([TENANT_DOS, "contenido editado por el control"]);
  });
});

describe("borrar nota — DELETE /api/admin/members/:userId/notes/:noteId", () => {
  const RUTA = "DELETE /api/admin/members/:userId/notes/:noteId";

  it("aislamiento (combo 1): noteId AJENO + userId PROPIO se rechaza, la nota ajena SIGUE EXISTIENDO", async () => {
    const res = await comoGimnasioDos(
      "DELETE",
      `/${dos.userId}/notes/${templo.noteId}`,
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const foto = await fotoDeLaNota(templo.noteId);
    expect(
      foto.tenantId,
      `${RUTA} (combo noteId ajeno + userId propio) rechazo con 404 pero la nota de El Templo ` +
        `YA NO EXISTE — el rechazo no impidio el DELETE.`,
    ).toBe(TENANT_TEMPLO);
  });

  it("aislamiento (combo 2): noteId PROPIO + userId AJENO se rechaza, la nota propia SIGUE EXISTIENDO", async () => {
    const res = await comoGimnasioDos(
      "DELETE",
      `/${templo.userId}/notes/${dos.noteId}`,
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, dos.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const foto = await fotoDeLaNota(dos.noteId);
    expect(
      foto.tenantId,
      `${RUTA} (combo noteId propio + userId ajeno) rechazo con 404 pero la nota propia YA NO ` +
        `EXISTE — el rechazo no impidio el DELETE.`,
    ).toBe(TENANT_DOS);
  });

  it("control: borrar la nota propia con el userId propio SI funciona", async () => {
    const res = await comoGimnasioDos(
      "DELETE",
      `/${dos.userId}/notes/${dos.noteId}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.noteId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const foto = await fotoDeLaNota(dos.noteId);
    expect(
      foto.tenantId,
      `${RUTA} no borro la nota propia — sigue existiendo en la base.`,
    ).toBeNull();
  });
});

describe("asignar referidor — POST /api/admin/members/:userId/referrals", () => {
  const RUTA = "POST /api/admin/members/:userId/referrals";

  it("aislamiento: asignar como referidor a un socio de El Templo se rechaza, y la relacion cross-tenant NO queda persistida (T-173-27-03)", async () => {
    const res = await comoGimnasioDos("POST", `/${dos.userId}/referrals`, {
      referrerId: templo.userId,
    });
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const fila = await referralDe(dos.userId);
    expect(
      fila,
      `${RUTA} rechazo con 404 pero SI quedo una fila en \`referrals\` para referred_id=` +
        `${dos.userId} — la relacion cross-tenant persistio.`,
    ).toBeNull();
  });

  it("control: asignar como referidor a un socio propio del gimnasio 2 SI funciona", async () => {
    const res = await comoGimnasioDos("POST", `/${dos.userId}/referrals`, {
      referrerId: gym2.socios[1].id,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const fila = await referralDe(dos.userId);
    expect(
      [fila?.tenantId, fila?.referrerId, fila?.referredId],
      `${RUTA} no dejo la fila esperada en \`referrals\`.`,
    ).toEqual([TENANT_DOS, gym2.socios[1].id, dos.userId]);
  });
});

describe("URL de subida de foto — POST /api/admin/members/:userId/photo/upload-url", () => {
  const RUTA = "POST /api/admin/members/:userId/photo/upload-url";

  it("aislamiento: pedir la URL para un socio de El Templo se rechaza, y su photo_url NO cambia (T-173-27-06)", async () => {
    const fotoAntes = await fotoDelUsuario(templo.userId);
    const res = await comoGimnasioDos(
      "POST",
      `/${templo.userId}/photo/upload-url`,
      { filename: "intento.jpg" },
    );
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const fotoDespues = await fotoDelUsuario(templo.userId);
    expect(
      [fotoDespues.tenantId, fotoDespues.photoUrl],
      `${RUTA} rechazo con 404 pero el photo_url del socio de El Templo SI cambio.`,
    ).toEqual([fotoAntes.tenantId, fotoAntes.photoUrl]);
  });

  it("control: pedir la URL para el socio propio del gimnasio 2 SI funciona, y su photo_url SI cambia", async () => {
    const res = await comoGimnasioDos(
      "POST",
      `/${dos.userId}/photo/upload-url`,
      { filename: "propia.jpg" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      uploadUrl: string;
      publicUrl: string;
    };
    expect(
      body.uploadUrl,
      `${RUTA} no genero uploadUrl para el socio propio.`,
    ).toEqual(expect.any(String));
    const foto = await fotoDelUsuario(dos.userId);
    expect(
      [foto.tenantId, foto.photoUrl],
      `${RUTA} respondio 200 pero no persistio el photo_url del socio propio.`,
    ).toEqual([TENANT_DOS, body.publicUrl]);
  });
});

describe("resetear password — PUT /api/admin/members/:userId/password (T-173-27-01, el caso mas grave de la fase)", () => {
  const RUTA = "PUT /api/admin/members/:userId/password";

  it("aislamiento: resetear el password de un socio de El Templo se rechaza, y su password_hash NO CAMBIA (toma de control de cuenta si fallara)", async () => {
    // Si esta ruta fallara, el staff del gimnasio 2 podria tomar control de
    // CUALQUIER cuenta de El Templo reseteandole el password al valor
    // compartido conocido (MEMBER_TEMP_PASSWORD). La UNICA evidencia que vale
    // es el hash releido de la base — el status solo no alcanza.
    const fotoAntes = await fotoDelUsuario(templo.userId);
    expect(
      fotoAntes.passwordHash,
      "Precondicion: el socio de El Templo necesita un password_hash real antes del intento.",
    ).toBeTruthy();

    const res = await comoGimnasioDos("PUT", `/${templo.userId}/password`);
    expect(
      res.statusCode,
      porQueImportaLaFicha(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);

    const fotoDespues = await fotoDelUsuario(templo.userId);
    expect(
      [fotoDespues.tenantId, fotoDespues.passwordHash],
      `${RUTA} rechazo con 404 pero el password_hash del socio de El Templo (${TENANT_TEMPLO}) ` +
        `CAMBIO — esto es toma de control de una cuenta de otro gimnasio, el caso mas grave de ` +
        `toda la fase 173. Empezar por resetMemberPassword en src/modules/members/service.ts.`,
    ).toEqual([fotoAntes.tenantId, fotoAntes.passwordHash]);
  });

  it("control: resetear el password del socio propio del gimnasio 2 SI funciona, y su password_hash SI CAMBIA", async () => {
    const fotoAntes = await fotoDelUsuario(dos.userId);
    const res = await comoGimnasioDos("PUT", `/${dos.userId}/password`);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(204);
    const fotoDespues = await fotoDelUsuario(dos.userId);
    expect(
      fotoDespues.tenantId,
      `${RUTA} cambio el password de una fila de otro gimnasio.`,
    ).toBe(TENANT_DOS);
    expect(
      fotoDespues.passwordHash,
      `${RUTA} respondio 204 pero el password_hash del socio propio NO cambio.`,
    ).not.toBe(fotoAntes.passwordHash);
  });
});
