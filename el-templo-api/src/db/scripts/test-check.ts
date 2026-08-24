// Módulo: test-check — ratchet de typecheck sobre `test/` + `scripts/`
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------
// `tsconfig.json` tiene `include: ["src/**/*"]`, así que `pnpm exec tsc --noEmit`
// (el typecheck de build) NO mira `test/`. Consecuencia medida: un call site de
// test desactualizado —el subproducto normal de cambiarle la firma a un service,
// que es exactamente lo que hacen las fases de adopción de tenancy— no da rojo
// hasta que el test corre, minutos después y en CI.
//
// `tsconfig.test-check.json` resuelve la mitad del problema: define el programa
// que SÍ incluye `test/` (253 archivos) con `rootDir: "."`. Pero su exit code no
// sirve de gate tal cual, porque el árbol de tests arrastra **185 errores de
// tipos preexistentes** (medidos en la fase 173 sobre `origin/staging`: 58
// TS2769, 33 TS2835, 32 TS2352, 31 TS2345, 17 TS7006, 7 TS2834 y 6 sueltos;
// **cero en `src/`** y **cero TS2554**). Un gate que nunca puede salir 0 se
// vuelve decorativo en un plan y medio: el equipo aprende a ignorar el exit code
// y se pierde justo la garantía por la que se creó el archivo.
//
// Este script es el ratchet que hace utilizable ese exit code, con la MISMA
// forma que `lint-tenant.ts` + `tenant-lint-allowlist.json` (fase 170, D-14):
// una lista versionada de la deuda conocida y un gate fail-closed en las dos
// direcciones. Errores nuevos → rojo nombrándolos. Errores que ya no existen →
// rojo también, para que el baseline no envejezca mintiendo (misma regla que
// `staleNoLongerViolating`).
//
// El agrupamiento es por `(archivo, código)` y no por línea a propósito: agregar
// diez líneas arriba de un test no puede mover el baseline, pero un error NUEVO
// de un código nuevo —o uno más del mismo código en el mismo archivo— sí.
//
// USO
//   pnpm typecheck:tests              # gate: exit 0 si no hay deuda nueva
//   pnpm typecheck:tests -- --update  # regenera el baseline (decisión explícita)
//
// TS2554 ("Expected N arguments, but got M") es el error que este ratchet existe
// para cazar y su baseline es **0**, así que cualquier aparición es nueva por
// construcción y sale destacada en el reporte.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const TSCONFIG = "tsconfig.test-check.json";

/**
 * Raíz de `el-templo-api/`, buscando hacia arriba desde el cwd el directorio que
 * contiene el tsconfig de verificación. Mismo criterio que `lint-tenant.ts`
 * (`resolveRepoRoot(process.cwd())`) y no `import.meta.dirname`, que bajo `tsx`
 * queda `undefined` cuando el archivo se transpila a CJS.
 */
function resolverApiRoot(): string {
  let dir = resolve(process.cwd());
  for (;;) {
    if (existsSync(join(dir, TSCONFIG))) return dir;
    const padre = dirname(dir);
    if (padre === dir) {
      console.error(
        `test-check: no encontre ${TSCONFIG} desde ${process.cwd()} hacia arriba. Corre el script desde el-templo-api/.`,
      );
      process.exit(3);
    }
    dir = padre;
  }
}

const API_ROOT = resolverApiRoot();
const BASELINE_PATH = join(API_ROOT, "test-check-baseline.json");
const BASELINE_NAME = "test-check-baseline.json";

/** Error de tsc ya normalizado. `file` es relativo a `el-templo-api/`. */
type ErrorTsc = { file: string; code: string; sample: string };

/** Clave `archivo|codigo` → cantidad. */
type Conteo = Record<string, number>;

type Baseline = {
  "//": string;
  generadoEl: string;
  total: number;
  porCodigo: Record<string, number>;
  entradas: Conteo;
};

/**
 * Corre `tsc -p tsconfig.test-check.json --noEmit` y devuelve sus errores.
 *
 * No se filtra por severidad: `tsc` sin `--pretty` emite una línea por error con
 * el formato `ruta(linea,col): error TSxxxx: mensaje`, más líneas de detalle
 * indentadas que se descartan porque no matchean el patrón (empiezan con
 * espacio).
 */
function correrTsc(): ErrorTsc[] {
  const res = spawnSync(
    "node",
    [
      join(API_ROOT, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      TSCONFIG,
      "--noEmit",
      "--pretty",
      "false",
    ],
    { cwd: API_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  const salida = `${res.stdout ?? ""}${res.stderr ?? ""}`;

  // Un fallo de arranque (config inexistente, tsc ausente) no puede confundirse
  // con "0 errores": si no hay ni una línea parseable y el exit no fue 0, es un
  // problema de la herramienta y hay que gritarlo.
  const conPosicion = /^(\S[^(]*)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
  const sinPosicion = /^error (TS\d+): (.*)$/;

  const errores: ErrorTsc[] = [];
  for (const linea of salida.split("\n")) {
    const m = conPosicion.exec(linea);
    if (m) {
      errores.push({ file: m[1], code: m[4], sample: m[5] });
      continue;
    }
    const g = sinPosicion.exec(linea);
    if (g) errores.push({ file: "<sin-archivo>", code: g[1], sample: g[2] });
  }

  if (errores.length === 0 && res.status !== 0) {
    console.error("test-check: tsc no arranco. Salida cruda:\n" + salida);
    process.exit(3);
  }

  return errores;
}

function agrupar(errores: ErrorTsc[]): {
  conteo: Conteo;
  muestras: Record<string, string>;
  porCodigo: Record<string, number>;
} {
  const conteo: Conteo = {};
  const muestras: Record<string, string> = {};
  const porCodigo: Record<string, number> = {};
  for (const e of errores) {
    const clave = `${e.file}|${e.code}`;
    conteo[clave] = (conteo[clave] ?? 0) + 1;
    muestras[clave] ??= e.sample;
    porCodigo[e.code] = (porCodigo[e.code] ?? 0) + 1;
  }
  return { conteo, muestras, porCodigo };
}

function ordenar<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function main(): void {
  const actualizar = process.argv.includes("--update");

  const errores = correrTsc();
  const { conteo, muestras, porCodigo } = agrupar(errores);
  const total = errores.length;

  if (actualizar) {
    const nuevo: Baseline = {
      "//":
        "Deuda de tipos CONOCIDA del arbol de tests, generada por " +
        "`pnpm typecheck:tests -- --update`. NO se edita a mano. Cada entrada es " +
        "`<archivo>|<codigo TS>`: <cantidad>. Bajar un numero es una MEJORA y " +
        "requiere regenerar el archivo en el mismo commit. Subirlo o agregar una " +
        "clave nueva es deuda nueva y el gate lo rechaza. TS2554 (aridad " +
        "incorrecta) tiene baseline 0 a proposito: es el error que este gate " +
        "existe para cazar cuando una fase cambia firmas.",
      generadoEl: new Date().toISOString().slice(0, 10),
      total,
      porCodigo: ordenar(porCodigo),
      entradas: ordenar(conteo),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(nuevo, null, 2)}\n`);
    console.log(
      `test-check: baseline regenerado en ${BASELINE_NAME} — ${total} errores conocidos en ${Object.keys(conteo).length} pares (archivo, codigo).`,
    );
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `test-check: falta ${BASELINE_NAME}. Generalo con: pnpm typecheck:tests -- --update`,
    );
    process.exit(3);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  const previo = baseline.entradas;

  const nuevos: string[] = [];
  const empeorados: string[] = [];
  const mejorados: string[] = [];

  for (const [clave, n] of Object.entries(conteo)) {
    const antes = previo[clave];
    if (antes === undefined) {
      nuevos.push(`  ${clave}  (${n}) — ej: ${muestras[clave]}`);
    } else if (n > antes) {
      empeorados.push(
        `  ${clave}  ${antes} -> ${n} — ej: ${muestras[clave] ?? ""}`,
      );
    } else if (n < antes) {
      mejorados.push(`  ${clave}  ${antes} -> ${n}`);
    }
  }
  for (const [clave, antes] of Object.entries(previo)) {
    if (conteo[clave] === undefined)
      mejorados.push(`  ${clave}  ${antes} -> 0`);
  }

  const ts2554 = porCodigo["TS2554"] ?? 0;

  console.log(`--- test-check (${TSCONFIG}) ---`);
  console.log(`Errores totales:                 ${total}`);
  console.log(`Deuda conocida (baseline):       ${baseline.total}`);
  console.log(`Errores NUEVOS:                  ${nuevos.length}`);
  console.log(`Errores EMPEORADOS:              ${empeorados.length}`);
  console.log(`Entradas del baseline OBSOLETAS: ${mejorados.length}`);
  console.log(
    `TS2554 (aridad — baseline 0):    ${ts2554}${ts2554 > 0 ? "  <== DRIFT DE FIRMA" : ""}`,
  );

  if (nuevos.length) {
    console.log("\nDeuda NUEVA (el gate la rechaza):");
    nuevos.forEach((l) => console.log(l));
  }
  if (empeorados.length) {
    console.log("\nDeuda que EMPEORO (el gate la rechaza):");
    empeorados.forEach((l) => console.log(l));
  }
  if (mejorados.length) {
    console.log(
      "\nEntradas obsoletas del baseline. Arreglaste deuda vieja: bien. " +
        "Regenera el archivo en el MISMO commit con `pnpm typecheck:tests -- --update` " +
        "(un baseline que envejece miente igual que uno inflado):",
    );
    mejorados.forEach((l) => console.log(l));
  }

  const discrepancias = nuevos.length + empeorados.length + mejorados.length;
  console.log(`\nDISCREPANCIAS: ${discrepancias}`);
  if (discrepancias > 0) process.exit(1);
  console.log("Sin drift de tipos en test/ respecto del baseline.");
}

main();
