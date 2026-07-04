---
status: partial
phase: 154-alumnos-de-templo-ficaci-n-accesos
source: [154-VERIFICATION.md]
started: 2026-07-05T00:30:00Z
updated: 2026-07-05T00:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Decisión de negocio WR-04 — normalización del recargo en renovaciones

expected: Con la regla de recargo OFF, la renovación de un socio con `priceTypeApplied` heredado `credit_card` normaliza a `regular` y cobra priceRegular (no perpetúa el recargo). Con la regla ON (El Templo) nada cambia. Confirmar que ésta es la decisión de negocio deseada.
result: [pending]

### 2. Header de Alumnos — "Crear alumno" prominente

expected: "Crear alumno" es el botón primario prominente; "Nuevo en Prueba" queda outline secundario y el export como ícono. El alta abre el MemberFormDialog de siempre.
result: [pending]

### 3. Cobro desde la fila

expected: Cada fila de Alumnos tiene el ícono de cobro junto al lápiz; navega a /cobros con el socio preseleccionado en el paso Socio. Un memberId inexistente muestra notify y deja el flujo normal.
result: [pending]

### 4. Regla de precios en Configuración (owner-only)

expected: /configuracion/precios visible solo para owner; el toggle refleja el estado (El Templo: ON tras migración 0166). Con OFF: CobrosPage/AssignPlanDialog no ofrecen precio tarjeta y PlanFormDialog esconde el campo; el cobro real cobra priceRegular aunque se fuerce tarjeta.
result: [pending]

### 5. Avatar → "Categoría"

expected: Columna, filtro ("Sin categoría") y ficha del alumno dicen "Categoría"; no aparece "Avatar" ni un segundo "Segmento" en la UI de Alumnos. El dato subyacente no cambió.
result: [pending]

### 6. Niveles griegos gateados

expected: Con TEMPLO_GREEK_LEVELS activo (El Templo) la columna Nivel, el filtro y el badge de la ficha se ven como siempre; el export Excel incluye la columna Nivel. (El estado white-label OFF se valida en code review / no hay instalación para probarlo visualmente.)
result: [pending]

### 7. Suite de tests nueva/extendida pasa en CI

expected: pricing-setting.test.ts, coach-load-pricing-gate.test.ts, members.test.ts (export), lifecycle.test.ts y renewal.test.ts pasan en verde en CI al pushear.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
