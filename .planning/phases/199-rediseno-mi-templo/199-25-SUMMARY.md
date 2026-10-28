---
phase: 199-rediseno-mi-templo
plan: 25
subsystem: app/progression (Mi Templo)
tags: [gap-closure, uat, copy, layout, brand-token]
gap_closure: true
gaps: [UAT D14, UAT D15, UAT D16, UAT D17, UAT D18]
requirements: [D-02, D-07, D-09, D-10]
key-files:
  modified:
    - el-templo-app/src/modules/progression/types.ts
    - el-templo-app/src/modules/progression/utils/check-in-summary.ts
    - el-templo-app/src/modules/progression/utils/__tests__/check-in-summary.test.ts
    - el-templo-app/src/modules/progression/components/CheckInPanel.vue
    - el-templo-app/src/css/_brand.scss
    - el-templo-app/src/modules/progression/components/NovedadesCard.vue
    - el-templo-app/src/modules/progression/components/WeekStrip.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
commits:
  - 1dd97c376 fix(199-25) registro del día sin título, con "hoy" y "Bien" (D16/D18)
  - 0810125c2 fix(199-25) títulos de bloque con token, "Tus sesiones" con dos cifras, sin "Para vos" (D14/D15/D17)
---

# Fase 199 Plan 25: ajustes de la pila de Mi Templo (D14 a D18) Summary

Registro del día sin título y con "hoy", opción "Bien" (valor guardado `alto` intacto), color de título de bloque compartido por token `$mt-block-title-color`, "Tus sesiones" con dos cifras de igual jerarquía y carrusel sin título "Para vos".

## Qué se hizo

**Task 1 (D16 + D18), commit `1dd97c376`**

- `types.ts`: etiqueta `Alto` pasa a `Bien` (value `alto`). Preguntas: "¿Tenés alguna molestia hoy?" y "¿Cómo dormiste hoy?" ("¿Cómo te sentís hoy?" ya estaba; el paso "¿Dónde?" no cambia).
- `check-in-summary.ts`: `energy` = `Energía: bajo` / `Energía: normal` / `Energía: bien` (C4: misma etiqueta que el botón).
- `CheckInPanel.vue`: se borra el título "Registro del día" (pregunta y línea colapsada); "n de 3" queda en su propia fila arriba a la derecha (`__progress` + `__aux`); la `<section>` gana `aria-label="Registro del día"`; regla `&__title` eliminada. La línea colapsada queda "✓ Energía: bien · Sin molestias · Dormiste bien · editar".
- Tests nuevos en `check-in-summary.test.ts`: etiquetas Bajo/Normal/Bien con valores `bajo/normal/alto` (T-199-65), las 3 preguntas terminan en "hoy?", regla C4 probada contra cada opción de `CHECK_IN_QUESTIONS`, `summaryParts` = `['Energía: bien','Sin molestias','Dormiste bien']`.

**Task 2 (D14 + D15 + D17), commit `0810125c2`**

- `_brand.scss`: `$mt-block-title-color: $brand-terracotta` (una sola definición).
- `NovedadesCard.vue`: solo `@import 'src/css/brand'` y la línea de color de `.nov-card__title`. Timer, barra y desplazamiento del plan 24 intactos.
- `WeekStrip.vue`: título "Tus sesiones" (token compartido, sin color literal), `aria-label="Tus sesiones"`, dos columnas iguales con filete vertical `1px #e5dbcd` (cifra Montserrat 700 32 px `tabular-nums` + caption 13 px `#6b6459`), puntos L–D debajo a todo el ancho con `space-between` (mismo marcado y `aria-label` por día). Eliminados `totalText` y `week-strip__total`.
- `check-in-summary.ts`: `sessionsTotalCaption('total'|'templo')` ("en total" / "en El Templo") + 2 tests.
- `MiTemplo.vue`: borrado `<h3 class="for-you__title">` y su regla SCSS; la sección conserva `aria-label="Para vos"`. Comentarios actualizados a "Tus sesiones".

## Verificación

| Verificación                                                                      | Resultado                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx vitest run src/modules/progression/utils/__tests__/check-in-summary.test.ts` | verde, 32 tests                                                                                                                                                    |
| `npx vue-tsc --noEmit`                                                            | 18 errores `error TS` (todos preexistentes), 0 en archivos del plan                                                                                                |
| `pnpm lint`                                                                       | 0 errores, 2 warnings preexistentes (`axios.ts`, `useSessionPlayer.ts`)                                                                                            |
| Acceptance greps Task 1                                                           | `label: 'Bien'`=1, "hoy?" x3, sin "Registro del día" visible, `aria-label`=1, `progressLabel` presente                                                             |
| Acceptance greps Task 2                                                           | token definido 1 vez, usado en WeekStrip y NovedadesCard, 0 colores literales en `&__title`, 0 `Tu semana`/`totalText`/`for-you__title`, `aria-label="Para vos"`=1 |
| Worktree `/home/franco/projects/et-199-mi-templo`                                 | limpio                                                                                                                                                             |

Tests de app corridos: solo `check-in-summary.test.ts`. No se corrieron tests de API ni se tocó la API. Admin sin cambios.

## Decisiones de discreción (para el UAT humano abierto en 199-21)

1. C4 aplicado a toda la pregunta de energía: `Energía: bajo`, `Energía: normal`, `Energía: bien`.
2. Línea colapsada sin el prefijo "Registro del día · " (Franco pidió sacar el título; la línea lo repetía).
3. Los títulos de bloque pasan de `ink` (`#2c2318`, UI-SPEC) a terracota por decisión de Franco (D14). Contraste terracota sobre card blanca 5.6:1 (UI-SPEC). Nota: `NOVEDADES` es de 15 px y `TUS SESIONES` de 13 px (cada uno conserva su tamaño; solo se unificó el color).
4. `CheckInChips.vue` del admin/coach ("Energía alta") y analytics NO se tocan: vista interna del staff y el valor guardado sigue siendo `alto`.
5. Títulos "REGISTRO DEL DÍA" y "PARA VOS" quitados; accesibilidad por `aria-label` en cada `<section>`.

## Deviations from Plan

Ninguna: el plan se ejecutó tal cual. Ajustes menores no previstos: se actualizó el comentario de cabecera de `check-in-summary.ts` y el de `MiTemplo.vue:122` ("Tu semana" -> "Tus sesiones"); lint-staged reformateó con Prettier en cada commit sin cambios de comportamiento.

## Pendiente para revisión visual (UAT)

- Que "Tus sesiones" entre sin overflow a 360 px (las columnas son `1fr 1fr` con `min-width: 0`; no se midió en navegador).
- Que la fila "n de 3" arriba a la derecha se vea bien sin el título.
- Con 3 dígitos de sesiones totales y caption "en El Templo" a 360 px.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-199-65 mitigado: solo cambió el `label`; el test afirma que los valores siguen `bajo/normal/alto`.

## Self-Check: PASSED

Commits `1dd97c376` y `0810125c2` existen en `feat/199-mi-templo-rediseno`; archivos modificados presentes; worktree limpio.
