---
phase: 199-rediseno-mi-templo
plan: 11
subsystem: app-layout-visual
tags: [fontsource, app-bg, d-04, d-12, d-15, d-16]
requires: [199-10, 199-06]
provides:
  - Cinzel 700 y Nunito Sans 700 cargadas por @fontsource
  - foto de fondo detrás de páginas y cards en toda la app
  - saludo, ALFA y tab bar con texto sólido
  - fecha del saludo en la zona de la sede (DEFAULT_BRANCH_TZ, UserProfile.branchTimezone)
key-files:
  modified:
    - el-templo-app/package.json
    - el-templo-app/pnpm-lock.yaml
    - el-templo-app/src/css/app.scss
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/modules/training/pages/TrainingIndex.vue
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/utils/tz.ts
requirements-completed: [D-04, D-12, D-15, D-16]
completed: 2026-10-15
---

# Phase 199 Plan 11: cimientos visuales de la app Summary

Fuentes de la frase, fondo detrás en toda la app, saludo y tab bar con texto sólido y fecha del saludo en la zona de la sede.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `db86d8947` chore(199-11): sumar @fontsource/nunito-sans e importar Cinzel/Nunito Sans 700 (D-12)
- Task 2: `2ff34abd3` feat(199-11): foto de fondo detrás en toda la app, saludo/tab bar con texto sólido y fecha del saludo en la zona de la sede (D-04, D-15, D-16)

## Qué se hizo

**Dependencia:** `pnpm add @fontsource/nunito-sans` -> `^5.3.0` (resuelto 5.3.0). `git diff --stat`: package.json +1 línea, pnpm-lock.yaml +8 líneas (importer, entrada de `packages` y `snapshots`). Ninguna otra dependencia ni versión cambió. `app.scss` importa `@fontsource/cinzel/700.css` y `@fontsource/nunito-sans/700.css`. No se tocó el `@font-face` propio de GuiaPage.

**D-16 fondo detrás:** `<div class="app-bg" aria-hidden="true" />` pasa a ser el primer hijo de `<q-layout>`, con `z-index: -1` (resto igual: fixed, opacity .08, filtro, pointer-events none). `.q-page { background-color: transparent }`. `body` y `.q-card` siguen crema opacos (L24, sin tocar el global).

**D-15:** `.header-greeting__date` blanco sólido 13 px; badge del nivel `opacity: 1` y `ALFA` 10 px (tanto en MainLayout como en HeaderLevelDropdown, porque la regla scoped del layout también cae sobre la raíz del hijo); chevron `opacity: 1`; textos del menú `#6b6459` y `#7d5d42`. `.mobile-tab` inactivo `#f2ede5`, activo `#fff` con label 700, ícono img 0.9/1. El rail de escritorio (`rgba(white, .6)`) y el marcador de staging no se tocaron.

**D-04:** `DEFAULT_BRANCH_TZ` en `utils/tz.ts`; `UserProfile.branchTimezone?: string`; `formatGreetingDate(dateStr)` en MainLayout (mediodía UTC + `timeZone: 'UTC'`), alimentada con `todayInTz(profile.branchTimezone ?? DEFAULT_BRANCH_TZ)`.

## Fondos de páginas revisados (L23)

Tocados (raíz con crema opaco): `MiTemplo.vue` `.mi-templo` y `TrainingIndex.vue` `.training-index` -> `transparent`.

No tocados, con la razón:

- ReservasPage (`.reservas`), PlanesPage (`<q-page padding>`), ProfilePage (`.profile-page`): la raíz no declara fondo (usaba el global, ahora transparente). Los `white`/`$dark-page`/`$cream !important` son de cards, banners o diálogos internos.
- GuiaPage: el `guia-page__scene` (flex:1) pinta su propio gradiente + `bars-open.webp`; la raíz solo fija color de texto. Sin riesgo.
- Con fondo propio deliberado, no tocadas: CheckInPage (`#1a1a1a`), bar-challenge Explicacion/Timer/Resultado (`#1a1612`), y las páginas de flujo MiArbol, GoalPlanSession, DayPlayer y SessionSummaryPage (crema opaco propio; quedan sin foto, ver duda 2).
- Sin fondo propio (ahora transparentes sobre body crema, visualmente igual salvo la foto al 8 %): ActivarInvitacion, ContactoVentas, ProponerMejora, MagicLink, MisInvitados, ReservasPageLegacy, ChangePassword, Volver, WeeklyView, IndexPage.
- Login/Register/ForgotPassword/Onboarding/InvitacionLanding usan `q-page-container` sin MainLayout: no tienen `.app-bg`, sin efecto.

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18). Uno cae en un archivo del plan: `MainLayout.vue(302,39) TS2339 'displayName'` en `memberName`, que es código previo que no modifiqué (no pude comprobarlo contra HEAD~2 sin stash, pero la línea no está en mi diff). Ninguno en HeaderLevelDropdown, MiTemplo, TrainingIndex, useUserStore, tz ni app.scss.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Greps de aceptación: `z-index: -1` = 1; `app-bg` (línea 4) antes de `q-page-container` (línea 96); `new Date().toLocaleDateString` = 0; `opacity: 0.6` en HeaderLevelDropdown = 0; los `rgba(white, ...)` restantes en MainLayout están todos en `.desktop-rail*` (líneas 621/632/641).
- Tests de app corridos (uno por uno, foreground): `src/stores/__tests__/user-store-trial-lines.test.ts` 4/4 y `src/boot/__tests__/auth.test.ts` 7/7. No existe test de `tz.ts` ni de MainLayout.
- No se corrió `pnpm build` (lo corre CI).

## Deviations from Plan

1. **[Menor] Aclaración del criterio vue-tsc:** el criterio "ninguno en archivos del plan" no se cumple a rajatabla por el error previo de `displayName` en MainLayout (ver arriba); el total sigue en 18.
2. **[Menor] `.header-greeting__badge` y `__level` se ajustaron también en MainLayout** (el plan solo listaba HeaderLevelDropdown): la regla scoped del layout aplica a la raíz del componente hijo y dejaba ALFA a 8 px / opacidad .6.

No se encontraron bugs reales.

## Dudas abiertas (no bloqueantes)

1. Verificar visualmente (plan 21 / UAT) que `z-index: -1` realmente queda sobre el canvas crema en WebView iOS/Android y no queda tapado por el fondo `!important` del body. No hay ancestro con fondo propio en `q-layout`/`q-page-container`, así que debería verse.
2. MiArbol, GoalPlanSession, DayPlayer y SessionSummaryPage conservan crema opaco propio (fuera de la lista de archivos del plan, y son flujos de pantalla completa). Si Franco quiere la foto también ahí, es un cambio de una línea por página.
3. El perfil cacheado viejo no trae `branchTimezone`: cae en `DEFAULT_BRANCH_TZ` hasta el próximo `/auth/me`. El plan 12 debe re-exportar `DEFAULT_BRANCH_TZ` desde check-in-window.ts y no redeclarar `branchTimezone`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-SC aceptado (lockfile en el commit, solo CSS + woff); T-199-34 queda para las capturas del plan 21 y el UAT.

## Self-Check: PASSED

- Commits `db86d8947` y `2ff34abd3` presentes en el worktree; `git status --porcelain` vacío; `node_modules/@fontsource/nunito-sans` existe.
