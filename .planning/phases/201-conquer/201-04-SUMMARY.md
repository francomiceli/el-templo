---
phase: 201-conquer
plan: 04
subsystem: api
tags: [conquer, rules, calendar, lighting, tdd]
requires: ["201-03"]
provides:
  - "calendar.ts: semana lunes-domingo UTC, blockWeek, nextPendingDay, comboSubirReady, levelUpStreak (cero imports)"
  - "rules.ts: niveles, arranque, recortes, apertura, sábado, severidad de alertas (cero imports)"
  - "lighting.ts: encendido muscular D-13 (cero imports)"
  - "oracle-check.mjs: sección REGLAS OK"
affects: [201-06, 201-07, 201-08, 201-09, 201-10, 201-11]
tech-stack:
  added: []
  patterns: ["módulos puros verificados con node por type-stripping"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/calendar.ts
    - el-templo-api/src/modules/conquer/rules.ts
    - el-templo-api/src/modules/conquer/lighting.ts
    - el-templo-api/test/unit/conquer-calendar.test.ts
    - el-templo-api/test/unit/conquer-rules.test.ts
    - el-templo-api/test/unit/conquer-lighting.test.ts
  modified:
    - el-templo-api/test/conquer/oracle-check.mjs
decisions:
  - "shiftStartPosition mueve `offset` peldaños ACTIVOS hacia posiciones mayores (más fácil) a partir de la posición dada, aunque ésta sea inactiva (1 inactiva, offset 1, activas [0,2,3] -> 2); offset <= 0 devuelve la posición tal cual; sin activas más fáciles devuelve la posición de entrada"
  - "lighting.ts exporta además el tipo ConquerZone; ZONE_LABELS es Record<ConquerZone, string>"
  - "CUT_STAGE_LABELS es Record<number, string> (claves 1..5)"
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 04: Reglas puras (calendario, recortes, encendido) Summary

Tres módulos puros sin imports (`calendar.ts`, `rules.ts`, `lighting.ts`) con el contrato exacto del plan, 147 casos unitarios en `it.each`/`it` y la sección REGLAS OK de `oracle-check.mjs` (25 aserciones).

## Commits

- `test(201-04): calendario, reglas y encendido de Conquer (RED)`
- `feat(201-04): reglas puras de Conquer — calendario, recortes, combos, paso de nivel y encendido (GREEN)`

## Gates corridos

- Pre-flight `node_modules`: OK.
- RED: los 3 módulos no existían al commitear los tests.
- GREEN: `node --no-warnings test/conquer/oracle-check.mjs` imprime `ORACULO OK`, `SEMILLA OK`, `MOTOR OK (14785 casos)`, `REGLAS OK`, exit 0.
- `npx tsc --noEmit`: OK. `pnpm lint:tenant`: `DISCREPANCIAS: 0`. `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- Higiene: sin `import`/`require`/`enum`/`namespace`/`class` en los 3 módulos; sin `console.*` ni `any` en ningún archivo tocado. `prettier --write` con rutas explícitas.
- Vitest NO se corrió (regla de la fase). Como red de seguridad corrí los 3 tests con un shim mínimo propio (describe/it/it.each/expect, en el scratchpad, fuera del repo, no es vitest) cargando los `.ts` con type-stripping: 55 + 68 + 24 casos, 0 fallas. Sirvió para detectar de antemano una expectativa mía mal puesta.

## Mutantes razonados

Cada uno aplicado con `sed`, `oracle-check.mjs` corrido (falla), archivo restaurado con `git checkout -- <ruta>` y `git diff` limpio.

1. `openingTarget`: `blockWeek >= 3` -> `> 3`. `oracle-check`: `openingTarget semana 3: obtuve 3, esperaba 4`. En CI falla `conquer-rules.test.ts:178` (`it.each` de openingTarget, fila `["toro", 3, 0, 4]` en la línea 166).
2. `lighting.ts`: `SECONDARY_MIN_SERIES = 3`. `oracle-check`: `lightZones secundaria con un ejercicio`. En CI falla `conquer-lighting.test.ts:95` (`toEqual({ primary: ["chest"], secondary: [] })`, "un ejercicio trabajado enciende sus principales y NO sus secundarias", línea 88) y el assert de umbrales (`SECONDARY_MIN_SERIES` = 4).
3. `comboSubirReady`: quitar el chequeo de lunes consecutivos (`!== 7` -> `< 0`). `oracle-check`: `comboSubirReady con hueco: obtuve true, esperaba false`. En CI falla `conquer-calendar.test.ts:132-134` ("con un hueco de una semana -> false").
4. `cutProposal`: sin la condición `level === "toro"`. `oracle-check`: `cutProposal novillo: obtuve "etapa"`. En CI falla `conquer-rules.test.ts:144` (`it.each` "propone bajar un escalon", filas novillo 0, novillo 3 y ternero 0).
5. `levelUpStreak`: `maxPain < painLimit` -> `<=`. `oracle-check`: `levelUpStreak molestia corta: obtuve 3, esperaba 1`. En CI falla `conquer-calendar.test.ts:231` ("una molestia de 4 o mas corta la racha") y, por el otro lado, el caso de molestia 3 de la línea 233 protege el mutante inverso.
6. `levelUpStreak`: la racha no cuenta la semana actual aunque esté completa. `oracle-check`: `obtuve 0, esperaba 1`. En CI falla `conquer-calendar.test.ts:198` (4 semanas completas terminando en la actual -> 4).

## Desvíos del plan

Ninguno. Los módulos respetan `<interfaces>`; sumé el tipo exportado `ConquerZone` y `LEVELS`/`ALERT_LABELS`/umbrales tal cual figuran en el plan.

Ambigüedades nuevas (opción más simple adoptada):

- `shiftStartPosition` con la posición de partida inactiva: cuenta los peldaños activos estrictamente mayores (ver decisión arriba).
- `comboSubirReady` con `n < 1` devuelve `false`.
- `levelUpStreak`: una semana con `daysDone` mayor al plan (repitió un día) cuenta como completa (`>=`).
- `nextPendingDay` ignora claves hechas que no pertenecen al plan (p. ej. `sabado` en un plan de 3 días).

## Trampas / notas para los planes siguientes

- Posiciones: mayor posición = escalón más fácil (coherente con `harderPosition`/`easierPosition` de 201-03). `shiftStartPosition` recibe SOLO posiciones activas.
- `rules.ts` no sabe de fechas: el servicio calcula `blockWeek` (de `calendar.ts`) y se lo pasa a `openingTarget`/`comboSubirReady`. El peor dolor de la semana (`maxPain`) y `daysDone` los arma el servicio con las sesiones del lunes-domingo (sin contar `sabado` en `daysDone`, A13).
- `lightZones` recibe `worked` ya calculado con `exerciseWorked({e1,e2,e3})` por ejercicio; el hold y el finisher no entran. Zonas fuera de `CONQUER_ZONES` (p. ej. `tibialis` de la 200) se ignoran en silencio: el servicio no debe esperar que aparezcan.
- La semana del bloque y la semana de `levelUpStreak` usan la misma unidad (lunes-domingo, A16); las fechas de "hoy" deben venir de `todayInTz(tz de la sede)` en el servidor.
- `oracle-check.mjs` ahora importa los 5 módulos puros estáticamente; secciones nuevas van antes del `if (failed) process.exit(1)` final, después de la sección 4 (reglas).
- Para tests de CI: importar `../../src/modules/conquer/{calendar,rules,lighting}` sin extensión.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 3 módulos, los 3 tests y `oracle-check.mjs` existen; commits RED y GREEN presentes en `git log`.
