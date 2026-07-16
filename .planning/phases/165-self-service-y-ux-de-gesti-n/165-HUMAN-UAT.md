---
status: partial
phase: 165-self-service-y-ux-de-gestion
source: [165-VERIFICATION.md]
started: 2026-07-16T17:20:00Z
updated: 2026-07-16T17:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Link de WhatsApp del reporte de SP resuelve al contacto correcto (dispositivo real)
expected: En Reportes → Sesiones de Prueba, el link de WhatsApp de un lead con celular AR guardado como `1122334455` abre `https://wa.me/5491122334455`, y uno con teléfono ES guardado como `+34612345678` abre `https://wa.me/34612345678`. En ambos casos WhatsApp (web o mobile) abre con el contacto correcto precargado — no "número no está en WhatsApp" ni contacto equivocado.
result: [pending]

### 2. Diálogo de teléfono en la reserva de prueba de la app (UX en dispositivo real)
expected: Como freemium sin teléfono cargado: Reservas → elegir turno de prueba → el diálogo muestra el input de teléfono con teclado `tel`. Con <6 dígitos el botón de confirmar queda deshabilitado y la regla inline avisa en español; con un teléfono válido la reserva se completa y el teléfono queda persistido (con prefijo país si lo tenía).
result: [pending]

### 3. "Ver ficha" desde el reporte + aviso del corrimiento de columnas del CSV (IN-02)
expected: (a) "Ver ficha" en una fila del reporte navega a la ficha correcta del lead (`/alumnos/:userId`) con edición/asignación de plan disponibles. (b) Si alguien consume el CSV de Sesiones de Prueba por posición fija de columnas, avisarle que "Teléfono" se insertó como 2ª columna y todo lo posterior a "Lead" se corrió un lugar a la derecha.
result: [pending]

### 4. Variedad real de formatos de teléfono (alta en puerta y self-service)
expected: Con entrada real de staff/leads (espacios, guiones, paréntesis, variantes internacionales más allá de AR/ES): los teléfonos con ≥6 dígitos se aceptan y quedan guardados de forma usable; la basura sin dígitos se rechaza con mensaje claro (409 accionable en admin, 400 PHONE_REQUIRED en self-service).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
