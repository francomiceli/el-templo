/**
 * Fase 170 Plan 03 (CON-06): el motor del lint de tenancy, congelado.
 *
 * QUÉ PRUEBA ESTE ARCHIVO
 * -----------------------
 * Dos cosas distintas, en dos `describe` separados:
 *
 * 1. **El motor sobre fixtures controlados** (`test/tenancy/__fixtures__/lint/`):
 *    las dos formas de acceso (query builder y template `sql` crudo), el
 *    cumplimiento por `tenantWhere` / `tenantValues` / `tenant_id`, y las cuatro
 *    formas de anotación —de sitio, TRAILING, de archivo, y las dos que NO
 *    eximen—. El fixture está fuera del alcance real del lint (D-16 excluye
 *    `test/`), así que analizarlo no contamina la allowlist del repo.
 *
 * 2. **El anclaje contra los archivos reales de `origin/master`**: las cuatro
 *    exenciones que el matcher tiene que aceptar y los DOS casos de prosa que
 *    tiene que rechazar.
 *
 * POR QUÉ LOS DOS RECHAZOS SON EL CORAZÓN DEL ARCHIVO
 * ---------------------------------------------------
 * `src/db/schema/tv.ts` y `src/db/scripts/require-tenant.ts` mencionan la
 * anotación en prosa: el primero la cita dentro de un comentario de línea, el
 * segundo la documenta adentro de su JSDoc de cabecera. **Un grep crudo del tag
 * autoriza los 11 archivos que lo mencionan cuando solo 9 tienen exención
 * real** — ese es, literal, el hallazgo del 169-09-SUMMARY y el motivo entero
 * de la decisión D-10 (AST y no grep).
 *
 * Las aserciones nominales de esos dos archivos son las que impiden que alguien
 * "simplifique" el matcher de vuelta a un grep. Borrarlas reabre el agujero:
 * cualquier prosa que mencione el tag pasaría a autorizar escrituras sin
 * gimnasio, que es la mitigación de T-170-09.
 *
 * Está demostrado en vivo, no argumentado: buscando el tag en cualquier parte
 * del comentario en vez de exigirlo pegado a la apertura, `require-tenant.ts`
 * pasa a figurar como archivo EXENTO y esta batería se pone roja. Sacando
 * además el chequeo de comentario de bloque, se pone roja también la aserción
 * del fixture `conComentarioDeLinea`. Las dos condiciones son necesarias.
 *
 * 3. **Los cuatro gates del ratchet y el contrato de exit codes 0/1/2**, con
 *    allowlists en memoria contra los mismos fixtures. Ninguno de esos tests
 *    escribe sobre `el-templo-api/tenant-lint-allowlist.json`: el archivo real
 *    se lee, nunca se toca.
 *
 * QUÉ HACER CUANDO ESTE GUARD SE CAIGA
 * ------------------------------------
 * **No borres la entrada de la allowlist ni desactives el lint.** El rojo dice
 * una de tres cosas, y las tres tienen la misma respuesta escrita:
 *
 *   - Apareció un acceso nuevo a una tabla gym-owned sin scope de gimnasio:
 *     migrá el módulo al patrón (`tenantWhere` / `tenantValues`, fase 169).
 *   - Hace falta que ese acceso quede global de verdad: escribí la exención
 *     como comentario de BLOQUE pegado al sitio, **con el motivo adentro**. Sin
 *     motivo no exime, y es a propósito: una exención sin motivo es
 *     indistinguible de un olvido (T-169-36).
 *   - Cambió el matcher: entonces el fallo es el gate haciendo su trabajo.
 *     Revisá contra los 6 archivos reales de la segunda batería antes de tocar
 *     una línea del motor.
 *
 * Y la que NO está en la lista, escrita explícitamente porque es la tentación
 * obvia: **agrandar `tenant-lint-allowlist.json` no es una salida válida.** No
 * es una cuestión de disciplina, es que no funciona: el gate de entradas
 * ganadas (D-14) compara la lista contra la rama base y deja el build rojo
 * igual. La allowlist es deuda TOLERADA —la que ya estaba— y solo puede
 * achicarse. Si tu PR necesita una entrada nueva, lo que necesita es migrar el
 * acceso o escribirle la exención con motivo.
 *
 * Los dos `describe` **NO tocan la base de datos**: leen archivos y los
 * parsean. Corren igual bajo el `setupFiles` del repo, que provisiona MySQL por
 * worker para TODO archivo de test (~96 s de overhead conocida, hallazgo
 * 169-07). Esa overhead es justamente lo que D-09 evita al hacer del lint un
 * script standalone de CI y no un gate de Vitest.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, it, expect } from "vitest";

import {
  buildSchemaTableMap,
  formatReport,
  lintTenant,
  lintTenantSources,
  runLint,
  type Allowlist,
  type AllowlistEntry,
  type LintSourceResult,
  type LintTenantOptions,
  type TenantAccess,
  type TenantLintReport,
} from "../../src/db/scripts/lint-tenant";
import { strictTablesSet } from "../../src/db/tenant-tables";

/** El cwd de Vitest es `el-templo-api` (`root: "."` de `vitest.config.ts`). */
const API_DIR = process.cwd();
/** La raíz del repo: las rutas del resultado salen relativas a ésta (D-13). */
const REPO_ROOT = path.resolve(API_DIR, "..");
const FIXTURES_DIR = path.resolve(API_DIR, "test/tenancy/__fixtures__/lint");

const SCHEMA_MAP = buildSchemaTableMap(path.join(API_DIR, "src/db/schema"));

const FIXTURE_RESULT: LintSourceResult = lintTenantSources({
  rootDir: FIXTURES_DIR,
  scopeDirs: ["."],
  schemaMap: SCHEMA_MAP,
});

const REAL_START = Date.now();
const REAL_RESULT: LintSourceResult = lintTenantSources({ rootDir: REPO_ROOT });
const REAL_ELAPSED_MS = Date.now() - REAL_START;

/** Una línea por acceso, para afirmar contenido y no solo largo. */
function resumir(accesses: readonly TenantAccess[]): string[] {
  return accesses.map((access) => {
    const veredicto = access.compliant ? "cumple" : "viola";
    const exencion = access.exemption
      ? ` exento:${access.exemption.scope}`
      : "";
    return `${access.file} ${access.table} ${access.kind} ${veredicto}${exencion}`;
  });
}

function deArchivo(
  result: LintSourceResult,
  file: string,
): readonly TenantAccess[] {
  return result.accesses.filter((access) => access.file === file);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("lint-tenant — motor sobre fixtures", () => {
  it("escanea los 4 archivos del fixture y ninguna ruta se escapa del rootDir", () => {
    expect(
      FIXTURE_RESULT.filesScanned,
      "el fixture tiene 4 archivos .ts: tipos, accesos, exenciones y exento-por-archivo",
    ).toBe(4);

    const fuera = FIXTURE_RESULT.accesses.filter((access) =>
      access.file.startsWith(".."),
    );
    expect(
      fuera,
      "las rutas del resultado son relativas al rootDir: ninguna puede empezar con ..",
    ).toEqual([]);
  });

  it("clasifica las nueve formas de acceso de accesos.ts", () => {
    expect(resumir(deArchivo(FIXTURE_RESULT, "accesos.ts"))).toEqual([
      // selectSinFiltro: el olvido puro.
      "accesos.ts bookings query-builder viola",
      // selectConTenantWhere: la forma canónica premiada (fase 169).
      "accesos.ts bookings query-builder cumple",
      // insertConTenantValues: el INSERT que estampa el gimnasio del scope.
      "accesos.ts users query-builder cumple",
      // sqlCrudoSinTenant: el template crudo también se mira.
      "accesos.ts bookings sql-template viola",
      // sqlCrudoConTenant: el filtro escrito a mano cuenta como cumplimiento.
      "accesos.ts bookings sql-template cumple",
      // selectPorAliasLocal: `const a = schema.attendance` (punto ciego CR-01).
      "accesos.ts attendance query-builder viola",
      // selectPorAliasDeDrizzle: `alias(...)` guardado en variable (CR-01).
      "accesos.ts subscriptions query-builder viola",
      // joinSinFiltro: el JOIN genera su propio par (WR-01) y se visita ANTES
      // que el `.from()` interno, porque es el nodo más externo del encadenado.
      "accesos.ts member_profiles query-builder viola",
      // joinSinFiltro: …y el `from` sigue produciendo el suyo.
      "accesos.ts bookings query-builder viola",
      // joinConTenantWhere: el mismo join, con el gimnasio nombrado en el
      // statement. Sumar los joins no inventa rojos donde el sitio cumple.
      "accesos.ts member_profiles query-builder cumple",
      "accesos.ts bookings query-builder cumple",
    ]);
  });

  it("una tabla que no es gym-owned no genera acceso, ni por query builder ni por sql", () => {
    // `system_settings` y `tenants` están en TENANT_EXEMPT_TABLES: config
    // global heredada y tabla de plataforma. Si el lint las mirara, la
    // allowlist inicial arrancaría con ruido que nadie puede accionar.
    const tablas = FIXTURE_RESULT.accesses.map((access) => access.table);
    expect(tablas).not.toContain("system_settings");
    expect(tablas).not.toContain("tenants");
  });

  it("la exención de sitio exime; el motivo vacío y el comentario de línea NO", () => {
    expect(resumir(deArchivo(FIXTURE_RESULT, "exenciones.ts"))).toEqual([
      // conExencionValida: comentario de bloque, tag pegado a la apertura.
      "exenciones.ts bookings query-builder viola exento:site",
      // conMotivoVacio: la anotación pelada es indistinguible de un olvido.
      "exenciones.ts users query-builder viola",
      // conComentarioDeLinea: el tag solo cuenta en un comentario de BLOQUE.
      "exenciones.ts attendance query-builder viola",
      // conExencionTrailing: la forma real de src/modules/tv/pairing.ts.
      "exenciones.ts bookings query-builder viola exento:site",
    ]);
  });

  it("la exención de archivo cubre todos los accesos del archivo con scope file", () => {
    expect(resumir(deArchivo(FIXTURE_RESULT, "exento-por-archivo.ts"))).toEqual(
      [
        "exento-por-archivo.ts bookings query-builder viola exento:file",
        "exento-por-archivo.ts users query-builder viola exento:file",
      ],
    );
  });

  it("el inventario D-12 lista las 3 exenciones con su alcance, su motivo y a cuántos accesos cubre", () => {
    const inventario = FIXTURE_RESULT.exemptionInventory.map(
      (entry) => `${entry.file} ${entry.scope} covers=${entry.covers}`,
    );
    expect(inventario).toEqual([
      "exenciones.ts site covers=1",
      "exenciones.ts site covers=1",
      "exento-por-archivo.ts file covers=2",
    ]);

    for (const entry of FIXTURE_RESULT.exemptionInventory) {
      expect(
        entry.motive.trim().length,
        `la exención de ${entry.file}:${entry.line} entró al inventario sin motivo`,
      ).toBeGreaterThan(0);
    }
  });

  it("las anotaciones que no anclan se reportan aparte y no eximen nada", () => {
    // Las dos de exenciones.ts: el motivo vacío y el comentario de línea. Que
    // salgan listadas es lo que evita el peor final posible — que alguien
    // escriba la anotación de una forma que no exime, se quede tranquilo, y se
    // entere en el rojo de CI sin saber por qué.
    expect(FIXTURE_RESULT.unanchoredTags.map((tag) => tag.file)).toEqual([
      "exenciones.ts",
      "exenciones.ts",
    ]);
  });

  it("el fixture tiene exactamente 8 violaciones y 4 accesos eximidos", () => {
    expect(resumir(FIXTURE_RESULT.violations)).toEqual([
      "accesos.ts bookings query-builder viola",
      "accesos.ts bookings sql-template viola",
      // Las cuatro que el motor no veía hasta el plan 09: alias de variable
      // local, `alias()` en variable y las dos del join sin filtro.
      "accesos.ts attendance query-builder viola",
      "accesos.ts subscriptions query-builder viola",
      "accesos.ts member_profiles query-builder viola",
      "accesos.ts bookings query-builder viola",
      "exenciones.ts users query-builder viola",
      "exenciones.ts attendance query-builder viola",
    ]);
    expect(FIXTURE_RESULT.exemptions).toHaveLength(4);
  });

  it("el mapa de schema resuelve las declaraciones de mysqlTable y no la tabla fantasma del JSDoc", () => {
    // Regresión permanente del chequeo que el Task 1 hizo en línea. Las tres
    // aserciones son las tres formas en que este mapa puede fallar:
    expect(
      SCHEMA_MAP.size,
      "hay 92 llamadas a mysqlTable en src/db/schema (91 declaraciones + 1 dentro de un JSDoc). " +
        "Un mapa chico significa que el motor dejó de reconocer alguna forma de declaración, " +
        "y los accesos a esas tablas pasarían INVISIBLES (T-170-04).",
    ).toBeGreaterThanOrEqual(85);

    expect(
      SCHEMA_MAP.get("tvPairings"),
      "el mapa traduce el identificador camelCase a la tabla física snake_case",
    ).toBe("tv_pairings");

    expect(
      SCHEMA_MAP.has("foo"),
      "`foo` vive dentro del JSDoc de src/db/schema/tenant-column.ts: un regex de una línea " +
        "la levanta como si fuera una tabla, el AST no. Si aparece acá, el motor volvió a ser un grep.",
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("lint-tenant — anclaje de exenciones contra los archivos reales", () => {
  const API = "el-templo-api";

  const ACEPTADOS = [
    `${API}/src/db/seed.ts`,
    `${API}/src/jobs/notification-cron.ts`,
    `${API}/src/modules/tv/pairing.ts`,
    `${API}/src/modules/wellhub/service.ts`,
  ];

  /** Los 2 falsos positivos del grep crudo. Hallazgo 169-09. */
  const RECHAZADOS = [
    `${API}/src/db/schema/tv.ts`,
    `${API}/src/db/scripts/require-tenant.ts`,
  ];

  const archivosConExencion = new Set(
    REAL_RESULT.exemptionInventory.map((entry) => entry.file),
  );
  const archivosConProsa = new Set(
    REAL_RESULT.unanchoredTags.map((tag) => tag.file),
  );

  it("el pase completo cubre el repo entero, rápido, y no mira test/", () => {
    expect(
      REAL_RESULT.filesScanned,
      "el alcance de D-16 es src/ + scripts/ del API: son más de 350 archivos",
    ).toBeGreaterThan(350);

    expect(
      REAL_ELAPSED_MS,
      "el pase sintáctico tiene que seguir siendo barato: es un step de CI y un comando local",
    ).toBeLessThan(10_000);

    const deTests = REAL_RESULT.accesses.filter((access) =>
      access.file.startsWith(`${API}/test/`),
    );
    expect(
      deTests,
      "D-16 excluye test/ del alcance: 228 archivos de test escriben tablas gym-owned adrede " +
        "para armar fixtures, y meterlos haría la allowlist inicial irrevisable (Pitfall 9)",
    ).toEqual([]);
  });

  it.each(ACEPTADOS)("acepta la exención real de %s", (archivo) => {
    expect(
      archivosConExencion.has(archivo),
      `${archivo} tiene una exención escrita en origin/master (fase 169) y el matcher dejó de anclarla`,
    ).toBe(true);
  });

  it.each(RECHAZADOS)(
    "rechaza la mención en prosa de %s (hallazgo 169-09)",
    (archivo) => {
      expect(
        archivosConExencion.has(archivo),
        `${archivo} MENCIONA el tag pero no lo escribe como exención: acá se cita en prosa. ` +
          `Si el matcher lo acepta, volvió a ser un grep y cualquier comentario autoriza una ` +
          `escritura sin gimnasio (T-170-09). No relajes el matcher: son 2 condiciones necesarias, ` +
          `comentario de BLOQUE y tag pegado a la apertura.`,
      ).toBe(false);

      expect(
        archivosConProsa.has(archivo),
        `${archivo} tiene que aparecer en unanchoredTags: es la prueba de que el grep crudo SÍ lo ` +
          `habría autorizado (11 archivos contra 9 exenciones reales) y de que el lint lo ve y lo descarta`,
      ).toBe(true);
    },
  );

  it("ve los archivos que importan el schema EN PROFUNDIDAD (punto ciego del plan 08)", () => {
    // Hasta el plan 07, `isSchemaModule()` solo aceptaba el barrel, así que un
    // archivo que hiciera `import { users } from "../../db/schema/users"`
    // quedaba con SchemaBindings vacío y TODOS sus accesos INVISIBLES: no
    // aparecían como violación, no entraban a la allowlist, y un acceso nuevo
    // sin tenant_id ahí NO ponía el build en rojo. Lo destapó el inventario del
    // sentinel (170-INVENTORY.md): la lente de runtime veía 86 tablas con deuda
    // y la estática 78.
    //
    // Estos tres archivos importan SOLO en profundidad. Si alguno vuelve a
    // quedar en cero accesos, el punto ciego volvió.
    const soloProfundos = [
      `${API}/src/modules/auth/routes.ts`,
      `${API}/src/modules/onboarding/routes.ts`,
      `${API}/src/modules/shared/audit-log.ts`,
    ];

    for (const archivo of soloProfundos) {
      const accesos = REAL_RESULT.accesses.filter(
        (access) => access.file === archivo,
      );
      expect(
        accesos.length,
        `${archivo} importa el schema solo en profundidad (db/schema/<archivo>). Cero accesos acá ` +
          `significa que el lint volvió a ser ciego a esa forma de import y que el archivo entero ` +
          `quedó fuera del gate. El arreglo es isSchemaModule(), no bajar esta aserción.`,
      ).toBeGreaterThan(0);
    }

    // El número: la 170 lo dejó en 87 (todas las tablas gym-owned con deuda que
    // el sentinel ve en runtime). La fase 172 adoptó `finance` y PAGÓ la deuda
    // de sus 6 tablas —vengan del módulo o de analytics, reports, subscriptions,
    // members, coach o el backfill—, así que la lente ve 81. Bajar el piso acá
    // es legítimo SOLO porque la baja está contabilizada tabla por tabla: la
    // aserción de abajo verifica que las 6 que faltan son exactamente las
    // strict. Una baja sin esa contrapartida es el punto ciego volviendo, y el
    // arreglo sigue siendo isSchemaModule(), no este número.
    const tablasConDeuda = new Set(REAL_RESULT.violations.map((v) => v.table));

    expect(
      [...strictTablesSet()].filter((tabla) => tablasConDeuda.has(tabla)).sort(),
      "una tabla de un módulo declarado migrado (TENANT_STRICT_MODULES) no puede seguir teniendo " +
        "accesos que violan: el sentinel hace THROW sobre ella en test/dev. Si esto se cae, la " +
        "adopción de ese módulo quedó a medias y el lint y el sentinel se están contradiciendo.",
    ).toEqual([]);

    expect(
      tablasConDeuda.size,
      "con el punto ciego cerrado la lente estática veía 87 tablas gym-owned con deuda; la fase " +
        "172 pagó la de las 6 de finance y quedan 81. Si este número baja SIN que la baja se " +
        "explique por tablas que entraron a TENANT_STRICT_MODULES, alguna forma de import volvió " +
        "a quedar afuera del lint.",
    ).toBeGreaterThanOrEqual(81);
  });

  it("ve los accesos escritos por ALIAS LOCAL de variable (punto ciego CR-01)", () => {
    // `src/modules/campaigns/service.ts` es la evidencia viva del punto ciego
    // que cerró el plan 09: `listEligible()` liga las tablas a variables
    // locales (`const u = schema.users; const br = schema.branches; …`) y
    // después las usa en `.from(u)`, en `.innerJoin(br, …)` y adentro de
    // interpolaciones `sql\`… FROM ${s} …\``. Ninguna de esas formas resolvía,
    // así que los cuatro accesos —todos SIN tenant_id— eran invisibles al
    // gate: no figuraban como violación, no entraron al baseline one-shot de
    // D-16 y un acceso nuevo escrito así NO ponía el build en rojo.
    //
    // `users` y `branches` son además las dos tablas ancla de la fase 166. Si
    // alguna de las cuatro desaparece de acá, el motor volvió a quedar ciego.
    // El arreglo es `bindings.locals` + los joins en TABLE_METHODS, nunca
    // bajar esta aserción.
    const archivo = `${API}/src/modules/campaigns/service.ts`;
    const tablas = new Set(
      REAL_RESULT.accesses
        .filter((access) => access.file === archivo)
        .map((access) => access.table),
    );

    for (const tabla of [
      "users",
      "subscriptions",
      "branches",
      "campaign_unsubscribes",
    ]) {
      expect(
        tablas.has(tabla),
        `${archivo} accede a ${tabla} por alias de variable local y sin nombrar el gimnasio. ` +
          `Que no aparezca significa que el motor volvió a ser ciego a esa forma (CR-01/WR-01) ` +
          `y que ese acceso quedó fuera del gate y del ratchet.`,
      ).toBe(true);
    }
  });

  it("no duplica la exención de notification-cron.ts (dedup por range.pos)", () => {
    // El MISMO comentario aparece como leading del ExpressionStatement y como
    // leading del CallExpression interno, porque los dos arrancan en el mismo
    // token (Pitfall 7). Sin dedup el inventario mostraría dos exenciones donde
    // hay una, y una exención de más es una autorización de más.
    const entradas = REAL_RESULT.exemptionInventory.filter(
      (entry) => entry.file === `${API}/src/jobs/notification-cron.ts`,
    );
    expect(entradas).toHaveLength(1);
  });

  it("toda exención del inventario tiene motivo escrito y alcance declarado", () => {
    const sinMotivo = REAL_RESULT.exemptionInventory.filter(
      (entry) => entry.motive.trim().length === 0,
    );
    expect(
      sinMotivo,
      "una exención sin motivo es indistinguible de un olvido (T-169-36): el motor no debe " +
        "poder producir una",
    ).toEqual([]);

    for (const entry of REAL_RESULT.exemptionInventory) {
      expect(["file", "site"]).toContain(entry.scope);
    }
  });

  it("el inventario cubre al menos las 9 exenciones que la fase 169 dejó escritas", () => {
    expect(
      REAL_RESULT.exemptionInventory.length,
      "el 169-09-SUMMARY inventarió 9 exenciones reales. Si este número baja, el matcher dejó de " +
        "anclar alguna y ese sitio pasó a contar como violación nueva en el ratchet del plan 05.",
    ).toBeGreaterThanOrEqual(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/** La allowlist real del repo. Se LEE; ningún test de acá la escribe. */
const ALLOWLIST_REAL = path.join(API_DIR, "tenant-lint-allowlist.json");

/** Contenido al cargar el módulo, para probar al final que nadie la tocó. */
const ALLOWLIST_REAL_ANTES = fs.readFileSync(ALLOWLIST_REAL, "utf8");

function allowlistEnMemoria(entries: AllowlistEntry[]): Allowlist {
  return {
    scope: "fixtures del test — nunca se escribe a disco",
    generated: "en memoria",
    entries,
  };
}

/**
 * Corre los gates contra el fixture del plan 03 con una allowlist en memoria.
 * Ni toca `git` ni toca el archivo real: los cuatro gates son lógica pura sobre
 * el resultado del motor, y por eso se pueden congelar sin infraestructura.
 */
function lintFixture(
  entries: AllowlistEntry[],
  extra: Partial<LintTenantOptions> = {},
): TenantLintReport {
  return lintTenant({
    rootDir: FIXTURES_DIR,
    scopeDirs: ["."],
    schemaMap: SCHEMA_MAP,
    allowlist: allowlistEnMemoria(entries),
    ...extra,
  });
}

/**
 * Las 6 entradas que cubren exactamente las 8 violaciones del fixture.
 *
 * `exenciones.ts users` va ÚLTIMA a propósito: el test de `gainedEntries` usa
 * esta lista sin su último elemento como base, y así el mensaje del gate sigue
 * nombrando la misma entrada de siempre.
 */
const COBERTURA_COMPLETA: AllowlistEntry[] = [
  { file: "accesos.ts", table: "bookings" },
  { file: "accesos.ts", table: "attendance" },
  { file: "accesos.ts", table: "subscriptions" },
  { file: "accesos.ts", table: "member_profiles" },
  { file: "exenciones.ts", table: "attendance" },
  { file: "exenciones.ts", table: "users" },
];

describe("lint-tenant — los cuatro gates del ratchet", () => {
  it("una violación que NO está en la allowlist es discrepancia (D-13)", () => {
    const report = lintFixture([]);

    expect(
      report.unlistedViolations.map(
        (access) => `${access.file} ${access.table}`,
      ),
      "las 8 violaciones del fixture no están toleradas por nadie: tienen que salir todas",
    ).toEqual([
      "accesos.ts bookings",
      "accesos.ts bookings",
      "accesos.ts attendance",
      "accesos.ts subscriptions",
      "accesos.ts member_profiles",
      "accesos.ts bookings",
      "exenciones.ts users",
      "exenciones.ts attendance",
    ]);
    expect(report.discrepancies).toBe(8);
  });

  it("la MISMA violación CON su entrada en la allowlist deja el reporte limpio", () => {
    const report = lintFixture(COBERTURA_COMPLETA);

    expect(report.unlistedViolations).toEqual([]);
    expect(
      report.discrepancies,
      "tolerar deuda que ya estaba es exactamente para lo que existe la allowlist: 6 entradas " +
        "cubren las 8 violaciones porque la clave es (archivo, tabla) y no la línea (D-13)",
    ).toBe(0);
    expect(report.allowlistSize).toBe(6);
  });

  it("una entrada cuyo archivo ya no existe cae en staleMissingFile, y el reporte manda ACTUALIZAR LA RUTA (D-14)", () => {
    const report = lintFixture([
      ...COBERTURA_COMPLETA,
      { file: "se-renombro.ts", table: "bookings" },
    ]);

    expect(report.staleMissingFile).toEqual([
      { file: "se-renombro.ts", table: "bookings" },
    ]);
    expect(report.staleNoLongerViolating).toEqual([]);
    expect(report.discrepancies).toBe(1);

    const texto = formatReport(report);
    expect(
      texto,
      "los dos tipos de stale tienen mensajes DISTINTOS a propósito: acá el archivo se movió y " +
        "la entrada hay que reapuntarla, no borrarla (Open Question 4 del RESEARCH)",
    ).toContain("ACTUALIZA LA RUTA");
    expect(texto).toContain("se-renombro.ts — bookings");
  });

  it("una entrada cuyo archivo ya NO viola cae en staleNoLongerViolating, y el reporte manda BORRARLA (D-14)", () => {
    // `accesos.ts` accede a `users` con `tenantValues`: cumple, así que esa
    // entrada ya no tolera nada. Es el gate que FUERZA el achique al migrar.
    const report = lintFixture([
      ...COBERTURA_COMPLETA,
      { file: "accesos.ts", table: "users" },
    ]);

    expect(report.staleNoLongerViolating).toEqual([
      { file: "accesos.ts", table: "users" },
    ]);
    expect(report.staleMissingFile).toEqual([]);
    expect(report.discrepancies).toBe(1);

    const texto = formatReport(report);
    expect(
      texto,
      "acá la deuda se PAGÓ: el mensaje tiene que mandar a borrar la entrada, no a reapuntarla. " +
        "Si los dos stale dijeran lo mismo, el gate se esquiva reapuntando rutas para siempre",
    ).toContain("BORRA LA ENTRADA");
  });

  it("una tabla de la lista strict con entradas vivas es discrepancia (D-15), con la lista inyectada por parámetro", () => {
    const report = lintFixture(COBERTURA_COMPLETA, {
      strictTables: new Set(["bookings"]),
    });

    expect(report.strictWithAllowlist).toEqual([
      { file: "accesos.ts", table: "bookings" },
    ]);
    expect(report.discrepancies).toBe(1);
    expect(formatReport(report)).toContain("VACIA las entradas de esa tabla");

    // El test inyecta la lista strict por parámetro (D-07) y NO la lee del
    // registro real. Desde la fase 172 el registro dejó de estar vacío
    // (`finance`), así que "size === 0" ya no sirve para probar la inyección:
    // lo que la prueba es que `bookings` —la tabla del fixture— NO está en la
    // lista real. Si algún día bookings entrara a un módulo migrado, este
    // fixture pasaría a coincidir con la realidad por casualidad y el `it`
    // dejaría de distinguir la lista inyectada de la del registro: ahí hay que
    // cambiar la tabla del fixture, no bajar la aserción.
    expect(
      strictTablesSet().has("bookings"),
      "el fixture inyecta strictTables = {bookings} para probar que el parámetro MANDA sobre el " +
        "registro real (D-07). Si bookings pasó a ser strict de verdad, el fixture dejó de probar " +
        "eso: elegí otra tabla todavía no migrada",
    ).toBe(false);
  });

  it("una entrada que la base NO tenía cae en gainedEntries (D-14)", () => {
    const base = allowlistEnMemoria(COBERTURA_COMPLETA.slice(0, -1));
    const report = lintFixture(COBERTURA_COMPLETA, { baseAllowlist: base });

    expect(report.gainedEntries).toEqual([
      { file: "exenciones.ts", table: "users" },
    ]);
    expect(report.discrepancies).toBe(1);
    expect(formatReport(report)).toContain("la allowlist CRECIO");
  });

  it("borrar una entrada respecto de la base NUNCA es discrepancia: achicar siempre es legal", () => {
    const base = allowlistEnMemoria([
      ...COBERTURA_COMPLETA,
      { file: "exenciones.ts", table: "bookings" },
    ]);
    const report = lintFixture(COBERTURA_COMPLETA, { baseAllowlist: base });

    expect(report.gainedEntries).toEqual([]);
    expect(
      report.discrepancies,
      "el ratchet compara en UNA sola dirección: la lista que se achica es el objetivo del gate, " +
        "no una anomalía. Si esto se pusiera rojo, migrar un módulo dejaría el build en rojo",
    ).toBe(0);
    expect(report.warnings.join("\n")).toContain("ACHICO 1 entrada");
  });

  it("sin baseAllowlist el gate de entradas ganadas no corre, y el reporte lo DICE", () => {
    const report = lintFixture(COBERTURA_COMPLETA);

    expect(report.gainedEntries).toEqual([]);
    expect(
      report.warnings.join("\n"),
      "un gate que no corrió y no avisa es indistinguible de un gate que pasó (T-170-04)",
    ).toContain("El gate de entradas ganadas (D-14) NO corrio");
  });

  it("las exenciones salen en el inventario, NO suman discrepancias, y las de archivo van marcadas (D-12)", () => {
    const report = lintFixture(COBERTURA_COMPLETA);

    expect(
      report.exemptions,
      "el fixture tiene 4 accesos cubiertos por una exención escrita",
    ).toHaveLength(4);
    expect(report.exemptionInventory).toHaveLength(3);
    expect(
      report.discrepancies,
      "una exención con motivo NO es deuda tolerada: es una decisión escrita. Si sumara, el autor " +
        "tendría que elegir entre explicar el motivo o dejar el build verde",
    ).toBe(0);

    const texto = formatReport(report);
    expect(
      texto,
      "la exención de archivo cubre código que TODAVÍA NO SE ESCRIBIÓ (T-170-06): tiene que verse " +
        "distinta de la de sitio o nadie la relee cuando el archivo crece",
    ).toContain("[ARCHIVO ENTERO] exento-por-archivo.ts");
    expect(texto).toContain("cubre 2 acceso(s)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("lint-tenant — contrato de exit codes 0/1/2 (D-09)", () => {
  /**
   * Un árbol con la forma que el lint espera y SIN una sola violación: solo el
   * schema copiado (declaraciones de tablas, cero accesos) y el `scripts/`
   * vacío que el alcance de D-16 exige que exista.
   */
  let arbolLimpio: string;
  /**
   * Una allowlist VACÍA de verdad, en el árbol temporal y en el lugar exacto
   * donde el lint la busca por default.
   *
   * Desde el plan 07 la allowlist real trae el baseline de la deuda existente
   * (cientos de entradas), así que ya no sirve para el caso "árbol limpio +
   * lista vacía": contra un árbol que no tiene esos archivos, cada entrada sale
   * como `staleMissingFile` y el resultado sería 1 por el motivo equivocado.
   */
  let allowlistVacia: string;

  beforeAll(() => {
    arbolLimpio = fs.mkdtempSync(path.join(os.tmpdir(), "lint-tenant-"));
    fs.mkdirSync(path.join(arbolLimpio, "el-templo-api/src/db"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(arbolLimpio, "el-templo-api/scripts"), {
      recursive: true,
    });
    fs.cpSync(
      path.join(API_DIR, "src/db/schema"),
      path.join(arbolLimpio, "el-templo-api/src/db/schema"),
      { recursive: true },
    );
    allowlistVacia = path.join(
      arbolLimpio,
      "el-templo-api/tenant-lint-allowlist.json",
    );
    fs.writeFileSync(
      allowlistVacia,
      JSON.stringify(
        { scope: "arbol temporal del test", generated: "test", entries: [] },
        null,
        2,
      ),
      "utf8",
    );
  });

  afterAll(() => {
    fs.rmSync(arbolLimpio, { recursive: true, force: true });
  });

  it("un flag desconocido sale 2 — jamás se ignora en silencio", async () => {
    const { code, output } = await runLint(["--flag-inventado"]);

    expect(
      code,
      "un flag mal escrito que se ignorara dejaría el gate apagado sin que nadie se entere: " +
        "`--bases=sha` correría sin ratchet y en verde",
    ).toBe(2);
    expect(output).toContain("Flag desconocido");
  });

  it("una allowlist que no parsea sale 2, nunca 'asumo la lista vacía'", async () => {
    const { code, output } = await runLint([
      `--root=${REPO_ROOT}`,
      `--allowlist=${path.join(FIXTURES_DIR, "accesos.ts")}`,
    ]);

    expect(code).toBe(2);
    expect(
      output,
      "asumir vacía sobre un archivo corrupto convierte TODA la deuda tolerada en violaciones " +
        "nuevas, o —peor, si el default fuera al revés— pone en verde un repo que nadie miró",
    ).toContain("no es JSON valido");
  });

  it("una allowlist que no existe sale 2", async () => {
    const { code, output } = await runLint([
      `--root=${REPO_ROOT}`,
      `--allowlist=${path.join(REPO_ROOT, "no-existe-esta-allowlist.json")}`,
    ]);

    expect(code).toBe(2);
    expect(output).toContain("No existe la allowlist");
  });

  it("una ref de --base irresoluble sale 2 y el mensaje nombra fetch-depth: 0", async () => {
    const { code, output } = await runLint([
      `--root=${REPO_ROOT}`,
      `--allowlist=${ALLOWLIST_REAL}`,
      "--base=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    ]);

    expect(
      code,
      "ÉSTE es el test que sostiene todo el ratchet (T-170-04): si la resolución de la base " +
        "devolviera 'sin cambios' en vez de fallar, un clone shallow dejaría el gate decorativo y " +
        "TODO PR pasaría en verde sin que nadie lo notara jamás",
    ).toBe(2);
    expect(
      output,
      "el mensaje tiene que nombrar la solución concreta, no solo el síntoma: el 90 % de las veces " +
        "esto es el `fetch-depth: 1` que trae por default el checkout de GitHub Actions",
    ).toContain("fetch-depth: 0");
  });

  it("un árbol sin violaciones y con la allowlist vacía sale 0", async () => {
    // Sin `--allowlist`: se resuelve por default a `<root>/el-templo-api/
    // tenant-lint-allowlist.json`, que es el camino que corre en CI.
    const { code, output } = await runLint([`--root=${arbolLimpio}`]);

    expect(code).toBe(0);
    expect(output).toContain("DISCREPANCIAS: 0");
    expect(output).toContain("Entradas de la allowlist:       0");
  });

  it("el repo real con una allowlist VACÍA sale 1 — el motor sigue viendo la deuda", async () => {
    const { code, output } = await runLint([
      `--root=${REPO_ROOT}`,
      `--allowlist=${allowlistVacia}`,
    ]);

    expect(
      code,
      "con la lista vacía, las ~1.600 violaciones reales del repo están sin tolerar y el lint " +
        "sale 1. Si esto diera 0, el motor dejó de ver el repo — y el verde del test de abajo " +
        "sería el verde de un lint ciego, no el de una deuda inventariada",
    ).toBe(1);
    expect(output).toContain(
      "Violaciones NO listadas en la allowlist (unlistedViolations):",
    );
  });

  it("el repo real con el baseline del plan 07 sale 0", async () => {
    const { code, output } = await runLint([
      `--root=${REPO_ROOT}`,
      `--allowlist=${ALLOWLIST_REAL}`,
    ]);

    expect(
      code,
      "el baseline one-shot (D-16) tolera EXACTAMENTE la deuda que existía al cerrarse la fase " +
        "170. Este `it` es el que se pone rojo el día que alguien agrega un acceso sin tenant_id " +
        "y no lo migra ni lo exime — y también el día que borra una entrada sin pagar la deuda",
    ).toBe(0);
    expect(output).toContain("DISCREPANCIAS: 0");
    expect(
      output,
      "una allowlist de tamaño 0 acá significaría que el baseline se perdió",
    ).not.toContain("Entradas de la allowlist:       0");
  });

  it("ningún test de esta batería escribió sobre la allowlist real", () => {
    expect(
      fs.readFileSync(ALLOWLIST_REAL, "utf8"),
      "un test que reescriba tenant-lint-allowlist.json convertiría al gate en su propio " +
        "regenerador, que es exactamente la puerta trasera que D-16 prohíbe",
    ).toBe(ALLOWLIST_REAL_ANTES);
  });
});
