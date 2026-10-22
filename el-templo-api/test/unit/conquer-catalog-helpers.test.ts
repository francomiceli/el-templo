/**
 * Fase 201 plan 201-25: helpers puros del catálogo de Conquer.
 *
 *  - `stepLadderId` (DA-3): la escalera de un escalón. El hold final puede tener
 *    escalera propia.
 *  - `startStepsFor` (DA-5): la tabla de arranque del nivel (anexo §3).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`. `catalog-service.ts`
 * importa el schema de Drizzle pero NO conecta a nada al importarlo.
 */
import { describe, it, expect } from "vitest";
import type { ConquerStartStep } from "../../src/db/schema/conquer";
import {
  startStepsFor,
  stepLadderId,
  type ExerciseView,
} from "../../src/modules/conquer/catalog-service";
import type { Level } from "../../src/modules/conquer/rules";

const LADDER = 10;
const HOLD_LADDER = 20;

/** Tabla de arranque de juguete: cada nivel tiene un `rung` distinto en e1. */
function table(rung: string): ConquerStartStep[] {
  return [
    { step: "e1", rung, mode: "completa" },
    { step: "e2", rung, mode: "negativa" },
    { step: "e3", rung, mode: "completa" },
    { step: "hold", rung, mode: "hold" },
  ];
}

function exercise(overrides: Partial<ExerciseView> = {}): ExerciseView {
  return {
    id: 1,
    code: "hspu",
    name: "HSPU",
    ladderId: LADDER,
    holdLadderId: HOLD_LADDER,
    brazosRectos: false,
    unit: "reps",
    muscles: [],
    startSteps: table("toro"),
    startStepsNovillo: table("novillo"),
    startStepsTernero: table("ternero"),
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

describe("stepLadderId (DA-3)", () => {
  it.each([
    ["e1 usa la escalera del ejercicio", "e1", LADDER],
    ["e2 usa la escalera del ejercicio", "e2", LADDER],
    ["e3 usa la escalera del ejercicio", "e3", LADDER],
    ["hold usa la escalera de hold si tiene", "hold", HOLD_LADDER],
  ] as const)("%s", (_nombre, step, esperado) => {
    expect(stepLadderId(exercise(), step)).toBe(esperado);
  });

  it("hold sin escalera propia usa la del ejercicio", () => {
    expect(stepLadderId(exercise({ holdLadderId: null }), "hold")).toBe(LADDER);
  });

  it("e1 ignora la escalera de hold aunque exista", () => {
    expect(stepLadderId(exercise({ holdLadderId: HOLD_LADDER }), "e1")).toBe(
      LADDER,
    );
  });
});

describe("startStepsFor (DA-5)", () => {
  it.each([
    ["toro", "toro"],
    ["novillo", "novillo"],
    ["ternero", "ternero"],
  ] as const)("%s devuelve su propia tabla, sin fallback", (level, rung) => {
    const result = startStepsFor(exercise(), level);
    expect(result.fallback).toBe(false);
    expect(result.steps.map((s) => s.rung)).toEqual([rung, rung, rung, rung]);
  });

  it.each([
    ["novillo", { startStepsNovillo: [] }],
    ["ternero", { startStepsTernero: [] }],
  ] as [Level, Partial<ExerciseView>][])(
    "%s con la tabla vacía usa la de Toro y marca fallback",
    (level, overrides) => {
      const result = startStepsFor(exercise(overrides), level);
      expect(result.fallback).toBe(true);
      expect(result.steps).toEqual(table("toro"));
    },
  );

  it("la tabla vacía de Novillo no afecta a Ternero ni a Toro", () => {
    const e = exercise({ startStepsNovillo: [] });
    expect(startStepsFor(e, "ternero").fallback).toBe(false);
    expect(startStepsFor(e, "toro").fallback).toBe(false);
  });

  it("Toro nunca hace fallback, aunque las otras tablas estén vacías", () => {
    const e = exercise({ startStepsNovillo: [], startStepsTernero: [] });
    const result = startStepsFor(e, "toro");
    expect(result.fallback).toBe(false);
    expect(result.steps).toEqual(table("toro"));
  });
});
