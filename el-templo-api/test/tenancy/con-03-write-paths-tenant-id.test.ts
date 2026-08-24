/**
 * Fase 169 Plan 08 (CON-03): el `tenant_id` no entra por el borde.
 *
 * QUÉ PRUEBA ESTE ARCHIVO
 * -----------------------
 * Dos cosas distintas, en dos `describe` separados:
 *
 * 1. **Guard de mass-assignment (D-08).** Los 6 —y únicos— sitios de `src/`
 *    que spreadean el body de un request enumeran su superficie con
 *    `additionalProperties: false`. El guard importa los 6 objetos de schema y
 *    lo afirma. Es la mitigación de la REGRESIÓN, no del bug: la auditoría de
 *    la fase 169 encontró el repo casi limpio, y lo que faltaba era algo que
 *    se pusiera rojo cuando alguien lo aflojara.
 *
 * 2. **Batería D-09** (agregada por el Task 2 de este mismo plan): mandar
 *    `tenantId` en el body de una ruta de escritura clave no cambia el
 *    `tenant_id` de la fila creada.
 *
 * POR QUÉ EL GUARD ES POR IMPORT Y NO POR GREP
 * --------------------------------------------
 * Un `grep -c 'additionalProperties: false'` sobre el archivo del schema da
 * verde de mentira por dos caminos independientes:
 *
 *   (a) cuenta la palabra cuando aparece en un COMENTARIO — y estos schemas
 *       están llenos de comentarios que explican por qué el body va cerrado
 *       (incluido el docblock que este mismo plan le agregó a
 *       `createMemberSchema`);
 *   (b) cuenta la palabra cuando está en un SUB-SCHEMA anidado y no en la raíz
 *       del `body`. `createTransactionSchema` y `createCampaignSchema` tienen
 *       las dos cosas: un `additionalProperties: false` adentro de
 *       `links.items` / `copySlots` y otro en la raíz. Un grep no distingue
 *       cuál de los dos encontró, y el que importa es el de la raíz: es el que
 *       acota lo que el handler spreadea.
 *
 * Importar el objeto y leer `body.additionalProperties` es la única forma de
 * afirmar exactamente la propiedad que protege el spread.
 *
 * QUÉ HACER CUANDO ESTE GUARD SE CAIGA
 * ------------------------------------
 * **No borrar la aserción ni sumar el schema a una excepción.** El fallo dice
 * que una ruta que spreadea su body dejó de acotar qué acepta. Decidir
 * conscientemente:
 *
 *   - Si esa ruta NO puede aceptar propiedades libres (el caso normal):
 *     devolver el `additionalProperties: false` a la raíz de su `body`.
 *   - Si de verdad tiene que aceptarlas: entonces **dejar de spreadear el
 *     body** en el handler y enumerar los campos que el service necesita. Un
 *     body abierto y un spread son compatibles de a uno, nunca juntos.
 *
 * Si aparece un sitio de spread NUEVO que no está en la tabla de abajo, va al
 * guard con su schema. La tabla es el inventario conocido, no un límite.
 *
 * REGLA DEL MILESTONE QUE ESTO DEFIENDE
 * -------------------------------------
 * `src/db/schema/tenant-column.ts:11-16`: el valor de `tenant_id` SALE SIEMPRE
 * DEL SERVIDOR (`scope.tenantId` / `TenantContext`), JAMÁS de un payload, de
 * una query string ni del JWT. Mismo contrato que el precedente de
 * `members/routes.ts:766` ("Phase 114 D-31: createdBy comes from the JWT,
 * never the request body"), un escalón más arriba.
 *
 * Este `describe` NO toca la base de datos: es introspección de objetos
 * importados. Corre igual bajo el `setupFiles` del repo (que provisiona la DB
 * por worker para TODO archivo de test).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  ensureEfectivoCaja,
} from "../helpers";
import {
  createMemberSchema,
  createTrialMemberSchema,
} from "../../src/modules/members/schemas";
import { rescheduleTrialSchema } from "../../src/modules/scheduling/schemas";
import { createTransactionSchema } from "../../src/modules/finance/schemas";
import { createCampaignSchema } from "../../src/modules/campaigns/schemas";
import { createProductSchema } from "../../src/modules/gladius/routes";

/**
 * Forma mínima que el guard necesita ver de un body-schema.
 *
 * `additionalProperties` es OPCIONAL y `unknown` a propósito: así un schema
 * que no la declare compila igual y la aserción es la que lo rechaza
 * (`undefined !== false`). Tiparlo como `false` obligatorio movería el fallo
 * al compilador, que suena mejor pero es peor: `tsc` no corre en el mismo gate
 * que la suite y el mensaje sería "no asignable" en vez de "el sitio X quedó
 * abierto".
 */
type BodySchema = {
  readonly body: { readonly additionalProperties?: unknown };
};

/**
 * Inventario D-08 — los 6 sitios de `src/` que spreadean el body de un
 * request, con el schema que los protege.
 *
 * Verificado sobre el worktree de la fase con
 * `grep -rn "\.\.\.request\.body" --include=*.ts src/`, que da exactamente
 * estos 6. El `<verify>` del plan 169-08 exige que ese conteo siga siendo 6:
 * un sitio nuevo rompe el plan y obliga a decidir en vez de colarse.
 */
const SITIOS_QUE_SPREADEAN_EL_BODY: ReadonlyArray<{
  schemaName: string;
  spreadSite: string;
  schema: BodySchema;
}> = [
  {
    schemaName: "createMemberSchema",
    spreadSite:
      "src/modules/members/routes.ts:650-655 — createMember({ ...request.body, createdBy, referredBy })",
    schema: createMemberSchema,
  },
  {
    schemaName: "createTrialMemberSchema",
    spreadSite:
      "src/modules/members/routes.ts:765-768 — createTrialMember({ ...request.body, createdBy })",
    schema: createTrialMemberSchema,
  },
  {
    schemaName: "rescheduleTrialSchema",
    spreadSite:
      "src/modules/scheduling/routes.ts:635-638 — rescheduleTrial({ bookingId, ...request.body })",
    schema: rescheduleTrialSchema,
  },
  {
    schemaName: "createTransactionSchema",
    spreadSite:
      "src/modules/finance/routes.ts:310 — transactionService.create({ ...request.body, validationStatus })",
    schema: createTransactionSchema,
  },
  {
    schemaName: "createCampaignSchema",
    spreadSite:
      "src/modules/campaigns/routes.ts:187 — service.create({ ...request.body, country })",
    schema: createCampaignSchema,
  },
  {
    schemaName: "createProductSchema",
    spreadSite:
      "src/modules/gladius/routes.ts:185-188 — createProduct({ ...request.body, country })",
    schema: createProductSchema,
  },
];

describe("guard de mass-assignment (D-08)", () => {
  it.each(SITIOS_QUE_SPREADEAN_EL_BODY)(
    "$schemaName acota su body con additionalProperties: false",
    ({ schemaName, spreadSite, schema }) => {
      expect(
        schema.body.additionalProperties,
        `${schemaName} dejó de declarar \`additionalProperties: false\` en la RAÍZ de su body, ` +
          `y ese schema es lo único que acota el spread de ${spreadSite}. ` +
          `Con el body abierto, una propiedad desconocida —\`tenantId\` la primera— viaja entera ` +
          `hasta el service. Regla del milestone: el gimnasio sale SIEMPRE del servidor, jamás del ` +
          `payload (src/db/schema/tenant-column.ts:11-16). ` +
          `Arreglo: devolvele el \`additionalProperties: false\` a la raíz del body, o —si esa ruta ` +
          `de verdad tiene que aceptar propiedades libres— dejá de spreadear el body en el handler ` +
          `y enumerá los campos. No borres esta aserción.`,
      ).toBe(false);
    },
  );

  it("el inventario cubre los 6 sitios de spread conocidos", () => {
    // Sanity del propio guard: si alguien borra una entrada de la tabla, el
    // `it.each` de arriba simplemente corre una vez menos y nadie se entera.
    // Este conteo es lo que hace ruidosa esa pérdida.
    expect(
      SITIOS_QUE_SPREADEAN_EL_BODY.length,
      "El inventario D-08 dejó de tener 6 entradas. Si aparecio un sitio de spread nuevo " +
        "(`grep -rn '\\.\\.\\.request\\.body' --include=*.ts src/`), sumalo acá con su schema. " +
        "Si desaparecio uno, sacalo — pero verificá primero que la ruta haya dejado de spreadear " +
        "el body y no que alguien haya borrado la entrada para que el guard deje de molestar.",
    ).toBe(6);

    const nombres = SITIOS_QUE_SPREADEAN_EL_BODY.map((s) => s.schemaName);
    expect(
      new Set(nombres).size,
      "hay schemas repetidos en el inventario",
    ).toBe(nombres.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Batería D-09 — el tenant no viene del borde
// ═══════════════════════════════════════════════════════════════════════════
//
// ALCANCE: ESTA BATERÍA ES REPRESENTATIVA, NO EXHAUSTIVA (D-09)
// -------------------------------------------------------------
// Son 5 rutas de escritura, una por módulo crítico, elegidas por riesgo real
// de mass-assignment: cubren los 3 sitios de spread del inventario de arriba
// que CREAN filas (#1, #2 y #4) más las dos escrituras core que no spreadean.
// **No es una promesa de cobertura total de las rutas de escritura del repo.**
// El barrido del 100% llega con el manifiesto de rutas de la fase 171 y la
// batería de aislamiento ISO-03 de la 172; cada fase de adopción (172-175)
// extiende esto a su módulo. Leer este archivo como "las rutas de escritura
// están cubiertas" sería leerlo mal.
//
// LO QUE HACE QUE ESTA BATERÍA VALGA ALGO (T-168-15 + el tenant inexistente)
// --------------------------------------------------------------------------
// Tres cuidados, y sin los tres el archivo pasaría en verde probando nada:
//
//  1. **El tenant spoofeado EXISTE.** `tenant_id` tiene una FK a `tenants`: si
//     se mandara un id inventado, la fila nacería igual en 1 —pero porque
//     MySQL habría rechazado el valor, no porque el código lo ignore—. El
//     `beforeAll` siembra el gimnasio 90369 justamente para que el valor
//     spoofeado sea ACEPTABLE por la base y el único motivo posible de que no
//     aparezca sea que el código nunca lo miró.
//  2. **Las aserciones van por `SELECT tenant_id ... WHERE id = ?` sobre la
//     fila realmente creada**, nunca contra el body de la respuesta: ningún
//     schema de respuesta expone `tenant_id` (ni debe), así que afirmar sobre
//     el JSON sería afirmar sobre nada.
//  3. **Cada ruta se ejercita DOS veces**, con y sin el campo spoofeado. El
//     par de control es lo que distingue "la ruta ignoró el valor" de "esta
//     ruta nunca escribe tenant y la columna cayó en su DEFAULT las dos
//     veces". Las dos filas tienen que nacer en el gimnasio 1.
//
// POR QUÉ LAS 5 RUTAS NO SON EL MISMO TEST CINCO VECES
// ----------------------------------------------------
// El payload spoofeado muere en dos lugares distintos según la ruta, y las dos
// muertes son evidencia de cosas distintas:
//
//  - `POST /api/admin/members`, `/members/trial` y `/finance/transactions`
//    tienen `additionalProperties: false` (el primero desde este mismo plan),
//    así que ajv —que Fastify compila con `removeAdditional: true`— strippea
//    el `tenantId` ANTES del handler. Es el guard de arriba, probado de punta
//    a punta en vez de por introspección.
//  - `assignPlanSchema` y `reserveSchema` tienen el body ABIERTO (no están en
//    el inventario D-08 porque sus handlers no spreadean el body). Ahí el
//    `tenantId` spoofeado llega de verdad hasta `request.body` y el handler lo
//    ignora porque enumera los campos que le pasa al service. Estos dos son la
//    evidencia más fuerte de la batería: prueban el contrato incluso donde el
//    transporte no lo defiende.

/** El Templo. Existe siempre (migración 0190). Este archivo NUNCA lo borra. */
const TENANT_TEMPLO = 1;

/**
 * Id alto y propio de este archivo. Los otros de la fase están tomados: 90169
 * (tenant-helpers), 90269 (con-04 crons), 90469 (webhook), 90569 (tv-pairing),
 * 90168 (con-01 de la fase 168). Dos archivos con el mismo id se pisan porque
 * vitest corre con `isolate: false`.
 */
const TENANT_SPOOF = 90369;

/**
 * "Ahora" pinneado a un miércoles: la ventana de reserva del socio es de +2
 * días, así que la clase del jueves siguiente es un slot futuro válido. Mismo
 * fixture que `test/scheduling-reserve-coverage.test.ts`.
 */
const AHORA = new Date("2026-03-11T10:00:00Z");
const HOY = "2026-03-11";
const FECHA_CLASE = "2026-03-12";
const FIN_COBERTURA = "2026-04-30";

/** Tablas cuya fila creada inspecciona esta batería. */
type TablaInspeccionada =
  | "users"
  | "financial_transactions"
  | "subscriptions"
  | "bookings";

let app: FastifyInstance;
let adminToken: string;
let branchId: number;
let planId: number;
let scheduleId: number;
let secuencia = 0;

/** Sufijo único por llamada: emails y DNIs no pueden repetirse entre casos. */
function unico(): string {
  secuencia += 1;
  return `${secuencia}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Lee el `tenant_id` REAL de una fila. SQL crudo a propósito: el punto es
 * mirar la columna en la base, no lo que el ORM o el schema de respuesta
 * digan de ella.
 *
 * El nombre de la tabla entra por `sql.raw` porque no se puede parametrizar
 * un identificador — es seguro porque `TablaInspeccionada` es una unión
 * cerrada de literales y `tsc` rechaza cualquier otra cosa. El id SÍ va
 * parametrizado.
 *
 * Fase 172: `financial_transactions` está en la unión y es tabla strict, así que
 * este SELECT hace throw sin anotación. La exención `tenant-safe:` va EMBEBIDA
 * en el SQL (único canal que el sentinel lee) y es la salida correcta, no un
 * escape: filtrar por `tenant_id` acá volvería la aserción TAUTOLÓGICA — el test
 * pregunta justamente "¿en qué gimnasio nació esta fila?" y una query que ya
 * asume la respuesta no prueba nada.
 */
async function tenantDeLaFila(
  tabla: TablaInspeccionada,
  filaId: number,
): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el volveria el test tautologico */ tenant_id AS tenantId FROM ${sql.raw(tabla)} WHERE id = ${filaId}`,
  )) as unknown as [Array<{ tenantId: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ tenantId: number }>);
  if (filas.length === 0) {
    throw new Error(
      `${tabla}#${filaId} no existe: la ruta devolvió un id que no corresponde a ninguna fila`,
    );
  }
  return Number(filas[0].tenantId);
}

/**
 * Aserción central de la batería. El mensaje nombra el gimnasio encontrado y
 * explica qué significa el fallo, porque un `expected 90369 to be 1` pelado no
 * le dice a nadie que acaba de abrirse un agujero de aislamiento.
 */
async function afirmarQueNacioEnElTemplo(
  tabla: TablaInspeccionada,
  filaId: number,
  comoSeCreo: string,
): Promise<void> {
  // Precondición, no decoración: si el gimnasio spoofeado no existiera en este
  // momento, la aserción de abajo pasaría en verde por la FK y no por el
  // código. Se chequea en CADA caso, no una sola vez al principio.
  expect(
    await contarTenantSpoof(),
    `el gimnasio ${TENANT_SPOOF} desapareció de la base antes de esta aserción: ` +
      `sin él, "la fila nació en 1" lo garantiza la FK y no el código, y este test no prueba nada`,
  ).toBe(1);

  const encontrado = await tenantDeLaFila(tabla, filaId);
  expect(
    encontrado,
    `La fila ${tabla}#${filaId} (${comoSeCreo}) nació en el gimnasio ${encontrado} ` +
      `en vez del ${TENANT_TEMPLO}. Si es ${TENANT_SPOOF}, el \`tenant_id\` se está tomando ` +
      `del BODY del request: el cliente eligió en qué gimnasio escribir. La regla del ` +
      `milestone es que el gimnasio sale SIEMPRE del scope server-side ` +
      `(src/db/schema/tenant-column.ts:11-16), jamás de un payload, de una query string ` +
      `ni del JWT. Arreglo: que el handler deje de propagar ese campo y que el INSERT ` +
      `pase por \`tenantValues(scope, ...)\`.`,
  ).toBe(TENANT_TEMPLO);
}

/** Borra el gimnasio de prueba. Idempotente; corre defensivo y al final. */
async function borrarTenantSpoof(): Promise<void> {
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SPOOF}`);
}

async function contarTenantSpoof(): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${TENANT_SPOOF}`,
  )) as unknown as [Array<{ n: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}

// ─── Ejercicio de las 5 rutas ────────────────────────────────────────────────
// Cada helper recibe `spoof`, que es `{}` en el caso de control y
// `{ tenantId: TENANT_SPOOF }` en el otro. Va SIEMPRE último en el spread del
// payload: si fuera primero, un campo homónimo del payload base lo pisaría y
// el test spoofearía nada.

async function altaDeSocio(spoof: Record<string, unknown>): Promise<number> {
  const suf = unico();
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: `alta-169-08-${suf}@test.local`,
      firstName: "Alta",
      lastName: "Asistida",
      phone: "1122334455",
      dni: `${40000000 + secuencia}`,
      branchId,
      ...spoof,
    },
  });
  expect(res.statusCode, `alta de socio falló: ${res.body}`).toBe(201);
  return JSON.parse(res.body).id as number;
}

async function altaDeLeadDePrueba(
  spoof: Record<string, unknown>,
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/members/trial",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      firstName: "Lead",
      lastName: `Prueba${unico()}`,
      phone: "1133445566",
      branchId,
      ...spoof,
    },
  });
  expect(res.statusCode, `alta de lead de prueba falló: ${res.body}`).toBe(201);
  return JSON.parse(res.body).id as number;
}

/** Socio con login propio; sin suscripción salvo que se pida. */
async function crearSocio(): Promise<{ userId: number; token: string }> {
  const email = `socio-169-08-${unico()}@test.local`;
  const result = await registerUser(app, {
    email,
    password: "pass123456",
    firstName: "Socio",
    lastName: "Test",
    branchId,
  });
  const userId = (result.user as { id: number }).id;
  const token = await getAuthToken(app, email, "pass123456");
  return { userId, token };
}

/** Suscripción insertada directo: los tests que la necesitan como PREvia. */
async function insertarSuscripcion(userId: number): Promise<number> {
  const [fila] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId,
      branchId,
      status: "active",
      startDate: HOY,
      endDate: FIN_COBERTURA,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return fila.id;
}

async function cobro(spoof: Record<string, unknown>): Promise<number> {
  const { userId } = await crearSocio();
  const subId = await insertarSuscripcion(userId);
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/finance/transactions",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      memberId: userId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: HOY,
      effectiveDate: HOY,
      branchId,
      notes: null,
      links: [
        {
          targetKind: "subscription",
          targetId: subId,
          allocatedAmount: 10000,
        },
      ],
      ...spoof,
    },
  });
  expect(res.statusCode, `cobro falló: ${res.body}`).toBe(201);
  return (JSON.parse(res.body).transaction as { id: number }).id;
}

async function asignacionDePlan(
  spoof: Record<string, unknown>,
): Promise<number> {
  const { userId } = await crearSocio();
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId,
      startDate: HOY,
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...spoof,
    },
  });
  expect(res.statusCode, `asignación de plan falló: ${res.body}`).toBe(201);
  return JSON.parse(res.body).id as number;
}

async function reserva(spoof: Record<string, unknown>): Promise<number> {
  const { userId, token } = await crearSocio();
  await insertarSuscripcion(userId);
  const res = await app.inject({
    method: "POST",
    url: "/api/members/scheduling/reserve",
    headers: { authorization: `Bearer ${token}` },
    payload: { scheduleId, date: FECHA_CLASE, ...spoof },
  });
  expect(res.statusCode, `reserva falló: ${res.body}`).toBe(201);
  return JSON.parse(res.body).id as number;
}

describe("batería D-09 — el tenant no viene del borde", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AHORA);

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    branchId = branch.id;
    // El cobro en efectivo resuelve su caja por sede y explota si no hay.
    await ensureEfectivoCaja(app, branchId);

    // El gimnasio spoofeado tiene que EXISTIR antes del primer request: si no,
    // la FK `tenant_id` rechazaría el valor y las filas nacerían en 1 por
    // MySQL en vez de por el código — el archivo entero pasaría en verde sin
    // probar nada (T-168-15, y la lección que dejaron los planes 169-05/06).
    await borrarTenantSpoof();
    await app.db.insert(schema.tenants).values({
      id: TENANT_SPOOF,
      name: "Gimnasio spoofeado 169-08",
      slug: `test-169-08-write-paths-${TENANT_SPOOF}`,
      status: "active",
    });
  });

  afterEach(async () => {
    // Red incondicional del patrón de la fase: pase lo que pase en un test, el
    // worker sigue con El Templo operativo. Este archivo no suspende a nadie,
    // pero dejar el gimnasio 1 en un estado raro rompería TODOS los archivos
    // siguientes del worker (`isolate: false`) y el síntoma aparecería lejos.
    await app.db.execute(
      sql`UPDATE tenants SET status = 'active' WHERE id = ${TENANT_TEMPLO}`,
    );
  });

  afterAll(async () => {
    // La limpieza va ANTES del borrado del gimnasio: si un test hubiera
    // fallado escribiendo una fila en el 90369, la FK impediría borrarlo y el
    // error de limpieza taparía el fallo real.
    await cleanAllTestData(app);
    await borrarTenantSpoof();
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Plan + actividad + horario se recrean por test: `cleanAllTestData` borra
    // planes, actividades y schedules.
    const planRes = await app.inject({
      method: "POST",
      url: "/api/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Flex 169-08",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
      },
    });
    expect(planRes.statusCode, `seed plan: ${planRes.body}`).toBe(201);
    planId = JSON.parse(planRes.body).id as number;

    const actividadRes = await app.inject({
      method: "POST",
      url: "/api/admin/scheduling/activities",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia 169-08", description: "Clase grupal" },
    });
    expect(
      actividadRes.statusCode,
      `seed actividad: ${actividadRes.body}`,
    ).toBe(201);
    const actividadId = JSON.parse(actividadRes.body).id as number;

    const horarioRes = await app.inject({
      method: "POST",
      url: "/api/admin/scheduling/schedules",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId,
        activityId: actividadId,
        dayOfWeek: 4, // jueves ISO — el +1d del "ahora" pinneado
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    expect(horarioRes.statusCode, `seed horario: ${horarioRes.body}`).toBe(201);
    scheduleId = JSON.parse(horarioRes.body).id as number;
  });

  it("el gimnasio spoofeado existe de verdad en la base", async () => {
    // Sin esto, todo lo de abajo es indistinguible de "la FK lo rechazó".
    expect(
      await contarTenantSpoof(),
      `el gimnasio ${TENANT_SPOOF} no está sembrado: los tests de abajo pasarían en verde ` +
        `porque la FK rechaza el valor, no porque el código lo ignore`,
    ).toBe(1);
  });

  describe("alta de socio asistida — POST /api/admin/members (spread #1)", () => {
    it("con tenantId spoofeado en el body, el socio igual nace en El Templo", async () => {
      const id = await altaDeSocio({ tenantId: TENANT_SPOOF });
      await afirmarQueNacioEnElTemplo(
        "users",
        id,
        `alta asistida con tenantId: ${TENANT_SPOOF} en el body`,
      );
    });

    it("control: sin el campo spoofeado nace en El Templo igual", async () => {
      const id = await altaDeSocio({});
      await afirmarQueNacioEnElTemplo("users", id, "alta asistida sin spoofeo");
    });
  });

  describe("alta de lead de prueba — POST /api/admin/members/trial (spread #2)", () => {
    it("con tenantId spoofeado en el body, el lead igual nace en El Templo", async () => {
      const id = await altaDeLeadDePrueba({ tenantId: TENANT_SPOOF });
      await afirmarQueNacioEnElTemplo(
        "users",
        id,
        `alta de lead con tenantId: ${TENANT_SPOOF} en el body`,
      );
    });

    it("control: sin el campo spoofeado nace en El Templo igual", async () => {
      const id = await altaDeLeadDePrueba({});
      await afirmarQueNacioEnElTemplo("users", id, "alta de lead sin spoofeo");
    });
  });

  describe("cobro — POST /api/admin/finance/transactions (spread #4)", () => {
    it("con tenantId spoofeado en el body, la transacción igual nace en El Templo", async () => {
      const id = await cobro({ tenantId: TENANT_SPOOF });
      await afirmarQueNacioEnElTemplo(
        "financial_transactions",
        id,
        `cobro con tenantId: ${TENANT_SPOOF} en el body`,
      );
    });

    it("control: sin el campo spoofeado nace en El Templo igual", async () => {
      const id = await cobro({});
      await afirmarQueNacioEnElTemplo(
        "financial_transactions",
        id,
        "cobro sin spoofeo",
      );
    });
  });

  describe("asignación de plan — POST /api/admin/subscriptions/.../assign (body ABIERTO)", () => {
    it("con tenantId spoofeado en el body, la suscripción igual nace en El Templo", async () => {
      // `assignPlanSchema` no declara `additionalProperties: false`, así que
      // acá el campo spoofeado LLEGA a `request.body` y el handler lo ignora
      // porque enumera lo que le pasa al service. Es el contrato probado sin
      // ayuda del transporte.
      const id = await asignacionDePlan({ tenantId: TENANT_SPOOF });
      await afirmarQueNacioEnElTemplo(
        "subscriptions",
        id,
        `asignación de plan con tenantId: ${TENANT_SPOOF} en el body (body abierto)`,
      );
    });

    it("control: sin el campo spoofeado nace en El Templo igual", async () => {
      const id = await asignacionDePlan({});
      await afirmarQueNacioEnElTemplo(
        "subscriptions",
        id,
        "asignación de plan sin spoofeo",
      );
    });
  });

  describe("reserva — POST /api/members/scheduling/reserve (body ABIERTO)", () => {
    it("con tenantId spoofeado en el body, la reserva igual nace en El Templo", async () => {
      // Mismo caso que la asignación: `reserveSchema` tampoco cierra el body.
      // Además el actor acá es un SOCIO, no staff — el borde menos privilegiado
      // del repo tampoco puede elegir gimnasio.
      const id = await reserva({ tenantId: TENANT_SPOOF });
      await afirmarQueNacioEnElTemplo(
        "bookings",
        id,
        `reserva con tenantId: ${TENANT_SPOOF} en el body (body abierto, actor socio)`,
      );
    });

    it("control: sin el campo spoofeado nace en El Templo igual", async () => {
      const id = await reserva({});
      await afirmarQueNacioEnElTemplo("bookings", id, "reserva sin spoofeo");
    });
  });
});
