/**
 * Fase 201 Plan 03: motor de progresion puro de Conquer (sintesis §4).
 *
 * Tres capas:
 *  - casos dorados (tabla §9.1 de la research, verificados contra el oraculo);
 *  - test diferencial: `nextTarget` contra `next()` del HTML original
 *    (`test/conquer/fixtures/conquer-app.html`, cargado con `node:vm`) sobre
 *    todas las secuencias de hasta 4 marcas;
 *  - reglas nuevas que el oraculo no tiene o tiene mal (A1, A2, A3, A6, A8, A10)
 *    y la serie de la hoja "Simulacion" del xlsx.
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  nextTarget,
  selectReales,
  harderPosition,
  easierPosition,
  pickSubir,
  calibracion,
  caidaE1,
  accuracy,
  holdPreload,
  PISO,
  TECHO,
  DEFAULT_INC,
} from "../../src/modules/conquer/engine";
import type { Estado, MarkRow, Unit } from "../../src/modules/conquer/engine";
import { loadOracle } from "../conquer/oracle";

const oracle = loadOracle(
  path.resolve(__dirname, "../conquer/fixtures/conquer-app.html"),
);

/** Estados del oraculo (con espacio) -> estados del motor (con guion bajo). */
const ESTADO_DEL_ORACULO: Record<string, Estado> = {
  "sin datos": "sin_datos",
  rango: "rango",
  techo1: "techo1",
  bajo: "bajo",
  subir: "subir",
};

/** Todas las secuencias de largo 0..maxLen sobre el alfabeto (con repeticion). */
function allSequences(alphabet: readonly number[], maxLen: number): number[][] {
  let level: number[][] = [[]];
  const all: number[][] = [[]];
  for (let len = 1; len <= maxLen; len++) {
    const next: number[][] = [];
    for (const seq of level) {
      for (const v of alphabet) next.push([...seq, v]);
    }
    all.push(...next);
    level = next;
  }
  return all;
}

// ─── constantes ─────────────────────────────────────────────────────────────

describe("constantes del motor (§4.4)", () => {
  it("piso, techo e incremento por unidad", () => {
    expect(PISO).toEqual({ reps: 3, s: 4 });
    expect(TECHO).toEqual({ reps: 8, s: 12 });
    expect(DEFAULT_INC).toEqual({ reps: 1, s: 2 });
  });
});

// ─── nextTarget: casos dorados ──────────────────────────────────────────────

describe("nextTarget — casos dorados (research §9.1)", () => {
  const dorados: Array<[number[], Unit, number, Estado]> = [
    [[], "reps", 3, "sin_datos"],
    [[6], "reps", 7, "rango"],
    [[6, 7], "reps", 8, "rango"],
    [[6, 7, 8], "reps", 8, "techo1"],
    [[6, 7, 8, 8], "reps", 3, "subir"],
    [[8, 7], "reps", 8, "rango"],
    [[8, 8, 7], "reps", 8, "rango"],
    [[2], "reps", 3, "bajo"],
    [[3], "reps", 4, "rango"],
    [[5, 2], "reps", 3, "bajo"],
    [[8, 8, 8], "reps", 3, "subir"],
    [[], "s", 4, "sin_datos"],
    [[9], "s", 11, "rango"],
    [[3], "s", 5, "bajo"],
    [[10, 12], "s", 12, "techo1"],
    [[11, 12], "s", 12, "techo1"],
    [[12, 12], "s", 4, "subir"],
  ];

  it.each(dorados)(
    "marcas %j (%s) -> objetivo %i, estado %s",
    (values, unit, target, estado) => {
      expect(nextTarget(values, unit, DEFAULT_INC[unit])).toEqual({
        target,
        estado,
      });
    },
  );

  it("el incremento es un parametro (editable por alumno)", () => {
    expect(nextTarget([5], "reps", 2)).toEqual({ target: 7, estado: "rango" });
    expect(nextTarget([7], "reps", 3)).toEqual({ target: 8, estado: "rango" });
    expect(nextTarget([2], "reps", 2)).toEqual({ target: 4, estado: "bajo" });
  });
});

// ─── nextTarget: diferencial contra el oraculo ──────────────────────────────

describe("nextTarget — diferencial contra next() del oraculo", () => {
  const ALPHABET = [0, 2, 3, 5, 6, 7, 8, 9, 12] as const;
  const sequences = allSequences(ALPHABET, 4);

  it("la grilla tiene 7381 secuencias por unidad", () => {
    expect(sequences).toHaveLength(7381);
  });

  it.each<Unit>(["reps", "s"])(
    "las 7381 secuencias coinciden en objetivo y estado (%s)",
    (unit) => {
      const diffs: string[] = [];
      for (const seq of sequences) {
        const got = nextTarget(seq, unit, DEFAULT_INC[unit]);
        const want = oracle.next(seq, unit);
        const wantEstado = ESTADO_DEL_ORACULO[want.est];
        if (got.target !== want.obj || got.estado !== wantEstado) {
          diffs.push(
            `[${seq.join(",")}] motor=${got.target}/${got.estado} oraculo=${want.obj}/${want.est}`,
          );
        }
      }
      expect(diffs).toEqual([]);
    },
  );
});

// ─── hoja "Simulacion" del xlsx ─────────────────────────────────────────────

describe("hoja Simulacion del xlsx (12 sesiones de E1)", () => {
  // Reales: 5,6,7,8,8 y, tras el cambio de progresion, 3,4,5,6,7,8,8.
  const REALES = [5, 6, 7, 8, 8, 3, 4, 5, 6, 7, 8, 8];
  const OBJETIVOS = [6, 7, 8, 8, 3, 4, 5, 6, 7, 8, 8, 3];
  const ESTADOS: Estado[] = [
    "rango",
    "rango",
    "rango",
    "techo1",
    "subir",
    "rango",
    "rango",
    "rango",
    "rango",
    "rango",
    "techo1",
    "subir",
  ];
  const CAMBIO_DESPUES_DE = 5;

  function day(i: number): string {
    return `2026-03-${String(i + 1).padStart(2, "0")}`;
  }

  it("el objetivo y el estado tras cada sesion siguen la hoja", () => {
    const rows: MarkRow[] = [];
    let rungId = 1;
    let sinceDate: string | null = null;
    const targets: number[] = [];
    const estados: Estado[] = [];

    REALES.forEach((value, i) => {
      if (i === CAMBIO_DESPUES_DE) {
        // El alumno sube de progresion: peldano nuevo, "desde" = ultima sesion.
        rungId = 2;
        sinceDate = day(i - 1);
      }
      rows.push({
        date: day(i),
        value,
        rungId,
        prevTarget: targets.length > 0 ? targets[targets.length - 1] : null,
      });
      const reales = selectReales(rows, sinceDate, rungId).map((r) => r.value);
      const res = nextTarget(reales, "reps", DEFAULT_INC.reps);
      targets.push(res.target);
      estados.push(res.estado);
    });

    expect(targets).toEqual(OBJETIVOS);
    expect(estados).toEqual(ESTADOS);
  });

  it("la misma serie con el cambio de progresion en el MISMO dia (A1)", () => {
    // La 5a sesion dispara SUBIR con el peldano viejo y el alumno cambia el
    // peldano ese mismo dia: la 6a sesion se guarda con el peldano nuevo
    // el mismo dia del cambio (fecha == since) y tiene que contar.
    const changeDay = day(4);
    const rows: MarkRow[] = [
      ...[5, 6, 7, 8, 8].map((value, i) => ({
        date: day(i),
        value,
        rungId: 1,
        prevTarget: null,
      })),
      { date: changeDay, value: 3, rungId: 2, prevTarget: 3 },
    ];
    const reales = selectReales(rows, changeDay, 2).map((r) => r.value);
    expect(reales).toEqual([3]);
    expect(nextTarget(reales, "reps", 1)).toEqual({
      target: 4,
      estado: "rango",
    });
  });
});

// ─── selectReales (A1) ──────────────────────────────────────────────────────

describe("selectReales (A1: el dia del cambio)", () => {
  const row = (date: string, value: number, rungId: number): MarkRow => ({
    date,
    value,
    rungId,
    prevTarget: null,
  });

  it("sinceDate null cuenta todo", () => {
    const rows = [row("2026-03-02", 6, 1), row("2026-03-01", 5, 2)];
    expect(selectReales(rows, null, 9).map((r) => r.value)).toEqual([5, 6]);
  });

  it("las sesiones posteriores al cambio cuentan, las anteriores no", () => {
    const rows = [
      row("2026-03-01", 5, 1),
      row("2026-03-02", 6, 1),
      row("2026-03-03", 7, 2),
    ];
    expect(selectReales(rows, "2026-03-02", 2).map((r) => r.value)).toEqual([
      7,
    ]);
  });

  it("el mismo dia del cambio cuenta si se guardo con el peldano nuevo", () => {
    const rows = [row("2026-03-02", 3, 2)];
    expect(selectReales(rows, "2026-03-02", 2)).toHaveLength(1);
  });

  it("el mismo dia del cambio NO cuenta si se guardo con el peldano viejo", () => {
    const rows = [row("2026-03-02", 8, 1)];
    expect(selectReales(rows, "2026-03-02", 2)).toEqual([]);
  });

  it("devuelve una copia ordenada por fecha ascendente", () => {
    const rows = [
      row("2026-03-05", 7, 1),
      row("2026-03-03", 5, 1),
      row("2026-03-04", 6, 1),
    ];
    const snapshot = rows.map((r) => r.date);
    const res = selectReales(rows, null, 1);
    expect(res.map((r) => r.date)).toEqual([
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
    expect(res).not.toBe(rows);
    expect(rows.map((r) => r.date)).toEqual(snapshot);
  });
});

// ─── harderPosition / easierPosition (A2) ───────────────────────────────────

describe("harderPosition / easierPosition (A2: sin tope infinito)", () => {
  // position 0 = peldano mas dificil.
  it("el mas dificil siguiente es el mayor p menor al actual", () => {
    expect(harderPosition([0, 1, 2, 3], 2)).toBe(1);
  });

  it("saltea posiciones inactivas hacia lo mas dificil", () => {
    expect(harderPosition([0, 3, 4], 4)).toBe(3);
    expect(harderPosition([0, 4], 4)).toBe(0);
  });

  it("en el peldano mas dificil no hay siguiente (null)", () => {
    expect(harderPosition([0, 1, 2], 0)).toBeNull();
    expect(harderPosition([2, 3], 2)).toBeNull();
  });

  it("el mas facil siguiente es el menor p mayor al actual", () => {
    expect(easierPosition([0, 1, 2, 3], 1)).toBe(2);
  });

  it("saltea posiciones inactivas hacia lo mas facil", () => {
    expect(easierPosition([0, 1, 4], 1)).toBe(4);
  });

  it("en el peldano mas facil no hay siguiente (null)", () => {
    expect(easierPosition([0, 1, 2], 2)).toBeNull();
    expect(easierPosition([0, 1], 5)).toBeNull();
  });

  it("no depende del orden del arreglo de entrada", () => {
    expect(harderPosition([3, 0, 2, 1], 2)).toBe(1);
    expect(easierPosition([3, 0, 2, 1], 1)).toBe(2);
  });
});

// ─── pickSubir (A3) ─────────────────────────────────────────────────────────

describe("pickSubir (A3: un solo SUBIR por ejercicio)", () => {
  it.each<[string, Record<"e1" | "e2" | "e3", Estado>, string | null]>([
    ["e1 y e2 en subir -> e1", { e1: "subir", e2: "subir", e3: "rango" }, "e1"],
    [
      "e1 en rango, e2 y e3 en subir -> e2",
      { e1: "rango", e2: "subir", e3: "subir" },
      "e2",
    ],
    ["solo e3 en subir -> e3", { e1: "techo1", e2: "bajo", e3: "subir" }, "e3"],
    [
      "sin ningun subir -> null",
      { e1: "rango", e2: "techo1", e3: "sin_datos" },
      null,
    ],
  ])("%s", (_name, estados, expected) => {
    expect(pickSubir(estados)).toBe(expected);
  });
});

// ─── calibracion (S12-4) ────────────────────────────────────────────────────

describe("calibracion (S12-4, tabla §4.3)", () => {
  it.each([
    [2, "reps", "bajar"],
    [3, "reps", "quedarse"],
    [5, "reps", "quedarse"],
    [6, "reps", "subir"],
    [8, "reps", "subir"],
    [3, "s", "bajar"],
    [4, "s", "quedarse"],
    [8, "s", "quedarse"],
    [9, "s", "subir"],
    [12, "s", "subir"],
  ] as const)("E1 = %i (%s) -> %s", (e1, unit, expected) => {
    expect(calibracion(e1, unit)).toBe(expected);
  });
});

// ─── caidaE1 (A6) ───────────────────────────────────────────────────────────

describe("caidaE1 (A6: dos bajas seguidas, sin contar la calibracion)", () => {
  it.each<[number[], boolean]>([
    [[5, 6, 4, 3], true],
    [[5, 6, 4, 5], false],
    [[5, 6, 6, 5], false],
    [[9, 8, 7], false],
    [[3, 9, 8, 7], true],
    [[], false],
    [[8, 7, 6, 5, 4], true],
  ])("marcas %j -> %s", (values, expected) => {
    expect(caidaE1(values)).toBe(expected);
  });
});

// ─── accuracy (A8) ──────────────────────────────────────────────────────────

describe("accuracy (A8: sobre todo el historial con prevTarget)", () => {
  it("ignora los pares sin prevTarget y calcula acierto y delta", () => {
    const res = accuracy([
      { value: 7, prevTarget: 7 },
      { value: 5, prevTarget: 8 },
      { value: 9, prevTarget: 8 },
      { value: 6, prevTarget: null },
    ]);
    expect(res).toEqual({ n: 3, hits: 2, pct: 67, delta: -0.7 });
  });

  it("alcanzar el objetivo justo cuenta como acierto (>=)", () => {
    expect(accuracy([{ value: 8, prevTarget: 8 }])).toEqual({
      n: 1,
      hits: 1,
      pct: 100,
      delta: 0,
    });
  });

  it("sin pares: pct y delta null", () => {
    expect(accuracy([])).toEqual({ n: 0, hits: 0, pct: null, delta: null });
    expect(accuracy([{ value: 5, prevTarget: null }])).toEqual({
      n: 0,
      hits: 0,
      pct: null,
      delta: null,
    });
  });

  it("el delta se redondea a 1 decimal", () => {
    // (+1 +0 +0) / 3 = 0.333... -> 0.3
    const res = accuracy([
      { value: 6, prevTarget: 5 },
      { value: 5, prevTarget: 5 },
      { value: 5, prevTarget: 5 },
    ]);
    expect(res.delta).toBe(0.3);
    expect(res.pct).toBe(100);
  });
});

// ─── holdPreload (A10) ──────────────────────────────────────────────────────

describe("holdPreload (A10)", () => {
  it("sin marcas, 8 segundos", () => {
    expect(holdPreload([])).toBe(8);
  });

  it("con marcas, la ultima", () => {
    expect(holdPreload([10, 14])).toBe(14);
    expect(holdPreload([14, 10])).toBe(10);
  });
});
