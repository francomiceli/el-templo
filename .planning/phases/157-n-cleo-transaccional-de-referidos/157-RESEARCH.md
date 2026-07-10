# Phase 157: Núcleo transaccional de referidos - Research

**Researched:** 2026-07-10
**Domain:** Backend transaccional (Fastify + Drizzle + MySQL) — schema/migración, atribución doble canal, hook de cualificación y cómputo de descuento en el motor de cobros; toques mínimos de frontend (RegisterPage `?ref`, campo de alta admin).
**Confidence:** HIGH (código verificado en el árbol actual; las ambigüedades de diseño están explícitamente marcadas como decisiones abiertas)

## Summary

Este es un feature **brownfield de integración**, no greenfield: casi todo se monta sobre infraestructura ya existente y verificada en el código. No requiere paquetes nuevos. El grueso del trabajo es (1) schema+migración (`users.referralCode`/`referredBy`, tabla `referrals`, tabla `referral_credits`, seed de config), (2) atribución por dos canales que ambos escriben `users.referredBy`, y (3) un hook en el **motor de cobros** que cualifica el vínculo al primer pago y computa un descuento simétrico condicional.

El hallazgo más importante — y la corrección más grande respecto del CONTEXT.md (gathered 2026-07-02, pre-v5.4) — es que **hay CUATRO caminos de cobro**, no solo `assignPlan`: `assignPlan`, `renewSubscription`, `changePlanNow` y `changePlanAfterCurrent`, todos convergen en `recordAssignmentCharge`. DESC-03 dice "en cada cobro", así que el cómputo del descuento debe vivir en un **helper compartido** invocado por los cuatro caminos, no solo en `assignPlan`. Además la PoS del profe (coach-load-routes) y el alta admin con plan (createMember→assignPlan) ya pasan por `SubscriptionService`, así que el descuento fluye automáticamente si se lo pone en el service.

Hay tres tensiones de diseño reales que el planner/discuss deben resolver antes de ejecutar (detalladas en Open Questions): (a) `aura_config.defaultAmount` es **un solo escalar** y no puede sostener las dos perillas (%-por-vínculo + tope); (b) las columnas `auraDiscount`/`auraDiscountPercent` de `subscriptions` **ya las usa** el flujo de gasto de AURA discrecional — reusarlas para referidos colisiona; (c) el `AuraService` **no tiene** un método para anotar en `aura_transactions` sin inflar el balance (`award` lo infla, `spend` lo decrementa) — por eso D-18 (tabla dedicada `referral_credits`) es correcto y la anotación en `aura_transactions` debe ser un INSERT directo o no hacerse.

**Primary recommendation:** Modelar `referrals` + `referral_credits` como fuente de verdad, poner el cómputo del descuento en un helper compartido llamado por los 4 charge-paths + `getPricingPreview`, disparar la cualificación cuando el pagador tiene `referredBy` con vínculo `pending` y `pricePaid > 0`, y usar columnas **nuevas** `referralDiscountPercent`/`referralDiscountAmount` en `subscriptions` para no colisionar con el gasto de AURA discrecional. Migración numerada **0176+** (master está en 0175 — este branch está atrás).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mecánica del vínculo (cerrado en el brief, NO re-preguntar):**

- **D-01 (Trigger):** la recompensa se libera cuando el referido paga su primera suscripción, NO al registrarse. Hook en `assignPlan`.
- **D-02 (Double-sided simétrico):** un vínculo `qualified` otorga el mismo % de descuento a ambas partes (referidor y referido).
- **D-03 (Recurrente sin tope temporal):** el descuento persiste mes a mes indefinidamente mientras el vínculo siga activo; no vence por tiempo.
- **D-04 (Acumula con tope):** múltiples vínculos activos suman descuento hasta un máximo configurable.
- **D-05 (No-discrecional):** el descuento se auto-aplica en el cobro; el socio NO administra ni decide cuándo usarlo.
- **D-06 (AURA = anotación interna):** cada descuento aplicado se registra con `sourceType:"referral"` para trazabilidad, SIN inflar el saldo AURA gastable.
- **D-07 (Magnitud = % del plan):** el descuento se expresa como porcentaje del precio del plan (reusa `auraDiscountPercent`).
- **D-08 (Atribución doble canal):** self-service `?ref=CODE` + asistido en el alta. Ambos escriben `users.referredBy`.

**Zonas grises resueltas en la discusión (2026-07-02):**

- **D-09 (Definición de "activo"):** una parte cuenta como activa si su cobertura está vigente = `deriveCoveredUntil(db, userId) >= hoy` (helper único de fase 144). NO usar `users.status`. Al cobrar la cuota de X, para cada vínculo `qualified` se evalúa la cobertura vigente de la contraparte.
- **D-10 (Caída de contraparte = suspende, reactivable):** el vínculo `qualified` es permanente; el descuento se recomputa dinámicamente en cada cobro. Si una parte se cae, el descuento se suspende ese ciclo; si vuelve a estar al día, se reactiva. NO se revoca (salvo fraude/acción manual).
- **D-11 (Ventana de cualificación = sin límite):** el referido cuenta cuando pague su 1er plan, sin importar cuánto tarde desde el registro. El trigger de pago (D-01) ya es la barrera antifraude.
- **D-12 (Calibración = config ajustable):** sembrar en `aura_config` (fila `referral`): 10% por vínculo activo, tope 40%. Valores ajustables sin deploy.

**Antifraude (del brief):**

- **D-13:** impedir auto-referido (`referrerId != referredId`).
- **D-14:** cada nuevo miembro tiene a lo sumo un referidor (`referrals.referredId` UNIQUE). Un referidor SÍ puede traer muchos referidos.
- **D-15:** respetar el dedup por DNI existente (fase 148) al crear/atribuir.

### Claude's Discretion

- **D-16 (Formato del código de referido):** derivado legible tipo `FRAN-A3B2` (prefijo del nombre + sufijo aleatorio único). Único por socio.
- **D-17 (Backfill de códigos):** generación lazy (se crea al primer acceso/compartir) + un script de backfill disponible. NO generar ~2000 en la migración.
- **D-18 (Almacenamiento del registro AURA):** tabla dedicada `referral_credits` (más limpia y auditable) en vez de netear award+spend en `aura_transactions`. El researcher/planner define el esquema exacto y cómo se relaciona con `financial_transactions.paymentMethod:"aura_credit"`.

### Deferred Ideas (OUT OF SCOPE)

- **Fase 158 (v5.5):** pantalla "Mis referidos" (estado por vínculo + descuento vigente), notificaciones (vínculo activado / descuento por caerse), panel admin de referidos.
- **Categoría de notificación** (`motivacion` vs nueva `referidos`) → se decide en la fase 158.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                          | Research Support                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REF-01  | Cada socio tiene un código de referido único + link `?ref=CODE`      | Nueva columna `users.referralCode varchar(16) UNIQUE`; generación lazy (D-17); patrón de código único ya existe en `promo-plans.ts` (referencia, no reusar).                                                          |
| REF-02  | Registro self-service con `?ref=CODE` queda atribuido                | `RegisterPage.vue:213` ya lee `route.query.promo` → clonar para `?ref`; `POST /register` (`auth/routes.ts:43`) ya procesa `promoCode` → agregar resolución de `?ref` → `users.referredBy` + fila `referrals`.         |
| REF-03  | Recepción/gestión/profe atribuye al dar el alta ("¿Quién lo trajo?") | `MemberFormDialog.vue` (alta admin) + `createMember` (`members/service.ts:669`) escriben `referredBy`; PoS profe (`coach-load-routes.ts`) y createMember→assignPlan (`members/routes.ts:637`) ya crean alumno+plan.   |
| REF-04  | Impedir auto-referido + un solo referidor + dedup DNI                | Constraint `referredId UNIQUE` en `referrals`; check `referrerId != referredId`; dedup DNI ya existe en register (`auth/routes.ts:75`) y en createMember.                                                             |
| DESC-01 | Primer pago del referido → `qualified`                               | Hook en el motor de cobros: cuando el pagador tiene `referredBy` con vínculo `pending` y `pricePaid > 0`, marcar `qualified`+`qualifiedAt`. Ver Open Question #4 (umbral de "pago").                                  |
| DESC-02 | Vínculo `qualified` → % simétrico a ambas partes                     | Query bidireccional en `referrals` (X como `referrerId` OR `referredId`), status `qualified`.                                                                                                                         |
| DESC-03 | Descuento evaluado en cada cobro; suspende/reactiva                  | **CRÍTICO: 4 charge-paths** (`assignPlan`/`renewSubscription`/`changePlanNow`/`changePlanAfterCurrent`) — helper compartido + `deriveCoveredUntil` de la contraparte.                                                 |
| DESC-04 | Múltiples vínculos acumulan hasta tope                               | `Math.min(nActivos * percentPerLink, maxPercent)`.                                                                                                                                                                    |
| DESC-05 | No-discrecional, auto-aplica                                         | Se computa server-side en el cobro; el socio no lo pide (a diferencia de `input.auraSpend`).                                                                                                                          |
| AURA-01 | Anotación `sourceType:"referral"` sin inflar balance                 | INSERT directo en `aura_transactions` (NO `AuraService.award()` — infla balance) y/o fila `referral_credits`. Idempotencia por `unique_user_source_ref` con `referenceId` = subscriptionId del cobro (NO referralId). |
| AURA-02 | Magnitud parametrizada en `aura_config` (fila `referral`)            | **TENSIÓN: `aura_config.defaultAmount` es un solo escalar** — no sostiene %+tope. Ver Open Question #1.                                                                                                               |

</phase_requirements>

## Architectural Responsibility Map

| Capability                             | Primary Tier                | Secondary Tier                  | Rationale                                                                                                             |
| -------------------------------------- | --------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Generación de código de referido       | API / Backend               | Database                        | Único por socio, lazy; unicidad garantizada en DB (UNIQUE).                                                           |
| Atribución self-service `?ref`         | Browser (RegisterPage)      | API (`/register`)               | El browser lee la query y la manda en el body; la resolución código→userId es server-side (no confiar en el cliente). |
| Atribución asistida "¿Quién lo trajo?" | Admin frontend              | API (`createMember`)            | El operador elige el referidor; el server valida y escribe `referredBy`.                                              |
| Cualificación (1er pago → `qualified`) | API (subscriptions service) | Database                        | Regla de negocio disparada en el motor de cobros.                                                                     |
| Cómputo del descuento simétrico        | API (subscriptions service) | Database (`deriveCoveredUntil`) | Debe ser server-side y no-discrecional (D-05); lee `referrals` + cobertura.                                           |
| Anotación AURA / `referral_credits`    | API (subscriptions service) | Database                        | Trazabilidad; escritura en la misma tx del cobro.                                                                     |
| Config (% por vínculo + tope)          | Database (seed)             | API (lectura con fallback)      | Ajustable sin deploy (D-12); precedente `system_settings` (finance).                                                  |

## Standard Stack

**No se introducen paquetes nuevos.** El feature usa exclusivamente el stack ya presente y verificado:

### Core

| Library        | Version        | Purpose                                    | Why Standard                                                              |
| -------------- | -------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Fastify        | (ya instalado) | Rutas API (`/register`, members)           | Framework backend del repo.                                               |
| Drizzle ORM    | (ya instalado) | Schema + queries MySQL                     | ORM del repo; migraciones hand-written (skill `el-templo-db-migrations`). |
| mysql2         | (ya instalado) | Driver + transacciones                     | Usado por `AuraService`/`SubscriptionService`.                            |
| Vue 3 + Quasar | (ya instalado) | `RegisterPage.vue`, `MemberFormDialog.vue` | Frontend app+admin.                                                       |
| vitest         | ^4.0.18        | Tests de integración contra MySQL real     | `pnpm test` (corre en CI).                                                |

**Installation:** ninguna. `[VERIFIED: package.json + árbol de código]`

## Package Legitimacy Audit

**No aplica** — esta fase no instala ningún paquete externo. Todo el trabajo usa dependencias ya presentes en el monorepo. `[VERIFIED: no npm install en el scope]`

## Runtime State Inventory

> Esta es una fase mayormente aditiva (nuevas tablas/columnas), pero toca el registro y el motor de cobros. Inventario de estado runtime que un grep de archivos NO detecta:

| Category            | Items Found                                                                                                                                                              | Action Required                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Stored data         | **Ningún socio existente tiene `referralCode`** (columna nueva) ni filas `referrals`. Los ~2000 socios de prod quedan sin código hasta backfill (D-17).                  | Ninguna en la migración (D-17 = lazy + script aparte). NO generar en la migración. |
| Live service config | Fila `referral` en `aura_config` **no existe** (el enum reserva el valor pero no hay fila sembrada). El tope de % no tiene dónde vivir aún (ver OQ#1).                   | Seed en migración (INSERT idempotente `WHERE NOT EXISTS`).                         |
| OS-registered state | Ninguno — no hay cron/task nuevo. El descuento se computa on-demand en el cobro, no por cron. `deriveCoveredUntil` NO es cron-derivado (a diferencia de `users.status`). | Ninguna.                                                                           |
| Secrets/env vars    | Ninguno nuevo.                                                                                                                                                           | Ninguna.                                                                           |
| Build artifacts     | Nueva tabla en schema → exportar en `src/db/schema/index.ts` (si no, los tipos no compilan y las queries no resuelven).                                                  | Agregar `export * from "./referrals"` + `./referral-credits` en `index.ts`.        |

**Backfill de códigos (D-17):** el script de backfill es **prod data change** → debe ir por migración O por script ad-hoc SSH-guarded contra `eltemplo`/`eltemplo_staging` (skill `el-templo-db-migrations`, "shared-host trap"). NO re-seed. Recomendación: script idempotente separado, disparable a demanda, NO en la migración de schema (evita generar 2000 códigos en el deploy).

## Architecture Patterns

### System Architecture Diagram

```
ATRIBUCIÓN (escribe users.referredBy + crea referrals[status=pending])
┌─ Canal 1: self-service ─────────────────────────────────────────┐
│  RegisterPage.vue (?ref=CODE en query)                           │
│     └─> POST /register  ──resuelve código→referrerId──> INSERT   │
│         (auth/routes.ts)   valida !=self, referredId no reclamado │
├─ Canal 2: asistido ─────────────────────────────────────────────┤
│  MemberFormDialog.vue ("¿Quién lo trajo?" busca por nombre/DNI)   │
│     └─> POST /members (createMember) ──> escribe referredBy       │
│         + PoS profe (coach-load-routes) / createMember→assignPlan │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
CUALIFICACIÓN + DESCUENTO (motor de cobros — subscriptions/service.ts)
┌──────────────────────────────────────────────────────────────────┐
│  assignPlan / renewSubscription / changePlanNow /                 │
│  changePlanAfterCurrent   (LOS 4 pasan por recordAssignmentCharge)│
│                                                                    │
│  [PASO A — cualificar]  si payer.referredBy tiene vínculo         │
│     pending Y pricePaid>0  ──> UPDATE referrals SET qualified     │
│                                                                    │
│  [PASO B — computar descuento]  computeReferralDiscount(payer):   │
│     SELECT referrals WHERE (referrerId=X OR referredId=X)         │
│            AND status='qualified'                                  │
│     para cada vínculo: deriveCoveredUntil(contraparte) >= hoy ?   │
│     nActivos * percentPerLink, topeado a maxPercent               │
│     ──> reduce pricePaid  ──> recordAssignmentCharge cobra menos  │
│                                                                    │
│  [PASO C — anotar]  INSERT referral_credits (subId, %, monto)     │
│     + (opc) INSERT aura_transactions sourceType='referral'        │
│       (idempotente por referenceId=subscriptionId, sin balance)   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  getPricingPreview() debe computar el MISMO descuento para que la
  PoS muestre el precio que realmente se va a cobrar (consistencia).
```

### Recommended Project Structure (archivos a tocar/crear)

```
el-templo-api/src/
├── db/schema/
│   ├── referrals.ts             # NUEVO — tabla vínculo (fuente de verdad)
│   ├── referral-credits.ts      # NUEVO — anotación auditable (D-18)
│   ├── users.ts                 # +referralCode, +referredBy (patrón createdBy:163)
│   ├── aura-config.ts           # (sin cambio de shape, o +columna — ver OQ#1)
│   └── index.ts                 # +export de las 2 tablas nuevas
├── db/migrations/
│   └── 0176_referrals_core.sql  # NUEVO — hand-written (0175 es el tope en master)
├── modules/
│   ├── referrals/               # NUEVO módulo — service (código, resolución, cualif, descuento)
│   ├── auth/routes.ts           # resolver ?ref en /register
│   ├── members/service.ts       # createMember escribe referredBy
│   └── subscriptions/service.ts # hook en los 4 charge-paths + getPricingPreview
el-templo-app/src/pages/RegisterPage.vue   # leer ?ref (clonar promo)
el-templo-admin/src/components/MemberFormDialog.vue  # campo "¿Quién lo trajo?"
```

### Pattern 1: Self-FK `onDelete: set null` (para `referredBy`)

**What:** Columna self-referencial a `users.id`, tipada con `AnyMySqlColumn` para evitar el error de init circular.
**When to use:** `users.referredBy` (imita `createdBy`).

```typescript
// Source: el-templo-api/src/db/schema/users.ts:163 [VERIFIED: código leído]
createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
  onDelete: "set null",
}),
// + index("idx_users_created_by").on(table.createdBy)  (:191)
```

### Pattern 2: Config ajustable sin deploy vía `system_settings`

**What:** Key-value store, leído con fallback en un service.
**When to use:** el TOPE del descuento (y opcionalmente el %-por-vínculo) — precedente exacto en finance.

```sql
-- Source: 0157_seed_finance_overdue_threshold.sql [VERIFIED: código leído]
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'finance.pending_overdue_days', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days'
);
```

### Pattern 3: Cobertura vigente = criterio de "activo" (D-09)

```typescript
// Source: el-templo-api/src/modules/subscriptions/service.ts:176 [VERIFIED]
export async function deriveCoveredUntil(db, userId): Promise<string | null> {
  // MAX(endDate) sobre subscriptions status IN ('active','scheduled') AND endDate NOT NULL
}
// Uso: const cov = await deriveCoveredUntil(db, counterpartyId);
//      const active = cov !== null && cov >= todayDateString();
```

### Pattern 4: Los 4 charge-paths convergen en `recordAssignmentCharge`

```
assignPlan (:1058)              ─┐
changePlanNow (:2906)           ─┤
changePlanAfterCurrent (:3332)  ─┼─> recordAssignmentCharge (:387) ─> transactionService.create
renewSubscription (:3652)       ─┘
```

El descuento reduce `pricePaid`; `recordAssignmentCharge` usa `chargeBase = pricePaid` (`amountReceived <= chargeBase`, valida `:450`). El hook debe insertarse en el cálculo de `pricePaid` de **cada** path (o en un helper `computePriceWithReferralDiscount` llamado por los 4).

### Anti-Patterns to Avoid

- **Poner el hook solo en `assignPlan`:** rompe DESC-03 ("cada cobro") — las renovaciones (el 90% de los cobros recurrentes) NO tendrían descuento. El CONTEXT.md solo menciona `assignPlan` porque se escribió pre-v5.4; corregido acá.
- **Usar `AuraService.award()` para la anotación:** `award()` hace `INSERT ... ON DUPLICATE KEY UPDATE balance = balance + amount` sobre `aura_balances` → **infla el balance gastable**, viola D-06/AURA-01. Usar INSERT directo en `aura_transactions` (no toca `aura_balances`) o la tabla `referral_credits`.
- **Usar `AuraService.spend()` para "descontar":** hardcodea `sourceType:"manual_adjustment"` (`service.ts:129`) y lanza `InsufficientBalanceError` si no hay balance — no es lo que referidos necesita.
- **Reusar `auraDiscount`/`auraDiscountPercent` sin separar semántica:** esas columnas ya las escribe el flujo `input.auraSpend` (gasto discrecional de AURA, `service.ts:1270`). Un socio podría gastar AURA Y tener descuento de referido en el mismo cobro → colisión. Ver OQ#2.
- **Idempotencia de la anotación con `referenceId = referralId`:** el índice `unique_user_source_ref` (userId+sourceType+referenceType+referenceId) colisionaría en el 2do mes (mismo vínculo, mismo user). Usar `referenceId = subscriptionId` del cobro (cada cobro = nueva sub).

## Don't Hand-Roll

| Problem                           | Don't Build                            | Use Instead                                                                       | Why                                                                                               |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "¿Está activo el socio?"          | Nueva query de subscriptions/status    | `deriveCoveredUntil(db, userId)` (`service.ts:176`)                               | Helper único de fase 144; D-09 lo exige explícito; `users.status` es cron-derivado y se desfasa.  |
| Idempotencia de la anotación AURA | Flag manual "ya anotado"               | Índice `unique_user_source_ref` ya existente                                      | Constraint DB, atómico. Con `referenceId=subscriptionId` da idempotencia por-cobro.               |
| Dedup de socios                   | Nuevo check de duplicados              | Dedup por DNI/email/phone ya existente (`auth/routes.ts:75-127`, createMember)    | D-15; ya cubre email+DNI+phone normalizado.                                                       |
| Config ajustable                  | Constante en código / redeploy         | `system_settings` key-value + read-with-fallback (patrón FinanceConfig, mig 0157) | D-12 (ajustable sin deploy).                                                                      |
| Registro del cobro                | Nuevo INSERT en financial_transactions | `recordAssignmentCharge` (`service.ts:387`) — ya lo llaman los 4 paths            | El descuento solo reduce `pricePaid`; la plomería contable ya existe.                             |
| Migración generada                | `pnpm db:generate`                     | Hand-write `.sql` (skill `el-templo-db-migrations`)                               | `db:generate` está roto por drift de `goal_plan_type`; todas las migs recientes son hand-written. |

**Key insight:** casi todo el "trabajo difícil" (cobertura, cobro, dedup, idempotencia, config) ya está resuelto en el código. El feature es principalmente **cablear** lo existente + 2 tablas nuevas + un helper de cómputo. El riesgo NO está en construir cosas nuevas sino en (a) tocar los 4 charge-paths de forma consistente y (b) resolver las 3 tensiones de diseño abajo.

## Common Pitfalls

### Pitfall 1: Numeración de migración desde el branch equivocado

**What goes wrong:** este branch (`feat/formatos-combos-fullbody-stretching`) tiene el tope en **0173**, pero `origin/master` y `origin/staging` están en **0175** (0174_schedule_exceptions, 0175_mogotes_capacity_16). Numerar 0174 colisiona con prod.
**Why it happens:** el branch está atrasado respecto de master; el CONTEXT.md (2026-07-02) es pre-v5.4.
**How to avoid:** la fase 157 debe branchear desde `origin/master` actualizado y numerar la migración **0176+**. Verificar el tope en `origin/master` Y `origin/staging` justo antes de escribir (`git ls-tree -r --name-only origin/master -- el-templo-api/src/db/migrations/`). Regla dura del skill `el-templo-db-migrations`.
**Warning signs:** `ls migrations` local muestra 0173 pero master tiene 0175.

### Pitfall 2: Semicolon dentro de comentario SQL

**What goes wrong:** el runner splitea por `;` ANTES de stripear comentarios `--` → un `;` en un comentario parte la migración y deja SQL malformado. Rompió todo CI una vez (mig 0119).
**How to avoid:** cero `;` en comentarios `--`. Usar `--> statement-breakpoint` entre statements si hace falta prosa rica.
**Warning signs:** comentario en español con "activo; pasivo".

### Pitfall 3: `mysqlEnum` primer-arg vs nombre de columna

**What goes wrong:** el 1er arg de `mysqlEnum("col_name", [...])` ES el nombre físico de la columna; si no matchea el SQL byte-a-byte, CI falla con "Unknown column" y `tsc` pasa verde.
**How to avoid:** para el enum `status` de `referrals` (`pending|qualified|revoked`) y `attributionChannel` (`self_service|assisted`), cross-checkear nombre+valores+orden entre schema y `.sql`.
**Warning signs:** `mysqlEnum("status", ...)` en schema pero `attribution_channel enum(...)` en SQL con distinto nombre.

### Pitfall 4: El descuento aplicado en el cobro no se refleja en el preview

**What goes wrong:** `getPricingPreview` (`service.ts:4195`) solo computa el descuento de `input.auraSpend`. Si el descuento de referido reduce `pricePaid` en `assignPlan` pero el preview muestra el precio full, el operador/PoS cobra el monto equivocado.
**How to avoid:** `getPricingPreview` debe computar el MISMO descuento de referido (mismo helper). Está IN SCOPE de 157 (es mecánica de cobro, no visibilidad de 158).
**Warning signs:** el profe ve $10000 en la PoS pero el charge nace en $9000.

### Pitfall 5: El plan gratis (promo) cualifica el vínculo por error

**What goes wrong:** el flujo de registro con `promoCode` llama `assignPlan` con `priceTypeApplied:"zero"`, `pricePaid=0` (`auth/routes.ts:246`). Si la cualificación dispara con cualquier `assignPlan`, un referido con mes gratis cualificaría sin pagar → viola D-01 ("paga su primera suscripción").
**How to avoid:** disparar la cualificación solo cuando `pricePaid > 0`. Ver OQ#4 (pricePaid vs amountReceived).
**Warning signs:** vínculos `qualified` de socios que solo usaron el mes gratis.

## Code Examples

### Detección del primer pago (cualificación)

```typescript
// En el charge-path, tras resolver pricePaid y ANTES de computar el descuento:
// [ASSUMED] — patrón propuesto, valida el planner
if (pricePaid > 0) {
  const payer = /* user con su referredBy */;
  if (payer.referredBy) {
    // flip pending -> qualified de forma atómica (UPDATE condicional)
    await tx.update(schema.referrals)
      .set({ status: "qualified", qualifiedAt: sql`NOW()` })
      .where(and(
        eq(schema.referrals.referredId, payer.id),
        eq(schema.referrals.status, "pending"),
      ));
  }
}
```

### Cómputo del descuento simétrico (helper compartido)

```typescript
// [ASSUMED] — patrón propuesto, valida el planner
async function computeReferralDiscountPercent(
  db,
  userId,
  percentPerLink,
  maxPercent,
) {
  const links = await db
    .select()
    .from(schema.referrals)
    .where(
      and(
        or(
          eq(schema.referrals.referrerId, userId),
          eq(schema.referrals.referredId, userId),
        ),
        eq(schema.referrals.status, "qualified"),
      ),
    );
  const today = todayDateString();
  let active = 0;
  for (const l of links) {
    const counterparty = l.referrerId === userId ? l.referredId : l.referrerId;
    const cov = await deriveCoveredUntil(db, counterparty); // D-09
    if (cov !== null && cov >= today) active++;
  }
  return Math.min(active * percentPerLink, maxPercent); // D-04/DESC-04
}
```

## State of the Art

| Old Approach                                    | Current Approach                                                       | When Changed                                   | Impact                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| CONTEXT.md dice "hook en `assignPlan`" (1 path) | 4 charge-paths convergen en `recordAssignmentCharge`                   | v5.4 (fases 151/154), en prod desde 2026-07-08 | El hook debe ser compartido; renovaciones/cambios también aplican descuento.             |
| Alta admin "vieja"                              | `MemberFormDialog.vue` reformado (fase 154) + PoS profe (fase 140/148) | v5.4 en prod                                   | El campo "¿Quién lo trajo?" se monta sobre lo reformado; PoS profe fluye por assignPlan. |
| Migraciones hasta 0173 (este branch)            | master/staging en 0175                                                 | 0174/0175 en master                            | 157 numera 0176+, branchea desde master.                                                 |

**Deprecated/outdated en el CONTEXT.md (corregir en el plan):**

- "Hook en `assignPlan`" → leer como "hook en los 4 charge-paths / helper compartido".
- `service.ts` line numbers del CONTEXT (`:1100`/`:3266`/`:3880`) → re-verificados: `assignPlan:1058`, `spend en :1263`, `getPricingPreview:4195`, `deriveCoveredUntil:176`. Usar estos.

## Assumptions Log

| #   | Claim                                                                                   | Section          | Risk if Wrong                                                                                                    |
| --- | --------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| A1  | El umbral de cualificación es `pricePaid > 0` (bought a paid plan)                      | Pitfall 5 / OQ#4 | Si debe ser `amountReceived > 0`, altas con deuda no cualificarían; decisión de negocio.                         |
| A2  | El descuento reduce `pricePaid` (no split cash+aura_credit)                             | OQ#3             | Si quieren el descuento visible en revenue reporting, hace falta el split contable.                              |
| A3  | El pago que cualifica también recibe el descuento (flip antes de computar)              | OQ#5             | Cambia si el descuento arranca "el ciclo siguiente".                                                             |
| A4  | Solo importa la cobertura de la contraparte (X paga → X está activo)                    | OQ#6             | Si X debe estar ya-activo antes de pagar, un socio vencido que renueva no obtendría descuento en esa renovación. |
| A5  | Columnas nuevas `referralDiscountPercent`/`referralDiscountAmount` en `subscriptions`   | OQ#2             | Si se reusan `auraDiscount*`, colisión con gasto AURA discrecional.                                              |
| A6  | El tope de % vive en `system_settings`; el %-por-vínculo en `aura_config.defaultAmount` | OQ#1             | Si AURA-02 exige literalmente ambos en `aura_config`, hace falta ALTER de `aura_config`.                         |
| A7  | `referral_credits` se indexa por subscriptionId para idempotencia por-cobro             | AURA-01          | Idempotencia rota si se usa referralId (colisión mensual).                                                       |

## Open Questions

1. **`aura_config` no puede sostener las dos perillas (%-por-vínculo + tope).**
   - Qué sabemos: `aura_config` tiene UN solo escalar (`defaultAmount int`, `aura-config.ts:29`). AURA-02/D-12 piden 10% por vínculo + tope 40%.
   - Qué falta: dónde vive el tope.
   - Recomendación: `aura_config.referral.defaultAmount = 10` (%-por-vínculo, satisface AURA-02 literal) + `system_settings['referral.max_percent_cap'] = '40'` (precedente `finance.pending_overdue_days`, mig 0157). Ambos ajustables sin deploy. Alternativa: `ALTER TABLE aura_config ADD max_percent int NULL` (más invasivo, cambia shape de una tabla compartida con el motor AURA).

2. **Colisión de columnas de descuento en `subscriptions`.**
   - Qué sabemos: `auraDiscount`/`auraDiscountPercent` (`:60-61`) ya las escribe el flujo `input.auraSpend` (gasto AURA discrecional, `:1270`). El brief §5.2 sugiere reusarlas.
   - Qué falta: cómo componen si un socio gasta AURA Y tiene descuento de referido en el mismo cobro.
   - Recomendación: columnas **nuevas** `referralDiscountPercent`/`referralDiscountAmount` — mantienen los dos mecanismos independientes y componibles, evitan pisar el gasto explícito del socio. (D-07 dice "reusa `auraDiscountPercent`" — flag: reusar el CONCEPTO de %, no necesariamente la misma columna.)

3. **Modelo de aplicación del descuento: reducir `pricePaid` vs split contable.**
   - Qué sabemos: el flujo `auraSpend` existente solo reduce `pricePaid` (sin línea `aura_credit`). El brief §5.5 menciona `paymentMethod:"aura_credit"` para "la porción descontada".
   - Qué falta: si el descuento debe aparecer en revenue reporting como línea separada.
   - Recomendación: **reducir `pricePaid`** (simple, consistente con `auraSpend`) + anotar en `referral_credits`. El split cash+aura_credit es más complejo y solo aporta si quieren ver el "regalo" en el reporte de ingresos. Decidir con Franco.

4. **Umbral de "pago" para cualificar: `pricePaid > 0` vs `amountReceived > 0`.**
   - Qué sabemos: D-01 = "paga su primera suscripción"; D-11 = el trigger de pago es la barrera antifraude. El alta de profe puede dejar deuda (`amountReceived < pricePaid`).
   - Recomendación: `pricePaid > 0` (compró un plan pago real, aunque quede deuda) — mata el mes-gratis fantasma (Pitfall 5) sin castigar altas con deuda parcial. Alternativa estricta: `amountReceived > 0`.

5. **¿El pago que cualifica ya recibe el descuento?**
   - Recomendación: sí — flip `qualified` ANTES de computar en el mismo cobro (más generoso, simétrico, ambos empiezan a descontar de una). Decidir con Franco.

6. **¿Importa la cobertura del propio pagador o solo la de la contraparte?**
   - Recomendación: solo la contraparte — al pagar, X se vuelve activo por definición (D-09 dice "se evalúa la cobertura vigente de la contraparte"). Confirmar para el caso "socio vencido que renueva".

7. **Generación del código: ¿en `createMember`/`/register` (eager para nuevos) o 100% lazy?**
   - Qué sabemos: D-17 = lazy + backfill script. Pero un socio nuevo necesita código para compartir.
   - Recomendación: generar el código en el momento del alta/registro para socios NUEVOS (barato, 1 por alta) y dejar el backfill script solo para los ~2000 existentes. Aclarar el borde con el planner.

## Environment Availability

> Fase code+migración sobre stack existente; sin dependencias externas nuevas. MySQL ya presente (dev + CI + prod).

| Dependency                         | Required By          | Available | Version        | Fallback |
| ---------------------------------- | -------------------- | --------- | -------------- | -------- |
| MySQL (eltemplo/\_test)            | migración + tests    | ✓         | (repo)         | —        |
| pnpm + vitest                      | tests de integración | ✓         | vitest ^4.0.18 | —        |
| Drizzle runner (`pnpm db:migrate`) | aplicar migración    | ✓         | (repo)         | —        |

Sin dependencias faltantes.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | vitest ^4.0.18                                                                                                                         |
| Config file        | `el-templo-api` (vitest, tests contra `eltemplo_test_<POOL_ID>`)                                                                       |
| Quick run command  | `cd el-templo-api && pnpm vitest run test/referrals/` (archivo nuevo)                                                                  |
| Full suite command | `cd el-templo-api && pnpm test` (corre en CI — convención del repo: NO correr suite completo local, solo el archivo nuevo + typecheck) |

### Phase Requirements → Test Map

| Req ID        | Behavior                                                                 | Test Type   | Automated Command                                                    | File Exists?  |
| ------------- | ------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------- | ------------- |
| REF-01        | Código único generado, UNIQUE enforced                                   | integration | `pnpm vitest run test/referrals/code-generation.test.ts`             | ❌ Wave 0     |
| REF-02        | `?ref` en /register → referredBy + referrals(pending)                    | integration | `pnpm vitest run test/auth/register.test.ts` (extender)              | ✅ (extender) |
| REF-03        | createMember con referidor → referredBy                                  | integration | `pnpm vitest run test/members/members.test.ts` (extender)            | ✅ (extender) |
| REF-04        | rechaza auto-referido + doble-referidor + dedup DNI                      | integration | `pnpm vitest run test/referrals/anti-fraud.test.ts`                  | ❌ Wave 0     |
| DESC-01       | 1er pago (pricePaid>0) → qualified; mes gratis NO cualifica              | integration | `pnpm vitest run test/referrals/qualification.test.ts`               | ❌ Wave 0     |
| DESC-02/03/04 | descuento simétrico, suspende/reactiva, acumula con tope, en los 4 paths | integration | `pnpm vitest run test/referrals/discount-computation.test.ts`        | ❌ Wave 0     |
| DESC-05       | no-discrecional (server-side, sin input del socio)                       | integration | (cubierto en discount-computation)                                   | ❌ Wave 0     |
| AURA-01       | anotación sin inflar balance; idempotente por cobro                      | integration | `pnpm vitest run test/referrals/aura-annotation.test.ts`             | ❌ Wave 0     |
| AURA-02       | config leída de aura_config/system_settings, ajustable                   | integration | (cubierto en discount-computation)                                   | ❌ Wave 0     |
| (preview)     | getPricingPreview refleja el descuento de referido                       | integration | `pnpm vitest run test/subscriptions/member-plans.test.ts` (extender) | ✅ (extender) |

### Sampling Rate

- **Per task commit:** `pnpm vitest run test/referrals/<archivo tocado>` + `pnpm tsc --noEmit`
- **Per wave merge:** `pnpm vitest run test/referrals/ test/auth/register.test.ts test/subscriptions/`
- **Phase gate:** suite completo verde en CI antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/referrals/code-generation.test.ts` — REF-01
- [ ] `test/referrals/anti-fraud.test.ts` — REF-04 (auto-referido, doble referidor, dedup DNI)
- [ ] `test/referrals/qualification.test.ts` — DESC-01 (incl. mes-gratis NO cualifica)
- [ ] `test/referrals/discount-computation.test.ts` — DESC-02/03/04/05 + los 4 charge-paths + tope + suspende/reactiva
- [ ] `test/referrals/aura-annotation.test.ts` — AURA-01 (balance intacto, idempotencia por cobro)
- [ ] Helpers de fixtures: reusar `test/subscriptions/_helpers.ts` (crea users/plans/subs)
- [ ] Framework install: ninguno (vitest ya presente)

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                                         |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | No cambia auth; `/register` ya existe.                                                                                                                                                                                                                   |
| V3 Session Management | no      | Sin cambios de sesión.                                                                                                                                                                                                                                   |
| V4 Access Control     | **yes** | `referredBy` NUNCA se acepta del body del cliente en flujos admin (el server lo resuelve/valida, patrón `createdBy` de fase 114). El campo asistido solo lo escribe staff autenticado. El descuento es server-side (D-05) — el socio no puede inducirlo. |
| V5 Input Validation   | **yes** | Fastify JSON schema (AJV) para el body de `/register` (`?ref` string) y createMember; `additionalProperties:false` ya strippea campos no declarados. Validar formato del código antes de la lookup.                                                      |
| V6 Cryptography       | no      | El sufijo aleatorio del código NO es secreto (es compartible) — usar RNG normal, no crypto-grade; unicidad por UNIQUE + retry, no por entropía.                                                                                                          |

### Known Threat Patterns for este stack

| Pattern                                      | STRIDE               | Standard Mitigation                                                                                      |
| -------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Auto-referido (referrerId==referredId)       | Spoofing/Repudiation | Check server-side `referrerId != referredId` (D-13), rechazar.                                           |
| Doble-reclamo del mismo referido             | Tampering            | `referrals.referredId UNIQUE` (D-14) — el 2do INSERT falla.                                              |
| Cuenta fantasma para inflar descuento        | Spoofing             | Trigger = primer pago con `pricePaid>0` (D-01/D-11), no el registro.                                     |
| Erosión de ingreso por acumulación           | (business)           | Tope configurable (D-04/DESC-04) `maxPercent`.                                                           |
| Cliente fuerza referredBy en alta admin      | Elevation/Tampering  | No leer `referredBy`/`createdBy` del body; resolver server-side del código o del selector validado.      |
| Inducir descuento manualmente                | Tampering            | Descuento no-discrecional computado en el cobro (D-05), no aceptado como input.                          |
| Auto-descuento en registro con `?ref` propio | Spoofing             | El código self-service atribuye al REFERIDOR, no al que se registra; check auto-referido cubre el borde. |

## Sources

### Primary (HIGH confidence — código leído en el árbol 2026-07-10)

- `el-templo-api/src/modules/subscriptions/service.ts` — `deriveCoveredUntil:176`, `assignPlan:1058`, `recordAssignmentCharge:387`, `renewSubscription:3652`, `changePlanNow:2906`, `changePlanAfterCurrent:3332`, `getPricingPreview:4195`, spend AURA `:1263`.
- `el-templo-api/src/modules/aura/service.ts` — `award` (infla balance), `spend` (hardcodea manual_adjustment + InsufficientBalanceError).
- `el-templo-api/src/db/schema/{aura-transactions,aura-config,users,financial-transactions,system-settings}.ts` — enums `referral` reservados, `unique_user_source_ref`, `createdBy:163`, `defaultAmount` escalar único.
- `el-templo-api/src/modules/auth/routes.ts:43` — `/register`, dedup DNI/email/phone, flujo promoCode.
- `el-templo-api/src/modules/members/service.ts:669` (`createMember`) + `routes.ts:637` (createMember→assignPlan).
- `el-templo-api/src/modules/finance/coach-load-routes.ts` — PoS profe usa SubscriptionService.
- `el-templo-app/src/pages/RegisterPage.vue:213` — lee `route.query.promo`.
- `el-templo-admin/src/components/MemberFormDialog.vue` — alta admin.
- `git ls-tree origin/master` — migraciones tope 0175 (0174_schedule_exceptions, 0175_mogotes_capacity_16).
- `.claude/skills/el-templo-db-migrations/SKILL.md` — reglas de migración hand-written.

### Secondary (design source of truth)

- `BRIEF-SISTEMA-REFERIDOS.md` (raíz) — 8 decisiones + arquitectura + §7 preguntas abiertas.
- `.planning/ROADMAP.md` — Phase Details 157, REQ-IDs inline.
- `.planning/phases/157-.../157-CONTEXT.md` — D-01..D-18.

### Tertiary (LOW confidence — asunciones a validar)

- Patrones propuestos en Code Examples marcados `[ASSUMED]` — validar con el planner/Franco (ver Assumptions Log + Open Questions).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — sin paquetes nuevos, todo verificado en el árbol.
- Architecture (charge-paths, deriveCoveredUntil, dedup, config): HIGH — código leído directamente.
- Design decisions (columnas, umbral de pago, modelo de descuento): MEDIUM — 7 open questions genuinas, marcadas para discuss/Franco. NO son gaps de investigación; son decisiones de negocio/diseño que el código no dicta.
- Pitfalls: HIGH — derivados del skill de migraciones y del código.

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (stable) — PERO re-verificar el tope de migración y el estado de master justo antes de planificar (este branch está atrás; master evoluciona rápido).
</content>
