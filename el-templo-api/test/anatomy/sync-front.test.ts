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
// Y los tipos espejo del payload (WR-03): `types/anatomy.ts` del admin y
// `modules/anatomy/types.ts` del app repiten a mano las interfaces de
// `serializers.ts` / `zone-hits.ts`. CI no typechequea los frontends, asi que un
// campo nuevo en el API se perderia en silencio: aca se compara el payload real
// contra las propiedades de cada interfaz espejo.
//
// Y el cuerpo de la figura (2026-10-27): el admin (`$fig-*` de `_anatomia.scss`) y
// la TV (`FIGURA_BASE` de `tv/recorrido/figuras.ts`) copian los colores de la
// figura de la Guía (`$fig-*` de `_brand.scss` del app).
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
import { vistaAlumno, vistaProfe } from "../../src/modules/anatomy/serializers";

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

// ---------------------------------------------------------------------------
// Tipos espejo del payload (WR-03): cada interfaz del admin y del app tiene que
// declarar todas las claves que el API manda de verdad, y ninguna requerida de
// mas. Se lee el .ts espejo como texto (estatico, sin importar el front) y se
// compara contra el payload real de `vistaProfe` / `vistaAlumno`.
// ---------------------------------------------------------------------------

interface PropiedadTipo {
  nombre: string;
  opcional: boolean;
}

function leerEspejo(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sync-front: no se pudo leer ${filePath} (${reason}) — el espejo ` +
        `no existe o el path relativo cambió`,
    );
  }
}

/** Propiedades de primer nivel de `export interface <nombre> { ... }` (indentadas con 2 espacios). */
function propiedadesDe(
  contenido: string,
  interfaz: string,
  origen: string,
): PropiedadTipo[] {
  const cuerpo = new RegExp(
    `export interface ${interfaz}\\b[^{]*\\{\\n([\\s\\S]*?)\\n\\}`,
  ).exec(contenido);
  if (!cuerpo) {
    throw new Error(
      `sync-front: ${origen} no declara "export interface ${interfaz}"`,
    );
  }
  return [
    ...cuerpo[1].matchAll(/^ {2}(?:readonly\s+)?([A-Za-z_]\w*)(\?)?:/gm),
  ].map((m) => ({ nombre: m[1], opcional: m[2] === "?" }));
}

function clavesDe(muestras: readonly object[]): Set<string> {
  return new Set(muestras.flatMap((m) => Object.keys(m)));
}

describe("anatomy/sync-front — tipos espejo del payload (WR-03)", () => {
  const adminPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/types/anatomy.ts",
  );
  const appPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/modules/anatomy/types.ts",
  );
  const zoneHitsPath = path.resolve(
    __dirname,
    "../../src/modules/anatomy/zone-hits.ts",
  );
  const admin = leerEspejo(adminPath);
  const app = leerEspejo(appPath);
  const zoneHits = leerEspejo(zoneHitsPath);

  const profe = vistaProfe(new Map());
  const alumno = vistaAlumno();

  interface Caso {
    espejo: "admin" | "app";
    interfaz: string;
    muestras: readonly object[];
  }

  const casos: readonly Caso[] = [
    // Admin: GET /api/admin/anatomy
    { espejo: "admin", interfaz: "VistaProfe", muestras: [profe] },
    { espejo: "admin", interfaz: "RegionVista", muestras: profe.regiones },
    { espejo: "admin", interfaz: "MusculoProfe", muestras: profe.musculos },
    {
      espejo: "admin",
      interfaz: "ZonaMusculo",
      muestras: profe.musculos.flatMap((m) => (m.zona ? [m.zona] : [])),
    },
    { espejo: "admin", interfaz: "RutaProfe", muestras: profe.rutas },
    {
      espejo: "admin",
      interfaz: "RelacionVista",
      muestras: profe.rutas.flatMap((r) => Object.values(r.relaciones).flat()),
    },
    { espejo: "admin", interfaz: "BanderaProfe", muestras: profe.banderas },
    {
      espejo: "admin",
      interfaz: "FichaProfeVista",
      muestras: profe.rutas.flatMap((r) =>
        r.fichaProfe ? [r.fichaProfe] : [],
      ),
    },
    {
      espejo: "admin",
      interfaz: "GlosarioRol",
      muestras: profe.glosario.roles,
    },
    {
      espejo: "admin",
      interfaz: "GlosarioEntrada",
      muestras: [...profe.glosario.contracciones, ...profe.glosario.precision],
    },
    { espejo: "admin", interfaz: "CitaDef", muestras: profe.citas },
    // App: GET /api/anatomy
    { espejo: "app", interfaz: "VistaAlumno", muestras: [alumno] },
    { espejo: "app", interfaz: "RegionAlumno", muestras: alumno.regiones },
    { espejo: "app", interfaz: "MusculoAlumno", muestras: alumno.musculos },
    {
      espejo: "app",
      interfaz: "ZonaMusculoAlumno",
      muestras: alumno.musculos.flatMap((m) => (m.zona ? [m.zona] : [])),
    },
    { espejo: "app", interfaz: "RutaAlumno", muestras: alumno.rutas },
    {
      espejo: "app",
      interfaz: "FichaCortaAlumno",
      muestras: alumno.rutas.flatMap((r) =>
        r.fichaCorta ? [r.fichaCorta] : [],
      ),
    },
    { espejo: "app", interfaz: "GrupoAlumnoInfo", muestras: alumno.grupos },
  ];

  it.each(casos)(
    "$espejo:$interfaz declara las claves del payload y ninguna requerida de más",
    (caso) => {
      const contenido = caso.espejo === "admin" ? admin : app;
      const origen = caso.espejo === "admin" ? adminPath : appPath;
      const props = propiedadesDe(contenido, caso.interfaz, origen);
      const declaradas = props.map((p) => p.nombre);
      const requeridas = props.filter((p) => !p.opcional).map((p) => p.nombre);

      // Sin muestras el test no probaria nada.
      expect(caso.muestras.length).toBeGreaterThan(0);
      const payload = clavesDe(caso.muestras);

      // Una clave nueva del API que el espejo no conoce.
      expect(
        [...payload].filter((k) => !declaradas.includes(k)),
        `${caso.interfaz}: claves del API que faltan en el espejo`,
      ).toEqual([]);
      // Una clave requerida del espejo que el API no manda (undefined en runtime).
      expect(
        requeridas.filter((k) => !payload.has(k)),
        `${caso.interfaz}: claves requeridas del espejo que el API no manda`,
      ).toEqual([]);
    },
  );

  it("HitsZona del app tiene las mismas propiedades (y opcionalidad) que el API", () => {
    const api = propiedadesDe(zoneHits, "HitsZona", zoneHitsPath);
    const espejo = propiedadesDe(app, "HitsZona", appPath);
    expect(espejo.length).toBeGreaterThan(0);
    expect(espejo).toEqual(api);
  });
});

// Cuerpo de la figura (el de la Guía): lo copian admin y TV. El encendido
// (`lit-*`) lo copia solo la TV: el admin pinta por rol con su propia paleta.
const CLAVES_CUERPO = [
  "muscle-a",
  "muscle",
  "muscle-c",
  "skin",
  "skin-edge",
] as const;
const CLAVES_ENCENDIDO = ["lit-a", "lit-b", "lit-c"] as const;

/** `$fig-<clave>: #hex;` de un SCSS, solo las claves pedidas. */
function figScss(
  contenido: string,
  claves: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of contenido.matchAll(
    /^\$fig-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/gm,
  )) {
    if (claves.includes(m[1])) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** Claves de `export const FIGURA_BASE = { ... }` de la TV. */
function figuraTv(contenido: string, origen: string): Record<string, string> {
  const inicio = contenido.indexOf("export const FIGURA_BASE = {");
  if (inicio < 0) {
    throw new Error(`sync-front: no se encontró FIGURA_BASE en ${origen}`);
  }
  const fin = contenido.indexOf("};", inicio);
  const out: Record<string, string> = {};
  for (const m of contenido
    .slice(inicio, fin)
    .matchAll(/^\s+'?([a-z0-9-]+)'?:\s*'(#[0-9a-fA-F]{3,8})',?$/gm)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

describe("anatomy/sync-front — la figura de la Guía en app, admin y TV", () => {
  const appPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/css/_brand.scss",
  );
  const adminPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/css/_anatomia.scss",
  );
  const tvPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/tv/recorrido/figuras.ts",
  );

  const todas = [...CLAVES_CUERPO, ...CLAVES_ENCENDIDO];
  const app = figScss(leerEspejo(appPath), todas);
  const admin = figScss(leerEspejo(adminPath), todas);
  const tv = figuraTv(leerEspejo(tvPath), tvPath);

  it("el app define el cuerpo y el encendido", () => {
    expect(Object.keys(app).sort()).toEqual([...todas].sort());
  });

  it("el admin tiene el mismo cuerpo que el app (y no define encendido)", () => {
    expect(admin).toEqual(figScss(leerEspejo(appPath), CLAVES_CUERPO));
  });

  it("la TV tiene el mismo cuerpo y encendido que el app", () => {
    expect(tv).toEqual(app);
  });

  // Los degradés del SVG necesitan el color como atributo: los componentes
  // repiten luz/medio/sombra en TS (`const MUSCLE = [...]`, `const LIT = [...]`).
  const appFigPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/components/anatomy/BodyFigure.vue",
  );
  const adminFigPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/components/anatomy/AnatomyFigure.vue",
  );

  function paradas(contenido: string, nombre: string, origen: string) {
    const m = contenido.match(new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`));
    if (!m)
      throw new Error(`sync-front: no se encontró ${nombre} en ${origen}`);
    return [...m[1].matchAll(/'(#[0-9a-fA-F]{3,8})'/g)].map((x) =>
      x[1].toLowerCase(),
    );
  }

  it("BodyFigure.vue repite los degradés de músculo y encendido del app", () => {
    const vue = leerEspejo(appFigPath);
    expect(paradas(vue, "MUSCLE", appFigPath)).toEqual([
      app["muscle-a"],
      app.muscle,
      app["muscle-c"],
    ]);
    expect(paradas(vue, "LIT", appFigPath)).toEqual([
      app["lit-a"],
      app["lit-b"],
      app["lit-c"],
    ]);
  });

  it("AnatomyFigure.vue repite el degradé de músculo del app", () => {
    const vue = leerEspejo(adminFigPath);
    expect(paradas(vue, "MUSCLE", adminFigPath)).toEqual([
      app["muscle-a"],
      app.muscle,
      app["muscle-c"],
    ]);
  });

  // El músculo sin trabajar se funde en la piel con las mismas opacidades en las tres.
  function opacidades(contenido: string, nombre: string, origen: string) {
    const m = contenido.match(new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`));
    if (!m)
      throw new Error(`sync-front: no se encontró ${nombre} en ${origen}`);
    return m[1].split(",").map((x) => Number(x.trim()));
  }

  it("app y TV funden el encendido con las mismas opacidades", () => {
    const app = opacidades(leerEspejo(appFigPath), "LIT_OP", appFigPath);
    expect(app).toHaveLength(3);
    expect(
      opacidades(leerEspejo(tvPath), "ENCENDIDO_OPACIDAD", tvPath),
    ).toEqual(app);
  });

  it("app, admin y TV funden el músculo con las mismas opacidades", () => {
    const app = opacidades(leerEspejo(appFigPath), "MUSCLE_OP", appFigPath);
    expect(app).toHaveLength(3);
    expect(
      opacidades(leerEspejo(adminFigPath), "MUSCLE_OP", adminFigPath),
    ).toEqual(app);
    expect(opacidades(leerEspejo(tvPath), "MUSCULO_OPACIDAD", tvPath)).toEqual(
      app,
    );
  });
});
