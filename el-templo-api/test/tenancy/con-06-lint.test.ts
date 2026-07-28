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
 * Los dos `describe` **NO tocan la base de datos**: leen archivos y los
 * parsean. Corren igual bajo el `setupFiles` del repo, que provisiona MySQL por
 * worker para TODO archivo de test (~96 s de overhead conocida, hallazgo
 * 169-07). Esa overhead es justamente lo que D-09 evita al hacer del lint un
 * script standalone de CI y no un gate de Vitest.
 */

import path from "path";
import { describe, it, expect } from "vitest";

import {
  buildSchemaTableMap,
  lintTenantSources,
  type LintSourceResult,
  type TenantAccess,
} from "../../src/db/scripts/lint-tenant";

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

  it("clasifica las cinco formas de acceso de accesos.ts", () => {
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

  it("el fixture tiene exactamente 4 violaciones y 4 accesos eximidos", () => {
    expect(resumir(FIXTURE_RESULT.violations)).toEqual([
      "accesos.ts bookings query-builder viola",
      "accesos.ts bookings sql-template viola",
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
