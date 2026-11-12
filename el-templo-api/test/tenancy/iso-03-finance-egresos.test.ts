/**
 * Fase 209 Plan 07 (ISO-03) — AISLAMIENTO de los gastos de Egresos, ruta por
 * ruta, contra un segundo gimnasio real.
 *
 * Mismo molde y mismo contrato que `iso-03-finance-cajas.test.ts` (leelo para
 * el porqué de cada decisión): esta batería es el GATE de que Egresos no deja
 * ver ni tocar los gastos de otro gimnasio.
 *
 * QUE RUTAS CUBRE (6 del plan 209-07 y 2 del 209-08)
 * --------------------------------------------------
 *   GET    /api/admin/finance/expense-records
 *   POST   /api/admin/finance/expense-records
 *   GET    /api/admin/finance/expense-records/form-options
 *   GET    /api/admin/finance/expense-records/:id
 *   PATCH  /api/admin/finance/expense-records/:id
 *   POST   /api/admin/finance/expense-records/:id/void
 *   POST   /api/admin/finance/expense-records/:id/payments            (209-08)
 *   POST   /api/admin/finance/expense-records/:id/payments/:paymentId/void (209-08)
 *
 * Las rutas del Resumen (209-10) suman sus propios `describe` en este mismo
 * archivo.
 *
 * EL CONTRATO QUE SE AFIRMA (D-09)
 * --------------------------------
 * Lo del otro gimnasio es INDISTINGUIBLE de lo inexistente:
 *   - por id de un gasto ajeno          → 404 con el MISMO cuerpo que un id que no existe
 *   - rubro o sede ajenos en un alta    → el mismo 400 que con un id que no existe, y
 *                                         ninguna fila nueva en ningún gimnasio
 *   - listados y opciones               → sin una sola fila ajena
 *   - escrituras sobre un gasto ajeno   → 404, y la fila ajena INTACTA (releída de la DB)
 *
 * Este archivo no afirma el status de "prohibido" ni una vez (el gate busca por
 * texto, también en los comentarios, por eso acá no se escribe el número). Los
 * rechazos por rol se prueban en `test/finance/egresos-rutas.test.ts`.
 *
 * CADA CASO LLEVA SU CONTROL POSITIVO (D-08): dos `it` por `describe`, el de
 * aislamiento y el de control con la MISMA operación sobre lo propio del
 * gimnasio 2.
 *
 * EL ACTOR (D-10): `gym2.adminToken` (rol `admin`, que está en los roles que
 * operan Egresos y en los que anulan). El gasto de El Templo lo carga su owner
 * (`admin@test.com`) por la misma API.
 *
 * LA EVIDENCIA SE LEE DE LA BASE con `tenantWhere`, no de la respuesta HTTP.
 *
 * COMO CORRERLO: solo este archivo (o con `iso-03-cobertura`), con
 * `--hookTimeout=540000`.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, count, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { listOperationalBranches } from "../../src/modules/finance/expense-branches";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarFinanzasTemplo,
  sembrarFinanzasGimnasioDos,
  limpiarFinanzasDeLaBateria,
  tenantDeLaFila,
  MARCA_ISO03,
  type FinanzasDeElTemplo,
  type FinanzasDelGimnasioDos,
} from "../fixtures/finance-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/admin/finance/expense-records";

/** Id que no existe en ningún gimnasio: la vara de "indistinguible de lo inexistente". */
const ID_INEXISTENTE = 2_000_000_000;

const CONCEPTO_TEMPLO = `${MARCA_ISO03} gasto templo`;
const CONCEPTO_DOS = `${MARCA_ISO03} gasto g2`;
const CLAVE_IDEMPOTENCIA = `${MARCA_ISO03.toLowerCase()}-clave-compartida`;

/** Fecha de los pagos sembrados: pasada (no futura) y posterior al corte de las cuentas. */
const FECHA_PAGO = "2026-01-15";
const IMPORTE_PAGO = 2000;

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FinanzasDeElTemplo;
let dos: FinanzasDelGimnasioDos;
let ownerToken: string;
/**
 * Sede OPERATIVA de El Templo (activa, no virtual, de Argentina): la que sirve
 * de destino de un reparto. `templo.branchId` del fixture es solo la primera
 * sede no virtual y puede no serlo; con una sede que el gasto no aceptaria ni
 * en El Templo, el caso de "sede ajena" pasaria por la razon equivocada.
 */
let sedeTemploId: number;
/** Gasto de El Templo: el recurso AJENO para el staff del gimnasio 2. */
let gastoTemploId: number;
/** Gasto del gimnasio 2: el recurso PROPIO (control positivo). */
let gastoDosId: number;
/** Pago de El Templo (desde su banco): el pago AJENO. */
let pagoTemplo: { id: number; transactionId: number };
/** Pago del gimnasio 2 (desde su banco): el pago PROPIO. */
let pagoDos: { id: number; transactionId: number };

interface RecordResponse {
  record: { id: number; concept: string; voidedAt: string | null };
}

interface PaymentResponse {
  record: {
    id: number;
    payments: Array<{ id: number; voidedAt: string | null }>;
  };
  payment: { id: number; transactionId: number };
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Mismo orden obligado que el resto de la batería (ver iso-03-finance-cajas):
  // limpiar todo, limpiar lo marcado, esqueleto del gimnasio 2, finanzas de los
  // dos, y recién ahí los gastos (necesitan rubros, sedes y cuentas ya sembrados).
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarFinanzasTemplo(app);
  dos = await sembrarFinanzasGimnasioDos(app, gym2);
  const sedesTemplo = await listOperationalBranches(
    app.db,
    { tenantId: TENANT_TEMPLO },
    "AR",
  );
  if (sedesTemplo.length === 0) {
    throw new Error(
      "El Templo no tiene ninguna sede operativa de Argentina: sin ella no hay recurso ajeno valido",
    );
  }
  sedeTemploId = sedesTemplo[0].id;

  // admin@test.com es OWNER de El Templo (test/setup.ts); sobrevive a la limpieza.
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const resTemplo = await app.inject({
    method: "POST",
    url: `${BASE}?country=AR`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: cuerpoDeAlta({
      concept: CONCEPTO_TEMPLO,
      costCenterId: templo.costCenterId,
      branchId: sedeTemploId,
      idempotencyKey: CLAVE_IDEMPOTENCIA,
    }),
  });
  expect(
    resTemplo.statusCode,
    `alta del gasto de El Templo: ${resTemplo.body}`,
  ).toBe(201);
  gastoTemploId = (JSON.parse(resTemplo.body) as RecordResponse).record.id;

  const resDos = await comoGimnasioDos(
    "POST",
    "",
    cuerpoDeAlta({
      concept: CONCEPTO_DOS,
      costCenterId: dos.costCenterId,
      branchId: gym2.branchId,
    }),
  );
  expect(
    resDos.statusCode,
    `alta del gasto del gimnasio 2: ${resDos.body}`,
  ).toBe(201);
  gastoDosId = (JSON.parse(resDos.body) as RecordResponse).record.id;

  // Un pago por gimnasio, cada uno desde su propio banco (cuenta sin sede).
  const pagoDelTemplo = await app.inject({
    method: "POST",
    url: `${BASE}/${gastoTemploId}/payments?country=AR`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: cuerpoDePago(templo.bankAccountId),
  });
  expect(
    pagoDelTemplo.statusCode,
    `pago del gasto de El Templo: ${pagoDelTemplo.body}`,
  ).toBe(201);
  pagoTemplo = (JSON.parse(pagoDelTemplo.body) as PaymentResponse).payment;

  const pagoDelDos = await comoGimnasioDos(
    "POST",
    `/${gastoDosId}/payments`,
    cuerpoDePago(dos.bankAccountId),
  );
  expect(
    pagoDelDos.statusCode,
    `pago del gasto del gimnasio 2: ${pagoDelDos.body}`,
  ).toBe(201);
  pagoDos = (JSON.parse(pagoDelDos.body) as PaymentResponse).payment;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Cuerpo mínimo válido de un alta, con un único destino. */
function cuerpoDeAlta(datos: {
  concept: string;
  costCenterId: number;
  branchId: number;
  idempotencyKey?: string;
}): Record<string, unknown> {
  return {
    concept: datos.concept,
    costCenterId: datos.costCenterId,
    imputationMonth: "2026-11",
    amount: 5000,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: datos.branchId, amount: 5000 }],
    ...(datos.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: datos.idempotencyKey }),
  };
}

/** Cuerpo de un pago por transferencia desde la cuenta indicada. */
function cuerpoDePago(
  cashRegisterId: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    paidOn: FECHA_PAGO,
    cashRegisterId,
    paymentMethod: "transfer",
    amount: IMPORTE_PAGO,
    ...extra,
  };
}

/** Request como staff del gimnasio 2. `sufijo` va pegado a la base (`/:id`, `/form-options`). */
async function comoGimnasioDos(
  method: "GET" | "POST" | "PATCH",
  sufijo: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${sufijo}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** La fila del gasto leída de la DB DENTRO del gimnasio indicado (`null` si no es de él). */
async function leerGasto(tenantId: number, id: number) {
  const [fila] = await app.db
    .select({
      id: schema.expenseRecords.id,
      concept: schema.expenseRecords.concept,
      voidedAt: schema.expenseRecords.voidedAt,
    })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, { tenantId }),
        eq(schema.expenseRecords.id, id),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/** Cantidad de gastos de un gimnasio. */
async function contarGastos(tenantId: number): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.expenseRecords)
    .where(tenantWhere(schema.expenseRecords, { tenantId }));
  return Number(fila?.n ?? 0);
}

/** Cantidad de pagos de gastos de un gimnasio. */
async function contarPagos(tenantId: number): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.expensePayments)
    .where(tenantWhere(schema.expensePayments, { tenantId }));
  return Number(fila?.n ?? 0);
}

/** Cantidad de filas del ledger de un gimnasio (todas las cuentas, todos los tipos). */
async function contarLedger(tenantId: number): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.financialTransactions)
    .where(tenantWhere(schema.financialTransactions, { tenantId }));
  return Number(fila?.n ?? 0);
}

/** Suma de lo egresado (vigente) de una cuenta, leída del ledger del gimnasio. */
async function egresadoDeLaCuenta(
  tenantId: number,
  cashRegisterId: number,
): Promise<number> {
  const filas = await app.db
    .select({ amount: schema.financialTransactions.amount })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, { tenantId }),
        eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
        eq(schema.financialTransactions.direction, "outflow"),
        isNull(schema.financialTransactions.voidedAt),
      ),
    );
  return filas.reduce((total, fila) => total + Number(fila.amount), 0);
}

/** El pago leído de la DB dentro del gimnasio indicado (`null` si no es de él). */
async function leerPago(tenantId: number, id: number) {
  const [fila] = await app.db
    .select({
      id: schema.expensePayments.id,
      transactionId: schema.expensePayments.transactionId,
      voidedAt: schema.expensePayments.voidedAt,
    })
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, { tenantId }),
        eq(schema.expensePayments.id, id),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/** El `voidedAt` de la fila del ledger de un pago, leído dentro del gimnasio indicado. */
async function leerAnulacionDelLedger(tenantId: number, id: number) {
  const [fila] = await app.db
    .select({ voidedAt: schema.financialTransactions.voidedAt })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, { tenantId }),
        eq(schema.financialTransactions.id, id),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/** Mensaje de los rojos de AISLAMIENTO. */
function fuga(ruta: string, detalle: string): string {
  return (
    `${ruta}: ${detalle}. Es una fuga entre gimnasios (T-209-25): la query perdio su ` +
    `\`tenantWhere(tabla, ctx)\` o el \`ctx\` no salio de \`assertTenant(request.scope, …)\`. ` +
    `Empezar por src/modules/finance/expense-record-service.ts y por ` +
    `src/modules/finance/expense-routes.ts. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje de los rojos de CONTROL POSITIVO. */
function sinControl(ruta: string, detalle: string): string {
  return (
    `${ruta}: ${detalle}. Esto es siembra rota o scope de mas, no aislamiento: sin este ` +
    `control, el test de aislamiento de al lado pasaria en verde por la razon equivocada.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria de Egresos", () => {
  it("cada gimnasio tiene su gasto, nacido en su propio gimnasio", async () => {
    expect(
      [
        await leerGasto(TENANT_TEMPLO, gastoTemploId),
        await leerGasto(TENANT_DOS, gastoDosId),
      ].map((f) => f?.concept ?? null),
      `Algun gasto sembrado no nacio en su gimnasio: sin recurso ajeno vivo, los casos de ` +
        `aislamiento de abajo pasan probando nada.`,
    ).toEqual([CONCEPTO_TEMPLO, CONCEPTO_DOS]);
  });

  it("cada gimnasio tiene su pago, escrito en su propio gimnasio y con su fila del ledger", async () => {
    expect([
      (await leerPago(TENANT_TEMPLO, pagoTemplo.id))?.transactionId,
      (await leerPago(TENANT_DOS, pagoDos.id))?.transactionId,
    ]).toEqual([pagoTemplo.transactionId, pagoDos.transactionId]);
    expect(await egresadoDeLaCuenta(TENANT_TEMPLO, templo.bankAccountId)).toBe(
      IMPORTE_PAGO,
    );
    expect(await egresadoDeLaCuenta(TENANT_DOS, dos.bankAccountId)).toBe(
      IMPORTE_PAGO,
    );
  });

  it("los rubros de los dos gimnasios son de su gimnasio y las sedes son del mismo pais", async () => {
    expect([
      await tenantDeLaFila(app, "cost_centers", templo.costCenterId),
      await tenantDeLaFila(app, "cost_centers", dos.costCenterId),
    ]).toEqual([TENANT_TEMPLO, TENANT_DOS]);
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
          eq(schema.branches.id, sedeTemploId),
        ),
      );
    // Con paises distintos el filtro de pais escondería lo ajeno igual y los
    // casos de abajo no ejercerian la capa de tenancy.
    expect([sedeDos?.country, sedeTemplo?.country]).toEqual(["AR", "AR"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LECTURAS
// ═══════════════════════════════════════════════════════════════════════════

describe("listado de gastos — GET /api/admin/finance/expense-records", () => {
  const RUTA = "GET /api/admin/finance/expense-records";

  it("aislamiento: no devuelve ni un gasto de El Templo", async () => {
    const res = await comoGimnasioDos("GET", "");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const { rows } = JSON.parse(res.body) as { rows: Array<{ id: number }> };

    expect(
      rows.map((r) => r.id),
      fuga(RUTA, `devolvio el gasto ${gastoTemploId} de El Templo`),
    ).not.toContain(gastoTemploId);
    // Barrido completo: cada fila devuelta tiene que ser del gimnasio 2 EN LA DB.
    for (const { id } of rows) {
      expect(
        await leerGasto(TENANT_DOS, id),
        fuga(
          RUTA,
          `devolvio la fila ${id}, que no es del gimnasio ${TENANT_DOS}`,
        ),
      ).not.toBeNull();
    }
  });

  it("control: SI devuelve el gasto propio del gimnasio 2", async () => {
    const res = await comoGimnasioDos("GET", "");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const { rows } = JSON.parse(res.body) as {
      rows: Array<{ id: number; concept: string }>;
    };
    expect(
      rows.map((r) => r.id),
      sinControl(RUTA, `no devolvio el gasto propio ${gastoDosId}`),
    ).toContain(gastoDosId);
    expect(rows.find((r) => r.id === gastoDosId)?.concept).toBe(CONCEPTO_DOS);
  });
});

describe("opciones del formulario de gastos — GET /api/admin/finance/expense-records/form-options", () => {
  const RUTA = "GET /api/admin/finance/expense-records/form-options";

  interface Opciones {
    accounts: Array<{ id: number }>;
    destinations: Array<{ branchId: number | null }>;
    costCenters: Array<{ id: number }>;
  }

  it("aislamiento: ninguna cuenta, sede ni rubro de El Templo", async () => {
    const res = await comoGimnasioDos("GET", "/form-options");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const opciones = JSON.parse(res.body) as Opciones;

    const cuentasAjenas = [
      templo.cajaId,
      templo.bankAccountId,
      templo.centralId,
    ];
    for (const id of cuentasAjenas) {
      expect(
        opciones.accounts.map((a) => a.id),
        fuga(RUTA, `ofrecio la cuenta ${id} de El Templo`),
      ).not.toContain(id);
    }
    expect(
      opciones.destinations.map((d) => d.branchId),
      fuga(RUTA, `ofrecio la sede ${sedeTemploId} de El Templo`),
    ).not.toContain(sedeTemploId);
    expect(
      opciones.costCenters.map((c) => c.id),
      fuga(RUTA, `ofrecio el rubro ${templo.costCenterId} de El Templo`),
    ).not.toContain(templo.costCenterId);

    // Barrido completo contra la DB: cada cuenta y cada rubro es del gimnasio 2
    // (caza tambien los "Banco ARS" y los rubros de las migraciones, que son de
    // El Templo y este archivo no sembro).
    for (const { id } of opciones.accounts) {
      expect(
        await tenantDeLaFila(app, "cash_registers", id),
        fuga(
          RUTA,
          `ofrecio la cuenta ${id}, que no es del gimnasio ${TENANT_DOS}`,
        ),
      ).toBe(TENANT_DOS);
    }
    for (const { id } of opciones.costCenters) {
      expect(
        await tenantDeLaFila(app, "cost_centers", id),
        fuga(
          RUTA,
          `ofrecio el rubro ${id}, que no es del gimnasio ${TENANT_DOS}`,
        ),
      ).toBe(TENANT_DOS);
    }
    for (const { branchId } of opciones.destinations) {
      if (branchId === null) continue;
      const [sede] = await app.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
            eq(schema.branches.id, branchId),
          ),
        )
        .limit(1);
      expect(
        sede,
        fuga(
          RUTA,
          `ofrecio la sede ${branchId}, que no es del gimnasio ${TENANT_DOS}`,
        ),
      ).toBeDefined();
    }
  });

  it("control: SI aparecen su caja, su banco, su Central, su sede y su rubro", async () => {
    const res = await comoGimnasioDos("GET", "/form-options");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const opciones = JSON.parse(res.body) as Opciones;

    const ids = opciones.accounts.map((a) => a.id);
    expect(ids, sinControl(RUTA, "falta la caja de efectivo propia")).toContain(
      dos.cajaId,
    );
    expect(ids, sinControl(RUTA, "falta el banco propio")).toContain(
      dos.bankAccountId,
    );
    expect(ids, sinControl(RUTA, "falta la Central propia")).toContain(
      dos.centralId,
    );
    expect(
      opciones.destinations.map((d) => d.branchId),
      sinControl(RUTA, "falta la sede propia"),
    ).toContain(gym2.branchId);
    expect(
      opciones.costCenters.map((c) => c.id),
      sinControl(RUTA, "falta el rubro propio"),
    ).toContain(dos.costCenterId);
  });
});

describe("detalle de gasto — GET /api/admin/finance/expense-records/:id", () => {
  const RUTA = "GET /api/admin/finance/expense-records/:id";

  it("aislamiento: el gasto de El Templo es indistinguible de uno inexistente", async () => {
    const ajeno = await comoGimnasioDos("GET", `/${gastoTemploId}`);
    const inexistente = await comoGimnasioDos("GET", `/${ID_INEXISTENTE}`);

    expect(
      ajeno.statusCode,
      fuga(
        RUTA,
        `devolvio ${ajeno.statusCode} para el gasto ajeno ${gastoTemploId}`,
      ),
    ).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    // Misma respuesta, byte a byte: si no, el cuerpo filtra que el id existe.
    expect(JSON.parse(ajeno.body)).toEqual(JSON.parse(inexistente.body));
  });

  it("control: SI devuelve el detalle del gasto propio", async () => {
    const res = await comoGimnasioDos("GET", `/${gastoDosId}`);
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(200);
    const { record } = JSON.parse(res.body) as RecordResponse;
    expect(record.id).toBe(gastoDosId);
    expect(record.concept).toBe(CONCEPTO_DOS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITURAS
// ═══════════════════════════════════════════════════════════════════════════

describe("alta de gasto — POST /api/admin/finance/expense-records", () => {
  const RUTA = "POST /api/admin/finance/expense-records";

  it("aislamiento: con el rubro o la sede de El Templo es el mismo 400 que con un id inexistente y no escribe nada", async () => {
    const antesTemplo = await contarGastos(TENANT_TEMPLO);
    const antesDos = await contarGastos(TENANT_DOS);

    // Rubro ajeno vs rubro inexistente (el resto del cuerpo es propio y válido).
    const rubroAjeno = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} rubro ajeno`,
        costCenterId: templo.costCenterId,
        branchId: gym2.branchId,
      }),
    );
    const rubroInexistente = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} rubro inexistente`,
        costCenterId: ID_INEXISTENTE,
        branchId: gym2.branchId,
      }),
    );
    expect(
      rubroAjeno.statusCode,
      fuga(
        RUTA,
        `acepto el rubro ${templo.costCenterId} de El Templo: ${rubroAjeno.body}`,
      ),
    ).toBe(400);
    expect(rubroInexistente.statusCode).toBe(400);
    expect(JSON.parse(rubroAjeno.body)).toEqual(
      JSON.parse(rubroInexistente.body),
    );

    // Sede ajena vs sede inexistente (rubro propio).
    const sedeAjena = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} sede ajena`,
        costCenterId: dos.costCenterId,
        branchId: sedeTemploId,
      }),
    );
    const sedeInexistente = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} sede inexistente`,
        costCenterId: dos.costCenterId,
        branchId: ID_INEXISTENTE,
      }),
    );
    expect(
      sedeAjena.statusCode,
      fuga(
        RUTA,
        `acepto la sede ${sedeTemploId} de El Templo: ${sedeAjena.body}`,
      ),
    ).toBe(400);
    expect(sedeInexistente.statusCode).toBe(400);
    expect(JSON.parse(sedeAjena.body)).toEqual(
      JSON.parse(sedeInexistente.body),
    );

    // Ninguna fila nueva en ningún gimnasio.
    expect(
      await contarGastos(TENANT_TEMPLO),
      fuga(RUTA, "se escribio un gasto en El Templo"),
    ).toBe(antesTemplo);
    expect(
      await contarGastos(TENANT_DOS),
      fuga(RUTA, "se escribio un gasto del gimnasio 2 con datos ajenos"),
    ).toBe(antesDos);

    // La clave de idempotencia es por gimnasio: la MISMA clave que ya usa el
    // gasto de El Templo crea un gasto NUEVO en el gimnasio 2, nunca devuelve
    // el ajeno.
    const conClaveAjena = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} clave compartida`,
        costCenterId: dos.costCenterId,
        branchId: gym2.branchId,
        idempotencyKey: CLAVE_IDEMPOTENCIA,
      }),
    );
    expect(
      conClaveAjena.statusCode,
      fuga(
        RUTA,
        `la clave de idempotencia de El Templo se filtro: ${conClaveAjena.body}`,
      ),
    ).toBe(201);
    const idNuevo = (JSON.parse(conClaveAjena.body) as RecordResponse).record
      .id;
    expect(idNuevo).not.toBe(gastoTemploId);
    expect(await leerGasto(TENANT_DOS, idNuevo)).not.toBeNull();
  });

  it("control: con su rubro y su sede SI crea el gasto, en el gimnasio 2", async () => {
    const antes = await contarGastos(TENANT_DOS);
    const res = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} gasto propio nuevo`,
        costCenterId: dos.costCenterId,
        branchId: gym2.branchId,
      }),
    );
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(201);
    const { record } = JSON.parse(res.body) as RecordResponse;
    expect(await leerGasto(TENANT_DOS, record.id)).not.toBeNull();
    expect(await contarGastos(TENANT_DOS)).toBe(antes + 1);
  });
});

describe("edicion de gasto — PATCH /api/admin/finance/expense-records/:id", () => {
  const RUTA = "PATCH /api/admin/finance/expense-records/:id";

  it("aislamiento: el gasto de El Templo da 404 y su concepto queda intacto", async () => {
    const intento = `${MARCA_ISO03} intento de pisar lo ajeno`;
    const ajeno = await comoGimnasioDos("PATCH", `/${gastoTemploId}`, {
      concept: intento,
    });
    const inexistente = await comoGimnasioDos("PATCH", `/${ID_INEXISTENTE}`, {
      concept: intento,
    });

    expect(
      ajeno.statusCode,
      fuga(
        RUTA,
        `respondio ${ajeno.statusCode} sobre el gasto ajeno ${gastoTemploId}`,
      ),
    ).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(JSON.parse(ajeno.body)).toEqual(JSON.parse(inexistente.body));

    // La evidencia: la fila ajena releída de la DB sigue como estaba.
    expect(
      (await leerGasto(TENANT_TEMPLO, gastoTemploId))?.concept,
      fuga(
        RUTA,
        "mutó el concepto del gasto de El Templo y después contestó 404",
      ),
    ).toBe(CONCEPTO_TEMPLO);
  });

  it("control: SI edita el gasto propio", async () => {
    const nuevo = `${MARCA_ISO03} gasto g2 editado`;
    const res = await comoGimnasioDos("PATCH", `/${gastoDosId}`, {
      concept: nuevo,
    });
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(200);
    expect((JSON.parse(res.body) as RecordResponse).record.concept).toBe(nuevo);
    expect((await leerGasto(TENANT_DOS, gastoDosId))?.concept).toBe(nuevo);
  });
});

describe("anulacion de gasto — POST /api/admin/finance/expense-records/:id/void", () => {
  const RUTA = "POST /api/admin/finance/expense-records/:id/void";

  it("aislamiento: el gasto de El Templo da 404 y queda sin anular", async () => {
    const payload = { reason: "intento de anular lo ajeno" };
    const ajeno = await comoGimnasioDos(
      "POST",
      `/${gastoTemploId}/void`,
      payload,
    );
    const inexistente = await comoGimnasioDos(
      "POST",
      `/${ID_INEXISTENTE}/void`,
      payload,
    );

    expect(
      ajeno.statusCode,
      fuga(
        RUTA,
        `respondio ${ajeno.statusCode} sobre el gasto ajeno ${gastoTemploId}`,
      ),
    ).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(JSON.parse(ajeno.body)).toEqual(JSON.parse(inexistente.body));

    expect(
      (await leerGasto(TENANT_TEMPLO, gastoTemploId))?.voidedAt,
      fuga(RUTA, "anuló el gasto de El Templo y después contestó 404"),
    ).toBeNull();
  });

  it("control: SI anula un gasto propio sin pagos", async () => {
    // `gastoDosId` ya tiene un pago vigente (lo siembra el beforeEach): se anula
    // un gasto propio NUEVO, sin pagos.
    const alta = await comoGimnasioDos(
      "POST",
      "",
      cuerpoDeAlta({
        concept: `${MARCA_ISO03} gasto sin pagos`,
        costCenterId: dos.costCenterId,
        branchId: gym2.branchId,
      }),
    );
    expect(alta.statusCode, sinControl(RUTA, alta.body)).toBe(201);
    const gastoSinPagosId = (JSON.parse(alta.body) as RecordResponse).record.id;

    const res = await comoGimnasioDos("POST", `/${gastoSinPagosId}/void`, {
      reason: "carga duplicada",
    });
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(200);
    expect(
      (JSON.parse(res.body) as RecordResponse).record.voidedAt,
    ).not.toBeNull();
    expect(
      (await leerGasto(TENANT_DOS, gastoSinPagosId))?.voidedAt,
    ).not.toBeNull();
  });
});

describe("pago de gasto — POST /api/admin/finance/expense-records/:id/payments", () => {
  const RUTA = "POST /api/admin/finance/expense-records/:id/payments";

  it("aislamiento: pagar el gasto de El Templo, o pagar con su cuenta, es el mismo rechazo que con ids inexistentes y no escribe nada", async () => {
    const pagosTemplo = await contarPagos(TENANT_TEMPLO);
    const pagosDos = await contarPagos(TENANT_DOS);
    const ledgerTemplo = await contarLedger(TENANT_TEMPLO);
    const ledgerDos = await contarLedger(TENANT_DOS);
    const bancoTemploAntes = await egresadoDeLaCuenta(
      TENANT_TEMPLO,
      templo.bankAccountId,
    );

    // Gasto ajeno (con una cuenta propia válida) vs gasto inexistente.
    const gastoAjeno = await comoGimnasioDos(
      "POST",
      `/${gastoTemploId}/payments`,
      cuerpoDePago(dos.bankAccountId),
    );
    const gastoInexistente = await comoGimnasioDos(
      "POST",
      `/${ID_INEXISTENTE}/payments`,
      cuerpoDePago(dos.bankAccountId),
    );
    expect(
      gastoAjeno.statusCode,
      fuga(
        RUTA,
        `respondio ${gastoAjeno.statusCode} al pagar el gasto ajeno ${gastoTemploId}: ${gastoAjeno.body}`,
      ),
    ).toBe(404);
    expect(gastoInexistente.statusCode).toBe(404);
    expect(JSON.parse(gastoAjeno.body)).toEqual(
      JSON.parse(gastoInexistente.body),
    );

    // Cuenta ajena (con un gasto propio válido) vs cuenta inexistente.
    const cuentaAjena = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments`,
      cuerpoDePago(templo.bankAccountId),
    );
    const cuentaInexistente = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments`,
      cuerpoDePago(ID_INEXISTENTE),
    );
    expect(
      cuentaAjena.statusCode,
      fuga(
        RUTA,
        `acepto pagar con el banco ${templo.bankAccountId} de El Templo: ${cuentaAjena.body}`,
      ),
    ).toBe(400);
    expect(cuentaInexistente.statusCode).toBe(400);
    expect(JSON.parse(cuentaAjena.body)).toEqual(
      JSON.parse(cuentaInexistente.body),
    );

    // Evidencia leída de la DB: ninguna fila nueva en ningún gimnasio y el
    // banco de El Templo exactamente como estaba.
    expect(
      await contarPagos(TENANT_TEMPLO),
      fuga(RUTA, "se escribio un pago en El Templo"),
    ).toBe(pagosTemplo);
    expect(
      await contarPagos(TENANT_DOS),
      fuga(RUTA, "se escribio un pago del gimnasio 2 con datos ajenos"),
    ).toBe(pagosDos);
    expect(
      await contarLedger(TENANT_TEMPLO),
      fuga(RUTA, "se escribio una fila del ledger en El Templo"),
    ).toBe(ledgerTemplo);
    expect(
      await contarLedger(TENANT_DOS),
      fuga(RUTA, "se escribio una fila del ledger en el gimnasio 2"),
    ).toBe(ledgerDos);
    expect(
      await egresadoDeLaCuenta(TENANT_TEMPLO, templo.bankAccountId),
      fuga(RUTA, "el banco de El Templo cambio de saldo"),
    ).toBe(bancoTemploAntes);
  });

  it("control: pagando su gasto con su banco SI crea el pago y su fila del ledger, en el gimnasio 2", async () => {
    const pagosAntes = await contarPagos(TENANT_DOS);
    const ledgerAntes = await contarLedger(TENANT_DOS);
    const res = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments`,
      cuerpoDePago(dos.bankAccountId, { amount: 500 }),
    );
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(201);
    const { payment } = JSON.parse(res.body) as PaymentResponse;
    expect((await leerPago(TENANT_DOS, payment.id))?.transactionId).toBe(
      payment.transactionId,
    );
    expect(await contarPagos(TENANT_DOS)).toBe(pagosAntes + 1);
    expect(await contarLedger(TENANT_DOS)).toBe(ledgerAntes + 1);
    expect(await egresadoDeLaCuenta(TENANT_DOS, dos.bankAccountId)).toBe(
      IMPORTE_PAGO + 500,
    );
  });
});

describe("anulacion de pago — POST /api/admin/finance/expense-records/:id/payments/:paymentId/void", () => {
  const RUTA =
    "POST /api/admin/finance/expense-records/:id/payments/:paymentId/void";
  const payload = { reason: "intento de anular lo ajeno" };

  it("aislamiento: el pago de El Templo da el mismo rechazo que uno inexistente y sigue vigente", async () => {
    // Gasto y pago ajenos vs gasto y pago inexistentes.
    const ajeno = await comoGimnasioDos(
      "POST",
      `/${gastoTemploId}/payments/${pagoTemplo.id}/void`,
      payload,
    );
    const inexistente = await comoGimnasioDos(
      "POST",
      `/${ID_INEXISTENTE}/payments/${ID_INEXISTENTE}/void`,
      payload,
    );
    expect(
      ajeno.statusCode,
      fuga(
        RUTA,
        `respondio ${ajeno.statusCode} sobre el pago ajeno ${pagoTemplo.id}: ${ajeno.body}`,
      ),
    ).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(JSON.parse(ajeno.body)).toEqual(JSON.parse(inexistente.body));

    // Gasto propio con el pago ajeno vs gasto propio con un pago inexistente.
    const pagoAjenoEnGastoPropio = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments/${pagoTemplo.id}/void`,
      payload,
    );
    const pagoInexistente = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments/${ID_INEXISTENTE}/void`,
      payload,
    );
    expect(
      pagoAjenoEnGastoPropio.statusCode,
      fuga(
        RUTA,
        `respondio ${pagoAjenoEnGastoPropio.statusCode} al anular el pago ajeno ${pagoTemplo.id} desde un gasto propio`,
      ),
    ).toBe(404);
    expect(pagoInexistente.statusCode).toBe(404);
    expect(JSON.parse(pagoAjenoEnGastoPropio.body)).toEqual(
      JSON.parse(pagoInexistente.body),
    );

    // La evidencia: el pago y su fila del ledger, releídos de la DB, siguen vigentes.
    expect(
      (await leerPago(TENANT_TEMPLO, pagoTemplo.id))?.voidedAt,
      fuga(RUTA, "anulo el pago de El Templo y despues contesto con rechazo"),
    ).toBeNull();
    expect(
      (await leerAnulacionDelLedger(TENANT_TEMPLO, pagoTemplo.transactionId))
        ?.voidedAt,
      fuga(RUTA, "anulo la fila del ledger de El Templo"),
    ).toBeNull();
    expect(
      await egresadoDeLaCuenta(TENANT_TEMPLO, templo.bankAccountId),
      fuga(RUTA, "el banco de El Templo cambio de saldo"),
    ).toBe(IMPORTE_PAGO);
    // El pago propio tampoco se tocó.
    expect((await leerPago(TENANT_DOS, pagoDos.id))?.voidedAt).toBeNull();
  });

  it("control: SI anula un pago propio, y su fila del ledger tambien", async () => {
    const res = await comoGimnasioDos(
      "POST",
      `/${gastoDosId}/payments/${pagoDos.id}/void`,
      { reason: "pago cargado de mas" },
    );
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(200);
    const { record } = JSON.parse(res.body) as PaymentResponse;
    expect(
      record.payments.find((p) => p.id === pagoDos.id)?.voidedAt,
    ).not.toBeNull();
    expect((await leerPago(TENANT_DOS, pagoDos.id))?.voidedAt).not.toBeNull();
    expect(
      (await leerAnulacionDelLedger(TENANT_DOS, pagoDos.transactionId))
        ?.voidedAt,
    ).not.toBeNull();
    expect(await egresadoDeLaCuenta(TENANT_DOS, dos.bankAccountId)).toBe(0);
  });
});
