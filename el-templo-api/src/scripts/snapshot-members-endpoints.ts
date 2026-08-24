/**
 * snapshot-members-endpoints.ts -- A DEMANDA
 *
 * POR QUÉ EXISTE (D-10 de la fase 173)
 * ------------------------------------
 * El criterio 4 de la fase 173 es "el staff ve los mismos números" después de
 * migrar `members` (y `users`) al patrón de tenancy. Sin una foto tomada ANTES
 * del primer commit de migración, la comparación de después no existe: nadie se
 * acuerda de memoria cuántos alumnos activos listaba el filtro de Barcelona, y
 * "se ve parecido" no es evidencia.
 *
 * Copia de `snapshot-finance-endpoints.ts` (fase 172, D-12) con la constante
 * `ENDPOINTS` cambiada por la del módulo de socios, más dos capacidades que
 * finance no necesitaba: leer `.xlsx` y paginar sobres cuya clave de filas no
 * se llama `rows`.
 *
 * LAS TRES LECCIONES QUE EL SCRIPT ORIGINAL APRENDIÓ A LA MALA
 * -----------------------------------------------------------
 * (a) MANDAR UN PARÁMETRO QUE EL SCHEMA NO DECLARA **NO DA 400**. Fastify
 *     compila ajv con `removeAdditional: true`, así que la propiedad
 *     desconocida se **strippea en silencio** y el snapshot diría "filtrado por
 *     X" sobre una respuesta que en realidad trae todo. Por eso cada nombre de
 *     querystring de `ENDPOINTS` está verificado literal contra
 *     `src/modules/members/schemas.ts` (ver la tabla de abajo).
 * (b) PAGINAR HASTA AGOTAR `total`. La adopción cambia índices, y un cambio de
 *     índice cambia qué filas caen en la página 1 sin que ningún número se
 *     mueva. Guardar solo la primera página llenaría el diff de falsos
 *     positivos.
 * (c) EL ORDEN DE LAS LISTAS NO ES SEÑAL, a propósito. MySQL devuelve los
 *     empates al revés al cambiar de índice; un cambio de orden visible lo caza
 *     el UAT del staff (D-11), no este diff. `ordenarArray` impone un orden
 *     total propio antes de comparar.
 *
 * QUÉ NOMBRE TIENE CADA PARÁMETRO (lección (a), verificado uno por uno)
 * --------------------------------------------------------------------
 *   GET /api/admin/members              → listMembersSchema        (schemas.ts:174)
 *     search · branchId · debtorOnly · status · page · limit
 *   GET /api/admin/members/search       → searchMembersSchema      (schemas.ts:238)
 *     search (REQUERIDO, minLength 1) · limit (máx 50)
 *   GET /api/admin/members/check-duplicates → checkDuplicatesSchema (schemas.ts:656)
 *     dni · phone — `additionalProperties: false`, y el handler exige AL MENOS
 *     UNO (400 MISSING_QUERY si van los dos vacíos)
 *   GET /api/admin/members/export       → exportMembersSchema      (schemas.ts:706)
 *     search · branchId · status · includeGreekLevel
 *   GET /api/admin/members/export-sepa  → exportSepaMembersSchema  (schemas.ts:740)
 *     branchId · status (enum SOLO "activo" | "todos", más chico que el del
 *     listado: mandarle "prueba" sí da 400)
 *   GET /api/admin/members/branches     → sin schema de querystring
 *
 * POR QUÉ NO HAY RANGO DE FECHAS
 * ------------------------------
 * **Ningún endpoint del módulo de socios acepta rango de fechas** — verificado
 * contra `schemas.ts`: no hay `dateFrom`/`dateTo` ni ningún análogo en
 * `listMembersSchema`, `searchMembersSchema`, `exportMembersSchema`,
 * `exportSepaMembersSchema` ni `checkDuplicatesSchema`. Es la diferencia de
 * fondo con finance, que es un módulo de movimientos: el padrón de socios es un
 * corte al día de hoy.
 *
 * El `RANGO` literal se conserva igual, declarado y **deliberadamente NO
 * enviado a ningún endpoint**, por dos motivos: (1) viaja al header del
 * snapshot y `--diff` aborta si las dos capturas no lo comparten, así el
 * archivo sigue siendo autodescriptivo; (2) si mañana alguien agrega un
 * endpoint de socios con rango, tiene que usar ESTA constante y no
 * `new Date()` — un rango relativo movería la ventana entre el antes y el
 * después y el diff mostraría altas hechas en el medio, imposible de separar de
 * una regresión.
 *
 * POR QUÉ LOS PARÁMETROS SENSIBLES VAN POR ENV Y NO CABLEADOS
 * ----------------------------------------------------------
 * `check-duplicates` necesita un DNI y un teléfono REALES para devolver algo
 * distinto de `matches: []` (con un DNI inventado el endpoint contesta lo mismo
 * antes y después: cero señal). Un DNI real cableado en este archivo sería una
 * fuga de PII **permanente e irreversible en el historial de git**. Por eso
 * entran por env (`SNAPSHOT_DUP_DNI`, `SNAPSHOT_DUP_PHONE`) y del archivo de
 * salida solo sale su **huella sha256** (`parametrosHash`), nunca el valor: eso
 * alcanza para que `--diff` corte si las dos capturas usaron entradas
 * distintas, sin escribir el dato. `SNAPSHOT_BRANCH_ID` no es PII y viaja en
 * claro para que el archivo se pueda leer solo.
 *
 * POR QUÉ LOS DOS EXPORT SE GUARDAN COMO CONTENIDO Y NO COMO HASH
 * --------------------------------------------------------------
 * Los dos `/export` devuelven `.xlsx` binario. Guardar el binario o su hash
 * daría **diff siempre**: `routes.ts` hace `workbook.created = new Date()` y esa
 * metadata viaja adentro del zip. Se guardan las celdas, cada fila como objeto
 * con clave por **índice fijo de columna** (`c000`, `c001`, ...) para que la
 * normalización —que ordena arrays— no pueda reordenar las columnas, que sí son
 * señal. El orden de las FILAS sigue sin serlo (lección (c)).
 *
 * DÓNDE SE GUARDA LA SALIDA (T-173-03-01)
 * ---------------------------------------
 * En `$HOME/.el-templo-snapshots/173/`, FUERA del repo y fuera de `.planning/`.
 * El archivo tiene DNIs, nombres, teléfonos, emails, direcciones e IBANs de
 * socios reales: no se commitea nunca. El script lo escribe con permisos 0600.
 *
 * EL TOKEN (T-173-03-02)
 * ----------------------
 * `SNAPSHOT_TOKEN` entra por env en la línea de comandos del operador. No se
 * escribe en el archivo de salida ni se loguea — ni siquiera truncado.
 *
 * CÓDIGOS DE SALIDA (convención del repo, `verify-tenant-uniques.ts`)
 * ------------------------------------------------------------------
 *   0 = OK (captura completa y sin truncar / diff vacío)
 *   1 = corrió y falló (algún endpoint no dio 200, algún endpoint quedó
 *       truncado, red caída, o diff con diferencias)
 *   2 = error de USO (falta env, faltan argumentos, archivos incomparables)
 *
 * Usage (captura):
 *   SNAPSHOT_BASE_URL=https://api-staging.eltemplo.org \
 *   SNAPSHOT_TOKEN=<jwt de admin/owner> \
 *   SNAPSHOT_BRANCH_ID=<id de una sede real> \
 *   SNAPSHOT_DUP_DNI=<dni de un socio real> \
 *   SNAPSHOT_DUP_PHONE=<teléfono de un socio real> \
 *     pnpm exec tsx src/scripts/snapshot-members-endpoints.ts \
 *       --out=$HOME/.el-templo-snapshots/173/antes.json
 *
 * Usage (diff, NO requiere env: es comparación de archivos, no toca la red):
 *   pnpm exec tsx src/scripts/snapshot-members-endpoints.ts \
 *     --diff=$HOME/.el-templo-snapshots/173/antes.json /tmp/despues.json
 *
 * NO está cableado a ningún pipeline (ni a `package.json`, ni al runner de
 * migraciones, ni al deploy). Solo a demanda, y solo GETs.
 *
 * `console.*` está permitido acá: esto es tooling de línea de comandos, no el
 * runtime de Fastify (precedente `verify-tenant-uniques.ts`, `require-tenant.ts`).
 */

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Workbook } from "exceljs";

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rango fijo, cerrado y pasado. Ver el docblock: NINGÚN endpoint de socios lo
 * acepta hoy, así que NO se manda a ninguno — se conserva literal para el
 * header del snapshot y para que un endpoint futuro con rango lo use en vez de
 * `new Date()`. NO parametrizar.
 */
const RANGO = {
  dateFrom: "2026-01-01",
  dateTo: "2026-06-30",
} as const;

/**
 * Texto de búsqueda fijo. Una sola letra frecuente en castellano: barre casi
 * todo el padrón, así el filtro de texto ejercita el `LIKE` de verdad en vez de
 * devolver dos filas. Fijo por el mismo motivo que el rango: si cambia entre
 * las dos capturas, el diff mide otra cosa.
 */
const BUSQUEDA = "a";

/** Página máxima que el script pide antes de declarar la captura truncada. */
const MAX_PAGINAS = 200;

/**
 * Tamaño de página: el máximo que acepta `listMembersSchema`
 * (`limit: { maximum: 100 }`). Pedir 200 daría 400, no 100 filas.
 */
const LIMITE_POR_PAGINA = 100;

/** Máximo de `searchMembersSchema` (`limit: { maximum: 50 }`). */
const LIMITE_TYPEAHEAD = 50;

/** Timeout por request. Los dos `/export` sobre el padrón entero tardan. */
const TIMEOUT_MS = 180_000;

/** Ancho del índice de columna en las filas de xlsx (`c000`..`c999`). */
const ANCHO_INDICE_COLUMNA = 3;

interface EspecEndpoint {
  /** Solo GET: este script no escribe nada, ni en staging ni en prod. */
  readonly metodo: "GET";
  readonly path: string;
  /**
   * Etiqueta corta que desambigua entradas con el MISMO path. Seis de los
   * endpoints de acá son `/api/admin/members` con distinto filtro: sin esto se
   * pisarían entre sí en el mapa `endpoints` y el snapshot guardaría una sola.
   */
  readonly etiqueta: string;
  readonly query: Readonly<Record<string, string>>;
  /**
   * `true` cuando la respuesta es `{ [claveFilas], total, ... }` y hay que
   * recorrer las páginas. Sin esto, el snapshot guardaría solo las primeras 100
   * filas y un cambio de índice (que es EXACTAMENTE lo que hace esta fase)
   * podría cambiar qué filas caen en la página 1 → diff lleno de falsos
   * positivos.
   */
  readonly paginado: boolean;
  /**
   * Clave del array de filas dentro del sobre. En finance siempre era `rows`;
   * `/api/admin/members` devuelve `{ members, total, page, limit,
   * totalDebtByCurrency }`, así que acá es `members`. Cablear `rows` habría
   * hecho que el script se rindiera con la página 1 en silencio.
   */
  readonly claveFilas: string;
  /**
   * `xlsx` para los dos `/export`: la respuesta es binaria y se normaliza
   * leyendo celdas, no parseando JSON.
   */
  readonly formato: "json" | "xlsx";
}

/**
 * Parámetros que NO se pueden cablear: dependen del entorno (una sede real) o
 * son PII (un DNI, un teléfono). Ver el docblock.
 */
interface ParametrosOperador {
  readonly branchId: string;
  readonly dupDni: string;
  readonly dupPhone: string;
}

function armarEndpoints(
  parametros: ParametrosOperador,
): readonly EspecEndpoint[] {
  const paginacion = {
    page: "1",
    limit: String(LIMITE_POR_PAGINA),
  } as const;

  return [
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "sin-filtro",
      // `status` explícito: el default vive en el service y podría cambiar; el
      // snapshot no puede depender de un default para significar lo mismo.
      query: { status: "todos", ...paginacion },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "estado-activo",
      query: { status: "activo", ...paginacion },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "estado-prueba-leads",
      // Los "leads" son `users` con `status='prueba'`: NO existe un
      // `GET /api/admin/leads` (el único endpoint de ese prefijo es
      // `PATCH /api/admin/leads/:userId`, y este script no escribe). Este
      // filtro es la lectura equivalente y la que usa el staff.
      query: { status: "prueba", ...paginacion },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "por-sede",
      query: {
        status: "todos",
        branchId: parametros.branchId,
        ...paginacion,
      },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "deudores",
      // `debtorOnly` dispara el EXISTS correlacionado sobre deuda: es el filtro
      // con la query más pesada del listado y el que más se mueve si la
      // adopción toca un índice.
      query: { status: "todos", debtorOnly: "true", ...paginacion },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members",
      etiqueta: "busqueda-texto",
      query: { status: "todos", search: BUSQUEDA, ...paginacion },
      paginado: true,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members/search",
      etiqueta: "typeahead",
      // `search` es REQUERIDO acá (minLength 1) y la respuesta es
      // `{ members }` sin `total`: no pagina.
      query: { search: BUSQUEDA, limit: String(LIMITE_TYPEAHEAD) },
      paginado: false,
      claveFilas: "members",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members/branches",
      etiqueta: "selector-de-sedes",
      // El selector de sede que ve el staff. Sin querystring: el endpoint mira
      // `request.scope`. Entra al snapshot porque D-14 cambia `canAccessBranch`
      // de decidir por país a decidir por gimnasio, y esta es la lista que esa
      // decisión produce.
      query: {},
      paginado: false,
      claveFilas: "branches",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members/check-duplicates",
      etiqueta: "duplicados",
      // El handler exige al menos uno de los dos (400 MISSING_QUERY si no).
      query: { dni: parametros.dupDni, phone: parametros.dupPhone },
      paginado: false,
      claveFilas: "matches",
      formato: "json",
    },
    {
      metodo: "GET",
      path: "/api/admin/members/export",
      etiqueta: "xlsx-alumnos",
      // `includeGreekLevel` explícito por el mismo motivo que `status`: su
      // default es "ausente = true" y un default no puede significar el
      // snapshot.
      query: { status: "todos", includeGreekLevel: "true" },
      paginado: false,
      claveFilas: "rows",
      formato: "xlsx",
    },
    {
      metodo: "GET",
      path: "/api/admin/members/export-sepa",
      etiqueta: "xlsx-domiciliacion",
      // OJO: el enum de `status` acá es SOLO "activo" | "todos" (más chico que
      // el del listado). "todos" para capturar también a los socios sin cuota
      // vigente, que es donde el export marca las filas sin IBAN.
      query: { status: "todos" },
      paginado: false,
      claveFilas: "rows",
      formato: "xlsx",
    },
  ];
}

/**
 * Claves que se borran a CUALQUIER profundidad. La lista es corta a propósito:
 * cada nombre es inequívocamente metadato de respuesta y no puede ser un dato
 * de negocio. Borrar de más deja el diff ciego, que es peor que ruidoso.
 */
const CLAVES_VOLATILES_RECURSIVAS: readonly string[] = [
  "generatedAt",
  "generated_at",
  "requestId",
  "request_id",
  "serverTime",
  "exportedAt",
  "elapsedMs",
  "durationMs",
];

/**
 * `timestamp` se borra SOLO en la raíz del body: ahí es el sobre de la
 * respuesta, pero una fila de negocio podría tener legítimamente una columna
 * `timestamp` y borrarla escondería un cambio real.
 */
const CLAVES_VOLATILES_RAIZ: readonly string[] = ["timestamp"];

/**
 * Preferencia de clave para ordenar arrays de objetos. Ordenar por una clave
 * ESTABLE (y no por el objeto entero) mantiene alineadas las filas que
 * corresponden entre las dos capturas, así el diff señala el campo que cambió
 * y no un corrimiento de posiciones.
 */
const CLAVES_DE_ORDEN_PREFERIDAS: readonly string[] = [
  "id",
  "memberId",
  "userId",
  "branchId",
  "dni",
  "code",
  "key",
  "name",
  "currency",
  "fecha",
  "date",
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type ValorJson =
  | string
  | number
  | boolean
  | null
  | ValorJson[]
  | { [clave: string]: ValorJson };

interface EntradaSnapshot {
  status: number;
  /**
   * `true` si la paginación cortó ANTES de agotar `total`, por cualquiera de
   * los tres motivos: tope de `MAX_PAGINAS`, página sin la clave de filas como
   * array, o página vacía (IN-02 de la 172). Un snapshot con `truncado: true`
   * NO sirve como línea de base.
   */
  truncado: boolean;
  body: ValorJson;
}

interface Snapshot {
  capturadoEn: string;
  baseUrl: string;
  rango: { dateFrom: string; dateTo: string };
  busqueda: string;
  branchId: string;
  /** sha256 de los parámetros (incluidos los PII, que NO se escriben). */
  parametrosHash: string;
  endpoints: Record<string, EntradaSnapshot>;
}

/** Error de USO → exit 2. Cualquier otro error → exit 1. */
class ErrorDeUso extends Error {}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización
// ─────────────────────────────────────────────────────────────────────────────

function esObjeto(valor: ValorJson): valor is { [clave: string]: ValorJson } {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Serialización canónica: claves alfabéticas, indentación 2. */
function serializar(valor: ValorJson): string {
  return JSON.stringify(conClavesOrdenadas(valor), null, 2);
}

function conClavesOrdenadas(valor: ValorJson): ValorJson {
  if (Array.isArray(valor)) return valor.map(conClavesOrdenadas);
  if (!esObjeto(valor)) return valor;
  const salida: { [clave: string]: ValorJson } = {};
  for (const clave of Object.keys(valor).sort()) {
    salida[clave] = conClavesOrdenadas(valor[clave]);
  }
  return salida;
}

function claveDeOrden(elementos: ValorJson[]): string | null {
  const objetos = elementos.filter(esObjeto);
  if (objetos.length !== elementos.length || objetos.length === 0) return null;
  for (const candidata of CLAVES_DE_ORDEN_PREFERIDAS) {
    if (objetos.every((o) => candidata in o)) return candidata;
  }
  // Sin clave preferida: la primera clave presente en TODOS los elementos.
  for (const candidata of Object.keys(objetos[0]).sort()) {
    if (objetos.every((o) => candidata in o)) return candidata;
  }
  return null;
}

/**
 * Ordena por `claveDeOrden` y desempata por la serialización completa, así el
 * orden es TOTAL y determinístico aun con ids repetidos o ausentes.
 *
 * Consecuencia declarada (lección (c)): este script NO detecta cambios de ORDEN
 * de las listas. Es deliberado — la fase toca índices y el `ORDER BY` de MySQL
 * puede devolver los empates al revés sin que ningún número haya cambiado. Lo
 * que D-10 promete es "los mismos números", y eso son los valores.
 */
function ordenarArray(elementos: ValorJson[]): ValorJson[] {
  const clave = claveDeOrden(elementos);
  const conRango = elementos.map((elemento) => {
    const primario =
      clave !== null && esObjeto(elemento)
        ? JSON.stringify(elemento[clave])
        : "";
    return { elemento, primario, secundario: serializar(elemento) };
  });
  conRango.sort(
    (a, b) =>
      a.primario.localeCompare(b.primario) ||
      a.secundario.localeCompare(b.secundario),
  );
  return conRango.map((r) => r.elemento);
}

function normalizar(valor: ValorJson, esRaiz: boolean): ValorJson {
  if (Array.isArray(valor)) {
    return ordenarArray(valor.map((v) => normalizar(v, false)));
  }
  if (!esObjeto(valor)) return valor;
  const salida: { [clave: string]: ValorJson } = {};
  for (const clave of Object.keys(valor)) {
    if (CLAVES_VOLATILES_RECURSIVAS.includes(clave)) continue;
    if (esRaiz && CLAVES_VOLATILES_RAIZ.includes(clave)) continue;
    salida[clave] = normalizar(valor[clave], false);
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de xlsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una celda de exceljs puede ser primitiva, `Date`, texto rico, hipervínculo,
 * fórmula con resultado o error. Se aplasta a un primitivo estable: un `Date`
 * serializado por defecto ya sería estable, pero el texto rico se imprimiría
 * como `[object Object]` y dos celdas distintas colapsarían en el mismo valor.
 */
function normalizarCelda(valor: unknown): ValorJson {
  if (valor === null || valor === undefined) return null;
  if (
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  ) {
    return valor;
  }
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    if (Array.isArray(objeto.richText)) {
      return objeto.richText
        .map((trozo) => String((trozo as { text?: unknown }).text ?? ""))
        .join("");
    }
    if ("result" in objeto) return normalizarCelda(objeto.result);
    if ("formula" in objeto) return `=${String(objeto.formula)}`;
    if ("error" in objeto) return `#${String(objeto.error)}`;
    if (typeof objeto.text === "string") return objeto.text;
  }
  return String(valor);
}

/**
 * Cada fila se guarda como OBJETO con clave por índice fijo de columna
 * (`c000`, `c001`, ...) y no como array. Motivo: `normalizar` ordena todos los
 * arrays, y sobre un array de celdas eso reordenaría las COLUMNAS, que sí son
 * señal. Con claves indexadas, `conClavesOrdenadas` las deja en orden de índice
 * y `ordenarArray` solo puede mover FILAS, que no lo son (lección (c)).
 */
function filaIndexada(celdas: unknown[]): { [clave: string]: ValorJson } {
  const salida: { [clave: string]: ValorJson } = {};
  celdas.forEach((celda, indice) => {
    const clave = `c${String(indice).padStart(ANCHO_INDICE_COLUMNA, "0")}`;
    salida[clave] = normalizarCelda(celda);
  });
  return salida;
}

/**
 * Lee el `.xlsx` y devuelve su CONTENIDO, nunca el binario ni su hash:
 * `routes.ts` hace `workbook.created = new Date()` antes de serializar, así que
 * un hash daría diff en cada corrida aunque no cambie una sola celda.
 */
async function normalizarXlsx(bytes: ArrayBuffer): Promise<ValorJson> {
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes);
  const hojas: ValorJson[] = [];
  workbook.eachSheet((hoja) => {
    const filas: ValorJson[] = [];
    let encabezado: ValorJson = null;
    hoja.eachRow({ includeEmpty: false }, (fila, numeroDeFila) => {
      // `row.values` es 1-based con un hueco en el índice 0.
      const crudas = Array.isArray(fila.values)
        ? (fila.values as unknown[]).slice(1)
        : [];
      const indexada = filaIndexada(crudas);
      if (numeroDeFila === 1) {
        // El encabezado va aparte: es el contrato de columnas y tiene que
        // poder diferir por sí solo, sin mezclarse con el orden de las filas.
        encabezado = indexada;
        return;
      }
      filas.push(indexada);
    });
    hojas.push({
      nombre: hoja.name,
      encabezado,
      cantidadDeFilas: filas.length,
      filas: ordenarArray(filas),
    });
  });
  return { hojas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Captura
// ─────────────────────────────────────────────────────────────────────────────

function armarUrl(
  baseUrl: string,
  spec: EspecEndpoint,
  pagina: number,
): string {
  const url = new URL(spec.path, baseUrl);
  for (const [clave, valor] of Object.entries(spec.query)) {
    url.searchParams.set(clave, valor);
  }
  if (spec.paginado) url.searchParams.set("page", String(pagina));
  return url.toString();
}

async function pedir(
  url: string,
  token: string,
  formato: "json" | "xlsx",
): Promise<{ status: number; body: ValorJson }> {
  const respuesta = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: formato === "xlsx" ? "*/*" : "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (formato === "xlsx" && respuesta.status === 200) {
    return {
      status: 200,
      body: await normalizarXlsx(await respuesta.arrayBuffer()),
    };
  }

  const texto = await respuesta.text();
  let body: ValorJson;
  try {
    body = JSON.parse(texto) as ValorJson;
  } catch {
    // Trampa conocida del repo: los vhosts de front NO proxean `/api`, así que
    // una baseUrl equivocada devuelve HTML de nginx (405/404) y no JSON.
    body = { noEsJson: texto.slice(0, 500) };
  }
  return { status: respuesta.status, body };
}

/**
 * Warn único de captura incompleta. Nombra el endpoint, la página donde cortó,
 * el par `filas/total` y el motivo: sin el par, un `TRUNCADO` en la salida no
 * dice si faltó una fila o la mitad del padrón.
 */
function avisarTruncado(
  etiqueta: string,
  pagina: number,
  cantidadFilas: number,
  total: number,
  motivo: string,
): void {
  console.warn(
    `  ! ${etiqueta}: captura TRUNCADA en ${cantidadFilas}/${total} filas ` +
      `(página ${pagina}: ${motivo}). El diff de este endpoint puede dar ` +
      `falsos positivos.`,
  );
}

function nombreDe(spec: EspecEndpoint): string {
  return `${spec.metodo} ${spec.path} [${spec.etiqueta}]`;
}

function filasDe(body: ValorJson, claveFilas: string): ValorJson[] | null {
  if (!esObjeto(body)) return null;
  const filas = body[claveFilas];
  return Array.isArray(filas) ? filas : null;
}

async function capturarEndpoint(
  baseUrl: string,
  token: string,
  spec: EspecEndpoint,
): Promise<EntradaSnapshot> {
  const primera = await pedir(armarUrl(baseUrl, spec, 1), token, spec.formato);
  if (primera.status !== 200 || !spec.paginado) {
    return {
      status: primera.status,
      truncado: false,
      body: normalizar(primera.body, true),
    };
  }

  const sobre = primera.body;
  const primerasFilas = filasDe(sobre, spec.claveFilas);
  if (
    !esObjeto(sobre) ||
    primerasFilas === null ||
    typeof sobre.total !== "number"
  ) {
    // Marcado como paginado pero la forma no lo es: se guarda tal cual en vez
    // de inventar un merge. El diff lo va a comparar igual.
    return { status: 200, truncado: false, body: normalizar(sobre, true) };
  }

  const filas: ValorJson[] = [...primerasFilas];
  const total = sobre.total;
  let pagina = 1;
  let truncado = false;
  while (filas.length < total) {
    if (pagina >= MAX_PAGINAS) {
      truncado = true;
      avisarTruncado(
        nombreDe(spec),
        pagina,
        filas.length,
        total,
        `tope de ${MAX_PAGINAS} páginas`,
      );
      break;
    }
    pagina += 1;
    const siguiente = await pedir(
      armarUrl(baseUrl, spec, pagina),
      token,
      spec.formato,
    );
    if (siguiente.status !== 200) {
      return {
        status: siguiente.status,
        truncado: true,
        body: normalizar(siguiente.body, true),
      };
    }
    const cuerpo = siguiente.body;
    const siguientesFilas = filasDe(cuerpo, spec.claveFilas);
    if (siguientesFilas === null) {
      // Página intermedia con body bien formado pero SIN la clave de filas como
      // array: la captura queda INCOMPLETA. Mismo trato que el tope de
      // `MAX_PAGINAS` — el flag `truncado` existe exactamente para delatar esto
      // (IN-02 de la 172). Sin esto, un `antes.json` parcial se declara
      // completo y el `--diff` posterior compara contra una línea de base
      // incompleta en silencio.
      if (filas.length < total) {
        truncado = true;
        avisarTruncado(
          nombreDe(spec),
          pagina,
          filas.length,
          total,
          `la página no trae '${spec.claveFilas}' como array`,
        );
      }
      break;
    }
    if (siguientesFilas.length === 0) {
      // El server dejó de dar filas antes de agotar `total`: mismo modo de
      // falla que el anterior (incompleto, no completo).
      if (filas.length < total) {
        truncado = true;
        avisarTruncado(
          nombreDe(spec),
          pagina,
          filas.length,
          total,
          "la página vino vacía antes de agotar el total",
        );
      }
      break;
    }
    filas.push(...siguientesFilas);
  }

  // Se conserva el sobre de la PRIMERA página (page=1, limit fijo, así que no
  // es volátil) y se le reemplazan las filas por todas las recorridas. Eso
  // preserva `total`, `page`, `limit` y —clave para D-10— `totalDebtByCurrency`,
  // que es un agregado que sale de una query APARTE de las filas.
  const completo: { [clave: string]: ValorJson } = {
    ...sobre,
    [spec.claveFilas]: filas,
  };
  return { status: 200, truncado, body: normalizar(completo, true) };
}

function huellaDeParametros(parametros: ParametrosOperador): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        branchId: parametros.branchId,
        dupDni: parametros.dupDni,
        dupPhone: parametros.dupPhone,
        busqueda: BUSQUEDA,
        rango: RANGO,
        limite: LIMITE_POR_PAGINA,
        limiteTypeahead: LIMITE_TYPEAHEAD,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

async function capturar(
  baseUrl: string,
  token: string,
  parametros: ParametrosOperador,
  ruta: string,
): Promise<void> {
  const specs = armarEndpoints(parametros);
  console.log(`\n=== Snapshot de socios (D-10, fase 173) ===`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Búsqueda fija: "${BUSQUEDA}"  ·  sede: ${parametros.branchId}`);
  console.log(`Huella de parámetros: ${huellaDeParametros(parametros)}`);
  console.log(`Endpoints: ${specs.length}\n`);

  const endpoints: Record<string, EntradaSnapshot> = {};
  const truncados: string[] = [];
  let huboFallas = false;

  // Secuencial a propósito: no hay motivo para golpear staging en paralelo.
  for (const spec of specs) {
    const nombre = nombreDe(spec);
    process.stdout.write(`  ${nombre} ... `);
    const entrada = await capturarEndpoint(baseUrl, token, spec);
    endpoints[nombre] = entrada;
    console.log(
      `${entrada.status}${resumenDeFilas(entrada, spec)}` +
        `${entrada.truncado ? " TRUNCADO" : ""}`,
    );
    // Un endpoint truncado invalida la captura tanto como uno que no dio 200:
    // en los dos casos el archivo NO sirve como línea de base (IN-02).
    if (entrada.status !== 200 || entrada.truncado) huboFallas = true;
    if (entrada.truncado) truncados.push(nombre);
  }

  const snapshot: Snapshot = {
    capturadoEn: new Date().toISOString(),
    baseUrl,
    rango: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo },
    busqueda: BUSQUEDA,
    branchId: parametros.branchId,
    parametrosHash: huellaDeParametros(parametros),
    endpoints,
  };

  // Un snapshot con endpoints caídos o truncados NO se guarda en la ruta
  // pedida: si el archivo se llama `antes.json`, alguien lo va a usar como
  // línea de base tres semanas después sin releer la salida de esta corrida.
  const destino = huboFallas ? `${ruta}.parcial` : ruta;
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, `${serializar(aJson(snapshot))}\n`, { mode: 0o600 });
  await chmod(destino, 0o600);

  console.log(`\nGuardado en: ${destino}`);
  console.log(
    "Este archivo tiene DNIs, teléfonos, emails e IBANs de socios: NO se " +
      "commitea (T-173-03-01).",
  );

  if (huboFallas) {
    if (truncados.length > 0) {
      console.error(
        `\nCAPTURA TRUNCADA en ${truncados.length} endpoint(s): ` +
          `${truncados.join(", ")}. Subí MAX_PAGINAS o acotá el filtro y repetí.`,
      );
    }
    console.error(
      "\nFALLÓ: al menos un endpoint no devolvió 200 o quedó truncado. La " +
        `captura quedó en ${destino} para inspección, NO como línea de base.`,
    );
    process.exit(1);
  }
  console.log(
    `\nCaptura completa: los ${specs.length} endpoints en 200, ninguno truncado.`,
  );
}

/** Resumen legible por endpoint: filas recorridas, `total` y agregados. */
function resumenDeFilas(entrada: EntradaSnapshot, spec: EspecEndpoint): string {
  const body = entrada.body;
  if (!esObjeto(body)) return "";

  if (spec.formato === "xlsx") {
    const hojas = Array.isArray(body.hojas) ? body.hojas : [];
    const detalle = hojas
      .map((hoja) =>
        esObjeto(hoja)
          ? `${String(hoja.nombre)}: ${String(hoja.cantidadDeFilas)} filas`
          : "?",
      )
      .join(", ");
    return detalle === "" ? "" : ` (${detalle})`;
  }

  const filas = filasDe(body, spec.claveFilas);
  if (filas === null) return "";
  const total = typeof body.total === "number" ? `/${body.total}` : "";
  const deuda = Array.isArray(body.totalDebtByCurrency)
    ? `, deuda: ${JSON.stringify(body.totalDebtByCurrency)}`
    : "";
  return ` (${filas.length}${total} filas${deuda})`;
}

function aJson(snapshot: Snapshot): ValorJson {
  const endpoints: { [clave: string]: ValorJson } = {};
  for (const [nombre, entrada] of Object.entries(snapshot.endpoints)) {
    endpoints[nombre] = {
      status: entrada.status,
      truncado: entrada.truncado,
      body: entrada.body,
    };
  }
  return {
    capturadoEn: snapshot.capturadoEn,
    baseUrl: snapshot.baseUrl,
    rango: { dateFrom: snapshot.rango.dateFrom, dateTo: snapshot.rango.dateTo },
    busqueda: snapshot.busqueda,
    branchId: snapshot.branchId,
    parametrosHash: snapshot.parametrosHash,
    endpoints,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

async function leerSnapshot(
  ruta: string,
): Promise<{ [clave: string]: ValorJson }> {
  let crudo: string;
  try {
    crudo = await readFile(ruta, "utf8");
  } catch {
    throw new ErrorDeUso(`no pude leer el snapshot ${ruta}`);
  }
  let parseado: ValorJson;
  try {
    parseado = JSON.parse(crudo) as ValorJson;
  } catch {
    throw new ErrorDeUso(`${ruta} no es JSON válido`);
  }
  if (!esObjeto(parseado) || !esObjeto(parseado.endpoints)) {
    throw new ErrorDeUso(
      `${ruta} no tiene la forma de un snapshot (falta el objeto 'endpoints')`,
    );
  }
  return parseado;
}

/** Primer camino JSON donde los dos valores difieren, o `null` si son iguales. */
function primerPathDivergente(
  a: ValorJson,
  b: ValorJson,
  prefijo: string,
): { path: string; izq: string; der: string } | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return { path: prefijo, izq: tipoDe(a), der: tipoDe(b) };
    }
    if (a.length !== b.length) {
      return {
        path: `${prefijo}.length`,
        izq: String(a.length),
        der: String(b.length),
      };
    }
    for (let i = 0; i < a.length; i += 1) {
      const hallazgo = primerPathDivergente(a[i], b[i], `${prefijo}[${i}]`);
      if (hallazgo !== null) return hallazgo;
    }
    return null;
  }
  if (esObjeto(a) || esObjeto(b)) {
    if (!esObjeto(a) || !esObjeto(b)) {
      return { path: prefijo, izq: tipoDe(a), der: tipoDe(b) };
    }
    const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const clave of claves) {
      if (!(clave in a)) {
        return {
          path: `${prefijo}.${clave}`,
          izq: "(ausente)",
          der: "presente",
        };
      }
      if (!(clave in b)) {
        return {
          path: `${prefijo}.${clave}`,
          izq: "presente",
          der: "(ausente)",
        };
      }
      const hallazgo = primerPathDivergente(
        a[clave],
        b[clave],
        `${prefijo}.${clave}`,
      );
      if (hallazgo !== null) return hallazgo;
    }
    return null;
  }
  if (a === b) return null;
  return { path: prefijo, izq: JSON.stringify(a), der: JSON.stringify(b) };
}

function tipoDe(valor: ValorJson): string {
  if (Array.isArray(valor)) return "array";
  if (valor === null) return "null";
  return typeof valor;
}

async function diffear(rutaA: string, rutaB: string): Promise<void> {
  const a = await leerSnapshot(rutaA);
  const b = await leerSnapshot(rutaB);

  // Comparar dos capturas con parámetros distintos no es un diff: es una
  // confusión. Corta con error de USO antes de imprimir cientos de diferencias
  // sin sentido. La huella cubre el DNI y el teléfono, que no están en el
  // archivo.
  const rangoA = serializar(a.rango ?? null);
  const rangoB = serializar(b.rango ?? null);
  if (rangoA !== rangoB) {
    throw new ErrorDeUso(
      `los snapshots tienen rangos distintos (${rangoA} vs ${rangoB}): no son comparables`,
    );
  }
  if (a.parametrosHash !== b.parametrosHash) {
    throw new ErrorDeUso(
      `los snapshots se tomaron con parámetros distintos ` +
        `(${String(a.parametrosHash)} vs ${String(b.parametrosHash)}): no son comparables. ` +
        `Repetí la captura de después con la MISMA sede, DNI y teléfono.`,
    );
  }
  if (a.baseUrl !== b.baseUrl) {
    console.warn(
      `ADVERTENCIA: los snapshots son de baseUrl distintas (${String(a.baseUrl)} vs ${String(b.baseUrl)}).`,
    );
  }

  const endpointsA = a.endpoints;
  const endpointsB = b.endpoints;
  if (!esObjeto(endpointsA) || !esObjeto(endpointsB)) {
    throw new ErrorDeUso("los snapshots no tienen el objeto 'endpoints'");
  }

  console.log(`\n=== Diff de snapshots de socios ===`);
  console.log(`A: ${rutaA}  (capturado ${String(a.capturadoEn)})`);
  console.log(`B: ${rutaB}  (capturado ${String(b.capturadoEn)})\n`);

  const nombres = [
    ...new Set([...Object.keys(endpointsA), ...Object.keys(endpointsB)]),
  ].sort();
  const diferentes: string[] = [];

  for (const nombre of nombres) {
    if (!(nombre in endpointsA)) {
      diferentes.push(nombre);
      console.log(`  DIFIERE ${nombre}\n    solo está en B`);
      continue;
    }
    if (!(nombre in endpointsB)) {
      diferentes.push(nombre);
      console.log(`  DIFIERE ${nombre}\n    solo está en A`);
      continue;
    }
    const hallazgo = primerPathDivergente(
      endpointsA[nombre],
      endpointsB[nombre],
      "",
    );
    if (hallazgo === null) {
      console.log(`  igual   ${nombre}`);
      continue;
    }
    diferentes.push(nombre);
    console.log(`  DIFIERE ${nombre}`);
    console.log(`    primer path divergente: ${hallazgo.path || "(raíz)"}`);
    console.log(`      A: ${hallazgo.izq}`);
    console.log(`      B: ${hallazgo.der}`);
  }

  if (diferentes.length === 0) {
    console.log(`\nSIN DIFERENCIAS en ${nombres.length} endpoints.`);
    return;
  }
  console.error(
    `\nDIFERENCIAS en ${diferentes.length} de ${nombres.length} endpoints: ${diferentes.join(", ")}`,
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `
snapshot-members-endpoints.ts — foto del módulo de socios (D-10, fase 173)

Captura (requiere las 5 env vars):
  SNAPSHOT_BASE_URL=https://api-staging.eltemplo.org \\
  SNAPSHOT_TOKEN=<jwt de admin/owner> \\
  SNAPSHOT_BRANCH_ID=<id de una sede real> \\
  SNAPSHOT_DUP_DNI=<dni de un socio real> \\
  SNAPSHOT_DUP_PHONE=<telefono de un socio real> \\
    pnpm exec tsx src/scripts/snapshot-members-endpoints.ts --out=<ruta.json>

Diff (no toca la red, no necesita env):
  pnpm exec tsx src/scripts/snapshot-members-endpoints.ts --diff=<antes.json> <despues.json>

El DNI y el telefono NO se escriben en el archivo: solo su huella sha256, que
alcanza para que el diff corte si las dos capturas usaron entradas distintas.

Codigos de salida: 0 OK / 1 corrio y fallo (o quedo truncado) / 2 error de uso.
Guarda los snapshots FUERA del repo (p. ej. $HOME/.el-templo-snapshots/173/):
tienen DNIs, telefonos, emails e IBANs de socios.
`;

function valorDeFlag(argv: string[], flag: string): string | null {
  const conIgual = argv.find((a) => a.startsWith(`${flag}=`));
  if (conIgual !== undefined) return conIgual.slice(flag.length + 1);
  const indice = argv.indexOf(flag);
  if (indice !== -1 && indice + 1 < argv.length) return argv[indice + 1];
  return null;
}

function envRequerida(nombre: string, queEs: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor === "") {
    throw new ErrorDeUso(`falta ${nombre} (${queEs})`);
  }
  return valor;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // `--help` sale con 0, no con el 2 de error de uso: es una consulta válida y
  // la verificación del plan lo encadena con `&&`.
  if (argv.some((a) => a === "--help" || a === "-h")) {
    console.log(USAGE);
    return;
  }

  const pidioDiff = argv.some((a) => a === "--diff" || a.startsWith("--diff="));
  const pidioOut = argv.some((a) => a === "--out" || a.startsWith("--out="));

  if (pidioDiff === pidioOut) {
    throw new ErrorDeUso(
      "elegí exactamente un modo: --out=<ruta> o --diff=<a> <b>",
    );
  }

  if (pidioDiff) {
    const rutaA = valorDeFlag(argv, "--diff");
    // El segundo archivo es posicional: el que no es flag ni valor del flag.
    const rutaB = argv.find(
      (a, i) => !a.startsWith("--") && a !== rutaA && argv[i - 1] !== "--diff",
    );
    if (rutaA === null || rutaA === "" || rutaB === undefined) {
      throw new ErrorDeUso(
        "--diff necesita DOS archivos: --diff=<antes> <despues>",
      );
    }
    await diffear(rutaA, rutaB);
    return;
  }

  const ruta = valorDeFlag(argv, "--out");
  if (ruta === null || ruta === "") {
    throw new ErrorDeUso("--out necesita una ruta de salida");
  }
  const baseUrl = envRequerida("SNAPSHOT_BASE_URL", "URL base de la API");
  const token = envRequerida("SNAPSHOT_TOKEN", "JWT de admin/owner");
  const parametros: ParametrosOperador = {
    branchId: envRequerida("SNAPSHOT_BRANCH_ID", "id de una sede real"),
    dupDni: envRequerida("SNAPSHOT_DUP_DNI", "DNI de un socio real"),
    dupPhone: envRequerida("SNAPSHOT_DUP_PHONE", "teléfono de un socio real"),
  };
  await capturar(baseUrl, token, parametros, ruta);
}

main().catch((err: unknown) => {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error(`snapshot-members-endpoints fallo: ${mensaje}`);
  if (err instanceof ErrorDeUso) console.error(USAGE);
  process.exit(err instanceof ErrorDeUso ? 2 : 1);
});
