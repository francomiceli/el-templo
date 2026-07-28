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
 * ¿Este especificador de módulo apunta al barrel de schema?
 *
 * Por nombre y no por resolución de símbolos: es la consecuencia declarada de
 * D-10 (pase sintáctico, sin type checker). Cubre las dos formas vivas del
 * repo: `import * as schema from "../db/schema"` (110 archivos) y
 * `import { users } from "./schema"` (9 archivos).
 */
function isSchemaModule(specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const clean = specifier.replace(/\.(js|ts)$/, "");
  return clean.endsWith("/schema") || clean.endsWith("/schema/index");
}

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
