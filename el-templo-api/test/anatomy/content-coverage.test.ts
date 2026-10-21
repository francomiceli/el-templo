/**
 * Fase 200 (SC1, T-200-03): las regiones del contenido existen en el dibujo.
 * Lee `anatomia.json` de admin y de app por path relativo (precedente:
 * test/communications/destinations-sync.test.ts). FAIL-CLOSED: si un archivo no
 * se puede leer, el test falla con el path en el mensaje. Sin DB.
 *
 *   pnpm exec vitest run test/anatomy/content-coverage.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGIONES } from "../../src/modules/anatomy/content/regiones";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";
import { ROUTE_PROGRESSION_MAP } from "../../src/modules/exercises/route-progression-map";
import { ROUTE_LABELS } from "../../src/modules/tv/route-labels";
import { ZONAS_ORDEN } from "../../src/modules/tv/muscle-zones";

const ADMIN_JSON = path.resolve(
  __dirname,
  "../../../el-templo-admin/src/tv/recorrido/anatomia.json",
);
const APP_JSON = path.resolve(
  __dirname,
  "../../../el-templo-app/src/components/anatomy/anatomia.json",
);

/** Las 15 regiones de la TV, en el orden del contrato del poll (T20). */
const ZONAS_TV_ORDEN = [
  "chest",
  "deltoids",
  "triceps",
  "biceps",
  "forearm",
  "trapezius",
  "upper-back",
  "lower-back",
  "abs",
  "obliques",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "calves",
];

interface Figura {
  slug: string;
}

interface Anatomia {
  mFront: Figura[];
  mBack: Figura[];
  fFront: Figura[];
  fBack: Figura[];
}

function leerBuffer(filePath: string): Buffer {
  try {
    return readFileSync(filePath);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo leer ${filePath}: ${reason}`);
  }
}

function slugs(figuras: Figura[]): string[] {
  return figuras.map((f) => f.slug);
}

describe("cobertura del dibujo — regiones vs anatomia.json", () => {
  const bufferAdmin = leerBuffer(ADMIN_JSON);
  const bufferApp = leerBuffer(APP_JSON);
  const anatomia = JSON.parse(bufferAdmin.toString("utf-8")) as Anatomia;

  it("el JSON de admin y el de app son byte a byte iguales", () => {
    expect(bufferAdmin.equals(bufferApp)).toBe(true);
  });

  it("cada región front/both está en mFront y fFront", () => {
    const mFront = slugs(anatomia.mFront);
    const fFront = slugs(anatomia.fFront);
    for (const r of REGIONES) {
      if (r.vista === "back") continue;
      expect(mFront, `${r.slug} en mFront`).toContain(r.slug);
      expect(fFront, `${r.slug} en fFront`).toContain(r.slug);
    }
  });

  it("cada región back/both está en mBack y fBack", () => {
    const mBack = slugs(anatomia.mBack);
    const fBack = slugs(anatomia.fBack);
    for (const r of REGIONES) {
      if (r.vista === "front") continue;
      expect(mBack, `${r.slug} en mBack`).toContain(r.slug);
      expect(fBack, `${r.slug} en fBack`).toContain(r.slug);
    }
  });

  it("una región solo front no está en las figuras de espalda y viceversa", () => {
    const mBack = slugs(anatomia.mBack);
    const mFront = slugs(anatomia.mFront);
    for (const r of REGIONES) {
      if (r.vista === "front") expect(mBack, r.slug).not.toContain(r.slug);
      if (r.vista === "back") expect(mFront, r.slug).not.toContain(r.slug);
    }
  });

  it("las regiones enTv son, en orden, las 15 del poll de la TV", () => {
    expect(REGIONES.filter((r) => r.enTv).map((r) => r.slug)).toEqual(
      ZONAS_TV_ORDEN,
    );
    expect(REGIONES.filter((r) => r.enTv).map((r) => r.slug)).toEqual([
      ...ZONAS_ORDEN,
    ]);
  });

  it("toda región tiene grupo y tibialis cae en piernas (Pitfall 2)", () => {
    for (const r of REGIONES) {
      expect(r.grupo, r.slug).toBeTruthy();
    }
    const tibialis = REGIONES.find((r) => r.slug === "tibialis");
    expect(tibialis?.grupo).toBe("piernas");
    expect(tibialis?.enTv).toBe(false);
  });
});

describe("cobertura de rutas — códigos vs el mapa de progresión y las etiquetas", () => {
  it("todo código de RUTAS está en ROUTE_PROGRESSION_MAP", () => {
    const codigos = Object.keys(ROUTE_PROGRESSION_MAP);
    for (const ruta of RUTAS) {
      expect(codigos, `${ruta.code} en ROUTE_PROGRESSION_MAP`).toContain(
        ruta.code,
      );
    }
  });

  it("todo código de RUTAS está en ROUTE_LABELS (R3: nombres de getRouteLabel)", () => {
    const codigos = Object.keys(ROUTE_LABELS);
    for (const ruta of RUTAS) {
      expect(codigos, `${ruta.code} en ROUTE_LABELS`).toContain(ruta.code);
    }
  });

  it("los códigos de RUTAS no se repiten", () => {
    expect(new Set(RUTAS.map((r) => r.code)).size).toBe(RUTAS.length);
  });
});
