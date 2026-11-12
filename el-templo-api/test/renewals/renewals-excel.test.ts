/**
 * Unit tests — armado del Excel de Renovaciones (`modules/renewals/excel.ts`).
 * Sin DB: `buildRenewalsWorkbook` es una función pura sobre el resultado del
 * listado. El endpoint (`GET /api/admin/renewals/export`) se prueba de punta
 * a punta en `renewals.test.ts`.
 */
import { describe, it, expect } from "vitest";
import type { CellValue, Workbook, Worksheet } from "exceljs";
import {
  buildRenewalsWorkbook,
  wallClockInTz,
  RENEWAL_STATUS_LABELS,
} from "../../src/modules/renewals/excel";
import type {
  RenewalKpis,
  RenewalListResult,
  RenewalRow,
  RenewalStatus,
} from "../../src/modules/renewals/types";

const TZ_AR = "America/Argentina/Buenos_Aires";
const TZ_ES = "Europe/Madrid";

function makeRow(overrides: Partial<RenewalRow> = {}): RenewalRow {
  return {
    subscriptionId: 1,
    userId: 10,
    memberName: "Ana Pérez",
    phone: "2235550000",
    phoneE164: "+5492235550000",
    branchId: 1,
    branchName: "Moreno",
    branchTimezone: TZ_AR,
    planId: 5,
    planName: "Foundation",
    endDate: "2026-11-12",
    daysRemaining: 0,
    status: "en_proceso",
    pauseEndDate: null,
    newPlanId: null,
    newPlanName: null,
    renewedAt: null,
    nextStartDate: null,
    messageCount: 0,
    lastMessageAt: null,
    reasonId: null,
    reasonLabel: null,
    reasonNote: null,
    manualStatus: "en_proceso",
    manualOverridden: false,
    paraCerrar: false,
    followupUpdatedAt: null,
    followupUpdatedByName: null,
    lastNote: null,
    ...overrides,
  };
}

function makeKpis(overrides: Partial<RenewalKpis> = {}): RenewalKpis {
  return {
    total: 0,
    renovo: 0,
    volvioTarde: 0,
    noRenovo: 0,
    enProceso: 0,
    sinContactar: 0,
    pausadas: 0,
    paraCerrar: 0,
    renewalRate: null,
    newPlanDistribution: [],
    ...overrides,
  };
}

function makeResult(
  rows: RenewalRow[],
  kpis: Partial<RenewalKpis> = {},
): RenewalListResult {
  return { rows, kpis: makeKpis(kpis), windowDays: 5 };
}

function sheetOrThrow(workbook: Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Falta la hoja "${name}"`);
  return sheet;
}

/** Valor de la celda bajo el encabezado `header`, en la fila de datos `n` (1 = primera). */
function cell(sheet: Worksheet, header: string, n = 1): CellValue {
  let column = 0;
  sheet.getRow(1).eachCell((c, col) => {
    if (c.value === header) column = col;
  });
  if (column === 0) throw new Error(`Falta la columna "${header}"`);
  return sheet.getRow(n + 1).getCell(column).value;
}

/** Hoja "Resumen" como filas [colA, colB, colC]. */
function summaryRows(sheet: Worksheet): CellValue[][] {
  const out: CellValue[][] = [];
  sheet.eachRow((row) => {
    out.push([
      row.getCell(1).value,
      row.getCell(2).value,
      row.getCell(3).value,
    ]);
  });
  return out;
}

function summaryValue(sheet: Worksheet, label: string): CellValue | undefined {
  return summaryRows(sheet).find((r) => r[0] === label)?.[1];
}

const FILTERS = { dateFrom: "2026-11-09", dateTo: "2026-11-15" };

describe("wallClockInTz", () => {
  it("devuelve la hora de pared de la sede como valor UTC (Argentina, UTC-3)", () => {
    const d = wallClockInTz("2026-11-12T13:30:00.000Z", TZ_AR);
    expect(d?.toISOString()).toBe("2026-11-12T10:30:00.000Z");
  });

  it("un instante de madrugada UTC cae en el día ANTERIOR de la sede", () => {
    const d = wallClockInTz("2026-11-12T01:15:00.000Z", TZ_AR);
    expect(d?.toISOString()).toBe("2026-11-11T22:15:00.000Z");
  });

  it("respeta el horario de verano del huso (Madrid: +1 en invierno, +2 en verano)", () => {
    expect(
      wallClockInTz("2026-01-15T12:00:00.000Z", TZ_ES)?.toISOString(),
    ).toBe("2026-01-15T13:00:00.000Z");
    expect(
      wallClockInTz("2026-07-15T12:00:00.000Z", TZ_ES)?.toISOString(),
    ).toBe("2026-07-15T14:00:00.000Z");
  });

  it("medianoche de la sede queda en 00:xx, no en 24:xx", () => {
    const d = wallClockInTz("2026-11-12T03:05:00.000Z", TZ_AR);
    expect(d?.toISOString()).toBe("2026-11-12T00:05:00.000Z");
  });

  it("null o fecha inválida → null", () => {
    expect(wallClockInTz(null, TZ_AR)).toBeNull();
    expect(wallClockInTz("no-es-fecha", TZ_AR)).toBeNull();
  });
});

describe("buildRenewalsWorkbook — hoja Renovaciones", () => {
  it("escribe una fila por vencimiento, en el orden recibido", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({ subscriptionId: 1, memberName: "Ana Pérez" }),
        makeRow({ subscriptionId: 2, memberName: "Bruno Díaz" }),
      ]),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    expect(sheet.rowCount).toBe(3);
    expect(cell(sheet, "Nombre", 1)).toBe("Ana Pérez");
    expect(cell(sheet, "Nombre", 2)).toBe("Bruno Díaz");
  });

  it("las fechas son fechas de Excel (no texto) y el vencimiento no se corre de día", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({
          endDate: "2026-11-12",
          status: "pausada",
          pauseEndDate: "2026-12-01",
        }),
      ]),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    const endDate = cell(sheet, "Vencimiento");
    const pauseEnd = cell(sheet, "Pausa hasta");
    expect(endDate).toBeInstanceOf(Date);
    expect((endDate as Date).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect((pauseEnd as Date).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("las marcas de tiempo van en hora de la sede de cada fila", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({
          status: "renovo",
          newPlanName: "Flex",
          renewedAt: "2026-11-12T01:15:00.000Z",
          followupUpdatedAt: "2026-11-12T13:30:00.000Z",
          followupUpdatedByName: "Carla Gómez",
          lastNote: {
            content: "Paga el viernes",
            createdAt: "2026-11-11T15:00:00.000Z",
            authorName: "Carla Gómez",
          },
        }),
      ]),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    expect((cell(sheet, "Renovó el") as Date).toISOString()).toBe(
      "2026-11-11T22:15:00.000Z",
    );
    expect((cell(sheet, "Última gestión") as Date).toISOString()).toBe(
      "2026-11-12T10:30:00.000Z",
    );
    expect((cell(sheet, "Fecha de la observación") as Date).toISOString()).toBe(
      "2026-11-11T12:00:00.000Z",
    );
    expect(cell(sheet, "Gestionó")).toBe("Carla Gómez");
    expect(cell(sheet, "Plan nuevo")).toBe("Flex");
    expect(cell(sheet, "Observación")).toBe("Paga el viernes");
    expect(cell(sheet, "Autor de la observación")).toBe("Carla Gómez");
  });

  it("cada estado sale con el mismo label que el badge de la pantalla", () => {
    const expected: Record<RenewalStatus, string> = {
      renovo: "Renovó",
      volvio_tarde: "Volvió tarde",
      pausada: "Pausada",
      no_renovo: "No renueva",
      en_proceso: "En proceso",
    };
    expect(RENEWAL_STATUS_LABELS).toEqual(expected);

    const statuses = Object.keys(expected) as RenewalStatus[];
    const workbook = buildRenewalsWorkbook(
      makeResult(statuses.map((status) => makeRow({ status }))),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    statuses.forEach((status, i) => {
      expect(cell(sheet, "Estado", i + 1)).toBe(expected[status]);
    });
  });

  it("celular: el normalizado si existe, si no el crudo, si no vacío", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({ phone: "2235550000", phoneE164: "+5492235550000" }),
        makeRow({ phone: "555", phoneE164: null }),
        makeRow({ phone: null, phoneE164: null }),
      ]),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    expect(cell(sheet, "Celular", 1)).toBe("+5492235550000");
    expect(cell(sheet, "Celular", 2)).toBe("555");
    expect(cell(sheet, "Celular", 3)).toBe("");
  });

  it("un texto que empieza con '=' queda como texto, no como fórmula", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({
          memberName: '=HYPERLINK("http://x")',
          lastNote: {
            content: "=1+1",
            createdAt: "2026-11-11T15:00:00.000Z",
            authorName: null,
          },
        }),
      ]),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Renovaciones");
    expect(cell(sheet, "Nombre")).toBe('=HYPERLINK("http://x")');
    expect(cell(sheet, "Observación")).toBe("=1+1");
    expect(cell(sheet, "Autor de la observación")).toBe("");
  });

  it("sin filas → solo el encabezado", () => {
    const workbook = buildRenewalsWorkbook(makeResult([]), FILTERS);
    expect(sheetOrThrow(workbook, "Renovaciones").rowCount).toBe(1);
  });
});

describe("buildRenewalsWorkbook — hoja Resumen", () => {
  it("período, tipo de actividad y sucursales (sin repetir, ordenadas)", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([
        makeRow({ branchName: "Moreno" }),
        makeRow({ branchName: "Alberti" }),
        makeRow({ branchName: "Moreno" }),
      ]),
      { ...FILTERS, activityType: "membresia" },
    );
    const sheet = sheetOrThrow(workbook, "Resumen");
    expect(summaryValue(sheet, "Período (vencimientos)")).toBe(
      "09/11/2026 al 15/11/2026",
    );
    expect(summaryValue(sheet, "Tipo de actividad")).toBe("Membresías");
    expect(summaryValue(sheet, "Sucursales con vencimientos")).toBe(
      "Alberti, Moreno",
    );
  });

  it("sin activityType → 'Todas'; aura → 'Actividades con Aura'", () => {
    const todas = buildRenewalsWorkbook(makeResult([]), FILTERS);
    expect(
      summaryValue(sheetOrThrow(todas, "Resumen"), "Tipo de actividad"),
    ).toBe("Todas");
    const aura = buildRenewalsWorkbook(makeResult([]), {
      ...FILTERS,
      activityType: "aura",
    });
    expect(
      summaryValue(sheetOrThrow(aura, "Resumen"), "Tipo de actividad"),
    ).toBe("Actividades con Aura");
  });

  it("KPIs de las tarjetas y % de renovación como fracción", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([], {
        total: 10,
        renovo: 4,
        volvioTarde: 1,
        noRenovo: 1,
        enProceso: 3,
        sinContactar: 2,
        pausadas: 1,
        paraCerrar: 1,
        renewalRate: (4 / 6) * 100,
      }),
      FILTERS,
    );
    const sheet = sheetOrThrow(workbook, "Resumen");
    expect(summaryValue(sheet, "Vencimientos")).toBe(10);
    expect(summaryValue(sheet, "Renovó")).toBe(4);
    expect(summaryValue(sheet, "En proceso")).toBe(3);
    expect(summaryValue(sheet, "Sin contactar")).toBe(2);
    expect(summaryValue(sheet, "Para cerrar")).toBe(1);
    expect(summaryValue(sheet, "Pausadas")).toBe(1);
    expect(summaryValue(sheet, "No renueva")).toBe(1);
    expect(summaryValue(sheet, "Volvió tarde")).toBe(1);
    expect(summaryValue(sheet, "% Renovación (sobre gestionados)")).toBeCloseTo(
      4 / 6,
      5,
    );
  });

  it("sin gestionados → % de renovación '—' y sin bloque de plan nuevo", () => {
    const workbook = buildRenewalsWorkbook(makeResult([]), FILTERS);
    const sheet = sheetOrThrow(workbook, "Resumen");
    expect(summaryValue(sheet, "% Renovación (sobre gestionados)")).toBe("—");
    expect(summaryValue(sheet, "Sucursales con vencimientos")).toBe("—");
    expect(
      summaryRows(sheet).some(
        (r) => r[0] === "Plan nuevo (entre renovaciones)",
      ),
    ).toBe(false);
  });

  it("distribución de plan nuevo: cantidad y % como fracción", () => {
    const workbook = buildRenewalsWorkbook(
      makeResult([], {
        newPlanDistribution: [
          { planId: 1, planName: "Flex", count: 3, percentage: 75 },
          { planId: 2, planName: "Foundation", count: 1, percentage: 25 },
        ],
      }),
      FILTERS,
    );
    const rows = summaryRows(sheetOrThrow(workbook, "Resumen"));
    expect(rows.find((r) => r[0] === "Flex")).toEqual(["Flex", 3, 0.75]);
    expect(rows.find((r) => r[0] === "Foundation")).toEqual([
      "Foundation",
      1,
      0.25,
    ]);
  });
});
