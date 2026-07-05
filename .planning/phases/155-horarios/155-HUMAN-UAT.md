---
status: partial
phase: 155-horarios
source: [155-VERIFICATION.md]
started: 2026-07-05T03:30:00Z
updated: 2026-07-05T03:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Clases simultáneas en la grilla

expected: Admin → Horarios: crear dos clases de actividades DISTINTAS a la misma hora/sucursal (ej. Musculación 10-11 y Funcional 10-11) — ambas aparecen apiladas en la misma celda; ninguna desaparece.
result: [pending]

### 2. Rechazo de solape de la misma actividad

expected: Intentar crear una segunda clase de la MISMA actividad solapada se rechaza con mensaje que nombra la actividad.
result: [pending]

### 3. Click-para-crear desde celda vacía

expected: Click en celda vacía abre "Crear horario" con sucursal/día/hora precargados y editables; permite crear una actividad inline con Cupo (ej. 8).
result: [pending]

### 4. Click por slot puntual (desktop)

expected: Click en una de las clases apiladas abre el detalle/borrado de ESA clase, no de la otra simultánea.
result: [pending]

### 5. Campo Cupo en Actividades

expected: Editar una actividad y setear/limpiar el Cupo — vacío = hereda la sucursal; el valor persiste al reabrir.
result: [pending]

### 6. Member app con simultáneas

expected: Reservas en un día con dos clases a la misma hora muestra las dos cards; el cupo refleja el de la actividad (menor al de la sucursal si se configuró).
result: [pending]

### 7. Vista mobile del admin

expected: Con ancho de teléfono, en el listado por día con dos simultáneas: tocar cada una abre el detalle de ESA clase; el modo "Eliminar horario" selecciona el slot correcto.
result: [pending]

### 8. Suite de tests pasa en CI

expected: 155-horarios.test.ts (simultaneidad, cupo efectivo, ABM, reactivación WR-01, bordes de cupo, grilla con simultáneas) en verde en CI al pushear.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
