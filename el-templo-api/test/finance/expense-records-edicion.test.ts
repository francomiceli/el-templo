/**
 * Fase 209 Plan 04: edición, anulación y listado del gasto (ExpenseRecordService),
 * sin rutas.
 *
 * Cubre: edición con motivo e historial before/after (DI-09), el reparto que se
 * reemplaza entero, la regla de sedes inactivas en la edición, anulación del
 * gasto (DI-10) y el listado con filtros y paginación (DI-11).
 *
 * Los casos con pagos viven en `expense-payments-anulacion.test.ts` (209-06):
 * bajar el importe debajo de lo pagado, 409 al anular con pagos vigentes y los
 * filtros parcial/pagado con el servicio de pagos real. Acá hay UN armado mínimo
 * con pagos insertados a mano, solo para ejercitar en SQL el estado del listado
 * y las dos guardas de este plan.
 *
 * Datos propios con sufijo único; los filtros del listado se afirman SOLO sobre
 * los ids que crea este archivo (rubros propios + `costCenterId`). Corre contra
 * la MySQL de test, en foreground y de a un archivo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../src/modules/shared/errors";
import { ExpenseRecordService } from "../../src/modules/finance/expense-record-service";
import { expenseStatusOf } from "../../src/modules/finance/expense-math";
import type {
  CreateExpenseRecordInput,
  ExpenseRecordDetail,
} from "../../src/modules/finance/expense-types";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const sufijo = `${Date.now() % 1_000_000}`;
const PREFIJO = `EGR-04 ${sufijo}`;

let app: FastifyInstance;
let service: ExpenseRecordService;
let adminId: number;

type BranchKey = "A" | "B" | "D" | "inactiva" | "es";
const branchIds: Record<BranchKey, number> = {
  A: 0,
  B: 0,
  D: 0,
  inactiva: 0,
  es: 0,
};
const branchNames: Record<BranchKey, string> = {
  A: `ZZZ-EGR-04 ${sufijo}-A`,
  B: `ZZZ-EGR-04 ${sufijo}-B`,
  D: `ZZZ-EGR-04 ${sufijo}-D`,
  inactiva: `ZZZ-EGR-04 ${sufijo}-Inactiva`,
  es: `ZZZ-EGR-04 ${sufijo}-ES`,
};

type CostCenterKey =
  | "ar"
  | "arOtro"
  | "arInactivo"
  | "lista"
  | "listaOtro"
  | "es";
const costCenterIds: Record<CostCenterKey, number> = {
  ar: 0,
  arOtro: 0,
  arInactivo: 0,
  lista: 0,
  listaOtro: 0,
  es: 0,
};
let cajaId = 0;
const ledgerIds: number[] = [];

async function crearSede(
  clave: BranchKey,
  valores: { country: string; isActive?: boolean; timezone?: string },
): Promise<void> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(TEMPLO_CTX, {
      ...valores,
      name: branchNames[clave],
      code: `E4${clave.slice(0, 3)}${sufijo}`.slice(0, 20),
    }),
  );
  branchIds[clave] = Number(res.insertId);
}

async function crearRubro(
  clave: CostCenterKey,
  valores: { name: string; country: string; isActive?: boolean },
): Promise<void> {
  const [res] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(TEMPLO_CTX, valores));
  costCenterIds[clave] = Number(res.insertId);
}

/** Gasto AR válido (ARS, confirmado, directo a la sede A) con overrides. */
function inputAr(
  overrides: Partial<CreateExpenseRecordInput> = {},
): CreateExpenseRecordInput {
  return {
    concept: `${PREFIJO} gasto`,
    costCenterId: costCenterIds.ar,
    imputationMonth: "2026-10",
    amount: 120000,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: branchIds.A, amount: 120000 }],
    ...overrides,
  };
}

async function crear(
  overrides: Partial<CreateExpenseRecordInput> = {},
): Promise<ExpenseRecordDetail> {
  const { record } = await service.create(
    TEMPLO_CTX,
    "AR",
    inputAr(overrides),
    adminId,
  );
  return record;
}

async function contarAudit(recordId: number): Promise<number> {
  const [row] = await app.db
    .select({ n: count() })
    .from(schema.auditLog)
    .where(
      and(
        tenantWhere(schema.auditLog, TEMPLO_CTX),
        eq(schema.auditLog.targetKind, "expense_record"),
        eq(schema.auditLog.targetId, recordId),
      ),
    );
  return row.n;
}

async function repartoGuardado(
  recordId: number,
): Promise<Array<{ branchId: number | null; amount: number }>> {
  const rows = await app.db
    .select({
      branchId: schema.expenseAllocations.branchId,
      amount: schema.expenseAllocations.amount,
    })
    .from(schema.expenseAllocations)
    .where(
      and(
        tenantWhere(schema.expenseAllocations, TEMPLO_CTX),
        eq(schema.expenseAllocations.expenseRecordId, recordId),
      ),
    );
  return rows;
}

/** Ejecuta algo que DEBE fallar con `clase` y devuelve el mensaje. */
async function falla(
  clase: typeof BadRequestError | typeof ConflictError | typeof NotFoundError,
  fn: () => Promise<unknown>,
): Promise<string> {
  let error: unknown;
  try {
    await fn();
  } catch (err: unknown) {
    error = err;
  }
  if (!(error instanceof clase)) {
    throw new Error(
      `Se esperaba ${clase.name} y se obtuvo: ${String(error ?? "ningún error")}`,
    );
  }
  return error.message;
}

async function insertarPago(recordId: number, applied: number): Promise<void> {
  const [ledger] = await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      kind: "expense" as const,
      direction: "outflow" as const,
      amount: applied,
      currency: "ARS",
      paymentMethod: "transfer" as const,
      transactionDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      cashRegisterId: cajaId,
      recordedBy: adminId,
      notes: PREFIJO,
    }),
  );
  const transactionId = Number(ledger.insertId);
  ledgerIds.push(transactionId);
  await app.db.insert(schema.expensePayments).values(
    tenantValues(TEMPLO_CTX, {
      expenseRecordId: recordId,
      transactionId,
      paidOn: "2026-10-05",
      cashRegisterId: cajaId,
      paymentMethod: "transfer",
      amount: applied,
      currency: "ARS",
      appliedAmount: applied,
      amountArs: applied,
      createdBy: adminId,
    }),
  );
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
  await crearSede("D", { country: "AR" });
  await crearSede("inactiva", { country: "AR", isActive: false });
  await crearSede("es", { country: "ES", timezone: "Europe/Madrid" });

  await crearRubro("ar", { name: `${PREFIJO} AR`, country: "AR" });
  await crearRubro("arOtro", { name: `${PREFIJO} AR otro`, country: "AR" });
  await crearRubro("arInactivo", {
    name: `${PREFIJO} AR inactivo`,
    country: "AR",
    isActive: false,
  });
  await crearRubro("lista", { name: `${PREFIJO} lista`, country: "AR" });
  await crearRubro("listaOtro", {
    name: `${PREFIJO} lista otro`,
    country: "AR",
  });
  await crearRubro("es", { name: `${PREFIJO} ES`, country: "ES" });

  const [caja] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: `${PREFIJO} banco`,
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
  // Orden: pagos → ledger propio → reparto → gastos → audit propio → caja → rubros → sedes.
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
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        inArray(schema.costCenters.id, cc),
      ),
    );
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

describe("ExpenseRecordService.update: campos sin motivo", () => {
  it("concepto, beneficiario y links sin motivo: OK y el historial guarda antes y después", async () => {
    const creado = await crear({ beneficiary: "Viejo" });
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        concept: `${PREFIJO} concepto nuevo`,
        beneficiary: "Nuevo SA",
        receiptLinks: [{ label: "Factura", url: "https://example.com/f1" }],
      },
      adminId,
    );
    expect(editado.concept).toBe(`${PREFIJO} concepto nuevo`);
    expect(editado.beneficiary).toBe("Nuevo SA");
    expect(editado.receiptLinks).toEqual([
      { label: "Factura", url: "https://example.com/f1" },
    ]);

    const evento = editado.history.find(
      (h) => h.action === "expense_record_update",
    );
    expect(evento).toBeDefined();
    expect(evento?.reason).toBeNull();
    expect(evento?.actorName).toBe("Test Admin");
    expect(evento?.payload).toMatchObject({
      changes: {
        concept: {
          before: `${PREFIJO} gasto`,
          after: `${PREFIJO} concepto nuevo`,
        },
        beneficiary: { before: "Viejo", after: "Nuevo SA" },
        receiptLinks: {
          before: [],
          after: [{ label: "Factura", url: "https://example.com/f1" }],
        },
      },
    });
    // No se tocó el reparto: el payload no lo trae.
    expect(evento?.payload).not.toHaveProperty("allocations");
  });

  it("mes, rubro y observaciones: se pueden cambiar y el rubro nuevo se valida como en el alta", async () => {
    const creado = await crear();
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        imputationMonth: "2026-11",
        costCenterId: costCenterIds.arOtro,
        notes: "  Una nota  ",
      },
      adminId,
    );
    expect(editado.imputationMonth).toBe("2026-11");
    expect(editado.costCenterId).toBe(costCenterIds.arOtro);
    expect(editado.notes).toBe("Una nota");

    // Rubro inactivo, de otro país y mes inválido: 400 sin cambiar nada.
    const antes = await contarAudit(creado.id);
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { costCenterId: costCenterIds.arInactivo },
        adminId,
      ),
    );
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { costCenterId: costCenterIds.es },
        adminId,
      ),
    );
    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { imputationMonth: "2026-13" },
        adminId,
      ),
    );
    expect(mensaje).toContain("AAAA-MM");
    expect(await contarAudit(creado.id)).toBe(antes);
  });

  it("un PATCH idéntico a lo guardado no escribe nada (ni audit)", async () => {
    const creado = await crear();
    const antes = await contarAudit(creado.id);
    const devuelto = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        concept: creado.concept,
        amount: creado.amount,
        amountStatus: creado.amountStatus,
        allocations: [{ branchId: branchIds.A, amount: creado.amount }],
        // Mismo importe y estado: no hace falta motivo porque no hay cambio.
      },
      adminId,
    );
    expect(devuelto.id).toBe(creado.id);
    expect(await contarAudit(creado.id)).toBe(antes);
  });
});

describe("ExpenseRecordService.update: importe, estado y tipo de cambio exigen motivo", () => {
  it("cambiar el importe sin motivo: 400 y no escribe nada", async () => {
    const creado = await crear();
    const antes = await contarAudit(creado.id);
    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          amount: 150000,
          allocations: [{ branchId: branchIds.A, amount: 150000 }],
        },
        adminId,
      ),
    );
    expect(mensaje).toContain("motivo");
    expect(await contarAudit(creado.id)).toBe(antes);
    expect((await service.getDetail(TEMPLO_CTX, creado.id)).amount).toBe(
      120000,
    );
    // Un motivo en blanco tampoco vale.
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          amount: 150000,
          allocations: [{ branchId: branchIds.A, amount: 150000 }],
          reason: "   ",
        },
        adminId,
      ),
    );
  });

  it("cambiar el importe con motivo pero sin reparto: 400", async () => {
    const creado = await crear();
    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { amount: 150000, reason: "Llegó la factura" },
        adminId,
      ),
    );
    expect(mensaje).toBe("Si cambiás el importe, mandá el reparto completo");
  });

  it("cambiar el importe con motivo y un reparto que suma: reemplaza el reparto y guarda antes/después", async () => {
    const creado = await crear({
      allocations: [
        { branchId: branchIds.A, amount: 70000 },
        { branchId: branchIds.B, amount: 50000 },
      ],
    });
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        amount: 150000,
        allocations: [
          { branchId: branchIds.A, amount: 100000 },
          { branchId: null, amount: 50000 },
        ],
        reason: "  Llegó la factura final  ",
      },
      adminId,
    );
    expect(editado.amount).toBe(150000);
    // El reparto viejo ya no existe (consulta directa, no solo el detalle).
    const guardado = await repartoGuardado(creado.id);
    expect(guardado).toHaveLength(2);
    expect(guardado).toEqual(
      expect.arrayContaining([
        { branchId: branchIds.A, amount: 100000 },
        { branchId: null, amount: 50000 },
      ]),
    );
    expect(guardado.some((a) => a.branchId === branchIds.B)).toBe(false);

    const evento = editado.history.find(
      (h) => h.action === "expense_record_update",
    );
    expect(evento?.reason).toBe("Llegó la factura final");
    expect(evento?.payload).toMatchObject({
      changes: { amount: { before: 120000, after: 150000 } },
      allocations: {
        before: [
          { branchId: branchIds.A, amount: 70000 },
          { branchId: branchIds.B, amount: 50000 },
        ],
        after: [
          { branchId: branchIds.A, amount: 100000 },
          { branchId: null, amount: 50000 },
        ],
      },
    });
  });

  it("un reparto que no suma el importe final o repite destinos: 400 y queda el reparto viejo", async () => {
    const creado = await crear();
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          amount: 150000,
          allocations: [{ branchId: branchIds.A, amount: 120000 }],
          reason: "x",
        },
        adminId,
      ),
    );
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          allocations: [
            { branchId: branchIds.A, amount: 60000 },
            { branchId: branchIds.A, amount: 60000 },
          ],
        },
        adminId,
      ),
    );
    expect(await repartoGuardado(creado.id)).toEqual([
      { branchId: branchIds.A, amount: 120000 },
    ]);
  });

  it("solo el reparto (mismo importe) no pide motivo y deja rastro con allocations", async () => {
    const creado = await crear();
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        allocations: [
          { branchId: branchIds.A, amount: 20000 },
          { branchId: branchIds.B, amount: 100000 },
        ],
      },
      adminId,
    );
    expect(editado.allocations.map((a) => a.branchId).sort()).toEqual(
      [branchIds.A, branchIds.B].sort(),
    );
    const evento = editado.history.find(
      (h) => h.action === "expense_record_update",
    );
    expect(evento?.reason).toBeNull();
    expect(evento?.payload).toHaveProperty("allocations");
  });

  it("estimado → confirmado sin motivo: 400. Con motivo: OK", async () => {
    const creado = await crear({ amountStatus: "estimado" });
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { amountStatus: "confirmado" },
        adminId,
      ),
    );
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      { amountStatus: "confirmado", reason: "Vino la factura" },
      adminId,
    );
    expect(editado.amountStatus).toBe("confirmado");
    const evento = editado.history.find(
      (h) => h.action === "expense_record_update",
    );
    expect(evento?.payload).toMatchObject({
      changes: { amountStatus: { before: "estimado", after: "confirmado" } },
    });
  });

  it("gasto en USD: el tipo de cambio sin motivo da 400, con motivo recalcula el costo y null da 400", async () => {
    const creado = await crear({
      currency: "USD",
      amount: 1000,
      fxRate: 1000,
      allocations: [{ branchId: branchIds.A, amount: 1000 }],
    });
    expect(creado.costInCountryCurrency).toBe(1000 * 1000);

    await falla(BadRequestError, () =>
      service.update(TEMPLO_CTX, creado.id, { fxRate: 1200 }, adminId),
    );
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      { fxRate: 1200, reason: "Cotización del día del pago" },
      adminId,
    );
    expect(editado.fxRate).toBe(1200);
    expect(editado.costInCountryCurrency).toBe(1000 * 1200);
    const evento = editado.history.find(
      (h) => h.action === "expense_record_update",
    );
    expect(evento?.payload).toMatchObject({
      changes: { fxRate: { before: 1000, after: 1200 } },
    });

    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { fxRate: null, reason: "Lo saco" },
        adminId,
      ),
    );
    expect(mensaje).toBe(
      "Un gasto en dólares necesita el tipo de cambio de referencia",
    );
  });

  it("un tipo de cambio en un gasto en pesos: 400", async () => {
    const creado = await crear();
    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { fxRate: 1000, reason: "No corresponde" },
        adminId,
      ),
    );
    expect(mensaje).toBe(
      "El tipo de cambio solo se carga en gastos en dólares",
    );
  });
});

describe("ExpenseRecordService.update: sedes del reparto", () => {
  it("una sede que ya estaba en el reparto y hoy está inactiva se puede reenviar; una inactiva nueva no", async () => {
    const creado = await crear({
      allocations: [
        { branchId: branchIds.D, amount: 100000 },
        { branchId: branchIds.A, amount: 20000 },
      ],
    });
    await app.db
      .update(schema.branches)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, branchIds.D),
        ),
      );

    // Se corrige la parte de A sin sacar a D (inactiva pero ya estaba): OK.
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        allocations: [
          { branchId: branchIds.D, amount: 90000 },
          { branchId: branchIds.A, amount: 30000 },
        ],
      },
      adminId,
    );
    expect(
      editado.allocations.find((a) => a.branchId === branchIds.D)?.amount,
    ).toBe(90000);

    // Una sede inactiva que NO estaba en el reparto: 400.
    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          allocations: [
            { branchId: branchIds.D, amount: 90000 },
            { branchId: branchIds.inactiva, amount: 30000 },
          ],
        },
        adminId,
      ),
    );
    expect(mensaje).toContain("destino válido");

    // La sede que no estaba ni está operativa tampoco entra aunque sea D nueva
    // en otro gasto: D ya no es operativa y este gasto nunca la tuvo.
    const otro = await crear();
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        otro.id,
        { allocations: [{ branchId: branchIds.D, amount: 120000 }] },
        adminId,
      ),
    );
  });

  it("una sede de otro país en el reparto: 400", async () => {
    const creado = await crear();
    await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        { allocations: [{ branchId: branchIds.es, amount: 120000 }] },
        adminId,
      ),
    );
  });
});

describe("ExpenseRecordService.update: gastos que no se pueden editar", () => {
  it("un gasto anulado: 400", async () => {
    const creado = await crear();
    await service.void(TEMPLO_CTX, creado.id, "Duplicado", adminId);
    const mensaje = await falla(BadRequestError, () =>
      service.update(TEMPLO_CTX, creado.id, { concept: "Nuevo" }, adminId),
    );
    expect(mensaje).toBe("El gasto está anulado: no se puede editar");
  });

  it("un gasto inexistente o de otro país: 404", async () => {
    await falla(NotFoundError, () =>
      service.update(TEMPLO_CTX, 2_000_000_000, { concept: "x" }, adminId),
    );
    const creado = await crear();
    await falla(NotFoundError, () =>
      service.update(TEMPLO_CTX, creado.id, { concept: "x" }, adminId, {
        country: "ES",
      }),
    );
  });
});

describe("ExpenseRecordService.void: anulación del gasto", () => {
  it("sin motivo: 400 y el gasto sigue vigente", async () => {
    const creado = await crear();
    const mensaje = await falla(BadRequestError, () =>
      service.void(TEMPLO_CTX, creado.id, "   ", adminId),
    );
    expect(mensaje).toBe("El motivo de la anulación es obligatorio");
    expect(
      (await service.getDetail(TEMPLO_CTX, creado.id)).voidedAt,
    ).toBeNull();
  });

  it("anula, guarda motivo y quién, y deja expense_record_voided en el historial", async () => {
    const creado = await crear();
    const anulado = await service.void(
      TEMPLO_CTX,
      creado.id,
      "  Cargado dos veces  ",
      adminId,
    );
    expect(anulado.voidedAt).not.toBeNull();
    expect(anulado.voidReason).toBe("Cargado dos veces");
    expect(anulado.voidedByName).toBe("Test Admin");
    const evento = anulado.history.find(
      (h) => h.action === "expense_record_voided",
    );
    expect(evento?.reason).toBe("Cargado dos veces");
    expect(evento?.actorName).toBe("Test Admin");
  });

  it("anular dos veces: 400", async () => {
    const creado = await crear();
    await service.void(TEMPLO_CTX, creado.id, "Primera", adminId);
    const antes = await contarAudit(creado.id);
    const mensaje = await falla(BadRequestError, () =>
      service.void(TEMPLO_CTX, creado.id, "Segunda", adminId),
    );
    expect(mensaje).toBe("El gasto ya está anulado");
    expect(await contarAudit(creado.id)).toBe(antes);
  });

  it("un gasto inexistente o de otro país: 404", async () => {
    await falla(NotFoundError, () =>
      service.void(TEMPLO_CTX, 2_000_000_000, "x", adminId),
    );
    const creado = await crear();
    await falla(NotFoundError, () =>
      service.void(TEMPLO_CTX, creado.id, "x", adminId, { country: "ES" }),
    );
  });
});

describe("Guardas con pagos vigentes (armado mínimo; el servicio de pagos se prueba en 209-06)", () => {
  it("no se puede dejar confirmado por debajo de lo pagado, pero estimado sí", async () => {
    const creado = await crear();
    await insertarPago(creado.id, 60000);

    const mensaje = await falla(BadRequestError, () =>
      service.update(
        TEMPLO_CTX,
        creado.id,
        {
          amount: 50000,
          allocations: [{ branchId: branchIds.A, amount: 50000 }],
          reason: "Bajó",
        },
        adminId,
      ),
    );
    expect(mensaje).toContain("Ya se pagaron 60000");
    expect((await service.getDetail(TEMPLO_CTX, creado.id)).amount).toBe(
      120000,
    );

    // Pasarlo a estimado y bajarlo en el mismo cambio: permitido.
    const editado = await service.update(
      TEMPLO_CTX,
      creado.id,
      {
        amount: 50000,
        amountStatus: "estimado",
        allocations: [{ branchId: branchIds.A, amount: 50000 }],
        reason: "Se renegocia",
      },
      adminId,
    );
    expect(editado.amount).toBe(50000);
    expect(editado.overpaid).toBe(true);
  });

  it("anular un gasto con pagos vigentes: 409", async () => {
    const creado = await crear();
    await insertarPago(creado.id, 10000);
    await falla(ConflictError, () =>
      service.void(TEMPLO_CTX, creado.id, "Sin pagos no", adminId),
    );
    expect(
      (await service.getDetail(TEMPLO_CTX, creado.id)).voidedAt,
    ).toBeNull();
  });
});

describe("ExpenseRecordService.list: filtros y paginación", () => {
  const ids: Record<string, number> = {};
  const propios = new Set<number>();

  beforeAll(async () => {
    const alquiler = await crear({
      concept: `${PREFIJO} alquiler`,
      beneficiary: `Inmobiliaria 100% ${sufijo}`,
      costCenterId: costCenterIds.lista,
      imputationMonth: "2031-01",
      amount: 100000,
      allocations: [{ branchId: branchIds.A, amount: 100000 }],
    });
    const luz = await crear({
      concept: `${PREFIJO} luz`,
      beneficiary: "Edenor",
      costCenterId: costCenterIds.lista,
      imputationMonth: "2031-02",
      amount: 100000,
      allocations: [
        { branchId: branchIds.A, amount: 50000 },
        { branchId: null, amount: 50000 },
      ],
    });
    const gas = await crear({
      concept: `${PREFIJO} gas`,
      costCenterId: costCenterIds.listaOtro,
      imputationMonth: "2031-02",
      amount: 80000,
      allocations: [{ branchId: branchIds.B, amount: 80000 }],
    });
    const anulado = await crear({
      concept: `${PREFIJO} anulado`,
      costCenterId: costCenterIds.lista,
      imputationMonth: "2031-03",
      amount: 5000,
      allocations: [{ branchId: branchIds.B, amount: 5000 }],
    });
    await service.void(TEMPLO_CTX, anulado.id, "Error de carga", adminId);
    const parcial = await crear({
      concept: `${PREFIJO} parcial`,
      costCenterId: costCenterIds.lista,
      imputationMonth: "2031-04",
      amount: 90000,
      allocations: [{ branchId: branchIds.A, amount: 90000 }],
    });
    await insertarPago(parcial.id, 30000);
    const pagado = await crear({
      concept: `${PREFIJO} pagado`,
      costCenterId: costCenterIds.lista,
      imputationMonth: "2031-05",
      amount: 40000,
      allocations: [{ branchId: branchIds.A, amount: 40000 }],
    });
    await insertarPago(pagado.id, 40000);

    Object.assign(ids, {
      alquiler: alquiler.id,
      luz: luz.id,
      gas: gas.id,
      anulado: anulado.id,
      parcial: parcial.id,
      pagado: pagado.id,
    });
    for (const id of Object.values(ids)) propios.add(id);
  });

  /** Ids propios (de este bloque) que devolvió un listado. */
  async function propiosDe(
    filtros: Partial<Parameters<ExpenseRecordService["list"]>[1]>,
  ): Promise<number[]> {
    const res = await service.list(TEMPLO_CTX, {
      country: "AR",
      limit: 200,
      ...filtros,
    });
    return res.rows.map((r) => r.id).filter((id) => propios.has(id));
  }

  it("por defecto no trae anulados; con includeVoided sí", async () => {
    const sin = await propiosDe({ costCenterId: costCenterIds.lista });
    expect(sin).not.toContain(ids.anulado);
    const con = await propiosDe({
      costCenterId: costCenterIds.lista,
      includeVoided: true,
    });
    expect(con).toContain(ids.anulado);
  });

  it("filtra por mes y por rubro", async () => {
    expect(await propiosDe({ month: "2031-02" })).toEqual(
      expect.arrayContaining([ids.luz, ids.gas]),
    );
    expect(await propiosDe({ month: "2031-02" })).toHaveLength(2);
    expect(await propiosDe({ costCenterId: costCenterIds.listaOtro })).toEqual([
      ids.gas,
    ]);
  });

  it("filtra por destino: una sede, Casa Matriz, y un gasto repartido aparece una sola vez", async () => {
    const enA = await propiosDe({ destination: branchIds.A });
    expect(enA.sort()).toEqual(
      [ids.alquiler, ids.luz, ids.parcial, ids.pagado].sort(),
    );
    expect(await propiosDe({ destination: branchIds.B })).toEqual([ids.gas]);
    expect(await propiosDe({ destination: "casa_matriz" })).toEqual([ids.luz]);
  });

  it("busca texto en concepto y en beneficiario, y un % se busca literal", async () => {
    expect(await propiosDe({ q: `${PREFIJO} alquiler` })).toEqual([
      ids.alquiler,
    ]);
    expect(await propiosDe({ q: "Edenor" })).toEqual([ids.luz]);
    // El `%` solo coincide con el beneficiario que lo tiene literal.
    expect(await propiosDe({ q: `100% ${sufijo}` })).toEqual([ids.alquiler]);
    // Un `%` suelto de 1 carácter no filtra (menos de 2 caracteres se ignora).
    expect((await propiosDe({ q: "%" })).length).toBeGreaterThan(1);
    // Dos comodines no son "todo": no hay gastos con "%%" literal.
    expect(await propiosDe({ q: "%%" })).toEqual([]);
  });

  it("estado pendiente y por_pagar traen los gastos sin pagar; por_pagar suma los parciales", async () => {
    const pendientes = await propiosDe({
      costCenterId: costCenterIds.lista,
      status: "pendiente",
    });
    expect(pendientes.sort()).toEqual([ids.alquiler, ids.luz].sort());

    const porPagar = await propiosDe({
      costCenterId: costCenterIds.lista,
      status: "por_pagar",
    });
    expect(porPagar.sort()).toEqual(
      [ids.alquiler, ids.luz, ids.parcial].sort(),
    );
    expect(porPagar).not.toContain(ids.pagado);
  });

  it("estado parcial y pagado (SQL sobre la suma de pagos vigentes)", async () => {
    expect(
      await propiosDe({ costCenterId: costCenterIds.lista, status: "parcial" }),
    ).toEqual([ids.parcial]);
    expect(
      await propiosDe({ costCenterId: costCenterIds.lista, status: "pagado" }),
    ).toEqual([ids.pagado]);
  });

  it("por_pagar ordena lo más viejo primero; el resto, lo más nuevo primero", async () => {
    const porPagar = await service.list(TEMPLO_CTX, {
      country: "AR",
      costCenterId: costCenterIds.lista,
      status: "por_pagar",
    });
    expect(porPagar.rows.map((r) => r.imputationMonth)).toEqual([
      "2031-01",
      "2031-02",
      "2031-04",
    ]);
    const todos = await service.list(TEMPLO_CTX, {
      country: "AR",
      costCenterId: costCenterIds.lista,
    });
    expect(todos.rows.map((r) => r.imputationMonth)).toEqual([
      "2031-05",
      "2031-04",
      "2031-02",
      "2031-01",
    ]);
  });

  it("pagina con el total correcto", async () => {
    const pagina1 = await service.list(TEMPLO_CTX, {
      country: "AR",
      costCenterId: costCenterIds.lista,
      limit: 3,
      page: 1,
    });
    expect(pagina1.total).toBe(4);
    expect(pagina1.rows).toHaveLength(3);
    expect(pagina1.page).toBe(1);
    expect(pagina1.limit).toBe(3);
    const pagina2 = await service.list(TEMPLO_CTX, {
      country: "AR",
      costCenterId: costCenterIds.lista,
      limit: 3,
      page: 2,
    });
    expect(pagina2.total).toBe(4);
    expect(pagina2.rows).toHaveLength(1);
    // Sin repetidos entre páginas.
    const todos = [...pagina1.rows, ...pagina2.rows].map((r) => r.id);
    expect(new Set(todos).size).toBe(4);
  });

  it("el país del listado separa los gastos: uno de AR no aparece en ES", async () => {
    const res = await service.list(TEMPLO_CTX, {
      country: "ES",
      costCenterId: costCenterIds.lista,
    });
    expect(res.total).toBe(0);
    expect(res.rows).toEqual([]);
  });

  it("el estado de cada ítem coincide con expenseStatusOf(importe, pagado)", async () => {
    const res = await service.list(TEMPLO_CTX, {
      country: "AR",
      costCenterId: costCenterIds.lista,
      includeVoided: true,
    });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const item of res.rows) {
      expect({
        status: item.status,
        pending: item.pending,
        overpaid: item.overpaid,
      }).toEqual(expenseStatusOf(item.amount, item.paid));
    }
    const porId = new Map(res.rows.map((r) => [r.id, r]));
    expect(porId.get(ids.parcial)).toMatchObject({
      paid: 30000,
      pending: 60000,
      status: "parcial",
    });
    expect(porId.get(ids.pagado)).toMatchObject({
      paid: 40000,
      pending: 0,
      status: "pagado",
    });
    expect(porId.get(ids.alquiler)).toMatchObject({
      paid: 0,
      status: "pendiente",
    });
  });
});
