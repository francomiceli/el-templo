# Phase 170: Detección automática — sentinel de pool mysql2 + lint en CI - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 14 (8 nuevos, 6 modificados)
**Analogs found:** 12 / 14

> **BASE DE LECTURA: `origin/master` (`a70ee297` o posterior).** El checkout principal está ~262 commits atrás. **Todos los números de línea de este documento son de `origin/master`**, leídos con `git show origin/master:<path>`. No confiar en el working tree para ninguno de estos archivos.

---

## File Classification

| New/Modified File                                | Role                       | Data Flow                | Closest Analog                                       | Match Quality                  |
| ------------------------------------------------ | -------------------------- | ------------------------ | ---------------------------------------------------- | ------------------------------ |
| `src/db/sentinel/analyze.ts` (NEW)                | utility (parser puro)      | transform (string→veredicto) | `src/db/scripts/verify-tenant-uniques.ts` (+ `require-tenant.ts`) | role-match (función pura + report shape) |
| `src/db/sentinel/install.ts` (NEW)                | middleware (interceptor de driver) | event-driven (hook por query) | — (`src/plugins/database.ts` solo para ciclo de vida) | **no analog** (ver §No Analog Found) |
| `src/db/scripts/lint-tenant.ts` (NEW)             | script CLI                 | batch / file-I/O (AST)   | `src/db/scripts/verify-tenant-uniques.ts`            | **exact** (idioma completo del CLI) |
| `tenant-lint-allowlist.json` (NEW)                | config / registro de datos | —                        | `TENANT_UNIQUE_ALLOWLIST` en `src/db/tenant-tables.ts:281-359` | role-match (Record clave→motivo) |
| `src/db/tenant-tables.ts` (MOD)                   | model / metadata           | —                        | sí mismo: `TENANT_GLOBAL_UNIQUES` (`:205-253`)       | **exact** (auto-analog)        |
| `src/plugins/database.ts` (MOD)                   | plugin / config            | request-response (lifecycle) | sí mismo (`:14-42`)                                  | **exact** (auto-analog)        |
| `.github/workflows/ci.yml` (MOD)                  | config CI                  | batch                    | job `api-check` (`:20-54`)                           | **exact**                      |
| `package.json` (MOD)                              | config                     | —                        | `"db:verify-uniques"` (`:15`)                        | **exact**                      |
| `.env.example` (MOD)                              | config                     | —                        | bloque Wellhub (tail)                                | **exact**                      |
| `test/unit/sentinel-analyze.test.ts` (NEW)        | test unit                  | transform                | `test/unit/require-tenant.test.ts`                   | **exact**                      |
| `test/tenancy/con-05-sentinel.test.ts` (NEW)      | test integration           | request-response + tx    | `test/tenancy/con-03-write-paths-tenant-id.test.ts`  | **exact**                      |
| `test/tenancy/con-06-lint.test.ts` (NEW)          | test integration (CLI)     | batch / file-I/O         | `test/unit/require-tenant.test.ts` (`:204-236`, exit codes) + con-03 (docblock) | role-match |
| `test/tenancy/__fixtures__/*.ts` (NEW)            | test fixture               | —                        | `test/tv/__fixtures__/timer-vectors.json`            | partial (único precedente de `__fixtures__/`) |
| `test/db/tenant-tables.test.ts` (MOD)             | test unit (gate de forma)  | —                        | sí mismo (`:204-247`)                                | **exact** (auto-analog)        |

---

## Pattern Assignments

### `src/db/scripts/lint-tenant.ts` (script CLI, batch/file-I/O) — CON-06

**Analog:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` — **copiar el archivo entero como molde**. Es el idioma cerrado del repo para gates standalone (D-09 lo lockea) y ya lo reafirmó `require-tenant.ts`.

**Docblock de cabecera** (`verify-tenant-uniques.ts:1-59`) — el molde tiene secciones fijas, en este orden: `QUÉ PRUEBA` (numerado), un `POR QUÉ NO ...` que anticipa la objeción obvia, `SOLO LECTURA`, `CÓMO SE CORRE` (los tres modos: local / suite / servidor), y los códigos de salida. Reproducir esa estructura:

```typescript
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
 * ...
 * CÓMO SE CORRE
 * -------------
 *   local / desarrollo:  cd el-templo-api && pnpm db:verify-uniques
 *   base de test:        lo invoca el test de introspección de la fase 168
 *   staging / prod:      en el servidor, sobre la build compilada
 *                        NODE_ENV=production node dist/db/scripts/verify-tenant-uniques.js
 *
 * Códigos de salida del CLI: 0 sin discrepancias, 1 con discrepancias, 2 ante
 * error de conexión o de uso.
 */
```

**Exención `tenant-safe:` propia del script** (`verify-tenant-uniques.ts:61-66`) — el lint es tooling de plataforma y, si toca `src/**`, se va a auto-analizar. Este es el formato exacto a copiar (comentario de bloque APARTE, motivo obligatorio, nota de `//` explicando el porqué debajo):

```typescript
/* tenant-safe: verificador de plataforma: escanea TODOS los tenants por diseño, corre en CI/deploy y es de solo lectura */
// Exención de la regla `--tenant` obligatorio de los scripts CLI (fase 169,
// CON-04/D-06 — ver `src/db/scripts/require-tenant.ts`). El motivo es
// obligatorio y va escrito arriba: una exención sin motivo es indistinguible de
// un olvido (T-169-36).
```

**Imports + reuso de la fuente canónica** (`verify-tenant-uniques.ts:68-84`) — el gate NUNCA duplica la lista de tablas:

```typescript
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
```

> **Nota para el lint:** `dotenv`/`mysql2` **no aplican** (el lint no toca la DB). Lo que sí se copia es: importar de `../tenant-tables`, y el `const TENANT_COLUMN = "tenant_id"` como único literal del archivo.

**Forma del reporte — interfaces exportadas por hallazgo** (`verify-tenant-uniques.ts:187-233`). Cada tipo de hallazgo tiene su interface con doc de una línea, y el `Report` cierra con `warnings` (NO suman) + `discrepancies` (la suma):

```typescript
/** Una unique global de tabla gym-owned que nadie clasificó. Es el hallazgo. */
export interface UnclassifiedUnique {
  table: string;
  indexName: string;
  /** La columna que quedó en `SEQ_IN_INDEX = 1` en vez de `tenant_id`. */
  firstColumn: string;
  columns: string[];
}

export interface TenantUniquesReport {
  database: string;
  gymOwnedChecked: number;
  /** D-14: uniques sin `tenant_id` al frente y sin clasificar. */
  uniquesMissingTenantPrefix: UnclassifiedUnique[];
  /** Clasificaciones podridas: apuntan a un índice que no existe. */
  staleClassifications: StaleClassification[];
  /** Observaciones que NO son discrepancias. */
  warnings: string[];
  /** Suma de los cinco arrays de hallazgo. Los `warnings` NO suman. */
  discrepancies: number;
}
```

Mapeo directo a CON-06: `violations[]` (D-13), `staleEntries[]` (D-14), `gainedEntries[]` (D-14), `strictWithAllowlist[]` (D-15), `exemptions[]` (D-12, va en el inventario ⇒ **warnings, no discrepancias**), `warnings[]`, `discrepancies`.

**Función pura con dependencia inyectada** (`verify-tenant-uniques.ts:326-332`) — el core es una función exportada que recibe su capa de I/O por parámetro, para que el test no necesite recursos:

```typescript
export async function verifyTenantUniques(
  query: QueryFn,
): Promise<TenantUniquesReport> {
  const database = await stepDatabaseGuard(query);
  const indexes = await loadIndexes(query);
  const physicalTables = await loadPhysicalTables(query);
  // ...
```

Para el lint el equivalente es `lintTenant(opts: { rootDir: string; allowlist: Allowlist; baseAllowlist?: Allowlist })` — el test le pasa un `rootDir` de fixture y una allowlist en memoria, sin tocar `src/` ni `git`.

**Detección de "stale"** (`verify-tenant-uniques.ts:402-426`) — el patrón exacto del gate anti-podredumbre de D-14 (entrada del registro que ya no corresponde a nada vivo):

```typescript
const liveUniqueKeys = new Set(
  indexes.filter((idx) => idx.isUnique).map((idx) => `${idx.table}.${idx.indexName}`),
);
const staleClassifications: StaleClassification[] = [];
for (const [key, motive] of Object.entries(TENANT_GLOBAL_UNIQUES)) {
  if (!liveUniqueKeys.has(key)) {
    staleClassifications.push({ key, register: "TENANT_GLOBAL_UNIQUES", motive });
  }
}
```

**Presentación — `formatReport` devuelve string, no imprime** (`verify-tenant-uniques.ts:514-581`). Cada hallazgo se imprime con **qué hacer** debajo. Copiar ese "renglón de acción" — es lo que decide si el gate se respeta o se esquiva (Open Question #4 del RESEARCH: distinguir "el archivo no existe" de "el archivo ya no viola"):

```typescript
export function formatReport(report: TenantUniquesReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(`Base de datos: ${report.database}`);
  lines.push("=".repeat(72));
  // ...
  for (const issue of report.uniquesMissingTenantPrefix) {
    lines.push(`  - ${issue.table}.${issue.indexName} (${issue.columns.join(", ")}) — la primera columna es \`${issue.firstColumn}\`.`);
    lines.push(`      Que hacer: o la unique pasa a (tenant_id, ${issue.columns.join(", ")}) en una migracion, o se clasifica en src/db/tenant-tables.ts con el motivo escrito.`);
  }
  // ...
  lines.push(`DISCREPANCIAS: ${report.discrepancies}`);
  lines.push("--- Advertencias (NO son discrepancias) ---");
  for (const warning of report.warnings) lines.push(`  - ${warning}`);
  return lines.join("\n");
}
```

**Bloque CLI + exit codes** (`verify-tenant-uniques.ts:587-627`) — **el contrato 0/1/2 de D-09, literal**:

```typescript
async function main(): Promise<number> {
  // Misma carga de env que src/db/run-migrations.ts.
  const envFile =
    process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  // ...
  const report = await verifyTenantUniques(query);
  console.log(formatReport(report));
  return report.discrepancies === 0 ? 0 : 1;
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
```

- `console.*` está **permitido acá** (es CLI, no runtime de Fastify). Precedente escrito en `require-tenant.ts:70-72`.
- El guard `if (require.main === module)` es lo que permite importar el módulo desde el test sin ejecutar el CLI.
- El lint **no** necesita la carga de `dotenv` (no abre conexión) — omitirla y decirlo en el docblock.

**Error de USO tipado (exit 2)** — copiar de `require-tenant.ts:110-117` y `:222-226`:

```typescript
export class TenantArgError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "TenantArgError";
  }
}

export function failTenantArg(err: unknown, scriptName: string): never {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error(`${scriptName} fallo: ${mensaje}`);
  process.exit(err instanceof TenantArgError ? err.exitCode : 1);
}
```

Aplicación en el lint: allowlist ilegible/malformada, `--base` sin resolver (Pitfall 5, fail-closed) y flags inválidos ⇒ **exit 2**. Violaciones ⇒ **exit 1**.

---

### `src/db/sentinel/analyze.ts` (utility, transform puro) — CON-05

**Analog:** `src/db/scripts/require-tenant.ts` para la forma "parser puro exportado + error tipado", y `verify-tenant-uniques.ts` para la forma del veredicto/reporte. No hay analog de parseo de SQL en el repo (es código nuevo); lo que se copia es la **forma**, no la lógica.

**Parser puro exportado, testeable sin recursos** (`require-tenant.ts:140-169`) — nótese: sin I/O, con `@throws` documentado y mensajes accionables que citan el uso correcto:

```typescript
/**
 * Extrae el id de gimnasio de `argv`. Acepta `--tenant=<id>` y `--tenant <id>`.
 *
 * @throws {TenantArgError} si el flag falta, viene sin valor, no es un número,
 *   no es entero o no es positivo.
 */
export function parseTenantArg(argv: string[]): number {
  // ...
  if (crudo === undefined || crudo.trim() === "") {
    throw new TenantArgError(
      `Falta el gimnasio: este script escribe tablas gym-owned y no adivina en cuál. ${USO}`,
    );
  }
  // ...
}
```

**Capa de I/O inyectable con un type alias exportado** (`require-tenant.ts:98-101`) — el sentinel necesita lo mismo para el logger y para la lista strict (D-07):

```typescript
export type TenantQueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>;
```

Equivalente para esta fase: `export interface SentinelOptions { strictTables?: ReadonlySet<string>; log: TenantLogger; mode: "throw" | "log" | "silent" | "inventory" }`. **Ya existe un `TenantLogger` reusable** en `src/modules/shared/tenant.ts:116-120` — importarlo, no definir uno nuevo.

**Consumo de la fuente canónica** — `isGymOwnedTable` está **diseñada explícitamente para este consumidor** (`tenant-tables.ts:177-187`):

```typescript
/**
 * `true` si la tabla física `name` lleva la columna `tenant_id`.
 *
 * Acepta `string` (no `GymOwnedTable`) a propósito: los consumidores de las
 * fases 168-170 clasifican nombres que salen de INFORMATION_SCHEMA, de
 * `getTableName()` o del AST del linter — todos `string` en tiempo de
 * compilación.
 */
export function isGymOwnedTable(name: string): boolean {
  return GYM_OWNED_SET.has(name);
}
```

**Error handling:** `catch (err: unknown)` + `instanceof Error` (CLAUDE.md). Precedente literal en `require-tenant.ts:223` y `verify-tenant-uniques.ts:623`.

---

### `src/plugins/database.ts` (plugin, lifecycle) — MODIFICADO, integración del sentinel

**Analog:** sí mismo. El archivo completo son 42 líneas (`origin/master`); esta es la superficie a extender:

```typescript
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../db/schema";

declare module "fastify" {
  interface FastifyInstance {
    db: MySql2Database<typeof schema>;
    dbPool: mysql.Pool;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const pool = mysql.createPool({ /* host/port/user/... */ });

  const db = drizzle(pool, { schema, mode: "default" });   // ← el sentinel se instala ANTES de esta línea

  fastify.decorate("db", db);
  fastify.decorate("dbPool", pool);                        // ← identidad del pool: NO usar Proxy

  fastify.addHook("onClose", async () => {
    await pool.end();                                      // ← acá va el clearInterval del resumen (Pitfall 4)
  });

  fastify.log.info("Database connected");
};

export default fp(databasePlugin, { name: "database" });
```

**Puntos de anclaje concretos:**

| Línea (origin/master) | Qué hacer                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `:28` → `:30`         | `installSentinel(pool, { log: fastify.log, ... })` entre el `createPool` y el `drizzle(pool, …)`. |
| `:30`                 | El `drizzle(pool, { schema, mode: "default" })` **no se toca** — el wrap va por debajo.           |
| `:33`                 | `fastify.decorate("dbPool", pool)` — es el motivo por el que el RESEARCH descarta `Proxy`: 18 sitios de test hacen `app.dbPool.getConnection()` sobre esta misma instancia. |
| `:35-37`              | El hook `onClose` **ya existe**: sumar ahí el `clearInterval` del resumen periódico (Pitfall 4), junto al `pool.end()`. |
| `:39`                 | `fastify.log.info("Database connected")` — el logger a pasarle al sentinel (Pino, CLAUDE.md prohíbe `console.log` en runtime). |

---

### `src/db/tenant-tables.ts` (model / metadata) — MODIFICADO, lista strict por módulo (D-05/D-06)

**Analog:** sí mismo — `TENANT_GLOBAL_UNIQUES` (`:205-253`) es el molde exacto de "registro con motivo obligatorio".

**Cabecera del módulo** (`tenant-tables.ts:1-51`) — ya anuncia esta fase; actualizarla, no reescribirla:

```typescript
// Módulo: tenant-tables — clasificación canónica "¿esta tabla lleva tenant_id?" (v6.0, COL-01)
//                          + "¿por qué esta unique sigue siendo global?" (v6.0, CON-01/CON-02)
// ...
// POR QUÉ IMPORTA MANTENERLA
// --------------------------
//   - Fase 168 (CON-02): índices y uniques compuestas `(tenant_id, ...)`.
//   - Fase 169 (helpers de escritura): `tenantWhere` / `tenantValues`.
//   - Fase 170 (ISO): sentinel de pool mysql2 y lint en CI.   ← la sección a extender
```

**Molde del registro nuevo** — `TENANT_GLOBAL_UNIQUES` (`:227-253`) muestra el estilo: docblock que explica los racionales, subsecciones con separador `// ── … ──`, y valor = motivo escrito en prosa larga:

```typescript
/**
 * Lista **M8** — uniques de tablas gym-owned que quedan GLOBALES a propósito y
 * para siempre, con el motivo de cada una (doc 05 §6 ...). Son once y no hay
 * una doceava por descuido.
 * ...
 */
export const TENANT_GLOBAL_UNIQUES: Record<string, string> = {
  // ── Ids de plataforma externa ──────────────────────────────────────────────
  "users.users_gympass_id_unique":
    "Id de plataforma externa: `gympass_id` lo emite Gympass/Wellhub, no El Templo. ...",
```

**Forma esperada para D-06** (módulo → tablas, arranca vacía):

```typescript
/**
 * Fase 170 (CON-05, D-05/D-06) — módulos YA MIGRADOS al patrón `tenantWhere`/
 * `tenantValues`. El sentinel hace THROW en test/dev sobre las tablas de este
 * registro; el resto queda en silencio (D-08).
 *
 * Arranca VACÍA a propósito: en la 170 no hay ningún módulo migrado. La primera
 * entrada la agrega la fase 172, y agregarla obliga a vaciar las entradas de esa
 * tabla en `tenant-lint-allowlist.json` (D-15, enforced por el lint).
 */
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {};
```

Helper acompañante con el idioma de `isGymOwnedTable`/`isTenantGlobalUnique` (`:185-187`, `:407-415`): `export function isStrictTable(name: string): boolean` que aplana el `Record` en un `Set` module-level (`const STRICT_SET: ReadonlySet<string> = new Set(Object.values(...).flat())`, mismo patrón que `GYM_OWNED_SET` en `:175`).

---

### `test/unit/sentinel-analyze.test.ts` (test unit, transform) — CON-05

**Analog:** `test/unit/require-tenant.test.ts` — **exact**. Es el precedente vivo de test unitario puro del milestone (16 tests, sin DB).

**Docblock del test** (`require-tenant.test.ts:1-33`) — tres secciones: `QUÉ PRUEBA`, `POR QUÉ ES UN TEST UNITARIO Y NO UNO MYSQL-BACKED`, `LAS DOS AFIRMACIONES QUE NO SON OBVIAS`:

```typescript
/**
 * POR QUÉ ES UN TEST UNITARIO Y NO UNO MYSQL-BACKED
 * -------------------------------------------------
 * `requireTenant` recibe una `TenantQueryFn` inyectada — el mismo idioma de
 * `QueryFn` que ya usa `verify-tenant-uniques.ts` — así que todo lo que este
 * archivo afirma se prueba con una función falsa que REGISTRA el SQL y los
 * params recibidos. No se abre ninguna conexión, no se llama a `createTestApp`
 * y el archivo corre en milisegundos.
 */
```

**Doble que registra llamadas** (`require-tenant.test.ts:48-67`) — el molde exacto del logger falso que necesita el test de dedup de D-01:

```typescript
interface CallSpy {
  statement: string;
  params: unknown[] | undefined;
}

function fakeQuery(rows: Record<string, unknown>[]): {
  query: TenantQueryFn;
  calls: CallSpy[];
} {
  const calls: CallSpy[] = [];
  const query: TenantQueryFn = async (statement, params) => {
    calls.push({ statement, params });
    return rows;
  };
  return { query, calls };
}
```

**Aserción negativa que separa el verde real del verde de mentira** (`require-tenant.test.ts:181-193`) — el patrón que el test del trap de la proyección (Pitfall 2) necesita replicar:

```typescript
it("T-169-34: el id viaja parametrizado, no interpolado en el SQL", async () => {
  // ...
  expect(call.params).toEqual([777]);
  // La aserción que importa: el número NO está en el string. Sin esta línea,
  // una interpolación (`WHERE id = ${id}`) pasaría el test de arriba igual.
  expect(call.statement).not.toContain("777");
  expect(call.statement).toContain("?");
});
```

**Spy de `process.exit` sin matar al worker** (`require-tenant.test.ts:69-74`, `:204-235`) — es LO que `con-06-lint.test.ts` necesita para afirmar exit codes 0/1/2:

```typescript
/** Error sintético para poder afirmar sobre `process.exit` sin matar al worker. */
class ProcessExitError extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe("failTenantArg", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ProcessExitError(code ?? 0);
    }) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sale con 2 ante un error de uso", () => {
    expect(() => failTenantArg(new TenantArgError("falta --tenant=<id>"), "seed-de-prueba"))
      .toThrow(ProcessExitError);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
```

**Aserción de caso "todos los valores del enum", no solo uno** (`require-tenant.test.ts:171-179`):

```typescript
it("D-07: un gimnasio archivado tampoco corta", async () => {
  // Se recorren los DOS estados no activos del enum: un helper que cortara
  // sólo con 'suspended' pasaría un test que probara nada más ese valor.
```

Aplicación directa a Pitfall 3: enumerar **cada** forma de no-DML (`begin`, `commit`, `rollback`, `savepoint`, `release savepoint`, `start transaction`, `SET`, `SHOW`, `SELECT DATABASE()`, `information_schema`) con su propio caso — no una sola.

---

### `test/tenancy/con-05-sentinel.test.ts` / `con-06-lint.test.ts` (test integration) — CON-05 / CON-06

**Analog:** `test/tenancy/con-03-write-paths-tenant-id.test.ts` — es el archivo hermano del milestone (fase 169) y el que fija el idioma de `test/tenancy/`.

**Imports** (`con-03:67-93`):

```typescript
import {
  describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, eq } from "drizzle-orm";

import * as schema from "../../src/db/schema";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  ensureEfectivoCaja,
} from "../helpers";
```

**Docblock con "QUÉ HACER CUANDO ESTE GUARD SE CAIGA"** (`con-03:41-53`) — patrón obligatorio para gates: decirle al que lo rompa qué NO hacer:

```typescript
/**
 * QUÉ HACER CUANDO ESTE GUARD SE CAIGA
 * ------------------------------------
 * **No borrar la aserción ni sumar el schema a una excepción.** El fallo dice
 * que una ruta que spreadea su body dejó de acotar qué acepta. Decidir
 * conscientemente:
 *   - Si esa ruta NO puede aceptar propiedades libres (el caso normal): ...
 */
```

Para 170: "no borres la entrada de la allowlist ni desactives el sentinel — migrá el módulo o escribí la exención con motivo".

**Declaración de "este describe no toca la DB"** (`con-03:64-67`, replicado en `tenant-tables.test.ts:17-20`) — importante porque el `setupFiles` provisiona MySQL igual para todo archivo (~96 s, hallazgo 169-07):

```typescript
/**
 * Este `describe` NO toca la base de datos: es introspección de objetos
 * importados. Corre igual bajo el `setupFiles` del repo (que provisiona la DB
 * por worker para TODO archivo de test).
 */
```

**Estructura de dos `describe` en un archivo** (`con-03:161` y `con-03:510`) — el precedente para separar "gate estático/introspección" de "batería contra la app real". Aplicable a `con-05-sentinel.test.ts`: `describe("sentinel — clasificación y severidad")` (sin DB) + `describe("sentinel — SQL real de Drizzle, incluida transacción")` (con `createTestApp`).

**Fixtures:** el único precedente de directorio de fixtures en `test/` es `test/tv/__fixtures__/timer-vectors.json`. Usar `test/tenancy/__fixtures__/` con el mismo naming, y **fuera del alcance del lint real** (Pitfall 9 + D-16).

---

### `test/db/tenant-tables.test.ts` (test, gate de forma) — MODIFICADO, extender con D-05/D-06

**Analog:** sí mismo — **extender, no romper**. Los gates existentes que la lista strict debe replicar:

**Motivo obligatorio y sin marcadores** (`:204-233`) — aplicable a los motivos de la allowlist del lint:

```typescript
it("todo motivo es una cadena con contenido real, sin marcadores de trabajo pendiente", () => {
  // El marcador se busca en MAYÚSCULAS a propósito: "todo" es una palabra
  // común en castellano ... El convenio de código es TODO/FIXME/TBD/XXX
  // en mayúscula; "pendiente" sí se busca sin distinguir mayúsculas.
  const MARCADORES = /\b(TODO|FIXME|TBD|XXX)\b/;
  const vacios = entradas.filter((e) => e.motivo.trim().length === 0).map(...);
  const conMarcador = entradas
    .filter((e) => MARCADORES.test(e.motivo) || /pendiente/i.test(e.motivo))
    .map(...);
  expect(problemas, `Motivos inservibles ... Un motivo vacío o un "TODO" convierten la allowlist en una alfombra debajo de la cual barrer uniques sin scope.`)
    .toEqual([]);
});
```

**Conteo exacto como decisión de diseño** (`:235-247`) — el molde para "la lista strict arranca vacía en la 170":

```typescript
it("TENANT_GLOBAL_UNIQUES tiene exactamente 11 entradas (la lista M8 cerrada)", () => {
  expect(
    clavesM8.length,
    `TENANT_GLOBAL_UNIQUES tiene ${clavesM8.length} entradas, esperadas 11. ... Agregar una
     doceava es una DECISIÓN DE DISEÑO ... y no un detalle de implementación: va con el
     dueño del producto, no en un plan de ejecución.`,
  ).toBe(11);
});
```

**Referencia cruzada contra la lista canónica** (`:173-188`) — para D-06: toda tabla de `TENANT_STRICT_MODULES` tiene que existir en `GYM_OWNED_TABLES`:

```typescript
it("la tabla de toda clave existe en GYM_OWNED_TABLES", () => {
  const huerfanas = claves.filter((clave) => !gymOwned.has(clave.split(".")[0]));
  expect(huerfanas, `...`).toEqual([]);
});
```

**Mensaje de aserción largo y accionable como 2º argumento de `expect`** — es el idioma del repo en TODO este archivo (`:63-70`, `:87-91`, `:225-232`). No usar `expect(x).toEqual([])` pelado.

---

### `.github/workflows/ci.yml` (config CI) — MODIFICADO

**Analog:** job `api-check` (`ci.yml:20-54`). El step nuevo va acá (NO en `api-test`: el lint no necesita MySQL y `api-test` paga el provisioning):

```yaml
  api-check:
    name: API - Type Check & Build
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: el-templo-api

    steps:
      - name: Checkout code
        uses: actions/checkout@v4          # ← ⚠ shallow (fetch-depth: 1 por default) — Pitfall 5

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
          cache-dependency-path: el-templo-api/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm exec tsc --noEmit

      - name: Security audit  # Advisory only (|| true) — logs CVEs without blocking
        run: pnpm audit --audit-level=high || true

      - name: Build
        run: pnpm run build
```

**Cambios concretos:**

1. `ci.yml:29-30` — agregar `with: { fetch-depth: 0 }` al checkout de `api-check` (Pitfall 5: sin historia no hay `merge-base` y el ratchet queda decorativo).
2. Step nuevo entre `Type check` (`:47-48`) y `Security audit` (`:50-51`), **sin** `|| true` y **sin** `continue-on-error` — el contraste está a la vista en el archivo: `Security audit` es advisory (`:51`) y los `Lint` de los frontends son `continue-on-error: true` (`:147`, `:191`, `:235`). El del API **rompe el build** (D-09/D-14).
3. Estilo de comentario del step: comentario inline en la misma línea del `name:`, como `:50`.

---

### `package.json` (config) — MODIFICADO

**Analog:** el bloque de scripts (`package.json:6-21`). Los dos verificadores del milestone ya viven ahí:

```json
"db:migrate": "tsx src/db/run-migrations.ts",
"db:verify-tenant": "tsx src/db/scripts/verify-tenant-backfill.ts",
"db:verify-uniques": "tsx src/db/scripts/verify-tenant-uniques.ts",
```

El script nuevo copia el idioma `tsx <ruta>` y va **junto a sus hermanos** (agrupación por prefijo). CLAUDE.md/memoria: **cero deps nuevas** — `tsx` y `typescript` ya están en devDependencies (`:55-56`).

---

### `.env.example` (config) — MODIFICADO, flag del modo inventario (D-08)

**Analog:** el bloque Wellhub (tail del archivo). Patrón: encabezado `# <Nombre> — <qué es>`, 2-5 líneas de prosa explicando qué pasa si está y si no está, y la variable comentada si es opcional:

```bash
# Wellhub (ex Gympass) — integración de check-in y reservas.
# Sin WELLHUB_API_KEY + WELLHUB_WEBHOOK_SECRET la integración queda apagada
# (el webhook responde 503 y no se publica nada). WELLHUB_BASE_URL es opcional:
# default sandbox (...); en producción setear ...
# WELLHUB_BASE_URL=https://apitesting.partners.gympass.com
WELLHUB_API_KEY=""
```

Para el flag de inventario: comentado por default (es opcional y solo de diagnóstico), con el motivo escrito.

---

### `tenant-lint-allowlist.json` (config / registro) — NUEVO

**Analog:** `TENANT_UNIQUE_ALLOWLIST` (`tenant-tables.ts:255-359`) y su docblock. El racional del formato "clave → motivo obligatorio" ya está escrito y se aplica igual (`tenant-tables.ts:21-23`):

```typescript
// El motivo es OBLIGATORIO por entrada (D-13): los dos registros son
// `Record<clave, motivo>` justamente para que no se pueda agregar una unique sin
// escribir por qué. Una allowlist sin motivos se vuelve una alfombra.
```

Y el racional fail-closed (`tenant-tables.ts:278-280`):

```typescript
// Esta lista es fail-closed: si falta una entrada, el verificador la reporta
```

**Formato de clave:** `verify-tenant-uniques.ts:501-508` fija cómo se parte una clave compuesta — copiar la decisión explícita, no improvisar:

```typescript
/**
 * Parte `"tabla.indice"` en sus dos mitades por el PRIMER punto: los nombres de
 * índice pueden contener puntos, los de tabla no en este repo.
 */
function splitKey(key: string): [string, string] { ... }
```

Para D-13 la clave es `archivo + tabla`. Como los paths llevan `/` y `.` (`src/modules/tv/pairing.ts`), **no** usar una clave string concatenada: preferir `Record<rutaRelativa, Record<tabla, motivo>>` o un array de objetos `{ file, table, motive }` — y escribir el porqué, siguiendo el precedente.

**Ojo con JSON vs TS:** el registro análogo es un `.ts` (permite docblock por entrada y comentarios de sección). Un `.json` no admite comentarios — si se elige JSON, el motivo por entrada es la única documentación posible y hay que exigirlo (gate de motivo no vacío, molde en `tenant-tables.test.ts:204-233`).

---

## Shared Patterns

### 1. Exención `/* tenant-safe: <motivo> */` — los 3 anclajes reales que el lint debe reconocer

**Sources (origin/master), los 3 sitios inline vivos:**

**(a) Trailing sobre un call encadenado** — `src/modules/tv/pairing.ts:145`:

```typescript
await this.db
  .insert(schema.tvPairings) /* tenant-safe: pairing pre-claim */
  .values({ userCode, deviceCodeHash });
```

**(b) Leading de un `VariableStatement`** — `src/modules/wellhub/service.ts:135`:

```typescript
/* tenant-safe: idempotencia global previa a la derivacion del tenant (M8) */
const inserted = await this.db.insert(schema.wellhubEvents).values({
  eventId,
  eventType: event.event_type,
  ...
});
```

**(c) Leading de un `ExpressionStatement`** — `src/jobs/notification-cron.ts:754` (este es el que matchea DOBLE: `ExpressionStatement` + `CallExpression` interno ⇒ dedup por `range.pos`, Pitfall 7):

```typescript
const seedService = new NotificationService(db, log);
/* tenant-safe: seed de templates global hasta la adopción de notifications (fase 175) */
seedService.seedTemplates().catch((err: unknown) => { ... });
```

**(d) File-level** — `src/db/scripts/verify-tenant-uniques.ts:61` (comentario de bloque en el tope del archivo, DESPUÉS del docblock `/** */` y antes de los imports; es un `/* */` **aparte**, no anidado — un `/* */` no se puede anidar, hallazgo 169-07):

```typescript
/* tenant-safe: verificador de plataforma: escanea TODOS los tenants por diseño, corre en CI/deploy y es de solo lectura */
```

**Los 2 rechazos obligatorios (prosa, NO exención)** — el lint tiene que decir `false` sobre:

- `src/db/schema/tv.ts:81` — es un `//` (SingleLineCommentTrivia).
- `src/db/scripts/require-tenant.ts:44` — el tag vive **dentro de un JSDoc**, en la línea `` * `tenant-safe: <motivo>` ``, no pegado al `/*`:

```typescript
/**
 * SCRIPTS EXENTOS — la anotación que va a leer la fase 170
 * --------------------------------------------------------
 * Un script sin `--tenant` es indistinguible de un olvido, así que la exención
 * se escribe en el archivo como un comentario de bloque con el texto grepeable
 * `tenant-safe: <motivo>`
 * (motivo OBLIGATORIO, nunca la anotación pelada — T-169-36).
 */
```

**Apply to:** `src/db/scripts/lint-tenant.ts` (matcher AST) y `test/tenancy/con-06-lint.test.ts` (los 6 casos: 4 aceptaciones + 2 rechazos, con estos archivos reales como fixture — el precedente de `tenant-tables.test.ts:249-256` dice que los helpers se prueban **contra datos vivos, no contra un fixture inventado**).

### 2. Cumplimiento premiado: `tenantWhere` / `tenantValues`

**Source:** `src/modules/shared/tenant.ts:149-175`. Firmas LOCKEADAS por el doc 03 §3.

```typescript
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}

export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}
```

Uso canónico documentado en el mismo archivo (`:136-141`, `:159-161`) — la forma que el lint debe contar como cumplimiento (discreción de Claude, CONTEXT):

```typescript
const rows = await db
  .select()
  .from(schema.auraConfig)
  .where(and(tenantWhere(schema.auraConfig, ctx), eq(schema.auraConfig.sourceType, "x")));

await db.insert(schema.auraConfig).values(tenantValues(ctx, { sourceType: "x" }));
```

**Apply to:** `src/db/scripts/lint-tenant.ts` (detección de cumplimiento) + `test/tenancy/con-06-lint.test.ts`.

### 3. Logging

**Source:** `src/plugins/database.ts:39` (`fastify.log.info(...)`) y `src/modules/shared/tenant.ts:116-120` (`TenantLogger`, la interface ya existente para inyectar el logger).

- **Runtime (sentinel):** `fastify.log` / Pino. `console.*` **prohibido** (CLAUDE.md).
- **CLI (lint):** `console.log` / `console.error` **permitido**, con el precedente escrito en `require-tenant.ts:70-72`:
  ```typescript
  * `console.*` está permitido acá: esto es tooling de línea de comandos, no el
  * runtime de Fastify ni un frontend (precedente `verify-tenant-uniques.ts`).
  ```
- **Seguridad (RESEARCH §Security):** loguear solo el texto del SQL (ya viene con `?`), **nunca** el array de `params`.

**Apply to:** `src/db/sentinel/install.ts`, `src/db/scripts/lint-tenant.ts`.

### 4. Error handling

**Source:** `require-tenant.ts:223`, `verify-tenant-uniques.ts:623`, `notification-cron.ts:755-757`. Un solo idioma en todo el repo:

```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  ...
}
```

**Apply to:** todos los archivos nuevos de la fase. Sin `any` (CLAUDE.md).

### 5. Gate fail-closed + docblock que anticipa la objeción

Todos los gates del milestone comparten esta forma y el planner debería exigirla en cada archivo nuevo:

1. Docblock `QUÉ PRUEBA` numerado (`verify-tenant-uniques.ts:5-21`).
2. Un `POR QUÉ NO <la alternativa obvia>` (`verify-tenant-uniques.ts:22-30` "POR QUÉ NO MIRA `_migrations`"; `con-03:16-37` "POR QUÉ EL GUARD ES POR IMPORT Y NO POR GREP"; `require-tenant.test.ts:13-21` "POR QUÉ ES UN TEST UNITARIO").
3. Un `QUÉ HACER CUANDO ESTO SE CAIGA` (`con-03:41-53`).
4. Mensajes de fallo que nombran la acción concreta (`verify-tenant-uniques.ts:530-532`, `tenant-tables.test.ts:65-70`).
5. **Fail-closed explícito:** lo no clasificado es discrepancia, nunca "asumir OK" (`tenant-tables.ts:278-280`, `tenant-tables.test.ts:282`).

**Apply to:** los 3 archivos de código nuevos y los 3 de test.

---

## No Analog Found

| File                            | Role                       | Data Flow      | Reason                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/sentinel/install.ts`    | middleware / interceptor   | event-driven   | **No existe ningún interceptor de driver ni monkeypatch en el repo.** Tampoco hay precedente del resumen periódico: **cero `setInterval` en todo `src`** (RESEARCH §Runtime State Inventory) ⇒ el timer con `.unref()` + `clearInterval` en `onClose` se paga entero la primera vez (Pitfall 4). |
| `tenant-lint-allowlist.json`    | config / registro de datos | —              | Parcial: la forma "clave → motivo obligatorio, fail-closed" sí tiene analog (`TENANT_UNIQUE_ALLOWLIST`), pero **no hay ningún registro de allowlist en JSON** en el repo — todos los registros del milestone son `.ts`. Decidir formato con el racional escrito (ver §Pattern Assignments).      |

**Para ambos, el planner debe usar los patrones del RESEARCH.md**, que están verificados ejecutando código real:

- `install.ts` → RESEARCH §Pattern 1 (wrap de `query` + `execute` + **`getConnection`**; monkeypatch, NO `Proxy` — la identidad del pool importa por `fastify.decorate("dbPool", pool)` en `database.ts:33`).
- `analyze.ts` → RESEARCH §Pattern 2 (recorte de proyección antes de buscar `tenant_id`).
- matcher del lint → RESEARCH §Pattern 3 (`getLeadingCommentRanges` + `getTrailingCommentRanges`, `MultiLineCommentTrivia`, tag pegado al `/*`).

---

## Trampas del código canónico que el planner debe tener presentes

| Trampa                                                                                                                        | Fuente                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Existe un SEGUNDO pool sin sentinel**: `createDbConnection()` en `src/db/index.ts:6-17`, con el comentario `Used by the main application` — **miente**, tiene cero consumidores. Decidir en el plan: borrarlo o anotarlo apuntando a `plugins/database.ts`. | `src/db/index.ts` (leído en origin/master), RESEARCH Pitfall 8                       |
| `createSingleConnection()` (`src/db/index.ts:23-29`) **sí** se usa (~8 scripts CLI) y devuelve `Connection`, no Pool ⇒ fuera del alcance del sentinel; lo cubre la regla `--tenant` de la 169. Declararlo, no dejarlo implícito. | `src/db/index.ts`, RESEARCH A5                                                       |
| El `setupFiles` de Vitest provisiona MySQL para **todo** archivo de test, incluidos los puros (~96 s). El test unitario del parser igual es el camino correcto (precedente `require-tenant.test.ts`), pero no esperar que corra "en milisegundos" dentro de la suite completa. | `vitest.config.ts` + `tenant-tables.test.ts:17-20`, hallazgo 169-07                  |
| `pool: "forks"` con `isolate: false` ⇒ el proceso se reutiliza entre archivos: un timer colgado se acumula y cuelga la suite.  | RESEARCH Pitfall 4                                                                  |
| Un `/* */` **no se puede anidar**: la exención va en un comentario de bloque APARTE, nunca dentro del docblock `/** */`. Precedente escrito: `verify-tenant-uniques.ts:61` está debajo del docblock que termina en `:59`. | hallazgo 169-07, verificado en origin/master                                        |
| `actions/checkout@v4` en `ci.yml:29-30`, `:84-85`, etc. va **sin bloque `with:`** ⇒ shallow. El merge-base de D-14 necesita `fetch-depth: 0` en `api-check`. | `ci.yml`, RESEARCH Pitfall 5                                                        |

---

## Metadata

**Analog search scope (todo leído desde `origin/master`):**

- `el-templo-api/src/db/` — `tenant-tables.ts`, `index.ts`, `scripts/` (4 archivos)
- `el-templo-api/src/plugins/database.ts`
- `el-templo-api/src/modules/shared/tenant.ts`
- Sitios de exención reales: `src/modules/tv/pairing.ts`, `src/modules/wellhub/service.ts`, `src/jobs/notification-cron.ts`
- `el-templo-api/test/` — inventario completo (238 archivos listados); leídos `unit/require-tenant.test.ts`, `db/tenant-tables.test.ts`, `tenancy/con-03-write-paths-tenant-id.test.ts`, exports de `helpers.ts`
- `.github/workflows/ci.yml`, `el-templo-api/package.json`, `el-templo-api/.env.example`

**Files scanned:** 13 leídos en detalle + 2 inventarios de directorio
**Pattern extraction date:** 2026-07-28
