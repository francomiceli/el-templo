---
phase: 149-nav-por-categor-as-rbac
reviewed: 2026-07-02T20:20:14Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/layouts/AdminLayout.vue
  - el-templo-admin/src/pages/PlanesPage.vue
  - el-templo-admin/src/router/index.ts
  - el-templo-admin/src/router/routes.ts
  - el-templo-api/src/modules/finance/index.ts
  - el-templo-api/src/modules/finance/routes.ts
  - el-templo-api/src/modules/finance/schemas.ts
  - el-templo-api/src/modules/finance/transaction-service.ts
  - el-templo-api/src/modules/finance/types.ts
  - el-templo-api/src/modules/programs/routes.ts
  - el-templo-api/src/modules/shared/permissions.ts
  - el-templo-api/src/modules/subscriptions/routes.ts
  - el-templo-api/test/programs.test.ts
  - el-templo-api/test/rbac-sets.test.ts
  - el-templo-api/test/subscriptions/plans-crud.test.ts
findings:
  critical: 2
  warning: 3
  info: 5
  total: 10
status: issues_found
---

# Phase 149: Code Review Report

**Reviewed:** 2026-07-02T20:20:14Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Revisión adversarial de la fase 149 (nav por categorías + RBAC). El lado API está bien ejecutado: los guards per-handler D-11 cubren los 7 writes de planes/promos, el CRUD admin de Programas quedó dueño-only (D-15), la recomposición core+override de los sets RBAC mantiene los valores byte-idénticos (verificado por `rbac-sets.test.ts`), y la eliminación de la perilla de config de caja (D-13) no dejó referencias colgadas (`tsc --noEmit` verde; grep limpio de `FinanceConfigService`/`overdue-threshold`).

Sin embargo, el trazado cross-módulo de los consumidores frontend de los endpoints angostados revela **dos defectos funcionales que deben corregirse antes de shippear**: (1) angostar `GET /admin/programs` rompe dos flujos vivos del admin para roles no-dueño (la columna Programa de la PlanesPage recién abierta a empleados, y la asignación de add-ons de programa para gestion); (2) el landing por rol D-14 nunca se ejecuta en el camino principal porque `LoginPage.vue` sigue pusheando `/sessions` hardcodeado — el owner cae en Sesiones post-login, exactamente lo que D-14 quería eliminar.

Los errores de `vue-tsc` detectados en `src/utils/pdf/session-pdf-builder.ts` son pre-existentes y fuera del alcance de esta fase (ninguno toca los archivos revisados).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Angostar `GET /admin/programs` a dueño-only rompe dos consumidores frontend vivos para roles no-dueño

**File:** `el-templo-api/src/modules/programs/routes.ts:217` (guard del list), `el-templo-admin/src/pages/PlanesPage.vue:641`, `el-templo-admin/src/components/AssignProgramAddonDialog.vue:112`
**Issue:** El plan 01 cambió los 7 handlers del CRUD admin de programs — incluyendo el **GET de listado** — de `CAJA_ROLES` (gestion/admin/owner) a `PROGRAMAS_ROLES` (admin/owner). Pero dos superficies frontend accesibles a roles no-dueño dependen de ese GET vía `useProgramsApi.getPrograms()` → `GET /admin/programs`:

1. **PlanesPage (regresión + feature roto de nacimiento).** Esta misma fase abrió `/planes` a todo el staff en modo lectura (`PLANES_READ_ROLES`, D-09/D-10), y su `onMounted` llama `loadPrograms()` (línea 641) para poblar la columna "Programa". Para coach/gestion/recepcion esa llamada ahora devuelve 403 **siempre**: la columna Programa muestra `—` en todos los planes (un plan online con programa vinculado aparece como si no incluyera nada — desinforma al empleado que cotiza), y el `catch` dispara `log.error` (PlanesPage.vue:632), que **envía un evento a Sentry en cada visita de cada empleado** (per CLAUDE.md, `createLogger().error()` reporta a Sentry). Para gestion es además una regresión: pre-149 entraba a /planes y el fetch funcionaba (CAJA_ROLES).
2. **AssignProgramAddonDialog (regresión para gestion).** `MemberProgramsTab` (tab Programas de `AlumnoDetailPage`, ruta all-staff) muestra el botón "Asignar programa adicional" sin gating de rol y el diálogo carga las opciones con `listActivePrograms()` → `GET /admin/programs`. El endpoint de asignación (`POST /admin/programs/users/:userId/program-addons`) sigue permitiendo gestion/recepcion (`FINANCE_WRITE_ROLES`, D-22 — el propio plan 01 documenta que NO se toca), pero el diálogo ya no puede listar los programas: gestion ve "No se pudieron cargar los programas" y un select vacío. **Un flujo que la API permite deliberadamente quedó inalcanzable desde la UI para gestion** (pre-149 funcionaba end-to-end).

**Fix:** Separar lectura de escritura en el módulo programs, igual que se hizo con Planes (D-11 tiene `PLANES_WRITE_ROLES` + `PLANES_READ_ROLES`):

```ts
// permissions.ts
export const PROGRAMAS_ROLES = ADMIN_ROLES; // writes + analytics + detail admin
export const PROGRAMAS_LIST_ROLES = ALL_STAFF_ROLES; // GET /admin/programs (catálogo)
```

Aplicar `PROGRAMAS_LIST_ROLES` sólo al `GET /admin/programs` (routes.ts:212-228) — o, si se prefiere no reabrir el list, crear un endpoint de catálogo liviano para staff y apuntar `getPrograms()`/`listActivePrograms()` ahí. Como mínimo, si la decisión es cerrar el flujo de add-ons para gestion, hay que cerrarlo consistentemente (angostar también el endpoint de assign + ocultar el botón en `MemberProgramsTab`) y hacer el fetch de PlanesPage condicional al rol para no ruidear Sentry. Agregar test de integración que fije el contrato elegido.

### CR-02: El landing por rol (D-14) no se ejecuta en el camino principal — LoginPage sigue pusheando `/sessions` hardcodeado

**File:** `el-templo-admin/src/pages/LoginPage.vue:68` (fuera del diff, pero anula el entregable de `routes.ts:16-26` y `router/index.ts:44-54`)
**Issue:** `landingForRole()` sólo corre cuando alguien navega a `'/'`. Pero el flujo de entrada real es el login, y `LoginPage.vue` conserva `router.push('/sessions')`. Resultado post-login:

- **owner** → `/sessions` pasa `allowedRoles: ['coach','owner']` y pasa `trainingOnly` (`canAccessTraining(owner) === true`) → **el owner aterriza en Sesiones**, exactamente el comportamiento que D-14 y el propio comentario de `routes.ts:10-11` ("el owner NO cae en /sessions sino en /alumnos") declaran eliminado.
- **coach no-Fran** → `/sessions` → rebote `trainingOnly` (index.ts:62) → `/alumnos`, no el `/pagos` que D-14 define para el empleado.
- admin/gestion/recepcion aterrizan bien sólo de rebote (denegados en `/sessions` → `defaultPages`).

El entregable central de la fase ("landing por rol") queda efectivo únicamente para quien tipea la URL raíz a mano.
**Fix:**

```ts
// LoginPage.vue
await authStore.login(email.value, password.value);
router.push("/"); // deja que landingForRole() resuelva por rol
```

(y ver WR-01: para que esto funcione también en frío, el landing debe evaluarse después de `checkAuth`).

## Warnings

### WR-01: `landingForRole()` se evalúa antes de la autenticación — en carga fría de `'/'` todos los roles caen en `/pagos`

**File:** `el-templo-admin/src/router/routes.ts:16-26,38`; `el-templo-admin/src/stores/useAuthStore.ts:23`
**Issue:** En vue-router 4 los `redirect` de route-record se resuelven durante el matching, **antes** de que corra el `beforeEach` que ejecuta `checkAuth()`. `authStore.user` no se persiste (arranca `null`; sólo lo setean `login()`/`checkAuth()`). En un hard refresh o bookmark de `'/'`: `user === null` → `landingForRole()` cae al `return '/pagos'` → el guard luego autentica sobre `/pagos` y como **todos** los roles están en `PAGOS_ROLES`, nadie es rebotado: el owner/admin termina en `/pagos` en vez de `/alumnos`, y Fran en `/pagos` en vez de `/sessions`. D-14 sólo se cumple en navegaciones "calientes" dentro de la SPA.
**Fix:** Mover la decisión de landing al guard, donde el user ya está cargado:

```ts
// router/index.ts — beforeEach, después de checkAuth
if (to.path === "/") {
  return landingForRole();
}
```

y dejar en `routes.ts` un redirect estático de fallback (o ninguno, si el guard siempre resuelve).

### WR-02: Fila seed de `system_settings` queda huérfana — falta migración de limpieza para `finance.pending_overdue_days`

**File:** `el-templo-api/src/db/migrations/0157_seed_finance_overdue_threshold.sql` (seed aplicado); `el-templo-api/src/modules/finance/transaction-service.ts:1369` (nuevo lector: constante)
**Issue:** La 142 seedeó `system_settings.finance.pending_overdue_days = '3'` (migración 0157, ya aplicada en staging). La 149 borró el único lector/escritor (`FinanceConfigService` + endpoints GET/PUT) y hardcodeó `OVERDUE_DAYS = 3`, pero **no agregó migración que borre la fila**. Queda un dato muerto que aparenta ser autoritativo: si alguien (o una fase futura) edita esa fila esperando efecto, no pasa nada — la constante manda. Además, si en staging alguien ya había seteado un valor ≠ 3 vía el PUT de la 142, ese valor ahora se ignora silenciosamente y el umbral vuelve a 3 sin aviso. Convención del proyecto: los cambios de datos van por migración.
**Fix:** Agregar migración (siguiente número libre, 0163):

```sql
-- 0163_drop_finance_overdue_threshold_setting.sql
-- Phase 149 (D-13): la perilla de umbral de pendientes se eliminó. Limpia el seed de 0157.
DELETE FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days';
```

### WR-03: Deriva nav↔router — routes.ts sigue hardcodeando los mismos sets de roles que templo-config exporta

**File:** `el-templo-admin/src/router/routes.ts:104,119,126,132,137,142` vs `el-templo-admin/src/config/templo-config.ts:39,51,56,68,71`
**Issue:** La fase creó `DEUDAS_ROLES`, `REPORTES_ROLES`, `CAJA_SALDOS_ROLES`, `ANALITICAS_ROLES` y `ALL_STAFF_ROLES` como fuente única para el drawer, y el plan 04 los reutilizó en `meta.allowedRoles`… pero sólo para 3 rutas (`/planes`, `/pagos`, `/programas`). Las rutas `/caja`, `/deudas`, `/reportes`, `/analiticas`, `/alumnos`, `/horarios` y `/campanias` conservan arrays inline duplicados de esos mismos sets. Son dos fuentes de verdad para la misma decisión: una edición futura de un lado desincroniza silenciosamente visibilidad del drawer y acceso de ruta (ítem visible pero ruta rebota, o al revés) — exactamente la clase de bug que esta fase se propuso eliminar (los "7 computed ad-hoc" borrados de AdminLayout).
**Fix:** Reemplazar los arrays inline restantes por los sets exportados (`meta: { allowedRoles: DEUDAS_ROLES }`, etc.). Si preocupa profundizar la dependencia core→config (ver IN-01), mover los sets de roles a un archivo core (`src/config/rbac.ts`) del que importen tanto `templo-config.ts` como `routes.ts`.

## Info

### IN-01: El header de templo-config declara "NOTHING in the core imports this config", pero routes.ts lo importa

**File:** `el-templo-admin/src/config/templo-config.ts:7-10`; `el-templo-admin/src/router/routes.ts:5`
**Issue:** La regla de dirección de imports documentada (capa tenant, el core no la importa) queda contradicha por el propio código de la fase: `router/routes.ts` (core de ruteo) importa `PLANES_READ_ROLES`/`PAGOS_ROLES`/`DUENO_ROLES` desde el config. La contradicción doc-vs-código va a confundir la extracción multi-tenant (fase 156).
**Fix:** Corregir el comentario (aclarar que los role sets son core reexportado y sólo `NAV_MODEL`/`TEMPLO_ENABLED` son capa Templo), o separar los sets a un módulo core (misma solución que WR-03).

### IN-02: Comentario obsoleto en listPendingTray — describe el diseño de la 142 que la 149 revirtió

**File:** `el-templo-api/src/modules/finance/transaction-service.ts:1223-1224`
**Issue:** El docblock dice "thresholdDays is echoed back so 142 can swap OVERDUE_DAYS for a finance_settings read without touching the UI" — la 142 hizo ese swap y la 149 lo deshizo; el comentario describe una arquitectura que ya no existe (y contradice el comentario nuevo de las líneas 1366-1368).
**Fix:** Actualizar a "thresholdDays se devuelve para que la UI no hardcodee el umbral (hoy la constante OVERDUE_DAYS, D-13)".

### IN-03: Guards D-11 corren después de la validación de schema — un coach con payload inválido recibe 400, no 403

**File:** `el-templo-api/src/modules/subscriptions/routes.ts:157-164` (y los otros 6 handlers)
**Issue:** El check de `PLANES_WRITE_ROLES` está dentro del handler, y Fastify valida body/params antes. Un rol no autorizado con payload inválido obtiene 400 (con detalle de validación) en vez de 403 — la autorización debería preceder a la validación. Menor (no filtra datos sensibles), y los tests lo esquivan usando payloads válidos a propósito.
**Fix:** Mover el check a un `preValidation`/`onRequest` hook por handler, o a un helper `requireRoles(PLANES_WRITE_ROLES)` reutilizable — que además elimina las 7 copias idénticas del bloque (DRY: así nació el bug D-11, un endpoint nuevo que se olvide del guard inline repite la historia).

### IN-04: Huecos de cobertura en los tests RBAC nuevos

**File:** `el-templo-api/test/subscriptions/plans-crud.test.ts:270-348`; `el-templo-api/test/programs.test.ts` (bloque D-15)
**Issue:** (a) Los tests D-11 sólo prueban coach → 403; gestion y recepcion también están en `SUBSCRIPTION_ROLES` y fuera de `PLANES_WRITE_ROLES`, pero nadie lo fija. (b) Los tests D-15 prueban gestion → 403 en el CRUD pero no fijan que los endpoints que deben SEGUIR abiertos a gestion (enrollments `COACH_ROLES`, add-ons `FINANCE_WRITE_ROLES`) siguen devolviendo 200 — justamente los flujos que CR-01 demuestra que son load-bearing. (c) Los helpers puros `isNavItemVisible`/`isNavCategoryVisible` y `landingForRole` no tienen unit tests pese a ser funciones puras baratas de testear.
**Fix:** Agregar un caso gestion/recepcion → 403 en los writes de planes; un caso gestion → 200 en enrollments/add-ons de programs; y un spec de vitest para los helpers de templo-config.

### IN-05: `loadPromos()` falla en silencio para el usuario (inconsistente con `loadPlans()`)

**File:** `el-templo-admin/src/pages/PlanesPage.vue:692-702`
**Issue:** El catch de `loadPromos` sólo loguea; `loadPlans` (línea 633) además notifica con `$q.notify`. Un empleado en el tab Promos con un error de red ve una tabla vacía sin feedback. Pre-existente, pero ahora hay más roles expuestos a la página.
**Fix:** Agregar `$q.notify({ type: 'negative', message: 'Error cargando promos' })` en el catch.

---

_Reviewed: 2026-07-02T20:20:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
