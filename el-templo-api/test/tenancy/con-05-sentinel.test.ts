/**
 * Fase 170 Plan 06 (CON-05): el sentinel, probado contra el SQL que Drizzle
 * emite DE VERDAD.
 *
 * POR QUÉ ESTE ARCHIVO SÍ TOCA LA DB (a diferencia de los unitarios de los
 * planes 02 y 04)
 * ----------------------------------------------------------------------------
 * `test/unit/sentinel-analyze.test.ts` prueba la DECISIÓN con strings escritos a
 * mano y `test/unit/sentinel-install.test.ts` prueba el MECANISMO con un pool
 * falso. Ninguno de los dos puede probar lo único que importa acá: que el texto
 * que Drizzle le entrega al driver es el que el sentinel sabe leer, y que el
 * camino de `getConnection` que usa `db.transaction()` pasa por el wrap. Un pool
 * falso no reproduce ni la expansión de la proyección del ORM (que es la fuga
 * más grave posible, ver abajo) ni la traza real de una transacción. Por eso
 * este archivo abre MySQL: el costo del provisioning del worker se paga una vez
 * y compra la única evidencia que vale.
 *
 * EL ERROR LLEGA ENVUELTO (hallazgo de esta batería)
 * --------------------------------------------------
 * A través de Drizzle, lo que se atrapa NO es el `TenantSentinelError`: es un
 * `DrizzleQueryError` ("Failed query: …") que lo lleva en `cause`. Los
 * unitarios del plan 04 llaman a `pool.query` derecho y ven el error pelado, así
 * que este contrato solo se podía descubrir acá. Consecuencia práctica: un
 * `catch (e) { if (e instanceof TenantSentinelError) … }` escrito sobre una
 * llamada al ORM NO va a entrar nunca — hay que recorrer la cadena de `cause`
 * (helper `sentinelErrorDe` más abajo). El mensaje accionable igual se ve,
 * porque Node y Vitest imprimen el `[cause]`.
 *
 * QUÉ HACER CUANDO ESTE GUARD SE CAIGA
 * ------------------------------------
 * **No saques la tabla de la lista strict y no desactives el sentinel.** Si un
 * `TenantSentinelError` aparece donde antes no aparecía, la query que lo disparó
 * NO TIENE FILTRO DE TENANT: arreglala con `tenantWhere(tabla, ctx)` si es una
 * lectura o con `tenantValues(ctx, {...})` si es una escritura; y si el acceso
 * es global a propósito, escribí la exención con su motivo
 * (`tenant-safe: <motivo>`, comentario de bloque en el sitio del acceso). Sacar
 * la tabla de `TENANT_STRICT_MODULES` apaga el gate de TODO el módulo migrado, y
 * desactivar el sentinel apaga la capa 3 entera.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import {
  installSentinel,
  TenantSentinelError,
  type SentinelHandle,
} from "../../src/db/sentinel/install";
import {
  tenantWhere,
  tenantValues,
  type TenantLogger,
} from "../../src/modules/shared/tenant";

describe("sentinel — SQL real de Drizzle", () => {
  /**
   * D-07: la lista strict se INYECTA. `users` es una tabla gym-owned real, pero
   * NO se declara ningún módulo migrado en `src/db/tenant-tables.ts` — este plan
   * no toca ese archivo. Así se prueba el throw con SQL real sin encender el
   * gate para el resto de la suite.
   */
  const STRICT = new Set(["users"]);
  const CTX = { tenantId: 1 };

  /** Logger falso: nada de este archivo llega a un canal que persista. */
  const logueado: {
    info: unknown[];
    warn: unknown[];
    error: unknown[];
  } = { info: [], warn: [], error: [] };
  const logFalso: TenantLogger = {
    info: (obj) => void logueado.info.push(obj),
    warn: (obj) => void logueado.warn.push(obj),
    error: (obj) => void logueado.error.push(obj),
  };

  let pool: mysql.Pool;
  let db: MySql2Database<typeof schema>;
  let sentinel: SentinelHandle;

  beforeAll(() => {
    // Pool propio, contra la base per-worker que dejó test/setup.ts (DB_NAME).
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
    });

    sentinel = installSentinel(pool, {
      log: logFalso,
      strictTables: STRICT,
      mode: "throw",
      inventory: true,
      // Sin timer: en modo throw el sentinel no lo crea, pero dejarlo explícito
      // hace que este archivo no dependa de esa implementación para terminar.
      summaryIntervalMs: 0,
    });

    db = drizzle(pool, { schema, mode: "default" });
  });

  afterAll(async () => {
    sentinel.stop();
    await pool.end();
  });

  /** Captura el error tanto si el throw es sincrónico como si es un rejection. */
  async function capturar(fn: () => unknown): Promise<unknown> {
    try {
      await fn();
    } catch (err: unknown) {
      return err;
    }
    return undefined;
  }

  /**
   * Busca el {@link TenantSentinelError} en la cadena de `cause`.
   *
   * HALLAZGO DE ESTA BATERÍA (y motivo de que exista): **Drizzle NO propaga el
   * error del driver tal cual**. Lo envuelve en un `DrizzleQueryError`
   * ("Failed query: select …") y deja el original en `cause`. Los tests
   * unitarios del plan 04 llaman a `pool.query` derecho y ven el error pelado;
   * a través del ORM —o sea, como lo va a ver cualquier desarrollador— llega
   * envuelto. La actionabilidad se conserva porque Node y Vitest imprimen la
   * cadena de `cause`, pero un `instanceof` sobre lo que se atrapa da FALSE, y
   * eso hay que saberlo antes de escribir un `catch` que discrimine.
   */
  function sentinelErrorDe(err: unknown): TenantSentinelError | undefined {
    let actual: unknown = err;
    for (let salto = 0; salto < 5; salto += 1) {
      if (actual instanceof TenantSentinelError) return actual;
      if (!(actual instanceof Error)) return undefined;
      actual = actual.cause;
    }
    return undefined;
  }

  it("EL TRAP DE LA PROYECCIÓN: un select sin where sobre una tabla strict lanza, aunque Drizzle expanda tenant_id en la proyección", async () => {
    // ⚠ ACÁ ESTÁ LA FUGA MÁS GRAVE POSIBLE, Y POR QUÉ ESTE `it` EXISTE.
    // `db.select().from(schema.users)` NO llega al driver como
    // "select * from users": Drizzle EXPANDE la proyección a todas las columnas
    // de la tabla, `tenant_id` incluida. O sea que el scan completo sin filtro
    // —la peor fuga imaginable: devuelve los socios de TODOS los gimnasios—
    // llega al pool como `select \`id\`, \`tenant_id\`, ... from \`users\``.
    // Un sentinel que buscara el literal `tenant_id` en el string COMPLETO
    // diría "cumple" y la dejaría pasar. Por eso analyze.ts descarta todo lo
    // anterior al primer `from` en un SELECT, y por eso esta aserción se hace
    // contra SQL real y no contra un string escrito a mano.
    const err = await capturar(() => db.select().from(schema.users));

    const sentinelErr = sentinelErrorDe(err);
    expect(
      sentinelErr,
      "un select sin where sobre una tabla strict NO disparó el sentinel. Si el veredicto quedó en 'ok', casi seguro se cayó el recorte de la proyección en analyze.ts: Drizzle expande tenant_id en la lista de columnas, así que buscar el literal en el string completo deja pasar el scan sin filtro.",
    ).toBeInstanceOf(TenantSentinelError);
    if (sentinelErr === undefined) return;
    expect(sentinelErr.tables).toContain("users");
    // El SQL en el mensaje es requisito de D-07: sin él el error no es
    // accionable (el stack sale de adentro del driver y no dice qué query fue).
    expect(sentinelErr.message).toContain(sentinelErr.sql);
    expect(sentinelErr.sql).toMatch(/select/i);
    expect(sentinelErr.sql).toMatch(/`users`/);
    // Y la prueba de que el trap es real: el tenant_id SÍ estaba en el texto.
    expect(sentinelErr.sql).toContain("tenant_id");
  });

  it("la MISMA consulta con tenantWhere no lanza", async () => {
    const err = await capturar(() =>
      db
        .select()
        .from(schema.users)
        .where(tenantWhere(schema.users, CTX))
        .limit(1),
    );

    expect(err).toBeUndefined();
  });

  it("REGRESIÓN PITFALL 1: una query sin filtro de tenant DENTRO de db.transaction() también se ve", async () => {
    // Este `it` es el único que se pone rojo si alguien saca el wrap de
    // `getConnection` en src/db/sentinel/install.ts. No es un detalle: dentro de
    // una transacción, Drizzle hace `getConnection()` una vez y a partir de ahí
    // NO vuelve a llamar a pool.query nunca más. Sin ese wrap, el camino
    // transaccional —65 call sites de `.transaction(` en 25 archivos, o sea
    // prácticamente todas las escrituras del sistema— quedaría 100 % ciego, y
    // la suite entera seguiría en verde.
    const err = await capturar(() =>
      db.transaction(async (tx) => {
        await tx.select().from(schema.users).limit(1);
      }),
    );

    const sentinelErr = sentinelErrorDe(err);
    expect(
      sentinelErr,
      "una query sin tenant_id DENTRO de db.transaction() pasó sin que el sentinel la viera. Es el wrap de getConnection en src/db/sentinel/install.ts: sin él, Drizzle saca la conexión del pool una sola vez y todas las queries de la transacción esquivan pool.query. NO borres este it — devolvé el wrap.",
    ).toBeInstanceOf(TenantSentinelError);
    expect(sentinelErr?.tables).toContain("users");
  });

  it("el TenantSentinelError llega ENVUELTO por Drizzle y viaja en la cadena de cause", async () => {
    // Contrato descubierto por esta batería, y no por los unitarios: a través
    // del ORM lo que se atrapa NO es el TenantSentinelError, es el
    // DrizzleQueryError que lo envuelve. Quien escriba un `catch` que
    // discrimine por `instanceof` tiene que recorrer `cause`. Si un upgrade de
    // Drizzle deja de envolver (o pierde el `cause`), este it lo dice.
    const err = await capturar(() => db.select().from(schema.users));

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TenantSentinelError);
    expect((err as Error).cause).toBeInstanceOf(TenantSentinelError);
    // La actionabilidad se conserva: el SQL sigue estando en el mensaje del
    // error de adentro, que es lo que Node imprime bajo "[cause]".
    expect(((err as Error).cause as TenantSentinelError).message).toContain(
      "tenantWhere",
    );
  });

  it("una transacción que solo hace queries cumplidoras commitea sin error (begin/commit no disparan)", async () => {
    // Pitfall 3: Drizzle emite el control de transacción POR EL MISMO CANAL que
    // las queries (`conn.query("begin")`). Si el skiplist de no-DML de
    // analyze.ts fallara, el sentinel marcaría `begin`/`commit` como violación y
    // en modo throw reventaría TODA transacción legítima del sistema.
    const filas = await db.transaction(async (tx) => {
      return tx
        .select()
        .from(schema.users)
        .where(tenantWhere(schema.users, CTX))
        .limit(1);
    });

    expect(Array.isArray(filas)).toBe(true);
  });

  it("una tabla gym-owned NO strict sin filtro de tenant: no lanza, no loguea, pero se cuenta (D-08)", async () => {
    const antes = sentinel.snapshot();

    const err = await capturar(() =>
      db.select().from(schema.bookings).limit(1),
    );
    expect(err).toBeUndefined();

    const despues = sentinel.snapshot();
    expect(despues.totalViolations).toBeGreaterThan(antes.totalViolations);
    expect(despues.byTable.bookings).toBeGreaterThan(0);
    // El silencio de D-08 es literal: con cero módulos migrados, loguear cada
    // violación no-strict ensuciaría la salida de la suite entera.
    expect(logueado.error).toEqual([]);
    expect(logueado.warn).toEqual([]);
  });

  it("modo inventario: report() incluye la tabla no strict con su contador", () => {
    const reporte = sentinel.report();

    expect(reporte).toContain("Inventario del sentinel de tenancy");
    expect(reporte).toContain("inventario: sí");
    expect(reporte).toContain("bookings");
    // El desglose por tabla del `it` anterior tiene que estar reflejado.
    expect(reporte).toMatch(/\d+\s+bookings/);
  });

  it("un INSERT con tenantValues sobre una tabla strict no se castiga", async () => {
    const [sede] = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(tenantWhere(schema.branches, CTX))
      .limit(1);
    expect(
      sede,
      "la base per-worker no tiene ninguna sede sembrada",
    ).toBeDefined();

    const email = `sentinel-con05-${Date.now()}@test.local`;
    const err = await capturar(() =>
      db.insert(schema.users).values(
        tenantValues(CTX, {
          email,
          passwordHash: "no-usada",
          firstName: "Sentinel",
          lastName: "CON-05",
          role: "member" as const,
          branchId: sede.id,
        }),
      ),
    );

    expect(err).toBeUndefined();

    // Limpieza — y de paso, un DELETE cumplidor sobre la misma tabla strict.
    await db
      .delete(schema.users)
      .where(
        and(tenantWhere(schema.users, CTX), eq(schema.users.email, email)),
      );
  });
});
