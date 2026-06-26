---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 02
subsystem: backend (finance — coach-load PoS)
tags:
  [
    pos-profe,
    alta-alumno,
    endpoint,
    idempotency,
    dedup-dni,
    branch-access,
    createdMemberId,
  ]
requires:
  - "148-01: AssignPlanInput { recorderRole, idempotencyKey, recorderBranchId, createdMemberId }"
  - "148-01: MemberService.createMinimalMember (nombre + apellido + DNI + sucursal)"
  - "148-01: financial_transactions.created_member_id (grabado en el insert del charge)"
  - "checkDuplicates({dni}) (members/service.ts) — ya filtra borrados"
  - "requireBranchAccess({ from: body.branchId }) (shared/branch-access.ts)"
provides:
  - "POST /admin/finance/coach-load/alta — endpoint orquestador alta+plan+cobro pendiente"
  - "MemberService wireado en el plugin coach-load-routes.ts"
affects:
  - "148-04 (tests de integración del endpoint /alta)"
  - "148-05 (frontend CargarPagoPage.vue 3er modo + useFinanceLoadApi.altaConPlan)"
tech-stack:
  added: []
  patterns:
    - "Orquestación idempotente en 2 tx encadenadas (createMinimalMember | assignPlan) con createdMemberId atómico al charge"
    - "Dedup por DNI (checkDuplicates) antes de createMinimalMember; match no-borrado ⇒ usa existente"
    - "Mapeo de precio en el endpoint: card→credit_card, else zero?→zero:regular"
    - "preHandler requireBranchAccess({ from: body.branchId }) — primer endpoint del plugin que acepta branchId"
    - "Idempotency no-op: catch isDuplicateKeyError → findByIdempotencyKey → 200"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/coach-load-routes.ts
decisions:
  - "createdMemberId solo viaja por el input de assignPlan (sin UPDATE suelto ni 3ª tx) — cierra la ventana de crash de W-1."
  - "XOR userId ↔ {firstName,lastName,dni} validada en el handler (JSON-Schema no la expresa limpio con additionalProperties:false): rama nuevo exige los 3 campos o 400."
  - "createdBy del alumno nuevo = request.user.userId (JWT, anti-spoof D-31), nunca del body."
  - "recorderBranchId = sede del profe (caja sugerida CAJA-01), NO la sede elegida del socio (que va al branchId del ledger vía assignPlan)."
  - "Respuesta incluye createdMemberId + createdNew (flag) para el ticket 'Nuevo' del frontend; es un echo, no persistencia."
metrics:
  duration: ~12min
  completed: 2026-06-26
---

# Phase 148 Plan 02: Endpoint orquestador POST /alta Summary

**One-liner:** El corazón de la Fase 148 — `POST /admin/finance/coach-load/alta` resuelve/crea el alumno (dedup por DNI), asigna plan + turnos + cobro 'pendiente' (server-derived del rol coach), pasa `createdMemberId` por el input de `assignPlan` (grabado atómicamente en el charge), todo idempotente y branch-gated (`requireBranchAccess` sobre `body.branchId`).

## What Was Built

### Task 1 — Schema /alta + wire MemberService + preHandler requireBranchAccess — `b9af4de9`

- `coachAltaSchema` inline (espejo de `coachPayPlanSchema`/`coachMiscLoadSchema`): `additionalProperties:false`, `required:[branchId,planId,paymentMethod,idempotencyKey]`, propiedades opcionales `userId`/`firstName`/`lastName`/`dni`/`zero`/`amountReceived`/`scheduleIds`/`notes`. **SIN `cashRegisterId` ni `validationStatus`** (T-148-10). `idempotencyKey` `minLength:1 maxLength:64`.
- `CoachAltaBody` tipa el body (rama "alumno existente" `userId` XOR rama "alumno nuevo" `firstName`+`lastName`+`dni`).
- `MemberService` instanciado en el closure del plugin (`new MemberService(fastify.db, fastify.log)`, igual que members/routes.ts) — NO estaba wireado en coach-load.
- Importa `PriceType` (subscriptions/types) y `requireBranchAccess` (shared/branch-access).
- Ruta `POST /alta` registrada con `preHandler: requireBranchAccess({ from: "body.branchId" })` — primer endpoint del plugin que acepta `branchId` (T-148-05). Handler stub 501 (reemplazado en Task 2).

### Task 2 — Handler /alta: orquestación idempotente con createdMemberId atómico — `25c68a82`

Orquestación en dos transacciones encadenadas (W-1):

1. **Resolver/crear alumno:**
   - `body.userId` presente → usarlo, `createdMemberId = null`.
   - Si no → exige los 3 campos del alumno nuevo (o 400 — XOR en el handler). `memberService.checkDuplicates({ dni })`; match `matchedField==='dni'` (ya no-borrado) ⇒ usa `match.id`, `createdMemberId = null`.
   - Sin match ⇒ `memberService.createMinimalMember({ firstName, lastName, dni, branchId, createdBy: request.user.userId })` (createdBy del JWT, anti-spoof D-31), corre en su propia tx; `createdMemberId = newId`.
2. **Precio:** `priceTypeApplied = paymentMethod==='card' ? 'credit_card' : (zero ? 'zero' : 'regular')`.
3. **Caja sugerida:** `recorderBranchId = await resolveRecorderBranchId(request.user.userId)` (sede del profe, CAJA-01; NO la sede elegida del socio).
4. **assignPlan:** `subscriptionService.assignPlan(memberId, { planId, branchId, startDate: hoy, priceTypeApplied, paymentMethod, scheduleIds, amountReceived, notes, recorderRole: request.user.role, idempotencyKey, recorderBranchId, createdMemberId }, request.user.userId)` — crea sub + charge 'pendiente' (coach) + bookings fixed dentro de SU tx; `createdMemberId` se graba en el MISMO insert del charge (148-01). **No hay UPDATE suelto ni 3ª tx.**
5. **Respuesta 201:** `{ subscription, transaction (findByIdempotencyKey), createdMemberId, createdNew }`.
6. **Idempotency no-op:** catch `isDuplicateKeyError` → `findByIdempotencyKey(idempotencyKey)` → 200 con el charge existente; restantes → `handleServiceError(..., "coach alta-con-plan")`.

## Verification Results

- `cd el-templo-api && pnpm exec tsc --noEmit` verde tras ambas tasks (y tras el reformateo de prettier en pre-commit).
- `grep -c '"/alta"'` == 1; `grep -c "new MemberService"` == 1.
- `grep -c "checkDuplicates\|createMinimalMember\|assignPlan\|createdMemberId"` == 23.
- `createdMemberId` aparece SOLO como declaración/asignación (createMinimalMember), dentro del input de `assignPlan`, y como echo en la respuesta — **sin UPDATE suelto ni segunda persistencia desacoplada** (T-148-23).
- Schema sin `cashRegisterId`/`validationStatus`; `additionalProperties:false`.
- Sin regresión en `pay-plan`/`misc` del mismo plugin (solo se agregó código nuevo + imports).
- Tests de comportamiento (crear-nuevo / dedup / parcial→deuda / fixed / void→cascade / idempotencia) → **148-04**, corren en CI (MEMORY: no correr suite local).

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

- T-148-05 (IDOR `body.branchId`): `requireBranchAccess({ from: "body.branchId" })` preHandler. ✓
- T-148-06 (rol de carga): módulo guard heredado (FINANCE_LOAD_ROLES). ✓
- T-148-07 (validation_status): derivado de `request.user.role` vía assignPlan, jamás del body. ✓
- T-148-08 (doble-submit): idempotencyKey + catch no-op; createMinimalMember idempotente por dni UNIQUE. ✓
- T-148-09 (spoof createdBy): `createdBy = request.user.userId` (JWT). ✓
- T-148-10 (input inválido): schema `additionalProperties:false` + `amountReceived` integer ≥0; assignPlan valida scheduleIds. ✓
- T-148-23 (createdMemberId huérfano W-1): el id viaja por el input de assignPlan → insert del charge; sin UPDATE/tx aparte. ✓

## Notes for Downstream Plans

- **148-04 (tests):** cubrir crear-nuevo (1 member + 1 charge pendiente con created_member_id), dedup contra existente (createdMemberId NULL), userId directo, parcial→deuda, fixed con scheduleIds (count erróneo→400), idempotencia (doble-submit = 1 member + 1 charge), branch out-of-scope (403). XOR: nuevo sin los 3 campos → 400.
- **148-05 (frontend):** `useFinanceLoadApi.altaConPlan(body)` → `POST /admin/finance/coach-load/alta`. La respuesta trae `createdNew`/`createdMemberId` para el ticket "Nuevo". El body acepta `userId` XOR `{firstName,lastName,dni}` + `branchId` + `planId` + `zero` + `paymentMethod` + `amountReceived?` + `scheduleIds?` + `notes?` + `idempotencyKey`.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/coach-load-routes.ts (POST /alta)
- FOUND commit b9af4de9, 25c68a82
  </content>
  </invoke>
