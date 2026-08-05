# Phase 150: Cuentas bancarias flexibles - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 14 (7 API, 7 frontend admin)
**Analogs found:** 14 / 14 (todos tienen analog fuerte — es una extensión brownfield del módulo de Caja v5.2/v5.3)

Esta fase NO abre superficie nueva: extiende `cash_registers` con columnas bancarias, agrega endpoints ABM al plugin de finance ya existente, y suma un tab a `CajaPage.vue`. Cada archivo tiene un análogo directo en el mismo módulo. **No hay "No Analog Found".**

---

## File Classification

| Archivo (nuevo/modificado)                                                               | Rol               | Data Flow               | Análogo más cercano                                                               | Calidad    |
| ---------------------------------------------------------------------------------------- | ----------------- | ----------------------- | --------------------------------------------------------------------------------- | ---------- |
| `el-templo-api/src/db/schema/cash-registers.ts` (MOD)                                    | model/schema      | —                       | `cost-centers.ts` + el propio archivo                                             | exact      |
| `el-templo-api/src/db/migrations/0163_*.sql` (NEW)                                       | migration         | batch/seed              | `0161_cost_centers.sql` (ALTER+seed) + `0160_seed_banco_cuentas.sql` (NOT EXISTS) | exact      |
| `el-templo-api/src/modules/finance/schemas.ts` (MOD)                                     | config/validation | request-response        | `registerExpenseSchema` (mismo archivo)                                           | exact      |
| `el-templo-api/src/modules/finance/cash-register-service.ts` (MOD)                       | service           | CRUD                    | métodos del propio archivo + `movement-service.registerExpense` (validación)      | exact      |
| `el-templo-api/src/modules/finance/routes.ts` (MOD)                                      | route/controller  | request-response CRUD   | `POST /expenses` + `GET /cost-centers` (mismo archivo)                            | exact      |
| `el-templo-api/src/modules/finance/types.ts` (MOD)                                       | types             | —                       | tipos `CostCenterItem` / `RegisterExpenseInput` (mismo archivo)                   | exact      |
| `el-templo-api/test/finance/bank-accounts.test.ts` (NEW)                                 | test              | —                       | `test/finance/cost-centers.test.ts`                                               | exact      |
| `el-templo-admin/src/pages/CajaPage.vue` (MOD)                                           | component/page    | —                       | wiring de tabs del propio archivo                                                 | exact      |
| `el-templo-admin/src/constants/caja.ts` (MOD)                                            | config            | —                       | `CAJA_TABS` (mismo archivo)                                                       | exact      |
| `el-templo-admin/src/components/caja/CuentasTab.vue` (NEW)                               | component         | request-response (list) | `SaldosPorCajaTab.vue`                                                            | exact      |
| `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue` (NEW, reutilizable)   | component/form    | request-response        | `RegistrarMovEgresoDialog.vue`                                                    | role-match |
| `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` (MOD, prefill retiro) | component/form    | request-response        | el propio archivo (agregar props de prefill)                                      | exact      |
| `el-templo-admin/src/composables/useTransactionsApi.ts` (MOD)                            | service/api       | request-response CRUD   | `getCostCenters` / `registerExpense` (mismo archivo)                              | exact      |
| `el-templo-admin/src/types/transaction.ts` (MOD)                                         | types             | —                       | `CostCenter` / `CajaSaldoRow` (mismo archivo)                                     | exact      |

---

## Pattern Assignments

### `el-templo-api/src/db/schema/cash-registers.ts` (model, MODIFY)

**Análogo:** el propio archivo (imports/estilo) + `cost-centers.ts` para `varchar` nullable.

**REGLA CRÍTICA:** los nombres de columna nuevos deben coincidir **byte-for-byte** con la migración 0163 — un drift de nombre da CI "Unknown column" que tsc NO detecta (ver `cash-registers.ts:26-28` y `cost-centers.ts:19`).

Las ~6 columnas bancarias (D-01) se agregan nullable dentro del `mysqlTable("cash_registers", {...})` existente (líneas 30-49). Patrón de columna `varchar` nullable (sin `.notNull()`):

```typescript
// Estilo existente en el archivo (cash-registers.ts:33-46):
name: varchar("name", { length: 100 }).notNull(),
currency: varchar("currency", { length: 3 }).notNull(),
// Nuevas columnas bancarias → mismo helper varchar SIN .notNull() (nullable):
//   bank_name, account_holder, tax_id (CUIT), cbu_cvu, account_alias, account_number
// El nombre visible `name` sigue NOT NULL y se autogenera (D-03) en el service.
```

Nota D-03: `name` sigue siendo NOT NULL y derivado (Banco + Alias) — la derivación vive en el **service**, no en el schema.

---

### `el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql` (migration, NEW)

**Número:** la última migración aplicada es `0162_created_member_id.sql` → **la nueva es `0163`** (verificar al ejecutar; el tren v5.2/v5.3 llegó a 0162).

**Análogo primario:** `0161_cost_centers.sql` (ALTER de columnas + seed idempotente). **Análogo del seed:** `0160_seed_banco_cuentas.sql` (guard NOT EXISTS con derived table LIMIT 1 para evitar error 1093).

**Escrita a mano** — `db:generate` está roto por drift pre-existente (`sessions.goal_plan_type`), igual que 0154/0158/0161. **NUNCA `drizzle-kit push/migrate`** — la tabla `_migrations` es la fuente de verdad. **NUNCA `;` dentro de comentarios SQL** (el runner splittea por `;` antes de strippear `--`).

Dos bloques ordenados:

**1) ALTER de columnas bancarias** (patrón `0161_cost_centers.sql:33-34` — `ADD COLUMN ... NULL`):

```sql
ALTER TABLE `cash_registers`
  ADD COLUMN `bank_name` varchar(100) NULL AFTER `currency`;
-- (repetir por columna: account_holder, tax_id, cbu_cvu, account_alias, account_number)
```

**2) Seed idempotente del centro de costo "Retiros"** — copia exacta del patrón `0161_cost_centers.sql:44-49` (INSERT ... SELECT ... FROM DUAL WHERE NOT EXISTS, keyed por `(name, country)`, país AR per Claude's Discretion D-09):

```sql
INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Retiros', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Retiros' AND cc.`country` = 'AR'
);
```

---

### `el-templo-api/src/modules/finance/schemas.ts` (config/validation, MODIFY)

**Análogo:** `registerExpenseSchema` (schemas.ts:605-624). Fastify JSON Schema con `as const`, **sin Zod** (schemas.ts:4-5). `errorSchema` compartido (schemas.ts:10-16) reusado en el bloque `response`.

Nuevos schemas: `createBankAccountSchema`, `updateBankAccountSchema`, `closeBankAccountSchema`, `reactivateBankAccountSchema`. Patrón base:

```typescript
export const registerExpenseSchema = {
  body: {
    type: "object",
    required: ["cajaId", "amount", "costCenterId"],
    properties: {
      cajaId: { type: "integer", minimum: 1 },
      amount: { type: "integer", minimum: 1 },
      costCenterId: { type: "integer", minimum: 1 },
      notes: { type: ["string", "null"], maxLength: 2000 },
    },
    additionalProperties: false,
  },
  response: {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;
```

**D-02 "uno de dos" (CBU/CVU o Alias):** JSON Schema no expresa bien "al menos uno de dos" — poner `required: ["bankName", "accountHolder", "currency"]` en el schema y validar la regla CBU/CVU-o-Alias **explícitamente en el service** (lanzando `BadRequestError`), igual que `registerExpense` valida el centro de costo en el service aunque el schema ya lo marque required (movement-service.ts:285-308). Validación de formato CBU/CVU/CUIT: liviana (largo/numérico), no bloquear cuentas del exterior (Claude's Discretion).

---

### `el-templo-api/src/modules/finance/cash-register-service.ts` (service, CRUD, MODIFY)

**Análogo:** métodos del propio archivo (`getBalance`, `listActiveCajasWithBalance`, `listActiveCostCenters`) + patrón de validación de `movement-service.registerExpense`.

**Constructor** ya existe (`db`, `log` — cash-register-service.ts:29-32). Agregar métodos CRUD: `createBankAccount`, `updateBankAccount`, `closeBankAccount(id)`, `reactivateBankAccount(id)`, y `listBankAccounts` (incluye cerradas — D-07).

**D-05 (cuenta nace en 0):** el INSERT fija `type: 'banco'`, `branchId: null`, `openingBalance: 0`, `cutoffDate` = hoy — igual a las cuentas banco del seed `0160_seed_banco_cuentas.sql:22`.

**D-03 (nombre derivado):** helper privado que arma `name` de Banco + Alias (fallback Banco + últimos 4 del CBU/N°), recalculado en create Y update.

**D-06 (warning de cierre con saldo≠0):** `closeBankAccount` consulta el saldo vía el `getBalance(id)` ya existente (cash-register-service.ts:150-228) — el warning lo decide el frontend; el service permite cerrar igual (toggle `isActive=false`). Patrón de lectura con guard NotFound (cash-register-service.ts:150-162):

```typescript
const [caja] = await this.db
  .select({ openingBalance: schema.cashRegisters.openingBalance /* ... */ })
  .from(schema.cashRegisters)
  .where(eq(schema.cashRegisters.id, cashRegisterId))
  .limit(1);
if (!caja) throw new NotFoundError(`No existe la caja ${cashRegisterId}`);
```

Errores: `BadRequestError` / `NotFoundError` desde `../shared/errors` (import cash-register-service.ts:17).

---

### `el-templo-api/src/modules/finance/routes.ts` (route/controller, request-response CRUD, MODIFY)

**Análogo:** `POST /expenses` (routes.ts:608-647) para escritura y `GET /cost-centers` (routes.ts:1148-1176) para lectura, ambos en el mismo plugin `financeRoutes`.

Nuevos endpoints ABM (montados dentro de `financeRoutes`, prefijo `/api/admin/finance`):

- `POST /cash-registers` (crear)
- `PATCH /cash-registers/:id` (editar)
- `POST /cash-registers/:id/close` (cerrar)
- `POST /cash-registers/:id/reactivate` (reactivar)
- `GET /cash-registers` (listar activas + cerradas para el ABM)

**Guard admin/owner (D-12):** el módulo ya gatea `FINANCE_READ_ROLES` en el hook `onRequest` (routes.ts:190-201). Para el ABM, guard en-handler stricter. **Los endpoints de escritura del ABM deben usar `ADMIN_ROLES`** (`["admin","owner"]`, permissions.ts:23) — no `FINANCE_VOID_ROLES` (que incluye gestion), porque D-12 dice admin/owner-only. Patrón de guard en-handler (routes.ts:613-620):

```typescript
if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
  return reply.code(403).send({ error: "Acceso denegado", message: "..." });
}
```

**Estructura completa del handler** (patrón `POST /expenses`, routes.ts:608-647): guard → (country scope si aplica) → llamar al service → `reply.code(201).send({...})` → `catch (err: unknown) { handleServiceError(err, reply, request.log, "..."); }`. Importar el nuevo schema de `./schemas` (bloque routes.ts:28-48) y `ADMIN_ROLES` de `../shared/permissions` (bloque routes.ts:49-54).

**Nota country-scope:** las cuentas banco son `branchId=null` → country-agnostic → owner-only en varias superficies (ver `resolveCajaCountry` routes.ts:113-130 y `listActiveCajasWithBalance` scope cash-register-service.ts:244-284). Como el ABM ya es admin/owner-only, no necesita el filtro de país de las cajas efectivo.

---

### `el-templo-api/src/modules/finance/types.ts` (types, MODIFY)

**Análogo:** `RegisterExpenseInput`, `CostCenterItem`, `CajaSaldoRow` (types.ts, importados en cash-register-service.ts:19-24). Agregar `CreateBankAccountInput`, `UpdateBankAccountInput`, `BankAccountRow`. Sin `any` (CLAUDE.md).

---

### `el-templo-api/test/finance/bank-accounts.test.ts` (test, NEW)

**Análogo:** `test/finance/cost-centers.test.ts` (harness idéntico). Integration tests obligatorios (CLAUDE.md). Corre contra MySQL real por-worker.

Patrón de bootstrap (cost-centers.test.ts:18-51): `import { describe, it, beforeAll, afterAll, expect } from "vitest"`, `createTestApp`, `getAuthToken`, `createStaffUser` de `../helpers`, `import * as schema`. Helper `newCaja()` para insertar cajas de prueba (cost-centers.test.ts:39-51). Tokens por rol (`ownerToken`, `gestionToken`, `coachToken`) para probar el guard.

**Casos a cubrir:** crear cuenta con los 3 obligatorios (201); crear sin CBU/CVU-ni-Alias (400 — regla "uno de dos"); nombre derivado correcto (D-03); editar completa campos; cerrar → `isActive=false` y desaparece de selectores operativos pero aparece en el listado ABM; reactivar; **guard: gestion/coach → 403** en los endpoints de escritura del ABM (admin/owner-only D-12); seed "Retiros" existe tras migración 0163.

---

### `el-templo-admin/src/pages/CajaPage.vue` (page, MODIFY)

**Análogo:** el propio wiring de tabs (CajaPage.vue:23-65). Agregar `<q-tab :name="CAJA_TABS.cuentas" label="Cuentas" icon="account_balance" />` y su `<q-tab-panel>` con `<CuentasTab :selected-country="selectedCountry" :is-owner="isOwner" />`. Orden del tab: no optimizar (la fase 152 reordena — Claude's Discretion). Import del componente en el bloque `<script setup>` (CajaPage.vue:74-77).

---

### `el-templo-admin/src/constants/caja.ts` (config, MODIFY)

**Análogo:** `CAJA_TABS` / `CAJA_TAB_NAMES` (usados en CajaPage.vue:73). Agregar `cuentas` al objeto `CAJA_TABS` y a `CAJA_TAB_NAMES`.

---

### `el-templo-admin/src/components/caja/CuentasTab.vue` (component, list, NEW)

**Análogo:** `SaldosPorCajaTab.vue` (listado con country-scope + carga + export). Reusar: `defineProps<{ selectedCountry: 'AR'|'ES'; isOwner: boolean }>()` (SaldosPorCajaTab.vue:87-90), `createLogger` + `useQuasar` + `useTransactionsApi` (SaldosPorCajaTab.vue:76-94), patrón `loadX()` con try/catch + `$q.notify` (SaldosPorCajaTab.vue:155-168), `onMounted(load)` + `watch(() => props.selectedCountry, load)` + `onUnmounted(() => transactionsApi.cleanup())` (SaldosPorCajaTab.vue:203-212).

El ABM muestra activas y **cerradas atenuadas** (D-07) con acciones editar / cerrar / reactivar / "Registrar retiro" por fila. Puede usar `q-table` (revisar `MovEgresosTab.vue` para el patrón de tabla si se prefiere sobre las cards de Saldos).

**REGLA composable:** `onUnmounted` va en el SFC, NUNCA dentro del composable (CLAUDE.md + comentario SaldosPorCajaTab.vue:208-209).

---

### `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue` (component/form, NEW, reutilizable)

**Análogo:** `RegistrarMovEgresoDialog.vue`. **Diseñar como componente reutilizable** — la fase 151 (COBRO-04) lo montará inline en el flujo de cobro (D-11 / code_context).

Reusar el patrón de dialog completo de `RegistrarMovEgresoDialog.vue`:

- `q-dialog v-model="show"` con `show` computed get/set sobre `modelValue` (RegistrarMovEgresoDialog.vue:177-180)
- props `{ modelValue, selectedCountry, isOwner }` + emits `update:modelValue` / `registered` (líneas 162-171)
- `reactive` form state + `computed` `canSubmit` (líneas 270-321)
- submit con try/catch → `transactionsApi.X()` → `$q.notify` positive → `show.value=false` → `emit('registered')` → catch `extractError` + notify negative (líneas 355-375)
- `resetAll` en `@hide` (líneas 377-388)
- `onUnmounted(() => transactionsApi.cleanup())` (líneas 390-392)

**Campos (D-02):** Banco*, Titular*, moneda\* (select ARS default, D-04), CBU/CVU, Alias, CUIT, N° cuenta. Regla "uno de dos" en `canSubmit` (CBU/CVU o Alias presente) espejando la validación del backend. **Sin campo "Nombre"** (derivado, D-03).

---

### `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` (component/form, MODIFY — prefill retiro)

**D-10:** "Registrar retiro" es este mismo dialog **prellenado** (no un flujo nuevo). Agregar props opcionales de prefill (p.ej. `prefillTab?: 'egreso'`, `prefillCajaId?: number`, `prefillCostCenterName?: 'Retiros'`) y aplicarlas en `onShow`. El dialog ya carga todas las cajas activas incluidas banco (líneas 199-213) y todos los centros de costo (líneas 228-248), así que "Retiros" aparecerá automáticamente tras el seed 0163. La preselección de centro reusa el patrón "buscar por name" ya presente (líneas 237-239):

```typescript
const varios = data.find((c) => c.name === "Varios");
egreso.costCenterId = varios ? varios.id : data[0].id;
// → para retiro: buscar c.name === 'Retiros' y fijar egreso.cajaId al prefill
```

---

### `el-templo-admin/src/composables/useTransactionsApi.ts` (service/api, MODIFY)

**Análogo:** `getCostCenters` (líneas 294-308) y `registerExpense` (líneas 274-286). Import `api` de `src/boot/axios` (línea 7), `extractError` (línea 8). Cada método: setea `loading`/`error`, `api.get`/`api.post` tipado, `catch` con `extractError` + `throw`, `finally` resetea loading. Agregar al `return {}` (líneas 560-594) igual que las adiciones por fase.

Nuevos métodos: `listBankAccounts`, `createBankAccount`, `updateBankAccount`, `closeBankAccount`, `reactivateBankAccount`. Patrón exacto (registerExpense, líneas 274-286):

```typescript
async function registerExpense(
  input: RegisterExpenseInput,
): Promise<{ expense: ExpenseDetail }> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.post<{ expense: ExpenseDetail }>(
      "/admin/finance/expenses",
      input,
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error registrando egreso");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

---

### `el-templo-admin/src/types/transaction.ts` (types, MODIFY)

**Análogo:** `CostCenter`, `CajaSaldoRow`, `RegisterExpenseInput` (importados en useTransactionsApi.ts:9-34). Agregar `BankAccount`, `CreateBankAccountInput`, `UpdateBankAccountInput`. Sin `any`.

---

## Shared Patterns

### RBAC / guard admin-owner

**Source:** `el-templo-api/src/modules/shared/permissions.ts:23` (`ADMIN_ROLES`) + patrón de guard en-handler `routes.ts:613-620`.
**Apply to:** todos los endpoints de escritura del ABM (create/update/close/reactivate). D-12 = admin/owner-only. El hook de módulo (`routes.ts:190-201`) ya gatea `FINANCE_READ_ROLES`; el ABM stricter con `ADMIN_ROLES` en-handler. **La seguridad real vive en la API** (149 D-04) — el nav solo esconde.

```typescript
if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
  return reply.code(403).send({ error: "Acceso denegado", message: "..." });
}
```

### Manejo de errores del service

**Source:** `handleServiceError` de `../shared/error-handler` (routes.ts:27, uso en 644) + `BadRequestError`/`NotFoundError` de `../shared/errors` (cash-register-service.ts:17).
**Apply to:** todos los handlers y métodos de service nuevos. Handlers: `catch (err: unknown) { handleServiceError(err, reply, request.log, "contexto"); }`. Services: lanzar `BadRequestError`/`NotFoundError` tipados. `catch (err: unknown)` con narrowing (CLAUDE.md).

### Validación (Fastify JSON Schema, sin Zod)

**Source:** `registerExpenseSchema` (schemas.ts:605-624), `errorSchema` compartido (schemas.ts:10-16).
**Apply to:** todos los endpoints nuevos. `as const`, `additionalProperties: false`, bloque `response` con `errorSchema` por código. Reglas complejas ("uno de dos" D-02) se validan en el **service**, no en el schema.

### Frontend: composable API + dialog + notify

**Source:** `useTransactionsApi.ts` (método patrón líneas 274-286) + `RegistrarMovEgresoDialog.vue` (dialog completo) + `SaldosPorCajaTab.vue` (listado).
**Apply to:** todos los componentes/API nuevos. `createLogger()` nunca `console.*`; `extractError` para mensajes; `$q.notify` positive/negative; `onUnmounted` en el SFC (nunca en el composable) llamando `cleanup()`.

### Migración escrita a mano + seed idempotente

**Source:** `0161_cost_centers.sql` (ALTER+seed) + `0160_seed_banco_cuentas.sql` (NOT EXISTS derived-table).
**Apply to:** la migración 0163. `db:generate` roto → a mano; número secuencial (0163); NUNCA `;` en comentarios SQL; NUNCA `drizzle-kit push/migrate`; seed idempotente `INSERT ... SELECT ... FROM DUAL WHERE NOT EXISTS`. Commitear el SQL junto al cambio de schema.

### Coherencia enum/columna byte-for-byte

**Source:** comentarios `cash-registers.ts:26-28`, `cost-centers.ts:19`.
**Apply to:** las columnas bancarias nuevas de `cash-registers.ts` — el nombre en Drizzle debe coincidir exacto con el SQL de 0163 (drift = CI "Unknown column" invisible a tsc).

---

## No Analog Found

Ninguno. Toda la fase es una extensión brownfield del módulo de Caja (v5.2/v5.3) con análogos directos por archivo.

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/finance/`, `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/src/modules/shared/`, `el-templo-api/test/finance/`, `el-templo-admin/src/pages/`, `el-templo-admin/src/components/caja/`, `el-templo-admin/src/composables/`.
**Files scanned:** ~20 leídos en detalle.
**Última migración existente:** `0162_created_member_id.sql` → **la nueva es 0163** (verificar al ejecutar).
**Pattern extraction date:** 2026-07-02
