// Fase 200 Plan 10 (R3, T14): `route-labels.ts` vive en TRES copias a mano
// (API, app y admin) porque el repo no tiene un paquete compartido. Anatomia y
// la TV leen los nombres de ruta con `getRouteLabel` (API), la app y el admin
// con su copia: si una diverge, el mismo ejercicio se llama distinto segun la
// pantalla. Este test es la red que lo evita, como `destinations-sync`.
//
// Tambien verifica el espejo de zonas del app (`zones.ts`, plan 200-14): los 16
// slugs de `ZoneSlug` y los grupos de `ZONE_GROUPS` contra `REGIONES` y
// `GRUPOS_ZONA`.
//
// FAIL-CLOSED: si una copia no se puede leer, el test FALLA con el path en el
// mensaje (no hay skip silencioso).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROUTE_LABELS } from "../../src/modules/tv/route-labels";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";
import { REGIONES } from "../../src/modules/anatomy/content/regiones";
import { GRUPOS_ZONA } from "../../src/modules/anatomy/projection";

// Clave (con o sin comillas) -> valor entre comillas simples o dobles. Acepta
// el estilo de cada copia (la del API ya trae comillas simples, la de app y
// admin tambien) aunque Prettier las cambie algun dia.
const PAR_PATTERN =
  /^\s+(?:'([^']+)'|"([^"]+)"|([A-Za-z_]+)):\s*(?:'([^']*)'|"([^"]*)")\s*,?\s*$/gm;

function extraerEtiquetas(filePath: string): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sync-front: no se pudo leer ${filePath} (${reason}) — el espejo ` +
        `no existe o el path relativo cambió`,
    );
  }

  const etiquetas: Record<string, string> = {};
  for (const match of content.matchAll(PAR_PATTERN)) {
    const clave = match[1] ?? match[2] ?? match[3];
    const valor = match[4] ?? match[5] ?? "";
    etiquetas[clave] = valor;
  }
  return etiquetas;
}

const D1: Readonly<Record<string, string>> = {
  HR: "Espinales y planchas laterales",
  "MN/RP": "Manna",
  "SIDE PCK": "Side Pancake",
  "HD/ID": "Fondos",
  FLR: "Front Lever Row",
};

describe("anatomy/sync-front — route-labels en API, app y admin", () => {
  const appPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/constants/route-labels.ts",
  );
  const adminPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/constants/route-labels.ts",
  );

  const app = extraerEtiquetas(appPath);
  const admin = extraerEtiquetas(adminPath);

  it("la copia de la app se extrajo completa (no vacía)", () => {
    expect(Object.keys(app).length).toBe(Object.keys(ROUTE_LABELS).length);
  });

  it("la copia de la app es igual a ROUTE_LABELS del API", () => {
    expect(app).toEqual(ROUTE_LABELS);
  });

  it("la copia del admin es igual a ROUTE_LABELS del API", () => {
    expect(admin).toEqual(ROUTE_LABELS);
  });

  it("las copias de app y admin son iguales entre sí", () => {
    expect(admin).toEqual(app);
  });

  it.each(Object.entries(D1))(
    "%s dice '%s' en las tres copias (D1)",
    (code, nombre) => {
      expect(ROUTE_LABELS[code]).toBe(nombre);
      expect(app[code]).toBe(nombre);
      expect(admin[code]).toBe(nombre);
    },
  );

  it("los nombres viejos ya no figuran en ninguna copia", () => {
    const viejos = [
      "Ham Raise",
      "L-Sit",
      "Hefesto / Impossible Dips",
      "Front Lever Pull Ups",
    ];
    for (const copia of [ROUTE_LABELS, app, admin]) {
      const valores = Object.values(copia);
      for (const viejo of viejos) {
        expect(valores).not.toContain(viejo);
      }
    }
  });

  it("HT, NC y QC conservan su nombre (R4)", () => {
    for (const copia of [ROUTE_LABELS, app, admin]) {
      expect(copia.HT).toBe("Hip Thrust");
      expect(copia.NC).toBe("Nordic Curl");
      expect(copia.QC).toBe("Quad Curl");
    }
  });

  it("cada código de RUTAS del contenido tiene etiqueta en las tres copias", () => {
    const faltantes: string[] = [];
    for (const ruta of RUTAS) {
      for (const [nombre, copia] of [
        ["api", ROUTE_LABELS],
        ["app", app],
        ["admin", admin],
      ] as const) {
        if (!copia[ruta.code]) faltantes.push(`${nombre}:${ruta.code}`);
      }
    }
    expect(faltantes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Espejo de zonas del app (fase 200 D4): `zones.ts` repite a mano `REGIONES`
// (slugs, en el mismo orden) y `GRUPOS_ZONA` (como conjuntos: el app ordena
// piernas como la 197 y el API por orden de regiones).
// ---------------------------------------------------------------------------

function literales(texto: string): string[] {
  return [...texto.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Texto entre la primera aparición de `inicio` y el primer `fin` posterior. */
function bloque(contenido: string, inicio: string, fin: string): string {
  const desde = contenido.indexOf(inicio);
  if (desde < 0) {
    throw new Error(`sync-front: zones.ts no contiene "${inicio}"`);
  }
  const hasta = contenido.indexOf(fin, desde + inicio.length);
  if (hasta < 0) {
    throw new Error(`sync-front: zones.ts no cierra "${inicio}" con "${fin}"`);
  }
  return contenido.slice(desde + inicio.length, hasta);
}

describe("anatomy/sync-front — espejo de zonas del app", () => {
  const zonesPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/components/anatomy/zones.ts",
  );
  let contenido: string;
  try {
    contenido = readFileSync(zonesPath, "utf-8");
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sync-front: no se pudo leer ${zonesPath} (${reason}) — el espejo ` +
        `no existe o el path relativo cambió`,
    );
  }

  const slugsApp = literales(
    bloque(contenido, "export type ZoneSlug =", "export type ZoneGroup"),
  );
  const gruposApp: Record<string, string[]> = Object.fromEntries(
    [
      ...bloque(
        contenido,
        "export const ZONE_GROUPS",
        "export const ZONE_GROUP_LABELS",
      ).matchAll(/^\s+([a-z]+):\s*\[([^\]]*)\]/gm),
    ].map((m): [string, string[]] => [m[1], literales(m[2])]),
  );
  const noMusculares = literales(
    bloque(contenido, "export const NON_MUSCLE_SLUGS", "])"),
  );

  it("ZoneSlug del app son los 16 slugs de REGIONES, en el mismo orden", () => {
    expect(slugsApp).toHaveLength(16);
    expect(slugsApp).toEqual(REGIONES.map((r) => r.slug));
  });

  it("ZONE_GROUPS del app tiene los mismos grupos que GRUPOS_ZONA", () => {
    expect(Object.keys(gruposApp).sort()).toEqual(
      Object.keys(GRUPOS_ZONA).sort(),
    );
  });

  it.each(Object.entries(GRUPOS_ZONA))(
    "el grupo %s del app tiene las mismas zonas que GRUPOS_ZONA (como conjunto)",
    (grupo, zonas) => {
      expect([...(gruposApp[grupo] ?? [])].sort()).toEqual([...zonas].sort());
    },
  );

  it("tibialis está en piernas y no es una parte no muscular del app (D4)", () => {
    expect(gruposApp.piernas).toContain("tibialis");
    expect(noMusculares).not.toContain("tibialis");
    expect(noMusculares).toHaveLength(7);
  });
});
