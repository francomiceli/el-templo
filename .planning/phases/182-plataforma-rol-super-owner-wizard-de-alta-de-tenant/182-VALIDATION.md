---
phase: 182
slug: plataforma-rol-super-owner-wizard-de-alta-de-tenant
status: approved
nyquist_compliant: true
wave_0_complete: false  # los archivos de test se crean dentro de los planes 182-02/03/04/05/07
created: 2026-08-28
---

# Phase 182 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Fuente: `182-RESEARCH.md` §Validation Architecture, ajustada con las decisiones post-research del CONTEXT (D-18: tenant pre-login por `Origin`/`X-Tenant-Slug`, no por hostname de la API; D-11 enmendada: sin cambio forzado de contraseña).

---

## Test Infrastructure

| Property               | Value                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest (API) — integración contra MySQL real (`eltemplo_test`). Admin: **sin framework** (build + lint + UAT; no se instala nada, gate de deps) |
| **Config file**        | `el-templo-api/vitest.config.ts`                                                                                                             |
| **Quick run command**  | `cd el-templo-api && pnpm exec tsc --noEmit` (por commit) · `pnpm test -- test/platform/<archivo>.test.ts` (por tarea con test propio)        |
| **Full suite command** | `cd el-templo-api && pnpm test` + `pnpm lint:tenant` + `cd el-templo-admin && pnpm run build && pnpm run lint` — **en CI, no local** (memoria `feedback_tests_run_in_ci_not_local`) |
| **Estimated runtime**  | typecheck ~20 s · un archivo de integración ~30-90 s · suite completa: minutos (solo CI)                                                     |

---

## Sampling Rate

- **After every task commit:** Run `cd el-templo-api && pnpm exec tsc --noEmit` (API) o `cd el-templo-admin && pnpm run lint` (admin)
- **After every plan wave:** Run el/los archivos de test de esa ola en foreground + `pnpm test -- test/tenancy/` + `pnpm lint:tenant`
- **Before `/gsd:verify-work`:** Full suite must be green (CI en staging) + build del admin verde
- **Max feedback latency:** 90 seconds (un archivo de integración)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 182-01-01 | 182-01 | 1 | PLAT-01 | T-182-01 | `PLATFORM_JWT_SECRET`/`PLATFORM_DOMAIN` documentadas y disponibles en el entorno de tests; `MODULE_NAMES` intacto | typecheck | `cd el-templo-api && pnpm exec tsc --noEmit` | ✅ | ⬜ pending |
| 182-01-02 | 182-01 | 1 | PLAT-01 | T-182-11 | `platform_users` y `platform_audit_log` clasificadas como exentas con motivo; conteos 95→97, `.toBe(4)`→`.toBe(6)` | unit | `pnpm test -- test/db/tenant-tables.test.ts` | ✅ | ⬜ pending |
| 182-02-03 | 182-02 | 2 | PLAT-01 | T-182-01 | Login de plataforma emite JWT con `aud: platform` y secreto propio (`PLATFORM_JWT_SECRET`) | integration | `pnpm test -- test/platform/platform-auth.test.ts` | ❌ W0 (lo crea 182-02-03) | ⬜ pending |
| 182-02-03 | 182-02 | 2 | PLAT-01 | T-182-01 | Token de tenant contra `/api/platform/*` ⇒ 401 | integration | idem | ❌ W0 (lo crea 182-02-03) | ⬜ pending |
| 182-02-03 | 182-02 | 2 | PLAT-01 | T-182-01 | Token de plataforma contra `GET /api/auth/me` ⇒ 401 (no escala a tenant) | integration | idem | ❌ W0 (lo crea 182-02-03) | ⬜ pending |
| 182-02-03 | 182-02 | 2 | PLAT-01 | T-182-13 | Email inexistente, usuario inactivo y contraseña mala ⇒ el MISMO 401 (sin enumeración) | integration | idem | ❌ W0 (lo crea 182-02-03) | ⬜ pending |
| 182-02-03 | 182-02 | 2 | PLAT-02 | — | Las 2 rutas de `/api/platform/auth/*` en el manifiesto con motivo; `ENTRADAS_BASELINE` 389→391 | unit | `pnpm test -- test/tenancy/iso-01-manifiesto.test.ts` | ✅ | ⬜ pending |
| 182-03-01 | 182-03 | 3 | PLAT-01 | T-182-SC | Instalar `@fastify/rate-limit` es decisión del usuario (gate bloqueante, nunca auto-aprobable) | checkpoint | MISSING — gate humano; la respuesta queda registrada en el SUMMARY | n/a | ⬜ pending |
| 182-03-03 | 182-03 | 3 | PLAT-01 | T-182-02 | N+1 intentos de login ⇒ 429; `POST /api/auth/login` sigue en 200 (no contamina El Templo) | integration | `pnpm test -- test/platform/platform-auth.test.ts` | ❌ W0 (lo extiende 182-03-03) | ⬜ pending |
| 182-04-01 | 182-04 | 3 | PLAT-02 | T-182-03 | `Origin` bajo `PLATFORM_DOMAIN` (regex anclada) resuelve el slug; `evil-<dominio>`, multi-label y dominio pelado ⇒ `null` | unit | `pnpm test -- test/unit/origin-to-slug.test.ts` | ❌ W0 (lo crea 182-04-01) | ⬜ pending |
| 182-04-03 | 182-04 | 3 | PLAT-02 | T-182-04 | Slug desconocido ⇒ 404 `TENANT_NOT_FOUND`; tenant no activo ⇒ 403 `TENANT_SUSPENDED`; `X-Tenant-Slug` resuelve y no admite inyección | integration | `pnpm test -- test/platform/tenant-resolution.test.ts` | ❌ W0 (lo crea 182-04-03) | ⬜ pending |
| 182-04-03 | 182-04 | 3 | PLAT-01 | T-182-32 | Login de El Templo idéntico con y sin header `Origin` — no-regresión D-05 | integration | `pnpm test -- test/auth/` | ✅ | ⬜ pending |
| 182-05-03 | 182-05 | 4 | PLAT-02 | — | Las 2 rutas de `/api/platform/tenants` en el manifiesto con motivo; `ENTRADAS_BASELINE` 391→393 | unit | `pnpm test -- test/tenancy/iso-01-manifiesto.test.ts` | ✅ | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-02 | T-182-03b | Slug reservado / formato inválido ⇒ 400 `SLUG_INVALIDO`; slug tomado ⇒ 409 `SLUG_TOMADO`, nunca 500 | integration | `pnpm test -- test/platform/provision-tenant.test.ts` | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | — | Alta crea sede virtual con el nombre literal `"Templo Online"` e `is_virtual = true` | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | — | Alta escribe exactamente 5 filas `module.*` (gimnasio ON + 4 templo OFF), verificadas clave por clave | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | T-182-06 | Fallo a mitad del alta ⇒ cero filas (rollback total) | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | T-182-05 | Ninguna fila del alta queda con `tenant_id = 1` (trampa del DEFAULT) | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | T-182-08 | Cada alta deja 1 fila en `platform_audit_log` con el actor del token y sin la contraseña | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-04 | 182-05 | 4 | PLAT-03 | — | Owner creado con contraseña definitiva del wizard; loguea por `POST /api/auth/login` sin cambios en el login (D-11 enmendada) | integration | idem | ❌ W0 (lo crea 182-05-04) | ⬜ pending |
| 182-05-02 | 182-05 | 4 | PLAT-03 | — | `MODULE_NAMES` sigue con 4 entradas: `mod-01-flags` y `enabled-modules` verdes (D-15) | integration | `pnpm test -- test/tenancy/mod-01-flags.test.ts test/auth/enabled-modules.test.ts` | ✅ | ⬜ pending |
| 182-06-01 | 182-06 | 4 | PLAT-01 | T-182-20 | El CLI de bootstrap compila a `dist/` y no exige `--tenant` (tabla exenta, con `tenant-safe:`) | build+lint | `cd el-templo-api && pnpm build && test -f dist/scripts/create-platform-user.js && pnpm lint:tenant` | ✅ | ⬜ pending |
| 182-07-01 | 182-07 | 5 | Éxito 4 | T-182-06b | Owner nuevo no ve datos del tenant 1 ni al revés (caso + control); super-owner 401 en rutas de tenant; usuario de tenant 401 en `/api/platform/*`; slug desconocido ⇒ 404 | integration | `pnpm test -- test/tenancy/iso-04-platform.test.ts` | ❌ W0 (lo crea 182-07-01) | ⬜ pending |
| 182-07-01 | 182-07 | 5 | Éxito 4 | — | `iso-01..03` siguen verdes | integration | `pnpm test -- test/tenancy/` | ✅ | ⬜ pending |
| 182-07-02 | 182-07 | 5 | Éxito 4 | T-182-25 | Tenant recién aprovisionado no produce efectos en los 7 crons `forEachActiveTenant` | integration | `pnpm test -- test/tenancy/con-04-crons-per-tenant.test.ts` | ✅ (caso agregado por 182-07-02) | ⬜ pending |
| 182-08-03 | 182-08 | 5 | PLAT-01 | T-182-26 | El admin compila con `/plataforma/*`; `platformApi` no adjunta `adminAccessToken` y no tiene refresh | build+lint | `cd el-templo-admin && pnpm run build && pnpm run lint` | ✅ | ⬜ pending |
| 182-09-02 | 182-09 | 6 | PLAT-02 | T-182-07c | El admin compila con el wizard; la contraseña no toca `localStorage` ni `console` | build+lint | `cd el-templo-admin && pnpm run build && pnpm run lint` | ✅ | ⬜ pending |
| 182-09-03 | 182-09 | 6 | PLAT-02 | T-182-07c | Wizard end-to-end en local: slug reservado/inválido, contraseña visible una sola vez, sesiones que conviven, tokens que no se cruzan | checkpoint | MISSING — el admin no tiene framework de tests (gate de dependencia); equivalente automatizado en `test/platform/provision-tenant.test.ts` + build | n/a | ⬜ pending |
| 182-10-01..04 | 182-10 | 7 | PLAT-01/02/03 | T-182-22b, T-182-31, T-182-32 | Infra real (DNS, cert DNS-01, vhost + `default_server`), secretos por entorno, bootstrap del super-owner, tenant `demo` staging→prod y UAT de no-regresión de El Templo | checkpoint | MISSING — gates humanos de infra/producción; la evidencia es la confirmación del usuario + la Bitácora del runbook | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*IDs de tarea con formato `182-<plan>-<task>`. Las filas marcadas `❌ W0` indican que el archivo de test todavía no existe y lo crea la propia tarea (TDD: el test se escribe antes de dar la tarea por terminada).*

*Excepciones a la regla Nyquist, todas justificadas: las 6 tareas `checkpoint` (agrupadas en 3 filas: 182-03 t1, 182-09 t3, 182-10 t1-t4) son gates humanos por naturaleza (decisión de dependencia, UI sin framework de tests, infra fuera del pipeline). Ninguna secuencia de 3 tareas consecutivas queda sin verificación automatizada.*

---

## Wave 0 Requirements

Archivos de test que no existen y que crean los propios planes (cada uno dentro de la tarea que
implementa el comportamiento — TDD por tarea, no una ola de tests aparte):

- [ ] `el-templo-api/test/fixtures/platform.ts` — plan **182-02** (task 3): `seedPlatformUser`, `getPlatformAuthToken`, `limpiarPlataforma`; extendido en **182-07** (task 1) con `seedGimnasioAprovisionado`/`limpiarGimnasioAprovisionado`. **No** se toca `test/helpers.ts` (`TABLES_TO_CLEAN`): la limpieza vive en el fixture.
- [ ] `el-templo-api/test/platform/platform-auth.test.ts` — plan **182-02** (task 3): login, `aud`, cruce de tokens en ambos sentidos, no-regresión del login de El Templo; extendido en **182-03** (task 3) con el 429.
- [ ] `el-templo-api/test/unit/origin-to-slug.test.ts` — plan **182-04** (task 1): función pura, incluido `evil-<dominio>`.
- [ ] `el-templo-api/test/platform/tenant-resolution.test.ts` — plan **182-04** (task 3): 404 `TENANT_NOT_FOUND`, 403 `TENANT_SUSPENDED`, `X-Tenant-Slug`, bypass total de El Templo.
- [ ] `el-templo-api/test/platform/provision-tenant.test.ts` — plan **182-05** (task 4): alta, rollback, 5 flags, slug, `tenant_id`, auditoría, login del owner.
- [ ] `el-templo-api/test/tenancy/iso-04-platform.test.ts` — plan **182-07** (task 1): D-16, patrón caso+control de `iso-03-finance-coach-load.test.ts`, con el gimnasio creado por `provisionTenant()` real.
- [ ] Caso nuevo en `el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts` — plan **182-07** (task 2).
- [ ] Conteos y baselines actualizados **en el mismo commit** que registra tablas/rutas: `test/db/tenant-tables.test.ts` (95→97, `.toBe(4)`→`.toBe(6)`) en **182-01**; `ENTRADAS_BASELINE` 389→**391** en **182-02** y 391→**393** en **182-05** (N total = 4 rutas de `/api/platform/*`).
- [ ] **No** instalar framework de tests en el admin (gate de dependencia) — su verificación es `pnpm run build` + `pnpm run lint` + UAT (planes 182-08 y 182-09).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `admin.eltemplo.org` y `app.eltemplo.org` siguen idénticos tras el deploy (D-05) | PLAT-01 | No hay E2E automático; es la verificación más importante de la fase | Login de admin y app en staging tras el deploy; navegar Horarios/Alumnos/TV; confirmar que nada cambió |
| Subdominio real del tenant `demo` (staging primero, luego prod — D-17) | PLAT-02/03 | Infra (nginx wildcard + cert DNS-01) fuera del pipeline; requiere sesión SSH aprobada | Abrir `demo.staging.<PLATFORM_DOMAIN>`; cert wildcard válido; un `fetch` con ese `Origin` a la API resuelve el tenant (200 en ruta pública) |
| Contraseña del owner mostrada una sola vez (D-13) | PLAT-02 | Comportamiento de UI (sin framework de tests en admin) | Completar el wizard; copiar la contraseña; recargar la pantalla final: no reaparece |
| Wizard end-to-end en staging | PLAT-02/03 | UI sin tests automáticos | Alta `demo` en staging; verificar con SELECT las 5 filas `module.*`, sede virtual, owner; login del owner en `admin` |
| Bootstrap CLI `platform:create-user` en el servidor (D-07) | PLAT-01 | Corre una vez por SSH aprobado; pide contraseña por stdin | Ejecutar el comando en staging; loguear en `/plataforma/login` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (excepciones: 3 tareas `checkpoint`, justificadas en el mapa)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`pnpm test` corre `vitest run`, nunca `test:watch`)
- [x] Feedback latency < 90s (un archivo de integración; typecheck ~20 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** aprobada por el planner el 2026-08-28 (mapa por tarea completado con IDs reales)
