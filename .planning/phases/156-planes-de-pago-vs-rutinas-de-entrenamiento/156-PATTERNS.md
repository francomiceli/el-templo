# Phase 156: Planes de pago vs Rutinas de entrenamiento - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 20 (4 nuevos, 16 modificados)
**Analogs found:** 19 / 20 (el multi-select de programas no tiene analog exacto — patrón parcial en el q-select de `linkedProgramId`)

## File Classification

| New/Modified File                                                                          | Role                   | Data Flow          | Closest Analog                                                                     | Match Quality                     |
| ------------------------------------------------------------------------------------------ | ---------------------- | ------------------ | ---------------------------------------------------------------------------------- | --------------------------------- |
| `el-templo-api/src/modules/settings/keys.ts` (mod)                                         | config                 | —                  | sí mismo (key `cardSurcharge`)                                                     | exact                             |
| `el-templo-api/src/modules/settings/service.ts` (mod)                                      | service                | CRUD (key-value)   | sí mismo (`getCardSurchargeEnabled`/`setCardSurchargeEnabled`)                     | exact                             |
| `el-templo-api/src/modules/settings/routes.ts` (mod)                                       | route                  | request-response   | sí mismo (GET/PUT `/pricing/card-surcharge`)                                       | exact                             |
| `el-templo-api/src/modules/subscriptions/service.ts` (mod)                                 | service                | CRUD               | sí mismo (`resolvePriceType` 4276-4288, `createPlan`/`updatePlan` 501-606)         | exact                             |
| `el-templo-api/src/modules/subscriptions/schemas.ts` (mod)                                 | config (JSON schemas)  | request-response   | sí mismo (`createPlanSchema`/`updatePlanSchema`/`planSchema`)                      | exact                             |
| `el-templo-api/src/modules/subscriptions/types.ts` (mod)                                   | model (types)          | —                  | sí mismo (`CreatePlanInput`/`UpdatePlanInput`/`PlanListItem`)                      | exact                             |
| `el-templo-api/src/modules/programs/enrollment-service.ts` (mod)                           | service                | CRUD (tx-composed) | sí mismo (`enrollFromPlan` rama bundle 197-254, `tearDownForSubscription` 492-694) | exact                             |
| `el-templo-api/src/db/schema/plan-programs.ts` (NEW)                                       | model (Drizzle schema) | —                  | `src/db/schema/blog-tags.ts` (`blogPostTags` join table)                           | exact                             |
| `el-templo-api/src/db/migrations/0168_seed_pricing_zero_price.sql` (NEW)                   | migration              | batch              | `0166_seed_pricing_card_surcharge.sql`                                             | exact                             |
| `el-templo-api/src/db/migrations/0169_plan_programs.sql` (NEW)                             | migration              | batch              | `0152_class_coach_roster_and_ratings.sql` (DDL aditivo + UNIQUE compuesto)         | exact                             |
| `el-templo-api/test/settings/zero-price-setting.test.ts` (NEW)                             | test                   | request-response   | `test/settings/pricing-setting.test.ts`                                            | exact                             |
| `el-templo-api/test/subscriptions/plans-crud.test.ts` (mod, PLAN-03/04)                    | test                   | CRUD               | sí mismo + `test/subscriptions/charge-on-assign.test.ts`                           | exact                             |
| test nuevo acceso multi-programa (p.ej. `test/subscriptions/plan-programs-access.test.ts`) | test                   | CRUD               | `test/subscriptions/bundle-todos-los-programas.test.ts`                            | exact                             |
| test gate Zero (assign/renew/PoS)                                                          | test                   | request-response   | `test/finance/coach-load-pricing-gate.test.ts`                                     | exact                             |
| `el-templo-admin/src/config/templo-config.ts` (mod)                                        | config                 | —                  | sí mismo (`TEMPLO_GREEK_LEVELS` 25-34, NAV_MODEL 147-152)                          | exact                             |
| `el-templo-admin/src/composables/usePricingSettingsApi.ts` (mod)                           | composable             | request-response   | sí mismo (métodos card-surcharge)                                                  | exact                             |
| `el-templo-admin/src/pages/ConfiguracionPreciosPage.vue` (mod)                             | component              | request-response   | sí mismo (toggle card-surcharge, 84 líneas completas)                              | exact                             |
| `el-templo-admin/src/components/PlanFormDialog.vue` (mod)                                  | component              | CRUD form          | sí mismo (gate `cardSurchargeEnabled` + q-select `linkedProgramId`)                | exact / role-match (multi-select) |
| `el-templo-admin/src/components/AssignPlanDialog.vue` (mod)                                | component              | CRUD form          | sí mismo (`priceTypeOptions` 1225-1238 — mismo computed que gateó tarjeta)         | exact                             |
| `el-templo-admin/src/pages/CobrosPage.vue` (mod)                                           | component              | CRUD form          | sí mismo (toggle `zeroPrice` 398-403 + `loadCardSurchargeRule` 1617-1622)          | exact                             |
| `el-templo-admin/src/pages/PlanesPage.vue` / `ProgramasPage.vue` (mod, títulos)            | component              | —                  | sí mismos (`text-h5` línea 6 / línea 7)                                            | exact                             |
| `el-templo-admin/src/types/subscription.ts` (mod)                                          | model (types)          | —                  | sí mismo (`grantsAllPrograms` en 117/150/169)                                      | exact                             |

---

## Hallazgos clave para el planner (respuestas a las 6 preguntas)

### 1. TODOS los call sites de priceType `zero`

**Backend:**

- `subscriptions/types.ts:23` — `export type PriceType = "regular" | "zero" | "credit_card"` (NO tocar; 154 dejó `credit_card` en el tipo).
- `subscriptions/schemas.ts:303, 356, 718` — enums `["regular", "zero", "credit_card"]` en los bodies de assign, change-plan y (713-718) el schema de preview/pricing con `required: ["planId", "priceType"]`. **Precedente 154: los enums NO se recortan** — el gate es la normalización server-side en `resolvePriceType`.
- `subscriptions/service.ts:4293-4302` — `getBasePrice` rama `case "zero": return plan.priceZero` (queda intacta; con la regla OFF nunca llega `zero` porque `resolvePriceType` lo normalizó antes).
- `subscriptions/service.ts:1052` (assignPlan) / `2813` (changePlan) / `3238` (¿preview/otro flujo — misma llamada) / `3545` (renew, herencia WR-04) / `3945` (preview) — los 5 puntos que ya llaman `resolvePriceType`. **La rama zero se agrega dentro de `resolvePriceType` (4276-4288) y cubre los 5 sin tocarlos.**
- **⚠️ EDGE — boarding pass:** `service.ts:1074-1080` (assignPlan): `input.boardingPass` fuerza `priceTypeApplied = "zero"` DESPUÉS de `resolvePriceType` (línea 1052). Con Zero OFF, un boarding pass seguiría persistiendo `zero`. Mismo bypass en el front: `AssignPlanDialog.vue:1617` (`boardingPass ? 'zero' : ...`). El planner debe decidir: (a) dejar boardingPass como mecanismo independiente (es un regalo one-shot, no un tipo de precio elegible), o (b) normalizarlo también. Recomendación implícita del CONTEXT (D-04 "punto único"): documentar (a) o cubrir (b) con un segundo pase de `resolvePriceType` post-boardingPass.
- **⚠️ WR-04 renovaciones:** `service.ts:3542-3551` — el priceType heredado de la sub anterior se re-normaliza en renew (`renewalPriceType = await this.resolvePriceType(inheritedPriceType)`), y si cambia, recalcula con `getBasePrice(plan, renewalPriceType)`. Al agregar la rama zero en `resolvePriceType`, **esto ya cubre gratis** al socio dado de alta con `zero` cuya regla se apaga: renueva a `regular` con el precio regular vigente. Nada extra que codear, pero SÍ testear (analog: descripción WR-04 en el excerpt de abajo).
- Coach PoS (fase 148): `finance/coach-load-routes.ts:88-89` (comentario + campo `zero?: boolean` del body), `:182` (`zero: { type: "boolean" }` en el schema), `:772-777` (mapeo `body.paymentMethod === "card" ? "credit_card" : body.zero ? "zero" : "regular"` → pasa a `assignPlan` que resuelve). **El body del PoS NO necesita cambios** — el gate server-side de D-04 lo cubre vía `resolvePriceType` en assignPlan. La UI del PoS (CobrosPage) esconde el toggle (D-05).
- `members/routes.ts:510` y `members/service.ts:332` — solo comentarios, no call sites.

**Frontend (admin):**

- `AssignPlanDialog.vue:1225-1238` — `priceTypeOptions` computed: `zero` está SIEMPRE en `opts` (línea 1228); `credit_card` se agrega solo si `cardSurchargeEnabled` (1230-1236). **El gate Zero es simétrico: mover `zero` a un push condicional por `zeroPriceEnabled`.**
- `AssignPlanDialog.vue:1453-1454` — `case 'zero': return selectedPlan.value.priceZero` (cálculo de preview, queda).
- `AssignPlanDialog.vue:901-908, 1736` — `cardSurchargeEnabled` ref + `loadCardSurchargeRule()` + llamada al abrir: **replicar con `zeroPriceEnabled`**.
- `CobrosPage.vue:398-403` — el `<q-toggle v-model="zeroPrice" label="Precio Zero">` a gatear con `v-if`.
- `CobrosPage.vue:785, 844, 1171` — ref `zeroPrice` + resets; `1264-1268` `getBasePriceFor(..., zero)`; `1325` watch; `1486` `zero: zeroPrice.value` en el payload al PoS. Con el toggle escondido, `zeroPrice` queda `false` y el payload viaja `zero:false` — no hace falta tocar el payload.
- `CobrosPage.vue:1262, 1617-1622, 1658` — patrón `cardSurchargeEnabled` + `loadCardSurchargeRule()` en `onMounted`: replicar.
- `PlanFormDialog.vue:87-97` — campo `priceZero` (label "Zero \*", con `requiredNumberRule`). **OJO:** hoy es requerido (`required` en `createPlanSchema` línea ~155 y rule del form). Con Zero OFF y el campo escondido, el create necesita default (p.ej. enviar `priceZero: priceRegular` o `0` — decisión del planner; el schema API exige `priceZero` en el POST). El gate visual es idéntico al de Tarjeta: `v-if="zeroPriceEnabled"` (analog exacto: línea 98 `v-if="cardSurchargeEnabled"`).
- `PlanesPage.vue` — **NO muestra columnas Zero**: la única columna de precio es `priceRegular` (líneas 101, 206, 518-519). Nada que gatear ahí (hallazgo 5 resuelto).

### 2. Cómo decide acceso enrollment-service hoy (shape exacto)

El "acceso a programas" de un socio = filas en `program_enrollments`. La app de miembros NO consulta el plan — consulta enrollments. Por eso D-07 se resuelve TODO en `enrollFromPlan` + `tearDownForSubscription`; la app de miembros funciona sin cambios.

- **`EnrollFromPlanInput`** (`enrollment-service.ts:44-48`): `{ id, linkedProgramId, grantsAllPrograms }`. **Gana `programIds: number[]`** (o el helper resuelve la lista adentro — ver Pattern Assignments).
- **Rama bundle** (`enrollFromPlan`, líneas 197-254): si `grantsAllPrograms`, bulk-enroll en todos los programas activos con `goalPlanType IS NOT NULL` (exclusión Foundation, fase 104 R3+R7 anti-piratería: Foundation reusa contenido W* de sesiones presenciales), dedupe contra enrollments activos, `source: "plan_bundle"`. **⚠️ Decisión para el planner:** ¿la lista explícita puede incluir Foundation (`goalPlanType IS NULL`)? La exclusión del bundle es anti-piratería de `/sessions/*`; si el admin lista Foundation explícitamente el riesgo reaparece. Recomendado: aplicar el mismo filtro `goalPlanType IS NOT NULL` a la lista, o excluir Foundation de las opciones del multi-select.
- **Call sites de `enrollFromPlan`** en `subscriptions/service.ts` — 4, todos con el mismo shape `{ id, linkedProgramId, grantsAllPrograms }` guardado por `if (plan.linkedProgramId || plan.grantsAllPrograms)`:
  - `1317-1329` (assignPlan), `2997-3008` (changePlanNow, `targetPlan`), `3722-3743` (activateScheduledSub), `4162-4190` (renew, `newPlan`).
  - **El guard `if (plan.linkedProgramId || plan.grantsAllPrograms)` debe ganar la condición de lista** (si no, un plan solo-lista saltea el enrolamiento).
- **Teardown** (`tearDownForSubscription`, 492-694): 3 puntos tocados por la lista:
  - _Protected set_ (523-552): programas cubiertos por OTRA sub activa/pausada — hoy `linkedProgramId` de cada protector + `anyProtectorIsBundle`. Un protector con lista debe aportar sus `plan_programs` al set.
  - _Legacy fallback_ (577-613): enrollments con `subscription_id IS NULL` — rama bundle barre todo, rama linked solo el programId. Con la lista: barrer los programIds de la lista (o dejar el fallback como está — son filas pre-fase-112; decisión del planner, bajo riesgo).
  - Los enrollments de lista deben nacer con `source` — reutilizar `"plan_bundle"` evita migrar el enum de `program_enrollments.source` (recomendado; alternativa: nuevo valor `plan_list` = migración extra del enum).
- **Guard anti-doble-bundle** (`subscriptions/service.ts:963-995`): 409 si ya hay bundle activo. No aplica a listas (dos planes con listas pueden coexistir — el dedupe de `enrollFromPlan` ya evita duplicados).
- Otros puntos que leen `grantsAllPrograms`: `service.ts:228-245` (`assertPlanInvariants` — planes online exigen `linkedProgramId` O `grantsAllPrograms`; **con lista, la lista no-vacía también debería satisfacer el invariante**) y `service.ts:4162-4190` (renew). El gating de `/sessions` (fase 104) es vía enrollments + exclusión Foundation, no lee el plan directamente.

### 3. CRUD de planes — dónde y shape

- **Rutas:** `subscriptions/routes.ts` — POST `/plans` (152-170), PUT `/plans/:planId` (172-196), PATCH deactivate (198+). Prefijo real `/api/admin/subscriptions/plans` (const `SUBSCRIPTIONS_URL` en tests).
- **Service:** `createPlan` (501-540, insert directo + `getPlanById`), `updatePlan` (545-606, patch campo-a-campo `if (input.X !== undefined)` + `assertPlanInvariants` + UPDATE + re-fetch). Para `programIds`: insertar/reemplazar filas en `plan_programs` dentro del mismo flujo (delete+insert por planId es el patrón más simple; no hay tx hoy en createPlan/updatePlan — el planner decide si envolver en `db.transaction`).
- **PLAN-04 — ya funciona así (verificado en código):** `updatePlan` SOLO toca `subscription_plans` (598-603); nunca escribe `subscriptions` ni `financial_transactions`. `pricePaid` se copia al asignar (`service.ts:1229` vía `getBasePrice` en 1090-1091) y la renovación **hereda `currentSub.pricePaid`** (3517, caso Pomilio).
- **⚠️ TENSIÓN con D-09(c) "renovaciones posteriores usan el precio nuevo":** por diseño deliberado (comentario 3508-3516), la renovación NO usa el precio vigente del plan — hereda lo que el socio venía pagando (para arrastrar overrides negociados). Solo las asignaciones NUEVAS y los cambios de plan toman el precio actualizado. El planner debe reconciliar: el test de PLAN-04 debería garantizar (a) update no crea plan (mismo `id`, ya cubierto en `plans-crud.test.ts:30-59`), (b) `pricePaid` histórico y transacciones intactos, (c) **asignaciones** posteriores usan el precio nuevo — y documentar que la renovación hereda por diseño (Pomilio). NO "corregir" la herencia: es un fix de mayo 2026.

### 4. Migraciones — numeración

Última aplicada/commiteada: `0167_activity_max_capacity.sql`. **Libres: 0168 y 0169.** Recomendado **2 archivos** (mismo criterio de 154: un concern por archivo, seed DML idempotente separado del DDL):

- `0168_seed_pricing_zero_price.sql` — copia de 0166 con la key `pricing.zero_price_enabled`, seed `'on'` (El Templo conserva comportamiento).
- `0169_plan_programs.sql` — CREATE TABLE aditivo (analog 0152).
  Regla dura (MEMORY): **nunca `;` dentro de comentarios `--`** (el runner splittea por `;` antes de strippear comentarios — 0166 lo documenta en sus líneas 7-8). Aplicar con `pnpm db:migrate` (runner propio, `_migrations` es la fuente de verdad; `db:generate` está roto por drift — las migraciones van a mano, como 0153/0155/0158).

### 5. PlanesPage columnas de precio

Solo `priceRegular` (columna "Precio", líneas 518-519; render 101 y 206). **No hay columna Zero ni Tarjeta que gatear.** Cambios en PlanesPage: título línea 6 (`Planes` → `Planes de pago`) y, a discreción, mostrar la lista de programas del plan (hoy hay un badge cuando `grantsAllPrograms` en líneas 77 y 187).

### 6. Cómo viaja grantsAllPrograms al admin

- API response: `planSchema` (`schemas.ts:44` dentro del bloque 20-48) + `mapPlanRow` (`service.ts:~4351`) + `PlanListItem` (`types.ts:79`). **`programIds: number[]` se agrega en los 3** (D-08 embebido en el payload de planes — recomendación del CONTEXT).
- Admin types: `el-templo-admin/src/types/subscription.ts:117` (`PlanListItem.grantsAllPrograms`), `:150` (payload create), `:169` (payload update) — `programIds?: number[]` al lado en los 3.
- Toggle en `PlanFormDialog.vue:205` (`q-toggle grantsAllPrograms`); watch 456-463 limpia `linkedProgramId` al prender — **el mismo watch debe limpiar/deshabilitar el multi-select** (la lista se ignora con all=true, D-06).

---

## Pattern Assignments

### `settings/keys.ts` + `service.ts` + `routes.ts` (config + service + route)

**Analog:** ellos mismos — réplica literal del par card-surcharge.

**Key** (`keys.ts:9-12`):

```typescript
export const PRICING_SETTINGS_KEYS = {
  /** system_settings key gating the credit-card surcharge (`'on'` / `'off'`). */
  cardSurcharge: "pricing.card_surcharge_enabled",
  // NUEVO: zeroPrice: "pricing.zero_price_enabled",
} as const;
```

**Service — getter/setter a duplicar** (`service.ts:33-62`): `getCardSurchargeEnabled()` = select por `settingKey` + `row?.settingValue === ON` (default false); `setCardSurchargeEnabled()` = `insert(...).onDuplicateKeyUpdate(...)` + `log.info`. Copiar ambos con la key zero. (DRY: el planner puede extraer un `getFlag(key)/setFlag(key, enabled)` privado — los dos pares son idénticos salvo la key.)

**Routes — GET staff / PUT owner-only** (`routes.ts:29-110`): hook `onRequest` del plugin ya exige staff (29-37); el GET nuevo `/pricing/zero-price` copia 40-66; el PUT copia 69-109 con su `preHandler` OWNER_ROLES (72-79). Mismos schemas `{ enabled: boolean }`.

### `subscriptions/service.ts` — rama zero en `resolvePriceType`

**Analog:** el propio método (líneas 4276-4288):

```typescript
private async resolvePriceType(priceType: PriceType): Promise<PriceType> {
  if (priceType !== "credit_card") return priceType;
  const settingsService = new SettingsService(this.db, this.log);
  const surchargeEnabled = await settingsService.getCardSurchargeEnabled();
  if (surchargeEnabled) return priceType;
  this.log.info({ rule: PRICING_SETTINGS_KEYS.cardSurcharge },
    "card-surcharge rule OFF — normalizing credit_card price type to regular");
  return "regular";
}
```

La rama zero es simétrica: `if (priceType === "zero") { ... zeroEnabled ? "zero" : "regular" }`. Cubre automáticamente los 5 call sites (1052, 2813, 3238, 3545, 3945) incluida la herencia WR-04 de renovaciones (3542-3551). Ver hallazgo 1 por el edge de boarding pass (1074-1080).

### `db/schema/plan-programs.ts` (NEW — join table)

**Analog:** `db/schema/blog-tags.ts:17-29` (`blogPostTags`):

```typescript
export const blogPostTags = mysqlTable(
  "blog_post_tags",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id").notNull(),
    tagId: int("tag_id").notNull(),
  },
  (table) => [
    uniqueIndex("post_tag_unique").on(table.postId, table.tagId),
    index("idx_post_tags_post_id").on(table.postId),
    index("idx_post_tags_tag_id").on(table.tagId),
  ],
);
```

Para `plan_programs`: `subscriptionPlanId` + `programId`, `uniqueIndex` compuesto + índices por columna. Si se quieren FKs reales (D-06 pide FK), el patrón `.references(() => programs.id)` está en `subscription-plans.ts:36`. Registrar el export en `src/db/schema/index.ts` (mismo mecanismo que el resto). **OJO MEMORY (Drizzle):** el 1er argumento de columna DEBE coincidir con el nombre snake_case de la migración o CI revienta con Unknown column.

### Migración `0168_seed_pricing_zero_price.sql`

**Analog completo:** `0166_seed_pricing_card_surcharge.sql` (13 líneas):

```sql
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'pricing.card_surcharge_enabled', 'on'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'pricing.card_surcharge_enabled'
);
```

Reemplazar la key por `pricing.zero_price_enabled`, seed `'on'`. Sin `;` en comentarios.

### Migración `0169_plan_programs.sql`

**Analog:** `0152_class_coach_roster_and_ratings.sql` — encabezado con rationale de reversibilidad/idempotencia + `CREATE TABLE` con `UNIQUE KEY` compuesto y FKs RESTRICT. DDL puramente aditivo.

### `enrollment-service.ts` — helper all → lista → nada (D-07)

**Analog:** la propia rama bundle de `enrollFromPlan` (197-254). El shape recomendado: extender `EnrollFromPlanInput` (44-48) con `programIds: number[]` y en `enrollFromPlan` reemplazar el `if (plan.grantsAllPrograms)` por la resolución única:

- all=true → query actual (203-211: `isActive` + `goalPlanType IS NOT NULL`);
- all=false y lista no vacía → mismos filtros restringidos con `inArray(schema.programs.id, plan.programIds)`;
- dedupe idéntico (213-228) + insert con `source: "plan_bundle"` (231-242) — reutilizar el source evita migrar el enum.

Los 4 callers en `subscriptions/service.ts` (1317-1329, 2997-3008, 3722-3743, 4162-4190) deben (a) proyectar/pasar la lista y (b) ampliar el guard `if (plan.linkedProgramId || plan.grantsAllPrograms)` con `|| programIds.length > 0`. El protected set del teardown (523-552) necesita el join a `plan_programs` de los protectores.

### `plans CRUD` — programIds embebido

**Analogs:** `createPlan` 501-540, `updatePlan` 545-606 (patrón `if (input.X !== undefined)`), `createPlanSchema`/`updatePlanSchema` en `schemas.ts` (bloque leído, `grantsAllPrograms: { type: "boolean" }` como vecino), `planSchema` response (`schemas.ts:20-48`), `mapPlanRow` (~4330-4355), `types.ts` `CreatePlanInput`/`UpdatePlanInput` (99-137) y `PlanListItem` (60-82). En schema JSON: `programIds: { type: "array", items: { type: "integer" } }`. `assertPlanInvariants` (228-245) debe aceptar lista no vacía como binding válido para planes online.

### `templo-config.ts` — labels + flag de superficie (D-01/D-02)

**Analog flag:** `TEMPLO_GREEK_LEVELS` (líneas 25-34):

```typescript
export const TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED;
```

Nuevo `export const TEMPLO_TRAINING_ROUTINES = TEMPLO_ENABLED;` (naming a discreción) con docblock equivalente (per-instalación, NO per-user, no reutilizar `canAccessTraining`).

**Labels nav** (147-152):

```typescript
{
  header: 'Planes',
  items: [
    { path: '/planes', label: 'Planes', icon: 'card_membership', roles: PLANES_READ_ROLES },
    { path: '/programas', label: 'Programas', icon: 'school', roles: DUENO_ROLES },
  ],
},
```

→ labels `'Planes de pago'` / `'Rutinas de entrenamiento'` (paths intactos). Para gatear el ítem `/programas` por superficie: el mecanismo existente es la prop `templo?: boolean` de `NavItem` chequeada en `isNavItemVisible` (214-221: `if (item.templo && !TEMPLO_ENABLED) return false`). El planner puede (a) marcar el ítem `templo: true`, o (b) si quiere el knob independiente `TEMPLO_TRAINING_ROUTINES`, agregar una prop análoga (p.ej. `routines?: boolean`) chequeada igual en `isNavItemVisible`. Consumo del flag en páginas: analog `AlumnosPage.vue:356-360` (`import { TEMPLO_GREEK_LEVELS } ... const greekLevelsEnabled = TEMPLO_GREEK_LEVELS;`).

### `usePricingSettingsApi.ts` — métodos Zero

**Analog:** sus propios `getCardSurchargeEnabled` (36-50) / `setCardSurchargeEnabled` (57-68): `api.get/put<{enabled:boolean}>('/admin/settings/pricing/card-surcharge')` con `loading`/`error`/`extractError` y `cleanup()`. Duplicar con `/admin/settings/pricing/zero-price`.

### `ConfiguracionPreciosPage.vue` — segundo toggle

**Analog:** la página entera (84 líneas): `q-card` con `q-banner` explicativo (12-19) + `q-toggle` con `@update:model-value="onToggle"` (21-27), `loadSetting()` en `onMounted` (52-63) y `onToggle` con revert optimista ante error (65-79). El toggle Zero es una segunda `q-card-section` idéntica con su copy ("Con la regla apagada, la opción de Precio Zero no se ofrece al cobrar...").

### `PlanFormDialog.vue` — gate priceZero + multi-select

**Gate del campo** — analog exacto el campo Tarjeta (98-107):

```html
<div v-if="cardSurchargeEnabled" class="col-12 col-sm-4">
  <q-input v-model.number="form.priceCreditCard" label="Tarjeta" ... />
</div>
```

El campo Zero (87-97) gana el mismo `v-if="zeroPriceEnabled"`. Carga del flag: `loadCardSurchargeRule` (308-320, conservador OFF ante error) + invocación al abrir el dialog (477). **Cuidado:** `priceZero` es required en el form (rule 95) y en el POST del API — con el campo oculto hay que defaultear en `onSubmit` (546: `priceZero: form.value.priceZero!`).

**Multi-select programas (D-08)** — sin analog exacto de `q-select multiple`; base = el q-select de `linkedProgramId` (178-196) + `programOptions` (359-366). Shape a discreción (`multiple`, `use-chips`, `emit-value map-options`). Visible solo cuando `!form.grantsAllPrograms` (D-08) Y superficie de rutinas ON (D-02, flag de templo-config). El watch de `grantsAllPrograms` (456-463) que hoy limpia `linkedProgramId` debe también limpiar `programIds`. Poblar en edit-mode desde `props.plan.programIds` (479-499) y agregar al payload (535-562).

### `AssignPlanDialog.vue` + `CobrosPage.vue` — gate opción Zero (D-05)

**AssignPlanDialog** — analog exacto, el mismo computed donde 154 gateó tarjeta (1225-1238):

```typescript
const priceTypeOptions = computed(() => {
  const opts = [
    { label: PRICE_TYPE_LABELS.regular, value: 'regular' as PriceType },
    { label: PRICE_TYPE_LABELS.zero, value: 'zero' as PriceType },   // ← condicionar por zeroPriceEnabled
  ];
  if (cardSurchargeEnabled.value && selectedPlan.value?.priceCreditCard !== null && ...) {
    opts.push({ label: PRICE_TYPE_LABELS.credit_card, value: 'credit_card' as PriceType });
  }
  return opts;
});
```

Carga del flag: `cardSurchargeEnabled` ref (901) + `loadCardSurchargeRule` (903-908) + llamada al abrir (1736). Duplicar para zero. Boarding pass fuerza `'zero'` en 1617 (ver hallazgo 1).

**CobrosPage** — esconder el toggle (398-403) con `v-if="zeroPriceEnabled"`; flag: analog `cardSurchargeEnabled` ref (1262) + `loadCardSurchargeRule` (1617-1622) + `onMounted` (1658). `zeroPrice` ya resetea a `false` (844, 1171) — el payload `zero:false` (1486) queda correcto sin más cambios.

### Tests

**Setting Zero** — analog completo `test/settings/pricing-setting.test.ts` (169 líneas): 6 escenarios (default-OFF, PUT owner on, upsert off, 403 no-owner en PUT, 200 staff en GET, 403 member). Copiar cambiando la URL (`/api/admin/settings/pricing/zero-price`) y la key asserted. Gotcha documentado en su header: `cleanAllTestData` limpia `system_settings` → cada test parte sin seed.

**Gate Zero end-to-end** — analog `test/finance/coach-load-pricing-gate.test.ts` (describe "regla ON" 163 / "regla OFF" 185, con helper de seed de la regla en 71): mismo esqueleto para "con Zero OFF, un assign con priceTypeApplied=zero persiste regular y cobra priceRegular" + la variante renovación (WR-04).

**PLAN-03 acceso por lista** — analog `test/subscriptions/bundle-todos-los-programas.test.ts` (806 líneas; fixtures `createPlan`/`createMember`/`assignPlan` de `test/subscriptions/_helpers.ts`, asserts directos sobre `programEnrollments`): replicar sus casos R3/R4 (auto-enroll, idempotencia, teardown, protección por otra sub) para un plan con lista.

**PLAN-04** — analog `test/subscriptions/plans-crud.test.ts:30-59` (ya prueba PUT actualiza en el mismo `id` y preserva campos). Extender con: assign → update de precio → assert `subscriptions.pricePaid` y `financial_transactions` intactos → nuevo assign usa el precio nuevo. Para el lado financiero, `charge-on-assign.test.ts` tiene los asserts de transacciones.

---

## Shared Patterns

### Gate server-side primero, UI esconde después

**Source:** `resolvePriceType` (`subscriptions/service.ts:4276-4288`) + comentario en `settings/routes.ts:12-13` de templo-config ("The nav only HIDES items — it is NOT security").
**Apply to:** rama zero (D-04), gates de UI (D-05), flag de superficie (D-02). La UI nunca es el gate; el server normaliza y persiste normalizado.

### Carga de flag de pricing en componentes admin

**Source:** `PlanFormDialog.vue:308-320` (patrón canónico con fallback conservador):

```typescript
async function loadCardSurchargeRule() {
  try {
    cardSurchargeEnabled.value = await pricingApi.getCardSurchargeEnabled();
  } catch (err: unknown) {
    cardSurchargeEnabled.value = false; // conservador: OFF ante error
    log.error("Error cargando la regla...", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Apply to:** PlanFormDialog, AssignPlanDialog, CobrosPage (los 3 ya lo tienen para card — duplicar para zero, o refactor a una carga conjunta a discreción).

### Error handling API

**Source:** `settings/routes.ts:57-64` — `catch (err: unknown)` + `handleServiceError(err, reply, request.log, "context")` de `modules/shared/error-handler`. **Apply to:** todos los endpoints tocados.

### Logging

API: `this.log.info({...}, "mensaje")` (Pino, ver `settings/service.ts:58-61`). Admin: `createLogger('ComponentName')` (`PlanFormDialog.vue:269`). Nunca `console.*`.

### Migración seed idempotente

**Source:** `0166_seed_pricing_card_surcharge.sql` — `INSERT ... SELECT ... WHERE NOT EXISTS`. Sin `;` en comentarios. **Apply to:** 0168.

## No Analog Found

| File                                                        | Role                   | Data Flow | Reason                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| multi-select `q-select multiple` con chips (PlanFormDialog) | component (sub-patrón) | form      | No hay q-select multiple en el admin hoy; base parcial = q-select `linkedProgramId` (PlanFormDialog.vue:178-196) + API estándar de Quasar (`multiple use-chips`) |

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{settings,subscriptions,programs,finance,members}`, `el-templo-api/src/db/{schema,migrations}`, `el-templo-api/test/{settings,subscriptions,finance}`, `el-templo-admin/src/{config,composables,components,pages,types}`
**Files scanned:** ~45 (greps repo-wide de `zero`/`priceType`/`grantsAllPrograms`/`surcharge` + lecturas dirigidas)
**Pattern extraction date:** 2026-07-04
