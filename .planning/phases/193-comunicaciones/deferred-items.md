# Deferred items — Fase 193 Comunicaciones

## 193-09: `test/level-display.test.ts` falla, pre-existente y fuera de alcance

- **Encontrado en:** Task 3 (`pnpm test` completo), 2026-09-02.
- **Síntoma:** `exports the frozen tuple in declared enum order` y `TRAINING_LEVELS has exactly 5 entries` fallan — `TRAINING_LEVELS` trae 6 entradas (`kairos` incluido) contra un test que espera 5, sin `kairos`.
- **Origen:** commit `a669156e` (`feat(kairos): completar soporte del nivel kairos...`), ya en el HEAD del worktree antes de este plan (193-01..08). Confirmado sin diff entre `2c5c257e` (base de este plan) y el HEAD de la task en `el-templo-app/src/modules/training/level-display.ts` / `el-templo-app/test/level-display.test.ts`.
- **Por qué no se corrige acá:** fuera del scope boundary del plan 193-09 (destino común de la app) — ningún archivo de este plan toca `level-display.ts` ni el nivel `kairos`.
- **Acción sugerida:** actualizar `test/level-display.test.ts` para reflejar las 6 entradas actuales de `TRAINING_LEVELS` (incluido `kairos`), en el plan/fix que corresponda a ese dominio.
