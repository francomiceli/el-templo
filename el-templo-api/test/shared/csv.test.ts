/**
 * Hotfix seguridad tanda 2 (H11) — `csvEscape` neutraliza inyección de fórmulas
 * y conserva el escape RFC 4180. Unitario puro (sin DB).
 */
import { describe, it, expect } from "vitest";
import { csvEscape } from "../../src/modules/shared/csv";

describe("csvEscape — fórmulas", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ['=HYPERLINK("http://x")', '"\'=HYPERLINK(""http://x"")"'],
    ["@cmd", "'@cmd"],
    ["-cmd()", "'-cmd()"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-1+1", "'-1+1"],
    ["\tabc", "'\tabc"],
  ])("neutraliza %j", (entrada, esperado) => {
    expect(csvEscape(entrada)).toBe(esperado);
  });

  it("un CR inicial se neutraliza y queda entre comillas (contiene CR)", () => {
    expect(csvEscape("\r=1")).toBe(`"'\r=1"`);
  });

  it.each([
    "+54 9 223 555-1234",
    "+5492235551234",
    "-5",
    "-(54) 223 555",
    "Juan Pérez",
    "a=b",
    "x@y.com",
    "",
  ])("no toca %j", (entrada) => {
    expect(csvEscape(entrada)).toBe(entrada);
  });
});

describe("csvEscape — RFC 4180 (sin regresión)", () => {
  it("comillas entre comillas y duplicadas", () => {
    expect(csvEscape('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it("comas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("saltos de línea", () => {
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });

  it("fórmula con coma: apóstrofe y comillas", () => {
    expect(csvEscape("=SUM(A1,A2)")).toBe(`"'=SUM(A1,A2)"`);
  });
});
