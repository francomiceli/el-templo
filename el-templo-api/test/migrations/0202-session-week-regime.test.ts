/**
 * Fase 159 Plan 04 (SEM-05, D-18): test de introspección + datos del ancla
 * `session_week_regime` (migración DDL 0202) y su backfill retroactivo
 * (migración de datos 0203, W12-W26).
 *
 * POR QUÉ ESTE ARCHIVO NO LE PREGUNTA A `_migrations`
 * ----------------------------------------------------
 * Mismo motivo que `test/migrations/0196-tenant-unique-contracts.test.ts`:
 * `test/setup.ts` aplica las migraciones tolerando una lista larga de errores
 * y registra el archivo en `_migrations` igual, así que "figura en
 * _migrations" no prueba que el DDL o los INSERT hayan corrido de verdad. Este
 * archivo le pregunta a `INFORMATION_SCHEMA` (forma real del índice único) y a
 * los datos reales de `session_week_regime` (filas W21-W26 verbatim del
 * CONTEXT).
 *
 * Cobertura:
 *   (a) La unique `uq_session_week_regime_tenant_week_day` existe con
 *       `tenant_id` en SEQ_IN_INDEX=1, seguido de `week` y `day`, NON_UNIQUE=0.
 *   (b) D-18 (histórico intacto): re-ejecutar los mismos statements de
 *       `0203_backfill_regime_w12_w26.sql` (leídos del archivo real, no
 *       duplicados a mano) dos veces seguidas NO cambia el conteo de filas de
 *       `sessions` ni duplica filas en `session_week_regime` — el backfill
 *       SOLO inserta, y sus INSERT son `WHERE NOT EXISTS`.
 *   (c) Las 12 filas W21-W26 (relevamiento SSH prod 2026-08-13) coinciden
 *       exactamente con la tabla de 159-CONTEXT.md §evidencia_prod.
 *
 * Este archivo es de solo-lectura sobre `sessions`: nunca hace INSERT/UPDATE/
 * DELETE ahí, solo `COUNT(*)`. La única escritura es la re-ejecución del
 * propio backfill 0203 (idempotente por diseño) sobre `session_week_regime`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { createTestApp } from "../helpers";

interface IndexRow {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  SEQ_IN_INDEX: number;
  NON_UNIQUE: number;
}

interface RegimeRow {
  week: number;
  day: string;
  inferred_mode: string;
  source: string;
}

const MIGRATION_0203_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0203_backfill_regime_w12_w26.sql",
);

/**
 * Las filas W21-W26 verbatim de 159-CONTEXT.md §evidencia_prod (relevamiento
 * SSH 2026-08-13). Escritas como dato, no como asserts sueltos, para que un
 * fallo pueda nombrar exactamente qué (semana, día) no matchea.
 */
const W21_W26_ESPERADO: readonly {
  week: number;
  day: string;
  inferred_mode: string;
}[] = [
  { week: 21, day: "miercoles", inferred_mode: "combos" },
  { week: 21, day: "jueves", inferred_mode: "tecnica" },
  { week: 22, day: "miercoles", inferred_mode: "tecnica" },
  { week: 22, day: "jueves", inferred_mode: "combos" },
  { week: 23, day: "miercoles", inferred_mode: "combos" },
  { week: 23, day: "jueves", inferred_mode: "tecnica" },
  { week: 24, day: "miercoles", inferred_mode: "tecnica" },
  { week: 24, day: "jueves", inferred_mode: "combos" },
  { week: 25, day: "miercoles", inferred_mode: "tecnica" },
  { week: 25, day: "jueves", inferred_mode: "combos" },
  { week: 26, day: "miercoles", inferred_mode: "tecnica" },
  { week: 26, day: "jueves", inferred_mode: "combos" },
];

/**
 * mysql2 devuelve `[rows, fields]`; drizzle `execute` lo pasa tal cual para
 * SQL crudo. Mismo patrón que 0196/0192-0195.
 */
async function queryRows<T>(
  app: FastifyInstance,
  statement: SQL,
): Promise<T[]> {
  const result = (await app.db.execute(statement)) as unknown as [T[]];
  const rows = Array.isArray(result) ? result[0] : (result as unknown as T[]);
  return Array.isArray(rows) ? rows : [];
}

async function getIndexRows(
  app: FastifyInstance,
  tableName: string,
  indexName: string,
): Promise<IndexRow[]> {
  return queryRows<IndexRow>(
    app,
    sql`SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND INDEX_NAME = ${indexName}
        ORDER BY SEQ_IN_INDEX`,
  );
}

/**
 * Parsea un archivo de migración .sql en statements ejecutables, con la
 * MISMA lógica que `test/setup.ts` (split por `;`, después descarta líneas
 * `--`). Reusar la lógica real del runner en vez de una regex ad-hoc es lo
 * que hace que este test detecte de verdad un `;` colado en un comentario
 * (rompería el split real, no solo el de este archivo).
 */
function parseStatements(sqlText: string): string[] {
  return sqlText
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

describe("Migración 0202/0203 — ancla session_week_regime (SEM-05, D-18)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── (a) Forma del índice único ─────────────────────────────────────────
  it("Test 1: uq_session_week_regime_tenant_week_day es UNIQUE (tenant_id, week, day) en ese orden", async () => {
    const filas = await getIndexRows(
      app,
      "session_week_regime",
      "uq_session_week_regime_tenant_week_day",
    );

    expect(
      filas.length,
      `Se esperaban 3 columnas en el índice, encontradas ${filas.length}. ` +
        `¿0202_session_week_regime.sql se aplicó en esta base?`,
    ).toBe(3);

    const columnas = filas.map((f) => f.COLUMN_NAME);
    expect(columnas).toEqual(["tenant_id", "week", "day"]);

    // El corazón de CON-01: tenant_id tiene que ser la PRIMERA columna, si no
    // la unique sigue siendo global y el gimnasio 2 colisionaría con el 1.
    expect(Number(filas[0].SEQ_IN_INDEX)).toBe(1);
    expect(filas[0].COLUMN_NAME).toBe("tenant_id");

    for (const fila of filas) {
      expect(
        Number(fila.NON_UNIQUE),
        `${fila.COLUMN_NAME}: NON_UNIQUE = ${Number(fila.NON_UNIQUE)}, esperado 0 (debe ser UNIQUE).`,
      ).toBe(0);
    }
  });

  // ─── (b) D-18: histórico de `sessions` intacto + idempotencia ──────────
  it("Test 2: re-ejecutar el backfill 0203 no cambia el conteo de `sessions` ni duplica filas", async () => {
    const sqlText = fs.readFileSync(MIGRATION_0203_PATH, "utf-8");
    const statements = parseStatements(sqlText);

    expect(
      statements.length,
      "El backfill 0203 debería tener 30 INSERT (15 semanas W12-W26 x 2 días).",
    ).toBe(30);
    for (const stmt of statements) {
      expect(stmt.toUpperCase().startsWith("INSERT INTO SESSION_WEEK_REGIME")).toBe(
        true,
      );
    }

    const countSessions = async (): Promise<number> => {
      const [{ n }] = await queryRows<{ n: number }>(
        app,
        sql`SELECT COUNT(*) AS n FROM sessions`,
      );
      return Number(n);
    };
    const countRegime = async (): Promise<number> => {
      const [{ n }] = await queryRows<{ n: number }>(
        app,
        sql`SELECT COUNT(*) AS n FROM session_week_regime WHERE tenant_id = 1 AND week BETWEEN 12 AND 26`,
      );
      return Number(n);
    };

    const sessionsBefore = await countSessions();
    const regimeBefore = await countRegime();

    // Re-aplica el backfill dos veces seguidas — mismos statements que 0203,
    // leídos del archivo real (no una copia a mano que pueda divergir).
    for (let pass = 0; pass < 2; pass++) {
      for (const stmt of statements) {
        await app.db.execute(sql.raw(stmt));
      }
    }

    const sessionsAfter = await countSessions();
    const regimeAfter = await countRegime();

    expect(
      sessionsAfter,
      `sessions pasó de ${sessionsBefore} a ${sessionsAfter} filas al re-aplicar 0203 — ` +
        `el backfill debe SOLO insertar en session_week_regime (D-18, histórico intacto).`,
    ).toBe(sessionsBefore);

    expect(
      regimeAfter,
      `session_week_regime (W12-26, tenant 1) pasó de ${regimeBefore} a ${regimeAfter} filas ` +
        `tras dos re-aplicaciones — los INSERT deberían ser WHERE NOT EXISTS (idempotentes).`,
    ).toBe(regimeBefore);

    // No vacuo: el backfill tiene que haber dejado exactamente 30 filas
    // (15 semanas W12-W26 x 2 días) para tenant 1.
    expect(regimeAfter).toBe(30);
  });

  // ─── (c) Filas W21-W26 verbatim del CONTEXT ─────────────────────────────
  it("Test 3: las 12 filas W21-W26 coinciden con 159-CONTEXT.md §evidencia_prod", async () => {
    const filas = await queryRows<RegimeRow>(
      app,
      sql`SELECT week, day, inferred_mode, source
          FROM session_week_regime
          WHERE tenant_id = 1 AND week BETWEEN 21 AND 26
          ORDER BY week, day`,
    );

    const hallazgos: string[] = [];

    for (const esperado of W21_W26_ESPERADO) {
      const encontrada = filas.find(
        (f) => f.week === esperado.week && f.day === esperado.day,
      );
      if (!encontrada) {
        hallazgos.push(
          `W${esperado.week}-${esperado.day}: NO EXISTE en session_week_regime.`,
        );
        continue;
      }
      if (encontrada.inferred_mode !== esperado.inferred_mode) {
        hallazgos.push(
          `W${esperado.week}-${esperado.day}: inferred_mode='${encontrada.inferred_mode}', esperado '${esperado.inferred_mode}'.`,
        );
      }
      if (encontrada.source !== "manual") {
        hallazgos.push(
          `W${esperado.week}-${esperado.day}: source='${encontrada.source}', esperado 'manual' (relevamiento SSH, no firma).`,
        );
      }
    }

    expect(
      hallazgos,
      `Filas W21-W26 que no coinciden con el CONTEXT:\n${hallazgos.join("\n")}`,
    ).toEqual([]);

    expect(
      filas.length,
      "Deberían existir exactamente 12 filas para W21-W26 (6 semanas x 2 días).",
    ).toBe(12);
  });
});
