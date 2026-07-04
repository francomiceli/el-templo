# Phase 154: Alumnos (de-Templo-ficación + accesos) - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 16 (12 a modificar, 4 a crear)
**Analogs found:** 15 / 16 (el único "sin analog" es la UI de Configuración owner-only, con analog parcial)

## Hallazgos críticos (leer primero)

1. **`MemberFormDialog.vue` NO tiene campo avatar.** El CONTEXT.md asume un "label del campo avatar" ahí, pero `grep avatar` en el archivo devuelve cero resultados. El avatar se setea en el onboarding de la app del socio; en el admin es solo lectura (columna/filtro de AlumnosPage + badge de AlumnoDetailPage + `AVATAR_LABELS` en `types/member.ts:122`). **El rename D-06 no toca MemberFormDialog.**
2. **`AssignPlanDialog.vue` es un call site NO listado en el CONTEXT que rompe D-04 si no se gatea.** El admin elige `priceTypeApplied` (incl. `credit_card`) en un dropdown (líneas 1206-1218) y lo manda al backend (línea 1593). Si la regla está off y este dialog sigue ofreciendo "Tarjeta", el recargo se aplica igual.
3. **El punto único de verdad server-side es `getBasePrice()` en `el-templo-api/src/modules/subscriptions/service.ts:4230-4239`.** Tanto el alta del PoS coach (coach-load-routes.ts:773-778 mapea `card`→`credit_card` y llama `assignPlan`) como el assign del admin (que recibe `priceTypeApplied` del cliente) terminan resolviendo el monto ahí. Gatear ahí (`credit_card` → `regular` cuando la regla está off) cubre ambos flujos con un solo cambio.
4. **No existe NINGÚN write a `system_settings` en toda la API** (solo reads en streaks y el seed 0157 vía SQL). El endpoint PUT de la setting es genuinamente nuevo; el patrón de upsert Drizzle está en `ratings/service.ts:172` (`onDuplicateKeyUpdate`).
5. **La columna "Nivel" del export Excel se construye server-side** (`members/routes.ts:249-261`), no en AlumnosPage. Gatearla (discreción recomendada) requiere tocar la API (quitar/parametrizar la columna) — el flag de `templo-config.ts` es front-only, así que hay que decidir: query param desde el admin, o duplicar la constante server-side.
6. **`/pagos` es solo un redirect a `/cobros`** (`router/routes.ts:122`) — no existe PagosPage legacy. Los call sites de precio-por-medio son exactamente 4: CobrosPage:1255, AssignPlanDialog:1206+1428, coach-load-routes:773, subscriptions/service:4230.
7. **Próxima migración disponible: `0166`** (la última es `0165_validated_by_and_cost_center_abm.sql`).
8. **`test/helpers.ts:208` limpia `systemSettings` entre tests** → cada test debe sembrar la setting que necesita (no asumir el seed de la migración).
9. **El seed 0157 (`finance.pending_overdue_days`) nunca se lee** — el read-path de finance usa una constante (`finance/constants.ts`). Sirve como analog de migración, no de endpoint.

## File Classification

| File (nuevo/modificado)                                                                          | Role           | Data Flow        | Closest Analog                                                                    | Match      |
| ------------------------------------------------------------------------------------------------ | -------------- | ---------------- | --------------------------------------------------------------------------------- | ---------- |
| `el-templo-admin/src/pages/AlumnosPage.vue` (mod: header, acción fila, renames, gating)          | page/component | request-response | sí mismo (in-place)                                                               | exact      |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (mod: labels avatar/nivel)                      | page/component | request-response | sí mismo                                                                          | exact      |
| `el-templo-admin/src/pages/CobrosPage.vue` (mod: `?memberId=` + gate precio)                     | page/wizard    | request-response | `HorariosPage.vue:911-922` (deep-link query) + `onUsarExistente` propio (prefill) | exact      |
| `el-templo-admin/src/components/PlanFormDialog.vue` (mod: campo Tarjeta condicional)             | component/form | CRUD             | sí mismo                                                                          | exact      |
| `el-templo-admin/src/components/AssignPlanDialog.vue` (mod: opción credit_card condicional)      | component/form | CRUD             | sí mismo                                                                          | exact      |
| `el-templo-admin/src/config/templo-config.ts` (mod: flag superficie niveles)                     | config         | —                | `TEMPLO_ENABLED` (líneas 16-23)                                                   | exact      |
| `el-templo-admin/src/types/member.ts` (mod: sin cambios de valores, solo si hay labels "Avatar") | types          | —                | sí mismo                                                                          | exact      |
| Composable admin para la setting (nuevo o extensión)                                             | composable     | request-response | `useFinanceLoadApi.ts` / `useMembersApi.ts`                                       | role-match |
| UI Configuración owner-only (nuevo: page o sección)                                              | page           | CRUD             | `UsuariosPage.vue` (owner-only en nav 149) + `NAV_MODEL` Configuración            | role-match |
| `el-templo-admin/src/router/routes.ts` (mod: ruta config si es page nueva)                       | config/route   | —                | entrada `usuarios` (~198)                                                         | exact      |
| API: routes de settings owner-only (nuevo)                                                       | route plugin   | CRUD             | `el-templo-api/src/modules/users/routes.ts:20-43`                                 | role-match |
| API: service/helper de la setting (nuevo)                                                        | service        | CRUD             | `streaks/service.ts:273-317` (read) + `ratings/service.ts:172` (upsert)           | role-match |
| `el-templo-api/src/app.ts` (mod: register plugin)                                                | config         | —                | registro `userRoutes` (líneas 230-232)                                            | exact      |
| `el-templo-api/src/modules/subscriptions/service.ts` (mod: gate en `getBasePrice`)               | service        | CRUD             | sí mismo (4230-4239)                                                              | exact      |
| `el-templo-api/src/db/migrations/0166_*.sql` (nuevo: seed idempotente)                           | migration      | batch            | `0157_seed_finance_overdue_threshold.sql`                                         | exact      |
| `el-templo-api/test/` settings + efecto precio (nuevo)                                           | test           | request-response | `test/finance/coach-load-alta.test.ts`                                            | exact      |

## Pattern Assignments

### `AlumnosPage.vue` — header prominente (D-01), acción de cobro en fila (D-02), renames (D-06), gating niveles (D-07)

**Analog:** el propio archivo (865 líneas — cabe entero en contexto).

**Header actual** (líneas 20-44): tres acciones al mismo nivel — export (btn flat round), "Nuevo en Prueba" (warning dense), "Nuevo" (primary dense). D-01 = "Crear alumno" pasa a primario grande (label completo, no-dense) y los otros dos se degradan. El flujo ya existe: `@click="showCreateDialog = true"` (línea 42) → `MemberFormDialog` (línea 291) → `onMemberSaved` (líneas 813-828, con encadenado a AssignPlanDialog).

**Fila de acciones actual** (líneas 280-287) — patrón a extender con el botón de cobro:

```vue
<template #body-cell-acciones="props">
  <q-td :props="props">
    <q-btn
      flat
      dense
      round
      icon="edit"
      color="primary"
      @click="viewMember(props.row)"
    >
      <q-tooltip>Editar alumno</q-tooltip>
    </q-btn>
  </q-td>
</template>
```

Navegación existente como referencia: `viewMember` hace `router.push(`/alumnos/${member.id}`)` (líneas 791-793). El nuevo botón hace `router.push({ path: '/cobros', query: { memberId: String(props.row.id) } })`. Ampliar `style: 'width: 80px'` de la columna `acciones` (línea 583).

**Renames D-06** — ocurrencias exactas de "Avatar"/"Sin avatar" en este archivo:

- Línea 150: `label="Avatar"` del q-select de filtro → "Categoría".
- Líneas 467-481: `avatarFilterOptions` — solo cambia `{ label: 'Sin avatar', value: 'none' }` (línea 480) → "Sin categoría". Los labels A-K describen el avatar, no usan la palabra.
- Línea 555: columna `{ name: 'avatar', label: 'Avatar', ... }` → "Categoría".
- El mecanismo (`filters.avatarType`, `props.row.avatarType`, API param) queda intacto.

**Gating niveles D-07** — superficies a condicionar por el flag:

- Columna nivel: entrada `nivel` de `columns` (líneas 545-552) + template `#body-cell-nivel` (241-248). Hay precedente de columnas computadas: `visibleColumns` (línea 592) ya es un `computed` — filtrar ahí por el flag es el punto natural.
- Filtro nivel: q-select (líneas 110-121) + `levelFilterOptions` (440-448).
- `LEVEL_GREEK_MAP`/`greekLevel()` (598-609) quedan (no se borra lógica).

**Export Excel** (líneas 749-783): `membersApi.exportMembers(...)` manda filtros incl. `level`; el xlsx se arma server-side (ver hallazgo 5).

---

### `CobrosPage.vue` — consumo de `?memberId=` (D-02) y gate de `getBasePriceFor` (D-03/D-04)

**Analog deep-link:** `HorariosPage.vue:911-922` — único precedente de "llegar con query param y abrir el flujo":

```typescript
onMounted(() => {
  loadBranches();
  // Deep-link from AlumnoDetailPage's "Sesión de Prueba" card → open the
  // Sesiones de Prueba dialog directly ...
  if (route.query.openTrials === "1") {
    const td = route.query.trialDate;
    trialsInitialDate.value = typeof td === "string" ? td : "";
    showTrialsDialog.value = true;
  }
});
```

**OJO:** CobrosPage hoy NO importa `useRoute` ni tiene `onMounted` (imports en líneas 667-689; usa `onBeforeRouteLeave` de vue-router, línea 670). Hay que agregar ambos.

**Patrón de prefill de socio** — copiar de `onUsarExistente` (dedup DNI, CobrosPage:1197-1211), que es exactamente "setear `selectedMember` desde un id externo + cargar autocompletar":

```typescript
function onUsarExistente() {
  const m = dedupMatch.value;
  if (!m) return;
  selectedMember.value = {
    id: m.id,
    displayLabel: dedupMatchName.value,
    statusLabel: m.status ?? "Sin plan",
    statusColor: "grey",
  };
  resetAltaFields();
  // WR-02: adoptar un socio existente vía dedup debe cargar su autocompletar
  void loadAutocompletar(m.id);
}
```

Shape requerido: `MemberSearchOption { id, displayLabel, statusLabel, statusColor }` (líneas 703-708). Para resolver el id → datos del socio, el mapeo label/status está en `onMemberSearch` (líneas 1331-1350) sobre `membersApi.searchMembers`. El wizard arranca en `currentStep = 0` (portada, línea 712); el prefill debe además entrar al paso 1 (Socio). `loadAutocompletar` (1383-1399) ya maneja el error con `$q.notify` — mismo patrón para "memberId inexistente → toast + flujo normal".

**Gate de precio** — la función a condicionar (líneas 1255-1258):

```typescript
function getBasePriceFor(
  plan: PlanListItem,
  method: LoadPaymentMethod,
  zero: boolean,
): number {
  if (method === "card") return plan.priceCreditCard ?? plan.priceRegular;
  return zero ? plan.priceZero : plan.priceRegular;
}
```

Con la regla off: la rama `card` cae a `zero ? plan.priceZero : plan.priceRegular`.

---

### `AssignPlanDialog.vue` — call site no listado (D-04, hallazgo 2)

**Dropdown que ofrece el precio tarjeta** (líneas 1206-1218):

```typescript
const priceTypeOptions = computed(() => {
  const opts = [
    { label: PRICE_TYPE_LABELS.regular, value: "regular" as PriceType },
    { label: PRICE_TYPE_LABELS.zero, value: "zero" as PriceType },
  ];
  if (
    selectedPlan.value?.priceCreditCard !== null &&
    selectedPlan.value?.priceCreditCard !== undefined
  ) {
    opts.push({
      label: PRICE_TYPE_LABELS.credit_card,
      value: "credit_card" as PriceType,
    });
  }
  return opts;
});
```

Gate: sumar `&& reglaOn` a ese `if`. El resolver local espejo está en `getBasePrice()` (líneas 1428-1438). El submit manda `priceTypeApplied` al backend (línea 1593) — por eso el gate server-side (subscriptions/service.ts) es imprescindible aunque la UI esconda la opción.

---

### `PlanFormDialog.vue` — campo Tarjeta condicional (D-05)

**Campo actual** (líneas 98-107):

```vue
<div class="col-12 col-sm-4">
  <q-input
    v-model.number="form.priceCreditCard"
    label="Tarjeta"
    type="number"
    dense
    outlined
    prefix="$"
  />
</div>
```

Envolver con `v-if="reglaOn"`. El form state/persistencia (`priceCreditCard` en líneas 317, 467, 488, 526) queda intacto (D-04: columnas se conservan).

---

### `AlumnoDetailPage.vue` — labels (D-06/D-07)

**Badge de avatar** (líneas 77-85) — el único texto "Avatar" visible es el tooltip:

```vue
<q-badge
  v-if="memberProfile.avatarType"
  color="primary"
  :label="AVATAR_LABELS[memberProfile.avatarType] ?? memberProfile.avatarType"
  outline
>
  <q-tooltip>Avatar: {{ memberProfile.avatarType }}</q-tooltip>
</q-badge>
```

**Superficies de nivel a gatear (D-07):** badge flotante con glyph griego sobre la foto (líneas 32-39, `greekLevel`) y el subtítulo `levelDisplayName(memberProfile.level)` (línea 46). Los helpers locales `LEVEL_GREEK_MAP`/`LEVEL_NAMES`/`greekLevel`/`levelDisplayName` están en 1055-1083 (duplicados de AlumnosPage — quedan, gate only).

`AVATAR_LABELS` vive en `src/types/member.ts:122-134` (valores A-K, no contienen la palabra "Avatar" — sin cambios).

---

### `templo-config.ts` — flag de superficie niveles (D-07/D-08)

**Analog exacto:** `TEMPLO_ENABLED` (líneas 16-23):

```typescript
/**
 * Central gate for the Templo-specific feature surface (Entrenamiento, Campañas,
 * Profes, landing). When multi-tenancy lands this becomes per-tenant config ...
 */
export const TEMPLO_ENABLED = true;
```

Nuevo flag hermano (p.ej. `TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED` o constante propia `= true`), consumido por AlumnosPage/AlumnoDetailPage. **Precedente de import page→config:** `DeudasPage.vue:73` ya hace `import { DEUDAS_DETAIL_ROLES } from 'src/config/templo-config'` — la regla "core no importa la config" del header aplica a la dirección types→config, no impide que pages consuman flags (AdminLayout y routes.ts también lo importan). NO reusar `canAccessTraining` (gate por-persona, D-08); el patrón correcto es el flag de superficie como `templo?: boolean` de `NAV_MODEL`.

Para la entrada de nav de la config de precios (D-05): categoría `Configuración` de `NAV_MODEL` (líneas 143-154), item con `roles: ['owner']` igual que `/usuarios` (línea 146).

---

### API — routes de la setting owner-only (D-03/D-05)

**Analog:** `el-templo-api/src/modules/users/routes.ts` — plugin completo owner-only, guard a nivel de hook (líneas 20-34):

```typescript
export const userRoutes: FastifyPluginAsync = async (fastify) => {
  const userService = new UserService(fastify.db, fastify.log);

  /** Guard: require owner role on all routes in this plugin. */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo el propietario puede gestionar usuarios",
      });
    }
  });
  // fastify.get / fastify.put con { schema } + handleServiceError en catch
```

`OWNER_ROLES` viene de `../shared/permissions` (`shared/permissions.ts:20`). Error handling: `handleServiceError(err, reply, request.log, "...")` de `../shared/error-handler` (users/routes.ts:79).

**Registro en `app.ts`** (analog líneas 229-232):

```typescript
// User management routes (owner-only staff CRUD)
await app.register(userRoutes, {
  prefix: "/api/admin/users",
});
```

**Nota D-04:** el GET de la setting lo necesita el admin también para CobrosPage/AssignPlanDialog/PlanFormDialog, que NO son owner-only (PoS la usa el coach). Owner-only aplica al WRITE; el valor debe llegar a todo el staff — o con un GET aparte con guard laxo, o embebido en un payload existente (p.ej. la lista de planes, `subscriptions/schemas.ts`). El planner decide; no gatear el read con OWNER_ROLES a ciegas.

---

### API — lectura/escritura de la setting

**Read analog:** `streaks/service.ts:273-293` (el único consumidor real de `system_settings`):

```typescript
const rows = await this.db
  .select({
    settingKey: systemSettings.settingKey,
    settingValue: systemSettings.settingValue,
  })
  .from(systemSettings)
  .where(inArray(systemSettings.settingKey, [...keys]));

const settingsMap = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
const parseOrDefault = (key: string, defaultVal: number): number => {
  const val = settingsMap.get(key);
  if (val === undefined) return defaultVal;
  ...
};
```

Patrón clave: **fallback a default cuando la key no existe** — para D-03 el default es `off` (sin recargo), y la instalación Templo queda `on` vía migración. Keys como constantes en `types.ts` del módulo (`streaks/types.ts:3` `STREAK_SETTINGS_KEYS`).

**Write analog (upsert, no existe ninguno para settings):** `ratings/service.ts:172`:

```typescript
.onDuplicateKeyUpdate({ set: { coachId } });
```

Aplicado a settings: `db.insert(systemSettings).values({ settingKey, settingValue }).onDuplicateKeyUpdate({ set: { settingValue } })` — `setting_key` es UNIQUE (`schema/system-settings.ts:16`).

**Schema existente** (`db/schema/system-settings.ts` completo, 19 líneas): `id` / `settingKey` varchar(100) UNIQUE / `settingValue` text / `updatedAt`. No se toca.

---

### API — gate server-side del precio (D-04)

**Punto único de verdad:** `subscriptions/service.ts:4230-4239`:

```typescript
private getBasePrice(plan: PlanDetail, priceType: PriceType): number {
  switch (priceType) {
    case "regular":
      return plan.priceRegular;
    case "zero":
      return plan.priceZero;
    case "credit_card":
      return plan.priceCreditCard ?? plan.priceRegular;
  }
}
```

Con la regla off, `credit_card` debe resolver a `priceRegular`. Este método lo usa `assignPlan`, que reciben AMBOS flujos:

- **Coach PoS (148):** `coach-load-routes.ts:771-778` mapea el medio → priceType antes de llamar `assignPlan`:

```typescript
// ── (b) Mapear precio + caja sugerida + assignPlan ──────────────────
// Tarjeta → priceCreditCard (recargo); si no, toggle Zero ↔ regular.
const priceTypeApplied: PriceType =
  body.paymentMethod === "card"
    ? "credit_card"
    : body.zero
      ? "zero"
      : "regular";
```

- **Admin AssignPlanDialog:** manda `priceTypeApplied` directo en el body (aceptado por `subscriptions/schemas.ts:301-303`, enum `["regular","zero","credit_card"]`).

Decisión de diseño para el planner: gatear DENTRO de `getBasePrice`/`assignPlan` cubre ambos con un cambio (recomendado); gatear solo el mapping de coach-load dejaría el bypass del admin abierto. Ojo con el efecto colateral: `priceTypeApplied` se PERSISTE en la subscription — si se gatea en `getBasePrice` sin normalizar el priceType, quedaría grabado `credit_card` con monto regular (decidir si normalizar a `regular` antes de persistir).

---

### Migración `0166` — seed idempotente (D-03)

**Analog exacto:** `db/migrations/0157_seed_finance_overdue_threshold.sql` (completo, 11 líneas — mismo caso: setting nueva en system_settings, on para El Templo):

```sql
-- 0157_seed_finance_overdue_threshold.sql
-- Phase 142 (MIG-01 / D-04): seed the pending-overdue threshold config (default 3).
-- Reuses system_settings (NO new table). Idempotent: skip if the key already exists
-- so a re-run (or a prior PUT-set value) is never clobbered.
-- NOTE: no semicolons inside these comment lines (the custom runner splits on the
-- semicolon BEFORE stripping the double-dash comments).
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'finance.pending_overdue_days', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days'
);
```

Reglas duras: migración a mano (db:generate roto), NUNCA `;` dentro de comentarios SQL (el runner splittea por `;` antes de strippear `--`), naming key con namespace (`finance.pending_overdue_days` → sugiere p.ej. `pricing.by_payment_method`). Commitear el SQL junto al código. El WHERE NOT EXISTS respeta un valor previo seteado por PUT (semántica "on para instalación existente, no clobberear").

---

### Tests de integración

**Analog:** `test/finance/coach-load-alta.test.ts` (fase 148) — mismo endpoint que hay que re-testear con la regla on/off. Estructura (líneas 30-80): imports de `createTestApp, createStaffUser, getAuthToken, registerUser, ensureEfectivoCaja` desde `../helpers`, URL base `"/api/admin/finance/coach-load"`, helper `postAlta(body, token)` con `app.inject`, header doc-comment con el inventario de escenarios. Casos nuevos mínimos: (a) GET/PUT setting con owner=200 y no-owner=403 (analog de assertions: cualquier test de users/blog owner-gated); (b) alta con `paymentMethod: "card"` y regla ON → monto = priceCreditCard; regla OFF → monto = priceRegular; (c) assignPlan admin con `priceTypeApplied: "credit_card"` y regla OFF → no aplica recargo.

**Gotcha:** `test/helpers.ts:208` incluye `schema.systemSettings` en `cleanAllTestData` — la setting hay que sembrarla en cada `beforeEach`/setup del test, el seed de la migración no sobrevive.

---

### Composable admin para la setting

**Analog:** `src/composables/useFinanceLoadApi.ts` (composable chico, tipos + funciones sobre api) o extender `useSubscriptionsApi`. Convención del repo: composables `useXxxApi` que exponen funciones async tipadas; logging con `createLogger()` (nunca console), errores `catch (err: unknown)` + `instanceof Error` (ver AlumnosPage:666-669 como patrón canónico de catch).

---

### UI de Configuración owner-only (D-05)

**Analog parcial (no hay page de settings genérica):** `UsuariosPage.vue` como page owner-only bajo la categoría Configuración (nav `roles: ['owner']`, templo-config.ts:146; ruta en `router/routes.ts:198`). La page nueva (o sección) es un toggle + save — no hay analog 1:1 de "form de settings", el patrón es: q-toggle + composable + `$q.notify` positivo/negativo (ver `onExport` de AlumnosPage:749-783 para el patrón notify + loading ref).

## Shared Patterns

### Guard owner-only (API)

**Source:** `el-templo-api/src/modules/users/routes.ts:26-34` (hook `onRequest` a nivel plugin, excerpt arriba)
**Apply to:** plugin de settings (write). `OWNER_ROLES` de `shared/permissions.ts:20`.

### Error handling API

**Source:** `users/routes.ts:79` — `handleServiceError(err, reply, request.log, "context")` de `modules/shared/error-handler`; errores con statusCode coercionados antes (líneas 64-78).
**Apply to:** todos los handlers nuevos.

### Logging + catch frontend

**Source:** `AlumnosPage.vue:342` (`const log = createLogger('AlumnosPage')`) y patrón catch 666-669:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Error desconocido';
  log.error('Error loading branches', { error: message });
}
```

**Apply to:** todo código admin nuevo (nunca console.\*, no `any`).

### Deep-link por query param

**Source:** `HorariosPage.vue:911-922` (excerpt arriba); variante tabs en `CajaPage.vue:118-130` / `DeudasPage.vue:154-166` (con `router.replace` para sincronizar).
**Apply to:** CobrosPage `?memberId=`.

### Seed idempotente en migración

**Source:** `0157_seed_finance_overdue_threshold.sql` (excerpt completo arriba).
**Apply to:** `0166`.

## No Analog Found

| File                                    | Role      | Data Flow | Reason                                                                                                                                                                                                |
| --------------------------------------- | --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI Configuración de la regla de precios | page/form | CRUD      | No existe ninguna page de settings key-value en el admin (la config de fase 142 quedó en constante server-side, hallazgo 9). Usar UsuariosPage como analog de gating + patrón toggle/notify genérico. |

## Metadata

**Analog search scope:** `el-templo-admin/src` (pages, components, composables, config, router, types), `el-templo-api/src` (modules/{users,streaks,ratings,finance,subscriptions,members,shared}, db/{schema,migrations}, app.ts), `el-templo-api/test`
**Files scanned:** ~35 (leídos en detalle: 18)
**Pattern extraction date:** 2026-07-04
