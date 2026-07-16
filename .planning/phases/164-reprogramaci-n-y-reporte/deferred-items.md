# Deferred items — Phase 164

## Pre-existing flake (NOT caused by 164-03)

- **Test:** `test/reports-trial-sessions.test.ts > attended filter handles si/no/pending` (línea ~604, offset -1, no tocado por 164-03).
- **Síntoma:** `fetchAttended("false")` devuelve `[]` en vez del lead esperado cuando el suite corre entre ~21:00 y 24:00 ART.
- **Causa:** El helper `dateOffset()` computa la fecha en **UTC** (`setUTCDate`), pero el predicado del reporte usa `b.booking_date < CURDATE()` donde `CURDATE()` es **ART** (UTC-3). Cerca de medianoche UTC, `dateOffset(-1)` cae en el mismo día que `CURDATE()` → la comparación `<` excluye la fila.
- **Regla del repo relacionada:** "Test-date helper: fecha LOCAL, no UTC (CURDATE() es ART) — ver test/expire-lost-leads.test.ts".
- **Por qué diferido:** Fuera de scope de 164-03 (test preexistente, no modificado). Falla solo local por hora del día; CI corre en otra ventana horaria. Los tests nuevos de 164-03 usan offsets grandes (-3 a -30) y no son sensibles al borde.
- **Fix sugerido:** Migrar `dateOffset()` a fecha local (no UTC), alineado con `test/expire-lost-leads.test.ts`.
