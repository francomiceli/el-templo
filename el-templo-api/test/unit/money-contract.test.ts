/**
 * Fase 207 Plan 12 (T-207-32): guard estatico del contrato de plata.
 *
 * Lee el codigo fuente (patron de `test/tenancy/con-05-sentinel.test.ts`) y
 * falla si alguien reintroduce lo que la fase 207 saco: importes enteros en
 * un schema, CAST a entero sobre importes, `multipleOf` de Ajv, columnas de
 * importe que no sean DECIMAL(14,2) o `Number.isInteger` sobre un importe.
 * No toca la base: corre con `vitest.config.unit.ts` y tambien con la suite
 * completa.
 *
 * Cada regla es una funcion pura `(path, contenido) => violaciones` para poder
 * probarla contra un fixture inline que la rompe (un guard que nunca falla es
 * tautologico). Si una regla se pone roja en CI: NO la "arregles" borrando el
 * test ni agregando una excepcion a la ligera. Cada mensaje explica por que
 * existe la regla. Las excepciones viven en las allowlists de abajo, cada una
 * con su motivo.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");
const MODULES_DIR = path.join(SRC_DIR, "modules");
const DB_SCHEMA_DIR = path.join(SRC_DIR, "db", "schema");

interface Violation {
  /** Ruta relativa a `src/`. */
  file: string;
  line: number;
  rule: string;
  detail: string;
}

// ─── utilidades ──────────────────────────────────────────────────────────

/** Lista recursiva de archivos `.ts` (ordenada, para mensajes estables). */
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
}

function rel(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join("/");
}

/**
 * Saca los comentarios SIN mover lineas (cada comentario de bloque se
 * reemplaza por sus mismos saltos de linea), asi el numero de linea que se
 * reporta es el del archivo real. Sin esto el guard se pondria rojo por su
 * propia documentacion (p. ej. `shared/money.ts` explica por que NO usa
 * `multipleOf`).
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function findAll(
  file: string,
  code: string,
  regex: RegExp,
  rule: string,
  detail: (match: RegExpExecArray) => string,
): Violation[] {
  const clean = stripComments(code);
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const re = new RegExp(regex.source, flags);
  const out: Violation[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    out.push({
      file,
      line: lineOf(clean, m.index),
      rule,
      detail: detail(m),
    });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function format(violations: Violation[], why: string): string {
  const lines = violations.map((v) => `  - ${v.file}:${v.line} -> ${v.detail}`);
  return `Regla rota: ${violations[0]?.rule}\nPor que existe: ${why}\n${lines.join("\n")}`;
}

// ─── regla 1: sin CAST a entero sobre importes ───────────────────────────

const RULE_1 = "R1 sin CAST(... AS SIGNED/UNSIGNED) en src/modules";
const RULE_1_WHY =
  "un CAST a entero sobre un DECIMAL trunca los centavos en silencio (SUM de 100.50 -> 100) y los totales dejan de cuadrar con la caja (fase 207). Usa `COALESCE(SUM(col), 0)` y `Number()` en el resultado.";

/**
 * Excepciones a R1. Ruta relativa a `src/` -> motivo.
 * `progression/routes.ts` (RPE) no figura: hoy usa `CAST(AVG(rpe) AS DECIMAL(3,1))`,
 * que no es un CAST a entero y no dispara la regla.
 */
const R1_ALLOWLIST: Record<string, string> = {
  "modules/analytics/frequency-service.ts":
    "CAST(LEFT(schedules.start_time, 2) AS UNSIGNED) = hora del dia de un horario, no es un importe",
};

function checkNoIntegerCast(file: string, code: string): Violation[] {
  if (R1_ALLOWLIST[file] !== undefined) return [];
  return findAll(
    file,
    code,
    /\bAS\s+(?:UN)?SIGNED(?:\s+INTEGER)?\b/i,
    RULE_1,
    (m) => `"${m[0]}"`,
  );
}

// ─── regla 2: sin multipleOf ─────────────────────────────────────────────

const RULE_2 = "R2 sin multipleOf en src";
const RULE_2_WHY =
  "con floats `multipleOf: 0.01` rechaza importes validos (1.15 / 0.01 = 114.99999999999999). Usa la keyword `moneyTwoDecimals` (MONEY_*_SCHEMA de shared/money.ts), que valida con Number(n.toFixed(2)) === n.";

function checkNoMultipleOf(file: string, code: string): Violation[] {
  return findAll(file, code, /\bmultipleOf\b/, RULE_2, () => "multipleOf");
}

// ─── regla 3: importes del ledger no pueden ser `type: "integer"` ────────

const RULE_3 = 'R3 importe del ledger declarado type: "integer" en un schema';
const RULE_3_WHY =
  "fast-json-stringify trunca un number declarado integer en la RESPUESTA (100.5 sale como 100, sin error ni log) y el body integer rechaza los centavos. Usa MONEY_RESPONSE_SCHEMA / MONEY_NON_NEGATIVE_SCHEMA / MONEY_POSITIVE_SCHEMA de shared/money.ts.";

/** Nombres de campo que son importes del ledger o del circuito de caja. */
const MONEY_FIELD_NAMES = [
  "amount",
  "allocatedAmount",
  "amountReceived",
  "countedAmount",
  "openingBalance",
  "changeFund",
  "expectedAmount",
  "firmeAmount",
  "pendienteAmount",
  "difference",
  "monthlyRevenue",
  "revenue",
  "balance",
  "totalAmount",
  "firmeBalance",
  "cobrado",
  "deudaCobrable",
  "deudaMas10",
  "deudaIncobrable",
];

/**
 * Excepciones a R3: `"<ruta relativa a src/>::<campo>"` -> motivo. Hoy vacia:
 * los importes de catalogo (precios de planes, `subscriptions.price_paid`,
 * promos, comisiones) tienen otros nombres (`price`, `pricePaid`,
 * `priceOverrideAmount`...) y no entran en la lista. Si un campo de la lista
 * es legitimamente entero (catalogo), agregalo aca con su motivo.
 */
const R3_ALLOWLIST: Record<string, string> = {};

/**
 * Todo `src/modules`: los schemas viven en `schemas.ts` pero varias rutas
 * (p. ej. `finance/coach-load-routes.ts`) los declaran inline, y un reporte
 * nuevo puede hacerlo en cualquier `routes.ts`. Hoy no hay ningun campo de la
 * lista con `type: "integer"` en todo `src`, asi que no hace falta acotar.
 */
function isSchemaFile(file: string): boolean {
  return file.startsWith("modules/");
}

function checkNoIntegerMoneyField(file: string, code: string): Violation[] {
  if (!isSchemaFile(file)) return [];
  const names = MONEY_FIELD_NAMES.join("|");
  // `amount: {` + (salto de linea opcional) + `type: "integer"` o
  // `type: ["integer", "null"]`.
  const re = new RegExp(
    `(?<![\\w$])(${names})\\s*:\\s*\\{\\s*type\\s*:\\s*(?:\\[\\s*)?["']integer["']`,
  );
  return findAll(file, code, re, RULE_3, (m) => `campo "${m[1]}"`).filter(
    (v) => {
      const field = /campo "(\w+)"/.exec(v.detail)?.[1] ?? "";
      return R3_ALLOWLIST[`${file}::${field}`] === undefined;
    },
  );
}

// ─── regla 4: columnas de importe = decimal(14,2) mode number ────────────

const RULE_4 = "R4 columna de importe que no es decimal(14,2) mode number";
const RULE_4_WHY =
  "las columnas de importe del ledger y las cajas son DECIMAL(14,2) para guardar centavos exactos (migracion 0327). Una columna int pierde los centavos al escribir; sin mode number el valor llega como string y rompe las sumas.";

/** Inventario de la fase 207 (15 columnas): archivo de schema -> columnas SQL. */
const MONEY_COLUMNS: Record<string, string[]> = {
  "db/schema/financial-transactions.ts": ["amount"],
  "db/schema/transaction-links.ts": ["allocated_amount"],
  "db/schema/balances.ts": ["amount"],
  "db/schema/cash-registers.ts": ["opening_balance", "change_fund"],
  "db/schema/cash-counts.ts": [
    "change_fund",
    "firme_amount",
    "pendiente_amount",
    "expected_amount",
    "counted_amount",
    "difference",
  ],
  "db/schema/weekly-board.ts": [
    "cobrado",
    "deuda_cobrable",
    "deuda_mas_10",
    "deuda_incobrable",
  ],
};

function checkMoneyColumns(file: string, code: string): Violation[] {
  const columns = MONEY_COLUMNS[file];
  if (columns === undefined) return [];
  const clean = stripComments(code);
  const out: Violation[] = [];

  for (const col of columns) {
    const re = new RegExp(
      `\\bdecimal\\(\\s*["']${col}["']\\s*,\\s*\\{([^}]*)\\}`,
    );
    const m = re.exec(clean);
    if (m === null) {
      out.push({
        file,
        line: 1,
        rule: RULE_4,
        detail: `la columna "${col}" no esta declarada con decimal("${col}", { ... })`,
      });
      continue;
    }
    const opts = m[1] ?? "";
    const problems: string[] = [];
    if (!/\bprecision\s*:\s*14\b/.test(opts)) problems.push("precision: 14");
    if (!/\bscale\s*:\s*2\b/.test(opts)) problems.push("scale: 2");
    if (!/\bmode\s*:\s*["']number["']/.test(opts))
      problems.push('mode: "number"');
    if (problems.length > 0) {
      out.push({
        file,
        line: lineOf(clean, m.index),
        rule: RULE_4,
        detail: `"${col}" no declara ${problems.join(", ")}`,
      });
    }
  }

  // Cualquier columna int/bigint con nombre de importe en esos archivos.
  out.push(
    ...findAll(
      file,
      code,
      /\b(?:tiny|small|medium|big)?int\(\s*["'][a-z_]*(?:amount|balance|fund|difference|cobrado|deuda)[a-z_]*["']/i,
      RULE_4,
      (m) => `columna entera con nombre de importe: ${m[0]}`,
    ),
  );
  return out;
}

// ─── regla 5: sin Number.isInteger sobre importes en finance ─────────────

const RULE_5 = "R5 Number.isInteger en src/modules/finance";
const RULE_5_WHY =
  "validar un importe con Number.isInteger rechaza los centavos validos (100.50) y vuelve a imponer pesos enteros. Valida con assertMoneyAmount / isTwoDecimalAmount (shared/money.ts).";

/**
 * Excepciones a R5: `"<ruta relativa a src/>::<texto de la linea sin espacios
 * extremos>"` -> motivo. Solo para validaciones sobre ids/conteos, nunca sobre
 * importes. Hoy vacia.
 */
const R5_ALLOWLIST: Record<string, string> = {};

function checkNoIsIntegerInFinance(file: string, code: string): Violation[] {
  if (!/^modules\/finance\/[^/]+\.ts$/.test(file)) return [];
  const lines = code.split("\n");
  return findAll(
    file,
    code,
    /\bNumber\.is(?:Safe)?Integer\s*\(/,
    RULE_5,
    (m) => `"${m[0]}"`,
  ).filter((v) => {
    const text = (lines[v.line - 1] ?? "").trim();
    return R5_ALLOWLIST[`${file}::${text}`] === undefined;
  });
}

// ─── ejecucion sobre el codigo real ──────────────────────────────────────

const MODULE_FILES = listTsFiles(MODULES_DIR);
const ALL_SRC_FILES = listTsFiles(SRC_DIR);

function runOver(
  files: string[],
  check: (file: string, code: string) => Violation[],
): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    out.push(...check(rel(f), fs.readFileSync(f, "utf-8")));
  }
  return out;
}

describe("contrato de plata: el codigo real cumple las 5 reglas", () => {
  it("el guard ve los archivos que dice vigilar", () => {
    // Sin esto, un cambio de estructura de carpetas dejaria al guard
    // recorriendo cero archivos y en verde para siempre.
    expect(MODULE_FILES.length).toBeGreaterThan(100);
    expect(MODULE_FILES.map(rel)).toContain(
      "modules/finance/transaction-service.ts",
    );
    expect(MODULE_FILES.map(rel)).toContain("modules/finance/schemas.ts");
    for (const file of Object.keys(MONEY_COLUMNS)) {
      expect(
        fs.existsSync(path.join(SRC_DIR, file)),
        `${file} del inventario de columnas ya no existe: actualiza MONEY_COLUMNS (no borres la regla R4)`,
      ).toBe(true);
    }
    expect(
      Object.values(MONEY_COLUMNS).reduce((n, c) => n + c.length, 0),
      "el inventario de la fase 207 son 15 columnas de importe",
    ).toBe(15);
    expect(DB_SCHEMA_DIR).toContain("db");
  });

  it("R1: ningun CAST(... AS SIGNED/UNSIGNED) en src/modules fuera de la allowlist", () => {
    const v = runOver(MODULE_FILES, checkNoIntegerCast);
    expect(v, v.length ? format(v, RULE_1_WHY) : "").toEqual([]);
  });

  it("R1: las excepciones de la allowlist siguen existiendo (no quedan reglas muertas)", () => {
    for (const file of Object.keys(R1_ALLOWLIST)) {
      const full = path.join(SRC_DIR, file);
      expect(
        fs.existsSync(full),
        `${file} ya no existe: saca la excepcion`,
      ).toBe(true);
      expect(
        /\bAS\s+(?:UN)?SIGNED\b/i.test(fs.readFileSync(full, "utf-8")),
        `${file} ya no tiene un CAST a entero: saca la excepcion de R1_ALLOWLIST`,
      ).toBe(true);
    }
  });

  it("R2: ningun multipleOf en src (fuera de comentarios)", () => {
    const v = runOver(ALL_SRC_FILES, checkNoMultipleOf);
    expect(v, v.length ? format(v, RULE_2_WHY) : "").toEqual([]);
  });

  it("R3: ningun importe del ledger declarado type integer en los schemas", () => {
    const v = runOver(MODULE_FILES, checkNoIntegerMoneyField);
    expect(v, v.length ? format(v, RULE_3_WHY) : "").toEqual([]);
  });

  it("R4: las 15 columnas de importe son decimal(14,2) mode number", () => {
    const v = runOver(
      ALL_SRC_FILES.filter((f) => rel(f).startsWith("db/schema/")),
      checkMoneyColumns,
    );
    expect(v, v.length ? format(v, RULE_4_WHY) : "").toEqual([]);
  });

  it("R5: ningun Number.isInteger en src/modules/finance", () => {
    const v = runOver(MODULE_FILES, checkNoIsIntegerInFinance);
    expect(v, v.length ? format(v, RULE_5_WHY) : "").toEqual([]);
  });
});

describe("contrato de plata: cada regla detecta su violacion (el guard no es tautologico)", () => {
  it("R1 detecta CAST AS SIGNED / UNSIGNED y respeta la allowlist", () => {
    const mala = "const q = sql`SELECT CAST(SUM(amount) AS SIGNED) FROM t`;";
    const v = checkNoIntegerCast("modules/finance/x-service.ts", mala);
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(1);
    expect(
      checkNoIntegerCast(
        "modules/finance/x-service.ts",
        "sql`CAST(x AS UNSIGNED)`",
      ),
    ).toHaveLength(1);
    expect(
      checkNoIntegerCast(
        "modules/finance/x-service.ts",
        "sql`CAST(x AS signed integer)`",
      ),
    ).toHaveLength(1);
    // Excepcion con motivo.
    expect(
      checkNoIntegerCast(
        "modules/analytics/frequency-service.ts",
        "sql`CAST(LEFT(t, 2) AS UNSIGNED)`",
      ),
    ).toEqual([]);
    // Un CAST a DECIMAL y un comentario que lo nombra no son violacion.
    expect(
      checkNoIntegerCast(
        "modules/progression/routes.ts",
        "sql`CAST(AVG(rpe) AS DECIMAL(3,1))`",
      ),
    ).toEqual([]);
    expect(
      checkNoIntegerCast(
        "modules/finance/x-service.ts",
        "// antes: CAST(SUM(amount) AS SIGNED)\n/* AS SIGNED */\nconst a = 1;",
      ),
    ).toEqual([]);
  });

  it("R2 detecta multipleOf pero no en comentarios, y reporta la linea", () => {
    const mala = 'const s = {\n  type: "number",\n  multipleOf: 0.01,\n};';
    const v = checkNoMultipleOf("modules/finance/schemas.ts", mala);
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(3);
    expect(
      checkNoMultipleOf(
        "shared/money.ts",
        "/**\n * Por que NO `multipleOf: 0.01`\n */\n// multipleOf\nconst a = 1;",
      ),
    ).toEqual([]);
  });

  it("R3 detecta un importe integer (en una linea, en varias y como union con null)", () => {
    const unaLinea = 'amount: { type: "integer", minimum: 1 },';
    const variasLineas =
      'properties: {\n    allocatedAmount: {\n      type: "integer",\n    },\n  }';
    const conNull = 'difference: { type: ["integer", "null"] },';
    expect(
      checkNoIntegerMoneyField("modules/finance/schemas.ts", unaLinea),
    ).toHaveLength(1);
    const multi = checkNoIntegerMoneyField(
      "modules/reports/schemas.ts",
      variasLineas,
    );
    expect(multi).toHaveLength(1);
    expect(multi[0]?.line).toBe(2);
    expect(
      checkNoIntegerMoneyField("modules/finance/coach-load-routes.ts", conNull),
    ).toHaveLength(1);
  });

  it("R3 no marca importes number, catalogo ni conteos, ni archivos fuera de src/modules", () => {
    const ok = [
      "amount: MONEY_RESPONSE_SCHEMA,",
      'amount: { type: "number" },',
      'priceOverrideAmount: { type: "integer", minimum: 0 },',
      'pricePaid: { type: "integer" },',
      'total: { type: "integer" },',
      'count: { type: "integer" },',
    ].join("\n");
    expect(checkNoIntegerMoneyField("modules/finance/schemas.ts", ok)).toEqual(
      [],
    );
    // Tambien en rutas con schema inline.
    expect(
      checkNoIntegerMoneyField(
        "modules/reports/routes.ts",
        'amount: { type: "integer" }',
      ),
    ).toHaveLength(1);
    // Fuera de src/modules la regla no aplica.
    expect(
      checkNoIntegerMoneyField("plugins/x.ts", 'amount: { type: "integer" }'),
    ).toEqual([]);
  });

  it("R4 detecta una columna de importe como int, sin mode number o con otra escala", () => {
    const file = "db/schema/balances.ts";
    const enteroMal = 'amount: int("amount").notNull(),';
    const v1 = checkMoneyColumns(file, enteroMal);
    // falta el decimal(...) y ademas es una columna entera con nombre de importe
    expect(v1.length).toBeGreaterThanOrEqual(2);

    const sinMode =
      'amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),';
    const v2 = checkMoneyColumns(file, sinMode);
    expect(v2).toHaveLength(1);
    expect(v2[0]?.detail).toContain('mode: "number"');

    const otraEscala =
      'amount: decimal("amount", { precision: 14, scale: 0, mode: "number" }).notNull(),';
    const v3 = checkMoneyColumns(file, otraEscala);
    expect(v3).toHaveLength(1);
    expect(v3[0]?.detail).toContain("scale: 2");

    const ok =
      'amount: decimal("amount", {\n precision: 14,\n scale: 2,\n mode: "number",\n}).notNull(),';
    expect(checkMoneyColumns(file, ok)).toEqual([]);
  });

  it("R4 exige TODAS las columnas del inventario de un archivo", () => {
    // cash-counts tiene 6 columnas: un archivo vacio las reporta a las 6.
    expect(checkMoneyColumns("db/schema/cash-counts.ts", "")).toHaveLength(6);
    // Un archivo fuera del inventario no se vigila.
    expect(checkMoneyColumns("db/schema/users.ts", "")).toEqual([]);
  });

  it("R5 detecta Number.isInteger sobre un importe en finance y respeta comentarios", () => {
    const mala =
      "if (!Number.isInteger(amount)) throw new Error('entero');\nif (!Number.isSafeInteger(b)) x();";
    const v = checkNoIsIntegerInFinance(
      "modules/finance/movement-service.ts",
      mala,
    );
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.line)).toEqual([1, 2]);
    expect(
      checkNoIsIntegerInFinance(
        "modules/finance/movement-service.ts",
        "// no usar Number.isInteger(amount)\nconst a = 1;",
      ),
    ).toEqual([]);
    // Fuera de src/modules/finance/*.ts la regla no aplica.
    expect(
      checkNoIsIntegerInFinance(
        "modules/members/service.ts",
        "Number.isInteger(id)",
      ),
    ).toEqual([]);
  });

  it("el formato del mensaje nombra regla, motivo, archivo y linea", () => {
    const v: Violation[] = [
      {
        file: "modules/x/schemas.ts",
        line: 7,
        rule: RULE_3,
        detail: 'campo "amount"',
      },
    ];
    const msg = format(v, RULE_3_WHY);
    expect(msg).toContain(RULE_3);
    expect(msg).toContain("modules/x/schemas.ts:7");
    expect(msg).toContain("fast-json-stringify");
  });
});
