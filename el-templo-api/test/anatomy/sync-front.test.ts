// Fase 200 Plan 10 (R3, T14): `route-labels.ts` vive en TRES copias a mano
// (API, app y admin) porque el repo no tiene un paquete compartido. Anatomia y
// la TV leen los nombres de ruta con `getRouteLabel` (API), la app y el admin
// con su copia: si una diverge, el mismo ejercicio se llama distinto segun la
// pantalla. Este test es la red que lo evita, como `destinations-sync`.
//
// El plan 200-14 suma aca el espejo de zonas del app (zones.ts).
//
// FAIL-CLOSED: si una copia no se puede leer, el test FALLA con el path en el
// mensaje (no hay skip silencioso).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROUTE_LABELS } from "../../src/modules/tv/route-labels";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";

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
