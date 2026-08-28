# Phase 182: Plataforma — rol super-owner + wizard de alta de tenant — Research

**Researched:** 2026-08-28
**Domain:** Capa de plataforma (autenticación fuera del modelo de tenants, resolución de tenant por hostname, aprovisionamiento transaccional) sobre un monorepo Fastify 5 + Drizzle/MySQL + Quasar endurecido por el milestone v6.0
**Confidence:** **HIGH** para todo el inventario del repo (verificado leyendo el código de la rama `feat/182-discusion`, basada en `origin/master` fresco); **HIGH** para los conflictos CONTEXT↔código que se listan abajo (cada uno con archivo y línea); **MEDIUM** para las recomendaciones de topología de infra (dependen de una decisión de producto que el doc 08 dejó incoherente — ver Open Question 1)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dominio de plataforma y subdominios**

- **D-01: `PLATFORM_DOMAIN` por variable de entorno, nunca hardcodeado.** El dominio definitivo se registra en paralelo a la fase (no bloquea la planificación). `kaia.eltemplo.org` es un **valor válido de arranque/provisorio** (tenants en `<slug>.kaia.eltemplo.org`, wildcard `*.kaia.eltemplo.org` con DNS-01 contra el DNS de eltemplo.org), con el costo de branding que marca D-12 del doc 08 anotado y aceptado como provisorio. Cambiar al dominio propio después = rotar cert + vhost, sin tocar código. Agregar la variable a `.env.example` de la API (y `VITE_*` que haga falta en admin).
- **D-02: Alcance de infra: API completa + infra real en staging Y prod.** La fase entrega la capa de resolución por `Host` en la API, el CORS dinámico, **y** deja configurado en el EC2 el vhost wildcard de nginx y certbot con plugin DNS-01 (credenciales de API del DNS en el servidor), todo parametrizado por `PLATFORM_DOMAIN`. Requiere una sesión de SSH/infra **con aprobación explícita del usuario** (memoria `feedback_always_ask_before_ssh`). Runbook de infra escrito en el repo.
- **D-03: Entornos.** Local: `PLATFORM_DOMAIN=localtest.me` (resuelve a 127.0.0.1 sin tocar `/etc/hosts`); los tests de integración inyectan el header `Host`. Staging: `*.staging.<PLATFORM_DOMAIN>` con su propio cert wildcard, separado del de prod. Cada entorno tiene su dominio; nunca se cruzan.
- **D-04: Host desconocido → 404 genérico** (`TENANT_NOT_FOUND`) sin filtrar si el slug existe. Tenant suspendido/archivado → el 403 `TENANT_SUSPENDED` que ya existe. **Jamás fallback a tenant 1.**
- **D-05: NO SE TOCA NADA DE EL TEMPLO.** `admin.eltemplo.org`, `app.eltemplo.org` y la TV siguen funcionando exactamente como hoy (tenant derivado del usuario logueado, mismo login, mismo código). La capa nueva de resolución por `Host` actúa **únicamente** para hosts bajo `PLATFORM_DOMAIN`; para cualquier otro host, la API se comporta como ahora. No hay migración posterior de los hosts de El Templo al mecanismo por host — la posibilidad que el doc 08 dejaba abierta ("cuando su hostname entre al esquema") queda **descartada** para este milestone.

**Superficie y acceso del super-owner**

- **D-06: La UI vive en `el-templo-admin`, sección `/plataforma/*`** (mismo build y deploy), con login propio (`POST /api/platform/auth/login`) y un **store de auth separado** del de tenant. Un usuario de tenant no ve ni puede entrar a esas rutas; el super-owner no puede entrar a rutas de tenant (criterio de éxito 1). El panel de la 183 se construye sobre esta misma sección.
- **D-07: Bootstrap por script CLI idempotente en el API** (ej. `pnpm platform:create-user --email ...`): pide la contraseña por stdin, la hashea con el mismo algoritmo que `users`, se corre una vez en el servidor. **Ningún hash queda en migraciones ni en git.** Nuevos super-owners: mismo comando. No hay pantalla de gestión de usuarios de plataforma en esta fase.
- **D-08: Seguridad del login v1: email + contraseña fuerte, sin 2FA.** JWT propio con audience/claim `platform` (distinto del de `users`), **expiración corta (~8 h, sin refresh largo)**, rate limit en el login, y **log de auditoría** de acciones de plataforma (quién, qué, cuándo, sobre qué tenant). 2FA/TOTP queda anotado como mejora futura.
- **D-09: Sesiones independientes, sin cruce.** El token de plataforma se guarda bajo una clave distinta del de tenant; `/plataforma/*` y `/api/platform/*` solo aceptan el token de plataforma, y las rutas de tenant solo el suyo. Pueden coexistir ambas sesiones en el mismo navegador; ninguna hereda nada de la otra.

**Pasos del wizard y owner inicial**

- **D-10: Campos del wizard:** (1) Identidad: nombre del gimnasio + **slug = subdominio**, validado contra `RESERVED_TENANT_SLUGS` y unicidad, con preview `slug.<PLATFORM_DOMAIN>`; (2) Localización: país, moneda, zona horaria (columnas que `tenants` ya tiene); (3) Branding básico **opcional**: `brand.display_name`, colores, logo — solo se persiste lo que difiere del default; (4) Sede física opcional (ver D-12); (5) Resumen y confirmar.
- **D-11: El wizard crea el primer owner del gimnasio:** un `users` con rol `owner` en el tenant nuevo, a partir del email del dueño, con **contraseña temporal generada y mostrada una sola vez** (copiable) en la pantalla final; cambio de contraseña forzado al primer login. **Sin depender del envío de mails.**
- **D-12: Sedes:** la **sede virtual se crea automáticamente e invisible** (con `is_virtual = true` y el nombre exacto que espera `resolveUserBranchId` en `coach-load-routes.ts`, receta 07 §1.4) sin preguntar nada; además, un paso **opcional** "tu primera sede física" (nombre, dirección, cupo). Las demás sedes las carga el owner desde la pantalla de sedes existente del admin.
- **D-13: Pantalla final:** resumen con la URL `slug.<PLATFORM_DOMAIN>`, email del owner y contraseña temporal (una sola vez), y checklist de lo aprovisionado (sede virtual, sede física si la hubo, owner, módulos, settings). Botón "volver a plataforma". Sin edición ni reintentos desde ahí.

**Aprovisionamiento y aislamiento**

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

### Deferred Ideas (OUT OF SCOPE)

- **2FA/TOTP para el super-owner** — mejora futura cuando haya más de un super-owner (D-08).
- **Pantalla de gestión de usuarios de plataforma** (invitar/quitar super-owners) — hoy por CLI (D-07).
- **Recuperación de contraseña del super-owner** (reset por CLI vs flujo por mail, bloqueo tras N intentos) — no discutido; el planner elige el mínimo (reset por el mismo CLI) y lo demás queda diferido.
- **Contrato de tipos API↔frontends compartido** (paquete de tipos) — abierto en el doc 08 y README §6; sigue el espejo manual en la 182, se difiere a housekeeping.
- **Migración de los hosts de El Templo al mecanismo por Host** — descartada para el milestone (D-05).
- **Login scoped por host para la app Kaia** — el endpoint completo pertenece a la fase de la app de alumnos; la 182 deja la resolución por Host lista para consumirlo.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID          | Descripción (REQUIREMENTS.md)                                                                                                                                 | Research Support                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PLAT-01** | El super-owner tiene un rol de plataforma propio, autenticado y separado de los roles de tenant (owner/admin/coach)                                             | §Patrón 1 (segundo JWT con **secreto propio**, no solo audience — ver Pitfall 1, el vector de escalada real); §Standard Stack (argon2 ya es dependencia prod); §Don't Hand-Roll (rate limit); tabla `platform_users` en `TENANT_EXEMPT_TABLES` (§Gates de tenancy); manifiesto `global`. |
| **PLAT-02** | El super-owner puede crear un tenant con un wizard (identidad del gimnasio, info básica)                                                                        | §Patrón 4 (instancia axios separada en el admin — el interceptor actual adjunta el token de tenant a TODO); §Frontend (q-stepper ya usado en 3 componentes); §Conflicto C-3 (no existe pantalla de sedes); columnas reales de `tenants` (`default_country/currency/timezone`).           |
| **PLAT-03** | El alta aprovisiona todo: sede virtual (receta 07 §1.4), `tenant_settings` con defaults, módulos Templo OFF / Gimnasio ON                                       | §Patrón 3 (`provisionTenant()` transaccional, orden obligado branch→user por la FK compuesta `fk_users_tenant_branch`); §Conflicto C-1 (nombre literal `"Templo Online"`); §Recomendación D-15 (NO tocar `MODULE_NAMES` en esta fase — cascada verificada de tests).                     |

</phase_requirements>

---

## Summary

El repo llega a esta fase con **todo el andamiaje de tenancy ya construido y con dientes**: `tenantWhere`/`tenantValues`/`assertTenant` fail-closed, un manifiesto de rutas que deja CI rojo ante una ruta sin clasificar, un registro de tablas que exige que toda tabla nueva esté clasificada (con conteos hardcodeados en tests), un sentinel de queries y un lint de tenancy. La fase 182 no tiene que inventar aislamiento: tiene que **entrar por las puertas que v6.0 dejó abiertas y actualizar los contadores** que esas puertas usan como candado.

Los tres hallazgos que más condicionan el plan son de seguridad y de alcance, no de librerías:

1. **El JWT de plataforma necesita un SECRETO propio, no solo un `aud` distinto.** `plugins/auth.ts` registra `@fastify/jwt` con `JWT_SECRET` y `fastify.authenticate` hace `request.jwtVerify()` **sin validar audience**. Un token de plataforma firmado con el mismo secreto pasaría la verificación de cualquier ruta de tenant, y `attachScope` leería `request.user.userId` — un `platform_users.id` que puede colisionar con un `users.id` real. Es una escalada de privilegios estructural. La mitigación barata y total es `PLATFORM_JWT_SECRET` como env var propia: un token de plataforma simplemente no verifica contra el secreto de tenant, **sin tocar una línea del auth de El Templo** (D-05 se cumple por construcción).
2. **La resolución por `Host` no tiene hoy un camino por el que llegue un Host de tenant a la API.** El admin/app llaman a `api.eltemplo.org`; el doc 08 (g) fija que los subdominios de gimnasio llaman a la API **cross-origin** con `VITE_API_URL` horneada en build. Si la API vive en UN solo hostname, el header `Host` es constante y no resuelve nada. La capa se puede construir y testear completa en la 182 (los tests inyectan `Host`), pero la topología real de hostnames de API es una **decisión de infra que ni CONTEXT ni el doc 08 cerraron** (Open Question 1) y sin ella D-02 (infra real en staging y prod) no es ejecutable.
3. **Tres cosas que CONTEXT da por existentes no existen en el código**: no hay columna de "cambio de contraseña forzado" en `users` (D-11), no hay pantalla ni API de ABM de sedes en el admin (D-12), y no hay ninguna dependencia ni implementación de rate limiting en la API (D-08). Las tres se detallan con evidencia en §Conflictos CONTEXT ↔ código.

**Recomendación principal:** construir `src/modules/platform/` como un módulo estructuralmente aislado — **secreto JWT propio, decorador propio (`request.platformUser`), tablas propias exentas de tenancy, instancia axios propia en el admin** — y adelantar en la primera ola el hook `Host → tenants.slug` como función pura testeable (`hostToSlug`) + lookup exacto, dejando la topología de nginx como decisión de infra explícita al final de la fase. **No tocar `MODULE_NAMES` en esta fase** (§Recomendación D-15): la key `module.gimnasio.enabled` se siembra como string literal, es inerte para el resolver actual, y la entrada al enum queda en la 184 junto con el rename y la actualización coherente de los tests acoplados.

---

## Architectural Responsibility Map

| Capability                                            | Primary Tier                                          | Secondary Tier                        | Rationale                                                                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticación del super-owner (login, JWT, expiración) | **API / Backend** (`src/modules/platform/auth`)        | Admin (guarda el token)               | El token se firma y verifica server-side; el front solo lo almacena y lo adjunta. Ningún permiso se decide en el browser.                                              |
| Verificación del token de plataforma en cada request   | **API / Backend** (preHandler propio)                  | —                                     | Fail-closed en el borde, igual que `fastify.authenticate`. Nunca en el router de Vue (ese guard es UX, no seguridad).                                                   |
| Resolución de tenant por `Host`                        | **API / Backend** (hook `onRequest` global en `app.ts`) | Infra (nginx fija `server_name`)      | H-3 lo firma: lookup exacto contra `tenants.slug`, antes de `attachScope`. nginx normaliza; la API valida y decide.                                                     |
| CORS por origen dinámico                               | **API / Backend** (`@fastify/cors` `origin` función)   | —                                     | Hoy es un array estático en `app.ts:129-152`. La función con regex anclada vive en la API; el browser solo obedece.                                                     |
| Aprovisionamiento transaccional del tenant             | **API / Backend** (`provisionTenant()`)                | Database (transacción MySQL)          | D-14: atomicidad real, no orquestación desde el front. El wizard hace UN POST.                                                                                          |
| Wizard multi-paso, validación de forma, preview de URL | **Admin Frontend** (`/plataforma/*`)                   | API (validación autoritativa)         | La validación del slug se duplica a propósito: UX en el front, verdad en la API (`RESERVED_TENANT_SLUGS` + unique de `tenants.slug`).                                   |
| Mostrar la contraseña temporal una sola vez            | **Admin Frontend** (estado efímero en memoria)         | API (la genera y la devuelve una vez) | D-13: no se persiste ni se re-consulta. El front **no** la guarda en localStorage.                                                                                     |
| Log de auditoría de plataforma                         | **Database + API**                                     | —                                     | Tabla propia sin `tenant_id` (`audit_log` actual es tenant-scoped y STRICT — ver §Gates).                                                                               |
| Wildcard DNS, cert DNS-01, vhost wildcard              | **Infra (EC2 / nginx / certbot)**                      | Repo (runbook versionado)             | Fuera del pipeline de deploy (`paths-filter` no ve `/etc/nginx`). Gate humano por SSH.                                                                                  |
| Bootstrap del primer super-owner                       | **CLI compilada en `dist/`** (API)                     | Operador humano (stdin)               | `pnpm install --prod` en el server ⇒ `tsx` NO está disponible: tiene que ser JS compilado (§Pitfall 7).                                                                 |

---

## Standard Stack

### Core — todo ya instalado, nada nuevo obligatorio

| Librería                | Versión (package.json) | Propósito en esta fase                                          | Por qué es la estándar acá                                                                                                                          |
| ----------------------- | ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify`               | `^5.7.4`               | Hooks `onRequest`, preHandlers, `inject()` para tests            | Ya es el runtime; `app.inject({ headers: { host } })` es como se testea la resolución por Host sin red [VERIFIED: package.json + test/helpers.ts]     |
| `@fastify/jwt`          | `^10.0.0`              | Firma/verificación del token de plataforma                       | Soporta **múltiples instancias con `namespace`** y `verify.allowedAud` [CITED: github.com/fastify/fastify-jwt README]                                 |
| `@fastify/cors`         | `^11.2.0`              | `origin` como función con regex anclada (DIS-02 (g))             | Ya registrado en `app.ts:129`; el cambio es de array a función, sin dependencia nueva                                                                 |
| `argon2`                | `^0.44.0`              | Hash de la contraseña del super-owner y del owner temporal       | **Mismo algoritmo que `users`** (`auth/routes.ts:265,681`) — D-07 lo exige literalmente. Es dependencia de producción, disponible en el server        |
| `drizzle-orm`           | `^0.45.1`              | Schema de `platform_users`, transacción de `provisionTenant()`   | `db.transaction(async (tx) => …)` es el patrón vigente (tree-editor/service.ts, subscriptions/service.ts)                                             |
| `mysql2`                | `^3.16.1`              | Driver                                                           | —                                                                                                                                                     |
| `vitest`                | `^…` (devDep API)      | `iso-04` y los tests de unidad de `hostToSlug`                   | `pnpm test` en `el-templo-api` corre contra MySQL real (`eltemplo_test`)                                                                              |
| Quasar + Vue 3 + Pinia  | (admin)                | Wizard `q-stepper`, store `platformAuth`                         | `q-stepper` ya se usa en `ProgramWizardDialog.vue`, `AssignPlanDialog.vue`, `MemberFormDialog.vue` — hay precedente interno, no hace falta evaluar UI |
| `axios`                 | (admin)                | **Instancia nueva `platformApi`**, separada de `api`             | El interceptor actual adjunta `adminAccessToken` a **todo** request (§Pitfall 3)                                                                      |

### Supporting — la única candidata a instalación, y es un gate humano

| Librería              | Versión | Propósito                       | Cuándo usarla                                                                                                                        |
| --------------------- | ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@fastify/rate-limit` | `11.2.0` | Rate limit del login (D-08)     | **Solo si el usuario aprueba la instalación.** Memoria `feedback_no_auto_install_deps`: nunca instalar dependencias sin preguntar. |

### Alternatives Considered

| En vez de                                   | Se podría usar                                                                | Tradeoff                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@fastify/rate-limit`                       | Limitador en memoria hecho a mano (~30 líneas, `Map<string,{n,resetAt}>`)     | La API corre en **pm2 fork mode, una sola instancia** (`deploy.yml:432`, `RUNBOOK.md:101`) ⇒ un `Map` en memoria es coherente y no necesita Redis. Se pierde `Retry-After`, ban windows, allowlist y el manejo de `X-Forwarded-For` (nginx sí lo setea). Es la salida si el usuario no quiere una dependencia nueva; funciona, y es honesto llamarlo "mínimo". |
| Segundo `@fastify/jwt` con `namespace`      | Verificación manual con `fastify.jwt.verify(token, { allowedAud })`           | La opción `namespace` es más declarativa, pero **por default el segundo namespace también decora `request.user`** salvo que se pase `decoratorName` — y `request.user` lo leen `attachScope` y el hook de Sentry (`app.ts:369`). Cualquiera de las dos sirve **siempre que el secreto sea distinto**; la verificación manual con decorador propio es la de menor superficie. |
| Tabla `platform_audit_log` propia           | Reusar `audit_log`                                                            | `audit_log` **tiene `tenant_id` y está en `TENANT_STRICT_MODULES.members`** (`src/db/tenant-tables.ts`): el sentinel hace throw ante cualquier query sin `tenant_id`, y una acción de plataforma no tiene tenant al que anclarse (crear un tenant es, literalmente, la acción sin tenant). Tabla propia, exenta.                                              |
| Tabla `platform_audit_log` propia           | Solo logs estructurados de Pino                                               | Barato y sin migración, pero D-08 pide "quién, qué, cuándo, sobre qué tenant" consultable; los logs de pm2 rotan y no son queryables. Recomendado: tabla + log estructurado, no uno u otro.                                                                                                                                                                    |

**Instalación:** _Ninguna instalación es necesaria para el 90% de la fase._ Si el usuario aprueba el rate limit:

```bash
cd el-templo-api && pnpm add @fastify/rate-limit
```

**Verificación de versiones (ejecutada 2026-08-28):**

```bash
npm view @fastify/rate-limit version   # 11.2.0, publicado 2026-08-06
```

---

## Package Legitimacy Audit

> Corrida el 2026-08-28 con `slopcheck` instalado en `~/.local/bin/slopcheck`, forzando el ecosistema npm (`-e npm`) — el auto-detect eligió PyPI y dio un falso `[SLOP]`, trampa de ecosistema cruzado que documenta el propio protocolo.

| Package               | Registry | Age                      | Downloads   | Source Repo                                | slopcheck | Disposition                             |
| --------------------- | -------- | ------------------------ | ----------- | ------------------------------------------ | --------- | --------------------------------------- |
| `@fastify/rate-limit` | npm      | publicado 2026-08-06     | 2.561.923/sem | github.com/fastify/fastify-rate-limit (org oficial Fastify) | `[OK]`    | **Aprobado técnicamente — BLOQUEADO por gate humano de instalación** |
| `@fastify/jwt`        | npm      | ya instalado (`^10.0.0`) | —           | github.com/fastify/fastify-jwt             | n/a       | Ya es dependencia; no se instala nada    |
| `argon2`              | npm      | ya instalado (`^0.44.0`) | —           | github.com/ranisalt/node-argon2            | n/a       | Ya es dependencia; no se instala nada    |

**Packages removed due to slopcheck `[SLOP]` verdict:** ninguno.
**Packages flagged as suspicious `[SUS]`:** ninguno.
**`postinstall` sospechoso:** `@fastify/rate-limit` no declara `postinstall` (`npm view @fastify/rate-limit scripts` devuelve solo lint/test) [VERIFIED: npm registry].

> **El planner DEBE insertar un `checkpoint:human-verify` antes de cualquier `pnpm add`**, no por dudas sobre el paquete sino por la regla del proyecto (memoria `feedback_no_auto_install_deps`). Si el usuario dice que no, el plan cae al limitador en memoria descrito en §Alternatives.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────────────────────────────┐
   admin.eltemplo.org │  el-templo-admin  (UN solo build, UN solo deploy)     │
   (sin cambios)      │                                                       │
                      │  /login /alumnos /cobros …   │   /plataforma/*        │
                      │  store `auth`                │   store `platformAuth` │
                      │  axios `api`                 │   axios `platformApi`  │
                      │  localStorage adminAccessToken │ localStorage platformAccessToken │
                      └───────────┬──────────────────┴────────────┬───────────┘
                                  │ Bearer <tenant JWT>            │ Bearer <platform JWT>
                                  │ (JWT_SECRET)                   │ (PLATFORM_JWT_SECRET)
                                  ▼                                ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  nginx (EC2)   api.eltemplo.org → :3000   ·   api-staging → :4001            │
   │                proxy_set_header Host $host                                    │
   │                [NUEVO] vhost wildcard *.<PLATFORM_DOMAIN>  ← Open Question 1  │
   └──────────────────────────────┬───────────────────────────────────────────────┘
                                  ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Fastify buildApp()                                                           │
   │                                                                               │
   │  [NUEVO] onRequest global: resolveTenantByHost                                │
   │     host === PLATFORM_DOMAIN o no matchea el sufijo → NO HACE NADA (D-05)     │
   │     host = <slug>.<PLATFORM_DOMAIN>  → hostToSlug() → SELECT exacto           │
   │              slug inexistente → 404 TENANT_NOT_FOUND (jamás ?? 1)             │
   │              slug encontrado  → request.hostTenant = { tenantId, status }     │
   │                                                                               │
   │  @fastify/cors  origin: función con regex anclada ^https://[a-z0-9-]+\.DOM$  │
   │                                                                               │
   │  ┌────────────────────────┐        ┌──────────────────────────────────────┐  │
   │  │ rutas de TENANT        │        │ [NUEVO] /api/platform/*              │  │
   │  │ fastify.authenticate   │        │ requirePlatformAuth (secreto propio) │  │
   │  │   → request.user       │        │   → request.platformUser             │  │
   │  │ attachScope(req, db)   │        │ NUNCA llama attachScope              │  │
   │  │   → request.scope      │        │ NUNCA tiene tenantId de sesión       │  │
   │  │ assertTenant → ctx     │        │                                      │  │
   │  └────────────────────────┘        │  POST /auth/login   (rate-limited)   │  │
   │                                     │  POST /tenants → provisionTenant()   │  │
   │                                     └──────────────┬───────────────────────┘  │
   └────────────────────────────────────────────────────┼──────────────────────────┘
                                                        ▼
                       ┌───────────────────────────────────────────────────────┐
                       │  provisionTenant(input)  —  UNA transacción           │
                       │   1. validar slug (reservado / formato / unicidad)     │
                       │   2. INSERT tenants                → tenantId          │
                       │   3. INSERT branches "Templo Online" is_virtual=true   │
                       │   4. INSERT branches sede física (opcional)            │
                       │   5. INSERT users owner  (FK compuesta ⇒ va DESPUÉS)   │
                       │   6. INSERT tenant_settings × 5 flags de módulo        │
                       │   7. INSERT tenant_settings brand.* solo si difieren   │
                       │   8. INSERT platform_audit_log (mismo tx)              │
                       │   ── cualquier fallo ⇒ ROLLBACK total ──               │
                       └───────────────────────────────────────────────────────┘
                                                        │
                                                        ▼
                       MySQL: tenants · branches · users · tenant_settings
                              platform_users · platform_audit_log  (sin tenant_id)
```

### Estructura de proyecto recomendada

```
el-templo-api/src/
├── modules/platform/
│   ├── index.ts                  # barrel: platformAuthRoutes, platformTenantRoutes
│   ├── auth-routes.ts            # POST /auth/login  (+ /auth/me opcional)
│   ├── auth-plugin.ts            # requirePlatformAuth + firma del JWT propio
│   ├── provisioning-service.ts   # provisionTenant() — la transacción de D-14
│   ├── slug.ts                   # validateSlug(): reservados + formato + longitud
│   ├── host-tenant.ts            # hostToSlug() (pura) + hook resolveTenantByHost
│   └── audit.ts                  # platformAudit.write(tx, {...})
├── db/schema/
│   ├── platform-users.ts         # + export en db/schema/index.ts
│   └── platform-audit-log.ts     # + export en db/schema/index.ts
├── db/migrations/
│   └── 0216_platform_core.sql    # ver §Numeración de migraciones
└── scripts/
    └── create-platform-user.ts   # CLI D-07 (compilada a dist/, ver Pitfall 7)

el-templo-admin/src/
├── boot/platform-axios.ts        # instancia `platformApi` + su 401 handler
├── stores/usePlatformAuthStore.ts
├── pages/plataforma/
│   ├── PlatformLoginPage.vue
│   ├── PlatformHomePage.vue
│   └── TenantWizardPage.vue      # q-stepper de 5 pasos (D-10)
└── router/                        # guard propio para /plataforma/* (D-06)
```

### Patrón 1 — Segundo JWT: secreto propio + decorador propio (PLAT-01)

**Qué:** un preHandler `requirePlatformAuth` que verifica el `Authorization: Bearer` contra un secreto **distinto** y deposita el resultado en un decorador **distinto**.

**Cuándo:** en todas las rutas bajo `/api/platform/*`, salvo el login.

**Por qué el secreto separado no es opcional (esto es el hallazgo de seguridad de la fase):**

```ts
// el-templo-api/src/plugins/auth.ts:39-44 — estado ACTUAL, no se toca
await fastify.register(jwt, { secret, sign: { expiresIn } });
// :50-65 — fastify.authenticate hace request.jwtVerify() SIN allowedAud.
```

Con un solo secreto, un JWT de plataforma con `aud: "platform"` **pasa** `request.jwtVerify()` en cualquier ruta de tenant (nadie mira el `aud`), y a continuación `attachScope` (`country-scope.ts:151-162`) hace `SELECT … FROM users WHERE users.id = request.user.userId`. Si el payload de plataforma trae `userId`, ese número se resuelve como un `users.id` real de otro gimnasio. Endurecer eso desde el lado del tenant significaría tocar `plugins/auth.ts`, que es exactamente lo que D-05 prohíbe. **Con `PLATFORM_JWT_SECRET`, la firma no verifica y el request muere en el 401 sin tocar la base.** Defensa en profundidad recomendada, las tres a la vez:

```ts
// el-templo-api/src/modules/platform/auth-plugin.ts (nuevo)
import jwt from "jsonwebtoken"; // NO: usar fastify.jwt de una segunda instancia o verify manual

// Opción recomendada — segunda instancia namespaced, decorador propio:
await fastify.register(jwtPlugin, {
  secret: platformSecret,            // (1) PLATFORM_JWT_SECRET, env var propia
  namespace: "platform",
  jwtVerify: "platformJwtVerify",
  jwtSign: "platformJwtSign",
  decoratorName: "platformUser",     // (2) NO pisar request.user (lo lee attachScope)
  sign: { expiresIn: process.env.PLATFORM_JWT_EXPIRES_IN || "8h", aud: "platform" },
  verify: { allowedAud: "platform" },
});
// (3) el payload usa `platformUserId`, NUNCA `userId`:
//     { platformUserId: number, email: string }
```

[CITED: github.com/fastify/fastify-jwt README — opciones `namespace`, `jwtVerify`, `jwtSign`, `decoratorName`, `sign.aud`, `verify.allowedAud`]

**Verificación que el plan debe exigir:** un test que tome un token de plataforma válido y lo mande a una ruta de tenant (`GET /api/auth/me`) esperando **401**, y el recíproco con un token de tenant contra `/api/platform/tenants` esperando **401** (D-16 lo pide explícitamente).

### Patrón 2 — Resolución por `Host`: función pura + lookup exacto + bypass total

**Qué:** un hook `onRequest` registrado en `buildApp()` **antes** de cualquier `register` de rutas, que solo actúa si el host cae bajo `PLATFORM_DOMAIN`.

**Cuándo:** siempre; su primera acción es decidir si le corresponde actuar.

**Detalle que cambia el diseño:** `attachScope` **no es un hook global**. Es una función que se llama a mano en ~40 lugares (152 menciones en `src/`, p. ej. `auth/routes.ts:904`, `tv/control-routes.ts:42`, `finance/coach-load-routes.ts:285`), siempre después de `fastify.authenticate`. "Antes de `attachScope`" se implementa entonces como un `onRequest` de instancia raíz colgado temprano en `buildApp()` — el mismo lugar donde vive el seam de `onRoute` (`app.ts:104`) — no como un wrapper de la función.

```ts
// el-templo-api/src/modules/platform/host-tenant.ts (nuevo)

/**
 * Pura y testeable sin DB ni Fastify. Devuelve el slug candidato o null.
 * `endsWith` está PROHIBIDO (doc 08 (g)): `https://evil-kaia.eltemplo.org`
 * pasaría un endsWith mal construido. El anclaje ^…$ es la defensa.
 */
export function hostToSlug(rawHost: string | undefined, platformDomain: string): string | null {
  if (!rawHost || !platformDomain) return null;
  const host = rawHost.split(":")[0].toLowerCase();       // descarta el puerto
  const dom = platformDomain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)\\.${dom}$`);
  const m = re.exec(host);
  return m ? m[1] : null;
}
```

Reglas que el hook debe cumplir, todas heredadas de H-3/D-04/D-05:

- `hostToSlug` devuelve `null` ⇒ **el hook no hace nada** (comportamiento actual intacto: es el caso de `api.eltemplo.org`, `capacitor://localhost`, health checks internos, y del propio `PLATFORM_DOMAIN` pelado sin subdominio).
- `hostToSlug` devuelve un slug ⇒ `SELECT id, status FROM tenants WHERE slug = ?` — **igualdad exacta**, un solo parámetro, sin `LIKE`, sin normalización creativa.
- Sin fila ⇒ `404` con code `TENANT_NOT_FOUND` y mensaje genérico (D-04: no filtra si el slug existe). **Nunca `?? 1`, nunca `!`.**
- Fila con `status !== 'active'` ⇒ `403 TENANT_SUSPENDED`, reusando la constante ya exportada por `country-scope.ts:21`.
- El resultado va a un decorador **nuevo** (`request.hostTenant`), **no** a `request.scope`: `CountryScope` no cambia de forma (asunción A9 del doc 08 se respeta por construcción).

**Nota de seguridad de infra:** los vhosts actuales hacen `proxy_set_header Host $host` (`deploy/nginx/api.eltemplo.org`), o sea propagan el Host del cliente. Eso es correcto *siempre que* `server_name` acote qué hosts llegan a ese vhost, y que exista un `default_server` que rechace lo que no matchea. El runbook de D-02 debe verificarlo explícitamente; es la mitigación que H-3 prescribe.

### Patrón 3 — `provisionTenant()`: una transacción, orden obligado por las FKs

**Qué:** un único servicio que recibe el input del wizard y devuelve el resumen de D-13.

**El orden NO es arbitrario.** `users.branch_id` es `NOT NULL` y además existe la FK compuesta `fk_users_tenant_branch (tenant_id, branch_id) → branches(tenant_id, id)` con `ON DELETE/UPDATE RESTRICT` (`src/db/schema/users.ts`, fase 173 ADO-07). El owner **no puede** insertarse antes que su sede, y su `branch_id` **tiene que ser una sede del mismo tenant** o MySQL rechaza la fila.

```ts
// el-templo-api/src/modules/platform/provisioning-service.ts (nuevo)
export async function provisionTenant(db: Db, log: FastifyBaseLogger, input: ProvisionInput) {
  return db.transaction(async (tx) => {
    // 1. slug: reservado / formato / unicidad — el error tiene que ser CLARO (D-14)
    // 2. tenants
    const [{ insertId: tenantId }] = await tx.insert(schema.tenants).values({
      name: input.name, slug: input.slug,
      defaultCountry: input.country, defaultCurrency: input.currency,
      defaultTimezone: input.timezone,
    });
    const ctx: TenantContext = { tenantId };

    // 3. sede VIRTUAL — nombre literal obligatorio, ver Conflicto C-1
    const [{ insertId: virtualBranchId }] = await tx.insert(schema.branches)
      .values(tenantValues(ctx, { name: VIRTUAL_BRANCH_NAME, code: "ONLINE", isVirtual: true,
                                  country: input.country, timezone: input.timezone }));

    // 4. sede física opcional
    // 5. owner — DESPUÉS de la sede, con branch_id del MISMO tenant
    await tx.insert(schema.users).values(tenantValues(ctx, {
      email: input.ownerEmail, passwordHash: await argon2.hash(tempPassword),
      firstName: input.ownerFirstName, lastName: input.ownerLastName,
      role: "owner", branchId: physicalBranchId ?? virtualBranchId,
      country: input.country,
    }));

    // 6-7. tenant_settings  8. auditoría — todo con el MISMO tx
  });
}
```

**Todos los INSERT de tabla gym-owned pasan por `tenantValues(ctx, …)`.** No es ceremonia: `branches.tenant_id` y `users.tenant_id` tienen `DEFAULT 1` (deuda consciente del rolling deploy de la fase 167, documentada en `branches.ts`), así que **un insert que se olvide de la columna siembra en El Templo en silencio** — la trampa T-168-15 que ya mordió dos veces.

**Idempotencia (D-14):** el slug ya es `UNIQUE` en `tenants` (`slug: varchar(50).notNull().unique()`). El segundo intento con el mismo slug debe cortarse **antes** con un `SELECT` y devolver un 409 con mensaje accionable, no dejar que el error de duplicate key del driver suba como 500.

### Patrón 4 — Frontend: instancia axios separada, no un flag en la existente

**Qué:** un módulo `platformApi` con su propio interceptor.

**Por qué:** `el-templo-admin/src/boot/axios.ts:163-169` adjunta `adminAccessToken` a **todos** los requests de la instancia `api`. Si `/api/platform/*` se llamara con esa instancia, el token de tenant viajaría a las rutas de plataforma — exactamente el cruce que D-09 prohíbe. Agregar un `if (url.startsWith('/platform'))` dentro del interceptor compartido acopla las dos sesiones en un archivo que sostiene la operación de El Templo (D-05 desaconseja tocarlo). Una instancia nueva:

```ts
// el-templo-admin/src/boot/platform-axios.ts (nuevo, NO toca boot/axios.ts)
const PLATFORM_KEY = 'platformAccessToken';   // clave distinta de adminAccessToken
const platformApi = axios.create({ baseURL, timeout: 10000, headers: {...} });
platformApi.interceptors.request.use((c) => {
  const t = localStorage.getItem(PLATFORM_KEY);
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
// 401 ⇒ limpiar SOLO la clave de plataforma y redirigir a /plataforma/login.
// Sin refresh: D-08 fija expiración corta sin refresh largo — re-login y listo.
```

El guard del router para `/plataforma/*` es un guard **aparte** (mira `platformAuth`, no `meta.allowedRoles`), porque `AdminRole` (`src/types/admin.ts`) es el enum de roles de tenant y el super-owner **no es** uno de ellos (Opción B del doc 08).

### Anti-patrones a evitar

- **`endsWith(PLATFORM_DOMAIN)` para reconocer un host.** Doc 08 (g) lo nombra: `https://evil-kaia.eltemplo.org` pasa. Solo regex anclada.
- **Reusar `JWT_SECRET` para el token de plataforma.** Ver Patrón 1 — es una escalada de privilegios, no un detalle de higiene.
- **Nombrar `userId` al claim del super-owner.** Colisiona semánticamente con `users.id` en cada lectura futura; `platformUserId` hace imposible el error silencioso.
- **Agregar `"platform"` a `roleEnum`.** El doc 08 descartó la Opción A explícitamente y ya está firmado.
- **Un `?? 1` o un `!` en el camino de resolución por Host.** Prohibidos en todo el repo, para siempre (`tenant.ts`, `country-scope.ts:33-37`).
- **Escribir la contraseña temporal del owner en `localStorage`, en un log, o en la respuesta de cualquier endpoint que no sea el POST del alta.** D-13: una sola vez, en memoria del componente.
- **Persistir `brand.subdomain` en `tenant_settings`.** El doc 08 Definición 7 lo prohíbe: se deriva de `tenants.slug`, dos fuentes divergen.
- **Sembrar las 8 claves `gimnasio.*` de memoria en el alta.** Doc 08 Definición 7: los defaults viven en código; el alta escribe **solo** lo que difiere (los 5 flags `module.*` sí son explícitos por D-15).

---

## Don't Hand-Roll

| Problema                                        | No construir                                                                    | Usar en su lugar                                                                              | Por qué                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hash de contraseña                              | Cualquier cosa con `crypto`                                                     | `argon2.hash` / `argon2.verify` — ya es dependencia y es lo que usa `users` (D-07 lo exige)     | Parámetros de coste, salting y verificación en tiempo constante ya resueltos                                                                                                                    |
| Firma/verificación del JWT                      | `jsonwebtoken` a mano en un preHandler                                          | Segunda instancia de `@fastify/jwt` con `namespace` + `decoratorName`                          | Ya está instalado; la instancia namespaced trae `allowedAud`, expiración y tipos                                                                                                                |
| Rate limit                                      | Un `Map` global sin ventana deslizante ni limpieza                              | `@fastify/rate-limit` **si el usuario aprueba**; si no, el `Map` mínimo documentado como tal    | El paquete oficial maneja `Retry-After`, `X-Forwarded-For`, ventanas y limpieza. Si se hace a mano, hacerlo consciente y con test — no fingir que es equivalente                                 |
| Atomicidad del alta                             | 6 INSERT sueltos con try/catch y borrado compensatorio                          | `db.transaction(async (tx) => …)` (patrón vigente en `tree-editor/service.ts:707`)             | Un rollback compensatorio a mano deja tenants a medias justo en el escenario que D-14 quiere evitar                                                                                             |
| Filtro por gimnasio en los INSERT del alta      | `values({ ..., tenantId })` a mano                                              | `tenantValues(ctx, {...})` de `shared/tenant.ts`                                                | El helper estampa el tenant **después** del spread ⇒ mitigación de mass-assignment a nivel de tipo y de runtime (T-169-02)                                                                       |
| Validación del slug                             | Regex ad-hoc en el frontend nomás                                               | `RESERVED_TENANT_SLUGS` (`db/schema/tenants.ts:92`) + unique de DB + validación server-side     | La lista ya existe y esta fase es su primer consumidor de runtime. La validación del front es UX; la verdad es la de la API                                                                     |
| Certificado por gimnasio                        | Emitir un cert por cada alta                                                    | Cert **wildcard** vía challenge **DNS-01** (HTTP-01 no emite wildcards)                        | [CITED: letsencrypt.org/docs/challenge-types/ vía doc 08 (f)] Sin DNS-01 el alta automática es mentira: cada gimnasio pediría intervención manual                                               |
| Multi-paso del wizard                           | Estado de pasos hecho a mano con `v-if`                                         | `q-stepper` (precedente interno: `ProgramWizardDialog.vue`, `AssignPlanDialog.vue`)             | Ya hay tres usos en el repo; copiar el patrón interno cuesta menos y queda consistente                                                                                                          |

**Key insight:** en esta fase el riesgo no está en las librerías (casi todo ya está instalado); está en **rehacer a mano las barandas de tenancy que v6.0 ya construyó**. Cada vez que el plan tenga la tentación de escribir un INSERT sin `tenantValues`, un `SELECT` sin `tenantWhere`, o una tabla sin clasificar en `tenant-tables.ts`, hay un gate de CI esperándolo — y si no lo hay, hay un bug de aislamiento esperándolo.

---

## Conflictos CONTEXT ↔ código (lo que el planner tiene que resolver antes de planificar)

> Los cinco están verificados leyendo el código de esta rama. Cada uno cambia el alcance de la fase.

### C-1 — La sede virtual se llama literalmente `"Templo Online"`, y eso es una marca de El Templo en cada gimnasio nuevo

D-12 dice "el nombre exacto que espera `resolveUserBranchId`". Ese nombre es la **cadena literal `"Templo Online"`**, buscada por nombre en dos lugares de producción:

- `src/modules/finance/coach-load-routes.ts:316` — `eq(schema.branches.name, "Templo Online")`
- `src/modules/subscriptions/service.ts:5390` — misma comparación

No hay constante compartida: son dos literales. La receta 07 §1.4 confirma que sin esa sede `resolveUserBranchId` **lanza un `Error` pelado** y las rutas de carga contestan 500.

**Tensión real:** D-12 del doc 08 prohíbe branding de El Templo en gimnasios ajenos, y esta sede lleva la marca en el nombre. Es invisible en la UI (`is_virtual = true`), pero está en la base de todo tenant nuevo.

**Recomendación:** en esta fase, **crear la sede con el nombre literal `"Templo Online"`** (cambiarlo rompe dos caminos de producción de El Templo, que es justo lo que D-05 prohíbe) y **extraer una constante única** `VIRTUAL_BRANCH_NAME = "Templo Online"` en `src/modules/shared/` que consuman los tres sitios (los dos existentes + el provisioner). Costo: 3 líneas. Beneficio: cuando una fase futura quiera renombrarla por tenant, hay un solo lugar y un solo grep. **No renombrar el valor en la 182.**

### C-2 — No existe ninguna columna de "cambio de contraseña forzado" en `users`

D-11 pide "cambio de contraseña forzado al primer login". Búsqueda exhaustiva en `src/db/schema/*.ts` y `src/modules/auth/routes.ts` de `mustChange|must_change|forcePasswordChange|password_reset|passwordChangedAt`: **cero resultados**. La columna no existe y ningún endpoint la contempla.

**Implicancia de alcance:** implementar D-11 requiere (a) una migración que agregue `users.must_change_password BOOLEAN NOT NULL DEFAULT false`, (b) que `provisionTenant()` la ponga en `true` para el owner nuevo, (c) que la respuesta de `POST /api/auth/login` la exponga, (d) que `POST /api/auth/me/change-password` (ya existe, `auth/routes.ts:1089-1124`) la apague, y (e) que `el-templo-admin` fuerce la navegación.

**Esto toca el login de El Templo.** Es aditivo (columna con default `false` ⇒ ningún usuario existente cambia de comportamiento; un campo más en el JSON de respuesta ⇒ los clientes viejos lo ignoran), pero **no es "no tocar nada del templo" en sentido literal**. Opciones para el planner, en orden de recomendación:

- **(A, recomendada)** Implementarlo aditivo como arriba, con un test explícito que afirme que un usuario existente de El Templo loguea igual que antes y que el campo llega en `false`. Es el mínimo honesto que cumple D-11.
- **(B)** Diferir el forzado y que la pantalla final del wizard diga "pedile al dueño que cambie la contraseña". Cumple D-11 a medias; es una decisión de producto, no del planner.
- **(C)** Marcarlo por `tenant_settings`/tabla lateral para no tocar `users`. Más superficie, misma semántica, peor lugar. No recomendado.

**El planner debe elevar esta decisión al usuario antes de planificarla**, porque D-05 es una regla firme escrita con las palabras del usuario y (A) la roza.

### C-3 — No existe pantalla de sedes en el admin, ni API de ABM de sedes

D-12 cierra con "las demás sedes las carga el owner desde la pantalla de sedes existente del admin". Esa pantalla **no existe**:

- `el-templo-admin/src/pages/` — 36 páginas, ninguna de sedes/sucursales.
- El manifiesto de rutas (`test/tenant-manifest.ts`) no tiene ningún `POST/PUT/DELETE /api/admin/branches`; lo único parecido es `GET /api/admin/members/branches` (lectura para poblar selects).
- Las sedes se crean hoy **por migración escrita a mano** — precedente reciente: `0211_add_alberti_branch.sql`.

**Implicancia:** un gimnasio dado de alta con el wizard queda con su sede virtual (+ la física opcional) y **sin ninguna forma de agregar la segunda sede** salvo una migración escrita por nosotros. Para PLAT-02/03 y para el criterio de éxito 2 ("el tenant existe y es **utilizable**") eso puede alcanzar; para ONB-01 (fase 192, gimnasio real operando) probablemente no.

**Recomendación:** **no** meter el ABM de sedes en la 182 (infla la fase y no está en PLAT-01..03). Corregir la afirmación de D-12 en el plan, registrar el hueco explícitamente como riesgo de la 192, y proponerlo como candidato de fase propia o de la 183 (que ya construye superficie de gobierno). El wizard **sí** debe permitir la sede física opcional, porque es lo único que evita que el gimnasio nazca sin sede real.

### C-4 — No hay rate limiting de ninguna clase en la API

Búsqueda de `rate.?limit|rateLimit` en `el-templo-api/src/` (case-insensitive): **cero resultados**. No hay dependencia, ni plugin, ni implementación casera. D-08 pide rate limit en el login de plataforma ⇒ es dependencia nueva (gate humano) o código nuevo. Ver §Standard Stack y §Package Legitimacy Audit.

Dato que habilita la solución barata: la API corre en **pm2 fork mode, instancia única** (`deploy.yml:432`: `pm2 start dist/index.js --name eltemplo-api`, sin `-i`), así que un contador en memoria es coherente. Con cluster mode dejaría de serlo.

### C-5 — `demo` no está en `RESERVED_TENANT_SLUGS`, y "reservar" el slug del tenant demo es contradictorio

`RESERVED_TENANT_SLUGS` (`db/schema/tenants.ts:92-106`) tiene 13 valores: `admin, api, www, app, auth, staging, static, assets, cdn, mail, docs, support, dashboard`. **No incluye `demo`.**

D-17 dice "Slug reservado tipo `demo`". Si se agrega `demo` a la lista de reservados, el propio wizard lo **rechaza** y el tenant de D-17 no se puede crear por el camino que la fase quiere probar. Son dos conceptos distintos que la palabra "reservado" confunde: (a) slugs que nadie puede tomar, (b) el slug que nos quedamos nosotros para el demo.

**Recomendación:** crear el tenant demo con un slug normal (`demo`) **sin** agregarlo a `RESERVED_TENANT_SLUGS`; la unicidad de `tenants.slug` ya impide que otro lo tome una vez creado. Si se quiere blindar antes de crearlo, agregarlo a la lista y crear el demo **con otro slug** (`demo-kaia`). El planner elige; lo que no puede es hacer las dos cosas.

---

## Gates de tenancy que esta fase dispara (y los números exactos a actualizar)

Memoria `reference_gates_tenancy_ruta_job_nueva`: toda ruta/tabla/job nuevo dispara gates. Verificado uno por uno:

| Gate                                                | Archivo                                    | Qué hay que hacer                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Manifiesto de rutas fail-closed**                 | `test/tenant-manifest.ts`                  | Cada ruta nueva de `/api/platform/*` va con `categoria: "global"` + **`motivo` obligatorio y no vacío** (las 3 categorías son `tenant-scoped \| global \| templo-module`; la cuarta la crea la 184). Precedente de redacción: la entrada de `POST /api/auth/login`.                                                              |
| **Conteo del manifiesto**                           | `test/tenancy/iso-01-manifiesto.test.ts:261` | `ENTRADAS_BASELINE = 389` ⇒ pasa a `389 + N` donde N = rutas nuevas. Si no se actualiza, CI rojo. El header de `tenant-manifest.ts` también declara el número — el gate manda, pero dejar el header stale es deuda (ya pasó una vez, está documentado ahí).                                                                     |
| **Clasificación de tablas**                         | `src/db/tenant-tables.ts:180`              | `platform_users` y `platform_audit_log` van a **`TENANT_EXEMPT_TABLES`** (hoy: `tenants, tenant_settings, system_settings, labs_inquiries`), cada una con motivo escrito arriba — el doc 05 §3 las llama "club GLOBAL".                                                                                                          |
| **Conteo de tablas**                                | `test/db/tenant-tables.test.ts:99,105`     | El test afirma **"91 gym-owned + 4 exentas = 95 tablas del schema"** y además `expect(TENANT_EXEMPT_TABLES.length).toBe(4)`. Con 2 tablas nuevas exentas ⇒ **91 + 6 = 97** y el `.toBe(4)` pasa a `.toBe(6)`. Dos assertions a tocar, ambas con mensaje de error explicativo que también conviene actualizar.                    |
| **Sentinel de queries / lint de tenancy**           | `src/db/sentinel/`, `pnpm lint:tenant`     | Las tablas exentas no exigen `tenant_id`, así que las queries de plataforma no disparan el sentinel. La **CLI** sí: `src/db/scripts/require-tenant.ts` exige `--tenant=<id>` a todo script que escriba tablas gym-owned, con exención por comentario grepeable `tenant-safe: <motivo>`. La CLI de D-07 escribe `platform_users` (exenta) ⇒ va con la anotación y el motivo escrito. |
| **Cobertura ISO**                                   | `test/tenancy/iso-04-*.test.ts` (nueva)    | D-16. Patrón a copiar: `iso-03-finance-coach-load.test.ts` (caso + control por ruta). Ver §Validation Architecture.                                                                                                                                                                                                             |

---

## Recomendación firme sobre D-15 (flags de módulo): **no tocar `MODULE_NAMES` en la 182**

D-15 deja al planner decidir si adelanta la entrada de `"gimnasio"` a `MODULE_NAMES`. La investigación dice que **no conviene**, y el motivo es verificable:

`MODULE_NAMES` (`src/modules/shared/modules.ts:35`) tiene los 4 `templo-*` y es la fuente única que importan **`test/tenant-manifest.ts:145`**, **`test/fixtures/module-flags.ts`**, **`test/auth/enabled-modules.test.ts:53`** y **`test/tenancy/mod-01-flags.test.ts:54`**. Agregar `"gimnasio"` produce esta cascada, medida:

- `test/tenancy/mod-01-flags.test.ts:104` — `for (const moduleName of MODULE_NAMES) expect(flags.has(moduleName)).toBe(true)` sobre el tenant 1 ⇒ **falla**, porque la migración 0209 sembró 4 filas y no hay `module.gimnasio.enabled` para el tenant 1. La misma prueba tiene dos `.toBe(4)` hardcodeados (líneas ~94 y ~103).
- `test/fixtures/module-flags.ts:84` — `restoreTemploFlags` recorre `MODULE_NAMES` y pondría `module.gimnasio.enabled = true` **para El Templo** en el `afterEach` de varios archivos. Con `isolate: false` en vitest, ese estado se filtra entre archivos del mismo worker.
- `test/auth/enabled-modules.test.ts:88` — el test "recibe los 4 módulos" empieza a comparar contra 5 nombres; pasaría por accidente (ambos lados derivan de `MODULE_NAMES`) mientras el título miente.

**Y no hace falta.** `parseModuleFlagKey` (`modules.ts:69-76`) **ignora** toda key cuyo nombre no esté en `MODULE_NAMES`, así que una fila `module.gimnasio.enabled = "true"` escrita hoy es **inerte**: no ensucia `enabledModulesFor`, no aparece en `GET /api/auth/me`, y no rompe nada. Es exactamente lo que D-15 quiere: "auditable con un SELECT".

**Recomendación concreta:** definir en el módulo de plataforma

```ts
/** La key existe antes que el módulo: la 184 mete "gimnasio" en MODULE_NAMES
 *  junto con el rename templo-module→feature-module (checklist H-2 del doc 08).
 *  Hasta entonces esta fila es inerte para parseModuleFlagKey — a propósito. */
export const GIMNASIO_FLAG_KEY = "module.gimnasio.enabled";
```

y escribir las 4 filas `templo-*` con `moduleFlagKey(name)` (typed) y la quinta con esta constante. Blast radius: **cero tests existentes tocados**. La 184 hace la entrada al enum, el rename y la actualización de los cuatro archivos acoplados en un commit coherente, que es donde el checklist H-2 la puso.

---

## Numeración de migraciones

**Última migración en esta rama: `0215_referral_partners.sql`** — verificado con `ls el-templo-api/src/db/migrations/` sobre `feat/182-discusion` (basada en `origin/master` fresco). Coincide con la regla dura 3 del ROADMAP ("reservan desde 0216").

- Reservar **0216** para `platform_core` (las dos tablas nuevas).
- Reservar **0217** si el planner adopta la opción (A) de C-2 (`users.must_change_password`).
- **El plan debe re-verificar la numeración al escribir el SQL**, contra `origin/master` **y** `origin/staging`, con el precedente textual del header de la 0215 (que documenta dos renumeraciones por trenes en vuelo — 0209→0210→0215). Hay fases fuera de milestone (179/180) que ya consumieron números.
- Reglas del skill `el-templo-db-migrations`: SQL hand-written junto al schema Drizzle en el **mismo commit**, nunca `drizzle-kit migrate`, y **sin `;` dentro de comentarios `--`** (el runner parte por `;` antes de limpiar comentarios — `run-migrations.ts` lo documenta). El seed idempotente de la 0209 es el modelo de estilo a copiar (`INSERT … SELECT … WHERE NOT EXISTS`).

---

## Common Pitfalls

### Pitfall 1 — El token de plataforma pasa la verificación de tenant (escalada de privilegios)

**Qué sale mal:** el super-owner obtiene acceso a rutas de tenant, y `attachScope` resuelve su `platformUserId` como un `users.id` ajeno.
**Por qué pasa:** un solo `JWT_SECRET` + `fastify.authenticate` que no valida audience (`plugins/auth.ts:50-65`).
**Cómo evitarlo:** `PLATFORM_JWT_SECRET` propio + `aud: "platform"` + claim `platformUserId` (no `userId`). Las tres.
**Señal temprana:** un test que manda el token de plataforma a `GET /api/auth/me` y espera 401. Si devuelve 200 con datos de alguien, el diseño está roto.

### Pitfall 2 — El segundo `@fastify/jwt` pisa `request.user`

**Qué sale mal:** el decorador por default de una instancia namespaced sigue siendo `user`; el payload de plataforma sobreescribe el de tenant y `attachScope` / el hook de Sentry (`app.ts:369-376`) leen basura.
**Cómo evitarlo:** `decoratorName: "platformUser"` explícito, y **nunca** leer `request.user` en el módulo de plataforma.
**Señal temprana:** un test donde coexisten las dos sesiones en el mismo browser (D-09 lo permite explícitamente) y las dos siguen funcionando.

### Pitfall 3 — El interceptor de axios del admin manda el token de tenant a `/api/platform/*`

**Qué sale mal:** cruce de sesiones prohibido por D-09, y un 401 del lado de plataforma dispara el **refresh de tenant** (`createAuthErrorHandler` en `boot/axios.ts:116-160`), que puede terminar deslogueando al staff de El Templo desde la pantalla de plataforma.
**Cómo evitarlo:** instancia `platformApi` separada, con su propio 401 handler y **sin** lógica de refresh.
**Señal temprana:** revisar en devtools que un request a `/platform/tenants` no lleve `adminAccessToken`.

### Pitfall 4 — El INSERT del provisioner cae en el `DEFAULT 1` y siembra en El Templo

**Qué sale mal:** la sede o el owner del gimnasio nuevo nacen con `tenant_id = 1`. `branches.tenant_id` y `users.tenant_id` son `NOT NULL DEFAULT 1`.
**Cómo evitarlo:** `tenantValues(ctx, {...})` en **todos** los INSERT del provisioner, sin excepción. Es la trampa T-168-15, que según el docblock de `second-tenant.ts` "ya mordió dos veces en la fase 169".
**Señal temprana:** `iso-04` debe afirmar `tenantId` de cada fila creada, no solo que "el alta no falló".

### Pitfall 5 — El owner se inserta antes que su sede (o con una sede de otro tenant)

**Qué sale mal:** MySQL rechaza la fila por `fk_users_tenant_branch (tenant_id, branch_id)` con `RESTRICT`, y el error del driver sube como 500 opaco desde adentro de la transacción.
**Cómo evitarlo:** orden fijo tenant → branch(es) → user, y `branchId` tomado del `insertId` de la sede recién creada, nunca de input del cliente.

### Pitfall 6 — El cache de flags de módulo devuelve estado viejo

**Qué sale mal:** el tenant recién creado aparece con módulos distintos a los sembrados durante los primeros 60 s.
**Por qué:** `module-flags.ts` cachea en memoria con TTL 60 s en runtime (0 en test).
**Cómo evitarlo:** llamar `invalidateModuleFlags(tenantId)` **después** del commit de `provisionTenant()` — no dentro de la transacción (si hace rollback, se invalidó un cache que nadie ensució; inofensivo pero confuso).

### Pitfall 7 — La CLI de bootstrap no corre en el servidor

**Qué sale mal:** `pnpm platform:create-user` falla en prod con "tsx: command not found".
**Por qué:** el deploy hace `pnpm install --prod --frozen-lockfile` (`deploy.yml:415`) y **`tsx` es devDependency**. Los scripts que corren en el server lo hacen como JS compilado: `node dist/db/run-migrations.js`.
**Cómo evitarlo:** el script vive en `src/` (entra al `tsc`), se documenta como `node dist/scripts/create-platform-user.js`, y el `package.json` script con `tsx` es solo para local. **Verificar además que `tsconfig.json` incluya la carpeta** (hoy `include` es `src/**`, así que `src/scripts/` entra; `scripts/` en la raíz del paquete, no).

### Pitfall 8 — `paths-filter` no ve los cambios de infra, y puede saltearse un build

**Qué sale mal:** (a) los cambios de nginx/certbot no se deployan nunca porque no están en el pipeline — son manuales por SSH, gate humano (D-02 ya lo asume); (b) un fix que toca solo tests deja el componente sin rebuild.
**Cómo evitarlo:** memorias `reference_deploy_paths_filter_trap` y `feedback_test_only_fix_touch_code_for_deploy`. El runbook de infra va versionado en `deploy/` (junto a `RUNBOOK.md` y `deploy/nginx/`), y la sesión SSH se pide explícitamente.

### Pitfall 9 — Los crons NO están gateados por módulo

**Qué sale mal:** el plan asume, siguiendo D-17, que "con módulos Templo OFF los crons no producen nada", y no lo verifica.
**El hecho:** `isModuleEnabled` se usa **solo** en `module-registry.ts`, `hooks.ts` y `module-flags.ts` — **ningún job de `src/jobs/` consulta flags de módulo**. Los 7 crons con `forEachActiveTenant` (`mark-no-shows`, `auto-approve`, `auto-resume-pauses`, `expire-lost-leads`, `tenure-milestones`, `notification-cron`, `reassign-multibranch`, `wellhub-sync`) van a iterar el tenant nuevo y el `demo`.
**Por qué igual es inofensivo:** son no-op por **ausencia de datos** (0 socios, 0 reservas, 0 leads), no por el flag. Y `forEachActiveTenant` aísla errores por tenant (try/catch dentro del loop, `tenant.ts:263-274`): un gimnasio roto no frena a los demás.
**Cómo evitarlo:** decirlo así en el plan, y que `iso-04` (o `con-04-crons-per-tenant.test.ts`, que ya existe) **afirme** que un tenant recién aprovisionado no produce efectos, en vez de asumirlo. Es la diferencia entre "verificado" y "supuesto".

### Pitfall 10 — El admin no tiene typecheck ni test runner

**Qué sale mal:** el wizard compila en CI y rompe en runtime.
**El hecho:** `el-templo-admin/package.json` no tiene script `typecheck` ni `vue-tsc` ni `vitest`; `vite-plugin-checker` está configurado **solo con eslint** (`quasar.config.js:29-40`); y el job `admin-check` de CI corre `lint` con **`continue-on-error: true`** y después `build`. O sea: el único gate real del admin es que el build no explote. (Coincide con la memoria `reference_ci_no_typecheck_frontends`.)
**Cómo evitarlo:** ver §Validation Architecture — el comando de verificación del admin es `pnpm run build`. Agregar `vue-tsc` o `vitest` **es instalar dependencias** ⇒ gate humano; no meterlo de contrabando en esta fase.

---

## Code Examples

### Registrar el hook de Host antes de las rutas (`app.ts`)

```ts
// el-templo-api/src/app.ts — dentro de buildApp(), DESPUÉS de databasePlugin
// y ANTES del primer register de rutas.
//
// Va acá y no en un plugin de ruta porque `attachScope` NO es un hook global:
// se llama a mano en ~40 call sites después de fastify.authenticate. Un
// onRequest de instancia raíz corre antes que todos ellos por construcción.
await app.register(databasePlugin);
app.addHook("onRequest", resolveTenantByHost(app.db));   // ← NUEVO
```

### CORS: de array estático a función anclada (`app.ts:129-152`)

```ts
// ANTES (hoy): array de 5 orígenes fijos.
// DESPUÉS: función que conserva los 5 y suma el wildcard de la plataforma.
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "";
const platformOrigin = PLATFORM_DOMAIN
  ? new RegExp(`^https://[a-z0-9-]+\\.${PLATFORM_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  : null;

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);              // curl / same-origin / apps nativas
    if (ORIGENES_EL_TEMPLO.includes(origin)) return cb(null, true);   // los 5 de hoy, intactos
    if (platformOrigin?.test(origin)) return cb(null, true);
    return cb(null, false);                          // sin throw: 0 ruido en logs por bots
  },
  methods: ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 86400,   // NO tocar: la TV pollea cada 2,5 s, el comentario de app.ts:148 lo explica
});
```

### Test de resolución por Host (patrón `app.inject`)

```ts
// el-templo-api/test/tenancy/iso-04-*.test.ts
const res = await app.inject({
  method: "GET",
  url: "/api/…",
  headers: { host: `${gym.slug}.localtest.me` },   // D-03: PLATFORM_DOMAIN de test
});
expect(res.statusCode).not.toBe(404);

const desconocido = await app.inject({
  method: "GET",
  url: "/api/…",
  headers: { host: "no-existe.localtest.me" },
});
expect(desconocido.statusCode).toBe(404);
expect(desconocido.json().code).toBe("TENANT_NOT_FOUND");   // D-04
```

### Estilo de migración a copiar (idempotente, sin `;` en comentarios)

```sql
-- 0216_platform_core.sql
-- Fase 182 (PLAT-01): tablas de la capa de plataforma. NINGUNA lleva tenant_id
-- a proposito -- el super-owner esta POR ENCIMA de los tenants (doc 08, Opcion B)
-- y el doc 05 seccion 3 las clasifica como club GLOBAL. Van a
-- TENANT_EXEMPT_TABLES en src/db/tenant-tables.ts, con motivo escrito.
-- NOTE: no semicolons inside these comment lines (the custom runner splits on
-- the semicolon BEFORE stripping the double-dash comments).
CREATE TABLE IF NOT EXISTS `platform_users` ( … );
```

---

## Runtime State Inventory

> Esta fase no es un rename, pero **crea estado de runtime fuera del repo** (infra, secretos, datos de producción). El inventario aplica en ese sentido.

| Categoría                       | Ítems                                                                                                                                                                                                            | Acción requerida                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Datos almacenados**           | Filas nuevas en prod: 1+ `platform_users` (creada por CLI, hash nunca en git — D-07); el tenant `demo` completo con su sede virtual, owner y 5 flags (D-17)                                                       | CLI corrida a mano en el server (SSH gate) + alta por el wizard, no por migración                                        |
| **Config de servicios vivos**   | nginx: vhost wildcard `*.<PLATFORM_DOMAIN>` en staging y prod, **fuera del pipeline**; certbot: cert wildcard + plugin DNS-01 + credenciales de API del DNS en el server; DNS: registro wildcard en el proveedor  | Runbook versionado en `deploy/` + sesión SSH con aprobación explícita (memoria `feedback_always_ask_before_ssh`)         |
| **Estado registrado en el SO**  | pm2 `eltemplo-api` recibe `PLATFORM_DOMAIN`, `PLATFORM_JWT_SECRET` (y `PLATFORM_JWT_EXPIRES_IN`) por entorno; el restart del deploy usa `--update-env`, pero las variables tienen que existir en el `.env` del server | Agregar al `.env` de prod y de staging **antes** del primer deploy que las lea; el `--update-env` ya está en `deploy.yml:432` |
| **Secretos y variables de entorno** | `PLATFORM_JWT_SECRET` (nueva, valor **distinto** de `JWT_SECRET`), `PLATFORM_DOMAIN` (nueva). En el admin: eventual `VITE_PLATFORM_DOMAIN` para el preview de URL del wizard                                    | `.env.example` de `el-templo-api` y de `el-templo-admin` (regla de CLAUDE.md), + secretos de GitHub Actions si el build del admin los necesita |
| **Artefactos de build**         | El admin es UN build para admin+plataforma: cualquier `VITE_*` nueva se hornea en build ⇒ cambiarla exige rebuild, no solo restart                                                                                | Documentarlo en el plan; evitar `VITE_*` si el dato puede venir de la API                                                 |

**Nada encontrado en:** paquetes instalados obsoletos, tareas programadas del SO, colas externas. Verificado: los crons viven dentro del proceso de la API (`src/index.ts:38`), no en cron del sistema.

---

## Environment Availability

| Dependencia                        | Requerida por                          | Disponible | Versión/Estado                     | Fallback                                                                     |
| ---------------------------------- | -------------------------------------- | ---------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `argon2`                           | Hash de super-owner y owner temporal   | ✓          | `^0.44.0`, dependencia de **prod**  | —                                                                            |
| `@fastify/jwt`                     | JWT de plataforma                      | ✓          | `^10.0.0`                          | —                                                                            |
| `@fastify/cors`                    | `origin` como función                  | ✓          | `^11.2.0`                          | —                                                                            |
| `@fastify/rate-limit`              | Rate limit del login (D-08)            | ✗          | 11.2.0 en npm, no instalado        | Limitador en memoria (pm2 fork, 1 instancia ⇒ coherente)                      |
| `vitest` (API)                     | `iso-04`, unit de `hostToSlug`         | ✓          | devDep de `el-templo-api`          | —                                                                            |
| `vitest` / `vue-tsc` (admin)       | Tests unitarios y typecheck del wizard | ✗          | ninguno de los dos está instalado  | `pnpm run build` + `pnpm run lint` + UAT manual                              |
| `tsx` en el servidor               | CLI de bootstrap                       | ✗          | devDep; el server hace `--prod`    | Compilar a `dist/` y correr con `node` (patrón de `run-migrations.js`)        |
| MySQL de test (`eltemplo_test`)    | Tests de integración                   | ✓          | `test/setup.ts` lo prepara por worker | —                                                                         |
| `node_modules` en este worktree    | Correr los tests localmente            | ✗          | worktree sin instalar              | `pnpm install` en `el-templo-api` (instalación de lockfile existente, no dependencia nueva) — o dejar que CI corra la suite (memoria `feedback_tests_run_in_ci_not_local`) |
| certbot + plugin DNS-01            | Cert wildcard (D-02)                   | **desconocido** | El repo no documenta el proveedor de DNS de `eltemplo.org` ni qué plugin de certbot está instalado | Determinar en la sesión SSH; el plugin depende del proveedor (Route53 / Cloudflare / otro) |

**Faltantes bloqueantes sin fallback:** ninguna a nivel código. **A nivel infra**: el proveedor de DNS de `eltemplo.org` y el plugin DNS-01 correspondiente son **desconocidos desde el repo** — `deploy/DEPLOYMENT-GUIDE.md` y `README.md` solo dicen "Let's Encrypt (certbot)" y los vhosts existentes se emitieron con `certbot --nginx` (HTTP-01, que **no** emite wildcards). Esto se resuelve en la sesión SSH de D-02, no antes.

**Faltantes con fallback:** rate limit, typecheck del admin, tsx en el server (los tres detallados arriba).

---

## Validation Architecture

### Test Framework

| Propiedad             | Valor                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Framework (API)       | Vitest (devDep de `el-templo-api`), integración contra MySQL real (`eltemplo_test`, un schema por worker)         |
| Config file           | `el-templo-api/vitest.config.ts` (existe; `isolate: false`, env de test)                                          |
| Quick run command     | `cd el-templo-api && pnpm test -- test/tenancy/iso-04-platform.test.ts`                                            |
| Full suite command    | `cd el-templo-api && pnpm test`                                                                                   |
| Typecheck API         | `cd el-templo-api && pnpm exec tsc --noEmit` (es el gate de CI)                                                    |
| Lint de tenancy       | `cd el-templo-api && pnpm lint:tenant` (gate de CI, CON-06)                                                        |
| Framework (admin)     | **ninguno** — sin vitest ni vue-tsc (§Pitfall 10). Verificación = `pnpm run build` + `pnpm run lint` + UAT manual |

> Memoria `feedback_tests_run_in_ci_not_local`: **no correr la suite completa en local**; typecheck sí. Los comandos "full suite" de acá son los que corre CI.

### Phase Requirements → Test Map

| Req ID      | Comportamiento                                                                     | Tipo        | Comando automatizado                                                                        | ¿Archivo existe?      |
| ----------- | ---------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | --------------------- |
| **PLAT-01** | El login de plataforma devuelve un JWT con `aud: platform`                          | integración | `pnpm test -- test/platform/platform-auth.test.ts`                                            | ❌ Wave 0             |
| **PLAT-01** | Un token de **tenant** contra `/api/platform/*` ⇒ 401                               | integración | idem                                                                                          | ❌ Wave 0             |
| **PLAT-01** | Un token de **plataforma** contra `GET /api/auth/me` ⇒ 401 (el gate de la Pitfall 1) | integración | idem                                                                                          | ❌ Wave 0             |
| **PLAT-01** | Rate limit: N+1 intentos de login ⇒ 429                                             | integración | idem                                                                                          | ❌ Wave 0 (depende del gate de dependencia) |
| **PLAT-01** | `platform_users` y `platform_audit_log` clasificadas y conteos actualizados          | unidad      | `pnpm test -- test/db/tenant-tables.test.ts`                                                  | ✅ (assertions a actualizar) |
| **PLAT-02** | Toda ruta `/api/platform/*` está en el manifiesto con motivo                        | unidad      | `pnpm test -- test/tenancy/iso-01-manifiesto.test.ts`                                         | ✅ (baseline 389 → 389+N) |
| **PLAT-02** | Slug reservado / duplicado / con formato inválido ⇒ error claro, no 500              | integración | `pnpm test -- test/platform/provision-tenant.test.ts`                                         | ❌ Wave 0             |
| **PLAT-02** | `hostToSlug` acepta el subdominio y rechaza `evil-<dominio>.com`                     | unidad      | `pnpm test -- test/unit/host-to-slug.test.ts`                                                 | ❌ Wave 0             |
| **PLAT-03** | El alta crea sede virtual con el nombre literal y `is_virtual = true`                | integración | `pnpm test -- test/platform/provision-tenant.test.ts`                                         | ❌ Wave 0             |
| **PLAT-03** | El alta escribe exactamente 5 filas `module.*` (1 ON + 4 OFF)                        | integración | idem                                                                                          | ❌ Wave 0             |
| **PLAT-03** | Un fallo a mitad del alta deja **cero** filas (rollback total)                       | integración | idem — forzar el fallo en el último INSERT                                                    | ❌ Wave 0             |
| **PLAT-03** | Ninguna fila del alta queda con `tenant_id = 1` (trampa del DEFAULT)                 | integración | idem                                                                                          | ❌ Wave 0             |
| **Éxito 4** | Aislamiento: owner nuevo no ve datos del tenant 1 ni al revés                        | integración | `pnpm test -- test/tenancy/iso-04-platform.test.ts`                                           | ❌ Wave 0             |
| **Éxito 4** | Host desconocido ⇒ 404 `TENANT_NOT_FOUND`; host del slug nuevo resuelve              | integración | idem                                                                                          | ❌ Wave 0             |
| **Éxito 4** | `iso-01..03` siguen verdes                                                           | integración | `pnpm test -- test/tenancy/`                                                                  | ✅                    |
| **Éxito 4** | Un tenant recién aprovisionado no produce efectos en los 7 crons (Pitfall 9)         | integración | `pnpm test -- test/tenancy/con-04-crons-per-tenant.test.ts`                                   | ✅ (caso a agregar)   |
| **PLAT-02** | El admin compila con el wizard y las páginas de plataforma                           | build       | `cd el-templo-admin && pnpm run build`                                                        | ✅                    |

### Sampling Rate

- **Por commit de tarea:** `pnpm exec tsc --noEmit` (API) o `pnpm run lint` (admin) — segundos.
- **Por merge de ola:** el archivo de test de esa ola + `pnpm test -- test/tenancy/` + `pnpm lint:tenant`.
- **Phase gate:** suite completa verde en CI + build del admin verde, antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/platform/platform-auth.test.ts` — PLAT-01 (login, aud, cruce de tokens en ambos sentidos)
- [ ] `test/platform/provision-tenant.test.ts` — PLAT-02/03 (alta, rollback, flags, slug)
- [ ] `test/unit/host-to-slug.test.ts` — la función pura, incluido el caso `evil-<dominio>`
- [ ] `test/tenancy/iso-04-platform.test.ts` — D-16, copiando el patrón caso+control de `iso-03-finance-coach-load.test.ts`
- [ ] `test/fixtures/platform.ts` — helper para crear un `platform_users` de test y obtener su token (análogo a `getAuthToken`), + limpieza (`cleanAllTestData` no conoce las tablas nuevas: hay que agregarlas a `TABLES_TO_CLEAN` o limpiarlas en el `afterAll` del archivo)
- [ ] Actualizar `ENTRADAS_BASELINE` (389 → 389+N) y los conteos de `test/db/tenant-tables.test.ts` (95→97, `.toBe(4)`→`.toBe(6)`)
- [ ] **No** instalar framework de tests en el admin (gate de dependencia); su verificación es build + lint + UAT

### Manual-Only Verifications

- UAT del subdominio real del tenant `demo` en producción (D-17): abrir `demo.<PLATFORM_DOMAIN>`, verificar cert wildcard válido y que la API resuelve el tenant.
- Verificar que `admin.eltemplo.org` y `app.eltemplo.org` siguen funcionando idénticos después del deploy (D-05) — es la verificación más importante de la fase y no la cubre ningún test automático de extremo a extremo.
- La contraseña temporal se muestra una sola vez y no reaparece al recargar (D-13).

---

## Security Domain

### Categorías ASVS aplicables

| Categoría ASVS            | Aplica  | Control estándar en esta fase                                                                                                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V2 Authentication**     | **sí**  | `argon2` (mismo que `users`); contraseña fuerte exigida por el CLI; contraseña temporal generada con `crypto.randomBytes`, **nunca** `Math.random`; rate limit en el login |
| **V3 Session Management** | **sí**  | JWT de 8 h sin refresh largo (D-08); **secreto propio** (Pitfall 1); almacenamiento en clave de localStorage distinta (D-09); sin cookies ⇒ sin superficie CSRF            |
| **V4 Access Control**     | **sí**  | `requirePlatformAuth` en el borde de todas las rutas `/api/platform/*`; el guard del router de Vue es UX, **no** control de acceso; el super-owner nunca pasa por `attachScope` |
| **V5 Input Validation**   | **sí**  | JSON Schema de Fastify en cada ruta (patrón vigente, p. ej. `loginSchema` en `auth/routes.ts:619`); validación del slug contra regex anclada + lista de reservados + unique de DB |
| **V6 Cryptography**       | **sí**  | Nada hecho a mano: `argon2` para hash, `@fastify/jwt` para firma, `crypto.randomBytes` para la contraseña temporal                                                          |
| **V7 Error/Logging**      | **sí**  | 404 genérico para host desconocido (D-04: no filtra existencia); `platform_audit_log` para acciones de plataforma; la contraseña temporal **jamás** en un log (Sentry ya scrubbea `password`, pero el nombre del campo debe ser scrubbeable) |
| **V13 API**               | **sí**  | CORS con regex anclada, nunca `endsWith`; `maxAge` de preflight sin tocar (la TV depende de él)                                                                            |

### Patrones de amenaza para este stack

| Patrón                                                         | STRIDE                     | Mitigación estándar                                                                                                                    |
| -------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Token de plataforma aceptado en rutas de tenant                 | Elevation of Privilege     | Secreto JWT propio + `allowedAud` + claim `platformUserId` (las tres, Pitfall 1)                                                          |
| Header `Host` manipulado para hacerse pasar por otro gimnasio   | Spoofing                   | nginx `server_name` explícito + `default_server` que rechaza; API con regex anclada + lookup exacto; sin `?? 1` (H-3)                     |
| Origen CORS `https://evil-<dominio>.com`                        | Spoofing                   | Regex `^https://[a-z0-9-]+\.<dominio escapado>$`, nunca `endsWith` (doc 08 (g))                                                            |
| Fuerza bruta sobre el login de plataforma                       | Elevation of Privilege     | Rate limit (D-08) + `argon2` (coste por intento) + respuesta genérica "Credenciales invalidas" idéntica para usuario inexistente y clave mala |
| Enumeración de gimnasios por respuesta del Host                 | Information Disclosure     | 404 genérico `TENANT_NOT_FOUND` (D-04)                                                                                                    |
| Mass-assignment del `tenantId` en el alta                       | Tampering                  | `tenantValues(ctx, …)` estampa el tenant **después** del spread (T-169-02)                                                                |
| Alta parcial que deja un gimnasio inconsistente                 | Denial of Service (datos)  | Transacción única con rollback (D-14) + validación previa del slug                                                                        |
| Repudio de una acción de plataforma                             | Repudiation                | `platform_audit_log` escrito **dentro** de la misma transacción, actor tomado del token verificado, nunca del body (patrón de `audit-log.ts`) |
| Contraseña temporal filtrada                                    | Information Disclosure     | Devuelta una sola vez en el POST del alta, nunca persistida en el front, nunca logueada, cambio forzado al primer login (C-2)             |

---

## State of the Art

| Enfoque anterior (en este repo)                            | Enfoque actual                                                             | Cuándo cambió              | Qué implica para la 182                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `users.email` único global                                 | `uq_users_tenant_email (tenant_id, email)`                                  | Fase 168 (CON-01)          | El owner del gimnasio nuevo puede repetir un email de El Templo — **pero el login sigue siendo cross-tenant con `.limit(1)`** (deuda T-173-15, intacta por D-05). El wizard **debería** advertir si el email ya existe en otro tenant |
| Sin tenancy                                                | 5 capas de enforcement + manifiesto + sentinel + lint                       | v6.0 (fases 166-178)       | Toda superficie nueva entra por los gates o CI queda rojo                        |
| `origin` de CORS como array estático                       | Sigue siendo array — la función es **trabajo de esta fase**                 | —                          | DIS-02 (g)                                                                       |
| Flags de módulo inexistentes                               | `module.<x>.enabled` en `tenant_settings`, fail-closed, cache 60 s          | Fase 176 (MOD-01)          | El alta siembra los 5 flags; `invalidateModuleFlags` después del commit           |
| `certbot --nginx` (HTTP-01) por vhost                      | Necesita **DNS-01** para wildcard                                           | Esta fase                  | HTTP-01 no emite wildcards [CITED: letsencrypt.org/docs/challenge-types/]         |

**Deprecado / que no se usa:**

- `drizzle-kit migrate` — **prohibido** (Hard Rule 1 del skill de migraciones); `_migrations` es la única fuente de verdad.
- `attachCountryScope` — alias `@deprecated` de `attachScope` (`country-scope.ts:288`); el código nuevo usa `attachScope`. Las rutas de plataforma **no llaman a ninguno de los dos**.
- `tv_pairings` / `tv_devices` — muertas desde la fase 164, sin relación con esta fase.

---

## Assumptions Log

| #      | Claim                                                                                                                                | Sección              | Riesgo si es falso                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | El proveedor de DNS de `eltemplo.org` soporta un plugin de certbot con API (DNS-01)                                                    | Environment / D-02   | Si el proveedor no tiene plugin, el cert wildcard exige renovación manual o migrar el DNS ⇒ D-02 cambia de forma. **Verificar en la sesión SSH** |
| **A2** | Los 7 crons son no-op sobre un tenant sin datos                                                                                       | Pitfall 9            | Un cron que asuma "todo tenant tiene al menos una sede/plan/config" podría lanzar. El try/catch de `forEachActiveTenant` lo absorbe, pero llenaría Sentry. **Verificar con test** |
| **A3** | Un plan de expiración de 8 h sin refresh es aceptable operativamente para el super-owner                                              | D-08                 | Si el alta de un tenant toma más que eso, o el super-owner trabaja una jornada larga, molesta. Es reversible por env var                |
| **A4** | El admin no necesita test unitario nuevo para el wizard (build + UAT alcanzan)                                                        | Validation           | Un bug de wizard llega a UAT en vez de a CI. La alternativa (instalar vitest en el admin) es un gate de dependencia                    |
| **A5** | La contraseña temporal mostrada una sola vez es aceptable sin camino de recuperación en esta fase                                     | D-11/D-13            | Si se pierde, hoy no hay reset documentado. CONTEXT lo difiere ("el planner elige el mínimo") — proponer reset por el mismo CLI de D-07 |
| **A6** | Agregar dos tablas a `TENANT_EXEMPT_TABLES` no dispara otros gates además de los dos conteos identificados                            | Gates                | Podría haber un verificador de schema físico (`db:verify-tenant`) con su propia lista. **Correr `pnpm db:verify-tenant` antes de cerrar** |
| **A7** | `provisionTenant()` puede correr entero dentro de un `db.transaction` de Drizzle sin chocar con el sentinel de tenancy                | Patrón 3             | El sentinel envuelve el pool; si intercepta el `tx`, los INSERT sobre tablas exentas igual pasan (no son strict). Riesgo bajo, verificable en el primer test |

---

## Open Questions

> **RESUELTAS por el usuario el 2026-08-28 (ver `182-CONTEXT.md` §"Decisiones post-research", D-18 y D-11/D-17 enmendadas):**
>
> 1. **Topología → opción NUEVA "D": tenant pre-login por `Origin` / header `X-Tenant-Slug`.** La API sigue en un solo hostname; NO hay `api-<slug>.<PLATFORM_DOMAIN>` ni vhost regex de API. Toda mención a "resolución por `Host`" / `hostToSlug` en este documento se lee como "resolución por `Origin` (hostname del front bajo `PLATFORM_DOMAIN`, regex anclada) con fallback `X-Tenant-Slug`"; la función pura pasa a llamarse `originToSlug` (o equivalente) y su test unitario cubre `Origin` ajeno, `evil-<dominio>` y ausencia de ambos (⇒ comportamiento actual, D-05).
> 2. **D-11 → SIN cambio forzado de contraseña.** No se crea `users.must_change_password`, no se toca el login de El Templo; el wizard fija la contraseña definitiva del owner (escrita o generada). La reserva de **0217** para esa columna queda sin uso.
> 3. **Tenant `demo` → staging primero, luego prod**, por el mismo wizard, verificando qué base usa cada entorno.
> 4. **N de rutas `/api/platform/*`** → lo fija el planner y actualiza `ENTRADAS_BASELINE` en el mismo commit.

### 1. ¿Por qué hostname llega un request de un tenant a la API? (bloquea D-02, no bloquea el código) — RESUELTA (opción D, arriba)

- **Lo que sabemos:** H-3 firma resolución por `Host` contra `tenants.slug`. DIS-02 (g) firma que ningún vhost de front proxea `/api` y que el subdominio del gimnasio llama a la API **siempre cross-origin**, con `VITE_API_URL` horneada en build. Los vhosts actuales sirven la API en **un solo hostname** (`api.eltemplo.org` / `api-staging.eltemplo.org`).
- **Lo que no cierra:** si la API vive en un único hostname, el header `Host` que ve Fastify es **constante** y la resolución por Host no resuelve nada. Y como la app de alumnos es **un solo build para todos los tenants**, `VITE_API_URL` no puede llevar el slug horneado.
- **Opciones concretas:**
  - **(A) Hostname de API por tenant bajo el mismo wildcard.** `api-<slug>.<PLATFORM_DOMAIN>` (un solo label ⇒ **cubierto por el mismo cert wildcard** `*.<PLATFORM_DOMAIN>`), vhost con `server_name` regex que proxea a Fastify. El front deriva su base URL en runtime desde `window.location.hostname`. Conserva cross-origin y la función de CORS tal como el doc 08 (g) las pide. **Recomendada.** Nota: `<slug>.api.<PLATFORM_DOMAIN>` **no** sirve — un wildcard de Let's Encrypt cubre un solo nivel de label.
  - **(B) El vhost wildcard proxea `/api/` a Fastify** ⇒ las llamadas del subdominio son **same-origin**, el `Host` es el del tenant naturalmente, y el problema de CORS desaparece para Kaia. Es lo más simple técnicamente, pero **contradice el texto de DIS-02 (g)** y habría que enmendar el doc 08. No toca los vhosts de El Templo.
  - **(C) No usar `Host`: el login de Kaia manda el slug en el body** y a partir de ahí todo se resuelve por `users.tenant_id` como hoy. Resuelve la deuda T-173-15 sin capa de host, pero **contradice H-3, que está firmado**.
- **Recomendación:** planificar el código para (A) — `hostToSlug` con el patrón de un label bajo `PLATFORM_DOMAIN` sirve para (A) y (B) sin cambios — y **llevar la elección de topología al usuario antes de la sesión SSH de D-02**. El código y los tests de la fase no dependen de la respuesta; el runbook y el vhost sí.

### 2. ¿D-11 justifica tocar el login de El Templo? (bloquea el alcance)

- **Lo que sabemos:** no existe columna de cambio forzado (C-2); implementarlo es aditivo pero toca `users` y la respuesta de `POST /api/auth/login`.
- **Lo que no sabemos:** si "no quiero tocar nada del templo" admite un cambio aditivo con test de no-regresión, o si es literal.
- **Recomendación:** el planner **pregunta**; opción (A) de C-2 si el usuario acepta, opción (B) si no. No decidirlo en silencio.

### 3. ¿El tenant `demo` va en la DB de prod compartida con staging?

- **Lo que sabemos:** memoria `reference_staging_db_same_host` — staging y prod **comparten host MySQL**. D-17 pone el demo en producción.
- **Lo que no sabemos:** si el demo debe existir también en la base de staging (para probar el wizard sin ensuciar prod) o solo en prod.
- **Recomendación:** crear el demo **primero en staging** (staging-first estricto) y, si se aprueba, repetir el alta en prod por el mismo wizard. Dos tenants distintos, dos slugs distintos si comparten base — verificar cuál base usa cada entorno antes de correr el alta.

### 4. ¿Cuántas rutas expone `/api/platform/*` en esta fase?

- Afecta el `ENTRADAS_BASELINE` (389 → 389+N). Mínimo viable: `POST /api/platform/auth/login`, `GET /api/platform/auth/me`, `POST /api/platform/tenants`, y probablemente `GET /api/platform/tenants/slug-disponible` para el wizard. El planner fija N y actualiza el baseline en el mismo commit que registra las rutas.

---

## Sources

### Primarias (HIGH confidence) — código y docs de este repo, leídos en `feat/182-discusion`

- `el-templo-api/src/plugins/auth.ts` — registro de `@fastify/jwt`, `JWT_SECRET`, `fastify.authenticate` sin `allowedAud`, payload `{userId,email,role}`
- `el-templo-api/src/modules/auth/routes.ts:616-777` — login de tenant, `argon2.verify`, firma de token legacy 7 d + access 30 m + refresh opaco; deuda T-173-15 documentada in-line
- `el-templo-api/src/app.ts` — CORS array estático (129-152), orden de registros, seam `onRoute` (104), hook de Sentry (369)
- `el-templo-api/src/modules/shared/country-scope.ts` — `attachScope` es función (no hook), `TENANT_SUSPENDED`, forma de `CountryScope`
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`/`tenantValues`/`assertTenant`/`forEachActiveTenant`
- `el-templo-api/src/modules/shared/modules.ts` + `module-flags.ts` + `module-registry.ts` — `MODULE_NAMES`, `moduleFlagKey`, `parseModuleFlagKey`, cache TTL, `requireModule`
- `el-templo-api/src/db/schema/{tenants,users,branches,audit-log}.ts` — columnas, uniques, FK compuesta `fk_users_tenant_branch`, `RESERVED_TENANT_SLUGS`
- `el-templo-api/src/db/tenant-tables.ts` — `TENANT_EXEMPT_TABLES`, `TENANT_STRICT_MODULES`, `PLATFORM_PHYSICAL_TABLES`
- `el-templo-api/test/tenant-manifest.ts` + `test/tenancy/iso-01-manifiesto.test.ts:261` — categorías y `ENTRADAS_BASELINE = 389`
- `el-templo-api/test/db/tenant-tables.test.ts:99,105` — conteos 91+4=95 y `TENANT_EXEMPT_TABLES.length === 4`
- `el-templo-api/test/tenancy/mod-01-flags.test.ts` + `test/fixtures/module-flags.ts` + `test/auth/enabled-modules.test.ts` — la cascada de `MODULE_NAMES`
- `el-templo-api/src/modules/finance/coach-load-routes.ts:289-322` y `src/modules/subscriptions/service.ts:5390` — el literal `"Templo Online"`
- `el-templo-api/src/db/run-migrations.ts`, `src/db/migrations/0209_seed_module_flags.sql`, `0215_referral_partners.sql` — runner, estilo y numeración
- `el-templo-api/src/db/scripts/require-tenant.ts` — regla `--tenant` y exención `tenant-safe:`
- `el-templo-admin/src/boot/axios.ts`, `src/router/index.ts`, `src/stores/useAuthStore.ts`, `quasar.config.js`, `package.json` — interceptor único, guard por `allowedRoles`, ausencia de vitest/vue-tsc
- `.github/workflows/{ci.yml,deploy.yml}`, `deploy/nginx/*`, `deploy/RUNBOOK.md` — gates de CI, `pnpm install --prod`, `proxy_set_header Host $host`, pm2 fork
- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — H-3 (140-195), Definición 7 (979-1050), DIS-02 (f)/(g) (1157-1198), Decisiones heredadas (1474-1540)
- `.docs/saas-multitenancy/07-receta-adopcion.md` §1.4 — sede virtual obligatoria por gimnasio
- `.planning/ROADMAP.md` — reglas duras del milestone; `.planning/REQUIREMENTS.md` — PLAT-01..03

### Secundarias (MEDIUM-HIGH)

- [CITED: github.com/fastify/fastify-jwt README] — opciones `namespace`, `jwtVerify`, `jwtSign`, `decoratorName`, `sign.aud`, `verify.allowedAud` para múltiples instancias
- [VERIFIED: npm registry, 2026-08-28] — `@fastify/rate-limit@11.2.0`, publicado 2026-08-06, 2.561.923 descargas/semana, repo `github.com/fastify/fastify-rate-limit`, sin `postinstall`; `slopcheck install -e npm` ⇒ `[OK]`
- [CITED: letsencrypt.org/docs/challenge-types/ — vía doc 08 (f), verificado por el autor del doc el 2026-08-27] — HTTP-01 no emite certificados wildcard

### Terciarias (LOW — marcadas para validar)

- El proveedor de DNS de `eltemplo.org` y el plugin de certbot correspondiente: **no determinable desde el repo**. Se valida en la sesión SSH de D-02 (asunción A1).

---

## Metadata

**Desglose de confianza:**

- Inventario del repo (archivos, líneas, conteos, gates): **HIGH** — todo leído directamente en esta rama, con referencias de archivo:línea
- Conflictos CONTEXT↔código (C-1..C-5): **HIGH** — cada uno con evidencia negativa exhaustiva (greps de todo `src/` y `test/`)
- Patrón del segundo JWT: **HIGH** para el riesgo (verificado en el código), **MEDIUM-HIGH** para la API exacta de `namespace` (README oficial vía WebFetch, no verificado ejecutando — el worktree no tiene `node_modules`)
- Topología de infra (nginx/DNS/certbot): **MEDIUM** — depende de una decisión de producto abierta y de estado del servidor no inspeccionable sin SSH
- Cascada de `MODULE_NAMES`: **HIGH** — los cuatro consumidores leídos, las assertions hardcodeadas citadas

**Research date:** 2026-08-28
**Valid until:** ~2026-09-27 (30 días). Se invalida antes si entra otro tren que consuma migraciones o agregue rutas: **re-verificar `ENTRADAS_BASELINE`, los conteos de tablas y el número de migración libre** al escribir cada plan.
