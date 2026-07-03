---
status: partial
phase: 151-registrar-cobro-pagos-cobros
source: [151-VERIFICATION.md]
started: 2026-07-03T18:20:00Z
updated: 2026-07-03T18:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Recorrido visual completo del wizard de 4 pasos Cobros (desktop y mobile)

expected: Los pasos fluyen visualmente según 151-UI-SPEC.md — header de progreso, transiciones slide, panel resumen sticky en desktop, colapso responsive en mobile, diálogo de abandono, sin layout shift
result: [pending]

### 2. Alta de socio existente de una sede DISTINTA a la del operador (fix CR-01)

expected: El selector de Sede aparece en el paso 2 antes de la grilla de planes para CUALQUIER alta (socio existente o alumno nuevo), es editable, y CobroResumen muestra la fila "Sede" con el nombre elegido antes de Confirmar
result: [pending]

### 3. Alumno nuevo + intento de "Cobro suelto" / "Renovar plan vigente" (fix WR-01)

expected: Las opciones renew/misc se muestran atenuadas/deshabilitadas con el hint "Solo para socios existentes"; solo "Asignar plan nuevo" es clickeable; no hay forma de llegar a un Confirmar permanentemente bloqueado sin explicación
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
