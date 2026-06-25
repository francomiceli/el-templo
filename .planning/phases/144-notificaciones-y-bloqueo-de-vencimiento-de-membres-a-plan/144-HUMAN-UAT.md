---
status: partial
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
source: [144-VERIFICATION.md]
started: 2026-06-25
updated: 2026-06-25
---

## Current Test

[awaiting human testing]

## Tests

### 1. PlanExpiryDialog — ciclo diario y copy condicional

expected: Con la fecha cubierta a ≤3 días (y ≥0), al abrir/foreground la app aparece el cartel una sola vez por día. El copy varía según N: singular "1 día", "vence hoy" para N=0, plural para N=2-3. Con N>3 o renovación agendada (cobertura más allá de 3 días) NO aparece. Es salteable ("Ahora no" / cerrar) y no bloquea el uso de la app.
result: [pending]

### 2. CTA WhatsApp de PlanExpiryDialog

expected: El botón primario abre WhatsApp con el número del país del miembro (branchCountry) y el texto de renovación pre-cargado.
result: [pending]

### 3. ReservasPage — diálogo de bloqueo (COVERAGE_EXPIRED)

expected: Intentar reservar una clase presencial cuya fecha cae después de la cobertura muestra el diálogo de renovación (cartel charcoal/terracota), NO el $q.notify genérico. El CTA abre WhatsApp correctamente.
result: [pending]

### 4. Regresión flujo de reserva normal

expected: Reservar una clase dentro de la cobertura funciona normal. Otros errores de reserva (cupo lleno, etc.) siguen mostrando el notify genérico, no el diálogo de renovación.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
