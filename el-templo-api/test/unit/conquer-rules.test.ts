/**
 * Fase 201 Plan 04: reglas de niveles, recortes y alertas de Conquer
 * (sintesis §2, §3.2, §5, §5.1; A11-A14, D-14, D-15). El arranque por nivel
 * (offset de peldaños, §8.2) se borró en el plan 201-25 (DA-5).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  allowedModes,
  LEVELS,
  LEVEL_DAYS,
  PAIN_ALERT_MIN,
  INACTIVE_DAYS,
  CHECK_INTERVAL_DAYS,
  CHECK_OVERDUE_DAYS,
  LEVEL_UP_WEEKS,
  DEFAULT_COMBO_WEEKS_N,
  OPENING_BASE,
  OPENING_FROM_WEEK3,
  MAX_TORO_CUT_STAGE,
  CUT_STAGE_LABELS,
  ALERT_SEVERITY,
  ALERT_LABELS,
  isValidLevelDays,
  levelHasCombos,
  nextLevel,
  cutProposal,
  openingTarget,
  saturdayPlan,
  worstLight,
} from "../../src/modules/conquer/rules";
import type { AlertKind, Level } from "../../src/modules/conquer/rules";

describe("niveles y dias validos (A14)", () => {
  it("los niveles van de menor a mayor", () => {
    expect([...LEVELS]).toEqual(["ternero", "novillo", "toro"]);
  });

  it("LEVEL_DAYS: ternero 2|3, novillo 3|4, toro 4", () => {
    expect(LEVEL_DAYS).toEqual({
      ternero: [2, 3],
      novillo: [3, 4],
      toro: [4],
    });
  });

  it.each([
    ["ternero", 2, true],
    ["ternero", 3, true],
    ["ternero", 4, false],
    ["ternero", 1, false],
    ["novillo", 2, false],
    ["novillo", 3, true],
    ["novillo", 4, true],
    ["toro", 4, true],
    ["toro", 3, false],
    ["toro", 5, false],
  ] as [Level, number, boolean][])(
    "isValidLevelDays(%s, %i) = %s",
    (level, days, expected) => {
      expect(isValidLevelDays(level, days)).toBe(expected);
    },
  );

  it.each([
    ["ternero", false],
    ["novillo", false],
    ["toro", true],
  ] as [Level, boolean][])("levelHasCombos(%s) = %s", (level, expected) => {
    expect(levelHasCombos(level)).toBe(expected);
  });

  it.each([
    ["ternero", "novillo"],
    ["novillo", "toro"],
    ["toro", null],
  ] as [Level, Level | null][])("nextLevel(%s) = %s", (level, expected) => {
    expect(nextLevel(level)).toBe(expected);
  });
});

describe("allowedModes (anexo 1, DA-10)", () => {
  it.each([
    ["s", "e1", ["hold"]],
    ["s", "e2", ["hold"]],
    ["s", "e3", ["hold"]],
    ["reps", "e1", ["completa", "negativa"]],
    ["reps", "e2", ["completa", "negativa"]],
    ["reps", "e3", ["completa", "negativa"]],
    ["reps", "hold", ["hold"]],
    ["s", "hold", ["hold"]],
  ] as [
    "reps" | "s",
    "e1" | "e2" | "e3" | "hold",
    ("completa" | "negativa" | "hold")[],
  ][])("unidad %s, escalon %s -> %j", (unit, step, expected) => {
    expect(allowedModes(unit, step)).toEqual(expected);
  });
});

describe("umbrales", () => {
  it("valores de la sintesis", () => {
    expect(PAIN_ALERT_MIN).toBe(4);
    expect(INACTIVE_DAYS).toBe(7);
    expect(CHECK_INTERVAL_DAYS).toBe(28);
    expect(CHECK_OVERDUE_DAYS).toBe(42);
    expect(LEVEL_UP_WEEKS).toBe(4);
    expect(DEFAULT_COMBO_WEEKS_N).toBe(2);
    expect(OPENING_BASE).toBe(3);
    expect(OPENING_FROM_WEEK3).toBe(4);
    expect(MAX_TORO_CUT_STAGE).toBe(5);
  });
});

describe("cutProposal (5.1, A12, anexo 8)", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ])("toro con etapa %i propone la etapa %i", (cutStage, stage) => {
    const proposal = cutProposal("toro", cutStage);
    expect(proposal?.kind).toBe("etapa");
    if (proposal?.kind === "etapa") {
      expect(proposal.stage).toBe(stage);
      expect(proposal.label).toBe(CUT_STAGE_LABELS[stage]);
    }
  });

  // Anexo 8 (201-26 DA-12): el paso 6 es SOLO de Ternero y Novillo.
  it.each([5, 6, 9])(
    "toro con etapa %i no tiene propuesta (null)",
    (cutStage) => {
      expect(cutProposal("toro", cutStage)).toBeNull();
    },
  );

  it.each([
    ["novillo", 0],
    ["novillo", 3],
    ["novillo", 5],
    ["ternero", 0],
    ["ternero", 6],
  ] as [Level, number][])(
    "%s con etapa %i propone bajar un escalon",
    (level, cutStage) => {
      expect(cutProposal(level, cutStage)).toEqual({
        kind: "bajar_escalon",
        label: "Bajar una progresión el escalón que dispara la molestia",
      });
    },
  );

  it("las etiquetas de las 5 etapas", () => {
    expect(CUT_STAGE_LABELS).toEqual({
      1: "Sábado: drops de 10 a 6",
      2: "Sábado: series máximas de 3 a 2",
      3: "Sábado: se saca",
      4: "Combo de apertura: de 4 a 3",
      5: "Combo de apertura: se saca",
    });
  });
});

describe("openingTarget (3.2, A11)", () => {
  it.each([
    ["toro", 1, 0, 3],
    ["toro", 2, 0, 3],
    ["toro", 3, 0, 4],
    ["toro", 9, 0, 4],
    ["toro", 3, 3, 4], // las etapas 1-3 recortan el sabado, no la apertura
    ["toro", 3, 4, 3], // etapa 4: de 4 a 3
    ["toro", 1, 4, 3],
    ["toro", 5, 5, null], // etapa 5: se saca
    ["toro", 1, 5, null],
    ["novillo", 3, 0, null],
    ["ternero", 3, 0, null],
  ] as [Level, number, number, number | null][])(
    "%s semana %i etapa %i -> %s",
    (level, week, cutStage, expected) => {
      expect(openingTarget(level, week, cutStage)).toBe(expected);
    },
  );
});

describe("saturdayPlan (3.2, 5.1)", () => {
  it.each([
    [0, { maxSeries: 3, drops: 10, target: 13 }],
    [1, { maxSeries: 3, drops: 6, target: 9 }],
    [2, { maxSeries: 2, drops: 6, target: 8 }],
  ])("toro etapa %i", (cutStage, expected) => {
    expect(saturdayPlan("toro", cutStage)).toEqual(expected);
  });

  it.each([3, 4, 5])("toro etapa %i: el sabado se saca", (cutStage) => {
    expect(saturdayPlan("toro", cutStage)).toBeNull();
  });

  it.each(["ternero", "novillo"] as Level[])("%s no tiene sabado", (level) => {
    expect(saturdayPlan(level, 0)).toBeNull();
  });
});

describe("alertas (5, D-15)", () => {
  it("severidad de cada alerta", () => {
    expect(ALERT_SEVERITY).toEqual({
      molestia: "rojo",
      caida: "rojo",
      tope_escalera: "amarillo",
      inactivo: "amarillo",
      control_vencido: "amarillo",
      control_dia0_pendiente: "amarillo",
      paso_nivel: "verde",
    });
  });

  it("cada alerta tiene su etiqueta en español", () => {
    expect(ALERT_LABELS).toEqual({
      molestia: "Molestia",
      caida: "Caída",
      tope_escalera: "Tope de escalera",
      paso_nivel: "Paso de nivel",
      inactivo: "Inactivo",
      control_vencido: "Control físico vencido",
      control_dia0_pendiente: "Control día 0 pendiente",
    });
  });

  it.each([
    [[], "ok"],
    [["paso_nivel"], "verde"],
    [["paso_nivel", "inactivo"], "amarillo"],
    [["inactivo", "paso_nivel"], "amarillo"],
    [["molestia"], "rojo"],
    [["paso_nivel", "inactivo", "caida"], "rojo"],
    [["tope_escalera", "control_vencido"], "amarillo"],
    [["control_dia0_pendiente"], "amarillo"],
  ] as [AlertKind[], string][])("worstLight(%j) = %s", (kinds, expected) => {
    expect(worstLight(kinds)).toBe(expected);
  });
});
