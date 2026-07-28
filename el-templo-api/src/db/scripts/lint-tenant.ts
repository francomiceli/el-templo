/**
 * CON-06 (fase 170) — Lint estático de tenancy: el motor de análisis.
 *
 * QUÉ HACE
 * --------
 * 1. Arma el mapa `identificador de schema -> tabla física` leyendo
 *    `src/db/schema/` por AST (`buildSchemaTableMap`). Sin ese mapa el lint no
 *    puede saber que `schema.tvPairings` es la tabla `tv_pairings`.
 * 2. Encuentra todo acceso a una tabla gym-owned —template `sql` crudo y query
 *    builder— y decide si el sitio nombra el gimnasio (`lintTenantSources`).
 * 3. Ancla las exenciones escritas en el fuente al sitio real del acceso, y
 *    emite el inventario completo de las que encontró (D-12).
 * 4. Cruza todo eso con la allowlist de deuda tolerada y aplica los cuatro
 *    gates del ratchet (`lintTenant`): violación no listada, entrada podrida
 *    —por archivo inexistente o por deuda ya pagada—, entrada ganada respecto
 *    de la rama base y tabla de módulo migrado que todavía tiene entradas.
 *
 * POR QUÉ LA ALLOWLIST ES JSON Y NO UN REGISTRO .ts
 * -------------------------------------------------
 * El milestone escribe sus registros en TypeScript (`TENANT_GLOBAL_UNIQUES`,
 * `TENANT_UNIQUE_ALLOWLIST`, `TENANT_STRICT_MODULES`), y esta lista rompe ese
 * idioma a propósito. El gate anti-crecimiento de D-14 tiene que leer la
 * allowlist **como estaba en la rama base**, o sea en OTRA revisión de git:
 *
 * ```
 * git show <base>:el-templo-api/tenant-lint-allowlist.json
 * ```
 *
 * Con un `.ts` habría dos salidas y las dos son peores. Una: montar un pase de
 * AST extra para levantar el literal exportado de un texto que no está en el
 * disco. La otra: escribir ese texto a un temporal e importarlo — o sea
 * **ejecutar código de una revisión arbitraria** dentro del job de CI, que es
 * exactamente lo que la sección SOLO LECTURA de acá abajo promete no hacer
 * (T-170-16). `JSON.parse` no corre nada de lo que lee, y esa es toda la razón.
 *
 * El precio es que el JSON no admite comentarios: por eso el archivo lleva un
 * campo `note` con el racional del ratchet escrito adentro.
 *
 * ALCANCE DE ARCHIVOS (D-16), Y POR QUÉ QUEDA FIJADO
 * --------------------------------------------------
 * El lint analiza `el-templo-api/src/**\/*.ts` y `el-templo-api/scripts/**\/*.ts`,
 * excluyendo los `.d.ts`. **Excluye `test/` a propósito**: hay 228 archivos de
 * test que escriben tablas gym-owned adrede para armar sus fixtures, y meterlos
 * haría que la allowlist inicial —cientos de entradas— fuera irrevisable, o sea
 * inútil. El ruido de los tests es problema de los fixtures 2-tenant de la fase
 * 171, que es el gate correcto para eso.
 *
 * Como D-16 hace el baseline **one-shot** (se genera una vez, se revisa, se
 * commitea, y NO queda comando regenerador), este alcance queda **FIJADO**:
 * agrandarlo o achicarlo después obliga a regenerar el baseline, que es
 * justamente la puerta trasera del ratchet que D-16 viene a cerrar. Cambiarlo
 * es una decisión de fase, no un detalle de implementación.
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
 * Tres modos, con el contrato de salida de `verify-tenant-uniques.ts`
 * (**0** = limpio, **1** = hay discrepancias, **2** = error de uso o interno):
 *
 * 1. **Local**, desde `el-templo-api/`:
 *
 *    ```
 *    pnpm lint:tenant
 *    ```
 *
 *    Sin `--base` el gate de entradas ganadas (D-14) no corre, y el reporte lo
 *    dice en una advertencia. Los otros tres gates sí corren.
 *
 * 2. **CI**, en el step propio del job del API:
 *
 *    ```
 *    pnpm lint:tenant --base=<sha o ref de la rama base>
 *    ```
 *
 *    El checkout del job necesita `fetch-depth: 0`: con el `1` que trae por
 *    default, la rama base no está en el clon y el lint sale **2** en vez de
 *    pasar en verde sin haber podido mirar nada (T-170-04).
 *
 * 3. **En pre-commit: NUNCA** (D-11). Este pase mira el proyecto entero, y
 *    sumarle ese segundo a todos los commits del repo termina, indefectible, en
 *    alguien usando `--no-verify` por costumbre. Un gate que se esquiva a diario
 *    no es un gate. Corre en CI, donde su rojo cuesta un push y no un flujo de
 *    trabajo.
 *
 * Los flags `--root=<ruta>` y `--allowlist=<ruta>` existen para los tests y
 * para correrlo desde otro cwd.
 *
 * `console.*` está permitido en este archivo: es tooling de línea de comandos,
 * no el runtime de Fastify ni un frontend (precedente escrito en
 * `require-tenant.ts`, y antes en `verify-tenant-uniques.ts`). Vive **solo**
 * dentro del bloque de la CLI, al final: el motor no imprime nada, devuelve
 * datos.
 */

/* tenant-safe: tooling de plataforma: analiza el fuente por AST y no ejecuta una sola query */
// Exención de la regla `--tenant` obligatorio de los scripts CLI (fase 169,
// CON-04/D-06 — ver `src/db/scripts/require-tenant.ts`). El motivo es
// obligatorio y va escrito arriba: una exención sin motivo es indistinguible
// de un olvido (T-169-36). Este archivo vive bajo `src/` y por lo tanto entra
// en su propio alcance: se auto-analiza, y esta anotación es la que lo exime.

import { execFileSync } from "node:child_process";
import fs from "fs";
import path from "path";
import ts from "typescript";
import { isGymOwnedTable, strictTablesSet } from "../tenant-tables";

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

/** Las tablas físicas gym-owned alcanzables por identificador de schema. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Forma del resultado
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo llegó el código a la tabla. Las dos formas que existen en este repo. */
export type TenantAccessKind = "sql-template" | "query-builder";

/** La exención que cubre un acceso, ya anclada a su sitio. */
export interface AccessExemption {
  /** Motivo escrito por el autor. Nunca vacío: sin motivo no hay exención. */
  motive: string;
  /** `file` cubre todo el archivo; `site` cubre el statement del acceso. */
  scope: "file" | "site";
  /** Línea 1-based del comentario que exime. */
  line: number;
}

/** Un acceso a una tabla gym-owned encontrado en el fuente. Es la unidad del lint. */
export interface TenantAccess {
  /** Ruta RELATIVA a la raíz del repo, con `/`. Es la clave de la allowlist (D-13). */
  file: string;
  /** Línea 1-based del acceso. Va en el reporte, NUNCA en la allowlist (D-13). */
  line: number;
  /** Nombre de tabla FÍSICA, el de `GYM_OWNED_TABLES`. */
  table: string;
  kind: TenantAccessKind;
  /** El sitio nombra el gimnasio (`tenantWhere` / `tenantValues` / `tenant_id`). */
  compliant: boolean;
  exemption?: AccessExemption;
}

/**
 * Una exención anclada del fuente, con o sin accesos debajo. Es el inventario
 * de D-12: la lista completa y revisable de una pasada.
 */
export interface ExemptionRecord {
  file: string;
  /** Línea 1-based del comentario. */
  line: number;
  motive: string;
  /**
   * `file` es de ALCANCE MAYOR: cubre todo el archivo, incluido el código que
   * todavía no se escribió. Por eso el inventario lo separa (mitigación de
   * T-170-06) — una exención de archivo hay que releerla cuando el archivo
   * crece, y la única forma de que eso pase es que se vea.
   */
  scope: "file" | "site";
  /** Cuántos accesos detectados cubre. `0` = no cubre ninguno hoy. */
  covers: number;
}

/**
 * Una anotación que menciona el tag pero **no exime nada**: quedó en prosa, en
 * un comentario de línea o dentro de un docblock.
 *
 * NO es una violación — hay archivos que documentan legítimamente la
 * convención. Es informativo y es la mitad visible del hallazgo 169-09: el grep
 * crudo de la fase 169 dio 11 archivos y solo 9 tenían exención real. Que estos
 * aparezcan por separado es lo que evita que alguien escriba la anotación en un
 * comentario de línea, crea que está exento y se entere en el rojo de CI.
 */
export interface UnanchoredTag {
  file: string;
  line: number;
}

export interface LintSourceResult {
  filesScanned: number;
  accesses: TenantAccess[];
  /** No cumplen y no tienen exención. La allowlist los filtra en el plan 05. */
  violations: TenantAccess[];
  /** Accesos cubiertos por una exención anclada. */
  exemptions: TenantAccess[];
  /** D-12: TODAS las exenciones ancladas, cubran o no algún acceso. */
  exemptionInventory: ExemptionRecord[];
  /** D-12: menciones del tag que no anclan en ningún sitio. Informativas. */
  unanchoredTags: UnanchoredTag[];
}

/** Alcance fijado por D-16. Ver la sección del docblock antes de tocarlo. */
export const DEFAULT_SCOPE_DIRS: readonly string[] = [
  "el-templo-api/src",
  "el-templo-api/scripts",
];

/** Dónde vive el schema de Drizzle, relativo a la raíz del repo. */
const SCHEMA_DIR_FROM_ROOT = "el-templo-api/src/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Exenciones: la regla que separa exención de prosa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apertura del tag, **pegada a la apertura del comentario de bloque**.
 *
 * Matchea solo la apertura a propósito: el motivo se recorta con `slice` hasta
 * el cierre del comentario. Capturarlo con una regex es lo que hace pasar la
 * anotación pelada por exención, porque el asterisco del cierre cuenta como
 * carácter no-blanco (mismo bug que el plan 02 encontró en el parser del
 * sentinel).
 *
 * Un docblock nunca matchea: después de la apertura viene un asterisco extra,
 * que no es blanco ni es el tag. Ese es exactamente el rechazo de
 * `src/db/scripts/require-tenant.ts`, donde el tag vive en el medio del JSDoc
 * de cabecera.
 */
const EXEMPT_TAG_OPEN = /^\/\*\s*tenant-safe:/;

/** El cierre de un comentario de bloque, armado para no cerrar este archivo. */
const BLOCK_COMMENT_CLOSE = "*" + "/";

/** El tag crudo, para contar menciones que NO anclan (`unanchoredTags`). */
const RAW_TAG = /tenant-safe:/g;

/**
 * El motivo de la exención si este comentario es una exención de verdad.
 *
 * Las DOS condiciones son necesarias y se refuerzan entre sí:
 *
 *   (a) `MultiLineCommentTrivia` — la anotación citada en un comentario de
 *       línea no exime, ni aunque el motivo esté escrito.
 *   (b) el tag arranca el comentario — rechaza
 *       `src/db/scripts/require-tenant.ts`, donde el tag vive dentro del JSDoc
 *       que documenta la convención.
 *
 * Y el motivo es obligatorio: una exención sin motivo es indistinguible de un
 * olvido (T-169-36).
 *
 * OJO CON "LA (a) PARECE REDUNDANTE"
 * ----------------------------------
 * Con la regex anclada de arriba, la (a) hoy no rechaza nada por su cuenta: un
 * comentario de línea empieza con dos barras y ya falla la (b). Es defensa en
 * profundidad, no código muerto, y está demostrado en vivo: aflojar SOLO la (b)
 * —buscar el tag en cualquier parte del comentario— deja rojo el caso real de
 * `require-tenant.ts`; aflojar las DOS deja rojo además el caso del comentario
 * de línea del fixture. Sacar la (a) porque "no hace nada" desarma la segunda
 * mitad de la mitigación de T-170-09 justo para el día en que alguien toque la
 * regex.
 *
 * Y una precisión sobre el otro rechazo real, `src/db/schema/tv.ts`: su
 * anotación citada está adentro de un comentario de línea que además vive en el
 * medio de un objeto literal, una posición que este matcher no consulta nunca
 * (solo mira trivia de statements y de llamadas). O sea que ese archivo está
 * rechazado por partida doble. La aserción nominal del test lo cubre igual.
 */
function exemptionMotive(
  text: string,
  range: ts.CommentRange,
): string | undefined {
  if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) return undefined;

  const raw = text.slice(range.pos, range.end);
  const open = EXEMPT_TAG_OPEN.exec(raw);
  if (!open) return undefined;

  const body = raw.endsWith(BLOCK_COMMENT_CLOSE)
    ? raw.slice(0, -BLOCK_COMMENT_CLOSE.length)
    : raw;
  const motive = body.slice(open[0].length).trim();
  return motive.length > 0 ? motive : undefined;
}

/** Una exención ya validada, con su posición en el texto del archivo. */
interface AnchoredTag {
  pos: number;
  end: number;
  line: number;
  motive: string;
  scope: "file" | "site";
  covers: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección
// ─────────────────────────────────────────────────────────────────────────────

/** Los métodos del query builder de Drizzle que reciben una tabla. */
const TABLE_METHODS = new Set(["from", "insert", "update", "delete"]);

/**
 * Nombres de tabla referenciados en el texto literal de un template `sql`.
 * Mismo patrón que usa el parser del sentinel, sobre el fuente en vez de sobre
 * el SQL final.
 */
const SQL_TABLE_REF =
  /\b(?:from|join|into|update)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi;

/** Lo que hace que un sitio cuente como cumplidor. Ver `isCompliantText`. */
const COMPLIANCE_MARKERS: readonly string[] = [
  "tenantWhere(",
  "tenantValues(",
  ".tenantId",
  TENANT_COLUMN,
];

/**
 * ¿El sitio nombra el gimnasio?
 *
 * `tenantWhere` / `tenantValues` son la forma canónica premiada (fase 169): son
 * las que el sentinel ya reconoce y las que el compilador obliga a pasar por
 * `assertTenant`. El literal `tenant_id` y `.tenantId` cuentan también, porque
 * hay sitios legítimos que arman el filtro a mano en un template `sql`.
 *
 * El chequeo es de **PRESENCIA, no de corrección**: que el statement nombre el
 * tenant no prueba que lo filtre bien (podría filtrar la tabla equivocada de un
 * join). Es la misma limitación asumida y escrita del sentinel — este lint es
 * un tripwire contra el olvido, la corrección la prueba la capa 5 (fase 171+).
 */
function isCompliantText(statementText: string): boolean {
  return COMPLIANCE_MARKERS.some((marker) => statementText.includes(marker));
}

/**
 * El statement que CONTIENE al nodo: se sube por el árbol hasta topar con un
 * contenedor de statements. Es la unidad de anclaje de todo lo demás — el
 * cumplimiento se busca en su texto y una exención lo cubre si cae adentro de
 * su span.
 */
function enclosingStatement(node: ts.Node): ts.Node {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isBlock(parent) ||
      ts.isSourceFile(parent) ||
      ts.isModuleBlock(parent) ||
      ts.isCaseClause(parent) ||
      ts.isDefaultClause(parent)
    ) {
      return current;
    }
    current = parent;
  }
  return current;
}

/** ¿Es un nodo al que puede ir pegada una exención? Statement o llamada. */
function canCarryExemption(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) return true;
  return (
    node.kind >= ts.SyntaxKind.FirstStatement &&
    node.kind <= ts.SyntaxKind.LastStatement
  );
}

/**
 * ¿Este especificador de módulo apunta al schema de Drizzle?
 *
 * Por nombre y no por resolución de símbolos: es la consecuencia declarada de
 * D-10 (pase sintáctico, sin type checker). Cubre las TRES formas vivas del
 * repo:
 *
 *   import * as schema from "../db/schema"            (barrel, 110 archivos)
 *   import { users } from "./schema"                  (barrel, 9 archivos)
 *   import { blogPosts } from "../db/schema/blog-posts" (PROFUNDO, 18 archivos)
 *
 * EL PUNTO CIEGO QUE ESTA TERCERA FORMA CERRÓ (plan 08)
 * ----------------------------------------------------
 * Hasta el plan 07 esta función solo aceptaba el barrel, y la consecuencia no
 * era "el lint avisa menos": era que **los 18 archivos que importan en
 * profundidad quedaban con `SchemaBindings` vacío y TODOS sus accesos
 * invisibles**. No aparecían como violación, no entraban a la allowlist, y —lo
 * grave— un acceso NUEVO sin `tenant_id` en esos archivos no ponía el build en
 * rojo. El peor caso era `src/modules/auth/routes.ts`, que importa **solo** en
 * profundidad y toca `users`, `branches`, `member_profiles`, `promo_plans` y
 * `referrals`.
 *
 * Lo destapó el inventario del sentinel del plan 08: la lente de runtime vio 86
 * tablas gym-owned con deuda y la lente estática solo 78. Las 9 de diferencia
 * (`blog_posts`, `audit_log`, `franchise_applications`, …) salían justamente de
 * archivos con import profundo. Cuando las dos lentes discrepan, la respuesta
 * está en `170-INVENTORY.md`.
 *
 * QUÉ NO MATCHEA, Y POR QUÉ IMPORTA
 * ---------------------------------
 * Solo el último segmento después de `schema/`: `…/schema/blog-posts` sí,
 * `…/schema/blog/posts` no (no existe esa anidación) y `…/schema-utils` no (el
 * segmento tiene que ser exactamente `schema`). Un especificador que apunte a
 * un módulo del directorio que NO exporta tablas —`…/schema/tenant-column`, por
 * ejemplo— matchea acá pero no aporta nada: sus identificadores no están en el
 * mapa y `collectSchemaBindings` los descarta. Aceptar de más en esta función
 * es barato; aceptar de menos es un agujero en el gate.
 */
function isSchemaModule(specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const clean = specifier.replace(/\.(js|ts)$/, "");
  return SCHEMA_SPECIFIER.test(clean);
}

/**
 * El barrel (`…/schema`, `…/schema/index`) o un archivo suelto del directorio
 * (`…/schema/<archivo>`). El `(^|\/)` ancla `schema` como segmento completo,
 * que es lo que deja afuera a `…/schema-utils`.
 */
const SCHEMA_SPECIFIER = /(^|\/)schema(\/[A-Za-z0-9._-]+)?$/;

/** Los identificadores por los que un archivo puede nombrar una tabla. */
interface SchemaBindings {
  /** Nombres de los `import * as X` que apuntan al schema. */
  namespaces: Set<string>;
  /** `import { users }` -> nombre local a tabla física. */
  named: Map<string, string>;
}

function collectSchemaBindings(
  sourceFile: ts.SourceFile,
  schemaMap: ReadonlyMap<string, string>,
): SchemaBindings {
  const namespaces = new Set<string>();
  const named = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) continue;
    if (!isSchemaModule(specifier.text)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;

    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const exported = (element.propertyName ?? element.name).text;
      const table = schemaMap.get(exported);
      if (table) named.set(element.name.text, table);
    }
  }

  return { namespaces, named };
}

// ─────────────────────────────────────────────────────────────────────────────
// El pase
// ─────────────────────────────────────────────────────────────────────────────

export interface LintSourcesOptions {
  /** Raíz del repo. Todas las rutas del resultado salen relativas a esta. */
  rootDir: string;
  /** Directorios a analizar, relativos a `rootDir`. Default: {@link DEFAULT_SCOPE_DIRS}. */
  scopeDirs?: string[];
  /** Mapa de identificadores. Default: el de `el-templo-api/src/db/schema`. */
  schemaMap?: ReadonlyMap<string, string>;
}

export function lintTenantSources(opts: LintSourcesOptions): LintSourceResult {
  const rootDir = path.resolve(opts.rootDir);
  const scopeDirs = opts.scopeDirs ?? [...DEFAULT_SCOPE_DIRS];
  const schemaMap =
    opts.schemaMap ??
    buildSchemaTableMap(path.join(rootDir, SCHEMA_DIR_FROM_ROOT));

  const files: string[] = [];
  for (const scopeDir of scopeDirs) {
    const absolute = path.resolve(rootDir, scopeDir);
    if (!fs.existsSync(absolute)) {
      // Fail-closed: un alcance que no existe significa que el lint estaría
      // mirando menos código del que cree, y eso es peor que no correr.
      throw new Error(
        `El directorio de alcance no existe: ${absolute} (scopeDir "${scopeDir}" sobre rootDir ${rootDir}).`,
      );
    }
    files.push(...listTsFiles(absolute));
  }

  const accesses: TenantAccess[] = [];
  const exemptionInventory: ExemptionRecord[] = [];
  const unanchoredTags: UnanchoredTag[] = [];

  for (const filePath of files) {
    const sourceFile = parseFile(filePath);
    const text = sourceFile.text;
    const relative = path.relative(rootDir, filePath).split(path.sep).join("/");
    const lineOf = (position: number): number =>
      sourceFile.getLineAndCharacterOfPosition(position).line + 1;

    // ── Exenciones ──────────────────────────────────────────────────────────
    // Se recogen ANTES que los accesos y con independencia de ellos: el
    // inventario de D-12 tiene que mostrar también las exenciones que hoy no
    // cubren ningún acceso detectado (`covers: 0`). Una exención que no ancla
    // nada es información, no ruido: o el sitio que eximía se movió, o la
    // exención está de más.
    const anchored: AnchoredTag[] = [];
    const seenPositions = new Set<number>();

    const pushTag = (range: ts.CommentRange, scope: "file" | "site"): void => {
      if (seenPositions.has(range.pos)) return;
      const motive = exemptionMotive(text, range);
      if (!motive) return;
      // Dedup por `range.pos`: el MISMO comentario aparece como leading del
      // statement y como leading del CallExpression interno cuando los dos
      // arrancan en el mismo token (verificado en vivo sobre
      // `src/jobs/notification-cron.ts`). Sin esto el inventario mostraría
      // exenciones fantasma y una podría atribuirse al call equivocado.
      seenPositions.add(range.pos);
      anchored.push({
        pos: range.pos,
        end: range.end,
        line: lineOf(range.pos),
        motive,
        scope,
        covers: 0,
      });
    };

    for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) {
      pushTag(range, "file");
    }

    const visitForTags = (node: ts.Node): void => {
      if (canCarryExemption(node)) {
        for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
          pushTag(range, "site");
        }
        // El caso TRAILING existe de verdad: en `src/modules/tv/pairing.ts` la
        // exención está entre `.insert(schema.tvPairings)` y `.values(...)`.
        for (const range of ts.getTrailingCommentRanges(text, node.end) ?? []) {
          pushTag(range, "site");
        }
      }
      ts.forEachChild(node, visitForTags);
    };
    ts.forEachChild(sourceFile, visitForTags);

    const fileExemption = anchored.find((tag) => tag.scope === "file");

    // ── Accesos ─────────────────────────────────────────────────────────────
    const bindings = collectSchemaBindings(sourceFile, schemaMap);

    const tableOfExpression = (
      expression: ts.Expression,
    ): string | undefined => {
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        bindings.namespaces.has(expression.expression.text)
      ) {
        return schemaMap.get(expression.name.text);
      }
      if (ts.isIdentifier(expression))
        return bindings.named.get(expression.text);
      // `alias(schema.users, "u")` y compañía: se mira el primer argumento. Es
      // fail-closed a propósito — sobre-reportar es recuperable, no ver un
      // acceso no.
      if (ts.isCallExpression(expression) && expression.arguments.length > 0) {
        return tableOfExpression(expression.arguments[0]);
      }
      return undefined;
    };

    const collectTablesInExpression = (
      node: ts.Node,
      out: Set<string>,
    ): void => {
      if (ts.isExpression(node)) {
        const table = tableOfExpression(node);
        if (table && isGymOwnedTable(table)) out.add(table);
      }
      ts.forEachChild(node, (child) => collectTablesInExpression(child, out));
    };

    const record = (
      node: ts.Node,
      table: string,
      kind: TenantAccessKind,
    ): void => {
      const statement = enclosingStatement(node);
      const access: TenantAccess = {
        file: relative,
        line: lineOf(node.getStart(sourceFile)),
        table,
        kind,
        compliant: isCompliantText(statement.getText(sourceFile)),
      };

      // Una exención de sitio cubre el acceso si cae DENTRO del span del
      // statement que lo contiene (Pitfall 7). El span de un statement incluye
      // su trivia de apertura, así que entran tanto la exención leading como la
      // que quedó en el medio de un encadenado. Lo que queda afuera es la que
      // está después del punto y coma: esa ya es trivia del statement de al
      // lado y eximirla acá sería autorizar el call equivocado.
      const site = anchored
        .filter(
          (tag) =>
            tag.scope === "site" &&
            tag.pos >= statement.pos &&
            tag.end <= statement.end,
        )
        .sort((a, b) => b.pos - a.pos)[0];

      const covering = site ?? fileExemption;
      if (covering) {
        covering.covers += 1;
        access.exemption = {
          motive: covering.motive,
          scope: covering.scope,
          line: covering.line,
        };
      }
      accesses.push(access);
    };

    const visitForAccesses = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        TABLE_METHODS.has(node.expression.name.text) &&
        node.arguments.length > 0
      ) {
        const table = tableOfExpression(node.arguments[0]);
        if (table && isGymOwnedTable(table)) {
          record(node, table, "query-builder");
        }
      }

      if (
        ts.isTaggedTemplateExpression(node) &&
        calleeName(node.tag) === "sql"
      ) {
        const tables = new Set<string>();

        // (a) los nombres que aparecen en el texto literal del template…
        const literal = node.template;
        const spans: string[] = [];
        if (ts.isNoSubstitutionTemplateLiteral(literal)) {
          spans.push(literal.text);
        } else {
          spans.push(literal.head.text);
          for (const span of literal.templateSpans) {
            spans.push(span.literal.text);
          }
        }
        const joined = spans.join(" ");
        SQL_TABLE_REF.lastIndex = 0;
        let match = SQL_TABLE_REF.exec(joined);
        while (match !== null) {
          const candidate = match[1];
          if (isGymOwnedTable(candidate)) tables.add(candidate);
          match = SQL_TABLE_REF.exec(joined);
        }

        // …(b) UNIDOS a toda tabla del schema interpolada adentro. La unión es
        // fail-closed a propósito: un template puede nombrar la tabla por texto
        // (`from users`), por interpolación (`from ${schema.users}`) o por las
        // dos, y no ver un acceso es el único error que este lint no puede
        // permitirse. Sobre-reportar termina en una entrada de allowlist que
        // alguien revisa; sub-reportar termina en una fuga entre gimnasios.
        if (!ts.isNoSubstitutionTemplateLiteral(literal)) {
          for (const span of literal.templateSpans) {
            collectTablesInExpression(span.expression, tables);
          }
        }

        for (const table of [...tables].sort()) {
          record(node, table, "sql-template");
        }
      }

      ts.forEachChild(node, visitForAccesses);
    };
    ts.forEachChild(sourceFile, visitForAccesses);

    // ── Inventario y menciones sueltas ──────────────────────────────────────
    for (const tag of anchored) {
      exemptionInventory.push({
        file: relative,
        line: tag.line,
        motive: tag.motive,
        scope: tag.scope,
        covers: tag.covers,
      });
    }

    RAW_TAG.lastIndex = 0;
    let mention = RAW_TAG.exec(text);
    while (mention !== null) {
      const at = mention.index;
      const inside = anchored.some((tag) => at >= tag.pos && at < tag.end);
      if (!inside) unanchoredTags.push({ file: relative, line: lineOf(at) });
      mention = RAW_TAG.exec(text);
    }
  }

  return {
    filesScanned: files.length,
    accesses,
    violations: accesses.filter(
      (access) => !access.compliant && !access.exemption,
    ),
    exemptions: accesses.filter((access) => access.exemption !== undefined),
    exemptionInventory,
    unanchoredTags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist (D-13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un par archivo + tabla cuya deuda está TOLERADA.
 *
 * Sin número de línea a propósito (D-13): la entrada tiene que sobrevivir a que
 * alguien reformatee el archivo o mueva la función diez líneas más abajo. La
 * contracara está aceptada: un acceso nuevo a OTRA tabla en el MISMO archivo es
 * una entrada nueva, o sea rojo.
 */
export interface AllowlistEntry {
  file: string;
  table: string;
}

export interface Allowlist {
  /** Los archivos que el baseline miró. Documental: el alcance real es D-16. */
  scope: string;
  /** Cuándo y cómo se generó el baseline. Documental. */
  generated: string;
  entries: AllowlistEntry[];
}

/**
 * Error de USO o de entorno del lint — el que sale con código **2**.
 *
 * Mismo contrato que `TenantArgError` de `require-tenant.ts` y que el
 * `main().catch(...)` de `verify-tenant-uniques.ts`: 0 = limpio, 1 = hay
 * discrepancias, 2 = el lint no pudo ni siquiera evaluar. La distinción importa
 * porque el 2 no significa "el código está mal", significa **"este resultado no
 * vale"** — y un gate que no vale nunca puede quedar en verde.
 */
export class LintArgError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "LintArgError";
  }
}

/**
 * El separador de la clave (archivo, tabla). Va como SECUENCIA DE ESCAPE y
 * nunca como byte crudo: un NUL literal adentro del fuente hace que git, grep
 * y los diffs de GitHub traten el archivo entero como binario, y un gate cuyo
 * codigo nadie puede leer en un diff no se revisa.
 */
const KEY_SEPARATOR = "\u0000";

/** La clave del par (archivo, tabla). El separador no aparece en ninguno de los dos. */
function entryKey(entry: { file: string; table: string }): string {
  return `${entry.file}${KEY_SEPARATOR}${entry.table}`;
}

/** Ruta de la allowlist, relativa a la raíz del repo. */
export const ALLOWLIST_PATH_FROM_ROOT =
  "el-templo-api/tenant-lint-allowlist.json";

/**
 * Parsea y **valida** la allowlist. Fail-closed en las siete formas en que un
 * archivo puede estar roto: JSON inválido, raíz que no es objeto, `entries` que
 * no es array, entrada que no es objeto, `file` o `table` ausente o vacío, ruta
 * con separadores de Windows, y par duplicado.
 *
 * Ninguna de esas termina en "asumo la lista vacía". Una allowlist vacía por
 * error no deja el build rojo de más: lo deja rojo de menos justo cuando el
 * archivo que la gobierna está corrupto, y ese es el peor momento para confiar.
 *
 * @param source etiqueta legible del origen (ruta, o `<base>` en el ratchet),
 *   para que el mensaje diga CUÁL de las dos allowlists está rota.
 */
export function parseAllowlist(text: string, source: string): Allowlist {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LintArgError(
      `La allowlist de ${source} no es JSON valido: ${message}. El lint no asume una lista vacia: corregi el archivo.`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LintArgError(
      `La allowlist de ${source} tiene que ser un objeto JSON con la clave "entries".`,
    );
  }

  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.entries)) {
    throw new LintArgError(
      `La allowlist de ${source} no tiene "entries" como array. Forma esperada: { "entries": [{ "file": "...", "table": "..." }] }.`,
    );
  }

  const entries: AllowlistEntry[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < raw.entries.length; index += 1) {
    const item: unknown = raw.entries[index];
    const at = `entries[${index}] de ${source}`;

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new LintArgError(`${at} no es un objeto { file, table }.`);
    }

    const record = item as Record<string, unknown>;
    const file = record.file;
    const table = record.table;

    if (typeof file !== "string" || file.trim().length === 0) {
      throw new LintArgError(`${at} no tiene "file" (string no vacio).`);
    }
    if (typeof table !== "string" || table.trim().length === 0) {
      throw new LintArgError(`${at} no tiene "table" (string no vacio).`);
    }
    if (file.includes("\\")) {
      throw new LintArgError(
        `${at} usa separadores de Windows: "${file}". Las rutas van con "/" y relativas a la raiz del repo, o el par (file, table) no matchea nunca y la entrada queda podrida en silencio.`,
      );
    }

    const key = entryKey({ file, table });
    if (seen.has(key)) {
      throw new LintArgError(
        `${at} esta duplicada: ${file} + ${table}. Una entrada repetida infla el tamano de la lista y esconde un achique.`,
      );
    }
    seen.add(key);
    entries.push({ file, table });
  }

  return {
    scope: typeof raw.scope === "string" ? raw.scope : "",
    generated: typeof raw.generated === "string" ? raw.generated : "",
    entries,
  };
}

/** Lee la allowlist del disco. Archivo ausente = error de uso, no lista vacía. */
export function loadAllowlist(filePath: string): Allowlist {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new LintArgError(
      `No existe la allowlist ${absolute}. El lint NO asume una lista vacia: sin ese archivo no puede distinguir "no hay deuda tolerada" de "alguien la borro".`,
    );
  }
  let text: string;
  try {
    text = fs.readFileSync(absolute, "utf8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LintArgError(
      `No se pudo leer la allowlist ${absolute}: ${message}`,
    );
  }
  return parseAllowlist(text, absolute);
}

// ─────────────────────────────────────────────────────────────────────────────
// Forma del reporte
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantLintReport {
  filesScanned: number;
  allowlistSize: number;
  /** D-13: violan y NO están en la allowlist. El hallazgo principal. */
  unlistedViolations: TenantAccess[];
  /** D-14: la entrada apunta a un archivo que ya no existe (rename o borrado). */
  staleMissingFile: AllowlistEntry[];
  /** D-14: el archivo existe y ya no viola. La deuda se pagó: borrá la entrada. */
  staleNoLongerViolating: AllowlistEntry[];
  /** D-14: entradas nuevas respecto de la rama base. La lista creció. */
  gainedEntries: AllowlistEntry[];
  /** D-15: tabla de módulo migrado (throw activo) con entradas vivas. */
  strictWithAllowlist: AllowlistEntry[];
  /** D-12: accesos cubiertos por una exención. NO suman. */
  exemptions: TenantAccess[];
  /**
   * D-12: TODAS las exenciones ancladas del fuente, cubran o no algún acceso.
   *
   * Campo ADITIVO respecto del contrato del plan, por el mismo motivo que lo
   * agregó el plan 03: la mitad del inventario que D-12 pide —las exenciones de
   * archivo de los scripts de plataforma y la de `notification-cron.ts`— no
   * tiene ningún acceso debajo y por lo tanto no puede existir como
   * `TenantAccess`. Sin este campo, "el inventario completo en una sola corrida
   * revisable" saldría incompleto y nadie lo notaría.
   */
  exemptionInventory: ExemptionRecord[];
  /** Observaciones que NO son discrepancias. */
  warnings: string[];
  /** Suma de los cinco arrays de hallazgo. Los `warnings` NO suman. */
  discrepancies: number;
}

export interface LintTenantOptions {
  /** Raíz del repo. Las rutas del reporte y de la allowlist salen relativas a ésta. */
  rootDir: string;
  allowlist: Allowlist;
  /** Ausente = el gate de entradas ganadas (D-14) no corre. */
  baseAllowlist?: Allowlist;
  /** Por qué no hay allowlist de base. Va textual a la advertencia. */
  baseSkipReason?: string;
  /**
   * Lista strict del sentinel para el gate D-15. Default: `strictTablesSet()`,
   * el aplanado de `TENANT_STRICT_MODULES`. Es inyectable por el mismo motivo
   * que en el sentinel (D-07): el test del gate necesita una tabla strict sin
   * declarar migrado un módulo que no lo está.
   */
  strictTables?: ReadonlySet<string>;
  /** Advertencias que produjo el llamador (típicamente la resolución de la base). */
  extraWarnings?: readonly string[];
  scopeDirs?: string[];
  schemaMap?: ReadonlyMap<string, string>;
}

/**
 * El motor del plan 03 cruzado con la allowlist: los cuatro gates del ratchet.
 *
 * Función pura sobre el disco: lee archivos, no habla con `git` ni con MySQL.
 * La resolución de la allowlist de la base —que sí necesita `git`— vive en
 * {@link runLint}, para que toda esta lógica sea testeable con allowlists en
 * memoria.
 */
export function lintTenant(opts: LintTenantOptions): TenantLintReport {
  const rootDir = path.resolve(opts.rootDir);
  const source = lintTenantSources({
    rootDir,
    scopeDirs: opts.scopeDirs,
    schemaMap: opts.schemaMap,
  });

  const entries = opts.allowlist.entries;
  const allowed = new Set(entries.map(entryKey));

  // ── D-13: violaciones que nadie tolera ──────────────────────────────────────
  const unlistedViolations = source.violations.filter(
    (violation) => !allowed.has(entryKey(violation)),
  );

  // ── D-14: las dos formas de entrada podrida ────────────────────────────────
  // "Viva" = el par (archivo, tabla) todavía tiene al menos un acceso que no
  // nombra el gimnasio, esté eximido o no. Los eximidos cuentan a propósito:
  // escribir una exención no obliga a tocar la allowlist en el mismo PR, y un
  // rojo por eso sería ruido que empuja a desactivar el gate.
  const live = new Set<string>();
  for (const access of source.accesses) {
    if (!access.compliant || access.exemption) live.add(entryKey(access));
  }

  const staleMissingFile: AllowlistEntry[] = [];
  const staleNoLongerViolating: AllowlistEntry[] = [];
  for (const entry of entries) {
    if (!fs.existsSync(path.resolve(rootDir, entry.file))) {
      staleMissingFile.push(entry);
      continue;
    }
    if (!live.has(entryKey(entry))) staleNoLongerViolating.push(entry);
  }

  // ── D-14: entradas ganadas respecto de la base ─────────────────────────────
  // Achicar SIEMPRE es legal: una entrada que la base tenía y la actual no es
  // exactamente lo que el ratchet quiere ver, así que no se compara al revés.
  const warnings: string[] = [...(opts.extraWarnings ?? [])];
  let gainedEntries: AllowlistEntry[] = [];
  if (opts.baseAllowlist) {
    const baseKeys = new Set(opts.baseAllowlist.entries.map(entryKey));
    gainedEntries = entries.filter((entry) => !baseKeys.has(entryKey(entry)));
    const removed = opts.baseAllowlist.entries.length - entries.length;
    if (removed > 0) {
      warnings.push(
        `La allowlist ACHICO ${removed} entrada(s) respecto de la base. Eso es exactamente lo que el ratchet quiere ver.`,
      );
    }
  } else if (opts.baseSkipReason) {
    warnings.push(
      `El gate de entradas ganadas (D-14) NO corrio: ${opts.baseSkipReason}. Los otros tres gates SI corrieron.`,
    );
  } else {
    warnings.push(
      `El gate de entradas ganadas (D-14) NO corrio: no se paso --base (uso local). ` +
        `Los otros tres gates SI corrieron. En CI el step tiene que pasar --base o el ratchet queda decorativo.`,
    );
  }

  // ── D-15: coherencia strict / allowlist ────────────────────────────────────
  const strictTables = opts.strictTables ?? strictTablesSet();
  const strictWithAllowlist = entries.filter((entry) =>
    strictTables.has(entry.table),
  );

  // ── Advertencias (NO suman) ────────────────────────────────────────────────
  if (source.unanchoredTags.length > 0) {
    const porArchivo = new Map<string, number>();
    for (const tag of source.unanchoredTags) {
      porArchivo.set(tag.file, (porArchivo.get(tag.file) ?? 0) + 1);
    }
    const detalle = [...porArchivo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([file, count]) => `${file} (${count})`)
      .join(", ");
    warnings.push(
      `Menciones del tag tenant-safe que NO eximen nada: ${detalle}. NO son violaciones — ` +
        `hay archivos que documentan la convencion y otros donde el tag es un dato dentro de una regex. ` +
        `Estan listadas para que nadie escriba la anotacion de una forma que no exime y se entere en el rojo de CI.`,
    );
  }

  const sinOrden = entries.some((entry, index) => {
    if (index === 0) return false;
    const previous = entries[index - 1];
    return (
      previous.file > entry.file ||
      (previous.file === entry.file && previous.table > entry.table)
    );
  });
  if (sinOrden) {
    warnings.push(
      `La allowlist no esta ordenada por (file, table). No es una discrepancia, pero un orden estable es lo que hace legible el diff del achique.`,
    );
  }

  const discrepancies =
    unlistedViolations.length +
    staleMissingFile.length +
    staleNoLongerViolating.length +
    gainedEntries.length +
    strictWithAllowlist.length;

  return {
    filesScanned: source.filesScanned,
    allowlistSize: entries.length,
    unlistedViolations,
    staleMissingFile,
    staleNoLongerViolating,
    gainedEntries,
    strictWithAllowlist,
    exemptions: source.exemptions,
    exemptionInventory: source.exemptionInventory,
    warnings,
    discrepancies,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrupa accesos por (archivo, tabla) — la MISMA clave de la allowlist.
 *
 * El reporte no imprime números de línea a propósito (D-13). Dos motivos: la
 * unidad accionable es el par que se escribe en la allowlist, y una línea
 * impresa invita a pegarla en la entrada, que es justo lo que D-13 prohíbe
 * porque haría podrirse la lista con cada reformateo. Las líneas siguen estando
 * en `report.unlistedViolations` para quien las quiera.
 */
function groupByFileTable(accesses: readonly TenantAccess[]): string[] {
  const counts = new Map<string, number>();
  for (const access of accesses) {
    const key = `${access.file} — ${access.table}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key} (${count} acceso${count === 1 ? "" : "s"})`);
}

export function formatReport(report: TenantLintReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(
    "Lint de tenancy (CON-06) — accesos a tablas gym-owned sin gimnasio",
  );
  lines.push("=".repeat(72));
  lines.push(`Archivos analizados:            ${report.filesScanned}`);
  lines.push(`Entradas de la allowlist:       ${report.allowlistSize}`);
  lines.push("");

  lines.push(
    `Violaciones NO listadas en la allowlist (unlistedViolations): ${report.unlistedViolations.length}`,
  );
  for (const entry of groupByFileTable(report.unlistedViolations)) {
    lines.push(`  - ${entry}`);
  }
  if (report.unlistedViolations.length > 0) {
    lines.push(
      `      Que hacer: migra esos accesos a tenantWhere / tenantValues (src/modules/shared/tenant.ts, fase 169), ` +
        `o escribi la exencion /* tenant-safe: <motivo> */ como comentario de BLOQUE pegado al sitio del write. ` +
        `Agregar la entrada a ${ALLOWLIST_PATH_FROM_ROOT} NO es una salida valida: el gate de entradas ganadas (D-14) deja el build rojo igual.`,
    );
  }

  lines.push(
    `Entradas cuyo archivo ya NO existe (staleMissingFile): ${report.staleMissingFile.length}`,
  );
  for (const entry of report.staleMissingFile) {
    lines.push(`  - ${entry.file} — ${entry.table}`);
  }
  if (report.staleMissingFile.length > 0) {
    lines.push(
      `      Que hacer: el archivo se renombro o se movio. ACTUALIZA LA RUTA de la entrada para que siga apuntando al mismo codigo ` +
        `(o borrala, si el codigo se fue del repo). Dejarla apuntando a la nada equivale a no tener el acceso vigilado.`,
    );
  }

  lines.push(
    `Entradas que ya NO corresponden a una violacion (staleNoLongerViolating): ${report.staleNoLongerViolating.length}`,
  );
  for (const entry of report.staleNoLongerViolating) {
    lines.push(`  - ${entry.file} — ${entry.table}`);
  }
  if (report.staleNoLongerViolating.length > 0) {
    lines.push(
      `      Que hacer: ese archivo ya NO accede a esa tabla sin gimnasio: la deuda se pago. BORRA LA ENTRADA en este mismo PR. ` +
        `Migrar y achicar la allowlist son el mismo acto (D-14): si el achique queda para despues, no pasa nunca.`,
    );
  }

  lines.push(
    `Entradas GANADAS respecto de la rama base (gainedEntries): ${report.gainedEntries.length}`,
  );
  for (const entry of report.gainedEntries) {
    lines.push(`  - ${entry.file} — ${entry.table}`);
  }
  if (report.gainedEntries.length > 0) {
    lines.push(
      `      Que hacer: la allowlist CRECIO, y solo puede achicarse (D-14). Saca la entrada y resolve el acceso: ` +
        `migralo al patron de la fase 169 o escribile la exencion con motivo. La allowlist no es una alfombra.`,
    );
  }

  lines.push(
    `Tablas de modulos migrados con entradas vivas (strictWithAllowlist): ${report.strictWithAllowlist.length}`,
  );
  for (const entry of report.strictWithAllowlist) {
    lines.push(`  - ${entry.file} — ${entry.table}`);
  }
  if (report.strictWithAllowlist.length > 0) {
    lines.push(
      `      Que hacer: esa tabla figura en TENANT_STRICT_MODULES (src/db/tenant-tables.ts), o sea que el sentinel ya hace THROW sobre ella. ` +
        `Afirmar "modulo migrado" y "todavia hay accesos sin scope perdonados" al mismo tiempo es una contradiccion (D-15): ` +
        `VACIA las entradas de esa tabla, o saca la tabla del registro strict hasta terminar la migracion.`,
    );
  }

  lines.push("");
  lines.push(`DISCREPANCIAS: ${report.discrepancies}`);
  lines.push("");

  lines.push("--- Advertencias (NO son discrepancias) ---");
  for (const warning of report.warnings) {
    lines.push(`  - ${warning}`);
  }

  lines.push("");
  lines.push(
    `--- Inventario de exenciones tenant-safe (D-12): ${report.exemptionInventory.length} ---`,
  );
  for (const record of report.exemptionInventory) {
    // Las de alcance de archivo van marcadas: cubren TODO el archivo, incluido
    // el codigo que todavia no se escribio (T-170-06). Una exencion asi hay que
    // releerla cuando el archivo crece, y la unica forma de que eso pase es que
    // se vea distinta de las demas.
    const marca =
      record.scope === "file" ? "[ARCHIVO ENTERO]" : "[sitio         ]";
    lines.push(
      `  ${marca} ${record.file}:${record.line} cubre ${record.covers} acceso(s) — ${record.motive}`,
    );
  }
  lines.push(
    `  Accesos cubiertos por alguna exencion: ${report.exemptions.length} (NO suman a DISCREPANCIAS).`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// El ratchet contra la rama base (D-14) — la única parte que habla con git
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que `github.event.before` manda en el PRIMER push de una rama: la rama no
 * tenía estado anterior, así que el evento trae el SHA nulo en vez de un commit.
 * Pasárselo a `git show` da un error críptico, y tratar ese error como "no pude
 * mirar la base" dejaría el build rojo en toda rama nueva. Se normaliza al
 * `merge-base` con master, que es lo que el operador quería decir.
 */
const NULL_SHA = "0".repeat(40);

/** La forma de una ref de git. Sirve para rechazar lo que empieza con `-`. */
const REF_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/^~@{}-]*$/;

const FETCH_DEPTH_HINT =
  "Si esto pasa en CI, el checkout del job necesita `fetch-depth: 0`: el default es 1 y con un clon shallow la rama base NO esta en el repo. " +
  "El lint sale 2 a proposito en vez de asumir 'sin cambios': un gate que pasa en verde por no haber podido mirar es peor que no tenerlo (T-170-04).";

const USO =
  "Uso: lint-tenant [--base=<ref>] [--root=<ruta>] [--allowlist=<ruta>]";

/**
 * Corre `git` **sin shell**: argumentos como array, nunca un string interpolado
 * (T-170-16). Devuelve `undefined` si el comando falla, para que cada llamador
 * decida qué significa ese fallo en su contexto.
 */
function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * La raíz del repo. Hace falta porque el script corre con working-directory
 * `el-templo-api` (tanto en CI como con `pnpm lint:tenant`) y todas las rutas
 * del lint —las del reporte y las de la allowlist— son relativas a la raíz.
 */
export function resolveRepoRoot(cwd: string): string {
  const root = tryGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) {
    throw new LintArgError(
      `No se pudo resolver la raiz del repo con \`git rev-parse --show-toplevel\` desde ${cwd}. Pasa --root=<ruta> si estas corriendo el lint fuera de un checkout de git.`,
    );
  }
  return root;
}

/**
 * La ref de la base, ya resuelta a un commit concreto.
 *
 * Normaliza los dos casos que la CI produce sola —string vacío y SHA nulo— al
 * `merge-base` con master. Todo lo demás es fail-closed: si la ref no se
 * resuelve, el lint no corre.
 */
export function resolveBaseRef(rootDir: string, raw: string): string {
  const ref = raw.trim();

  if (ref === "" || ref === NULL_SHA) {
    const fallback = tryGit(rootDir, ["merge-base", "origin/master", "HEAD"]);
    if (!fallback) {
      throw new LintArgError(
        `--base vino ${ref === "" ? "vacio" : "con el SHA nulo (primer push de la rama)"} y el fallback \`git merge-base origin/master HEAD\` fallo. ${FETCH_DEPTH_HINT}`,
      );
    }
    return fallback;
  }

  if (!REF_SHAPE.test(ref)) {
    throw new LintArgError(
      `--base=${ref} no tiene forma de ref de git. Se rechaza antes de llamar a git para que un valor que empieza con "-" no se cuele como flag del comando.`,
    );
  }

  const resolved = tryGit(rootDir, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`,
  ]);
  if (!resolved) {
    throw new LintArgError(
      `La ref de --base no existe en este checkout: ${ref}. ${FETCH_DEPTH_HINT}`,
    );
  }
  return resolved;
}

export interface BaseAllowlistResult {
  /** Ausente = el archivo no existía en la base (la excepción única de abajo). */
  allowlist?: Allowlist;
  /** Advertencia ruidosa cuando el gate se saltea. */
  warning?: string;
}

/**
 * La allowlist tal como estaba en la rama base.
 *
 * FAIL-CLOSED, con **una sola excepción escrita**: que el archivo no exista en
 * la base significa que éste es el commit que lo INTRODUCE (la fase 170). En
 * ese caso el gate de entradas ganadas se saltea con una advertencia ruidosa
 * que dice cuántas entradas trae el baseline — porque el otro camino a este
 * mismo estado es que alguien BORRE el archivo para resetear el ratchet, y eso
 * tiene que quedar escrito en el output además de visible en el diff.
 *
 * Cualquier otro fallo de lectura (ref rota, git que no responde, JSON que no
 * parsea) es exit 2.
 */
export function readBaseAllowlist(
  rootDir: string,
  ref: string,
  currentSize: number,
): BaseAllowlistResult {
  const listed = tryGit(rootDir, [
    "ls-tree",
    "-r",
    "--name-only",
    ref,
    "--",
    ALLOWLIST_PATH_FROM_ROOT,
  ]);
  if (listed === undefined) {
    throw new LintArgError(
      `\`git ls-tree\` fallo sobre la ref ${ref} buscando ${ALLOWLIST_PATH_FROM_ROOT}. ${FETCH_DEPTH_HINT}`,
    );
  }

  if (listed === "") {
    return {
      warning:
        `ATENCION: ${ALLOWLIST_PATH_FROM_ROOT} NO EXISTE en la rama base (${ref}), asi que el gate de entradas ganadas (D-14) se SALTEA. ` +
        `Esto es correcto UNA sola vez: en el commit que introduce la allowlist, con ${currentSize} entrada(s) de baseline. ` +
        `Si lees esto en cualquier otro PR, entonces el archivo se BORRO —que es la forma de resetear el ratchet— y eso se ve en el diff.`,
    };
  }

  const text = tryGit(rootDir, ["show", `${ref}:${ALLOWLIST_PATH_FROM_ROOT}`]);
  if (text === undefined) {
    throw new LintArgError(
      `\`git show ${ref}:${ALLOWLIST_PATH_FROM_ROOT}\` fallo aunque el archivo figura en el arbol de esa revision. ${FETCH_DEPTH_HINT}`,
    );
  }

  return { allowlist: parseAllowlist(text, `la rama base (${ref})`) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La CLI, sin `process.exit` adentro: devuelve el código y el texto.
 *
 * Esa separación no es estilo. Es lo que permite que el test afirme los tres
 * códigos de salida sin matar al worker de Vitest, y por lo tanto que el
 * contrato 0/1/2 esté cubierto por tests en vez de por confianza. El
 * `process.exit` vive **solo** en el guard de abajo.
 *
 * `async` por contrato con el idioma de scripts del repo (el `main()` de
 * `verify-tenant-uniques.ts` abre una conexión y sí espera); acá no hay nada
 * que esperar, y está bien que así sea: el lint no toca la base.
 */
export async function runLint(
  argv: string[],
): Promise<{ code: 0 | 1 | 2; output: string }> {
  try {
    let baseArg: string | undefined;
    let rootArg: string | undefined;
    let allowlistArg: string | undefined;

    for (const arg of argv) {
      if (arg.startsWith("--base=")) {
        baseArg = arg.slice("--base=".length);
        continue;
      }
      if (arg.startsWith("--root=")) {
        rootArg = arg.slice("--root=".length);
        continue;
      }
      if (arg.startsWith("--allowlist=")) {
        allowlistArg = arg.slice("--allowlist=".length);
        continue;
      }
      // Fail-closed también acá: un flag mal escrito (`--bases=`, `--base sha`)
      // que se ignorara en silencio apagaría un gate sin que nadie se entere.
      throw new LintArgError(`Flag desconocido: ${arg}. ${USO}`);
    }

    const rootDir = rootArg
      ? path.resolve(rootArg)
      : resolveRepoRoot(process.cwd());
    const allowlistPath = allowlistArg
      ? path.resolve(allowlistArg)
      : path.join(rootDir, ALLOWLIST_PATH_FROM_ROOT);

    const allowlist = loadAllowlist(allowlistPath);

    let baseAllowlist: Allowlist | undefined;
    let baseSkipReason: string | undefined;
    const extraWarnings: string[] = [];

    if (baseArg !== undefined) {
      const ref = resolveBaseRef(rootDir, baseArg);
      const base = readBaseAllowlist(rootDir, ref, allowlist.entries.length);
      baseAllowlist = base.allowlist;
      if (base.warning) {
        extraWarnings.push(base.warning);
        baseSkipReason = `la allowlist todavia no existe en la rama base (${ref})`;
      }
    }

    const report = lintTenant({
      rootDir,
      allowlist,
      baseAllowlist,
      baseSkipReason,
      extraWarnings,
    });

    return {
      code: report.discrepancies === 0 ? 0 : 1,
      output: formatReport(report),
    };
  } catch (err: unknown) {
    if (err instanceof LintArgError) {
      return { code: 2, output: `lint-tenant fallo: ${err.message}` };
    }
    throw err;
  }
}

if (require.main === module) {
  runLint(process.argv.slice(2))
    .then(({ code, output }) => {
      if (code === 2) {
        console.error(output);
      } else {
        console.log(output);
      }
      process.exit(code);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`lint-tenant fallo: ${message}`);
      process.exit(2);
    });
}
