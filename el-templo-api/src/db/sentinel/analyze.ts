/**
 * CON-05 (fase 170) — Corazón del sentinel de pool: la decisión de qué es una
 * violación de tenancy, separada del mecanismo que la intercepta.
 *
 * Este archivo es una función PURA: recibe el texto de un statement SQL y
 * devuelve un veredicto. Sin I/O, sin pool, sin Fastify, sin Drizzle. El plan 03
 * monta el wrap del pool encima de `analyzeSql`; acá vive únicamente la
 * clasificación, que es lo que se puede probar sin levantar MySQL (mismo idioma
 * que `src/db/scripts/require-tenant.ts` y su `TenantQueryFn` inyectable).
 *
 * QUÉ CLASIFICA
 * -------------
 * Cuatro etapas, EN ESTE ORDEN (el orden es parte de la mitigación, ver abajo):
 *
 *   1. **`skip` de no-DML e introspección.** Control de transacción (`begin`,
 *      `commit`, `rollback`, `savepoint`, `release savepoint`, `rollback to`,
 *      `start transaction`), `SET …`, `SHOW …`, `select database()` y cualquier
 *      statement que mencione `information_schema`. Drizzle emite el control de
 *      transacción POR EL MISMO CANAL que las queries (`conn.query("begin")`),
 *      así que sin esta etapa el sentinel marcaría como violación caminos
 *      legítimos y en modo throw reventaría toda transacción (T-170-04). Va
 *      primera también por costo: corta antes de las regex de extracción
 *      (T-170-03, esta función corre en el hot path de TODA query).
 *   2. **`exempt` por anotación en el SQL.** Un comentario de bloque cuyo texto
 *      arranca con `tenant-safe: <motivo>`, con motivo NO vacío, exime al
 *      statement. Ver "LOS DOS CANALES DE EXENCIÓN". (El tag completo, con sus
 *      delimitadores, no se puede escribir dentro de este docblock: un
 *      comentario de bloque no se puede anidar — hallazgo 169-07.)
 *   3. **Extracción de tablas.** Los identificadores que siguen a
 *      `from` / `join` / `into` / `update`, filtrados contra el set gym-owned.
 *      Si no queda ninguna → `skip`: el statement no toca datos de gimnasio.
 *   4. **Presencia de `tenant_id` en la zona de predicado.** Con el literal
 *      presente → `ok`; sin él → `violation` con las tablas encontradas.
 *
 * LOS DOS CANALES DE EXENCIÓN (D-17)
 * ----------------------------------
 * El canal del **sentinel** es el SQL (lo que ve el pool); el canal del **lint**
 * es el FUENTE (comentario de bloque anclado al call site por AST, plan 05). Son
 * dos canales distintos por decisión explícita de la fase: no se fuerza a que la
 * anotación viaje embebida en el SQL. Consecuencia aceptada y esperada: **las 9
 * exenciones `tenant-safe:` que dejó escritas la fase 169 NO viajan en el SQL**
 * (6 son file-level y 3 son comentarios TS), así que van a aparecer como
 * violaciones no-strict en el inventario del sentinel. Eso es CORRECTO: son
 * deuda real, y hoy ninguna tabla es strict (`TENANT_STRICT_MODULES` arranca
 * vacío), con lo cual esas violaciones no hacen throw de nada.
 *
 * POR QUÉ NO USA UN PARSER SQL DE VERDAD
 * --------------------------------------
 * Porque instalar una dependencia nueva está prohibido en este repo sin
 * preguntar (T-170-SC), y porque el diseño cerrado del doc 03 §3 pide
 * explícitamente que el sentinel "parsee trivialmente" y asuma
 * **presencia ≠ corrección**. Un parser SQL completo daría un árbol que igual no
 * sabría si el `tenant_id` del `where` es el correcto: la corrección se prueba en
 * la capa 5 (fixtures 2-tenant, fase 171+), no acá.
 *
 * LA LIMITACIÓN, ESCRITA
 * ----------------------
 * **Chequea PRESENCIA del literal `tenant_id` en la zona de predicado, no que el
 * filtro sea correcto.** `where tenant_id = 1` hardcodeado pasa como `ok`. Esto
 * es un tripwire contra el OLVIDO, que es el modo de falla real y frecuente; no
 * es una prueba de aislamiento. Quien venga a "arreglar" esto: no es un bug, es
 * el alcance acordado.
 *
 * POR QUÉ ES SEGURO LOGUEAR LO QUE ESTA FUNCIÓN DEVUELVE (T-170-02)
 * -----------------------------------------------------------------
 * El texto que ve el pool YA viene con los valores reemplazados por placeholders
 * `?` (verificado ejecutando `.toSQL()` de Drizzle 0.45.1): no hay datos de socio
 * en el string. Por eso `fingerprint()` no redacta nada — no hay nada que
 * redactar. Además esta función NUNCA recibe ni devuelve el array de `params`:
 * el llamador no debe pasárselo, y el veredicto no puede filtrarlo porque nunca
 * lo tuvo (D-01).
 *
 * QUÉ HACER CUANDO ESTO SE CAIGA
 * ------------------------------
 * - **Falso positivo** (algo legítimo queda como `violation`): mirar primero si
 *   es una forma de no-DML que falta en `NON_DML`. Agregarla ahí + un `it`
 *   propio en `test/unit/sentinel-analyze.test.ts`. NO desactivar el sentinel.
 * - **Falso negativo** (una query sin tenant queda en `ok`): casi seguro es la
 *   proyección — verificar que el recorte del paso 4 siga en pie; hay un `it`
 *   dedicado que se pone rojo si alguien lo saca.
 * - **Una tabla nueva no se detecta:** no se toca este archivo. La lista sale de
 *   `../tenant-tables` y su gate fail-closed vive en `test/db/tenant-tables.test.ts`.
 */

import { GYM_OWNED_TABLES } from "../tenant-tables";

/**
 * Los cuatro veredictos posibles:
 * - `ok` — toca tablas gym-owned y el predicado menciona `tenant_id`.
 * - `skip` — no hay nada que juzgar (no-DML, introspección, o ninguna tabla
 *   gym-owned involucrada).
 * - `exempt` — anotado `tenant-safe:` en el propio SQL, con motivo.
 * - `violation` — toca tablas gym-owned SIN `tenant_id` en el predicado.
 */
export type SentinelVerdictKind = "ok" | "skip" | "exempt" | "violation";

export interface SentinelVerdict {
  kind: SentinelVerdictKind;
  /** Prosa corta que explica el veredicto. Va al log y al inventario (D-08). */
  reason: string;
  /** Tablas gym-owned referenciadas. Vacío cuando `kind === "skip"`. */
  tables: string[];
}

/**
 * Statements que NO son DML y por lo tanto no pueden violar nada. Anclada al
 * inicio (`^\s*`) a propósito: `set` o `show` en el medio de una query real no
 * la convierten en control de transacción.
 */
const NON_DML =
  /^\s*(?:begin|commit|rollback|savepoint|release\s+savepoint|rollback\s+to|start\s+transaction|set\b|show\b|select\s+database\(\))/i;

/** Introspección del catálogo: nunca toca filas de negocio. */
const INFORMATION_SCHEMA = /\binformation_schema\b/i;

/**
 * Apertura de la anotación de exención. Deliberadamente NO captura el motivo con
 * un cuantificador: el motivo se recorta buscando el cierre del comentario con
 * `indexOf` (ver {@link exemptionMotive}) para no meter cuantificadores anidados
 * en el hot path (T-170-03) y para poder rechazar el motivo vacío sin
 * ambigüedad — una anotación sin motivo termina en el `*` del cierre, que es
 * `\S`, así que un `\S` pelado después de los dos puntos la daría por válida.
 */
const EXEMPT_TAG = /\/\*\s{0,40}tenant-safe:/i;

/**
 * Identificador que sigue a `from` / `join` / `into` / `update`, con o sin
 * backticks. Cuantificadores planos únicamente (T-170-03).
 */
const TABLE_REF = /\b(?:from|join|into|update)\s+`?([a-z_][a-z0-9_]*)`?/gi;

/** El literal que el sentinel busca en la zona de predicado. */
const TENANT_ID = /\btenant_id\b/i;

/** `select` al inicio: dispara el recorte de proyección del paso 4. */
const STARTS_WITH_SELECT = /^\s*select\b/i;

/** Primer `from` del statement: donde arranca la zona de predicado. */
const FROM_KEYWORD = /\bfrom\b/i;

/**
 * Set gym-owned por defecto. Sale de `GYM_OWNED_TABLES` (87 tablas, fuente
 * canónica con gates fail-closed en `test/db/tenant-tables.test.ts`) y NO se
 * duplica acá: un vigilante con su propia copia de la lista se desincroniza en
 * la primera tabla nueva y falla en silencio.
 *
 * Se materializa como `ReadonlySet` —y no se usa el predicado `isGymOwnedTable`—
 * porque el parámetro `gymOwned` de {@link analyzeSql} tiene que ser inyectable
 * (D-07) y un `Set` es lo que el test puede construir a mano.
 */
const DEFAULT_GYM_OWNED: ReadonlySet<string> = new Set(GYM_OWNED_TABLES);

function verdict(
  kind: SentinelVerdictKind,
  reason: string,
  tables: string[] = [],
): SentinelVerdict {
  return { kind, reason, tables };
}

/**
 * Devuelve el motivo de la anotación `tenant-safe:` presente en `sql`, o
 * `undefined` si no hay anotación o si el motivo está vacío.
 *
 * El motivo es OBLIGATORIO (mismo contrato que la fase 169, T-169-36): una
 * anotación pelada es indistinguible de un olvido, así que no exime.
 */
function exemptionMotive(sql: string): string | undefined {
  const match = EXEMPT_TAG.exec(sql);
  if (match === null) return undefined;

  const desde = match.index + match[0].length;
  const cierre = sql.indexOf("*/", desde);
  const motivo = (cierre === -1 ? sql.slice(desde) : sql.slice(desde, cierre))
    .trim()
    .replace(/\s+/g, " ");

  return motivo.length > 0 ? motivo : undefined;
}

/**
 * Clasifica un statement SQL. Función pura: no abre conexiones, no muta nada y
 * no depende de `NODE_ENV`. La severidad (throw vs log) la decide el instalador
 * del sentinel (plan 04) a partir de este veredicto y de la lista strict.
 *
 * @param sql texto del statement tal cual lo recibe el pool (con placeholders `?`).
 * @param gymOwned set de tablas gym-owned; por defecto, las 87 de
 *   `GYM_OWNED_TABLES`. Inyectable para los tests y para D-07.
 */
export function analyzeSql(
  sql: string,
  gymOwned: ReadonlySet<string> = DEFAULT_GYM_OWNED,
): SentinelVerdict {
  const texto = sql.trim();

  // ── Etapa 1: no-DML e introspección (T-170-04, y corta antes de las regex caras)
  if (NON_DML.test(texto)) {
    return verdict("skip", "control de transacción / no-DML");
  }
  if (INFORMATION_SCHEMA.test(texto)) {
    return verdict("skip", "introspección del catálogo");
  }

  // ── Etapa 2: exención anotada EN EL SQL (canal del sentinel, D-17)
  const motivo = exemptionMotive(texto);
  if (motivo !== undefined) {
    return verdict("exempt", `anotado en el SQL: ${motivo}`);
  }

  // ── Etapa 3: tablas gym-owned referenciadas
  const tables = new Set<string>();
  TABLE_REF.lastIndex = 0;
  for (
    let match = TABLE_REF.exec(texto);
    match !== null;
    match = TABLE_REF.exec(texto)
  ) {
    const nombre = match[1].toLowerCase();
    if (gymOwned.has(nombre)) tables.add(nombre);
  }
  if (tables.size === 0) {
    return verdict("skip", "ninguna tabla gym-owned");
  }

  // ── Etapa 4: presencia de `tenant_id` en la ZONA DE PREDICADO
  //
  // ⚠ RECORTE DE LA PROYECCIÓN — la mitigación de T-170-01, el peor falso
  // negativo posible. Drizzle expande `db.select().from(tabla)` a TODAS las
  // columnas de la tabla, `tenant_id` incluida: el scan completo sin `where`
  // —o sea, la fuga más grave— llega al pool como
  // `select \`id\`, \`tenant_id\`, \`first_name\` from \`users\``. Buscar el
  // literal en el string COMPLETO devolvería "cumple" para esa query. Por eso,
  // en un SELECT, todo lo anterior al primer `from` se descarta antes de buscar.
  let predicado = texto;
  if (STARTS_WITH_SELECT.test(texto)) {
    const iFrom = texto.search(FROM_KEYWORD);
    predicado = iFrom === -1 ? "" : texto.slice(iFrom);
  }

  const involucradas = [...tables];
  return TENANT_ID.test(predicado)
    ? verdict("ok", "menciona tenant_id en el predicado", involucradas)
    : verdict(
        "violation",
        `sin tenant_id sobre ${involucradas.join(", ")}`,
        involucradas,
      );
}

/**
 * Identidad estable de un statement, para deduplicar en prod/staging (D-01) y
 * agrupar el inventario (D-08).
 *
 * Colapsa todo run de whitespace a un espacio simple y recorta las puntas, así
 * que dos ejecuciones del mismo statement con distinto formateo comparten
 * fingerprint. **No redacta nada y no hace falta:** el texto ya viene con
 * placeholders `?` en lugar de los valores (T-170-02).
 */
export function fingerprint(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}
