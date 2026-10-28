---
phase: 199-rediseno-mi-templo
plan: 23
subsystem: sponsors
tags: [gap-closure, sponsors, carrusel, benefit, UAT-D1, UAT-D6]
requires: [199-22]
provides:
  - "SPONSOR_ADVANCE_MS = 4000"
  - "benefit varchar(12) en la 0279, el schema Drizzle, el schema del API, el admin y los tests"
  - "sponsorBenefitFontPx + fitBenefitFontPx + SPONSOR_BENEFIT_MIN_PX (app y admin, espejo exacto)"
affects: [199-31]
key-files:
  modified:
    - el-templo-api/src/db/migrations/0279_sponsors.sql
    - el-templo-api/src/db/schema/sponsors.ts
    - el-templo-api/src/modules/sponsors/schemas.ts
    - el-templo-api/test/sponsors/sponsors-admin.test.ts
    - el-templo-admin/src/utils/sponsors.ts
    - el-templo-admin/src/components/sponsors/SponsorEditorDialog.vue
    - el-templo-admin/src/components/sponsors/SponsorCardPreview.vue
    - el-templo-app/src/modules/progression/utils/sponsors.ts
    - el-templo-app/src/modules/progression/utils/__tests__/sponsors.test.ts
    - el-templo-app/src/modules/progression/components/SponsorsCarousel.vue
decisions:
  - "0279 editada a varchar(12) (guarda vacía), base local alineada con ALTER manual"
  - "Beneficio ajustado por medición (escalón por largo + baja de a 1 px hasta piso 16), igual en app y vista previa del admin"
metrics:
  commits: 3
  completed: 2026-10-15
---

# Phase 199 Plan 23: carrusel a 4 s y beneficio de 12 caracteres Summary

Carrusel de patrocinadores a 4 s y beneficio de máximo 12 caracteres de punta a punta (base, API, admin, app y tests), con el tamaño del beneficio ajustado por medición para que nunca se corte en la card ni en la vista previa del admin (cierra UAT D1 y D6).

## Commits (solo en el worktree `et-199-mi-templo`, sin push)

| Task | Hash        | Mensaje                                                                                                      |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | `3a4fe10d2` | fix(199-23): beneficio del patrocinador de hasta 12 caracteres en la 0279, el schema y los tests (UAT D6)    |
| 2    | `18fcd2b3c` | fix(199-23): admin — beneficio de hasta 12 caracteres y vista previa con el mismo tamaño que la app (UAT D6) |
| 3    | `b2e41219a` | fix(199-23): carrusel de patrocinadores a 4 s y beneficio que nunca se corta (UAT D1, D6)                    |

## Guarda de la 0279

`git fetch origin` y `git branch -r --contains 6d9aa4c6c` → salida VACÍA. La 0279 nunca salió del equipo, así que se editó (no se usó el camino alternativo "validar solo").

## Base local (ALTER)

`.env` del worktree: `DB_HOST=localhost`, `DB_NAME=eltemplo` (coincide, se corrió).

- Antes: `CHARACTER_MAXIMUM_LENGTH` = 16.
- Filas con `CHAR_LENGTH(benefit) > 12`: ninguna (la tabla `sponsor_brands` tiene 0 filas), no hizo falta `UPDATE`.
- `ALTER TABLE sponsor_brands MODIFY benefit varchar(12) NOT NULL`.
- Después: `CHARACTER_MAXIMUM_LENGTH` = 12.
- No se tocó `_migrations`, ni staging/prod, ni `drizzle-kit`.

## Qué se hizo

**Task 1 (API).** `0279_sponsors.sql` con `` `benefit` varchar(12) NOT NULL `` y una línea de comentario sin `;` (`grep -cE '^--.*;'` = 0). Schema Drizzle `length: 12` con comentario "tope corto de 12 (UAT D6)". `sponsorBodyProperties.benefit.maxLength = 12` (compartido por alta y edición; no hay otro `maxLength: 16` ni response schema con el largo, L9). Tests: el caso de largos pasa a "benefit de 13 y detail de 81 → 400; 12 y 80 → 201" y se suma un `it` de edición: `PUT` con 13 → 400 y la fila conserva `20% OFF`; `PUT` con 12 → 200 y la fila queda con 12. Los fixtures existentes ("20% OFF", " 10% ", "30% OFF", "15% OFF") son ≤ 12.

**Task 2 (admin).** `SPONSOR_LIMITS.benefit = 12`, hint "Hasta 12 caracteres: se muestra grande en una línea.", helpers `SPONSOR_BENEFIT_MIN_PX`, `sponsorBenefitFontPx`, `fitBenefitFontPx` y `SponsorCardPreview.vue` que mide ambos `.spc-benefit` (card activa y fantasma) al montar, al cambiar el texto (`nextTick`), al cambiar el ANCHO de la vista previa (`ResizeObserver`, ignora cambios solo de alto) y en `document.fonts.ready`. `onUnmounted` desconecta el observer y marca `disposed`.

**Task 3 (app, TDD).** RED (14 tests fallaron) → GREEN (21 verdes). `SPONSOR_ADVANCE_MS = 4000`. `SponsorsCarousel.vue`: ref por función por id de marca (`Map`), `fitAllBenefits()` llamada al montar, en `watch(sponsors, { flush: 'post' })`, en un `ResizeObserver` del track (se arma/desarma con `watch(trackEl)`, solo reacciona al ancho) y una vez en `document.fonts.ready`. `onUnmounted` desconecta el observer, limpia el `Map` y marca `disposed`. El timer del carrusel es el mismo `setTimeout` de siempre (no se creó otro): solo cambió la constante. `nowrap`/`ellipsis` del CSS quedan como red bajo el piso.

## Verificaciones

| Verify                                                                 | Resultado                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| API `npx tsc --noEmit`                                                 | exit 0                                                                |
| API `pnpm lint:tenant`                                                 | `DISCREPANCIAS: 0`                                                    |
| API `pnpm typecheck:tests`                                             | 0 líneas con `sponsors` (los errores de base son de otros archivos)   |
| API tests                                                              | NO corridos (regla: CI)                                               |
| Admin `vue-tsc --noEmit`                                               | 21 errores (límite 21), 0 en archivos de sponsors                     |
| Admin `pnpm lint`                                                      | 0 errores, 8 warnings preexistentes (pdf utils)                       |
| App `npx vitest run .../utils/__tests__/sponsors.test.ts`              | 21/21 verdes                                                          |
| App `npx vitest run src/stores/__tests__/sponsors-store.test.ts`       | 12/12 verdes (nada dependía del 2000)                                 |
| App `vue-tsc --noEmit`                                                 | 18 errores (límite 18), 0 en archivos de sponsors                     |
| App `pnpm lint`                                                        | 0 errores, 2 warnings preexistentes                                   |
| Greps de aceptación (4000, 12, repeat(13), ResizeObserver, hint, etc.) | todos cumplen                                                         |
| Espejo app/admin de las dos funciones                                  | `diff` idéntico normalizando espacios, `;` y comas finales (Prettier) |
| Worktree                                                               | limpio                                                                |

## Mutantes (app, restaurados con `git checkout -- sponsors.ts`)

- (a) escalón `≥ 11` devolviendo 26 en vez de 22 → 3 tests fallan (detectado).
- (b) `fitBenefitFontPx` que devuelve `startPx` cuando `fits` da true (no baja) → 2 tests fallan (detectado).
- Restaurado: 21/21 verdes.

## Deviations from Plan

None - el plan se ejecutó tal cual. Detalles menores, no desvíos de comportamiento:

- `fitBenefitFontPx` retorna `startPx` de inmediato si `startPx <= floorPx` (cumple "nunca devuelve más que `startPx`" cuando el inicio está bajo el piso; con los escalones reales 22/26/30 y piso 16 no se activa).
- La comparación app/admin se normalizó también por comas finales (el Prettier de la app las pone y el del admin no); la lógica es idéntica.
- El observer de ambos componentes ignora cambios de solo alto (al achicar la letra cambia la altura y no debe re-medir): evita cualquier loop.

## Bugs y dudas

- Ninguno encontrado. La verificación visual a 360/390/412 px (incluido "MMMMMMMMMMMM" y "WWWWWWWWWWWW") queda para 199-31, como dice el plan: la medición real depende de Montserrat cargada y no se puede cubrir con vitest (el modelo de ancho de los tests es una aproximación).
- Observación: el `git stash list` del repo tiene el backup automático de lint-staged `stash@{1}` (c6532f0c) y otro stash viejo de `planning-untracked-2026-08`; son previos a este plan y no se tocaron.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Mitigaciones T-199-60/61/62 aplicadas (maxLength 12 en alta y edición con tests 13 → 400 en POST y PUT, ALTER solo sobre `eltemplo` local con pre-chequeo y verificación por `information_schema`, guarda de remotos vacía antes de editar la 0279).

## Self-Check: PASSED

Commits `3a4fe10d2`, `18fcd2b3c` y `b2e41219a` existen en `feat/199-mi-templo-rediseno`; los 10 archivos del plan modificados; worktree limpio.
