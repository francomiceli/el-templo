---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
plan: 04
subsystem: admin-nav
tags: [white-label, nav, rename, surface-gate, planes, programas]
requires:
  - templo-config.ts NAV_MODEL + isNavItemVisible (149)
  - TEMPLO_GREEK_LEVELS surface-flag pattern (154)
provides:
  - "Nav labels 'Planes de pago' / 'Rutinas de entrenamiento'"
  - "TEMPLO_TRAINING_ROUTINES per-installation surface flag"
  - "routines?: boolean gating en NavItem"
affects:
  - PlanFormDialog multi-select de programas (156-05, reusa la misma superficie D-08)
tech-stack:
  added: []
  patterns:
    - "Surface gate per-instalación (patrón TEMPLO_GREEK_LEVELS) para de-Templo-ficar el nav"
key-files:
  created: []
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/pages/PlanesPage.vue
    - el-templo-admin/src/pages/ProgramasPage.vue
decisions:
  - "Gating por prop nueva `routines?: boolean` + TEMPLO_TRAINING_ROUTINES (NO reusar el knob `templo` ni canAccessTraining): mantiene el flag como knob independiente per-instalación mientras el dueño-only por rol (149 D-15) sigue aplicando en capas."
metrics:
  duration: ~2min
  completed: 2026-07-05
---

# Phase 156 Plan 04: Planes de pago vs Rutinas de entrenamiento Summary

Separación de superficie de nav — rename de labels y títulos ("Planes de pago" / "Rutinas de entrenamiento", nombres textuales de Nacho, D-01) + gating de "Rutinas de entrenamiento" (`/programas`) como superficie Templo per-instalación (D-02), sin tocar rutas ni identificadores de código.

## What Was Built

### Task 1 — Labels nav + flag de superficie de rutinas (`7ac1a88f`)

- Nuevo `export const TEMPLO_TRAINING_ROUTINES = TEMPLO_ENABLED;` con docblock análogo a `TEMPLO_GREEK_LEVELS` (per-instalación, NO per-user, NO reusa `canAccessTraining`).
- `NAV_MODEL`: labels `'Planes' → 'Planes de pago'` y `'Programas' → 'Rutinas de entrenamiento'`. Paths (`/planes`, `/programas`) y roles (`PLANES_READ_ROLES`, `DUENO_ROLES`) intactos.
- Nueva prop `routines?: boolean` en `NavItem`; el ítem `/programas` la lleva `routines: true`.
- `isNavItemVisible`: `if (item.routines && !TEMPLO_TRAINING_ROUTINES) return false;` — gating en capas sobre el dueño-only existente (149 D-15). White-label default (`false`) oculta el ítem; El Templo lo ve.

### Task 2 — Títulos de página (`b581503d`)

- `PlanesPage.vue`: título `text-h5` `'Planes' → 'Planes de pago'`.
- `ProgramasPage.vue`: título `text-h5` `'Programas' → 'Rutinas de entrenamiento'`, botón `'Nuevo Programa' → 'Nueva rutina'` (texto visible coherente, D-01).
- Sin cambios de ruta, componentes, columnas ni lógica de tabla/precio.

## Deviations from Plan

None — plan ejecutado tal cual. La elección entre reusar el knob `templo` vs agregar una prop dedicada quedaba a discreción del plan; se optó por la prop `routines?: boolean` dedicada para mantener el flag como knob independiente per-instalación (permite a un futuro tenant ocultar rutinas sin apagar toda la capa Templo).

## Verification

- **Task 1:** greps `Planes de pago` + `Rutinas de entrenamiento` + `TEMPLO_TRAINING_ROUTINES` OK; `templo-config.ts` con **0 errores** de vue-tsc; eslint verde.
- **Task 2:** greps de títulos OK; eslint verde en ambas páginas.
- **Nota de type check:** el `vue-tsc --noEmit` del repo arroja errores pre-existentes en archivos NO relacionados (`session-pdf-builder.ts`, tests, componentes varios) — fuera de scope (SCOPE BOUNDARY). Los 3 archivos tocados por este plan introducen 0 errores. Suite completa corre en CI, no local (preferencia del proyecto).
- Verificación visual del nav y títulos → cubierta por UAT de fase (no bloqueante aquí).

## Threat Surface

Sin superficie nueva. El gating de nav solo OCULTA ítems (T-156-10 `accept`): el control real es dueño-only por rol en la API (149 D-15). Sin paquetes nuevos instalados (T-156-SC).

## Self-Check: PASSED

- FOUND: el-templo-admin/src/config/templo-config.ts (con `Planes de pago`, `Rutinas de entrenamiento`, `TEMPLO_TRAINING_ROUTINES`)
- FOUND: el-templo-admin/src/pages/PlanesPage.vue (`Planes de pago`)
- FOUND: el-templo-admin/src/pages/ProgramasPage.vue (`Rutinas de entrenamiento`)
- FOUND commit: 7ac1a88f
- FOUND commit: b581503d
