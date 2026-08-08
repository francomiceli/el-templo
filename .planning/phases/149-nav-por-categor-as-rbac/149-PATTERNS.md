# Phase 149: Nav por categorías + RBAC - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 16 (a crear / modificar / borrar)
**Analogs found:** 15 / 16 (1 archivo nuevo sin analog directo — el nav-model declarativo)

> Fase de **refactor + endurecimiento de RBAC**, 100% sobre código existente. No hay schema nuevo, ni librerías, ni servicios externos. Casi todos los "analogs" son el propio archivo a modificar (in-place refactor) — la columna Analog apunta al patrón vecino a **copiar/mantener**, no a un archivo lejano. Todos los excerpts abajo están verificados file:line.

---

## File Classification

| Archivo (crear/modificar/borrar)                                               | Rol                | Data Flow                            | Analog más cercano                                                    | Match            |
| ------------------------------------------------------------------------------ | ------------------ | ------------------------------------ | --------------------------------------------------------------------- | ---------------- |
| `el-templo-admin/src/config/templo-config.ts` **(nuevo)**                      | config / nav-model | transform (deriva drawer + roles)    | `shared/permissions.ts` (API, sets centralizados)                     | role-match       |
| `el-templo-admin/src/layouts/AdminLayout.vue` **(mod)**                        | layout / drawer    | request-response (render por rol)    | sí mismo (drawer actual, líneas 17-186)                               | in-place / exact |
| `el-templo-admin/src/router/routes.ts` **(mod)**                               | route config       | config                               | sí mismo (meta.allowedRoles actuales)                                 | in-place / exact |
| `el-templo-admin/src/router/index.ts` **(mod)**                                | router guard       | request-response (redirect)          | sí mismo (`beforeEach` + `defaultPages` líneas 25-64)                 | in-place / exact |
| `el-templo-admin/src/pages/PlanesPage.vue` **(mod)**                           | page / component   | CRUD (write controls)                | sí mismo (`isOwner` línea 389 + `v-if` línea 29)                      | in-place / exact |
| `el-templo-admin/src/types/admin.ts` **(mod opcional)**                        | types              | —                                    | sí mismo (`AdminRole` + `RouteMeta`)                                  | in-place         |
| `el-templo-admin/src/pages/ConfiguracionCajaPage.vue` **(borrar)**             | page               | — (D-13)                             | —                                                                     | delete           |
| `el-templo-admin/src/composables/useFinanceConfigApi.ts` **(borrar)**          | composable         | — (D-13)                             | —                                                                     | delete           |
| `el-templo-api/src/modules/shared/permissions.ts` **(mod)**                    | RBAC registry      | config / transform                   | sí mismo (sets `CAJA_ROLES`/`COACH_DEBTS_ROLES`/`FINANCE_LOAD_ROLES`) | in-place / exact |
| `el-templo-api/src/modules/subscriptions/routes.ts` **(mod)**                  | route / controller | request-response (per-handler guard) | `finance/routes.ts:1047` (per-handler 403)                            | exact            |
| `el-templo-api/src/modules/finance/routes.ts` **(mod)**                        | route / controller | — (borrar 2 endpoints config)        | sí mismo (líneas 1043-1085)                                           | delete-in-place  |
| `el-templo-api/src/modules/finance/transaction-service.ts` **(mod, Opción A)** | service            | transform (leer constante)           | `finance/constants.ts` (`OVERDUE_DAYS`)                               | role-match       |
| `el-templo-api/src/modules/finance/config-service.ts` **(borrar, Opción A)**   | service            | — (D-13)                             | —                                                                     | delete           |
| `el-templo-api/src/modules/finance/{schemas,types}.ts` **(mod)**               | schemas/types      | — (borrar defs config)               | sí mismo                                                              | delete-in-place  |
| `el-templo-api/test/subscriptions/plans-crud.test.ts` **(ampliar)**            | test               | integration                          | sí mismo + `test/helpers.ts` (`createStaffUser`)                      | exact            |
| `el-templo-api/test/finance-config.test.ts` **(borrar)**                       | test               | — (D-13)                             | —                                                                     | delete           |

---

## Shared Patterns

Estos 4 patrones transversales son la columna vertebral de la fase — cada archivo abajo los referencia.

### 1. Sets de roles centralizados (fuente única)

**Source:** `el-templo-api/src/modules/shared/permissions.ts`
**Apply to:** toda la superficie RBAC (API + espejo admin)

Los sets ya viven acá como `as const` tuples con JSDoc explicando el consumidor. El patrón a **imitar** para los sets nuevos (`PLANES_WRITE_ROLES`, `PLANES_READ_ROLES`, y el objeto de overrides Templo):

```typescript
// permissions.ts:23,64,80 — cada set documenta su consumidor
export const ADMIN_ROLES = ["admin", "owner"] as const; // = "Dueño" (D-01)
export const CAJA_ROLES = ["gestion", "admin", "owner"] as const; // Reportes (efectivo)
export const COACH_DEBTS_ROLES = [
  "coach",
  "gestion",
  "admin",
  "owner",
] as const; // Deudas (efectivo)
export const FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"] as const; // spread compose
```

**Regla clave (D-06, dirección override→core):** los sets efectivos se **componen** desde un core + overrides Templo, igual que `FINANCE_LOAD_ROLES` ya hace spread de `FINANCE_WRITE_ROLES`. El core nunca importa lo Templo. Verificar no-regresión: `REPORTES` efectivo debe seguir siendo byte-idéntico a `CAJA_ROLES` = `{gestion,admin,owner}`, y `DEUDAS` a `COACH_DEBTS_ROLES` = `{coach,gestion,admin,owner}`.

### 2. Espejo admin de un check de la API (`canAccessTraining`)

**Source:** `el-templo-admin/src/utils/trainingAccess.ts` (espeja `permissions.ts:52`)
**Apply to:** el `templo-config.ts` nuevo (espejo de los overrides Templo del backend)

El patrón de espejo ya existe: `trainingAccess.ts` copia literal la lógica de `canAccessTraining` de la API, con un JSDoc que apunta al backend ("Mirrors the backend TRAINING_EXCLUSIVE_COACH_EMAIL in ..."). El `templo-config.ts` debe seguir esta convención: declarar los mismos overrides/features Templo con un comentario que referencie `shared/permissions.ts`.

```typescript
// trainingAccess.ts:11,17 — espejo con JSDoc que cita el backend
export const TRAINING_EXCLUSIVE_COACH_EMAIL = "Scaine7@hotmail.com";
export function canAccessTraining(
  user: Pick<AdminUser, "role" | "email"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return (
    !!user.email &&
    user.email.toLowerCase() === TRAINING_EXCLUSIVE_COACH_EMAIL.toLowerCase()
  );
}
```

### 3. Per-handler 403 (seguridad real en la API — D-04/D-11)

**Source:** `el-templo-api/src/modules/finance/routes.ts:1047`
**Apply to:** los 7 writes de plans/promo-plans en `subscriptions/routes.ts`

Patrón exacto a copiar en cada handler de escritura (POST/PUT/PATCH), **además** del guard module-wide (que NO se toca):

```typescript
// finance/routes.ts:1047-1052 — per-handler gate sobre el guard module-wide
if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
  return reply.code(403).send({
    error: "Acceso denegado",
    message: "Solo owner/admin",
  });
}
```

Nótese el cast `as readonly string[]` (idéntico al guard module-wide `subscriptions/routes.ts:97`). Para D-11 el set es `PLANES_WRITE_ROLES` (= owner+admin, NO solo owner — ver Pitfall research).

### 4. Guard module-wide `onRequest` (NO tocar en esta fase)

**Source:** `el-templo-api/src/modules/subscriptions/routes.ts:94`
**Apply to:** referencia — este guard queda intacto (lo usan assign/renew/pause del PoS con coach)

```typescript
// subscriptions/routes.ts:94-105 — guard module-wide, SE CONSERVA
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(SUBSCRIPTION_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso de administrador requerido",
    });
  }
  await attachCountryScope(request, fastify.db);
});
```

---

## Pattern Assignments

### `el-templo-admin/src/config/templo-config.ts` (config / nav-model — NUEVO)

**Analog:** `shared/permissions.ts` (patrón de sets centralizados) + `trainingAccess.ts` (patrón de espejo). No hay analog directo de "modelo de nav declarativo" en el repo → es diseño nuevo (discrecional D, ver RESEARCH Pattern 1).

**Qué declara:** (a) features Templo activas (Entrenamiento, Campañas, Profes, landing) y (b) overrides RBAC Templo (`reportes: +gestion`, `deudas: +coach,+gestion`). Consumido por el drawer y opcionalmente por `routes.ts`.

**Esquema propuesto** (RESEARCH líneas 331-349, marcado `[ASSUMED]`):

```typescript
interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles: AdminRole[];
  templo?: boolean;
  trainingOnly?: boolean;
}
interface NavCategory {
  header: string;
  items: NavItem[];
  templo?: boolean;
}
```

**Convención a heredar:** espejo con JSDoc que cita `shared/permissions.ts` (ver Shared Pattern 2). Import direction: el config puede importar `AdminRole` de `types/admin.ts`; nada del core importa este config.

**Íconos existentes a reusar** (del drawer actual, AdminLayout.vue): `people` (Alumnos), `calendar_month` (Horarios), `point_of_sale` (Pagos/Caja), `request_quote` (Deudas), `card_membership` (Planes), `school` (Programas/Academy), `analytics` (Analíticas), `summarize` (Reportes), `campaign` (Campañas), `groups` (Profes), `fitness_center` (Sesiones/Gladius), `manage_accounts` (Usuarios), `notifications` (Notificaciones).

---

### `el-templo-admin/src/layouts/AdminLayout.vue` (drawer — MODIFICAR)

**Analog:** sí mismo (drawer actual líneas 17-186 + 7 computed 228-259). El refactor **reemplaza** los 7 computed ad-hoc por derivación desde el nav-model, manteniendo el patrón visual `q-item-label header` + `q-item`.

**Patrón visual a MANTENER** (D-12 — headers + items planos, sin expansión):

```vue
<!-- AdminLayout.vue:51-59 — patrón header + item + separator -->
<q-separator v-if="canSeeTraining" />
<q-item-label header>Gestion</q-item-label>
<q-item clickable v-ripple to="/alumnos">
  <q-item-section avatar><q-icon name="people" /></q-item-section>
  <q-item-section>Alumnos</q-item-section>
</q-item>
```

**Los 7 computed a ELIMINAR** (líneas 235-259) — hoy duplican `allowedRoles` con comentarios "keep in sync":

```typescript
// AdminLayout.vue:235-259 — la duplicación a resolver
const isAdminRole = computed(() => ["admin", "owner"].includes(userRole.value));
const isCajaRole = computed(() =>
  ["gestion", "admin", "owner"].includes(userRole.value),
);
const isCoachDebtsRole = computed(() =>
  ["coach", "gestion", "admin", "owner"].includes(userRole.value),
);
const isOwnerRole = computed(() => userRole.value === "owner");
const isPagosVisible = computed(() =>
  ["coach", "gestion", "admin", "owner"].includes(userRole.value),
);
const isCajaSaldosRole = computed(() =>
  ["admin", "owner"].includes(userRole.value),
);
```

`canSeeTraining` (línea 232 = `canAccessTraining(authStore.user)`) **SE CONSERVA** — Entrenamiento se muda a la sección Templo (D-08) pero sigue gateado por email.

**Header visible solo si ≥1 item visible** (Pitfall 4): la iteración del nav-model debe filtrar categorías vacías (empleado ve "Finanzas" con solo "Pagos" dentro).

**Borrar** el `<q-item to="/configuracion-caja">` (líneas 179-184, D-13).

**Nuevas secciones:** "Configuración" (Usuarios owner-only + Notificaciones admin/owner) y "Templo" al final (Entrenamiento + Campañas + Profes + landing block líneas 122-161, gateadas por el gate Templo).

---

### `el-templo-admin/src/router/routes.ts` (route config — MODIFICAR)

**Analog:** sí mismo. El array de rutas se conserva; cambian: (1) `allowedRoles` de `/planes` (widening a empleado read-only), (2) el redirect raíz, (3) borrar la ruta `configuracion-caja` (líneas 172-179).

**Patrón `meta` a mantener** (líneas 60-62, 91-96):

```typescript
{ path: 'planes', component: () => import('pages/PlanesPage.vue'),
  meta: { allowedRoles: ['gestion', 'admin', 'owner'] as AdminRole[] } }, // → widening a empleado
```

**Landing por rol (D-14)** — reemplazar el redirect estático de la línea 14:

```typescript
{ path: '', redirect: '/sessions' },  // ← reemplazar por redirect por rol (o resolver en beforeEach)
```

**Pitfall crítico (RESEARCH 267-273):** NO usar `canAccessTraining` a secas para el landing — devuelve `true` para todo owner → mandaría al owner a `/sessions` en vez de `/alumnos`. Orden correcto: `role==='coach' && canAccessTraining` → `/sessions`; dueño (owner/admin) → `/alumnos`; empleado → `/pagos`.

---

### `el-templo-admin/src/router/index.ts` (router guard — MODIFICAR)

**Analog:** sí mismo (`beforeEach` líneas 25-64 + `defaultPages` map 44-54). Alinear `defaultPages` con D-14.

**Patrón existente a extender** (líneas 44-51):

```typescript
// router/index.ts:44-51 — defaultPages map (ajustar empleado → /pagos)
const defaultPages: Record<string, string> = {
  owner: "/sessions", // → /alumnos (D-14)
  admin: "/alumnos",
  coach: "/sessions", // → /pagos salvo Fran (canAccessTraining)
  gestion: "/alumnos", // → /pagos (D-14)
  recepcion: "/alumnos", // → /pagos (D-14)
};
```

El bloque `trainingOnly` (líneas 59-61) con fallback a `/alumnos` **se conserva** — ya maneja el bounce del coach no-training.

---

### `el-templo-admin/src/pages/PlanesPage.vue` (page CRUD — MODIFICAR)

**Analog:** sí mismo. Ya existe el patrón `computed` de rol + `v-if` en controles.

**Patrón existente a copiar** (línea 389 + uso línea 29):

```typescript
// PlanesPage.vue:389 — computed de rol
const isOwner = computed(() => authStore.user?.role === "owner");
```

```vue
<!-- PlanesPage.vue:29 — v-if por rol sobre un control -->
<div v-if="isOwner" class="row q-gutter-md q-mb-md"> ... </div>
```

**Pitfall (RESEARCH 223):** NO reusar `isOwner` para "puede editar planes" — excluiría al `admin`, que es dueño (D-01). Crear un computed nuevo:

```typescript
const canEditPlans = computed(() =>
  ["owner", "admin"].includes(authStore.user?.role ?? ""),
);
```

Aplicar `v-if="canEditPlans"` a: botón "Nuevo Plan" (línea 47), botones editar/desactivar por fila (134-154, 234-254), "Nueva Promo" (276), desactivar promo (336-346). El listado (tabs Planes + Promos) queda visible read-only (D-10). Los dialogs `PlanFormDialog`/`PromoFormDialog` (260, 351) nunca se abren si no hay trigger.

---

### `el-templo-api/src/modules/shared/permissions.ts` (RBAC registry — MODIFICAR)

**Analog:** sí mismo. Agregar sets nuevos siguiendo el patrón `as const` + JSDoc + spread-compose (Shared Pattern 1).

**Sets a agregar** (naming propuesto, discrecional A2):

```typescript
// Core white-label (2 niveles) — D-01
export const PLANES_WRITE_ROLES = ADMIN_ROLES; // owner+admin (cierra D-11)
export const PLANES_READ_ROLES = SUBSCRIPTION_ROLES; // todo staff, read-only Planes
// Core + overrides Templo — D-02/D-03/D-06 (dirección override→core)
export const REPORTES_ROLES_CORE = ADMIN_ROLES;
export const DEUDAS_ROLES_CORE = ADMIN_ROLES;
export const TEMPLO_RBAC_OVERRIDES = {
  reportes: ["gestion"],
  deudas: ["coach", "gestion"],
} as const;
```

**No-regresión obligatoria:** el efectivo de `REPORTES` debe == `CAJA_ROLES` (`{gestion,admin,owner}`) y `DEUDAS` == `COACH_DEBTS_ROLES` (`{coach,gestion,admin,owner}`). Ver Pitfall 1 research.

---

### `el-templo-api/src/modules/subscriptions/routes.ts` (route — MODIFICAR, D-11)

**Analog:** `finance/routes.ts:1047` (Shared Pattern 3). Agregar el per-handler 403 a los 7 writes:

| Handler                                  | Línea |
| ---------------------------------------- | ----- |
| `POST /plans`                            | 153   |
| `PUT /plans/:planId`                     | 163   |
| `PATCH /plans/:planId/deactivate`        | 181   |
| `POST /bulk-migrate`                     | 198   |
| `POST /promo-plans`                      | 583   |
| `PATCH /promo-plans/:promoId`            | 597   |
| `PATCH /promo-plans/:promoId/deactivate` | 614   |

Los GET (`/plans` línea 127, `/plans/:planId` 138, `/promo-plans` 576) quedan **abiertos a staff** (sin check extra). **NO tocar** el `onRequest` module-wide (línea 94) — lo usan assign/renew del PoS con coach (Pitfall 3).

Excerpt a insertar como primera línea de cada handler write:

```typescript
if (!(PLANES_WRITE_ROLES as readonly string[]).includes(request.user.role)) {
  return reply
    .code(403)
    .send({ error: "Acceso denegado", message: "Solo owner/admin" });
}
```

---

### `el-templo-api/src/modules/finance/*` (config-caja — ELIMINAR, D-13)

**Analog:** N/A (borrado). Inventario completo (RESEARCH 229-244):

- `finance/routes.ts:1043-1085` — borrar ambos endpoints `GET`/`PUT /config/overdue-threshold` (ver excerpt abajo).
- `finance/config-service.ts` — borrar (Opción A recomendada).
- `finance/schemas.ts:825` — borrar `getOverdueThresholdSchema`/`putOverdueThresholdSchema`.
- `finance/types.ts:550-554` — borrar `OverdueThresholdBody`.

```typescript
// finance/routes.ts:1043-1085 — bloque a BORRAR (ambos endpoints)
fastify.get("/config/overdue-threshold", { schema: getOverdueThresholdSchema }, async (request, reply) => {
  if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) { return reply.code(403)... }
  const thresholdDays = await financeConfigService.getOverdueThreshold();
  return { thresholdDays };
});
fastify.put<{ Body: OverdueThresholdBody }>("/config/overdue-threshold", ...);
```

**Opción A (recomendada) — read-path a constante** (`transaction-service.ts`):
El consumidor del read-path es `transaction-service.ts:1384` (`listPendingTray` vía `getOverdueThreshold()`). Reemplazar por la constante directa:

```typescript
// finance/constants.ts:16 — usar directo en transaction-service en vez de FinanceConfigService
export const OVERDUE_DAYS = 3;
```

Ajustar el constructor de `TransactionService` (líneas 130-132, campo 123) y sus call-sites (`finance/routes.ts:85-94` + tests que lo instancian) para eliminar la dependencia de `FinanceConfigService` (Pitfall 5).

---

### `el-templo-api/test/subscriptions/plans-crud.test.ts` (test — AMPLIAR, Wave 0)

**Analog:** sí mismo + `test/helpers.ts:454` (`createStaffUser`). Casos nuevos:

- coach token → **403** en POST/PUT/PATCH plans y promo-plans (D-11).
- coach token → **200** en GET /plans (read abierto).
- Test de no-regresión Reportes/Deudas con tokens `gestion` y `coach` (efectivos sin cambio).

`test/finance-config.test.ts` → **borrar el archivo entero** (endpoints eliminados).

---

## No Analog Found

| File                                          | Rol                | Data Flow | Razón                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-admin/src/config/templo-config.ts` | config / nav-model | transform | No existe un "modelo de nav declarativo" en el repo. Es diseño nuevo (discrecional D). Hereda convenciones de `permissions.ts` (sets centralizados) + `trainingAccess.ts` (espejo con JSDoc), pero la estructura categorías→items→roles no tiene precedente directo. Ver RESEARCH Pattern 1 (`[ASSUMED]`). |

---

## Metadata

**Analog search scope:** `el-templo-admin/src/{layouts,router,pages,utils,types,config,composables}`, `el-templo-api/src/modules/{shared,subscriptions,finance,reports}`, `el-templo-api/test/`.
**Files scanned:** 8 leídos en profundidad (permissions.ts, AdminLayout.vue, routes.ts admin, router/index.ts, subscriptions/routes.ts, finance/routes.ts, PlanesPage.vue, trainingAccess.ts, types/admin.ts) + inventario file:line de RESEARCH.
**Pattern extraction date:** 2026-07-02

```

```
