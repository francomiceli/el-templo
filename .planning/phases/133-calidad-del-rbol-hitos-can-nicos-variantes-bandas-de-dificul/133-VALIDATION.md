---
phase: 133
slug: calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 133 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **Framework**          | vitest ^4.0.18 (API, integración contra MySQL per-worker `eltemplo_test_N`)                  |
| **Config file**        | `el-templo-api/package.json` (script test) + `test/setup.ts` / `test/setup-global.ts`        |
| **Quick run command**  | `cd el-templo-api && pnpm exec vitest run <archivo puntual>`                                 |
| **Full suite command** | CI en push a origin/staging (`pnpm test`) — ⚠️ NUNCA correr la suite completa local (regla)  |
| **Estimated runtime**  | ~10-30s por archivo puntual                                                                  |

---

## Sampling Rate

- **After every task commit:** `pnpm exec tsc --noEmit -p tsconfig.json` (API) o `pnpm exec vue-tsc --noEmit -p tsconfig.json` (admin) + vitest del archivo puntual tocado si es de API
- **After every plan wave:** typecheck de los 2 apps tocados
- **Before `/gsd:verify-work`:** typecheck verde en ambos apps + tests puntuales de la fase verdes; suite completa queda para CI post-push (con confirmación del usuario)
- **Max feedback latency:** ~60s

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
| --------- | ---- | ---- | ----------- | ---------- | ---------------- | --------- | ----------------- | ----------- | ------ |
| 133-01-01 | 01 | 1 | R1-MIG | T-133-02 | FK self SET NULL sin referencias colgantes | typecheck | `pnpm exec tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 133-01-02 | 01 | 1 | R1-MIG | T-133-01 | migración sin `;` en comentarios, runner custom | integration | `pnpm exec vitest run test/migrations/0145-milestone-exercise-id.test.ts` | ❌ W0 (la crea la task) | ⬜ pending |
| 133-02-01 | 02 | 1 | R2-BANDS | — | N/A | typecheck+grep | `pnpm exec vue-tsc --noEmit -p tsconfig.json` + grep DRY | ✅ | ⬜ pending |
| 133-02-02 | 02 | 1 | R2-BANDS | — | N/A | typecheck (UI manual-only) | `pnpm exec vue-tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 133-03-01 | 03 | 2 | R1-HEUR | T-133-21 | motor puro sin DB | unit | `pnpm exec vitest run test/exercises/milestone-heuristic.test.ts` | ❌ W0 (la crea la task) | ⬜ pending |
| 133-03-02 | 03 | 2 | R1-HEUR | T-133-20 | CLI solo inserta pending, nunca truth | integration | `pnpm exec vitest run test/exercises/bootstrap-milestones.test.ts` | ❌ W0 (la crea la task) | ⬜ pending |
| 133-03-03 | 03 | 2 | R4-XRUTA | T-133-22 | no pisa aristas manuales humanas | integration | `pnpm exec vitest run test/exercises/bootstrap-milestones.test.ts` | ❌ W0 (la crea la task) | ⬜ pending |
| 133-04-01 | 04 | 2 | R1-FILTER | T-133-30/31 | node-set consistente helper vs SQL crudo | integration | `pnpm exec vitest run test/exercises/rebuild-progression-graph.test.ts test/tree-progress/member-tree.test.ts test/exercises/exercise-progression-service.test.ts` | ✅ extender | ⬜ pending |
| 133-04-02 | 04 | 2 | R3-SUBGRP | T-133-32 | — | integration | `pnpm exec vitest run test/tree-editor/tree-editor.test.ts` | ✅ extender | ⬜ pending |
| 133-05-01 | 05 | 3 | R1-REV | T-133-42 | truth solo en tx + poda acotada (cadena locked) | integration | `pnpm exec vitest run test/tree-editor/milestone-review.test.ts test/exercises/proposal-review.test.ts` | ❌ W0 (la crea la task) | ⬜ pending |
| 133-05-02 | 05 | 3 | R1-REV | T-133-42 | promote sin referencias colgantes | integration | `pnpm exec vitest run test/tree-editor/milestone-review.test.ts` | ❌ W0 | ⬜ pending |
| 133-05-03 | 05 | 3 | R1-REV | T-133-40/41/43 | member→403, sin token→401, body schemas cerrados | integration | `pnpm exec vitest run test/tree-editor/milestone-review.test.ts` | ❌ W0 | ⬜ pending |
| 133-06-01 | 06 | 4 | R1-REV | T-133-50 | — | typecheck | `pnpm exec vue-tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 133-06-02 | 06 | 4 | R1-REV, TTB-SIG | T-133-50/51 | sin optimistic updates; confirmaciones | typecheck+grep copy | `pnpm exec vue-tsc --noEmit -p tsconfig.json` + grep copys LOCKED | ✅ | ⬜ pending |
| 133-06-03 | 06 | 4 | R1-REV | T-133-50 | — | typecheck+grep copy | `pnpm exec vue-tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 133-07-01 | 07 | 5 | R3-SUBGRP | — | — | typecheck | `pnpm exec vue-tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 133-07-02 | 07 | 5 | R4-XRUTA | — | — | typecheck+grep estilo | `pnpm exec vue-tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

⚠️ Tests de analytics flakean después de ~21:00 hora local (skew TZ) — no es regresión de esta fase; los tests de esta fase no tocan analytics.

---

## Wave 0 Requirements

Los archivos de test nuevos los crean las propias tasks que implementan (test junto a implementación, patrón del repo):

- [ ] `el-templo-api/test/migrations/0145-milestone-exercise-id.test.ts` — R1-MIG (plan 01, task 2)
- [ ] `el-templo-api/test/exercises/milestone-heuristic.test.ts` — R1-HEUR (plan 03, task 1)
- [ ] `el-templo-api/test/exercises/bootstrap-milestones.test.ts` — R1-HEUR + R4 (plan 03, tasks 2-3)
- [ ] `el-templo-api/test/tree-editor/milestone-review.test.ts` — R1-REV (plan 05)

Framework y helpers ya existen (`test/helpers.ts`, seeds de `tree-editor.test.ts`, DB per-worker).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
| -------- | ----------- | ---------- | ----------------- |
| Bandas de dificultad (stripe + badge + leyenda + colapso responsive) | R2-BANDS | el-templo-admin no tiene suite de componentes/E2E | /tree-map → expandir ruta → colores coherentes con dl; leyenda 6 bandas; ventana <1100px colapsa a botón palette |
| Drawer hito/variante + banner TTB | R1-REV, TTB-SIG | ídem | Abrir drawer en TTB → banner gold persistente; grupos por movimiento; toggle+select; aceptar variante en cadena manual pide confirmación |
| Panel variantes + promote | R1-REV | ídem | Seleccionar hito con variantes → expansión lista; "Marcar como hito" confirma, swapea y refresca canvas |
| Sub-grupos + filtro | R3-SUBGRP | ídem | Labels de sub-grupo sobre las columnas; filtro reduce; clear restaura |
| Aristas R4 (expandido/colapsado/badge) | R4-XRUTA | ídem | Con arista FLR→FL: gris punteada nodo→nodo; colapsar FL → arista ruta→ruta + badge prereq |
| **Efecto member-visible (Pitfall 5)** | R1-FILTER | requiere member app | Tras aceptar variantes: Mi Árbol del miembro pierde esos nodos y el % cambia — ES EL OBJETIVO, no un bug. Declarar en release notes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tests creados por las tasks que implementan)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
