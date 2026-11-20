---
phase: 215-regalar-aura
plan: 06
subsystem: api-aura
tags: [aura, regalo, rutas, tenancy, tests]
requires: ["215-05"]
provides:
  - "`GET /api/members/aura/gifts/pending`, `GET /api/members/aura/gifts/candidates` y `POST /api/members/aura/gifts`"
  - "Esquemas cerrados (`gift-schemas.ts`) y topes por IP y por usuario"
  - "Gates de tenancy (manifiesto, MOD-01) y test de integración del regalo del alumno"
affects: [215-15, 215-16]
tech-stack:
  added: []
  patterns:
    [
      esquemas de respuesta cerrados que declaran cada campo,
      tope por IP en config y por usuario en preHandler,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-schemas.ts
    - el-templo-api/src/modules/aura/gift-member-routes.ts
    - el-templo-api/test/aura/gifts-member.test.ts
  modified:
    - el-templo-api/src/modules/aura/module.ts
    - el-templo-api/src/modules/shared/rate-limits.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/mod-01-guard.test.ts
key-decisions:
  - "429 no se declara en los esquemas: lo arma el plugin de topes"
requirements-completed:
  [
    SC-1,
    SC-2,
    SC-4,
    SC-5,
    SC-8,
    D-02,
    D-04,
    D-05,
    D-07,
    D-08,
    D-09,
    D-12,
    D-14,
    D-16,
  ]
duration: 30 min
completed: 2026-11-18
---

# Fase 215 Plan 06: rutas del alumno para regalar Aura Summary

La app ya tiene de dónde pedir los regalos pendientes de la card, las caras de una clase y dar el regalo: tres rutas dentro del módulo de gamificación, con respuestas cerradas (sin apellido, teléfono, email ni ids), topes de pedidos y los gates de tenancy en el mismo plan.

## Tareas

| Tarea | Commit      | Asunto                                                     |
| ----- | ----------- | ---------------------------------------------------------- |
| 1     | `6c46441ae` | feat(215-06): rutas del alumno para regalar Aura           |
| 2     | `07e0a6a89` | test(215-06): manifiesto y guard del módulo para las rutas |
| 3     | `d8f89442a` | test(215-06): integración del regalo del alumno            |

## Qué quedó

- `gift-schemas.ts`: esquemas de `pending`, `candidates` y `POST`. El enum de motivos sale de `GIFT_REASONS`. El `201` solo lleva `receiverFirstName` y `reason`. Los `403/404/409` llevan `error`, `message` y `code`.
- `gift-member-routes.ts`: mismo `onRequest` que `member-routes.ts`; el `userId` sale siempre del token y ninguna ruta acepta un id de usuario. Errores por `sendGiftError` con contexto `aura.gifts.<accion>`.
- Topes (`rate-limits.ts`): POST 30 por minuto por IP y 10 por usuario; candidatos 120 por IP y 30 por usuario.
- Registro en `temploGamificationModule.routes` (prefijo `/api/members/aura`) y docblock actualizado.
- Manifiesto: 3 entradas `templo-module` / `templo-gamification`. `ENTRADAS_BASELINE` 589 a 592 (también el título del `it`). No mueve `CASOS_BASELINE`.
- MOD-01: con el módulo apagado para el gimnasio 2, `pending` y `POST` dan el 404 exacto del guard; prendido, `pending` da 200 con listas vacías.
- `gifts-member.test.ts` (16 `it`): los 15 casos del plan (pending de ayer, hoy y anteayer; clase en curso; caras con orden, exclusiones y campos exactos; 201 con ledger del receptor y dador intacto; `REGALO_YA_DADO` y "Le diste Aura"; tope semanal con anulado; semana anterior; `REGALO_VENCIDO`; receptores no válidos; dador oculto y sin plan; asistencia ajena 404; motivo inválido 400; aislamiento con el gimnasio 2; sin tope de lo recibido; conciliación contra `/auth/me` y SQL crudo) más el tope por usuario de candidatos (429).

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0). `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): ninguna mención de `tenant-manifest`, `iso-01`, `mod-01` ni `gifts-member`; la deuda listada es ajena.
- No se corrió ningún test de integración (quedan para CI). App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

- El plan pedía declarar `429` en el esquema del POST. No se declaró: el cuerpo del 429 lo arma `@fastify/rate-limit` y no tiene `code`; un esquema que lo exige rompería la serialización.
- Se sumó un caso de tope por usuario (429 en candidatos) a los 15 pedidos: cubre T-215-06-02 por ruta.

## Decisiones propias

Anotada en `215-DECISIONES-AUTONOMAS.md`: quien supera el freno recibe el aviso estándar de "demasiados pedidos", no uno propio del regalo.

## Lecciones para los planes siguientes

- La app decide el texto por `code`; `candidates` también da 409 `REGALO_YA_DADO` (clase ya regalada) y 404 (asistencia ajena).
- Si el test falla en CI, mirar primero el orden de las caras (`checkedInAt` explícito), los casos de clase "hoy" (flaquean solo a medianoche) y el 429 (31 pedidos del mismo usuario).
- Un 400 de validación no cuenta para el tope por usuario (el `preHandler` corre después).

## Self-Check: PASSED

Archivos y commits `6c46441ae`, `07e0a6a89` y `d8f89442a` verificados.
