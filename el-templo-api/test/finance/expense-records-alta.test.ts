/**
 * Fase 209 Plan 03: alta y detalle del gasto (ExpenseRecordService), sin rutas.
 *
 * Cubre: alta con reparto en una transacción y su rastro en audit_log (DI-08,
 * DI-09), monedas y tipo de cambio de referencia (DI-03), todas las validaciones
 * que rechazan con 400 SIN escribir nada, idempotencia (DI-16) y el detalle con
 * estado calculado, pagos e historial (DI-11).
 *
 * Datos propios con sufijo único (rubros "EGR-03 <sufijo>", sedes
 * "ZZZ-EGR-03 <sufijo>-X"). La cantidad de sedes operativas de Argentina se LEE
 * de la DB: nunca se asume. Corre contra la MySQL de test, en foreground y de a
 * un archivo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { auditLog } from "../../src/modules/shared/audit-log";
import {
  BadRequestError,
  NotFoundError,
} from "../../src/modules/shared/errors";
import { ExpenseRecordService } from "../../src/modules/finance/expense-record-service";
import { listOperationalBranches } from "../../src/modules/finance/expense-branches";
import { RETIROS_COST_CENTER_NAME } from "../../src/modules/finance/withdrawal-service";
import type {
  CreateExpenseRecordInput,
  ExpenseCountry,
} from "../../src/modules/finance/expense-types";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const sufijo = `${Date.now() % 1_000_000}`;

let app: FastifyInstance;
let service: ExpenseRecordService;
let adminId: number;

type BranchKey = "A" | "B" | "C" | "virtual" | "inactiva" | "es";
const branchIds: Record<BranchKey, number> = {
  A: 0,
  B: 0,
  C: 0,
  virtual: 0,
  inactiva: 0,
  es: 0,
};
const branchNames: Record<BranchKey, string> = {
  A: `ZZZ-EGR-03 ${sufijo}-A`,
  B: `ZZZ-EGR-03 ${sufijo}-B`,
  C: `ZZZ-EGR-03 ${sufijo}-C`,
  virtual: `ZZZ-EGR-03 ${sufijo}-Virtual`,
  inactiva: `ZZZ-EGR-03 ${sufijo}-Inactiva`,
  es: `ZZZ-EGR-03 ${sufijo}-ES`,
};

type CostCenterKey = "ar" | "arInactivo" | "es" | "retiros" | "otroGimnasio";
const costCenterIds: Record<CostCenterKey, number> = {
  ar: 0,
  arInactivo: 0,
  es: 0,
  retiros: 0,
  otroGimnasio: 0,
};
// Se borra al final solo si lo creó este archivo (en la DB de test puede existir).
let retirosCreado = false;
let otraSedeId = 0;
let cajaId = 0;
const ledgerIds: number[] = [];

async function crearSede(
  clave: BranchKey,
  valores: {
    country: string;
    isVirtual?: boolean;
    isActive?: boolean;
    timezone?: string;
  },
): Promise<void> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(TEMPLO_CTX, {
      ...valores,
      name: branchNames[clave],
      code: `E3${clave.slice(0, 3)}${sufijo}`.slice(0, 20),
    }),
  );
  branchIds[clave] = Number(res.insertId);
}

async function crearRubro(
  clave: CostCenterKey,
  valores: { name: string; country: string; isActive?: boolean },
  ctx: TenantContext = TEMPLO_CTX,
): Promise<void> {
  const [res] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(ctx, valores));
  costCenterIds[clave] = Number(res.insertId);
}

/** Gasto AR válido (ARS, confirmado, directo a la sede A) con overrides. */
function inputAr(
  overrides: Partial<CreateExpenseRecordInput> = {},
): CreateExpenseRecordInput {
  return {
    concept: `EGR-03 gasto ${sufijo}`,
    costCenterId: costCenterIds.ar,
    imputationMonth: "2026-10",
    amount: 120000,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: branchIds.A, amount: 120000 }],
    ...overrides,
  };
}

/** Gasto ES válido (EUR, confirmado, directo a la sede de España). */
function inputEs(
  overrides: Partial<CreateExpenseRecordInput> = {},
): CreateExpenseRecordInput {
  return {
    concept: `EGR-03 gasto ES ${sufijo}`,
    costCenterId: costCenterIds.es,
    imputationMonth: "2026-10",
    amount: 5000,
    currency: "EUR",
    amountStatus: "confirmado",
    allocations: [{ branchId: branchIds.es, amount: 5000 }],
    ...overrides,
  };
}

async function contar(): Promise<{
  gastos: number;
  reparto: number;
  audit: number;
}> {
  const [g] = await app.db
    .select({ n: count() })
    .from(schema.expenseRecords)
    .where(tenantWhere(schema.expenseRecords, TEMPLO_CTX));
  const [r] = await app.db
    .select({ n: count() })
    .from(schema.expenseAllocations)
    .where(tenantWhere(schema.expenseAllocations, TEMPLO_CTX));
  const [a] = await app.db
    .select({ n: count() })
    .from(schema.auditLog)
    .where(
      and(
        tenantWhere(schema.auditLog, TEMPLO_CTX),
        eq(schema.auditLog.targetKind, "expense_record"),
      ),
    );
  return { gastos: g.n, reparto: r.n, audit: a.n };
}

/**
 * Intenta un alta que DEBE dar 400 y verifica que no escribió nada (ni gasto,
 * ni reparto, ni audit). Devuelve el mensaje para afirmar sobre él.
 */
async function rechazo(
  country: ExpenseCountry,
  input: CreateExpenseRecordInput,
): Promise<string> {
  const antes = await contar();
  let error: unknown;
  try {
    await service.create(TEMPLO_CTX, country, input, adminId);
  } catch (err: unknown) {
    error = err;
  }
  if (!(error instanceof BadRequestError)) {
    throw new Error(
      `Se esperaba BadRequestError y se obtuvo: ${String(error ?? "ningún error")}`,
    );
  }
  expect(error.statusCode).toBe(400);
  expect(await contar()).toEqual(antes);
  return error.message;
}

async function insertarLedger(amount: number): Promise<number> {
  const [res] = await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      kind: "expense" as const,
      direction: "outflow" as const,
      amount,
      currency: "ARS",
      paymentMethod: "transfer" as const,
      transactionDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      cashRegisterId: cajaId,
      recordedBy: adminId,
      notes: `EGR-03 ${sufijo}`,
    }),
  );
  ledgerIds.push(Number(res.insertId));
  return Number(res.insertId);
}

async function insertarPago(
  recordId: number,
  valores: { paidOn: string; applied: number; anulado?: boolean },
): Promise<number> {
  const transactionId = await insertarLedger(valores.applied);
  const [res] = await app.db.insert(schema.expensePayments).values(
    tenantValues(TEMPLO_CTX, {
      expenseRecordId: recordId,
      transactionId,
      paidOn: valores.paidOn,
      cashRegisterId: cajaId,
      paymentMethod: "transfer",
      amount: valores.applied,
      currency: "ARS",
      appliedAmount: valores.applied,
      amountArs: valores.applied,
      createdBy: adminId,
      ...(valores.anulado
        ? { voidedAt: new Date(), voidedBy: adminId, voidReason: "prueba" }
        : {}),
    }),
  );
  return Number(res.insertId);
}

beforeAll(async () => {
  app = await createTestApp();
  service = new ExpenseRecordService(app.db, app.log);

  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;

  await crearSede("A", { country: "AR" });
  await crearSede("B", { country: "AR" });
  await crearSede("C", { country: "AR" });
  await crearSede("virtual", { country: "AR", isVirtual: true });
  await crearSede("inactiva", { country: "AR", isActive: false });
  await crearSede("es", { country: "ES", timezone: "Europe/Madrid" });

  await crearRubro("ar", { name: `EGR-03 AR ${sufijo}`, country: "AR" });
  await crearRubro("arInactivo", {
    name: `EGR-03 AR inactivo ${sufijo}`,
    country: "AR",
    isActive: false,
  });
  await crearRubro("es", { name: `EGR-03 ES ${sufijo}`, country: "ES" });

  const [retiros] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, RETIROS_COST_CENTER_NAME),
        eq(schema.costCenters.country, "AR"),
      ),
    )
    .limit(1);
  if (retiros) {
    costCenterIds.retiros = retiros.id;
  } else {
    await crearRubro("retiros", {
      name: RETIROS_COST_CENTER_NAME,
      country: "AR",
    });
    retirosCreado = true;
  }

  // Segundo gimnasio: su rubro y su sede nunca pueden usarse desde El Templo.
  const gimnasio2 = await seedSecondTenant(app);
  otraSedeId = gimnasio2.branchId;
  await crearRubro(
    "otroGimnasio",
    { name: `EGR-03 otro gym ${sufijo}`, country: "AR" },
    { tenantId: TENANT_DOS },
  );

  const [caja] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: `EGR-03 banco ${sufijo}`,
      type: "banco" as const,
      branchId: null,
      currency: "ARS",
      openingBalance: 0,
      cutoffDate: "2020-01-01",
    }),
  );
  cajaId = Number(caja.insertId);
});

afterAll(async () => {
  // Orden: pagos → ledger → caja → reparto → gastos → audit propio → rubros → sedes.
  const cc = Object.values(costCenterIds).filter((id) => id > 0);
  const propios = await app.db
    .select({ id: schema.expenseRecords.id })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, TEMPLO_CTX),
        inArray(schema.expenseRecords.costCenterId, cc),
      ),
    );
  const recordIds = propios.map((r) => r.id);
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, TEMPLO_CTX),
          inArray(schema.expensePayments.expenseRecordId, recordIds),
        ),
      );
  }
  if (ledgerIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.id, ledgerIds),
        ),
      );
  }
  if (cajaId > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, cajaId),
        ),
      );
  }
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expenseAllocations)
      .where(
        and(
          tenantWhere(schema.expenseAllocations, TEMPLO_CTX),
          inArray(schema.expenseAllocations.expenseRecordId, recordIds),
        ),
      );
    await app.db
      .delete(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, TEMPLO_CTX),
          inArray(schema.expenseRecords.id, recordIds),
        ),
      );
    await app.db
      .delete(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "expense_record"),
          inArray(schema.auditLog.targetId, recordIds),
        ),
      );
  }
  // El rubro de El Templo "Retiros" ya existía en la DB: no se toca.
  const rubrosPropios = [
    costCenterIds.ar,
    costCenterIds.arInactivo,
    costCenterIds.es,
    ...(retirosCreado ? [costCenterIds.retiros] : []),
  ];
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        inArray(schema.costCenters.id, rubrosPropios),
      ),
    );
  // El del gimnasio 2 tiene que salir antes de limpiar su tenant (FK).
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, { tenantId: TENANT_DOS }),
        eq(schema.costCenters.id, costCenterIds.otroGimnasio),
      ),
    );
  await limpiarSegundoGimnasio(app);
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, TEMPLO_CTX),
        inArray(schema.branches.id, Object.values(branchIds)),
      ),
    );
  await app.close();
});

describe("ExpenseRecordService.create: alta válida", () => {
  it("ARS confirmado directo a una sede: detalle con reparto, estado calculado e historial", async () => {
    const antes = await contar();
    const { record, created } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr(),
      adminId,
    );
    expect(created).toBe(true);
    expect(record.country).toBe("AR");
    expect(record.amount).toBe(120000);
    expect(record.currency).toBe("ARS");
    expect(record.costInCountryCurrency).toBe(120000);
    expect(record.costCenterName).toBe(`EGR-03 AR ${sufijo}`);
    // Reparto con el nombre de la sede.
    expect(record.allocations).toEqual([
      {
        branchId: branchIds.A,
        branchName: branchNames.A,
        amount: 120000,
        amountInCountryCurrency: 120000,
      },
    ]);
    // Estado calculado: sin pagos.
    expect(record.paid).toBe(0);
    expect(record.pending).toBe(120000);
    expect(record.status).toBe("pendiente");
    expect(record.overpaid).toBe(false);
    // Sin links de comprobante → datos incompletos (DI-12).
    expect(record.receiptLinksCount).toBe(0);
    expect(record.receiptLinks).toEqual([]);
    expect(record.incomplete).toBe(true);
    expect(record.createdByName).toBe("Test Admin");
    expect(record.payments).toEqual([]);
    // Historial: una sola entrada, la del alta, con el nombre del actor.
    expect(record.history).toHaveLength(1);
    expect(record.history[0].action).toBe("expense_record_created");
    expect(record.history[0].actorName).toBe("Test Admin");
    expect(record.history[0].payload.amount).toBe(120000);
    // Se escribió exactamente: 1 gasto, 1 parte de reparto, 1 audit.
    expect(await contar()).toEqual({
      gastos: antes.gastos + 1,
      reparto: antes.reparto + 1,
      audit: antes.audit + 1,
    });
  });

  it("con links y confirmado el gasto queda completo; estimado o sin links, incompleto", async () => {
    const completo = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        receiptLinks: [
          { label: "  Factura  ", url: " https://drive.google.com/x " },
        ],
        beneficiary: "  Contabilium  ",
        notes: "  nota  ",
      }),
      adminId,
    );
    expect(completo.record.incomplete).toBe(false);
    expect(completo.record.receiptLinksCount).toBe(1);
    // Se guardan recortados.
    expect(completo.record.receiptLinks).toEqual([
      { label: "Factura", url: "https://drive.google.com/x" },
    ]);
    expect(completo.record.beneficiary).toBe("Contabilium");
    expect(completo.record.notes).toBe("nota");

    const estimado = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amountStatus: "estimado",
        receiptLinks: [{ label: "", url: "https://example.com/f" }],
      }),
      adminId,
    );
    expect(estimado.record.amountStatus).toBe("estimado");
    expect(estimado.record.incomplete).toBe(true);
  });

  it("dos sedes y Casa Matriz (AR): 3 partes, la de Casa Matriz se llama 'Casa Matriz'", async () => {
    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amount: 100000,
        allocations: [
          { branchId: branchIds.A, amount: 40000 },
          { branchId: branchIds.B, amount: 35000 },
          { branchId: null, amount: 25000 },
        ],
      }),
      adminId,
    );
    expect(record.allocations).toHaveLength(3);
    // Se guarda en el orden recibido.
    expect(record.allocations.map((a) => a.branchId)).toEqual([
      branchIds.A,
      branchIds.B,
      null,
    ]);
    expect(record.allocations[2].branchName).toBe("Casa Matriz");
    expect(record.allocations.map((a) => a.amount)).toEqual([
      40000, 35000, 25000,
    ]);
  });

  it("partes iguales: $150.000 entre TODAS las sedes operativas de AR leídas de la DB, resto a la última", async () => {
    // La cantidad de sedes operativas sale de la DB: depende de las sedes del
    // ambiente de test más las 3 propias. Aritmética propia del test.
    const operativas = await listOperationalBranches(app.db, TEMPLO_CTX, "AR");
    const n = operativas.length;
    expect(n).toBeGreaterThanOrEqual(3);
    for (const k of ["A", "B", "C"] as const) {
      expect(operativas.map((b) => b.id)).toContain(branchIds[k]);
    }
    const base = Math.floor(150000 / n);
    const esperadas = operativas.map((_, i) =>
      i === n - 1 ? 150000 - base * (n - 1) : base,
    );
    expect(esperadas.reduce((a, b) => a + b, 0)).toBe(150000);

    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amount: 150000,
        allocations: operativas.map((b, i) => ({
          branchId: b.id,
          amount: esperadas[i],
        })),
      }),
      adminId,
    );
    // Se guarda tal cual, sin recalcular.
    expect(record.allocations.map((a) => a.amount)).toEqual(esperadas);
    expect(record.allocations.map((a) => a.branchId)).toEqual(
      operativas.map((b) => b.id),
    );
  });

  it("AR en USD 300 con TC 1560 entre 3 sedes de 100: costo $468.000 y $156.000 por sede", async () => {
    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amount: 300,
        currency: "USD",
        fxRate: 1560,
        allocations: [
          { branchId: branchIds.A, amount: 100 },
          { branchId: branchIds.B, amount: 100 },
          { branchId: branchIds.C, amount: 100 },
        ],
      }),
      adminId,
    );
    expect(record.currency).toBe("USD");
    expect(record.fxRate).toBe(1560);
    // 300 × 1560 = 468000
    expect(record.costInCountryCurrency).toBe(468000);
    // Las partes siguen en USD y su equivalente en pesos es 100 × 1560.
    expect(record.allocations.map((a) => a.amount)).toEqual([100, 100, 100]);
    expect(record.allocations.map((a) => a.amountInCountryCurrency)).toEqual([
      156000, 156000, 156000,
    ]);
    // Pendiente en la moneda del gasto (USD).
    expect(record.pending).toBe(300);
  });

  it("ES en EUR a una sede de España: OK, sin tipo de cambio; con Casa Matriz: 400", async () => {
    const { record } = await service.create(
      TEMPLO_CTX,
      "ES",
      inputEs(),
      adminId,
    );
    expect(record.country).toBe("ES");
    expect(record.currency).toBe("EUR");
    expect(record.fxRate).toBeNull();
    expect(record.costInCountryCurrency).toBe(5000);
    expect(record.allocations[0].branchName).toBe(branchNames.es);

    const msg = await rechazo(
      "ES",
      inputEs({
        allocations: [
          { branchId: branchIds.es, amount: 3000 },
          { branchId: null, amount: 2000 },
        ],
      }),
    );
    expect(msg).toMatch(/Casa Matriz/);
  });
});

describe("ExpenseRecordService.create: rechazos (400, sin escribir nada)", () => {
  it("importe 0, negativo, decimal o fuera de rango", async () => {
    for (const amount of [0, -5, 100.5, Number.NaN, 2_000_000_001]) {
      const msg = await rechazo(
        "AR",
        inputAr({
          amount,
          allocations: [{ branchId: branchIds.A, amount: 100 }],
        }),
      );
      expect(msg).toMatch(/número entero mayor a 0/);
    }
  });

  it("mes de imputación mal formado", async () => {
    for (const imputationMonth of [
      "2026-13",
      "2026/11",
      "2026-1",
      "",
      "26-11",
    ]) {
      const msg = await rechazo("AR", inputAr({ imputationMonth }));
      expect(msg).toMatch(/AAAA-MM/);
    }
  });

  it("moneda que no es del país", async () => {
    expect(await rechazo("AR", inputAr({ currency: "EUR" }))).toMatch(
      /Argentina van en ARS o USD/,
    );
    expect(await rechazo("ES", inputEs({ currency: "ARS" }))).toMatch(
      /España van en EUR/,
    );
    expect(await rechazo("ES", inputEs({ currency: "USD" }))).toMatch(
      /España van en EUR/,
    );
  });

  it("tipo de cambio: USD sin TC, TC inválido y TC en un gasto que no es en USD", async () => {
    const usd = inputAr({
      amount: 300,
      currency: "USD",
      allocations: [{ branchId: branchIds.A, amount: 300 }],
    });
    expect(await rechazo("AR", usd)).toMatch(/necesita el tipo de cambio/);
    expect(await rechazo("AR", { ...usd, fxRate: 0 })).toMatch(
      /mayor a 0 y tener hasta 4 decimales/,
    );
    expect(await rechazo("AR", { ...usd, fxRate: 1560.12345 })).toMatch(
      /hasta 4 decimales/,
    );
    // TC en un gasto ARS y en uno de España.
    expect(await rechazo("AR", inputAr({ fxRate: 1560 }))).toMatch(
      /solo se carga en gastos en dólares/,
    );
    expect(await rechazo("ES", inputEs({ fxRate: 1.1 }))).toMatch(
      /solo se carga en gastos en dólares/,
    );
  });

  it("estado del importe inválido", async () => {
    const msg = await rechazo(
      "AR",
      inputAr({ amountStatus: "definitivo" as unknown as "estimado" }),
    );
    expect(msg).toMatch(/estimado o confirmado/);
  });

  it("rubro inactivo, de otro país, 'Retiros', inexistente o de otro gimnasio", async () => {
    const reparto = [{ branchId: branchIds.A, amount: 120000 }];
    for (const costCenterId of [
      costCenterIds.arInactivo, // inactivo
      costCenterIds.es, // de España en un gasto AR
      costCenterIds.otroGimnasio, // del gimnasio 2 (T-209-07)
      999_999_999, // inexistente
    ]) {
      expect(
        await rechazo("AR", inputAr({ costCenterId, allocations: reparto })),
      ).toMatch(/Elegí un rubro activo de Argentina/);
    }
    // Y a la inversa: rubro de Argentina en un gasto de España.
    expect(
      await rechazo("ES", inputEs({ costCenterId: costCenterIds.ar })),
    ).toMatch(/Elegí un rubro activo de España/);
    // Retiros: existe, está activo y es de AR, pero no es un rubro de gasto.
    expect(
      await rechazo("AR", inputAr({ costCenterId: costCenterIds.retiros })),
    ).toMatch(/Caja → Retiros/);
  });

  it("links que no son URL, demasiados links, concepto en blanco y textos largos", async () => {
    expect(
      await rechazo(
        "AR",
        inputAr({ receiptLinks: [{ label: "x", url: "drive.google.com/x" }] }),
      ),
    ).toMatch(/no es una URL válida/);
    expect(
      await rechazo(
        "AR",
        inputAr({ receiptLinks: [{ label: "x", url: "javascript:alert(1)" }] }),
      ),
    ).toMatch(/no es una URL válida/);
    expect(
      await rechazo(
        "AR",
        inputAr({
          receiptLinks: Array.from({ length: 11 }, (_, i) => ({
            label: `l${i}`,
            url: `https://example.com/${i}`,
          })),
        }),
      ),
    ).toMatch(/Hasta 10 links/);
    expect(await rechazo("AR", inputAr({ concept: "   " }))).toMatch(
      /concepto es obligatorio/,
    );
    expect(await rechazo("AR", inputAr({ concept: "x".repeat(201) }))).toMatch(
      /concepto no puede superar/,
    );
    expect(
      await rechazo("AR", inputAr({ beneficiary: "x".repeat(201) })),
    ).toMatch(/beneficiario no puede superar/);
    expect(await rechazo("AR", inputAr({ notes: "x".repeat(2001) }))).toMatch(
      /observaciones no puede superar/,
    );
  });

  it("reparto que suma distinto: el mensaje trae los dos números", async () => {
    const msg = await rechazo(
      "AR",
      inputAr({
        amount: 120000,
        allocations: [
          { branchId: branchIds.A, amount: 60000 },
          { branchId: branchIds.B, amount: 59999 },
        ],
      }),
    );
    expect(msg).toContain("119999");
    expect(msg).toContain("120000");
  });

  it("reparto con sede repetida, Casa Matriz repetida o partes inválidas", async () => {
    expect(
      await rechazo(
        "AR",
        inputAr({
          allocations: [
            { branchId: branchIds.A, amount: 60000 },
            { branchId: branchIds.A, amount: 60000 },
          ],
        }),
      ),
    ).toMatch(/más de una vez/);
    expect(
      await rechazo(
        "AR",
        inputAr({
          allocations: [
            { branchId: null, amount: 60000 },
            { branchId: null, amount: 60000 },
          ],
        }),
      ),
    ).toMatch(/Casa Matriz aparece más de una vez/);
    expect(
      await rechazo(
        "AR",
        inputAr({
          allocations: [
            { branchId: branchIds.A, amount: 120000.5 },
            { branchId: branchIds.B, amount: -0.5 },
          ],
        }),
      ),
    ).toMatch(/entero mayor a 0/);
  });

  it("reparto a sede virtual, inactiva, de España o de otro gimnasio", async () => {
    for (const branchId of [
      branchIds.virtual,
      branchIds.inactiva,
      branchIds.es, // España en un gasto AR
      otraSedeId, // sede del gimnasio 2 (T-209-07)
      999_999_999, // inexistente
    ]) {
      expect(
        await rechazo(
          "AR",
          inputAr({ allocations: [{ branchId, amount: 120000 }] }),
        ),
      ).toMatch(/no es un destino válido/);
    }
    // Sede de Argentina en un gasto de España.
    expect(
      await rechazo(
        "ES",
        inputEs({ allocations: [{ branchId: branchIds.A, amount: 5000 }] }),
      ),
    ).toMatch(/no es un destino válido/);
  });

  it("reparto vacío", async () => {
    expect(await rechazo("AR", inputAr({ allocations: [] }))).toMatch(
      /al menos un destino/,
    );
  });
});

describe("ExpenseRecordService.create: idempotencia (DI-16)", () => {
  it("la misma clave devuelve el gasto ya creado: 1 sola fila y 1 sola entrada de audit", async () => {
    const key = `egr03-${sufijo}-idem`;
    const primero = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({ idempotencyKey: key }),
      adminId,
    );
    expect(primero.created).toBe(true);
    const despues1 = await contar();

    // Aunque el body cambie, se devuelve el original sin validar ni escribir.
    const segundo = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        idempotencyKey: ` ${key} `,
        concept: "otro concepto",
        amount: 1,
      }),
      adminId,
    );
    expect(segundo.created).toBe(false);
    expect(segundo.record.id).toBe(primero.record.id);
    expect(segundo.record.concept).toBe(primero.record.concept);
    expect(await contar()).toEqual(despues1);

    const filas = await app.db
      .select({ id: schema.expenseRecords.id })
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, TEMPLO_CTX),
          eq(schema.expenseRecords.idempotencyKey, key),
        ),
      );
    expect(filas).toHaveLength(1);
    const [audit] = await app.db
      .select({ n: count() })
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "expense_record"),
          eq(schema.auditLog.targetId, primero.record.id),
        ),
      );
    expect(audit.n).toBe(1);
  });

  it("una clave de 65 caracteres es 400 y una clave usada en otro país no devuelve el gasto ajeno", async () => {
    expect(
      await rechazo("AR", inputAr({ idempotencyKey: "k".repeat(65) })),
    ).toMatch(/clave de idempotencia/);

    const key = `egr03-${sufijo}-pais`;
    await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({ idempotencyKey: key }),
      adminId,
    );
    expect(await rechazo("ES", inputEs({ idempotencyKey: key }))).toMatch(
      /otro país/,
    );
  });
});

describe("ExpenseRecordService.getDetail y cargadores", () => {
  it("id inexistente, de otro país o de otro gimnasio: NotFound", async () => {
    await expect(
      service.getDetail(TEMPLO_CTX, 999_999_999),
    ).rejects.toBeInstanceOf(NotFoundError);

    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr(),
      adminId,
    );
    // Un no-owner de España no ve gastos de Argentina.
    await expect(
      service.getDetail(TEMPLO_CTX, record.id, { country: "ES" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Con el país correcto, o sin país (owner), sí.
    const conPais = await service.getDetail(TEMPLO_CTX, record.id, {
      country: "AR",
    });
    expect(conPais.id).toBe(record.id);
    const sinPais = await service.getDetail(TEMPLO_CTX, record.id, {
      country: null,
    });
    expect(sinPais.id).toBe(record.id);
    // El gimnasio 2 no ve el gasto del gimnasio 1.
    await expect(
      service.getDetail({ tenantId: TENANT_DOS }, record.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pagos: estado parcial, pagado y pagado de más; el anulado se lista pero no suma", async () => {
    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amount: 100000,
        allocations: [{ branchId: branchIds.A, amount: 100000 }],
      }),
      adminId,
    );
    const id = record.id;

    // Parcial: 40.000 vigentes; un pago anulado de 30.000 NO cuenta.
    await insertarPago(id, { paidOn: "2026-10-06", applied: 40000 });
    await insertarPago(id, {
      paidOn: "2026-10-05",
      applied: 30000,
      anulado: true,
    });
    let detalle = await service.getDetail(TEMPLO_CTX, id);
    expect(detalle.paid).toBe(40000);
    expect(detalle.pending).toBe(60000);
    expect(detalle.status).toBe("parcial");
    expect(detalle.overpaid).toBe(false);
    // Se listan todos (el anulado también), por fecha de pago y luego id.
    expect(detalle.payments.map((p) => p.paidOn)).toEqual([
      "2026-10-05",
      "2026-10-06",
    ]);
    const anulado = detalle.payments[0];
    expect(anulado.voidedAt).not.toBeNull();
    expect(anulado.voidReason).toBe("prueba");
    expect(anulado.voidedByName).toBe("Test Admin");
    expect(detalle.payments[1].voidedAt).toBeNull();
    expect(detalle.payments[1].createdByName).toBe("Test Admin");
    expect(detalle.payments[1].cashRegisterName).toBe(`EGR-03 banco ${sufijo}`);
    expect(detalle.payments[1].paymentMethod).toBe("transfer");

    // Pagado: completa justo el importe.
    await insertarPago(id, { paidOn: "2026-10-07", applied: 60000 });
    detalle = await service.getDetail(TEMPLO_CTX, id);
    expect(detalle.paid).toBe(100000);
    expect(detalle.pending).toBe(0);
    expect(detalle.status).toBe("pagado");
    expect(detalle.overpaid).toBe(false);

    // Pagado de más: el saldo pendiente nunca es negativo.
    await insertarPago(id, { paidOn: "2026-10-08", applied: 5000 });
    detalle = await service.getDetail(TEMPLO_CTX, id);
    expect(detalle.paid).toBe(105000);
    expect(detalle.pending).toBe(0);
    expect(detalle.status).toBe("pagado");
    expect(detalle.overpaid).toBe(true);
  });

  it("historial: trae los eventos de audit del gasto en orden y con nombre del actor", async () => {
    const { record } = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr(),
      adminId,
    );
    await app.db.transaction(async (tx) => {
      await auditLog.write(TEMPLO_CTX, tx, {
        actorId: adminId,
        action: "expense_payment_registered",
        targetKind: "expense_record",
        targetId: record.id,
        payload: { paymentId: 1, appliedAmount: 10 },
        reason: "motivo de prueba",
      });
    });
    const detalle = await service.getDetail(TEMPLO_CTX, record.id);
    expect(detalle.history.map((h) => h.action)).toEqual([
      "expense_record_created",
      "expense_payment_registered",
    ]);
    expect(detalle.history[1].reason).toBe("motivo de prueba");
    expect(detalle.history[1].actorName).toBe("Test Admin");
    expect(detalle.history[1].payload).toEqual({
      paymentId: 1,
      appliedAmount: 10,
    });
  });

  it("cargadores en lote: lista vacía devuelve Map vacío y varios gastos salen en una sola llamada", async () => {
    expect((await service.loadAllocations(TEMPLO_CTX, [])).size).toBe(0);
    expect((await service.loadPaidByRecord(TEMPLO_CTX, [])).size).toBe(0);
    expect(await service.toListItems(TEMPLO_CTX, [])).toEqual([]);

    const a = await service.create(TEMPLO_CTX, "AR", inputAr(), adminId);
    const b = await service.create(
      TEMPLO_CTX,
      "AR",
      inputAr({
        amount: 90,
        currency: "USD",
        fxRate: 1000,
        allocations: [
          { branchId: branchIds.A, amount: 30 },
          { branchId: null, amount: 60 },
        ],
      }),
      adminId,
    );
    await insertarPago(b.record.id, { paidOn: "2026-10-09", applied: 90 });

    const ids = [a.record.id, b.record.id];
    const reparto = await service.loadAllocations(TEMPLO_CTX, ids);
    expect(reparto.get(a.record.id)).toHaveLength(1);
    expect(reparto.get(b.record.id)?.map((p) => p.branchName)).toEqual([
      branchNames.A,
      "Casa Matriz",
    ]);
    const pagado = await service.loadPaidByRecord(TEMPLO_CTX, ids);
    expect(pagado.get(a.record.id)).toBeUndefined();
    expect(pagado.get(b.record.id)).toBe(90);

    const filas = await app.db
      .select()
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, TEMPLO_CTX),
          inArray(schema.expenseRecords.id, ids),
        ),
      );
    const items = await service.toListItems(TEMPLO_CTX, filas);
    const itemB = items.find((i) => i.id === b.record.id);
    expect(itemB?.status).toBe("pagado");
    // USD 90 × 1000 = 90000, prorrateado 30/60 → 30000 y 60000.
    expect(itemB?.costInCountryCurrency).toBe(90000);
    expect(itemB?.allocations.map((p) => p.amountInCountryCurrency)).toEqual([
      30000, 60000,
    ]);
    const itemA = items.find((i) => i.id === a.record.id);
    expect(itemA?.status).toBe("pendiente");
  });
});
