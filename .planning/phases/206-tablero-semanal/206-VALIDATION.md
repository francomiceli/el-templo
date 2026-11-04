---
phase: 206
slug: tablero-semanal
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-03
---

# Phase 206 — Validation Strategy

> Contrato de validación por fase para el muestreo durante la ejecución. La fuente es `206-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (API), integración contra MySQL real (`eltemplo_test_<POOL_ID>`) |
| **Config file** | `el-templo-api/vitest.config.ts` |
| **Quick run command** | `cd el-templo-api && pnpm exec tsc --noEmit && pnpm lint:tenant` (admin: `cd el-templo-admin && pnpm exec vue-tsc --noEmit && pnpm lint`) |
| **Full suite command** | `cd el-templo-api && pnpm test` (corre en CI; local solo un archivo puntual, en foreground) |
| **Estimated runtime** | ~60 s (quick) |

---

## Sampling Rate

- **Después de cada tarea:** quick run command.
- **Después de cada plan:** el orquestador verifica worktree limpio + typecheck + lint.
- **Antes de `/gsd:verify-work`:** CI verde con la suite completa.
- **Max feedback latency:** 120 s.

---

## Per-Task Verification Map

| Plan | Comportamiento | Tipo | Archivo |
|------|----------------|------|---------|
| 01 | Tablas nuevas strict, uniques con `tenant_id` al frente, 5 conteos fijos actualizados | integración + gates | `test/migrations/0319-weekly-board.test.ts`, tests de tenancy existentes |
| 02 | `dueClosures(today)` para cada día lun..dom, `resolveBlockState`, `isCapturedLate`, ventana de leads, moneda | unit | `test/weekly-board/week.test.ts` |
| 03 | Embudo y Renovaciones por sede = pantalla de origen por sede; multisucursal en la sede del alumno (D-29); tests existentes de Sesiones de prueba y Renovaciones siguen verdes | integración + regresión | `test/weekly-board/by-branch-embudo-renovaciones.test.ts`, `reports-trial-sessions.test.ts`, `renewals/renewals.test.ts` |
| 04 | Cobrado (D-14), Deuda (incluye sueltas) y Activos por sede = origen | integración + regresión | `test/weekly-board/by-branch-caja-alumnos.test.ts`, `finance/income-by-branch.test.ts`, `reports/debt-management.test.ts` |
| 05 | Totales por país desde conteos, Online fuera del Total, % Reserva null sin leads, variación de activos, nulls | unit | `test/weekly-board/matrix.test.ts` |
| 06 | Columnas, grupos AR/ES, Online (D-25), foto vs vivo vs provisorio vs sin foto, leads PUT, roles/alcance (D-02, D-27), tenant | integración | `test/weekly-board/weekly-board-routes.test.ts`, `test/weekly-board/weekly-board-access.test.ts`, ISO-01 (544) |
| 07 | `closeDue(ctx, now)`: principal de W-1 el lunes, tardío el viernes, idempotente, foto congelada, recuperación, barrido por tenant | integración | `test/jobs/weekly-board-close.test.ts`, CON-04 (12 jobs) |
| 08-10 | Admin: tipos, composable, pantalla, menú y landing | typecheck + lint + UAT | `vue-tsc`, `pnpm lint` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/fixtures/weekly-board.ts`: fixtures compartidas. Nace en el plan 03; ningún test anterior la necesita (sedes AR/ES/virtual/inactiva, embudo, renovaciones, cobrado, deuda, activos).
- [ ] Los archivos de test de la tabla de arriba (se crean en el plan de cada pieza).

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| La pantalla se lee como la planilla (bloques, columnas, ▲▼, rojo en Sin contactar, chips provisorio/sin foto) | visual | Abrir `/tablero` en staging como owner, admin_sede y gestion |
| Los números coinciden con las pantallas de origen | datos reales | Para la semana pasada y una sede: comparar con Sesiones de prueba, Renovaciones, Deudas y Analíticas (con las excepciones D-14, D-25 y D-29) |
| Primer cierre real | depende del reloj | El lunes y el viernes siguientes al deploy, verificar que existan las fotos de la semana |

---

## Validation Sign-Off

- [x] Todas las tareas tienen verificación automática o dependen de Wave 0
- [x] Nunca 3 tareas seguidas sin verificación automática
- [x] Wave 0 cubre todas las referencias faltantes
- [x] Sin flags de watch mode
- [x] Feedback latency < 120 s
- [x] `nyquist_compliant: true` en el frontmatter

**Approval:** approved 2026-11-03 (orquestador, tras el revisor de planes). Los tests de integración corren en CI: cada SUMMARY lista sus archivos de test como "pendiente de CI".
