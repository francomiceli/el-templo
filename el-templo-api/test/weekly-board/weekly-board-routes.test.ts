/**
 * Tablero semanal (fase 206, plan 06) — integración HTTP de
 * `GET /api/admin/weekly-board` y `PUT /api/admin/weekly-board/leads`.
 *
 * Cubre el armado por sede, la columna Online, los grupos por país, foto vs
 * vivo, semanas provisorias / sin foto, la variación de activos y la carga de
 * leads (D-05, D-08, D-11, D-15, D-16, D-21, D-22, D-24, D-25, D-26).
 *
 * Reglas del archivo:
 *   - Las semanas salen de `boardWeeks()` (nunca helpers de fecha en UTC ni fake timers).
 *   - Los estados ("provisorio", "congelado", "sin_foto") se derivan de la
 *     PRESENCIA de la foto y de offsets de semana, no del día en que corre CI.
 *   - Los asserts van sobre las sedes del fixture: la base de test ya trae sedes
 *     de las migraciones, así que los totales se comparan contra la suma de las
 *     columnas del grupo, no contra números absolutos.
 *   - Sin ids de `users` hardcodeados: el owner es `admin@test.com`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { instantAtAr } from "../../src/modules/weekly-board/week";
import type {
  BoardCell,
  BoardGroup,
  BoardMetric,
  BoardMetricKey,
  WeeklyBoardResponse,
} from "../../src/modules/weekly-board/types";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  seedActiveMember,
  seedIncome,
  seedTrialBooking,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

const BASE = "/api/admin/weekly-board";
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

/** Fila de la planilla por clave; falla con mensaje claro si no está. */
function metric(res: WeeklyBoardResponse, key: BoardMetricKey): BoardMetric {
  const found = res.metrics.find((m) => m.key === key);
  if (!found) throw new Error(`Falta la métrica ${key} en la respuesta`);
  return found;
}

/** Celda de una sede; falla con mensaje claro si no está. */
function branchCell(m: BoardMetric, branchId: number): BoardCell {
  const found = m.byBranch[String(branchId)];
  if (!found) {
    throw new Error(`Falta la celda de la sede ${branchId} en ${m.key}`);
  }
  return found;
}

/** Grupo de un país; falla con mensaje claro si no está. */
function groupOf(res: WeeklyBoardResponse, country: string): BoardGroup {
  const found = res.groups.find((g) => g.country === country);
  if (!found) throw new Error(`Falta el grupo ${country} en la respuesta`);
  return found;
}

describe("Tablero semanal — rutas (armado, Online, fotos y leads)", () => {
  let app: FastifyInstance;
  let token: string;
  let branches: BoardBranches;
  let weeks: BoardWeeks;
  let adminId: number;

  const auth = (): Record<string, string> => ({
    authorization: `Bearer ${token}`,
  });

  async function getBoard(
    weekStart?: string,
  ): Promise<{ status: number; body: WeeklyBoardResponse }> {
    const res = await app.inject({
      method: "GET",
      url: weekStart ? `${BASE}?weekStart=${weekStart}` : BASE,
      headers: auth(),
    });
    return { status: res.statusCode, body: res.json<WeeklyBoardResponse>() };
  }

  async function putLeads(payload: Record<string, unknown>): Promise<{
    status: number;
    body: { leads?: number | null };
  }> {
    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/leads`,
      headers: auth(),
      payload,
    });
    return { status: res.statusCode, body: res.json() };
  }

  /** Siembra un cobro firme de un alumno de `memberBranchId` en el día `date`. */
  async function seedCobro(
    memberBranchId: number,
    amount: number,
    currency: "ARS" | "EUR",
    date: string,
  ): Promise<void> {
    const memberId = await seedBoardMember(app, { branchId: memberBranchId });
    await seedIncome(app, {
      memberId,
      cobroBranchId: memberBranchId,
      amount,
      currency,
      transactionDate: date,
      state: "firme",
    });
  }

  /**
   * Foto completa (bloque principal y tardío) de una semana cerrada para una
   * sede. Los sellos van al lunes siguiente 00:05 AR (en tiempo para ambos).
   */
  async function seedPhoto(
    branchId: number,
    weekStart: string,
    values: { cobrado: number; activos: number },
  ): Promise<void> {
    const closedAt = instantAtAr(addDays(weekStart, 7), "00:05");
    await app.db.insert(schema.weeklyBoardSnapshots).values(
      tenantValues(TEMPLO_CTX, {
        weekStart,
        branchId,
        currency: "ARS",
        cobrado: values.cobrado,
        deudaCobrable: 0,
        deudaMas10: 0,
        deudaIncobrable: 0,
        activos: values.activos,
        vencenSemanaSiguiente: 0,
        mainClosedAt: closedAt,
        reservas: 0,
        reservasOcurridas: 0,
        asistieron: 0,
        compraron: 0,
        compraronOcurridas: 0,
        compraronAsistieron: 0,
        vencimientos: 0,
        renovaron: 0,
        noRenueva: 0,
        volvioTarde: 0,
        sinContactar: 0,
        lateClosedAt: closedAt,
      }),
    );
  }

  async function countLeadRows(
    branchId: number,
    weekStart: string,
  ): Promise<number> {
    const [row] = await app.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.weeklyBoardLeads)
      .where(
        and(
          tenantWhere(schema.weeklyBoardLeads, TEMPLO_CTX),
          eq(schema.weeklyBoardLeads.branchId, branchId),
          eq(schema.weeklyBoardLeads.weekStart, weekStart),
        ),
      );
    return Number(row.n);
  }

  beforeAll(async () => {
    app = await createTestApp();
    weeks = boardWeeks();
    await cleanAllTestData(app);
    branches = await seedBoardBranches(app);
    token = await getAuthToken(app, "admin@test.com", "adminpass123");
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
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanupBoardBranches(
      app,
      Object.values(branches).map((b) => b.id),
    );
    await app.close();
  });

  beforeEach(async () => {
    // `cleanAllTestData` también vacía las tablas del Tablero (fotos y leads).
    await cleanAllTestData(app);
  });

  // ─── Default y validación ───────────────────────────────────────────────

  it("sin weekStart devuelve la semana en curso y rechaza con 400 lo que no es un lunes pasado o actual", async () => {
    const def = await getBoard();
    expect(def.status).toBe(200);
    expect(def.body.weekStart).toBe(weeks.current);
    expect(def.body.isCurrentWeek).toBe(true);
    expect(def.body.previousWeekStart).toBe(weeks.last);

    // Martes: no empieza en lunes.
    expect((await getBoard(addDays(weeks.current, 1))).status).toBe(400);
    // Semana futura.
    expect((await getBoard(weeks.next)).status).toBe(400);
    // Fecha imposible (el pattern de AJV la deja pasar, el servicio la rechaza).
    expect((await getBoard("2026-13-01")).status).toBe(400);
    // Basura: no cumple el pattern de AJV.
    expect((await getBoard("manana")).status).toBe(400);
  });

  // ─── Columnas ───────────────────────────────────────────────────────────

  it("las columnas son las sedes físicas activas por país y la virtual va en Online", async () => {
    const { body } = await getBoard();

    expect(body.groups[0].country).toBe("AR");
    const ar = groupOf(body, "AR");
    const arIds = ar.branches.map((b) => b.id);
    expect(arIds).toContain(branches.arA.id);
    expect(arIds).toContain(branches.arB.id);
    expect(arIds).not.toContain(branches.inactiveAr.id);
    expect(arIds).not.toContain(branches.virtualAr.id);

    // Exactamente las sedes activas no virtuales de AR del gimnasio.
    const expected = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.country, "AR"),
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        ),
      );
    expect([...arIds].sort((a, b) => a - b)).toEqual(
      expected.map((b) => b.id).sort((a, b) => a - b),
    );

    expect(ar.online?.branchIds).toContain(branches.virtualAr.id);
    expect(ar.online?.label).toBe("Online");
    expect(ar.hasTotal).toBe(true);

    const es = groupOf(body, "ES");
    expect(es.currency).toBe("EUR");
    expect(es.branches.map((b) => b.id)).toContain(branches.es.id);
  });

  // ─── Total y Online ─────────────────────────────────────────────────────

  it("el Total AR suma solo sedes físicas AR: Online y España quedan afuera", async () => {
    await seedCobro(branches.arA.id, 1000, "ARS", weeks.current);
    await seedCobro(branches.arB.id, 500, "ARS", weeks.current);
    await seedCobro(branches.virtualAr.id, 300, "ARS", weeks.current);
    await seedCobro(branches.es.id, 80, "EUR", weeks.current);

    const { body } = await getBoard();
    const cobrado = metric(body, "cobrado");
    const ar = groupOf(body, "AR");

    expect(branchCell(cobrado, branches.arA.id).value).toBe(1000);
    expect(branchCell(cobrado, branches.arB.id).value).toBe(500);

    const physicalSum = ar.branches.reduce(
      (acc, b) => acc + (branchCell(cobrado, b.id).value ?? 0),
      0,
    );
    expect(physicalSum).toBeGreaterThanOrEqual(1500);
    // Online (300) NO forma parte del Total AR.
    expect(cobrado.totalByCountry["AR"].value).toBe(physicalSum);
    expect(cobrado.onlineByCountry["AR"].value).toBe(300);
    // La sede virtual no es una columna propia.
    expect(cobrado.byBranch[String(branches.virtualAr.id)]).toBeUndefined();

    // España: su propio grupo en EUR, sin mezclarse con AR.
    expect(branchCell(cobrado, branches.es.id).value).toBe(80);
    expect(cobrado.totalByCountry["ES"].value).toBe(80);
  });

  // ─── % desde conteos ────────────────────────────────────────────────────

  it("los porcentajes se calculan desde los conteos sumados del grupo (no promedian promedios)", async () => {
    const day = addDays(weeks.last, 1);
    // arA: 1 reserva ocurrida y asistida. arB: 3 ocurridas sin asistencia.
    await seedTrialBooking(app, {
      branchId: branches.arA.id,
      bookingDate: day,
      attended: "si",
      won: false,
    });
    for (let i = 0; i < 3; i++) {
      await seedTrialBooking(app, {
        branchId: branches.arB.id,
        bookingDate: day,
        attended: "no",
        won: false,
      });
    }

    const { status, body } = await getBoard(weeks.last);
    expect(status).toBe(200);
    expect(
      branchCell(metric(body, "pctAsistencia"), branches.arA.id).value,
    ).toBe(100);
    expect(
      branchCell(metric(body, "pctAsistencia"), branches.arB.id).value,
    ).toBe(0);

    const totalAsistieron = metric(body, "asistieron").totalByCountry["AR"];
    const totalReservas = metric(body, "reservas").totalByCountry["AR"];
    expect(totalAsistieron.value).not.toBeNull();
    expect(totalReservas.value).not.toBeNull();
    // Las 4 pruebas sembradas son las únicas de la base (la limpieza vacía el resto).
    expect(totalReservas.value).toBe(4);
    // Todas las clases son pasadas: reservas ocurridas = reservas.
    const expectedPct =
      ((totalAsistieron.value ?? 0) / (totalReservas.value ?? 1)) * 100;
    const totalPct = metric(body, "pctAsistencia").totalByCountry["AR"];
    expect(totalPct.value).toBeCloseTo(expectedPct, 1);
    // 1 de 4 = 25, y no el 50 de promediar 100 y 0.
    expect(totalPct.value).toBeCloseTo(25, 1);
  });

  // ─── Leads y % Reserva ──────────────────────────────────────────────────

  it("leads: sin carga es null, el PUT guarda, actualiza una sola fila y null borra", async () => {
    const before = await getBoard();
    expect(
      branchCell(metric(before.body, "leads"), branches.arA.id).value,
    ).toBeNull();
    expect(
      branchCell(metric(before.body, "pctReserva"), branches.arA.id).value,
    ).toBeNull();

    const created = await putLeads({
      branchId: branches.arA.id,
      weekStart: weeks.current,
      leads: 10,
    });
    expect(created.status).toBe(200);
    expect(created.body.leads).toBe(10);

    const afterCreate = await getBoard();
    expect(
      branchCell(metric(afterCreate.body, "leads"), branches.arA.id).value,
    ).toBe(10);

    const updated = await putLeads({
      branchId: branches.arA.id,
      weekStart: weeks.current,
      leads: 12,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.leads).toBe(12);
    expect(await countLeadRows(branches.arA.id, weeks.current)).toBe(1);
    const afterUpdate = await getBoard();
    expect(
      branchCell(metric(afterUpdate.body, "leads"), branches.arA.id).value,
    ).toBe(12);

    // El updated_by queda registrado (auditoría del PUT).
    const [row] = await app.db
      .select({ updatedBy: schema.weeklyBoardLeads.updatedBy })
      .from(schema.weeklyBoardLeads)
      .where(
        and(
          tenantWhere(schema.weeklyBoardLeads, TEMPLO_CTX),
          eq(schema.weeklyBoardLeads.branchId, branches.arA.id),
          eq(schema.weeklyBoardLeads.weekStart, weeks.current),
        ),
      );
    expect(row.updatedBy).toBe(adminId);

    const removed = await putLeads({
      branchId: branches.arA.id,
      weekStart: weeks.current,
      leads: null,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.leads).toBeNull();
    expect(await countLeadRows(branches.arA.id, weeks.current)).toBe(0);
    const afterDelete = await getBoard();
    expect(
      branchCell(metric(afterDelete.body, "leads"), branches.arA.id).value,
    ).toBeNull();
  });

  it("% Reserva = reservas / leads x 100 con los leads cargados en la semana anterior", async () => {
    await seedTrialBooking(app, {
      branchId: branches.arA.id,
      bookingDate: addDays(weeks.last, 1),
      attended: "si",
      won: false,
    });
    const saved = await putLeads({
      branchId: branches.arA.id,
      weekStart: weeks.last,
      leads: 10,
    });
    expect(saved.status).toBe(200);

    const { body } = await getBoard(weeks.last);
    const reservas = branchCell(
      metric(body, "reservas"),
      branches.arA.id,
    ).value;
    expect(reservas).toBe(1);
    expect(branchCell(metric(body, "pctReserva"), branches.arA.id).value).toBe(
      10,
    );
    // Sin leads en arB: "—" y no 0 %.
    expect(
      branchCell(metric(body, "pctReserva"), branches.arB.id).value,
    ).toBeNull();
  });

  it("PUT /leads valida la ventana, el lunes, el tipo de sede y los valores", async () => {
    const ok = (weekStart: string): Record<string, unknown> => ({
      branchId: branches.arA.id,
      weekStart,
      leads: 5,
    });

    // Semana anterior: dentro de la ventana.
    expect((await putLeads(ok(weeks.last))).status).toBe(200);
    // Hace dos semanas: fuera de la ventana (D-24).
    expect((await putLeads(ok(weeks.lastMinus1))).status).toBe(400);
    // Futura.
    expect((await putLeads(ok(weeks.next))).status).toBe(400);
    // Martes.
    expect((await putLeads(ok(addDays(weeks.current, 1)))).status).toBe(400);
    // Sede virtual y sede inactiva: no son columnas con leads.
    expect(
      (
        await putLeads({
          branchId: branches.virtualAr.id,
          weekStart: weeks.current,
          leads: 5,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await putLeads({
          branchId: branches.inactiveAr.id,
          weekStart: weeks.current,
          leads: 5,
        })
      ).status,
    ).toBe(400);
    // Valores inválidos: negativo, decimal, texto, fuera de rango.
    for (const leads of [-1, 1.5, "abc", 100001]) {
      expect(
        (
          await putLeads({
            branchId: branches.arA.id,
            weekStart: weeks.current,
            leads,
          })
        ).status,
      ).toBe(400);
    }
    // Faltan campos requeridos.
    expect(
      (await putLeads({ branchId: branches.arA.id, weekStart: weeks.current }))
        .status,
    ).toBe(400);
    // Nada de lo rechazado dejó filas: solo existe la de la semana anterior.
    expect(await countLeadRows(branches.arA.id, weeks.current)).toBe(0);
    expect(await countLeadRows(branches.arA.id, weeks.lastMinus1)).toBe(0);
    expect(await countLeadRows(branches.virtualAr.id, weeks.current)).toBe(0);
  });

  it("leadsEditable es true para la semana en curso y la anterior, false para las más viejas; Online nunca tiene leads", async () => {
    expect((await getBoard(weeks.current)).body.leadsEditable).toBe(true);
    expect((await getBoard(weeks.last)).body.leadsEditable).toBe(true);
    expect((await getBoard(weeks.lastMinus1)).body.leadsEditable).toBe(false);

    await putLeads({
      branchId: branches.arA.id,
      weekStart: weeks.current,
      leads: 7,
    });
    const { body } = await getBoard();
    const leads = metric(body, "leads");
    expect(leads.onlineByCountry["AR"]?.value ?? null).toBeNull();
  });

  // ─── Foto vs vivo ───────────────────────────────────────────────────────

  it("con foto cerrada la semana se lee de la foto aunque los datos vivos cambien", async () => {
    await seedPhoto(branches.arA.id, weeks.last, {
      cobrado: 12345,
      activos: 7,
    });
    await seedPhoto(branches.arB.id, weeks.last, { cobrado: 100, activos: 2 });
    // Un cobro vivo en la semana anterior de arA: la foto gana (D-08).
    await seedCobro(branches.arA.id, 777, "ARS", addDays(weeks.last, 1));

    const { status, body } = await getBoard(weeks.last);
    expect(status).toBe(200);
    expect(branchCell(metric(body, "cobrado"), branches.arA.id).value).toBe(
      12345,
    );
    expect(branchCell(metric(body, "cobrado"), branches.arB.id).value).toBe(
      100,
    );
    expect(branchCell(metric(body, "activos"), branches.arA.id).value).toBe(7);
    expect(body.blocks.main.current).toBe("congelado");
    expect(body.blocks.late.current).toBe("congelado");
    expect(body.blocks.main.capturedAt).not.toBeNull();
    expect(body.blocks.main.capturedLate).toBe(false);
    expect(body.blocks.main.freezesOn).toBeNull();
  });

  it("sin foto, la semana anterior sale provisoria; con foto sale congelada y aporta la celda previous", async () => {
    const withoutPhoto = await getBoard();
    expect(withoutPhoto.body.blocks.main.current).toBe("en_curso");
    expect(withoutPhoto.body.blocks.main.previous).toBe("provisorio");
    expect(withoutPhoto.body.blocks.late.previous).toBe("provisorio");

    await seedPhoto(branches.arA.id, weeks.last, {
      cobrado: 12345,
      activos: 7,
    });
    const withPhoto = await getBoard();
    expect(withPhoto.body.blocks.main.current).toBe("en_curso");
    expect(withPhoto.body.blocks.main.previous).toBe("congelado");
    expect(withPhoto.body.blocks.late.previous).toBe("congelado");
    expect(
      branchCell(metric(withPhoto.body, "cobrado"), branches.arA.id).previous,
    ).toBe(12345);
  });

  // ─── Variación de activos ───────────────────────────────────────────────

  it("la variación de activos es activos vivos menos los de la foto anterior; sin foto es null", async () => {
    await seedActiveMember(app, { branchId: branches.arA.id, kind: "pago" });

    const noPhoto = await getBoard();
    expect(
      branchCell(metric(noPhoto.body, "variacionActivos"), branches.arA.id)
        .value,
    ).toBeNull();

    await seedPhoto(branches.arA.id, weeks.last, { cobrado: 0, activos: 7 });
    const { body } = await getBoard();
    const live = branchCell(metric(body, "activos"), branches.arA.id).value;
    expect(live).toBe(1);
    expect(
      branchCell(metric(body, "variacionActivos"), branches.arA.id).value,
    ).toBe((live ?? 0) - 7);
  });

  // ─── Semana vieja sin foto ──────────────────────────────────────────────

  it("una semana vieja sin foto muestra deuda y activos en null y el resto en vivo", async () => {
    const old = addDays(weeks.current, -21);
    await seedCobro(branches.arA.id, 400, "ARS", addDays(old, 1));

    const { status, body } = await getBoard(old);
    expect(status).toBe(200);
    expect(body.blocks.main.current).toBe("sin_foto");
    expect(body.blocks.late.current).toBe("sin_foto");

    for (const b of groupOf(body, "AR").branches) {
      expect(branchCell(metric(body, "deudaCobrable"), b.id).value).toBeNull();
      expect(branchCell(metric(body, "deudaMas10"), b.id).value).toBeNull();
      expect(
        branchCell(metric(body, "deudaIncobrable"), b.id).value,
      ).toBeNull();
      expect(branchCell(metric(body, "activos"), b.id).value).toBeNull();
    }
    // El cobrado sí se calcula en vivo.
    const cobradoA = branchCell(metric(body, "cobrado"), branches.arA.id);
    expect(typeof cobradoA.value).toBe("number");
    expect(cobradoA.value).toBe(400);
  });
});
