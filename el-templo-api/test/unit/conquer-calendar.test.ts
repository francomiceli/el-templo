/**
 * Fase 201 Plan 04: calendario de Conquer (D-16, D-14, sintesis §2.2 y §3.2).
 *
 * Funciones puras sobre strings YYYY-MM-DD con aritmetica UTC (A16). Los
 * literales de fecha son legitimos: es un test unitario puro, sin DB ni reloj.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  addDaysIso,
  mondayOfIso,
  daysBetweenIso,
  blockWeek,
  nextPendingDay,
  comboSubirReady,
  levelUpStreak,
} from "../../src/modules/conquer/calendar";

describe("addDaysIso", () => {
  it.each([
    ["2026-10-21", 0, "2026-10-21"],
    ["2026-10-21", 1, "2026-10-22"],
    ["2026-10-31", 1, "2026-11-01"], // cruce de mes
    ["2026-12-31", 1, "2027-01-01"], // cruce de año
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-02-28", 1, "2028-02-29"], // bisiesto
    ["2026-10-21", 14, "2026-11-04"],
  ])("addDaysIso(%s, %i) = %s", (date, days, expected) => {
    expect(addDaysIso(date, days)).toBe(expected);
  });
});

describe("mondayOfIso", () => {
  it.each([
    ["2026-10-19", "2026-10-19"], // lunes
    ["2026-10-21", "2026-10-19"], // miercoles
    ["2026-10-25", "2026-10-19"], // domingo: sigue en la semana del lunes 19
    ["2026-10-26", "2026-10-26"], // lunes siguiente
    ["2026-11-01", "2026-10-26"], // domingo que cruza de mes
    ["2027-01-01", "2026-12-28"], // viernes que cruza de año
    ["2026-12-28", "2026-12-28"],
  ])("mondayOfIso(%s) = %s", (date, expected) => {
    expect(mondayOfIso(date)).toBe(expected);
  });
});

describe("daysBetweenIso", () => {
  it.each([
    ["2026-10-19", "2026-10-19", 0],
    ["2026-10-19", "2026-10-26", 7],
    ["2026-10-26", "2026-10-19", -7],
    ["2026-12-28", "2027-01-04", 7], // cruce de año
    ["2028-02-27", "2028-03-01", 3], // bisiesto
  ])("daysBetweenIso(%s, %s) = %i", (from, to, expected) => {
    expect(daysBetweenIso(from, to)).toBe(expected);
  });
});

describe("blockWeek (A11: semanas calendario desde la activacion)", () => {
  // Activacion un miercoles: su semana empieza el lunes 2026-10-19.
  const activation = "2026-10-21";

  it.each([
    ["el mismo dia", "2026-10-21", 1],
    ["el domingo de la misma semana", "2026-10-25", 1],
    ["el lunes siguiente (semana 2)", "2026-10-26", 2],
    ["+7 dias (miercoles de la semana 2)", "2026-10-28", 2],
    ["+14 dias (semana 3)", "2026-11-04", 3],
    ["cruce de año", "2027-01-06", 12],
  ])("%s -> semana %i", (_label, today, expected) => {
    expect(blockWeek(activation, today)).toBe(expected);
  });

  it("nunca baja de 1 aunque hoy sea anterior a la activacion", () => {
    expect(blockWeek(activation, "2026-10-10")).toBe(1);
  });
});

describe("nextPendingDay (D-16)", () => {
  const plan4 = ["plancha", "front", "vertical", "dominadas", "sabado"];

  it("nada hecho -> el primero del plan", () => {
    expect(nextPendingDay(plan4, [])).toBe("plancha");
  });

  it("devuelve el primer dia que falta, no el siguiente al ultimo hecho", () => {
    expect(nextPendingDay(plan4, ["plancha", "vertical"])).toBe("front");
  });

  it("respeta el orden del plan y no el orden en que se hicieron", () => {
    expect(nextPendingDay(plan4, ["dominadas", "front"])).toBe("plancha");
  });

  it("el sabado va al final: con los 4 dias hechos falta el sabado", () => {
    expect(
      nextPendingDay(plan4, ["plancha", "front", "vertical", "dominadas"]),
    ).toBe("sabado");
  });

  it("todo hecho -> null (Semana completa)", () => {
    expect(nextPendingDay(plan4, [...plan4])).toBeNull();
  });

  it("ignora claves hechas que no son del plan", () => {
    expect(nextPendingDay(["empuje", "traccion"], ["sabado", "empuje"])).toBe(
      "traccion",
    );
  });

  it("un dia repetido en lo hecho no cuenta doble", () => {
    expect(nextPendingDay(["empuje", "traccion"], ["empuje", "empuje"])).toBe(
      "traccion",
    );
  });

  it("plan vacio -> null", () => {
    expect(nextPendingDay([], [])).toBeNull();
  });
});

describe("comboSubirReady (D-14)", () => {
  const w = (monday: string, hit: boolean) => ({ monday, hit });

  it("2 semanas consecutivas con el objetivo cumplido y n=2 -> true", () => {
    expect(
      comboSubirReady([w("2026-10-12", true), w("2026-10-19", true)], 2),
    ).toBe(true);
  });

  it("con un hueco de una semana -> false", () => {
    expect(
      comboSubirReady([w("2026-10-05", true), w("2026-10-19", true)], 2),
    ).toBe(false);
  });

  it("una sola semana con n=2 -> false", () => {
    expect(comboSubirReady([w("2026-10-19", true)], 2)).toBe(false);
  });

  it("n=3 con solo 2 semanas -> false", () => {
    expect(
      comboSubirReady([w("2026-10-12", true), w("2026-10-19", true)], 3),
    ).toBe(false);
  });

  it("n=3 con 3 semanas consecutivas -> true", () => {
    expect(
      comboSubirReady(
        [w("2026-10-05", true), w("2026-10-12", true), w("2026-10-19", true)],
        3,
      ),
    ).toBe(true);
  });

  it("la ultima semana sin cumplir -> false", () => {
    expect(
      comboSubirReady([w("2026-10-12", true), w("2026-10-19", false)], 2),
    ).toBe(false);
  });

  it("una semana vieja sin cumplir fuera de las ultimas n no corta", () => {
    expect(
      comboSubirReady(
        [w("2026-10-05", false), w("2026-10-12", true), w("2026-10-19", true)],
        2,
      ),
    ).toBe(true);
  });

  it("ordena por lunes: no depende del orden de entrada", () => {
    expect(
      comboSubirReady([w("2026-10-19", true), w("2026-10-12", true)], 2),
    ).toBe(true);
  });

  it("cruza el año con lunes consecutivos", () => {
    expect(
      comboSubirReady([w("2026-12-28", true), w("2027-01-04", true)], 2),
    ).toBe(true);
  });

  it("sin semanas -> false", () => {
    expect(comboSubirReady([], 2)).toBe(false);
  });
});

describe("levelUpStreak (§2.2, A13)", () => {
  const week = (monday: string, daysDone: number, maxPain = 0) => ({
    monday,
    daysDone,
    maxPain,
  });
  const DAYS = 4;
  const PAIN = 4;
  const CURRENT = "2026-10-19";

  it("4 semanas completas terminando en la actual -> 4", () => {
    const weeks = [
      week("2026-09-28", 4),
      week("2026-10-05", 4),
      week("2026-10-12", 4),
      week("2026-10-19", 4),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(4);
  });

  it("3 completas y la actual incompleta -> 3 (cuenta hasta la anterior)", () => {
    const weeks = [
      week("2026-09-28", 4),
      week("2026-10-05", 4),
      week("2026-10-12", 4),
      week("2026-10-19", 2),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(3);
  });

  it("la actual no esta en la lista: cuenta las anteriores", () => {
    const weeks = [week("2026-10-05", 4), week("2026-10-12", 4)];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(2);
  });

  it("una molestia de 4 o mas corta la racha", () => {
    const weeks = [
      week("2026-09-28", 4),
      week("2026-10-05", 4),
      week("2026-10-12", 4, 4),
      week("2026-10-19", 4),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(1);
  });

  it("una molestia de 3 (bajo el limite) no corta", () => {
    const weeks = [
      week("2026-10-05", 4),
      week("2026-10-12", 4, 3),
      week("2026-10-19", 4),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(3);
  });

  it("una semana faltante en la lista corta la racha", () => {
    const weeks = [
      week("2026-09-28", 4),
      // falta 2026-10-05
      week("2026-10-12", 4),
      week("2026-10-19", 4),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(2);
  });

  it("una semana con menos dias que el plan corta la racha", () => {
    const weeks = [
      week("2026-10-05", 3),
      week("2026-10-12", 4),
      week("2026-10-19", 4),
    ];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(2);
  });

  it("daysDone mayor al plan (repitio un dia) tambien completa", () => {
    expect(levelUpStreak([week("2026-10-19", 5)], DAYS, PAIN, CURRENT)).toBe(1);
  });

  it("el plan de 3 dias pide 3", () => {
    const weeks = [week("2026-10-12", 3), week("2026-10-19", 3)];
    expect(levelUpStreak(weeks, 3, PAIN, CURRENT)).toBe(2);
  });

  it("sin semanas -> 0", () => {
    expect(levelUpStreak([], DAYS, PAIN, CURRENT)).toBe(0);
  });

  it("ni la actual ni la anterior completas -> 0", () => {
    const weeks = [week("2026-10-05", 4), week("2026-10-12", 1)];
    expect(levelUpStreak(weeks, DAYS, PAIN, CURRENT)).toBe(0);
  });
});
