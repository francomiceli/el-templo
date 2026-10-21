---
phase: 201
slug: conquer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-21
---

# Phase 201 — Validation Strategy

> Contrato de validación de la fase. El detalle (mapa de requisitos a tests y la estrategia del test diferencial) está en `201-RESEARCH.md` § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4 (API: `vitest.config.ts` con MySQL real y `vitest.config.unit.ts` sin DB; app: `vitest.config.ts`). Admin no tiene vitest: `vue-tsc` + UAT. |
| **Config file** | `el-templo-api/vitest.config.ts`, `el-templo-api/vitest.config.unit.ts`, `el-templo-app/vitest.config.ts` |
| **Quick run command** | `cd el-templo-api && pnpm vitest run --config vitest.config.unit.ts test/unit/conquer-*.test.ts` |
| **Full suite command** | `cd el-templo-api && pnpm test` · `cd el-templo-app && pnpm test` (corren en CI) |
| **Estimated runtime** | unit ~10 s · suite API completa en CI ~10 min |

## Sampling Rate

- **Después de cada commit de tarea:** motor y reglas puras → test unitario o harness `node` del oráculo. API → `npx tsc --noEmit` + `pnpm lint:tenant`. App/admin → `vue-tsc` filtrado a los archivos tocados + `pnpm lint`.
- **Después de cada plan:** el orquestador verifica worktree limpio + typecheck + lint (+ `lint:tenant` en API).
- **Antes de `/gsd:verify-work`:** CI completo en verde.
- **Max feedback latency:** 60 s para los chequeos locales.

## Per-Task Verification Map

Lo completa el planner en cada PLAN.md (`<verify><automated>`). Requisitos a cubrir: S12-1..S12-9 (síntesis §12) y D-12, D-13, D-14, D-15, D-16, D-17, más tenancy, migración y pop-up. El mapa está en `201-RESEARCH.md` → "Phase Requirements → Test Map".

## Wave 0 Requirements

- [ ] `el-templo-api/test/conquer/fixtures/conquer-app.html` (copia del oráculo para el test diferencial)
- [ ] `el-templo-api/test/conquer/_helpers.ts` (alumno Conquer, segundo gimnasio, mock del resolver de media privada, control de "hoy")
- [ ] No se instala ningún framework nuevo (D-19: sin dependencias nuevas)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alta en menos de 5 min | S12-1 | usabilidad | cronometrar el alta en el admin de staging |
| Carga en menos de 1 min | S12-2 | usabilidad | teléfono real, sesión completa de Toro |
| 390 px | S12-9 | visual | Chrome devtools 390 px + teléfono real |
| Estética de la submarca | D-09/D-22 | visual | comparar con `ref/conquer-prototipo.html` |
| Admin (sin vitest) | D-08/D-12 | sin framework | recorrido en el UAT |

## Validation Sign-Off

- [ ] Todas las tareas tienen `<automated>` verify o dependencia de Wave 0
- [ ] Continuidad: nunca 3 tareas seguidas sin verify automático
- [ ] Wave 0 cubre todas las referencias MISSING
- [ ] Sin flags de watch mode
- [ ] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
