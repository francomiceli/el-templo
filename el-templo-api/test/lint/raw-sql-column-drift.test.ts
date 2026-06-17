/**
 * Phase 97.5 DRIFT-02 — PERMANENT sweep-lint guardrail for raw-SQL <->
 * Drizzle column-name drift.
 *
 * Scans the el-templo-bot/src and el-templo-api/src trees for raw
 * sql template-literal blocks (the tagged template literal `sql` from
 * drizzle-orm) and flags <alias>.<col> references (and bare unqualified
 * <col> tokens in single-table queries) whose column name does not match
 * the Drizzle-declared SQL column name.
 *
 * Decisions honored:
 *   - D-02   regex + line-by-line accumulator scanner, ZERO new deps.
 *   - D-02 (i)   bare-column detection in single-table blocks.
 *   - D-02 (ii)  synthetic-drift positive-control fixture (PERMANENT —
 *                this fixture MUST NOT be deleted post-GREEN; it is the
 *                self-test that catches a scanner-becomes-no-op regression).
 *   - D-02 (iii) `${schema.table.column}` Drizzle interpolations skipped.
 *   - D-03   live Drizzle introspection (`getTableColumns` from drizzle-orm,
 *            stable documented API per `node_modules/drizzle-orm/utils.d.ts:37`)
 *            + must-include SUBSET coverage on the 10 high-risk plain-word ->
 *            prefixed renames (NOT equality — discovered map may legitimately
 *            contain more renames in future).
 *   - D-05   RED-FIRST: this test must FAIL on master HEAD `3f330787` by
 *            detecting the 3 real drift sites in tools.ts + machine.ts;
 *            Task 3 GREEN turns it green.
 *
 * Scope: every .ts file under el-templo-bot/src and el-templo-api/src.
 * The el-templo-app and el-templo-admin frontends do not use raw SQL
 * (data access via API), so they are out of scope per CONTEXT.md deferred.
 *
 * Auto-included by `pnpm test` via the vitest test-file glob in
 * el-templo-api/vitest.config.ts (line 13) — no extra CI wiring needed.
 *
 * Standards (CLAUDE.md): no `any`; `unknown` + narrowing; no `console.*`.
 */

import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "../../src/db/schema/index";

// ─── Drizzle introspection: build the rename map ─────────────────────────────

type RenameMap = Map<string, Map<string, string>>; // tableName -> jsProperty -> sqlColumn

/**
 * Walks every exported Drizzle table in `schema` and builds a map of
 * tableName -> (jsProperty -> sqlColumn) for columns whose JS property
 * name differs from the SQL column name (i.e., the rename surface).
 *
 * Documented API: `getTableColumns<T extends Table>(table): T['_']['columns']`
 * (drizzle-orm/utils.d.ts:37). Each column's runtime `.name` holds the SQL
 * column name (the first argument to `mysqlEnum("subscription_status", ...)`,
 * `int("user_id")`, etc.). `getTableName(table)` returns the SQL table name
 * (first argument to `mysqlTable("subscriptions", ...)`) — drizzle-orm
 * table.d.ts:49.
 */
function buildRenameMap(): RenameMap {
  const map: RenameMap = new Map();
  for (const exportValue of Object.values(schema)) {
    if (!isTable(exportValue)) continue;
    const tableName = getTableName(exportValue);
    const cols = getTableColumns(exportValue);
    const colMap = new Map<string, string>();
    for (const [jsProperty, col] of Object.entries(cols)) {
      const sqlColumn = (col as { name: string }).name;
      if (jsProperty !== sqlColumn) {
        colMap.set(jsProperty, sqlColumn);
      }
    }
    if (colMap.size > 0) {
      map.set(tableName, colMap);
    }
  }
  return map;
}

// ─── File walker ─────────────────────────────────────────────────────────────

/**
 * Recursively walks the given root directories and returns absolute paths
 * to every `.ts` source file (excluding `.d.ts`, `node_modules`, `dist`,
 * `build`, and the `test` directory — the lint targets PRODUCTION source).
 *
 * Uses Node's documented `readdirSync(dir, { recursive: true })` (Node ≥
 * 20.1) — no `glob` devDep added (D-02: zero new deps).
 */
function walkSourceFiles(roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!name.endsWith(".ts")) continue;
      if (name.endsWith(".d.ts")) continue;
      // `parentPath` is the directory containing `entry` (Node ≥ 20.12).
      // Fall back to `path` for older runtimes.
      const parent =
        (entry as unknown as { parentPath?: string }).parentPath ??
        (entry as unknown as { path?: string }).path ??
        root;
      const abs = path.join(parent, name);
      if (abs.includes(`${path.sep}node_modules${path.sep}`)) continue;
      if (abs.includes(`${path.sep}dist${path.sep}`)) continue;
      if (abs.includes(`${path.sep}build${path.sep}`)) continue;
      if (abs.includes(`${path.sep}test${path.sep}`)) continue;
      out.push(abs);
    }
  }
  return out;
}

// ─── sql`...` block extractor ────────────────────────────────────────────────

interface SqlSite {
  file: string;
  line: number; // 1-indexed line of the opening `sql\``
  sql: string;
}

/**
 * Scans each file line-by-line for opening ` sql\`` markers and captures
 * the template-literal body across lines until the matching closing
 * backtick. Handles single-line templates and multi-line templates.
 *
 * Sketch source: `.planning/debug/bot-raw-sql-status-column-drift.md:227-290`
 * (this is the codebase's first SQL-template-literal extractor, per
 * PATTERNS.md "No Analog Found" sub-pattern d).
 */
function findRawSqlSites(files: string[]): SqlSite[] {
  const sites: SqlSite[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    let inBlock = false;
    let blockLines: string[] = [];
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inBlock) {
        // Match `sql\`` — but NOT inside a JS identifier (e.g., `mysql`).
        // The negative lookbehind ensures the character before `sql` is
        // not an identifier character (letter/digit/$/_).
        const openMatch = /(?<![A-Za-z0-9_$])sql`/.exec(line);
        if (openMatch) {
          inBlock = true;
          startLine = i + 1;
          const openEnd = openMatch.index + openMatch[0].length;
          const rest = line.slice(openEnd);
          const closeIdx = rest.indexOf("`");
          if (closeIdx !== -1) {
            // Single-line template literal.
            sites.push({
              file,
              line: startLine,
              sql: rest.slice(0, closeIdx),
            });
            inBlock = false;
            blockLines = [];
          } else {
            blockLines = [rest];
          }
        }
      } else {
        const closeIdx = line.indexOf("`");
        if (closeIdx !== -1) {
          blockLines.push(line.slice(0, closeIdx));
          sites.push({ file, line: startLine, sql: blockLines.join("\n") });
          inBlock = false;
          blockLines = [];
        } else {
          blockLines.push(line);
        }
      }
    }
  }
  return sites;
}

// ─── Drift detector ──────────────────────────────────────────────────────────

interface DriftHit {
  file: string;
  line: number;
  alias: string | null; // null = bare unqualified column
  column: string;
  expectedSqlColumn: string;
  table: string;
}

/**
 * Parses FROM/JOIN clauses to discover (alias -> table) mappings.
 * Default alias is the table name itself when no AS/alias is given.
 */
function parseTablesInScope(
  sqlText: string,
): Array<{ table: string; alias: string }> {
  const tables: Array<{ table: string; alias: string }> = [];
  // FROM <table> [AS <alias>] | FROM <table> <alias>
  // \b ensures we don't match across word boundaries; alias group is optional.
  const re =
    /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\s*(?:AS\s+)?([a-z][a-z0-9_]*)?/gi;
  // The 2nd group will sometimes accidentally swallow the next SQL keyword
  // (ON, WHERE, ORDER, etc.) — strip those out.
  const RESERVED = new Set([
    "on",
    "where",
    "order",
    "group",
    "having",
    "limit",
    "left",
    "right",
    "inner",
    "outer",
    "cross",
    "join",
    "and",
    "or",
    "set",
    "values",
    "as",
    "using",
  ]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sqlText)) !== null) {
    const table = m[1];
    let alias = m[2];
    if (alias && RESERVED.has(alias.toLowerCase())) {
      alias = undefined;
    }
    tables.push({ table, alias: alias ?? table });
  }
  return tables;
}

/**
 * Scans a single SQL block for drift against the rename map.
 *
 * D-02 (iii): strips `${...}` placeholders so the column-ref regex doesn't
 * match Drizzle column interpolations.
 * D-02 (i): in single-table blocks (one table in scope, no JOIN), additionally
 * tokenizes bare identifiers and cross-checks against the FROM-table's
 * renamed columns — catches `SELECT status FROM subscriptions` (no alias).
 */
function scanSqlForDrift(site: SqlSite, renameMap: RenameMap): DriftHit[] {
  const stripped = site.sql.replace(/\$\{[^}]*\}/g, "PLACEHOLDER");
  const tables = parseTablesInScope(stripped);
  const hits: DriftHit[] = [];

  // Alias-qualified detection: <alias>.<col>
  const aliasMap = new Map<string, string>(); // alias -> table
  for (const { table, alias } of tables) {
    aliasMap.set(alias, table);
  }
  const aliasColRe = /\b([a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = aliasColRe.exec(stripped)) !== null) {
    const alias = m[1];
    const column = m[2];
    const table = aliasMap.get(alias);
    if (!table) continue;
    const expected = renameMap.get(table)?.get(column);
    if (expected) {
      hits.push({
        file: site.file,
        line: site.line,
        alias,
        column,
        expectedSqlColumn: expected,
        table,
      });
    }
  }

  // Bare-column detection (D-02 i): only for single-table blocks (no JOIN).
  // Tokenize plain identifier-words and cross-check against the FROM-table's
  // rename map. Skip identifiers that already appear alias-qualified (those
  // are handled above) and identifiers that match a SQL keyword.
  const isSingleTable = tables.length === 1 && !/\bJOIN\b/i.test(stripped);
  if (isSingleTable) {
    const table = tables[0].table;
    const tableRenames = renameMap.get(table);
    if (tableRenames) {
      const SQL_KEYWORDS = new Set([
        "select",
        "from",
        "where",
        "and",
        "or",
        "not",
        "in",
        "is",
        "null",
        "as",
        "on",
        "order",
        "by",
        "group",
        "having",
        "limit",
        "offset",
        "asc",
        "desc",
        "insert",
        "into",
        "values",
        "update",
        "set",
        "delete",
        "join",
        "left",
        "right",
        "inner",
        "outer",
        "cross",
        "using",
        "case",
        "when",
        "then",
        "else",
        "end",
        "distinct",
        "count",
        "sum",
        "avg",
        "min",
        "max",
        "true",
        "false",
        "between",
        "like",
        "exists",
        "interval",
        "now",
        "date_add",
        "date_sub",
        "curdate",
        "dayofweek",
        "if",
        "coalesce",
        "ifnull",
      ]);
      // Skip identifiers that look like <alias>.<col> (already scanned above)
      // by replacing them with a placeholder before tokenizing.
      const bareSrc = stripped.replace(
        /\b[a-z][a-z0-9_]*\.[a-z_][a-z0-9_]*/gi,
        " ",
      );
      const tokenRe = /\b([a-z_][a-z0-9_]*)\b/gi;
      let bm: RegExpExecArray | null;
      while ((bm = tokenRe.exec(bareSrc)) !== null) {
        const token = bm[1];
        const lower = token.toLowerCase();
        if (SQL_KEYWORDS.has(lower)) continue;
        if (token === table) continue; // the table name itself
        const expected = tableRenames.get(token);
        if (expected) {
          hits.push({
            file: site.file,
            line: site.line,
            alias: null,
            column: token,
            expectedSqlColumn: expected,
            table,
          });
        }
      }
    }
  }

  return hits;
}

// ─── Test Cases ──────────────────────────────────────────────────────────────

describe("raw SQL column drift — sweep-lint (Phase 97.5 D-02/D-03)", () => {
  // -----------------------------------------------------------------
  // PERMANENT self-test (D-02 ii).
  //
  // This `it()` block MUST NOT be deleted after the 3 real drift sites
  // are fixed in Task 3 GREEN. It is the SCANNER-IS-WORKING self-test
  // that survives the real-drift fix — guards against a future refactor
  // accidentally turning the scanner into a no-op (regex bug → matches
  // nothing → false green). See CONTEXT.md D-02 (ii) and PATTERNS.md
  // drift item 5.
  // -----------------------------------------------------------------
  it("PERMANENT — scanner detects a synthetic alias-qualified drift fixture (self-test, survives real-drift GREEN)", () => {
    const renameMap = buildRenameMap();
    const syntheticDrift =
      "SELECT sub.status FROM subscriptions sub WHERE sub.user_id = 1";
    const hits = scanSqlForDrift(
      { file: "<synthetic>", line: 1, sql: syntheticDrift },
      renameMap,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      column: "status",
      expectedSqlColumn: "subscription_status",
      table: "subscriptions",
      alias: "sub",
    });
  });

  it("PERMANENT — scanner detects a synthetic bare-column drift fixture in a single-table query (D-02 i)", () => {
    const renameMap = buildRenameMap();
    const syntheticBare = "SELECT status FROM subscriptions WHERE user_id = 1";
    const hits = scanSqlForDrift(
      { file: "<synthetic-bare>", line: 1, sql: syntheticBare },
      renameMap,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.column === "status" && h.alias === null)).toBe(
      true,
    );
  });

  // D-02 (iii): Drizzle interpolations like `${subscriptions.status}` resolve
  // at query-build time and are never wrong — scanner must NOT flag them.
  it("scanner skips Drizzle ${...} interpolations (D-02 iii)", () => {
    const renameMap = buildRenameMap();
    const interpolated =
      "SELECT ${subscriptions.status} FROM ${subscriptions} sub WHERE sub.user_id = 1";
    const hits = scanSqlForDrift(
      { file: "<interpolated>", line: 1, sql: interpolated },
      renameMap,
    );
    // The `${subscriptions.status}` becomes "PLACEHOLDER" before scanning;
    // and `FROM ${subscriptions}` becomes `FROM PLACEHOLDER` which does not
    // resolve to a known table. So no drift hits.
    expect(hits).toEqual([]);
  });

  // -----------------------------------------------------------------
  // D-05 RED-FIRST positive control on real source files.
  //
  // On master HEAD `3f330787` this MUST FAIL with 3 hits:
  //   - el-templo-bot/src/ai/tools.ts        line 495 (sub.status SELECT)
  //   - el-templo-bot/src/ai/tools.ts        line 500 (sub.status WHERE)
  //   - el-templo-bot/src/state/machine.ts   line  77 (s.status SELECT)
  // After Task 3 GREEN (rename to subscription_status), this turns green.
  // -----------------------------------------------------------------
  it("scanner detects the real drift sites in el-templo-bot/src/** + el-templo-api/src/** (RED on master, GREEN post-fix)", () => {
    const renameMap = buildRenameMap();
    const roots = [
      path.resolve(__dirname, "../../../el-templo-bot/src"),
      path.resolve(__dirname, "../../src"),
    ];
    const files = walkSourceFiles(roots);
    expect(files.length).toBeGreaterThan(0); // sanity: walker found something
    const sites = findRawSqlSites(files);
    expect(sites.length).toBeGreaterThan(0); // sanity: extractor captured blocks
    const hits = sites.flatMap((s) => scanSqlForDrift(s, renameMap));

    // Pretty-print on failure so the reader knows which file/line to fix.
    const summary = hits
      .map(
        (h) =>
          `  - ${path.relative(process.cwd(), h.file)}:${h.line} — ` +
          `${h.alias === null ? "<bare>" : h.alias}.${h.column} ` +
          `(table=${h.table}, expected SQL column=${h.expectedSqlColumn})`,
      )
      .join("\n");
    expect(
      hits,
      `Raw-SQL column drift detected:\n${summary}\n\nFix by renaming the JS-side reference to match the SQL column name (D-04 Option B inline rename).`,
    ).toEqual([]);
  });

  // -----------------------------------------------------------------
  // D-03 must-include SUBSET coverage.
  //
  // Live Drizzle introspection MUST cover the 10 high-risk plain-word ->
  // prefixed renames. SUBSET (`discovered ⊇ must-include`) — NOT equality
  // — so new schema renames in v5.4.0+ do not regress this test.
  // -----------------------------------------------------------------
  const HIGH_RISK_RENAMES_MUST_INCLUDE: Record<
    string,
    Record<string, string>
  > = {
    subscriptions: { status: "subscription_status" },
    bookings: { status: "booking_status" },
    attendance: {
      status: "attendance_status",
      source: "attendance_source",
    },
    whatsapp_conversations: { status: "conversation_status" },
    whatsapp_messages: {
      direction: "message_direction",
      messageType: "wa_message_type",
    },
    aura_config: { sourceType: "aura_config_source_type" },
    exercises: { level: "exercise_level" },
    format_compatibility: { level: "compat_level" },
  };

  it("Drizzle-discovered rename map ⊇ the high-risk must-include subset (D-03 — 10 entries across 8 tables)", () => {
    const discovered = buildRenameMap();
    for (const [table, expected] of Object.entries(
      HIGH_RISK_RENAMES_MUST_INCLUDE,
    )) {
      const discoveredCols = discovered.get(table);
      expect(
        discoveredCols,
        `table ${table} not discovered in Drizzle introspection — ` +
          `verify el-templo-api/src/db/schema/${table.replace(/_/g, "-")}.ts is exported from schema/index.ts`,
      ).toBeDefined();
      for (const [jsProp, sqlCol] of Object.entries(expected)) {
        expect(
          discoveredCols!.get(jsProp),
          `${table}.${jsProp} -> ${sqlCol} not in discovered map — ` +
            `verify the Drizzle column is declared as <type>("${sqlCol}", ...) in ${table}.ts`,
        ).toBe(sqlCol);
      }
    }
  });
});
