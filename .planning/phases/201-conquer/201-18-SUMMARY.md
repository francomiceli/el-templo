---
phase: 201-conquer
plan: 18
subsystem: app
tags: [conquer, app, hoy, today-form, save-sheet, body-map]
requires: ["201-17"]
provides:
  - "utils/todayForm.ts: buildTodayForm, toSaveBody, counterMax, templeFilled (puras, con test)"
  - "composables/useConquerToday.ts: today, form, loading, saving, changing, error, lastSave, load, setValue, setPain, setOpeningRung, setOpeningSeries, changeStep, save, resolveCalibration, subirOpening, cleanup"
  - "components/CqBodyMap.vue: BodyFigure compartida con el tema dorado (reusable en Progreso)"
  - "components/today/: CqDayPicker, CqCounter, CqStepRow, CqExerciseCard, CqComboCard, CqSaveSheet"
  - "pages/ConquerTodayPage.vue y ruta conquer-hoy (training/conquer/hoy, query day)"
  - "Inicio: CTA 'Entrenar hoy: X' / 'Repetir un día' y cada día de Tu semana abre Hoy"
  - "API: GET /state member.home.lastByDay[].e1[].unilateral"
affects: [201-19, 201-20]
tech-stack:
  added: []
  patterns: ["hoja de guardado con su propia raíz .cq-root (el q-dialog teletransporta fuera de la página)", "desplegables nativos .cq-select"]
key-files:
  created:
    - el-templo-app/src/modules/conquer/utils/todayForm.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/todayForm.test.ts
    - el-templo-app/src/modules/conquer/composables/useConquerToday.ts
    - el-templo-app/src/modules/conquer/components/CqBodyMap.vue
    - el-templo-app/src/modules/conquer/components/today/CqDayPicker.vue
    - el-templo-app/src/modules/conquer/components/today/CqCounter.vue
    - el-templo-app/src/modules/conquer/components/today/CqStepRow.vue
    - el-templo-app/src/modules/conquer/components/today/CqExerciseCard.vue
    - el-templo-app/src/modules/conquer/components/today/CqComboCard.vue
    - el-templo-app/src/modules/conquer/components/today/CqSaveSheet.vue
    - el-templo-app/src/modules/conquer/pages/ConquerTodayPage.vue
  modified:
    - el-templo-api/src/modules/conquer/today-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/test/conquer/today-session.test.ts
    - el-templo-app/src/modules/conquer/types.ts
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/conquer/styles/conquer.scss
    - el-templo-app/src/modules/conquer/utils/format.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/format.test.ts
    - el-templo-app/src/modules/training/routes.ts
decisions:
  - "Desplegables de progresión y modo: <select> nativo con .cq-select (en vez de q-select): el menú de q-select se teletransporta fuera de .cq-root y perdería los tokens; el nativo da 44 px y el picker del sistema."
  - "La hoja de guardado lleva su propia raíz .cq-root con padding 22 px (el pie de nubes sangra con --cq-pad-x)."
metrics:
  tasks: 3 (+ el encargo del orquestador)
  commits: 5
---

# Phase 201 Plan 18: Pantalla Hoy del alumno Summary

Hoy de punta a punta (S12-2): abre en el día que toca (D-16), todo precargado con el objetivo del motor (D-18), 4 escalones Α Β Γ Ω por ejercicio con progresión, modo, ayuda por nivel y brazos rectos, combo de apertura de Toro con Subir, y al guardar la hoja con la figura dorada y la calibración (D-13 a, S12-4).

## Commits

- `4f84cce17` fix(201-18): la última marca de Inicio dice 'por lado' en los peldaños unilaterales (encargo del orquestador)
- `5365f2f8e` feat(201-18): formulario de Hoy, composable y figura dorada de Conquer
- `994ebd4b1` feat(201-18): componentes de Hoy — escalones Α Β Γ Ω, contadores, combo de apertura y hoja de guardado
- `7a661f2a5` feat(201-18): pantalla Hoy de Conquer (S12-2, D-16, D-18, D-13)
- `docs(201-18): summary del plan 18` (este archivo)

## Encargo del orquestador: `unilateral` en `HomeLastByDay`

`member.home.lastByDay[].e1[]` suma `unilateral: boolean`. Sale del peldaño con que se GUARDÓ la marca (`conquer_session_steps.rung_id` -> `catalog.rungById`), no del peldaño actual del escalón: una marca "4" hecha en archer sigue diciendo "4 por lado" aunque el alumno ya haya cambiado de peldaño. Servicio (`loadLastE1` ahora devuelve `{ value, rungId }`), `schemas.ts` (propiedad + `required`) y `ConquerHome` (`unitText(..., e1.unilateral)`). Test: el `toEqual` existente de `lastByDay[0]` suma `unilateral: false` y hay un test nuevo (`today-session.test.ts:491`) con One arm / archer en el peldaño `archer` (true) y Muscle-up (false).

## Contratos que dejan estos cambios para 201-19/20

- `useConquerToday()`: además de lo del plan, `changing` (ref, bloquea cambios de escalón/Subir en curso y desactiva los controles), `setOpeningRung(rungId)` y `setOpeningSeries(v)`. `changeStep`, `save`, `resolveCalibration` y `subirOpening` devuelven `Promise<boolean>`; el `error` queda en el composable y la página lo manda a `Notify` (solo si ya hay `today`; sin `today` se ve inline con "Reintentar").
- `resolveCalibration` quita la propuesta resuelta de `lastSave.calibration`; las `quedarse` no tienen botones (el API devolvería 409 `CONQUER_SIN_CALIBRACION`) y las `subir`/`bajar` con `toRungName === null` tampoco (sería 409 `CONQUER_TOPE_ESCALERA`).
- `CqComboCard` sirve también para el sábado: props `combo`, `title`, `rungId`, `seriesValue`, `max` (10 por defecto, 13 en el sábado), `busy`; emite `update:rung`, `update:series`, `subir`.
- `CqCounter` (`modelValue`, `min`, `max`, `unit`, `label`, `disabled`) y `.cq-select` (en `conquer.scss`) son reusables en Sábado.
- `CqBodyMap` (`primary`, `secondary`, `gender`, `height`) es lo que usa Progreso. El género sale de `useUserStore().profile.gender`.
- `shortDate(iso)` ahora vive en `utils/format.ts` (con test) y lo usan Inicio y Hoy.
- Ruta `conquer-hoy` (`training/conquer/hoy`, query `day`). La página: sin `?day=` el API manda el que toca; si la respuesta trae `dayKey === 'sabado'` hace `router.replace({ name: 'conquer-sabado' })` cuando la ruta existe y, si no, recarga con el primer día del plan. El chip de sábado del picker solo aparece con `router.hasRoute('conquer-sabado')`. **201-19 tiene que registrar la ruta con ese nombre exacto**: ni Inicio ni Hoy cambian.

## Gates corridos

- Pre-flight `node_modules`: OK.
- API (tras el fix): `npx tsc --noEmit` OK; `pnpm lint:tenant` `DISCREPANCIAS: 0`; `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` vacío; `prettier --check` OK.
- App tras cada tarea: `pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`); `vue-tsc` (binario de et-195-seo) filtrado por `src/modules/conquer|modules/training/routes` vacío.
- Los tres `verify` del plan imprimen OK (incluido `git diff origin/staging -- el-templo-app/src/components/anatomy` vacío).
- Higiene (`console.*`, `any`, `onUnmounted` en el composable, `color: rgba`, Google Fonts): sin hallazgos. `prettier --write` solo sobre archivos nuevos; `--check` sobre los ajenos (`routes.ts`, `ConquerHome.vue`, `format.*`).
- `sass` del app compiló `conquer.scss` y el `<style>` de los 9 componentes/páginas nuevos o tocados.
- Vitest NO se corrió (regla de la fase): `todayForm.test.ts`, `format.test.ts` y `today-session.test.ts` corren en CI.

## Mutantes razonados

`todayForm.ts` y `format.ts` solo importan tipos: se corrieron en Node 22 sobre copias en el scratchpad con un script que replica los `expect`; producción quedó intacta. El de la API se aplicó en el archivo real y se revirtió a mano (no estaba commiteado, no había `git checkout`); `tsc` y `prettier --check` OK tras revertir y el diff quedó igual al commit.

1. `counterMax`: el hold de reps devuelve 100 en vez de 600: el script da `FALLA hold reps 600`; en CI falla `todayForm.test.ts:149` (`['reps', 'hold', 600]`).
2. `templeFilled` cuenta también el hold: el script falla `temple 2` y `temple hold no cuenta`; en CI `todayForm.test.ts:161` (`{e1:5,e2:0,e3:3,hold:9}` -> 2 y `{hold:30}` -> 0).
3. `toSaveBody` con `if (true)` en el `opening` (lo manda siempre): el script revienta (TypeError sobre `today.opening` null); en CI `todayForm.test.ts:128` (`'opening' in body` debe ser false) y `:120` el caso con combo.
4. `shortDate` sin `Number(...)` ("05/01"): el script da `MUTANTE ATRAPADO`; en CI `format.test.ts` (`['2026-01-05', '5/1']`).
5. API: `lastE1ForDay` con `unilateral: false` fijo (compiló con `tsc`): falla `today-session.test.ts:525` (`unilateral: true` de One arm / archer en `archer`).

## Desvíos del plan

- **`<select>` nativo en vez de `q-select`** (decisión arriba). Sigue siendo un desplegable de progresión y de modo, de 44 px.
- **Encargo del orquestador** (commit propio) incluido; el plan no lo traía.
- `shortDate` se movió de `ConquerHome` a `format.ts` (DRY: lo usan Inicio y Hoy) con test.
- La hoja de guardado vive dentro del `CqSky` de la página (un solo nodo raíz para el router); el diálogo igual se teletransporta.

Ambigüedades nuevas (opción más simple):

- Hold con ejercicio unilateral: "al fallo por lado" (la spec solo dice "al fallo").
- El hint por escalón junta ambos textos en una línea: "{effortHint} · {failureHint}".
- `alreadySaved`: aviso "Ya guardaste este día hoy: si guardás de nuevo, se reemplaza" (el API sobrescribe por fecha y día).
- Cambiar de peldaño o de modo de un escalón reemplaza el valor del contador por la precarga del API (el plan decía "su valor en el form").
- Tope del contador de series del combo de apertura: 10 (el del API); el sábado usará 13 con la prop `max`.
- Calibración `bajar` en el peldaño más fácil: "ya estás en la más fácil" (la spec solo contemplaba el tope difícil).
- "Listo" llama a `store.loadState()` y navega a `/training?tab=conquer`; la tab también carga al montarse (la última carga gana por `loadSeq`).

## Trampas / notas para los planes siguientes

- `q-dialog` teletransporta su contenido fuera de `.cq-root`: cualquier hoja o diálogo de Conquer (201-19 si hay, 201-20 control físico) necesita su propia raíz `.cq-root` o pierde los `--cq-*`. `CqCloudButton` dentro de la hoja requiere `--cq-pad-x`/`--cq-pad-bottom` en el contenedor igual al padding real.
- `ConquerTab` hace `store.cleanup()` al desmontarse: al entrar a Hoy la tab se desmonta y aborta su carga; al volver se monta y carga de nuevo.
- Los `<li>` de "Tu semana" ahora contienen un `router-link.cq-home__day` (el estilo pasó al link). Los puntos de extensión `201-19/20: accesos` siguen en `ConquerHome`; el CTA de 201-18 es el último hijo (`CqCloudButton`).
- `GET /today` para el Toro con los 4 días hechos responde la vista del sábado (`exercises: []`): cualquier pantalla que consuma `TodayResponse` sin `day` debe contemplarlo (Hoy ya lo hace).
- Sin navegador no se pudo mirar la pantalla: en el UAT (201-24) revisar a 390 px el picker de 5 días de Toro, los dos desplegables por escalón, la altura de la hoja de guardado con la figura y calibración, y el menú nativo de los `<select>` en iOS con `color-scheme: dark`.

## Known Stubs

Ninguno. El chip de sábado y el redirect a `conquer-sabado` dependen de la ruta de 201-19; mientras no exista, Hoy cae al primer día del plan (documentado y deliberado).

## Self-Check: PASSED

Los 11 archivos nuevos existen y los cuatro commits de código están en `git log` (`4f84cce17`, `5365f2f8e`, `994ebd4b1`, `7a661f2a5`).
