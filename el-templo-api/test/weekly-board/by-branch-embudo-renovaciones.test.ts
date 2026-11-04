/**
 * Tablero semanal (fase 206, plan 03) — coincidencia por sede del Embudo y de
 * Renovaciones contra sus pantallas de origen.
 *
 *   - Embudo: `ReportsService.getTrialSessionTalliesByBranch` (sede de la CLASE,
 *     D-13) + `kpisFromTally` == `getTrialSessionsReport({ branchId }).kpis`
 *     (D-17, D-26).
 *   - Renovaciones: `RenewalsService.computeKpisByMemberBranch` (sede del
 *     ALUMNO, D-12) == `listRenewals({ branchId, activityType: "membresia" }).kpis`
 *     para alumnos de plan de una sede (D-18), con la excepcion documentada de
 *     los multisucursales reasignados (D-29).
 *
 * Todo se siembra en la semana PASADA (`boardWeeks().last`): esta entera en el
 * pasado, asi "clase ocurrida" y "vencida" no dependen de la hora a la que corre
 * el test. Sin fake timers, sin los helpers de fecha en UTC de helpers.ts, sin ids de
 * `users` hardcodeados. Los asserts van sobre las sedes del fixture, nunca sobre
 * "cuantas sedes hay".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { addDays } from "../../src/modules/shared/date-utils";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { BadRequestError } from "../../src/modules/shared/errors";
import {
  ReportsService,
  kpisFromTally,
} from "../../src/modules/reports/service";
import type { TrialSessionTally } from "../../src/modules/reports/types";
import { RenewalsService } from "../../src/modules/renewals/service";
import { weekRange } from "../../src/modules/weekly-board/week";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedTrialBooking,
  seedRescheduledTrial,
  seedExpiringMembership,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

/** Lee una clave de un mapa y falla con mensaje claro si no esta. */
function must<V>(map: Map<number, V>, id: number, what: string): V {
  const value = map.get(id);
  if (value === undefined) {
    throw new Error(`Falta ${what} para la sede ${id} en el mapa del Tablero`);
  }
  return value;
}

describe("Tablero semanal — Embudo y Renovaciones por sede (206-03)", () => {
  let app: FastifyInstance;
  let reports: ReportsService;
  let renewals: RenewalsService;
  let branches: BoardBranches;
  let weeks: BoardWeeks;
  let lastRange: { dateFrom: string; dateTo: string };
  /** Martes de la semana pasada: dentro del rango, clase ya terminada. */
  let lastTuesday: string;
  /** Miercoles de la semana pasada: vencimientos. */
  let lastWednesday: string;

  beforeAll(async () => {
    app = await createTestApp();
    reports = new ReportsService(app.db, app.log);
    renewals = new RenewalsService(app.db, app.log);
    weeks = boardWeeks();
    lastRange = weekRange(weeks.last);
    lastTuesday = addDays(weeks.last, 1);
    lastWednesday = addDays(weeks.last, 2);
    await cleanAllTestData(app);
    branches = await seedBoardBranches(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanupBoardBranches(
      app,
      Object.values(branches).map((b) => b.id),
    );
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Embudo ───────────────────────────────────────────────────────────────

  describe("Embudo (Sesiones de prueba) por sede de la clase", () => {
    /** Siembra el escenario comun: 3 pruebas + 1 reagendada en arA, 1 ganada sin asistencia en arB. */
    async function seedEmbudo(): Promise<void> {
      const { arA, arB } = branches;
      // arA: asistio + ganada, asistio sin compra, no asistio.
      await seedTrialBooking(app, {
        branchId: arA.id,
        bookingDate: lastTuesday,
        attended: "si",
        won: true,
      });
      await seedTrialBooking(app, {
        branchId: arA.id,
        bookingDate: lastTuesday,
        attended: "si",
        won: false,
      });
      await seedTrialBooking(app, {
        branchId: arA.id,
        bookingDate: lastTuesday,
        attended: "no",
        won: false,
      });
      // arA: la sesion original cae en la semana pasada y queda "Reagendada"
      // (no suma reserva); la nueva cae en la semana en curso (otro rango).
      await seedRescheduledTrial(app, {
        branchId: arA.id,
        parentDate: lastTuesday,
        childDate: weeks.current,
      });
      // arB: una ganada sin asistencia.
      await seedTrialBooking(app, {
        branchId: arB.id,
        bookingDate: lastTuesday,
        attended: "no",
        won: true,
      });
    }

    it("coincide con Sesiones de prueba filtrada por sede, sede por sede (D-17, D-26)", async () => {
      await seedEmbudo();

      const tallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );

      for (const branch of [branches.arA, branches.arB]) {
        const screen = await reports.getTrialSessionsReport(TEMPLO_CTX, {
          branchId: branch.id,
          dateFrom: lastRange.dateFrom,
          dateTo: lastRange.dateTo,
        });
        const board = kpisFromTally(must(tallies, branch.id, "el embudo"));
        expect(board.reservations).toBe(screen.kpis.reservations);
        expect(board.attended).toBe(screen.kpis.attended);
        expect(board.purchased).toBe(screen.kpis.purchased);
        expect(board.attendanceRate).toEqual(screen.kpis.attendanceRate);
        expect(board.closeRate).toEqual(screen.kpis.closeRate);
        expect(board.totalConversionRate).toEqual(
          screen.kpis.totalConversionRate,
        );
      }
    });

    it("da los numeros esperados para arA y arB", async () => {
      await seedEmbudo();

      const tallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );

      const a = kpisFromTally(must(tallies, branches.arA.id, "arA"));
      expect(a.reservations).toBe(3);
      expect(a.attended).toBe(2);
      expect(a.purchased).toBe(1);
      expect(a.attendanceRate).toBeCloseTo((2 / 3) * 100, 6);
      expect(a.closeRate).toBeCloseTo(50, 6);
      expect(a.totalConversionRate).toBeCloseTo((1 / 3) * 100, 6);

      const b = must(tallies, branches.arB.id, "arB");
      expect(b.reservations).toBe(1);
      expect(b.attended).toBe(0);
      expect(b.purchased).toBe(1);
      const bk = kpisFromTally(b);
      expect(bk.attendanceRate).toBe(0);
      expect(bk.closeRate).toBeNull(); // nadie asistio: denominador 0
      expect(bk.totalConversionRate).toBeCloseTo(100, 6);
    });

    it("el rango corta: la prueba de la semana en curso no entra en el conteo de la pasada", async () => {
      await seedEmbudo();

      const lastTallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const currentTallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        weekRange(weeks.current),
      );

      // La sesion nueva de la reagenda (semana en curso) cuenta SOLO en `current`.
      expect(must(lastTallies, branches.arA.id, "arA").reservations).toBe(3);
      expect(must(currentTallies, branches.arA.id, "arA").reservations).toBe(1);
      // arB no tiene nada en la semana en curso.
      expect(currentTallies.has(branches.arB.id)).toBe(false);
    });

    it("cuenta en la sede de la clase, no en la sede del alumno (D-13)", async () => {
      await seedTrialBooking(app, {
        branchId: branches.arA.id,
        userBranchId: branches.arB.id,
        bookingDate: lastTuesday,
        attended: "si",
        won: false,
      });

      const tallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );

      expect(must(tallies, branches.arA.id, "arA").reservations).toBe(1);
      expect(tallies.has(branches.arB.id)).toBe(false);
    });

    it("una reagenda con las dos sesiones en el rango cuenta a la persona una sola vez", async () => {
      await seedRescheduledTrial(app, {
        branchId: branches.arA.id,
        parentDate: lastTuesday,
        childDate: addDays(weeks.last, 3),
      });

      const tallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const screen = await reports.getTrialSessionsReport(TEMPLO_CTX, {
        branchId: branches.arA.id,
        dateFrom: lastRange.dateFrom,
        dateTo: lastRange.dateTo,
      });

      expect(must(tallies, branches.arA.id, "arA").reservations).toBe(1);
      expect(screen.kpis.reservations).toBe(1);
    });

    it("las sedes sin sesiones en el rango no aparecen en el mapa", async () => {
      await seedTrialBooking(app, {
        branchId: branches.arA.id,
        bookingDate: lastTuesday,
        attended: "si",
        won: false,
      });

      const tallies = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );

      expect(tallies.has(branches.arA.id)).toBe(true);
      expect(tallies.has(branches.es.id)).toBe(false);
      expect(tallies.has(branches.virtualAr.id)).toBe(false);
      expect(tallies.has(branches.inactiveAr.id)).toBe(false);
    });

    it("kpisFromTally devuelve null en los porcentajes con denominador 0", () => {
      const empty: TrialSessionTally = {
        pendingThisShift: 0,
        reservations: 0,
        occurred: 0,
        attended: 0,
        purchased: 0,
        purchasedOccurred: 0,
        purchasedAttended: 0,
      };
      const kpis = kpisFromTally(empty);
      expect(kpis.attendanceRate).toBeNull();
      expect(kpis.closeRate).toBeNull();
      expect(kpis.totalConversionRate).toBeNull();
    });
  });

  // ─── Renovaciones ─────────────────────────────────────────────────────────

  describe("Renovaciones por sede del alumno", () => {
    it("coincide con la pantalla Renovaciones filtrada por sede para alumnos de plan de una sede (D-18)", async () => {
      const { arA } = branches;
      // renovo: la sub siguiente arranca al dia siguiente (dentro de los 5 dias).
      await seedExpiringMembership(app, {
        memberBranchId: arA.id,
        subBranchId: arA.id,
        endDate: lastWednesday,
        outcome: "renovo",
      });
      // no renueva: followup manual.
      await seedExpiringMembership(app, {
        memberBranchId: arA.id,
        subBranchId: arA.id,
        endDate: lastWednesday,
        outcome: "no_renovo_manual",
      });
      // en proceso sin mensajes = sin contactar.
      await seedExpiringMembership(app, {
        memberBranchId: arA.id,
        subBranchId: arA.id,
        endDate: lastWednesday,
        outcome: "en_proceso_sin_mensajes",
      });

      const board = must(
        await renewals.computeKpisByMemberBranch(TEMPLO_CTX, lastRange),
        arA.id,
        "las renovaciones",
      );
      const screen = (
        await renewals.listRenewals(TEMPLO_CTX, {
          branchId: arA.id,
          dateFrom: lastRange.dateFrom,
          dateTo: lastRange.dateTo,
          activityType: "membresia",
        })
      ).kpis;

      // Numeros esperados explicitos.
      expect(board.total).toBe(3);
      expect(board.renovo).toBe(1);
      expect(board.noRenovo).toBe(1);
      expect(board.sinContactar).toBe(1);
      expect(board.renewalRate).toBeCloseTo(50, 6); // 1 / (1 + 1 + 0)

      // Y coincidencia con la pantalla de origen.
      expect(board.total).toBe(screen.total);
      expect(board.renovo).toBe(screen.renovo);
      expect(board.noRenovo).toBe(screen.noRenovo);
      expect(board.volvioTarde).toBe(screen.volvioTarde);
      expect(board.sinContactar).toBe(screen.sinContactar);
      expect(board.renewalRate).toEqual(screen.renewalRate);
    });

    it("agrupa por la sede del alumno, no por la de la suscripcion que vence (D-12, D-29)", async () => {
      const { arA, arB } = branches;
      // Multisucursal reasignado: el alumno hoy es de arB, pero la sub vencida
      // quedo en arA (las vencidas no se resincronizan al cambiar la sede).
      await seedExpiringMembership(app, {
        memberBranchId: arB.id,
        subBranchId: arA.id,
        endDate: lastWednesday,
        outcome: "en_proceso_sin_mensajes",
      });

      const byMember = await renewals.computeKpisByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );
      expect(must(byMember, arB.id, "arB").total).toBe(1);
      expect(byMember.has(arA.id)).toBe(false);

      // Excepcion documentada D-29: la pantalla filtra por la sede de la sub,
      // asi que ESTE alumno lo cuenta en arA y no en arB.
      const screenA = await renewals.listRenewals(TEMPLO_CTX, {
        branchId: arA.id,
        dateFrom: lastRange.dateFrom,
        dateTo: lastRange.dateTo,
        activityType: "membresia",
      });
      const screenB = await renewals.listRenewals(TEMPLO_CTX, {
        branchId: arB.id,
        dateFrom: lastRange.dateFrom,
        dateTo: lastRange.dateTo,
        activityType: "membresia",
      });
      expect(screenA.kpis.total).toBe(1);
      expect(screenB.kpis.total).toBe(0);
    });

    it("el rango corta: un vencimiento de la semana anterior no entra", async () => {
      await seedExpiringMembership(app, {
        memberBranchId: branches.arA.id,
        subBranchId: branches.arA.id,
        endDate: addDays(weeks.lastMinus1, 2),
        outcome: "en_proceso_sin_mensajes",
      });

      const byMember = await renewals.computeKpisByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );

      expect(byMember.has(branches.arA.id)).toBe(false);
    });

    it("rechaza un rango invertido con BadRequestError", async () => {
      await expect(
        renewals.computeKpisByMemberBranch(TEMPLO_CTX, {
          dateFrom: lastRange.dateTo,
          dateTo: lastRange.dateFrom,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  // ─── Aislamiento entre gimnasios ──────────────────────────────────────────

  describe("aislamiento entre gimnasios (T-206-06)", () => {
    it("ninguna sede del gimnasio 2 aparece en los mapas de El Templo, y viceversa", async () => {
      const second = await seedSecondTenant(app);
      const secondCtx: TenantContext = { tenantId: second.tenantId };

      // El Templo: una prueba y un vencimiento en arA.
      await seedTrialBooking(app, {
        branchId: branches.arA.id,
        bookingDate: lastTuesday,
        attended: "si",
        won: false,
      });
      await seedExpiringMembership(app, {
        memberBranchId: branches.arA.id,
        subBranchId: branches.arA.id,
        endDate: lastWednesday,
        outcome: "en_proceso_sin_mensajes",
      });
      // Gimnasio 2: lo mismo en su propia sede.
      await seedTrialBooking(app, {
        tenantId: second.tenantId,
        branchId: second.branchId,
        bookingDate: lastTuesday,
        attended: "si",
        won: false,
      });
      await seedExpiringMembership(app, {
        tenantId: second.tenantId,
        memberBranchId: second.branchId,
        subBranchId: second.branchId,
        endDate: lastWednesday,
        outcome: "en_proceso_sin_mensajes",
      });

      const temploTrial = await reports.getTrialSessionTalliesByBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const temploRenewals = await renewals.computeKpisByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const secondTrial = await reports.getTrialSessionTalliesByBranch(
        secondCtx,
        lastRange,
      );
      const secondRenewals = await renewals.computeKpisByMemberBranch(
        secondCtx,
        lastRange,
      );

      expect(temploTrial.has(branches.arA.id)).toBe(true);
      expect(temploTrial.has(second.branchId)).toBe(false);
      expect(temploRenewals.has(branches.arA.id)).toBe(true);
      expect(temploRenewals.has(second.branchId)).toBe(false);

      expect(secondTrial.has(second.branchId)).toBe(true);
      expect(secondTrial.has(branches.arA.id)).toBe(false);
      expect(secondRenewals.has(second.branchId)).toBe(true);
      expect(secondRenewals.has(branches.arA.id)).toBe(false);
    });
  });
});
