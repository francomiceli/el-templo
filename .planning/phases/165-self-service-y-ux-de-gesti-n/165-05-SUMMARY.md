---
phase: 165-self-service-y-ux-de-gesti-n
plan: 05
subsystem: api
tags: [e2e, integration, trials, self-service, phone, state-machine, regression, vitest]

# Dependency graph
requires:
  - phase: 165-self-service-y-ux-de-gesti-n
    provides: "phoneRequired en eligibility + PHONE_REQUIRED en reserve-trial (165-01)"
  - phase: 165-self-service-y-ux-de-gesti-n
    provides: "phone por fila en el reporte de trial-sessions (165-03)"
  - phase: 163-m-quina-de-estados-autom-tica-del-lead
    provides: "reset a en_seguimiento + leadStatusSource='auto' en reserveTrialSelfService (163-03)"
provides:
  - "test de regresión del milestone: E2E que recorre register→eligibility→reserve→reporte + 5 negativos"
  - "verificación punta a punta de que el funnel 119 + los writes de 163 + el teléfono de 165 conviven"
affects: [milestone UAT visual, recupero segmentado de Perdidos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E de integración multi-tabla contra eltemplo_test cosiendo los scaffolds de 119/163/165 en un único walk"
    - "Fecha de reserva LOCAL (getDay Lun=1..Sáb=6, saltea domingo) en vez de fake timers/offsets UTC — evita el split-brain entre el Date de JS y CURDATE de MySQL (ART)"

key-files:
  created:
    - el-templo-api/test/self-service-trial-e2e.test.ts
  modified: []

key-decisions:
  - "El happy path arranca en POST /register real (D-01) y usa un slot de prueba a +3 días LOCALES (>24h, dentro de la ventana de 30) sobre un schedule cuyo dayOfWeek matchea la fecha; los negativos de teléfono usan createEligibleFreemium(phone:null) para el freemium sin teléfono"
  - "Sin fake timers: tiempo real + helper de fecha LOCAL, alineado con la regla del repo (CURDATE es ART) y con 163/164 — el reporte lista el booking futuro sin depender de CURDATE"
  - "Task 2 no tocó código fuente: el recorrido no reveló ningún bug de producto; el único fix fue de test (convención de dayOfWeek)"

patterns-established:
  - "El E2E asegura leadStatusSource='auto' tras reserve (163 D-07) además del funnel 119 y el phone de 165 — es el candado de regresión del milestone completo"

requirements-completed: [SELF-01]

# Metrics
duration: ~25min
completed: 2026-07-16
---

# Phase 165 Plan 05: E2E del funnel self-service (SELF-01) Summary

**Un único test de integración recorre el funnel self-service completo — `POST /register` (freemium) → `GET trial-eligibility` (elegible, `phoneRequired` según perfil) → `POST reserve-trial` (promueve freemium→prueba, booking `is_trial` source `self_service`, lead `en_seguimiento` source `auto`) → el lead aparece con su teléfono en `GET /api/admin/reports/trial-sessions` — más los 5 negativos clave. El recorrido NO reveló bugs de producto: el funnel 119 + los writes de 163 + el teléfono de 165 conviven; el único ajuste fue de fecha del test.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 2
- **Files modified:** 1 (1 created)

## Accomplishments
- **Happy path (DB-asserts multi-tabla):** register → freemium; eligibility → `eligible:true, alreadyBooked:false, phoneRequired:false`; reserve-trial → 201 + `users.status='prueba'`, `users.leadStatus='en_seguimiento'`, `users.leadStatusSource='auto'` (163-03), `userStatusHistory.source='self_service'`, `bookings.isTrial=1 source='self_service'`, `users.branchId` = sucursal elegida; reporte admin → el lead aparece y su fila trae `phone` (165-03).
- **5 negativos:** (1) sub activa → `eligible:false`; (2) segunda prueba → 409 (una por vida); (3) cancel self-service → revierte prueba→freemium (booking `cancelado`, user `freemium`); (4) freemium sin teléfono reservando sin teléfono → 400 `PHONE_REQUIRED` (guard antes de la tx: sin promoción ni booking); (5) freemium sin teléfono enviándolo en el body → 201 + `users.phone` persistido normalizado (últimos 10 dígitos), con `phoneRequired:true` en la eligibility previa.
- **Regresión del milestone:** el mismo walk verifica que el funnel de Phase 119, el reset/source de Phase 163 y el teléfono obligatorio de Phase 165 conviven — es el candado de regresión pedido por D-01/SELF-01.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Escribir el E2E funnel + 5 negativos (compila y typechequea)** — `586007d3` (test)
2. **Task 2: Correr el E2E y llevarlo a verde (6/6)** — `9b9b1c79` (test)

**Plan metadata:** committed por separado con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified
- `el-templo-api/test/self-service-trial-e2e.test.ts` — E2E del funnel self-service (happy path + 5 negativos), test de regresión del milestone (NEW).

## Deviations from Plan

### Ajuste de test (NO bug de producto)

**1. [Ajuste de test — fecha/convención] `dayOfWeek` de schedules es 1-6 (Lun=1..Sáb=6, sin domingos)**
- **Found during:** Task 2 (primera corrida runtime).
- **Síntoma:** `beforeEach` fallaba al crear el schedule (`body/dayOfWeek must be <= 6` y luego `must be >= 1`), dejando `scheduleId` undefined → reserve devolvía `FST_ERR_VALIDATION "scheduleId required"`. Se manifestó como "flakiness" porque la fecha de proceso rodó a un día en que `hoy+3` caía **domingo**.
- **Causa:** el helper de fecha convertía a ISO (Dom=7) pero la API de schedules acepta **1-6 (Lun=1..Sáb=6)** y NO permite domingos (el gym no abre domingo). `getDay()` de JS ya devuelve Lun=1..Sáb=6, así que la conversión sobraba y el domingo era inválido de raíz.
- **Fix:** el helper LOCAL ahora saltea el domingo (`getDay()===0 → +1 día`) y usa `getDay()` directo (Lun=1..Sáb=6), la misma convención que valida `reserve-trial` contra el schedule. **Fix acotado al test; sin tocar código fuente.**
- **Files modified:** `el-templo-api/test/self-service-trial-e2e.test.ts`
- **Commit:** `9b9b1c79`

**Bug de producto:** ninguno. El presupuesto de deviation de SELF-01 quedó sin usar en código fuente — el funnel real está sano punta a punta.

## Verification
- `pnpm tsc --noEmit` (el-templo-api) limpio.
- `pnpm vitest run test/self-service-trial-e2e.test.ts` → **6 passed (1 file)**.
- Task 2 no tocó código fuente → no hubo tests de módulo que re-correr.
- Sin migraciones nuevas. Sin dependencias nuevas. Nada pusheado; staging por ruta explícita.

## Notas / desvíos de la verificación del plan
- El plan pedía `pnpm exec eslint test/...` como gate de Task 1, pero **el-templo-api no tiene ESLint configurado** (solo los frontends: app/admin/web tienen `eslint.config.*`; el API no tiene ni config ni script `lint`). El gate real del API es `tsc --noEmit` (igual que 165-01/02, que tampoco corrieron eslint sobre el API). Se usó `tsc` como gate de compilación.

## Threat Flags

Ninguno. El test corre contra `eltemplo_test` sin superficie de ataque nueva (T-165-09/SC del plan): el único cambio fue de test, acotado al funnel self-service, cubierto por el propio E2E; sin dependencias nuevas (reusa helpers existentes); sin relajar aserciones para ocultar bugs.

## Self-Check: PASSED
