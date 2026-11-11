---
phase: 213-estiramiento-post-clase
plan: 13
subsystem: uat-medicion
tags: [uat, medicion, sql, gates]
requires: ["213-12"]
provides:
  - 213-UAT.md (checklist de 11 grupos, 61 casillas)
  - consultas/20_medicion_4_semanas.sql (5 bloques de solo lectura por grupo)
  - corrida final de gates locales de la fase
affects: [cierre de la fase 213]
tech-stack:
  added: []
  patterns: ["consulta de solo lectura con @desde/@hasta, grupo recalculado con CRC32 en SQL"]
key-files:
  created:
    - .planning/phases/213-estiramiento-post-clase/213-UAT.md
    - .planning/phases/213-estiramiento-post-clase/consultas/20_medicion_4_semanas.sql
  modified: []
decisions:
  - "Bloque 4 recalcula el grupo con CRC32('stretch-v1:' + id) % 100 en SQL (mismo hash que la app) para cubrir a todos los que asistieron, no solo a los que tuvieron oferta"
  - "Los parámetros @desde y @hasta nacen con el texto YYYY-MM-DD: la consulta falla a propósito hasta que Franco los complete"
metrics:
  tasks: 2
  files: 2
completed: 2026-11-11
---

# Phase 213 Plan 13: UAT, medición a 4 semanas y gates finales Summary

Checklist de UAT de 11 grupos (61 casillas) con la prueba en teléfono de SPEC 5.3 para iOS y Android, el sketch del reloj, el profe y el encendido de la plantilla, más la consulta de solo lectura de la medición por grupo (D-16) con los umbrales de SPEC 5.4, y la corrida final de gates de la fase.

## Qué se hizo

- **`213-UAT.md`**: los 11 grupos del plan. El grupo 6 arranca con la casilla de prender `stretch_followup` en staging y la nota de que SC-5 no se ve en producción hasta prenderla; el grupo 11 arranca con el desvío de D-12 (sección curada `estirar`). Se sumaron los 13 puntos que surgieron en la ejecución: desvío D-12, plantilla apagada y fecha de arranque del experimento, migraciones 0340/0341/0342 con sus chequeos (`COUNT = 20`, fuente AURA con 5 puntos), dos clases el mismo día, sketch sin abrir, "terminar igual", flecha atrás, comportamientos de la card, push en teléfono real (app matada con sesión, sin sesión, abierta), Libre, `started` fire-and-forget, lista de tests de CI que tienen que pasar y la rutina completa del profe.
- **`consultas/20_medicion_4_semanas.sql`**: cinco bloques. (1) embudo por grupo con completados cada 100 ofertas, apertura y completados/empezados (1b agrega push contra control); (2) motivos de no envío por grupo y `push_decision`; (3) categoría `entrenamiento` apagada por grupo; (4) asistencias por alumno y semana antes/durante, con semanas ancladas al lunes con `WEEKDAY` y grupo recalculado con `CRC32`; (5) duración real contra planificada con mediana aproximada por `ROW_NUMBER`. Al final, la tabla de umbrales de SPEC 5.4 con el bloque que responde cada fila. Solo `SET @var`, `SELECT` y `WITH`; sin `CONVERT_TZ`; sin `;` en comentarios. NO se corrió contra ninguna base.

## Task Commits

1. Task 1: `f5e6965b0` docs(213-13): checklist de UAT del estiramiento post-clase
2. Task 2: `6ddd23b25` docs(213-13): consulta de medición a 4 semanas por grupo (D-16)

## Corrida final de gates

| Gate | Resultado |
|---|---|
| API `tsc --noEmit` | 3 errores, todos preexistentes en `src/app.ts` (`@fastify/rate-limit` falta en el `node_modules` prestado). Ninguno de la fase |
| API `pnpm lint:tenant` | DISCREPANCIAS 0, violaciones sin listar 0, entradas obsoletas 0 |
| API `pnpm typecheck:tests` | 20 discrepancias, mismo número que el baseline preexistente (plan 01). Ninguna sale de archivos de la fase. Las únicas con "stretch" en el nombre son `test/unit/stretching-selection.test.ts` (otra feature, TS2835/TS7006 preexistentes) |
| App `pnpm lint` | 0 errores, 2 warnings preexistentes (`boot/axios.ts`, `useSessionPlayer.ts`; ninguno de los dos archivos cambia en la rama contra master en esas líneas) |
| App `vitest run` (suite completa) | 110 de 111 archivos pasan, 2022 de 2024 tests. Fallan 2 tests de `test/level-display.test.ts` (`TRAINING_LEVELS` espera 5 niveles y el código tiene 6, con `kairos`). **Preexistente**: ese archivo y `modules/training/level-display.ts` no tienen diff contra `origin/master` en esta rama |
| App `vue-tsc --noEmit` | 21 errores = baseline. Ninguno en archivos tocados por la fase salvo el de `MainLayout.vue` (`displayName`), que el plan 11 ya documentó como preexistente |
| Admin `pnpm lint` | 0 errores, 8 warnings |
| Admin `vue-tsc --noEmit` | 28 errores = baseline; ninguno en `destinations.ts`, `rule-triggers.ts`, `system-audiences.ts` ni `AnaliticasPage.vue` |
| Tests puros de la API con config mínima (sin MySQL) | `stretch-selection.test.ts` 43/43, `stretch-timing.test.ts` 71/71 |

`vue-tsc` no está en los `node_modules` de esta rama (ni en los prestados). Se corrió con el binario de otro proyecto del disco (`/home/franco/projects/alpike/node_modules/.bin/vue-tsc`, solo lectura, con el `tsconfig.json` de cada app). El resultado coincide con el baseline de los planes 06, 09 y 11 (21 y 28).

### Conteos fijos re-verificados

| Conteo | Antes | Ahora |
|---|---|---|
| `GYM_OWNED_TABLES` | 129 | 131 |
| Tablas del schema | 134 | 136 |
| Tablas exentas | 5 | 5 |
| `ENTRADAS_BASELINE` (ISO-01) | 554 | 557 (+3: `today`, `events`, `complete`) |
| `JOBS_ESPERADOS` (con-04) | sin cambio | sin diff en la rama |
| `APP_SECTIONS` (API, admin y app) | 11 | 11 en los tres espejos (`destinations-sync`, `destinations`) |
| Plantillas de sistema (`TEMPLATE_SEEDS`) | 19 | 20 (`stretch_followup`, `custom-rules.test.ts`) |

### Tests nuevos o modificados que CI corre por primera vez (no corridos local: requieren MySQL)

Tests de integración nuevos:
- `el-templo-api/test/sessions/stretch-today.test.ts`
- `el-templo-api/test/sessions/stretch-complete.test.ts`
- `el-templo-api/test/tenancy/iso-03-stretch.test.ts`
- `el-templo-api/test/notifications/stretch-push-timing.test.ts`
- `el-templo-api/test/notifications/stretch-push-decisions.test.ts`
- `el-templo-api/test/migrations/0340-stretch.test.ts`
- `el-templo-api/test/migrations/0342-aura-source-stretch.test.ts`

Modificados (conteos, fixtures, plantilla y manifiesto):
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` (557)
- `el-templo-api/test/db/tenant-tables.test.ts` (131 / 136)
- `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts` y `0196-tenant-unique-contracts.test.ts` (131)
- `el-templo-api/test/notifications/custom-rules.test.ts` (20 plantillas)
- `el-templo-api/test/communications/destinations.test.ts` y `destinations-sync.test.ts` (sección `estirar`, 11)
- `el-templo-api/test/fixtures/second-tenant.ts`, `test/helpers.ts`, `test/tenant-manifest.ts`, `test/sessions/_stretch-fixtures.ts` (soporte)

Puros pero modificados o nuevos (ya verdes local con config mínima): `test/sessions/stretch-selection.test.ts`, `test/sessions/stretch-timing.test.ts`.

### Estado de la rama

- `git status --short` del worktree: limpio antes de escribir este SUMMARY.
- `git log --oneline origin/master..HEAD`: 66 commits al momento de la corrida, con base `bc231c4de`. Los dos de este plan son `f5e6965b0` y `6ddd23b25`.
- El `origin/master` local ya trae migraciones y tests de otras sesiones (`0330_wellhub_...`); `git diff origin/master...HEAD` (tres puntos) da los 20 archivos de test de la fase listados arriba.

## Decisiones del ejecutor

- El bloque 4 de la consulta calcula el grupo con `CRC32` en SQL en vez de unir con `stretch_offers`: así incluye a los alumnos que asistieron pero nunca tuvieron oferta (clases no elegibles), que es la población correcta para "asistencias por alumno y por semana". Equivale al hash de `stretchBucket` (`crc32` de Node y `CRC32` de MySQL son el CRC-32 IEEE sin signo).
- El bloque 3 reporta dos números: apagada al cierre y apagada con cambio de fila desde `@desde` (`updated_at`), porque `notification_preferences` no guarda cuándo se apagó. Es una aproximación y queda dicho en el comentario.
- El bloque 4 compara las 4 semanas anteriores a `@desde` contra el periodo, para poder leer el cambio por grupo y no solo el nivel.
- Se usaron ventanas (`ROW_NUMBER`) en el bloque 5: MySQL 8 es el motor en uso (`WITH` ya aparece en la consulta 08).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vue-tsc` ausente en los `node_modules` de la rama**
- **Found during:** corrida final de gates
- **Issue:** `pnpm exec vue-tsc` falla con "Command vue-tsc not found" en app y admin.
- **Fix:** se ejecutó el binario de `vue-tsc` de otro proyecto del disco apuntando al `tsconfig.json` de cada app; nada instalado ni tocado fuera del worktree.
- **Files modified:** ninguno.

**2. [Verify del plan] El verify del plan 13 no pasa entero por fallas preexistentes**
- `pnpm typecheck:tests` sale con código 1 (20 discrepancias contra un baseline que ya estaba desfasado en master) y `vitest run` de la app sale con código 1 por 2 tests de `level-display`. Ambos preexistentes y sin relación con la fase; no se arreglaron (fuera de alcance, ver deferred).

## Deferred Issues

- `el-templo-app/test/level-display.test.ts` falla 2 tests en master (`TRAINING_LEVELS` tiene 6 niveles con `kairos`, el test espera 5). Preexistente a la fase 213.
- `pnpm typecheck:tests` de la API: 20 discrepancias contra su baseline en master (`analytics.test.ts` 2 a 4, `members.test.ts` 4 a 5, entradas obsoletas en `attendance.test.ts` y `lifecycle.test.ts`). Preexistente. CI tiene el `node_modules` correcto.
- Las 3 fallas de `tsc` de `src/app.ts` por `@fastify/rate-limit` ausente en el `node_modules` prestado.

## Known Stubs

Ninguno. El único marcador de posición es intencional: `@desde` y `@hasta` de la consulta de medición con texto `YYYY-MM-DD` (los completa Franco con la fecha de encendido; mientras tanto la consulta falla a propósito).

## Threat Flags

Ninguno. T-213-38 verificada por grep (sin `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`/`CREATE`/`TRUNCATE` a inicio de línea, sin `CONVERT_TZ`, sin `;` en comentarios) y el ejecutor no corrió la consulta; T-213-40 con el paso del grupo 7 del UAT (prender la plantilla solo con el build de tiendas publicado).

## Lecciones para el cierre

- Falta a Franco: leer `213-UAT.md`, abrir `sketch-reloj/index.html`, decidir los puntos abiertos (D-12, dos clases el mismo día, "terminar igual", pill de completada con estiramiento hecho) y autorizar push a staging.
- Antes de mezclar a staging/master, revisar la numeración de migraciones contra el máximo real de las ramas activas (hoy la fase usa 0340/0341/0342; master está en 0330).

## Self-Check: PASSED

- `213-UAT.md` y `consultas/20_medicion_4_semanas.sql` presentes; commits `f5e6965b0` y `6ddd23b25` en la rama.
- Verify de Task 1 (casillas, sin sesión, stretch_followup, staging, D-12, sketch-reloj, profe) y de la consulta (solo lectura, sin `CONVERT_TZ`, `GROUP BY arm`, sin `;` en comentarios): OK.
