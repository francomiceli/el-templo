/**
 * CON-06 (fase 170) — Lint estático de tenancy: el motor de análisis.
 *
 * QUÉ HACE
 * --------
 * 1. Arma el mapa `identificador de schema -> tabla física` leyendo
 *    `src/db/schema/` por AST (`buildSchemaTableMap`). Sin ese mapa el lint no
 *    puede saber que `schema.tvPairings` es la tabla `tv_pairings`.
 * 2. (Task 2) Encuentra todo acceso a una tabla gym-owned, decide si el sitio
 *    cumple y ancla las exenciones escritas en el fuente.
 *
 * La lista canónica de tablas NO se duplica acá: sale de
 * `src/db/tenant-tables.ts` (`isGymOwnedTable`, 87 tablas gym-owned con sus
 * gates de forma). Un vigilante con su propia copia de la lista se
 * desincroniza en la primera tabla nueva y falla en silencio, que es el único
 * modo de falla que hace inútil a un gate.
 *
 * POR QUÉ NO ES UNA REGLA ESLINT (D-09)
 * -------------------------------------
 * El API **no tiene configuración de ESLint** — los `eslint.config.js` del
 * repo son de los dos frontends. Armar la config del backend entero para
 * colgarle una regla es la pieza más cara de esta fase y arrastra decisiones
 * (qué reglas base, qué se rompe en 426 archivos) que no son de tenancy. Este
 * script standalone copia el idioma ya cerrado de `verify-tenant-uniques.ts`:
 * un step propio en el job de CI del API y un comando local. Tampoco es un
 * gate de Vitest: el `setupFiles` del repo provisiona MySQL para TODO archivo
 * de test (~96 s, hallazgo 169-07) y este análisis no toca la base.
 *
 * POR QUÉ NO USA EL TYPE CHECKER (D-10)
 * -------------------------------------
 * `ts.createSourceFile` hace un pase **sintáctico** por archivo: 606 ms
 * medidos sobre los 382 archivos de `src` en el RESEARCH de la fase. Resolver
 * los tipos con `ts.createProgram` costaría del orden de un `tsc --noEmit`
 * entero para responder una pregunta que la sintaxis ya contesta: cómo se
 * llama la tabla y si el sitio nombra el tenant. El precio de la decisión está
 * escrito en el Task 2: el mapa de identificadores se arma por nombre, no por
 * símbolo resuelto.
 *
 * POR QUÉ AST Y NO UN GREP
 * ------------------------
 * Medido sobre este mismo repo (RESEARCH, Hallazgo 5): un `= mysqlTable("` de
 * una línea resuelve **21 de las 92** declaraciones —el resto están partidas en
 * varias líneas— y además levanta una tabla fantasma `foo` que vive dentro del
 * JSDoc de `src/db/schema/tenant-column.ts`. El AST ignora gratis todo
 * `mysqlTable(` que esté adentro de un comentario, porque un comentario no es
 * un nodo. Por eso este pase **no** puede degradarse a un grep: no es una
 * cuestión de estilo, es que el grep contesta mal.
 *
 * SOLO LECTURA
 * ------------
 * El motor lee archivos y los parsea. **Nunca ejecuta ni carga dinámicamente
 * el código que analiza** (mitigación T-170-12): sin `createProgram`, sin
 * ejecución de strings y sin carga dinámica de módulos. Un fixture hostil en
 * un PR es texto que se parsea, no código que corre en CI.
 *
 * Ese "nunca ejecuta" tiene un criterio de aceptación grepeable, y por eso las
 * dos construcciones prohibidas no se nombran ni acá: un grep no distingue
 * código de prosa (es, en chiquito, el mismo hallazgo 169-09 que motiva todo
 * este archivo), así que mencionarlas rompería su propio gate.
 *
 * CÓMO SE CORRE
 * -------------
 * Este archivo exporta el motor; la CLI (allowlist, ratchet y códigos de
 * salida 0/1/2) la agrega el plan 05 de esta misma fase, encima de estas
 * mismas funciones. Hasta entonces se consume desde el test
 * `test/tenancy/con-06-lint.test.ts`.
 */

/* tenant-safe: tooling de plataforma: analiza el fuente por AST y no ejecuta una sola query */
// Exención de la regla `--tenant` obligatorio de los scripts CLI (fase 169,
// CON-04/D-06 — ver `src/db/scripts/require-tenant.ts`). El motivo es
// obligatorio y va escrito arriba: una exención sin motivo es indistinguible
// de un olvido (T-169-36). Este archivo vive bajo `src/` y por lo tanto entra
// en su propio alcance: se auto-analiza, y esta anotación es la que lo exime.

import fs from "fs";
import path from "path";
import ts from "typescript";
import { isGymOwnedTable } from "../tenant-tables";

/** La columna que ancla el aislamiento. Un solo literal en todo el archivo. */
const TENANT_COLUMN = "tenant_id";

/** El constructor de tablas de Drizzle para MySQL. Toda tabla del repo pasa por acá. */
const TABLE_FACTORY = "mysqlTable";

// ─────────────────────────────────────────────────────────────────────────────
// Recorrido de archivos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los `.ts` de un directorio, recursivo, en orden estable.
 *
 * Se excluyen los `.d.ts`: son declaraciones sin cuerpo, no pueden contener ni
 * una declaración de tabla ni un acceso.
 */
function listTsFiles(dir: string): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`No se pudo leer el directorio ${current}: ${message}`);
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".d.ts")) continue;
      found.push(full);
    }
  };

  walk(dir);
  return found;
}

/** Lee un archivo y lo parsea. `setParentNodes: true` porque el Task 2 sube por el árbol. */
function parseFile(filePath: string): ts.SourceFile {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo leer ${filePath}: ${message}`);
  }
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapa identificador de schema -> tabla física
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El nombre con el que se llama a una función en un `CallExpression`, sin
 * importar si se la invocó pelada (`mysqlTable(...)`) o calificada
 * (`drizzle.mysqlTable(...)`). Devuelve `undefined` para formas dinámicas
 * (`tablas[k](...)`), que este pase sintáctico no puede resolver ni pretende.
 */
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/**
 * Mapa `identificador exportado -> nombre de tabla física`, armado sobre los
 * archivos de `src/db/schema/`.
 *
 * Reconoce la forma canónica del repo, y solo esa:
 *
 * ```ts
 * export const tvPairings = mysqlTable("tv_pairings", { ... });
 * ```
 *
 * o sea una `VariableDeclaration` cuyo inicializador es un `CallExpression` a
 * `mysqlTable` con un literal de string como primer argumento. La declaración
 * puede estar partida en cuantas líneas quiera y llevar el tercer argumento de
 * índices: al AST le da igual, que es justamente el punto.
 *
 * @param schemaDir directorio de los archivos de schema, relativo al cwd o
 *   absoluto (típicamente `src/db/schema`).
 */
export function buildSchemaTableMap(
  schemaDir: string,
): ReadonlyMap<string, string> {
  const absolute = path.resolve(schemaDir);
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `El directorio de schema no existe: ${absolute}. ` +
        `buildSchemaTableMap espera la ruta de src/db/schema (relativa al cwd o absoluta).`,
    );
  }

  const map = new Map<string, string>();

  for (const filePath of listTsFiles(absolute)) {
    const sourceFile = parseFile(filePath);

    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const init = node.initializer;
        if (
          ts.isCallExpression(init) &&
          calleeName(init.expression) === TABLE_FACTORY &&
          init.arguments.length > 0 &&
          ts.isIdentifier(node.name)
        ) {
          const first = init.arguments[0];
          if (ts.isStringLiteral(first)) {
            map.set(node.name.text, first.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
  }

  return map;
}

/** Las tablas físicas gym-owned alcanzables por identificador, para el Task 2. */
export function gymOwnedFromMap(
  schemaMap: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const table of schemaMap.values()) {
    if (isGymOwnedTable(table)) set.add(table);
  }
  return set;
}

export { TENANT_COLUMN };
