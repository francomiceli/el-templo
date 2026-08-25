/**
 * Fase 173 Plan 28 (ISO-03) — AISLAMIENTO + ADO-07 de las 10 rutas de
 * ESCRITURA: altas/edición/baja de socios, el PATCH de leads, y las 4 rutas
 * `tenant-scoped` de staff (`/api/admin/users`).
 *
 * ACTUALIZACIÓN (fase 176 plan 11): originalmente eran 11 rutas — incluía
 * `POST /api/admin/users/:userId/program-addons`. El plan 176-05 reclasificó
 * esa ruta de `tenant-scoped` a `templo-module`/`templo-training`
 * (`moduleScope` ya la gateaba en runtime; lo desactualizado era el
 * manifiesto), así que dejó de pertenecer a esta batería. Su caso de
 * aislamiento + control positivo se reubicó a
 * test/tenancy/iso-03-programs-modulo.test.ts, sembrando el flag del
 * gimnasio 2 — sin pérdida de cobertura. Ver la nota en el lugar donde
 * vivía el describe, más abajo en este archivo.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el plan 3 de 3 de la batería ISO-03 de `members` (D-09 del CONTEXT). Acá
 * se prueban DOS invariantes a la vez: el aislamiento clásico (ADO-02, un
 * staff de otro gimnasio no opera sobre un socio/staff ajeno) y el invariante
 * de anclas (ADO-07, criterio 2 de la fase: ninguna ruta acepta un `branchId`
 * de OTRO gimnasio). El control positivo de `POST /api/admin/members` es
 * literalmente lo que el ancla autodestructiva de la fase 172 decía que NO se
 * podía escribir hasta que esta fase arreglara D-13.
 *
 * QUE RUTAS CUBRE (10 de las 29 de members/users/leads del manifiesto)
 * ----------------------------------------------------------------------
 *   POST   /api/admin/members
 *   POST   /api/admin/members/trial
 *   POST   /api/admin/members/:userId/convert-to-trial
 *   PUT    /api/admin/members/:userId
 *   DELETE /api/admin/members/:userId
 *   PATCH  /api/admin/leads/:userId
 *   GET    /api/admin/users
 *   POST   /api/admin/users
 *   PUT    /api/admin/users/:userId
 *   PATCH  /api/admin/users/:userId/status
 *
 * (`POST /api/admin/users/:userId/program-addons` YA NO está acá — ver la
 * "ACTUALIZACIÓN (fase 176 plan 11)" más arriba.)
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del CONTEXT — vale para TODO el milestone)
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: "no
 * encontrado" para las lecturas/escrituras by-id, **nunca un "prohibido"** —
 * ese status confirmaría que el recurso existe en otro gimnasio. Igual que
 * `iso-03-members-ficha.test.ts` (173-27), este párrafo describe el contrato
 * en castellano en vez de escribir el status: el criterio de aceptación es un
 * `grep -c` de esa aserción de "prohibido" sobre el archivo dando CERO.
 *
 * HALLAZGO — 4 de las 11 rutas tienen una SEGUNDA barrera que NO es 404
 * ------------------------------------------------------------------------
 * `POST /members`, `POST /members/trial`, `POST /:userId/convert-to-trial` y
 * `PUT /members/:userId` (las 4 rutas de `members` que aceptan `branchId`)
 * registran un `preHandler: [requireBranchAccess({from:"body.branchId"})]`
 * (fase 110, NO tocado por esta fase) que corre ANTES del service y usa
 * `canAccessBranch` (D-14, ya con el filtro de gimnasio de la 173-11). Cuando
 * el `branchId` del body es ajeno, ESTE preHandler rechaza la request antes
 * de que `assertBranchDelGimnasio` (D-05, el 404 "Sede no encontrada" que el
 * resto de la fase usa) llegue siquiera a evaluarse — confirmado en vivo con
 * un request real: el body de la respuesta es
 * `{"code":"BRANCH_OUT_OF_SCOPE", "message":"No tenés acceso a esta sede"}`.
 * Esto NO es un agujero de seguridad (la escritura cross-tenant queda
 * igual de bloqueada, verificado leyendo la base en cada caso de abajo) pero
 * SÍ es un contrato de status distinto al que D-06 describe para el resto
 * del milestone. La razón por la que igual satisface el ESPÍRITU de D-06: la
 * función `canAccessBranch` devuelve el MISMO código para "la sede no existe"
 * que para "la sede es de otro gimnasio" — no hay manera de distinguir un
 * caso del otro desde afuera, que es la propiedad que D-06 protege (un status
 * que SÍ distinguiera confirmaría que la sede existe en otro gimnasio). En
 * vez de asumir cuál status es "el correcto", `mismaRespuestaQueSedeInexistente`
 * (más abajo) EJERCITA las dos variantes (branchId ajeno vs. branchId que
 * directamente no existe) y prueba que la respuesta es IDÉNTICA — eso es lo
 * que realmente importa, y nunca escribe el número en el archivo (misma
 * disciplina que `ancla-branch-consistency.test.ts`, 173-11). Documentado
 * también en el SUMMARY de este plan para quien revise el switch (173-30).
 *
 * SEGUNDO HALLAZGO — fix real de seguridad en `program-addons`
 * ----------------------------------------------------------------------
 * `POST /api/admin/users/:userId/program-addons` vive en `programs/routes.ts`
 * (módulo diferido a 174/175) pero su `:userId` es un socio — el ancla
 * `users.tenant_id` SÍ aplica (D-02: cirugía mínima sobre la tabla strict).
 * Verificado en vivo ANTES del fix de este plan: un staff del gimnasio 2 podía
 * inscribir a un socio de El Templo en un add-on GRATIS (`pricePaid` ausente o
 * 0 — el único camino que NO pasa por `transactionService.create`, que sí es
 * strict desde la fase 172 y hubiera bloqueado el caso con `pricePaid>0`),
 * con 200 real y una fila en `program_enrollments` para el socio ajeno. Fix:
 * un `SELECT users` con `tenantWhere` ANTES del lookup de suscripción activa
 * — ver `src/modules/programs/routes.ts`. La fila de `program_enrollments`
 * en sí sigue sin `tenantValues` en su INSERT (bug PREEXISTENTE, adyacente,
 * fuera del alcance de D-02 — pertenece a la adopción de `programs`/
 * `subscriptions` en 174/175): documentado en `deferred-items.md`, NO
 * arreglado acá. El fix de código sigue vigente en
 * `src/modules/programs/routes.ts`; el CASO de test que lo ejercitaba se
 * reubicó en fase 176 plan 11 (ver la "ACTUALIZACIÓN" al inicio de este
 * archivo) porque la ruta pasó a ser `templo-module`.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08 del piloto)
 * ---------------------------------------------------------------------
 * Un rechazo puede venir del aislamiento o de una siembra rota, y los dos se
 * ven igual desde afuera. Por eso cada ruta tiene su `it` de control, que
 * hace la MISMA operación sobre un recurso PROPIO del gimnasio 2 y exige que
 * funcione — el control positivo de `POST /members` es, además, lo que el
 * ancla autodestructiva de la fase 172 (D-13) decía que no se podía escribir.
 *
 * LA EVIDENCIA DE UNA ESCRITURA SE LEE DE LA BASE, CON VARIAS COLUMNAS JUNTAS
 * ----------------------------------------------------------------------------
 * Un rechazo que YA escribió la mitad se ve igual que uno limpio si se mira
 * una sola columna (Repudiation). Cada caso de escritura relee la fila
 * objetivo con una "foto" — varias columnas a la vez — ANTES y DESPUÉS del
 * intento, y compara ambas fotos. Mismo idioma que `iso-03-members-ficha.test.ts`.
 *
 * EL ACTOR (D-10 del piloto)
 * ---------------------------
 * `gym2.adminToken` (rol `admin`) para las rutas de `members`/`leads`. Las 4
 * rutas de `/api/admin/users` exigen `OWNER_ROLES = ["owner"]` A SECAS — el
 * único actor que `admin` no sirve para nada acá — así que se reusa el
 * `dos.sepa.ownerToken` que sembró el fixture 173-26 (creado originalmente
 * para bypassear el gate de país de `export-sepa`, pero es EXACTAMENTE el
 * `owner` del gimnasio 2 que estas 4 rutas necesitan). No hay rol más barato
 * disponible: es el "rol mínimo real" de esta mitad del archivo.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-altas-y-staff.test.ts
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md
 * @see .planning/phases/173-.../173-CONTEXT.md — D-05/D-06/D-09/D-14
 * @see test/tenancy/iso-03-members-ficha.test.ts — idioma de la "foto" y del ciclo de vida (173-27)
 * @see test/tenancy/ancla-branch-consistency.test.ts — disciplina de "nunca escribir el status" (173-11)
 * @see src/modules/shared/branch-consistency.ts — assertBranchDelGimnasio (D-05)
 * @see src/modules/shared/branch-access.ts — canAccessBranch / requireBranchAccess (D-14, el hallazgo de arriba)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, createStaffUser } from "../helpers";
import { normalizePhone } from "../../src/modules/shared/phone";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
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
  sembrarSocioTemplo,
  sembrarSociosGimnasioDos,
  limpiarSociosDeLaBateria,
  tenantDeLaFila,
  type FichaTemplo,
  type FichaGimnasioDos,
} from "../fixtures/members-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const MEMBERS_BASE = "/api/admin/members";
const LEADS_BASE = "/api/admin/leads";
const USERS_BASE = "/api/admin/users";

/** Contexto de escritura de cada gimnasio, para inserts directos de este archivo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** `branchId` que NO existe en absoluto — nunca colisiona con un id real (autoincrement chico). */
function branchIdInexistente(): number {
  return 900_000_000 + Math.floor(Math.random() * 1_000_000);
}

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Ciclo de vida (mismo criterio que 173-26/27) ───────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaTemplo;
let dos: FichaGimnasioDos;
/** Staff DEDICADO de El Templo (no `admin@test.com`): target ajeno de las 4 rutas de `/api/admin/users`. */
let temploStaffId: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Mismo orden obligado que 173-26/27 (ver docblock de members-gimnasio-dos.ts).
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarSocioTemplo(app);
  dos = await sembrarSociosGimnasioDos(app, gym2);

  // Staff dedicado de El Templo para las 4 rutas de /api/admin/users: NO
  // reusar admin@test.com — si alguna mutación de este archivo fallara de
  // verdad, tocar la fila semilla global rompería TODOS los demás archivos
  // del mismo worker (isolate: false).
  temploStaffId = await createStaffUser(app, {
    email: `staff-templo-${sufijo()}@test.com`,
    password: "pass123456",
    firstName: "StaffDedicado",
    lastName: "ElTemplo173",
    role: "admin",
    branchId: templo.branchId,
    country: "AR",
  });
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSociosDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

/** Como staff del gimnasio 2, rol `admin` (members/leads). */
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

/** Como el OWNER dedicado del gimnasio 2 (único rol que /api/admin/users acepta). */
async function comoOwnerGimnasioDos(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${dos.sepa.ownerToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

// ─── Mensajes compartidos ────────────────────────────────────────────────────

function porQueImporta(ruta: string, filaId: number): string {
  return (
    `${ruta} le dejo operar (o le devolvio datos) al staff del gimnasio ${TENANT_DOS} sobre la ` +
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

interface FotoDeUsuario {
  tenantId: number | null;
  firstName: string | null;
  dni: string | null;
  branchId: number | null;
  deletedAt: string | null;
  status: string | null;
  staffDisabled: boolean | null;
  leadNotes: string | null;
  purchasedPlanId: number | null;
}

/** Las columnas de `users` que importan para las 11 rutas, todas juntas. */
async function fotoDeUsuario(id: number): Promise<FotoDeUsuario> {
  const filas = await consultar<{
    tenant_id: number | null;
    first_name: string | null;
    dni: string | null;
    branch_id: number | null;
    deleted_at: string | null;
    status: string | null;
    staff_disabled: number | null;
    lead_notes: string | null;
    purchased_plan_id: number | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, first_name, dni, branch_id, deleted_at, status, staff_disabled, lead_notes, purchased_plan_id FROM users WHERE id = ${id}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return {
      tenantId: null,
      firstName: null,
      dni: null,
      branchId: null,
      deletedAt: null,
      status: null,
      staffDisabled: null,
      leadNotes: null,
      purchasedPlanId: null,
    };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    firstName: f.first_name,
    dni: f.dni,
    branchId: f.branch_id === null ? null : Number(f.branch_id),
    deletedAt: f.deleted_at === null ? null : String(f.deleted_at),
    status: f.status,
    staffDisabled: f.staff_disabled === null ? null : Boolean(f.staff_disabled),
    leadNotes: f.lead_notes,
    purchasedPlanId:
      f.purchased_plan_id === null ? null : Number(f.purchased_plan_id),
  };
}

/** Existe (por email exacto) una fila en `users`, sin filtrar por gimnasio. */
async function existeUsuarioConEmail(email: string): Promise<boolean> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar por email (sin filtro de gimnasio) es la asercion de "cero filas nuevas" — filtrar la volveria tautologica */ COUNT(*) AS c FROM users WHERE email = ${email}`,
  );
  return Number(filas[0]?.c ?? 0) > 0;
}

/** Cuenta filas de `user_branches` para un userId, sin filtrar por gimnasio. */
async function contarUserBranches(userId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar user_branches de un userId (sin filtro de gimnasio) es la asercion de "todo o nada" — filtrar la volveria tautologica */ COUNT(*) AS c FROM user_branches WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

/** La fila mas reciente de `user_status_history` para un userId (id + tenant_id). */
async function historialMasReciente(
  userId: number,
): Promise<{ id: number; tenantId: number } | null> {
  const filas = await consultar<{ id: number; tenant_id: number }>(
    sql`SELECT /* tenant-safe: leer el historial mas reciente de un userId recien creado ES la asercion de contenido; filtrarlo por gimnasio la volveria tautologica */ id, tenant_id FROM user_status_history WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  );
  const f = filas[0];
  return f === undefined ? null : { id: f.id, tenantId: Number(f.tenant_id) };
}

/** Resuelve un userId por email exacto, sin filtrar por gimnasio (para leer el id recien creado). */
async function idPorEmail(email: string): Promise<number | null> {
  const filas = await consultar<{ id: number }>(
    sql`SELECT /* tenant-safe: resolver el id de la fila recien creada por su email unico ES la precondicion del resto de la asercion */ id FROM users WHERE email = ${email} LIMIT 1`,
  );
  return filas[0] === undefined ? null : Number(filas[0].id);
}

/** Resuelve un userId por telefono exacto, sin filtrar por gimnasio. */
async function idPorTelefono(phone: string): Promise<number | null> {
  const filas = await consultar<{ id: number }>(
    sql`SELECT /* tenant-safe: resolver el id de la fila recien creada por su telefono unico ES la precondicion del resto de la asercion */ id FROM users WHERE phone = ${phone} LIMIT 1`,
  );
  return filas[0] === undefined ? null : Number(filas[0].id);
}

/**
 * Ejecuta la MISMA request con un branchId AJENO y con uno que directamente
 * NO EXISTE, y prueba que la respuesta es IDENTICA (status + `code` del
 * body, si lo tiene) — la indistinguibilidad que D-06 protege, ejercitada en
 * vez de asumida. Ver el hallazgo del docblock de cabecera. Nunca escribe el
 * status en un `expect(...).toBe(N)` literal para estas 4 rutas — la unica
 * aserción de valor concreto es que las DOS respuestas coinciden.
 */
async function mismaRespuestaQueSedeInexistente(
  hacerCon: (branchId: number) => Promise<{ statusCode: number; body: string }>,
  branchIdAjeno: number,
  ruta: string,
): Promise<{ statusCode: number; body: string }> {
  const conAjena = await hacerCon(branchIdAjeno);
  const conInexistente = await hacerCon(branchIdInexistente());
  const codigoDe = (body: string): unknown => {
    try {
      return (JSON.parse(body) as { code?: unknown }).code ?? null;
    } catch {
      return null;
    }
  };
  expect(
    [conAjena.statusCode, codigoDe(conAjena.body)],
    `${ruta}: la respuesta con un branchId AJENO tiene que ser IDENTICA a la respuesta con un ` +
      `branchId que directamente no existe (D-06, indistinguibilidad) — si difieren, la sede ajena ` +
      `es detectable desde afuera. Ajena: ${conAjena.statusCode} ${conAjena.body}. Inexistente: ` +
      `${conInexistente.statusCode} ${conInexistente.body}.`,
  ).toEqual([conInexistente.statusCode, codigoDe(conInexistente.body)]);
  expect(
    conAjena.statusCode,
    `${ruta}: un branchId ajeno no puede resultar en éxito (200/201) — ${conAjena.body}`,
  ).not.toBe(200);
  expect(
    conAjena.statusCode,
    `${ruta}: un branchId ajeno no puede resultar en éxito (200/201) — ${conAjena.body}`,
  ).not.toBe(201);
  return conAjena;
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes principales son del MISMO pais (el aislamiento no lo puede dar el country scope)", async () => {
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
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, templo.branchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      "Las dos sedes dejaron de compartir pais — este archivo prueba que el GIMNASIO aisla.",
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo y el gimnasio 2 tienen cada uno su socio vivo, en su propio gimnasio", async () => {
    expect(
      [
        await tenantDeLaFila(app, "users", templo.userId),
        await tenantDeLaFila(app, "users", dos.userId),
      ],
      "Alguna ficha no quedo en el gimnasio esperado — revisar sembrarSocioTemplo/sembrarSociosGimnasioDos.",
    ).toEqual([TENANT_TEMPLO, TENANT_DOS]);
  });

  it("el staff dedicado de El Templo (temploStaffId) nacio en El Templo, no en el gimnasio 2 por el DEFAULT 1", async () => {
    expect(await tenantDeLaFila(app, "users", temploStaffId)).toBe(
      TENANT_TEMPLO,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 1 — Altas, edicion y baja de socios, mas el PATCH de leads (6 rutas)
// ═══════════════════════════════════════════════════════════════════════════

describe("alta de socio — POST /api/admin/members", () => {
  const RUTA = "POST /api/admin/members";

  function payload(branchId: number, marca: string): Record<string, unknown> {
    return {
      email: `alta-${marca}@test.com`,
      firstName: "Alta173",
      lastName: "ControlDePunta",
      phone: `+549${String(Date.now()).slice(-9)}${marca.slice(-1)}`,
      dni: `ALT${marca}`,
      branchId,
    };
  }

  it("sede cruzada (ADO-07): un branchId de El Templo se rechaza y NO crea la fila", async () => {
    const marca = sufijo();
    const email = payload(templo.branchId, marca).email as string;
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const m = sufijo();
        const res = await comoGimnasioDos(
          "POST",
          `${MEMBERS_BASE}`,
          payload(branchId, m),
        );
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    expect(
      await existeUsuarioConEmail(email),
      `${RUTA}: el alta con un branchId ajeno no debe crear NINGUNA fila, ni siquiera con el email ` +
        `original del intento.`,
    ).toBe(false);
  });

  it("control (D-13 de la fase 172): el alta completa con recursos PROPIOS del gimnasio 2 funciona de punta a punta", async () => {
    const marca = sufijo();
    const datos = payload(gym2.branchId, marca);
    const res = await comoGimnasioDos("POST", `${MEMBERS_BASE}`, datos);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nuevoId = await idPorEmail(datos.email as string);
    expect(
      nuevoId,
      `${RUTA}: no se pudo resolver el id de la fila recien creada.`,
    ).not.toBeNull();
    const historial = await historialMasReciente(nuevoId as number);
    expect(
      [
        await tenantDeLaFila(app, "users", nuevoId as number),
        historial?.tenantId,
      ],
      `${RUTA}: el alta completa debe escribir TODAS sus filas (users + user_status_history) con el ` +
        `tenant_id del gimnasio 2 — esto es exactamente lo que el ancla autodestructiva de la fase ` +
        `172 (D-13) decia que no se podia escribir.`,
    ).toEqual([TENANT_DOS, TENANT_DOS]);
  });
});

describe("alta de sesion de prueba — POST /api/admin/members/trial", () => {
  const RUTA = "POST /api/admin/members/trial";

  function payload(branchId: number, marca: string): Record<string, unknown> {
    return {
      firstName: "Trial173",
      lastName: "ControlDePunta",
      phone: `+549${String(Date.now()).slice(-9)}${marca.slice(-1)}`,
      branchId,
    };
  }

  it("sede cruzada (ADO-07): un branchId de El Templo se rechaza y NO crea la fila", async () => {
    let telefonoDelIntento = "";
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const m = sufijo();
        const datos = payload(branchId, m);
        if (branchId === templo.branchId)
          telefonoDelIntento = datos.phone as string;
        const res = await comoGimnasioDos(
          "POST",
          `${MEMBERS_BASE}/trial`,
          datos,
        );
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    // `createTrialMember` normaliza el telefono (normalizePhone) antes de
    // insertarlo — buscar por el valor CRUDO del payload daria un falso
    // negativo (siempre null) que no probaria nada. Se busca por el valor
    // normalizado, igual que lo hace la produccion.
    expect(
      await idPorTelefono(normalizePhone(telefonoDelIntento)),
      `${RUTA}: el alta de sesion de prueba con un branchId ajeno no debe crear NINGUNA fila.`,
    ).toBeNull();
  });

  it("control: el alta de sesion de prueba con recursos PROPIOS del gimnasio 2 funciona", async () => {
    const datos = payload(gym2.branchId, sufijo());
    const res = await comoGimnasioDos("POST", `${MEMBERS_BASE}/trial`, datos);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nuevoId = await idPorTelefono(normalizePhone(datos.phone as string));
    expect(nuevoId).not.toBeNull();
    const historial = await historialMasReciente(nuevoId as number);
    expect(
      [
        await tenantDeLaFila(app, "users", nuevoId as number),
        historial?.tenantId,
      ],
      `${RUTA}: el alta de trial debe escribir users + user_status_history con el tenant_id del ` +
        `gimnasio 2.`,
    ).toEqual([TENANT_DOS, TENANT_DOS]);
  });
});

describe("convertir freemium a sesion de prueba — POST /api/admin/members/:userId/convert-to-trial", () => {
  const RUTA = "POST /api/admin/members/:userId/convert-to-trial";

  // templo.userId / dos.userId nacen 'freemium' (default de POST /auth/register,
  // que sembrarSocioTemplo/sembrarSociosGimnasioDos usan) — precondicion exacta
  // de esta ruta, sin necesidad de fixture dedicado.

  it("aislamiento: convertir a un socio de El Templo se rechaza, y su status NO cambia", async () => {
    const antes = await fotoDeUsuario(templo.userId);
    expect(
      antes.status,
      "Precondicion: el socio de El Templo tiene que ser freemium.",
    ).toBe("freemium");
    const res = await comoGimnasioDos(
      "POST",
      `${MEMBERS_BASE}/${templo.userId}/convert-to-trial`,
      { branchId: gym2.branchId },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(templo.userId);
    expect(
      [despues.tenantId, despues.status, despues.branchId],
      `${RUTA}: el rechazo no puede dejar cambios en la fila de El Templo.`,
    ).toEqual([antes.tenantId, antes.status, antes.branchId]);
  });

  it("sede cruzada (ADO-07): convertir al socio PROPIO con un branchId de El Templo se rechaza, y su status NO cambia", async () => {
    const antes = await fotoDeUsuario(dos.userId);
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const res = await comoGimnasioDos(
          "POST",
          `${MEMBERS_BASE}/${dos.userId}/convert-to-trial`,
          { branchId },
        );
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    const despues = await fotoDeUsuario(dos.userId);
    expect(
      [despues.tenantId, despues.status, despues.branchId],
      `${RUTA}: un branchId ajeno no puede dejar cambios en la fila propia — el socio tiene que ` +
        `seguir freemium, con su sede original.`,
    ).toEqual([antes.tenantId, antes.status, antes.branchId]);
  });

  it("control: convertir al socio propio del gimnasio 2 con su propia sede SI funciona", async () => {
    const res = await comoGimnasioDos(
      "POST",
      `${MEMBERS_BASE}/${dos.userId}/convert-to-trial`,
      { branchId: gym2.branchId },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeUsuario(dos.userId);
    expect(
      [despues.tenantId, despues.status],
      `${RUTA}: la conversion propia tiene que promover a 'prueba' sin cambiar de gimnasio.`,
    ).toEqual([TENANT_DOS, "prueba"]);
  });
});

describe("editar socio — PUT /api/admin/members/:userId", () => {
  const RUTA = "PUT /api/admin/members/:userId";

  it("aislamiento: editar un socio de El Templo se rechaza, y sus campos NO cambian", async () => {
    const antes = await fotoDeUsuario(templo.userId);
    const res = await comoGimnasioDos(
      "PUT",
      `${MEMBERS_BASE}/${templo.userId}`,
      {
        firstName: "Hackeado173",
      },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(templo.userId);
    expect(
      [despues.tenantId, despues.firstName],
      `${RUTA}: el rechazo no puede dejar cambios en la fila de El Templo.`,
    ).toEqual([antes.tenantId, antes.firstName]);
  });

  it("sede cruzada (ADO-07): editar al socio PROPIO con un branchId de El Templo se rechaza, y su sede NO cambia", async () => {
    const antes = await fotoDeUsuario(dos.userId);
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const res = await comoGimnasioDos(
          "PUT",
          `${MEMBERS_BASE}/${dos.userId}`,
          { branchId },
        );
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    const despues = await fotoDeUsuario(dos.userId);
    expect(
      [despues.tenantId, despues.branchId],
      `${RUTA}: un branchId ajeno no puede dejar cambios en la sede de la fila propia.`,
    ).toEqual([antes.tenantId, antes.branchId]);
  });

  it("control: editar al socio propio del gimnasio 2 SI funciona", async () => {
    const res = await comoGimnasioDos("PUT", `${MEMBERS_BASE}/${dos.userId}`, {
      firstName: "Editado173",
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeUsuario(dos.userId);
    expect([despues.tenantId, despues.firstName]).toEqual([
      TENANT_DOS,
      "Editado173",
    ]);
  });
});

describe("baja de socio — DELETE /api/admin/members/:userId", () => {
  const RUTA = "DELETE /api/admin/members/:userId";

  it("aislamiento: borrar un socio de El Templo se rechaza, y su deleted_at sigue en null", async () => {
    const antes = await fotoDeUsuario(templo.userId);
    expect(
      antes.deletedAt,
      "Precondicion: el socio de El Templo tiene que estar vivo.",
    ).toBeNull();
    const res = await comoGimnasioDos(
      "DELETE",
      `${MEMBERS_BASE}/${templo.userId}`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(templo.userId);
    expect(
      despues.deletedAt,
      `${RUTA}: el rechazo con 404 pero el socio de El Templo YA NO EXISTE — el rechazo no impidio ` +
        `la baja logica.`,
    ).toBeNull();
  });

  it("control: borrar al socio propio del gimnasio 2 SI funciona", async () => {
    const res = await comoGimnasioDos(
      "DELETE",
      `${MEMBERS_BASE}/${dos.userId}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.userId) + ` Respuesta: ${res.body}`,
    ).toBe(204);
    const despues = await fotoDeUsuario(dos.userId);
    expect(
      [despues.tenantId, despues.deletedAt !== null],
      `${RUTA}: la baja logica propia tiene que escribir deleted_at, sin cambiar de gimnasio.`,
    ).toEqual([TENANT_DOS, true]);
  });
});

describe("editar lead — PATCH /api/admin/leads/:userId", () => {
  const RUTA = "PATCH /api/admin/leads/:userId";

  // Esta ruta NO acepta `branchId` en el body (UpdateLeadInput solo tiene
  // leadStatus/leadNotes/purchasedPlanId — verificado leyendo types.ts/schemas.ts
  // antes de escribir este describe): el plan menciona esta ruta entre las "4
  // que aceptan branchId para el caso de sede cruzada", pero eso no corresponde
  // al codigo real — la correccion (documentada en el SUMMARY) es que la 4ta
  // ruta con branchId es POST /:userId/convert-to-trial (ver el describe de
  // arriba), no esta. El analogo cross-tenant que ESTA ruta si puede ejercer es
  // `purchasedPlanId`: tambien resuelve con `tenantWhere` y tambien es un
  // sitio donde D-06 aplica (un plan ajeno se rechaza igual que uno
  // inexistente, nunca con un status de "prohibido").
  let leadTemplo: number;
  let leadDos: number;
  let planTemplo: number;

  beforeEach(async () => {
    // Insert directo (status='prueba'): POST /auth/register ignora cualquier
    // `status` del body y siempre fuerza 'freemium' (verificado leyendo
    // src/modules/auth/routes.ts) — sin este insert directo no hay forma de
    // sembrar un lead real para El Templo via el helper de fixtures.
    const passwordHash =
      "$argon2id$v=19$m=4096,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const suf = sufijo();
    const [rowTemplo] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(CTX_TEMPLO, {
          email: `lead-templo-${suf}@test.com`,
          passwordHash,
          firstName: "LeadTemplo173",
          lastName: "Aislado173",
          phone: `+549${String(Date.now()).slice(-9)}1`,
          dni: `LDT${suf}`,
          role: "member" as const,
          branchId: templo.branchId,
          branchUpdatedAt: new Date(),
          branchSource: "manual" as const,
          level: "kairos" as const,
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        }),
      )
      .$returningId();
    leadTemplo = rowTemplo.id;

    const [rowDos] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(CTX_DOS, {
          email: `lead-dos-${suf}@test.com`,
          passwordHash,
          firstName: "LeadDos173",
          lastName: "Aislado173",
          phone: `+549${String(Date.now()).slice(-9)}2`,
          dni: `LDD${suf}`,
          role: "member" as const,
          branchId: gym2.branchId,
          branchUpdatedAt: new Date(),
          branchSource: "manual" as const,
          level: "kairos" as const,
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        }),
      )
      .$returningId();
    leadDos = rowDos.id;

    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values(
        tenantValues(CTX_TEMPLO, {
          name: `Plan de El Templo (ajeno) ${suf}`,
          planTier: "flex" as const,
          bookingMode: "flexible" as const,
          planCategory: "presencial" as const,
          priceRegular: 1000,
          priceZero: 500,
          durationDays: 30,
          classesPerWeek: 2,
        }),
      )
      .$returningId();
    planTemplo = plan.id;
  });

  it("aislamiento: editar un lead de El Templo se rechaza, y sus lead_notes NO cambian", async () => {
    const antes = await fotoDeUsuario(leadTemplo);
    const res = await comoGimnasioDos("PATCH", `${LEADS_BASE}/${leadTemplo}`, {
      leadNotes: "nota que no deberia poder escribirse",
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, leadTemplo) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(leadTemplo);
    expect(
      [despues.tenantId, despues.leadNotes],
      `${RUTA}: el rechazo no puede dejar cambios en el lead de El Templo.`,
    ).toEqual([antes.tenantId, antes.leadNotes]);
  });

  it("plan ajeno (analogo de sede cruzada — esta ruta no acepta branchId): un purchasedPlanId de El Templo se rechaza, y NO se persiste", async () => {
    const antes = await fotoDeUsuario(leadDos);
    const res = await comoGimnasioDos("PATCH", `${LEADS_BASE}/${leadDos}`, {
      purchasedPlanId: planTemplo,
    });
    expect(
      res.statusCode,
      `${RUTA}: un purchasedPlanId de OTRO gimnasio tiene que rechazarse (D-06: mismo criterio que ` +
        `una sede ajena) — un plan ajeno NUNCA se persiste. Respuesta: ${res.body}`,
    ).toBe(400);
    const despues = await fotoDeUsuario(leadDos);
    expect(
      [despues.tenantId, despues.purchasedPlanId],
      `${RUTA}: el rechazo del plan ajeno no puede dejar el purchasedPlanId seteado.`,
    ).toEqual([antes.tenantId, antes.purchasedPlanId]);
  });

  it("control: editar el lead propio del gimnasio 2 SI funciona", async () => {
    const res = await comoGimnasioDos("PATCH", `${LEADS_BASE}/${leadDos}`, {
      leadNotes: "nota actualizada por el control",
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, leadDos) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeUsuario(leadDos);
    expect([despues.tenantId, despues.leadNotes]).toEqual([
      TENANT_DOS,
      "nota actualizada por el control",
    ]);
  });
});

describe("iniciar seguimiento — POST /api/admin/leads/:userId/start-followup", () => {
  const RUTA = "POST /api/admin/leads/:userId/start-followup";

  let leadTemplo: number;
  let leadDos: number;

  // Sella users.trial_followup_started_at. Mismo criterio que el PATCH: el lead
  // de otro gimnasio es indistinguible de uno inexistente (D-06, 404), y el
  // sello NO puede persistir sobre el lead ajeno.
  async function followupDe(userId: number): Promise<Date | null> {
    const [row] = await app.db
      .select({ f: schema.users.trialFollowupStartedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return row?.f ?? null;
  }

  beforeEach(async () => {
    const passwordHash =
      "$argon2id$v=19$m=4096,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const suf = sufijo();
    const [rowTemplo] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(CTX_TEMPLO, {
          email: `sf-templo-${suf}@test.com`,
          passwordHash,
          firstName: "SegTemplo",
          lastName: "Aislado",
          phone: `+549${String(Date.now()).slice(-9)}3`,
          dni: `SFT${suf}`,
          role: "member" as const,
          branchId: templo.branchId,
          branchUpdatedAt: new Date(),
          branchSource: "manual" as const,
          level: "kairos" as const,
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        }),
      )
      .$returningId();
    leadTemplo = rowTemplo.id;

    const [rowDos] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(CTX_DOS, {
          email: `sf-dos-${suf}@test.com`,
          passwordHash,
          firstName: "SegDos",
          lastName: "Aislado",
          phone: `+549${String(Date.now()).slice(-9)}4`,
          dni: `SFD${suf}`,
          role: "member" as const,
          branchId: gym2.branchId,
          branchUpdatedAt: new Date(),
          branchSource: "manual" as const,
          level: "kairos" as const,
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        }),
      )
      .$returningId();
    leadDos = rowDos.id;
  });

  it("aislamiento: iniciar el seguimiento de un lead de El Templo se rechaza, y su followup NO se sella", async () => {
    const res = await comoGimnasioDos(
      "POST",
      `${LEADS_BASE}/${leadTemplo}/start-followup`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, leadTemplo) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await followupDe(leadTemplo),
      `${RUTA}: el rechazo no puede sellar el seguimiento del lead ajeno.`,
    ).toBeNull();
  });

  it("control: iniciar el seguimiento del lead propio del gimnasio 2 SI funciona", async () => {
    const res = await comoGimnasioDos(
      "POST",
      `${LEADS_BASE}/${leadDos}/start-followup`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, leadDos) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await followupDe(leadDos),
      `${RUTA}: el control positivo tiene que sellar el followup del lead propio.`,
    ).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 2 — Las 5 rutas de staff (/api/admin/users)
// ═══════════════════════════════════════════════════════════════════════════

describe("listado de staff — GET /api/admin/users", () => {
  const RUTA = "GET /api/admin/users";

  it("aislamiento: el listado del gimnasio 2 NO puede contener staff de El Templo (barrido leyendo la base)", async () => {
    const res = await comoOwnerGimnasioDos("GET", USERS_BASE);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number }>;
    expect(
      body.map((r) => r.id),
      porQueImporta(RUTA, temploStaffId),
    ).not.toContain(temploStaffId);
    for (const row of body) {
      expect(
        await tenantDeLaFila(app, "users", row.id),
        porQueImporta(RUTA, row.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el listado del gimnasio 2 SI trae a su propio staff", async () => {
    const res = await comoOwnerGimnasioDos("GET", USERS_BASE);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number }>;
    expect(
      body.map((r) => r.id),
      porQueImportaElControl(RUTA, gym2.adminId),
    ).toContain(gym2.adminId);
    expect(
      body.map((r) => r.id),
      porQueImportaElControl(RUTA, gym2.coachId),
    ).toContain(gym2.coachId);
  });

  it("ancla: filtrar por una sede de El Templo (?branchId=) devuelve lista VACIA, nunca las filas ajenas ni un status de prohibido", async () => {
    const res = await comoOwnerGimnasioDos(
      "GET",
      `${USERS_BASE}?branchId=${templo.branchId}`,
    );
    expect(
      res.statusCode,
      `${RUTA}?branchId=<ajena> tiene que dar 200 con lista vacia (D-06), nunca un status de ` +
        `"prohibido". Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number }>;
    expect(
      body,
      `${RUTA}?branchId=<ajena> devolvio filas en vez de una lista vacia.`,
    ).toEqual([]);
  });
});

describe("alta de staff — POST /api/admin/users", () => {
  const RUTA = "POST /api/admin/users";

  it("sede cruzada (ADO-07): branchId de El Templo se rechaza, y CERO filas nuevas en users", async () => {
    const marca = sufijo();
    const email = `alta-staff-${marca}@test.com`;
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const m = sufijo();
        const res = await comoOwnerGimnasioDos("POST", USERS_BASE, {
          email:
            branchId === templo.branchId ? email : `alta-staff-${m}@test.com`,
          password: "pass123456",
          firstName: "AltaStaff173",
          lastName: "SedeCruzada",
          role: "coach",
          branchId,
          branchIds: [branchId],
        });
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    expect(
      await existeUsuarioConEmail(email),
      `${RUTA}: el alta de staff con un branchId ajeno no debe crear NINGUNA fila.`,
    ).toBe(false);
  });

  it("branchIds[] MIXTO (una sede propia + una de El Templo): la operacion se rechaza ENTERA, sin guardar la mitad (T-173-13-02)", async () => {
    const email = `alta-staff-mixto-${sufijo()}@test.com`;
    const antesUsers = await existeUsuarioConEmail(email);
    expect(antesUsers).toBe(false);
    const res = await comoOwnerGimnasioDos("POST", USERS_BASE, {
      email,
      password: "pass123456",
      firstName: "Mixto173",
      lastName: "BranchIds",
      role: "coach",
      branchId: gym2.branchId,
      branchIds: [gym2.branchId, templo.branchId],
    });
    expect(
      res.statusCode,
      `${RUTA}: una lista de sedes con UNA sede ajena tiene que rechazar la operacion ENTERA — ` +
        `filtrar en silencio dejaria al operador creyendo que guardo 2 sedes cuando guardo 1. ` +
        `Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await existeUsuarioConEmail(email),
      `${RUTA}: el rechazo del branchIds[] mixto no puede dejar creada la fila de users.`,
    ).toBe(false);
    const nuevoId = await idPorEmail(email);
    expect(
      nuevoId === null ? 0 : await contarUserBranches(nuevoId),
      `${RUTA}: el rechazo del branchIds[] mixto no puede dejar NINGUNA fila en user_branches.`,
    ).toBe(0);
  });

  it("control: el alta de staff con recursos PROPIOS del gimnasio 2 (branchId + branchIds[] validos) funciona", async () => {
    const email = `alta-staff-control-${sufijo()}@test.com`;
    const res = await comoOwnerGimnasioDos("POST", USERS_BASE, {
      email,
      password: "pass123456",
      firstName: "Control173",
      lastName: "Staff",
      role: "coach",
      branchId: gym2.branchId,
      branchIds: [gym2.branchId],
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nuevoId = await idPorEmail(email);
    expect(nuevoId).not.toBeNull();
    expect(
      [
        await tenantDeLaFila(app, "users", nuevoId as number),
        await contarUserBranches(nuevoId as number),
      ],
      `${RUTA}: el alta propia tiene que escribir users Y user_branches con el tenant_id del ` +
        `gimnasio 2.`,
    ).toEqual([TENANT_DOS, 1]);
  });
});

describe("editar staff — PUT /api/admin/users/:userId", () => {
  const RUTA = "PUT /api/admin/users/:userId";

  it("aislamiento: editar un staff de El Templo se rechaza, y sus campos NO cambian", async () => {
    const antes = await fotoDeUsuario(temploStaffId);
    const res = await comoOwnerGimnasioDos(
      "PUT",
      `${USERS_BASE}/${temploStaffId}`,
      {
        firstName: "Hackeado173Staff",
      },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, temploStaffId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(temploStaffId);
    expect(
      [despues.tenantId, despues.firstName],
      `${RUTA}: el rechazo no puede dejar cambios en el staff de El Templo.`,
    ).toEqual([antes.tenantId, antes.firstName]);
  });

  it("sede cruzada (ADO-07): editar al staff PROPIO con un branchId de El Templo se rechaza, y su sede NO cambia", async () => {
    const antes = await fotoDeUsuario(gym2.coachId);
    await mismaRespuestaQueSedeInexistente(
      async (branchId) => {
        const res = await comoOwnerGimnasioDos(
          "PUT",
          `${USERS_BASE}/${gym2.coachId}`,
          { branchId },
        );
        return { statusCode: res.statusCode, body: res.body };
      },
      templo.branchId,
      RUTA,
    );
    const despues = await fotoDeUsuario(gym2.coachId);
    expect(
      [despues.tenantId, despues.branchId],
      `${RUTA}: un branchId ajeno no puede dejar cambios en la sede del staff propio.`,
    ).toEqual([antes.tenantId, antes.branchId]);
  });

  it("control: editar al staff propio del gimnasio 2 SI funciona", async () => {
    const res = await comoOwnerGimnasioDos(
      "PUT",
      `${USERS_BASE}/${gym2.coachId}`,
      {
        firstName: "EditadoStaff173",
      },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.coachId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeUsuario(gym2.coachId);
    expect([despues.tenantId, despues.firstName]).toEqual([
      TENANT_DOS,
      "EditadoStaff173",
    ]);
  });
});

describe("cambiar estado de staff — PATCH /api/admin/users/:userId/status", () => {
  const RUTA = "PATCH /api/admin/users/:userId/status";

  it("aislamiento: deshabilitar un staff de El Templo se rechaza, y staff_disabled NO cambia", async () => {
    const antes = await fotoDeUsuario(temploStaffId);
    expect(
      antes.staffDisabled,
      "Precondicion: el staff de El Templo empieza habilitado.",
    ).toBe(false);
    const res = await comoOwnerGimnasioDos(
      "PATCH",
      `${USERS_BASE}/${temploStaffId}/status`,
      {
        disabled: true,
      },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, temploStaffId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeUsuario(temploStaffId);
    expect(
      [despues.tenantId, despues.staffDisabled],
      `${RUTA}: el rechazo no puede dejar cambios en el staff de El Templo.`,
    ).toEqual([antes.tenantId, false]);
  });

  it("control: deshabilitar al staff propio del gimnasio 2 SI funciona", async () => {
    const res = await comoOwnerGimnasioDos(
      "PATCH",
      `${USERS_BASE}/${gym2.coachId}/status`,
      {
        disabled: true,
      },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.coachId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeUsuario(gym2.coachId);
    expect([despues.tenantId, despues.staffDisabled]).toEqual([
      TENANT_DOS,
      true,
    ]);
  });
});

// NOTA (fase 176 plan 11): el describe de
// `POST /api/admin/users/:userId/program-addons` que vivía acá se removió.
// La ruta se reclasificó de `tenant-scoped` a `templo-module`/
// `templo-training` en el plan 176-05 (moduleScope ya la gateaba en
// runtime — lo desactualizado era el manifiesto), así que dejó de
// pertenecer a la batería ISO-03 de members. Su aislamiento + control
// positivo se reubicó, sembrando el flag `templo-training` del gimnasio 2,
// en test/tenancy/iso-03-programs-modulo.test.ts — sin pérdida de
// cobertura. Ver también el ajuste de baseline en
// iso-03-cobertura-members.test.ts (30 → 29).
