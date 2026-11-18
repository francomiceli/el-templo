---
phase: 214-comunidad-anotados-aura
plan: 25
subsystem: app-quienes-van
tags: [app, reservas, anotados, hoja, D-51, D-52, D-59, D-65, D-69]
requires: ["214-24"]
provides:
  - "Fila 'N anotados' (slot-card__who) en la grilla principal de Reservas"
  - "AttendeesSheet: hoja 'Quiénes van' con grilla de caras, nota de primera vez, seis estados y pie"
  - "attendees-view.ts: attendeeName, attendeeAriaLabel, sheetTitle, sheetFooterAction"
affects: ["214-26", "214-27", "214-32"]
key-files:
  created:
    - el-templo-app/src/components/AttendeesSheet.vue
    - el-templo-app/src/utils/attendees-view.ts
    - el-templo-app/src/utils/__tests__/attendees-view.test.ts
  modified:
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/src/utils/slot-availability.ts
    - el-templo-app/src/utils/__tests__/slot-availability.test.ts
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 25: fila "N anotados" y hoja "Quiénes van" Summary

La grilla principal de Reservas muestra una fila "N anotados" por horario (no pasado ni feriado) que abre `AttendeesSheet` sin disparar la reserva; la hoja dibuja lo que manda el servidor, en su orden, con "Vos", pastilla de Aura solo si no es null y la celda "+N más".

## Commits

- `aff9d6c44` test(214-25): vista de la hoja de anotados (rojo)
- `65a17238b` feat(214-25): utilidades de la hoja de anotados
- `f2fbe3046` feat(214-25): fila de anotados y hoja Quiénes van (D-51, D-59)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base; ninguno en `AttendeesSheet`, `ReservasPage`, `attendees-view` ni `slot-availability`.
- Tests puros: `attendees-view.test.ts` 19 de 19, `slot-availability.test.ts` 30 de 30 (RED confirmado antes: el módulo no existía).
- Greps del plan: "QUIÉNES VAN", "No pudimos cargar quiénes van.", "La lista con nombres la ven los alumnos con plan vigente.", "Ocultarme", `getSlotAttendees`, `slot-card__who`, `AttendeesSheet`.
- Sin componente testeable (la app no tiene harness): la revisión visual a 360, 390 y 412 queda para el UAT (plan 32).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueo] La prop `slot` no se puede usar en un componente Vue**
- **Found during:** Task 2 (lint)
- **Issue:** `vue/no-deprecated-slot-attribute` marca `:slot=` como atributo de slot reservado.
- **Fix:** la prop se llama `schedule` (tipo `AttendeesSheetSlot`, definido en `attendees-view.ts`).

**2. [DRY] Archivo fuera de `files_modified`**
- `slot-availability.ts` (y su test) ganó `bookedText(n)`, que ahora usan el chip y la fila ("helper existente" del plan: el texto "N anotados" solo existía dentro de `availabilityText`).

## Decisiones propias

- Card en columna con el modificador `slot-card--stacked` solo en la grilla principal: las grillas de prueba y de partner (que comparten `.slot-card`) siguen en fila.
- El pie queda en "Cerrar" cuando el horario da 404 (el texto del cuerpo no repite el botón).
- Si `markNoticeSeen` falla se loguea y no se frena a la persona (la nota vuelve la próxima vez); sin texto de error inventado (D-69).
- "Ocultarme" y "Cambialo en Perfil" navegan con `router.push({ path: '/profile', hash: '#comunidad' })`: el ancla y el resalte del interruptor en Perfil NO existen todavía (quedan para el plan que arma esa sección en Perfil).
- Header de la hoja: con la lista cargando el total es un esqueleto; con error o 404 se omite el total y se muestra "{maxCapacity} lugares · {actividad}".
- La hoja descarta la lista (`data = null`) al cerrarse y al desmontarse; no hay store ni almacenamiento (T-214-25-01).

## Known Stubs

Ninguno. `open-photo` se emite pero nadie lo escucha todavía: lo cablea el plan 26 (diálogo de la foto).

## Threat Flags

Ninguno. T-214-25-01/02/03 mitigados: lista solo en estado del componente, la app dibuja lo que manda el servidor, y "Reservar" pasa por `onSlotTap`.

## Self-Check: PASSED
