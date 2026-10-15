/**
 * Fase 199 (D-19) — unidad pura del cálculo de contraste WCAG 2.x que el server
 * revalida al guardar un patrocinador (`modules/sponsors/contrast.ts`).
 *
 * Sin base de datos ni app: solo la función. Los pares de colores son los de la
 * paleta real de las marcas (fondo/texto) y el par que el editor del admin
 * rechaza (`#c4956a` + blanco).
 */
import { describe, it, expect } from "vitest";
import {
  HEX_COLOR_PATTERN,
  MIN_TEXT_CONTRAST,
  contrastRatio,
} from "../../src/modules/sponsors/contrast";

describe("contrastRatio (WCAG 2.x)", () => {
  it("negro sobre blanco es el máximo teórico: 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("un color contra sí mismo es el mínimo teórico: 1:1", () => {
    expect(contrastRatio("#4c6b3c", "#4c6b3c")).toBeCloseTo(1, 5);
  });

  it("marrón oscuro sobre blanco supera 15:1", () => {
    expect(contrastRatio("#2c2318", "#ffffff")).toBeGreaterThanOrEqual(15);
  });

  it("terracota sobre blanco queda entre 5.5 y 5.7 (pasa AA)", () => {
    const ratio = contrastRatio("#96593a", "#ffffff");
    expect(ratio).toBeGreaterThan(5.5);
    expect(ratio).toBeLessThan(5.7);
    expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it("el par del caso de rechazo (#c4956a + blanco) queda por debajo de 4.5", () => {
    const ratio = contrastRatio("#c4956a", "#ffffff");
    expect(ratio).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it("el par del cuerpo mínimo válido de las pruebas (#4c6b3c + #f2ede5) pasa AA", () => {
    expect(contrastRatio("#4c6b3c", "#f2ede5")).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it("es simétrica: (a, b) === (b, a)", () => {
    const pares: Array<[string, string]> = [
      ["#000000", "#ffffff"],
      ["#96593a", "#ffffff"],
      ["#c4956a", "#2c2318"],
    ];
    for (const [a, b] of pares) {
      expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
    }
  });

  it("acepta mayúsculas y minúsculas por igual", () => {
    expect(contrastRatio("#C4956A", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#c4956a", "#ffffff"),
      10,
    );
  });

  it("el umbral mínimo es 4.5", () => {
    expect(MIN_TEXT_CONTRAST).toBe(4.5);
  });

  it.each([
    ["rojo", "#ffffff"],
    ["#fff", "#000000"],
    ["#12345", "#000000"],
    ["#gggggg", "#000000"],
    ["", "#000000"],
  ])("lanza con un hex inválido en la primera posición (%s)", (a, b) => {
    expect(() => contrastRatio(a, b)).toThrow();
  });

  it("lanza con un hex inválido en la segunda posición", () => {
    expect(() => contrastRatio("#000000", "blanco")).toThrow();
  });
});

describe("HEX_COLOR_PATTERN", () => {
  const re = new RegExp(HEX_COLOR_PATTERN);

  it("acepta #rrggbb en cualquier capitalización", () => {
    expect(re.test("#4c6b3c")).toBe(true);
    expect(re.test("#4C6B3C")).toBe(true);
  });

  it("rechaza la forma corta, sin # y con alfa", () => {
    expect(re.test("#fff")).toBe(false);
    expect(re.test("4c6b3c")).toBe(false);
    expect(re.test("#4c6b3cff")).toBe(false);
  });
});
