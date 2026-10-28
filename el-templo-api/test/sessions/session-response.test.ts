/**
 * Unit puro de `blockToResponse` (sketch 027): el bloque trae el reloj del
 * formato (`timerSpec`, la misma normalización que la TV) y cada ejercicio la
 * ruta del modelo de anatomía (`rutaSlug`) para la figura del player. Sin DB.
 *
 *   pnpm exec vitest run test/sessions/session-response.test.ts
 */
import { describe, it, expect } from "vitest";
import type { FormatParams } from "../../src/modules/admin/format-params";
import { blockToResponse } from "../../src/modules/sessions/session-response";
import type {
  BlockPlan,
  ExercisePrescription,
} from "../../src/modules/sessions/types";

function ejercicio(
  exerciseId: number,
  fields: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    exerciseId,
    name: `Ejercicio ${exerciseId}`,
    contraction: "CON",
    reps: 8,
    seconds: 0,
    rest: 0,
    notes: null,
    videoUrl: null,
    ...fields,
  } as unknown as ExercisePrescription;
}

function bloque(
  formatParams: FormatParams | null,
  exercises: ExercisePrescription[],
  mobilityExercise?: ExercisePrescription,
): BlockPlan {
  return {
    blockId: "W36-martes-alfa-NUCLEUS",
    role: "NUCLEUS",
    route: "PL",
    pattern: "General",
    intensity: 5,
    repsBudget: 0,
    format: { formatId: 1, name: "AMRAP" },
    formatParams,
    exercises: mobilityExercise ? [...exercises, mobilityExercise] : exercises,
    trace: [],
    mobilityExercise,
  } as unknown as BlockPlan;
}

describe("blockToResponse: timerSpec", () => {
  it("AMRAP: cuenta regresiva de sus minutos", () => {
    const res = blockToResponse(
      bloque({ type: "amrap", minutes: 12 }, [ejercicio(1)]),
      0,
      new Map(),
    );
    expect(res.timerSpec).toEqual({ kind: "countdown", totalMs: 720_000 });
  });

  it("EMOM: un tramo por minuto", () => {
    const res = blockToResponse(
      bloque({ type: "emom", intervalSeconds: 60, totalMinutes: 10 }, [
        ejercicio(1),
      ]),
      0,
      new Map(),
    );
    expect(res.timerSpec).toEqual({
      kind: "interval",
      intervalMs: 60_000,
      rounds: 10,
    });
  });

  it("HIIT: las vueltas se multiplican por los ejercicios principales (sin la movilidad)", () => {
    const movilidad = ejercicio(9, {
      exerciseType: "mobility",
    } as Partial<ExercisePrescription>);
    const res = blockToResponse(
      bloque(
        { type: "hiit", workSeconds: 40, restSeconds: 20, rounds: 2 },
        [ejercicio(1), ejercicio(2), ejercicio(3)],
        movilidad,
      ),
      0,
      new Map(),
    );
    expect(res.timerSpec).toEqual({
      kind: "work_rest",
      workMs: 40_000,
      restMs: 20_000,
      rounds: 6,
    });
  });

  it("sin parámetros: cronómetro libre", () => {
    const res = blockToResponse(bloque(null, [ejercicio(1)]), 0, new Map());
    expect(res.timerSpec).toEqual({ kind: "countup" });
  });
});

describe("blockToResponse: rutaSlug", () => {
  it("cada ejercicio trae el slug de su ruta del modelo, o null", () => {
    const res = blockToResponse(
      bloque({ type: "amrap", minutes: 10 }, [
        ejercicio(1, { exerciseRoute: "MU" } as Partial<ExercisePrescription>),
        ejercicio(2, {
          exerciseRoute: "NO-EXISTE",
        } as Partial<ExercisePrescription>),
        ejercicio(3),
      ]),
      0,
      new Map(),
    );
    expect(res.exercises.map((e) => e.rutaSlug)).toEqual([
      "muscle-up",
      null,
      null,
    ]);
  });
});
