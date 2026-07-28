/**
 * COL-02 (fase 167) — Verificación del backfill de `tenant_id`.
 *
 * QUÉ PRUEBA
 * ----------
 * 1. Que las 87 tablas gym-owned de `src/db/tenant-tables.ts` tienen la columna
 *    `tenant_id` bien formada (INT NOT NULL DEFAULT 1 con FK a `tenants`).
 * 2. Que las 2 exclusiones de diseño (`system_settings`, `labs_inquiries`) NO la
 *    tienen.
 * 3. Que todas las filas apuntan a un tenant que existe.
 * 4. Que el valor backfilleado COINCIDE con el derivado por las cadenas de FK —
 *    tanto por las FKs declaradas (leídas del schema en tiempo de ejecución)
 *    como por las FKs lógicas sin constraint de la mina M9, que están enumeradas
 *    a mano porque la DB no las conoce.
 * 5. Y separa, como caso LEGÍTIMO y no como error, las tablas [SIN-ANCLA] y las
 *    filas parciales de la mina M4.
 *
 * POR QUÉ NO MIRA `_migrations`
 * -----------------------------
 * A propósito. El runner (`src/db/run-migrations.ts`) tiene una heurística
 * (`alreadyApplied`): en cuanto un statement falla con un error de tipo
 * "Duplicate"/"already exists", TODOS los errores siguientes del mismo archivo
 * se saltean en silencio y la migración se registra igual en `_migrations`. Una
 * migración de 108 statements que murió a mitad de camino puede quedar marcada
 * como aplicada. Además, el provisioning de la DB de tests (`test/setup.ts`)
 * tolera una lista todavía más amplia de errores. Por eso la única prueba
 * independiente del estado real del schema es interrogar a INFORMATION_SCHEMA y
 * contar filas reales (mitigación T-167-27).
 *
 * SOLO LECTURA
 * ------------
 * Este script no ejecuta más que `SELECT` (mitigación T-167-30). Es seguro
 * correrlo contra producción.
 *
 * CÓMO SE CORRE
 * -------------
 *   local / desarrollo:  cd el-templo-api && pnpm db:verify-tenant
 *   base de test:        lo invoca test/migrations/0192-0195-tenant-columns.test.ts
 *   staging / prod:      en el servidor, sobre la build compilada
 *                        NODE_ENV=production node dist/db/scripts/verify-tenant-backfill.js
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
 * `eltemplo` son dos bases del mismo server). El nombre de la base va primero
 * en el reporte para que nadie lea el resultado equivocado (T-167-28).
 *
 * La lista canónica de tablas sale de `src/db/tenant-tables.ts` — este archivo
 * no duplica ningún nombre.
 */

/* tenant-safe: verificador de plataforma: escanea TODOS los tenants por diseño, corre en CI/deploy y es de solo lectura */
// Exención de la regla `--tenant` obligatorio de los scripts CLI (fase 169,
// CON-04/D-06 — ver `src/db/scripts/require-tenant.ts`). El motivo es
// obligatorio y va escrito arriba: una exención sin motivo es indistinguible de
// un olvido (T-169-36). La anotación la LEEN el sentinel y el lint de CI de la
// fase 170; esta fase sólo la siembra.

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";
import { GYM_OWNED_TABLES, TENANT_EXEMPT_TABLES } from "../tenant-tables";

/**
 * Abstracción de acceso a datos: recibe SQL crudo y devuelve las filas.
 *
 * Existe para que la MISMA verificación corra desde el CLI (conexión `mysql2`
 * propia) y desde la suite (`app.db.execute` con `sql.raw`). Sin ella habría dos
 * implementaciones que divergirían al primer cambio.
 */
export type QueryFn = (statement: string) => Promise<Record<string, unknown>[]>;

/** Una tabla gym-owned cuyo DDL de `tenant_id` no cumple el contrato. */
export interface DdlIssue {
  table: string;
  reason: string;
}

/** Conteo de filas asociado a una tabla. */
export interface TableCount {
  table: string;
  count: number;
}

/** Una arista (declarada o lógica) con filas de tenant inconsistente. */
export interface EdgeMismatch {
  edge: string;
  count: number;
}

/** Tabla sin ninguna cadena de FK hasta un ancla. NO es un error. */
export interface AnchorlessEntry {
  table: string;
  note: string;
}

/** Filas sin ancla DENTRO de una tabla que sí tiene ancla (mina M4). */
export interface PartialEntry {
  table: string;
  condition: string;
  count: number;
  note: string;
}

export interface TenantBackfillReport {
  /** Base contra la que corrió la verificación. Se imprime antes que nada. */
  database: string;
  /** Cantidad de tablas gym-owned verificadas (debe ser 87 en v6.0). */
  gymOwnedChecked: number;
  /** Tablas gym-owned sin la columna, nullable, sin DEFAULT 1 o sin FK. */
  ddlMissing: DdlIssue[];
  /** Tablas exentas por diseño que SÍ tienen la columna. */
  exemptViolations: DdlIssue[];
  /** Filas cuyo `tenant_id` no existe en `tenants`, por tabla. */
  badRows: TableCount[];
  /**
   * Filas con `tenant_id <> 1`, por tabla. INFORMATIVO, no es error: hoy debe
   * dar 0 porque solo existe el tenant 1, pero el día que haya un tenant 2 esto
   * es el dato útil, no un fallo.
   */
  foreignTenantRows: TableCount[];
  /** Aristas de FK declaradas entre tablas gym-owned que se verificaron. */
  fkEdgesChecked: number;
  /** Aristas declaradas con tenant distinto entre hijo y padre. */
  fkMismatches: EdgeMismatch[];
  /** Aristas lógicas de la mina M9 declaradas en el código (9). */
  logicalEdgesDeclared: number;
  /** Aristas lógicas efectivamente verificadas (las heterogéneas se expanden). */
  logicalEdgesChecked: number;
  /** Aristas lógicas con tenant distinto entre hijo y padre. */
  logicalMismatches: EdgeMismatch[];
  /** Tablas cuya cadena hasta un ancla se recorrió entera. */
  derivationsChecked: number;
  /** Cadenas hasta el ancla donde el tenant derivado difiere del backfilleado. */
  derivationMismatches: EdgeMismatch[];
  /** Tablas sin cadena a un ancla. Caso LEGÍTIMO (README §4.1). */
  anchorless: AnchorlessEntry[];
  /** Filas legítimamente sin ancla dentro de tablas con ancla (mina M4). */
  partials: PartialEntry[];
  /** Observaciones que NO son discrepancias. */
  warnings: string[];
  /** Suma de todo lo que SÍ es error. */
  discrepancies: number;
}

/**
 * Las dos exclusiones de diseño que no deben tener la columna.
 *
 * `tenants` y `tenant_settings` también están exentas de la denormalización,
 * pero sí tienen una columna `tenant_id` (es su clave estructural, no una
 * columna de aislamiento), así que no entran acá.
 *
 * - `system_settings` — mina M2 (doc 05 §1.7): KV global heredado que se
 *   deprecia gradualmente hacia `tenant_settings`. Darle `tenant_id` crearía dos
 *   fuentes de verdad para la misma clave durante la transición.
 * - `labs_inquiries` — leads del PROPIO SaaS (doc 05 §4): plataforma, no
 *   gimnasio.
 *
 * Una exclusión revertida en silencio es una decisión de diseño perdida, por eso
 * se afirma explícitamente en vez de darse por supuesta.
 */
const EXEMPT_WITHOUT_COLUMN = ["system_settings", "labs_inquiries"] as const;

/** Las dos anclas del modelo (README §4.1/§5). Toda cadena termina acá. */
const ANCHOR_TABLES = ["users", "branches"] as const;

/** Tamaño de lote de los `UNION ALL`: 87 tablas en 5 round-trips, no en 87. */
const BATCH_SIZE = 20;

/** Tope de saltos de la BFS hasta un ancla. Más que esto es un grafo raro. */
const MAX_ANCHOR_HOPS = 6;

/**
 * Aristas lógicas SIN constraint de FK — mina M9 (doc 05 §6).
 *
 * La DB no conoce estas relaciones, así que el recorrido mecánico del grafo de
 * FKs (paso C) no las ve: van enumeradas a mano. Son 6 aristas simples más 3
 * hosts heterogéneos `(target_kind, target_id)` = las 9 de la mina.
 *
 * Las dos de `day_id` son además la mina M5: el join es por STRING (`day_id` es
 * la identidad textual de la sesión SPOM, del tipo `W1-lunes-sigma`, que viaja
 * denormalizada como varchar). Los `day_id` con prefijo de goal-plan no matchean
 * ninguna sesión: eso sale como warning de huérfanas, no como discrepancia.
 */
const SIMPLE_LOGICAL_EDGES = [
  {
    child: "promo_plans",
    childColumn: "subscription_plan_id",
    parent: "subscription_plans",
    parentColumn: "id",
  },
  {
    child: "blog_post_tags",
    childColumn: "post_id",
    parent: "blog_posts",
    parentColumn: "id",
  },
  {
    child: "blog_post_tags",
    childColumn: "tag_id",
    parent: "blog_tags",
    parentColumn: "id",
  },
  {
    child: "session_prescriptions",
    childColumn: "exercise_id",
    parent: "exercises",
    parentColumn: "id",
  },
  {
    child: "completed_sessions",
    childColumn: "day_id",
    parent: "sessions",
    parentColumn: "day_id",
  },
  {
    child: "exercise_adjustments",
    childColumn: "day_id",
    parent: "sessions",
    parentColumn: "day_id",
  },
] as const;

/**
 * Hosts de aristas HETEROGÉNEAS `(target_kind, target_id)` — las 3 restantes de
 * la mina M9. `target_id` apunta a una tabla distinta según `target_kind`, y la
 * integridad referencial vive en el service, no en la DB.
 *
 * - `transaction_links` y `balances` declaran los valores con `mysqlEnum`: el
 *   set válido se lee del `COLUMN_TYPE` de INFORMATION_SCHEMA.
 * - `audit_log` usa `varchar` libre: el set real se descubre con un
 *   `SELECT DISTINCT`.
 */
const HETEROGENEOUS_HOSTS = [
  { table: "transaction_links", source: "enum" },
  { table: "balances", source: "enum" },
  { table: "audit_log", source: "distinct" },
] as const;

const TARGET_KIND_COLUMN = "target_kind";
const TARGET_ID_COLUMN = "target_id";

/**
 * Mapa `target_kind` -> tabla destino.
 *
 * Sale del probe de integridad referencial TXN-07 de
 * `src/modules/finance/transaction-service.ts` (el `switch (link.targetKind)`
 * que valida que el `target_id` exista) y de `AuditTargetKind` en
 * `src/modules/shared/audit-log.ts`. Es la única definición de la resolución que
 * hoy vive en el service.
 *
 * Todo valor de `target_kind` que NO esté acá va a `warnings` con su conteo de
 * filas, NUNCA a `discrepancies` (T-167-31, disposición `accept`): son aristas
 * heterogéneas por diseño y su resolución le corresponde a la fase que adopte
 * ese módulo.
 */
const TARGET_KIND_TABLES: Readonly<Record<string, string>> = {
  subscription: "subscriptions",
  debt_balance: "balances",
  transaction: "financial_transactions",
  enrollment: "program_enrollments",
  member: "users",
};

/**
 * Filas legítimamente sin cadena a un tenant — mina M4 (doc 05 §6).
 *
 * NO son errores: son filas cuyo backfill directo (`= 1`) es la única verdad
 * posible porque su FK de anclaje es NULL por diseño. Se cuentan y se muestran
 * aparte justamente para que nadie las lea como huérfanas.
 */
const M4_PARTIALS = [
  {
    table: "cash_registers",
    condition: "branch_id IS NULL",
    note: "cajas centrales y de banco: no pertenecen a ninguna sede",
  },
  {
    table: "financial_transactions",
    condition: "member_id IS NULL AND branch_id IS NULL",
    note: "egresos y movimientos: los rescata recorded_by NOT NULL",
  },
  {
    table: "campaign_unsubscribes",
    condition: "user_id IS NULL",
    note: "bajas solo-email, sin usuario asociado",
  },
  {
    table: "tv_pairings",
    condition: "branch_id IS NULL",
    note: "pairings pre-claim: el TV no pertenece a nadie hasta que el staff lo reclama (mina M7)",
  },
] as const;

/**
 * Tablas [SIN-ANCLA] esperadas: 32.
 *
 * Poblada con lo que el script descubrió en su primera corrida y contrastada
 * tabla por tabla contra las marcas [SIN-ANCLA] de doc 05 §1 y §2. La cuenta
 * cierra exacta, comparando CONJUNTOS DE NOMBRES (no totales):
 *
 *    28  tablas marcadas [SIN-ANCLA] fila por fila en doc 05 §1 y §2, ya sin
 *        las 3 parciales de la mina M4 (`cash_registers`,
 *        `campaign_unsubscribes`, `tv_pairings`) ni las 2 EXENTAS
 *        (`system_settings` §1.7, `labs_inquiries` §4)
 *    +8  las de §2.7 (marketing / marca El Templo), que el doc marca en el
 *        TÍTULO de la sección ("todas [SIN-ANCLA]") y no fila por fila
 *   ----
 *    36  tablas gym-owned [SIN-ANCLA] según el doc
 *    -4  sessions, session_blocks, session_prescriptions, session_traces
 *   ----
 *    32  las que descubre el script
 *
 * El "**37** + 3 parciales" del resumen de conteos del doc NO sirve como punto
 * de partida: incluye las 2 exentas y NO incluye las 8 de §2.7, así que no
 * decompone en estas cifras. Por eso la verificación se hizo contra el conjunto
 * de nombres y no contra el total.
 *
 * Las 4 restadas son la única diferencia, y NO es un error del doc: el doc marca
 * "conceptualmente esto no deriva de un tenant", mientras que el script mide "no
 * existe camino de FKs declaradas". La FK `sessions.approved_by -> users` existe
 * (es NULLABLE — por eso el doc anota `sessions` con asterisco), y las otras tres
 * cuelgan de ella: `session_blocks.session_id -> sessions`,
 * `session_prescriptions.block_id -> session_blocks` y
 * `session_traces.session_id -> sessions`. El paso E les deriva tenant, pero solo
 * para las filas cuya sesión tiene `approved_by` cargado: el resto queda fuera del
 * JOIN, igual que una parcial de la mina M4.
 *
 * Las diferencias en cualquier dirección van a `warnings`, nunca a
 * `discrepancies`: esta constante detecta cambios de forma del grafo, no es un
 * gate.
 */
const EXPECTED_ANCHORLESS: readonly string[] = [
  "academy_inquiries",
  "activities",
  "app_waitlist",
  "aura_config",
  "blog_post_tags",
  "blog_posts",
  "blog_tags",
  "contraction_rules",
  "cost_centers",
  "day_modes",
  "exercise_dimension_proposals",
  "exercise_milestone_proposals",
  "exercise_progressions",
  "exercises",
  "format_compatibility",
  "formats",
  "franchise_applications",
  "gladius_inquiries",
  "gladius_products",
  "holidays",
  "intensity_rules",
  "notification_templates",
  "plan_programs",
  "program_content_blocks",
  "programs",
  "promo_plans",
  "routes",
  "spom_config",
  "spom_rules",
  "subscription_plans",
  "weekly_rotator",
  "wellhub_events",
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  return Number.NaN;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Escapa un identificador de MySQL. Todos los nombres que llegan acá salen de
 * `tenant-tables.ts` o de INFORMATION_SCHEMA (no de input de usuario), pero el
 * escape se hace igual: el día que alguien pase un nombre desde afuera, esto
 * sigue siendo correcto.
 */
function ident(name: string): string {
  return "`" + name.replace(/`/g, "``") + "`";
}

/** Escapa un literal de string para un `WHERE col = '...'`. */
function literal(value: string): string {
  return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

/**
 * Corre N conteos en lotes de `UNION ALL` y devuelve un array alineado con la
 * entrada.
 *
 * `buildCount(item)` devuelve el cuerpo `FROM ... WHERE ...` de un
 * `SELECT COUNT(*)`. El índice viaja como columna para no depender del orden de
 * las filas que devuelva el server.
 *
 * NUNCA se arma con `GROUP_CONCAT`: ese camino trunca a
 * `@@group_concat_max_len` (1024 por defecto) y devuelve SQL cortado que sigue
 * siendo sintácticamente válido — un `COUNT(*)` sin `FROM` devuelve 1 y ese 1 se
 * lee como "una fila mal backfilleada". Hallazgo real del plan 167-04.
 */
async function batchedCounts<T>(
  query: QueryFn,
  items: readonly T[],
  buildCount: (item: T) => string,
): Promise<number[]> {
  const results: number[] = [];
  for (const batch of chunk(items, BATCH_SIZE)) {
    const selects = batch.map(
      (item, i) =>
        `SELECT ${i} AS idx, (SELECT COUNT(*) ${buildCount(item)}) AS n`,
    );
    const rows = await query(selects.join("\nUNION ALL\n"));
    if (rows.length !== batch.length) {
      throw new Error(
        `Un lote devolvio ${rows.length} filas para ${batch.length} consultas: resultado truncado o query mal armada`,
      );
    }
    const slot = new Array<number | undefined>(batch.length);
    for (const row of rows) {
      const idx = toNumber(row.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= batch.length) {
        throw new Error(`Indice de lote fuera de rango: ${String(row.idx)}`);
      }
      slot[idx] = toNumber(row.n);
    }
    for (let i = 0; i < batch.length; i++) {
      const value = slot[i];
      if (value === undefined) {
        throw new Error(`El lote no devolvio resultado para el indice ${i}`);
      }
      results.push(value);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata del schema
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnMeta {
  table: string;
  column: string;
  dataType: string;
  columnType: string;
  isNullable: boolean;
  columnDefault: string | null;
}

interface ForeignKeyRow {
  constraintName: string;
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  ordinalPosition: number;
}

/** Arista dirigida hijo -> padre del grafo de FKs declaradas. */
interface FkEdge {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
  childNullable: boolean;
  constraintName: string;
}

/** Todas las columnas de la base, indexadas por `tabla.columna`. */
async function loadColumns(query: QueryFn): Promise<Map<string, ColumnMeta>> {
  const rows = await query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const map = new Map<string, ColumnMeta>();
  for (const row of rows) {
    const table = toStringOrNull(row.TABLE_NAME) ?? "";
    const column = toStringOrNull(row.COLUMN_NAME) ?? "";
    map.set(`${table}.${column}`, {
      table,
      column,
      dataType: (toStringOrNull(row.DATA_TYPE) ?? "").toLowerCase(),
      columnType: (toStringOrNull(row.COLUMN_TYPE) ?? "").toLowerCase(),
      isNullable:
        (toStringOrNull(row.IS_NULLABLE) ?? "").toUpperCase() !== "NO",
      columnDefault: toStringOrNull(row.COLUMN_DEFAULT),
    });
  }
  return map;
}

/**
 * Todas las FKs declaradas de la base.
 *
 * Se cruza `KEY_COLUMN_USAGE` con `REFERENTIAL_CONSTRAINTS` para quedarse
 * únicamente con constraints que son de verdad FOREIGN KEY (y no, por ejemplo,
 * una unique que casualmente comparta nombre).
 */
async function loadForeignKeys(query: QueryFn): Promise<ForeignKeyRow[]> {
  const rows = await query(
    `SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_NAME, kcu.COLUMN_NAME,
            kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
            kcu.ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
  );
  return rows.map((row) => ({
    constraintName: toStringOrNull(row.CONSTRAINT_NAME) ?? "",
    table: toStringOrNull(row.TABLE_NAME) ?? "",
    column: toStringOrNull(row.COLUMN_NAME) ?? "",
    referencedTable: toStringOrNull(row.REFERENCED_TABLE_NAME) ?? "",
    referencedColumn: toStringOrNull(row.REFERENCED_COLUMN_NAME) ?? "",
    ordinalPosition: toNumber(row.ORDINAL_POSITION),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pasos de la verificación
// ─────────────────────────────────────────────────────────────────────────────

/** Paso 0 — guard de base. Primer statement de todo, siempre. */
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
 * Paso A — DDL de las 87 gym-owned.
 *
 * El contrato de la columna es el de `src/db/schema/tenant-column.ts`: INT NOT
 * NULL DEFAULT 1 con FK a `tenants`. El DEFAULT es la pieza que hace compatible
 * el rolling deploy (el código viejo inserta sin nombrar la columna), así que
 * su ausencia es una falla, no un detalle cosmético.
 */
function stepDdl(
  columns: Map<string, ColumnMeta>,
  foreignKeys: readonly ForeignKeyRow[],
): DdlIssue[] {
  const tenantFkTables = new Set(
    foreignKeys
      .filter(
        (fk) => fk.column === "tenant_id" && fk.referencedTable === "tenants",
      )
      .map((fk) => fk.table),
  );

  const issues: DdlIssue[] = [];
  for (const table of GYM_OWNED_TABLES) {
    const col = columns.get(`${table}.tenant_id`);
    if (!col) {
      // Si la tabla entera no existe, decirlo con esas palabras: "falta la
      // columna" mandaría a buscar un ALTER que nunca fue el problema.
      const tableExists = [...columns.values()].some((c) => c.table === table);
      issues.push({
        table,
        reason: tableExists
          ? "no tiene columna tenant_id"
          : "la tabla no existe en esta base",
      });
      continue;
    }
    if (col.dataType !== "int") {
      issues.push({ table, reason: `tenant_id es ${col.dataType}, no int` });
    }
    if (col.isNullable) {
      issues.push({ table, reason: "tenant_id es NULLABLE" });
    }
    if (col.columnDefault !== "1") {
      issues.push({
        table,
        reason: `tenant_id no tiene DEFAULT 1 (COLUMN_DEFAULT=${
          col.columnDefault === null ? "NULL" : `'${col.columnDefault}'`
        })`,
      });
    }
    if (!tenantFkTables.has(table)) {
      issues.push({ table, reason: "no tiene FK de tenant_id hacia tenants" });
    }
  }
  return issues;
}

/** Paso A2 — las 2 exclusiones de diseño NO deben tener la columna. */
function stepExemptExclusions(columns: Map<string, ColumnMeta>): DdlIssue[] {
  const issues: DdlIssue[] = [];
  const exemptSet: ReadonlySet<string> = new Set(TENANT_EXEMPT_TABLES);
  for (const table of EXEMPT_WITHOUT_COLUMN) {
    if (!exemptSet.has(table)) {
      // Fail-loud: si alguien saca la tabla de TENANT_EXEMPT_TABLES sin tocar
      // esta constante, la contradicción tiene que verse, no resolverse sola.
      issues.push({
        table,
        reason:
          "esta declarada como exclusion de diseno pero no figura en TENANT_EXEMPT_TABLES",
      });
    }
    if (columns.has(`${table}.tenant_id`)) {
      issues.push({
        table,
        reason:
          "es una exclusion de diseno (doc 05 §1.7 / §4) y NO debe tener columna tenant_id",
      });
    }
  }
  return issues;
}

/**
 * Paso B — integridad del backfill.
 *
 * Dos conteos por tabla: filas cuyo `tenant_id` no existe en `tenants` (error) y
 * filas con `tenant_id <> 1` (informativo).
 */
async function stepBackfillIntegrity(
  query: QueryFn,
  tables: readonly string[],
): Promise<{ badRows: TableCount[]; foreignTenantRows: TableCount[] }> {
  const orphanCounts = await batchedCounts(
    query,
    tables,
    (table) =>
      `FROM ${ident(table)} c LEFT JOIN ${ident("tenants")} t ON t.id = c.tenant_id WHERE t.id IS NULL`,
  );
  const foreignCounts = await batchedCounts(
    query,
    tables,
    (table) => `FROM ${ident(table)} c WHERE c.tenant_id <> 1`,
  );

  const badRows: TableCount[] = [];
  const foreignTenantRows: TableCount[] = [];
  tables.forEach((table, i) => {
    if (orphanCounts[i] > 0) badRows.push({ table, count: orphanCounts[i] });
    if (foreignCounts[i] > 0) {
      foreignTenantRows.push({ table, count: foreignCounts[i] });
    }
  });
  return { badRows, foreignTenantRows };
}

/**
 * Paso C — aristas de FK DECLARADAS entre tablas gym-owned.
 *
 * El grafo NO está hardcodeado: se lee de INFORMATION_SCHEMA en tiempo de
 * ejecución, así que sigue siendo cierto cuando el schema cambie.
 *
 * Se excluye la columna `tenant_id` (apunta a `tenants`, que no es gym-owned) y
 * las FKs compuestas (que necesitarían un join multi-columna): estas últimas van
 * a `warnings`, no se saltean en silencio.
 *
 * El chequeo es TRANSITIVO: si toda arista es consistente, toda cadena hasta un
 * ancla también lo es.
 */
function buildFkEdges(
  foreignKeys: readonly ForeignKeyRow[],
  columns: Map<string, ColumnMeta>,
  warnings: string[],
): FkEdge[] {
  const gymOwned: ReadonlySet<string> = new Set(GYM_OWNED_TABLES);

  const byConstraint = new Map<string, ForeignKeyRow[]>();
  for (const fk of foreignKeys) {
    const key = `${fk.table}::${fk.constraintName}`;
    const list = byConstraint.get(key);
    if (list) list.push(fk);
    else byConstraint.set(key, [fk]);
  }

  const edges: FkEdge[] = [];
  for (const [key, parts] of byConstraint) {
    if (parts.length > 1) {
      warnings.push(
        `FK compuesta no verificada (necesita join multi-columna): ${key} sobre (${parts
          .map((p) => p.column)
          .join(", ")})`,
      );
      continue;
    }
    const fk = parts[0];
    if (fk.column === "tenant_id") continue;
    if (!gymOwned.has(fk.table) || !gymOwned.has(fk.referencedTable)) continue;
    // Sin la columna de tenancy en alguno de los dos lados no hay nada que
    // comparar: eso ya lo reportó el paso A como ddlMissing.
    if (
      !columns.has(`${fk.table}.tenant_id`) ||
      !columns.has(`${fk.referencedTable}.tenant_id`)
    ) {
      continue;
    }
    edges.push({
      child: fk.table,
      childColumn: fk.column,
      parent: fk.referencedTable,
      parentColumn: fk.referencedColumn,
      childNullable:
        columns.get(`${fk.table}.${fk.column}`)?.isNullable ?? true,
      constraintName: fk.constraintName,
    });
  }

  // Orden estable: el reporte de dos corridas seguidas tiene que ser idéntico.
  edges.sort((a, b) =>
    `${a.child}.${a.childColumn}`.localeCompare(`${b.child}.${b.childColumn}`),
  );
  return edges;
}

function edgeLabel(edge: {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
}): string {
  return `${edge.child}.${edge.childColumn} -> ${edge.parent}.${edge.parentColumn}`;
}

/** Cuenta filas donde hijo y padre tienen distinto `tenant_id`, por arista. */
async function countEdgeMismatches(
  query: QueryFn,
  edges: readonly {
    child: string;
    childColumn: string;
    parent: string;
    parentColumn: string;
    filter?: string;
  }[],
): Promise<EdgeMismatch[]> {
  if (edges.length === 0) return [];
  const counts = await batchedCounts(query, edges, (edge) => {
    const where = [
      "c.tenant_id <> p.tenant_id",
      ...(edge.filter ? [edge.filter] : []),
    ].join(" AND ");
    return (
      `FROM ${ident(edge.child)} c` +
      ` JOIN ${ident(edge.parent)} p ON p.${ident(edge.parentColumn)} = c.${ident(edge.childColumn)}` +
      ` WHERE ${where}`
    );
  });
  const mismatches: EdgeMismatch[] = [];
  edges.forEach((edge, i) => {
    if (counts[i] > 0) {
      const suffix = edge.filter ? ` [${edge.filter}]` : "";
      mismatches.push({
        edge: `${edgeLabel(edge)}${suffix}`,
        count: counts[i],
      });
    }
  });
  return mismatches;
}

/** Cuenta filas huérfanas (el target no existe). Van a warnings, no a errores. */
async function countEdgeOrphans(
  query: QueryFn,
  edges: readonly {
    child: string;
    childColumn: string;
    parent: string;
    parentColumn: string;
    filter?: string;
  }[],
): Promise<number[]> {
  if (edges.length === 0) return [];
  return batchedCounts(query, edges, (edge) => {
    const where = [
      `p.${ident(edge.parentColumn)} IS NULL`,
      `c.${ident(edge.childColumn)} IS NOT NULL`,
      ...(edge.filter ? [edge.filter] : []),
    ].join(" AND ");
    return (
      `FROM ${ident(edge.child)} c` +
      ` LEFT JOIN ${ident(edge.parent)} p ON p.${ident(edge.parentColumn)} = c.${ident(edge.childColumn)}` +
      ` WHERE ${where}`
    );
  });
}

interface LogicalEdge {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
  filter?: string;
}

/**
 * Paso D — expande las 9 aristas lógicas de la mina M9 a aristas concretas.
 *
 * Las 6 simples pasan tal cual. Los 3 hosts heterogéneos se expanden a una
 * arista por valor de `target_kind` conocido; los valores sin mapeo salen por
 * `warnings` con su conteo de filas.
 */
async function buildLogicalEdges(
  query: QueryFn,
  columns: Map<string, ColumnMeta>,
  warnings: string[],
): Promise<LogicalEdge[]> {
  const edges: LogicalEdge[] = [];

  const columnsExist = (edge: LogicalEdge): boolean => {
    const missing: string[] = [];
    if (!columns.has(`${edge.child}.${edge.childColumn}`)) {
      missing.push(`${edge.child}.${edge.childColumn}`);
    }
    if (!columns.has(`${edge.parent}.${edge.parentColumn}`)) {
      missing.push(`${edge.parent}.${edge.parentColumn}`);
    }
    if (!columns.has(`${edge.child}.tenant_id`)) {
      missing.push(`${edge.child}.tenant_id`);
    }
    if (!columns.has(`${edge.parent}.tenant_id`)) {
      missing.push(`${edge.parent}.tenant_id`);
    }
    if (missing.length > 0) {
      // Nunca en silencio: una arista de M9 que no se puede verificar es
      // información, no ausencia de información.
      warnings.push(
        `Arista logica M9 NO verificada (${edgeLabel(edge)}): faltan columnas ${missing.join(", ")}`,
      );
      return false;
    }
    return true;
  };

  for (const edge of SIMPLE_LOGICAL_EDGES) {
    const candidate: LogicalEdge = {
      child: edge.child,
      childColumn: edge.childColumn,
      parent: edge.parent,
      parentColumn: edge.parentColumn,
    };
    if (columnsExist(candidate)) edges.push(candidate);
  }

  for (const host of HETEROGENEOUS_HOSTS) {
    const kindCol = columns.get(`${host.table}.${TARGET_KIND_COLUMN}`);
    if (!kindCol || !columns.has(`${host.table}.${TARGET_ID_COLUMN}`)) {
      warnings.push(
        `Host heterogeneo M9 NO verificado: ${host.table} no tiene ${TARGET_KIND_COLUMN}/${TARGET_ID_COLUMN}`,
      );
      continue;
    }

    let kinds: string[];
    if (host.source === "enum") {
      // COLUMN_TYPE viene como enum('a','b','c') — se leen los valores reales
      // de la DB, no una copia del mysqlEnum del schema.
      kinds = [...kindCol.columnType.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
        m[1].replace(/''/g, "'"),
      );
      if (kinds.length === 0) {
        warnings.push(
          `No se pudieron leer los valores del enum ${host.table}.${TARGET_KIND_COLUMN} (COLUMN_TYPE='${kindCol.columnType}')`,
        );
      }
    } else {
      const rows = await query(
        `SELECT ${ident(TARGET_KIND_COLUMN)} AS k, COUNT(*) AS n
           FROM ${ident(host.table)}
          GROUP BY ${ident(TARGET_KIND_COLUMN)}`,
      );
      kinds = rows
        .map((row) => toStringOrNull(row.k))
        .filter((k): k is string => k !== null);
    }

    for (const kind of kinds) {
      const parent = TARGET_KIND_TABLES[kind];
      if (!parent) {
        const rows = await query(
          `SELECT COUNT(*) AS n FROM ${ident(host.table)} WHERE ${ident(TARGET_KIND_COLUMN)} = ${literal(kind)}`,
        );
        const n = toNumber(rows[0]?.n ?? 0);
        warnings.push(
          `target_kind sin mapeo: ${host.table}.${TARGET_KIND_COLUMN}='${kind}' (${n} fila(s)). T-167-31: se acepta como informacion para la fase que adopte ese modulo, NO es discrepancia`,
        );
        continue;
      }
      const candidate: LogicalEdge = {
        child: host.table,
        childColumn: TARGET_ID_COLUMN,
        parent,
        parentColumn: "id",
        filter: `c.${ident(TARGET_KIND_COLUMN)} = ${literal(kind)}`,
      };
      if (columnsExist(candidate)) edges.push(candidate);
    }
  }

  return edges;
}

interface AnchorPath {
  table: string;
  anchor: string;
  edges: FkEdge[];
}

/**
 * Paso E — camino más corto de cada tabla gym-owned hasta un ancla.
 *
 * BFS sobre el grafo del paso C, prefiriendo columnas FK `NOT NULL` (una cadena
 * por columna nullable cubre menos filas: el JOIN descarta los NULL).
 *
 * Con el paso C esto es PARCIALMENTE REDUNDANTE, y la redundancia es
 * deliberada: es la lectura literal del criterio de éxito de la fase ("el valor
 * backfilleado coincide con el derivado por cadena de FK") y cubre el caso de
 * una arista intermedia sin FK declarada.
 */
function findAnchorPaths(edges: readonly FkEdge[]): {
  paths: AnchorPath[];
  anchorless: string[];
} {
  const anchors: ReadonlySet<string> = new Set(ANCHOR_TABLES);
  const outgoing = new Map<string, FkEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.child);
    if (list) list.push(edge);
    else outgoing.set(edge.child, [edge]);
  }
  // NOT NULL primero, después alfabético: BFS determinista.
  for (const list of outgoing.values()) {
    list.sort((a, b) => {
      if (a.childNullable !== b.childNullable) return a.childNullable ? 1 : -1;
      return a.childColumn.localeCompare(b.childColumn);
    });
  }

  const paths: AnchorPath[] = [];
  const anchorless: string[] = [];

  for (const table of GYM_OWNED_TABLES) {
    if (anchors.has(table)) continue;

    const visited = new Set<string>([table]);
    let frontier: { node: string; trail: FkEdge[] }[] = [
      { node: table, trail: [] },
    ];
    let found: AnchorPath | null = null;

    for (
      let hop = 0;
      hop < MAX_ANCHOR_HOPS && !found && frontier.length;
      hop++
    ) {
      const next: { node: string; trail: FkEdge[] }[] = [];
      for (const { node, trail } of frontier) {
        for (const edge of outgoing.get(node) ?? []) {
          if (visited.has(edge.parent)) continue;
          const nextTrail = [...trail, edge];
          if (anchors.has(edge.parent)) {
            found = { table, anchor: edge.parent, edges: nextTrail };
            break;
          }
          visited.add(edge.parent);
          next.push({ node: edge.parent, trail: nextTrail });
        }
        if (found) break;
      }
      frontier = next;
    }

    if (found) paths.push(found);
    else anchorless.push(table);
  }

  return { paths, anchorless };
}

/** Cuenta filas donde el tenant de la tabla difiere del tenant de su ancla. */
async function countDerivationMismatches(
  query: QueryFn,
  paths: readonly AnchorPath[],
): Promise<EdgeMismatch[]> {
  if (paths.length === 0) return [];
  const counts = await batchedCounts(query, paths, (p) => {
    const joins = p.edges
      .map(
        (edge, i) =>
          ` JOIN ${ident(edge.parent)} t${i + 1} ON t${i + 1}.${ident(edge.parentColumn)} = t${i}.${ident(edge.childColumn)}`,
      )
      .join("");
    const last = p.edges.length;
    return (
      `FROM ${ident(p.table)} t0${joins}` +
      ` WHERE t0.tenant_id <> t${last}.tenant_id`
    );
  });

  const mismatches: EdgeMismatch[] = [];
  paths.forEach((p, i) => {
    if (counts[i] > 0) {
      const chain = [p.table, ...p.edges.map((e) => e.parent)].join(" -> ");
      mismatches.push({
        edge: `${chain} (ancla ${p.anchor})`,
        count: counts[i],
      });
    }
  });
  return mismatches;
}

/** Paso F — filas parciales de la mina M4. Caso LEGÍTIMO, se cuentan aparte. */
async function countM4Partials(
  query: QueryFn,
  columns: Map<string, ColumnMeta>,
  warnings: string[],
): Promise<PartialEntry[]> {
  const usable = M4_PARTIALS.filter((p) => {
    if (!columns.has(`${p.table}.tenant_id`)) {
      warnings.push(
        `Parcial M4 no medida: la tabla ${p.table} no existe o no tiene tenant_id`,
      );
      return false;
    }
    return true;
  });
  const counts = await batchedCounts(
    query,
    usable,
    (p) => `FROM ${ident(p.table)} WHERE ${p.condition}`,
  );
  return usable.map((p, i) => ({
    table: p.table,
    condition: p.condition,
    count: counts[i],
    note: p.note,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificación completa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Corre la verificación completa. NO imprime ni sale del proceso: devuelve el
 * reporte. El CLI (abajo) y el test de CI lo consumen igual.
 */
export async function verifyTenantBackfill(
  query: QueryFn,
): Promise<TenantBackfillReport> {
  const database = await stepDatabaseGuard(query);

  const columns = await loadColumns(query);
  const foreignKeys = await loadForeignKeys(query);

  const warnings: string[] = [];

  const ddlMissing = stepDdl(columns, foreignKeys);
  const exemptViolations = stepExemptExclusions(columns);

  // El paso B solo puede correr sobre tablas que existan y tengan la columna:
  // contar filas de una tabla inexistente aborta la verificación entera.
  const countableTables = GYM_OWNED_TABLES.filter((table) =>
    columns.has(`${table}.tenant_id`),
  );
  if (countableTables.length !== GYM_OWNED_TABLES.length) {
    warnings.push(
      `Integridad de filas medida sobre ${countableTables.length} de ${GYM_OWNED_TABLES.length} tablas: el resto no tiene la columna (ver ddlMissing)`,
    );
  }

  const { badRows, foreignTenantRows } = await stepBackfillIntegrity(
    query,
    countableTables,
  );

  // Paso C — FKs declaradas.
  const fkEdges = buildFkEdges(foreignKeys, columns, warnings);
  const fkMismatches = await countEdgeMismatches(query, fkEdges);

  // Paso D — FKs lógicas de la mina M9.
  const logicalEdges = await buildLogicalEdges(query, columns, warnings);
  const logicalMismatches = await countEdgeMismatches(query, logicalEdges);
  const logicalOrphans = await countEdgeOrphans(query, logicalEdges);
  logicalEdges.forEach((edge, i) => {
    if (logicalOrphans[i] > 0) {
      warnings.push(
        `Arista logica M9 con ${logicalOrphans[i]} fila(s) huerfana(s) (el target no existe): ${edgeLabel(edge)}${edge.filter ? ` [${edge.filter}]` : ""}`,
      );
    }
    const meta = columns.get(`${edge.child}.${edge.childColumn}`);
    if (meta?.isNullable) {
      warnings.push(
        `Arista logica M9 con columna NULLABLE (las filas en NULL quedan fuera del JOIN): ${edgeLabel(edge)}`,
      );
    }
  });

  // Paso E — derivación desde el ancla.
  const { paths, anchorless: discoveredAnchorless } = findAnchorPaths(fkEdges);
  const derivationMismatches = await countDerivationMismatches(query, paths);

  // Paso F — [SIN-ANCLA] y parciales de M4: casos LEGÍTIMOS.
  const expected = new Set(EXPECTED_ANCHORLESS);
  const discovered = new Set(discoveredAnchorless);
  for (const table of discoveredAnchorless) {
    if (!expected.has(table)) {
      warnings.push(
        `Tabla [SIN-ANCLA] no esperada (no esta en EXPECTED_ANCHORLESS): ${table}`,
      );
    }
  }
  for (const table of EXPECTED_ANCHORLESS) {
    if (!discovered.has(table)) {
      warnings.push(
        `Tabla esperada [SIN-ANCLA] que AHORA tiene cadena a un ancla: ${table}`,
      );
    }
  }
  const anchorless: AnchorlessEntry[] = discoveredAnchorless.map((table) => ({
    table,
    note: "sin cadena de FK a users/branches: su backfill DIRECTO (= 1) es correcto, la denormalizacion es la regla (README §4.1)",
  }));

  const partials = await countM4Partials(query, columns, warnings);

  const discrepancies =
    ddlMissing.length +
    exemptViolations.length +
    badRows.length +
    fkMismatches.length +
    logicalMismatches.length +
    derivationMismatches.length;

  return {
    database,
    gymOwnedChecked: GYM_OWNED_TABLES.length,
    ddlMissing,
    exemptViolations,
    badRows,
    foreignTenantRows,
    fkEdgesChecked: fkEdges.length,
    fkMismatches,
    logicalEdgesDeclared:
      SIMPLE_LOGICAL_EDGES.length + HETEROGENEOUS_HOSTS.length,
    logicalEdgesChecked: logicalEdges.length,
    logicalMismatches,
    derivationsChecked: paths.length,
    derivationMismatches,
    anchorless,
    partials,
    warnings,
    discrepancies,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────────────────────────────────────

export function formatReport(report: TenantBackfillReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(`Base de datos: ${report.database}`);
  lines.push("=".repeat(72));
  lines.push(`Tablas gym-owned verificadas:   ${report.gymOwnedChecked}`);
  lines.push(`Aristas de FK declaradas:       ${report.fkEdgesChecked}`);
  lines.push(
    `Aristas logicas M9:             ${report.logicalEdgesChecked} verificadas (${report.logicalEdgesDeclared} declaradas, las heterogeneas se expanden por target_kind)`,
  );
  lines.push(`Cadenas hasta un ancla:         ${report.derivationsChecked}`);
  lines.push("");

  lines.push(`DDL incompleto (ddlMissing): ${report.ddlMissing.length}`);
  for (const issue of report.ddlMissing) {
    lines.push(`  - ${issue.table}: ${issue.reason}`);
  }

  lines.push(
    `Exclusiones de diseno violadas (exemptViolations): ${report.exemptViolations.length}`,
  );
  for (const issue of report.exemptViolations) {
    lines.push(`  - ${issue.table}: ${issue.reason}`);
  }

  lines.push(
    `Tablas con filas apuntando a un tenant inexistente (badRows): ${report.badRows.length}`,
  );
  for (const entry of report.badRows) {
    lines.push(`  - ${entry.table}: ${entry.count} fila(s)`);
  }

  lines.push(
    `Aristas de FK con tenant inconsistente (fkMismatches): ${report.fkMismatches.length}`,
  );
  for (const entry of report.fkMismatches) {
    lines.push(`  - ${entry.edge}: ${entry.count} fila(s)`);
  }

  lines.push(
    `Aristas logicas M9 con tenant inconsistente (logicalMismatches): ${report.logicalMismatches.length}`,
  );
  for (const entry of report.logicalMismatches) {
    lines.push(`  - ${entry.edge}: ${entry.count} fila(s)`);
  }

  lines.push(
    `Cadenas donde el tenant derivado no coincide (derivationMismatches): ${report.derivationMismatches.length}`,
  );
  for (const entry of report.derivationMismatches) {
    lines.push(`  - ${entry.edge}: ${entry.count} fila(s)`);
  }

  lines.push("");
  lines.push(`DISCREPANCIAS: ${report.discrepancies}`);
  lines.push("");

  lines.push("--- Casos legitimos e informativo (NO son discrepancias) ---");
  lines.push("");
  lines.push(
    `Tablas [SIN-ANCLA] (backfill directo = 1, es la verdad): ${report.anchorless.length}`,
  );
  for (const entry of report.anchorless) {
    lines.push(`  - ${entry.table}`);
  }
  lines.push("");

  lines.push(
    `Filas parciales de la mina M4: ${report.partials.length} tabla(s)`,
  );
  for (const entry of report.partials) {
    lines.push(
      `  - ${entry.table} WHERE ${entry.condition}: ${entry.count} fila(s) — ${entry.note}`,
    );
  }
  lines.push("");

  lines.push(
    `Tablas con filas de tenant <> 1: ${report.foreignTenantRows.length}`,
  );
  for (const entry of report.foreignTenantRows) {
    lines.push(`  - ${entry.table}: ${entry.count} fila(s)`);
  }
  lines.push("");

  lines.push(`Warnings: ${report.warnings.length}`);
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
    const report = await verifyTenantBackfill(query);
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
      console.error(`verify-tenant-backfill fallo: ${message}`);
      process.exit(2);
    });
}
