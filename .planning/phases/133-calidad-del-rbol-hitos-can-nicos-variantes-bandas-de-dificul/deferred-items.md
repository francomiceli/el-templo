# Deferred Items — Phase 133

Out-of-scope discoveries logged during execution (NOT fixed; scope boundary rule).

## Plan 02 — pre-existing type errors in el-templo-admin (found 2026-06-07)

Context: el-templo-admin no tiene `vue-tsc` instalado (CI solo corre lint+build para el admin,
sin typecheck). Para verificar el plan 02 se corrió el `vue-tsc` de `el-templo-web/node_modules`.
Aparecieron errores PRE-EXISTENTES, ninguno en líneas tocadas por el plan 02:

- `src/pages/AlumnoDetailPage.vue:1148,1165` — `extractError(err)` llamada con 1 argumento pero
  la firma es `extractError(err: unknown, fallback: string)` (código de fase 131). Error genuino.
- `src/components/sessions/EditableBlockCard.vue:716` + `src/pages/SessionEditPage.vue:67` —
  mismatch del payload del emit `swap-exercise` (`blockRole` requerido en un lado, ausente en el otro).
- `src/boot/__tests__/axios-refresh-lock.test.ts` — tipos de vitest no resueltos + mocks que no
  matchean la firma de axios (4 errores; puede ser skew del vue-tsc prestado).
- `src/components/ProgramWizardDialog.vue:645`, `src/components/reports/TrialSessionsReport.vue:151,155`,
  `src/components/scheduling/SesionesDePruebaDialog.vue:250`, `src/pages/DeudasPage.vue:102`,
  `src/pages/HorariosPage.vue:501,614`, `src/utils/pdf/session-pdf-builder.ts:254,550` — errores varios.

Posible acción futura: agregar `vue-tsc` como devDep del admin + paso de typecheck en CI
(requiere aprobación del usuario para instalar dependencias).

## Plan 04 — pregunta abierta para fase 134 (registrada 2026-06-07, por diseño del plan)

**¿Un `dominado` sobre una VARIANTE ilumina su hito en el % del miembro?**

Contexto: el filtro `milestone_exercise_id IS NULL` saca las variantes del node-set del
árbol del miembro (tree-progress). El % de "reached" hoy cuenta solo nodos backbone, así
que un registro `dominado` (fase 131) sobre un ejercicio que luego es aceptado como
variante deja de contar como nodo — ni suma ni ilumina nada. Si el producto quiere que
dominar una variante "ilumine" su hito padre en el porcentaje, eso es trabajo de la fase
134 (mapear `exercise_adjustments.exercise_id` → `exercises.milestone_exercise_id` en el
branch (c) del reached). Decisión explícitamente diferida por el plan 04 (Pitfall 5 del
RESEARCH).
