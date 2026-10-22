/**
 * Fase 201 Plan 07 (D-16, A16): semana del plan de Hoy, con "hoy" inyectado.
 *
 * `buildPlanWeek` no lee el reloj: recibe el `today` que calculó el servidor con
 * la zona de la sede. Acá se prueban los bordes de la semana calendario
 * (lunes-domingo) y la combinación con `todayInTz`, que en integración solo se
 * vería de noche. Los literales de fecha son legítimos: test unitario puro,
 * sin DB ni reloj.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, it, expect } from "vitest";
import type {
  ConquerCatalog,
  TemplateDayView,
} from "../../src/modules/conquer/catalog-service";
import { buildPlanWeek } from "../../src/modules/conquer/today-service";
import { todayInTz } from "../../src/modules/shared/date-utils";

function day(
  dayKey: string,
  sortOrder: number,
  daysCount = 4,
): TemplateDayView {
  return {
    id: sortOrder,
    daysCount,
    dayKey,
    label: dayKey.toUpperCase(),
    sortOrder,
    finisherText: "finisher",
    exerciseCodes: [],
    openingComboKey: null,
  };
}

const catalog: ConquerCatalog = {
  ladders: new Map(),
  ladderByCode: new Map(),
  rungById: new Map(),
  exercises: new Map(),
  exerciseByCode: new Map(),
  // Desordenados a propósito: el orden del plan sale de sortOrder.
  templateDays: [
    day("vertical", 3),
    day("plancha", 1),
    day("dominadas", 4),
    day("front", 2),
  ],
};

const ctx = (today: string, daysCount = 4) => ({ today, daysCount, catalog });
const at = (dayKey: string, sessionDate: string) => ({ dayKey, sessionDate });

describe("buildPlanWeek", () => {
  it("sin sesiones: toca el primer día del plan, en el orden de la plantilla", () => {
    const week = buildPlanWeek(ctx("2026-10-21"), []);

    expect(week.weekMonday).toBe("2026-10-19");
    expect(week.plan.map((d) => d.dayKey)).toEqual([
      "plancha",
      "front",
      "vertical",
      "dominadas",
    ]);
    expect(week.plan.every((d) => !d.done)).toBe(true);
    expect(week.nextDayKey).toBe("plancha");
    expect(week.weekComplete).toBe(false);
  });

  it("toca el primer día que FALTA, no el siguiente al último hecho", () => {
    const week = buildPlanWeek(ctx("2026-10-22"), [
      at("front", "2026-10-20"),
      at("vertical", "2026-10-21"),
    ]);

    expect(week.plan.map((d) => d.done)).toEqual([false, true, true, false]);
    expect(week.nextDayKey).toBe("plancha");
  });

  it("con todos los días hechos: Semana completa y sin día pendiente", () => {
    const week = buildPlanWeek(ctx("2026-10-23"), [
      at("plancha", "2026-10-19"),
      at("front", "2026-10-20"),
      at("vertical", "2026-10-21"),
      at("dominadas", "2026-10-22"),
    ]);

    expect(week.plan.every((d) => d.done)).toBe(true);
    expect(week.nextDayKey).toBeNull();
    expect(week.weekComplete).toBe(true);
  });

  it("el domingo todavía es de la semana que empezó el lunes", () => {
    const week = buildPlanWeek(ctx("2026-10-25"), [
      at("plancha", "2026-10-19"),
    ]);

    expect(week.weekMonday).toBe("2026-10-19");
    expect(week.plan[0].done).toBe(true);
  });

  it("el lunes arranca una semana nueva: las sesiones del domingo no cuentan", () => {
    const week = buildPlanWeek(ctx("2026-10-26"), [
      at("plancha", "2026-10-25"),
      at("front", "2026-10-19"),
    ]);

    expect(week.weekMonday).toBe("2026-10-26");
    expect(week.plan.every((d) => !d.done)).toBe(true);
    expect(week.nextDayKey).toBe("plancha");
  });

  it("las sesiones de semanas futuras (reloj corrido) tampoco cuentan", () => {
    const week = buildPlanWeek(ctx("2026-10-21"), [
      at("plancha", "2026-10-26"),
    ]);

    expect(week.plan[0].done).toBe(false);
  });

  it("la fecha del alumno es la de su sede: de noche en Buenos Aires aún es domingo", () => {
    // 22:30 del domingo 25 en Buenos Aires = 01:30 UTC del lunes 26.
    const instant = new Date("2026-10-26T01:30:00Z");
    const today = todayInTz("America/Argentina/Buenos_Aires", instant);

    const week = buildPlanWeek(ctx(today), [at("plancha", "2026-10-19")]);

    expect(today).toBe("2026-10-25");
    expect(week.weekMonday).toBe("2026-10-19");
    expect(week.plan[0].done).toBe(true);
    expect(instant.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("una plantilla sin días para esa cantidad no inventa Semana completa", () => {
    const week = buildPlanWeek(ctx("2026-10-21", 3), []);

    expect(week.plan).toEqual([]);
    expect(week.nextDayKey).toBeNull();
    expect(week.weekComplete).toBe(false);
  });
});
