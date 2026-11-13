/**
 * GET /api/admin/reports/multibranch-reassignments/export — el histórico de
 * recategorizaciones multisucursal como Excel (pedido del dueño, 2026-11-13).
 *
 * Integración (MySQL real) sobre `branch_reassignments` + unitarios del armado
 * del libro. Se verifica: el libro total (hoja "Total" + una por mes, la más
 * nueva primero), el export de un mes, los valores de las celdas leídos con
 * exceljs, `month` mal formado (400), los mismos 403 que la ruta JSON, el
 * candado de país y el aislamiento entre gimnasios.
 *
 * Las fechas de los eventos se arman relativas a HOY (día 1, 07:00 UTC del mes
 * actual / anterior / de hace 3 meses) para que la ventana de 12 meses no
 * envejezca y los meses nunca se colapsen en uno.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Workbook } from "exceljs";
import type { CellValue, Worksheet } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  buildReassignmentsWorkbook,
  groupReassignmentRowsByMonth,
  reassignmentMonthLabel,
  reassignmentsExportFilename,
} from "../../src/modules/reports/multibranch-reassignments-excel";
import type { MultibranchReassignmentRow } from "../../src/modules/reports/types";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const URL = "/api/admin/reports/multibranch-reassignments";
const EXPORT_URL = `${URL}/export`;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Día 1, 07:00 UTC (la hora del cron) de hace `monthsAgo` meses. */
function cronDate(monthsAgo: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 7, 0, 0),
  );
}

function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

/** Valores de una hoja como matriz (sin la columna 0 que exceljs deja vacía). */
function sheetRows(sheet: Worksheet): CellValue[][] {
  const out: CellValue[][] = [];
  sheet.eachRow((row) => {
    out.push((row.values as CellValue[]).slice(1));
  });
  return out;
}

function sheetOrThrow(workbook: Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Falta la hoja "${name}"`);
  return sheet;
}

const HEADERS = [
  "Fecha",
  "Alumno",
  "ID alumno",
  "Sede anterior",
  "Sede nueva",
  "Asistencias en la sede nueva",
  "Asistencias totales",
  "% en la sede nueva",
  "Origen",
];

let seq = 0;

describe("GET /reports/multibranch-reassignments/export", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let ownerToken: string;
  let adminArToken: string;
  let coachToken: string;
  let adminSedeToken: string;
  let branchA: { id: number; name: string }; // AR
  let branchB: { id: number; name: string }; // AR
  let branchEs: { id: number; name: string }; // ES

  async function insertBranch(
    country: "AR" | "ES",
    label: string,
  ): Promise<{ id: number; name: string }> {
    seq += 1;
    const name = `Sede ${label} ${seq}`;
    const [row] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(CTX_TEMPLO, {
          name,
          code: `RMX-${label}-${seq}-${Date.now().toString(36)}`,
          country,
          timezone:
            country === "AR"
              ? "America/Argentina/Buenos_Aires"
              : "Europe/Madrid",
        }),
      )
      .$returningId();
    return { id: row.id, name };
  }

  async function insertMember(
    ctx: TenantContext,
    branchId: number,
    firstName: string,
    lastName: string,
  ): Promise<number> {
    seq += 1;
    const [row] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(ctx, {
          email: `rmx-${seq}-${Date.now()}@test.com`,
          passwordHash: "x",
          firstName,
          lastName,
          role: "member" as const,
          branchId,
        }),
      )
      .$returningId();
    return row.id;
  }

  async function insertEvent(
    ctx: TenantContext,
    e: {
      memberId: number;
      fromBranchId: number | null;
      toBranchId: number;
      toBranchAttendances?: number;
      totalAttendances?: number;
      source?: "cron" | "backfill";
      reassignedAt: Date;
    },
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.branchReassignments)
      .values(
        tenantValues(ctx, {
          memberId: e.memberId,
          fromBranchId: e.fromBranchId,
          toBranchId: e.toBranchId,
          toBranchAttendances: e.toBranchAttendances ?? 8,
          totalAttendances: e.totalAttendances ?? 10,
          source: e.source ?? ("cron" as const),
          reassignedAt: e.reassignedAt,
        }),
      )
      .$returningId();
    return row.id;
  }

  async function exportXlsx(
    token: string,
    query = "",
  ): Promise<{ workbook: Workbook; headers: Record<string, unknown> }> {
    const res = await app.inject({
      method: "GET",
      url: `${EXPORT_URL}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const workbook = new Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    return { workbook, headers: res.headers };
  }

  /**
   * Siembra 4 eventos de El Templo en 3 meses distintos:
   *   mes actual  — Ana (cron 8/10, A→B) y Beto (backfill 0/0, sin origen)
   *   mes anterior — Carla (cron 5/6, B→A)
   *   hace 3 meses — Dani (cron 1/4, A→B)
   */
  async function seedHistory(): Promise<{
    ana: number;
    beto: number;
    carla: number;
    dani: number;
  }> {
    const ana = await insertMember(CTX_TEMPLO, branchB.id, "Ana", "Pérez");
    const beto = await insertMember(CTX_TEMPLO, branchA.id, "Beto", "Gómez");
    const carla = await insertMember(CTX_TEMPLO, branchA.id, "Carla", "Díaz");
    const dani = await insertMember(CTX_TEMPLO, branchB.id, "Dani", "Ruiz");
    await insertEvent(CTX_TEMPLO, {
      memberId: ana,
      fromBranchId: branchA.id,
      toBranchId: branchB.id,
      toBranchAttendances: 8,
      totalAttendances: 10,
      source: "cron",
      reassignedAt: cronDate(0),
    });
    await insertEvent(CTX_TEMPLO, {
      memberId: beto,
      fromBranchId: null,
      toBranchId: branchA.id,
      toBranchAttendances: 0,
      totalAttendances: 0,
      source: "backfill",
      reassignedAt: new Date(cronDate(0).getTime() - 60_000),
    });
    await insertEvent(CTX_TEMPLO, {
      memberId: carla,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      toBranchAttendances: 5,
      totalAttendances: 6,
      source: "cron",
      reassignedAt: cronDate(1),
    });
    await insertEvent(CTX_TEMPLO, {
      memberId: dani,
      fromBranchId: branchA.id,
      toBranchId: branchB.id,
      toBranchAttendances: 1,
      totalAttendances: 4,
      source: "cron",
      reassignedAt: cronDate(3),
    });
    return { ana, beto, carla, dani };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    branchA = await insertBranch("AR", "A");
    branchB = await insertBranch("AR", "B");
    branchEs = await insertBranch("ES", "ES");

    await createStaffUser(app, {
      email: "owner-rmx@test.com",
      password: "ownerpass123",
      firstName: "Owner",
      lastName: "RMX",
      role: "owner",
      branchId: branchA.id,
    });
    await createStaffUser(app, {
      email: "admin-ar-rmx@test.com",
      password: "adminpass123",
      firstName: "Admin",
      lastName: "AR",
      role: "admin",
      branchId: branchA.id,
      country: "AR",
    });
    await createStaffUser(app, {
      email: "coach-rmx@test.com",
      password: "coachpass123",
      firstName: "Coach",
      lastName: "RMX",
      role: "coach",
      branchId: branchA.id,
    });
    await createStaffUser(app, {
      email: "admin-sede-rmx@test.com",
      password: "sedepass123",
      firstName: "Sede",
      lastName: "RMX",
      role: "admin_sede",
      branchId: branchA.id,
    });
    ownerToken = await getAuthToken(app, "owner-rmx@test.com", "ownerpass123");
    adminArToken = await getAuthToken(
      app,
      "admin-ar-rmx@test.com",
      "adminpass123",
    );
    coachToken = await getAuthToken(app, "coach-rmx@test.com", "coachpass123");
    adminSedeToken = await getAuthToken(
      app,
      "admin-sede-rmx@test.com",
      "sedepass123",
    );

    gym2 = await seedSecondTenant(app);
  });

  beforeEach(async () => {
    await app.db
      .delete(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_TEMPLO));
    await app.db
      .delete(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_DOS));
  });

  afterAll(async () => {
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  it("sin month: hoja Total con todos los eventos + una hoja por mes, la más nueva primero", async () => {
    await seedHistory();

    const { workbook, headers } = await exportXlsx(ownerToken);

    expect(headers["content-type"]).toContain(XLSX_MIME);
    expect(headers["content-disposition"]).toBe(
      `attachment; filename="recategorizaciones-total-${todayUtc()}.xlsx"`,
    );

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Total",
      reassignmentMonthLabel(monthKeyOf(cronDate(0))),
      reassignmentMonthLabel(monthKeyOf(cronDate(1))),
      reassignmentMonthLabel(monthKeyOf(cronDate(3))),
    ]);

    const total = sheetRows(sheetOrThrow(workbook, "Total"));
    expect(total[0]).toEqual([...HEADERS, "Mes"]);
    expect(total).toHaveLength(1 + 4); // encabezado + 4 eventos
    // Más nuevo primero: Ana (día 1 07:00) antes que Beto (1 minuto antes).
    expect(total.slice(1).map((r) => r[1])).toEqual([
      "Ana Pérez",
      "Beto Gómez",
      "Carla Díaz",
      "Dani Ruiz",
    ]);

    // Una hoja por mes con SUS eventos.
    const nombres = (name: string): CellValue[] =>
      sheetRows(sheetOrThrow(workbook, name))
        .slice(1)
        .map((r) => r[1]);
    expect(nombres(reassignmentMonthLabel(monthKeyOf(cronDate(0))))).toEqual([
      "Ana Pérez",
      "Beto Gómez",
    ]);
    expect(nombres(reassignmentMonthLabel(monthKeyOf(cronDate(1))))).toEqual([
      "Carla Díaz",
    ]);
    expect(nombres(reassignmentMonthLabel(monthKeyOf(cronDate(3))))).toEqual([
      "Dani Ruiz",
    ]);
  });

  it("los valores de cada fila: fecha de Excel, sede anterior/nueva, asistencias, % numérico y origen", async () => {
    const { ana, beto } = await seedHistory();

    const { workbook } = await exportXlsx(ownerToken);
    const sheet = sheetOrThrow(workbook, "Total");

    // Ana: cron, 8 de 10 → 80 %.
    const filaAna = sheet.getRow(2);
    const fecha = filaAna.getCell(1).value;
    expect(fecha).toBeInstanceOf(Date);
    expect((fecha as Date).toISOString()).toBe(
      new Date(
        Date.UTC(cronDate(0).getUTCFullYear(), cronDate(0).getUTCMonth(), 1),
      ).toISOString(),
    );
    expect(filaAna.getCell(1).numFmt).toBe("dd/mm/yyyy");
    expect(filaAna.getCell(2).value).toBe("Ana Pérez");
    expect(filaAna.getCell(3).value).toBe(ana);
    expect(filaAna.getCell(4).value).toBe(branchA.name);
    expect(filaAna.getCell(5).value).toBe(branchB.name);
    expect(filaAna.getCell(6).value).toBe(8);
    expect(filaAna.getCell(7).value).toBe(10);
    expect(filaAna.getCell(8).value).toBeCloseTo(0.8, 10);
    expect(filaAna.getCell(8).numFmt).toBe("0%");
    expect(filaAna.getCell(9).value).toBe("Automático");
    expect(filaAna.getCell(10).value).toBe(
      reassignmentMonthLabel(monthKeyOf(cronDate(0))),
    );

    // Beto: backfill, sin sede de origen y 0 asistencias → "—" y sin porcentaje.
    const filaBeto = sheet.getRow(3);
    expect(filaBeto.getCell(3).value).toBe(beto);
    expect(filaBeto.getCell(4).value).toBe("—");
    expect(filaBeto.getCell(5).value).toBe(branchA.name);
    expect(filaBeto.getCell(6).value).toBe(0);
    expect(filaBeto.getCell(7).value).toBe(0);
    const pct = filaBeto.getCell(8).value;
    expect(pct === null || pct === "" || pct === undefined).toBe(true);
    expect(filaBeto.getCell(9).value).toBe("Reconstruido");
  });

  it("el total del Excel trae exactamente las filas de la ruta JSON", async () => {
    await seedHistory();

    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const json = JSON.parse(res.body) as MultibranchReassignmentRow[];
    const { workbook } = await exportXlsx(ownerToken);

    const total = sheetRows(sheetOrThrow(workbook, "Total")).slice(1);
    expect(total.map((r) => r[2])).toEqual(json.map((r) => r.memberId));
  });

  it("con month=AAAA-MM: solo la hoja de ese mes, con solo sus eventos", async () => {
    await seedHistory();
    const key = monthKeyOf(cronDate(0));

    const { workbook, headers } = await exportXlsx(ownerToken, `?month=${key}`);

    expect(headers["content-disposition"]).toBe(
      `attachment; filename="recategorizaciones-${key}.xlsx"`,
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      reassignmentMonthLabel(key),
    ]);
    const rows = sheetRows(workbook.worksheets[0]);
    expect(rows[0]).toEqual(HEADERS); // sin la columna "Mes"
    expect(rows.slice(1).map((r) => r[1])).toEqual(["Ana Pérez", "Beto Gómez"]);
  });

  it("month de un mes sin eventos devuelve la hoja con solo el encabezado", async () => {
    await seedHistory();
    const key = monthKeyOf(cronDate(2)); // sin eventos

    const { workbook } = await exportXlsx(ownerToken, `?month=${key}`);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      reassignmentMonthLabel(key),
    ]);
    expect(sheetRows(workbook.worksheets[0])).toEqual([HEADERS]);
  });

  it("respeta months: acota el período del libro total", async () => {
    await seedHistory();

    const { workbook } = await exportXlsx(ownerToken, "?months=2");

    expect(workbook.worksheets).toHaveLength(1 + 2); // Total + mes actual + anterior
    expect(sheetRows(sheetOrThrow(workbook, "Total"))).toHaveLength(1 + 3);
  });

  it("sin eventos devuelve un libro con la hoja Total vacía", async () => {
    const { workbook } = await exportXlsx(ownerToken);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Total"]);
    expect(sheetRows(workbook.worksheets[0])).toEqual([[...HEADERS, "Mes"]]);
  });

  it("rechaza un month mal formado con 400", async () => {
    for (const month of ["2026-13", "2026-00", "2026-1", "202611", "abc", ""]) {
      const res = await app.inject({
        method: "GET",
        url: `${EXPORT_URL}?month=${month}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode, `month=${month}`).toBe(400);
    }
  });

  it("rechaza months fuera de 1..24 con 400", async () => {
    for (const q of ["months=0", "months=25", "months=abc"]) {
      const res = await app.inject({
        method: "GET",
        url: `${EXPORT_URL}?${q}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode, q).toBe(400);
    }
  });

  it("coach recibe 403 (gate CAJA_ROLES)", async () => {
    const res = await app.inject({
      method: "GET",
      url: EXPORT_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin_sede recibe 403 (la vista es de todas las sedes), con y sin month", async () => {
    for (const q of ["", `?month=${monthKeyOf(cronDate(0))}`]) {
      const res = await app.inject({
        method: "GET",
        url: `${EXPORT_URL}${q}`,
        headers: { authorization: `Bearer ${adminSedeToken}` },
      });
      expect(res.statusCode, q).toBe(403);
    }
  });

  it("sin token recibe 401", async () => {
    const res = await app.inject({ method: "GET", url: EXPORT_URL });
    expect(res.statusCode).toBe(401);
  });

  it("candado de país: un admin (no owner) exporta solo las recategorizaciones hacia sedes de su país; el owner exporta todas", async () => {
    const m = await insertMember(CTX_TEMPLO, branchA.id, "Eva", "Sanz");
    await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      reassignedAt: cronDate(0),
    });
    await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: null,
      toBranchId: branchEs.id,
      reassignedAt: new Date(cronDate(0).getTime() - 60_000),
    });

    const admin = await exportXlsx(adminArToken);
    const owner = await exportXlsx(ownerToken);

    const sedesNuevas = (wb: Workbook): CellValue[] =>
      sheetRows(sheetOrThrow(wb, "Total"))
        .slice(1)
        .map((r) => r[4]);
    expect(sedesNuevas(admin.workbook)).toEqual([branchA.name]);
    expect(sedesNuevas(owner.workbook)).toEqual([branchA.name, branchEs.name]);
  });

  it("aislamiento: el Excel de El Templo no trae eventos del gimnasio 2 (y viceversa)", async () => {
    const mTemplo = await insertMember(
      CTX_TEMPLO,
      branchA.id,
      "Facu",
      "Templo",
    );
    await insertEvent(CTX_TEMPLO, {
      memberId: mTemplo,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      reassignedAt: cronDate(0),
    });
    // Evento del gimnasio 2: alumno y sede del gimnasio 2.
    await insertEvent(CTX_DOS, {
      memberId: gym2.socios[0].id,
      fromBranchId: null,
      toBranchId: gym2.branchId,
      reassignedAt: cronDate(0),
    });

    const templo = await exportXlsx(ownerToken);
    const filasTemplo = sheetRows(sheetOrThrow(templo.workbook, "Total")).slice(
      1,
    );
    expect(filasTemplo.map((r) => r[1])).toEqual(["Facu Templo"]);
    expect(filasTemplo.map((r) => r[2])).not.toContain(gym2.socios[0].id);

    // Control positivo: el gimnasio 2 sí tiene su evento, y su propio staff
    // lo exporta sin ver el de El Templo.
    const [fila] = await app.db
      .select({ tenantId: schema.branchReassignments.tenantId })
      .from(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_DOS));
    expect(fila.tenantId).toBe(TENANT_DOS);
    const dos = await exportXlsx(gym2.adminToken);
    const filasDos = sheetRows(sheetOrThrow(dos.workbook, "Total")).slice(1);
    expect(filasDos.map((r) => r[2])).toEqual([gym2.socios[0].id]);
    expect(filasDos.map((r) => r[1])).not.toContain("Facu Templo");
  });
});

describe("armado del libro (puro)", () => {
  const row = (
    id: number,
    iso: string,
    overrides: Partial<MultibranchReassignmentRow> = {},
  ): MultibranchReassignmentRow => ({
    id,
    memberId: 100 + id,
    memberName: `Alumno ${id}`,
    fromBranchId: 1,
    fromBranchName: "Alberti",
    toBranchId: 2,
    toBranchName: "Moreno",
    toBranchAttendances: 3,
    totalAttendances: 4,
    source: "cron",
    reassignedAt: iso,
    ...overrides,
  });

  it("agrupa por mes UTC, el más nuevo primero, conservando el orden dentro del mes", () => {
    const groups = groupReassignmentRowsByMonth([
      row(1, "2026-11-01T07:00:00.000Z"),
      row(2, "2026-10-31T23:59:59.000Z"),
      row(3, "2026-10-01T07:00:00.000Z"),
      row(4, "2026-01-01T00:00:00.000Z"),
    ]);

    expect(
      groups.map((g) => [g.key, g.label, g.rows.map((r) => r.id)]),
    ).toEqual([
      ["2026-11", "Noviembre 2026", [1]],
      ["2026-10", "Octubre 2026", [2, 3]],
      ["2026-01", "Enero 2026", [4]],
    ]);
  });

  it("la fecha de la celda es el día UTC del evento (sin corrimiento de huso)", () => {
    const wb = buildReassignmentsWorkbook([row(1, "2026-11-01T07:00:00.000Z")]);
    const value = sheetOrThrow(wb, "Total").getRow(2).getCell(1).value;
    expect((value as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("los nombres de archivo: total con la fecha de hoy, mes sin fecha", () => {
    expect(reassignmentsExportFilename(undefined, "2026-11-13")).toBe(
      "recategorizaciones-total-2026-11-13.xlsx",
    );
    expect(reassignmentsExportFilename("2026-11", "2026-11-13")).toBe(
      "recategorizaciones-2026-11.xlsx",
    );
  });

  it("un texto con aspecto de fórmula viaja como texto (no se evalúa)", () => {
    const wb = buildReassignmentsWorkbook([
      row(1, "2026-11-01T07:00:00.000Z", { memberName: "=1+1" }),
    ]);
    const cell = sheetOrThrow(wb, "Total").getRow(2).getCell(2);
    expect(cell.value).toBe("=1+1");
    expect(cell.type).not.toBe(6); // ValueType.Formula
  });
});
