/**
 * Fase 209 Plan 07 (DI-13, DI-14, DI-16): rutas HTTP del gasto de Egresos.
 *
 * Cubre las 6 rutas de `/api/admin/finance/expense-records`:
 *   - schemas Ajv: importes enteros (un decimal da 400), mes, moneda, reparto
 *   - idempotencia del alta (`idempotencyKey` repetida → 200 con el mismo gasto)
 *   - campos extra del body descartados y país que NO viaja en el body
 *   - roles: gestion opera, admin además anula, `admin_sede`, `recepcion` y
 *     `coach` reciben el rechazo por rol en las 6 rutas y no escriben nada
 *   - alcance por país: el owner elige con `?country=`, el resto usa el suyo
 *   - opciones del formulario sin saldos y con las cuentas sin sede
 *
 * El aislamiento entre gimnasios está en `test/tenancy/iso-03-finance-egresos`.
 *
 * Corre contra la DB de test por worker. Todo lo que crea el archivo (gastos,
 * rubros, sedes, cuentas, ledger) se borra en `afterAll`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance/expense-records";
const suf = `${Date.now() % 1_000_000}`;

let app: FastifyInstance;
let ownerId: number;
let ownerToken: string;
let gestionToken: string;
let adminToken: string;
let adminSedeToken: string;
let recepcionToken: string;
let coachToken: string;

let sedeAr = 0;
let sedeEs = 0;
let rubroAr = 0;
let rubroEs = 0;
let bancoId = 0;
let centralId = 0;
const bancoNombre = `EGR-07 banco ${suf}`;
const centralNombre = `EGR-07 central ${suf}`;
const ledgerIds: number[] = [];
const staffIds: number[] = [];

interface RecordBody {
  record: {
    id: number;
    country: string;
    concept: string;
    amount: number;
    voidedAt: string | null;
    allocations: Array<{ branchId: number | null; amount: number }>;
    payments: Array<{ id: number }>;
  };
}

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function api(
  token: string,
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: authed(token),
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Cuerpo válido de un alta AR (ARS, confirmado, directo a la sede propia). */
function cuerpoAr(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    concept: `EGR-07 gasto ${suf}`,
    costCenterId: rubroAr,
    imputationMonth: "2026-11",
    amount: 12000,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: sedeAr, amount: 12000 }],
    ...overrides,
  };
}

/** Cuerpo válido de un alta ES (EUR, confirmado, directo a la sede de España). */
function cuerpoEs(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    concept: `EGR-07 gasto ES ${suf}`,
    costCenterId: rubroEs,
    imputationMonth: "2026-11",
    amount: 800,
    currency: "EUR",
    amountStatus: "confirmado",
    allocations: [{ branchId: sedeEs, amount: 800 }],
    ...overrides,
  };
}

/** Alta por la API como owner (AR por defecto) y devuelve el id. */
async function crearGasto(
  overrides: Record<string, unknown> = {},
  token: string = ownerToken,
): Promise<number> {
  const res = await api(token, "POST", "?country=AR", cuerpoAr(overrides));
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as RecordBody).record.id;
}

/** Cantidad de gastos de los rubros propios del archivo. */
async function contarGastos(): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        inArray(schema.expenseRecords.costCenterId, [rubroAr, rubroEs]),
      ),
    );
  return Number(fila?.n ?? 0);
}

async function leerGasto(id: number) {
  const [fila] = await app.db
    .select({
      concept: schema.expenseRecords.concept,
      amount: schema.expenseRecords.amount,
      country: schema.expenseRecords.country,
      voidedAt: schema.expenseRecords.voidedAt,
    })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        eq(schema.expenseRecords.id, id),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/** Un pago vigente sembrado directo (ledger + fila de pago) para probar el conflicto al anular. */
async function sembrarPagoVigente(
  recordId: number,
  monto: number,
): Promise<void> {
  const [ledger] = await app.db.insert(schema.financialTransactions).values(
    tenantValues(CTX, {
      kind: "expense" as const,
      direction: "outflow" as const,
      amount: monto,
      currency: "ARS",
      paymentMethod: "transfer" as const,
      transactionDate: "2026-11-05",
      effectiveDate: "2026-11-05",
      cashRegisterId: bancoId,
      recordedBy: ownerId,
      notes: `EGR-07 ${suf}`,
    }),
  );
  ledgerIds.push(Number(ledger.insertId));
  await app.db.insert(schema.expensePayments).values(
    tenantValues(CTX, {
      expenseRecordId: recordId,
      transactionId: Number(ledger.insertId),
      paidOn: "2026-11-05",
      cashRegisterId: bancoId,
      paymentMethod: "transfer" as const,
      amount: monto,
      currency: "ARS",
      appliedAmount: monto,
      amountArs: monto,
      createdBy: ownerId,
    }),
  );
}

async function crearStaff(
  rol: "gestion" | "admin" | "admin_sede" | "recepcion" | "coach",
): Promise<string> {
  const email = `egr07-${rol}-${suf}@test.local`;
  const userId = await createStaffUser(app, {
    email,
    password: "pass123456",
    firstName: "Egr07",
    lastName: rol,
    role: rol,
    branchId: sedeAr,
    country: "AR",
  });
  staffIds.push(userId);
  return getAuthToken(app, email, "pass123456");
}

beforeAll(async () => {
  app = await createTestApp();

  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!owner) throw new Error("No está el owner admin@test.com sembrado");
  ownerId = owner.id;

  const [sAr] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: `ZZZ-EGR-07 ${suf}-AR`,
      code: `E7AR${suf}`.slice(0, 20),
      country: "AR",
    }),
  );
  sedeAr = Number(sAr.insertId);
  const [sEs] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: `ZZZ-EGR-07 ${suf}-ES`,
      code: `E7ES${suf}`.slice(0, 20),
      country: "ES",
      timezone: "Europe/Madrid",
    }),
  );
  sedeEs = Number(sEs.insertId);

  const [rAr] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-07 AR ${suf}`, country: "AR" }));
  rubroAr = Number(rAr.insertId);
  const [rEs] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-07 ES ${suf}`, country: "ES" }));
  rubroEs = Number(rEs.insertId);

  // Cuentas SIN sede: un banco y una Caja central.
  const [banco] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: bancoNombre,
      type: "banco" as const,
      branchId: null,
      currency: "ARS",
      bankName: "Banco Test",
      accountHolder: "Test",
      accountAlias: `egr07.${suf}`,
      openingBalance: 0,
      cutoffDate: "2020-01-01",
    }),
  );
  bancoId = Number(banco.insertId);
  const [central] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: centralNombre,
      type: "efectivo" as const,
      branchId: null,
      currency: "ARS",
      openingBalance: 0,
      cutoffDate: "2020-01-01",
    }),
  );
  centralId = Number(central.insertId);

  gestionToken = await crearStaff("gestion");
  adminToken = await crearStaff("admin");
  adminSedeToken = await crearStaff("admin_sede");
  recepcionToken = await crearStaff("recepcion");
  coachToken = await crearStaff("coach");
});

afterAll(async () => {
  // Orden: pagos → ledger → reparto → gastos → audit propio → cuentas → rubros → staff → sedes.
  const propios = await app.db
    .select({ id: schema.expenseRecords.id })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        inArray(schema.expenseRecords.costCenterId, [rubroAr, rubroEs]),
      ),
    );
  const recordIds = propios.map((r) => r.id);
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, CTX),
          inArray(schema.expensePayments.expenseRecordId, recordIds),
        ),
      );
  }
  if (ledgerIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          inArray(schema.financialTransactions.id, ledgerIds),
        ),
      );
  }
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expenseAllocations)
      .where(
        and(
          tenantWhere(schema.expenseAllocations, CTX),
          inArray(schema.expenseAllocations.expenseRecordId, recordIds),
        ),
      );
    await app.db
      .delete(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, CTX),
          inArray(schema.expenseRecords.id, recordIds),
        ),
      );
    await app.db
      .delete(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.targetKind, "expense_record"),
          inArray(schema.auditLog.targetId, recordIds),
        ),
      );
  }
  await app.db
    .delete(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, CTX),
        inArray(schema.cashRegisters.id, [bancoId, centralId]),
      ),
    );
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, CTX),
        inArray(schema.costCenters.id, [rubroAr, rubroEs]),
      ),
    );
  // El staff de prueba cuelga de la sede propia (FK): sale antes que ella.
  await app.db
    .delete(schema.userBranches)
    .where(
      and(
        tenantWhere(schema.userBranches, CTX),
        inArray(schema.userBranches.userId, staffIds),
      ),
    );
  await app.db
    .delete(schema.users)
    .where(
      and(tenantWhere(schema.users, CTX), inArray(schema.users.id, staffIds)),
    );
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, CTX),
        inArray(schema.branches.id, [sedeAr, sedeEs]),
      ),
    );
  await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Alta: owner, idempotencia y campos extra
// ═══════════════════════════════════════════════════════════════════════════

describe("alta de gasto (owner)", () => {
  it("responde 201 con el gasto y el reparto", async () => {
    const res = await api(ownerToken, "POST", "?country=AR", cuerpoAr());
    expect(res.statusCode, res.body).toBe(201);
    const { record } = JSON.parse(res.body) as RecordBody;
    expect(record.country).toBe("AR");
    expect(record.amount).toBe(12000);
    expect(record.allocations).toEqual([
      expect.objectContaining({ branchId: sedeAr, amount: 12000 }),
    ]);
  });

  it("repetir la misma idempotencyKey responde 200 con el mismo gasto y no crea otro", async () => {
    const body = cuerpoAr({ idempotencyKey: `egr07-clave-${suf}` });
    const primero = await api(ownerToken, "POST", "?country=AR", body);
    expect(primero.statusCode, primero.body).toBe(201);
    const idPrimero = (JSON.parse(primero.body) as RecordBody).record.id;
    const antes = await contarGastos();

    const segundo = await api(ownerToken, "POST", "?country=AR", body);
    expect(segundo.statusCode, segundo.body).toBe(200);
    expect((JSON.parse(segundo.body) as RecordBody).record.id).toBe(idPrimero);
    expect(await contarGastos()).toBe(antes);
  });

  it("un campo extra del body se descarta sin 400 y el país no viaja en el body", async () => {
    const res = await api(
      ownerToken,
      "POST",
      "?country=AR",
      cuerpoAr({ country: "ES", campoInventado: "x", createdBy: 999999 }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const { record } = JSON.parse(res.body) as RecordBody;
    expect(record).not.toHaveProperty("campoInventado");
    // El país salió del scope (AR), no del body.
    expect(record.country).toBe("AR");
    expect((await leerGasto(record.id))?.country).toBe("AR");
  });

  it("sin token responde 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: BASE,
      payload: cuerpoAr(),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schemas Ajv
// ═══════════════════════════════════════════════════════════════════════════

describe("schemas del alta y la edición", () => {
  async function rechazaSinEscribir(
    body: Record<string, unknown>,
  ): Promise<void> {
    const antes = await contarGastos();
    const res = await api(ownerToken, "POST", "?country=AR", body);
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarGastos()).toBe(antes);
  }

  it("un importe decimal da 400", async () => {
    await rechazaSinEscribir(
      cuerpoAr({
        amount: 100.5,
        allocations: [{ branchId: sedeAr, amount: 100 }],
      }),
    );
  });

  it("un importe como string numérico se convierte y se guarda entero", async () => {
    const res = await api(
      ownerToken,
      "POST",
      "?country=AR",
      cuerpoAr({
        amount: "1500",
        allocations: [{ branchId: sedeAr, amount: 1500 }],
      }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const { record } = JSON.parse(res.body) as RecordBody;
    expect(record.amount).toBe(1500);
    expect((await leerGasto(record.id))?.amount).toBe(1500);
  });

  it("una parte del reparto decimal da 400", async () => {
    await rechazaSinEscribir(
      cuerpoAr({
        amount: 11000,
        allocations: [
          { branchId: sedeAr, amount: 10.5 },
          { branchId: null, amount: 10989.5 },
        ],
      }),
    );
  });

  it("un mes mal formado da 400", async () => {
    await rechazaSinEscribir(cuerpoAr({ imputationMonth: "2026-1" }));
    await rechazaSinEscribir(cuerpoAr({ imputationMonth: "2026-13" }));
  });

  it("una moneda fuera de la lista da 400", async () => {
    await rechazaSinEscribir(cuerpoAr({ currency: "BTC" }));
  });

  it("un reparto vacío da 400", async () => {
    await rechazaSinEscribir(cuerpoAr({ allocations: [] }));
  });

  it("un importe por encima del tope o en cero da 400", async () => {
    await rechazaSinEscribir(
      cuerpoAr({
        amount: 2_000_000_001,
        allocations: [{ branchId: sedeAr, amount: 2_000_000_001 }],
      }),
    );
    await rechazaSinEscribir(
      cuerpoAr({ amount: 0, allocations: [{ branchId: sedeAr, amount: 0 }] }),
    );
  });

  it("falta un campo obligatorio: 400", async () => {
    const sinConcepto = cuerpoAr();
    delete sinConcepto.concept;
    await rechazaSinEscribir(sinConcepto);
  });

  it("la edición rechaza un importe decimal, un body vacío y un mes mal formado", async () => {
    const id = await crearGasto();
    for (const body of [
      { amount: 99.9 },
      {},
      { imputationMonth: "noviembre" },
    ]) {
      const res = await api(ownerToken, "PATCH", `/${id}`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await leerGasto(id))?.amount).toBe(12000);
  });

  it("la anulación exige motivo", async () => {
    const id = await crearGasto();
    const res = await api(ownerToken, "POST", `/${id}/void`, {});
    expect(res.statusCode, res.body).toBe(400);
    expect((await leerGasto(id))?.voidedAt).toBeNull();
  });

  it("el listado valida sus filtros", async () => {
    for (const q of ["destination=abc", "limit=0", "page=0", "status=raro"]) {
      const res = await api(ownerToken, "GET", `?country=AR&${q}`);
      expect(res.statusCode, q).toBe(400);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Roles
// ═══════════════════════════════════════════════════════════════════════════

describe("roles de Egresos", () => {
  it("gestion opera: lista, opciones, alta, detalle y edición", async () => {
    const lista = await api(gestionToken, "GET", "");
    expect(lista.statusCode, lista.body).toBe(200);
    expect(Array.isArray(JSON.parse(lista.body).rows)).toBe(true);

    const opciones = await api(gestionToken, "GET", "/form-options");
    expect(opciones.statusCode, opciones.body).toBe(200);

    const alta = await api(
      gestionToken,
      "POST",
      "",
      cuerpoAr({ concept: `EGR-07 de gestion ${suf}` }),
    );
    expect(alta.statusCode, alta.body).toBe(201);
    const id = (JSON.parse(alta.body) as RecordBody).record.id;

    const detalle = await api(gestionToken, "GET", `/${id}`);
    expect(detalle.statusCode, detalle.body).toBe(200);
    expect((JSON.parse(detalle.body) as RecordBody).record.id).toBe(id);

    const edicion = await api(gestionToken, "PATCH", `/${id}`, {
      concept: `EGR-07 de gestion editado ${suf}`,
    });
    expect(edicion.statusCode, edicion.body).toBe(200);
    expect((await leerGasto(id))?.concept).toBe(
      `EGR-07 de gestion editado ${suf}`,
    );
  });

  it("gestion NO puede anular: 403 y el gasto queda vigente", async () => {
    const id = await crearGasto();
    const res = await api(gestionToken, "POST", `/${id}/void`, {
      reason: "no me toca",
    });
    expect(res.statusCode, res.body).toBe(403);
    expect((await leerGasto(id))?.voidedAt).toBeNull();
  });

  it("admin anula: 200, y una segunda anulación da 400", async () => {
    const id = await crearGasto();
    const res = await api(adminToken, "POST", `/${id}/void`, {
      reason: "carga duplicada",
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((JSON.parse(res.body) as RecordBody).record.voidedAt).not.toBeNull();
    expect((await leerGasto(id))?.voidedAt).not.toBeNull();

    const otra = await api(adminToken, "POST", `/${id}/void`, {
      reason: "otra vez",
    });
    expect(otra.statusCode, otra.body).toBe(400);
  });

  it("owner anula", async () => {
    const id = await crearGasto();
    const res = await api(ownerToken, "POST", `/${id}/void`, {
      reason: "error de carga",
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it("anular un gasto con pagos vigentes da 409 y no lo anula", async () => {
    const id = await crearGasto();
    await sembrarPagoVigente(id, 5000);
    const res = await api(adminToken, "POST", `/${id}/void`, {
      reason: "tiene pagos",
    });
    expect(res.statusCode, res.body).toBe(409);
    expect((await leerGasto(id))?.voidedAt).toBeNull();
  });

  for (const [rol, tokenDe] of [
    ["admin_sede", () => adminSedeToken],
    ["recepcion", () => recepcionToken],
    ["coach", () => coachToken],
  ] as const) {
    it(`${rol} recibe 403 en las 6 rutas y no se escribe nada`, async () => {
      const token = tokenDe();
      const id = await crearGasto();
      const antes = await contarGastos();

      const intentos: Array<
        ["GET" | "POST" | "PATCH", string, Record<string, unknown> | undefined]
      > = [
        ["GET", "", undefined],
        ["POST", "", cuerpoAr({ concept: `EGR-07 intruso ${rol}` })],
        ["GET", "/form-options", undefined],
        ["GET", `/${id}`, undefined],
        ["PATCH", `/${id}`, { concept: `EGR-07 pisado por ${rol}` }],
        ["POST", `/${id}/void`, { reason: "intruso" }],
      ];
      for (const [method, url, payload] of intentos) {
        const res = await api(token, method, url, payload);
        expect(res.statusCode, `${rol} ${method} ${url}: ${res.body}`).toBe(
          403,
        );
      }

      expect(await contarGastos()).toBe(antes);
      const fila = await leerGasto(id);
      expect(fila?.concept).toBe(`EGR-07 gasto ${suf}`);
      expect(fila?.voidedAt).toBeNull();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// País
// ═══════════════════════════════════════════════════════════════════════════

describe("alcance por país", () => {
  it("el owner crea un gasto de España con ?country=ES; gestion de Argentina no lo ve", async () => {
    const alta = await api(ownerToken, "POST", "?country=ES", cuerpoEs());
    expect(alta.statusCode, alta.body).toBe(201);
    const { record } = JSON.parse(alta.body) as RecordBody;
    expect(record.country).toBe("ES");
    const id = record.id;

    // gestion (AR): el detalle es un 404 y no aparece en su listado.
    const detalle = await api(gestionToken, "GET", `/${id}`);
    expect(detalle.statusCode, detalle.body).toBe(404);
    const lista = await api(gestionToken, "GET", "?limit=200");
    expect(lista.statusCode, lista.body).toBe(200);
    const filas = JSON.parse(lista.body).rows as Array<{ id: number }>;
    expect(filas.map((f) => f.id)).not.toContain(id);

    // Tampoco puede editarlo ni anularlo (admin AR): 404 y sin efecto.
    const edicion = await api(gestionToken, "PATCH", `/${id}`, {
      concept: "pisado desde AR",
    });
    expect(edicion.statusCode, edicion.body).toBe(404);
    const anulacion = await api(adminToken, "POST", `/${id}/void`, {
      reason: "desde AR",
    });
    expect(anulacion.statusCode, anulacion.body).toBe(404);
    const fila = await leerGasto(id);
    expect(fila?.concept).toBe(`EGR-07 gasto ES ${suf}`);
    expect(fila?.voidedAt).toBeNull();

    // El owner lo ve con ?country=ES en el listado y por id con y sin country.
    const listaEs = await api(ownerToken, "GET", "?country=ES&limit=200");
    expect(
      (JSON.parse(listaEs.body).rows as Array<{ id: number }>).map((f) => f.id),
    ).toContain(id);
    const listaAr = await api(ownerToken, "GET", "?country=AR&limit=200");
    expect(
      (JSON.parse(listaAr.body).rows as Array<{ id: number }>).map((f) => f.id),
    ).not.toContain(id);
    const porIdSinCountry = await api(ownerToken, "GET", `/${id}`);
    expect(porIdSinCountry.statusCode, porIdSinCountry.body).toBe(200);
    const porIdConCountry = await api(ownerToken, "GET", `/${id}?country=ES`);
    expect(porIdConCountry.statusCode, porIdConCountry.body).toBe(200);
  });

  it("un gasto de Argentina no se puede dar de alta con el rubro de España", async () => {
    const antes = await contarGastos();
    const res = await api(
      ownerToken,
      "POST",
      "?country=AR",
      cuerpoAr({ costCenterId: rubroEs }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarGastos()).toBe(antes);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Opciones del formulario
// ═══════════════════════════════════════════════════════════════════════════

describe("opciones del formulario", () => {
  const CLAVES_PERMITIDAS = [
    "id",
    "name",
    "type",
    "currency",
    "branchId",
    "branchName",
    "isTreasury",
    "cutoffDate",
  ];

  it("gestion ve las cuentas sin sede (banco y Central) y ningún objeto de cuentas trae saldos", async () => {
    const res = await api(gestionToken, "GET", "/form-options");
    expect(res.statusCode, res.body).toBe(200);
    const opciones = JSON.parse(res.body) as {
      country: string;
      accounts: Array<Record<string, unknown> & { id: number }>;
      destinations: Array<{ branchId: number | null }>;
      costCenters: Array<{ id: number }>;
    };
    expect(opciones.country).toBe("AR");

    const banco = opciones.accounts.find((a) => a.id === bancoId);
    const central = opciones.accounts.find((a) => a.id === centralId);
    expect(banco, "falta el banco sin sede").toBeDefined();
    expect(central, "falta la Central sin sede").toBeDefined();
    expect(banco?.branchId).toBeNull();
    expect(central?.branchId).toBeNull();

    // Sin saldos: solo las claves del contrato, ninguna otra.
    for (const cuenta of opciones.accounts) {
      for (const clave of Object.keys(cuenta)) {
        expect(
          CLAVES_PERMITIDAS,
          `la cuenta ${cuenta.id} expone "${clave}"`,
        ).toContain(clave);
      }
    }

    // Sede y rubro del país propio sí; los de España no.
    const destinos = opciones.destinations.map((d) => d.branchId);
    expect(destinos).toContain(sedeAr);
    expect(destinos).not.toContain(sedeEs);
    const rubros = opciones.costCenters.map((c) => c.id);
    expect(rubros).toContain(rubroAr);
    expect(rubros).not.toContain(rubroEs);
  });

  it("el owner con ?country=ES ve la sede y el rubro de España", async () => {
    const res = await api(ownerToken, "GET", "/form-options?country=ES");
    expect(res.statusCode, res.body).toBe(200);
    const opciones = JSON.parse(res.body) as {
      country: string;
      destinations: Array<{ branchId: number | null }>;
      costCenters: Array<{ id: number }>;
    };
    expect(opciones.country).toBe("ES");
    expect(opciones.destinations.map((d) => d.branchId)).toContain(sedeEs);
    expect(opciones.costCenters.map((c) => c.id)).toContain(rubroEs);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Listado y ids inexistentes
// ═══════════════════════════════════════════════════════════════════════════

describe("listado y ids inexistentes", () => {
  it("filtra por mes, destino y texto, y oculta los anulados salvo includeVoided", async () => {
    const concepto = `EGR-07 filtro ${suf}`;
    const id = await crearGasto({
      concept: concepto,
      imputationMonth: "2026-09",
      allocations: [{ branchId: null, amount: 12000 }],
    });

    const porFiltros = await api(
      ownerToken,
      "GET",
      `?country=AR&month=2026-09&destination=casa_matriz&q=${encodeURIComponent(concepto)}`,
    );
    expect(porFiltros.statusCode, porFiltros.body).toBe(200);
    expect(
      (JSON.parse(porFiltros.body).rows as Array<{ id: number }>).map(
        (f) => f.id,
      ),
    ).toEqual([id]);

    const otroDestino = await api(
      ownerToken,
      "GET",
      `?country=AR&month=2026-09&destination=${sedeAr}&q=${encodeURIComponent(concepto)}`,
    );
    expect(JSON.parse(otroDestino.body).rows).toEqual([]);

    const anular = await api(ownerToken, "POST", `/${id}/void`, {
      reason: "prueba de filtros",
    });
    expect(anular.statusCode, anular.body).toBe(200);
    const sinAnulados = await api(
      ownerToken,
      "GET",
      `?country=AR&q=${encodeURIComponent(concepto)}`,
    );
    expect(JSON.parse(sinAnulados.body).rows).toEqual([]);
    const conAnulados = await api(
      ownerToken,
      "GET",
      `?country=AR&q=${encodeURIComponent(concepto)}&includeVoided=true`,
    );
    expect(
      (JSON.parse(conAnulados.body).rows as Array<{ id: number }>).map(
        (f) => f.id,
      ),
    ).toEqual([id]);
  });

  it("un id inexistente da 404 en detalle, edición y anulación (owner y gestion)", async () => {
    const inexistente = 2_000_000_000;
    for (const token of [ownerToken, gestionToken]) {
      const detalle = await api(token, "GET", `/${inexistente}`);
      expect(detalle.statusCode, detalle.body).toBe(404);
      const edicion = await api(token, "PATCH", `/${inexistente}`, {
        concept: "no existe",
      });
      expect(edicion.statusCode, edicion.body).toBe(404);
    }
    const anulacion = await api(adminToken, "POST", `/${inexistente}/void`, {
      reason: "no existe",
    });
    expect(anulacion.statusCode, anulacion.body).toBe(404);
  });
});
