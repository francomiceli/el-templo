# 201 - Diff del anexo de catálogo de Nacho contra lo construido

Anexo: `/home/franco/projects/el-templo/.docs/conquer-catalogo.md` (no se usó al planificar; la fase salió de `ref/conquer-app.html`, `ref/conquer-registro.xlsx` y la síntesis).
Construido: worktree `et-201-conquer`. Rutas abajo relativas a él. Solo lectura: no se tocó código.
Veredictos: IGUAL / DIFIERE / FALTA (el anexo lo tiene, lo construido no) / SOBRA (construido sin respaldo en el anexo).
Nota: el anexo dice que existe `conquer-catalogo.json` y que "si el documento y el JSON no coinciden, manda el JSON". No está en `.docs/`: pedírselo a Nacho antes de dar nada por cerrado.

Resumen del patrón: la semilla 0292 sigue la síntesis §8 (8 escaleras compartidas, un solo juego de peldaños por escalera). El anexo es más fino: una escalera por ejercicio y una escalera de hold final aparte. De ahí salen casi todas las diferencias de contenido.

## 1. Ejercicios (marcas, unidad)

Semilla: `el-templo-api/src/db/migrations/0292_conquer_catalog_seed.sql:132-154`.

| Tema | Anexo | Construido | Veredicto |
|---|---|---|---|
| 12 ejercicios, nombres y orden | 12 | 12, mismos nombres (0292:132-154) | IGUAL |
| Unidad: Planche hold y Front lever hold en segundos, el resto reps | sí | `unit` 's' en 132 y 138, 'reps' en el resto | IGUAL |
| Brazos rectos (define el texto de fallo) | Por EJERCICIO: sí en Planche hold/press, L-sit, FL hold, FL raises. NO en Pull-ups en FL | Por PELDAÑO (`conquer_rungs.brazos_rectos`). Todos los peldaños de `palanca` van con 1 (0292:42-54), y Pull-ups en FL usa `palanca` | DIFIERE: Pull-ups en FL muestra "Fallo técnico" en vez de "Fallo muscular" (`el-templo-app/src/modules/conquer/utils/format.ts:79`) |
| Por lado | One arm / archer: one arm, OAP asistida y archer | Marcado por peldaño: one_arm, oap_asistida, archer (0292:94-98); estricta lenta, dominada, al pecho no | IGUAL (se carga por lado solo en esos peldaños) |
| Patrón (empuje/tracción) y Día por ejercicio | columnas del anexo | No hay campo; el día sale de la plantilla | FALTA (solo informativo) |
| Modos posibles: isométricos solo hold, dinámicos completa o negativa | regla | Solo se fuerza que el hold final sea modo hold (`el-templo-api/src/modules/conquer/step-service.ts:129`). El alumno puede poner "Completa" en Planche hold o "Hold" en HSPU (`CqStepRow.vue` MODES) | FALTA (sin validación ni filtro del selector) |

## 2. Escaleras

Semilla `0292:26-130`. Posición 0 = más difícil, igual que el anexo.

| Escalera | Anexo (E1-E3 / hold final) | Construido | Veredicto |
|---|---|---|---|
| Planche hold, press | 7 peldaños full...lean | `palanca` 7 peldaños (0292:42-54) | IGUAL |
| Front lever hold, pull-ups, raises | 6 peldaños, termina en tuck, NO hay lean | Comparten `palanca` con `lean` (0292:54) | SOBRA un peldaño "lean" (rompe los arranques de Novillo/Ternero, ver §3) |
| L-sit a plancha | 7: a full, a half lay, a straddle, a super adv tuck, a adv tuck, a tuck, a lean | 4: a straddle, a adv tuck, a tuck, a lean (0292:124-130) | FALTA a full, a half lay, a super adv tuck (coincide con la síntesis §8.1, no con el anexo) |
| HSPU E1-E3 | libre déficit, libre, paralelas profundas, pared, wide en piso, pike elevado, pike | Igual (0292:56-68) | IGUAL |
| HSPU hold final | vertical libre, vertical en pared, pike | usa la misma escalera de arriba | DIFIERE (no existe escalera de hold aparte) |
| 90° press E1-E3 | full, straddle, adv tuck, tuck, pike elevado | Igual (0292:70-78) | IGUAL |
| 90° press hold final | full, half lay, straddle, super adv tuck, adv tuck, tuck | misma escalera que E1-E3 | DIFIERE |
| Planche push-up E1-E3 | full, straddle, super adv tuck, adv tuck, tuck, pseudo, flexión | Igual (0292:80-92) | IGUAL |
| Planche push-up hold final | full...pseudo (sin flexión) | misma escalera, con flexión | DIFIERE |
| One arm / archer E1-E3 | one arm, OAP asistida, archer, estricta lenta, dominada, al pecho | Igual (0292:94-104) | IGUAL |
| One arm / archer hold final | one arm, dominada | misma escalera de 6 | DIFIERE |
| Muscle-up | estricto, con impulso, al pecho, dominada. Hold: estricto, dominada | 4 peldaños iguales (0292:106-112); sin escalera de hold aparte | IGUAL en E1-E3, DIFIERE en hold |
| Fondo a pelícano | pelícano, supinado profundo, anillas profundo, anillas, paralelas profundo. Hold: pelícano, anillas, paralelas | 5 iguales (0292:114-122); sin escalera de hold; el último se llama "paralelas profundo" | IGUAL en E1-E3, DIFIERE en hold |
| Estructura | 12 escaleras, una por ejercicio, más hold | 8 escaleras compartidas (`palanca`, `hspu`, `p90`, `ppu`, `trac`, `mu`, `fondo`, `lsit`). Editar un peldaño de `palanca` afecta a 5 ejercicios | DIFIERE |

## 3. Progresiones iniciales por nivel

Toro: la tabla de `start_steps` (0292:132-154) coincide en las 12 filas con el anexo, incluidos los modos negativa de E2 y los hold finales. IGUAL.

Novillo y Ternero: el anexo da tablas explícitas. Lo construido calcula "Toro corrido N peldaños activos hacia lo fácil" (`el-templo-api/src/modules/conquer/activation-service.ts:112-155`, `rules.ts:61` y `shiftStartPosition`), con N=1 y N=2 por defecto, editables en settings (`settings.ts` claves `conquer.start_offset.ternero|novillo`, rango 0-4). El desplazamiento se aplica también al hold final.

| Ejercicio | Anexo Novillo / Ternero | Construido (calculado) | Veredicto |
|---|---|---|---|
| Planche hold, Planche press, L-sit | tablas del anexo | idénticas | IGUAL |
| HSPU, Muscle-up, Fondo a pelícano | tablas del anexo | idénticas (Fondo: hold "paralelas profundo" en vez de "paralelas", mismo peldaño) | IGUAL |
| Front lever hold | Nov: half lay, super adv tuck, tuck, tuck. Ter: straddle, adv tuck, tuck, tuck | Nov hold = **lean**. Ter E3 y hold = **lean** | DIFIERE |
| Pull-ups en FL | Nov: tuck, tuck neg, tuck, tuck. Ter: todo tuck | Nov E3 y hold = **lean**. Ter: los 4 escalones en **lean** | DIFIERE (Ternero queda en "lean" de front lever, un peldaño que el anexo dice que no existe) |
| Front lever raises | Nov: super adv tuck, SAT neg, tuck, tuck. Ter: adv tuck, AT neg, tuck, tuck | Nov E3 = lean. Ter E3 y hold = lean | DIFIERE |
| 90° press | hold final tuck en los dos niveles | hold final **pike elevado** en los dos | DIFIERE |
| Planche push-up | hold final pseudo en los dos | Nov y Ter hold = **flexión** | DIFIERE |
| One arm / archer | hold final dominada en los dos | Nov y Ter hold = **al pecho** | DIFIERE |
| Regla general | tablas fijas, "PROPUESTA, valida Nacho" | offset editable (default 1 y 2) | DIFIERE de mecanismo (el resultado coincide salvo las filas de arriba) |

Causa común: el hold final se desplaza sobre la misma escalera de E1-E3; el anexo usa una escalera de hold más corta.

## 4. Plantillas

Semilla `0292:156-172`.

| Tema | Anexo | Construido | Veredicto |
|---|---|---|---|
| Niveles y días (Ternero 2-3, Novillo 3-4, Toro 4+sáb; combos solo Toro) | sí | `rules.ts:18` LEVEL_DAYS, `levelHasCombos` | IGUAL |
| 4 días: ejercicios por día | Plancha, Front, Vertical, Dominadas | Igual (0292:156-162) | IGUAL |
| Nombres de día | Lunes, Martes, Jueves, Viernes | Etiquetas Plancha/Front/Vertical/Dominadas, sin día de semana; "qué toca" es el primer pendiente de la semana (`calendar.ts` `nextPendingDay`) | DIFIERE (decisión D-16 de la fase) |
| 3 días: ejercicios | Empuje (PH, HSPU, PPU), Tracción (FL hold, Pull-ups FL, MU), Mixto (Planche press, OA/archer, 90°) | Igual (0292:164-168) | IGUAL |
| 3 días: finisher de Tracción y Mixto | Tracción = Curl de bíceps; Mixto = Retracciones + hold en barra | Tracción = **Retracciones**; Mixto = **Curl** (0292:166, 168) | DIFIERE (cruzados) |
| 2 días: ejercicios | Empuje (PH, HSPU, PPU), Tracción (FL hold, OA/archer, MU) | Igual (0292:170-172) | IGUAL |
| 2 días: finisher de Tracción | Curl de bíceps en anillas o pelícanos, 15-20 reps | **Retracciones escapulares + hold en barra** (0292:172) | DIFIERE |
| Sábado Toro: calor + combo push + combo pull | sí | `combos.ts` SATURDAY_*, `today-service.ts` | IGUAL |

## 5. Finishers (3 series, lejos del fallo, no se cargan)

| Bloque | Anexo | Construido | Veredicto |
|---|---|---|---|
| Plancha | Tuck planche hold o planche lean, 20-30 s | "Tuck planche hold o lean, 20–30 s" (0292:156) | DIFIERE (redacción) |
| Front | Retracciones escapulares + hold en barra | igual (0292:158) | IGUAL |
| Vertical | Fondos o push-ups, 15-20 reps | "Fondos o push-ups, 15–20" (0292:160) | DIFIERE (falta "reps") |
| Dominadas | Curl de bíceps en anillas o pelícanos, 15-20 reps | "Curl de bíceps en anillas, 15–20" (0292:162) | DIFIERE (falta "o pelícanos" y "reps") |
| "3 series, lejos del fallo" | sí | `ConquerTodayPage.vue:63` | IGUAL (ver textos: falta "te tienen que quedar 4 o 5 reps") |
| No se cargan | sí | no hay campo de carga del finisher | IGUAL |

## 6. Combos (solo Toro)

`el-templo-api/src/modules/conquer/combos.ts` y `rules.ts:54-56,121-150`.

| Tema | Anexo | Construido | Veredicto |
|---|---|---|---|
| 6 combos predeterminados (press / push / hold) | tabla §6 | `COMBOS` idéntico, incluido Vertical con "Hold de plancha" | IGUAL |
| Objetivo apertura | 3, y 4 desde semana 3 | `OPENING_BASE=3`, `OPENING_FROM_WEEK3=4` | IGUAL |
| Sábado | 3 máx + 10 drops = 13 | `saturdayPlan` 3+10=13 | IGUAL |
| Se carga: progresión de arranque y series completadas | sí | `combo-service.ts`, `CqComboCard.vue` | IGUAL |
| Escalera de arranque | palanca full...lean | `COMBO_LADDER_CODE='palanca'` (7 peldaños) | IGUAL |
| Lista de 12 "elementos disponibles" (con Back lever) | existe | No hay catálogo de elementos ni armador; combos fijos (síntesis §3.4 lo posterga) | FALTA (Back lever no existe) |
| Regla "Subir" tras N semanas con el objetivo | no figura | `DEFAULT_COMBO_WEEKS_N=2`, editable (`settings.ts`, `calendar.ts` `comboSubirReady`) | SOBRA (viene de la síntesis D-14) |

## 7. Constantes del motor

`el-templo-api/src/modules/conquer/engine.ts`, `rules.ts`.

| Regla | Anexo | Construido | Veredicto |
|---|---|---|---|
| Piso | 3 reps / 4 s | `PISO` (engine.ts:22) | IGUAL |
| Techo | 8 reps / 12 s | `TECHO` (engine.ts:24) | IGUAL |
| Incremento | +1 rep / +2 s, editable por alumno | `DEFAULT_INC` (engine.ts:26), `incReps/incS` por alumno | IGUAL |
| Subir | techo dos sesiones seguidas del mismo día | `nextTarget` (engine.ts:70-84): últimas dos marcas del escalón >= techo | IGUAL |
| Calibración E1 | >=6 reps o >=9 s sube; 3-5 / 4-8 queda; <3 / <4 baja | `calibracion` (engine.ts:137) | IGUAL |
| Paso de nivel | 4 semanas seguidas de plan completo, sin molestia >= 4 | `LEVEL_UP_WEEKS=4`, `PAIN_ALERT_MIN=4`, `levelUpStreak` (semanas calendario) | IGUAL |
| Control físico | Día 0 y cada 4 semanas | `CHECK_INTERVAL_DAYS=28` | IGUAL |
| Sesión 3 ejercicios x 3 series + finisher | sí | un número por escalón (peor de 3 series) | IGUAL |
| Otras constantes que el anexo no da | no figuran | `INACTIVE_DAYS=7`, `CHECK_OVERDUE_DAYS=42`, `HOLD_PRELOAD_DEFAULT=8` | SOBRA (vienen de la síntesis §5; Nacho los puede ajustar) |
| Settings | no figuran | Solo offsets de arranque y `combo_weeks_n`. Piso, techo y umbrales NO son configurables (constantes de código) | n/a |

## 8. Alertas y orden de recorte

| Alerta | Anexo | Construido | Veredicto |
|---|---|---|---|
| Molestia roja | "Molestia {n}/10 en {dia} el {fecha}" | Alerta y color OK (`alerts-service.ts:121-142`); el admin muestra solo la etiqueta "Molestia" (`ConquerAlertActions.vue:33`, `conquer-format.ts`); `detail` con pain/date/dayKey viaja pero no se arma la frase | DIFIERE (falta la frase con datos) |
| Caída roja | "El E1 de {ejercicio} bajó 2 sesiones seguidas" | `caidaE1` (engine.ts:150): descarta la marca de calibración y exige 3 marcas estrictamente decrecientes (4 sesiones en total); solo etiqueta "Caída" | DIFIERE (frase) y matiz de umbral |
| Inactivo amarillo | "Sin sesiones desde {fecha}" | 7 días (`rules.ts:44`), `alerts-service.ts:310-315`; solo etiqueta | DIFIERE (frase) |
| Control vencido amarillo | "Sin control físico desde {fecha}" | más de 42 días del último control con contenido (`alerts-service.ts:316-320`); solo etiqueta | DIFIERE (frase) |
| Tope de escalera amarillo | "{ejercicio} E{n} llegó al tope de su escalera" | Se emite solo si el escalón está en el peldaño más difícil Y su estado es "subir" (`session-service.ts:265-293`); no al llegar al peldaño | DIFIERE (disparo más tardío) |
| Paso de nivel verde | "{alumno} completó 4 semanas de su plan sin molestias" | Alerta OK (`alerts-service.ts:223-270`); etiqueta "Paso de nivel" | DIFIERE (frase) |
| Control día 0 pendiente | no figura | `control_dia0_pendiente` amarilla (`rules.ts:155,166,177`, `alerts-service.ts:322`) | SOBRA |
| Acciones propuestas (Recortar, Escribirle, Recordarle, Extender, Confirmar) | sí | `conquer-format.ts` ALERT_HINTS + botones | IGUAL |

Orden de recorte (`rules.ts:88-115`, `cuts-service.ts`):

| Paso | Anexo | Construido | Veredicto |
|---|---|---|---|
| 1 a 5 (drops 10 a 6, máx 3 a 2, sacar sábado, apertura 4 a 3, sacar apertura) | sí | `CUT_STAGE_LABELS` y `saturdayPlan`/`openingTarget` los aplican (drops 6, máx 2, sábado null, apertura 3, null) | IGUAL |
| 6: bajar una progresión el escalón que dispara la molestia, solo Ternero y Novillo | sí | `cutProposal`: Ternero/Novillo van directo al paso 6; Toro también cae al paso 6 después de la etapa 5 | SOBRA para Toro (el anexo no lo prevé) |

## 9. Textos del modo

App: `el-templo-app/src/modules/conquer/**`.

| Clave | Anexo | Construido | Veredicto |
|---|---|---|---|
| portada, sello, bajada | textos de portada | solo en el `alt` de la imagen `ConquerBlocked.vue:6`; la portada es imagen | IGUAL (si la imagen los trae) |
| boton_bloqueado | Quiero desbloquearlo | igual (`ConquerBlocked.vue:14`) | IGUAL |
| confirmacion_pedido | Listo. Te contactamos para activarlo. | "Ya le avisamos al equipo" + "Te contactamos para activarlo." (`ConquerBlocked.vue:19-20`) | DIFIERE |
| leyenda_milon | Milón de Crotona cargó un ternero... | "Milón cargó un ternero..." (`ConquerLevelsPage.vue:11`) | DIFIERE (sin "de Crotona") |
| nivel_ternero, nivel_novillo | textos | idénticos (`format.ts:18-34`) | IGUAL |
| nivel_toro | Los tres escalones al fallo. El método completo, con combos. | "...El método completo." (`format.ts:32`) | DIFIERE |
| fallo_rectos | Fallo técnico: cuando se rompe la línea del cuerpo. | "Fallo técnico: cortá cuando se rompe la línea" (`format.ts:80`) | DIFIERE |
| fallo_flexionados | Fallo muscular: cuando no podés más. | "Fallo muscular" (`format.ts:80`) | DIFIERE |
| ayuda_carga | Anotá la peor de tus 3 series. | igual (`CqExerciseCard.vue:22`) | IGUAL |
| ayuda_hold | Hold final: al fallo. Anotá los segundos. | solo "al fallo" en el objetivo (`CqStepRow.vue:94`) | FALTA |
| ayuda_unilateral | Por lado: anotá el lado más flojo. | solo "N por lado" en el objetivo (`format.ts:40-44`); sin la ayuda del lado más flojo | FALTA |
| finisher | 3 series, lejos del fallo (te tienen que quedar 4 o 5 reps). | "{finisher} · 3 series, lejos del fallo" (`ConquerTodayPage.vue:63`) | DIFIERE (falta "4 o 5 reps") |
| combo | Press (sube y baja) → Push → Hold, al fallo. Anotá con qué progresión arrancaste y cuántas series completaste. | "Press X (sube y baja) → Push Y → Hold Z", título "Combo de apertura · al fallo" y etiquetas "Progresión de arranque" y "Series completadas" (`CqComboCard.vue`) | IGUAL (en espíritu; falta la frase "Anotá...") |
| sabado_calor | 10 a 15 min. Movilidad, escapulares y dos vueltas suaves del combo, lejos del fallo. | "10 a 15 min. Dos vueltas suaves de la cadena, lejos del fallo. Lo único de la semana que no va al fallo." (`combos.ts:84-85`) | DIFIERE |
| sabado_combo | 3 series a máxima progresión al fallo y 10 drops: si no sale, bajás la progresión y seguís. | No aparece; solo el título "Combo push · 3 máx + 10 drops" (`todayForm.ts:36-39`) | FALTA |
| calibracion_subir / quedar / bajar | Te quedó fácil: probá la progresión siguiente. / Estás bien ubicado. / Te quedó pesado: bajá una progresión. | "Tu primera sesión de X propone subir a Y" / "X: quedate en Y" (`format.ts:95-103`) | DIFIERE |
| estado_subir | ⬆ Subir de progresión | "Subir de progresión" (`format.ts:54`) | IGUAL (sin flecha) |
| estado_techo1, bajo, rango, sin | Techo 1 de 2, Bajo el piso, En rango, Sin datos | idénticos (`format.ts:55-58`) | IGUAL |
| fin_sesion_techo | Llegaste al techo en {ejercicio}, escalón {n}. Si lo repetís la próxima, subís de progresión. | No existe | FALTA |
| control_fisico | Misma luz, misma hora, sin entrenar antes. Frente, perfil y espalda. | "Misma luz, misma hora, sin entrenar antes." más indicación por pose (`utils/bodyCheck.ts:25-31`) | IGUAL |
| permiso_publicacion, permiso_sin_cara | textos | `CqPublishPermission.vue:10,19` | IGUAL |

## 10. Músculos

Semilla `0292:132-154` (`muscles`) y `lighting.ts:18` (zonas).

| Tema | Anexo | Construido | Veredicto |
|---|---|---|---|
| Lista de músculos | 13 fijos: pectoral, deltoides anterior/medio/posterior, tríceps, bíceps, antebrazo, dorsal, trapecio superior/medio, romboides, serrato, core | 15 zonas del BodyFigure: chest, deltoids, triceps, biceps, forearm, trapezius, upper-back, lower-back, abs, obliques, gluteal, quadriceps, hamstring, adductors, calves | DIFIERE (taxonomía distinta; sin serrato, romboides, ni deltoides separados; piernas sí existen, el anexo las deja fuera) |
| Planche hold / press, L-sit | core secundario (L-sit: principal) | `abs` principal en los tres | DIFIERE |
| Front lever hold y raises | core secundario (raises: principal) | `abs` principal en los tres FL | DIFIERE (hold) |
| Pull-ups en FL | principal dorsal, romboides, bíceps | bíceps secundario, `abs` principal | DIFIERE |
| Muscle-up | principales dorsal, bíceps, tríceps; secundario pectoral | principales upper-back, triceps, chest; bíceps secundario | DIFIERE |
| Fondo a pelícano | principales bíceps, pectoral; secundarios deltoides anterior, tríceps | principales chest, triceps; sin bíceps | DIFIERE |
| HSPU, 90° press, Planche push-up, One arm / archer | principales compatibles | coinciden en lo principal (con antebrazo y otros extras como secundarios) | IGUAL en lo principal |
| Uso | "fase siguiente" (mapa de equilibrio) | el mapa se enciende ya en esta fase (`lighting.ts`, D-05 y D-13) | n/a |

## Diferencias que cambian comportamiento (priorizadas)

1. **Hold final y Novillo/Ternero en la familia front lever, 90° press, planche push-up y one arm** (§2-§3). El alumno de menor nivel arranca en peldaños que el anexo no contempla ("lean" de front lever, "flexión" como hold de planche push-up, "al pecho" como hold de OAP, "pike elevado" como hold de 90°). Ternero con pull-ups en FL arranca los 4 escalones en "lean". Corrección: escaleras de hold aparte (o recorte de la escalera) o tablas explícitas por nivel según el anexo.
2. **Pull-ups en front lever con "Fallo técnico"** (§1): la marca brazos rectos vive en el peldaño de `palanca`, no en el ejercicio. El anexo la quiere por ejercicio y en pull-ups es "no".
3. **Escalera compartida `palanca` con `lean` para front lever** (§2): ofrece un peldaño inexistente en el selector del alumno y en el tope de escalera, y editar `palanca` afecta a 5 ejercicios.
4. **Finishers cruzados en las plantillas de 2 y 3 días** (§4): día de tracción de 2 y 3 días y día mixto de 3 días reciben el finisher contrario al del anexo; el de 2 días debería ser el curl.
5. **L-sit a plancha con 4 peldaños en vez de 7** (§2): faltan "a full", "a half lay" y "a super adv tuck".
6. **Ayudas faltantes en Hoy** (§9): `ayuda_hold` ("Anotá los segundos"), `ayuda_unilateral` ("lado más flojo"), `sabado_combo`, `fin_sesion_techo`; textos distintos de `fallo_*`, `finisher` (sin "4 o 5 reps"), `sabado_calor` (sin movilidad/escapulares) y `calibracion_*`.
7. **Alertas del coach sin frase con datos** (§8): el tablero muestra solo "Molestia", "Caída", etc., sin "{n}/10 en {día} el {fecha}", "{ejercicio}", "desde {fecha}". Los datos ya viajan en `detail`.
8. **Tope de escalera**: se emite solo cuando el escalón en el peldaño más difícil pide subir, no al llegar al peldaño (§8).
9. **Recorte en Toro**: tras la etapa 5 se propone "bajar escalón", paso que el anexo reserva a Ternero/Novillo (§8). **Alerta `control_dia0_pendiente`** no existe en el anexo.
10. **Modos por tipo de ejercicio sin validar** (§1): se puede poner "Completa" en un isométrico o "Hold" en un dinámico.
11. **Músculos**: taxonomía de zonas distinta de los 13 músculos y roles principal/secundario que difieren en core, bíceps (muscle-up, pull-ups FL, fondo) y pecho (muscle-up). Cambia qué se enciende en el mapa.
12. Menores: finishers sin "reps" ni "o pelícanos"; nombres de día sin Lunes/Martes/Jueves/Viernes (decisión D-16); confirmación del pedido y leyenda de Milón con redacción distinta; sin patrón/día por ejercicio; sin catálogo de elementos de combo (Back lever).
