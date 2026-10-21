---
phase: 200
slug: anatomia-funcional
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-21
---

# Phase 200 — Validation Strategy

> Contrato de validación de la fase. Fuente: `200-RESEARCH.md` § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (API, MySQL `eltemplo_test` en CI) |
| **Config file** | `el-templo-api/vitest.config.*` existente |
| **Quick run command** | `cd el-templo-api && pnpm exec vitest run test/anatomy` (solo CI / checkout con deps) |
| **Full suite command** | `cd el-templo-api && pnpm test` (CI) |
| **En el worktree** | estático: `grep`, `cmp`, `git diff`, `git status --porcelain` (sin `pnpm install` ni typecheck local, igual que la 197) |

## Sampling Rate

- **Por commit de tarea:** greps de higiene (`console.`, `any`, `v-html`), worktree limpio, diff revisado.
- **Por plan:** el orquestador revisa el diff y el worktree limpio.
- **Gate de fase:** CI verde en staging (tests del API + build de app/admin) antes de `/gsd:verify-work`.

## Criterio → verificación

| Criterio | Comportamiento | Tipo | Chequeo |
|---|---|---|---|
| 1 | 28 músculos, 30 rutas con relaciones, fichas profe/alumno, glosario, todo `borrador`; marcas `[n]` ∈ citas; textos alumno sin términos bloqueados | unit (CI) | `test/anatomy/content-schema.test.ts` |
| 1 | Rutas == `ROUTE_PROGRESSION_MAP`, ⊆ `ROUTE_LABELS`; zonas ∈ `anatomia.json`; `cmp` admin vs app | unit (CI) | `test/anatomy/content-coverage.test.ts` |
| 2 | Proyección = snapshot pre-200 − quita + agrega (con motivo) | unit (CI) | `test/anatomy/projection-parity.test.ts` + `diferencias-aprobadas.ts` |
| 2 | TV solo zonas `enTv`; `/weekly` `/daily` zones/groups/zoneHits; canasta | integración (CI) | tests de tv-recorrido, weekly-zones, free-blocks actualizados + `zone-hits.test.ts` |
| 2 | `muscle-zones.ts` borrado | grep | `git grep -n "muscle-zones" -- el-templo-api/src` vacío (salvo comentarios) |
| 3 | `GET /api/admin/anatomy`: 401 / 403 / 200 según rol (R1); manifiesto 478 | integración (CI) | `test/anatomy/anatomy-routes.test.ts`, `rbac-sets`, `iso-01-manifiesto.test.ts` |
| 3 | UI admin B2 | manual | UAT celular 390 px + escritorio |
| 4 | `GET /api/anatomy` sin antagonista, banderas, ficha profe ni códigos | integración (CI) | `anatomy-routes.test.ts` (recorrido profundo) |
| 4 | Flag OFF = Guía como hoy; deep links "¿Qué es X?" intactos | grep | `ANATOMIA_ALUMNOS_ENABLED = false`; los `router.push({ name: 'guia'` sin cambios |
| 5 | zoneHits por bloque; chips marcados; D18/D19 | integración + manual | `zone-hits.test.ts`; UAT teléfono con flag ON en build local |
| 6 | Migraciones 0287/0288 (sin `;` en comentarios, WHERE por nombre) | unit (CI) | `test/migrations/0287-0288-anatomia.test.ts` |
| 6 | `route-labels.ts` (API, app, admin si aplica) con nombres D1 | unit (CI) | `test/anatomy/sync-front.test.ts` |

## Wave 0 Requirements

- [ ] `el-templo-api/test/anatomy/` (schema, coverage, projection, parity, zone-hits, routes, sync-front) + `__fixtures__/zonas-tv-pre-200.ts`
- [ ] `test/migrations/0287-0288-anatomia.test.ts`
- [ ] Fixture `_free-blocks-fixtures.ts`: `seedExercise` con `route`

## Manual-Only Verifications

| Behavior | Criterio | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Admin › Anatomía en el celular | 3 | visual / táctil | 390 px: tocar zona → hoja → (i) → ruta → ficha → volver |
| Guía + Tu cuerpo + Entrenar tocable | 4, 5 | flag OFF en prod | build local con flag ON; recorrer sketches 020/021 |
| TV recorrido con zonas nuevas | 2 | render real | staging, mirar la intro en una TV |

## Validation Sign-Off

- [ ] Todas las tareas con verificación automática o dependencia de Wave 0
- [ ] Sin 3 tareas seguidas sin verificación
- [ ] `nyquist_compliant: true` al cerrar

**Approval:** pending
