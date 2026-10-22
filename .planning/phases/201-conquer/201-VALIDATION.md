---
phase: 201
slug: conquer
status: planned
nyquist_compliant: true
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

Una fila por plan con su verificación automática principal (cada tarea trae además su `<verify><automated>`). Los tests corren en CI; localmente se corren los gates de tipos/lint y `oracle-check.mjs`. El mapa de requisitos a tests está en `201-RESEARCH.md` → "Phase Requirements → Test Map".

| Plan | Requisitos | Comando automatizado principal |
|------|-----------|--------------------------------|
| 201-01 | S12-1, D-21 | `npx tsc --noEmit && pnpm lint:tenant` + test de estructura `test/migrations/0290-0292-conquer.test.ts` (CI) |
| 201-02 | S12-1, D-14, D-20 | `node --no-warnings test/conquer/oracle-check.mjs` → ORACULO + SEMILLA OK; semilla en `0290-0292-conquer.test.ts` (CI) |
| 201-03 | S12-2, S12-4, S12-5 | `oracle-check.mjs` → MOTOR OK (diferencial contra el oráculo); `test/unit/conquer-engine.test.ts` (CI) |
| 201-04 | D-13, D-14, D-16, S12-3, S12-6 | `oracle-check.mjs` → REGLAS OK; `test/unit/conquer-{calendar,rules,lighting}.test.ts` (CI) |
| 201-05 | D-02, D-08, D-12, D-17 | `tsc` + `lint:tenant`; `test/conquer/requests.test.ts`, `test/unit/conquer-permissions.test.ts` (CI) |
| 201-06 | S12-1, D-14, D-17 | `tsc` + `lint:tenant`; `test/conquer/members-admin.test.ts` (CI) |
| 201-07 | S12-2, D-13, D-16, D-18 | `tsc` + `lint:tenant`; `test/conquer/today-session.test.ts`, `steps-change.test.ts` (CI) |
| 201-08 | S12-4, S12-5, D-13 | `tsc` + `lint:tenant`; `test/conquer/{subir,calibration,progress}.test.ts` (CI) |
| 201-09 | S12-6, S12-7, D-15 | `tsc` + `lint:tenant`; `test/conquer/{alerts,board}.test.ts` (CI) |
| 201-10 | S12-3, D-14 | `tsc` + `lint:tenant`; `test/conquer/{levels,combos}.test.ts` (CI) |
| 201-11 | S12-6, D-08 | `tsc` + `lint:tenant`; `test/conquer/{recortes,level-up,ficha}.test.ts` (CI) |
| 201-12 | S12-8, D-15 | `tsc` + `lint:tenant`; `test/conquer/body-checks.test.ts`, `test/unit/conquer-{private-media,body-check-rules}.test.ts` (CI) |
| 201-13 | S12-8, D-08 | `tsc` + `lint:tenant`; `test/conquer/{publish,body-checks-admin,gallery}.test.ts` (CI) |
| 201-14 | D-14, D-20 | `tsc` + `lint:tenant`; `test/conquer/{catalog-admin,settings}.test.ts` (CI) |
| 201-15 | D-10, D-11 (solo destino), D-17 | app `pnpm lint` + `vue-tsc` filtrado; `entrenarTabs.test.ts` (app, CI); `destinations.test.ts` (API, CI) |
| 201-16 | D-09, D-12 | app `pnpm lint` + `vue-tsc` filtrado; `conquerView.test.ts`, `format.test.ts` (app, CI); grep sin CDN/Jost |
| 201-17 | D-09, D-12, D-17, S12-9 | app `pnpm lint` + `vue-tsc` filtrado; UAT visual |
| 201-18 | S12-2, S12-4, D-13, D-16, D-18 | app `pnpm lint` + `vue-tsc`; `todayForm.test.ts` (app, CI); UAT < 1 min |
| 201-19 | S12-3, S12-5, D-13 | app `pnpm lint` + `vue-tsc`; `progressView.test.ts`, `todayForm.test.ts` (app, CI) |
| 201-20 | S12-8, D-15 | app `pnpm lint` + `vue-tsc`; `bodyCheck.test.ts`, `conquerView.test.ts` (app, CI); UAT cámara |
| 201-21 | S12-1, S12-7, D-08, D-12 | admin `pnpm lint` + `vue-tsc` filtrado (admin sin vitest); UAT alta < 5 min |
| 201-22 | S12-6, S12-8, D-08 | admin `pnpm lint` + `vue-tsc` filtrado; UAT |
| 201-23 | D-14, D-20 | admin `pnpm lint` + `vue-tsc` filtrado; UAT de Nacho |
| 201-24 | S12-1..S12-9, D-20 | `test/conquer/journey.test.ts` (CI) + barrido estático (37 rutas, migs 0290-0292, oracle-check, higiene) + UAT humano |

## Wave 0 Requirements

- [ ] `el-templo-api/test/conquer/fixtures/conquer-app.html` (copia del oráculo para el test diferencial) — lo entrega 201-02
- [ ] `el-templo-api/test/conquer/_helpers.ts` (alumno Conquer, segundo gimnasio, mock del resolver de media privada, control de "hoy") — nace en 201-05 y lo amplían 201-06/07/09/10/12
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

- [x] Todas las tareas tienen `<automated>` verify o dependencia de Wave 0
- [x] Continuidad: nunca 3 tareas seguidas sin verify automático
- [ ] Wave 0 cubre todas las referencias MISSING
- [x] Sin flags de watch mode
- [x] `nyquist_compliant: true` en el frontmatter

**Approval:** pending
