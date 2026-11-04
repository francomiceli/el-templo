/**
 * Cierre semanal del Tablero (fase 206-07): `WeeklyBoardService.closeDue` y el
 * barrido `runWeeklyBoardClose`.
 *
 * Cubre el calendario de cierre (principal desde el lunes, tardío desde el
 * viernes), la idempotencia, la foto congelada, la recuperación de una corrida
 * perdida, la semana sellada a medias y el aislamiento por gimnasio
 * (D-08, D-09, D-10, D-11, D-25, SC-8).
 *
 * Reglas del archivo:
 *   - Sin fake timers: cada `now` sale de `instantAtAr(fecha, "HH:MM")` con
 *     fechas derivadas de `boardWeeks()` (`currentWeekStart` + `addDays`). Simular
 *     un lunes o un viernes de la semana en curso es válido aunque sea futuro
 *     respecto del reloj real: los datos se siembran en la semana pasada.
 *   - Los asserts van sobre las sedes del fixture: la base de test ya trae sedes
 *     de las migraciones.
 *   - Sin ids de `users` hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { WeeklyBoardService } from "../../src/modules/weekly-board/service";
import { instantAtAr } from "../../src/modules/weekly-board/week";
import type { WeeklyBoardResponse } from "../../src/modules/weekly-board/types";
import { runWeeklyBoardClose } from "../../src/jobs/weekly-board-close";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  seedIncome,
  seedTrialBooking,
  seedExpiringMembership,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

type SnapshotRow = typeof schema.weeklyBoardSnapshots.$inferSelect;

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Tablero semanal — cierre automático (closeDue y job)", () => {
  let app: FastifyInstance;
  let service: WeeklyBoardService;
  let branches: BoardBranches;
  let weeks: BoardWeeks;

  /** Lunes de la semana en curso (W), la pasada (L) y la anterior (LL). */
  let W: string;
  let L: string;
  let LL: string;

  async function rowsOf(
    weekStart: string,
    tenantId: number = TENANT_TEMPLO,
  ): Promise<SnapshotRow[]> {
    return app.db
      .select()
      .from(schema.weeklyBoardSnapshots)
      .where(
        and(
          tenantWhere(schema.weeklyBoardSnapshots, { tenantId }),
          eq(schema.weeklyBoardSnapshots.weekStart, weekStart),
        ),
      )
      .orderBy(asc(schema.weeklyBoardSnapshots.branchId));
  }

  function rowOf(rows: SnapshotRow[], branchId: number): SnapshotRow {
    const found = rows.find((r) => r.branchId === branchId);
    if (!found) throw new Error(`Falta la fila de la sede ${branchId}`);
    return found;
  }

  /** Cobro firme de `amount` ARS de un alumno de `branchId` dentro de la semana L. */
  async function seedCobroEnL(branchId: number, amount: number): Promise<void> {
    const memberId = await seedBoardMember(app, { branchId });
    await seedIncome(app, {
      memberId,
      cobroBranchId: branchId,
      amount,
      currency: "ARS",
      transactionDate: addDays(L, 1),
      state: "firme",
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    service = new WeeklyBoardService(app.db, app.log);
    weeks = boardWeeks();
    W = weeks.current;
    L = weeks.last;
    LL = weeks.lastMinus1;
    await cleanAllTestData(app);
    branches = await seedBoardBranches(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await cleanupBoardBranches(app, [
      branches.arA.id,
      branches.arB.id,
      branches.es.id,
      branches.virtualAr.id,
      branches.inactiveAr.id,
    ]);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    // Datos de la semana pasada (L): un cobro firme de 1000 de un alumno de
    // arA, una prueba asistida y ganada en arA y un vencimiento renovado en arA.
    await seedCobroEnL(branches.arA.id, 1000);
    await seedTrialBooking(app, {
      branchId: branches.arA.id,
      bookingDate: addDays(L, 1),
      attended: "si",
      won: true,
    });
    await seedExpiringMembership(app, {
      memberBranchId: branches.arA.id,
      subBranchId: branches.arA.id,
      endDate: addDays(L, 2),
      outcome: "renovo",
    });
  });

  it("lunes 00:30: cierra el principal de L y el tardío de LL, una fila por sede activa (física y virtual) con ceros explícitos", async () => {
    const now = instantAtAr(W, "00:30");

    const closed = await service.closeDue(TEMPLO_CTX, now);

    expect(closed.main).toEqual([L]);
    expect(closed.late).toEqual([LL]);

    const rowsL = await rowsOf(L);
    const ids = rowsL.map((r) => r.branchId);
    expect(ids).toContain(branches.arA.id);
    expect(ids).toContain(branches.arB.id);
    expect(ids).toContain(branches.es.id);
    // D-25: la sede virtual también tiene su fila.
    expect(ids).toContain(branches.virtualAr.id);
    expect(ids).not.toContain(branches.inactiveAr.id);

    for (const row of rowsL) {
      expect(row.mainClosedAt?.getTime()).toBe(now.getTime());
      expect(row.lateClosedAt).toBeNull();
    }

    expect(rowOf(rowsL, branches.arA.id).cobrado).toBe(1000);
    // Cero explícito, no null.
    expect(rowOf(rowsL, branches.arB.id).cobrado).toBe(0);
    expect(rowOf(rowsL, branches.virtualAr.id).cobrado).toBe(0);
    expect(rowOf(rowsL, branches.arA.id).currency).toBe("ARS");
    expect(rowOf(rowsL, branches.es.id).currency).toBe("EUR");

    // LL: solo el tardío (D-11: no se completa la principal de semanas viejas).
    const rowsLL = await rowsOf(LL);
    expect(rowsLL.length).toBeGreaterThan(0);
    expect(rowsLL.map((r) => r.branchId)).not.toContain(branches.inactiveAr.id);
    for (const row of rowsLL) {
      expect(row.lateClosedAt?.getTime()).toBe(now.getTime());
      expect(row.mainClosedAt).toBeNull();
      expect(row.cobrado).toBeNull();
    }
  });

  it("idempotencia: una segunda corrida con el mismo now no devuelve semanas y no cambia valores ni sellos", async () => {
    const now = instantAtAr(W, "00:30");
    await service.closeDue(TEMPLO_CTX, now);
    const beforeL = await rowsOf(L);
    const beforeLL = await rowsOf(LL);

    const second = await service.closeDue(TEMPLO_CTX, now);

    expect(second).toEqual({ main: [], late: [] });
    expect(await rowsOf(L)).toEqual(beforeL);
    expect(await rowsOf(LL)).toEqual(beforeLL);
  });

  it("foto congelada: un cobro posterior no altera la foto ya tomada", async () => {
    await service.closeDue(TEMPLO_CTX, instantAtAr(W, "00:30"));
    expect(rowOf(await rowsOf(L), branches.arA.id).cobrado).toBe(1000);

    await seedCobroEnL(branches.arA.id, 500);
    const again = await service.closeDue(
      TEMPLO_CTX,
      instantAtAr(addDays(W, 1), "00:05"),
    );

    expect(again.main).toEqual([]);
    expect(rowOf(await rowsOf(L), branches.arA.id).cobrado).toBe(1000);
  });

  it("antes del viernes no hay tardío de L: el jueves 23:59 lateClosedAt sigue null", async () => {
    const closed = await service.closeDue(
      TEMPLO_CTX,
      instantAtAr(addDays(W, 3), "23:59"),
    );

    expect(closed.main).toEqual([L]);
    expect(closed.late).not.toContain(L);
    for (const row of await rowsOf(L)) {
      expect(row.lateClosedAt).toBeNull();
    }
  });

  it("viernes 00:05: congela el tardío de L (embudo y renovaciones) sin tocar el principal", async () => {
    const monday = instantAtAr(W, "00:30");
    const friday = instantAtAr(addDays(W, 4), "00:05");
    await service.closeDue(TEMPLO_CTX, monday);

    const closed = await service.closeDue(TEMPLO_CTX, friday);

    expect(closed.late).toEqual([L]);
    expect(closed.main).toEqual([]);
    const rowsL = await rowsOf(L);
    for (const row of rowsL) {
      expect(row.lateClosedAt?.getTime()).toBe(friday.getTime());
      expect(row.mainClosedAt?.getTime()).toBe(monday.getTime());
    }
    const arA = rowOf(rowsL, branches.arA.id);
    expect(arA.reservas).toBeGreaterThanOrEqual(1);
    expect(arA.compraron).toBeGreaterThanOrEqual(1);
    expect(arA.renovaron).toBe(1);
    // Cero explícito en la sede sin actividad.
    expect(rowOf(rowsL, branches.arB.id).reservas).toBe(0);
    expect(rowOf(rowsL, branches.arB.id).renovaron).toBe(0);
    // El principal no se recalcula.
    expect(arA.cobrado).toBe(1000);
  });

  it("recuperación: sin corridas previas, una corrida del miércoles cierra el principal de L y el Tablero lo marca como tomado tarde", async () => {
    const closed = await service.closeDue(
      TEMPLO_CTX,
      instantAtAr(addDays(W, 2), "10:00"),
    );
    expect(closed.main).toEqual([L]);

    const token = await getAuthToken(app, "admin@test.com", "adminpass123");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/weekly-board?weekStart=${L}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeeklyBoardResponse>();
    expect(body.blocks.main.current).toBe("congelado");
    expect(body.blocks.main.capturedLate).toBe(true);
  });

  it("una sola sede sellada: closeDue sella las restantes sin tocar la sellada", async () => {
    const earlier = instantAtAr(W, "00:05");
    await app.db.insert(schema.weeklyBoardSnapshots).values(
      tenantValues(TEMPLO_CTX, {
        weekStart: L,
        branchId: branches.arA.id,
        currency: "ARS",
        // Valor distinto del real (1000) para detectar que no se pisa.
        cobrado: 777,
        deudaCobrable: 0,
        deudaMas10: 0,
        deudaIncobrable: 0,
        activos: 0,
        vencenSemanaSiguiente: 0,
        mainClosedAt: earlier,
      }),
    );

    const now = instantAtAr(W, "00:30");
    const closed = await service.closeDue(TEMPLO_CTX, now);

    expect(closed.main).toEqual([L]);
    const rowsL = await rowsOf(L);
    const arA = rowOf(rowsL, branches.arA.id);
    expect(arA.cobrado).toBe(777);
    expect(arA.mainClosedAt?.getTime()).toBe(earlier.getTime());
    for (const other of [branches.arB, branches.es, branches.virtualAr]) {
      const row = rowOf(rowsL, other.id);
      expect(row.mainClosedAt?.getTime()).toBe(now.getTime());
      expect(row.cobrado).toBe(0);
    }
    // Una sola fila por sede (UNIQUE): la sellada no se duplicó.
    expect(rowsL.filter((r) => r.branchId === branches.arA.id)).toHaveLength(1);
  });

  it("barrido por gimnasio: cada tenant recibe solo sus sedes y no ve las del otro", async () => {
    const gym2 = await seedSecondTenant(app);

    await runWeeklyBoardClose(app.db, instantAtAr(W, "00:30"));

    const rows1 = await rowsOf(L, TENANT_TEMPLO);
    const rows2 = await rowsOf(L, TENANT_DOS);

    // Gimnasio 2: solo su sede, con cero (el cobro de arA es de El Templo).
    expect(rows2.map((r) => r.branchId)).toEqual([gym2.branchId]);
    expect(rows2[0].cobrado).toBe(0);
    expect(rows2[0].mainClosedAt).not.toBeNull();

    // El Templo: sus sedes, ninguna del gimnasio 2.
    const ids1 = rows1.map((r) => r.branchId);
    expect(ids1).toContain(branches.arA.id);
    expect(ids1).toContain(branches.virtualAr.id);
    expect(ids1).not.toContain(gym2.branchId);
    const branchRows1 = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(tenantWhere(schema.branches, TEMPLO_CTX));
    const own = new Set(branchRows1.map((b) => b.id));
    for (const id of ids1) expect(own.has(id)).toBe(true);
    expect(rowOf(rows1, branches.arA.id).cobrado).toBe(1000);
  });
});
