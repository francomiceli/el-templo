---
phase: 215-regalar-aura
plan: 05
subsystem: api-aura
tags: [aura, regalo, servicio, errores]
requires: ["215-04"]
provides:
  - "`gift-errors.ts`: `GiftError`, `GIFT_ERROR_CODES`, `giftErrorBody` y `sendGiftError`"
  - "`AuraGiftService`: `listPending`, `listCandidates` y `giveMemberGift`"
affects: [215-06, 215-15]
tech-stack:
  added: []
  patterns:
    [
      error con código que sale por un envío propio,
      transacción con FOR UPDATE sobre el dador,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-errors.ts
    - el-templo-api/src/modules/aura/gift-service.ts
    - el-templo-api/test/unit/aura-gift-errors.test.ts
  modified:
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "Clase de fecha futura: REGALO_NO_DISPONIBLE, no VENCIDO"
  - "Si fallan las fotos firmadas, la lista sale con iniciales"
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
    D-06,
    D-07,
    D-08,
    D-09,
    D-10,
    D-12,
    D-13,
    D-14,
    D-16,
  ]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 05: servicio del regalo del alumno Summary

El servidor ya sabe armar los regalos pendientes de la card, los candidatos de la hoja y dar el regalo: el alta revalida todo con la fila del dador bloqueada y acredita 1 de Aura al receptor en la misma transacción, sin tocar nunca el ledger de quien regala.

## Tareas

| Tarea | Commit      | Asunto                                                                |
| ----- | ----------- | --------------------------------------------------------------------- |
| 1 RED | `abb14f1b4` | test(215-05): errores del regalo (rojo)                               |
| 1     | `5ac4494b4` | feat(215-05): errores con código del regalo                           |
| 2     | `2f90d3d11` | feat(215-05): servicio del regalo del alumno (pendientes, candidatos) |

## Qué quedó

- `gift-errors.ts`: siete códigos (`REGALO_TOPE_SEMANAL`, `YA_DADO`, `VENCIDO`, `NO_DISPONIBLE`, `NO_ENCONTRADO`, `YA_ANULADO`, `SIN_PERMISO`) con status 409 / 404 / 403. `GiftError` extiende `AppError`. `sendGiftError` conserva el `code` y delega lo demás en `handleServiceError`. Test unitario de 16 `it` en verde (config unitaria).
- `gift-service.ts` (`AuraGiftService(fastify)`):
  - `listPending`: sin acceso devuelve listas vacías; descarta clases no terminadas, con regalo ya dado (cualquier estado) o sin nadie a quien darle (contando el tope semanal); ordena por vencimiento. `givenToday` = regalos de alumno vigentes creados en el día local de la sede del regalo, el más reciente primero, con nombre de pila, inicial y foto firmada.
  - `listCandidates`: caras de `listEligibleClassmates` con `blockedReason: "tope_semanal"` cuando el conteo semanal llega a 2; lista vacía válida.
  - `giveMemberGift`: motivo válido, `giverAccess` (antes de abrir la transacción), luego `db.transaction` con `SELECT ... FOR UPDATE` sobre el dador, validaciones (404 asistencia ajena, acceso, plazo, ya dado, clase terminada), el receptor se busca de nuevo entre las caras, tope semanal, `INSERT` en `aura_gifts` (clave duplicada detectada con `isDuplicateKeyError` y mapeada a `REGALO_YA_DADO`) y `awardInTransaction` con `sourceType: "social"` y referencia `GIFT_REFERENCE.gift`. Log `info` solo con ids. Comentario `// plan 15: push al receptor después del commit` marcado.

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0). `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (con heap ampliado): ninguna mención de `gift-errors`, `gift-service` ni `aura-gift-errors`; la deuda nueva listada es ajena a la fase.
- Test unitario `aura-gift-errors.test.ts`: 16 de 16. No se corrió ningún test de integración (el servicio no tiene test propio todavía: lo cubren las rutas del plan 06). App y admin no tocados. Sin cambios en dependencias, sin push, sin bump, sin migración.

## Desvíos respecto del plan

Ninguno de fondo. `giverAccess` solo acepta la conexión del pool (no una transacción), así que se resuelve antes de abrir la transacción y se pasa como booleano a la validación común: el orden de rechazos es el mismo en la hoja y en el alta. La ventana entre esa lectura y el `INSERT` (alguien que se oculta justo en ese instante) se acepta.

## Decisiones propias

Anotadas en `215-DECISIONES-AUTONOMAS.md`: clase futura = no disponible; fotos que no se firman = iniciales; quien no puede regalar siempre recibe el mismo rechazo y una asistencia ajena responde 404.

## Lecciones para los planes siguientes

- Rutas (plan 06): instanciar `new AuraGiftService(fastify)`, sacar `userId` de `request.user` y responder errores con `sendGiftError`. `giveMemberGift` devuelve `{ giftId, receiverUserId, receiverFirstName, reason, amount }`: el 201 solo expone `receiverFirstName` y `reason`.
- El `reason` entra como `string` y el servicio lo valida con `isGiftReason`; el JSON schema de la ruta debería declarar el enum de todos modos.
- Plan 15: la push va después del commit, en el punto marcado de `giveMemberGift`; hay que usar `receiverUserId` y `giftId` del resultado.
- Ningún test de la 215 corrió en local: si falla algo en CI, mirar primero `givenToday` (usa `created_at` del gift contra el día local de la sede) y el `FOR UPDATE` sobre `users`.

## Self-Check: PASSED

Archivos y commits `abb14f1b4`, `5ac4494b4` y `2f90d3d11` verificados.
