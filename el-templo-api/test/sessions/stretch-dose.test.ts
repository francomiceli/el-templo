/**
 * Unit puro de la dosis de un estiramiento (fase 213, plan 14). Sin DB.
 *
 * La dosis sale de la plani del dia: si el estiramiento esta prescrito ese dia
 * se usa esa dosis, si no la dosis base (20 s si es ISO, 10 repeticiones si no).
 *
 *   pnpm exec vitest run test/sessions/stretch-dose.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  dosisDeEstiramiento,
  dosisEnPlani,
  STRETCH_BASE_ISO_SECONDS,
  STRETCH_BASE_REPS,
  type PrescripcionDelDia,
} from "../../src/modules/sessions/stretch-dose";

function presc(
  nombre: string,
  parcial: Partial<Omit<PrescripcionDelDia, "nombre">> = {},
): PrescripcionDelDia {
  return {
    nombre,
    reps: 0,
    repsMax: null,
    seconds: 0,
    secondsMax: null,
    ...parcial,
  };
}

describe("dosisDeEstiramiento", () => {
  it("usa los segundos de la plani", () => {
    const dosis = dosisDeEstiramiento(
      "Apertura de cadera",
      [presc("Apertura de cadera", { seconds: 30 })],
      false,
    );
    expect(dosis).toEqual({ unit: "seconds", value: 30, max: null });
  });

  it("usa las repeticiones de la plani", () => {
    const dosis = dosisDeEstiramiento(
      "Gato camello",
      [presc("Gato camello", { reps: 12 })],
      true,
    );
    expect(dosis).toEqual({ unit: "reps", value: 12, max: null });
  });

  it("devuelve el rango cuando secondsMax es mayor", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [presc("Psoas", { seconds: 20, secondsMax: 40 })],
      false,
    );
    expect(dosis).toEqual({ unit: "seconds", value: 20, max: 40 });
  });

  it("devuelve el rango de repeticiones cuando repsMax es mayor", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [presc("Psoas", { reps: 8, repsMax: 12 })],
      false,
    );
    expect(dosis).toEqual({ unit: "reps", value: 8, max: 12 });
  });

  it("deja max en null si secondsMax es igual o menor", () => {
    expect(
      dosisDeEstiramiento(
        "Psoas",
        [presc("Psoas", { seconds: 30, secondsMax: 30 })],
        false,
      ).max,
    ).toBeNull();
    expect(
      dosisDeEstiramiento(
        "Psoas",
        [presc("Psoas", { seconds: 30, secondsMax: 10 })],
        false,
      ).max,
    ).toBeNull();
  });

  it("deja max en null si repsMax es igual o menor o es null", () => {
    expect(
      dosisDeEstiramiento("X", [presc("X", { reps: 10, repsMax: 10 })], false)
        .max,
    ).toBeNull();
    expect(
      dosisDeEstiramiento("X", [presc("X", { reps: 10, repsMax: 5 })], false)
        .max,
    ).toBeNull();
    expect(
      dosisDeEstiramiento("X", [presc("X", { reps: 10, repsMax: null })], false)
        .max,
    ).toBeNull();
  });

  it("coincide por nombre sin importar mayusculas ni espacios", () => {
    const dosis = dosisDeEstiramiento(
      "  apertura DE cadera ",
      [presc("APERTURA de CADERA  ", { seconds: 45 })],
      false,
    );
    expect(dosis).toEqual({ unit: "seconds", value: 45, max: null });
  });

  it("con dos coincidencias de dosis distintas gana la primera", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [
        presc("Otro", { seconds: 99 }),
        presc("Psoas", { seconds: 25 }),
        presc("Psoas", { reps: 15 }),
      ],
      false,
    );
    expect(dosis).toEqual({ unit: "seconds", value: 25, max: null });
  });

  it("saltea una primera coincidencia vacia y usa la segunda con dosis", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [presc("Psoas"), presc("Psoas", { reps: 14 })],
      false,
    );
    expect(dosis).toEqual({ unit: "reps", value: 14, max: null });
  });

  it("si hay segundos y repeticiones en la misma fila gana segundos", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [presc("Psoas", { seconds: 20, reps: 10 })],
      false,
    );
    expect(dosis.unit).toBe("seconds");
  });

  it("fuera de la plani y ISO: 20 segundos", () => {
    expect(
      dosisDeEstiramiento("Psoas", [presc("Otro", { reps: 5 })], true),
    ).toEqual({ unit: "seconds", value: STRETCH_BASE_ISO_SECONDS, max: null });
    expect(STRETCH_BASE_ISO_SECONDS).toBe(20);
  });

  it("fuera de la plani y no ISO: 10 repeticiones", () => {
    expect(
      dosisDeEstiramiento("Psoas", [presc("Otro", { seconds: 5 })], false),
    ).toEqual({ unit: "reps", value: STRETCH_BASE_REPS, max: null });
    expect(STRETCH_BASE_REPS).toBe(10);
  });

  it("coincidencia sin dosis util cae a la base", () => {
    expect(dosisDeEstiramiento("Psoas", [presc("Psoas")], true)).toEqual({
      unit: "seconds",
      value: 20,
      max: null,
    });
  });

  it("lista vacia: dosis base", () => {
    expect(dosisDeEstiramiento("Psoas", [], true).unit).toBe("seconds");
    expect(dosisDeEstiramiento("Psoas", [], false).unit).toBe("reps");
  });

  it("tolera valores null de la base en reps y seconds", () => {
    const dosis = dosisDeEstiramiento(
      "Psoas",
      [
        {
          nombre: "Psoas",
          reps: null,
          repsMax: null,
          seconds: null,
          secondsMax: null,
        },
        presc("Psoas", { seconds: 15 }),
      ],
      false,
    );
    expect(dosis).toEqual({ unit: "seconds", value: 15, max: null });
  });
});

describe("dosisEnPlani", () => {
  it("devuelve null si el estiramiento no esta prescrito ese dia", () => {
    expect(dosisEnPlani("Psoas", [presc("Otro", { seconds: 30 })])).toBeNull();
    expect(dosisEnPlani("Psoas", [])).toBeNull();
  });

  it("devuelve null si las coincidencias no traen dosis util", () => {
    expect(dosisEnPlani("Psoas", [presc("Psoas")])).toBeNull();
  });

  it("devuelve la dosis de la primera coincidencia util", () => {
    expect(
      dosisEnPlani("psoas", [presc("PSOAS"), presc("Psoas", { reps: 9 })]),
    ).toEqual({ unit: "reps", value: 9, max: null });
  });
});
