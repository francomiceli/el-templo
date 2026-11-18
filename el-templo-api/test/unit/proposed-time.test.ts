/**
 * Tests unitarios de la regla de tiempo de Aura (fase 214, D-20).
 *
 * Todo puro: sin base de datos ni contexto de servidor. Se corre con la config
 * unitaria: `npx vitest run --config vitest.config.unit.ts test/unit/proposed-time.test.ts`.
 */

import { describe, it, expect } from "vitest";
import {
  AURA_TIME_RATIO,
  evaluateTrainingAura,
  proposedSecondsForBlock,
  proposedSecondsForSession,
  requiredBlockRoles,
} from "../../src/modules/sessions/proposed-time";
import type {
  BlockPlan,
  BlockRole,
  ExercisePrescription,
} from "../../src/modules/sessions/types";
import type { FormatParams } from "../../src/modules/admin/format-params";

/** Ejercicio mínimo: solo los campos que mira la regla (reps, seconds, rest). */
function ex(reps: number, seconds: number, rest: number): ExercisePrescription {
  return {
    exerciseId: 1,
    name: "ejercicio",
    contraction: "CON",
    reps,
    seconds,
    rest,
  };
}

/**
 * Único punto donde se arma un BlockPlan parcial: la regla no lee el resto de
 * los campos (ruta, patrón, trace...), así que se rellenan con neutros y se
 * castea a través de `unknown`.
 */
function block(
  role: BlockRole,
  formatParams: FormatParams,
  exercises: readonly ExercisePrescription[],
): BlockPlan {
  const partial = {
    blockId: `b-${role}`,
    role,
    route: "",
    pattern: "",
    intensity: 0,
    repsBudget: 0,
    format: { formatId: 1, name: "formato" },
    formatParams,
    exercises,
    trace: [],
  };
  return partial as unknown as BlockPlan;
}

const STANDARD: FormatParams = { type: "standard" };
/** 1 ejercicio de 60 s sin descanso: aporta exactamente 60 s al bloque. */
const ONE_MIN = [ex(0, 60, 0)];
/** 1 ejercicio de 120 s: aporta 120 s. */
const TWO_MIN = [ex(0, 120, 0)];

describe("proposed-time", () => {
  describe("proposedSecondsForBlock", () => {
    it("amrap de 12 minutos son 720 s", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "amrap", minutes: 12 },
          exercises: [ex(10, 0, 0)],
        }),
      ).toBe(720);
    });

    it("tabata 20/10 x 8 son 240 s", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: {
            type: "tabata",
            workSeconds: 20,
            restSeconds: 10,
            rounds: 8,
          },
          exercises: [ex(0, 20, 0), ex(0, 20, 0)],
        }),
      ).toBe(240);
    });

    it("emom de 60 s durante 10 minutos son 600 s", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "emom", intervalSeconds: 60, totalMinutes: 10 },
          exercises: [ex(10, 0, 0)],
        }),
      ).toBe(600);
    });

    it("for_time con tope de 10 min y estimacion de 300 s toma la estimacion", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "for_time", timeCapMinutes: 10 },
          exercises: [ex(0, 300, 0)],
        }),
      ).toBe(300);
    });

    it("for_time con tope de 3 min y estimacion de 300 s toma el tope", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "for_time", timeCapMinutes: 3 },
          exercises: [ex(0, 300, 0)],
        }),
      ).toBe(180);
    });

    it("for_time sin tope usa la estimacion", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "for_time" },
          exercises: [ex(0, 300, 0)],
        }),
      ).toBe(300);
    });

    it("formato por repeticiones: 2 ejercicios de 10 reps y 30 s de descanso x 3 rondas son 360 s", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: { type: "complex", rounds: 3 },
          exercises: [ex(10, 0, 30), ex(10, 0, 30)],
        }),
      ).toBe(360);
    });

    it("usa totalRounds cuando el formato no trae rounds", () => {
      const params = {
        type: "i_go_you_go",
        totalRounds: 2,
      } satisfies FormatParams;
      expect(
        proposedSecondsForBlock({
          formatParams: params,
          exercises: [ex(0, 100, 20)],
        }),
      ).toBe(240);
    });

    it("rounds malformados (texto, negativo) se ignoran y cuenta una pasada", () => {
      const malformed = {
        type: "complex",
        rounds: "tres",
      } as unknown as FormatParams;
      expect(
        proposedSecondsForBlock({
          formatParams: malformed,
          exercises: [ex(0, 100, 0)],
        }),
      ).toBe(100);
      const negative = { type: "complex", rounds: -2 } as FormatParams;
      expect(
        proposedSecondsForBlock({
          formatParams: negative,
          exercises: [ex(0, 100, 0)],
        }),
      ).toBe(100);
    });

    it("un bloque por repeticiones casi vacio vale el minimo de 60 s", () => {
      expect(
        proposedSecondsForBlock({
          formatParams: STANDARD,
          exercises: [ex(2, 0, 0)],
        }),
      ).toBe(60);
      expect(
        proposedSecondsForBlock({ formatParams: STANDARD, exercises: [] }),
      ).toBe(60);
    });
  });

  describe("requiredBlockRoles", () => {
    it("sesion sin Deuteros: pide todos los bloques", () => {
      const blocks = [
        block("ROM_LOWER", STANDARD, ONE_MIN),
        block("ROM_CORE", STANDARD, ONE_MIN),
        block("ROM_UPPER", STANDARD, ONE_MIN),
      ];
      expect(requiredBlockRoles(blocks, [])).toEqual([
        "ROM_LOWER",
        "ROM_CORE",
        "ROM_UPPER",
      ]);
    });

    it("sesion con Deuteros: base + el Deuteros elegido + Athlos", () => {
      const blocks = [
        block("INITIUM", STANDARD, ONE_MIN),
        block("NUCLEUS", STANDARD, ONE_MIN),
        block("DEUTEROS_1", STANDARD, ONE_MIN),
        block("DEUTEROS_2", STANDARD, ONE_MIN),
        block("ATHLOS", STANDARD, ONE_MIN),
      ];
      expect(
        requiredBlockRoles(blocks, [
          "INITIUM",
          "NUCLEUS",
          "DEUTEROS_2",
          "ATHLOS",
        ]),
      ).toEqual(["INITIUM", "NUCLEUS", "DEUTEROS_2", "ATHLOS"]);
    });

    it("con los dos Deuteros completados pide el de menor tiempo propuesto", () => {
      const blocks = [
        block("INITIUM", STANDARD, ONE_MIN),
        block("NUCLEUS", STANDARD, ONE_MIN),
        block("DEUTEROS_1", STANDARD, TWO_MIN),
        block("DEUTEROS_2", STANDARD, ONE_MIN),
        block("EPIKOS", STANDARD, ONE_MIN),
      ];
      expect(
        requiredBlockRoles(blocks, [
          "INITIUM",
          "NUCLEUS",
          "DEUTEROS_1",
          "DEUTEROS_2",
          "EPIKOS",
        ]),
      ).toEqual(["INITIUM", "NUCLEUS", "DEUTEROS_2", "EPIKOS"]);
    });

    it("sin ningun Deuteros completado agrega un marcador que nunca se cumple", () => {
      const blocks = [
        block("INITIUM", STANDARD, ONE_MIN),
        block("NUCLEUS", STANDARD, ONE_MIN),
        block("DEUTEROS_1", STANDARD, ONE_MIN),
        block("DEUTEROS_2", STANDARD, ONE_MIN),
        block("ATHLOS", STANDARD, ONE_MIN),
      ];
      const required = requiredBlockRoles(blocks, ["INITIUM", "NUCLEUS"]);
      expect(required).toContain("DEUTEROS");
      expect(required).toContain("ATHLOS");
      expect(required).not.toContain("DEUTEROS_1");
    });

    it("los bloques alternativos no se piden ni en sesiones sin Deuteros", () => {
      const blocks = [
        block("INITIUM", STANDARD, ONE_MIN),
        block("COMBOS_I", STANDARD, ONE_MIN),
        block("COMBOS_II", STANDARD, ONE_MIN),
        block("COMBOS_II_ALT", STANDARD, ONE_MIN),
        block("STRETCHING", STANDARD, ONE_MIN),
      ];
      const required = requiredBlockRoles(blocks, [
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "STRETCHING",
      ]);
      expect(required).toEqual([
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "STRETCHING",
      ]);
      expect(required).not.toContain("COMBOS_II_ALT");
    });
  });

  describe("proposedSecondsForSession", () => {
    it("ignora el bloque ALT: suma exacta de los cuatro bloques visibles", () => {
      const blocks = [
        block("INITIUM", STANDARD, [ex(0, 100, 0)]),
        block("COMBOS_I", STANDARD, [ex(0, 200, 0)]),
        block("COMBOS_II", STANDARD, [ex(0, 300, 0)]),
        block("COMBOS_II_ALT", STANDARD, [ex(0, 999, 0)]),
        block("STRETCHING", STANDARD, [ex(0, 400, 0)]),
      ];
      const completed = ["INITIUM", "COMBOS_I", "COMBOS_II", "STRETCHING"];
      expect(proposedSecondsForSession(blocks, completed)).toBe(1000);
    });

    it("con Deuteros suma solo los bloques de la ruta jugada", () => {
      const blocks = [
        block("INITIUM", STANDARD, [ex(0, 100, 0)]),
        block("NUCLEUS", STANDARD, [ex(0, 200, 0)]),
        block("DEUTEROS_1", STANDARD, [ex(0, 300, 0)]),
        block("DEUTEROS_2", STANDARD, [ex(0, 500, 0)]),
        block("ATHLOS", STANDARD, [ex(0, 400, 0)]),
      ];
      expect(
        proposedSecondsForSession(blocks, [
          "INITIUM",
          "NUCLEUS",
          "DEUTEROS_2",
          "ATHLOS",
        ]),
      ).toBe(1200);
    });
  });

  describe("evaluateTrainingAura", () => {
    // Sesion de 3 bloques ROM de 600 s cada uno: propuesto total = 1800 s.
    const tenMin = [ex(0, 600, 0)];
    const blocks = [
      block("ROM_LOWER", STANDARD, tenMin),
      block("ROM_CORE", STANDARD, tenMin),
      block("ROM_UPPER", STANDARD, tenMin),
    ];
    const allDone = ["ROM_LOWER", "ROM_CORE", "ROM_UPPER"];
    const completedAt = new Date("2026-11-17T15:00:00.000Z");
    const startedAfter = (sec: number): Date =>
      new Date(completedAt.getTime() - sec * 1000);

    function run(
      overrides: Partial<Parameters<typeof evaluateTrainingAura>[0]> = {},
    ): ReturnType<typeof evaluateTrainingAura> {
      return evaluateTrainingAura({
        blocks,
        blocksCompleted: allDone,
        startedAt: startedAfter(1800),
        completedAt,
        attendedToday: false,
        otherAppAuraToday: false,
        ...overrides,
      });
    }

    it("el minimo es el 80 por ciento", () => {
      expect(AURA_TIME_RATIO).toBe(0.8);
    });

    it("bloques completos y duracion exacta al 80 por ciento: acredita", () => {
      const r = run({ startedAt: startedAfter(1440) });
      expect(r.awarded).toBe(true);
      expect(r.reason).toBe("ok");
      expect(r.proposedSec).toBe(1800);
      expect(r.durationSec).toBe(1440);
      expect(r.ratio).toBe(0.8);
      expect(r.blocksOk).toBe(true);
    });

    it("79 por ciento: no acredita por tiempo insuficiente", () => {
      const r = run({ startedAt: startedAfter(1422) });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("tiempo_insuficiente");
      expect(r.ratio).toBe(0.79);
    });

    it("falta un bloque requerido: bloques incompletos", () => {
      const r = run({ blocksCompleted: ["ROM_LOWER", "ROM_CORE"] });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("bloques_incompletos");
      expect(r.blocksOk).toBe(false);
    });

    it("asistio a clase ese dia: no acredita", () => {
      const r = run({ attendedToday: true });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("asistio_hoy");
    });

    it("la otra fuente de la app ya acredito ese dia: no acredita", () => {
      const r = run({ otherAppAuraToday: true });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("ya_sumo_hoy");
    });

    it("startedAt 6 minutos en el futuro: inicio invalido", () => {
      const r = run({
        startedAt: new Date(completedAt.getTime() + 6 * 60_000),
      });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("inicio_invalido");
    });

    it("startedAt 4 minutos en el futuro se tolera (desfase de reloj) pero la duracion es 0", () => {
      const r = run({
        startedAt: new Date(completedAt.getTime() + 4 * 60_000),
      });
      expect(r.reason).not.toBe("inicio_invalido");
      expect(r.durationSec).toBe(0);
      expect(r.awarded).toBe(false);
    });

    it("startedAt hace 13 horas: inicio invalido", () => {
      const r = run({ startedAt: startedAfter(13 * 3600) });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("inicio_invalido");
    });

    it("startedAt invalido (NaN): inicio invalido", () => {
      const r = run({ startedAt: new Date("no es una fecha") });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("inicio_invalido");
    });

    it("sesion sin bloques: sin bloques", () => {
      const r = run({ blocks: [], blocksCompleted: [] });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("sin_bloques");
    });

    it("sesion con solo bloques alternativos cuenta como sin bloques", () => {
      const r = run({
        blocks: [block("COMBOS_II_ALT", STANDARD, tenMin)],
        blocksCompleted: ["COMBOS_II_ALT"],
      });
      expect(r.awarded).toBe(false);
      expect(r.reason).toBe("sin_bloques");
    });

    it("con ALT en la sesion y sin completarlo, acredita igual", () => {
      const withAlt = [
        block("INITIUM", STANDARD, [ex(0, 100, 0)]),
        block("COMBOS_I", STANDARD, [ex(0, 200, 0)]),
        block("COMBOS_II", STANDARD, [ex(0, 300, 0)]),
        block("COMBOS_II_ALT", STANDARD, [ex(0, 999, 0)]),
        block("STRETCHING", STANDARD, [ex(0, 400, 0)]),
      ];
      const r = run({
        blocks: withAlt,
        blocksCompleted: ["INITIUM", "COMBOS_I", "COMBOS_II", "STRETCHING"],
        startedAt: startedAfter(1000),
      });
      expect(r.blocksOk).toBe(true);
      expect(r.proposedSec).toBe(1000);
      expect(r.awarded).toBe(true);
    });
  });
});
