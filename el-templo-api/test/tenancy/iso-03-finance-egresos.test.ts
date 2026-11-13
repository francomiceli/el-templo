/**
 * Fase 209 Plan 07 (ISO-03) — AISLAMIENTO de los gastos de Egresos, ruta por
 * ruta, contra un segundo gimnasio real.
 *
 * Mismo molde y mismo contrato que `iso-03-finance-cajas.test.ts` (leelo para
 * el porqué de cada decisión): esta batería es el GATE de que Egresos no deja
 * ver ni tocar los gastos de otro gimnasio.
 *
 * QUE RUTAS CUBRE (6 del plan 209-07, 2 del 209-08, 3 del 209-10 y 2 del 211-03)
 * --------------------------------------------------
 *   GET    /api/admin/finance/expense-records
 *   POST   /api/admin/finance/expense-records
 *   GET    /api/admin/finance/expense-records/form-options
 *   GET    /api/admin/finance/expense-records/:id
 *   PATCH  /api/admin/finance/expense-records/:id
 *   POST   /api/admin/finance/expense-records/:id/void
 *   POST   /api/admin/finance/expense-records/:id/payments            (209-08)
 *   POST   /api/admin/finance/expense-records/:id/payments/:paymentId/void (209-08)
 *   GET    /api/admin/finance/expense-records/summary                 (209-10)
 *   GET    /api/admin/finance/expense-records/summary/detail          (209-10)
 *   GET    /api/admin/finance/expense-records/summary/export          (209-10)
 *   GET    /api/admin/finance/expense-records/result                  (211-03)
 *   GET    /api/admin/finance/expense-records/result/export           (211-03)
 *
 * Los gastos de los dos gimnasios tienen IMPORTES DISTINTOS (el de El Templo es
 * distintivo): así un total del Resumen que sume lo ajeno no puede pasar por
 * casualidad. Los dos están imputados a `MES_RESUMEN`.
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
import { Workbook } from "exceljs";
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

/** Mes de imputación de los dos gastos sembrados (y el que consulta el Resumen). */
const MES_RESUMEN = "2026-11";
/** Importe distintivo del gasto de El Templo y el del gimnasio 2 (distintos entre sí). */
const IMPORTE_GASTO_TEMPLO = 7000;
const IMPORTE_GASTO_DOS = 5000;
/** Mes del pago sembrado (`FECHA_PAGO`). */
const MES_PAGO = "2026-01";
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
      amount: IMPORTE_GASTO_TEMPLO,
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
  amount?: number;
  idempotencyKey?: string;
}): Record<string, unknown> {
  const amount = datos.amount ?? IMPORTE_GASTO_DOS;
  return {
    concept: datos.concept,
    costCenterId: datos.costCenterId,
    imputationMonth: MES_RESUMEN,
    amount,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: datos.branchId, amount }],
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

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN MENSUAL (209-10)
// ═══════════════════════════════════════════════════════════════════════════

interface ResumenResponse {
  month: string;
  columns: Array<{
    key: string;
    branchId: number | null;
    name: string;
    cost: number;
    pending: number;
    paidInMonth: number;
  }>;
}

interface DetalleResponse {
  destination: string;
  groups: Array<{
    concepts: Array<{ concept: string; cost: number }>;
  }>;
}

/** Los ids de las sedes de un gimnasio, leídos de la DB. */
async function sedesDe(tenantId: number): Promise<number[]> {
  const filas = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, { tenantId }));
  return filas.map((f) => f.id);
}

describe("resumen de egresos — GET /api/admin/finance/expense-records/summary", () => {
  const RUTA = "GET /api/admin/finance/expense-records/summary";

  async function resumenDelDos(mes: string): Promise<ResumenResponse> {
    const res = await comoGimnasioDos("GET", `/summary?month=${mes}`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    return JSON.parse(res.body) as ResumenResponse;
  }

  it("aislamiento: no tiene ninguna columna de una sede de El Templo y sus totales no suman lo ajeno", async () => {
    const sedesTemplo = await sedesDe(TENANT_TEMPLO);
    expect(sedesTemplo, "El Templo tiene que tener sedes").toContain(
      sedeTemploId,
    );

    const resumen = await resumenDelDos(MES_RESUMEN);
    for (const columna of resumen.columns) {
      expect(
        columna.branchId === null || !sedesTemplo.includes(columna.branchId),
        fuga(
          RUTA,
          `devolvio la columna "${columna.name}" de una sede de El Templo`,
        ),
      ).toBe(true);
    }

    // Costo del mes: solo el gasto propio, nunca el distintivo de El Templo.
    const total = resumen.columns.find((c) => c.key === "total");
    expect(
      total?.cost,
      fuga(RUTA, "el total de costo incluyo el gasto de El Templo"),
    ).toBe(IMPORTE_GASTO_DOS);
    expect(total?.pending).toBe(IMPORTE_GASTO_DOS - IMPORTE_PAGO);

    // Pagado en el mes del pago: solo el pago propio (el de El Templo es igual).
    const enElMesDelPago = await resumenDelDos(MES_PAGO);
    expect(
      enElMesDelPago.columns.find((c) => c.key === "total")?.paidInMonth,
      fuga(RUTA, "el pagado del mes sumo el pago de El Templo"),
    ).toBe(IMPORTE_PAGO);
  });

  it("control: SI refleja el gasto propio en la columna de su sede", async () => {
    const resumen = await resumenDelDos(MES_RESUMEN);
    const columna = resumen.columns.find((c) => c.branchId === gym2.branchId);
    expect(
      columna,
      sinControl(RUTA, "no tiene la columna de su propia sede"),
    ).toBeDefined();
    expect(columna?.cost).toBe(IMPORTE_GASTO_DOS);
    expect(columna?.pending).toBe(IMPORTE_GASTO_DOS - IMPORTE_PAGO);
  });
});

describe("detalle del resumen de egresos — GET /api/admin/finance/expense-records/summary/detail", () => {
  const RUTA = "GET /api/admin/finance/expense-records/summary/detail";

  async function detalleDelDos(destino: number | string) {
    return comoGimnasioDos(
      "GET",
      `/summary/detail?month=${MES_RESUMEN}&destination=${destino}`,
    );
  }

  it("aislamiento: la sede de El Templo da el mismo rechazo que una inexistente y el total no nombra su concepto", async () => {
    const ajena = await detalleDelDos(sedeTemploId);
    const inexistente = await detalleDelDos(ID_INEXISTENTE);
    expect(
      ajena.statusCode,
      fuga(
        RUTA,
        `respondio ${ajena.statusCode} con la sede ajena: ${ajena.body}`,
      ),
    ).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(JSON.parse(ajena.body)).toEqual(JSON.parse(inexistente.body));

    // El detalle del Total tampoco trae el concepto de El Templo.
    const total = await detalleDelDos("total");
    expect(total.statusCode, `${RUTA} fallo: ${total.body}`).toBe(200);
    const conceptos = (
      JSON.parse(total.body) as DetalleResponse
    ).groups.flatMap((g) => g.concepts.map((c) => c.concept));
    expect(
      conceptos,
      fuga(RUTA, "el detalle del total nombro el gasto de El Templo"),
    ).not.toContain(CONCEPTO_TEMPLO);
  });

  it("control: SI devuelve el concepto propio al pedir su sede", async () => {
    const res = await detalleDelDos(gym2.branchId);
    expect(res.statusCode, sinControl(RUTA, res.body)).toBe(200);
    const conceptos = (JSON.parse(res.body) as DetalleResponse).groups.flatMap(
      (g) => g.concepts,
    );
    expect(conceptos.map((c) => c.concept)).toEqual([CONCEPTO_DOS]);
    expect(conceptos[0]?.cost).toBe(IMPORTE_GASTO_DOS);
  });
});

describe("export del resumen de egresos — GET /api/admin/finance/expense-records/summary/export", () => {
  const RUTA = "GET /api/admin/finance/expense-records/summary/export";

  /** Todas las celdas de las dos hojas del export, como texto. */
  async function celdasDelExport(): Promise<string[]> {
    const res = await comoGimnasioDos(
      "GET",
      `/summary/export?month=${MES_RESUMEN}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const wb = new Workbook();
    // El export es un binario: se PARSEA (ver iso-03-finance-cajas). Mirar solo
    // el status dejaria sin ninguna asercion de contenido a la ruta que entrega
    // todo el mes de una sola vez.
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    expect(
      wb.getWorksheet("Resumen"),
      `${RUTA} sin hoja Resumen`,
    ).toBeDefined();
    expect(
      wb.getWorksheet("Detalle"),
      `${RUTA} sin hoja Detalle`,
    ).toBeDefined();
    const celdas: string[] = [];
    wb.eachSheet((hoja) => {
      hoja.eachRow((row) => {
        row.eachCell((cell) => celdas.push(String(cell.value ?? "")));
      });
    });
    return celdas;
  }

  it("aislamiento: el .xlsx no contiene el concepto ni la sede de El Templo", async () => {
    const celdas = await celdasDelExport();
    expect(
      celdas,
      fuga(RUTA, "el Excel nombro el gasto de El Templo"),
    ).not.toContain(CONCEPTO_TEMPLO);
    const nombreSedeTemplo = await nombreDeLaSede(sedeTemploId);
    expect(
      celdas,
      fuga(RUTA, `el Excel nombro la sede ${nombreSedeTemplo} de El Templo`),
    ).not.toContain(nombreSedeTemplo);
    expect(
      celdas,
      fuga(RUTA, "el Excel trajo el importe distintivo de El Templo"),
    ).not.toContain(String(IMPORTE_GASTO_TEMPLO));
  });

  it("control: SI contiene el concepto propio", async () => {
    const celdas = await celdasDelExport();
    expect(
      celdas,
      sinControl(RUTA, "el Excel no trae el gasto del propio gimnasio"),
    ).toContain(CONCEPTO_DOS);
    expect(celdas).toContain(String(IMPORTE_GASTO_DOS));
  });
});

// ─── Resultado por sede (211-03) ─────────────────────────────────────────────

/** Mes del cobro sembrado por el fixture (`FECHA` = 2026-01-15). */
const MES_COBRO = "2026-01";
/** Importe del cobro firme sembrado en CADA gimnasio (`IMPORTE_SEMBRADO` del fixture). */
const IMPORTE_COBRO = 12345;
/** Lo que daria el Consolidado si sumara el cobro de El Templo: 12345 + 12345. */
const IMPORTE_COBRO_SUMANDO_AJENO = 24690;
/** Lo que daria el costo del Consolidado si sumara el gasto de El Templo: 5000 + 7000. */
const COSTO_SUMANDO_AJENO = 12000;

interface ResultadoResponse {
  columns: Array<{
    key: string;
    kind: string;
    branchId: number | null;
    name: string;
    income: number;
    cost: number;
  }>;
}

describe("resultado por sede — GET /api/admin/finance/expense-records/result", () => {
  const RUTA = "GET /api/admin/finance/expense-records/result";

  async function resultadoDelDos(mes: string): Promise<ResultadoResponse> {
    const res = await comoGimnasioDos("GET", `/result?month=${mes}`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    return JSON.parse(res.body) as ResultadoResponse;
  }

  it("aislamiento: ninguna columna es una sede de El Templo y el Consolidado no suma lo ajeno", async () => {
    const sedesTemplo = await sedesDe(TENANT_TEMPLO);
    expect(sedesTemplo, "El Templo tiene que tener sedes").toContain(
      sedeTemploId,
    );

    const delCobro = await resultadoDelDos(MES_COBRO);
    for (const columna of delCobro.columns) {
      expect(
        columna.branchId === null || !sedesTemplo.includes(columna.branchId),
        fuga(
          RUTA,
          `devolvio la columna "${columna.name}" de una sede de El Templo`,
        ),
      ).toBe(true);
    }
    const consolidadoCobros = delCobro.columns.find(
      (c) => c.kind === "consolidado",
    );
    // Solo el cobro propio: 12345. Si sumara el de El Templo daria 24690.
    expect(
      consolidadoCobros?.income,
      fuga(
        RUTA,
        `el Consolidado sumo el cobro de El Templo (${IMPORTE_COBRO_SUMANDO_AJENO})`,
      ),
    ).toBe(IMPORTE_COBRO);

    const delGasto = await resultadoDelDos(MES_RESUMEN);
    // Solo el gasto propio: 5000. Con el de El Templo daria 12000.
    expect(
      delGasto.columns.find((c) => c.kind === "consolidado")?.cost,
      fuga(
        RUTA,
        `el costo del Consolidado sumo el gasto de El Templo (${COSTO_SUMANDO_AJENO})`,
      ),
    ).toBe(IMPORTE_GASTO_DOS);
  });

  it("control: SI refleja el cobro y el gasto propios en la columna de su sede", async () => {
    const delCobro = await resultadoDelDos(MES_COBRO);
    const columnaCobro = delCobro.columns.find(
      (c) => c.branchId === gym2.branchId,
    );
    expect(
      columnaCobro,
      sinControl(RUTA, "no tiene la columna de su propia sede"),
    ).toBeDefined();
    expect(columnaCobro?.income).toBe(IMPORTE_COBRO);

    const delGasto = await resultadoDelDos(MES_RESUMEN);
    expect(
      delGasto.columns.find((c) => c.branchId === gym2.branchId)?.cost,
    ).toBe(IMPORTE_GASTO_DOS);
  });
});

describe("export del resultado por sede — GET /api/admin/finance/expense-records/result/export", () => {
  const RUTA = "GET /api/admin/finance/expense-records/result/export";

  /** La hoja "Resultado" como filas de texto (la fila 1 es el encabezado). */
  async function filasDelExport(mes: string): Promise<string[][]> {
    const res = await comoGimnasioDos("GET", `/result/export?month=${mes}`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const wb = new Workbook();
    // Binario: se PARSEA, igual que el export del Resumen.
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const hoja = wb.getWorksheet("Resultado");
    expect(hoja, `${RUTA} sin hoja Resultado`).toBeDefined();
    const filas: string[][] = [];
    hoja?.eachRow((row) => {
      const celdas: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) =>
        celdas.push(String(cell.value ?? "")),
      );
      filas.push(celdas);
    });
    return filas;
  }

  it("aislamiento: el encabezado no nombra ninguna sede de El Templo y el Consolidado de cobros es solo el propio", async () => {
    const filas = await filasDelExport(MES_COBRO);
    const encabezado = filas[0] ?? [];
    const nombreSedeTemplo = await nombreDeLaSede(sedeTemploId);
    expect(
      encabezado.some((c) => c.includes(nombreSedeTemplo)),
      fuga(RUTA, `el Excel nombro la sede ${nombreSedeTemplo} de El Templo`),
    ).toBe(false);

    const cobros = filas.find((f) => f[0] === "Cobros a alumnos") ?? [];
    // El Consolidado es la ultima columna: 12345 (con el cobro de El Templo daria 24690).
    expect(
      cobros.at(-1),
      fuga(RUTA, "el Consolidado del Excel sumo el cobro de El Templo"),
    ).toBe(String(IMPORTE_COBRO));
  });

  it("control: SI trae la sede propia en el encabezado y su cobro", async () => {
    const filas = await filasDelExport(MES_COBRO);
    const encabezado = filas[0] ?? [];
    const nombreSedeDos = await nombreDeLaSedeDelDos(gym2.branchId);
    const indice = encabezado.findIndex((c) => c.includes(nombreSedeDos));
    expect(
      indice,
      sinControl(RUTA, "el encabezado no trae la sede del propio gimnasio"),
    ).toBeGreaterThan(0);
    const cobros = filas.find((f) => f[0] === "Cobros a alumnos") ?? [];
    expect(cobros[indice]).toBe(String(IMPORTE_COBRO));
  });
});

/** Nombre de una sede del gimnasio 2, leído de la DB. */
async function nombreDeLaSedeDelDos(branchId: number): Promise<string> {
  const [fila] = await app.db
    .select({ name: schema.branches.name })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
        eq(schema.branches.id, branchId),
      ),
    );
  return fila?.name ?? "";
}

/** Nombre de una sede de El Templo, leído de la DB. */
async function nombreDeLaSede(branchId: number): Promise<string> {
  const [fila] = await app.db
    .select({ name: schema.branches.name })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, { tenantId: TENANT_TEMPLO }),
        eq(schema.branches.id, branchId),
      ),
    );
  return fila?.name ?? "";
}
