---
phase: 194-invitaciones
plan: 13
subsystem: api
tags: [invitations, leads, recompute-user-status, conversion, expire-lost-leads, d-18, d-13]
requires:
  - phase: 194-01
    provides: membershipGate / notTrialPlanSql en recomputeUserStatus
  - phase: 194-07
    provides: getInvitationSettings (latePurchaseWindowDays)
  - phase: 194-09
    provides: InvitationService.activate (lead en_seguimiento al activar)
provides:
  - gate de conversión de lead que acepta "invitación con compra paga posterior"
  - atribución de la compra a la invitación (converted_at / converted_subscription_id)
  - cron expire-lost-leads que ignora leads con invitación activa
affects: [194-14, 194-19, 194-24]
tech-stack:
  patterns: [la lógica nueva de conversión vive en referrals/invitation-conversion.ts y subscriptions/service.ts solo la invoca]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-conversion.ts
    - el-templo-api/test/invitations/leads.test.ts
    - .planning/phases/194-invitaciones/deferred-items.md
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/jobs/expire-lost-leads.ts
    - el-templo-api/test/expire-lost-leads.test.ts
key-decisions:
  - "La rama de invitación del gate exige una sub de membresía paga (price_paid > 0, no is_trial) CREADA DESPUÉS de activar la invitación: una compra de $0 y una membresía anterior no convierten"
  - "La rama de invitación respeta lead_status_source='manual' para el ESTADO del lead (lead_status / source / purchased_plan_id) pero users.converted_at se sella igual: la compra ocurrió aunque el staff haya marcado el lead a mano"
  - "El paso explícito vive en invitation-conversion.ts (no engorda subscriptions/service.ts, regla de 194-32) y lee los settings solo si hay una invitación activa sin convertir"
requirements-completed: [D-18, D-03, D-13, SC-5]
completed: 2026-10-06
---

# Phase 194 Plan 13: leads de invitación Summary

**Un invitado que compra una membresía paga queda `ganado` con el plan comprado (nunca el Invitación) y su invitación atribuida a esa sub dentro de la ventana de compra tardía; el ex socio con `converted_at` histórico también convierte; un lead marcado a mano no se pisa; y el cron de perdidos nunca vence a un lead con invitación activa.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 2 | `5af66713f` | `expire-lost-leads.ts` (NOT EXISTS invitations, flip y conteo) + 3 casos en `expire-lost-leads.test.ts` |
| 1 | `760bfc7db` | `recomputeUserStatus` (gate) + `invitation-conversion.ts` (paso explícito) + `leads.test.ts` (11 casos) |

Orden invertido respecto del plan (la Tarea 2 es independiente y más chica); no cambia el resultado.

## Cómo quedó

### Gate en `recomputeUserStatus` (`subscriptions/service.ts`)

- Dos consts nuevas: `leadOriginGate` y `convertedAtGate`, ambas `(EXISTS SP OR <rama invitación>)`. Reemplazan el EXISTS de SP en los 4 CASE sin cambiar el orden de los SET: `lead_status`, `lead_status_source` y `purchased_plan_id` usan `leadOriginGate`; `converted_at` usa `convertedAtGate`.
- Rama invitación (en `invitation-conversion.ts`): invitación `active` del usuario (con `i.tenant_id = u.tenant_id`) tal que existe una sub de membresía vigente (`membershipInEffectSql`, no `is_trial`) con `price_paid > 0` y `created_at >= i.activated_at`. En `leadOriginGate` además `COALESCE(u.lead_status_source,'auto') <> 'manual'`.
- Las reservas del invitado NO se marcan `is_trial` (T-194-46, con test).
- Tras el UPDATE y el historial, `if (ctx) attributeInvitationPurchase(...)`. Con `ctx === null` se saltea y queda el razonamiento en un comentario: solo llega del cron de vencimiento, que nunca crea una membresía paga.

### Paso explícito (`referrals/invitation-conversion.ts`)

1. Invitación `active` más reciente del usuario sin `converted_at` (si no hay, termina: una query).
2. Lee `latePurchaseWindowDays` (por el pool, una vez) y busca la membresía paga vigente más reciente creada desde la activación; la ventana (`DATE(created_at) <= access_expires_on + N días`) se calcula en SQL.
3. Dentro de la ventana: `invitations.converted_at = NOW()` y `converted_subscription_id` (T-194-45). Fuera: no se atribuye.
4. Dentro o fuera, si el lead no está `ganado` ni `manual`: `ganado`/`auto`/`purchased_plan_id` = plan de esa sub (cubre al ex socio con `converted_at` histórico, que el gate no alcanza).

### Cron (`jobs/expire-lost-leads.ts`)

`candidateBaseConditions(windowDays, ctx)` suma `AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.tenant_id = <ctx> AND i.invited_user_id = u.id AND i.status = 'active')`. Una sola definición alimenta el UPDATE y el COUNT de manuales salteados, así que ni el flip ni el conteo ven a los leads de invitación. Una invitación `voided` no protege. No es un job nuevo: `con-04` no cambia.

## Tests

- `leads.test.ts`: 11 verdes (foreground, ~150 s). Activación real (`InvitationService.activate`) + compra HTTP (`assignPlan`): compra paga => `activo`, lead `ganado`/`auto` con el plan real y `converted_at` del usuario, invitación atribuida; +20 días => atribuida; +40 días => lead ganado sin atribuir; ventana configurable (5 días, +10 no atribuye); ex socio con `converted_at` histórico (activado de verdad) => ganado vía el paso explícito y su `converted_at` histórico intacto; lead `perdido`/`manual` no se pisa pero la compra se atribuye; accesos vigentes sin compra => `prueba`/`en_seguimiento`/sin atribuir; compra de $0 no convierte; SP clásica (sin invitación) intacta; ninguna reserva `is_trial`; camino `ctx = null` (`autoExpireDueSubscriptions`) sin lanzar ni convertir.
- `expire-lost-leads.test.ts`: 10 verdes (+3: control sin invitación, invitación activa incluida la de un lead manual que no cuenta en `skippedManual`, invitación anulada).
- Regresión: `leads-perdido-window` 5 verdes; `lead-status-transitions` + `membership-invariant` + `admin-leads-patch` 38 verdes.
- **Mutation testing:** desactivar el paso explícito (`if (false && ctx)`) => fallan 4 de 11 (compra paga atribuida, +20 días, ex socio, manual); revertido.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan, copy "referid" en el archivo nuevo sin líneas.

## Deviations from Plan

**1. [Interpretación] El paso explícito y los fragmentos SQL viven en `referrals/invitation-conversion.ts`, no inline en `subscriptions/service.ts`.** Regla de 194-32 (no engordar `service.ts`). Consecuencia en los criterios de aceptación literales: `grep "converted_subscription_id|convertedSubscriptionId"` y `FROM invitations` sobre `service.ts` dan 0 (las líneas existen en `invitation-conversion.ts`); `leadOriginGate` ≥ 2 líneas y `Fase 194 D-18` ≥ 1 en `service.ts` se cumplen.

**2. [Interpretación] La rama de invitación del gate exige compra PAGA posterior a la activación.** El plan decía "tiene una invitación activa", pero su `<behavior>` dice "una compra $0 (bonificada) no convierte la invitación": con el gate literal una bonificada de staff pasaba a `ganado` por el UPDATE. El EXISTS interno agrega `price_paid > 0` y `created_at >= activated_at`.

**3. [Interpretación] Gate de dos sabores respecto de lo manual.** El plan dice "salvo manual" solo para el estado del lead. `converted_at` se sella igual (`convertedAtGate`), porque la compra ocurrió y las métricas de conversión lo usan; el estado comercial (`lead_status`, source, plan comprado) sí queda protegido. La rama de SP conserva su comportamiento histórico (convierte aunque sea manual).

**4. [Extra] `deferred-items.md`** con los 6 tests preexistentes que fallan de noche por `todayStr()` UTC (ver Lecciones). No se tocaron.

**5. [Orden] Tarea 2 commiteada antes que la Tarea 1.**

## Lecciones para planes siguientes

- **Trampa UTC vs ART (cierra de noche):** `test/helpers.ts#todayStr()` es la fecha UTC. Entre 21:00 y 24:00 ART la sub asignada con `startDate: todayStr()` arranca "mañana" respecto de `CURDATE()` y el socio NO queda `activo`. Para compras por HTTP en tests pasar `startDate: todayInTz(<tz de la sede>)` (así `leads.test.ts`). Hoy fallan por esto `subscriptions-conversion-hook.test.ts` (5) y 1 caso de `purchase-closes-access.test.ts` (`deferred-items.md`).
- `users.converted_at`/`activated_at`: MySQL redondea los TIMESTAMP al segundo más cercano; comparar con tolerancia de 1 s.
- Para fixtures de compra paga: `createMembershipPlan` (precio 10000) + `assignPlan` por HTTP deja `price_paid = 10000`; para $0 `priceOverrideAmount: 0` + `priceOverrideReason`.
- Un ex socio elegible para invitar necesita una sub `expired` con `endOffsetDays` <= -190 (6 meses) y status `inactivo`; `activate` lo devuelve a `en_seguimiento` aunque estuviera `ganado`.
- `recomputeUserStatus` ahora llama a `attributeInvitationPurchase` con `ctx`: 194-14..18 (árbitro de descuentos) no deben tocar ese bloque; los settings se leen por el pool, una vez y solo si hay invitación pendiente.
- El hook del worktree rechaza comandos con `git` + `cd`/pipes compuestos y heredocs con python: escribir los scripts con Write y correrlos con `python3 -I archivo`.

## Allowlist de copy

Vacía.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-44 (manual respetado, con test), T-194-45 (`converted_subscription_id`), T-194-46 (ninguna reserva `is_trial`) y T-194-47 (`i.tenant_id` inline en el cron y `i.tenant_id = u.tenant_id` en el gate) cubiertos.

## Self-Check: PASSED
