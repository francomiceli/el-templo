/**
 * Fase 201 plan 201-26 (anexo §8, DA-13): frases de las alertas del coach.
 *
 * El anexo de Nacho (`fixtures/conquer-catalogo.md`, tabla "Alertas y orden de
 * recorte") es el oráculo: cada plantilla se llena con los datos del caso y la
 * frase de `alertText` tiene que ser IDÉNTICA. Sin DB, sin servidor: corre con
 * `vitest.config.unit.ts`.
 */
import path from "node:path";
import { describe, it, expect } from "vitest";
import { alertText } from "../../src/modules/conquer/alert-text";
import { loadAnnex, type AnnexAlert } from "../conquer/annex";

const ANNEX_PATH = path.resolve(
  __dirname,
  "../conquer/fixtures/conquer-catalogo.md",
);
const annex = loadAnnex(ANNEX_PATH);

interface AnnexCase {
  /** Nombre de la fila del anexo. */
  name: string;
  kind: string;
  detail: Record<string, unknown>;
  /** Valor de cada `{placeholder}` de la plantilla del anexo. */
  values: Record<string, string>;
}

const CASES: AnnexCase[] = [
  {
    name: "Molestia",
    kind: "molestia",
    detail: {
      pain: 6,
      date: "2026-10-21",
      dayKey: "plancha",
      dayLabel: "Plancha",
    },
    values: { n: "6", dia: "Plancha", fecha: "21/10" },
  },
  {
    name: "Caída",
    kind: "caida",
    detail: { exerciseName: "HSPU", values: [6, 5, 4] },
    values: { ejercicio: "HSPU" },
  },
  {
    name: "Inactivo",
    kind: "inactivo",
    detail: { lastSessionDate: "2026-10-05", days: 17 },
    values: { fecha: "5/10" },
  },
  {
    name: "Control físico vencido",
    kind: "control_vencido",
    detail: { lastCheckDate: "2026-09-02", days: 50 },
    values: { fecha: "2/9" },
  },
  {
    name: "Tope de escalera",
    kind: "tope_escalera",
    detail: { exerciseName: "Planche press", step: "e2", rungName: "full" },
    values: { ejercicio: "Planche press", n: "2" },
  },
  {
    name: "Paso de nivel",
    kind: "paso_nivel",
    detail: { from: "ternero", to: "novillo", weeks: 4 },
    values: { alumno: "Ana" },
  },
];

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`sin valor para {${key}}`);
    return value;
  });
}

function annexRow(name: string): AnnexAlert {
  const row = annex.alerts.find((a) => a.name === name);
  if (!row) throw new Error(`el anexo no tiene la alerta ${name}`);
  return row;
}

describe("alertText: las 6 frases del anexo §8", () => {
  it("el anexo trae exactamente las 6 alertas que cubren los casos", () => {
    expect(annex.alerts.map((a) => a.name)).toEqual(CASES.map((c) => c.name));
  });

  it.each(CASES)(
    "$name: la frase sale idéntica a la plantilla del anexo",
    ({ name, kind, detail, values }) => {
      const expected = fill(annexRow(name).text, values);

      expect(alertText(kind, detail, "Ana")).toBe(expected);
    },
  );

  it("ejemplos del anexo con datos reales", () => {
    expect(
      alertText(
        "molestia",
        { pain: 6, date: "2026-10-21", dayKey: "plancha", dayLabel: "Plancha" },
        "Ana",
      ),
    ).toBe("Molestia 6/10 en Plancha el 21/10");
    expect(alertText("caida", { exerciseName: "HSPU" }, "Ana")).toBe(
      "El E1 de HSPU bajó 2 sesiones seguidas",
    );
  });
});

describe("alertText: molestia (DA-13)", () => {
  it("el sábado se llama Sábado", () => {
    expect(
      alertText(
        "molestia",
        { pain: 5, date: "2026-10-24", dayKey: "sabado", dayLabel: "Sábado" },
        "Ana",
      ),
    ).toBe("Molestia 5/10 en Sábado el 24/10");
  });

  it("una alerta vieja sin dayLabel cae al dayKey con mayúscula inicial", () => {
    expect(
      alertText(
        "molestia",
        { pain: 7, date: "2026-10-21", dayKey: "plancha" },
        "Ana",
      ),
    ).toBe("Molestia 7/10 en Plancha el 21/10");
  });

  it("el día y la fecha sin cero a la izquierda", () => {
    expect(
      alertText(
        "molestia",
        { pain: 4, date: "2026-03-05", dayLabel: "Front" },
        "Ana",
      ),
    ).toBe("Molestia 4/10 en Front el 5/3");
  });

  it.each([
    ["sin día", { pain: 6, date: "2026-10-21" }, "Molestia 6/10 el 21/10"],
    ["sin fecha", { pain: 6, dayLabel: "Plancha" }, "Molestia 6/10 en Plancha"],
    ["sin nada", {}, "Molestia"],
  ])("%s: se omite el dato que falta", (_caso, detail, expected) => {
    expect(alertText("molestia", detail, "Ana")).toBe(expected);
  });
});

describe("alertText: respaldos de DA-13", () => {
  it("inactivo sin ninguna sesión", () => {
    expect(
      alertText("inactivo", { lastSessionDate: null, days: 9 }, "Ana"),
    ).toBe("Todavía no registró sesiones");
  });

  it("control vencido sin fecha", () => {
    expect(alertText("control_vencido", {}, "Ana")).toBe(
      "Sin control físico todavía",
    );
  });

  it("control del día 0 pendiente (D-15, no está en el anexo)", () => {
    expect(alertText("control_dia0_pendiente", {}, "Ana")).toBe(
      "Todavía no hizo el control físico del día 0",
    );
  });

  it("tope de un combo: el nombre ya dice Combo y no lleva número de escalón", () => {
    expect(
      alertText(
        "tope_escalera",
        { exerciseName: "Combo Plancha", comboKey: "plancha", step: "combo" },
        "Ana",
      ),
    ).toBe("Combo Plancha llegó al tope de su escalera");
  });

  it.each([
    ["e1", "1"],
    ["e2", "2"],
    ["e3", "3"],
  ])("tope del escalón %s dice E%s", (step, n) => {
    expect(
      alertText("tope_escalera", { exerciseName: "HSPU", step }, "Ana"),
    ).toBe(`HSPU E${n} llegó al tope de su escalera`);
  });

  it("paso de nivel sin nombre de pila", () => {
    expect(alertText("paso_nivel", {}, "  ")).toBe(
      "El alumno completó 4 semanas de su plan sin molestias",
    );
  });

  it("un tipo desconocido no rompe", () => {
    expect(alertText("otra", {}, "Ana")).toBe("Alerta del alumno");
  });

  it.each([
    "molestia",
    "caida",
    "inactivo",
    "control_vencido",
    "tope_escalera",
    "paso_nivel",
    "control_dia0_pendiente",
  ])("%s con el detalle vacío: nunca dice undefined ni null", (kind) => {
    const out = alertText(kind, {}, "");

    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/undefined|null|NaN|\{/);
  });

  it.each(["molestia", "caida", "inactivo", "tope_escalera"])(
    "%s con datos de tipo equivocado: nunca dice undefined ni null",
    (kind) => {
      const out = alertText(
        kind,
        { pain: "x", date: 5, exerciseName: 7, step: null, lastSessionDate: 3 },
        "Ana",
      );

      expect(out).not.toMatch(/undefined|null|NaN/);
    },
  );
});
