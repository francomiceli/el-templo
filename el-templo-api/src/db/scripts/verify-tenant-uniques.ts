/**
 * CON-01 / CON-02 (fase 168) — Verificación de los contratos de unicidad y de
 * los índices por `tenant_id`.
 *
 * QUÉ PRUEBA
 * ----------
 * 1. Que TODA unique de una tabla gym-owned o arranca con `tenant_id`
 *    (`SEQ_IN_INDEX = 1`) o está clasificada con motivo escrito en
 *    `src/db/tenant-tables.ts` — lista M8 o allowlist (D-14). Es fail-closed: una
 *    unique global nueva que nadie clasificó cuenta como discrepancia.
 * 2. Que TODA tabla gym-owned tiene algún índice cuyo primer campo es
 *    `tenant_id`, unique o no — los auto-creados por las FK `fk_<tabla>_tenant`
 *    de la fase 167 cuentan (CON-02 / D-11a).
 * 3. Que TODA tabla física de la base está clasificada: gym-owned, exenta o
 *    infraestructura del tooling (D-11b).
 * 4. Que ninguna entrada de los dos registros apunta a un índice que ya no
 *    existe (typo, rename, índice borrado).
 * 5. Que los 11 contratos convertidos por la migración 0196 existen realmente,
 *    con `tenant_id` en la primera posición y el resto de las columnas en orden
 *    (verificación estructural de CON-01).
 *
 * POR QUÉ NO MIRA `_migrations`
 * -----------------------------
 * Mismo motivo que su hermano `verify-tenant-backfill.ts`: la heurística
 * `alreadyApplied` del runner (`src/db/run-migrations.ts`) saltea en silencio
 * todos los errores posteriores al primero de tipo "Duplicate"/"Can't DROP" y
 * registra la migración igual. Para la 0196 eso es doblemente peligroso, porque
 * el provisioning de la DB de tests (`test/setup.ts`) tolera literalmente
 * `"Can't DROP"`: un `DROP INDEX` con el nombre equivocado pasaría en verde.
 * La única prueba independiente es interrogar a INFORMATION_SCHEMA.
 *
 * SOLO LECTURA
 * ------------
 * Este script no ejecuta más que `SELECT` (mitigación T-168-12). Es seguro
 * correrlo contra producción.
 *
 * CÓMO SE CORRE
 * -------------
 *   local / desarrollo:  cd el-templo-api && pnpm db:verify-uniques
 *   base de test:        lo invoca el test de introspección de la fase 168
 *   staging / prod:      en el servidor, sobre la build compilada
 *                        NODE_ENV=production node dist/db/scripts/verify-tenant-uniques.js
 *
 * La carga de env es la misma del runner de migraciones: `.env.production` si
 * `NODE_ENV=production`, si no `.env.development`, y después `.env`.
 *
 * Códigos de salida del CLI: 0 sin discrepancias, 1 con discrepancias, 2 ante
 * error de conexión o de uso.
 *
 * PRIMER STATEMENT: `SELECT DATABASE()`
 * -------------------------------------
 * Staging y producción comparten el mismo host MySQL (`eltemplo_staging` y
 * `eltemplo` son dos bases del mismo server). El nombre de la base va primero en
 * el reporte para que nadie lea el resultado equivocado (T-168-13).
 *
 * La lista canónica de tablas y la clasificación de uniques salen de
 * `src/db/tenant-tables.ts` — este archivo no duplica ningún nombre salvo los 11
 * contratos convertidos, que son justamente lo que viene a afirmar.
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";
import {
  GYM_OWNED_TABLES,
  TENANT_EXEMPT_TABLES,
  TENANT_GLOBAL_UNIQUES,
  TENANT_UNIQUE_ALLOWLIST,
  isGymOwnedTable,
  isPlatformPhysicalTable,
  isTenantGlobalUnique,
  isAllowedGlobalUnique,
  tenantUniqueMotive,
} from "../tenant-tables";
import type { QueryFn } from "./verify-tenant-backfill";

export type { QueryFn };

/** La columna que ancla el aislamiento. Un solo literal en todo el archivo. */
const TENANT_COLUMN = "tenant_id";

/**
 * Tablas de backup creadas por migraciones (`users_lead_backup_0183` vive solo
 * en producción, `users_lead_backup_0170` solo donde corrió la 0170).
 *
 * Son efímeras y asimétricas entre bases: si contaran como "tabla sin
 * clasificar" bloquearían el cierre de la fase por un artefacto de una migración
 * vieja (T-168-14). Se detectan por patrón y salen en `warnings`.
 */
const BACKUP_TABLE_PATTERN = /_backup(_\d+)?$/i;

/**
 * Los 11 contratos que la migración 0196 convirtió (D-01), con el orden exacto
 * de columnas que tiene que devolver INFORMATION_SCHEMA.
 *
 * Están enumerados acá y no en `tenant-tables.ts` a propósito: `tenant-tables`
 * clasifica lo que queda global, este archivo afirma lo que dejó de estarlo. Es
 * la verificación estructural de CON-01 y el único lugar del repo donde el
 * contrato "qué unique quedó y con qué columnas" está escrito como dato.
 */
const CONVERTED_CONTRACTS: readonly {
  table: string;
  indexName: string;
  columns: readonly string[];
}[] = [
  {
    table: "users",
    indexName: "uq_users_tenant_email",
    columns: [TENANT_COLUMN, "email"],
  },
  {
    table: "users",
    indexName: "uq_users_tenant_dni",
    columns: [TENANT_COLUMN, "dni"],
  },
  {
    table: "users",
    indexName: "uq_users_tenant_referral_code",
    columns: [TENANT_COLUMN, "referral_code"],
  },
  {
    table: "branches",
    indexName: "uq_branches_tenant_code",
    columns: [TENANT_COLUMN, "code"],
  },
  {
    table: "cost_centers",
    indexName: "uq_cost_centers_tenant_name_country",
    columns: [TENANT_COLUMN, "name", "country"],
  },
  {
    table: "promo_plans",
    indexName: "uq_promo_plans_tenant_promo_code",
    columns: [TENANT_COLUMN, "promo_code"],
  },
  {
    table: "campaign_unsubscribes",
    indexName: "uq_campaign_unsubscribes_tenant_email",
    columns: [TENANT_COLUMN, "email"],
  },
  {
    table: "notification_templates",
    indexName: "uq_notification_templates_tenant_key",
    columns: [TENANT_COLUMN, "template_key"],
  },
  {
    table: "day_modes",
    indexName: "uq_day_modes_tenant_day_of_week",
    columns: [TENANT_COLUMN, "day_of_week"],
  },
  {
    table: "holidays",
    indexName: "uq_holidays_tenant_country_date",
    columns: [TENANT_COLUMN, "country", "date"],
  },
  {
    table: "formats",
    indexName: "uq_formats_tenant_name",
    columns: [TENANT_COLUMN, "name"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Forma del reporte
// ─────────────────────────────────────────────────────────────────────────────

/** Una unique global de tabla gym-owned que nadie clasificó. Es el hallazgo. */
export interface UnclassifiedUnique {
  table: string;
  indexName: string;
  /** La columna que quedó en `SEQ_IN_INDEX = 1` en vez de `tenant_id`. */
  firstColumn: string;
  /** Todas las columnas del índice, en orden. */
  columns: string[];
}

/** Entrada de un registro que apunta a un índice inexistente en esta base. */
export interface StaleClassification {
  key: string;
  register: "TENANT_GLOBAL_UNIQUES" | "TENANT_UNIQUE_ALLOWLIST";
  motive: string;
}

/** Un contrato de D-01 ausente o con las columnas en el orden equivocado. */
export interface ContractIssue {
  table: string;
  indexName: string;
  expected: string;
  found: string;
}

export interface TenantUniquesReport {
  /** Base contra la que corrió la verificación. Se imprime antes que nada. */
  database: string;
  /** Tablas gym-owned que existen físicamente y se pudieron verificar. */
  gymOwnedChecked: number;
  /** Uniques de tablas gym-owned evaluadas (sin `PRIMARY`). */
  uniquesChecked: number;
  /** D-14: uniques sin `tenant_id` al frente y sin clasificar. */
  uniquesMissingTenantPrefix: UnclassifiedUnique[];
  /** CON-02 / D-11a: tablas gym-owned sin índice con `tenant_id` primero. */
  tablesWithoutTenantIndex: string[];
  /** D-11b: tablas físicas que no están en ninguna de las tres listas. */
  unclassifiedTables: string[];
  /** Clasificaciones podridas: apuntan a un índice que no existe. */
  staleClassifications: StaleClassification[];
  /** CON-01 estructural: contratos de D-01 ausentes o mal ordenados. */
  missingConvertedContracts: ContractIssue[];
  /** Observaciones que NO son discrepancias. */
  warnings: string[];
  /** Suma de los cinco arrays de hallazgo. Los `warnings` NO suman. */
  discrepancies: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspección
// ─────────────────────────────────────────────────────────────────────────────

/** Un índice físico, ya agrupado por sus columnas en orden. */
interface IndexMeta {
  table: string;
  indexName: string;
  /** Columnas ordenadas por `SEQ_IN_INDEX`. */
  columns: string[];
  isUnique: boolean;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** Paso 0 — guard de base. Primer statement de todo, siempre (T-168-13). */
async function stepDatabaseGuard(query: QueryFn): Promise<string> {
  const rows = await query("SELECT DATABASE() AS db");
  const name = toStringOrNull(rows[0]?.db);
  if (!name) {
    throw new Error(
      "SELECT DATABASE() no devolvio ninguna base: la conexion no tiene base seleccionada",
    );
  }
  return name;
}

/**
 * Todos los índices de la base, agrupados. Una sola consulta: agrupar en JS es
 * más barato y más legible que un `GROUP_CONCAT` que además trunca a
 * `@@group_concat_max_len`.
 *
 * `PRIMARY` se excluye acá, de una vez: INFORMATION_SCHEMA lo devuelve con
 * `NON_UNIQUE = 0` y colarlo haría que TODA tabla apareciera con una "unique
 * global" sobre su `id`.
 */
async function loadIndexes(query: QueryFn): Promise<IndexMeta[]> {
  const rows = await query(
    `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME <> 'PRIMARY'
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  );

  const byKey = new Map<string, IndexMeta>();
  for (const row of rows) {
    const table = toStringOrNull(row.TABLE_NAME);
    const indexName = toStringOrNull(row.INDEX_NAME);
    const column = toStringOrNull(row.COLUMN_NAME);
    if (!table || !indexName || !column) continue;

    const key = `${table}.${indexName}`;
    let meta = byKey.get(key);
    if (!meta) {
      // NON_UNIQUE viene numerico (0/1): el repo lo castea siempre con Number().
      meta = {
        table,
        indexName,
        columns: [],
        isUnique: Number(row.NON_UNIQUE) === 0,
      };
      byKey.set(key, meta);
    }
    meta.columns.push(column);
  }

  return [...byKey.values()];
}

/** Nombres de las tablas físicas de la base (solo BASE TABLE, sin vistas). */
async function loadPhysicalTables(query: QueryFn): Promise<string[]> {
  const rows = await query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
  );
  return rows
    .map((row) => toStringOrNull(row.TABLE_NAME))
    .filter((name): name is string => name !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificación
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyTenantUniques(
  query: QueryFn,
): Promise<TenantUniquesReport> {
  const database = await stepDatabaseGuard(query);

  const indexes = await loadIndexes(query);
  const physicalTables = await loadPhysicalTables(query);

  const warnings: string[] = [];
  const physicalSet = new Set(physicalTables);

  // Una tabla de la lista que no existe físicamente no se puede verificar. No es
  // discrepancia de esta fase (el gate schema-vs-lista es test/db/tenant-tables),
  // pero callarlo haría que el reporte mintiera sobre su propia cobertura.
  const checkableTables = GYM_OWNED_TABLES.filter((table) =>
    physicalSet.has(table),
  );
  if (checkableTables.length !== GYM_OWNED_TABLES.length) {
    const absent = GYM_OWNED_TABLES.filter(
      (table) => !physicalSet.has(table),
    ).join(", ");
    warnings.push(
      `Tablas gym-owned de la lista que NO existen en esta base (no verificadas): ${absent}`,
    );
  }

  // ── D-14: uniques de tablas gym-owned sin tenant_id al frente ──────────────
  const gymOwnedUniques = indexes.filter(
    (idx) =>
      idx.isUnique && isGymOwnedTable(idx.table) && physicalSet.has(idx.table),
  );

  const uniquesMissingTenantPrefix: UnclassifiedUnique[] = [];
  const classifiedM8: string[] = [];
  for (const idx of gymOwnedUniques) {
    if (idx.columns[0] === TENANT_COLUMN) continue;
    if (isTenantGlobalUnique(idx.table, idx.indexName)) {
      classifiedM8.push(`${idx.table}.${idx.indexName}`);
      continue;
    }
    if (isAllowedGlobalUnique(idx.table, idx.indexName)) continue;
    uniquesMissingTenantPrefix.push({
      table: idx.table,
      indexName: idx.indexName,
      firstColumn: idx.columns[0] ?? "(sin columnas)",
      columns: idx.columns,
    });
  }

  // ── CON-02 / D-11a: toda gym-owned con un índice de prefijo tenant_id ──────
  const tablesWithTenantIndex = new Set(
    indexes
      .filter((idx) => idx.columns[0] === TENANT_COLUMN)
      .map((idx) => idx.table),
  );
  const tablesWithoutTenantIndex = checkableTables
    .filter((table) => !tablesWithTenantIndex.has(table))
    .slice()
    .sort();

  // ── D-11b: toda tabla física clasificada ──────────────────────────────────
  const exemptSet = new Set<string>(TENANT_EXEMPT_TABLES);
  const unclassifiedTables: string[] = [];
  const backupTables: string[] = [];
  for (const table of physicalTables) {
    if (isGymOwnedTable(table)) continue;
    if (exemptSet.has(table)) continue;
    if (isPlatformPhysicalTable(table)) continue;
    if (BACKUP_TABLE_PATTERN.test(table)) {
      backupTables.push(table);
      continue;
    }
    unclassifiedTables.push(table);
  }
  unclassifiedTables.sort();

  // ── Clasificaciones podridas ──────────────────────────────────────────────
  const liveUniqueKeys = new Set(
    indexes
      .filter((idx) => idx.isUnique)
      .map((idx) => `${idx.table}.${idx.indexName}`),
  );
  const staleClassifications: StaleClassification[] = [];
  for (const [key, motive] of Object.entries(TENANT_GLOBAL_UNIQUES)) {
    if (!liveUniqueKeys.has(key)) {
      staleClassifications.push({
        key,
        register: "TENANT_GLOBAL_UNIQUES",
        motive,
      });
    }
  }
  for (const [key, motive] of Object.entries(TENANT_UNIQUE_ALLOWLIST)) {
    if (!liveUniqueKeys.has(key)) {
      staleClassifications.push({
        key,
        register: "TENANT_UNIQUE_ALLOWLIST",
        motive,
      });
    }
  }

  // ── CON-01 estructural: los 11 contratos convertidos por la 0196 ──────────
  const indexByKey = new Map(
    indexes.map((idx) => [`${idx.table}.${idx.indexName}`, idx]),
  );
  const missingConvertedContracts: ContractIssue[] = [];
  for (const contract of CONVERTED_CONTRACTS) {
    const expected = contract.columns.join(", ");
    const found = indexByKey.get(`${contract.table}.${contract.indexName}`);
    if (!found) {
      missingConvertedContracts.push({
        table: contract.table,
        indexName: contract.indexName,
        expected,
        found: "el indice NO existe en esta base",
      });
      continue;
    }
    if (!found.isUnique) {
      missingConvertedContracts.push({
        table: contract.table,
        indexName: contract.indexName,
        expected,
        found: `existe pero NO es unique (NON_UNIQUE = 1): ${found.columns.join(", ")}`,
      });
      continue;
    }
    if (found.columns.join(", ") !== expected) {
      missingConvertedContracts.push({
        table: contract.table,
        indexName: contract.indexName,
        expected,
        found: found.columns.join(", "),
      });
    }
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (backupTables.length > 0) {
    warnings.push(
      `Tablas de backup de migraciones (efimeras, NO se clasifican a proposito): ${backupTables.sort().join(", ")}`,
    );
  }
  warnings.push(
    `Uniques M8 encontradas y correctamente clasificadas como globales: ${classifiedM8.length} de ${Object.keys(TENANT_GLOBAL_UNIQUES).length}`,
  );
  for (const key of classifiedM8.sort()) {
    const [table, indexName] = splitKey(key);
    warnings.push(
      `  M8 ${key} — ${tenantUniqueMotive(table, indexName) ?? ""}`,
    );
  }

  const discrepancies =
    uniquesMissingTenantPrefix.length +
    tablesWithoutTenantIndex.length +
    unclassifiedTables.length +
    staleClassifications.length +
    missingConvertedContracts.length;

  return {
    database,
    gymOwnedChecked: checkableTables.length,
    uniquesChecked: gymOwnedUniques.length,
    uniquesMissingTenantPrefix,
    tablesWithoutTenantIndex,
    unclassifiedTables,
    staleClassifications,
    missingConvertedContracts,
    warnings,
    discrepancies,
  };
}

/**
 * Parte `"tabla.indice"` en sus dos mitades por el PRIMER punto: los nombres de
 * índice pueden contener puntos, los de tabla no en este repo.
 */
function splitKey(key: string): [string, string] {
  const at = key.indexOf(".");
  return at < 0 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────────────────────────────────────

export function formatReport(report: TenantUniquesReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(`Base de datos: ${report.database}`);
  lines.push("=".repeat(72));
  lines.push(`Tablas gym-owned verificadas:   ${report.gymOwnedChecked}`);
  lines.push(`Uniques gym-owned evaluadas:    ${report.uniquesChecked}`);
  lines.push("");

  lines.push(
    `Uniques SIN prefijo tenant_id y SIN clasificar (uniquesMissingTenantPrefix): ${report.uniquesMissingTenantPrefix.length}`,
  );
  for (const issue of report.uniquesMissingTenantPrefix) {
    lines.push(
      `  - ${issue.table}.${issue.indexName} (${issue.columns.join(", ")}) — la primera columna es \`${issue.firstColumn}\`.`,
    );
    lines.push(
      `      Que hacer: o la unique pasa a (tenant_id, ${issue.columns.join(", ")}) en una migracion, o se clasifica en src/db/tenant-tables.ts con el motivo escrito.`,
    );
  }

  lines.push(
    `Tablas gym-owned SIN indice de prefijo tenant_id (tablesWithoutTenantIndex): ${report.tablesWithoutTenantIndex.length}`,
  );
  for (const table of report.tablesWithoutTenantIndex) {
    lines.push(
      `  - ${table} — falta la FK fk_${table}_tenant o un INDEX(tenant_id) explicito (CON-02).`,
    );
  }

  lines.push(
    `Tablas fisicas SIN clasificar (unclassifiedTables): ${report.unclassifiedTables.length}`,
  );
  for (const table of report.unclassifiedTables) {
    lines.push(
      `  - ${table} — tiene que entrar en GYM_OWNED_TABLES, TENANT_EXEMPT_TABLES o PLATFORM_PHYSICAL_TABLES.`,
    );
  }

  lines.push(
    `Clasificaciones podridas (staleClassifications): ${report.staleClassifications.length}`,
  );
  for (const entry of report.staleClassifications) {
    lines.push(
      `  - ${entry.key} figura en ${entry.register} pero NO existe como unique en esta base (typo, rename o indice borrado).`,
    );
  }

  lines.push(
    `Contratos de la 0196 ausentes o mal ordenados (missingConvertedContracts): ${report.missingConvertedContracts.length}`,
  );
  for (const issue of report.missingConvertedContracts) {
    lines.push(
      `  - ${issue.table}.${issue.indexName}: esperado (${issue.expected}) / encontrado: ${issue.found}`,
    );
  }

  lines.push("");
  lines.push(`DISCREPANCIAS: ${report.discrepancies}`);
  lines.push("");

  lines.push("--- Advertencias (NO son discrepancias) ---");
  for (const warning of report.warnings) {
    lines.push(`  - ${warning}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  // Misma carga de env que src/db/run-migrations.ts.
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "eltemplo",
  });

  try {
    const query: QueryFn = async (statement) => {
      const [rows] = await connection.query(statement);
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    };
    const report = await verifyTenantUniques(query);
    console.log(formatReport(report));
    return report.discrepancies === 0 ? 0 : 1;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`verify-tenant-uniques fallo: ${message}`);
      process.exit(2);
    });
}
