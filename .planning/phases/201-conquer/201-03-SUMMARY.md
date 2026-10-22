---
phase: 201-conquer
plan: 03
subsystem: api
tags: [conquer, engine, progression, tdd, oracle]
requires: ["201-02"]
provides:
  - "engine.ts: motor de progresión puro §4 (cero imports)"
  - "test/unit/conquer-engine.test.ts: dorados, diferencial contra el oráculo, hoja Simulación"
  - "oracle-check.mjs: sección MOTOR OK (14785 casos)"
affects: [201-07, 201-08, 201-09, 201-10, 201-11]
tech-stack:
  added: []
  patterns: ["módulo puro verificado con node por type-stripping", "diferencial contra el HTML original cargado con node:vm"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/engine.ts
    - el-templo-api/test/unit/conquer-engine.test.ts
  modified:
    - el-templo-api/test/conquer/oracle-check.mjs
decisions:
  - "nextTarget devuelve { target, estado } (no { obj, est }): el mapeo oráculo->motor vive en el test y en oracle-check (`sin datos` -> `sin_datos`)"
  - "Marcas de valor 0 entran al diferencial y coinciden con el oráculo (cuentan como marca, last < piso -> bajo)"
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 03: Motor de progresión Summary

Motor §4 puro (`engine.ts`, sin imports) idéntico a `next()` del oráculo en las 14762 secuencias de hasta 4 marcas (7381 por unidad) y con los defaults A1/A2/A3/A6/A8/A10 donde el oráculo está mal o no dice nada.

## Commits

- `test(201-03): motor de Conquer — dorados, diferencial contra el oráculo y Simulación (RED)`
- `feat(201-03): motor de progresión puro de Conquer (§4, GREEN)` (`engine.ts` + sección motor de `oracle-check.mjs`)

Sin commit de refactor (no hizo falta).

## Gates corridos

- Pre-flight `node_modules`: OK.
- RED: `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` marcó `conquer-engine.test.ts` TS2307 (falta `engine`) y TS7006 derivado: es el RED esperado.
- GREEN: `node --no-warnings test/conquer/oracle-check.mjs` imprime `ORACULO OK`, `SEMILLA OK`, `MOTOR OK (14785 casos)`, exit 0.
- `npx tsc --noEmit`: OK. `pnpm lint:tenant`: `DISCREPANCIAS: 0`. `pnpm typecheck:tests | grep ...`: vacío tras el GREEN.
- Higiene (`console.*`, `any`) sobre los 3 archivos: vacía. `engine.ts` sin `import`, `require`, `enum`, `namespace` ni clases. `prettier --write` con rutas explícitas.
- Los tests de vitest NO se corrieron (regla de la fase, corren en CI).

## Mutantes razonados

Cada uno aplicado sobre `engine.ts`, `oracle-check.mjs` corrido (falla), `engine.ts` restaurado con `cmp` contra la copia original.

1. `nextTarget`: `prev >= techo` -> `prev >= techo - 1`. `oracle-check` reporta `MOTOR FALLA (275 de 14785)` (p. ej. `[7,8] reps: motor=3/subir, oráculo=8/techo1`). En CI falla `conquer-engine.test.ts:135` (`expect(diffs).toEqual([])`, `it.each` de la línea 122, ambas unidades).
2. `selectReales`: quitar `row.rungId === currentRungId` del día del cambio. `oracle-check` falla `A1 mismo dia, peldano viejo: motor=1 esperado=0`. En CI falla `:251` (`expect(selectReales(rows, "2026-03-02", 2)).toEqual([])`).
3. `calibracion`: `e1 >= alto` -> `e1 > alto`. `oracle-check` falla `calibracion reps 6` y `calibracion s 9`. En CI falla `:345` (`expect(calibracion(e1, unit)).toBe(expected)`, filas `[6, reps, subir]` y `[9, s, subir]`).
4. `pickSubir`: recorrer `e3, e2, e1`. `oracle-check` falla `A3 e1+e2` (devuelve `e2`) y `A3 e2+e3`. En CI falla `:326` (`expect(pickSubir(estados)).toBe(expected)`, filas "e1 y e2 en subir -> e1" y "e1 en rango, e2 y e3 en subir -> e2").

Cubiertos por lectura sin aplicar: `caidaE1` sin el `slice(1)` rompe `:361` en `[9,8,7]` (debe ser false) y `[3,9,8,7]`; `accuracy` con `>` en vez de `>=` rompe `:375` (hits 1) y el caso `8 vs 8`; `harderPosition` devolviendo el menor en vez del mayor `p < current` rompe `[0, 3, 4]` desde 4.

## Desvíos del plan

Ninguno funcional. `nextTarget` tiene la forma `{ target, estado }` del bloque `<interfaces>` del plan (la research mostraba `{ obj, est }`; manda el plan). `accuracy` normaliza `-0` a `0` (un `Math.round` de un delta negativo chico daría `-0` y `toEqual` lo distingue de `0`).

Ambigüedades nuevas: ninguna.

## Trampas / notas para los planes siguientes

- Contrato real: `selectReales(rows, sinceDate, currentRungId)` ordena por `date` y mantiene el orden de entrada entre filas del mismo día: si una ruta puede guardar dos sesiones el mismo día para un escalón, ordenar por `created_at` antes de pasarlas.
- `harderPosition`/`easierPosition` reciben solo las posiciones ACTIVAS (el servicio filtra `active = 1` antes) y devuelven una posición, no un id: la ruta resuelve el `rung_id` por `(ladder_id, position)`.
- `pickSubir` recibe estados de `e1|e2|e3`; el hold no se evalúa (nunca sube). Con A2 la ruta debe cruzar `pickSubir` con `harderPosition !== null` para ofrecer el botón; si es `null` emitir la alerta `tope_escalera`.
- `caidaE1(values)` espera las marcas YA filtradas con `selectReales` (desde el último cambio); necesita al menos 4 marcas para devolver `true`.
- Un valor `0` es una marca válida para el motor (el oráculo la cuenta): el filtrado de "escalón sin cargar" (valor 0 / vacío) lo decide la ruta antes de llamar al motor, no el motor.
- `oracle-check.mjs` ahora importa `engine.ts` estáticamente: si 201-04 suma secciones, van antes del `if (failed) process.exit(1)` final, después de la sección 3.
- Para tests de CI que usen el motor: importar `../../src/modules/conquer/engine` sin extensión.

## Known Stubs

Ninguno.

## Self-Check: PASSED

`engine.ts`, `conquer-engine.test.ts` y `oracle-check.mjs` existen; commits RED y GREEN presentes en `git log`.
