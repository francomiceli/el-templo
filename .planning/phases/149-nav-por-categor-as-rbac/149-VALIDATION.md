---
phase: 149
slug: nav-por-categor-as-rbac
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 149 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest (API) — `el-templo-api/test/` contra MySQL real (`eltemplo_test`)                              |
| **Config file**        | `el-templo-api/package.json` (`pnpm test`)                                                            |
| **Quick run command**  | `cd el-templo-api && pnpm test <archivo>` (narrow, por archivo afectado)                              |
| **Full suite command** | `cd el-templo-api && pnpm test` — **corre en CI al pushear a staging, NO local** (regla del proyecto) |
| **Frontend**           | Sin suite de componentes; verificación admin = `tsc` typecheck + UAT visual                           |
| **Estimated runtime**  | ~30-60s por archivo narrow                                                                            |

---

## Sampling Rate

- **After every task commit:** `cd el-templo-api && pnpm test <archivo-afectado>` (tasks API) + typecheck del app tocado (API y/o admin)
- **After every plan wave:** typecheck de las apps tocadas + tests narrow de subscriptions/programs/rbac-sets/finance afectados
- **Before `/gsd:verify-work`:** CI verde en staging (la suite completa corre en CI, no local) + UAT visual del nav
- **Max feedback latency:** ~60 seconds (narrow test por archivo)

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement    | Threat Ref           | Secure Behavior                                                                 | Test Type   | Automated Command                                        | File Exists | Status     |
| --------- | ---- | ---- | -------------- | -------------------- | ------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------- | ----------- | ---------- |
| 149-01-01 | 01   | 1    | NAV-02, NAV-03 | regresión de sets    | Sets efectivos Reportes/Deudas byte-idénticos (gestion/coach no pierden acceso) | integration | `cd el-templo-api && pnpm test rbac-sets`                | ❌ W0       | ⬜ pending |
| 149-01-02 | 01   | 1    | NAV-02         | T-149 (D-11, EoP)    | coach → 403 en POST/PUT/PATCH plans y promo-plans; coach → 200 en GET /plans    | integration | `cd el-templo-api && pnpm test subscriptions/plans-crud` | ⚠️ ampliar  | ⬜ pending |
| 149-01-03 | 01   | 1    | NAV-02         | T-149-13 (D-15/D-04) | gestion → 403 en CRUD de programs; admin/owner → 200                            | integration | `cd el-templo-api && pnpm test programs`                 | ❌ W0       | ⬜ pending |
| 149-02-01 | 02   | 1    | NAV-01 (D-13)  | —                    | Umbral de pendientes = 3 días independiente del estado de la DB                 | integration | `cd el-templo-api && pnpm test finance` (narrow) + `tsc` | ✅          | ⬜ pending |
| 149-02-02 | 02   | 1    | NAV-01 (D-13)  | —                    | GET/PUT /api/finance/config/overdue-threshold responden 404                     | integration | borrar `finance-config.test.ts` + typecheck API          | ✅ borrar   | ⬜ pending |
| 149-03-01 | 03   | 1    | NAV-01..04     | T-149-09 (mitigate)  | Nav-model declarativo con roles espejo del backend (Programas dueño-only)       | typecheck   | `tsc` typecheck admin                                    | ✅          | ⬜ pending |
| 149-03-02 | 03   | 1    | NAV-01..04     | T-149-09             | Drawer derivado del nav-model; headers solo con ≥1 item visible                 | manual/UAT  | — (frontend sin test runner)                             | —           | ⬜ pending |
| 149-04-01 | 04   | 2    | NAV-01, NAV-04 | T-149-14             | Landing por rol; `/programas` allowedRoles = admin/owner; sin ruta config-caja  | typecheck   | `tsc` typecheck admin + UAT visual                       | ✅          | ⬜ pending |
| 149-04-02 | 04   | 2    | NAV-02, NAV-03 | EoP UI               | Empleado ve /planes read-only (sin crear/editar/archivar); dueño ve todo        | manual/UAT  | `tsc` typecheck admin + UAT visual                       | —           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/rbac-sets.test.ts` — nuevo: no-regresión de sets efectivos (Reportes == {gestion,admin,owner}, Deudas == {coach,gestion,admin,owner}) + sets nuevos (PLANES_WRITE_ROLES, PROGRAMAS_ROLES, TEMPLO_RBAC_OVERRIDES)
- [ ] `el-templo-api/test/subscriptions/plans-crud.test.ts` — ampliar: coach token → 403 en POST/PUT/PATCH plans y promo-plans; coach token → 200 en GET /plans (hoy solo prueba member 403)
- [ ] `el-templo-api/test/programs.test.ts` — casos gestion → 403 / owner → 200 en CRUD de programs (crear o ampliar según cobertura existente)
- [ ] Ajustar tests que instancien `TransactionService` (constructor sin `FinanceConfigService`, Opción A)
- [ ] Borrar `el-templo-api/test/finance-config.test.ts` (endpoints eliminados por D-13)

---

## Manual-Only Verifications

| Behavior                                                                       | Requirement | Why Manual                           | Test Instructions                                                                                       |
| ------------------------------------------------------------------------------ | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Drawer agrupado en Finanzas/Alumnos/Horarios/Planes + Configuración + Templo   | NAV-01      | Admin sin test runner de componentes | Login como owner → verificar 6 secciones y orden; login como coach → solo Pagos/Alumnos/Horarios/Planes |
| Empleado ve Finanzas con solo "Pagos"; sin Caja/Analíticas/Reportes/Deudas\*   | NAV-03      | Visibilidad visual del drawer        | Login con rol coach/recepcion → drawer; gestion además ve Reportes+Deudas (override Templo)             |
| Landing por rol (`/` → empleado /pagos, dueño /alumnos, Fran Scaine /sessions) | NAV-01      | Redirección de navegación            | Login con cada rol y entrar a `/`                                                                       |
| Sección Templo al final (Entrenamiento, Campañas, Profes, landing) gateada     | NAV-04      | Flag + rol visual                    | Owner ve sección Templo; empleado no; Fran Scaine ve Entrenamiento                                      |
| Planes read-only para empleado (ve precios/incluye, sin botones de edición)    | NAV-03      | Condicionales de UI                  | Login coach → /planes: sin crear/editar/archivar; owner → todos los controles                           |
| **D-05: verificar usuarios reales con rol gestion/recepcion en prod**          | NAV-02/03   | Dato de prod — pedir OK antes de SSH | Checkpoint humano ANTES de shippear: relevar impacto operativo del downgrade de gestion                 |

\* Excepción Templo (D-02/D-03): gestion ve Reportes+Deudas; todos los coaches ven Deudas simplificado.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (tasks UI: typecheck + UAT documentado arriba)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (tests narrow por archivo; suite completa en CI)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (UAT visual + D-05 son checkpoints humanos post-ejecución)
