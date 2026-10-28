# Fase 197: Entrenar en tabs + canasta de bloques + bloque libre — CONTEXT

**Fecha:** 2026-10-20 · **Rama:** `feat/197-entrenar` (worktree `/home/franco/projects/et-197-entrenar`, base `origin/master` `6d0298eef`) · **Sin push** hasta el OK de Franco (staging primero) · **Sin bump de versión**.

Fuente de las decisiones: discuss con Franco del 2026-10-20, registrado en `/home/franco/projects/el-templo/.docs/entrenar-197-decisiones.md` (D1–D18, gitignoreado). Ante una duda, manda ese archivo.

## Dominio

La pantalla Entrenar del app de socios (`el-templo-app/src/modules/training/`) pasa a tener **4 tabs**: Semana, Libre, Desafíos y Conquer. En **Libre**, el socio elige un **bloque de trabajo suelto** de las planis aprobadas de su subnivel, buscándolo por zona del cuerpo en una figura tocable. Lo hace en el **player existente**, en "modo bloque libre". El primer bloque libre del día que llega a 10 minutos suma **5 AURA**. Nada de esto toca racha, programa, evaluación/RPE ni la sesión del día.

## Fuentes canónicas (leer antes de planificar o ejecutar)

| Qué | Dónde |
|---|---|
| Decisiones D1–D18 | `/home/franco/projects/el-templo/.docs/entrenar-197-decisiones.md` |
| Sketch 015, Entrenar. **Fuente visual de verdad: `ronda3.html` (variante "Chips apilados ★")** | `/home/franco/projects/el-templo/.planning/sketches/015-entrenar-hoy/` (`README.md`, `ronda3.html`; Libre: `ronda2.html` / `ronda3.html`, tab LIBRE) |
| Sketch 016, player en modo bloque libre. **Ojo con las notas D13/D15 del README** | `/home/franco/projects/el-templo/.planning/sketches/016-player-bloque-libre/` |
| Corpus de la canasta (números, SQL, criterios) | `/home/franco/projects/el-templo/.docs/entrenar-rediseno/corpus.md` |
| Riesgos y costuras del código (file:line) | `/home/franco/projects/el-templo/.docs/entrenar-rediseno/riesgos.md` |
| Capturas "antes" y contraste medido | `/home/franco/projects/el-templo/.docs/entrenar-rediseno/antes/` (`RESUMEN.md` cuando esté) y herramientas en `.docs/entrenar-rediseno/herramientas/` |
| Tokens y componentes del rework (no reinventar) | `el-templo-app/src/css/_premium-card.scss`, `_brand.scss` (mixin `mt-block-title`), `_notify.scss`, `components/PremiumDialogCard.vue`, `PremiumGlassCard.vue`, `pages/ReservasPage.vue` (sketch 013 A) |
| Figura anatómica (origen) | `el-templo-admin/src/tv/recorrido/anatomia.json` + `anatomia.ts` (licencia MIT en el JSON); `figuras.ts` (paleta y rótulos) |
| Mapeo ejercicio → zonas (API) | `el-templo-api/src/modules/tv/muscle-zones.ts` + `test/tv/tv-muscle-zones.test.ts` |

Los sketches y `.docs/` viven en el checkout principal (`/home/franco/projects/el-templo`), no en esta rama. Se leen por ruta absoluta y no se copian al repo.

## Decisiones (bloqueadas)

### Estructura y alcance

- **D-01: base independiente.** La 197 no depende de la 196. La figura se lleva del admin a un **componente compartido del app**, con una sola copia (por ejemplo `el-templo-app/src/components/anatomy/`). La copia del JSON es byte a byte y se verifica con `cmp`. Se carga con `import()` dinámico y queda en su propio chunk. La tab **Conquer** muestra "Próximamente". Cuando la 196 se rebasee, reemplaza ese hueco y cambia su import a la figura compartida.
- **D-02: 4 tabs arriba**, estilo "puertas" **sin íconos** (sketch 015 ronda 3):
  - Rótulos "SEMANA · LIBRE · DESAFÍOS · CONQUER".
  - Alto 44 px.
  - La elegida en oscuro `#2c2318`, con crema `#f0e6d6` y la línea luminosa abajo, sin sombra.
  - Desafíos y Conquer llevan un punto ocre de "pronto".
  - **Siempre abre en Semana.** Se puede pedir Libre por query o ruta (ver D-15).
- **D-03: tab Semana** (sketch 015 ronda 3b, "Chips apilados ★"):
  - **Rango de la semana:** rótulo "12 AL 18 DE OCTUBRE" (Montserrat 700 11 px, mayúsculas, `#5a5347`) con flechas ‹ › de hitbox 44 que no suman alto.
  - **Tira de 7 días:**
    - Día elegido: blanco con borde terracota y número en terracota, **sin relleno**. El único terracota lleno de la pantalla es el CTA.
    - Hoy con borde de tinta.
    - Punto salvia en los días completados.
    - Domingo/sin plani con borde punteado.
  - **Fila título + CTA, mitad y mitad:**
    - Izquierda: kicker Cinzel 11 px en `#7e4529` ("HOY · VIERNES 16" / "MIÉRCOLES 14") y título Montserrat 700 28 px.
    - Derecha: CTA de 56 px, "Empezar" con destello (`pd-cta`).
    - Los otros estados usan el mismo lugar: "Ver resumen" (secundario, completada), "Hacerla igual" (pasado), "Disponible el {día}" (futuro, deshabilitado) y "Elegir un bloque libre" (sin plani, lleva a Libre).
    - Con la sesión completada, chip salvia "Hecha" debajo del título.
    - Si la completó hoy, link "¿Te quedaste con ganas? Sumá un bloque libre" que lleva a Libre.
  - **Título de la sesión:** se mantiene la fuente actual del app (lo que hoy muestra `DayCard`). No se inventa un título derivado.
  - **Bloques y figura:**
    - Columna izquierda: **chips de bloque apilados**, con rol arriba (Montserrat 800 11 px terracota) y nombre abajo (13 px, una línea con "…").
    - Columna derecha: la **figura** frente y espalda, de 220 px de alto.
  - **Bloque elegido:**
    - **NUCLEUS elegido por defecto.** Si no hay, el primer bloque después de INITIUM.
    - Siempre hay uno elegido: tocar el elegido no lo deselecciona.
  - **Zonas en la figura:**
    - Bloque elegido en terracota fuerte (degradé `#c47a52 → #8a4e30`).
    - Zonas de los otros bloques de esa sesión en tono medio `#d39a78` (borde `#b57b59`), **sin leyenda**.
    - Músculos no trabajados en `#e2d7c8`.
    - Sesión completada: las mismas dos intensidades en salvia.
  - **Debajo:** la **lista de ejercicios del bloque elegido**, en una card blanca:
    - encabezado con rol, nombre, formato · N ejercicios · grupos de zona;
    - filas con miniatura de video, nombre y dosis.
    - Sin cruz de cerrar.
  - **Sin** el resumen "bloques · duración · ejercicios" (Franco lo sacó).
- **D-04: tab Libre** (sketch 015 ronda 2/3, aprobada como está, con la escala de la ronda 3b). De arriba a abajo:
  - **Título** "Elegí qué trabajar" (28 px) y subtítulo "Bloques de las planis de tu nivel. Tocá una zona del cuerpo."
  - **Aviso de AURA:**
    - Con AURA disponible: "+5 AURA con el primero de hoy" (chip dorado, tinte `#f6efdc`, texto `#7d6520`).
    - Si ya la cobró hoy: "Ya sumaste tu AURA de hoy · podés seguir entrenando" (D-12).
  - **Sugerencia** (tarjeta salvia): "Para complementar lo de hoy: {grupos}".
    - Grupos = chips cuyas zonas no trabaja la sesión de hoy (menos de la mitad de sus zonas).
    - Sin plani hoy: "Esta semana trabajaste poco: {grupos}", calculado con lo completado en la semana.
    - Sus botones eligen la zona.
  - **Figura tocable:** tocar un músculo elige su **grupo**. Las zonas del grupo se encienden y el resto se atenúa.
  - **Chips de zona** equivalentes, por accesibilidad: Todo · Hombros · Pecho · Espalda · Core · Piernas · Brazos.
  - **Contador** "{n} bloques de {zona}".
  - **Lista de bloques** de 20 en 20 con "Ver más bloques". Cada card lleva:
    - rol (11 px);
    - título "Ruta · Formato" (D-09);
    - meta: formato con sus minutos o "≈N'", cantidad de ejercicios y grupos;
    - marca "Ya lo trabajaste hoy" si cruza 2 o más zonas con la sesión de hoy, y en ese caso va al final del orden;
    - botón "Empezar".
  - **Estado vacío** genérico por zona.
- **D-05: tabs Desafíos y Conquer.** Pantalla "Próximamente": ícono en círculo, kicker Cinzel "PRÓXIMAMENTE", título y una línea de texto (copys del sketch 015 ronda 2).
- **D-06: vidriera sin plan.** Con `!canEnterTraining` ya no se muestra solo "Activá Tu Plan".
  - Se ve Entrenar completo (tabs + Semana con figura) **desenfocado** y **no interactivo**.
  - Encima va la tarjeta "Activá Tu Plan" actual, con su CTA de WhatsApp, pasada al lenguaje del rework (hermana clara o pop-up, sketch 010/012).
  - El contenido de atrás es una **plani de ejemplo fija**: sin plan no hay nivel y la API puede dar 403.
  - Respeta "Reducir movimiento".
- **D-07: figura según el perfil.** Por `users.gender`: `female` → `fFront`/`fBack` y `fOutline`; `male`, `other`, `unspecified` o vacío → `mFront`/`mBack` y `mOutline`.

### Canasta (datos), a partir del corpus

- **D-08: fuente.**
  - Sesiones con `status='approved'` de la **plani regular** del **subnivel** del socio (alfa/delta/sigma/omega/spartan; kairos usa alfa; mismo criterio de nivel que usa hoy `/sessions/weekly`).
  - Solo fechas **≤ hoy**, sin semanas futuras.
  - **Excluir** planes de objetivo (`day_id` que empieza con `GP-`).
  - Roles de trabajo: NUCLEUS, DEUTEROS_1, DEUTEROS_2, ATHLOS, EPIKOS y **ROM_\* (incluidos)**.
  - Excluir INITIUM, TECNICA_\*, STRETCHING y COMBOS_\*.
  - Ocultar los bloques `_ALT`, igual que hoy.
- **D-09: duplicados, orden, página y título.**
  - **Duplicado:** misma ruta + patrón + `format_name` + lista ordenada de `exercise_id`, dentro del subnivel. El que queda es la aparición más reciente.
  - **Orden sin filtro:** aparición más reciente primero.
  - **Orden con zona:** primero los bloques con más ejercicios en esa zona. Después aplica la regla "ya lo trabajaste hoy al final" de D-04.
  - **Página** de 20 (`page` / `limit`, respuesta `{items, total, page, limit}`).
  - **Título:** "Ruta · Formato", porque `custom_title` está vacío en todos los bloques de trabajo. Subtítulo con los primeros ejercicios.
- **D-10: zonas.**
  - Se calculan en el API con `muscle-zones.ts` (sin duplicar el mapeo en el app). Zonas de un bloque = unión de las de sus ejercicios. ROM usa el fallback por rol.
  - Los 6 grupos (chips) son:
    - Hombros = deltoids
    - Pecho = chest
    - Espalda = upper-back + lower-back + trapezius
    - Core = abs + obliques
    - Piernas = quadriceps + hamstring + gluteal + calves + adductors
    - Brazos = biceps + triceps + forearm
  - El filtro es **por grupo**: tocar gemelos elige Piernas.
  - Las zonas también se agregan a cada bloque del payload de `/sessions/weekly` (y `/daily` si comparte `sessionToResponse`), porque Semana pinta la figura.
- **D-11: formato AMRAP Series.** `amrap_series {rounds: 3, minutes: 10}` son 3 rondas **dentro de 10 minutos en total**. Se muestra "AMRAP · 10' · 3 rondas". Los sketches dicen "AMRAP 3 × 10'" por error.

### Bloque libre: reglas

- **D-12: completo y AURA** (regla final, D15 del registro):
  - **Cuenta y se guarda** al terminar sus ejercicios, sin mínimo de tiempo. Si **abandona antes, no se guarda nada**.
  - Si el formato no declara minutos, el **reloj corre libre**.
  - **+5 AURA** solo si el reloj marcó **≥ 10 minutos**, en **todos** los formatos (un EMOM 3' cobra solo si se repite).
  - **Uno por día:** lo cobra el **primer bloque libre del día que llega a 10'**. El día se toma en la **zona horaria de la sede** (`todayInTz` + `branches.timezone`), no en UTC. Un bloque guardado sin AURA no consume el cupo.
  - Candado en la DB: unique `unique_user_source_ref` de `aura_transactions` con `referenceType='extra_block_day'` y `referenceId` derivado de la fecha local (por ejemplo `YYYYMMDD` como entero). El segundo intento tira error y se captura.
  - Fuente de AURA nueva **`extra_block`**, con **5** en `aura_config`. Se agrega al ENUM de `aura_config` y `aura_transactions` con una migración `MODIFY COLUMN ... ENUM(lista completa)` más `INSERT IGNORE` (precedente `0198_aura_source_tenure_milestone.sql`). También se suma a los arrays de schema y a la unión TS `AuraSourceType`.
- **D-13: aislamiento de contadores (invariante testeado).**
  - El bloque libre se registra en una **tabla propia `extra_blocks_completed`**: gym-owned, `tenant_id`, `user_id`, referencia al bloque de origen, fecha local, inicio, fin, duración en segundos, ejercicios completados (**ids de ejercicio**, con ese nombre) y flag `aura_awarded`.
  - **No escribe** `completed_sessions` y **no llama** `updateStreak`, `recordSessionForProgram` ni la notificación post-sesión.
  - En consecuencia, no cambian: racha, programa, RPE de la evaluación, `todaySession`, `completedDates` y `totalDaysTrained`.
- **D-14: endpoints nuevos** dentro de `sessionsPlugin` (`moduleScope "templo-training"`), con el mismo gate de acceso que `/sessions/weekly` (presencial activo o programa activo):
  - **Lista de la canasta:** paginada y con filtro de grupo. Devuelve también `auraAvailableToday`. Los bloques usan la misma forma que `sessionToResponse`, más `zones`, `groups`, `title` y la fecha de última aparición.
  - **Cierre del bloque libre:** recibe bloque de origen, `startedAt` y ejercicios completados. El servidor calcula la duración, inserta y acredita si corresponde. Devuelve `{auraAwarded, auraAvailableToday}`.
  - Paths y nombres a criterio del planner, por ejemplo `GET /api/sessions/free-blocks` y `POST /api/sessions/free-blocks/complete`.

### Player en modo bloque libre (sketch 016, con D-12)

- **D-15: modo bloque libre.**
  - Ruta propia (por ejemplo `/training/libre/:blockId`) con una **Session sintética de 1 bloque** inyectada, en vez de `weekStore`.
  - **`dayId` sintético propio** (por ejemplo `XB-{blockId}`), para no chocar con el progreso guardado de la sesión real (`session_progress_{userId}_{dayId}`).
  - **Neutralizar los casos especiales:**
    - NUCLEUS salta al índice 2 y no pausa el timer (`useSessionPlayer.ts:229-241` y `DayPlayer.onBlockComplete`);
    - DEUTEROS asume 4 bloques y deja `playableBlocks` vacío;
    - `isLastBlock` de `StoryExerciseCard` solo considera ATHLOS/EPIKOS: en modo libre el bloque único siempre es el último.
  - **El modo libre no hace nada de esto:** `markDayCompleted`, contadores de semana y total, RPE, notas, "Repetir" ni ajuste de dificultad (`/exercise-adjustments`).
  - **Pantallas:**
    1. **Inicio:** hermano de los pop-ups (marco con degradé, línea luminosa, `pd-cta` "Empezar").
       - Kicker "BLOQUE LIBRE · NIVEL {X}", título con el nombre del bloque y meta con formato y ejercicios.
       - Chip "+5 AURA al completarlo" en dorado, o "Ya sumaste tu AURA de hoy".
    2. **En curso:** misma estructura del player.
       - El encabezado dice "BLOQUE LIBRE · {ROL}" + nombre.
       - **Barrita dorada bajo el timer hasta 10'**, solo si `auraAvailableToday`.
       - Sin "Ver bloques anteriores".
    3. **Bloque completo:** "Ver resumen" y "Volver al último ejercicio".
    4. **Celebración:** "¡Bloque completado!".
       - Si acreditó: "+5" grande en dorado `#d4b46a` con "AURA" y "Tu primer bloque libre de hoy".
       - Si no: "Sumaste otro bloque a tu día".
    5. **Resumen:** kicker "BLOQUE LIBRE · {día}", "¡Listo!", el bloque con ejercicios tildados, minutos de trabajo y ejercicios.
       - "Sumaste 5 AURA" si acreditó.
       - Si terminó en **menos de 10' y todavía hay AURA hoy**: "Para sumar AURA hacen falta 10 minutos" y "Seguir entrenando", que da otra vuelta con el reloj corriendo. Si sale, queda guardado sin AURA.
       - Al pie, "Listo" (vuelve a Libre) y "Elegir otro bloque".
  - `GoalPlanSession.vue` reusa `SplashScreen`, `TransitionScreen` y `CelebrationScreen`: los cambios de props no lo pueden romper.

### Contraste y alcance visual

- **D-16: player y Guía.** No se rediseña su estructura. Entran:
  - el modo libre;
  - los tokens del rework en lo que toca el modo libre;
  - los **ajustes de contraste importantes** en player (sesión completa incluida) y Guía.
  - Regla: **texto siempre en color sólido, nunca `rgba(..., <1)` ni opacidad en `color`**.
  - Fallas conocidas (relevamiento del 2026-10-20, a confirmar con `antes/RESUMEN.md`):

    | Texto | Contraste hoy |
    |---|---|
    | Autor de la cita (blanco .5) | 4,2:1 |
    | Parámetros del formato (negro .5) | 3,9:1 |
    | Descripción del formato (negro .45) | 3,3:1 |
    | "Ver bloques anteriores" (negro .4) | 2,8:1 |
    | Título "Resumen de sesión" (terracota .6) | 2,4:1 |
    | Mensaje del RPE (terracota .8) | 3,3:1 |
    | "Objetivo" del ajuste (secondary .65) | 2,6:1 |
    | "DESCANSO ACTIVO" (blanco .5) | 4,2:1 |

  - Reemplazos: `#6b6459` (5,0:1 sobre crema), `#2c2318`, `#7e4529` (kicker) y crema sólido `#e3c9a8` / `#c9bba6` sobre oscuro.
- **D-17: Mi Templo.** Link chico **"Probá el modo Libre"** en la card de hoy, que abre Entrenar en la tab Libre.
  - Se muestra solo **después de la clase del día o en días sin clase**. Antes de la clase la card queda como hoy.
  - El criterio exacto de "después de la clase" (check-in hecho, horario de la reserva terminado o sesión online completada) lo fija el planner leyendo la `TodayCard` actual. Si hay duda, va lo más conservador: check-in hecho o sin reserva hoy.
- **D-18: escala y tokens.**
  - Escala tipográfica **28 / 17 / 16 / 13 / 11**.
  - Margen 16, grilla de 8, hitbox ≥ 44.
  - Un solo estilo de título de bloque (mixin `mt-block-title`).
  - Copy con voseo y tildes; "clase" y no "turno".
  - El dorado se usa solo para AURA.
  - Si falta un token o mixin, se crea en `_brand.scss` / `_premium-card.scss` y se reusa. No se copia CSS.

## Fuera de alcance

- La fase 198 (AURA configurable desde el admin).
- El contenido de Desafíos y de Conquer (la 196).
- La bienvenida TV con alternativas.
- El validador de balance.
- Instrumentación de toques (descartada, D6).
- El rediseño estructural del player y de la Guía.
- Desktop ≥ 768 px, más allá de no romperlo.
- El **bug de ids de `tree-progress`** (confirmado en `riesgos.md` §4). Va como pendiente aparte y no se toca acá.
- La `TodayCard` más allá del link de D-17.

## Restricciones técnicas

- **Migraciones:**
  - La última en master es `0283`. La 196 tiene que renumerar su `0279_conquer` y ya usa `0281`/`0282`. **Por eso se deja `0284` libre para la 196 y la 197 usa `0285` en adelante.**
  - SQL a mano junto al schema Drizzle, **sin `;` en comentarios**, aplicado con el runner propio (`pnpm db:migrate`). Nunca `drizzle-kit migrate`.
  - Los datos de prod (fila de `aura_config`) también van por migración.
- **Tenancy:**
  - **Tabla nueva:** `GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES` en `db/tenant-tables.ts`, y conteos 103→104 / 108→109 en:
    - `test/db/tenant-tables.test.ts:122/127`;
    - `0192-0195-tenant-columns.test.ts:180`;
    - `0196-tenant-unique-contracts.test.ts:~643`.
    - Además, `TABLES_TO_CLEAN` y `limpiarSegundoGimnasio`.
  - **Rutas nuevas:** entrada en `test/tenant-manifest.ts` y `ENTRADAS_BASELINE` de `iso-01-manifiesto.test.ts` (473 + n). Confirmar el tercer gate ISO-03 para `/api/sessions`.
  - `pnpm lint:tenant` limpio.
  - Detalle completo en `riesgos.md` §6. Ejemplos: commits de novedades `e987b707e`/`e55f5f3a0` y de sponsors `7ce1debd9`/`cf2050275`/`1369d41c3`.
- **Tests de integración del API** (obligatorios, en `el-templo-api/test/`; corren en **CI**, no localmente):
  - canasta: subnivel, ≤ hoy, sin GP, roles, duplicados, orden, filtro por grupo, paginación, gate de acceso;
  - cierre: guarda, duración calculada en el servidor;
  - AURA: 10' sí y <10' no, primero del día sí y segundo no, cupo intacto tras <10', día en la zona de la sede;
  - **invariantes de contadores:** `completed_sessions`, racha, programa y `todaySession` sin cambios;
  - tenancy;
  - `zones` en `/weekly`.
  - Tests unitarios donde haya lógica pura (sugerencia de complemento, agrupación de zonas, orden).
- **Reglas de los tests:**
  - Sin ids de `users` hardcodeados.
  - Fechas relativas a `Date.now()` con fake timers. Nada de fechas fijas que se rompan con el calendario.
  - `cleanAllTestData` no limpia `tenant_settings`.
- **Código:**
  - Front: `createLogger()`, nunca `console.*`.
  - Sin `any`, `catch (err: unknown)`.
  - Composables con `cleanup()` y sin `onUnmounted`.
  - Stores Pinia setup.
  - Sin dependencias nuevas.
  - Sin CDN.
  - `git add` explícito (nunca `-A` / `.`). Prohibido `git stash` en worktrees.
- **Sin línea base de typecheck ni `pnpm install` en el worktree** (D12, Franco). La verificación local por plan es la revisión del diff, el worktree limpio y los greps. El resto lo valida CI.

## Lecciones de fases anteriores (para los ejecutores)

- Comandos en primer plano. Prohibido `run_in_background` y los loops de espera con `pgrep`.
- No commitear docs en el checkout principal. Todo va en el worktree `et-197-entrenar`.
- Si un fix toca solo tests, también hay que tocar código de producción del mismo componente, para que el deploy (paths-filter) lo construya.
- Contraste medido sobre el fondo real (las herramientas en `.docs/entrenar-rediseno/herramientas/`), nunca sobre la tabla calculada.
- Franco corrige mirando la app real: se respetan los sketches ganadores al píxel razonable, con contenido y estados extremos (nombre largo, zona con 1 bloque, muchas páginas, día sin plani).
- Zona horaria de la sede, nunca UTC.
