# Phase 172: Adopción 1 (piloto) — `finance` - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 21 (18 modificados + 3 nuevos)
**Analogs found:** 20 / 21
**Revisión base de todos los excerpts:** `origin/master` = `29e61c8b` (tren 170+171)

> **ADVERTENCIA DE BASE DE CÓDIGO.** El checkout principal
> (`/home/franco/projects/el-templo`) está en `fix/referral-preview-y-refresh-ficha`,
> **403 commits detrás de `origin/master`**. Ninguno de los archivos citados acá
> se lee correctamente desde ese checkout: `src/modules/shared/tenant.ts`,
> `src/db/sentinel/`, `test/tenant-manifest.ts` y `test/fixtures/second-tenant.ts`
> **no existen** ahí. El planner y el ejecutor trabajan en un **worktree nuevo
> desde `origin/master`** (patrón fases 166-171), y el execute además espera a que
> CR-CAJA esté en master (D-13).

---

## File Classification

### A. Módulo `finance` — migración completa (D-06: cero entradas de allowlist al cerrar)

| Archivo a modificar                                    | Rol              | Data flow                                | Analog más cercano                                                | Match               |
| ------------------------------------------------------ | ---------------- | ---------------------------------------- | ----------------------------------------------------------------- | ------------------- |
| `src/modules/finance/cash-register-service.ts` (987 L) | service          | CRUD                                     | **él mismo, `createEfectivoCaja()` L782-803**                     | exact (auto-analog) |
| `src/modules/finance/transaction-service.ts` (2172 L)  | service          | CRUD transaccional (ledger + cache)      | `src/modules/tv/pairing.ts:184-211` (ctx 1º + `tenantValues`)     | role-match          |
| `src/modules/finance/balance-service.ts` (356 L)       | service          | write-through cache dentro de `TxHandle` | `src/modules/tv/pairing.ts:254-308` (ctx derivado, no de request) | role-match          |
| `src/modules/finance/movement-service.ts` (419 L)      | service          | composición de primitivas (CRUD)         | `cash-register-service.ts:782`                                    | role-match          |
| `src/modules/finance/routes.ts` (1797 L)               | route/controller | request-response                         | **él mismo, L1391-1413** (`assertTenant` en el call site)         | exact (auto-analog) |
| `src/modules/finance/coach-load-routes.ts` (1029 L)    | route/controller | request-response                         | **él mismo, L974-1003** (`assertTenant` + `tenantWhere` inline)   | exact (auto-analog) |

`schemas.ts`, `types.ts`, `constants.ts`, `firm-money.ts`, `index.ts` no tocan la
base: fuera de alcance salvo que una firma nueva exija un tipo.

### B. Archivos ajenos — cirugía mínima (D-01 + D-07: SOLO las queries sobre las 6 tablas strict)

| Archivo                                               | Rol        | Data flow                          | Métodos con acceso finance                                                                                                                                                                                                                                           | Analog                         |
| ----------------------------------------------------- | ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `src/modules/analytics/service.ts`                    | service    | agregación read-only               | `getRevenueTrend`, `getRevenueByMethod`, `getRevenueByBranch`, `getOutstandingByCurrency`, `sumRevenue`                                                                                                                                                              | `cash-register-service.ts:782` |
| `src/modules/analytics/advanced-finance-service.ts`   | service    | agregación                         | `cashTrend()`                                                                                                                                                                                                                                                        | ídem                           |
| `src/modules/analytics/ltv-service.ts`                | service    | agregación                         | `realPaymentsByMember()`                                                                                                                                                                                                                                             | ídem                           |
| `src/modules/analytics/ticket-service.ts`             | service    | agregación                         | `linkedCharges()`, `universeCountByCurrency()`                                                                                                                                                                                                                       | ídem                           |
| `src/modules/reports/service.ts` (2617 L)             | service    | agregación + query-builder helpers | `getChargeHistory`, `buildDebtOriginTxSubquery`, `effectiveDebtStatusSQL`, `buildOutstandingBaseConds`, `buildOutstandingStatusConds`, `buildOutstandingOrderBy`, `selectOutstandingRows`, `getOutstandingBalances`, `updateDebtManagement`, `buildChargeConditions` | ídem                           |
| `src/modules/subscriptions/service.ts` (5861 L)       | service    | CRUD transaccional                 | `recordAssignmentCharge`, `assignPlan`, `_cancelSubscription`                                                                                                                                                                                                        | ídem                           |
| `src/modules/members/service.ts`                      | service    | listado                            | `listMembers()`                                                                                                                                                                                                                                                      | ídem                           |
| `src/modules/coach/service.ts` (96 L)                 | service    | listado                            | `getOutstandingBalances()`                                                                                                                                                                                                                                           | ídem                           |
| `src/scripts/backfill-historical-payments.ts` (523 L) | script CLI | batch write                        | **`scripts/seed-onboarding-aura.ts`** (ejemplar completo)                                                                                                                                                                                                            | exact                          |

**⚠️ `reports/service.ts` es el archivo más difícil:** seis de sus diez sitios son
**helpers privados que devuelven `SQL[]` / `SQL` / fragmentos de ORDER BY**, no
métodos que hagan la query. `tenantWhere` tiene que entrar en el helper _y_ el
`ctx` tiene que viajar hasta él. Es el candidato natural a un plan propio.

### C. Interruptores de infraestructura (el ÚLTIMO plan, D-03)

| Archivo                                | Rol             | Data flow | Analog                                                              | Match |
| -------------------------------------- | --------------- | --------- | ------------------------------------------------------------------- | ----- |
| `src/db/tenant-tables.ts` (L510)       | config/registro | n/a       | `TENANT_GLOBAL_UNIQUES` / `TENANT_UNIQUE_ALLOWLIST` (mismo archivo) | exact |
| `tenant-lint-allowlist.json`           | config          | n/a       | su propio header (contrato del ratchet)                             | exact |
| `test/db/tenant-tables.test.ts` (L351) | test de forma   | n/a       | **el propio test que va a ponerse rojo**                            | exact |

### D. Archivos NUEVOS

| Archivo                                         | Rol                  | Data flow                 | Analog                                                                                         | Match      |
| ----------------------------------------------- | -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `test/tenancy/iso-03-*.test.ts`                 | test de integración  | request-response 2-tenant | `test/tenancy/iso-02-fixtures.test.ts` + `con-03-write-paths-tenant-id.test.ts` (batería D-09) | exact      |
| gate de cobertura (mismo archivo o hermano)     | test/gate            | introspección             | `test/tenancy/iso-01-manifiesto.test.ts:184-266`                                               | exact      |
| script de snapshot D-12                         | script CLI read-only | batch HTTP/report         | `src/scripts/dry-run-reassign-multibranch.ts`                                                  | partial    |
| `.docs/saas-multitenancy/07-receta-adopcion.md` | doc                  | n/a                       | `06-estrategia-migracion.md`                                                                   | role-match |

---

## Inventario fino: dónde están las queries a migrar

Derivado por AST-lite sobre `origin/master` (referencias `schema.<tabla>` agrupadas
por método). Complementa —no reemplaza— a `SENTINEL_INVENTORY=1`, que da la lista
por _statement_.

### `finance/transaction-service.ts` (19 métodos con acceso)

```
create()                    FIN: financialTransactions×6, transactionLinks×3, balances×3
                            otras: users×3, branches×3, subscriptions×3, programEnrollments×3
void() / _void()            FIN: financialTransactions×6, transactionLinks×4   otras: users×5, userStatusHistory×1
validate()                  FIN: financialTransactions×6, cashRegisters×5, transactionLinks×2
observe()                   FIN: financialTransactions×6, transactionLinks×2
correct()                   FIN: financialTransactions×2, transactionLinks×5
findByIdempotencyKey()      FIN: financialTransactions×2, transactionLinks×2
getById()                   FIN: financialTransactions×4, transactionLinks×2   otras: users×1
listForMember()             FIN: financialTransactions×3, transactionLinks×4
listPendingMiscForMember()  FIN: financialTransactions×14
list()                      FIN: financialTransactions×27, transactionLinks×6  otras: users×8, branches×5
listPendingTray()           FIN: financialTransactions×31, cashRegisters×5     otras: users×8, branches×5
listMovEgresos()            FIN: financialTransactions×31, cashRegisters×8, costCenters×3  otras: users×5, branches×8
buildListConditions()       FIN: financialTransactions×8                       otras: branches×1   ← helper que devuelve SQL[]
getFinancialHistory()       FIN: financialTransactions×6, transactionLinks×8   otras: subscriptionPlans×3, subscriptions×4
getOutstandingConcepts()    FIN: balances×10                                   otras: subscriptionPlans×3, subscriptions×4
getSummary()                FIN: financialTransactions×24                      otras: branches×11
exportRowsForExcel()        FIN: financialTransactions×20, transactionLinks×6  otras: users×5, branches×3
```

### `finance/balance-service.ts`

```
applyDelta(tx, …)           FIN: balances×9, debtManagement×6   otras: subscriptions×4
getOutstandingTotalsByCurrency()  FIN: balances×6               otras: users×3
hasOutstandingForUser()     FIN: balances×4
getRow()                    FIN: balances×5
getRowsForTransaction()     FIN: balances×14, transactionLinks×6, financialTransactions×4
```

### `finance/cash-register-service.ts` (21 métodos; `createEfectivoCaja` YA migrado a medias)

```
resolveCashRegister() cashRegisters×12   ← el resolver del cobro en efectivo, camino caliente
listActiveBankAccounts() ×8    assertChosenBankAccount() ×7
getBalance() cashRegisters×5 + financialTransactions×17
getPeriodMovement() cashRegisters×3 + financialTransactions×6
listActiveCajasWithBalance() cashRegisters×8   otras: branches×3
listActiveCostCenters() ×7   getCostCenterRow() ×6   assertUniqueName() ×5
createCostCenter/rename/deactivate/reactivate/listAll  costCenters×1..8
getBankAccountRow() cashRegisters×13
createBankAccount() ×1   updateBankAccount() ×2   closeBankAccount() ×2   reactivateBankAccount() ×2   listBankAccounts() ×4
createEfectivoCaja()  cashRegisters×7 + branches×6   ← ctx YA en firma; el SELECT de branches ya usa tenantWhere,
                                                       el SELECT de cash_registers (L818-829) TODAVÍA NO
```

### `finance/movement-service.ts` y las rutas

```
movement-service: loadCaja() cashRegisters×5 · registerMovement() transactionLinks×2
                  registerExpense() costCenters×4 · voidMovement() transactionLinks×8
routes.ts (top):  resolveCajaCountry/enforceRowScope → cashRegisters×4, financialTransactions×3, branches×3
routes.ts POST /transactions        otras: branches×5
routes.ts POST /transactions/:id/void  FIN: financialTransactions×4  otras: branches×4
coach-load-routes (top):            otras: users×3, branches×3, subscriptions×7, subscriptionPlans×3
coach-load-routes GET /caja-efectivo  FIN: cashRegisters×5  ← YA migrado (L984-997)
```

### Allowlist: las entradas exactas a borrar

**33 entradas sobre tablas strict** (obligatorias por D-15) + **14 no-finance en
archivos del módulo** (D-06) = **47**. Las 29 de `src/modules/finance/`:

```
FIN  balance-service.ts        | balances, debt_management
     balance-service.ts        | subscriptions, users
FIN  cash-register-service.ts  | cash_registers, cost_centers, financial_transactions
     cash-register-service.ts  | branches
FIN  movement-service.ts       | cash_registers, cost_centers, transaction_links
FIN  routes.ts                 | cash_registers, financial_transactions
     routes.ts                 | branches
FIN  transaction-service.ts    | balances, cash_registers, cost_centers, financial_transactions, transaction_links
     transaction-service.ts    | branches, program_enrollments, subscription_plans, subscriptions, user_status_history, users
     coach-load-routes.ts      | branches, subscription_plans, subscriptions, users
```

Las 18 restantes sobre tablas strict, en archivos ajenos:

```
analytics/advanced-finance-service.ts | financial_transactions
analytics/ltv-service.ts              | financial_transactions
analytics/service.ts                  | balances, financial_transactions
analytics/ticket-service.ts           | financial_transactions, transaction_links
coach/service.ts                      | balances
members/service.ts                    | balances
reports/service.ts                    | balances, debt_management, financial_transactions, transaction_links
subscriptions/service.ts              | balances, financial_transactions, transaction_links
src/scripts/backfill-historical-payments.ts | balances, financial_transactions, transaction_links
```

Formato de cada entrada: `{"file": "el-templo-api/src/…", "table": "…"}` — la ruta
lleva el prefijo `el-templo-api/`, sin número de línea (D-13 de la 170).

---

## Pattern Assignments

### 1. Métodos de service que reciben `ctx` (D-04) — TODOS los services de A y B

**Analog canónico dentro del propio módulo:** `src/modules/finance/cash-register-service.ts:782-803`

```typescript
  async createEfectivoCaja(
    ctx: TenantContext,
    input: {
      branchId: number;
      currency: string;
      openingBalance?: number;
    },
  ): Promise<CajaSaldoRow> {
    const [branch] = await this.db
      .select({ … })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, input.branchId),
        ),
      )
      .limit(1);
    if (!branch) {
      throw new NotFoundError(`No existe la sucursal ${input.branchId}`);
    }
```

**Import** (`cash-register-service.ts:23`) — path directo, NO por el barrel
`shared/index.ts` (el módulo `tenant` no se exporta desde ahí, a propósito):

```typescript
import { tenantWhere, type TenantContext } from "../shared/tenant";
```

**Por qué `ctx` va PRIMERO** (docblock de `tv/pairing.ts:173-175`, regla 169-06):

> El `ctx` va PRIMERO en la firma a proposito — agregarlo al final habria dejado
> que un call site viejo compilara con los argumentos corridos; asi, `tsc`
> obliga a mirar cada uno.

**Trampa concreta que hereda esta fase:** en `createEfectivoCaja` el `ctx` ya está
en la firma pero el SELECT de `cash_registers` (L818-829) sigue **sin**
`tenantWhere` — por eso la entrada de allowlist `cash-register-service.ts |
cash_registers` sigue viva. Un método con `ctx` en la firma **no** está migrado.

---

### 2. `assertTenant` en el call site del route handler (D-04)

**Analog A (una línea, sin variable)** — `src/modules/finance/routes.ts:1396-1412`:

```typescript
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar cajas",
          });
        }
        const caja = await cashRegisterService.createEfectivoCaja(
          assertTenant(request.scope, "create efectivo caja"),
          request.body,
        );
        return reply.code(201).send({ caja });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create efectivo caja");
      }
    },
```

**Analog B (con variable, cuando el ctx se usa más de una vez)** —
`src/modules/finance/coach-load-routes.ts:984-997`:

```typescript
const ctx = assertTenant(request.scope, "coach caja-efectivo");
const [caja] = await fastify.db
  .select({ id: schema.cashRegisters.id, name: schema.cashRegisters.name })
  .from(schema.cashRegisters)
  .where(
    and(
      tenantWhere(schema.cashRegisters, ctx),
      eq(schema.cashRegisters.id, override),
    ),
  )
  .limit(1);
return reply.send({ caja: caja ?? null });
```

**Import** (`routes.ts:66` / `coach-load-routes.ts:43`):

```typescript
import { assertTenant, tenantWhere } from "../shared/tenant";
```

**De dónde sale el `scope`:** del hook de módulo que ya existe en los dos archivos
(`routes.ts:203-214`), así que **no hay que agregar ningún hook**:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)) {
    return reply
      .code(403)
      .send({ error: "Acceso denegado", message: "Acceso requerido" });
  }
  await attachCountryScope(request, fastify.db);
});
```

`coach-load-routes.ts:249` tiene su hook propio con `FINANCE_LOAD_ROLES` (coach ∈).

**Prohibido** (`shared/tenant.ts:180-184`): `request.scope.tenantId!` y `?? 1`.
`assertTenant` es el único puente permitido entre `number | null` y `number`.

---

### 3. Servicios llamados desde crons/scripts (sin request)

**Analog:** `src/jobs/auto-approve.ts:48` y `src/jobs/notification-cron.ts:169` —
el cuerpo del job recibe `ctx: TenantContext` y `forEachActiveTenant` lo provee.
Firma (`shared/tenant.ts:248-253`):

```typescript
export async function forEachActiveTenant(
  db: MySql2Database<typeof schema>,
  log: TenantLogger,
  jobName: string,
  run: (ctx: TenantContext) => Promise<void>,
): Promise<TenantSweepResult>;
```

Relevante para `subscriptions/service.ts`: sus métodos los llaman tanto rutas como
jobs. El `TenantContext` es **estructuralmente compatible** con `CountryScope`
narrowed, así que un solo parámetro sirve a los dos caminos (`shared/tenant.ts:99-106`).

---

### 4. `tenantValues` en INSERT/UPDATE (todo write sobre tabla gym-owned)

**Analog:** `src/modules/tv/pairing.ts:191-200` (UPDATE) y `:293-308` (INSERT con
ctx derivado de una fila, no de un request):

```typescript
const result = await this.db.update(schema.tvPairings).set(
  tenantValues(ctx, {
    claimedAt: new Date(),
    claimedBy,
    branchId,
    deviceName: name ?? null,
  }),
);
```

```typescript
      .values(
        tenantValues(
          { tenantId: pairing.tenantId },   // ctx construido desde una fila ya scopeada
          { branchId, tokenHash: …, name: …, pairedBy: … },
        ),
      )
```

**Hallazgo 169-07 que aplica directo a finance** (`seed-onboarding-aura.ts:59-63`):

> envolver el objeto en `tenantValues` NO ensancha los tipos literales.
> `sourceType` sigue llegando como `"onboarding_completion"` y no como `string`,
> así que el enum de Drizzle compila sin ningún `as const` de por medio.

Importa acá porque `financial_transactions` y `cash_registers` están llenos de
enums Drizzle (`direction`, `kind`, `type: "efectivo"`, `validationStatus`).

**Sitios de INSERT a migrar, ya localizados:** `balance-service.ts:209-216`
(`tx.insert(schema.balances)` — lazy seed), `cash-register-service.ts:837`
(`insert(schema.cashRegisters)`), y los inserts de `create()` en
`transaction-service.ts`.

**Ojo con el `TxHandle`:** `balance-service.ts:55-58` documenta el invariante de que
todas las queries de `applyDelta` usan el `tx` recibido y **nunca** `this.db`.
`tenantValues` / `tenantWhere` son ortogonales al handle — se aplican igual sobre
`tx`. La firma queda `applyDelta(ctx, tx, transaction, links, sign)` si se respeta
"ctx primero"; el planner debe decidirlo explícitamente porque hay 2 call sites
externos (`transaction-service.ts` y `subscriptions/service.ts`).

---

### 5. `sql` crudo

Convención lockeada (`shared/tenant.ts:20`):

```
En un `sql` crudo: `WHERE tenant_id = ${scope.tenantId} AND ...`.
```

Ejemplar de DELETEs crudos ya escritos así, con el motivo explícito de que la 172
va a hacer throw sobre ellos (`test/fixtures/second-tenant.ts:369-371`):

> cuando `finance` entre a `TENANT_STRICT_MODULES` en la fase 172, el sentinel va
> a hacer throw sobre un DELETE crudo sin la columna. Se adopta desde ahora para
> no tener que volver.

`reports/service.ts` y `analytics/service.ts` son los que más `sql` crudo tienen
(`effectiveDebtStatusSQL`, `buildOutstandingOrderBy`).

---

### 6. Retrofit del script CLI — `src/scripts/backfill-historical-payments.ts` (D-02)

**Analog exacto:** `scripts/seed-onboarding-aura.ts` (83 L, se lee entero).

```typescript
import "dotenv/config";
import { createSingleConnection } from "../src/db";
import { auraConfig } from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import {
  failTenantArg,
  queryFnFromConnection,
  requireTenant,
} from "../src/db/scripts/require-tenant";
import { tenantValues, tenantWhere } from "../src/modules/shared/tenant";

async function main() {
  const { db, connection } = await createSingleConnection();

  // ANTES de cualquier query: si falta `--tenant` o el gimnasio no existe, esto
  // corta con exit code 2 y no se escribe nada (T-169-32/T-169-33).
  const ctx = await requireTenant(queryFnFromConnection(connection));

  const existing = await db
    .select({ id: auraConfig.id })
    .from(auraConfig)
    .where(and(tenantWhere(auraConfig, ctx), eq(auraConfig.sourceType, "onboarding_completion")))
    .limit(1);
  …
  await db.insert(auraConfig).values(tenantValues(ctx, { … }));
  …
}

// `failTenantArg` sale con 2 ante un error de USO (falta el flag, el gimnasio no
// existe) y con 1 ante cualquier otro fallo.
main().catch((err: unknown) => failTenantArg(err, "seed-onboarding-aura"));
```

**Diferencia de forma a resolver:** el backfill importa las tablas **desnudas**
(`import { financialTransactions, transactionLinks, balances } from "../db/schema"`,
L33-40), no `import * as schema`. `tenantWhere(financialTransactions, ctx)` funciona
igual (la firma pide la tabla, no el namespace). Sitios: L391-417 (SELECTs de
idempotencia) y L473-501 (los 3 INSERT dentro de `tx`).

---

### 7. La entrada strict — `src/db/tenant-tables.ts:510` (ÚLTIMO plan, D-03)

Hoy:

```typescript
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {};
```

Contrato que el docblock (L465-509) impone al escribir la primera entrada:

> El VALOR son nombres de tabla **FÍSICA**, tal cual figuran en `GYM_OWNED_TABLES`
> — los de `getTableName()`, no los de las constantes TypeScript.

Los 6 nombres físicos verificados contra `GYM_OWNED_TABLES` (L64-170):
`balances` (L73), `cash_registers` (L83), `cost_centers` (L89), `debt_management`
(L91), `financial_transactions` (L99), `transaction_links` (L139). ✅ D-05: no hay
una 7ª tabla finance en la lista (`aura_balances`/`aura_transactions` existen pero
son de gamification).

**Gate que se va a poner ROJO y hay que reescribir:**
`test/db/tenant-tables.test.ts:351-364` — `it("arranca vacía en la fase 170 …")`,
que hoy afirma `expect(modulos.length).toBe(0)`. Su mensaje ya dice qué hacer:

> Agregar la primera entrada es una DECISIÓN DE DISEÑO de una fase de adopción
> (172+) … (1) el sentinel pasa a hacer THROW en test/dev sobre las tablas de ese
> módulo …; (2) OBLIGA a vaciar las entradas de esas tablas en
> `tenant-lint-allowlist.json`, porque el lint deja el build rojo si conviven (D-15).

Los otros cuatro gates del mismo `describe` (L366-467: tabla existe en
GYM_OWNED_TABLES, ninguna en dos módulos, claves en minúscula, coherencia de
`isStrictTable`/`strictTablesSet`) **pasan a verde solos** con la entrada
`finance` — extender, no romper. El gate anti-tautología de L459 (`isStrictTable("bookings") === false`) sigue siendo válido.

---

### 8. Demo fail-closed en vivo (D-03) — sonda revertida sin commitear

**Analog:** `test/tenancy/con-05-sentinel.test.ts:285-386`. El punto crítico
(docblock L32-39):

> A través de Drizzle, lo que se atrapa NO es el `TenantSentinelError`: es un
> `DrizzleQueryError` ("Failed query: …") que lo lleva en `cause`. … un
> `catch (e) { if (e instanceof TenantSentinelError) … }` escrito sobre una
> llamada al ORM NO va a entrar nunca — hay que recorrer la cadena de `cause`.

```typescript
function sentinelErrorDe(err: unknown): TenantSentinelError | undefined {
  let actual: unknown = err;
  while (actual instanceof Error) {
    if (actual instanceof TenantSentinelError) return actual;
    actual = actual.cause;
  }
  return undefined;
}
```

Mensaje del error (lo que el ejecutor debe ver en la demo) —
`src/db/sentinel/install.ts:180-190`:

```
[sentinel de tenancy] query sin tenant_id sobre <tablas> (módulo ya migrado, ver
TENANT_STRICT_MODULES en src/db/tenant-tables.ts).
SQL: <sql>
Qué hacer: filtrá con tenantWhere(tabla, ctx) …
```

---

### 9. Batería ISO-03 — casos a mano (D-08/D-09/D-10)

**Analog de ciclo de vida y de siembra:** `test/tenancy/iso-02-fixtures.test.ts:196-237`.

```typescript
let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmético (Pitfall 7): `cleanAllTestData` vacía ~90
  // tablas SIN filtro de tenant y borra todos los users menos `admin@test.com`.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (`isolate: false`) y `branches` no está en `TABLES_TO_CLEAN` (T-171-14).
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});
```

**Import del fixture** (`iso-02-fixtures.test.ts:61-67`):

```typescript
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
```

**Handle que devuelve** (`second-tenant.ts:155-167`): `tenantId`, `branchId`,
`activityId`, `adminId`, `adminToken`, `coachId`, `coachToken`,
`socios: [SocioDelGimnasioDos, SocioDelGimnasioDos]`, `planId`, `scheduleId`.
`adminToken` y `coachToken` cubren D-10 (rol mínimo real) sin trabajo extra;
para `owner` la batería tiene que crear el suyo con `createStaffUser(app, { …,
tenantId: TENANT_DOS })`.

**La caja del gimnasio 2 NO viene sembrada** — `second-tenant.ts:69-77` lo dice
explícitamente y deja la receta escrita:

```
ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS)
```

> El cuarto argumento NO es opcional en la practica: su default es 1, asi que
> omitirlo estampa la caja en El Templo (T-168-15) y el fixture mentiria.

Firma real (`test/helpers.ts:321-350`): `ensureEfectivoCaja(app, branchId,
currency = "ARS", tenantId = 1)`, idempotente, ya usa `tenantValues`.
`limpiarSegundoGimnasio` (L399-401) ya borra `cash_registers` del gimnasio 2 antes
de `branches` — la batería de finance **no** necesita limpieza extra de cajas.

**Aserción de evidencia (leer el `tenant_id` REAL de la base, no confiar en la
respuesta HTTP)** — `iso-02-fixtures.test.ts:121-162`:

```typescript
async function consultar<T>(app: FastifyInstance, consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

async function tenantDeLaFila(app, tabla, id): Promise<number | null> {
  const filas = await consultar<{ t: number | null }>(
    app,
    sql`SELECT tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}
```

> **`sql.raw(tabla)` sobre una UNIÓN CERRADA de literales, jamás un `string` libre**
> (`iso-02-fixtures.test.ts:90-101`). Para iso-03 la unión es las 6 tablas strict.

**Mensaje de rojo con el "por qué importa"** — `iso-02-fixtures.test.ts:229-237`
es el molde: todo `expect` lleva segundo argumento explicando qué significa el
valor equivocado y a qué archivo ir.

**Casos cross-tenant (D-09: 404/vacío, nunca 403).** El repo ya tiene el idioma
"404 para no filtrar existencia" en finance — `routes.ts:146-165`:

```typescript
// Phase 139: enforce non-owner country scope on a caja. Returns an error
// tuple { code, message } to send (404 for unknown/cross-country to avoid
// existence leak …), or null when access is OK.
const enforceCajaScope = async (cajaId, isOwner, scopeCountry) => {
  if (isOwner) return null;
  const resolved = await resolveCajaCountry(cajaId);
  if (!resolved) return { code: 404, message: "Caja no encontrada" };
  if (resolved.country === null || resolved.country !== scopeCountry) {
    return { code: 404, message: "Caja no encontrada" };
  }
  return null;
};
```

D-09 sale gratis: con `tenantWhere` el SELECT no matchea y el código cae en su
rama not-found actual. **Pero `enforceCajaScope`/`enforceRowScope`/`resolveCajaCountry`
(routes.ts:126-197) hacen queries a `cash_registers` y `financial_transactions`
sin scope — el sentinel las va a reventar.** Son de los primeros sitios a migrar.

**Analog de estructura por ruta** (batería D-09 de la 169) —
`test/tenancy/con-03-write-paths-tenant-id.test.ts:618-712`: un `describe` por
ruta con nombre `"<qué hace> — <MÉTODO> <url>"`, y dentro el caso positivo + un
caso **control**. Para iso-03 el par es: _el actor del gimnasio A no ve/no toca el
recurso del B_ + _control: el mismo actor SÍ ve/SÍ toca el suyo_ (sin el control,
un 404 por seeding roto pasa por aislamiento).

**Ids de tenants ad-hoc ya tomados** (`second-tenant.ts:106-110`): 90168 (con-01),
90169 (tenant-helpers), 90269 (con-04), 90369 (con-03), 90418, 90469 (webhook
Wellhub), 90569 (tv-pairing), 90671 (second-tenant) y 90940. Si iso-03 necesita un
tercer gimnasio, **id propio**, nunca reusar 90671.

---

### 10. Gate de cobertura fail-closed de la batería (D-08)

**Analog exacto:** `test/tenancy/iso-01-manifiesto.test.ts:184-266`. Tres piezas
copiables:

1. **La constante de baseline con docblock que explica que moverla es una decisión**
   (`iso-01:115-141`, `const ENTRADAS_BASELINE = 372`).
2. **El `expect(lista).toEqual([])` con el mensaje que NOMBRA lo que falta**:

```typescript
it("toda ruta registrada por el app tiene entrada en el manifiesto", () => {
  const faltantes = discrepancias.faltantes.slice().sort();
  expect(
    faltantes,
    `Rutas que el app REGISTRA y que NO están clasificadas en ` +
      `test/tenant-manifest.ts: ${faltantes.join(", ")}. ` +
      `QUÉ HACER: … ` +
      `POR QUÉ IMPORTA: …`,
  ).toEqual([]);
});
```

3. **Bidireccionalidad**: ruta finance sin caso → rojo (`faltantes`), Y caso que
   apunta a una ruta que ya no existe → rojo (`fantasmas`, `iso-01:208-223`).

**Fuente del gate** (`test/tenant-manifest.ts:161`): `TENANT_MANIFEST:
Record<string, EntradaManifiesto>` con clave `"<MÉTODO> <url>"` y
`{ categoria: "tenant-scoped" | "templo-module" | "global" }`.

**Las rutas finance del manifiesto: 38 exactas**, todas `tenant-scoped`,
`test/tenant-manifest.ts:250-321`. Criterio de derivación más simple y sin
comodines en el manifiesto (D-01 de la 171 prohíbe comodines _en el registro_, no
en un filtro de test): las claves cuyo path arranca con `/api/admin/finance/`.

`GET /api/admin/analytics/advanced-finance` (L208) **no** matchea ese prefijo.
Decisión para el planner: o el gate usa un set explícito de 38+1, o el criterio es
por prefijo y advanced-finance entra como caso a mano fuera del gate. Recomendado:
**set explícito derivado del manifiesto por prefijo + una lista nombrada de
excepciones**, para que agregar una ruta finance nueva siga siendo rojo.

Las 38 (para el planner):

```
GET    /cash-registers · /cash-registers/balances · /cash-registers/balances/export
GET    /coach-load/autocompletar/:userId · /coach-load/bank-accounts
       /coach-load/caja-efectivo · /coach-load/mis-cargas
GET    /cost-centers · /cost-centers/all
GET    /movements-history · /movements-history/export
GET    /pending-tray · /pending-tray/export
GET    /transactions · /transactions/export · /transactions/pending-misc/:memberId
       /transactions/summary
PATCH  /cash-registers/:id · /cost-centers/:id
POST   /cash-registers · /cash-registers/:id/close · /cash-registers/:id/reactivate
       /cash-registers/efectivo
POST   /coach-load/alta · /coach-load/misc · /coach-load/pay-plan
POST   /cost-centers · /cost-centers/:id/deactivate · /cost-centers/:id/reactivate
POST   /expenses · /expenses/:id/void
POST   /movements · /movements/:id/void
POST   /transactions · /transactions/:id/correct · /transactions/:id/observe
       /transactions/:id/validate · /transactions/:id/void
```

**Roles por ruta para D-10** (`src/modules/shared/permissions.ts` + los hooks):
`finance/routes.ts` gatea el módulo con `FINANCE_READ_ROLES` (coach EXCLUIDO) y
sube a `FINANCE_WRITE_ROLES` / `FINANCE_VOID_ROLES` / `FINANCE_ADJUSTMENT_ROLES` /
`ADMIN_ROLES` por ruta; `coach-load-routes.ts:249` gatea con `FINANCE_LOAD_ROLES`
(coach ∈). Las 4 rutas `/coach-load/*` son las que se prueban con `gym2.coachToken`;
`ADMIN_ROLES = ["admin","owner"]` (permissions.ts:23) marca las owner/admin-only
(`POST /cash-registers`, `/cash-registers/efectivo`, `PATCH /cash-registers/:id`,
ABM de cost-centers).

---

### 11. Script de snapshot "mismos números" (D-12)

**Analog más cercano (parcial):** `src/scripts/dry-run-reassign-multibranch.ts:1-40`
— script versionado, a demanda, no cableado a ningún pipeline, con usage local y
de servidor en el docblock:

```
 * NO está cableado a ningún pipeline (ni package.json de arranque, ni deploy,
 * ni el runner de migraciones). Solo a demanda.
 *
 * Usage (local):
 *   pnpm tsx src/scripts/dry-run-reassign-multibranch.ts            # dry-run
 * Usage (server, post-deploy):
 *   NODE_ENV=production node dist/scripts/dry-run-reassign-multibranch.js
```

**Diferencia:** el de la 172 golpea **endpoints HTTP**, no la DB. No hay analog de
eso en `src/scripts/`. Precedentes de forma para el planner:

- `createSingleConnection()` + `failTenantArg` si terminara leyendo la DB.
- El script vive en `src/scripts/` si se compila a `dist/` (los de ahí sí), o en
  `scripts/` si es solo local (`seed-onboarding-aura.ts`, `wellhub-sandbox.ts`).
- Endpoints agregadores que nombra el D-12, ya verificados en el manifiesto:
  `GET /transactions/summary`, `GET /cash-registers/balances`, `GET /pending-tray`,
  `GET /movements-history`, `GET /transactions/export`,
  `GET /cash-registers/balances/export`, `GET /pending-tray/export`,
  `GET /movements-history/export`, + deudas en `reports`.

---

### 12. Doc `.docs/saas-multitenancy/07-receta-adopcion.md` (D-11)

**Analog:** `06-estrategia-migracion.md` (misma carpeta). Cabecera:

```markdown
# Fase 3 — Estrategia de migración detallada: El Templo → tenant #1

> **Fecha:** 2026-07-26
> **Estado: ✅ …**
```

**⚠️ `.docs/` NO está versionado** (no aparece en `git ls-tree origin/master`) —
vive solo en el checkout principal `/home/franco/projects/el-templo/.docs/`. Un
worktree nuevo **no la trae**, igual que `.env`. El plan que escriba el doc tiene
que crear el archivo en el checkout principal o copiar la carpeta, y **no** contar
con que un `git add` lo capture.

---

## Shared Patterns

### Regla dura: el tenant sale del servidor, siempre

**Source:** `src/modules/shared/tenant.ts:23-38`
**Apply to:** todos los archivos de A, B y D.

Las cuatro fuentes legítimas de un `TenantContext`, y no hay una quinta:

1. `assertTenant(request.scope, "<dónde>")` — camino con request.
2. El loop `forEachActiveTenant` de los crons.
3. La derivación del webhook de Wellhub.
4. El `--tenant=<id>` obligatorio de los scripts CLI.

### `tenantWhere` como PRIMER término de todo `and(...)`

**Source:** `src/modules/shared/tenant.ts:18-21` (convención lockeada por doc 03 §3)
**Apply to:** todo WHERE sobre las 6 tablas strict + las no-finance de archivos del módulo.

```typescript
and(tenantWhere(table, scope), ...resto);
```

### Exención `tenant-safe` — el único escape, y con motivo

**Source:** `tenant-lint-allowlist.json` (header) + `src/db/sentinel/install.ts:184-187`
**Apply to:** el WHERE del claim de pairing es el precedente de cuándo NO scopear
(`tv/pairing.ts:201-205`). En finance no se espera ninguno: si aparece uno,
comentario de **bloque** aparte (nunca anidado en `/** */`), anclado por AST al
sitio del write. **Sumar una entrada a la allowlist NO es una salida válida.**

### Manejo de errores en rutas

**Source:** `finance/routes.ts:1409-1411`, `coach-load-routes.ts:999-1001`
**Apply to:** todo handler tocado.

```typescript
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "<etiqueta>");
      }
```

`assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)` (`shared/tenant.ts:192-205`),
que `handleServiceError` ya sabe mapear — no hace falta try/catch nuevo.

### Verificación local antes de cada commit

**Source:** 172-CONTEXT.md `<code_context>` + allowlist header

- `pnpm lint:tenant` — que las entradas borradas no reaparezcan como violaciones.
- `SENTINEL_INVENTORY=1` sobre la suite — lista determinística de queries
  violadoras por tabla (inventario fino por statement).
- El gate D-14 compara contra la rama base: **un push que solo BORRA entradas es
  verde por construcción**.

### Trampas de test heredadas

**Source:** `second-tenant.ts:341-375`, `iso-02-fixtures.test.ts:205-222`

- `cleanAllTestData` NO limpia `branches` (ni `cash_registers`, ni `aura_config`).
- Orden obligado: `cleanAllTestData` → `seedSecondTenant`. Invertirlo deja el
  gimnasio 2 a medias.
- `afterAll` con `limpiarSegundoGimnasio` es **obligatorio** (`isolate: false`).
- `tenants` no se borra con FK viva: el DELETE va último.
- Correr un archivo de tenancy a la vez: `--hookTimeout=250000` (~100 s de
  provisioning por worker).

---

## No Analog Found

| Archivo                 | Rol        | Data flow              | Motivo                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| script de snapshot D-12 | script CLI | batch HTTP + diff JSON | No existe en el repo ningún script que golpee endpoints HTTP y persista JSON para diff. `dry-run-reassign-multibranch.ts` da la FORMA (a demanda, no cableado, usage local+server) pero no el mecanismo. El planner decide: `app.inject` sobre `buildApp()` vs `fetch` contra staging con un token — el D-12 dice "golpea los agregadores", lo que sugiere HTTP real contra staging. |

---

## Riesgos que el pattern map deja a la vista

1. **`reports/service.ts` rompe la receta "ctx primero en el método".** Seis de sus
   diez sitios son helpers privados que **devuelven fragmentos SQL**
   (`buildOutstandingBaseConds`, `buildOutstandingOrderBy`, `effectiveDebtStatusSQL`,
   `buildDebtOriginTxSubquery`, `buildOutstandingStatusConds`, `buildChargeConditions`).
   No hay analog de "helper que arma SQL y recibe ctx" en el repo. Mismo problema,
   más chico, en `transaction-service.buildListConditions()`.
2. **`routes.ts:126-197`** (`resolveCajaCountry`, `enforceCajaScope`,
   `enforceRowScope`) son closures del plugin, no métodos de service: hacen queries
   a `cash_registers` y `financial_transactions` y hoy no tienen dónde recibir el
   ctx. Van a explotar con el sentinel. Necesitan decisión de firma temprana.
3. **`createEfectivoCaja` ya tiene `ctx` pero no está migrado** (el SELECT de
   `cash_registers` en L818-829 sigue sin `tenantWhere`). Es la trampa exacta: "el
   método tiene ctx" ≠ "el método está migrado". El criterio de terminado es
   **allowlist vacía + lint verde**, no la firma.
4. **`subscriptions/service.ts` (5861 L) tiene call sites duales** (rutas + jobs +
   `TransactionService.setSubscriptionCanceller`, ver `routes.ts:96-110`). El
   `_cancelSubscription(tx, …)` se llama desde `transaction-service.void()` — la
   firma cambia en los dos lados a la vez.
5. **`applyDelta` es llamado con el `TxHandle` de un caller externo**
   (`balance-service.ts:55-58`): cambiar su firma toca `transaction-service.ts` y
   `subscriptions/service.ts` en el mismo commit o nada compila.
6. **La demo fail-closed debe mirar `err.cause`**, no `instanceof` directo
   (`con-05-sentinel.test.ts:32-39`). Un assert ingenuo pasa en verde probando nada.

---

## Metadata

**Analog search scope:** `el-templo-api/src/{modules,db,jobs,scripts}`,
`el-templo-api/scripts`, `el-templo-api/test/{tenancy,fixtures,db,finance}`,
`.docs/saas-multitenancy/` (checkout principal).
**Files scanned:** ~45 (6 leídos en profundidad, resto por Grep/AST-lite).
**Revisión:** `29e61c8b` vía worktree read-only detached.
**Pattern extraction date:** 2026-07-30
