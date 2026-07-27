/**
 * Fase 168 Plan 05: test de introspección del DDL de la migración 0196
 * (`0196_tenant_unique_contracts.sql`, tanda D — CON-01 y CON-02).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Dos capas distintas pueden afirmar "la 0196 se aplicó" sin que sea cierto:
 *
 *   1. El runner de producción (`src/db/run-migrations.ts`) tiene la heurística
 *      `alreadyApplied`: en cuanto un statement falla con "Duplicate key name" /
 *      "Can't DROP", TODOS los errores posteriores del mismo archivo se saltean
 *      y el archivo se registra igual en `_migrations`.
 *   2. El provisioning de la DB de tests (`test/setup.ts`, líneas ~199-215)
 *      aplica las migraciones con `SET FOREIGN_KEY_CHECKS=0` y tolera una lista
 *      larga de errores, entre ellos **literalmente `"Can't DROP"`**, y después
 *      inserta la fila de `_migrations` igual.
 *
 * Para esta migración en particular eso es lo peor que podría pasar: la 0196 son
 * doce `DROP INDEX` + doce `ADD UNIQUE INDEX`. Un `DROP INDEX` con el nombre
 * equivocado cae justo en el error tolerado, la suite entera queda en verde y la
 * base se queda con la unique GLOBAL vieja — es decir, sin el contrato que la
 * fase vino a construir, y con el gimnasio 2 imposibilitado de dar de alta un
 * socio con un email que el gimnasio 1 ya usó.
 *
 * Por eso este archivo NO le pregunta a `_migrations` si la 0196 corrió: le
 * pregunta a `INFORMATION_SCHEMA` por el resultado real —nombres de índice,
 * columnas, orden de columnas y `NON_UNIQUE`—, y exige además que los doce
 * nombres viejos hayan DESAPARECIDO. Presente lo nuevo y ausente lo viejo son
 * dos afirmaciones distintas: una migración a medias puede cumplir la primera.
 *
 * Cobertura:
 *   (a) Los 12 contratos compuestos con `tenant_id` en `SEQ_IN_INDEX = 1`, sus
 *       columnas en el orden exacto y `NON_UNIQUE = 0`.
 *   (b) Los 4 índices secundarios de D-05 con `NON_UNIQUE = 1`, y los 12 nombres
 *       viejos ausentes de TODA la base.
 *   (c) Idempotencia: la 0196 aparece exactamente una vez en `_migrations`.
 *   (d) El verificador `verify-tenant-uniques.ts` corrido como gate de CI, con
 *       un test por categoría de hallazgo (segundo `describe` del archivo).
 *
 * SON DOCE CONTRATOS, NO ONCE. La lista D-01 del doc 06 §1-D tenía once. El
 * doceavo —`subscription_plans (tenant_id, name, country)`— lo encontró el
 * verificador del plan 168-03 recorriendo `INFORMATION_SCHEMA`: el índice
 * `ux_subscription_plans_name_country` existía en MySQL desde la migración 0091
 * y nunca se declaró en el schema Drizzle, así que el inventario del doc 05
 * (armado leyendo los schema files) lo dio por inexistente. Franco aprobó
 * convertirlo dentro de la misma 0196 el 2026-07-27.
 *
 * Este archivo es de SOLO LECTURA: no ejecuta DDL, no inserta, no borra y no
 * llama a `cleanAllTestData`. Solo `SELECT` sobre `INFORMATION_SCHEMA` y sobre
 * `_migrations`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";

interface IndexRow {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  SEQ_IN_INDEX: number;
  NON_UNIQUE: number;
}

/** La columna que ancla el aislamiento. Un solo literal en todo el archivo. */
const TENANT_COLUMN = "tenant_id";

/**
 * Los 12 contratos que la 0196 dejó, con el orden EXACTO de columnas que tiene
 * que devolver `INFORMATION_SCHEMA.STATISTICS`. Escritos como dato y no como
 * asserts sueltos para que el mensaje de un fallo pueda nombrar el contrato.
 */
const CONTRATOS_COMPUESTOS: readonly {
  tabla: string;
  indice: string;
  columnas: readonly string[];
}[] = [
  {
    tabla: "users",
    indice: "uq_users_tenant_email",
    columnas: [TENANT_COLUMN, "email"],
  },
  {
    tabla: "users",
    indice: "uq_users_tenant_dni",
    columnas: [TENANT_COLUMN, "dni"],
  },
  {
    tabla: "users",
    indice: "uq_users_tenant_referral_code",
    columnas: [TENANT_COLUMN, "referral_code"],
  },
  {
    tabla: "branches",
    indice: "uq_branches_tenant_code",
    columnas: [TENANT_COLUMN, "code"],
  },
  {
    tabla: "cost_centers",
    indice: "uq_cost_centers_tenant_name_country",
    columnas: [TENANT_COLUMN, "name", "country"],
  },
  {
    tabla: "promo_plans",
    indice: "uq_promo_plans_tenant_promo_code",
    columnas: [TENANT_COLUMN, "promo_code"],
  },
  {
    tabla: "campaign_unsubscribes",
    indice: "uq_campaign_unsubscribes_tenant_email",
    columnas: [TENANT_COLUMN, "email"],
  },
  {
    tabla: "notification_templates",
    indice: "uq_notification_templates_tenant_key",
    columnas: [TENANT_COLUMN, "template_key"],
  },
  {
    tabla: "day_modes",
    indice: "uq_day_modes_tenant_day_of_week",
    columnas: [TENANT_COLUMN, "day_of_week"],
  },
  {
    tabla: "holidays",
    indice: "uq_holidays_tenant_country_date",
    columnas: [TENANT_COLUMN, "country", "date"],
  },
  {
    tabla: "formats",
    indice: "uq_formats_tenant_name",
    columnas: [TENANT_COLUMN, "name"],
  },
  // El doceavo: no estaba en D-01, lo encontró el gate del plan 168-03.
  {
    tabla: "subscription_plans",
    indice: "uq_subscription_plans_tenant_name_country",
    columnas: [TENANT_COLUMN, "name", "country"],
  },
];

/**
 * Los cuatro contratos de TRES columnas. Se verifican fila por fila, con su
 * `SEQ_IN_INDEX` explícito: si solo se mirara la primera columna, una unique
 * degradada a `(tenant_id, name)` pasaría en verde.
 */
const CONTRATOS_DE_TRES_COLUMNAS = CONTRATOS_COMPUESTOS.filter(
  (contrato) => contrato.columnas.length === 3,
);

/**
 * Índices secundarios de D-05: al anteponer `tenant_id`, la unique deja de
 * servir para buscar por el valor pelado, y estos cuatro lookups del código
 * quedarían sin índice (login por email, registro por DNI, canje de código de
 * referido, filtro `NOT EXISTS` del envío de campañas).
 *
 * Tienen que ser NO-unique: si alguno quedara con `NON_UNIQUE = 0` estaría
 * reponiendo la unicidad global que la migración vino a sacar.
 */
const INDICES_SECUNDARIOS: readonly {
  tabla: string;
  indice: string;
  columna: string;
}[] = [
  { tabla: "users", indice: "idx_users_email", columna: "email" },
  { tabla: "users", indice: "idx_users_dni", columna: "dni" },
  {
    tabla: "users",
    indice: "idx_users_referral_code",
    columna: "referral_code",
  },
  {
    tabla: "campaign_unsubscribes",
    indice: "idx_campaign_unsubscribes_email",
    columna: "email",
  },
];

/**
 * Los 12 nombres que la 0196 dropeó. Ninguno puede sobrevivir en NINGUNA tabla
 * de la base: si uno queda vivo, el `DROP INDEX` correspondiente falló con el
 * "Can't DROP" que `test/setup.ts` tolera y la unique global sigue en pie.
 */
const INDICES_VIEJOS: readonly string[] = [
  "users_email_unique",
  "users_dni_unique",
  "users_referral_code_unique",
  "branches_code_unique",
  "uq_cost_centers_name_country",
  "promo_plans_promo_code_unique",
  "uniq_campaign_unsubscribe_email",
  "notification_templates_template_key_unique",
  "day_modes_day_of_week_unique",
  "idx_holidays_country_date",
  "formats_name_unique",
  "ux_subscription_plans_name_country",
];

/** Lista explícita, nunca un `LIKE`: ver el comentario del Test 4. */
const MIGRACIONES_DE_LA_FASE = ["0196_tenant_unique_contracts.sql"];

/**
 * mysql2 devuelve `[rows, fields]`; drizzle `execute` lo pasa tal cual para SQL
 * crudo. Se normaliza acá una sola vez para no repetir el cast en cada test
 * (mismo patrón que `test/migrations/0190-0191-tenants.test.ts`).
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

describe("Migración 0196 — los 12 contratos de unicidad por tenant", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── (a) Los 12 contratos compuestos ────────────────────────────────────
  it("Test 1: los 12 contratos existen como UNIQUE con sus columnas en el orden exacto", async () => {
    const hallazgos: string[] = [];

    for (const contrato of CONTRATOS_COMPUESTOS) {
      const filas = await getIndexRows(app, contrato.tabla, contrato.indice);
      const esperado = contrato.columnas.join(", ");

      if (filas.length === 0) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: NO EXISTE. Esperado UNIQUE (${esperado}). ` +
            `El ADD UNIQUE INDEX de la 0196 no llegó a aplicarse en esta base — revisar ` +
            `INFORMATION_SCHEMA.STATISTICS, nunca _migrations.`,
        );
        continue;
      }

      const encontrado = filas.map((fila) => fila.COLUMN_NAME).join(", ");
      if (encontrado !== esperado) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: columnas (${encontrado}), esperado (${esperado}). ` +
            `El orden importa: la unique tiene que arrancar con ${TENANT_COLUMN} para ser también ` +
            `el índice-prefijo del filtro por tenant (CON-02).`,
        );
      }

      // NON_UNIQUE viene numérico (0/1): el repo lo castea siempre con Number().
      if (Number(filas[0].NON_UNIQUE) !== 0) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: NON_UNIQUE = ${Number(filas[0].NON_UNIQUE)}, esperado 0. ` +
            `Existe pero como índice común: no hay contrato de unicidad, dos socios podrían ` +
            `repetir el valor dentro del mismo gimnasio.`,
        );
      }
    }

    expect(
      hallazgos,
      `Contratos de la migración 0196 ausentes o mal formados:\n${hallazgos.join("\n")}\n` +
        `Que hacer: correr 'pnpm db:verify-uniques' contra esta base y comparar con ` +
        `src/db/migrations/0196_tenant_unique_contracts.sql. Un "Can't DROP" tolerado por ` +
        `test/setup.ts deja la migración registrada en _migrations aunque no se haya aplicado.`,
    ).toEqual([]);
  });

  it("Test 1b: los 12 contratos tienen tenant_id en SEQ_IN_INDEX = 1", async () => {
    const hallazgos: string[] = [];

    for (const contrato of CONTRATOS_COMPUESTOS) {
      const filas = await getIndexRows(app, contrato.tabla, contrato.indice);
      const primera = filas.find((fila) => Number(fila.SEQ_IN_INDEX) === 1);

      if (!primera) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: no devolvió ninguna fila con SEQ_IN_INDEX = 1 ` +
            `(el índice no existe en esta base).`,
        );
        continue;
      }
      if (primera.COLUMN_NAME !== TENANT_COLUMN) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: la primera columna es \`${primera.COLUMN_NAME}\`, ` +
            `esperado \`${TENANT_COLUMN}\`.`,
        );
      }
    }

    expect(
      hallazgos,
      `Contratos que NO arrancan con ${TENANT_COLUMN}:\n${hallazgos.join("\n")}\n` +
        `Es el corazón de CON-01: con la columna del tenant en segunda posición el índice ` +
        `sigue siendo una unique GLOBAL y el gimnasio 2 colisionaría con el 1.`,
    ).toEqual([]);
  });

  it("Test 1c: los contratos de tres columnas se verifican completos, columna por columna", async () => {
    // Sin este test, una unique degradada a (tenant_id, name) pasaría el Test 1b
    // en verde: la primera columna seguiría siendo la correcta.
    const hallazgos: string[] = [];

    for (const contrato of CONTRATOS_DE_TRES_COLUMNAS) {
      const filas = await getIndexRows(app, contrato.tabla, contrato.indice);

      if (filas.length !== 3) {
        hallazgos.push(
          `${contrato.tabla}.${contrato.indice}: ${filas.length} columnas, esperadas 3 ` +
            `(${contrato.columnas.join(", ")}).`,
        );
        continue;
      }
      contrato.columnas.forEach((columna, indice) => {
        const fila = filas[indice];
        if (Number(fila.SEQ_IN_INDEX) !== indice + 1) {
          hallazgos.push(
            `${contrato.tabla}.${contrato.indice}: la columna \`${fila.COLUMN_NAME}\` tiene ` +
              `SEQ_IN_INDEX = ${Number(fila.SEQ_IN_INDEX)}, esperado ${indice + 1}.`,
          );
        }
        if (fila.COLUMN_NAME !== columna) {
          hallazgos.push(
            `${contrato.tabla}.${contrato.indice}: en la posición ${indice + 1} hay ` +
              `\`${fila.COLUMN_NAME}\`, esperado \`${columna}\`.`,
          );
        }
      });
    }

    expect(
      hallazgos,
      `Contratos compuestos de tres columnas incompletos o desordenados:\n${hallazgos.join("\n")}\n` +
        `cost_centers y subscription_plans son (tenant_id, name, country) y holidays es ` +
        `(tenant_id, country, date). Perder la tercera columna hace el contrato MÁS ` +
        `restrictivo de lo que dice el schema, y eso rompe altas que hoy son legales.`,
    ).toEqual([]);

    // La lista no puede quedar vacía por un filtro mal escrito: si esto fuera 0,
    // el bucle de arriba no habría verificado nada y el test pasaría igual.
    expect(
      CONTRATOS_DE_TRES_COLUMNAS.length,
      "Se esperaban 3 contratos de tres columnas (cost_centers, holidays, subscription_plans)",
    ).toBe(3);
  });

  // ─── (b) Índices secundarios y ausencia de los nombres viejos ───────────
  it("Test 2: los 4 índices secundarios de D-05 existen como NO-unique sobre su columna", async () => {
    const hallazgos: string[] = [];

    for (const secundario of INDICES_SECUNDARIOS) {
      const filas = await getIndexRows(
        app,
        secundario.tabla,
        secundario.indice,
      );

      if (filas.length === 0) {
        hallazgos.push(
          `${secundario.tabla}.${secundario.indice}: NO EXISTE. Sin él, el lookup por ` +
            `\`${secundario.columna}\` pelado queda sin índice — es un full scan en el camino ` +
            `de login / registro / canje de referido / envío de campañas.`,
        );
        continue;
      }
      if (filas[0].COLUMN_NAME !== secundario.columna) {
        hallazgos.push(
          `${secundario.tabla}.${secundario.indice}: primera columna \`${filas[0].COLUMN_NAME}\`, ` +
            `esperada \`${secundario.columna}\`.`,
        );
      }
      if (Number(filas[0].NON_UNIQUE) !== 1) {
        hallazgos.push(
          `${secundario.tabla}.${secundario.indice}: NON_UNIQUE = ${Number(filas[0].NON_UNIQUE)}, ` +
            `esperado 1. Un índice secundario UNIQUE repondría la unicidad global que la 0196 ` +
            `vino a sacar: el gimnasio 2 volvería a colisionar con el 1.`,
        );
      }
    }

    expect(
      hallazgos,
      `Índices secundarios de D-05 ausentes o mal formados:\n${hallazgos.join("\n")}\n` +
        `Los declara la 0196 y también el schema Drizzle (plan 168-02).`,
    ).toEqual([]);
  });

  it("Test 3: ninguno de los 12 nombres de índice viejos sobrevive en ninguna tabla de la base", async () => {
    // "Presente lo nuevo" y "ausente lo viejo" son dos afirmaciones distintas:
    // si el ADD funcionó y el DROP falló con el "Can't DROP" que test/setup.ts
    // tolera, la tabla queda con las DOS uniques y la vieja —global— sigue
    // rechazando el alta del segundo gimnasio.
    const filas = await queryRows<{ TABLE_NAME: string; INDEX_NAME: string }>(
      app,
      sql`SELECT DISTINCT TABLE_NAME, INDEX_NAME
            FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND INDEX_NAME IN (${sql.join(
               INDICES_VIEJOS.map((nombre) => sql`${nombre}`),
               sql`, `,
             )})
           ORDER BY TABLE_NAME, INDEX_NAME`,
    );

    const sobrevivientes = filas.map(
      (fila) => `${fila.TABLE_NAME}.${fila.INDEX_NAME}`,
    );

    expect(
      sobrevivientes,
      `Índices globales viejos que la 0196 debía dropear y siguen vivos: ` +
        `${sobrevivientes.join(", ")}. El DROP INDEX correspondiente falló y el error entra ` +
        `en la lista tolerada de test/setup.ts ("Can't DROP"), así que la migración quedó ` +
        `registrada en _migrations igual. Que hacer: aplicar el ALTER TABLE faltante de ` +
        `src/db/migrations/0196_tenant_unique_contracts.sql sobre esta base.`,
    ).toEqual([]);

    // La query tiene que haber mirado los 12 nombres: si la lista se vaciara por
    // un refactor, el toEqual([]) de arriba pasaría sin verificar nada.
    expect(
      INDICES_VIEJOS.length,
      "La 0196 dropea 12 índices viejos (11 de D-01 + subscription_plans)",
    ).toBe(12);
  });

  // ─── (c) Idempotencia ───────────────────────────────────────────────────
  it("Test 4: la 0196 aparece exactamente una vez en _migrations", async () => {
    // MySQL LIKE no soporta clases de caracteres ('019[6]%' matchea los
    // caracteres literales y devuelve 0 siempre): lista explícita de nombres.
    const filas = await queryRows<{ name: string; n: number }>(
      app,
      sql`SELECT name, COUNT(*) AS n
            FROM _migrations
           WHERE name IN (${sql.join(
             MIGRACIONES_DE_LA_FASE.map((nombre) => sql`${nombre}`),
             sql`, `,
           )})
           GROUP BY name
           ORDER BY name`,
    );

    expect(
      filas.map((fila) => fila.name),
      `La 0196 no figura en _migrations de esta base. Los tests de arriba miran ` +
        `INFORMATION_SCHEMA y son la verdad del contrato, pero el runner tiene que haberla ` +
        `registrado igual: sin la fila, el próximo deploy la volvería a aplicar.`,
    ).toEqual(MIGRACIONES_DE_LA_FASE);

    for (const fila of filas) {
      expect(
        Number(fila.n),
        `${fila.name} figura ${Number(fila.n)} veces en _migrations: el runner la aplicó dos ` +
          `veces (el segundo pase habría fallado con "Can't DROP" sobre índices ya dropeados).`,
      ).toBe(1);
    }
  });
});
