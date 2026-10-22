---
phase: 201-conquer
plan: 02
subsystem: database
tags: [mysql, migrations, seed, conquer, oracle, vm]
requires: ["201-01"]
provides:
  - "Migración 0292: semilla idempotente del catálogo de Conquer (solo tenant 1)"
  - "Fixture del oráculo conquer-app.html + loadOracle (node:vm) con LAD, DIAS, CMB y next()"
  - "oracle-check.mjs: chequeo local sin dependencias (ORACULO OK / SEMILLA OK), listo para la sección motor de 201-03"
affects: [201-03, 201-04, 201-05]
tech-stack:
  added: []
  patterns: ["INSERT IGNORE ... SELECT con ids de escalera resueltos por code", "oráculo cargado con node:vm y clonado por JSON a datos planos"]
key-files:
  created:
    - el-templo-api/test/conquer/fixtures/conquer-app.html
    - el-templo-api/test/conquer/oracle.ts
    - el-templo-api/test/conquer/oracle-check.mjs
    - el-templo-api/src/db/migrations/0292_conquer_catalog_seed.sql
  modified:
    - el-templo-api/test/migrations/0290-0292-conquer.test.ts
decisions:
  - "start_steps se siembra como [{step, rung, mode}] (step e1|e2|e3|hold), la forma de ConquerStartStep del schema de 201-01"
  - "Los 74 statements van uno por fila y por línea, separados con --> statement-breakpoint, para que oracle-check.mjs los parsee con regex"
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 02: Semilla del catálogo y oráculo Summary

Catálogo de Nacho (8 escaleras, 45 peldaños, 12 ejercicios, 9 plantillas de 4/3/2 días) sembrado por la 0292 de forma idempotente y solo para el gimnasio 1, con un cargador `node:vm` del oráculo `conquer-app.html` que usan el test de paridad de acá y el diferencial del motor (201-03).

## Commits

- `test(201-02): oráculo conquer-app.html como fixture + cargador vm + chequeo local` (fixture, `oracle.ts`, `oracle-check.mjs`)
- `feat(201-02): semilla del catálogo de Conquer (0292, datos de Nacho)` (`0292_conquer_catalog_seed.sql`)
- `test(201-02): semilla de Conquer = oráculo, idempotente y solo gimnasio 1` (describe "0292 semilla del catálogo" en `0290-0292-conquer.test.ts`)

## Chequeo de numeración (D-21)

Re-chequeado antes de crear el SQL, con `git fetch`: local tope 0291 (0290/0291 de 201-01), `origin/master` tope 0286, `origin/staging` tope 0288, ningún `029*.sql` en otros worktrees `et-*`. 0292 libre.

## Gates corridos

- Pre-flight `node_modules` (3 paquetes): OK.
- `node --no-warnings test/conquer/oracle-check.mjs`: `ORACULO OK` y `SEMILLA OK`, exit 0.
- Verify del Task 2 (conteos 8/45/12/9, sin `;` en comentarios, `<= 74` líneas con `;`, sin tenant distinto de 1): OK.
- `npx tsc --noEmit` (api): OK. `pnpm lint:tenant`: exit 0, `DISCREPANCIAS: 0`.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío (el comando termina con `DISCREPANCIAS: 14` preexistente y ajeno, ningún archivo del plan).
- Higiene: `grep` de `console.*` y `any` en los 4 archivos TS/MJS: vacío. `prettier --write` sobre los archivos con rutas explícitas. `oracle.ts` solo importa `node:vm` y `node:fs`, sin `enum`. `git diff` limpio tras cada mutante.
- Los tests NO se corrieron (regla de la fase, corren en CI).

## Mutantes razonados

Mutante aplicado sobre `0292_conquer_catalog_seed.sql`, `oracle-check.mjs` corrido (falla), test leído, archivo revertido con `git checkout -- <archivo>`.

1. Invertir `position` de `half_lay` y `straddle` en palanca: `oracle-check.mjs` imprime `SEMILLA FALLA` (peldaños de palanca). En CI falla `0290-0292-conquer.test.ts:401` (`expect(rungs.map(r => r.name)).toEqual(oracle.LAD[ladderCode])`, caso `palanca`).
2. E2 de HSPU de `negativa` a `completa`: `oracle-check.mjs` falla (`Vertical[0] arranque`). En CI falla `:436` (`expect(startStepsAsNames(...)).toEqual([...oracleEx.st..., hold])`, caso `Vertical`).
3. Borrar el `INSERT IGNORE` de `muscle_up` (ejercicio de la plantilla de 4 y de 3 días): `oracle-check.mjs` falla (`Dominadas[1]: ejercicio muscle_up no existe`). En CI fallan `:384` (`toHaveLength(12)`), `:459` y `:420-436` (plantillas que referencian el code inexistente, vía `mustFind`).
4. `INSERT` en lugar de `INSERT IGNORE` en una fila: falla la comprobación estática de `:559` (`body.startsWith("INSERT IGNORE INTO conquer_")`) y la re-ejecución de `:568` (`dbPool.execute` tira duplicate key, test (8)). Aplicado y revertido (lo atrapa el test, no `oracle-check.mjs`, que no mira el verbo).

Cubiertos por lectura sin aplicar: poner `brazos_rectos = 0` en un peldaño de L-sit rompe `:527` (`toHaveLength(11)`); sembrar una fila con `tenant_id = 2` rompe el caso `(9)` de la tabla correspondiente.

## Desvíos del plan

- Sin desvíos funcionales. El único punto de tensión: las reglas dicen "no copiar el `<link>` de Google Fonts de `ref/`", pero el plan exige el fixture byte a byte (`cmp` sin salida) y es solo un fixture de test (no se sirve ni se empaqueta). Se copió idéntico; el `<link>` queda en `test/conquer/fixtures/conquer-app.html:2`, que es fixture del oráculo y no código del app.
- `position` va entre backticks en las columnas de los INSERT de peldaños (nombre no reservado pero homónimo de función; 0290 también lo entrecomilla).
- Caso (5) del test usa `it.each` sobre los 12 codes esperados de ejercicios (en vez de los 12 por índice) y valida además `sort_order`, 4 escalones `e1,e2,e3,hold` y que el hold sea modo `hold`.
- Ambigüedades nuevas: ninguna.

## Trampas / notas para los planes siguientes

- `loadOracle` se importa desde tests con `../conquer/oracle` (sin extensión) y desde `.mjs` con `./oracle.ts` (Node 22.22 hace type-stripping sin flags; `--no-warnings` para silenciar el aviso experimental).
- `oracle.next(history, unit)` usa siempre E1 de Planche press (`reps`, idx 1) o Planche hold (`s`, idx 0) y devuelve `{ obj, est }` con `est` en `sin datos|rango|techo1|bajo|subir`. Sondeo hecho: `[]` reps -> 3 sin datos, `[2]` reps -> 3 bajo, `[5]` s -> 7 rango, `[12]` s -> 12 techo1, `[12,12]` s -> 4 subir, `[6,7,8,8]` reps -> 3 subir. Con historial vacío el objetivo es el piso (3 reps / 4 s).
- `oracle-check.mjs` tiene el cierre `if (failed) process.exit(1)` al final y un comentario "3. motor (lo suma 201-03)": las secciones nuevas van entre ese comentario y el cierre.
- La semilla usa `start_steps` como `[{ step, rung, mode }]` con `rung` = **code** del peldaño (slug ASCII del nombre del oráculo: `half_lay`, `paralelas_profundas`, `oap_asistida`...), no el nombre. Para volver al nombre del oráculo hay que buscar el peldaño por `(ladder_id, code)`.
- La tabla de arranque sembrada es la de Toro (mismos peldaños que `DIAS`); el offset de Novillo/Ternero (D-14) es parámetro aparte, no vive en `start_steps`.
- El primer statement de la 0292 lleva el bloque de comentarios del encabezado delante del `INSERT` (así lo parte `splitSqlStatements`): en tests, quitar las líneas `--` antes de inspeccionar el verbo.
- `INSERT ... SELECT` de la semilla pasa por el sentinel de pool sin exención porque lleva `tenant_id` en la lista de columnas y en el `WHERE`.
- Sin rama `else` de tenant: el catálogo existe solo en el tenant 1; un gimnasio nuevo no tiene escaleras ni plantillas (aplica a 201-05/06 al resolver el catálogo de un alumno).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados verificados con `ls`, 3 commits `test/feat/test(201-02)` presentes en `git log`, `git status --porcelain` vacío tras el commit del SUMMARY.
