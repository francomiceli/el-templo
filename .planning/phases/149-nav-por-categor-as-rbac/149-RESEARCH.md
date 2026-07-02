# Phase 149: Nav por categorías + RBAC - Research

**Researched:** 2026-07-02
**Domain:** Refactor de navegación del admin (Quasar/Vue 3) + RBAC frontend/API (Fastify) — code-only, sin dependencias externas
**Confidence:** HIGH (investigación 100% sobre el código base; cada claim tiene file:line)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: 2 niveles estrictos como default white-label.** Dueño = `owner` + `admin` (ven todo el MVP). Empleado = `coach` + `gestion` + `recepcion` (ven: Cobros/Pagos, Planes read-only, Alumnos, Horarios).
- **D-02: Excepción Templo — gestion.** En El Templo, gestion **además** ve Reportes y Deudas. NO es core: vía overrides Templo (D-06).
- **D-03: Excepción Templo — coach y Deudas.** Core white-label: Deudas es dueño-only. En El Templo, **todos los coaches** ven el tab Deudas simplificado (excepción por tenant/deployment, NO por persona). El aviso de deuda en la PoS (v5.3) es core y no cambia.
- **D-04: Gating frontend + API consistentes.** Sin puertas traseras: la seguridad real vive en la API (patrón fase 142).
- **D-05: Verificar usuarios reales antes de shippear.** Verificar qué usuarios tienen rol `gestion`/`recepcion` en prod antes del downgrade (paso manual/UAT — NO SSH sin permiso).
- **D-06: Config central en código.** Un solo lugar por app que declara features Templo activas y overrides RBAC (p.ej. `templo-config.ts` en admin + extensión de `shared/permissions.ts` en API). Sin infra nueva; converge al patrón `04-mecanismo-modulos.md`.
- **D-07: Sección "Templo" al final del drawer.** Campañas, Profes/Puntuaciones, Blog, Gladius, Academy, App Waitlist, Labs, Franquicias → sección propia al final, gate Templo + rol de cada item. Todo sigue navegable como hoy.
- **D-08: Entrenamiento se muda a la sección Templo.** Sesiones/Programador/Ejercicios/Árbol dejan de ser la primera sección, manteniendo `canAccessTraining()` intacto.
- **D-09: Misma PlanesPage condicionada por rol.** Sin página nueva: oculta crear/editar/archivar y dialogs para el empleado.
- **D-10: Alcance de lectura = planes de pago + promos vigentes.** Programas (rutinas) NO se le muestra al empleado.
- **D-11: Cerrar la escritura en la API.** Agrega guards de escritura dueño-only (admin/owner) en el CRUD de plans y promo-plans; GET abiertos a staff.
- **D-12: Headers + items planos, como hoy.** Mismo patrón del drawer, re-agrupado en 4 categorías MVP + Configuración + Templo. Sin componentes de expansión.
- **D-13: Huérfanos.** Notificaciones y Usuarios → sección "Configuración" (roles actuales). **ConfiguracionCajaPage se elimina por completo** — página, entrada nav y el setting "Umbral de pendientes (días)" (queda el default hardcodeado).
- **D-14: Landing por rol.** `/` redirige: empleado → Cobros/Pagos; dueño → Alumnos; Fran Scaine → Sesiones vía `canAccessTraining`.
- **D-15: Programas queda dentro de la categoría Planes, dueño-only.** El empleado no lo ve. La fase 156 decide su destino final.

### Claude's Discretion

- Naming exacto de la sección Templo del drawer y de la sección "Configuración".
- Íconos y orden interno de items dentro de cada categoría.
- Detalle de implementación de la redirección por rol (guard del router vs redirect dinámico).
- Cómo estructurar internamente `templo-config.ts` / la extensión de permissions (mientras cumpla D-06).

### Deferred Ideas (OUT OF SCOPE)

- **Destino final de Programas (rutinas)** — subcategoría Templo gateada: se decide en la **fase 156**. En 149 queda dentro de Planes, dueño-only.
- Rediseño de pantallas internas (fases 150-156), tenants, correcciones de Analíticas.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                      | Research Support                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAV-01 | Nav agrupado en Finanzas / Alumnos / Horarios / Planes; Pagos/Caja/Analíticas/Reportes/Deudas dentro de Finanzas | Inventario nav actual (§Nav Actual) + modelo de nav derivado (§Pattern 1); todos los items ya existen como rutas planas                           |
| NAV-02 | Finanzas (completa) + edición de Planes solo owner/admin; el empleado no las ve                                  | Sets de roles (§RBAC Sets) + guards API existentes (§Guards API); solo falta widening de `/planes` a empleado read-only y cerrar write API (D-11) |
| NAV-03 | Empleado ve solo "Pagos" en Finanzas + Planes en modo lectura (incluye + precios)                                | `/pagos` ya visible a coach (isPagosVisible, línea 252 AdminLayout); PlanesPage condicionales (§PlanesPage)                                       |
| NAV-04 | Campañas, Profes/Puntuaciones, landing/marketing fuera del nav MVP, gateadas por rol/flag, no borradas           | Sección Templo (D-07/D-08) + gate Templo central (D-06); rutas se conservan, solo se re-agrupan                                                   |

</phase_requirements>

## Summary

Esta fase es un **refactor de navegación + endurecimiento de RBAC**, 100% sobre código existente en `el-templo-admin` (Quasar/Vue 3) y `el-templo-api` (Fastify). No hay dependencias externas, ni schema nuevo, ni librerías a instalar. El mecanismo de gating por ruta (`meta.allowedRoles` + guard en `router/index.ts`) y el registro central de roles (`shared/permissions.ts`) ya están cableados desde la fase 66 — la fase **re-declara y agrupa**, no inventa infraestructura.

El insight más importante es que, para El Templo (único tenant hoy), **el comportamiento efectivo de RBAC casi no cambia**: los sets actuales `CAJA_ROLES` (Reportes) y `COACH_DEBTS_ROLES` (Deudas) ya equivalen a los sets "core + override Templo" que pide D-02/D-03. El refactor los re-expresa como `core white-label` + `overrides Templo` centralizados (D-06), sin alterar quién ve qué en El Templo. Los cambios de comportamiento **reales** son cuatro: (1) el empleado (coach/recepcion) **gana** acceso read-only a Planes; (2) se **cierran** los writes de plans/promo-plans en la API (hoy un coach puede crear planes por API — bug de seguridad confirmado, D-11); (3) `/` deja de redirigir siempre a `/sessions` y pasa a landing por rol (D-14); (4) `ConfiguracionCajaPage` y su setting se borran (D-13).

El riesgo técnico principal es la **DRY del drawer**: hoy hay 7 computed ad-hoc en `AdminLayout.vue` (líneas 228-259) que duplican los `allowedRoles` de `routes.ts` con comentarios "keep in sync". La re-estructuración es la oportunidad de derivar la visibilidad del drawer de una **única definición de nav** (categorías → items → roles/gate). La seguridad real sigue viviendo en la API (D-04); el nav solo esconde.

**Primary recommendation:** Crear un modelo de navegación declarativo único por app (categorías + items + roles + gate Templo) del que se deriven tanto el drawer de `AdminLayout.vue` como los `meta.allowedRoles` de `routes.ts`; centralizar los sets dueño/empleado + overrides Templo en `shared/permissions.ts` (API) y su espejo admin; cerrar los writes de plans/promo-plans en `subscriptions/routes.ts`; y borrar por completo `ConfiguracionCajaPage` + el setting de umbral, dejando el default `OVERDUE_DAYS=3` hardcodeado.

## Architectural Responsibility Map

| Capability                                           | Primary Tier                                                      | Secondary Tier                               | Rationale                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Agrupación visual del nav (categorías/headers/items) | Frontend (admin drawer)                                           | —                                            | Puramente UI; `AdminLayout.vue` + modelo de nav            |
| Gating de visibilidad del drawer por rol             | Frontend (admin)                                                  | —                                            | Esconde items; NO es seguridad (D-04)                      |
| Guard de acceso por ruta (`allowedRoles`)            | Frontend (router guard)                                           | —                                            | UX (evita pantallas vacías/loops); NO es seguridad real    |
| **Seguridad real de datos (403)**                    | **API (Fastify onRequest/per-handler)**                           | —                                            | "La seguridad real vive en la API" (fase 142, D-04)        |
| Sets de roles + overrides Templo                     | API (`shared/permissions.ts`)                                     | Frontend (espejo admin)                      | Fuente de verdad de roles; el admin espeja para el drawer  |
| Landing por rol                                      | Frontend (router guard / redirect)                                | —                                            | Decisión de ruteo, no de datos                             |
| Read-only de Planes                                  | Frontend (PlanesPage condicionales) + **API (write guards D-11)** | —                                            | UI oculta controles; **API bloquea writes** (defensa real) |
| Setting umbral de pendientes                         | API (`finance/config-service`) → **eliminado**                    | Frontend (ConfiguracionCajaPage → eliminado) | D-13: se borra; default hardcodeado en constante           |

## Nav Actual — Inventario Exhaustivo

> Fuente: `el-templo-admin/src/router/routes.ts` (allowedRoles) + `el-templo-admin/src/layouts/AdminLayout.vue` (computed de visibilidad). `[VERIFIED: codebase]`.

### Rutas y sus `meta.allowedRoles`

| Ruta                              | Página                     | `allowedRoles` (routes.ts:línea)                    | Computed drawer (AdminLayout)           | Categoría destino MVP                                  |
| --------------------------------- | -------------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `/`                               | redirect → `/sessions`     | (línea 14)                                          | —                                       | **Landing por rol (D-14)**                             |
| `/sessions`                       | SessionsPage               | `[coach, owner]` +trainingOnly (18)                 | `canSeeTraining` (232)                  | **Templo** (Entrenamiento, D-08)                       |
| `/sessions/edit`, `/sessions/:id` | SessionEdit\*              | `[coach, owner]` +trainingOnly (23,28)              | `canSeeTraining`                        | Templo                                                 |
| `/generate`                       | GeneratePage               | `[coach, owner]` +trainingOnly (33)                 | `canSeeTraining`                        | Templo                                                 |
| `/exercises`                      | ExercisesPage              | `[coach, owner]` +trainingOnly (38)                 | `canSeeTraining`                        | Templo                                                 |
| `/tree-map`                       | TreeMapPage                | `[coach, owner]` +trainingOnly (43)                 | `canSeeTraining`                        | Templo                                                 |
| `/alumnos` (+`/:userId`)          | AlumnosPage / AlumnoDetail | `[coach, admin, owner, gestion, recepcion]` (49,56) | header "Gestion" (siempre)              | **Alumnos** (libre)                                    |
| `/horarios`                       | HorariosPage               | `[coach, admin, owner, gestion, recepcion]` (87)    | siempre                                 | **Horarios** (libre)                                   |
| `/pagos`                          | PagosPage                  | `[coach, gestion, admin, owner]` (81)               | `isPagosVisible` (252)                  | **Finanzas** (empleado SÍ ve)                          |
| `/caja`                           | CajaPage                   | `[admin, owner]` (73)                               | `isCajaSaldosRole` (259)                | **Finanzas** (dueño-only)                              |
| `/analiticas`                     | AnaliticasPage             | `[admin, owner]` (100)                              | `isAdminRole` (235)                     | **Finanzas** (dueño-only)                              |
| `/reportes`                       | ReportesPage               | `[gestion, admin, owner]` (105)                     | `isCajaRole` (238)                      | **Finanzas** (dueño + gestion via Templo)              |
| `/deudas`                         | DeudasPage                 | `[coach, gestion, admin, owner]` (94)               | `isCoachDebtsRole` (242)                | **Finanzas** (dueño + coach/gestion via Templo)        |
| `/planes`                         | PlanesPage                 | `[gestion, admin, owner]` (62)                      | `isCajaRole` (238)                      | **Planes** (dueño full; empleado read-only → widening) |
| `/programas`                      | ProgramasPage              | `[gestion, admin, owner]` (67)                      | `isCajaRole` (238)                      | **Planes** (dueño-only, D-15)                          |
| `/campanias`                      | CampaniasPage              | `[admin, owner]` (110)                              | `isAdminRole` (235)                     | **Templo** (D-07)                                      |
| `/puntuaciones`                   | PuntuacionesPage           | `[owner]` (170)                                     | `isOwnerRole` (247)                     | **Templo** (Profes, D-07)                              |
| `/blog` (+`/new`,`/:id`)          | Blog\*                     | `[owner]` (115,120,125)                             | `isOwnerRole` (bloque "Landing")        | **Templo** (D-07)                                      |
| `/gladius`                        | GladiusProducts            | `[owner]` (130)                                     | `isOwnerRole`                           | Templo                                                 |
| `/academy`                        | AcademyInquiries           | `[owner]` (135)                                     | `isOwnerRole`                           | Templo                                                 |
| `/app-waitlist`                   | AppWaitlist                | `[owner]` (140)                                     | `isOwnerRole`                           | Templo                                                 |
| `/labs-inquiries`                 | LabsInquiries              | `[owner]` (145)                                     | `isOwnerRole`                           | Templo                                                 |
| `/franquicias` (+`/:id`)          | Franchise\*                | `[owner]` (150,155)                                 | `isOwnerRole`                           | Templo                                                 |
| `/usuarios`                       | UsuariosPage               | `[owner]` (160)                                     | `isOwnerRole` (bloque "Administracion") | **Configuración** (D-13)                               |
| `/notificaciones`                 | NotificacionesPage         | `[admin, owner]` (165)                              | `isAdminRole`                           | **Configuración** (D-13)                               |
| `/configuracion-caja`             | ConfiguracionCajaPage      | `[admin, owner]` (178)                              | `isAdminRole`                           | **ELIMINAR por completo (D-13)**                       |

### Los 7 computed ad-hoc del drawer (AdminLayout.vue:228-259) — la duplicación a resolver

| Computed           | Roles                                          | Línea | Duplica                                                  |
| ------------------ | ---------------------------------------------- | ----- | -------------------------------------------------------- |
| `canSeeTraining`   | `canAccessTraining(user)` (owner ∨ email Fran) | 232   | trainingOnly guard                                       |
| `isAdminRole`      | `[admin, owner]`                               | 235   | allowedRoles de /analiticas, /campanias, /notificaciones |
| `isCajaRole`       | `[gestion, admin, owner]`                      | 238   | allowedRoles de /planes, /programas, /reportes           |
| `isCoachDebtsRole` | `[coach, gestion, admin, owner]`               | 242   | allowedRoles de /deudas + `COACH_DEBTS_ROLES` (API)      |
| `isOwnerRole`      | `owner`                                        | 247   | allowedRoles de /usuarios, /puntuaciones, landing        |
| `isPagosVisible`   | `[coach, gestion, admin, owner]`               | 252   | allowedRoles de /pagos + `FINANCE_LOAD_ROLES` (API)      |
| `isCajaSaldosRole` | `[admin, owner]`                               | 259   | allowedRoles de /caja                                    |

**Pitfall crítico:** cada computed lleva un comentario "keep in sync". Son cuatro fuentes de verdad para la misma matriz (computed, allowedRoles, sets de la API, y ahora los sets nuevos dueño/empleado). El objetivo DRY es reducirlas.

## RBAC Sets — Mecanismo Actual y Extensión

> Fuente: `el-templo-api/src/modules/shared/permissions.ts`. Enum de roles verificado en `src/db/schema/users.ts:16` = `member, coach, admin, owner, gestion, recepcion`. `[VERIFIED: codebase]`.

### Sets existentes relevantes

| Set                           | Valor                                   | Consumidor                                                       | Línea |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------- | ----- |
| `ALL_STAFF_ROLES`             | coach, admin, owner, gestion, recepcion | login gating admin                                               | 11    |
| `OWNER_ROLES`                 | owner                                   | franchise, users, blog, gladius, academy, waitlist, labs         | 20    |
| `ADMIN_ROLES`                 | admin, owner                            | analíticas (financiero), notificaciones, config-caja per-handler | 23    |
| `CAJA_ROLES`                  | gestion, admin, owner                   | **reports/routes.ts (Reportes)**                                 | 64    |
| `ANALYTICS_OPERATIONAL_ROLES` | gestion, admin, owner                   | analytics operacional (asistencia)                               | 70    |
| `COACH_DEBTS_ROLES`           | coach, gestion, admin, owner            | **Deudas (tab simplificado)**                                    | 80    |
| `SUBSCRIPTION_ROLES`          | coach, admin, owner, gestion, recepcion | **guard module-wide subscriptions**                              | 115   |
| `FINANCE_LOAD_ROLES`          | owner, admin, gestion, recepcion, coach | endpoints de carga PoS                                           | 143   |
| `FINANCE_READ_ROLES`          | owner, admin, gestion, recepcion        | guard module-wide finance                                        | 152   |
| `canAccessTraining(user)`     | owner ∨ email == Fran                   | Entrenamiento (frontend + API)                                   | 52    |

### Mapeo negocio → enum (D-01) y overrides Templo (D-02/D-03/D-06)

**Core white-label (2 niveles):**

- **Dueño** = `owner` + `admin` (= `ADMIN_ROLES` existente)
- **Empleado** = `coach` + `gestion` + `recepcion`

**Sets "core" propuestos (nuevos, en permissions.ts):**

- `FINANZAS_ROLES_CORE` = dueño (owner/admin) — Caja, Analíticas, Reportes, Deudas core son dueño-only
- `PLANES_WRITE_ROLES` = dueño (owner/admin) — cierra D-11
- `PLANES_READ_ROLES` = todo staff (empleado incluido) — read-only Planes
- Pagos: ya `FINANCE_LOAD_ROLES` incluye coach → empleado ve Pagos ✓

**Overrides Templo (D-06 — declarados en UN solo lugar):**

- `gestion` → +Reportes +Deudas (D-02)
- `coach` (todos) → +Deudas simplificado (D-03)

**Observación clave `[VERIFIED: codebase]`:** los sets efectivos de El Templo HOY ya son:

- Reportes = `CAJA_ROLES` = {gestion, admin, owner} = dueño + gestion-override → **sin cambio**
- Deudas = `COACH_DEBTS_ROLES` = {coach, gestion, admin, owner} = dueño + coach-override + gestion-override → **sin cambio**

Por eso el refactor de estos sets es una **re-expresión** (core + override), no un cambio de comportamiento para El Templo. El valor está en dejarlos white-label para la tenancy futura. **El planner debe verificar que los sets efectivos resultantes sean byte-idénticos a los actuales** para Reportes/Deudas (test de no-regresión).

### D-06 — Mecanismo de config Templo (patrón `04-mecanismo-modulos.md`)

Regla de dirección de imports: **módulo/override → core**, nunca core → Templo. Un solo archivo por app:

- **API:** extender `shared/permissions.ts` con una función/objeto de overrides Templo (p.ej. `TEMPLO_RBAC_OVERRIDES`) que compone los sets efectivos a partir de los core. Explícito, marcado, sin infra nueva.
- **Admin:** un `templo-config.ts` (o similar) que declara features Templo activas (Entrenamiento, Campañas, Profes, landing) + overrides de rol, consumido por el modelo de nav.

Cuando llegue la tenancy, este objeto pasa a ser config por tenant. `[CITED: .docs/saas-multitenancy/04-mecanismo-modulos.md, CONTEXT D-06]`.

## Guards API — Inventario y Confirmación de D-11

> `[VERIFIED: codebase]` con file:line.

| Módulo API         | Guard module-wide                                                                      | Per-handler                                                      | Archivo:línea                             |
| ------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| **subscriptions**  | `SUBSCRIPTION_ROLES` (5 staff) en `onRequest`                                          | **NINGUNO en writes** ⚠️                                         | `subscriptions/routes.ts:94-105`          |
| finance            | `FINANCE_READ_ROLES` (owner/admin/gestion/recepcion)                                   | FINANCE_VOID/ADJUSTMENT/WRITE por handler; ADMIN_ROLES en config | `finance/routes.ts:204-207` + per-handler |
| reports (Reportes) | `CAJA_ROLES` (gestion/admin/owner)                                                     | —                                                                | `reports/routes.ts:53-55`                 |
| analytics          | `ANALYTICS_OPERATIONAL_ROLES` + `ADMIN_ROLES` para sensibles (`requireAdminAnalytics`) | ADMIN_ROLES por endpoint                                         | `analytics/routes.ts:62,95-98`            |
| notifications      | `authenticate` + per-handler `ADMIN_ROLES` / `OWNER_ROLES`                             | sí                                                               | `notifications/routes.ts:263,466`         |
| users              | `OWNER_ROLES` en `onRequest`                                                           | —                                                                | `users/routes.ts:28`                      |
| members            | `MEMBER_ROLES` + `MEMBER_LIFECYCLE_ROLES` / `FINANCE_READ_ROLES` per-handler           | sí                                                               | `members/routes.ts:98,1002`               |

### D-11 CONFIRMADO — bug de seguridad real

`subscriptions/routes.ts:92-105`: el único guard es `onRequest` con `SUBSCRIPTION_ROLES` (los 5 roles staff, **incluye coach**). Los handlers de escritura **NO tienen guard extra**:

- `POST /plans` (línea ~153), `PUT /plans/:planId` (~168), `PATCH /plans/:planId/deactivate` (~186), `POST /bulk-migrate` (~199)
- `POST /promo-plans` (~584), `PATCH /promo-plans/:promoId` (~597), `PATCH /promo-plans/:promoId/deactivate` (~614)

**→ un coach puede crear/editar/archivar planes y promos por API hoy.** D-11 pide agregar un check `PLANES_WRITE_ROLES` (owner/admin) por handler en estos 7 endpoints, dejando los GET (`/plans`, `/plans/:planId`, `/promo-plans`) abiertos a staff. Patrón a copiar: el per-handler check de `finance/routes.ts:1047` (`if (!(ROLES).includes(request.user.role)) return reply.code(403)`).

## PlanesPage.vue — Controles de Escritura a Condicionar (D-09/D-10)

> `el-templo-admin/src/pages/PlanesPage.vue` (751 líneas). `[VERIFIED: codebase]`.

Ya existe un computed `isOwner = user.role === 'owner'` (línea 389) que hoy solo controla el selector de país (línea 29, `v-if="isOwner"`). Para el empleado hay que ocultar (necesita un nuevo computed de "puede editar planes", = dueño = owner/admin, NO solo owner):

| Control                                      | Línea aprox                    | Acción                                                         |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Tab "Promos"                                 | 20                             | Mostrar (read-only del listado — D-10 incluye promos vigentes) |
| Botón "Nuevo Plan"                           | 47 (`@openCreateDialog`)       | Ocultar para empleado                                          |
| Botón editar plan (por fila)                 | 134-143 (`@openEditDialog`)    | Ocultar                                                        |
| Botón desactivar/archivar plan               | 144-154 (`@confirmDeactivate`) | Ocultar                                                        |
| Botones editar/desactivar (segunda tabla)    | 234-254                        | Ocultar                                                        |
| Botón "Nueva Promo"                          | 276 (`@openCreatePromoDialog`) | Ocultar                                                        |
| Botón desactivar promo                       | 336-346                        | Ocultar                                                        |
| Dialogs `PlanFormDialog` / `PromoFormDialog` | 260, 351                       | Nunca abrir para empleado (ya cerrados si no hay trigger)      |

**Nota D-15:** `/programas` (ProgramasPage) es ruta separada, NO parte de PlanesPage. Queda dentro de la categoría Planes en el nav pero dueño-only (el empleado no ve el item). No requiere cambios en PlanesPage.

**Pitfall:** el computed actual es `isOwner` (solo owner). "Dueño" en D-01 = owner **+ admin**. Crear un computed nuevo (p.ej. `canEditPlans` = `['owner','admin'].includes(role)`) o reusar el espejo del set; NO reutilizar `isOwner` que excluiría al admin de editar planes.

## ConfiguracionCajaPage — Eliminación Completa (D-13)

> `[VERIFIED: codebase]`. La perilla de fase 142 se borra por decisión explícita del usuario.

### Inventario de TODO lo que hay que borrar

**Frontend admin:**

- `el-templo-admin/src/pages/ConfiguracionCajaPage.vue` (92 líneas) — borrar
- `el-templo-admin/src/composables/useFinanceConfigApi.ts` — borrar (único consumidor es la página)
- `el-templo-admin/src/router/routes.ts:172-179` — borrar la ruta `configuracion-caja`
- `el-templo-admin/src/layouts/AdminLayout.vue:179-184` — borrar el `<q-item to="/configuracion-caja">`

**API:**

- `el-templo-api/src/modules/finance/routes.ts:1043-1080` — borrar los endpoints `GET`/`PUT /config/overdue-threshold`
- `el-templo-api/src/modules/finance/config-service.ts` — `FinanceConfigService.setOverdueThreshold` (write) queda huérfano; ver decisión abajo
- `el-templo-api/src/modules/finance/schemas.ts:825` — `getOverdueThresholdSchema` / `putOverdueThresholdSchema` — borrar
- `el-templo-api/src/modules/finance/types.ts:550-554` — `OverdueThresholdBody` — borrar
- `el-templo-api/test/finance-config.test.ts` — **borrar el archivo de test entero** (prueba GET/PUT config)

### Decisión requerida sobre el read-path (default hardcodeado)

`FinanceConfigService.getOverdueThreshold()` es consumido por `transaction-service.ts:1384` (`listPendingTray` — la bandeja de pendientes). Hay dos formas de cumplir "queda el default hardcodeado":

- **Opción A (recomendada — más limpia):** eliminar `FinanceConfigService` por completo y hacer que `transaction-service.ts:1384` use la constante `OVERDUE_DAYS` (`finance/constants.ts:16` = 3) directamente. Garantiza "hardcodeado" sin depender de la ausencia de la fila en `system_settings`. Toca `transaction-service.ts` (constructor línea 130-132, campo 123) y su firma. **Recomendada** porque no deja código muerto ni depende del estado de la DB de prod.
- **Opción B (mínima):** borrar solo los endpoints/página/write, dejar `getOverdueThreshold()` leyendo (que cae a `OVERDUE_DAYS` cuando la fila está ausente). **Riesgo:** si en prod ya existe la fila `finance.pending_overdue_days` con un valor ≠ 3, el umbral NO sería el "default hardcodeado". Ver Runtime State Inventory.

**Recomendación:** Opción A. Si se elige B, requiere una migración que borre la fila `finance.pending_overdue_days` de `system_settings` (ver Runtime State Inventory).

## Router Guard y Landing por Rol (D-14)

> `el-templo-admin/src/router/index.ts`. `[VERIFIED: codebase]`.

El guard `beforeEach` (líneas 25-68) ya: (1) chequea `public`, (2) `checkAuth`, (3) `allowedRoles` con un `defaultPages` map de fallback por rol (líneas 44-54), (4) `trainingOnly` via `canAccessTraining` con fallback a `/alumnos` (líneas 60-64).

Hoy `/` → redirect estático a `/sessions` (`routes.ts:14`). D-14 lo reemplaza por landing por rol:

- Fran Scaine (training coach) → `/sessions`
- Dueño (owner/admin) → `/alumnos`
- Empleado (coach/gestion/recepcion) → `/pagos` (Cobros)

**Pitfall de orden `[VERIFIED: codebase]`:** `canAccessTraining` devuelve `true` para **cualquier owner** (línea 53 de permissions.ts / trainingAccess.ts). Si el landing usa `canAccessTraining` para mandar a `/sessions`, el **owner caería en Sessions, no en Alumnos** (viola D-14). El landing debe distinguir:

1. Si `role === 'coach' && canAccessTraining(user)` (= el coach exclusivo Fran, no el owner) → `/sessions`
2. Sino, dueño (owner/admin) → `/alumnos`
3. Sino, empleado → `/pagos`

Implementación (discrecional, D): reemplazar el `redirect: '/sessions'` estático por una función `redirect: () => ...` que lea el auth store, o resolverlo en el `beforeEach` cuando `to.path === '/'`. El `defaultPages` map existente (44-54) también debería alinearse con D-14 (hoy manda owner→/sessions, gestion/recepcion→/alumnos; tras 149 empleado→/pagos).

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
   Login/rol  ──▶   │  el-templo-admin (Quasar/Vue)               │
                    │                                             │
                    │  templo-config.ts ──┐                       │
                    │  (features + over-  │                       │
                    │   rides Templo)     ▼                       │
                    │              ┌──────────────┐               │
                    │              │ NAV MODEL     │  (fuente     │
                    │              │ categorías →  │   única)     │
                    │              │ items → roles │               │
                    │              │ + gate Templo │               │
                    │              └──────┬───┬────┘               │
                    │        deriva       │   │  deriva           │
                    │            ┌────────▼┐ ┌▼──────────┐        │
                    │            │ Drawer   │ │ routes.ts │        │
                    │            │ (Admin   │ │ allowed   │        │
                    │            │  Layout) │ │ Roles     │        │
                    │            └──────────┘ └─────┬─────┘        │
                    │                               │ consume     │
                    │                        ┌──────▼──────┐      │
                    │  landing por rol ◀─────│ router guard│      │
                    │  (D-14)                │ beforeEach  │      │
                    │                        └─────────────┘      │
                    └──────────────────────────┬──────────────────┘
                                                │ HTTP (Bearer)
                                                ▼
                    ┌─────────────────────────────────────────────┐
                    │  el-templo-api (Fastify)                    │
                    │                                             │
                    │  shared/permissions.ts                      │
                    │   core sets + TEMPLO_RBAC_OVERRIDES (D-06)  │
                    │        │ consumido por                      │
                    │        ▼                                    │
                    │  onRequest hooks + per-handler role checks  │
                    │  ┌──────────┬──────────┬─────────────────┐  │
                    │  │subscript.│ finance  │ reports/analytics│  │
                    │  │+WRITE    │ (guards  │ (CAJA/ADMIN     │  │
                    │  │guard D-11│  ya OK)  │  ROLES)         │  │
                    │  └──────────┴──────────┴─────────────────┘  │
                    │        ▲ 403 = seguridad REAL (D-04)        │
                    └─────────────────────────────────────────────┘
```

### Pattern 1: Modelo de nav declarativo → deriva drawer + routes (DRY)

**What:** Una sola estructura de datos que declara categorías MVP (Finanzas/Alumnos/Horarios/Planes) + Configuración + Templo, cada una con sus items, roles permitidos, gate Templo e ícono. Tanto el drawer como los `allowedRoles` se derivan de ella.

**When to use:** Reemplaza los 7 computed ad-hoc + los `allowedRoles` inline. Header visible sólo si ≥1 item visible (así el empleado ve "Finanzas" con sólo "Pagos" dentro).

**Example (esquema — no verificado en el repo, es diseño propuesto):**

```typescript
// templo-config.ts / nav-model.ts (admin) — [ASSUMED: diseño propuesto]
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
// El drawer itera categorías; una categoría/ítem se muestra si roles.includes(userRole)
// (y, si templo, si el gate Templo está activo). routes.ts puede importar los mismos
// `roles` para su meta.allowedRoles → una sola fuente de verdad.
```

**Nota de alcance (discrecional, D):** Derivar `routes.ts` del modelo puede ser invasivo (Vue Router necesita el array al bootear). Una alternativa "engineered enough" es que ambos importen los **sets de roles** desde un módulo compartido, aunque las rutas sigan declaradas explícitas. El planner decide el grado de derivación; mínimo aceptable: eliminar los 7 computed y que la visibilidad del drawer derive de una tabla, no de flags sueltos.

### Pattern 2: Core + override Templo en permissions.ts (dirección de import módulo→core)

**What:** Definir sets `*_CORE` (2 niveles limpios) y un objeto `TEMPLO_RBAC_OVERRIDES` que los compone en los sets efectivos. El core nunca importa lo Templo.

**When to use:** Para Reportes (core=dueño, +gestion) y Deudas (core=dueño, +coach+gestion). Verificar que los efectivos == sets actuales.

### Anti-Patterns to Avoid

- **Gate Templo inline en páginas:** los overrides Templo van marcados y centralizados (D-06), nunca `if (email === 'Scaine...')` disperso. El único gate por-persona permitido es `canAccessTraining` (ya centralizado).
- **Confiar en el nav para seguridad:** esconder un item NO protege el endpoint. Todo cambio de visibilidad debe tener su guard API espejo (D-04). El caso D-11 es la prueba: el item de Planes estaba escondido para coach pero la API lo dejaba escribir.
- **Reusar `isOwner` para "puede editar":** excluye a `admin`, que es dueño (D-01).
- **Landing con `canAccessTraining` a secas:** manda al owner a Sessions (viola D-14).

## Don't Hand-Roll

| Problem                        | Don't Build              | Use Instead                                                                    | Why                                    |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------ | -------------------------------------- |
| Gating por ruta                | Guard nuevo              | `meta.allowedRoles` + `router/index.ts` beforeEach (ya cableado)               | Mecanismo existente fase 66            |
| Gate Entrenamiento por persona | Nuevo check de email     | `canAccessTraining()` (API + espejo admin)                                     | Ya centralizado, seed-stable por email |
| Sets de roles                  | Arrays inline por página | `shared/permissions.ts` (API) + espejo admin                                   | Fuente única; evita drift              |
| Per-handler 403                | Middleware nuevo         | Patrón `if(!ROLES.includes(role)) reply.code(403)` de `finance/routes.ts:1047` | Consistente con el resto de la API     |
| Config key-value               | Tabla nueva              | `system_settings` (reusada) — pero D-13 la **borra** para el umbral            | N/A este phase (se elimina)            |

**Key insight:** Todo lo necesario ya existe. Esta fase NO agrega infraestructura; reorganiza, endurece writes y borra la perilla de config-caja.

## Runtime State Inventory

> Fase de refactor + eliminación de config → inventario de estado runtime obligatorio.

| Category                | Items Found                                                                                                                                                                                           | Action Required                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored data**         | Posible fila `finance.pending_overdue_days` en `system_settings` (prod/staging) creada por la UI de fase 142 (setOverdueThreshold). Si existe con valor ≠ 3, contradice "default hardcodeado" (D-13). | **Opción A** (leer constante `OVERDUE_DAYS` directo en transaction-service): la fila se vuelve irrelevante, no requiere migración. **Opción B** (dejar el read-path): requiere migración `DELETE FROM system_settings WHERE setting_key='finance.pending_overdue_days'`. Recomendada A. |
| **Live service config** | Ninguna. El nav/RBAC vive 100% en código; no hay config en UI/DB externa (n8n/Datadog/etc.) que referencie estas rutas.                                                                               | Ninguna — verificado: el gating es code-only.                                                                                                                                                                                                                                           |
| **OS-registered state** | Ninguna. No hay tasks/cron que dependan de rutas del admin o de la config-caja. `getOverdueThreshold` solo lo usa `listPendingTray` (request-time).                                                   | Ninguna.                                                                                                                                                                                                                                                                                |
| **Secrets/env vars**    | Ninguna. `TRAINING_EXCLUSIVE_COACH_EMAIL` es constante en código (no env). No hay env var de roles.                                                                                                   | Ninguna.                                                                                                                                                                                                                                                                                |
| **Build artifacts**     | Ninguna. Cambios TS/Vue recompilan en el pipeline normal (build de los 3 apps en CI).                                                                                                                 | Ninguna.                                                                                                                                                                                                                                                                                |

**Verificación de usuarios reales (D-05):** El enum `users.role` incluye `gestion` y `recepcion` `[VERIFIED: schema users.ts:16]`. Los tests y helpers (`test/helpers.ts:454`, `createStaffUser`) los usan. **Cuántos usuarios reales tienen `gestion`/`recepcion` en prod es un paso manual/UAT — NO SSH sin permiso del usuario.** Para El Templo, como los sets efectivos de Reportes/Deudas no cambian, el "downgrade de gestion" no le quita nada a gestion en El Templo (la excepción Templo lo mantiene). El riesgo operativo real del downgrade solo aparece si algún tenant futuro no tiene la excepción — no aplica hoy.

## Common Pitfalls

### Pitfall 1: Sets efectivos que cambian sin querer para El Templo

**What goes wrong:** Al reescribir Reportes/Deudas como "core dueño-only", si olvidás aplicar el override Templo, gestion/coach pierden acceso que hoy tienen.
**Why it happens:** El core white-label es más restrictivo que el comportamiento actual de El Templo.
**How to avoid:** Test de no-regresión: los sets efectivos de Reportes (=CAJA_ROLES) y Deudas (=COACH_DEBTS_ROLES) deben ser byte-idénticos post-refactor. Confirmar con gestion/coach tokens que siguen viendo Reportes/Deudas.
**Warning signs:** Un test de integración de reports/deudas con token gestion o coach empieza a dar 403.

### Pitfall 2: Landing manda al owner a Sessions

**What goes wrong:** `canAccessTraining(owner) === true` → owner cae en `/sessions` en vez de `/alumnos`.
**How to avoid:** El landing debe chequear `role === 'coach' && canAccessTraining` para Sessions; owner/admin → alumnos.
**Warning signs:** UAT: loguearse como owner y aterrizar en Sesiones.

### Pitfall 3: Cerrar writes de plans rompe el flujo del owner/admin o el PoS

**What goes wrong:** Al agregar `PLANES_WRITE_ROLES`, si el set es demasiado estrecho (solo owner) el admin no puede crear planes; o si tocás el guard module-wide, se rompe el assign/renew del PoS (que usa coach).
**How to avoid:** El write-guard es **per-handler** solo en los 7 endpoints de CRUD de plans/promo-plans. NO tocar el `onRequest` module-wide `SUBSCRIPTION_ROLES` (lo usan assign/renew/pause del PoS con coach). `PLANES_WRITE_ROLES` = owner+admin (dueño), no solo owner.
**Warning signs:** El test `plans-crud.test.ts` (usa adminToken) empieza a dar 403; o el PoS profe (fase 148) no puede asignar planes.

### Pitfall 4: Header de categoría vacío para el empleado

**What goes wrong:** El empleado ve un header "Finanzas" con nada debajo (o Planes vacío) porque los items internos están gateados.
**How to avoid:** La visibilidad del header debe derivar de "≥1 item visible". Finanzas para empleado = solo Pagos → header visible con un item. Planes para empleado = read-only del listado → visible.
**Warning signs:** Headers huérfanos en el drawer del empleado.

### Pitfall 5: Borrar config-caja deja imports/consumidores colgados

**What goes wrong:** Borrás `useFinanceConfigApi`/`FinanceConfigService` pero queda un import o el constructor de `transaction-service` roto → falla el typecheck.
**How to avoid:** Seguir el inventario completo de D-13 arriba; si Opción A, ajustar el constructor de `TransactionService` (línea 130) y todos sus call-sites (revisar `finance/routes.ts:85-94` y tests que instancian el service). Borrar `finance-config.test.ts`.
**Warning signs:** `tsc` falla con "Cannot find module" o firma de constructor.

## Code Examples

### Cerrar write de plans (D-11) — patrón per-handler

```typescript
// Source: patrón de finance/routes.ts:1047 [VERIFIED: codebase]
// En subscriptions/routes.ts, dentro de cada handler POST/PUT/PATCH de plans y promo-plans:
if (!(PLANES_WRITE_ROLES as readonly string[]).includes(request.user.role)) {
  return reply
    .code(403)
    .send({ error: "Acceso denegado", message: "Solo owner/admin" });
}
```

### Set core + override Templo (D-06)

```typescript
// Source: diseño propuesto sobre shared/permissions.ts [ASSUMED]
export const REPORTES_ROLES_CORE = ADMIN_ROLES; // owner, admin
export const DEUDAS_ROLES_CORE = ADMIN_ROLES; // owner, admin
// Overrides Templo — un solo lugar, dirección override→core:
export const TEMPLO_RBAC_OVERRIDES = {
  reportes: ["gestion"], // D-02
  deudas: ["coach", "gestion"], // D-03
} as const;
// Efectivos (deben == CAJA_ROLES / COACH_DEBTS_ROLES actuales):
export const REPORTES_ROLES = [
  ...REPORTES_ROLES_CORE,
  ...TEMPLO_RBAC_OVERRIDES.reportes,
];
export const DEUDAS_ROLES = [
  ...DEUDAS_ROLES_CORE,
  ...TEMPLO_RBAC_OVERRIDES.deudas,
];
```

## State of the Art

No aplica librerías externas — refactor sobre stack existente (Quasar 2 / Vue 3 / Fastify). Sin cambios de versión.

## Assumptions Log

| #   | Claim                                                                                                        | Section                   | Risk if Wrong                                                           |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| A1  | Estructura exacta de `templo-config.ts` / nav-model (esquema propuesto) es discrecional (D)                  | Pattern 1 / Code Examples | Bajo — CONTEXT marca esto como discrecional                             |
| A2  | Nombres de sets nuevos (`PLANES_WRITE_ROLES`, `REPORTES_ROLES_CORE`, `TEMPLO_RBAC_OVERRIDES`) son propuestos | RBAC Sets / Code Examples | Bajo — naming interno, el planner ajusta                                |
| A3  | En prod puede existir una fila `finance.pending_overdue_days` con valor ≠ 3                                  | Runtime State Inventory   | Medio — determina si D-13 necesita migración (Opción B) o no (Opción A) |
| A4  | Opción A (constante directa) es la interpretación correcta de "default hardcodeado" (D-13)                   | ConfiguracionCajaPage     | Medio — confirmar con usuario si prefiere migración de limpieza         |
| A5  | El write-guard de D-11 debe ser owner+admin (dueño), no solo owner                                           | Guards API / Pitfall 3    | Medio — D-01 define dueño=owner+admin; confirmar que admin edita planes |

## Open Questions (RESOLVED)

> Las 3 preguntas quedaron resueltas en el planning de la fase (planes 149-02/03/04). Resolución anotada inline.

1. **¿Opción A o B para el read-path del umbral (D-13)?**
   - **RESOLVED (Plan 02):** Opción A. El read-path lee la constante `OVERDUE_DAYS=3` directo y se elimina `FinanceConfigService`; sin migración. La fila `finance.pending_overdue_days` en prod queda irrelevante.
   - What we know: `listPendingTray` (transaction-service:1384) lee el umbral vía `getOverdueThreshold()`, que cae a `OVERDUE_DAYS=3` si la fila está ausente.
   - What's unclear: si prod tiene una fila con valor ≠ 3.
   - Recommendation: Opción A (leer la constante directo, eliminar FinanceConfigService) — garantiza "hardcodeado" sin depender del estado de la DB, no requiere migración. Confirmar en discuss/plan.

2. **¿Grado de derivación del nav-model?**
   - **RESOLVED (Plan 03/04):** Opción intermedia. `templo-config.ts` (Plan 03) exporta el `NAV_MODEL` + los sets de rol espejo; el drawer deriva del modelo. `routes.ts` (Plan 04) NO se deriva del modelo completo: sólo comparte los sets de rol (`PLANES_READ_ROLES`, `PAGOS_ROLES`, `DUENO_ROLES`) para el `meta.allowedRoles`. Se resuelve la deuda DRY (7 computed eliminados) sin acoplar el router al modelo del drawer.
   - What we know: los 7 computed deben desaparecer; el drawer debe derivar de una tabla.
   - What's unclear: si `routes.ts` también se deriva del modelo o solo comparte los sets de roles.
   - Recommendation: mínimo, compartir los sets; ideal, derivar el drawer del modelo. Discrecional (D).

3. **¿El empleado ve el header "Finanzas" con solo Pagos, o Pagos va suelto?**
   - **RESOLVED (Plan 03):** Header "Finanzas" visible con sólo Pagos para el empleado. Deriva de `isNavCategoryVisible` ("≥1 item visible") en `templo-config.ts`.
   - What we know: doc §1 dice "el profe solo podrá ver Pagos (de los de finanzas)".
   - Recommendation: header "Finanzas" visible con un solo item (Pagos) para el empleado; deriva de "≥1 item visible". UX-detail, confirmar en UAT.

## Environment Availability

Step 2.6: SKIPPED — cambios 100% code/config sobre los 3 apps existentes, sin dependencias externas (sin nuevos servicios, CLIs, runtimes ni DB nueva). Toolchain existente (pnpm/Node/MySQL de test) ya presente en el pipeline.

## Package Legitimacy Audit

No aplica — esta fase **no instala ningún paquete externo**. Es refactor + endurecimiento de RBAC sobre código y dependencias ya presentes. Sin `npm install`.

## Validation Architecture

> `workflow.nyquist_validation` ausente en config.json → habilitado.

### Test Framework

| Property           | Value                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest (API) — `el-templo-api/test/` contra MySQL real (`eltemplo_test`)                                             |
| Config file        | `el-templo-api/` (ver package.json `pnpm test`)                                                                      |
| Quick run command  | `cd el-templo-api && pnpm test <archivo>`                                                                            |
| Full suite command | `cd el-templo-api && pnpm test` (corre en CI al pushear a staging — **no correr suite completa local**, ver memoria) |
| Frontend           | Sin suite de tests de componentes; verificación de nav/drawer = typecheck + UAT visual                               |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                         | Test Type   | Automated Command                                                            | File Exists?                                                |
| --------- | ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| NAV-02    | Coach/recepcion 403 en POST/PUT/PATCH plans y promo-plans (D-11) | integration | `pnpm test subscriptions/plans-crud`                                         | ⚠️ Ampliar (hoy solo prueba member 403, línea 224) — Wave 0 |
| NAV-02    | GET /plans sigue abierto a staff (coach 200)                     | integration | `pnpm test subscriptions/plans-crud`                                         | ❌ Wave 0 (nuevo caso)                                      |
| NAV-02/03 | Reportes: efectivo == {gestion,admin,owner} (no-regresión)       | integration | `pnpm test reports`                                                          | ✅ (existe cobertura reports) — verificar con token gestion |
| NAV-03    | Deudas: efectivo == {coach,gestion,admin,owner} (no-regresión)   | integration | (según ubicación de deudas — finance/members)                                | ⚠️ Verificar cobertura                                      |
| D-13      | Endpoints /config/overdue-threshold removidos (404)              | integration | eliminar `finance-config.test.ts`; opcional test de que la ruta ya no existe | ✅ borrar archivo                                           |
| NAV-01/04 | Nav agrupado + Templo/Config secciones + landing por rol         | manual/UAT  | — (frontend sin test runner)                                                 | UAT visual                                                  |

### Sampling Rate

- **Per task commit:** `cd el-templo-api && pnpm test <archivo-afectado>` + `pnpm typecheck` (API y admin)
- **Per wave merge:** typecheck de los 3 apps + tests de subscriptions/reports afectados
- **Phase gate:** CI verde en staging (suite completa corre en CI, no local) + UAT visual del nav

### Wave 0 Gaps

- [ ] Ampliar `el-templo-api/test/subscriptions/plans-crud.test.ts` — casos: coach token → 403 en POST/PUT/PATCH plans y promo-plans; coach token → 200 en GET /plans (D-11)
- [ ] Test de no-regresión Reportes/Deudas con tokens gestion y coach (efectivos sin cambio)
- [ ] Borrar `el-templo-api/test/finance-config.test.ts` (endpoints eliminados por D-13)
- [ ] Ajustar cualquier test que instancie `TransactionService` si se elige Opción A (constructor sin `FinanceConfigService`)

## Security Domain

> `security_enforcement` ausente en config.json → habilitado.

### Applicable ASVS Categories

| ASVS Category         | Applies          | Standard Control                                                                                                                                  |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no (sin cambios) | JWT Bearer existente (`fastify.authenticate`)                                                                                                     |
| V3 Session Management | no               | —                                                                                                                                                 |
| **V4 Access Control** | **yes**          | RBAC por rol: onRequest hooks + per-handler role checks (`shared/permissions.ts`). Esta fase endurece V4 (cierra D-11). Fail-closed: default 403. |
| V5 Input Validation   | parcial          | Schemas Fastify existentes en subscriptions; no se agregan inputs nuevos (se borran los de config-caja)                                           |
| V6 Cryptography       | no               | —                                                                                                                                                 |

### Known Threat Patterns for admin RBAC (Fastify)

| Pattern                                                                     | STRIDE                         | Standard Mitigation                                                                 |
| --------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| **Broken access control — coach escribe planes por API** (D-11, confirmado) | Elevation of Privilege         | Per-handler `PLANES_WRITE_ROLES` en los 7 writes de plans/promo-plans; GET abiertos |
| Puerta trasera: nav esconde pero API permite                                | Elevation of Privilege         | D-04: todo cambio de visibilidad tiene guard API espejo; seguridad real en la API   |
| Regresión de roles al refactorizar sets                                     | Elevation / DoS (403 indebido) | Test de no-regresión de sets efectivos (Reportes/Deudas byte-idénticos)             |
| Landing/guard loop (coach → /sessions trainingOnly → bounce)                | DoS (UX)                       | Landing por rol correcto (Pitfall 2); guard ya maneja el bounce a /alumnos          |

## Sources

### Primary (HIGH confidence — codebase, file:line)

- `el-templo-admin/src/router/routes.ts` — inventario de rutas + allowedRoles
- `el-templo-admin/src/layouts/AdminLayout.vue` — drawer + 7 computed (228-259)
- `el-templo-admin/src/router/index.ts` — guard beforeEach + defaultPages + trainingOnly
- `el-templo-admin/src/types/admin.ts` — AdminRole + RouteMeta
- `el-templo-admin/src/utils/trainingAccess.ts` — espejo canAccessTraining
- `el-templo-admin/src/pages/PlanesPage.vue` — controles de escritura (isOwner línea 389)
- `el-templo-admin/src/pages/ConfiguracionCajaPage.vue` + `composables/useFinanceConfigApi.ts`
- `el-templo-api/src/modules/shared/permissions.ts` — todos los sets de roles
- `el-templo-api/src/modules/subscriptions/routes.ts` — guard module-wide + writes sin guard (D-11)
- `el-templo-api/src/modules/finance/routes.ts` (204, 1043-1080), `config-service.ts`, `constants.ts`, `transaction-service.ts:1384`
- `el-templo-api/src/modules/{reports,analytics,notifications,users,members}/routes.ts` — guards
- `el-templo-api/src/db/schema/users.ts:16` — enum de roles
- `el-templo-api/test/{subscriptions/plans-crud,finance-config,helpers}.ts` — cobertura actual

### Secondary (design docs)

- `.docs/saas-multitenancy/Correcciones El Templo.md` §1 — categorías nav + RBAC dueño/empleado
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` §1/§5 — RBAC vs enum, riesgo tenancy
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — patrón módulos/override→core (D-06)
- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — 15 decisiones locked

## Metadata

**Confidence breakdown:**

- Inventario nav + guards API: HIGH — todo verificado file:line en el código
- Extensión RBAC (core+override): HIGH — sets actuales confirman equivalencia; naming propuesto es discrecional
- D-11 (writes sin guard): HIGH — confirmado en subscriptions/routes.ts
- Eliminación config-caja: HIGH inventario; MEDIUM en la decisión A vs B (depende de estado prod)
- Landing por rol: HIGH — guard existente leído; pitfall del owner verificado en canAccessTraining

**Research date:** 2026-07-02
**Valid until:** ~2026-08-01 (código estable; revalidar si otra fase toca permissions.ts, routes.ts o el módulo finance antes de ejecutar)
