---
phase: 215-regalar-aura
plan: 08
subsystem: api-aura
tags: [aura, regalo, profe, panel-asistencia, tenancy]
requires: ["215-07"]
provides:
  - "`POST /api/admin/aura/gifts`: el profe da Aura a un alumno de su clase"
  - "`GET`/`PUT /api/admin/aura/gift-settings`: valor del regalo del profe"
  - "`coachGiftAmount` y `gift` por fila en el panel de asistencia"
affects: [215-09, 215-22]
tech-stack:
  added: []
  patterns:
    [
      chequeo de rol por ruta dentro de un plugin con guard de staff,
      campos nuevos del panel armados en el handler sin acoplar el servicio de asistencia,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-admin-routes.ts
    - el-templo-api/test/aura/gifts-coach.test.ts
  modified:
    - el-templo-api/src/modules/aura/gift-schemas.ts
    - el-templo-api/src/modules/aura/module.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "Los campos del regalo del profe en el panel se arman en la ruta, no en AttendanceService"
requirements-completed: [SC-3, SC-5, D-01, D-03, D-04, D-07, D-11, D-15, D-16]
duration: 30 min
completed: 2026-11-18
---

# Fase 215 Plan 08: rutas del regalo del profe y panel de asistencia Summary

El profe ya puede dar Aura desde el admin (valor del gimnasio, 2 por defecto), los administradores pueden ver y editar ese valor, y el panel de asistencia dice, fila por fila, a quién se le puede dar. El botón del admin es el plan 22.

## Tareas

| Tarea | Commit      | Asunto                                                             |
| ----- | ----------- | ------------------------------------------------------------------ |
| 1     | `ed8274eb8` | feat(215-08): rutas de admin del regalo del profe y del valor      |
| 2     | `fbc65dcf2` | feat(215-08): estado de regalo del profe en el panel de asistencia |
| 3     | `8a5bfbf5c` | test(215-08): integración del regalo del profe y del panel         |

## Qué quedó

- `gift-admin-routes.ts`: hook `onRequest` (autenticación, rol de staff, país) y chequeo de rol propio en cada ruta. `POST /gifts` solo `isCoachLikeRole` (pasa `branchIds` desde `request.scope`), `GET /gift-settings` dueño, admin y admin_sede, `PUT` dueño y admin. 403 con `code` `REGALO_SIN_PERMISO`; el resto de los errores por `sendGiftError`. Registrado en `temploGamificationModule` bajo `/api/admin/aura`.
- `gift-schemas.ts`: `coachGiveGiftSchema` (201 `{ amount }`), `getGiftSettingsSchema` y `putGiftSettingsSchema` (entero de 1 a 10 tomado de `COACH_GIFT_AMOUNT`, sin duplicar el rango).
- Panel: `slotAttendanceSchema` declara `coachGiftAmount` (entero o null) y `gift` por fila (`state` en `disponible | dado | no_participa`, `amount`, `reason`). El handler lee `branchId` y zona del horario con `tenantWhere` y llama a `coachGiftStatesForSlot` solo si quien mira es profe; para el resto responde null sin consultar nada.
- Manifiesto: 3 entradas `templo-module`/`templo-gamification`; `ENTRADAS_BASELINE` 592 a 595 (y el título del `it`).
- `gifts-coach.test.ts`: 15 `it` (los 14 casos del plan, más la prueba de que profe y recepción no leen ni cambian el valor). Nunca corrió local.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): ninguna mención de `gifts-coach`, `tenant-manifest` ni `iso-01`; las 18 discrepancias son deuda ajena de base.
- No se corrió ningún test de integración (quedan para CI). App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

Ninguno de fondo. `AttendanceService` no hizo falta tocarlo (como el plan preveía): el handler devuelve `{ ...result, coachGiftAmount, members: [...gift] }`.

## Decisiones propias

Dos filas nuevas en `215-DECISIONES-AUTONOMAS.md`: quién ve y cambia el valor (el profe no lo lee por la ruta de ajustes) y el panel sin consultas de regalos para quien no es profe de la sede.

## Lecciones para los planes siguientes

- Plan 22 (admin): el panel trae `gift: null` para filas sin asistencia y para quien no es profe; solo `state === 'disponible'` muestra botón. El `POST` responde 201 `{ amount }`; los `409` (`REGALO_YA_DADO`, `REGALO_VENCIDO`, `REGALO_NO_DISPONIBLE`) y el `403` traen `code`.
- El 404 del módulo apagado no trae `code`: la pantalla del admin debe tratarlo como "función no disponible".
- Si CI falla en `gifts-coach.test.ts`, mirar primero la siembra del staff y la sede propia del profe ajeno (se borra en `afterAll` con `cleanupGiftClasses`).

## Self-Check: PASSED

Archivos y commits `ed8274eb8`, `fbc65dcf2` y `8a5bfbf5c` verificados.
