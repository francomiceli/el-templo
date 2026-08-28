---
phase: 182
slug: plataforma-rol-super-owner-wizard-de-alta-de-tenant
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 182-XX-XX | TBD | TBD | PLAT-01 | T-182-01 | Login de plataforma emite JWT con `aud: platform` y secreto propio (`PLATFORM_JWT_SECRET`) | integration | `pnpm test -- test/platform/platform-auth.test.ts` | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-01 | T-182-01 | Token de tenant contra `/api/platform/*` ⇒ 401 | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-01 | T-182-01 | Token de plataforma contra `GET /api/auth/me` ⇒ 401 (no escala a tenant) | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-01 | T-182-02 | N+1 intentos de login ⇒ 429 (rate limit; depende del gate de dependencia o fallback en memoria) | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-01 | — | `platform_users` y `platform_audit_log` clasificadas como globales con motivo; conteos 95→97, `.toBe(4)`→`.toBe(6)` | unit | `pnpm test -- test/db/tenant-tables.test.ts` | ✅ | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-02 | — | Toda ruta `/api/platform/*` en el manifiesto con motivo; `ENTRADAS_BASELINE` 389→389+N | unit | `pnpm test -- test/tenancy/iso-01-manifiesto.test.ts` | ✅ | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-02 | T-182-03 | Slug reservado / duplicado / formato inválido ⇒ 4xx claro, no 500 | integration | `pnpm test -- test/platform/provision-tenant.test.ts` | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-02 | T-182-04 | Resolución pre-login: `Origin` bajo `PLATFORM_DOMAIN` (regex anclada) resuelve el slug; `evil-<dominio>.com` y `Origin` ajeno NO resuelven; `X-Tenant-Slug` resuelve; sin ninguno ⇒ comportamiento actual (D-05/D-18) | unit | `pnpm test -- test/unit/origin-to-slug.test.ts` | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-03 | — | Alta crea sede virtual con el nombre literal `"Templo Online"` e `is_virtual = true` | integration | `pnpm test -- test/platform/provision-tenant.test.ts` | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-03 | — | Alta escribe exactamente 5 filas `module.*` (gimnasio ON + 4 templo OFF) | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-03 | T-182-05 | Fallo a mitad del alta ⇒ cero filas (rollback total); segundo intento mismo slug ⇒ error claro | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-03 | T-182-05 | Ninguna fila del alta queda con `tenant_id = 1` (trampa del DEFAULT) | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-03 | — | Owner creado con contraseña definitiva del wizard; loguea por `POST /api/auth/login` sin cambios en el login (D-11 enmendada) | integration | idem | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | Éxito 4 | T-182-06 | Owner nuevo no ve datos del tenant 1 ni al revés; super-owner 401/403 en rutas de tenant; usuario de tenant 401/403 en `/api/platform/*`; slug desconocido ⇒ 404 `TENANT_NOT_FOUND` | integration | `pnpm test -- test/tenancy/iso-04-platform.test.ts` | ❌ W0 | ⬜ pending |
| 182-XX-XX | TBD | TBD | Éxito 4 | — | `iso-01..03` siguen verdes | integration | `pnpm test -- test/tenancy/` | ✅ | ⬜ pending |
| 182-XX-XX | TBD | TBD | Éxito 4 | — | Tenant recién aprovisionado no produce efectos en los 7 crons (módulos Templo OFF) | integration | `pnpm test -- test/tenancy/con-04-crons-per-tenant.test.ts` | ✅ (caso a agregar) | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-01 | T-182-07 | Login de El Templo (`POST /api/auth/login`) responde idéntico a antes para un usuario existente — no-regresión D-05 | integration | `pnpm test -- test/auth/` | ✅ | ⬜ pending |
| 182-XX-XX | TBD | TBD | PLAT-02 | — | Admin compila con `/plataforma/*` y el wizard; lint verde | build | `cd el-templo-admin && pnpm run build && pnpm run lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*El planner reemplaza los `182-XX-XX`/TBD por los IDs reales de tarea/plan/ola al escribir los PLAN.md.*

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/platform/platform-auth.test.ts` — PLAT-01 (login, `aud`, cruce de tokens en ambos sentidos, rate limit)
- [ ] `el-templo-api/test/platform/provision-tenant.test.ts` — PLAT-02/03 (alta, rollback, flags, slug, owner)
- [ ] `el-templo-api/test/unit/origin-to-slug.test.ts` — función pura de resolución `Origin`/`X-Tenant-Slug` → slug (D-18), incluido `evil-<dominio>`
- [ ] `el-templo-api/test/tenancy/iso-04-platform.test.ts` — D-16, patrón caso+control de `iso-03-finance-coach-load.test.ts`
- [ ] `el-templo-api/test/fixtures/platform.ts` — crear `platform_users` de test + obtener token (análogo a `getAuthToken`) + limpieza (agregar tablas nuevas a `TABLES_TO_CLEAN` o `afterAll` propio)
- [ ] Actualizar `ENTRADAS_BASELINE` (389 → 389+N) y conteos de `test/db/tenant-tables.test.ts` (95→97, `.toBe(4)`→`.toBe(6)`) en el mismo commit que registra rutas/tablas
- [ ] **No** instalar framework de tests en el admin (gate de dependencia) — verificación = build + lint + UAT

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
