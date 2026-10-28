---
phase: 199-rediseno-mi-templo
plan: 26
subsystem: admin-comunicaciones, app-frases
tags: [gap-closure, uat-d8, uat-d9]
requires: ["199-25"]
provides:
  - "card_improvement oculta del admin de Comunicaciones (sin migración ni cambio de API)"
  - "displayAuthor: autor de la frase sin punto final en la app"
affects:
  - el-templo-admin/src/config/hidden-system-avisos.ts
  - el-templo-admin/src/pages/ComunicacionesPage.vue
  - el-templo-admin/src/components/comunicaciones/TarjetasTab.vue
  - el-templo-app/src/modules/training/data/quotes.ts
  - el-templo-app/src/modules/training/data/__tests__/quotes.test.ts
key-decisions:
  - "D8 se filtra en el admin (set de codes ocultos), no en la API; el registro queda en la base"
  - "D9: displayAuthor solo al MOSTRAR; SESSION_QUOTES queda literal"
metrics:
  commits: 2
  tasks: 2
completed: 2026-10-16
---

# Phase 199 Plan 26: Ocultar card_improvement y autor sin punto Summary

Filtro en el admin que oculta `card_improvement` de Tarjetas (D8) y `displayAuthor` que saca el punto final del autor de las frases en la app (D9), sin tocar API, migraciones ni el TV.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

| Task | Commit      | Descripción                                                                      |
| ---- | ----------- | -------------------------------------------------------------------------------- |
| 1    | `e6f22ed20` | fix(199-26): ocultar la tarjeta "Proponer una mejora" de Comunicaciones (UAT D8) |
| 2    | `6dd1ef44b` | fix(199-26): autor de la frase sin punto final en la app (UAT D9)                |

## Qué se hizo

- **Task 1 (D8):** nuevo `hidden-system-avisos.ts` con `ADMIN_HIDDEN_SYSTEM_CODES` y `withoutHiddenSystemAvisos`. `ComunicacionesPage.loadAvisos()` filtra solo las tarjetas (`avisosPopup.value = popup` sin filtro), así el KPI, la grilla, el reordenamiento y `nextSortOrder` dejan de verla sin tocar su lógica. Copy de `TarjetasTab` "Las 4" -> "Las 3" (2 lugares). `system-audiences.ts` conserva la entrada de `card_improvement` (no renderiza nada sola).
- **Task 2 (D9):** `displayAuthor` (`trim().replace(/\.+$/, '')`) aplicado en `segmentsToQuote` (QUOTES/reproductor, 5 consumidores sin cambio de interfaz) y en `quoteOfTheDay` (DailyQuote). `SESSION_QUOTES` queda literal (`author: 'Virgilio.'`); el texto de las frases conserva su punto. El TV (`el-templo-admin/src/utils/pdf/quotes.ts`) sin cambios.

## Verificación

- Task 1: admin vue-tsc = 21 errores (tope 21, preexistentes), 0 en `hidden-system-avisos|ComunicacionesPage|TarjetasTab`; `pnpm lint` admin 0 errores (8 warnings preexistentes de pdf). `grep "Las 4"` = 0; `git diff 0dc7b8e3b --stat -- el-templo-api/src/modules/communications` vacío; migraciones nuevas (`A`) = 0.
- Task 2: `npx vitest run src/modules/training/data/__tests__/quotes.test.ts` verde, 27 tests. app vue-tsc = 18 (tope 18, 0 en quotes); `pnpm lint` app 0 errores (2 warnings). `export function displayAuthor` = 1, `displayAuthor(` = 4 usos/definición, `author: 'Virgilio.'` = 1, diff del `quotes.ts` del TV vacío.
- **Mutantes (ambos detectados, restaurados desde copia):** (a) `quoteOfTheDay` devolviendo `SESSION_QUOTES` sin `displayAuthor` -> 2 tests fallan; (b) `segmentsToQuote` sin `displayAuthor` en la rama con dorado -> 2 tests fallan.
- Worktree limpio al terminar.

## Deviations from Plan

**1. [Rule 1 - Bug evitado] `quoteOfTheDay` devuelve elementos precalculados, no `{ ...q, author }` por llamada**

- **Motivo:** los tests existentes y `DailyQuote` dependen de la identidad de la frase (`toBe` entre llamadas, `Set` de 10 objetos). Un spread nuevo en cada llamada rompía la identidad y la estabilidad de referencia para Vue.
- **Fix:** constante `DISPLAY_SESSION_QUOTES = SESSION_QUOTES.map(...)` calculada una vez; `quoteOfTheDay` indexa ahí. Mismo valor observable que el plan.
- **Test ajustado:** el caso "cruza cambio de mes y año" comparaba por identidad con `SESSION_QUOTES[...]`; ahora compara `.segments` (misma referencia, porque el spread es superficial).

**2. Mutante restaurado desde copia en el scratchpad** en lugar de `git checkout -- <archivo>` después del commit: se mutó y restauró antes del commit para que el commit saliera con el archivo correcto. Mismo efecto.

Fuera de eso, el plan se ejecutó tal cual.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno (T-199-66 aceptado: solo presentación del admin).

## Dudas / observaciones

- El copy "Las 3 fijas" asume que quedan 3 tarjetas de sistema visibles en el admin (el plan lo fija así); no se verificó contra una base real porque el chequeo de seeds está en la API.
- `Restaurar las del sistema` sigue considerando `card_improvement` existente (no la re-siembra), como pedía el plan.

## Self-Check: PASSED

- Commits `e6f22ed20` y `6dd1ef44b` presentes en la rama; archivos del plan existentes; worktree sin cambios pendientes.
