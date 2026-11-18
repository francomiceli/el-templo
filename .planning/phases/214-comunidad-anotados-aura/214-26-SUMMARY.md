---
phase: 214-comunidad-anotados-aura
plan: 26
subsystem: app-quienes-van
tags: [app, anotados, foto, reporte, D-34, D-45, D-69]
requires: ["214-25"]
provides:
  - "AttendeePhotoDialog: vista de la foto de un compañero y reporte en dos pasos (Pantalla 3d)"
affects: ["214-27", "214-32"]
key-files:
  created:
    - el-templo-app/src/components/AttendeePhotoDialog.vue
  modified:
    - el-templo-app/src/components/AttendeesSheet.vue
metrics:
  tasks: 1
  completed: 2026-11-18
---

# Phase 214 Plan 26: ver la foto de un compañero y reportarla Summary

Tocar una cara con foto en la hoja "Quiénes van" abre `AttendeePhotoDialog` (`PremiumDialogCard tone="light"`): foto de 160, nombre, pastilla de Aura si no es null, "Reportar foto" y "Cerrar". "Reportar foto" pasa en el mismo diálogo a la confirmación ("¿Reportar la foto de {nombre}?", "Reportar" con `loading`, "Cancelar"). El reporte no oculta la foto.

## Commits

- `688e99271` feat(214-26): ver la foto de un compañero y reportarla (D-45)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base; ninguno en `AttendeePhotoDialog` ni `AttendeesSheet`.
- Greps del plan: "Reportar foto", "Gracias. La vamos a revisar.", "Ya enviaste varios reportes", `reportPhoto`, `AttendeePhotoDialog` en la hoja.
- Sin harness de componentes: la revisión visual queda para el UAT (plan 32).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- Respuestas: 204 cierra con notify positive. 404 notify negative "Esa foto ya no está disponible." y cierra (no hay nada que reintentar). 429 y otros errores notify negative y se queda en el paso de confirmación para poder reintentar. Solo los errores distintos de 404 y 429 se loguean.
- Mientras va el reporte el diálogo es `persistent` y "Cancelar" queda deshabilitado, para no dejar una petición en vuelo con el diálogo cerrado.
- "Reportar foto" se deshabilita si `photoId` es null (no pasa por la hoja, que solo abre caras con `photoId`).
- La hoja monta un solo `AttendeePhotoDialog` como hermano del `q-dialog` (el template pasa a tener dos raíces) y lo cierra y descarta al cerrarse la hoja. Sigue emitiendo `open-photo` por compatibilidad; nadie lo escucha.
- Cada apertura vuelve al paso 1.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-26-01: el 429 del servidor se muestra tal cual. T-214-26-02: la respuesta es 204 sin datos y el texto aclara que no se informa quién reportó.

## Self-Check: PASSED
