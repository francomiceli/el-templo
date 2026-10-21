/**
 * Fase 200 (SC2, T16, T-200-13): la pintura nueva de cada ruta es la de la TV
 * pre-200 menos lo que se quita más lo que se agrega, y cada diferencia tiene
 * su motivo con fuente. Sin DB.
 *
 *   pnpm exec vitest run test/anatomy/projection-parity.test.ts
 */
import { describe, it, expect } from "vitest";
import { DIFERENCIAS_APROBADAS } from "../../src/modules/anatomy/content/diferencias-aprobadas";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";
import { ZONAS_ORDEN, zonasDeRuta } from "../../src/modules/anatomy/projection";
import { ZONAS_TV_PRE_200 } from "./__fixtures__/zonas-tv-pre-200";

/** Etiqueta de sección de la investigación: "§…", S2.3, A4, B-DS, C1, D1, R2, BS5, BI5, TI-D. */
const FUENTE = /§|\b(S\d|A\d|B-|C\d|D\d|R2|BS\d|BI\d|TI-)/;

function ordenadas(zonas: Iterable<string>): string[] {
  const set = new Set(zonas);
  return ZONAS_ORDEN.filter((z) => set.has(z));
}

describe("paridad de la proyección con la TV pre-200", () => {
  const codigos = RUTAS.map((r) => r.code);

  it("el snapshot tiene exactamente las 30 rutas del contenido", () => {
    expect(Object.keys(ZONAS_TV_PRE_200).sort()).toEqual([...codigos].sort());
    expect(codigos).toHaveLength(30);
  });

  it("el snapshot solo usa zonas del dibujo", () => {
    for (const [code, zonas] of Object.entries(ZONAS_TV_PRE_200)) {
      for (const z of zonas) {
        expect(ZONAS_ORDEN as readonly string[], `${code}: ${z}`).toContain(z);
      }
    }
  });

  for (const code of codigos) {
    it(`${code}: pre − quita ∪ agrega == zonasDeRuta`, () => {
      const pre = ZONAS_TV_PRE_200[code] ?? [];
      const dif = DIFERENCIAS_APROBADAS.find((d) => d.code === code);
      const esperado = new Set(pre);
      for (const z of dif?.quita ?? []) esperado.delete(z);
      for (const z of dif?.agrega ?? []) esperado.add(z);
      const real = zonasDeRuta(code);
      expect(
        real,
        `${code}: pre=[${pre.join(", ")}] quita=[${(dif?.quita ?? []).join(", ")}] agrega=[${(dif?.agrega ?? []).join(", ")}] nueva=[${real.join(", ")}]`,
      ).toEqual(ordenadas(esperado));
    });
  }

  describe("DIFERENCIAS_APROBADAS", () => {
    it("toda entrada tiene un motivo que cita una sección", () => {
      for (const d of DIFERENCIAS_APROBADAS) {
        expect(d.motivo.trim().length, d.code).toBeGreaterThan(20);
        expect(FUENTE.test(d.motivo), `${d.code}: ${d.motivo}`).toBe(true);
      }
    });

    it("quita está dentro de lo que pintaba la TV y agrega es nuevo", () => {
      for (const d of DIFERENCIAS_APROBADAS) {
        const pre = ZONAS_TV_PRE_200[d.code] ?? [];
        for (const z of d.quita)
          expect(pre, `${d.code} quita ${z}`).toContain(z);
        for (const z of d.agrega) {
          expect(pre, `${d.code} agrega ${z}`).not.toContain(z);
        }
      }
    });

    it("no hay entradas vacías ni repetidas ni de rutas desconocidas", () => {
      const vistos = new Set<string>();
      for (const d of DIFERENCIAS_APROBADAS) {
        expect(d.quita.length + d.agrega.length, d.code).toBeGreaterThan(0);
        expect(vistos.has(d.code), `repetida: ${d.code}`).toBe(false);
        vistos.add(d.code);
        expect(codigos, d.code).toContain(d.code);
        expect(new Set(d.quita).size, `${d.code} quita`).toBe(d.quita.length);
        expect(new Set(d.agrega).size, `${d.code} agrega`).toBe(
          d.agrega.length,
        );
      }
    });

    it("las zonas de quita y agrega existen en el dibujo", () => {
      for (const d of DIFERENCIAS_APROBADAS) {
        for (const z of [...d.quita, ...d.agrega]) {
          expect(ZONAS_ORDEN as readonly string[], `${d.code}: ${z}`).toContain(
            z,
          );
        }
      }
    });
  });
});
