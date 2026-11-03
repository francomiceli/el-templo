---
phase: 206
slug: tablero-semanal
status: draft
nyquist_compliant: false
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
| 02 | `dueClosures(today)` para cada día lun..dom (cierre principal el lunes, tardío el viernes, recuperación si se perdió una corrida) | unit | `test/weekly-board/week.test.ts` |
| 03-04 | Cada método "por sede" coincide con su endpoint de origen filtrado por esa sede; los tests existentes de Sesiones de prueba siguen verdes tras extraer `tallyTrialSessions` / `kpisFromTally` | integración + regresión | `test/weekly-board/by-branch-sources.test.ts`, `reports-trial-sessions.test.ts` |
| 05-06 | Columnas = sedes físicas activas + columna informativa Online (fuera del Total) + grupo ES; Total AR desde conteos; % Reserva "—" sin leads; foto vs vivo vs provisorio vs sin foto; leads PUT; roles/alcance; tenant | integración | `test/weekly-board/weekly-board-routes.test.ts` |
| 07 | `closeDue(ctx, now)`: principal de W-1 el lunes, tardío el viernes (4 días), idempotente, la foto no cambia con datos posteriores, barrido por tenant | integración | `test/jobs/weekly-board-close.test.ts` |
| 08-10 | Admin: tipos, composable, pantalla, menú y landing | typecheck + lint + UAT | `vue-tsc`, `pnpm lint` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/fixtures/weekly-board.ts`: fixtures compartidas (sedes AR/ES/virtual/inactiva, embudo, renovaciones, cobrado, deuda, activos).
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

- [ ] Todas las tareas tienen verificación automática o dependen de Wave 0
- [ ] Nunca 3 tareas seguidas sin verificación automática
- [ ] Wave 0 cubre todas las referencias faltantes
- [ ] Sin flags de watch mode
- [ ] Feedback latency < 120 s
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
