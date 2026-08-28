# Phase 182: Plataforma — rol super-owner + wizard de alta de tenant - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega **la capa de plataforma mínima para dar de alta un gimnasio nuevo sin tocar la base a mano**: (1) un actor de plataforma (`platform_users`, login y JWT propios) estructuralmente separado de los roles de tenant; (2) un wizard en `el-templo-admin` (`/plataforma/*`) que crea el tenant; (3) un servicio de aprovisionamiento atómico (`provisionTenant()`) que deja el tenant utilizable y aislado desde el minuto cero: sede virtual, sede física opcional, owner inicial, `tenant_settings` y flags de módulos; (4) la precondición H-3 del doc 08 asignada a esta fase: resolución de tenant por `Host` bajo `PLATFORM_DOMAIN` + CORS dinámico + infra real (nginx wildcard + certbot DNS-01) en staging y prod.

Requirements: PLAT-01, PLAT-02, PLAT-03. El panel de tenants, métricas y suspender/archivar son **fase 183** (PLAT-04/05). El onboarding del tenant 2 real es **fase 192**.

Decisiones del doc 08 que NO se re-litigan: modelo del rol de plataforma = **Opción B (`platform_users` aparte)**; H-3 (resolución por Host, lookup exacto contra `tenants.slug`, host no resoluble = rechazo, jamás `?? 1`); defaults de `gimnasio.*` en código; wildcard DNS + cert wildcard vía DNS-01; `origin` de CORS como función con regex anclada (nunca `endsWith`); `eltemplo.org` no es dominio de plataforma.

</domain>

<decisions>
## Implementation Decisions

### Dominio de plataforma y subdominios

- **D-01: `PLATFORM_DOMAIN` por variable de entorno, nunca hardcodeado.** El dominio definitivo se registra en paralelo a la fase (no bloquea la planificación). `kaia.eltemplo.org` es un **valor válido de arranque/provisorio** (tenants en `<slug>.kaia.eltemplo.org`, wildcard `*.kaia.eltemplo.org` con DNS-01 contra el DNS de eltemplo.org), con el costo de branding que marca D-12 del doc 08 anotado y aceptado como provisorio. Cambiar al dominio propio después = rotar cert + vhost, sin tocar código. Agregar la variable a `.env.example` de la API (y `VITE_*` que haga falta en admin).
- **D-02: Alcance de infra: API completa + infra real en staging Y prod.** La fase entrega la capa de resolución por `Host` en la API, el CORS dinámico, **y** deja configurado en el EC2 el vhost wildcard de nginx y certbot con plugin DNS-01 (credenciales de API del DNS en el servidor), todo parametrizado por `PLATFORM_DOMAIN`. Requiere una sesión de SSH/infra **con aprobación explícita del usuario** (memoria `feedback_always_ask_before_ssh`). Runbook de infra escrito en el repo.
- **D-03: Entornos.** Local: `PLATFORM_DOMAIN=localtest.me` (resuelve a 127.0.0.1 sin tocar `/etc/hosts`); los tests de integración inyectan el header `Host`. Staging: `*.staging.<PLATFORM_DOMAIN>` con su propio cert wildcard, separado del de prod. Cada entorno tiene su dominio; nunca se cruzan.
- **D-04: Host desconocido → 404 genérico** (`TENANT_NOT_FOUND`) sin filtrar si el slug existe. Tenant suspendido/archivado → el 403 `TENANT_SUSPENDED` que ya existe. **Jamás fallback a tenant 1.**
- **D-05: NO SE TOCA NADA DE EL TEMPLO.** `admin.eltemplo.org`, `app.eltemplo.org` y la TV siguen funcionando exactamente como hoy (tenant derivado del usuario logueado, mismo login, mismo código). La capa nueva de resolución por `Host` actúa **únicamente** para hosts bajo `PLATFORM_DOMAIN`; para cualquier otro host, la API se comporta como ahora. No hay migración posterior de los hosts de El Templo al mecanismo por host — la posibilidad que el doc 08 dejaba abierta ("cuando su hostname entre al esquema") queda **descartada** para este milestone.

### Superficie y acceso del super-owner

- **D-06: La UI vive en `el-templo-admin`, sección `/plataforma/*`** (mismo build y deploy), con login propio (`POST /api/platform/auth/login`) y un **store de auth separado** del de tenant. Un usuario de tenant no ve ni puede entrar a esas rutas; el super-owner no puede entrar a rutas de tenant (criterio de éxito 1). El panel de la 183 se construye sobre esta misma sección.
- **D-07: Bootstrap por script CLI idempotente en el API** (ej. `pnpm platform:create-user --email ...`): pide la contraseña por stdin, la hashea con el mismo algoritmo que `users`, se corre una vez en el servidor. **Ningún hash queda en migraciones ni en git.** Nuevos super-owners: mismo comando. No hay pantalla de gestión de usuarios de plataforma en esta fase.
- **D-08: Seguridad del login v1: email + contraseña fuerte, sin 2FA.** JWT propio con audience/claim `platform` (distinto del de `users`), **expiración corta (~8 h, sin refresh largo)**, rate limit en el login, y **log de auditoría** de acciones de plataforma (quién, qué, cuándo, sobre qué tenant). 2FA/TOTP queda anotado como mejora futura.
- **D-09: Sesiones independientes, sin cruce.** El token de plataforma se guarda bajo una clave distinta del de tenant; `/plataforma/*` y `/api/platform/*` solo aceptan el token de plataforma, y las rutas de tenant solo el suyo. Pueden coexistir ambas sesiones en el mismo navegador; ninguna hereda nada de la otra.

### Pasos del wizard y owner inicial

- **D-10: Campos del wizard:** (1) Identidad: nombre del gimnasio + **slug = subdominio**, validado contra `RESERVED_TENANT_SLUGS` y unicidad, con preview `slug.<PLATFORM_DOMAIN>`; (2) Localización: país, moneda, zona horaria (columnas que `tenants` ya tiene); (3) Branding básico **opcional**: `brand.display_name`, colores, logo — solo se persiste lo que difiere del default; (4) Sede física opcional (ver D-12); (5) Resumen y confirmar.
- **D-11: El wizard crea el primer owner del gimnasio:** un `users` con rol `owner` en el tenant nuevo, a partir del email del dueño, con **contraseña temporal generada y mostrada una sola vez** (copiable) en la pantalla final; cambio de contraseña forzado al primer login. **Sin depender del envío de mails.**
- **D-12: Sedes:** la **sede virtual se crea automáticamente e invisible** (con `is_virtual = true` y el nombre exacto que espera `resolveUserBranchId` en `coach-load-routes.ts`, receta 07 §1.4) sin preguntar nada; además, un paso **opcional** "tu primera sede física" (nombre, dirección, cupo). Las demás sedes las carga el owner desde la pantalla de sedes existente del admin.
- **D-13: Pantalla final:** resumen con la URL `slug.<PLATFORM_DOMAIN>`, email del owner y contraseña temporal (una sola vez), y checklist de lo aprovisionado (sede virtual, sede física si la hubo, owner, módulos, settings). Botón "volver a plataforma". Sin edición ni reintentos desde ahí.

### Aprovisionamiento y aislamiento

- **D-14: Un único servicio `provisionTenant()` transaccional.** Tenant + sede virtual + sede física opcional + owner + `tenant_settings` + flags de módulos dentro de **UNA transacción**: si algo falla no queda nada a medias. Idempotente por slug (segundo intento con el mismo slug = error claro, no duplicado). Lo usan el wizard, los tests ISO y el onboarding real de la 192. **Sin script SQL paralelo ni migración de datos por tenant.**
- **D-15: Flags de módulos explícitos:** el alta escribe 5 filas en `tenant_settings`: `module.gimnasio.enabled = "true"` y los 4 `module.templo-*.enabled = "false"` (auditable con un SELECT). Los 8 parámetros `gimnasio.*` y las claves `brand.*` sí siguen la regla del doc 08 (solo se escribe lo que difiere del default en código). Nota: `"gimnasio"` entra a `MODULE_NAMES` en la 184 según el checklist H-2 del doc 08 — la 182 necesita al menos que la key exista/sea reconocida para sembrarla; el planner decide si adelanta esa entrada mínima (sin el rename `templo-module`→`feature-module`, que sigue en la 184).
- **D-16: Batería de aislamiento nueva `iso-04`** con un tenant creado por `provisionTenant()` real (no el fixture manual `seedSecondTenant`/`TENANT_DOS`), verificando: el owner nuevo no ve datos del tenant 1 ni al revés; el super-owner recibe 401/403 en rutas de tenant; un usuario de tenant recibe 401/403 en `/api/platform/*`; el host del slug nuevo resuelve y un host desconocido da 404; las iso-01..03 existentes siguen verdes.
- **D-17: Tenant `demo` de plataforma en producción** durante la fase, para UAT real de subdominio, login del owner y aislamiento. Slug reservado tipo `demo`; queda como tenant permanente de demostración; los crons `forEachActiveTenant` lo iteran pero con módulos Templo OFF no producen nada. Se archiva desde el panel de la 183 si molesta.

### Claude's Discretion

- Forma concreta de la capa de resolución por `Host` (hook/plugin previo a `attachScope`, sin cambiar la forma de `CountryScope` — asunción A9 del doc 08) y cómo convive con la lista de hosts conocidos de El Templo (D-05).
- Estructura del rate limit, del log de auditoría (tabla propia vs Pino) y de la expiración exacta del JWT de plataforma, dentro de D-08.
- Detalle del runbook de infra (certbot plugin del proveedor DNS, ubicación de credenciales, vhost wildcard) y orden de entrega infra vs API vs UI.
- Nombre exacto del comando CLI de bootstrap y del módulo de API (`src/modules/platform/`).
- Contrato de tipos API↔frontends para las rutas de plataforma: seguir el espejo manual vigente (`// Mirrors el-templo-api/...`); el paquete compartido queda diferido (ver Deferred).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño firmado (fase 181) — LA fuente de esta fase

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — **H-3** (resolución de tenant por hostname, login scoped, seguridad del `Host`, checklist con lo asignado a la 182); **Definición 7** (mapa de `tenant_settings`: 8 claves `gimnasio.*`, 7 claves `brand.*`, defaults en código, vocabulario `"true"/"false"`); **DIS-02 (f)/(g)** (wildcard DNS + cert DNS-01, vhost wildcard, CORS como función con regex anclada, `VITE_API_URL`); **"Decisiones heredadas por las fases 182-192"** (Opción B `platform_users` cerrada; dominio de plataforma como precondición; contrato de tipos abierto).
- `.docs/saas-multitenancy/07-receta-adopcion.md` §1.4 — sede virtual "Templo Online" obligatoria por gimnasio (fallback por nombre en `resolveUserBranchId`).
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — flags `module.<x>.enabled`, `requireModule` → 404, manifiesto de rutas fail-closed (toda ruta nueva de `/api/platform/*` entra al manifiesto o CI rojo).
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` §3 — "club GLOBAL": `platform_users` y el log de auditoría de plataforma son tablas sin `tenant_id` y deben clasificarse en `tenant-tables.ts` con motivo.

### Requirements y roadmap

- `.planning/REQUIREMENTS.md` — PLAT-01..03 (esta fase); PLAT-04/05 (183); ONB-01 (192).
- `.planning/ROADMAP.md` — reglas duras del milestone (migraciones desde 0216, staging-first, `tenant_settings`, aislamiento total) + success criteria de la 182.
- `.planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/181-CONTEXT.md` — D-03/D-06/D-11/D-12 (subdominio por gimnasio, branding como config por tenant, app Kaia).

### Memorias/skills operativas que condicionan la ejecución

- `.claude/skills/el-templo-change-control/` — staging-first, migraciones numeradas, aprobación antes de push/SSH.
- `.claude/skills/el-templo-db-migrations/` — runner custom, sin `;` en comentarios SQL.
- Memoria `reference_admin_nginx_no_proxea_api` — los vhosts de front no proxean `/api`: el subdominio de Kaia llama a la API siempre cross-origin.
- Memoria `reference_staging_db_same_host` — staging y prod comparten host MySQL: el tenant `demo` y los de prueba de staging deben quedar en la DB correcta.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/db/schema/tenants.ts` — `tenants` (id, name, slug único, `status` active/suspended/archived, country/currency/timezone), `tenantSettings` KV con `uq_tenant_setting`, y `RESERVED_TENANT_SLUGS` (sin consumidor de runtime aún: el wizard y la resolución por Host son sus primeros consumidores).
- `el-templo-api/src/modules/shared/modules.ts` — `MODULE_NAMES` (4 `templo-*`), `moduleFlagKey()`, `MODULE_FLAG_ON/OFF`, `DEFAULT_PUBLIC_TENANT_ID = 1` (su comentario ya anticipa que deja de valer con más de un tenant público — la 182 lo acota a los hosts de El Templo, D-05).
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`/`tenantValues`/`assertTenant` (fail-closed 403 `TENANT_UNRESOLVED`): `provisionTenant()` escribe todo vía `tenantValues(ctx, …)` con el ctx del tenant recién creado.
- `el-templo-api/src/modules/shared/country-scope.ts` — `attachScope()` y `TENANT_SUSPENDED`: la capa de resolución por Host se inserta **antes** y no cambia la forma de `CountryScope`.
- `el-templo-api/src/modules/auth/routes.ts` — login de tenant (hash de contraseña, emisión de JWT): referencia para el login de plataforma con audience distinto; la deuda T-173-15 (`.limit(1)` cross-tenant) queda **intacta** para El Templo (D-05) y se resuelve solo para el login scoped por host de Kaia (fase de la app de alumnos, fuera de la 182 salvo el endpoint scoped que el planner decida adelantar).
- `el-templo-api/test/fixtures/second-tenant.ts` (`seedSecondTenant`, `TENANT_DOS = 90671`) y `el-templo-api/test/tenancy/iso-01..03-*` — patrón de la batería ISO; `iso-04` lo replica usando `provisionTenant()`.
- `el-templo-api/src/db/schema/branches.ts` — `is_virtual`; `el-templo-api/src/modules/finance/coach-load-routes.ts` líneas ~289-322 — el nombre exacto de la sede virtual que el fallback busca.
- `el-templo-admin/src/router/index.ts` (guard `meta.allowedRoles`), `src/config/templo-config.ts` (`DUENO_ROLES`), `src/types/admin.ts` (`AdminRole`) — el guard de `/plataforma/*` es un guard **distinto** (token de plataforma), no un rol más en `AdminRole`.
- `el-templo-api/src/app.ts` — `origin` de CORS hoy es un array estático de 5 orígenes: pasa a función (regex anclada sobre `PLATFORM_DOMAIN`) manteniendo los 5 actuales.

### Established Patterns

- Módulos de API por feature en `src/modules/<x>/` con `routes.ts` + `service.ts`; el de plataforma nace en `src/modules/platform/` (auth, provisioning, audit).
- Migraciones hand-written numeradas desde **0216** (prod en 0215), SQL junto al schema Drizzle, sin `;` en comentarios.
- Tests de integración contra MySQL real en `el-templo-api/test/` con `test/helpers.ts`; usuarios de test resueltos por email, nunca ids hardcodeados.
- Manifiesto de rutas fail-closed: `/api/platform/*` necesita una categoría (o entrada `global` con motivo) en `test/tenant-manifest.ts`; `platform_users` y la tabla de auditoría van a `tenant-tables.ts` como globales.
- Frontend admin: Quasar + Pinia composition; store nuevo `platformAuth` independiente de `auth`.
- Deploy: `paths-filter` con `event.before` (memoria `reference_deploy_paths_filter_trap`); cambios de infra (nginx/certbot) están fuera del pipeline y se hacen en la sesión SSH aprobada.

### Integration Points

- Header `Host` → `tenants.slug` (nuevo hook previo a `attachScope`) → `TenantContext` para rutas públicas de Kaia; 404 si no resuelve; hosts de El Templo bypass total.
- `tenant_settings`: 5 flags `module.*` explícitos + `brand.*`/`gimnasio.*` solo si difieren del default.
- `forEachActiveTenant` (7 crons): el tenant nuevo y el `demo` entran a la iteración; con módulos Templo OFF los guards `requireModule`/flags deben hacerlos no-op (verificar en iso-04 o test de crons).
- nginx del EC2: vhost wildcard `*.<PLATFORM_DOMAIN>` (y `*.staging.<PLATFORM_DOMAIN>`) sirviendo el build de Kaia cuando exista; hasta entonces el vhost puede servir una página mínima — la API es la que resuelve tenant, el front no proxea `/api`.

</code_context>

<specifics>
## Specific Ideas

- Palabras del usuario, regla firme: **"no quiero tocar nada del templo"** — cualquier cambio que altere el login o la resolución de tenant de `admin.eltemplo.org`/`app.eltemplo.org` está fuera de la fase.
- `kaia.eltemplo.org` como `PLATFORM_DOMAIN` provisorio es una opción que el usuario consideró explícitamente y aceptó como válida hasta registrar el dominio propio.
- La contraseña temporal del owner se muestra **una sola vez** en la pantalla final; no hay reenvío ni consulta posterior (si se pierde, el super-owner vuelve a generarla por un camino que el planner define, sin mails).
- El tenant `demo` de prod es parte del "hecho" de la fase: el wizard se valida de punta a punta con subdominio real.

</specifics>

<deferred>
## Deferred Ideas

- **2FA/TOTP para el super-owner** — mejora futura cuando haya más de un super-owner (D-08).
- **Pantalla de gestión de usuarios de plataforma** (invitar/quitar super-owners) — hoy por CLI (D-07).
- **Recuperación de contraseña del super-owner** (reset por CLI vs flujo por mail, bloqueo tras N intentos) — no discutido; el planner elige el mínimo (reset por el mismo CLI) y lo demás queda diferido.
- **Contrato de tipos API↔frontends compartido** (paquete de tipos) — abierto en el doc 08 y README §6; sigue el espejo manual en la 182, se difiere a housekeeping.
- **Migración de los hosts de El Templo al mecanismo por Host** — descartada para el milestone (D-05).
- **Login scoped por host para la app Kaia** — el endpoint completo pertenece a la fase de la app de alumnos; la 182 deja la resolución por Host lista para consumirlo.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`, SPOM v5.1) — matcheó por keywords genéricas (misma situación que en la 181); revisado y NO plegado: rollout de datos del módulo Templo, sin relación con la plataforma.

</deferred>

---

_Phase: 182-Plataforma — rol super-owner + wizard de alta de tenant_
_Context gathered: 2026-08-28_
