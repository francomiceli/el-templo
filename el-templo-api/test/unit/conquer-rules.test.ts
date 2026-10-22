/**
 * Fase 201 Plan 04: reglas de niveles, recortes y alertas de Conquer
 * (sintesis §2, §3.2, §5, §5.1, §8.2; A11-A14, D-14, D-15).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  LEVELS,
  LEVEL_DAYS,
  DEFAULT_START_OFFSET,
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
  shiftStartPosition,
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

  it("arranque por nivel (8.2): ternero 2, novillo 1, toro 0", () => {
    expect(DEFAULT_START_OFFSET).toEqual({ ternero: 2, novillo: 1, toro: 0 });
  });
});

describe("shiftStartPosition (8.2, D-14)", () => {
  it.each([
    ["offset 2 desde 0", 0, 2, [0, 1, 2, 3, 4, 5, 6], 2],
    ["offset 0 no mueve", 4, 0, [0, 1, 2, 3, 4, 5, 6], 4],
    ["offset 1 desde 3", 3, 1, [0, 1, 2, 3, 4, 5, 6], 4],
    ["clamp al mas facil activo", 5, 2, [0, 1, 2, 3, 4, 5, 6], 6],
    ["salta inactivos", 0, 1, [0, 2, 3], 2],
    ["salta inactivos y clamp", 2, 3, [0, 2, 3], 3],
    ["la base inactiva avanza al siguiente activo", 1, 1, [0, 2, 3], 2],
    ["una sola activa", 0, 2, [0], 0],
  ] as [string, number, number, number[], number][])(
    "%s",
    (_label, from, offset, active, expected) => {
      expect(shiftStartPosition(from, offset, active)).toBe(expected);
    },
  );
});

describe("cutProposal (5.1, A12)", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ])("toro con etapa %i propone la etapa %i", (cutStage, stage) => {
    const proposal = cutProposal("toro", cutStage);
    expect(proposal.kind).toBe("etapa");
    if (proposal.kind === "etapa") {
      expect(proposal.stage).toBe(stage);
      expect(proposal.label).toBe(CUT_STAGE_LABELS[stage]);
    }
  });

  it.each([
    ["toro", 5],
    ["toro", 6],
    ["novillo", 0],
    ["novillo", 3],
    ["ternero", 0],
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
