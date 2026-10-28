/**
 * Fase 201 Plan 12: reglas puras del control fisico (sintesis §6, D-15).
 *
 * Funciones puras sobre strings YYYY-MM-DD. Los literales de fecha son
 * legitimos: es un test unitario puro, sin DB ni reloj.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  checkDue,
  compareChecks,
  defaultComparePair,
  type ComparableCheck,
} from "../../src/modules/conquer/body-check-rules";

describe("checkDue", () => {
  it("sin control no hay vencimiento (lo cubre el aviso del dia 0)", () => {
    expect(checkDue({ lastCheckDate: null, today: "2026-10-22" })).toEqual({
      nextDueDate: null,
      due: false,
      overdue: false,
    });
  });

  it.each([
    [0, false, false],
    [27, false, false],
    [28, true, false],
    [29, true, false],
    [42, true, false],
    [43, true, true],
  ])("a %i dias del ultimo: due=%s overdue=%s", (days, due, overdue) => {
    // Ultimo control el 2026-08-01; hoy = ultimo + days (aritmetica UTC).
    const last = "2026-08-01";
    const today = new Date(Date.UTC(2026, 7, 1 + days))
      .toISOString()
      .slice(0, 10);
    const res = checkDue({ lastCheckDate: last, today });
    expect(res.nextDueDate).toBe("2026-08-29");
    expect(res.due).toBe(due);
    expect(res.overdue).toBe(overdue);
  });

  it("cruza el fin de mes y de anio", () => {
    expect(
      checkDue({ lastCheckDate: "2026-12-10", today: "2026-12-11" })
        .nextDueDate,
    ).toBe("2027-01-07");
  });
});

function check(
  id: number,
  checkDate: string,
  m: Partial<Omit<ComparableCheck, "id" | "checkDate">> = {},
): ComparableCheck {
  return {
    id,
    checkDate,
    armCm: null,
    chestCm: null,
    shouldersCm: null,
    waistCm: null,
    weightKg: null,
    ...m,
  };
}

describe("compareChecks", () => {
  it("diff = to - from con 1 decimal, sin errores de punto flotante", () => {
    const res = compareChecks(
      check(1, "2026-08-01", {
        armCm: 30,
        chestCm: 100.4,
        shouldersCm: 110,
        waistCm: 82,
        weightKg: 80.4,
      }),
      check(2, "2026-09-26", {
        armCm: 31.5,
        chestCm: 101,
        shouldersCm: 110,
        waistCm: 80.4,
        weightKg: 78.8,
      }),
    );
    expect(res.measures.map((m) => [m.key, m.label, m.diff])).toEqual([
      ["arm", "Brazo", 1.5],
      ["chest", "Pecho", 0.6],
      ["shoulders", "Hombros", 0],
      ["waist", "Cintura", -1.6],
      ["weight", "Peso", -1.6],
    ]);
    expect(res.measures[3]).toEqual({
      key: "waist",
      label: "Cintura",
      from: 82,
      to: 80.4,
      diff: -1.6,
    });
  });

  it("diff null si falta la medida en cualquiera de los dos", () => {
    const res = compareChecks(
      check(1, "2026-08-01", { armCm: 30, waistCm: 80 }),
      check(2, "2026-08-29", { armCm: 31, chestCm: 100 }),
    );
    const byKey = Object.fromEntries(res.measures.map((m) => [m.key, m]));
    expect(byKey.arm.diff).toBe(1);
    expect(byKey.chest).toMatchObject({ from: null, to: 100, diff: null });
    expect(byKey.waist).toMatchObject({ from: 80, to: null, diff: null });
    expect(byKey.weight.diff).toBeNull();
    expect(res.measures).toHaveLength(5);
  });

  it.each([
    ["2026-08-01", "2026-08-01", 0],
    ["2026-08-01", "2026-08-07", 0],
    ["2026-08-01", "2026-08-08", 1],
    ["2026-08-01", "2026-08-29", 4],
    ["2026-08-29", "2026-08-01", 4], // valor absoluto
    ["2026-08-01", "2026-09-30", 8],
  ])("semanas entre %s y %s = %i", (from, to, weeks) => {
    expect(compareChecks(check(1, from), check(2, to)).weeks).toBe(weeks);
  });

  it("conserva los ids y las fechas de cada lado", () => {
    const res = compareChecks(check(7, "2026-08-01"), check(9, "2026-08-29"));
    expect(res.from).toEqual({ id: 7, checkDate: "2026-08-01" });
    expect(res.to).toEqual({ id: 9, checkDate: "2026-08-29" });
  });
});

describe("defaultComparePair", () => {
  it("con menos de dos controles es null", () => {
    expect(defaultComparePair([])).toBeNull();
    expect(defaultComparePair([check(1, "2026-08-01")])).toBeNull();
  });

  it("dia 0 contra el mas reciente, sin importar el orden de entrada", () => {
    const pair = defaultComparePair([
      check(3, "2026-09-26"),
      check(1, "2026-08-01"),
      check(2, "2026-08-29"),
    ]);
    expect(pair?.map((c) => c.id)).toEqual([1, 3]);
  });

  it("a igual fecha desempata por id", () => {
    const pair = defaultComparePair([
      check(5, "2026-08-01"),
      check(4, "2026-08-01"),
    ]);
    expect(pair?.map((c) => c.id)).toEqual([4, 5]);
  });

  it("no muta la entrada", () => {
    const input = [check(2, "2026-08-29"), check(1, "2026-08-01")];
    defaultComparePair(input);
    expect(input.map((c) => c.id)).toEqual([2, 1]);
  });
});
