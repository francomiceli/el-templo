---
status: partial
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
source: [156-VERIFICATION.md]
started: 2026-07-05T07:30:00Z
updated: 2026-07-05T07:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Decisión de negocio WR-06 — boarding pass en cambio inmediato de plan

expected: `changePlanNow` ignora el boarding pass (bug PRE-EXISTENTE, fuera del diff de 156, diferido): un cambio inmediato con pase cobra sin consumirlo. Decidir si se corrige en una fase/hotfix posterior o se acepta.
result: [pending]

### 2. Renames de superficie

expected: El nav muestra "Planes de pago" y "Rutinas de entrenamiento" (subcategoría); las rutas /planes y /programas siguen funcionando; títulos de página coherentes. Para El Templo las rutinas se ven; el flag `TEMPLO_TRAINING_ROUTINES` apagado las esconde.
result: [pending]

### 3. Toggle "Precio Zero" en Configuración → precios

expected: Segundo toggle junto al de recargo tarjeta (owner-only). El Templo: ON tras migración 0168. Con OFF: CobrosPage esconde el toggle Zero, AssignPlanDialog no ofrece la opción ni el boarding pass, PlanFormDialog esconde el campo priceZero (y el submit defaultea 0).
result: [pending]

### 4. Gate Zero server-side

expected: Con Zero OFF, forzar priceType 'zero' por API (assign/renovación/cambio programado con boarding pass) persiste 'regular' con el precio correspondiente. (Cubierto por zero-price-gate.test.ts en CI; smoke visual opcional.)
result: [pending]

### 5. Multi-programa por plan

expected: PlanFormDialog permite elegir varios programas (chips) cuando "todos los programas" está apagado; guardar persiste; prender "todos" NO borra la lista guardada; un programa inexistente/Foundation-only da error visible. Un socio asignado a un plan con lista queda enrolado en esos programas (y no en Foundation).
result: [pending]

### 6. Regresión de precios (PLAN-04)

expected: Editar el precio de un plan NO crea plan nuevo ni cambia lo cobrado histórico; una asignación nueva usa el precio nuevo; la renovación hereda el precio pagado (comportamiento deliberado, assertado en test). Confirmar en CI que plans-crud.test.ts pasa.
result: [pending]

### 7. Suites de tests de la fase en CI

expected: zero-price-setting.test.ts, zero-price-gate.test.ts, plans-crud.test.ts, plan-programs-access.test.ts en verde al pushear.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
