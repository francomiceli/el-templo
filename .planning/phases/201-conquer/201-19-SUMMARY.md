---
phase: 201-conquer
plan: 19
subsystem: app
tags: [conquer, app, progreso, subir, sabado, combos, sparkline]
requires: ["201-18"]
provides:
  - "utils/progressView.ts: sparklinePoints, accuracyText, deltaText, sessionsText, SPARK_CEILING, SPARK_PAD, subirStepKey/subirComboKey/calibrationKey (puras, con test)"
  - "utils/todayForm.ts: push/pull en TodayForm, body del sábado (sin exercises ni opening), SATURDAY_DAY_KEY, SATURDAY_MAX_SERIES, saturdayComboTitle"
  - "utils/format.ts: calibrationText, canResolveCalibration (compartidas por la hoja de Hoy y Progreso)"
  - "composables/useConquerProgress.ts: progress, loading, busyKey, error, load, subir, subirCombo, resolveCalibration, cleanup"
  - "composables/useConquerToday.ts: + rejected, setSaturdayRung, setSaturdaySeries, subirSaturday"
  - "components/progress/: CqSparkline, CqSubirCard, CqExerciseProgress"
  - "pages/ConquerProgressPage.vue (ruta conquer-progreso) y pages/ConquerSaturdayPage.vue (ruta conquer-sabado)"
  - "Inicio: fila-enlace Progreso; el sábado de Toro y el CTA van a conquer-sabado"
affects: [201-20, 201-24]
tech-stack:
  added: []
  patterns: ["busyKey por acción: spinner solo en el botón tocado y el resto bloqueado", "rejected: un 4xx al cargar no se reintenta, se avisa y se vuelve a la tab"]
key-files:
  created:
    - el-templo-app/src/modules/conquer/utils/progressView.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/progressView.test.ts
    - el-templo-app/src/modules/conquer/composables/useConquerProgress.ts
    - el-templo-app/src/modules/conquer/components/progress/CqSparkline.vue
    - el-templo-app/src/modules/conquer/components/progress/CqSubirCard.vue
    - el-templo-app/src/modules/conquer/components/progress/CqExerciseProgress.vue
    - el-templo-app/src/modules/conquer/pages/ConquerProgressPage.vue
    - el-templo-app/src/modules/conquer/pages/ConquerSaturdayPage.vue
  modified:
    - el-templo-app/src/modules/conquer/utils/todayForm.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/todayForm.test.ts
    - el-templo-app/src/modules/conquer/utils/format.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/format.test.ts
    - el-templo-app/src/modules/conquer/composables/useConquerToday.ts
    - el-templo-app/src/modules/conquer/components/today/CqSaveSheet.vue
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/training/routes.ts
decisions:
  - "Subir de combo no devuelve ProgressResponse (solo { combo }): useConquerProgress.subirCombo relee GET /progress dentro de la misma acción para que `comboSubir` quede al día."
  - "Un 409 en una acción de Progreso deja el mensaje del API en `error` y relee el progreso en silencio (la pantalla pudo quedar vieja)."
  - "calibrationText y canResolveCalibration salen de CqSaveSheet a format.ts (DRY con Progreso)."
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 19: Progreso y Sábado Summary

Progreso con KPIs, "Hoy toca subir" (escalones y combos de Toro) con el botón Subir sin aprobación del coach, calibraciones pendientes, la figura de la semana (solo zonas trabajadas) y el detalle por escalón con la curva del E1; y la pantalla Sábado de Toro (entrada en calor, combos push y pull, molestia, Guardar sábado). Ambas alcanzables desde Inicio (S12-5, S12-4, S12-3, D-13 b).

## Commits

- `fb5e416aa` feat(201-19): utils de Progreso y body de sábado + composable de progreso
- `20c427444` feat(201-19): pantalla Progreso con Subir y figura de la semana (S12-5, D-13)
- `973b93681` feat(201-19): pantalla Sábado de Toro y accesos desde Inicio (S12-3)
- `docs(201-19): summary del plan 19` (este archivo)

## Qué quedó

- **progressView.ts**: `sparklinePoints(values, unit, width, height)` generaliza la fórmula del prototipo (con 300 x 56 da `y = 48 - ratio x 40`, `x = 8 + i x 284/(n-1)`, un punto en `width/2`); techo 8 reps / 12 s y valores acotados. `deltaText` usa U+2212 y coma decimal, y trata `-0,04` como `0,0`.
- **useConquerProgress**: `act()` común a las tres acciones; con una acción en curso (`busyKey`) ignora cualquier otro toque (T-201-62: un doble toque no sube dos veces). El botón tocado muestra spinner y los demás quedan deshabilitados.
- **CqSubirCard**: fila por escalón (`{ejercicio} · E{n}`, `de → a`) y por combo (`Combo {label}`); con `toRungName === null` solo el texto "Llegaste al tope de la escalera: tu coach ya está avisado", sin botón.
- **ConquerProgressPage**: sin sesiones, KPIs + "Todavía no hay sesiones cargadas. Cargá la primera en Hoy." con link a `conquer-hoy`. Con sesiones: Subir, calibraciones (Aceptar / Ahora no solo si `canResolveCalibration`), "Tu semana" con `CqBodyMap` montado con `v-if` tras cargar (sin zonas: "Todavía no trabajaste ninguna zona esta semana."), y una card por día con `CqExerciseProgress`. Los días sin ejercicios (el sábado de Toro) no se listan.
- **ConquerSaturdayPage**: `useConquerToday().load('sabado')`; `rejected` (4xx del API: no es Toro o recorte >= 3, T-201-63) -> Notify con el `error` del API y `router.replace` a `/training?tab=conquer`. Dos `CqComboCard` con `max = 13` y título `Combo push · 3 máx + 10 drops`; guardar manda `{ dayKey: 'sabado', pain, push, pull }`, Notify "Guardado" y vuelta a la tab.
- **Rutas** `conquer-progreso` y `conquer-sabado` sin flag (como `conquer-hoy`). `ConquerHome`: fila-enlace "Progreso"; `dayTarget` y `goToday` mandan a `conquer-sabado` sin `hasRoute`.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `pnpm lint` (app) tras cada tarea: 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`).
- `vue-tsc` (binario de et-195-seo) filtrado por `src/modules/conquer|modules/training/routes`: vacío tras cada tarea.
- Los tres `verify` del plan (greps de contenido + higiene `console.`/`any`/`onUnmounted`/`color: rgba`/Google Fonts): sin hallazgos.
- `prettier --write` solo sobre archivos propios; `--check` sobre `ConquerHome.vue` y `routes.ts`: OK.
- `sass` compiló el `<style>` de los 6 componentes/páginas nuevos o tocados.
- `git diff origin/staging -- el-templo-app/src/components/anatomy` vacío.
- Vitest NO se corrió (regla de la fase): `progressView.test.ts`, `todayForm.test.ts` y `format.test.ts` corren en CI.

## Mutantes razonados

`progressView.ts`, `todayForm.ts` y `format.ts` solo importan tipos: se corrieron en Node 22 sobre copias en el scratchpad con scripts que replican los `expect`; producción quedó intacta (nunca se tocó el archivo real, `git status` limpio).

1. `sparklinePoints` sin acotar al techo: el script da `ATRAPADO: techo 12 reps | techo s 12`; en CI falla `progressView.test.ts:31` (`pts[1].y` igual a `pts[0].y` con [8, 12]) y `:38`.
2. Techo de segundos en 8 en vez de 12: falla `progressView.test.ts:38` (con [8, 12, 20] en `s`, `pts[0].y > pts[1].y`).
3. `deltaText` con guion normal: falla `progressView.test.ts:81` (`charCodeAt(0)` = 0x2212) y el caso `-0.7 -> '−0,7'`.
4. `deltaText` que decide el signo con `delta` sin redondear: `-0.04` daría `-0,0`; falla el caso `[-0.04, '0,0']` (`progressView.test.ts:74`).
5. `toSaveBody` del sábado que manda `exercises: []`: falla `todayForm.test.ts:195` (`toEqual` exacto) y `:206` (`'exercises' in body` debe ser false).
6. `toSaveBody` del sábado que ignora `form.push`: falla `todayForm.test.ts:214` (`push: { rungId: 9, series: 5 }`).
7. `canResolveCalibration` sin `toRungName !== null`: falla `format.test.ts:143` (`[proposal('subir', null), false]`).
8. `calibrationText` que siempre dice "subir a": falla `format.test.ts:128` ("propone bajar a adv tuck").
9. `sessionsText` con `count <= 1`: falla `progressView.test.ts:89` (`[0, '0 sesiones']`).
10. `saturdayComboTitle` con "3 máx + 10 drops" fijos: falla `todayForm.test.ts:250` (recorte 2: "2 máx + 6 drops"); ignorando los `null`: falla `:256`.

## Desvíos del plan

- **`calibrationText` / `canResolveCalibration` movidos de `CqSaveSheet.vue` a `format.ts`** (con test): Progreso necesita el mismo texto y el mismo criterio; duplicarlos habría sido repetición pura. `CqSaveSheet.vue` y `format.*` no estaban en `files_modified`.
- **`useConquerToday` ganó `rejected`, `setSaturdayRung`, `setSaturdaySeries`, `subirSaturday`**: el plan decía "sin cambios de API", pero la página necesita mutar `push`/`pull` y distinguir el 4xx (volver a la tab) de un fallo de red (Reintentar). `subirOpening` y `subirSaturday` comparten `raiseCombo`, que además bloquea con `saving`.
- **`sessionsText` y las claves de acción** (`subirStepKey`...) viven en `progressView.ts` (con test) en lugar de inline en la página.
- La rama `hasRoute('conquer-sabado')` de `ConquerTodayPage.vue` queda como código defensivo (la ruta ya existe siempre): no se tocó, no está en el plan.

Ambigüedades nuevas (opción más simple):

- **"Por lado" en Progreso**: `ProgressStep` del API no trae `unilateral`, así que el detalle por escalón dice "6 reps -> 7 reps" aunque el peldaño sea unilateral (igual que pasaba en Inicio antes de 201-18). Arreglarlo es un campo en `progress-service` + `schemas.ts`; no se hizo (el plan es solo de app).
- **Hold en Progreso**: solo se listan E1-E3 (como pide el plan y el prototipo); el hold final no aparece en el detalle.
- **Δ del acierto**: se muestra como "Δ -0,7 en promedio" bajo el KPI (la síntesis lo define como diferencia promedio contra el objetivo).
- **Notify de éxito**: "Subiste de progresión" / "Subiste el combo" al subir (el plan solo pedía los errores).
- **Selector de días en el Sábado**: se incluyó el `CqDayPicker` (como el prototipo); tocar otro día abre Hoy con `?day=`.
- **Calibración en Progreso**: card con caps "Calibración" y el mismo texto de la hoja de Hoy.

## Trampas / notas para los planes siguientes

- `POST /combos/:comboKey/subir` devuelve solo `{ combo }`; si una pantalla necesita `comboSubir` actualizado hay que releer `GET /progress` (lo hace `useConquerProgress.subirCombo`).
- Un día de `progress.days` puede venir sin `exercises` (sábado de Toro): filtrar antes de pintar.
- `.cq-link` (fila-enlace) sirve sobre un `<router-link>`; solo hay que sumar `text-decoration: none`. 201-20 ya tiene su punto de extensión en `ConquerHome` (`<!-- 201-20: accesos ... -->`).
- Sin navegador no se pudo mirar nada: en el UAT (201-24) revisar a 390 px las filas de `CqExerciseProgress` (chip a la derecha ocupando dos renglones), la curva (`preserveAspectRatio="none"` estira los puntos en pantallas anchas: los círculos pueden verse ovalados), la figura de la semana en `CqBodyMap` a 230 px y el ancho del botón "Subir" junto a nombres largos de combo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: el plan no agrega superficie nueva (el app consume rutas ya cubiertas por 201-08/10). T-201-62 y T-201-63 quedan mitigados como describe el plan (el API decide; el app bloquea el doble toque y vuelve a la tab ante un 4xx).

## Self-Check: PASSED

Los 8 archivos nuevos existen y los tres commits de código (`fb5e416aa`, `20c427444`, `973b93681`) están en `git log`.
