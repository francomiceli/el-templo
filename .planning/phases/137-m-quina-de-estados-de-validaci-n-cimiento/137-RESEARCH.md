# Phase 137: Máquina de estados de validación (cimiento) - Research

**Researched:** 2026-06-24
**Domain:** Backend validation state machine over an existing immutable financial ledger (Fastify + Drizzle + MySQL)
**Confidence:** HIGH (all findings anchored in direct reads of the live codebase: schema, transaction-service, balance-service, audit-log, the 12 canonical-filter call sites, subscriptions/service, permissions, tests)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 137 es **backend-only puro**. Nada de UI. El "cimiento" = schema + helper canónico + endpoints (validate/observe/correct/void) + tests. La UI de acciones (bandeja + botones) es la fase 141.
- **D-02:** **No se toca CajaPage (v4.8)** en 137. No hay UI de v5.0 que pisar.
- **D-03:** **Cero pantallas de configuración en 137.** Reglas hard-coded: profe→`pendiente`, admin→`validado` (rol server-side, VAL-02); membresía se activa al instante siempre (VAL-07). Las perillas configurables son dueñas de la fase 142.
- **D-04:** **Las dos opciones, la admin elige.** 137 expone `observe()` (marcar "observado") y `correct()` (corrección directa = anular+recrear).
- **D-05:** **"Corregir" = anular + recrear, nunca UPDATE** (inmutabilidad del ledger). La vieja queda `voided_at` seteado + `validation_status='corregido'`; la nueva nace `validado` (la crea el admin) y se linkea a la vieja vía `transaction_links` (`target_kind='transaction'`).
- **D-06:** Ciclo de vida:
  - `pendiente` → (admin valida) → `validado`
  - `pendiente` → (admin observa) → `observado` → (admin corrige) → vieja=`corregido`+void, nueva=`validado`
  - `pendiente` → (admin corrige directo) → vieja=`corregido`+void, nueva=`validado`
  - cualquier `validado` → (admin anula) → `voided_at` (ANULADO = eje separado del enum)
- **D-07:** **Historia completa con rastro.** Cada transición deja registro con autor + fecha + motivo.
- **D-08:** **Reusar el mecanismo de auditoría existente** (`audit-log`, fase 111), agregando action types nuevos (`transaction_validated`, `transaction_observed`, `transaction_corrected`). No crear tabla `validation_events` dedicada salvo que la investigación lo justifique (discreción de Claude).
- **D-09:** La **membresía se activa al instante** independiente del `validation_status` (VAL-07). Un PENDIENTE **ya salda la deuda del socio en `balances`** pero **NO suma a caja firme**.
- **D-10:** **Anular es solo admin** (motivo + autor + fecha, VAL-06). Al anular un pago con membresía asociada, la decisión es 1-a-1 con default "activa" — en 137 es el contrato backend `keepMembershipActive` (default true); el popup es UI posterior.

### Claude's Discretion

- Estructura interna del helper canónico de "dinero firme" (función vs query builder compartido) y dónde vive en el módulo finance.
- `audit-log` reutilizado vs tabla dedicada de eventos de validación (D-08) — decidir según cómo la bandeja 141 consultará el historial.
- Forma exacta de los endpoints (REST shape, naming) siguiendo convenciones del módulo finance.
- Cómo `correct()` arma la transacción nueva (copia de campos del original + override del dato corregido) dentro de una transacción DB atómica.

### Deferred Ideas (OUT OF SCOPE)

- **Perillas configurables de política** → fase 142. En 137 todo hard-coded.
- **Bandeja de pendientes + botones validar/observar/anular** (UI) → fase 141.
- **Popup de decisión de membresía al anular** (UI) → fase posterior; en 137 solo el contrato backend `keepMembershipActive`.
- **Entidad caja + asociación pago↔caja** → fase 138.
- **Regla "qué dato manda" durante convivencia con Contabilium** → fase 142.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                    | Research Support                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VAL-01 | `validation_status` (pendiente/observado/corregido/validado) **ortogonal** al soft-void; coexisten sin reescribir `void()`.    | `financial-transactions.ts` ya tiene el triplete soft-void (líneas 51-53) y `void()` (transaction-service.ts:239-314) opera solo sobre él. Agregar un `mysqlEnum` nuevo no toca ese eje. ANULADO se mantiene como `voidedAt IS NOT NULL`. [VERIFIED: codebase]                              |
| VAL-02 | Profe→PENDIENTE, admin→VALIDADO; rol resuelto server-side.                                                                     | Rol disponible en `request.user.role` (finance/routes.ts:63). NO existe rol `profe` — el entrenador es `coach`, y `coach` NO está hoy en `FINANCE_WRITE_ROLES`. Mapeo de rol→status debe vivir server-side en el create. [VERIFIED: codebase]                                               |
| VAL-03 | Admin valida un PENDIENTE → dinero firme.                                                                                      | Nuevo método `validate(id, adminId)` en TransactionService; transición `pendiente→validado` + audit row. El filtro canónico (ver call-site audit) recién entonces lo cuenta. [VERIFIED: codebase]                                                                                           |
| VAL-04 | Admin observa + corrige vía **anular+recrear** (no UPDATE).                                                                    | `void()` ya provee el patrón soft-void atómico; `correct()` lo reusa (void vieja con `validation_status='corregido'` + `create()` nueva con link `target_kind='transaction'`). `create()` acepta `tx` opcional → ambas patas en una `db.transaction`. [VERIFIED: codebase]                  |
| VAL-05 | Filtro canónico cuenta solo VALIDADOS; migración `DEFAULT 'validado'` + backfill; 6 métricas v5.0 intactas; call sites verdes. | Inventario exhaustivo de 14 call sites abajo. `DEFAULT 'validado'` + backfill deja todo el histórico como validado → métricas no cambian de número. Test de regresión obligatorio. [VERIFIED: codebase]                                                                                     |
| VAL-06 | Solo admin anula (motivo+autor+fecha); contrato `keepMembershipActive` (default true).                                         | `void()` ya exige reason + setea voidedBy + escribe audit (transaction-service.ts:255-300). Extender con `keepMembershipActive` y la decisión 1-a-1 de membresía. RBAC: `FINANCE_VOID_ROLES` (owner/admin/gestion, recepcion excluido). [VERIFIED: codebase]                                |
| VAL-07 | Membresía se activa al instante, independiente del status del pago.                                                            | `recordAssignmentCharge` (subscriptions/service.ts:248) activa la sub y llama `create()` atómicamente; `applyDelta` corre en el create independiente de `validation_status`. Un PENDIENTE ya salda `balances`. El único cambio es el valor del nuevo enum al insertar. [VERIFIED: codebase] |

</phase_requirements>

## Summary

El modelo financiero v4.8 (fases 105-112) ya provee el 100% de la infraestructura que 137 necesita reusar: ledger inmutable (`financial_transactions` sin `update()`, solo `void()`), soft-void con rastro (`voidedAt/voidedBy/voidReason`), cache de deuda del socio (`balances` mantenida atómicamente por `BalanceService.applyDelta`), pivote M:N (`transaction_links` con `target_kind='transaction'` ya existente), y auditoría forense (`auditLog.write(tx, …)`, fase 111). 137 NO inventa mecanismos: agrega **una columna enum ortogonal** y **centraliza un filtro que hoy está copiado en 14 lugares**.

El riesgo real y único de la fase es el **blast radius del filtro canónico de "dinero firme"**. Hoy ese filtro es `direction='inflow' AND voided_at IS NULL` y está **duplicado en 14 call sites** (6 de ellos alimentan las 6 métricas de gestión v5.0 que NO deben cambiar de número). La protección es doble: (1) migración `DEFAULT 'validado'` + backfill de todas las filas históricas a `validado` → tras el backfill `validado AND voided IS NULL` ≡ el filtro viejo, los números no se mueven; (2) un test de regresión que carga un PENDIENTE y prueba que summary/saldo y las 6 métricas NO se mueven, y que al validar sí. La distinción conceptual a blindar: un PENDIENTE **salda la deuda del socio** (`balances`, vía `applyDelta` en el create) pero **NO suma a caja firme** (el filtro canónico lo excluye). Son dos vistas distintas del mismo evento.

**Primary recommendation:** Agregar `validation_status mysqlEnum(...) NOT NULL DEFAULT 'validado'` (migración 0153). Centralizar el predicado de dinero firme en **un único helper exportado del módulo finance** (`firmMoneyConditions()` que devuelve `SQL[]`), reusable tanto por los builders de condiciones Drizzle como — vía constante string — por los 3 call sites de SQL crudo. Reescribir los 14 call sites para consumirlo. Reusar `audit-log` (no tabla dedicada). Agregar `validate()`/`observe()`/`correct()` a TransactionService, extender `void()` con `keepMembershipActive`. Resolver rol→status server-side en `create`/`recordAssignmentCharge`. Gate de la fase: el test de regresión de las 6 métricas en verde.

## Architectural Responsibility Map

| Capability                                 | Primary Tier                          | Secondary Tier               | Rationale                                                                        |
| ------------------------------------------ | ------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `validation_status` enum + backfill        | Database / Storage                    | —                            | Columna en `financial_transactions`; migración Drizzle + runner custom           |
| Filtro canónico "dinero firme"             | API / Backend (finance module)        | Database                     | Predicado SQL centralizado en un helper; consumido por reportes/métricas         |
| Transiciones validate/observe/correct/void | API / Backend (TransactionService)    | Database (`balances`, audit) | Lógica de negocio + atomicidad; el ledger es la fuente de verdad                 |
| Rastro de auditoría                        | API / Backend (audit-log helper)      | Database (`audit_log`)       | Forense, write-only, atómico con la mutación                                     |
| Rol→status (profe/admin)                   | API / Backend (route + service)       | —                            | VAL-02: resuelto server-side desde `request.user.role`, nunca confiar en cliente |
| Activación de membresía vs caja firme      | API / Backend (subscriptions/service) | Database (`balances`)        | `applyDelta` salda deuda en create; el filtro de caja excluye PENDIENTE          |

## Standard Stack

**Cero dependencias nuevas.** Decisión del milestone (`.planning/research/modulo-contable/STACK.md`) y verificada contra el código: todo lo necesario ya está instalado y en uso.

### Core (ya presente, se reusa)

| Library                    | Version | Purpose                                                         | Why Standard                                                                                             |
| -------------------------- | ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `drizzle-orm` (mysql-core) | en uso  | `mysqlEnum`, `index`, query builders, `db.transaction`          | Patrón establecido en todo `el-templo-api`; `mysqlEnum` 1er-arg = nombre de columna [VERIFIED: codebase] |
| `drizzle-kit`              | en uso  | `pnpm db:generate`                                              | Genera migration SQL; runner custom la aplica [CITED: CLAUDE.md]                                         |
| `fastify` (Pino)           | en uso  | rutas, `request.user.role`, `request.log`                       | Logging estructurado obligatorio (no `console.log`) [CITED: CLAUDE.md]                                   |
| `vitest`                   | en uso  | integration tests contra MySQL real (`eltemplo_test_<POOL_ID>`) | `test/helpers.ts` provee `createTestApp`, `createStaffUser`, `getAuthToken` [VERIFIED: codebase]         |

**Installation:** N/A — no se instala nada. (Si el planner cree necesitar un paquete, eso viola la decisión de stack del milestone y la regla de proyecto "nunca instalar deps sin preguntar".)

> **Package Legitimacy Audit:** Omitida — esta fase NO instala paquetes externos. Cero dependencias nuevas confirmado contra `package.json` y la decisión de stack del milestone.

## Architecture Patterns

### System Architecture Diagram (flujo de datos de un cobro)

```
                       CARGA DE UN PAGO
  ┌─────────────┐
  │ profe/admin │  request.user.role  (server-side, VAL-02)
  └──────┬──────┘
         │ role → validation_status:  coach→'pendiente'  |  admin/gestion/owner→'validado'
         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  db.transaction(tx)  (atómico — CHARGE-03)                            │
  │                                                                      │
  │  recordAssignmentCharge(tx)  ──►  activa/renueva la SUBSCRIPTION      │ ◄── membresía activa AL INSTANTE (VAL-07)
  │        │                              (status no depende del pago)    │
  │        ▼                                                              │
  │  TransactionService.create(input, recordedBy, tx)                     │
  │        │  INSERT financial_transactions (+ validation_status NUEVO)   │
  │        │  INSERT transaction_links                                    │
  │        ▼                                                              │
  │  BalanceService.applyDelta(tx, row, links, +1)  ──► UPDATE balances   │ ◄── el PENDIENTE YA SALDA la deuda del socio (D-09)
  │        (corre SIEMPRE, independiente de validation_status)            │
  └──────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌───────────────────────────────────────────────┐
  │ READ: filtro canónico "dinero firme"          │
  │   validado AND voided_at IS NULL              │ ◄── PENDIENTE NO suma a caja firme (helper centralizado)
  │   (getSummary + 6 métricas v5.0 + reportes)   │
  └───────────────────────────────────────────────┘

                    TRANSICIONES (admin, con rastro → audit_log)
  validate(id)  : pendiente → validado
  observe(id)   : pendiente → observado
  correct(id)   : void(vieja, status='corregido')  +  create(nueva, status='validado')  + link target_kind='transaction'
  void(id, keepMembershipActive) : setea voided_at  (eje ortogonal; ANULADO)
```

### Pattern 1: Filtro canónico centralizado (helper de "dinero firme")

**What:** Un único punto donde se expresa `direction='inflow' AND voided_at IS NULL AND validation_status='validado'`.
**When to use:** Todo consumidor que cuente ingresos/saldo firme.
**Recomendación de forma (Claude's discretion D-08/helper):** exportar desde `modules/finance/` **dos formas equivalentes** porque hay dos estilos de consumidor en el código:

```typescript
// modules/finance/firm-money.ts  (NUEVO)
// Source: patrón conds[] de transaction-service.ts:772-775
import { and, eq, isNull, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Drizzle conditions for "firm money" (validated, non-voided inflow).
 *  Single source of truth — never inline these predicates again. */
export function firmMoneyConditions(): SQL[] {
  return [
    isNull(schema.financialTransactions.voidedAt),
    eq(schema.financialTransactions.validationStatus, "validado"),
    // NOTE: direction='inflow' stays caller-specific — some call sites
    // already constrain kind IN ('plan_charge','debt_settlement) which is
    // a stricter inflow universe. Audit each (see table). The new predicate
    // these all share is `validation_status='validado'`.
  ];
}

/** Raw-SQL fragment for the 3 call sites that build SQL strings
 *  (analytics/service.ts:543, reports/service.ts:388, reports/service.ts:932). */
export const FIRM_MONEY_SQL = `voided_at IS NULL AND validation_status = 'validado'`;
```

**Key nuance discovered:** the 14 sites are NOT identical. Most pair `voided_at IS NULL` with `kind IN ('plan_charge','debt_settlement')` and `direction='inflow'`. The ONE predicate they ALL must gain going forward is `validation_status='validado'`. So the surgical change at every site is: add `eq(...validationStatus, "validado")` (or `AND validation_status='validado'` in raw SQL) to their existing `conds[]`/WHERE. Centralizing the _full_ firm-money condition into one helper is cleaner long-term, but the **minimal, lowest-risk diff** is to add the single new predicate via a shared constant at each site. Recommend the helper for the finance-module sites and the shared SQL constant for raw-SQL sites; the planner should pick one consistent approach per file.

### Pattern 2: correct() = void + recreate, atómico (D-05)

**What:** Inmutabilidad del ledger — nunca `UPDATE amount`.

```typescript
// Source: void() at transaction-service.ts:239 + create() tx-passthrough at :77
async correct(originalId, correctedFields, adminId): Promise<TransactionDetail> {
  return this.db.transaction(async (tx) => {
    // 1. Soft-void the original, marking it 'corregido' (distinguishes
    //    void-for-correction from void-for-refund). Reuses void() mechanics
    //    inline OR a private _voidWithStatus(tx, ...) helper.
    // 2. create() the new row (born 'validado', admin author) with tx.
    // 3. INSERT transaction_links { transactionId: newId,
    //      targetKind: 'transaction', targetId: originalId } → trail.
    // 4. auditLog.write(tx, { action: 'transaction_corrected', ... }).
  });
}
```

**Critical:** `void()` today opens its OWN `db.transaction` (line 244). For `correct()` to be atomic, extract a private `_void(tx, ...)` that accepts a tx handle (mirror the `create(tx?)` pattern), and have the public `void()` wrap it. Otherwise `correct()` cannot share a transaction with the recreate.

### Pattern 3: Rol → status server-side (VAL-02)

**What:** Derivar `validation_status` del `request.user.role`, nunca del body.

```typescript
// Source: finance/routes.ts:63 (request.user.role available after authenticate)
const initialStatus = COACH_ROLES.includes(request.user.role)
  ? "pendiente"
  : "validado"; // owner/admin/gestion/recepcion
```

**Discovery:** NO existe rol `profe`. El entrenador es `coach`. Y `coach` NO está hoy en `FINANCE_WRITE_ROLES` (owner/admin/gestion/recepcion). La carga de pagos por coach es lo que la **fase 140** habilita (rol profe acotado). En 137 el contrato/derivación debe existir y testearse, pero abrir el endpoint de create al rol coach puede diferirse a 140 — confirmar alcance con el planner. El mapeo correcto: `coach → pendiente`, todo lo demás → `validado`.

### Anti-Patterns to Avoid

- **Colapsar ANULADO dentro del enum `validation_status`.** El brief lo dibuja como un estado más, pero soft-void ya existe y es ortogonal. Un VALIDADO puede luego anularse. Mantener dos ejes. [CITED: PITFALLS.md C-4]
- **Copiar el predicado `validado AND voided IS NULL` en cada query nueva.** Es exactamente la deuda que esta fase viene a pagar. Centralizar. [CITED: PITFALLS.md C-1]
- **`UPDATE` del monto para "corregir".** Viola la inmutabilidad TXN-05. Siempre void+recreate. [CITED: ARCHITECTURE.md, D-05]
- **Hacer que `applyDelta`/`balances` dependa de `validation_status`.** La deuda del socio se salda al cargar (membresía activa), independiente de si la plata es firme en caja. Tocar esto rompe la separación activar≠validar. [VERIFIED: balance-service.ts:81-185]
- **Resolver el status desde el body del request.** VAL-02 exige server-side.

## Don't Hand-Roll

| Problem                      | Don't Build                       | Use Instead                                                                                                          | Why                                                                                                                                                                                |
| ---------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rastro de transiciones       | Tabla `validation_events` nueva   | `auditLog.write(tx, {...})` + nuevos action types                                                                    | DRY, atómico, ya probado por `void()` (D-08). El historial de la bandeja 141 se consulta por `(target_kind='transaction', target_id)` — el índice `idx_audit_log_target` ya existe |
| Reversa de efectos al anular | Lógica nueva de rollback de saldo | `BalanceService.applyDelta(tx, row, links, -1)`                                                                      | `void()` ya lo hace correctamente (transaction-service.ts:276)                                                                                                                     |
| Atomicidad sub+cobro+balance | Nueva transacción manual          | `recordAssignmentCharge(tx)` + `create(input, by, tx)`                                                               | Ya envuelto en una `db.transaction` (CHARGE-03)                                                                                                                                    |
| Link recreada→original       | Schema/tabla nueva                | `transaction_links` con `target_kind='transaction'`                                                                  | Ya existe en el enum (transaction-links.ts:28-33); `applyDelta` lo ignora para balances (balance-service.ts:89) — exactamente lo que querés                                        |
| Backfill de filas históricas | Script ad-hoc post-deploy         | `DEFAULT 'validado'` en la migración (las filas existentes toman el default al agregar columna NOT NULL con default) | Una sola migración, idempotente, corre en CI y prod por el mismo runner                                                                                                            |

**Key insight:** El 90% de 137 es reusar mecanismos existentes con un predicado nuevo. La tentación de "construir el sistema de validación" es la trampa — el sistema ya existe (ledger + void + audit + balance), solo le falta un eje ortogonal y centralizar un filtro.

## Runtime State Inventory

> Esta fase agrega una columna + cambia un filtro canónico. NO es un rename de strings, pero sí toca estado almacenado (la nueva columna y su backfill). Inventario de qué estado runtime se ve afectado:

| Category            | Items Found                                                                                                                                                                      | Action Required                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | `financial_transactions` en prod: TODAS las filas existentes deben quedar `validation_status='validado'` tras la migración (sino desaparecen de los reportes).                   | **Data migration:** `DEFAULT 'validado'` en el `ALTER TABLE ADD COLUMN` backfillea automáticamente las filas existentes. Verificar con un SELECT COUNT post-migración en CI. |
| Live service config | None — no hay configuración de servicio externo (n8n, Datadog, etc.) que referencie el estado de validación. Verificado: es una columna interna nueva.                           | none                                                                                                                                                                         |
| OS-registered state | None — sin tareas programadas/cron que dependan de esta columna en 137. (La alerta de pendientes por antigüedad es fase 141.)                                                    | none                                                                                                                                                                         |
| Secrets/env vars    | None — no se agregan env vars. (Recordatorio CLAUDE.md: si se agregara alguna, actualizar `.env.example` — no aplica aquí.)                                                      | none                                                                                                                                                                         |
| Build artifacts     | Schema TS (`financial-transactions.ts`) + tipos inferidos (`$inferSelect` → `modules/finance/types.ts`). Tras agregar el enum, los tipos downstream lo incluyen automáticamente. | **Code edit:** regenerar nada manual; `tsc` lo propaga. Verificar typecheck local.                                                                                           |

**Migración (datos en prod):** El deploy NO respalda la DB (solo código) — recordatorio de MEMORY.md. Pero esta migración es **aditiva y segura**: agrega una columna con default, no borra ni reescribe datos. El backfill es el propio default. Riesgo de pérdida de datos: nulo. Riesgo de números cambiados en reportes: nulo si el default es `validado` (verificado contra los 14 call sites).

## Common Pitfalls

### Pitfall 1: El filtro canónico está duplicado en 14 lugares (blast radius)

**What goes wrong:** Agregás la columna y cambiás solo `getSummary`; las 6 métricas v5.0 (analytics, LTV, ticket, churn, asistencia) siguen contando con el filtro viejo. Inconsistencia silenciosa: la caja excluye PENDIENTES pero los reportes los incluyen.
**Why it happens:** El predicado `inflow + voided_at IS NULL` nunca se centralizó; cada fase (105, 106, 109, 117-123) lo recopió en su builder de condiciones.
**How to avoid:** Auditar y tocar **los 14 sites** (tabla abajo). Centralizar. Test de regresión que cubra las 6 métricas.
**Warning signs:** Un reporte muestra un total distinto al de la caja para el mismo período; el CI de regresión falla en analytics/ltv/ticket.

### Pitfall 2: `;` dentro de comentarios SQL en la migración

**What goes wrong:** El runner custom (`run-migrations.ts`) splittea por `;` ANTES de strippear `--`, así que un `;` dentro de un comentario rompe la migración.
**Why it happens:** Comentarios explicativos largos en el SQL.
**How to avoid:** Nunca `;` dentro de `-- comentarios`. La migración 0151 usa em-dashes (—) y guiones, sin `;`. Seguir ese estilo. [CITED: MEMORY.md, CLAUDE.md]
**Warning signs:** Migración falla con sintaxis SQL inválida en CI.

### Pitfall 3: `void()` abre su propia transacción → `correct()` no puede ser atómico

**What goes wrong:** Si `correct()` llama al `void()` público (que hace `this.db.transaction(...)`, línea 244) y luego `create()`, son dos transacciones separadas: si el create falla, el void ya commiteó → fila huérfana anulada sin reemplazo.
**Why it happens:** El `void()` actual está diseñado como operación standalone.
**How to avoid:** Extraer `private async _void(tx, id, by, input, statusOverride?)` que reciba el handle; `void()` público lo envuelve en su transacción; `correct()` abre UNA transacción y llama `_void(tx, ...)` + `create(input, by, tx)` + link + audit dentro de ella. Espejo exacto del patrón `create(tx?)`.
**Warning signs:** Test de `correct()` con un create que falla deja la fila vieja anulada.

### Pitfall 4: Abrir el create al rol coach prematuramente

**What goes wrong:** 137 agrega coach a `FINANCE_WRITE_ROLES` para que pueda cargar PENDIENTES, exponiendo el endpoint completo de create (incluido `kind=adjustment` si el guard se relaja mal) sin la UI acotada de la fase 140.
**Why it happens:** VAL-02 menciona "profe carga PENDIENTE" y se confunde con habilitar el rol ya.
**How to avoid:** En 137, implementar y **testear** la derivación rol→status (coach→pendiente) sin necesariamente abrir el endpoint REST al coach. El rol profe acotado + su UI dead-simple es explícitamente fase 140 (ROADMAP). Confirmar con el planner si 137 solo deja el contrato server-side listo o si también abre el guard.
**Warning signs:** Un coach puede crear ajustes o anular por un guard mal ajustado (PITFALLS m-2).

### Pitfall 5: Olvidar que un PENDIENTE debe seguir saldando `balances`

**What goes wrong:** Alguien "protege" la caja firme condicionando `applyDelta` a `validation_status='validado'` → la deuda del socio NO se salda hasta validar → el socio aparece como deudor pese a haber pagado.
**Why it happens:** Mezclar "plata firme en caja" con "deuda del socio".
**How to avoid:** `applyDelta` NO debe conocer `validation_status`. Corre en el create siempre. Solo el filtro de **lectura** de caja firme gatea por validado. Test: cargar PENDIENTE → `balances` baja a 0; summary NO se mueve.
**Warning signs:** Reporte de deudas muestra deudores que ya pagaron (pendientes).

## Code Examples

### Schema: agregar el enum ortogonal

```typescript
// Source: financial-transactions.ts (extend), mirror migration 0151 enum pattern
// Inside financialTransactions table, after voidReason (line ~53):
validationStatus: mysqlEnum("validation_status", [
  "pendiente",
  "observado",
  "corregido",
  "validado",
]).default("validado").notNull(),
// New composite index for the firm-money read path (mirrors idx_financial_tx_kind_voided):
index("idx_financial_tx_validation_voided").on(table.validationStatus, table.voidedAt),
```

### Migración (estilo 0153, sin `;` en comentarios)

```sql
-- Phase 137-01 — validation_status enum (VAL-01, VAL-05)
-- Orthogonal to soft-void. DEFAULT 'validado' backfills existing rows so the
-- 6 v5.0 management metrics keep identical numbers (validado AND voided IS NULL
-- equals the old inflow AND voided IS NULL filter for all historical rows).

ALTER TABLE `financial_transactions`
  ADD COLUMN `validation_status`
  enum('pendiente','observado','corregido','validado')
  NOT NULL DEFAULT 'validado'
  AFTER `void_reason`;

ALTER TABLE `financial_transactions`
  ADD INDEX `idx_financial_tx_validation_voided` (`validation_status`, `voided_at`);
```

> Confirmar el orden exacto del enum byte-a-byte entre schema y migración (lección 125/126: enum drift = CI rojo "Unknown column" que tsc no ve). [CITED: reference_drizzle_enum_column_name.md]

### audit-log: nuevos action types

```typescript
// Source: modules/shared/audit-log.ts:25 (AuditAction union)
export type AuditAction =
  | "subscription_cancelled"
  | "transaction_voided"
  | "plan_assigned"
  | "reconciliation"
  | "days_compensated"
  | "transaction_validated" // NEW (D-08)
  | "transaction_observed" // NEW
  | "transaction_corrected"; // NEW
// targetKind 'transaction' already exists in AuditTargetKind — no change there.
```

### Test de regresión (gate de la fase — VAL-05)

```typescript
// Source: test/finance/summary-sanity.test.ts pattern + helpers.ts
// R1: cargar un PENDIENTE no mueve summary ni saldo de caja.
// R2: validar ese pago SÍ lo suma.
// R3: las 6 métricas v5.0 dan los mismos números antes/después del backfill
//     (cargar todo VALIDADO → assert == baseline pre-137).
// R4: un PENDIENTE SÍ salda balances del socio (deuda → 0) aunque no sea caja firme.
// Use createStaffUser({role:'admin'|'coach'}), createTestMember, assignTestPlan,
// getAuthToken; runs against eltemplo_test_<POOL_ID>.
```

## State of the Art

| Old Approach                                                  | Current Approach                                                     | When Changed                         | Impact                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| Toda transacción nace "firme" (cuenta como plata al insertar) | `validation_status` ortogonal; firme = `validado AND voided IS NULL` | Fase 137 (esta)                      | Un PENDIENTE no cuenta hasta validar; requiere centralizar el filtro |
| Filtro `inflow + voided IS NULL` copiado en cada query        | Helper canónico único                                                | Fase 137                             | Elimina la duplicación de 14 sites                                   |
| ANULADO conceptualmente "un estado del pago" (brief)          | ANULADO = `voided_at IS NOT NULL`, eje separado del enum             | Decidido en 137 (D-05, PITFALLS C-4) | No se reescribe `void()`                                             |

**Deprecated/outdated:** Ninguna API nueva del ecosistema; todo es código interno. El brief dibuja ANULADO dentro de la máquina de estados — esa representación se descarta a favor de dos ejes ortogonales (decisión de arquitectura, no del ecosistema).

## Assumptions Log

| #   | Claim                                                                                                                                                    | Section            | Risk if Wrong                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | El rol que cargará PENDIENTES es `coach` (no existe rol `profe`); el rol profe acotado se introduce en fase 140.                                         | Pattern 3 / VAL-02 | Si Franco quiere un rol `profe` distinto de `coach`, hay que extender el enum de roles — pero eso es scope de 140, no 137. 137 solo deja la derivación rol→status. Confirmar en discuss/plan. |
| A2  | 137 NO necesita abrir el endpoint de create al rol coach (solo deja el contrato server-side); la apertura del rol + UI es 140.                           | Pitfall 4          | Si 137 debe permitir que un coach cargue por REST ya, hay que tocar `FINANCE_WRITE_ROLES` y los guards con cuidado (no exponer adjustment/void).                                              |
| A3  | `correct()` copia los campos del original y aplica el override del dato corregido; el "dato corregido" típico es `amount`, `memberId` o `paymentMethod`. | Pattern 2          | Si el set de campos corregibles es más amplio (ej. branchId, links), la firma de `correct()` cambia. Discreción de Claude (CONTEXT.md) — definir en plan.                                     |
| A4  | El backfill `DEFAULT 'validado'` deja las 6 métricas idénticas porque ninguna fila histórica es no-validada.                                             | Summary / VAL-05   | VERIFIED por construcción (todas las filas existentes son firmes hoy). Riesgo nulo salvo que exista lógica que ya escriba un status — no existe.                                              |

**Nota:** A1-A3 son las únicas asunciones que requieren confirmación del usuario/planner. A4 está verificada.

## Open Questions

1. **¿137 abre el create al rol coach o solo deja el contrato?**
   - What we know: VAL-02 exige la derivación server-side; el rol profe acotado + UI es fase 140 (ROADMAP).
   - What's unclear: si en 137 ya debe poder un coach POSTear un pago vía REST.
   - Recommendation: implementar y testear la derivación rol→status en `create`/`recordAssignmentCharge`; NO tocar `FINANCE_WRITE_ROLES` en 137 (diferir la apertura a 140). Confirmar en plan-phase.

2. **¿`correct()` qué campos permite corregir?**
   - What we know: D-05 = void+recreate; el original se copia y se sobrescribe el dato errado.
   - What's unclear: el set exacto de campos corregibles (amount/member/method vs todo).
   - Recommendation: empezar con amount + memberId + paymentMethod (los errores típicos del brief); el resto se copia del original. Discreción de Claude.

3. **¿`keepMembershipActive` en 137 hace algo o es solo el parámetro?**
   - What we know: D-10 = contrato backend default true; el popup es UI posterior.
   - What's unclear: si al anular con `keepMembershipActive=false` 137 ya debe cancelar la sub.
   - Recommendation: implementar la rama backend (si false → cancelar sub asociada dentro de la misma tx) y testear ambas; el popup que la expone es UI futura. Confirmar si la cancelación de sub entra en 137.

## Environment Availability

| Dependency                         | Required By        | Available                             | Version            | Fallback                                                          |
| ---------------------------------- | ------------------ | ------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| MySQL (`eltemplo_test_<POOL_ID>`)  | Integration tests  | ✓ (asumido — usado por toda la suite) | —                  | Tests corren en CI al pushear a staging (no local, per MEMORY.md) |
| `pnpm db:generate` / runner custom | Migración 0153     | ✓                                     | drizzle-kit en uso | —                                                                 |
| `tsc` (typecheck)                  | Verificación local | ✓                                     | en uso             | typecheck local sí se corre (MEMORY.md)                           |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Suite de tests completa corre en CI, no localmente (MEMORY.md: "No correr el suite de tests local"). Typecheck local sí.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Framework          | vitest (en uso)                                                                       |
| Config file        | `el-templo-api/vitest.config.*` (presente; la suite ya corre)                         |
| Quick run command  | `cd el-templo-api && pnpm test -- test/finance/<file>.test.ts` (típico vitest filter) |
| Full suite command | `cd el-templo-api && pnpm test` (corre en CI al pushear a staging)                    |

### Phase Requirements → Test Map

| Req ID | Behavior                                                                         | Test Type   | Automated Command                                                                                          | File Exists?                                               |
| ------ | -------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| VAL-01 | enum coexiste con soft-void; un validado se puede anular                         | integration | `pnpm test -- test/finance/validation-state.test.ts`                                                       | ❌ Wave 0                                                  |
| VAL-02 | coach→pendiente, admin→validado (server-side)                                    | integration | idem                                                                                                       | ❌ Wave 0                                                  |
| VAL-03 | validate() pasa pendiente→validado y suma a firme                                | integration | idem                                                                                                       | ❌ Wave 0                                                  |
| VAL-04 | observe()+correct() (void+recreate, link transaction)                            | integration | idem                                                                                                       | ❌ Wave 0                                                  |
| VAL-05 | **regresión: PENDIENTE no mueve summary/6 métricas; backfill validado idéntico** | integration | `pnpm test -- test/finance/validation-regression.test.ts` + suites analytics/ltv/ticket/reports existentes | ❌ Wave 0 (regresión nueva) / ✅ (suites métricas existen) |
| VAL-06 | solo admin anula (motivo+autor+fecha); keepMembershipActive                      | integration | `test/finance/validation-state.test.ts`                                                                    | ❌ Wave 0                                                  |
| VAL-07 | membresía activa al instante; PENDIENTE salda balances                           | integration | reusa `test/subscriptions/charge-on-assign.test.ts` pattern                                                | ❌ Wave 0                                                  |

### Sampling Rate

- **Per task commit:** `pnpm test -- test/finance/validation-state.test.ts` (typecheck local siempre)
- **Per wave merge:** `pnpm test -- test/finance test/analytics test/reports test/subscriptions`
- **Phase gate:** suite completa verde en CI (incluye las 6 métricas v5.0 sin cambios de número) antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/finance/validation-state.test.ts` — transiciones validate/observe/correct/void + RBAC (VAL-01..04, 06)
- [ ] `test/finance/validation-regression.test.ts` — PENDIENTE no mueve summary/saldo; balances sí; 6 métricas idénticas (VAL-05, VAL-07)
- [ ] Confirmar que las suites existentes (`test/analytics/*`, `test/reports/*`, `test/finance/summary-*`) pasan SIN cambios tras el backfill (son el guard de regresión real)
- Framework install: none — vitest ya configurado.

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                               | Standard Control                                                                                                                                                                          |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes                                   | `fastify.authenticate` (onRequest hook, finance/routes.ts:61) — ya presente                                                                                                               |
| V3 Session Management | no (delegado al middleware existente) | —                                                                                                                                                                                         |
| V4 Access Control     | **yes (central)**                     | RBAC por rol: `FINANCE_VOID_ROLES` (anular = owner/admin/gestion), derivación rol→status server-side. **VAL-02/VAL-06 son controles de acceso.** No confiar en el cliente para rol/status |
| V5 Input Validation   | yes                                   | JSON schema de Fastify (finance/schemas.ts) para los nuevos endpoints validate/observe/correct; reason requerido en void/correct                                                          |
| V6 Cryptography       | no                                    | —                                                                                                                                                                                         |
| V7 Audit Logging      | **yes**                               | `audit_log` write-only, atómico (fase 111); cada transición deja actor+fecha+motivo (D-07). Nunca borrar filas                                                                            |

### Known Threat Patterns for {Fastify + Drizzle + MySQL, finance}

| Pattern                                                                   | STRIDE                 | Standard Mitigation                                                                                                                            |
| ------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Coach/profe valida o anula su propia carga (escalada)                     | Elevation of Privilege | Derivación rol→status server-side; `FINANCE_VOID_ROLES` excluye coach/recepcion; testear que coach NO puede validate/void (m-2)                |
| Cliente envía `validation_status='validado'` en el body para auto-validar | Tampering / Spoofing   | NUNCA leer status del body; derivar del `request.user.role` autenticado (VAL-02)                                                               |
| Activar membresía sin pago real (abuso del PENDIENTE)                     | Repudiation            | `recordedBy` siempre con el usuario real; rastro en audit_log; lista de pendientes por antigüedad (fase 141)                                   |
| Repudio de quién validó/anuló                                             | Repudiation            | `actorId` desde el principal autenticado en cada `auditLog.write` (T-111-07)                                                                   |
| SQL injection en los call sites de SQL crudo (analytics/reports)          | Tampering              | Predicados parametrizados de Drizzle; el `FIRM_MONEY_SQL` es una constante estática sin interpolación de input de usuario                      |
| Cross-currency leak en el filtro firme                                    | Tampering              | El filtro firme NO cambia el aislamiento de moneda existente; las métricas ya separan ARS/EUR (no aplica directamente a 137, pero no romperlo) |

---

## CALL-SITE AUDIT (la sección más valiosa — blast radius del filtro canónico)

> Inventario **exhaustivo** del predicado de "dinero firme" / agregación de ingresos sobre `financial_transactions`. Obtenido por grep de `voidedAt`/`isNull(...voidedAt)`/`direction='inflow'`/`SUM(...amount)` en `modules/` (excluyendo tests). 14 sites confirmados.
>
> **Regla de clasificación:** Tras el backfill `DEFAULT 'validado'`, TODO site que cuente ingresos/saldo firme debe ganar el predicado `validation_status='validado'` — los números NO cambian (todas las filas históricas son validadas), pero a futuro un PENDIENTE quedará correctamente excluido. **Los 14 sites necesitan el predicado.** La razón: si un site NO lo gana, un PENDIENTE futuro contaría como plata firme en ese reporte → inconsistencia con la caja. Las "6 métricas v5.0" son un subconjunto de estos sites y su invariante es que el NÚMERO no cambie (garantizado por el backfill), no que se las exima del predicado.

| #   | File:Line                                   | Method / Purpose                                                            | Current predicate                                                       | Needs `validado`? | Rationale / es métrica v5.0?                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | :---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `finance/transaction-service.ts:772-775`    | `getSummary` (CajaPage cards: monthlyRevenue, byMethod, byBranch, byKind)   | `direction='inflow' AND voided_at IS NULL`                              |      **SÍ**       | Caja firme v4.8. Es el site canónico del brief. Insertar `validation_status='validado'` aquí primero (D-09).                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | `analytics/ticket-service.ts:437`           | `linkedCharges` (ticket promedio — plan_charge linkeados a sub)             | `voided_at IS NULL` + `kind='plan_charge'`                              |      **SÍ**       | **Métrica v5.0 (ticket).** Backfill mantiene el número.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | `analytics/ticket-service.ts:522`           | `universeCountByCurrency` (universo de plan_charges para excludedNoLink)    | `voided_at IS NULL` + `kind='plan_charge'`                              |      **SÍ**       | **Métrica v5.0 (ticket).** Mismo filtro canónico.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | `analytics/ltv-service.ts:286`              | `realPaymentsByMember` (LTV — pagos reales por socio)                       | `voided_at IS NULL` + `kind IN(plan_charge,...)`                        |      **SÍ**       | **Métrica v5.0 (LTV).**                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | `analytics/service.ts:1048`                 | `getRevenueTrend` (tendencia de ingresos por mes/moneda)                    | `voided_at IS NULL` + `kind IN(...)` + `inflow`                         |      **SÍ**       | **Métrica v5.0 (ingresos).**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | `analytics/service.ts:1118`                 | `getRevenueByMethod` (ingresos por medio de pago)                           | `voided_at IS NULL` + `kind IN(...)` + `inflow`                         |      **SÍ**       | **Métrica v5.0 (ingresos).**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | `analytics/service.ts:1181`                 | `getRevenueByBranch` (ingresos por sucursal)                                | `voided_at IS NULL` + `kind IN(...)` + `inflow`                         |      **SÍ**       | **Métrica v5.0 (ingresos).**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | `analytics/service.ts:1307`                 | `sumRevenue` (total de ingresos por moneda)                                 | `voided_at IS NULL` + `kind IN(...)` + `inflow`                         |      **SÍ**       | **Métrica v5.0 (ingresos).**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | `analytics/service.ts:543`                  | `getAttentionList` → `yaPagoExpr` (EXISTS de pago reciente) **[SQL crudo]** | `voided_at IS NULL AND direction='inflow' AND kind='plan_charge'`       |      **SÍ**       | Lista de atención. Es un EXISTS booleano: un PENDIENTE NO debería marcar "ya pagó" como firme. Usar `FIRM_MONEY_SQL`.                                                                                                                                                                                                                                                                                                                                                           |
| 10  | `analytics/advanced-finance-service.ts:187` | `cashTrend` (CAJA — tendencia de caja por mes/moneda)                       | `voided_at IS NULL` + `kind IN(plan_charge,debt_settlement)` + `inflow` |      **SÍ**       | **Métrica v5.0 (caja avanzada).**                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 11  | `reports/service.ts:388`                    | charge-history listing (raw SQL) **[SQL crudo]**                            | `kind IN(...) AND direction='inflow' AND voided_at IS NULL`             |      **SÍ**       | Reporte de cobros. Un PENDIENTE no es un cobro firme. Usar `FIRM_MONEY_SQL`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 12  | `reports/service.ts:932`                    | trial→conversion revenue subquery (raw SQL) **[SQL crudo]**                 | `voided_at IS NULL AND direction='inflow' AND kind IN(...)`             |      **SÍ**       | Revenue de conversión de trials. Coherencia con ingresos firmes.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | `reports/service.ts:1793`                   | `buildChargeConditions` (Drizzle, charge report)                            | `kind IN(...) AND direction='inflow' AND voided_at IS NULL`             |      **SÍ**       | Reporte de cobros (builder Drizzle).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 14  | `subscriptions/service.ts:2127`             | guard "sub tiene cobros activos antes de cancelar"                          | `voided_at IS NULL` (sobre links de la sub)                             |    **DECIDIR**    | **CASO ESPECIAL.** Este NO es un filtro de "ingresos firmes" — chequea si hay transacciones de cobro vivas (no anuladas) ligadas a una sub para impedir cancelarla sin anularlas. Un PENDIENTE ES un cobro vivo (membresía activa). **Recomendación: NO agregar `validado` aquí** — un PENDIENTE debe seguir bloqueando la cancelación (sino se cancela una sub con un cobro pendiente sin anular). Documentar explícitamente que este site queda con `voided_at IS NULL` solo. |

### Resumen de la auditoría

- **13 de 14 sites** ganan el predicado `validation_status='validado'`. Tras el backfill, los números no cambian; a futuro excluyen PENDIENTES correctamente.
- **1 site (subscriptions/service.ts:2127)** es un guard de integridad, NO un filtro de ingresos. **Recomendación firme: dejarlo en `voided_at IS NULL` solo** (un PENDIENTE debe seguir contando como "cobro vivo" que bloquea la cancelación). El planner debe documentar esta excepción explícitamente para que el plan-checker no la marque como olvido.
- **3 sites usan SQL crudo** (#9, #11, #12) → consumen la constante `FIRM_MONEY_SQL`, no el helper Drizzle.
- **11 sites usan builders Drizzle** → consumen `firmMoneyConditions()` o, mínimo, añaden `eq(...validationStatus,'validado')` a su `conds[]`.
- **Las 6 métricas de gestión v5.0** = sites #2-#8 + #10 (analytics/ticket/ltv/advanced-finance). Su invariante VAL-05: número idéntico antes/después. Garantizado por el backfill; **probado** por correr las suites `test/analytics/*` + `test/reports/*` existentes sin cambios.

## Sources

### Primary (HIGH confidence)

- Codebase reads — `el-templo-api/src/db/schema/financial-transactions.ts`, `audit-log.ts`, `transaction-links.ts`; `modules/finance/{transaction-service,balance-service,routes}.ts`; `modules/shared/{audit-log,permissions}.ts`; `modules/subscriptions/service.ts:248-334,2118-2145`; the 14 call sites (analytics/ticket/ltv/advanced-finance, reports, subscriptions).
- `grep` blast-radius inventory across `modules/` for `voidedAt`/`isNull(voidedAt)`/`direction='inflow'`/`SUM(amount)` — 14 sites confirmed exhaustively.
- Migration `0151_attendance_label_enum.sql` (enum-alter format precedent); next migration number confirmed = **0153** (last is 0152).
- `.planning/research/modulo-contable/ARCHITECTURE.md` + `PITFALLS.md` (milestone design, HIGH confidence, anchored in same code reads).
- `.planning/REQUIREMENTS.md` (VAL-01..VAL-07 verbatim), `.planning/ROADMAP.md` §137-142, `137-CONTEXT.md` (D-01..D-10).

### Secondary (MEDIUM confidence)

- `BRIEF-MODULO-CONTABLE-FRANCO.md` (vision/design intent; some assumptions superseded by code reality, e.g. ANULADO as orthogonal axis).

### Tertiary (LOW confidence)

- None — all claims anchored in code or project docs.

## Project Constraints (from CLAUDE.md)

- **Logging:** API usa Pino (`request.log`, `app.log`). Nunca `console.log`.
- **TypeScript:** Sin `any`. `catch (err: unknown)` con `instanceof Error`.
- **API Tests:** Toda ruta nueva (validate/observe/correct) requiere integration tests en `test/`, contra MySQL real (`eltemplo_test`). Ver `test/helpers.ts`.
- **DB:** Schema vía Drizzle (`src/db/schema/`); `pnpm db:generate`; aplicar con runner custom (`run-migrations.ts`, tabla `_migrations`). **Nunca** `drizzle-kit migrate`. **Commitear el SQL** junto al schema.
- **Nunca `;` dentro de comentarios SQL** en migraciones (runner splittea por `;` antes de strippear `--`). [MEMORY.md]
- **Env vars:** si se agrega alguna, actualizar `.env.example` (no aplica en 137).
- **Patterns:** facade para servicios complejos (edit-service → domain services); Sentry para errores.
- **Staging-first STRICT:** nunca mergear a master directo; trabajo en branches locales. Pedir antes de pushear. [MEMORY.md]
- **No correr suite local:** typecheck local sí; tests corren en CI al pushear a staging. [MEMORY.md]
- **Nunca instalar/actualizar deps sin preguntar** (esta fase no instala nada). [MEMORY.md]
- **Commitear siempre el SQL de migración** junto al schema (executors lo olvidan). [MEMORY.md]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — cero deps nuevas, verificado contra package.json y decisión de milestone.
- Architecture (helper canónico + dos ejes ortogonales + reuso de audit/balance): HIGH — anclado en lectura directa de transaction-service, balance-service, audit-log.
- Call-site audit: HIGH — grep exhaustivo + lectura de contexto de los 14 sites; la única ambigüedad es el guard #2127 (recomendación documentada, no incertidumbre técnica).
- Pitfalls: HIGH — todos anclados en código (void() abre su propia tx, applyDelta ignora status, `;` en comentarios, rol coach≠profe).
- Open questions (alcance del rol coach en 137, campos de correct(), rama de keepMembershipActive): MEDIUM — son decisiones de scope para el planner, no gaps de conocimiento.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (estable — código interno, sin dependencias de ecosistema de movimiento rápido; revalidar solo si cambia el schema de finance antes de planear).
