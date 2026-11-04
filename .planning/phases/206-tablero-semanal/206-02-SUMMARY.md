---
phase: 206-tablero-semanal
plan: 02
subsystem: api
tags: [weekly-board, calendar, pure-functions, tdd, currency]
requires: [206-01]
provides:
  - "weekly-board/week.ts: BOARD_TZ, LATE_MARGIN_DAYS, currentWeekStart, weekRange, isMonday, lateFreezeDate, dueClosures, resolveBlockState, isCapturedLate, isLeadsEditableWeek, instantAtAr"
  - "shared/currency.ts: currencyForCountry, CountryCurrency"
affects: [206-05, 206-06, 206-07]
key-files:
  created:
    - el-templo-api/src/modules/weekly-board/week.ts
    - el-templo-api/src/modules/shared/currency.ts
    - el-templo-api/test/weekly-board/week.test.ts
  modified: []
key-decisions:
  - "Margen tardío 4 días; viernes de W+1 es el primer día congelado del bloque tardío"
  - "La foto manda en el estado del bloque; la fecha solo elige la etiqueta"
requirements-completed: [SC-2, SC-6, D-06, D-07, D-08, D-09, D-10, D-11, D-16, D-24]
completed: 2026-11-03
---

# Phase 206 Plan 02: Calendario del Tablero y moneda por país Summary

Funciones puras (sin DB ni reloj) que fijan el calendario del Tablero: semana AR lunes a domingo, cierres debidos por día, etiqueta de bloque, foto tardía, ventana de leads y moneda por país.

## Commits

| Commit | Subject |
| --- | --- |
| 2700020ed | test(206-02): calendario del tablero y moneda por pais (RED) |
| b10b9b662 | feat(206-02): calendario del tablero y moneda por pais |

## Qué se hizo

- `week.ts` reusa `addDays`, `todayInTz` y `mondayOf`; sin aritmética propia con `Date` local. Todas las funciones reciben `now`/fechas por parámetro.
- `dueClosures(hoy)`: `main = [W-1]` siempre; `late` = `[W-2, W-1]` filtrado por `hoy >= lateFreezeDate(w)`. Resultado: lunes a jueves `late = [W-2]`, viernes a domingo `late = [W-2, W-1]`. W-2 en `late` permite recuperar un viernes que el job no corrió.
- `resolveBlockState`: semana futura lanza `RangeError`; semana en curso → `en_curso` (aunque no haya foto); con foto → `congelado`; sin foto: principal W-1 y tardío W-1/W-2 → `provisorio`, resto `sin_foto`.
- `isMonday` valida formato `YYYY-MM-DD`, que la fecha exista (round-trip por `addDays`, rechaza `2026-02-30`) y que sea lunes (T-206-04).
- `currencyForCountry`: ES → EUR, resto → ARS; docblock con las 3 copias existentes.

## Tests

`el-templo-api/test/weekly-board/week.test.ts`: pendiente de CI (regla del repo: no se corre vitest local). Cubre todos los casos del plan más un `it.each` por cada día lunes a domingo para `dueClosures`, casos de borde de `isMonday` (fecha inexistente, formato inválido), `lateFreezeDate` y el cruce de fin de mes en `weekRange`.

Como verificación local alternativa se corrió un script `tsx` fuera del repo con los casos centrales (currentWeekStart domingo 23:59 / lunes 00:05, dueClosures lunes/jueves/viernes/domingo, isMonday, isCapturedLate, resolveBlockState): todos dieron el valor esperado por el plan.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm lint:tenant` | exit 0 |
| `pnpm typecheck:tests` | exit 1 (preexistente, las mismas 17 discrepancias de 206-01); ninguna línea menciona `weekly-board`, `week.test` ni `currency` |
| Prettier sobre archivos tocados | OK |

## Decisiones del ejecutor

- Se exporta además `lateFreezeDate` (lo exige el criterio de aceptación) y se testea directamente.
- En `resolveBlockState` el chequeo de semana futura va primero, incluso si `hasPhoto` es true (una foto de semana futura no puede existir; mejor fallar fuerte).
- El orden de chequeo es: futura → en curso → foto → W-1 → tardío W-2 → sin_foto. Por eso una semana en curso con foto es `en_curso` (la foto de la semana en curso no existe en la práctica).
- Test extra de `isCapturedLate`: el lunes 23:59 AR sigue siendo a tiempo para el bloque principal.

## Deuda técnica anotada

La regla de moneda por país sigue copiada en `referral-partners/service.ts:1382`, `subscriptions/service.ts:1122` y `finance/coach-load-routes.ts:1242`. No se migraron (fuera de alcance). Anotado en el docblock de `currency.ts`.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito.

## Notas para los planes siguientes

- 206-06 debe usar `isMonday` + comparación `weekStart <= currentWeekStart()` para devolver 400 ante semanas mal formadas o futuras; `isLeadsEditableWeek` para el PUT de leads.
- 206-05/07 deben inyectar `now` y construir instantes de prueba con `instantAtAr(fecha, "HH:MM")`; no usar fake timers.
- 206-07: el job corre lunes 00:05 y viernes 00:05 AR; en cada corrida llamar `dueClosures(todayInTz(BOARD_TZ, now))` y completar `main` en la corrida de lunes y `late` en la de viernes (o ambas cada día para recuperar cierres perdidos, ya que las funciones son idempotentes por presencia de foto). Usar `isCapturedLate` para marcar fotos tardías.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Archivos creados verificados en disco; commits 2700020ed y b10b9b662 presentes en `git log`.
