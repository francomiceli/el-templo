# Estiramiento post-clase — SPEC

> Estado al 2026-11-11: **Fases 1, 2 y 3 escritas y las 16 decisiones cerradas con Franco** (§7).
> Franco decidió avanzar **sin esperar al kinesiólogo**: la lista curada y la tabla de referencia valen como están.
> Pasa a la fase GSD 213. Sin código, sin migraciones, sin push.

Código verificado en `origin/master` `9954fa235` (worktree `/home/franco/projects/et-estiramiento`; el `master` local del
checkout principal está 320 commits atrás). Datos: producción (`eltemplo`), solo lectura, ventana
2026-09-16 → 2026-11-10 (8 semanas, semanas SPOM W29-W38). Consultas en [`consultas/`](consultas/).

---

## 0. Resumen en una pantalla

| Tema | Resultado |
|---|---|
| Elegibilidad (asistencia con horario) | **99,96 %** tiene `schedule_id`. Solo 5 de 13.566 no lo tienen (todas Wellhub). |
| Resolución de la sesión (fecha + nivel) | **100 %** de las 13.319 asistencias a General/ROM resuelve a una sesión aprobada. |
| Momento del push | Las clases terminan como máximo a las 21:00. Con +30 min nada cae después de las 21:30; con +60, el 10,7 % cae justo a las 22:00. Choque con otra clase: < 0,5 %. |
| Regreso espontáneo a la app después de clase | Solo **17 %** vuelve a abrir la app ese día; 6 % dentro de las 2 h. La card sola llega a pocos. |
| Línea de base de push | 64,8 % de los asistentes tiene token (77,4 % de las asistencias). `class_reminder` se abre 8,7 %. |
| Movilidad del día como materia prima | Tal cual está no alcanza: solo el 24 % de las asistencias cae en una sesión con 3 o más ejercicios de movilidad con video. Resuelto con D-01: la sesión aporta las familias y los ejercicios salen de una lista curada. |

---

## 1. Correcciones al "punto de partida"

Lo que el prompt daba por relevado y resultó distinto. Rutas relativas a `el-templo-api/` salvo indicación.

| # | Afirmación | Veredicto | Qué es en realidad |
|---|---|---|---|
| P-1 | Cada bloque trae su `mobilityExercise` | ❌ | Solo los bloques que no son INITIUM en días regulares, combos y técnica (`sessions/service.ts:213-217`). ROM y el bloque STRETCHING no lo traen. |
| P-2 | La movilidad se elige "según lo trabajado" | ✅ con matiz | El generador propone una al azar dentro de una familia asociada a la ruta del bloque (`Math.random()`, `sessions/pipeline/utils/mobility-selection.ts:130`), pero el profe la revisa y la edita. **Corrección de Franco (2026-11-11): la movilidad que queda prescrita SIEMPRE corresponde a lo trabajado ese día; de eso se encarga el profe y es lo que reflejan las sesiones ya construidas.** Se toma como fuente autorizada. |
| P-3 | STRETCHING usa `exercise_type='mobility'` | ❌ | Queda como `'main'` a propósito (`stretching-selection.ts:73-77`). Hoy solo cierra el día de técnica, es igual para los 6 niveles y no filtra por zona. |
| P-4 | Zonas `estira` → ejercicios | ❌ | No existe camino zona → ejercicio de movilidad. `estira` es un rol de músculo dentro de una ruta `main` (`anatomy/zone-hits.ts:43,148`). |
| P-5 | No hay dato de "hacible en casa" | ⚠️ | Existe `exercises.equipment` (`barras, anillas, paralelas, cajon, ninguno`), pero en prod solo hay `ninguno` (177 filas) y `NULL` (2.026). No distingue "no necesita nada" de "sin etiquetar". |
| P-6 | `dayId` por fecha | ❌ | `sessions.day_id = W{semana}-{día}-{nivel}`. La fecha se convierte con ancla lunes 2026-02-23 (`modules/shared/week-dates.ts:23`). `presencial-YYYY-MM-DD` solo existe en `completed_sessions`. |
| P-7 | `mark-no-shows` marca al terminar la clase | ❌ | Corre a las 22:00 de la sede y solo toca reservas con `booking_date < hoy`: la clase del día D se marca el D+1 (`jobs/mark-no-shows.ts:168-179`). No sirve como señal para el push. |
| P-8 | `attendance.source` tiene 3 valores | ⚠️ | Son 4: `qr`, `manual`, `wellhub`, `wellhub_manual`. Las columnas físicas son `attendance_source`, `booking_status`, `notification_status`, `device_platform`. |
| P-9 | `routeOverride` para el toque | ⚠️ | Es un parámetro interno de `queueNotification` (`notifications/service.ts:472`); hoy no lo usa nadie y a la app le llega como `route`. |
| P-10 | `module-flags.ts` sirve para el flag | ❌ | Solo resuelve 4 módulos fijos. El patrón que sirve es una clave con prefijo propio en `tenant_settings` expuesta por un endpoint de config (ejemplo de punta a punta: `whatsapp.sales_number.*` → `GET /communications/me/config` → `useCommunicationsStore`). La app hoy no lee ningún flag por gimnasio. |
| P-11 | `DayPlayer` acoplado a AURA y racha | ⚠️ | El acople está en el servidor (`POST /sessions/complete` acredita AURA, racha, programa y encola `post_session_soreness`). En la UI no hay pantalla de AURA ni de racha. |
| P-12 | `FreeBlockPlayer` envuelve cualquier bloque | ⚠️ | El bloque tiene que existir en `session_blocks` y su rol estar en la canasta, que **excluye** `STRETCHING` e `INITIUM` (`free-blocks-ranking.ts:28-36`). No reproduce una lista arbitraria sin un endpoint propio. |
| P-13 | Deep link con la app cerrada | ⚠️ | `handleTapNavigation` hace `router.push` directo, sin cola hasta que haya sesión; si el alumno no está logueado, el destino se pierde (`el-templo-app/src/boot/push-notifications.ts:73-98`). |
| P-14 | Embudo de push medible | ⚠️ | `pending_notifications` se purga a las 24 h y `opened_count` es un contador por plantilla, sin marca por usuario. Hoy no se puede armar un embudo por alumno. |

Confirmado sin cambios: `pattern = 'MOVILIDAD'`; `ROUTE_TO_MOBILITY_ROUTES`; `class_reminder` (cron cada 5 min,
`forEachActiveTenant`, dedupe por `booking_id`); 6 categorías de preferencias y ningún horario de silencio; alto fijo de
`TodayCard` (4 filas, un solo `secondary`); `featureFlags.ts` como constante de build; ningún SDK de analytics.

---

## 2. Hallazgos de la Fase 1

### 2.1 Momento del push — `consultas/05`, `06`, `07`

**Horario de fin de clase** (13.472 asistencias a General y ROM; todas las clases duran 60 min):

| Sede | fin ≤ 10 h | 10-13 h | 17-19 h | fin 20:00 | fin 21:00 |
|---|---|---|---|---|---|
| Alberti | 31 % | 8 % | 31 % | 15 % | 15 % |
| Juan B. Justo | 34 % | 8 % | 37 % | 17 % | 4 % |
| Barcelona | 24 % | 10 % | 33 % | 21 % | 13 % |
| Constitución | 39 % | 0 % | 33 % | 14 % | 14 % |
| Jujuy | 27 % | 8 % | 31 % | 19 % | 14 % |
| Mario Bravo | 36 % | 14 % | 30 % | 13 % | 7 % |
| Moreno | 33 % | 12 % | 34 % | 13 % | 8 % |
| **Total** | **33 %** | **8 %** | **33 %** | **15 %** | **11 %** |

Ninguna clase termina después de las 21:00 y no hay clases entre las 13 y las 17.

**Hora local en que caería el push según el offset desde `end_time`:**

| Offset | ≥ 21:30 | ≥ 22:00 | ≥ 22:30 | Choca con otra clase del alumno |
|---|---|---|---|---|
| +15 min | 0 % | 0 % | 0 % | — |
| +30 min | 10,7 % | 0 % | 0 % | 0,4 % |
| +60 min | 10,7 % | 10,7 % (justo 22:00) | 0 % | 0,4 % |
| +90 min | 26,0 % | 10,7 % | 10,7 % | 0,5 % |
| +120 min | 26,0 % | 26,0 % | 10,7 % (23:00) | 0,5 % |

Solo 31 de 13.535 pares alumno-día tienen dos asistencias: el choque con "la próxima clase" es irrelevante.

**¿Cuándo vuelven a abrir la app?** (`member_logins`, una fila por `GET /auth/me`; mide arranques en frío, así que
subestima los regresos desde segundo plano):

| Franja de la clase | Abre la app otra vez ese día | < 30 min | < 60 min | < 120 min |
|---|---|---|---|---|
| Mañana (fin ≤ 13 h) | 26 % | 2 % | 4 % | 6 % |
| Tarde (fin 17-19 h) | 13 % | 2 % | 4 % | 7 % |
| Fin 20:00 | 9 % | 3 % | 4 % | 6 % |
| Fin 21:00 | 9 % | 4 % | 5 % | 7 % |
| **Total** | **17 %** | 3 % | 4 % | 6 % |

- No hay un pico natural después de clase: el regreso es parejo y bajo. **La card sola alcanza como mucho al 17 %.**
- Las aperturas posteriores a la clase se concentran entre las 20 y las 23 (pico a las 21 h, y las 22-23 h siguen altas).
  Los alumnos de la mañana vuelven a la app a la noche, no al mediodía.

**Disponibilidad de la señal de asistencia cuando hay que encolar:**

| Fuente | Asistencias | Registrada después del fin de clase | Después de fin + 30 min | Después de fin + 60 min |
|---|---|---|---|---|
| QR | 9.185 | 0 % | 0 % | 0 % |
| Manual | 4.125 | 8,4 % | 2,4 % | 1,8 % |
| Total | 13.319 | 2,6 % | 0,8 % | 0,6 % |

El QR se escanea en promedio 2 min antes del inicio (100 % dentro de ±20 min). La carga manual llega en promedio 30 min
después del inicio. Con cualquier offset ≥ 30 min se pierde menos del 1 % por asistencia cargada tarde.

### 2.2 Elegibilidad — `consultas/01`, `04`

- Sin `schedule_id`: **5 de 13.566 (0,04 %)**, todas Wellhub (5 de 15). Las cargas manuales siempre traen horario.
- Por actividad: General 13.186 (97,2 %), ROM 286, y 0,7 % en actividades donde la sesión del día no aplica
  (Acrobacias 28, Verticales 25, Yoga 23, Open Gym 13). Hay que excluirlas por actividad.
- Wellhub además no escribe el espejo `presencial-*` en `completed_sessions`.

### 2.3 Resolución de la sesión del alumno — `consultas/09`

Camino exacto (el mismo que usa `GET /api/sessions/daily`, `sessions/routes.ts:73-154`):

1. De la asistencia: `attendance.session_date` (fecha en la zona de la sede) y `member_id`.
2. `semana = floor((fecha − 2026-02-23) / 7) + 1` y el nombre del día (`dateToWeekNumber`, `dateToDayName`).
3. Nivel: `users.level` (un nivel global, NOT NULL, default `kairos`). Si el día es ROM, se reduce a `alfa`
   (kairos y alfa) o `delta` (el resto).
4. `day_id = W{semana}-{día}-{nivel}`, con `status = 'approved'` y `goal_plan_type IS NULL`.

Replicado en SQL sobre las 13.319 asistencias: **100 % resuelve**.

| Caso borde | Qué pasa |
|---|---|
| Días ROM (sábados) | Sesión ROM en dos niveles; 9 ejercicios `MOVILIDAD` cargados como `main`. 286 asistencias. |
| Combos y técnica (miércoles y jueves, alternados) | Resuelven igual. Técnica cierra con STRETCHING (4 ejercicios, `main`). |
| Alumno "sin nivel" | No existe: el default es `kairos`. 32 % de las asistencias son de nivel `kairos`. |
| Nivel cambiado después de la clase | El espejo guarda `completed_sessions.session_level` al momento del check-in; conviene usar ese y no `users.level`. |
| Sin `schedule_id` | 0,04 %; no se puede calcular el fin de clase. |
| Domingo | `GET /sessions/daily` responde 400; no hay clases. |

Niveles de quienes asisten: kairos 32 %, alfa 48 %, delta 19 %, sigma + omega 0,4 %. **El público es principiante.**

### 2.4 Cobertura de la movilidad del día — `consultas/02`, `03`, `09`, `10`

Ponderado por asistencia real (cada asistencia cuenta la sesión de su nivel):

| Tipo de día | Asistencias | Movilidad distinta por sesión | Con video | 0 con video | 1 | 2 | ≥ 3 | ≥ 3 con video y etiquetadas "sin elementos" |
|---|---|---|---|---|---|---|---|---|
| Regular | 7.853 | 4,0 | 1,6 | 17 % | 32 % | 30 % | 21 % | 6 % |
| Combos | 2.578 | 3,8 | 1,4 | 23 % | 33 % | 28 % | 16 % | 4 % |
| Técnica | 2.602 | 6,4 | 2,6 | 2 % | 12 % | 44 % | 42 % | 8 % |
| ROM | 286 | 7,2 | 2,4 | 5 % | 6 % | 55 % | 35 % | 14 % |
| **Total** | **13.319** | **4,5** | **1,8** | **15 %** | **28 %** | **33 %** | **24 %** | **6 %** |

"Con video" incluye el respaldo que usa la app (otra fila con el mismo nombre que sí tenga video,
`modules/shared/exercise-video-fallback.ts`).

- **Cantidad:** ninguna sesión viene sin movilidad; hay entre 2 y 9 ejercicios.
- **Duración:** el generador prescribe una sola serie de 20 s (isométrico) o 10 repeticiones, y los profes la editan
  (hay de 5 a 120 repeticiones). A la dosis prescrita son ~3,6 min en un día regular. Para 5-8 min la rutina necesita
  **su propia dosis** (por ejemplo 45-60 s por estiramiento o por lado); eso es una decisión de diseño, no un bloqueo.
- **Video:** en 9 semanas se prescribieron **121 ejercicios de movilidad distintos y solo 24 tienen video** (34 % de las
  prescripciones). El catálogo `MOVILIDAD` completo tiene 198 filas y 26 con video.
- **En casa y sin elementos:** el 19 % de las prescripciones está etiquetado `ninguno`; el resto no tiene etiqueta.
- **Suavidad:** entre los más prescritos hay trabajo exigente, con carga o con elementos: `DEFICIT SITTED PIKE WEIGHTED`,
  `JEFFERSON CURL`, `FULL BRIDGE ONE ARM`, `HANGING TOE ON BAR PIKE`, `BOX PIKE HANG`, `WALL BRIDGE`. No encajan con
  "rutina suave" ni con "en casa" (lista completa en `consultas/03_catalogo_movilidad_prescrito.tsv`).

**Capacidad de completar desde el pool `MOVILIDAD`, por familia (`mobility_related`):**

| Familia | Ejercicios | Con video | Con video y "sin elementos" |
|---|---|---|---|
| `LS ( LUNGES )` (cadera, cuádriceps, glúteo) | 37 | 9 | 8 |
| `MN` (cadena posterior, pike) | 19 | 6 | 4 |
| `FL` (columna, puentes) | 21 | 3 | 3 |
| `PL` | 9 | 3 | 2 |
| `TTB / HF` (lateral, pancake) | 21 | 1 | 1 |
| Sin familia | 22 | 2 | 0 |

**Simulación: si se filman los K ejercicios sin video más prescritos**, % de asistencias con 3 o más con video:

| Videos nuevos | ≥ 3 con video | ≥ 4 con video | Ninguno |
|---|---|---|---|
| 0 (hoy) | 24 % | 10 % | 15 % |
| 10 | 50 % | 26 % | 2 % |
| 20 | 71 % | 39 % | 0 % |
| 30 | 82 % | 57 % | 0 % |
| 45 | 92 % | 69 % | 0 % |

### 2.5 Línea de base de push — `consultas/08`, `11`

| Plantilla | Enviados | Abiertos | % |
|---|---|---|---|
| `class_reminder` ("Tu clase arranca pronto") | 4.628 | 403 | 8,7 % |
| `post_session_soreness` ("Tu cuerpo habla", 2 h después de completar en la app) | 221 | 16 | 7,2 % |
| `weekly_summary` | 20.448 | 1.095 | 5,4 % |
| `morning_energy` | 138.044 | 2.706 | 2,0 % |
| `waitlist_promoted` | 91 | 12 | 13,2 % |

- Asistentes de las 8 semanas: 1.236. **Con `device_token`: 64,8 %** (77,4 % de las asistencias; los que más vienen
  tienen más token). iOS 36,1 %, Android 29,4 %. El 74 % de esos tokens se tocó en los últimos 14 días.
- Categoría apagada: `entrenamiento` 2,8 %, `motivacion` 0,0 %. Alcanzable por push en `entrenamiento`: 62,5 %.
- `opened_count` solo cuenta toques dentro de las 24 h y no deduplica.
- **Orden de magnitud esperable:** de cada 100 asistencias, ~77 reciben el push y ~7 lo abren. Si la mitad completa,
  son 3-4 estiramientos por cada 100 asistencias por la vía del push.
- Solo 11 de 13.566 asistencias tienen además una sesión completada en la app ese día. El estado `completada` de la
  card casi nunca coincide con un día de clase; el estado real es `presencial-turno` con asistencia.

### 2.6 Evidencia fisiológica (para calibrar texto, duración e intensidad)

1. Estirar después de entrenar **no reduce el dolor muscular** de los días siguientes de forma clínicamente relevante:
   ~1 punto sobre 100 al día siguiente (Cochrane, Herbert y col. 2011, 12 estudios).
2. Tampoco acelera la recuperación de fuerza ni cambia el dolor a 24, 48 o 72 h frente al descanso pasivo; los autores
   recomiendan tratarlo como opcional (Afonso y col. 2021, 11 ensayos, confianza muy baja).
3. La vuelta a la calma activa no previene lesiones ni mejora el rendimiento del día siguiente, pero tampoco perjudica
   la adaptación (Van Hooren y Peake 2018).
4. Lo que sí está respaldado es el **rango de movimiento**: el estiramiento estático lo mejora, con techo en ~4 min por
   sesión y ~10 min por semana (Ingram y col. 2025, citado de segunda mano, falta leer el original).
5. Consecuencia para el diseño: 5-8 min alcanza y sobra; intensidad suave (tensión, nunca dolor); textos que hablen de
   "bajar un cambio", "soltar" y "ganar rango", nunca de dolor ni de lesiones. Coincide con el encuadre ya aceptado.

Fuentes: [Cochrane CD004577](https://www.cochrane.org/evidence/CD004577_stretching-prevent-or-reduce-muscle-soreness-after-exercise) ·
[Afonso 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8340604) ·
[Van Hooren y Peake 2018](https://rd.springer.com/content/pdf/10.1007/s40279-018-0916-2.pdf) ·
[Ingram 2025 (dosis)](https://fisiologiadelejercicio.com/wp-content/uploads/2024/12/Optimising-the-Dose-of-Static-Stretching-to-Improve-Flexibility.pdf).
La recomendación ACSM (10-30 s por repetición, 60 s por grupo muscular) no la pude verificar de primera mano.

---

## 3. H-1 — El hallazgo que frenó el diseño (resuelto)

**La movilidad de la sesión del día, tal como está cargada, no alcanza para armar una rutina guiada con video.**

- Solo el 24 % de las asistencias tiene 3 o más ejercicios de movilidad con video; el 15 % no tiene ninguno.
- Parte de lo prescrito no es suave ni hacible en casa, y no hay etiqueta confiable para filtrarlo.
- La cantidad y la duración **no** son el problema: hay 4,5 ejercicios por sesión y la dosis se puede fijar aparte.

### D-01 — ¿De dónde salen los estiramientos? ✅ DECIDIDA (Franco, 2026-11-11)

**Opción A: familias del día + lista curada**, con dos condiciones de Franco:

1. Los ejercicios de la lista tienen que **existir ya en nuestra base** (no se crean ejercicios nuevos).
2. **Que tengan video hoy o no, no importa**: el video se incorpora después. La regla no mira el video.

Opciones descartadas: B (ejercicios del día tal cual + filmar), C (sin exigir video sobre lo prescrito), D (postergar).

---

## 4. Fase 2 — Diseño

Las decisiones se cerraron con Franco el 2026-11-11. Cada una conserva las opciones que se evaluaron y lo que se
decidió.

### 4.1 Regla de selección

Función pura `seleccionarEstiramientos(entrada) → { estiramientos[], duracionSegundos }`. No lee la base ni el reloj.

**Entrada**

| Dato | De dónde sale |
|---|---|
| `prescritos` | Movilidad de la sesión del día, en orden de bloque: `exercise_type = 'mobility'`, más los `MOVILIDAD` del bloque STRETCHING. Cada uno con su nombre canónico y su familia (`mobility_related`). |
| `rutas` | Ruta de cada bloque que no es INITIUM. |
| `catalogo` | La lista curada: ejercicio, familia, orden, lados (1 o 2), si es de base. |
| `semana`, `dia` | De la sesión (`W{semana}-{día}`), para rotar. |

El nivel del alumno se usa solo para resolver cuál es su sesión; la rutina es la misma para todos los niveles (D-05).
Las zonas de anatomía no entran: no hay camino de zona a ejercicio (P-4).

**Pasos**

1. **Familias del día.** Por cada prescrito: su familia en el catálogo si está en la lista; si no, su familia de la
   base normalizada (`LS ( LUNGES )` → LS, `MN` → MN, `FL` → FL, `TTB / HF` → TTB, `PL` → FL por D-04). Sin familia no
   aporta. Se ordenan por cantidad de apariciones; en empate, la que aparece primero.
2. **Complemento de tren superior (D-03).** Si algún bloque tiene ruta de empuje o tracción y la familia TS no
   apareció, se agrega TS al final.
3. **Reparto.** 5 lugares, repartidos en ronda sobre las familias en ese orden.
4. **Candidatos de cada familia.** Primero los prescritos del día que están en la lista (en orden de bloque). Después
   el resto de la lista de esa familia, en su orden, rotado `(semana + índice del día)` posiciones.
5. **Completado.** Si una familia se queda sin candidatos, el lugar pasa a la siguiente familia que tenga. Si ninguna
   tiene, se completa con la lista de base, en su orden. Nunca se repite un ejercicio.
6. **Duración.** Cada estiramiento dura 45 s por lado más 10 s de transición. Si el total supera 8 min, se quita el
   último; si queda por debajo de 5 min, se agrega el siguiente candidato.
7. **Sin familias** (hoy no ocurre en ninguna sesión): rutina de base completa.

**Lista curada propuesta (20 ejercicios, todos existentes en `exercises`)**

Los elegí por nombre, dificultad lineal ≤ 5 y sin carga ni elementos en el nombre; yo no puedo ver los ejercicios.
**Franco decidió avanzar con esta lista sin esperar al kinesiólogo (2026-11-11).** Vive en `stretch_catalog`, así que
se corrige después cambiando datos, sin tocar la regla.

| Familia | Ejercicio | Id | Lados | Video hoy | Dificultad | Prescripciones en 9 semanas |
|---|---|---|---|---|---|---|
| LS (cadera, cuádriceps, glúteo) | QUAD STANDING STRETCH | 4180 | 2 | sí | 1 | 38 |
| LS | SITTED GLUTE STRETCH | 4182 | 2 | sí | 1 | 21 |
| LS | WARRIOR STRETCH | 4188 | 2 | no | 1-3 | 15 |
| LS | LAYED DOWN GLUTE STRETCH | 4184 | 2 | no | 1-2 | 13 |
| LS | COUCH STRETCH | 4185 | 2 | sí | 2-4 | 31 |
| MN (cadena posterior) | PIKE STANDING | 3892 | 1 | sí | 1-2 | 55 |
| MN | STR PIKE STANDING | 3893 | 1 | sí | 1-2 | 23 |
| MN | LAYED DOWN HAM BENT | 4181 | 2 | no | 1 | 2 |
| MN | STANDING WINDMILL | 3897 | 2 | sí | 3 | 6 |
| FL (columna) | CAT COW | 3105 | 1 | sí | 1 | 32 |
| FL | TABLE | 3106 | 1 | sí | 1-2 | 32 |
| FL | SHOULDER BRIDGE | 3108 | 1 | no | 2-3 | 20 |
| FL | SEAL REPS | 3111 | 1 | no | 2-4 | 27 |
| FL | TABLE TWIST | 3109 | 2 | sí | 3 | 16 |
| TTB (lateral) | STANDING LATERAL STRETCH | 3284 | 2 | no | 2-3 | 13 |
| TS (pecho, hombros, dorsales) | WALL CHEST STRETCH | 5090 | 2 | no | 1 | 17 |
| TS | BUTCHER FLOOR STRETCH | 4474 | 1 | sí | 1 | 6 |
| TS | LAY DOWN ARMS UP | 4610 | 1 | no | 1 | 15 |
| TS | COBRA STRETCH | 4872 | 1 | no | 4 | 8 |
| TS | ANGELS AND DEMONS | 4818 | 1 | no | 1 | 5 |

- **Lista de base** (para completar): CAT COW, PIKE STANDING, QUAD STANDING STRETCH, WALL CHEST STRETCH, STANDING
  LATERAL STRETCH.
- 10 de los 20 tienen video hoy; los otros 10 son la lista de filmación, sin urgencia.
- `LAYED DOWN HAM BENT` figura en la base como familia LS; en la lista lo pongo en MN porque estira isquiotibiales.
  La familia de la lista manda sobre la de la base.
- TS es una familia nueva de la lista: en la base esos ejercicios no tienen `mobility_related`.
- TTB queda con un solo ejercicio: casi todo lo demás de esa familia lleva carga.
- Dudas que quedan anotadas y no bloquean: `COUCH STRETCH` y `WALL CHEST STRETCH` necesitan pared; `SEAL REPS`,
  `COBRA STRETCH` y `STANDING WINDMILL` pueden no ser suaves; los "lados" los supuse por el nombre.

**Tabla de referencia (verdad fija de los tests)**

Sesiones reales de las semanas 37 y 38, con la lista de arriba. "×2" es un estiramiento por lado.

| Sesión | Tipo | Rutas | Familias del día | Duración | Estiramientos esperados, en orden |
|---|---|---|---|---|---|
| `W37-lunes-kairos` | regular | OAP, L, NC, PL | LS > MN > TS | 6:50 | COUCH STRETCH ×2 · STR PIKE STANDING · BUTCHER FLOOR STRETCH · SITTED GLUTE STRETCH ×2 · LAYED DOWN HAM BENT ×2 |
| `W37-miercoles-alfa` | combos | HSPU, DS, SU, FB | FL > MN > LS > TS | 6:50 | TABLE TWIST ×2 · STANDING WINDMILL ×2 · QUAD STANDING STRETCH ×2 · ANGELS AND DEMONS · CAT COW |
| `W37-jueves-delta` | técnica | MU, MU, L | FL > LS > MN > TS | 6:05 | CAT COW · QUAD STANDING STRETCH ×2 · PIKE STANDING · WALL CHEST STRETCH ×2 · TABLE |
| `W37-jueves-kairos` | técnica | MU, MU, L | LS > TS > FL > MN | 6:50 | QUAD STANDING STRETCH ×2 · WALL CHEST STRETCH ×2 · CAT COW · PIKE STANDING · SITTED GLUTE STRETCH ×2 |
| `W37-viernes-alfa` | regular | HSPU, DS, PS, FL | MN > FL > LS > TS | 6:05 | STR PIKE STANDING · SHOULDER BRIDGE · COUCH STRETCH ×2 · BUTCHER FLOOR STRETCH · LAYED DOWN HAM BENT ×2 |
| `W37-viernes-sigma` | regular | OAP, DS, HT, FL | FL > MN > TS | 5:20 | TABLE · STR PIKE STANDING · BUTCHER FLOOR STRETCH · SHOULDER BRIDGE · LAYED DOWN HAM BENT ×2 |
| `W38-lunes-alfa` | regular | SS, OAPU, SU, TTB | LS > MN > TTB > TS | 7:35 | LAYED DOWN GLUTE STRETCH ×2 · STANDING WINDMILL ×2 · STANDING LATERAL STRETCH ×2 · COBRA STRETCH · COUCH STRETCH ×2 |
| `W38-lunes-delta` | regular | SS, OAPU, SU, TTB | LS > MN > TS | 7:35 | LAYED DOWN GLUTE STRETCH ×2 · LAYED DOWN HAM BENT ×2 · COBRA STRETCH · COUCH STRETCH ×2 · STANDING WINDMILL ×2 |
| `W38-martes-alfa` | regular | L, NC, PL, OAP | FL > TTB > MN > TS | 6:50 | SHOULDER BRIDGE · STANDING LATERAL STRETCH ×2 · STANDING WINDMILL ×2 · ANGELS AND DEMONS · TABLE TWIST ×2 |
| `W38-martes-kairos` | regular | L, NC, PL, OAP | TS > LS > MN | 6:50 | BUTCHER FLOOR STRETCH · COUCH STRETCH ×2 · PIKE STANDING · WALL CHEST STRETCH ×2 · LAYED DOWN GLUTE STRETCH ×2 |
| `W38-miercoles-alfa` | técnica | PHS, PHS, QC | FL > MN > LS > TTB > TS | 6:50 | SEAL REPS · PIKE STANDING · LAYED DOWN GLUTE STRETCH ×2 · STANDING LATERAL STRETCH ×2 · WALL CHEST STRETCH ×2 |
| `W37-sabado-alfa` | ROM | — | — | — | No se ofrece (D-06). |

La generé con `consultas/regla_simulacion.py` sobre los datos de `consultas/13`. Si la lista cambia, la tabla se regenera
con el mismo script y los tests se actualizan en el mismo cambio. Dato que la tabla deja a la vista: lo prescrito no siempre sigue
`ROUTE_TO_MOBILITY_ROUTES` (un bloque OAP con `DIAGONAL STRETCH`), porque los profes editan la movilidad.

#### D-02 — ¿Dónde vive la lista curada? ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Esfuerzo | Riesgo y mantenimiento |
|---|---|---|
| **A. Tabla nueva `stretch_catalog`** (gimnasio, ejercicio, familia, orden, lados, base, activo) | Media: migración, 5 conteos de tabla gym-owned, carga inicial por migración. | Lista explícita, ordenable y por gimnasio; el segundo gimnasio carga la suya. |
| B. Columnas nuevas en `exercises` | Baja. | `exercises` tiene varias filas por nombre (2.169 filas, ~1.325 nombres): hay que marcar una sola y es fácil equivocarse. Ensancha una tabla ya ancha. |
| C. Constante en el código, por nombre | Mínima. | No sirve para otro gimnasio y cualquier cambio del kinesiólogo necesita un deploy. |

Recomiendo **A**: es la opción explícita y la única que no se rompe con duplicados ni con el segundo gimnasio.

#### D-03 — ¿Qué define las familias del día? ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Movilidad prescrita + complemento de tren superior por rutas** | Si hay un bloque de empuje o tracción y nadie aportó TS, se suma un lugar de TS. Agrega un mapa ruta → "es tren superior" que tiene que validar un profe. |
| B. Solo la movilidad prescrita | Decisión 3 al pie de la letra. La rutina sale solo de las familias de la movilidad que cargó el profe. |

**Decisión de Franco:** sumar tren superior está bien, con una corrección de fondo: la movilidad prescrita **siempre**
tiene que ver con lo que se trabaja en el día; el profe se encarga de eso y es lo que reflejan todas las sesiones ya
construidas. Consecuencia para la regla (interpretación mía): la movilidad prescrita manda. Define las familias y su
orden, y sus ejercicios van primero cuando están en la lista. El tren superior es un complemento que entra último y
nunca desplaza a una familia del día.

Medido sobre 13.033 asistencias a General (`consultas/14`):

- La movilidad prescrita ya trae un estiramiento de tren superior en el **11 %** de las asistencias.
- Con las 9 rutas que el código marca sin ambigüedad como empuje (HS, HSPU, PHS, OAPU, PLPU) o tracción (MU, OAP, OAR,
  BL) en `sessions/pipeline/utils/mobility-routes.ts`, el **83 %** de las asistencias tiene un bloque de esos y el
  complemento actuaría en el **73 %**.
- Si además se cuentan FL, FLR, PL y DS, sube al 98 % y 87 %. Esas cuatro son dudosas: el comentario del código las
  agrupa como "cadera", pero los nombres sugieren front lever, planche y fondos.
- **Supuesto de arranque (mío, sin confirmar):** cuentan solo las 9 rutas sin ambigüedad. La tabla de referencia da
  igual con 9 o con 13, porque todas esas sesiones tienen al menos una de las 9. Es una constante de una línea.
- En la práctica, A significa que casi todos los días uno de los 5 lugares es de tren superior.

#### D-04 — Familia `PL` ✅ DECIDIDA: A (Franco, 2026-11-11)

Los 9 ejercicios `PL` son todos "RH …" (categoría `CORE POSTERIOR`): por el nombre parecen activación, no estiramiento.

| Opción | Qué implica |
|---|---|
| **A. `PL` cuenta como FL** (columna) | Un día con movilidad `PL` recibe estiramientos de columna. Sin ejercicios propios. |
| B. Curar 2-3 "RH" suaves | Solo si el kinesiólogo dice que son aptos para después de clase. |
| C. Ignorar `PL` | El día aporta una familia menos. |

Recomiendo **A**.

#### D-05 — Dosis, duración y variación ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Fija para todos: 5 estiramientos, 45 s por lado, 5-8 min, rotación por día** | Coincide con el techo de la evidencia (~4 min de estiramiento efectivo por sesión). El 80 % del público es kairos o alfa. Rutina distinta cada día, igual para todos los que fueron a esa clase. |
| B. Por nivel (más tiempo o variantes más difíciles para delta en adelante) | Duplica la lista a curar y la tabla de referencia para el 20 % de las asistencias. |
| C. Sin rotación (siempre los primeros de cada familia) | Más simple, pero la rutina se repite casi igual todos los días. |

Recomiendo **A**.

#### D-06 — Días ROM y de técnica ✅ DECIDIDA (Franco, 2026-11-11): técnica con card y push, ROM nada

| Opción | Regular y combos | Técnica (la clase ya cierra con STRETCHING) | ROM (la clase entera es movilidad) |
|---|---|---|---|
| **A** | Card + push | Card sí, push no | Nada |
| B | Card + push | Card + push | Card + push |
| C | Card + push | Nada | Nada |

**Decisión de Franco:** regular, combos **y técnica** llevan card + push; ROM no se ofrece. Es la opción A con el push
también en técnica (yo había recomendado no mandarlo ese día). Técnica es el 20 % de las asistencias y ROM el 2 %.

### 4.2 Player

#### D-07 — ¿Qué player? ✅ DECIDIDA (Franco, 2026-11-11): player nuevo sobre una abstracción compartida con `FreeBlockPlayer`

| Opción | Esfuerzo | Riesgo |
|---|---|---|
| **A. `StretchPlayer.vue` nuevo**, con el patrón de `FreeBlockPlayer` y `GoalPlanSession`: `Session` sintética de un bloque `STRETCHING`, `BlockProgressionView`, `CountdownOverlay`, `useWakeLock`, endpoint propio | Media. | Bajo: no toca `DayPlayer`. Es el tercer player con el mismo patrón, que ya funciona dos veces. |
| B. Extender `DayPlayer` con un modo | Media-alta. | Alto: `POST /sessions/complete` acredita AURA, racha y programa y encola `post_session_soreness`. Es justo lo que no hay que contaminar. |
| C. Reutilizar `FreeBlockPlayer` y `extra_blocks_completed` | Baja. | Medio: está apagado por flag de build, exige un bloque real en la base, excluye `STRETCHING` de la canasta y da AURA solo desde 10 min. Mezcla los datos de dos features. |

**Decisión de Franco:** player nuevo, pero reutilizando lo de `FreeBlockPlayer` lo más posible: abstraer lo que hoy
tiene `FreeBlockPlayer` y que tanto el estiramiento como el propio `FreeBlockPlayer` usen esa abstracción.

Qué se abstrae (relevado en `el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue`, 439 líneas):

| Va a la abstracción compartida (`useSingleBlockPlayer`) | Queda en cada página |
|---|---|
| Etapas (carga → cuenta regresiva → reproduciendo → celebración → resumen) | De dónde sale el bloque (Libre: `GET /sessions/free-blocks/:id`; estiramiento: la oferta del día) |
| `Session` sintética de un bloque y creación del player (`useSessionPlayer`) | Endpoint de completado y su respuesta |
| Cuenta regresiva, marcar ejercicio, cierre del bloque | Pantallas de celebración y resumen, textos, AURA |
| Confirmación al salir y bloqueo de pantalla (`useWakeLock`) | A dónde vuelve al terminar |

- El composable expone `cleanup()` y no usa `onUnmounted` adentro (patrón del proyecto).
- **Riesgo:** `FreeBlockPlayer` no tiene tests y está apagado en prod por `FREE_BLOCKS_ENABLED`. Refactorizarlo no puede
  romperle nada a un alumno hoy, pero una regresión en Libre pasaría inadvertida. Por eso el primer plan de la fase
  escribe tests de caracterización del comportamiento actual y recién después extrae.
- `GoalPlanSession.vue` es un tercer candidato a usar la abstracción; queda fuera de esta fase.

- Ruta nueva `training/estirar` (nombre `stretch-player`). El servidor arma el bloque; la app no selecciona nada.
- Completar **no** escribe en `completed_sessions`, no toca racha, programa ni RPE, y no encola `post_session_soreness`.
- Pantalla final corta: "Listo. X minutos de estiramiento", y vuelve a Mi Templo.
- **A validar con un sketch antes de planificar:** el player no tiene reloj por ejercicio; marca cada ejercicio con un
  toque y solo tiene reloj de bloque (`timerSpec`). Hay que ver si el modo `interval` alcanza para marcar los 45 s por
  lado o si hace falta un reloj por ejercicio. Es el punto con más incertidumbre del player.
- Sin video, la ficha muestra `VideoPlaceholder`, como hoy en cualquier ejercicio sin video.

#### D-08 — ¿Suma AURA? ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. +5 AURA, una vez por día** | Fuente nueva `stretch` en `aura_config` y `aura_transactions` (migración de enum en las dos tablas, como la 0285). Solo si marcó todos los estiramientos y pasaron al menos 3 min reales. Mismo monto que un bloque libre, la mitad de una sesión. Tope con `awardOncePerLocalDay`. |
| B. Sin AURA | Sin migración de enum. Menos incentivo en una feature con adopción esperada baja. |
| C. Reutilizar la fuente `extra_block` | Sin migración, pero el día que se prenda Libre las dos features compiten por el mismo tope diario. |

Recomiendo **A**.

### 4.3 Card de Mi Templo

Estado real en días de clase: `presencial-turno` con `attendanceMarkedAt`. Hoy ahí el `primary` es "Repetir sesión"
(o "Ver la sesión") y el `secondary` queda libre para Libre o "Tus programas".

#### D-09 — ¿Cómo entra el estiramiento en la card? ✅ DECIDIDA: A, con el botón "Estirar" (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Estirar toma el `primary` mientras esté disponible** | `primary` = "Estirar"; el `primary` anterior baja a `secondary` y desplaza a Libre y "Tus programas". Sin `kind` nuevo: se mantienen las 4 filas y los 8 campos. |
| B. Estirar como `secondary` con prioridad máxima | Prioridad Estirar > Libre > propio > "Tus programas". No toca el `primary`, pero queda como un link chico. |
| C. `kind` nuevo `estirar` | Más libertad visual, pero rompe la matriz anti-regresión del test y suma un estado a mantener. |

Recomiendo **A**: la entrada pedida es la card principal, y "Repetir sesión" se usó 11 veces en 13.566 asistencias.

- **Cuándo aparece:** asistencia registrada **y** clase terminada (hora local ≥ `end_time`), el mismo día. Nunca antes
  ni durante la clase. También en `completada` si ese día hubo asistencia.
- **Dato nuevo en el input:** `stretch: { status: 'none' | 'available' | 'done', minutes }`. Lo calcula el servidor
  (actividad, tipo de día, hora de fin) y la card sigue siendo pura.
- **Sin parpadeo:** el dato viaja en la misma respuesta que la asistencia de hoy (`useTodayBookingStore`), que ya se
  refresca al entrar, al volver a primer plano y cada 30 s. A confirmar al planificar.
- **Fase 203, regla 1:** si el dato falla, la card queda como hoy. Una falla nunca ofrece ni oculta por "no".
- **Después de estirar:** el `primary` vuelve al anterior y la línea de estado pasa a "Clase y estiramiento hechos".
- **Tests:** un `describe` nuevo en `today-card.test.ts` con la matriz estado × `stretch.status`, más los invariantes
  existentes (8 campos, pill o meta, un solo `secondary`).

### 4.4 Push

#### D-10 — Momento del envío ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Fin de clase + 60 min, con tope a las 21:30** | Clase de 21:00 → 21:30; de 20:00 → 21:00; el resto, una hora después. Nunca pasa de las 21:30. |
| B. Fin de clase + 30 min, fijo | Nunca pasa de las 21:30. El alumno probablemente sigue en el gimnasio o volviendo. |
| C. A la noche para las clases de la mañana | Los de la mañana vuelven a la app de noche, pero ya no es "después de clase" y suma un caso. |

Recomiendo **A**, y que el experimento (D-16) mande la mitad con +30 para decidir con datos propios: los datos de hoy
no distinguen entre +30 y +60 porque no hay un pico natural de uso después de clase.

- **Horario de silencio:** 21:30 a 08:00, hora de la sede. Si el momento calculado cae después de las 21:30, se
  adelanta a las 21:30 siempre que queden al menos 15 min desde el fin de la clase; si no, no se manda. Nunca se pasa a
  la mañana siguiente (ahí ya sale `morning_energy`). Con los horarios actuales no hay ningún caso sin push.
- **Disparador:** la asistencia, no la reserva. En cada tick (5 min) se toman las asistencias elegibles con
  `fin + offset ≤ ahora < fin + 120 min` que todavía no tengan decisión de push. Eso recupera solas las cargas manuales
  tardías y los ticks perdidos, sin un mecanismo aparte. Queda afuera solo el 0,4 % de las asistencias, las que se
  cargan más de 2 h después del fin.

#### D-11 — Reglas de no envío y tope de frecuencia ✅ DECIDIDA: A (Franco, 2026-11-11)

No se manda, y se guarda el motivo, si:

- el alumno ya empezó o completó el estiramiento desde la card;
- el gimnasio no tiene el módulo `templo-training`, o la plantilla está apagada;
- no tiene token o tiene la categoría apagada;
- la actividad no es elegible, falta `schedule_id`, o el tipo de día lo excluye (D-06);
- ya recibió uno ese día (una oferta por alumno y día, aunque tenga dos clases);
- cae en el grupo de control;
- superó el tope.

| Opción de tope | Efecto medido |
|---|---|
| **A. Máximo 3 en 7 días, y pausa de 14 días tras 4 seguidos sin abrir** | El tope solo corta el 7,9 % de los envíos: el 12,7 % de las semanas-alumno tiene 4 o 5 clases. |
| B. Máximo 2 en 7 días | Corta el 21,5 % de los envíos. |
| C. Sin tope | Hasta 5 por semana a los que más vienen, que son los que menos conviene cansar. |

Recomiendo **A**.

#### D-12 — Categoría, texto y deep link ✅ DECIDIDA (Franco, 2026-11-11): texto 1, editable desde Comunicaciones; ruta de la plantilla

- **Categoría:** `entrenamiento` (2,8 % la tiene apagada; es la misma de `class_reminder` y `morning_energy`).
- **Texto propuesto**, sin promesas:
  - Título: "¿Estiraste?"
  - Cuerpo: "6 minutos para aflojar lo que trabajaste hoy. Tocá y arrancamos."
  - Prohibido en cualquier variante: "menos dolor", "evitá lesiones", "recuperate más rápido".
- **Editable desde Comunicaciones (pedido de Franco, para sumar emojis e ir probando).** No hay que construir nada:
  una plantilla de sistema ya se edita completa en el admin (título, cuerpo, destino y encendido) con
  `PUT /api/notifications/admin/templates/:id` (`notifications/routes.ts:602-611`). Condiciones para que funcione:
  - el push se siembra como plantilla de sistema (`TEMPLATE_SEEDS`), con este texto como valor inicial;
  - el job **no** pasa `titleOverride` ni `bodyOverride`, así lo que se edita en el admin es lo que sale;
  - su descripción de disparo se suma a `SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS` en
    `el-templo-admin/src/config/rule-triggers.ts`.
  - Ojo con el experimento: cada cambio de texto mueve la apertura. Conviene anotar la fecha de cada cambio.
- **Deep link:**

| Opción | Qué implica |
|---|---|
| **A. Campo `route` de la plantilla: `/training/estirar?from=push`** | Sin sección nueva. `resolveTapRoute` ya cae en `route`. La página pide al servidor la oferta de hoy. |
| B. Sección nueva en `APP_SECTIONS` | Entrada en la app y en su espejo de la API (test de sincronía), y aparece como destino elegible en el admin. |

Recomiendo **A**.

- **Vigencia:** la oferta vale hasta el fin del día local. Si se toca al día siguiente, la página avisa y vuelve a
  Mi Templo.
- **Requisito previo (P-13):** hoy, con la app cerrada y sin sesión, el destino del push se pierde. Hay que guardar el
  destino antes de navegar y retomarlo después del login, con el `pendingRoute` que ya usa `deep-links.ts`.
- **No verificable desde el código:** si el plugin nativo retiene el toque hasta que se registra el listener en
  arranque en frío. Va a la prueba en teléfono real (Fase 3).

### 4.5 Flag, job y gates

#### D-13 — Flag por gimnasio ✅ DECIDIDA (Franco, 2026-11-11): sin flag nuevo

**Decisión de Franco:** El Templo siempre va a tener esto prendido; para otros gimnasios no aplica porque su app es
Kaia, no esta.

Consecuencia (interpretación mía): no se crea ningún flag. Lo único que hay que garantizar es que el servidor, que sí
es compartido, no le arme ofertas ni le mande pushes a otro gimnasio. Eso ya tiene mecanismo:

- **Rutas:** van dentro del plugin de sesiones, que ya está montado con `moduleScope(app, "templo-training", …)`
  (`src/app.ts:211`). Un gimnasio sin ese módulo recibe lo mismo que hoy recibe para cualquier ruta de sesiones.
- **Job:** dentro del barrido, saltea al gimnasio que no tenga `templo-training` en `enabledModulesFor`. En prod solo
  El Templo lo tiene (`tenant_settings`: `module.templo-training.enabled = true` para el gimnasio 1; sin fila es
  apagado).
- **Apagar el push:** desde Comunicaciones (`is_enabled` de la plantilla), sin deploy.
- **Apagar la feature entera:** no hay interruptor; si los umbrales de 5.4 lo piden, es un cambio con deploy. Se
  acepta porque la decisión es que quede prendida.

#### D-14 — ¿Job nuevo o dentro del cron existente? ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Una función más en el tick de `notification-cron.ts`**, con la lógica en un módulo propio | Sin `cron.schedule` nuevo: no cambia el conteo de jobs. Igual barre con `forEachActiveTenant`. |
| B. Archivo de job nuevo | Suma una entrada a `JOBS_ESPERADOS` (13 → 14) y un registro en `src/index.ts`. Aísla fallas, que ya están aisladas por gimnasio. |

Recomiendo **A**: cambio mínimo y explicable en una línea.

**Gates que dispara la fase** (los números son los de `origin/master` hoy; verificarlos al ejecutar):

| Cambio | Gate | Qué hay que actualizar |
|---|---|---|
| 2 tablas nuevas (`stretch_catalog`, `stretch_offers`) | `test/db/tenant-tables.test.ts` | `GYM_OWNED_TABLES` y los conteos 129 / 5 / 134; `tenantIdColumn()`; export en el barrel del schema. |
| Sus índices únicos | `pnpm db:verify-uniques` | Toda unique empieza por `tenant_id`; un índice con `tenant_id` primero por tabla. |
| 3 rutas nuevas | `test/tenancy/iso-01-manifiesto.test.ts` | Una entrada por ruta en `TENANT_MANIFEST` (categoría `templo-module`, módulo `templo-training`) y `ENTRADAS_BASELINE` 554 → 557. |
| Handlers con body | `con-03-write-paths-tenant-id.test.ts` | `additionalProperties: false` en los schemas. |
| Consultas nuevas | `lint:tenant` | `tenantWhere` / `tenantValues`; la allowlist solo puede achicarse. |
| Barrido del job | `con-04-crons-per-tenant.test.ts` | Nada si va la opción A; `forEachActiveTenant` obligatorio igual. |
| Plantilla nueva | — | `TEMPLATE_SEEDS` y su espejo en `el-templo-admin/src/config/rule-triggers.ts`. |
| Fuente AURA nueva (D-08) | — | Migración de enum en `aura_config` y `aura_transactions`. |

Migraciones a mano; numerar mirando master, staging y el tren v6.1 (skill `el-templo-db-migrations`).

### 4.6 Registro y medición

#### D-15 — ¿Dónde se guarda? ✅ DECIDIDA: A (Franco, 2026-11-11)

| Opción | Qué implica |
|---|---|
| **A. Una tabla `stretch_offers`, una fila por alumno y día** | La misma fila es la oferta, el dedupe del push, el completado y el embudo. Unique `(tenant_id, user_id, local_date)`. |
| B. Completados en `extra_blocks_completed` y eventos en una tabla aparte | Sin tabla de completados nueva, pero mezcla Libre con estiramiento y parte el embudo en dos tablas. |

Recomiendo **A**. No usa `pending_notifications.booking_id`, así que no choca con el dedupe de `class_reminder`.

Qué guarda la fila y quién lo escribe:

| Paso del embudo | Columna | Quién la escribe |
|---|---|---|
| Oferta creada | `created_at`, `attendance_id`, `source_day_id`, `class_end_at`, `exercises` (la rutina, congelada) | El primero que llegue: el tick del push o la consulta de la card. |
| Grupo | `arm` (`control`, `push_30`, `push_60`) | Al crear la fila, por hash. |
| Card vista | `card_seen_at` | La app, la primera vez que muestra "Estirar". |
| Push decidido | `push_decision` (`queued` o el motivo de no envío), `push_queued_at` | El tick. |
| Push enviado | `push_sent_at` | El tick siguiente, leyendo el estado de la fila en `pending_notifications` antes de que se purgue. |
| Push abierto | `push_opened_at` | La página `estirar` cuando entra con `from=push`. |
| Empezado | `started_at`, `started_from` (`card` o `push`) | La app al arrancar el player. |
| Completado | `completed_at`, `duration_seconds`, `exercises_completed`, `aura_awarded` | `POST` de completado; la duración la calcula el servidor. |

Rutas nuevas: `GET /api/sessions/stretch/today`, `POST /api/sessions/stretch/events` y
`POST /api/sessions/stretch/complete`.

#### D-16 — Grupo de control y métrica de éxito ✅ DECIDIDA: A (Franco, 2026-11-11)

Grupo fijo por alumno: `crc32('stretch-v1:' + user_id) % 100`.

| Rango | Grupo | Recibe |
|---|---|---|
| 0-19 | Control | Card, sin push |
| 20-59 | Push +30 | Card + push a fin + 30 min |
| 60-99 | Push +60 | Card + push a fin + 60 min (tope 21:30) |

| Opción | Qué implica |
|---|---|
| **A. Tres grupos (20 / 40 / 40)** | Responde dos preguntas: cuánto agrega el push sobre la card, y qué offset rinde más. Con ~2.000 pushes por grupo en 4 semanas detecta diferencias grandes de apertura (3 puntos o más), no finas. |
| B. Dos grupos (20 % control, 80 % push con el offset de D-10) | Más muestra para la pregunta principal; el offset queda decidido sin datos propios. |
| C. Sin grupo de control | No se puede saber si el push sirve. |

Recomiendo **A**.

- **Volumen esperado en 4 semanas:** ~6.600 asistencias elegibles, ~5.100 con token.
- **Métrica de éxito:** estiramientos completados cada 100 asistencias elegibles, por grupo. Espero 3-4 en los grupos
  con push y menos de 1 en control.
- **Métricas de cuidado:** % que apaga `entrenamiento` (base 2,8 %) en push contra control; asistencias por alumno y
  por semana en push contra control; completados sobre empezados.
- **Sin grupo "sin feature":** con una adopción esperada de 3-4 %, un efecto sobre asistencia o permanencia no se
  podría medir en 4 semanas.

---

## 5. Fase 3 — Verificación externa

### 5.1 Validación de la lista y la tabla de referencia

**Decisión de Franco (2026-11-11): no hay decisión del kinesiólogo y la fase no la espera.** La lista curada de 4.1 y
la tabla de referencia quedan como verdad fija de los tests tal como están.

Lo que reemplaza a la firma previa:

1. La lista vive en datos (`stretch_catalog`): cualquier corrección posterior de un profe o del kinesiólogo es un cambio
   de datos por migración, más regenerar la tabla con `consultas/regla_simulacion.py` y actualizar los tests.
2. El checklist de UAT de la fase incluye que un profe haga una rutina completa en el teléfono y diga si algún
   estiramiento no es suave, necesita elementos o tiene mal los lados.
3. Los umbrales de 5.4 cubren el caso de una rutina que la gente no termina (completados sobre empezados).

### 5.2 Tests

- **Regla de selección (unitarios, función pura):** la tabla de referencia completa, más: sesión sin familias, familia
  con un solo ejercicio, prescrito que está en la lista, rutina que supera 8 min, rutina por debajo de 5 min, y que la
  misma entrada devuelve siempre la misma salida.
- **Card (unitarios):** matriz estado × `stretch.status`; nunca antes ni durante la clase; falla del dato; invariantes
  de alto fijo.
- **Integración con reloj fijo** (saltos relativos a `Date.now()`, sin fechas ni ids de usuario fijos):

| Caso | Resultado esperado |
|---|---|
| Clase de 20:00 a 21:00 | Push a las 21:30, no a las 22:00. |
| Clase que hoy no existe, de 21:00 a 22:00 | Sin push; la card sí ofrece. |
| Toque del push después de la medianoche local | La oferta ya venció; no se crea otra. |
| Sede en Barcelona y sede en Argentina en el mismo tick | Cada una con su hora local. |
| Reserva `no_show` o `cancelado`, sin asistencia | Sin oferta. |
| Asistencia Wellhub sin `schedule_id` | Sin oferta. |
| Asistencia manual cargada 40 min después del fin | Push en el tick siguiente. |
| Asistencia manual cargada 3 h después | Sin push; card disponible. |
| Sin token | Fila con `push_decision = 'sin_token'`; card disponible. |
| Categoría `entrenamiento` apagada | Fila con el motivo; sin push. |
| Ya empezó o completó desde la card | Sin push. |
| Cuarta asistencia en 7 días | Sin push por tope. |
| Dos clases el mismo día | Una sola oferta y un solo push. |
| Día ROM | Sin oferta. |
| Día de técnica | Card y push. |
| Día de combos | Card y push. |
| Actividad especial u Open Gym | Sin oferta. |
| Plantilla del push apagada desde Comunicaciones | Sin push; la card sigue ofreciendo. |
| Segundo gimnasio activo sin el módulo `templo-training` | Sin ofertas, sin filas y sin pushes, aunque El Templo lo tenga andando. |
| `class_reminder` ya encolado para esa reserva | El push de estiramiento sale igual. |
| Completar | No crea fila en `completed_sessions`, no cambia la racha, no encola `post_session_soreness`; AURA una sola vez por día. |

### 5.3 Prueba en teléfono real

iOS y Android, build de staging, con un alumno de prueba y asistencia registrada:

1. App cerrada del todo y con sesión: tocar el push abre el player de estiramiento directo.
2. App cerrada y **sin** sesión: después del login llega al player (requisito previo de D-12).
3. App en segundo plano y en primer plano.
4. Tocar el push al día siguiente: aviso y Mi Templo.
5. Completar y volver: la card muestra "Clase y estiramiento hechos" sin recargar a mano.

### 5.4 Umbrales para apagar (a las 4 semanas)

| Señal | Umbral | Acción |
|---|---|---|
| Completados cada 100 asistencias elegibles, grupos con push | Menos de 1,5 | Apagar el push. |
| Completados cada 100, grupo control (solo card) | Menos de 0,5 y además lo anterior | Retirar la feature (cambio con deploy, D-13). |
| Push contra control | Menos del doble | Apagar el push y dejar la card. |
| Alumnos que apagan `entrenamiento`, push contra control | Más de 1,5 puntos de diferencia | Apagar el push ese mismo día. |
| Apertura del push | Menos de 4 % | Revisar texto y momento antes de apagar. |
| Completados sobre empezados | Menos de 50 % | Acortar la rutina (4 estiramientos). |

---

## 6. Riesgos abiertos y observaciones

1. **La lista curada la armé por nombre y nadie con criterio clínico la revisó.** Franco eligió avanzar igual; el
   resguardo es que se corrige por datos y que un profe la prueba en el UAT (5.1).
2. **Reloj por ejercicio en el player** (D-07): puede hacer falta trabajo de interfaz que hoy no existe.
3. **Toque con la app cerrada:** un caso depende del plugin nativo y solo se resuelve probando en teléfono.
4. **Sin video en la mitad de la lista:** aceptado por Franco. El alumno principiante puede no reconocer el nombre en
   inglés (`BUTCHER FLOOR STRETCH`); la lista de filmación son 10 videos.
5. **Adopción esperada baja** (3-4 cada 100 asistencias): el costo de la fase hay que mirarlo contra ese número.
6. **`member_logins` subestima las aperturas** (solo arranques en frío): el 17 % es un piso.
7. **Fuera de alcance, visible en los datos:** los avisos de renovación de plan y de cambio de segmento salen a las
   3:00 de la mañana de Argentina (cron a hora UTC fija). Ya corregido el 2026-11-11 en otra sesión (pasan a las
   10:00 hora de la sede; staging `4e6ef0fec`, master `bc231c4de`).
8. **Dedupe de `class_reminder`** por `booking_id` sin filtrar plantilla (`jobs/notification-cron.ts:285-299`): este
   diseño lo esquiva, pero el próximo push ligado a una reserva lo va a pisar.

## 7. Estado de las decisiones

| # | Tema | Estado |
|---|---|---|
| D-01 | Fuente de los estiramientos | ✅ A, con ejercicios existentes y sin exigir video |
| D-02 | Dónde vive la lista curada | ✅ A: tabla nueva `stretch_catalog` |
| D-03 | Familias del día | ✅ A: movilidad prescrita (manda) + complemento de tren superior |
| D-04 | Familia `PL` | ✅ A: cuenta como columna |
| D-05 | Dosis, duración y variación | ✅ A: fija, 5 × 45 s por lado, rota por día |
| D-06 | Días ROM y de técnica | ✅ Técnica card + push; ROM nada |
| D-07 | Player | ✅ Nuevo, sobre una abstracción compartida con `FreeBlockPlayer` |
| D-08 | AURA | ✅ A: +5, una vez por día, fuente `stretch` |
| D-09 | Card | ✅ A: botón principal "Estirar" |
| D-10 | Momento del push | ✅ A: fin + 60 min, tope 21:30 |
| D-11 | No envío y tope | ✅ A: 3 en 7 días + pausa de 14 días |
| D-12 | Categoría, texto y deep link | ✅ "¿Estiraste?", editable en Comunicaciones; ruta de la plantilla |
| D-13 | Flag por gimnasio | ✅ Sin flag nuevo: limitado por el módulo `templo-training`; push apagable desde Comunicaciones |
| D-14 | Job | ✅ A: dentro del cron de notificaciones |
| D-15 | Registro | ✅ A: tabla `stretch_offers`, una fila por alumno y día |
| D-16 | Grupo de control y métrica | ✅ A: 20 % solo card, 40 % push +30, 40 % push +60 |

Las 16 decisiones están cerradas (lectura del 2026-11-11) y Franco pidió pasar a fase GSD sin esperar al kinesiólogo.

Queda para el planificador de la fase 213:

1. Sketch del reloj por ejercicio del player (D-07), antes del plan de interfaz.
2. Confirmar con un profe, cuando se pueda, si FL, FLR, PL y DS cuentan como tren superior (D-03); arranca con 9 rutas.
