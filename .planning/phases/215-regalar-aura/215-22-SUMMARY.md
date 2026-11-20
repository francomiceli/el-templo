---
phase: 215-regalar-aura
plan: 22
type: execute
subsystem: admin-coach-gift-attendance-panel
tags: [admin, regalo, profe, panel-de-asistencia]
requires: ["215-21"]
provides:
  - "Cliente completo de regalos del staff en el admin (useAuraGiftsApi) para este plan y el 23"
  - "Boton Dar Aura, chip dado y CoachGiftDialog en el panel de asistencia (Pantalla 6a del UI-SPEC)"
affects: [215-23]
tech-stack:
  added: []
  patterns:
    [
      cliente que propaga errores con lector de code,
      fila que pasa a dado sin recargar,
      una sola instancia del dialogo,
    ]
key-files:
  created:
    - el-templo-admin/src/config/gift-reasons.ts
    - el-templo-admin/src/composables/useAuraGiftsApi.ts
    - el-templo-admin/src/components/CoachGiftDialog.vue
  modified:
    - el-templo-admin/src/config/aura-amounts.ts
    - el-templo-admin/src/composables/useAttendanceApi.ts
    - el-templo-admin/src/types/attendance.ts
    - el-templo-admin/src/css/app.scss
    - el-templo-admin/src/components/SlotAttendancePanel.vue
key-decisions:
  - "El nombre de pila de los avisos sale de la primera palabra del nombre completo"
  - "El dialogo no se cierra mientras el regalo va"
requirements-completed: [SC-3, D-01, D-03, D-11, D-15, D-16]
duration: 15 min
completed: 2026-11-18
---

# Fase 215 Plan 22: el profe da Aura desde el panel de asistencia Summary

El profe ve en cada alumno presente que puede recibir Aura un boton "Dar Aura", elige uno de los cuatro motivos y la fila pasa a "✦ +N" sin recargar; el admin ya tiene el cliente completo de regalos que usa el plan 23.

## Tareas

| Tarea | Commit      | Asunto                                                      |
| ----- | ----------- | ----------------------------------------------------------- |
| 1     | `c9333083a` | feat(215-22): cliente de regalos de Aura en el admin        |
| 2     | `8b560b881` | feat(215-22): el profe da Aura desde el panel de asistencia |

## Que quedo

- `useAuraGiftsApi.ts`: `giveAsCoach`, `listGifts`, `voidGift`, `getSettings`, `saveSettings` (los errores se propagan) y `giftErrorCode(err)` que lee `response.data.code` con `axios.isAxiosError`. Tipos `AdminGiftItem`, `GiftWeek`, `AdminGiftsResponse`, `GiftSettings`, `ListGiftsParams`.
- `gift-reasons.ts` (espejo de la API: `GIFT_REASONS`, `GiftReasonCode`, `giftReasonLabel`) y `giftMember: 1` en `aura-amounts.ts`. Clase global `.text-aura` (`#7d6520`) en `app.scss`.
- `types/attendance.ts`: `SlotAttendanceItem.gift?` y tipos `SlotAttendanceGift` / `SlotGiftState`; `getSlotAttendance` devuelve tambien `coachGiftAmount?`.
- `CoachGiftDialog.vue`: props `memberName`, `firstName`, `attendanceId`, `amount`; emite `given`, `already-given`, `stale`. Motivo sin valor inicial (se reinicia al abrir). 201 notifica positivo; `REGALO_YA_DADO` info; `REGALO_VENCIDO` y `REGALO_NO_DISPONIBLE` warning y `stale`; otro error deja el dialogo abierto con notify negativo.
- `SlotAttendancePanel.vue`: boton, chip y tooltip por estado, antes del boton de eliminar; `given` y `already-given` pasan la fila a `dado` sin recargar, `stale` recarga. Con `gift` null o `no_participa` no se dibuja nada.

## Control posterior

- `pnpm lint` (admin): 0 errores (8 warnings previos ajenos).
- `vue-tsc` admin: 36 errores (base 36); ninguno en los archivos tocados.
- API y app no tocadas. Sin migracion, bump, instalaciones ni push. Prettier sobre las rutas tocadas.

## Desvios respecto del plan

- El plan pedia ampliar `SlotAttendanceItem` en `useAttendanceApi.ts`, pero el tipo vive en `src/types/attendance.ts`: ahi se agrego `gift`, y `useAttendanceApi.ts` solo suma `coachGiftAmount` a la respuesta.
- `app.scss` estaba en CRLF y prettier lo paso a LF (mismo formato que aplicaria lint-staged): el diff del archivo muestra todas las lineas, pero el cambio real son 6 lineas (`git diff --ignore-cr-at-eol`).

## Decisiones propias

Dos filas en `215-DECISIONES-AUTONOMAS.md` (nombre de pila desde el nombre completo; el dialogo no se cierra mientras el regalo va).

## Pendiente para el UAT del plan 24

Ver el panel como profe a 360 px y en escritorio (nada se vio renderizado); probar con un profe: boton, regalo, chip, doble clic, regalo ya dado desde otra pestana, y que dueño, admin y recepcion no vean nada.

## Lecciones para los planes siguientes

- El tipo `SlotAttendanceItem` esta en `types/attendance.ts`; tambien lo usa `SlotDetailDialog.vue`, que no muestra regalos (el campo es opcional).
- `useAuraGiftsApi.listGifts` pide `days` 7, 30 o 90 y `includeVoided`; `weeks` trae la semana actual primero y `giversPct` ya es porcentaje.
- Un `app.scss` con CRLF se normaliza a LF con prettier: no es un cambio de contenido.

## Self-Check: PASSED

Commits `c9333083a` y `8b560b881` y los ocho archivos verificados.
