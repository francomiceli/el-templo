# Deferred Items — Fase 180

## 180-05: `test/level-display.test.ts` — 2 tests rotos, pre-existentes, fuera de alcance

- **Detectado en:** plan 180-05, Task 3, al correr `pnpm test` en `el-templo-app` (paso de
  verificación exigido por el plan).
- **Síntoma:** `exports the frozen tuple in declared enum order` y `TRAINING_LEVELS has exactly 5
entries` fallan — `TRAINING_LEVELS` trae 6 entradas (`kairos` incluido) contra las 5 que el test
  espera (`alfa, delta, sigma, omega, spartan`).
- **Por qué está fuera de alcance:** `src/modules/training/level-display.ts` y su test no fueron
  tocados por ningún plan de la fase 180 (último commit que los tocó es `11dcc024`, fase 99). El
  nivel `kairos` ya existe en el resto del código base (aparece en los tipos de `UserProfile` que
  usa `ReservasPage.vue`), así que el drift es anterior a esta fase — no lo causó ningún archivo
  modificado por 180-05 (`useSchedulingApi.ts`, `BranchPickerDialog.vue`, `ReservasPage.vue`).
- **Acción tomada:** ninguna (regla de scope boundary del executor — no tocar código no relacionado
  con la tarea actual). No se re-corrió la suite buscando que se arreglara solo.
- **Sugerido:** una fase/fix aparte que actualice `test/level-display.test.ts` para incluir
  `kairos` en el tuple esperado (o confirme que `kairos` no debería estar en `TRAINING_LEVELS` y
  corrija el `.ts` en su lugar).
