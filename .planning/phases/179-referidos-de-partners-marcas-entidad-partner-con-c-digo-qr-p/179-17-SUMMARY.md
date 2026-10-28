---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 17
subsystem: verification
tags:
  [
    ci-parity,
    tenancy,
    vitest,
    vue-tsc,
    eslint,
    quasar-build,
    tenant-lint,
    drizzle,
  ]

# Dependency graph
requires:
  - phase: 179 (planes 01-16)
    provides: módulo completo de referidos de partners (CRUD+QR admin, atribución, descuento, semana gratis, comisiones, liquidación, reportes)
provides:
  - Verificación automatizada de punta a punta de toda la fase 179 (Task 1 del plan 17)
affects: [179-17 Task 2, 179-17 Task 3, shipping de la fase 179]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Se dropearon las DBs de test locales stale (eltemplo_test_1..4) antes de correr vitest: estaban envenenadas por una corrida previa interrumpida (schema viejo sin tenant_id ni wellhub_bookings), exactamente el flake documentado en la memoria reference_test_db_flake_worker_envenenada. No es un fix de código — es limpieza de entorno local; CI nunca ve este problema."
  - "Las 2 fallas de test/level-display.test.ts (app) y los ~20 errores de vue-tsc en admin y en app son preexistentes en origin/master, confirmados por diff vacío contra los archivos fuente involucrados — quedan fuera de scope (deviation rule: solo se arregla lo directamente causado por el diff de la fase 179)."

requirements-completed: [] # Task 1 es infraestructura de verificación; los requirements D-01/D-04/D-13/D-20 del plan se cierran en las Tasks 2/3 (checkpoints humanos), no en esta Task.

# Metrics
duration: ~75min
completed: 2026-08-23
---

# Phase 179 Plan 17: Verificación integral automatizada (Task 1) Summary

**Los 7 puntos de verificación automatizada de la fase 179 (referidos de partners) corrieron en verde: tsc, 1196 tests de vitest (104/104 archivos), lint:tenant, db:verify-uniques, y compilación+lint+build de admin y app, sin errores nuevos ni dependencias coladas — worktree limpio contra origin/master.**

## Alcance de esta ejecución

Este SUMMARY documenta **solo la Task 1** del plan 179-17 (verificación integral automatizada). Las Tasks 2 y 3 son checkpoints humanos exclusivos de Franco (cargar URLs reales de tienda + escanear QRs en dispositivos, y UAT completo en AR/ES + decisión de shipping) y **NO se ejecutaron** — las maneja el orquestador junto con el usuario en una sesión separada.

## Performance

- **Duration:** ~75 min (incluye el diagnóstico y limpieza de la DB de test envenenada)
- **Completed:** 2026-08-23
- **Puntos verificados:** 7/7 + 3/3 chequeos de higiene del diff

## Resultado de los 7 puntos (Task 1)

| #   | Comando                                                                                                                                                         | Resultado                                                 | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `el-templo-api exec tsc --noEmit`                                                                                                                               | **PASS**                                                  | 0 errores                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | `el-templo-api exec vitest run test/referral-partners test/referrals test/subscriptions test/scheduling test/finance test/auth test/tenancy test/db --no-watch` | **PASS** (tras limpieza de entorno, ver Deviations)       | **104/104 test files, 1196/1196 tests**. Duración 977.81s con `MAX_TEST_WORKERS=1 --hookTimeout=400000`.                                                                                                                                                                                                                                                                                                                                                              |
| 3   | `el-templo-api lint:tenant`                                                                                                                                     | **PASS**                                                  | 454 archivos analizados, 494 entradas de allowlist, **0 discrepancias** en los 4 gates (unlistedViolations, staleMissingFile, staleNoLongerViolating, gainedEntries). 39 accesos cubiertos por 16 exenciones tenant-safe documentadas (D-12), ninguna nueva sin justificar.                                                                                                                                                                                           |
| 4   | `el-templo-api db:verify-uniques`                                                                                                                               | **PASS**                                                  | 91 tablas gym-owned, 65 uniques evaluadas, **0 discrepancias** en los 5 gates. 11/11 uniques M8 correctamente clasificadas como globales (incluida `code-resolver.ts` de partners).                                                                                                                                                                                                                                                                                   |
| 5   | admin: vue-tsc offline + lint + build                                                                                                                           | **PASS**                                                  | vue-tsc: 20 errores, **todos preexistentes en origin/master** (ninguno en archivos tocados por la fase 179; el único error en `AssignPlanDialog.vue` cae fuera de los hunks del diff de 179). lint: 0 errores, 8 warnings preexistentes. build: `Build succeeded` (114 JS + 17 CSS).                                                                                                                                                                                  |
| 6   | app: vue-tsc offline + lint + vitest + build                                                                                                                    | **PASS** (2 fallas preexistentes documentadas, ver abajo) | vue-tsc: 20 errores, todos preexistentes (0 en archivos tocados por 179). lint: 0 errores, 2 warnings preexistentes. vitest: 96/98 tests, **2 fallas en `test/level-display.test.ts` confirmadas preexistentes en origin/master** (archivo fuente `level-display.ts` idéntico byte-a-byte a origin/master; el test espera 5 niveles pero el enum ya tiene 6 desde la fase 129/KAIROS-01 — bug de otra fase, no de la 179). build: `Build succeeded` (69 JS + 25 CSS). |
| 7   | `git status --porcelain` + `git diff --stat origin/master`                                                                                                      | **PASS**                                                  | Worktree limpio (sin salida). Diff: 69 archivos, +13080/-59 líneas contra `origin/master`.                                                                                                                                                                                                                                                                                                                                                                            |

## Higiene del diff (grep contra origin/master)

| Chequeo                                                               | Resultado                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ningún archivo bajo `el-templo-api/src/modules/referrals/` en el diff | **PASS** — sin coincidencias                                                                                |
| Sin dependencias nuevas en ningún `package.json`/lockfile             | **PASS** — único cambio: bump de versión de `el-templo-app` 1.7.1 → 1.8.0 (feature = minor, per convención) |
| `el-templo-api/tenant-lint-allowlist.json` sin cambios                | **PASS** — diff vacío                                                                                       |

## Deviations from Plan

### Auto-fixed / entorno (fuera de las Reglas 1-4, higiene de entorno local)

**1. DB de test local envenenada — limpieza de entorno, no un fix de código**

- **Encontrado durante:** primer intento del punto 2 (vitest)
- **Síntoma:** 101/104 archivos de test fallaban con `Unknown column 'tenant_id'` y `Table 'wellhub_bookings' doesn't exist`
- **Causa raíz:** las DBs `eltemplo_test_1..4` ya existían en MySQL local de una corrida anterior interrumpida, con schema viejo (sin las migraciones de tenancy). `test/setup.ts` saltea la re-provisión si la DB ya existe (`provisionWorkerDB`), así que reusó las DBs stale sin re-migrar. Coincide exactamente con el flake documentado en la memoria `reference_test_db_flake_worker_envenenada.md`.
- **Verificación de la causa:** se confirmó con una consulta directa a `information_schema.COLUMNS`/`TABLES` que `eltemplo_test_1` no tenía `tenant_id` en `users` ni la tabla `wellhub_bookings`, sin conexiones activas colgadas.
- **Acción:** se dropearon las 4 DBs (`DROP DATABASE eltemplo_test_1..4`) y se re-corrió la suite completa, que se re-provisionó fresca y aplicó todas las migraciones. Resultado: 104/104 archivos, 1196/1196 tests en verde.
- **Por qué no es un fix de código:** la memoria documenta explícitamente "No es problema de CI: GitHub arranca con MySQL limpio; nunca ve la DB envenenada. NO tocar el código por esto." No se modificó ningún archivo del repo.

### Hallazgos preexistentes documentados (fuera de scope, no corregidos)

**2. 2 fallas en `test/level-display.test.ts` (app) — bug de la fase 129, no de la 179**

- El test espera `TRAINING_LEVELS` con 5 entradas; el enum real tiene 6 (incluye `kairos`, agregado en fase 129/KAIROS-01).
- `el-templo-app/src/modules/training/level-display.ts` es **idéntico byte-a-byte** a `origin/master` (confirmado con `diff` entre `HEAD` y `origin/master`), y el test tampoco está en el diff de la fase 179.
- No se toca — regla de scope: "Pre-existing... failures in unrelated files are out of scope."

**3. ~20 errores de vue-tsc preexistentes en admin y ~20 en app**

- Confirmados como baseline preexistente (mencionado en las instrucciones de ejecución: "~20 errores ajenos ya existían").
- Ninguno cae en los archivos que la fase 179 modificó según `git diff origin/master --stat`. El único error dentro de un archivo tocado por 179 (`AssignPlanDialog.vue`, línea 2275) está fuera de los hunks del diff de la fase — código de reset del formulario sin relación con el descuento de partner.
- No se toca — fuera de scope.

## Estado de las Tasks 2 y 3

**Task 2 (checkpoint:human-action — cargar URLs de tienda y validar QRs): PENDIENTE.** Requiere que Franco cargue las URLs reales de Play Store y App Store (incluyendo el Apple ID numérico, que no está en el repo) y escanee los 2 PNG en un Android y un iPhone reales. Acción exclusivamente humana, no ejecutada por este agente.

**Task 3 (checkpoint:human-verify — UAT completo AR/ES + decisión de shipping): PENDIENTE.** Requiere que Franco recorra los 10 pasos del UAT en una sede AR y una sede ES, y registre la decisión de shipping (rama destino, orden staging/master frente al tren v6.0, agenda del build de tiendas, confirmación de que las tarjetas no se imprimen hasta la build publicada). No ejecutada por este agente.

## Self-Check

- Worktree verificado limpio (`git status --porcelain` vacío) antes y después de la ejecución de esta Task.
- Los 7 puntos y los 3 chequeos de higiene se corrieron literalmente con los comandos del plan (con el agregado de `MAX_TEST_WORKERS=1 --hookTimeout=400000` en el punto 2, autorizado explícitamente por las instrucciones del entorno).
- No se modificó ningún archivo de código fuente del repo. Único efecto secundario: se dropearon 4 bases de datos de test locales (`eltemplo_test_1..4`), que se re-provisionaron automáticamente al correr la suite.
- Este archivo SUMMARY no fue commiteado (instrucción explícita del entorno de ejecución).

## Self-Check: PASSED
