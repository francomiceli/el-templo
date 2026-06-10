---
created: 2026-06-10T00:16:39.471Z
title: Compensar días — pausa retroactiva en admin
area: api
files:
  - el-templo-api/src/modules/subscriptions/service.ts:1663 (pauseSubscription — referencia de mecánica)
  - el-templo-api/src/modules/subscriptions/service.ts:1426 (editSubscriptionStartDate — patrón de guarda por asistencias)
  - el-templo-api/src/modules/subscriptions/booking-population.ts (populateBookings — generación idempotente de reservas)
  - el-templo-admin/src/components/MemberSubscriptionTab.vue:369 (diálogo Pausar actual, al lado va el nuevo botón)
---

## Problem

Recepción necesita compensar días no entrenados cuando un alumno no pidió la
pausa a tiempo (vacaciones, viaje, lesión). Caso real: Ranieri ×2 (2026-06-09),
resuelto a mano con la migración 0149 extendiendo `end_date` 15 días. En Deport
(sistema anterior) recepción lo autoresolvía editando fechas de membresía con
motivo. Hoy el sistema no lo permite: PAUSAR solo arranca desde hoy
(`pausedAt = now`, reanudación > hoy) y cancela reservas futuras — lo opuesto a
lo que se necesita cuando la ausencia ya pasó y el alumno volvió a entrenar.

## Solution

Decisiones ya tomadas con Franco (2026-06-09, diseño cerrado):

1. **NO** editor libre de fechas y **NO** tocar el flujo de renovar (la
   renovación encadena sola desde el vencimiento corregido).
2. Botón propio **"Compensar días"** en la card de suscripción del admin
   (MemberSubscriptionTab), separado de Pausar, con modal propio (mockup
   acordado: rango Desde/Hasta + Motivo obligatorio + preview
   "Se acreditan N días: vencimiento X → Y").
3. Backend: nuevo método de servicio + endpoint. Efecto: `end_date += días
del rango`, reservas del tramo extendido vía `populateBookings`
   (idempotente), registro en `audit_log` con motivo (patrón fase 111
   subscription_cancelled). La sub queda activa sin cambio de estado;
   `pausedAt`/`resumedAt` intactos (describen pausas en vivo).
4. Validaciones: ambas fechas en el pasado y dentro del período de la sub;
   motivo obligatorio.
5. Guardas: rechazar si el miembro tiene asistencias dentro del rango (tabla
   `attendance`, mismo patrón que editSubscriptionStartDate); bloquear si
   existe renovación programada (mensaje: cancelar la renovación primero o
   compensar antes de renovar).
6. Tests de integración: caso feliz; asistencia en rango → 400; renovación
   programada → 400; rango fuera del período → 400; motivo faltante → 400;
   regeneración de reservas con turnos fijos.

Tamaño: fase chica (servicio + endpoint + tests + modal). Encarar después del
UAT pendiente de v5.0/v5.1.
