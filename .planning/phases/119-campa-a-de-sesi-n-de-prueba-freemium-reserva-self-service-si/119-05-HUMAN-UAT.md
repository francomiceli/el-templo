---
status: partial
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
source: [119-05-SUMMARY.md]
started: 2026-06-02T02:41:06Z
updated: 2026-06-02T02:41:06Z
---

## Current Test

[testing paused — 6 items outstanding (device/emulator verification deferred from Task 3 blocking checkpoint)]

## Tests

### 1. Estado 1 (muro) sin cambios

expected: Un usuario NO elegible (ya tiene plan presencial o ya usó la sesión de prueba) abre Reservas y ve el muro "Activá tu plan" intacto, sin el flujo de prueba.
result: [pending]
blocked_by: physical-device
reason: Requiere build nativa + fixture de usuario no elegible en device/emulator.

### 2. Estado 2 (modo reservar prueba)

expected: Un freemium elegible abre Reservas y ve el banner "Tu sesión de prueba gratis", el selector de sede primero (placeholder "Elegí una sede para ver los horarios"), la grilla de 30 días con chevron_right deshabilitado al pasar +30d, y NINGÚN control de cancelar.
result: [pending]
blocked_by: physical-device
reason: Requiere build nativa + fixture freemium elegible en device/emulator.

### 3. Estado 3 (prueba reservada)

expected: Al reservar un slot, el diálogo muestra la copy "Es tu única sesión de prueba, no se puede cancelar ni cambiar"; al confirmar, la página pasa al estado "Tu sesión de prueba está reservada" con fecha + sede + dirección, sin controles de reservar/cancelar (solo link opcional de WhatsApp).
result: [pending]
blocked_by: physical-device
reason: Requiere build nativa + fixture freemium elegible en device/emulator.

### 4. Reserve flow end-to-end

expected: Tocar un slot en modo prueba y confirmar dispara reserveTrial(scheduleId, date, branchId) contra POST /members/scheduling/reserve-trial; la UI transiciona del estado 2 al estado 3 con la confirmación.
result: [pending]
blocked_by: physical-device
reason: Requiere build nativa + backend con fixture elegible.

### 5. Deep link app.eltemplo.org/r/trial

expected: Abrir https://app.eltemplo.org/r/trial?t=<cualquiera> en device/emulator. CON la app nativa instalada: abre la app nativa en la pantalla de Reservas trial (token ignorado para auth, D-21). SIN la app nativa instalada: abre el web app de app.eltemplo.org (NO el landing eltemplo.org), con el CTA de WhatsApp como fallback robusto.
result: [pending]
blocked_by: physical-device
reason: App Links/Universal Links requieren device/emulator real + dominio sirviendo los .well-known. Nota: la auto-verificación de Android App Links además depende de los SHA-256 reales en assetlinks.json (TODO deployer) y de que /.well-known/\* se sirva como JSON estático (TODO deployer).

### 6. Warm brand check (SIN azul)

expected: La pantalla de Reservas en modo prueba y la confirmación usan paleta cálida (terracotta/cream, Sandy Beige #E5D9C8, Olive Stone #8A8472, $primary terracotta, $positive check) — SIN azul en ninguna parte.
result: [pending]
blocked_by: physical-device
reason: Verificación visual sobre build nativa.

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 6

## Gaps

<!-- Vacío: sin issues reportados. Estos ítems están DIFERIDOS (no fallados). -->
