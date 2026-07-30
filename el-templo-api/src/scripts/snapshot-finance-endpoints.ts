/**
 * snapshot-finance-endpoints.ts -- A DEMANDA
 *
 * POR QUÉ EXISTE (D-12 de la fase 172)
 * ------------------------------------
 * El criterio 4 de la fase 172 es "el staff ve los mismos números" después de
 * migrar `finance` al patrón de tenancy. Sin una foto tomada ANTES del deploy,
 * la comparación de después no existe: nadie se acuerda de memoria cuánto
 * sumaba la caja de mayo, y "se ve parecido" no es evidencia.
 *
 * Este script golpea los agregadores de `finance` con GETs, normaliza las
 * respuestas y las guarda en un JSON. Se corre dos veces —una ANTES del deploy
 * de la fase y otra DESPUÉS— y el modo `--diff` compara. Un diff vacío es la
 * evidencia de D-12; un diff con contenido dice exactamente qué endpoint y qué
 * campo se movió.
 *
 * POR QUÉ EL RANGO DE FECHAS ES FIJO
 * ----------------------------------
 * El rango va cableado (`2026-01-01` .. `2026-06-30`) y NO se pasa por
 * parámetro a propósito. Un rango relativo ("últimos 30 días") movería la
 * ventana entre la captura de antes y la de después: el diff mostraría plata
 * cobrada en el medio y sería imposible separar el ruido de una regresión.
 * Es además un rango CERRADO y pasado — sobre datos quietos, que nadie va a
 * seguir editando mientras corre la fase.
 *
 * POR QUÉ NO TODOS LOS ENDPOINTS RECIBEN LOS MISMOS NOMBRES DE PARÁMETRO
 * ---------------------------------------------------------------------
 * El rango es el MISMO para todos, pero cada endpoint lo nombra como lo nombra
 * su schema: `/api/admin/reports/outstanding-balances` no acepta
 * `dateFrom`/`dateTo` (usa `accruedFrom`/`accruedTo`) y `cost-centers/all` no
 * acepta rango ninguno. Mandarle `dateFrom` al primero NO da 400: Fastify
 * compila ajv con `removeAdditional: true`, así que la propiedad desconocida se
 * **strippea en silencio** y el snapshot diría "rango 2026-H1" sobre una
 * respuesta que en realidad trae todo el histórico. Por eso el rango se mapea
 * al nombre real de cada schema (ver `ENDPOINTS`).
 *
 * QUÉ COPIAN LAS FASES 173-175
 * ----------------------------
 * Todo salvo la constante `ENDPOINTS`: cambiando esa lista (members,
 * subscriptions, scheduling...) el resto —normalización, paginado, diff,
 * códigos de salida— sirve tal cual. No copiar el archivo: agregarle una lista
 * por módulo también funciona.
 *
 * DÓNDE SE GUARDA LA SALIDA (T-172-05-01)
 * ---------------------------------------
 * En `$HOME/.el-templo-snapshots/`, FUERA del repo y fuera de `.planning/`. El
 * archivo tiene plata real y nombres de socios: no se commitea nunca. El script
 * lo escribe con permisos 0600.
 *
 * EL TOKEN (T-172-05-02)
 * ----------------------
 * `SNAPSHOT_TOKEN` entra por env en la línea de comandos del operador. No se
 * escribe en el archivo de salida ni se loguea — ni siquiera truncado.
 *
 * CÓDIGOS DE SALIDA (convención del repo, `verify-tenant-uniques.ts`)
 * ------------------------------------------------------------------
 *   0 = OK (captura completa / diff vacío)
 *   1 = corrió y falló (algún endpoint no dio 200, red caída, o diff con
 *       diferencias)
 *   2 = error de USO (falta env, faltan argumentos, archivos incomparables)
 *
 * Usage (captura, requiere las DOS env vars):
 *   SNAPSHOT_BASE_URL=https://api-staging.eltemplo.org \
 *   SNAPSHOT_TOKEN=<jwt de admin/owner> \
 *     pnpm exec tsx src/scripts/snapshot-finance-endpoints.ts \
 *       --out=$HOME/.el-templo-snapshots/172/antes.json
 *
 * Usage (diff, NO requiere env: es comparación de archivos, no toca la red):
 *   pnpm exec tsx src/scripts/snapshot-finance-endpoints.ts \
 *     --diff=$HOME/.el-templo-snapshots/172/antes.json /tmp/control.json
 *
 * NO está cableado a ningún pipeline (ni a `package.json`, ni al runner de
 * migraciones, ni al deploy). Solo a demanda, y solo GETs.
 *
 * `console.*` está permitido acá: esto es tooling de línea de comandos, no el
 * runtime de Fastify (precedente `verify-tenant-uniques.ts`, `require-tenant.ts`).
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Rango fijo, cerrado y pasado. Ver el docblock: NO parametrizar. */
const RANGO = {
  dateFrom: "2026-01-01",
  dateTo: "2026-06-30",
} as const;

/** Página máxima que el script pide antes de declarar la captura truncada. */
const MAX_PAGINAS = 50;

/** Tamaño de página: el máximo que aceptan los schemas paginados de finance. */
const LIMITE_POR_PAGINA = 200;

/** Timeout por request. `outstanding-balances` sobre prod tarda varios segundos. */
const TIMEOUT_MS = 120_000;

interface EspecEndpoint {
  /** Solo GET: este script no escribe nada, ni en staging ni en prod. */
  readonly metodo: "GET";
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /**
   * `true` cuando la respuesta es `{ rows, total, ... }` y hay que recorrer las
   * páginas. Sin esto, el snapshot guardaría solo las primeras 200 filas y un
   * cambio de índice (que es EXACTAMENTE lo que hace esta fase) podría cambiar
   * qué filas caen en la página 1 → diff lleno de falsos positivos.
   */
  readonly paginado: boolean;
}

const paginacion = {
  page: "1",
  limit: String(LIMITE_POR_PAGINA),
} as const;

const ENDPOINTS: readonly EspecEndpoint[] = [
  {
    metodo: "GET",
    path: "/api/admin/finance/transactions/summary",
    query: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo },
    paginado: false,
  },
  {
    metodo: "GET",
    path: "/api/admin/finance/cash-registers/balances",
    // El schema exige el rango completo o ninguno (400 si va uno solo).
    query: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo },
    paginado: false,
  },
  {
    metodo: "GET",
    path: "/api/admin/finance/pending-tray",
    // `status` explícito: el default vive en el service y podría cambiar; el
    // snapshot no puede depender de un default para significar lo mismo.
    query: {
      dateFrom: RANGO.dateFrom,
      dateTo: RANGO.dateTo,
      status: "todos",
      ...paginacion,
    },
    paginado: true,
  },
  {
    metodo: "GET",
    path: "/api/admin/finance/movements-history",
    query: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo, ...paginacion },
    paginado: true,
  },
  {
    metodo: "GET",
    path: "/api/admin/finance/transactions",
    query: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo, ...paginacion },
    paginado: true,
  },
  {
    metodo: "GET",
    path: "/api/admin/finance/cost-centers/all",
    // Sin rango: el ABM de centros de costo no filtra por fecha.
    query: {},
    paginado: false,
  },
  {
    metodo: "GET",
    path: "/api/admin/reports/outstanding-balances",
    // Mismo rango, nombre distinto: acá la fecha que corresponde es la de
    // DEVENGO de la deuda (`accruedFrom`/`accruedTo`), que es el análogo de
    // `dateFrom`/`dateTo` en los endpoints de caja.
    query: {
      accruedFrom: RANGO.dateFrom,
      accruedTo: RANGO.dateTo,
      ...paginacion,
    },
    paginado: true,
  },
];

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
  "transactionId",
  "cashRegisterId",
  "costCenterId",
  "userId",
  "code",
  "key",
  "name",
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
  /** `true` si la paginación se cortó en `MAX_PAGINAS` (captura incompleta). */
  truncado: boolean;
  body: ValorJson;
}

interface Snapshot {
  capturadoEn: string;
  baseUrl: string;
  rango: { dateFrom: string; dateTo: string };
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
 * Consecuencia declarada: este script NO detecta cambios de ORDEN de las
 * listas. Es deliberado — la fase toca índices y el `ORDER BY` de MySQL puede
 * devolver los empates al revés sin que ningún número haya cambiado. Lo que
 * D-12 promete es "los mismos números", y eso son los valores.
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
): Promise<{ status: number; body: ValorJson }> {
  const respuesta = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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

async function capturarEndpoint(
  baseUrl: string,
  token: string,
  spec: EspecEndpoint,
): Promise<EntradaSnapshot> {
  const primera = await pedir(armarUrl(baseUrl, spec, 1), token);
  if (primera.status !== 200 || !spec.paginado) {
    return {
      status: primera.status,
      truncado: false,
      body: normalizar(primera.body, true),
    };
  }

  const sobre = primera.body;
  if (
    !esObjeto(sobre) ||
    !Array.isArray(sobre.rows) ||
    typeof sobre.total !== "number"
  ) {
    // Marcado como paginado pero la forma no lo es: se guarda tal cual en vez
    // de inventar un merge. El diff lo va a comparar igual.
    return { status: 200, truncado: false, body: normalizar(sobre, true) };
  }

  const filas: ValorJson[] = [...sobre.rows];
  const total = sobre.total;
  let pagina = 1;
  let truncado = false;
  while (filas.length < total) {
    if (pagina >= MAX_PAGINAS) {
      truncado = true;
      console.warn(
        `  ! ${spec.path}: captura TRUNCADA en ${filas.length}/${total} filas ` +
          `(tope de ${MAX_PAGINAS} páginas). El diff de este endpoint puede dar ` +
          `falsos positivos.`,
      );
      break;
    }
    pagina += 1;
    const siguiente = await pedir(armarUrl(baseUrl, spec, pagina), token);
    if (siguiente.status !== 200) {
      return {
        status: siguiente.status,
        truncado: true,
        body: normalizar(siguiente.body, true),
      };
    }
    const cuerpo = siguiente.body;
    if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.rows)) break;
    if (cuerpo.rows.length === 0) break; // el server dejó de dar filas
    filas.push(...cuerpo.rows);
  }

  // Se conserva el sobre de la PRIMERA página (page=1, limit=200 fijos, así que
  // no es volátil) y se le reemplazan las filas por todas las recorridas.
  const completo: { [clave: string]: ValorJson } = { ...sobre, rows: filas };
  return { status: 200, truncado, body: normalizar(completo, true) };
}

async function capturar(baseUrl: string, token: string, ruta: string) {
  console.log(`\n=== Snapshot de finance (D-12, fase 172) ===`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Rango fijo: ${RANGO.dateFrom} .. ${RANGO.dateTo}`);
  console.log(`Endpoints: ${ENDPOINTS.length}\n`);

  const endpoints: Record<string, EntradaSnapshot> = {};
  let huboFallas = false;

  // Secuencial a propósito: no hay motivo para golpear staging en paralelo.
  for (const spec of ENDPOINTS) {
    const nombre = `${spec.metodo} ${spec.path}`;
    process.stdout.write(`  ${nombre} ... `);
    const entrada = await capturarEndpoint(baseUrl, token, spec);
    endpoints[nombre] = entrada;
    const filas =
      esObjeto(entrada.body) && Array.isArray(entrada.body.rows)
        ? ` (${entrada.body.rows.length} filas)`
        : "";
    console.log(
      `${entrada.status}${filas}${entrada.truncado ? " TRUNCADO" : ""}`,
    );
    if (entrada.status !== 200) huboFallas = true;
  }

  const snapshot: Snapshot = {
    capturadoEn: new Date().toISOString(),
    baseUrl,
    rango: { dateFrom: RANGO.dateFrom, dateTo: RANGO.dateTo },
    endpoints,
  };

  // Un snapshot con endpoints caídos NO se guarda en la ruta pedida: si el
  // archivo se llama `antes.json`, alguien lo va a usar como línea de base tres
  // semanas después sin releer la salida de esta corrida.
  const destino = huboFallas ? `${ruta}.parcial` : ruta;
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, `${serializar(aJson(snapshot))}\n`, { mode: 0o600 });
  await chmod(destino, 0o600);

  console.log(`\nGuardado en: ${destino}`);
  console.log(
    "Este archivo tiene plata real y datos de socios: NO se commitea (T-172-05-01).",
  );

  if (huboFallas) {
    console.error(
      "\nFALLÓ: al menos un endpoint no devolvió 200. La captura quedó en " +
        `${destino} para inspección, NO como línea de base.`,
    );
    process.exit(1);
  }
  console.log("\nCaptura completa: los 7 endpoints en 200.");
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

  // Comparar dos rangos distintos no es un diff: es una confusión. Corta con
  // error de USO antes de imprimir cientos de diferencias sin sentido.
  const rangoA = serializar(a.rango ?? null);
  const rangoB = serializar(b.rango ?? null);
  if (rangoA !== rangoB) {
    throw new ErrorDeUso(
      `los snapshots tienen rangos distintos (${rangoA} vs ${rangoB}): no son comparables`,
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

  console.log(`\n=== Diff de snapshots ===`);
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
snapshot-finance-endpoints.ts — foto de los agregadores de finance (D-12, fase 172)

Captura (requiere SNAPSHOT_BASE_URL y SNAPSHOT_TOKEN):
  SNAPSHOT_BASE_URL=https://api-staging.eltemplo.org SNAPSHOT_TOKEN=<jwt> \\
    pnpm exec tsx src/scripts/snapshot-finance-endpoints.ts --out=<ruta.json>

Diff (no toca la red, no necesita env):
  pnpm exec tsx src/scripts/snapshot-finance-endpoints.ts --diff=<antes.json> <despues.json>

Códigos de salida: 0 OK / 1 corrió y falló / 2 error de uso.
Guardá los snapshots FUERA del repo (p. ej. $HOME/.el-templo-snapshots/172/):
tienen plata real y datos de socios.
`;

function valorDeFlag(argv: string[], flag: string): string | null {
  const conIgual = argv.find((a) => a.startsWith(`${flag}=`));
  if (conIgual !== undefined) return conIgual.slice(flag.length + 1);
  const indice = argv.indexOf(flag);
  if (indice !== -1 && indice + 1 < argv.length) return argv[indice + 1];
  return null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
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
  const baseUrl = process.env.SNAPSHOT_BASE_URL;
  const token = process.env.SNAPSHOT_TOKEN;
  if (baseUrl === undefined || baseUrl === "") {
    throw new ErrorDeUso("falta SNAPSHOT_BASE_URL");
  }
  if (token === undefined || token === "") {
    throw new ErrorDeUso("falta SNAPSHOT_TOKEN (JWT de admin/owner)");
  }
  await capturar(baseUrl, token, ruta);
}

main().catch((err: unknown) => {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error(`snapshot-finance-endpoints fallo: ${mensaje}`);
  if (err instanceof ErrorDeUso) console.error(USAGE);
  process.exit(err instanceof ErrorDeUso ? 2 : 1);
});
