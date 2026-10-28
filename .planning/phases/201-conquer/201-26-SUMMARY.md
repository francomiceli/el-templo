---
phase: 201-conquer
plan: 26
subsystem: api, app, admin, api-tests
tags: [conquer, catalogo, anexo, modos, tope-escalera, recorte, alertas, textos, uat-h3]
requires: ["201-25"]
provides:
  - "rules.allowedModes(unit, step): modos por tipo de ejercicio (anexo §1), validados en changeStep y en el catálogo del admin"
  - "GET /today: TodayStep.modes; PUT /sessions: techo[] (anexo §9 fin_sesion_techo)"
  - "alert-text.alertText + campo text en toda BoardAlert (anexo §8, DA-13); molestia guarda detail.dayLabel"
  - "syncTopeOnRungChange (step-service): el tope avisa al LLEGAR al peldaño más difícil y se cierra al dejarlo (DA-11)"
  - "cutProposal null para Toro tras la etapa 5 + 409 CONQUER_RECORTE_NO_APLICA (DA-12)"
  - "catálogo del admin: brazosRectos por ejercicio, tablas startSteps/startStepsNovillo/startStepsTernero, holdLadderId/holdLadderCode; peldaños sin brazosRectos"
  - "app: CQ_TEXTOS (22 claves del anexo §9) y holdHelp/techoText/finisherLine; hold final elige en holdRungs; desplegable de modo = step.modes"
  - "admin: editor de ejercicio con selector Toro/Novillo/Ternero, frases de alertas, Ajustes solo con comboWeeksN"
affects: ["201-27", "201-28", "201-29", "201-30", "201-31", "201-32", "201-33", "201-34", "201-35"]
tech-stack:
  added: []
  patterns:
    - "un módulo puro nuevo (alert-text.ts, cero imports) que corre en node y se cubre desde el oráculo"
    - "frases de las alertas armadas en el API: el admin (sin vitest) solo las pinta"
    - "copy del modo en un solo objeto del app (CQ_TEXTOS): ningún string del anexo se duplica en componentes"
key-files:
  created:
    - el-templo-api/src/modules/conquer/alert-text.ts
    - el-templo-api/test/unit/conquer-alert-text.test.ts
  modified:
    - el-templo-api/src/modules/conquer/{rules,step-service,today-service,catalog-admin-service,schemas,alerts-service,board-service,alert-view,ficha-service,cuts-service,session-service,combos,calibration-service}.ts
    - el-templo-api/test/conquer/{oracle-check.mjs,_helpers,catalog-admin,steps-change,today-session,subir,alerts,board,recortes,ficha,levels}.test.ts
    - el-templo-api/test/unit/conquer-rules.test.ts
    - el-templo-app/src/modules/conquer/{types,utils/format}.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/{format,todayForm}.test.ts
    - el-templo-app/src/modules/conquer/components/ConquerBlocked.vue
    - el-templo-app/src/modules/conquer/components/today/{CqExerciseCard,CqStepRow,CqComboCard,CqSaveSheet}.vue
    - el-templo-app/src/modules/conquer/pages/{ConquerLevelsPage,ConquerTodayPage,ConquerSaturdayPage}.vue
    - el-templo-admin/src/{types/conquer,utils/conquer-format}.ts
    - el-templo-admin/src/components/conquer/{ConquerBoard,ConquerAlertActions,ConquerCatalog,ConquerExerciseEditor,ConquerLadderEditor,ConquerSettings}.vue
    - .planning/phases/201-conquer/201-UAT.md
decisions:
  - "DA-10..DA-14 del plan adoptadas tal cual (modos, tope al llegar, Toro sin paso 6, frases de alertas, textos del anexo)."
  - "Mensaje del 409 al desactivar el arranque de los combos: 'El peldaño \"X\" es el arranque de los combos: no se puede desactivar' (el plan dice 'Es el arranque de los combos'; el contenido es el mismo, los tests chequean 'arranque de los combos')."
  - "El mensaje del 409 de arranque ahora nombra el nivel: '... es un escalón de arranque de \"Y\" (Toro|Novillo|Ternero): ...'. El primer nivel que lo usa gana (Toro, Novillo, Ternero)."
  - "applyRungChange cambió de firma: (tx, ctx, mctx, exercise, stepRow{id,step,rungId}, newRungId). 'today' sale de mctx.today."
  - "El tablero (ConquerBoard) también muestra 'Toro no tiene más pasos de recorte: escribile' en molestia/caída sin propuesta (NO_CUT_TEXT, compartido con la ficha)."
  - "CqStepRow sigue sin mostrar el desplegable de modo en el hold final (ya era así): con un solo modo en E1-E3 (isométricos) el desplegable queda deshabilitado."
  - "201-UAT.md: además de sumar los ítems pedidos, se actualizaron las filas viejas de §4 que hablaban de offsets en Ajustes, brazos rectos por peldaño y Toro con paso 6 (quedaban falsas tras 201-25/26)."
metrics:
  tasks: 4 de 4
  commits: 7 (+ este docs)
  completed: 2026-10-22
---

# Phase 201 Plan 26: Reglas, textos y admin del anexo de Nacho Summary

Segunda parte del hallazgo 3: el API valida los modos del anexo §1, el tope de escalera avisa al llegar, Toro no tiene el paso 6 del recorte, cada alerta trae su frase con datos (§8), el guardado avisa los techos, el app usa los textos del anexo §9 en un solo lugar y el admin edita las tres tablas de arranque y la marca de brazos rectos por ejercicio. No hay migración nueva ni rutas nuevas (manifiesto en 515).

## Commits

- `42e285359` feat(201-26): modos por tipo de ejercicio y catálogo del admin con tablas por nivel (§1, §3 del anexo)
- `1bba9c0a6` test(201-26): modos del anexo §1, tablas por nivel y catálogo del admin sin marca por peldaño
- `2ffd81bd3` feat(201-26): tope al llegar, recorte del anexo y frases de alertas con datos (§8)
- `4bf20a489` test(201-26): tope al llegar, Toro sin paso 6, frases de alertas y techo al guardar
- `bc71b08e6` feat(201-26): textos del anexo, modos y hold final en Hoy del app (§9)
- `c68964cdd` feat(201-26): admin de Conquer con el catálogo del anexo y alertas con frase
- `82a8b2d20` docs(201-26): validaciones de Nacho del catálogo en el UAT

## Contratos nuevos

- `rules.allowedModes(unit, step)`: `hold` o unidad `s` -> `["hold"]`; si no `["completa","negativa"]`. `changeStep` (alumno y corrección del coach) responde 400 `CONQUER_MODO_INVALIDO` si el modo está fuera de la regla **y** es distinto del modo actual del escalón (dato viejo tolerado). El mensaje del hold se conserva ("El hold final siempre se hace en modo hold"); para el resto: "Ese modo no corresponde a este ejercicio".
- `GET /today` y `PUT /steps`: `steps[].modes` (modos permitidos y, al final, el actual si es un dato viejo fuera de la regla).
- `PUT /sessions`: `techo: { exerciseName, step: "e1"|"e2"|"e3" }[]` (escalones del día con estado `techo1` con las marcas ya guardadas; el sábado `[]`).
- `BoardAlert.text: string` en tablero, ficha y `PATCH /alerts/:id`. La molestia guarda `detail.dayLabel` ("Plancha", "Sábado"); las viejas sin `dayLabel` caen al `dayKey` con mayúscula inicial.
- `cutProposal`/`ficha.cutProposal`: `null` para Toro con `cutStage >= 5`; `alert.proposal` también `null`. `POST /recortes` con `bajar_escalon` de un Toro: 409 `CONQUER_RECORTE_NO_APLICA` (después del 404 de la alerta ajena, antes de tocar nada).
- Catálogo del admin: `ExerciseAdminView` suma `holdLadderId`, `holdLadderCode`, `brazosRectos`, `startStepsNovillo`, `startStepsTernero`; `RungAdminView` pierde `brazosRectos`; `POST /ladders/:id/rungs` body `{ name, unilateral }`; `PUT /rungs/:id` descarta `brazosRectos` (un admin viejo que mande solo eso recibe 400 por body vacío); `PUT /exercises/:id` acepta `brazosRectos`, `startStepsNovillo`, `startStepsTernero` (todo o nada: si una de las tres tablas es inválida no cambia nada).
- `validateStartSteps(raw, owner, activeCodesByLadder)`: cada escalón se valida contra la escalera de SU escalón (`stepLadderId`) y contra `allowedModes`. `assertNotInStartSteps` mira las 3 tablas y `ladder_id`/`hold_ladder_id`, y además el `straddle` de la escalera `palanca` (arranque de los combos).
- `syncTopeOnRungChange` (step-service): lo llama `applyRungChange` (changeStep, Subir, calibración, recorte `lowerStep`).
- App: `CQ_TEXTOS` (22 claves), `holdHelp(level)`, `finisherLine`, `techoText`, `calibrationText` nuevo; `TodayExercise.holdRungs`, `TodayStep.modes`, `SaveSessionResponse.techo`; `TodayRung` sin `brazosRectos`.
- Admin: `AdminExercise` con los campos nuevos, `AdminRung` sin `brazosRectos`, `BoardAlert.text`, `FichaResponse.cutProposal | null`, `ConquerSettings`/`Ranges`/`Patch` solo `comboWeeksN`, `NO_CUT_TEXT` y `alertActionKind(kind, cutKind | null, ...)` con la acción `sin_recorte`.

## Tests que cambiaron por DA-11 / DA-12 y por qué

- `subir.test.ts` "A2: la alerta de tope se auto-resuelve si el escalón deja de estar en subir..." (DA-11): guardar sin pedir subir ya NO cierra la alerta. Se reescribió como "guardar sin pedir subir no cierra la alerta; el coach la resuelve y el sistema no la reabre" y el auto-resolver/reabrir pasó a "bajar el escalón a mano auto-resuelve y volver al tope la reabre".
- `recortes.test.ts`: "de a un paso" ahora espera `cutProposal` null tras la etapa 5; los dos tests de `bajar_escalon` que usaban Toro (hold de Planche press y de Fondo a pelícano) pasaron a Novillo (patcheando el hold un peldaño arriba para poder bajarlo); nuevos tests del 409 de Toro.
- `ficha.test.ts`: `cutProposal` nullable; test de Toro con etapa 5.
- `catalog-admin.test.ts`: 20 escaleras (no 8), `planche_press` en su escalera (no `palanca`), `inUse` y el 409 de arranque sobre `planche_hold` (la 0293 manda), sin `brazosRectos` en peldaños ni en payloads, restauración de las columnas nuevas.
- `today-session.test.ts`: el finisher esperado era el de la 0292 ("Tuck planche hold o lean...") y la 0293 lo cambió: quedaba rojo desde 201-25. Ahora "Tuck planche hold o planche lean, 20–30 s".
- `alerts.test.ts`/`board.test.ts`: `detail.dayLabel`, `text` de cada tipo.

## Mutation testing

Corridos de verdad (módulos puros, copia en el scratchpad, `oracle-check.mjs` o script de node):

1. `allowedModes` devolviendo los 3 modos -> `REGLAS FALLA (4)`: `allowedModes s e1/e3`, `reps hold`, `s hold` (oracle-check.mjs sección REGLAS; en CI, `test/unit/conquer-rules.test.ts` `it.each` de `allowedModes`).
2. `alertText` de molestia con `dayKey` en vez de `dayLabel` -> `REGLAS FALLA (1): alertText molestia ... "plancha" != "Plancha"` (en CI, `conquer-alert-text.test.ts:93`, el `it.each` contra el anexo).
3. `cutProposal("toro", 5)` devolviendo `bajar_escalon` -> `REGLAS FALLA (2): cutProposal toro 5 / toro 7` (en CI también `conquer-rules.test.ts:134`, `recortes.test.ts:174` y `:362`, `ficha.test.ts` "Toro con recorte 5").
4. App (`format.ts` en el scratchpad con `node --experimental-strip-types`): `holdHelp('ternero')` con el texto de Toro -> falla; `calibrationText` sin el destino -> falla `subir con destino`; una tilde menos en `leyenda_milon` -> falla; `techoText` con `{n}` = "e2" -> falla. En CI: `format.test.ts:75` (`it.each` de CQ_TEXTOS), `:159` (holdHelp), `:177` (techoText), `:213` (calibrationText).

Razonados leyendo el test (no se corrieron: dependen del API con base):

5. `validateStartSteps` validando el hold contra `ladderId` -> falla `catalog-admin.test.ts:1063` (`pike_elevado` debería ser 400) y `:1065` (`vertical_en_pared` debería ser 200).
6. `assertNotInStartSteps` sin `assertNotComboStart` -> falla `catalog-admin.test.ts:795` (el `straddle` de `palanca` daría 200).
7. `changeStep` sin tolerar el modo viejo (quitar `body.mode !== current.mode`) -> falla `steps-change.test.ts:450` (`mismoModo` esperaba 200).
8. `syncTopeOnRungChange` sin auto-resolver el peldaño anterior -> falla `subir.test.ts:481` (`resuelta`).
9. Volver a emitir el tope solo por estar en el tope (sin subir) -> falla `subir.test.ts:399` (el Toro recién activado tiene que tener `[]` de alertas).
10. `techo` con `estado === "subir"` -> fallan `today-session.test.ts:355` (esperaba `[{ exerciseName: "Planche press", step: "e2" }]` y llegaría `[]`) y `:383` (esperaba `[]` con dos techos seguidos y llegaría el escalón).

## Gates corridos

- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK / SEMILLA OK / MOTOR OK (14785 casos) / REGLAS OK / ANEXO OK.
- API: `npx tsc --noEmit` limpio; `pnpm lint:tenant` DISCREPANCIAS 0; `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/029)"` vacío; `prettier --check` limpio sobre `src/modules/conquer/*.ts`, `test/conquer/*.ts`, `test/unit/conquer-*.ts`.
- App: `pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`); `vue-tsc` sin errores de `src/modules/conquer` (solo el preexistente `src/router/routes.ts(139,29) TS7016`).
- Admin: `pnpm lint` 0 errores (warnings preexistentes ajenos); `vue-tsc` sin errores en `components/conquer`, `types/conquer`, `utils/conquer-format` (el filtro `grep conquer` también atrapa el nombre del worktree: aparece el preexistente `utils/pdf/session-pdf-builder.ts(224,11) 'vfs'`, ajeno).
- Higiene (`console.*`, `any`, `fonts.googleapis`, colores `primary`/`info`): sin hallazgos. `styles/` y `src/components/anatomy/*` sin cambios.
- Tests de vitest: NO corridos (regla del proyecto). Escritos: ver "Tests que cambiaron".
- `git grep startOffset` en api/test, app y admin: solo `el-templo-api/test/conquer/settings.test.ts` (líneas 197, 206, 216, 293), que prueban justamente que las claves viejas se ignoran o se rechazan (201-25). El resto (`startOffsetDays` de invitaciones/suscripciones) es otra cosa.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `today-session.test.ts` esperaba el finisher de la 0292**
- **Found during:** Tarea 1 (barrido de residuos de 201-25 para dejar CI en verde).
- **Issue:** `expect(body.finisher).toBe("Tuck planche hold o lean, 20–30 s")`, pero la 0293 lo pasó a "Tuck planche hold o planche lean, 20–30 s".
- **Fix:** el test espera el finisher del anexo.
- **Commit:** 1bba9c0a6.

**2. [Rule 3 - Bloqueo] `patchConquerStep` no podía fijar un modo viejo; `TodayStepBody` sin `modes`; `FichaBody.cutProposal` no nullable; `BoardAlertBody` sin `text`**
- **Fix:** helpers de test ampliados (`patchConquerStep({ mode })`, `modes`, `text`, `cutProposal | null`, `techo`, `shortDateText`).
- **Commits:** 1bba9c0a6, 4bf20a489.

**3. [Rule 2 - Faltante] El tablero también tiene que decir que Toro no tiene recorte**
- La ficha ya lo decía por el plan; el tablero mostraba la alerta de molestia sin nada al no haber propuesta. Se agregó la misma frase (`NO_CUT_TEXT`) en `ConquerBoard`.
- **Commit:** c68964cdd.

### Otros

- `useConquerAdminApi.ts` estaba en `files_modified` pero no necesitó cambios: sus firmas usan los tipos que sí cambiaron.
- `ConquerCatalog` calcula la escalera de hold con `holdLadderOf` (la propia o, sin ella, la de E1-E3) y se la pasa al editor.
- El hold final sigue sin desplegable de modo en `CqStepRow` (como antes).
- **Error propio, ya corregido:** un `git checkout -- rules.ts` para revertir un mutante borró mi edición sin commitear de `allowedModes`; la rehice antes de seguir. Ver lecciones.

## Trampas para los planes 27-35

1. **Todo el copy del modo vive en `CQ_TEXTOS` (`utils/format.ts`).** La guía introductoria y el rediseño visual no deben duplicar esos strings: importarlos. `estado_subir` NO está (el chip dice "Subir de progresión"). Si Nacho cambia un texto, se cambia ahí y en `format.test.ts` (que lo tiene copiado a mano).
2. `CqComboCard` tiene la prop opcional `hint`; `CqSaveSheet` la prop `techo`; `CqExerciseCard` pinta tres notas (`ayuda_carga`, `holdHelp(level)` y, si algún escalón es por lado, `ayuda_unilateral`) con la clase `cq-ex__note` + `cq-sub`. El plan 26 NO tocó estilos: la estética B puede reemplazar esas clases.
3. `TodayExercise.rungs` es la escalera de E1-E3 y `holdRungs` la del hold final: cualquier selector nuevo de peldaño (guía, rediseño) tiene que elegir cuál usar por escalón.
4. `TodayStep.modes` lo manda el API: el app no tiene regla de modos propia. En el admin sí hay una copia (`modeOptions` del editor de ejercicio) porque el admin no puede consultar al API por ellas antes de guardar; el API valida igual (400).
5. `BoardAlert.text` ya viene armado: no reconstruir frases en el admin ni en el app.
6. El tope avisa al LLEGAR (DA-11): un test o un flujo nuevo que mueva un escalón E1-E3 al peldaño más difícil (Subir, calibración, cambio a mano o recorte) ahora abre una alerta `tope_escalera`. Un Toro recién activado NO la tiene.
7. Un `PUT /exercises/:id` con una tabla inválida no cambia nada (todo o nada); el editor del admin manda solo las tablas que cambiaron.
8. En las tablas del anexo Planche hold y Front lever hold son `unit = 's'`: sus E1-E3 son `hold`. Un test que quiera `completa`/`negativa` tiene que usar un ejercicio de reps.
9. `oracle-check.mjs` REGLAS ahora importa `alert-text.ts`: ese archivo no puede tener imports ni `enum`/`namespace`.

## Para el orquestador

- **No hay migración nueva** (0293 sigue siendo la última de la fase) y no hay nada que aplicar en local por este plan. Para ver las tablas de Novillo y Ternero del anexo hay que activar un alumno NUEVO.
- Sigue pendiente de verificar en CI: todo lo de vitest (no se corrió). Lo más delicado: `subir.test.ts` (nuevos casos de DA-11 con `patchConquerStep` + historial), `catalog-admin.test.ts` (restauración de columnas) y `today-session.test.ts` (techo con historial de E2 en `[6, 7]`).
- Qué mirar a ojo en el admin (también en `201-UAT.md` §4): selector Toro/Novillo/Ternero del editor, hold con su escalera, modos deshabilitados en isométricos, mensaje del 409 de combos.

## Lecciones nuevas

- **Revertir mutantes de archivos sin commitear:** `git checkout -- <archivo>` borra TODA la edición no commiteada de ese archivo, no solo el mutante. Para archivos con cambios propios, copiar a `scratchpad/` antes (`cp`), mutar, y restaurar con `cp` (verificando con `git diff`).
- `fast-json-stringify` acepta `type: ["object", "null"]` con `required` (la ficha lo usa para `cutProposal`).
- `autoResolveEventAlert` + `upsertEventAlert` con la misma clave permiten reabrir una alerta que cerró el sistema (el tope vuelve a abrirse al volver al peldaño), pero no una que cerró el coach.
- `prettier --write src/modules/conquer/*.ts` es seguro en el API (todos los archivos ya estaban formateados); en el app/admin pasarlo solo por archivo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-94 (modo fuera de regla) y T-201-95 (tabla con peldaño ajeno) mitigados con `allowedModes` y `validateStartSteps` por escalera del escalón y `tenantWhere`; T-201-98 con el 409 del arranque de los combos; T-201-97 aceptado (la frase solo trae nombre de pila, fecha y ejercicio).

## Self-Check: PASSED
