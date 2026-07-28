/**
 * CON-05 (fase 170) — Mecanismo del sentinel de pool: dónde se intercepta el SQL
 * y con qué severidad se reacciona.
 *
 * La DECISIÓN de qué es una violación vive en `./analyze.ts` (función pura). Acá
 * vive lo otro: el wrap del pool mysql2 **por debajo de Drizzle**, la matriz de
 * severidad (throw / log deduplicado / silencio), los contadores y —desde el
 * Task 2— el resumen periódico.
 *
 * LAS TRES PUERTAS POR LAS QUE ENTRA EL SQL
 * -----------------------------------------
 * Verificado contra drizzle-orm 0.45.1 + mysql2 3.16.1 con un pool instrumentado
 * (RESEARCH de la fase):
 *
 *   fuera de transacción:   pool.query          select … from `users` where …
 *   dentro de transacción:  pool.getConnection
 *                           conn.query          begin
 *                           conn.query          select …
 *                           conn.query          insert into …
 *                           conn.query          commit
 *                           conn.release
 *
 * Por eso se envuelven TRES métodos y no dos. El doc 03 §3 dice "envolver
 * `pool.query/execute`" y eso solo deja ciego al camino de escritura:
 * `MySql2Session.transaction()` hace `new MySql2Session(await
 * this.client.getConnection(), …)` y a partir de ahí `pool.query` no se llama
 * nunca más. Hay **65 call sites de `.transaction(` en 25 archivos** que
 * dependen de que `getConnection` esté envuelto (Pitfall 1, T-170-01).
 *
 * POR QUÉ MONKEYPATCH DE PROPIEDADES PROPIAS Y NO UN `Proxy`
 * ----------------------------------------------------------
 * Un `Proxy` devuelve un OBJETO DISTINTO. El pool se decora como
 * `fastify.decorate("dbPool", pool)` y 18 sitios de test hacen
 * `app.dbPool.getConnection()` sobre esa misma instancia; el `onClose` del
 * plugin hace `pool.end()` sobre ella. Sombrear las propiedades de la instancia
 * conserva la identidad del objeto, que es lo que todo eso asume. Además evita
 * el costo por trap del `Proxy` en el hot path de TODA query (T-170-03).
 *
 * LA MATRIZ DE SEVERIDAD (entorno × lista strict)
 * -----------------------------------------------
 * ```
 *                        tabla en la lista strict     tabla NO strict
 *   test / development   THROW (TenantSentinelError)  silencio + contador  (D-08)
 *   prod / staging       log.error deduplicado        log.error deduplicado (D-01)
 * ```
 * En `mode: "log"` el sentinel **NUNCA hace throw**, ni siquiera sobre una tabla
 * strict: decidido con Nacho el 2026-07-02 (README §4.2, T-170-14). Un tripwire
 * que tira una operación legítima en producción es peor que la deuda que vigila.
 *
 * El silencio de las tablas no-strict en modo throw es D-08: hoy **cero módulos
 * están migrados**, así que loguear cada violación ensuciaría la salida de la
 * suite entera. Se cuentan igual — el inventario sale de los contadores, no del
 * output.
 *
 * QUÉ SE LOGUEA Y QUÉ NO (T-170-02)
 * ---------------------------------
 * Se loguea el TEXTO del statement (que ya viene con placeholders `?`, no con
 * los valores) truncado, más las tablas y el contador. **Nunca el array de
 * `params`**: ahí sí viajan datos personales de socios. El wrap ve los `params`
 * —son el segundo argumento de `query`/`execute`— y deliberadamente no los toca
 * ni los pasa a `analyzeSql`.
 *
 * LA LIMITACIÓN, ESCRITA
 * ----------------------
 * El chequeo es de **PRESENCIA** del literal `tenant_id` en la zona de
 * predicado, **no de corrección del filtro** (detalle en el docblock de
 * `./analyze.ts`). Es un tripwire contra el olvido; la corrección la prueban los
 * fixtures 2-tenant de la capa 5 (fase 171+).
 *
 * QUÉ HACER CUANDO ESTO SE CAIGA
 * ------------------------------
 * - **Un `TenantSentinelError` en un test:** el mensaje trae el SQL y la acción.
 *   No se saca la tabla de `TENANT_STRICT_MODULES` para apagarlo — eso apaga el
 *   gate de todo el módulo migrado.
 * - **La suite queda colgada:** ver el bloque del timer (Task 2). Un
 *   `setInterval` sin `.unref()` mantiene vivo el event loop.
 * - **Una query legítima queda como violación:** es del parser, no de acá; ver
 *   `./analyze.ts` y su batería.
 */

import type { Pool, PoolConnection } from "mysql2/promise";
import { analyzeSql, fingerprint } from "./analyze";
import { strictTablesSet } from "../tenant-tables";
import type { TenantLogger } from "../../modules/shared/tenant";

/** Severidad global del sentinel. */
export type SentinelMode = "throw" | "log";

export interface SentinelOptions {
  /**
   * Logger estructurado. Es la interfaz que ya existe en
   * `modules/shared/tenant` — no se define una nueva: la satisfacen tanto el
   * `FastifyBaseLogger` del plugin como un doble de test.
   */
  log: TenantLogger;
  /**
   * Tablas cuyo incumplimiento es REGRESIÓN y no deuda conocida. Default: la
   * lista canónica de `../tenant-tables` (vacía en la fase 170). Es inyectable
   * por D-07: el test del criterio 1 pasa una tabla real como strict y afirma el
   * throw, sin declarar migrado ningún módulo que no lo esté.
   */
  strictTables?: ReadonlySet<string>;
  /** Default: `NODE_ENV` `test` o `development` → `"throw"`; el resto → `"log"`. */
  mode?: SentinelMode;
  /** Default: `process.env.SENTINEL_INVENTORY === "1"` (D-08). */
  inventory?: boolean;
  /** Default: 3600000 (1 h). `0` desactiva el timer del resumen. */
  summaryIntervalMs?: number;
}

/** Una violación agrupada por statement. `sql` es el fingerprint, no el crudo. */
export interface SentinelFingerprintCount {
  sql: string;
  tables: string[];
  count: number;
}

export interface SentinelCounters {
  /** Violaciones observadas, contando repeticiones del mismo statement. */
  totalViolations: number;
  /** Statements violadores DISTINTOS que el sentinel está rastreando. */
  distinctFingerprints: number;
  /** Violaciones por tabla. Un statement con join suma a cada tabla. */
  byTable: Record<string, number>;
  /** Statements distintos, de más frecuente a menos. */
  byFingerprint: SentinelFingerprintCount[];
}

export interface SentinelHandle {
  /**
   * El corazón de la severidad. Lo llama el wrap con el texto de cada
   * statement; el test lo llama directo para no montar un pool.
   *
   * Puede lanzar {@link TenantSentinelError} — solo en `mode: "throw"` y solo
   * sobre tablas de la lista strict.
   */
  inspect(sql: string): void;
  /** Foto de los contadores. Ver la advertencia de {@link SentinelCounters}. */
  snapshot(): SentinelCounters;
  /** Reporte agregado del modo inventario (D-08). Devuelve texto, no imprime. */
  report(): string;
  /** Corta el resumen periódico. Idempotente. */
  stop(): void;
}

/**
 * Violación de tenancy sobre una tabla de un módulo ya migrado, detectada en
 * test o development.
 *
 * El SQL va en el mensaje por requisito explícito de D-07: el stack de un throw
 * desde adentro del driver no dice qué query fue, y sin eso el error es
 * inaccionable.
 */
export class TenantSentinelError extends Error {
  readonly sql: string;
  readonly tables: string[];

  constructor(sql: string, tables: string[]) {
    super(
      `[sentinel de tenancy] query sin tenant_id sobre ${tables.join(", ")} ` +
        `(módulo ya migrado, ver TENANT_STRICT_MODULES en src/db/tenant-tables.ts).\n` +
        `SQL: ${sql}\n` +
        `Qué hacer: filtrá con tenantWhere(tabla, ctx) si es una lectura, estampá ` +
        `tenantValues(ctx, {...}) si es una escritura, o —si el acceso es global a ` +
        `propósito— escribí la exención con su motivo en un comentario de bloque ` +
        `"tenant-safe: <motivo>" en el sitio del acceso. NO saques la tabla de ` +
        `TENANT_STRICT_MODULES: eso apaga el gate de todo el módulo.`,
    );
    this.name = "TenantSentinelError";
    this.sql = sql;
    this.tables = tables;
  }
}

/** Largo máximo del SQL que se manda al log (T-170-02: es texto, no valores). */
const SQL_LOG_MAX = 2000;

/** Largo del SQL en las líneas del reporte agregado, para que sea legible. */
const REPORT_SQL_MAX = 300;

/** Default del resumen periódico: una hora. */
const DEFAULT_SUMMARY_INTERVAL_MS = 3_600_000;

/**
 * Tope de statements violadores distintos que se rastrean fuera del modo
 * inventario.
 *
 * El texto que ve el pool normalmente viene parametrizado, así que la cantidad
 * de fingerprints distintos está acotada por la cantidad de formas de query de
 * la app. Pero un `sql.raw` con un valor interpolado genera un fingerprint nuevo
 * por ejecución, y este proceso vive semanas en pm2: sin tope, el mapa crece sin
 * techo. Al llegar al tope se siguen contando el total y el desglose por tabla,
 * pero no se agregan entradas nuevas (ni se emite un `log.error` nuevo: con
 * 2000 statements violadores distintos la señal ya está dada de sobra).
 */
const MAX_TRACKED_FINGERPRINTS = 2000;

/**
 * Marca de "esta conexión ya está envuelta".
 *
 * El pool **reusa** los objetos `PoolConnection`: cada `getConnection()` puede
 * devolver una conexión que ya pasó por acá. Sin la marca, cada checkout apila
 * un wrapper más sobre el mismo objeto — la misma query se inspeccionaría N
 * veces (contadores inflados) y la pila de llamadas crecería sin techo mientras
 * viva el proceso.
 */
const SENTINEL_MARK = Symbol("el-templo:sentinel-wrapped");

type MarkedConnection = PoolConnection & { [SENTINEL_MARK]?: true };

/**
 * Firma mínima que comparten `query` y `execute` del pool y de la conexión.
 * Existe para poder envolverlos sin `any`: los métodos reales de mysql2 tienen
 * una decena de overloads genéricos que no se pueden reescribir a mano.
 */
type SqlMethod = (this: unknown, ...args: unknown[]) => unknown;

/**
 * El primer argumento de `query`/`execute` en las dos formas que usa Drizzle:
 * un string (`execute`) o un objeto `{ sql, typeCast, rowsAsArray? }` (`query`).
 * Devuelve `undefined` para cualquier otra forma — el sentinel no adivina.
 */
function sqlTextOf(first: unknown): string | undefined {
  if (typeof first === "string") return first;
  if (typeof first === "object" && first !== null && "sql" in first) {
    const { sql } = first as { sql: unknown };
    if (typeof sql === "string") return sql;
  }
  return undefined;
}

/**
 * Envuelve un `query`/`execute` conservando `this` y todos los argumentos.
 *
 * El segundo argumento (`params`) se propaga tal cual y NUNCA se lee: es lo que
 * hace seguro loguear el veredicto (T-170-02).
 */
function wrapSqlMethod<M>(original: M, inspect: (sql: string) => void): M {
  const delegate = original as unknown as SqlMethod;
  const wrapped: SqlMethod = function (
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const texto = sqlTextOf(args[0]);
    // Inspecciona ANTES de delegar: en modo throw, la query violadora no llega
    // a ejecutarse.
    if (texto !== undefined) inspect(texto);
    return delegate.apply(this, args);
  };
  return wrapped as unknown as M;
}

function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : texto.slice(0, max);
}

/**
 * Instala el sentinel sobre un pool mysql2 **antes** de pasarlo a `drizzle()`.
 *
 * Muta la instancia (ver "POR QUÉ MONKEYPATCH…" arriba) y devuelve el handle
 * para que el llamador pueda leer los contadores y —sobre todo— cortar el
 * resumen periódico en el `onClose` del plugin.
 */
export function installSentinel(
  pool: Pool,
  opts: SentinelOptions,
): SentinelHandle {
  const log = opts.log;
  const strictTables = opts.strictTables ?? strictTablesSet();
  const env = process.env.NODE_ENV;
  const mode: SentinelMode =
    opts.mode ?? (env === "test" || env === "development" ? "throw" : "log");
  const inventory = opts.inventory ?? process.env.SENTINEL_INVENTORY === "1";
  const summaryIntervalMs =
    opts.summaryIntervalMs ?? DEFAULT_SUMMARY_INTERVAL_MS;

  const maxFingerprints = inventory
    ? Number.POSITIVE_INFINITY
    : MAX_TRACKED_FINGERPRINTS;

  // ── Contadores in-memory (D-02) ────────────────────────────────────────────
  //
  // ⚠ SON POR PROCESO Y SE RESETEAN EN CADA RESTART DE pm2 (A4 del RESEARCH).
  // Un contador en cero NO significa "no hay violaciones": puede significar
  // "el proceso arrancó hace dos minutos". La métrica de esta fase es una
  // señal de orden de magnitud, no un sistema de métricas.
  const porFingerprint = new Map<string, SentinelFingerprintCount>();
  const porTabla = new Map<string, number>();
  let totalViolations = 0;
  /** Statements distintos que el tope dejó afuera del mapa. */
  let omitidos = 0;

  /** Registra la violación. Devuelve `true` si el statement es NUEVO (D-01). */
  function registrar(sql: string, tables: string[]): boolean {
    totalViolations += 1;
    for (const tabla of tables) {
      porTabla.set(tabla, (porTabla.get(tabla) ?? 0) + 1);
    }

    const fp = fingerprint(sql);
    const existente = porFingerprint.get(fp);
    if (existente !== undefined) {
      existente.count += 1;
      return false;
    }
    if (porFingerprint.size >= maxFingerprints) {
      omitidos += 1;
      return false;
    }
    porFingerprint.set(fp, { sql: fp, tables: [...tables], count: 1 });
    return true;
  }

  /** La matriz de severidad. Separada de {@link inspect} para el try/catch. */
  function evaluar(sql: string): void {
    const veredicto = analyzeSql(sql);
    if (veredicto.kind !== "violation") return;

    const esNueva = registrar(sql, veredicto.tables);
    const strictHit = veredicto.tables.filter((tabla) =>
      strictTables.has(tabla),
    );

    if (mode === "throw") {
      // Módulo migrado ⇒ esto es una regresión, no deuda: cortar acá.
      if (strictHit.length > 0) {
        throw new TenantSentinelError(sql, veredicto.tables);
      }
      // D-08: tabla no strict ⇒ SILENCIO. Ya quedó contada para el inventario;
      // loguearla ensuciaría la salida de la suite entera, porque hoy no hay
      // ningún módulo migrado y casi todo el SQL del repo viola.
      return;
    }

    // mode === "log" (prod/staging): jamás throw (T-170-14), y solo la PRIMERA
    // aparición de cada statement distinto emite (D-01). Sin esta dedup el
    // sentinel taparía los errores reales del dashboard.
    if (!esNueva) return;

    log.error(
      {
        tables: veredicto.tables,
        strict: strictHit.length > 0,
        sql: truncar(sql, SQL_LOG_MAX),
        sqlTruncado: sql.length > SQL_LOG_MAX,
        totalViolations,
        // NUNCA `params`: el texto de arriba viene con placeholders `?`, pero
        // los params llevan datos personales de socios (T-170-02).
      },
      "sentinel de tenancy: query sin tenant_id (primera aparición de este statement)",
    );
  }

  function inspect(sql: string): void {
    try {
      evaluar(sql);
    } catch (err: unknown) {
      // El throw deliberado del gate pasa derecho.
      if (err instanceof TenantSentinelError) throw err;
      // Cualquier otra cosa es un bug del propio sentinel, y un vigilante no
      // puede tirar una query legítima por un bug suyo (T-170-14).
      const message = err instanceof Error ? err.message : String(err);
      log.warn(
        { err: message },
        "sentinel de tenancy: fallo interno inspeccionando un statement (query no afectada)",
      );
    }
  }

  function snapshot(): SentinelCounters {
    return {
      totalViolations,
      distinctFingerprints: porFingerprint.size,
      byTable: Object.fromEntries(porTabla),
      byFingerprint: [...porFingerprint.values()]
        .map((entrada) => ({ ...entrada, tables: [...entrada.tables] }))
        .sort((a, b) => b.count - a.count),
    };
  }

  function report(): string {
    const snap = snapshot();
    const lines: string[] = [];
    lines.push("=".repeat(72));
    lines.push("Inventario del sentinel de tenancy (D-04 / D-08)");
    lines.push("=".repeat(72));
    lines.push(`Violaciones totales:        ${snap.totalViolations}`);
    lines.push(`Statements distintos:       ${snap.distinctFingerprints}`);
    if (omitidos > 0) {
      lines.push(`Statements NO rastreados (tope alcanzado): ${omitidos}`);
    }
    lines.push("");

    lines.push("Por tabla (frecuencia desc):");
    const tablas = Object.entries(snap.byTable).sort((a, b) => b[1] - a[1]);
    for (const [tabla, count] of tablas) {
      lines.push(`  ${String(count).padStart(6)}  ${tabla}`);
    }
    lines.push("");

    lines.push("Por statement (frecuencia desc):");
    for (const entrada of snap.byFingerprint) {
      lines.push(
        `  ${String(entrada.count).padStart(6)}  [${entrada.tables.join(", ")}]`,
      );
      lines.push(`          ${truncar(entrada.sql, REPORT_SQL_MAX)}`);
    }

    return lines.join("\n");
  }

  function stop(): void {
    // El timer del resumen periódico lo agrega el Task 2; `stop()` ya existe
    // acá porque es parte del contrato del handle.
  }

  // ── El wrap de las tres puertas ────────────────────────────────────────────
  pool.query = wrapSqlMethod(pool.query, inspect);
  pool.execute = wrapSqlMethod(pool.execute, inspect);

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function (): Promise<PoolConnection> {
    const conn: MarkedConnection = await originalGetConnection();
    if (conn[SENTINEL_MARK] !== true) {
      conn.query = wrapSqlMethod(conn.query, inspect);
      conn.execute = wrapSqlMethod(conn.execute, inspect);
      conn[SENTINEL_MARK] = true;
    }
    // La MISMA conexión: `release()`, `.connection` y el resto quedan intactos.
    return conn;
  };

  return { inspect, snapshot, report, stop };
}
