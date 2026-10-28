---
phase: 203-carga-sin-parpadeos
plan: 15
subsystem: app-entrenar
status: complete
completed: 2026-10-28
requirements: [SC-3, D-01, D-09, D-17]
commits: [7e6f4119b, 810158f7c]
key-files:
  modified:
    - el-templo-app/src/modules/training/utils/semanaCta.ts
    - el-templo-app/src/modules/training/utils/__tests__/semanaCta.test.ts
    - el-templo-app/src/modules/training/composables/useTrainingWeek.ts
    - el-templo-app/src/modules/training/components/semana/SemanaHero.vue
    - el-templo-app/src/modules/training/components/semana/SemanaTab.vue
---

# Phase 203 Plan 15: CTA de Entrenar sin "Empezar" que cambia a "Continuar" (SUMMARY)

El botón de hoy en Entrenar ya no pinta "Empezar" para después saltar a "Continuar" (C-10): mientras no se leyó el progreso local reserva su lugar sin texto ni ícono ni acción, y cuando se resuelve muestra el texto correcto sin moverse.

## Qué quedó

### Task 1 (`7e6f4119b`): lógica pura + test
- `SemanaCtaInput.hasProgress: boolean | null` (null = no se leyó todavía). `SemanaCta.pending: boolean`.
- Todos los returns llevan `pending: false` (7 ocurrencias); la rama "Hoy" con `hasProgress === null` devuelve `pending: true`, `action: null`, `label: 'Empezar'`, `variant: 'primary'`, `startsTraining: false`. Con `false`/`true` queda como antes (`start`, 'Empezar'/'Continuar').
- Test: `pending: false` agregado a los dos `toEqual` de objeto completo; describe nuevo "progreso local sin leer (C-10)" con 5 casos (null -> pending; false; true; barrido de estados no-hoy x {null,false,true} nunca pending; los demás estados no cambian según hasProgress); `{ hasProgress: null }` sumado al barrido "ningún estado lleva a Libre".

### Task 2 (`810158f7c`): composable y componentes
- `useTrainingWeek.ts`: `hasProgress: Ref<boolean | null>`, `ref<boolean | null>(null)`. `refreshProgress()`: sin `dayId` -> `false` (como antes); con `dayId` -> `null` ANTES del `await`; resultado y error como antes (true/false).
- `SemanaHero.vue` y `SemanaTab.vue`: prop `hasProgress: boolean | null`. En el botón: `:aria-busy="cta.pending"`, texto e ícono de play con `visibility: hidden` cuando `pending`; `onCta` sale temprano si `cta.pending`. Sin cambios de clases ni colores. `EntrenarView.vue` no necesitó cambio (el tipo fluye desde el composable).
- Prettier y eslint pasaron sobre los 5 archivos. Greps del plan OK; `hasProgress = ref(false)` = 0.

## Tests escritos SIN correr (D-17) — los corre el orquestador

1. `el-templo-app/src/modules/training/utils/__tests__/semanaCta.test.ts` (extendido: 5 casos nuevos + 2 `toEqual` actualizados + 1 entrada en el barrido de Libre apagado).

No hay test de `useTrainingWeek` ni de `SemanaHero` (no existían). `vue-tsc` no se corrió: revisar que `EntrenarView.vue` -> `SemanaTab` -> `SemanaHero` compile con el tipo `boolean | null`.

## Deviations from Plan

**1. [Diseño] El ícono de play también reserva lugar en `pending`.** En `pending` `startsTraining` es `false` (no arranca nada), así que el `v-if` del ícono era falso y, al resolverse, el ícono aparecía y movía el texto. El `v-if` ahora es `cta.startsTraining || cta.pending` y en `pending` el ícono queda `visibility: hidden`. Cumple "sin moverse".

**2. [Robustez] `useTrainingWeek.enqueue` pone `hasProgress = false` en el `catch` de la carga fallida** (si la solicitud sigue vigente). Sin eso, un fallo de `fetchWeekSessions` antes de `refreshProgress` dejaba `null` para siempre en la primera carga, contra T-203-33 ("siempre resuelve a true/false"). Con `hasSession` falso el CTA no es "Hoy", así que no cambia nada visible.

**3. [Cosmético] Prettier reformateó una línea ajena** en `SemanaHero.vue` (`MarqueeText` del título pasó a una línea). Sin efecto.

## Riesgos antes del plan 16

- Mientras `fetchWeekSessions` corre (`sessions.clear()` al empezar, plan 09), el día elegido no tiene sesión y el CTA no es el de "Hoy": no hay `pending` en ese tramo (hasProgress conserva el último valor). Lo del `clear()` lo resuelve el orquestador; cuando lo haga, el botón de hoy debería mostrar `pending` también durante la carga de la semana, no solo durante la lectura del progreso.
- `pending` no usa `disabled` (el botón sigue enfocable por teclado, click no-op, `aria-busy`); si en el UAT se ve un foco/ripple raro en el botón vacío, evaluar `disabled` + estilo neutro. No hay build/dispositivo para verificarlo (D-17).
- Si `cleanup()` corre con una lectura de progreso en vuelo, `hasProgress` queda `null`; es inocuo porque el componente ya se desmontó.
- `loadProgress` lee Preferences (ms): el `pending` dura un frame o dos; el efecto es sobre todo evitar el cambio de texto, no agregar un estado visible.
