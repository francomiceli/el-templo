---
phase: 214-comunidad-anotados-aura
plan: 24
subsystem: app-selector-de-nivel
tags: [app, entrenar, selector-de-nivel, barra, D-55, D-62, D-69]
requires: ["214-23"]
provides:
  - "HeaderLevelDropdown con prop variant 'bar' | 'light'"
  - "Selector de nivel en la barra de celular solo en Entrenar, con ajuste de ancho a menos de 420 px"
  - "Pastilla clara de escritorio arriba de las pestañas de Entrenar"
affects: ["214-32"]
key-files:
  modified:
    - el-templo-app/src/modules/training/components/HeaderLevelDropdown.vue
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/modules/training/pages/EntrenarView.vue
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 24: selector de nivel fuera del encabezado Summary

`HeaderLevelDropdown` pasa a ser una pastilla de 36 de alto (glifo a 18 con su fuente actual, nombre en mayúsculas, `expand_more`) con variantes `bar` y `light`; vive en la barra de celular solo dentro de Entrenar y, en escritorio, en una fila arriba de las pestañas.

## Commits

- `4204b0e2d` feat(214-24): selector de nivel con variante de barra y clara (D-62)
- `568b287e4` feat(214-24): selector de nivel solo en Entrenar (D-55)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base; ninguno en `HeaderLevelDropdown`, `MainLayout` ni `EntrenarView`.
- Greps del plan: `variant`, "Cambiar nivel", `aria-haspopup="menu"`, `variant="bar"`, "ir a Mi Templo", `variant="light"`.
- Sin tests nuevos (la app no tiene harness de componentes). Revisión visual a 360 y 390 queda para el UAT (plan 32).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- Teclado: Enter y Espacio llaman a `menuRef.toggle()` del `q-menu` (Quasar solo abre el menú con clic).
- `pd-hit-44` es un mixin de `_premium-card.scss`, no una clase: el componente importa `src/css/premium-card` y lo incluye en `.level-trigger`.
- El glifo no fija `font-family` (hereda la del cuerpo, como antes) con peso 700; el nombre sí usa Montserrat 700. Se borraron las clases `header-greeting__*` y `header-level-dropdown*` del componente (ya no las usaba nadie).
- `hideTitleForLevelSelector` = selector visible y `$q.screen.width < 420`. El selector se muestra con `route.name === 'training'`, sesión iniciada y `activeLevel` distinto de null.
- En escritorio la fila va dentro de `EntrenarView` (con `isDesktop` = ancho >= 768, el mismo corte del layout), solo si hay `activeLevel`.
- Con el selector visible el logo con link lleva `alt=""` y el `aria-label` del plan en el `router-link` (evita nombre duplicado).
- La barra de celular muestra el selector con la ruta `training` aunque `TrainingIndex` muestre la vidriera a quien no tiene plan (el plan lo ata a la ruta, no al contenido).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-24-01 aceptado: no se tocó la lógica de selección ni su almacenamiento.

## Self-Check: PASSED
