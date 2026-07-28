/**
 * Fase 170 (CON-05, D-01/D-07/D-08) — Batería del MECANISMO del sentinel: el
 * wrap del pool y la matriz de severidad.
 *
 * POR QUÉ ES UN TEST UNITARIO Y NO UNO MYSQL-BACKED
 * -------------------------------------------------
 * Lo que este archivo afirma es cómo se COMPORTA `installSentinel` frente a un
 * pool: que sombrea los tres métodos, que decora la conexión una sola vez y que
 * la severidad sale de (entorno × lista strict). Nada de eso necesita una base:
 * el pool es un doble que registra el SQL que recibe y devuelve siempre la misma
 * conexión, igual que el pool real. Sin conexión, sin app de Fastify y sin los
 * ~96 s que el `setupFiles` del repo le cobra a todo archivo de test.
 *
 * Lo que este archivo NO puede probar y le toca a la regresión de integración
 * del plan 06 (`test/tenancy/con-05-sentinel.test.ts`): que el SQL que Drizzle
 * genera de verdad pasa por estos métodos, y que una query adentro de
 * `db.transaction()` la ve el sentinel (Pitfall 1).
 *
 * LAS AFIRMACIONES QUE NO SON OBVIAS
 * ----------------------------------
 * 1. **Doble checkout.** El pool reusa las `PoolConnection`, así que envolver en
 *    cada `getConnection()` apila wrappers y la misma query se inspecciona N
 *    veces. El `it` pide la conexión dos veces y afirma que un statement se
 *    contó UNA sola vez.
 * 2. **Silencio de las no strict (D-08).** No alcanza con "no lanza": hay que
 *    afirmar además que el logger NO recibió nada y que el contador SÍ subió.
 *    Sin las tres mitades, un sentinel que simplemente ignora todo pasaría.
 * 3. **El payload no lleva `params`.** Aserción negativa explícita: es la
 *    mitigación de T-170-02 y no se ve en ninguna aserción positiva.
 * 4. **El timer se unrefea.** Se comprueba con `hasRef() === false` sobre el
 *    `Timeout` real que devolvió `setInterval`, no espiando el método: un timer
 *    con ref cuelga la suite entera (T-170-07).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { TenantLogger } from "../../src/modules/shared/tenant";
import {
  installSentinel,
  TenantSentinelError,
  type SentinelHandle,
} from "../../src/db/sentinel/install";

// ─────────────────────────────────────────────────────────────────────────────
// Dobles
// ─────────────────────────────────────────────────────────────────────────────

/** Las dos formas del primer argumento que usa Drizzle. */
type SqlArg = string | { sql: string };

function textoDe(arg: SqlArg): string {
  return typeof arg === "string" ? arg : arg.sql;
}

/**
 * Conexión falsa. Los métodos viven en el PROTOTIPO a propósito: así
 * `hasOwnProperty` distingue el método original del sombreado por el sentinel.
 */
class FakeConnection {
  readonly calls: string[] = [];

  query(arg: SqlArg): Promise<void> {
    this.calls.push(textoDe(arg));
    return Promise.resolve();
  }

  execute(arg: SqlArg): Promise<void> {
    this.calls.push(textoDe(arg));
    return Promise.resolve();
  }

  release(): void {
    // no-op: el sentinel no lo toca, y el test afirma que sigue existiendo
  }
}

/** Pool falso que REUSA la misma conexión, igual que el pool de mysql2. */
class FakePool {
  readonly calls: string[] = [];
  readonly conn = new FakeConnection();
  /** Cuántas veces se pidió una conexión (el original, no el wrapper). */
  checkouts = 0;

  query(arg: SqlArg): Promise<void> {
    this.calls.push(textoDe(arg));
    return Promise.resolve();
  }

  execute(arg: SqlArg): Promise<void> {
    this.calls.push(textoDe(arg));
    return Promise.resolve();
  }

  getConnection(): Promise<FakeConnection> {
    this.checkouts += 1;
    return Promise.resolve(this.conn);
  }
}

interface LogCall {
  obj: Record<string, unknown>;
  msg: string;
}

interface FakeLogger {
  log: TenantLogger;
  info: LogCall[];
  warn: LogCall[];
  error: LogCall[];
}

function fakeLogger(): FakeLogger {
  const info: LogCall[] = [];
  const warn: LogCall[] = [];
  const error: LogCall[] = [];
  const log: TenantLogger = {
    info: (obj, msg) => {
      info.push({ obj, msg });
    },
    warn: (obj, msg) => {
      warn.push({ obj, msg });
    },
    error: (obj, msg) => {
      error.push({ obj, msg });
    },
  };
  return { log, info, warn, error };
}

function comoPool(fake: FakePool): Pool {
  return fake as unknown as Pool;
}

async function conexionDe(pool: Pool): Promise<FakeConnection> {
  const conn: PoolConnection = await pool.getConnection();
  return conn as unknown as FakeConnection;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL de trabajo. Son formas reales de Drizzle 0.45.1 (salida de `.toSQL()`),
// con `bookings` y `attendance` — dos de las 87 tablas gym-owned reales.
// ─────────────────────────────────────────────────────────────────────────────

const VIOLA_BOOKINGS =
  "select `id`, `member_id` from `bookings` where `bookings`.`id` = ?";
const VIOLA_ATTENDANCE = "select count(*) from `attendance`";
/** El trap de T-170-01: scan completo, con `tenant_id` en la PROYECCIÓN. */
const VIOLA_TRAP = "select `id`, `tenant_id`, `member_id` from `bookings`";
const CUMPLE_BOOKINGS =
  "select `id` from `bookings` where `bookings`.`tenant_id` = ?";

const STRICT_BOOKINGS: ReadonlySet<string> = new Set(["bookings"]);

/** Statement violador de más de 2000 caracteres, para el test del truncado. */
function sqlLargo(): string {
  const columnas = Array.from(
    { length: 300 },
    (_, i) => `\`col_${String(i).padStart(4, "0")}\``,
  ).join(", ");
  return `select ${columnas} from \`bookings\` where \`bookings\`.\`id\` = ?`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("installSentinel — wrap del pool", () => {
  it("sombrea query, execute y getConnection como propiedades PROPIAS del pool", () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const originales = {
      query: pool.query,
      execute: pool.execute,
      getConnection: pool.getConnection,
    };

    // Antes: los métodos viven en el prototipo.
    expect(Object.prototype.hasOwnProperty.call(fake, "query")).toBe(false);

    installSentinel(pool, { log: fakeLogger().log, mode: "log" });

    // Después: propiedades propias que sombrean al prototipo. Es la mitigación
    // de "no usar Proxy": la IDENTIDAD del objeto se conserva (`fastify
    // .decorate("dbPool", pool)` y 18 sitios de test dependen de eso).
    expect(Object.prototype.hasOwnProperty.call(fake, "query")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(fake, "execute")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(fake, "getConnection")).toBe(
      true,
    );
    expect(pool.query).not.toBe(originales.query);
    expect(pool.execute).not.toBe(originales.execute);
    expect(pool.getConnection).not.toBe(originales.getConnection);
  });

  it("query con el objeto { sql } de Drizzle: inspecciona ese SQL y delega en el original", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    const handle = installSentinel(pool, { log: logger.log, mode: "log" });

    // Drizzle llama query() con { sql, typeCast, rowsAsArray }, no con un string.
    await pool.query({
      sql: VIOLA_BOOKINGS,
      typeCast: false,
      rowsAsArray: true,
    });

    expect(fake.calls).toEqual([VIOLA_BOOKINGS]);
    expect(handle.snapshot().totalViolations).toBe(1);
    expect(logger.error).toHaveLength(1);
  });

  it("execute con un string: inspecciona y delega en el original", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(comoPool(fake), {
      log: fakeLogger().log,
      mode: "log",
    });

    await pool.execute(VIOLA_BOOKINGS);

    expect(fake.calls).toEqual([VIOLA_BOOKINGS]);
    expect(handle.snapshot().totalViolations).toBe(1);
  });

  it("getConnection devuelve la MISMA conexión, con query y execute envueltos", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(pool, {
      log: fakeLogger().log,
      mode: "log",
    });

    const conn = await conexionDe(pool);

    // Identidad: el sentinel decora, no reemplaza. `release()` y todo lo demás
    // tienen que seguir siendo los de la conexión real.
    expect(conn).toBe(fake.conn);
    expect(typeof conn.release).toBe("function");
    expect(Object.prototype.hasOwnProperty.call(conn, "query")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(conn, "execute")).toBe(true);

    await conn.query(VIOLA_BOOKINGS);
    await conn.execute(VIOLA_ATTENDANCE);
    expect(conn.calls).toEqual([VIOLA_BOOKINGS, VIOLA_ATTENDANCE]);
    expect(handle.snapshot().totalViolations).toBe(2);
  });

  it("un segundo checkout NO apila wrappers sobre la misma conexión", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(pool, {
      log: fakeLogger().log,
      mode: "log",
    });

    const primera = await conexionDe(pool);
    const segunda = await conexionDe(pool);
    expect(segunda).toBe(primera);
    expect(fake.checkouts).toBe(2);

    await segunda.query(VIOLA_BOOKINGS);

    // Con el wrapper apilado dos veces, esto daría 2 (y una pila de llamadas que
    // crece por cada checkout mientras viva el proceso).
    expect(handle.snapshot().totalViolations).toBe(1);
    expect(fake.conn.calls).toEqual([VIOLA_BOOKINGS]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("severidad — modo throw (test/dev)", () => {
  function montar(): { pool: Pool; fake: FakePool; logger: FakeLogger } {
    const fake = new FakePool();
    const logger = fakeLogger();
    const pool = comoPool(fake);
    installSentinel(pool, {
      log: logger.log,
      mode: "throw",
      strictTables: STRICT_BOOKINGS,
    });
    return { pool, fake, logger };
  }

  it("lanza TenantSentinelError sobre una tabla de la lista strict (D-07)", () => {
    const { pool } = montar();
    expect(() => {
      void pool.execute(VIOLA_BOOKINGS);
    }).toThrow(TenantSentinelError);
  });

  it("el throw es SINCRÓNICO, no una promesa rechazada", () => {
    // Conserva el stack del call site —lo que hace accionable al error— y no se
    // puede perder en una promesa flotante. Para Drizzle es indistinto: llama a
    // estos métodos desde funciones `async`, así que en el `await` ya es un
    // rejection y el rollback de `transaction()` corre igual.
    const { pool } = montar();
    let devolvio: unknown = "no devolvió nada";
    expect(() => {
      devolvio = pool.execute(VIOLA_BOOKINGS);
    }).toThrow(TenantSentinelError);
    expect(devolvio).toBe("no devolvió nada");
  });

  it("el mensaje del error contiene el SQL y qué hacer (D-07)", () => {
    const { pool } = montar();
    let capturado: unknown;
    try {
      void pool.execute(VIOLA_BOOKINGS);
    } catch (err: unknown) {
      capturado = err;
    }
    expect(capturado).toBeInstanceOf(TenantSentinelError);
    const error = capturado as TenantSentinelError;
    // El stack de un throw desde adentro del driver no dice qué query fue: sin
    // el SQL en el mensaje, el error es inaccionable.
    expect(error.message).toContain(VIOLA_BOOKINGS);
    expect(error.sql).toBe(VIOLA_BOOKINGS);
    expect(error.tables).toEqual(["bookings"]);
    expect(error.message).toContain("tenantWhere");
    expect(error.message).toContain("tenant-safe");
  });

  it("el trap de la proyección también lanza: scan sin WHERE con tenant_id entre las columnas", () => {
    const { pool } = montar();
    // Drizzle expande `db.select().from(bookings)` a TODAS las columnas,
    // `tenant_id` incluida. Es la fuga más grave posible y un chequeo ingenuo
    // sobre el string completo la daría por buena (T-170-01).
    expect(() => {
      void pool.execute(VIOLA_TRAP);
    }).toThrow(TenantSentinelError);
  });

  it("en modo throw la query violadora NO llega al driver", () => {
    const { pool, fake } = montar();
    expect(() => {
      void pool.execute(VIOLA_BOOKINGS);
    }).toThrow(TenantSentinelError);
    expect(fake.calls).toEqual([]);
  });

  it("D-08: una tabla NO strict no lanza, no loguea, y solo suma al contador", async () => {
    const { pool, fake, logger } = montar();

    await expect(pool.execute(VIOLA_ATTENDANCE)).resolves.toBeUndefined();

    expect(fake.calls).toEqual([VIOLA_ATTENDANCE]);
    // Las tres mitades: sin throw, sin ruido en la salida de la suite, y contada.
    expect(logger.error).toHaveLength(0);
    expect(logger.warn).toHaveLength(0);
    expect(logger.info).toHaveLength(0);
  });

  it("D-08: la violación no strict SÍ queda en los contadores", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(pool, {
      log: fakeLogger().log,
      mode: "throw",
      strictTables: STRICT_BOOKINGS,
    });

    await pool.execute(VIOLA_ATTENDANCE);
    const snap = handle.snapshot();
    expect(snap.totalViolations).toBe(1);
    expect(snap.byTable).toEqual({ attendance: 1 });
  });

  it("ni el control de transacción ni una query que cumple cuentan como violación", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(pool, {
      log: fakeLogger().log,
      mode: "throw",
      strictTables: STRICT_BOOKINGS,
    });

    const conn = await conexionDe(pool);
    // Drizzle manda el control de transacción POR EL MISMO CANAL que las
    // queries: si esto contara (o peor, lanzara), reventaría toda transacción.
    await conn.query("begin");
    await conn.query(CUMPLE_BOOKINGS);
    await conn.query("commit");

    expect(handle.snapshot().totalViolations).toBe(0);
    expect(conn.calls).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("severidad — modo log (prod/staging)", () => {
  it("D-01: el mismo statement 3 veces emite UN solo log.error y cuenta 3", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    const handle = installSentinel(pool, { log: logger.log, mode: "log" });

    await pool.execute(VIOLA_BOOKINGS);
    await pool.execute(VIOLA_BOOKINGS);
    await pool.execute(VIOLA_BOOKINGS);

    // Sin la dedup, el sentinel flaggearía casi todo el tráfico de prod (hoy
    // cero módulos migrados) y taparía los errores reales del dashboard.
    expect(logger.error).toHaveLength(1);
    const snap = handle.snapshot();
    expect(snap.totalViolations).toBe(3);
    expect(snap.distinctFingerprints).toBe(1);
    expect(snap.byFingerprint[0].count).toBe(3);
  });

  it("dos statements distintos emiten dos log.error", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    const handle = installSentinel(pool, { log: logger.log, mode: "log" });

    await pool.execute(VIOLA_BOOKINGS);
    await pool.execute(VIOLA_ATTENDANCE);

    expect(logger.error).toHaveLength(2);
    expect(handle.snapshot().distinctFingerprints).toBe(2);
  });

  it("T-170-14: en modo log una tabla STRICT tampoco lanza", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    installSentinel(pool, {
      log: logger.log,
      mode: "log",
      strictTables: STRICT_BOOKINGS,
    });

    // En producción el sentinel jamás hace throw, ni siquiera sobre un módulo
    // migrado (decidido con Nacho 2026-07-02, README §4.2): un tripwire que tira
    // una operación legítima es peor que la deuda que vigila.
    await expect(pool.execute(VIOLA_BOOKINGS)).resolves.toBeUndefined();
    expect(fake.calls).toEqual([VIOLA_BOOKINGS]);
    expect(logger.error).toHaveLength(1);
    expect(logger.error[0].obj.strict).toBe(true);
  });

  it("T-170-02: el objeto logueado NO tiene la clave params", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    installSentinel(pool, { log: logger.log, mode: "log" });

    // El segundo argumento son los valores reales: datos personales de socios.
    await pool.execute(VIOLA_BOOKINGS, [12345]);

    expect(logger.error).toHaveLength(1);
    const payload = logger.error[0].obj;
    expect(Object.keys(payload)).not.toContain("params");
    expect(payload).not.toHaveProperty("params");
    // Y el SQL sí está: es texto con placeholders, sin valores.
    expect(payload.sql).toBe(VIOLA_BOOKINGS);
    expect(JSON.stringify(payload)).not.toContain("12345");
  });

  it("T-170-02: el SQL logueado se trunca a 2000 caracteres", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    installSentinel(pool, { log: logger.log, mode: "log" });

    const largo = sqlLargo();
    expect(largo.length).toBeGreaterThan(2000);
    await pool.execute(largo);

    expect(logger.error).toHaveLength(1);
    expect(logger.error[0].obj.sql).toHaveLength(2000);
    expect(logger.error[0].obj.sqlTruncado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("resumen periódico (D-02)", () => {
  const INTERVALO = 987_654;

  it("T-170-07: en modo throw NO se crea ningún timer", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const fake = new FakePool();
    const handle = installSentinel(comoPool(fake), {
      log: fakeLogger().log,
      mode: "throw",
      summaryIntervalMs: INTERVALO,
    });

    expect(spy.mock.calls.some(([, ms]) => ms === INTERVALO)).toBe(false);
    handle.stop();
  });

  it("summaryIntervalMs 0 desactiva el timer también en modo log", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const fake = new FakePool();
    const handle = installSentinel(comoPool(fake), {
      log: fakeLogger().log,
      mode: "log",
      summaryIntervalMs: 0,
    });

    expect(spy).not.toHaveBeenCalled();
    handle.stop();
  });

  it("T-170-07: en modo log el timer se crea, se unrefea, y stop() lo limpia (dos veces no lanza)", () => {
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const fake = new FakePool();
    const handle: SentinelHandle = installSentinel(comoPool(fake), {
      log: fakeLogger().log,
      mode: "log",
      summaryIntervalMs: INTERVALO,
    });

    const indice = setSpy.mock.calls.findIndex(([, ms]) => ms === INTERVALO);
    expect(indice).toBeGreaterThanOrEqual(0);
    const timer = setSpy.mock.results[indice].value as NodeJS.Timeout;

    // Sin `.unref()` este timer mantiene vivo el event loop y la suite entera
    // queda colgada después del último test (Pitfall 4). `hasRef()` lo prueba
    // sobre el Timeout real, sin espiar el método.
    expect(timer.hasRef()).toBe(false);

    handle.stop();
    expect(clearSpy).toHaveBeenCalledWith(timer);

    clearSpy.mockClear();
    expect(() => {
      handle.stop();
    }).not.toThrow();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("el resumen sale por log.info y no por log.error (T-170-13)", async () => {
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const fake = new FakePool();
    const pool = comoPool(fake);
    const logger = fakeLogger();
    const handle = installSentinel(pool, {
      log: logger.log,
      mode: "log",
      summaryIntervalMs: INTERVALO,
    });

    await pool.execute(VIOLA_BOOKINGS);
    await pool.execute(VIOLA_BOOKINGS);
    logger.error.length = 0;

    // Se dispara el callback del timer a mano: lo que importa es el CANAL y el
    // contenido, no la espera de una hora.
    const indice = setSpy.mock.calls.findIndex(([, ms]) => ms === INTERVALO);
    const callback = setSpy.mock.calls[indice][0] as () => void;
    callback();
    handle.stop();

    expect(logger.error).toHaveLength(0);
    expect(logger.info).toHaveLength(1);
    const payload = logger.info[0].obj;
    expect(payload.totalViolations).toBe(2);
    expect(payload.distinctFingerprints).toBe(1);
    expect(payload.nuevasDesdeElResumenAnterior).toBe(2);
    // `instrument.ts` manda a Sentry los `error` de Pino: esta deuda conocida no
    // puede entrar por ese canal y tapar los errores reales.
    expect(payload).not.toHaveProperty("params");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("report() — inventario (D-08)", () => {
  it("lista la violación acumulada con su tabla y su count", async () => {
    const fake = new FakePool();
    const pool = comoPool(fake);
    const handle = installSentinel(pool, {
      log: fakeLogger().log,
      mode: "throw",
      strictTables: STRICT_BOOKINGS,
      inventory: true,
    });

    await pool.execute(VIOLA_ATTENDANCE);
    await pool.execute(VIOLA_ATTENDANCE);

    const texto = handle.report();
    expect(texto).toContain("attendance");
    expect(texto).toContain("2");
    expect(texto).toContain(VIOLA_ATTENDANCE);
    // Devuelve el reporte; imprimirlo es del llamador.
    expect(typeof texto).toBe("string");
  });

  it("el reporte de un sentinel sin violaciones no inventa filas", () => {
    const fake = new FakePool();
    const handle = installSentinel(comoPool(fake), {
      log: fakeLogger().log,
      mode: "throw",
    });

    const texto = handle.report();
    expect(texto).toContain("Violaciones totales:        0");
    expect(texto).toContain("Statements distintos:       0");
  });
});
