# Fase 160 — Semana nueva frontend: admin UI, horarios, app, PDF y TV

**Milestone v5.6 (combos + técnica). Depende de la fase 159 (backend, YA hecha y verificada 24/24).**
**Base de rama:** `et-159` / `feat/159-semana-nueva-backend`, rebaseada sobre `origin/master` (`4ebc3a2c`) → tiene el backend de 159 + el TV/PDF más reciente de master. **159 y 160 se shippean JUNTAS** (decisión de Franco).

---

## Objetivo

La 159 genera y persiste sesiones combos/técnica (roles `COMBOS_I/II`, `TECNICA_I/II`, `STRETCHING`; modos `combos`/`tecnica`), pero **ninguna superficie de lectura las conoce todavía**. La 160 le enseña a 4 superficies (TV, PDF, admin UI, member app) + los diccionarios de labels a reconocer los 5 roles y 2 modos nuevos.

**Por qué es necesaria antes de shippear (no solo cosmética):** hoy un día combos/técnica aprobado en prod caería:
- **TV** → en `REGULAR_ROLES` (`roster.ts`), no encontraría los roles, mostraría **solo INITIUM** (la clase desaparece de la pantalla).
- **PDF** → en la rama "regular" (`sessionsToPdfDay`), no encontraría los bloques, saldría **solo INITIUM + página de cierre**.

No hay bug vivo hoy porque no existen sesiones combos/técnica en prod — pero shippear 159 sola las rompería apenas el profe genere una. De ahí que 159+160 viajen juntas.

---

## Requirements (del ROADMAP v5.6)

- **SEM-07** — GeneratePage: sumar combos/técnica al selector de tipo de sesión por día + badges en SessionsPage.
- **SEM-08** — Editor de bloques Combos con la forma de reps actual (rounds + reps por ejercicio).
- **SEM-09** — PDF de combos y técnica, con el bloque STRETCHING.
- **SEM-10** — Render en la member app de los días nuevos.
- **SEM-11** — Labels de roles centralizados en TODAS las superficies, incl. rename A/B.
- **SEM-14** — Horarios/app: nombre de clase derivado de la sesión generada (Combos/Técnica/General).
- **SEM-15** — TV de sucursal renderiza los días nuevos (coordinar con el trabajo TV vivo).

---

## Decisiones de producto CERRADAS (Franco, 2026-08-14)

### D160-01 — SEM-07: selector de modo en el generador
Control de "modo por día" **en el área de generación** de `GeneratePage`, **separado** de la tabla `day_modes` persistida (que sigue solo `regular`/`rom` — el enum de `PUT /admin/sessions/day-modes` NO se toca; D-02 de la 159 lo prohíbe: combos/técnica son override por-corrida, no default persistido).
- **Default del frontend (constante, NO persiste): miércoles → Técnica, jueves → Combos.** El profe abre el generador y lo ve seteado, editable por corrida.
- El override viaja por el canal ya existente: body `dayModes` de `POST /admin/generate` (enum `["regular","rom","combos","tecnica"]` ya aceptado en `admin/schemas.ts:70-76`, ya consumido por `generateWeek`).
- **Falta cablear el frontend:** `useGenerateApi.generateWeek()` no acepta `dayModes` en `options`; `GeneratePage.handleGenerate()` no lo arma ni envía.

### D160-02 — SEM-11: convención de labels
`COMBOS I` / `COMBOS II`, `TÉCNICA I` / `TÉCNICA II`, `STRETCHING` (a secas) en TV y PDF, espejando el patrón `DEUTEROS I/II` ya existente. Badge corto del listado admin (`SessionsPage`/`routesSummary`) = `I` / `II` / `Stretch` (reusa el espacio que liberó el rename DA/DB de la 159; resuelve el fallback `charAt(0)`→`"C"`/`"T"` que dejó el verifier de 159).

### D160-03 — SEM-11: alcance de centralización
**Un diccionario de rol→label por app** (1 fuente en `el-templo-api`, 1 en `el-templo-admin`, 1 en `el-templo-app`; 11+ copias → 3), con el patrón "espejo a propósito" ya usado en el repo (`roster.ts`/`route-labels.ts`). **NO** paquete compartido cross-app (sería desviación arquitectónica: bundles/runtimes separados, no hay infra de monorepo compartido hoy). Cada centralización también sincroniza las divergencias existentes (Initium vs Pyros, Deuteros vs Deuteros 1/2).

### D160-04 — SEM-09/SEM-15: layout de STRETCHING
**Lista simple compartida estilo INITIUM** (una lista de ~4 ejercicios común a los 6 niveles, sin grid por nivel), porque el generador hace STRETCHING idéntico en los 6 niveles (pool de movilidad compartido). Reusar el patrón `buildInitiumPage`-style, no el grid de NUCLEUS/DEUTEROS.

---

## Ítem ABIERTO (resolver en plan-phase)

- **SEM-14 / SEM-10 "member app":** el relevamiento NO encontró dónde el member app muestra hoy `activityName` (búsqueda vacía en `progression/`). Confirmar si es una superficie nueva a construir o un módulo no ubicado (p.ej. checkin). La derivación de nombre (Combos/Técnica/General) es en tiempo de LECTURA: la fila `activities` quedó fija en "General" (mig 0204); combos/técnica se derivan del `sessions.sessionMode` de la sesión aprobada de esa semana/día, análogo a `resolveClassDay` (TV). No hay endpoint liviano "¿qué modo tiene el día X semana Y?" hoy — decidir si se reusa/expone algo de `resolveClassDay`/`day_modes` o consulta nueva sobre `sessions.sessionMode`.

---

## Mapa de superficies (del relevamiento Explore, 2026-08-14)

### TV (SEM-15)
- **`el-templo-api/src/modules/tv/roster.ts`** — fuente única del roster. Hoy `REGULAR_ROLES` y `ROM_ROLES`; `buildRoster()` (~L227) elige según `classDay.mode`. **Falta rama combos/tecnica** + entradas en `ROLE_LABELS` (~L92). `blockTitle()` (~L210) cae a rol crudo si falta.
- **`el-templo-api/src/modules/tv/class-day.ts`** — `resolveClassDay` ya lee `sessionMode` (~L175, base a construir, no reemplazar) pero `TvClassMode` (`types.ts:96`) es binario `"regular"|"rom"` → ampliar a `combos`/`tecnica` (o campo aparte — decidir en plan). `visualGroupOf()` (~L134) colapsa DEUTEROS_1/2; COMBOS/TECNICA I/II **NO** deben colapsarse (el default retorna rol tal cual = correcto, confirmar).
- **`el-templo-admin/src/pages/TvControlPage.vue`** — renderiza botones genéricamente desde `context.blocks` → debería andar sin cambios una vez el roster emita los roles nuevos (salvo `visualGroupOf` duplicado ~L799).
- **`render.ts` / TvScreenPage** — rediseño reciente estabilizado, NO re-tocar layout. ⚠ `render.ts` es idempotente por claves `last*` (`lastListKey`, `lastFormatoRaw`) — campo nuevo del payload debe entrar en esas claves o "se pega".

### PDF (SEM-09)
- **`el-templo-admin/src/utils/pdf/session-data-transformer.ts::sessionsToPdfDay()`** (~L401) — 2 ramas (`isRom` / else regular). **Falta rama combos/tecnica.**
- **`session-pdf-builder.ts::buildDayContent()`** (~L1054) — mismo patrón 2 ramas; falta tercera rama de layout (probablemente `buildFullBlockPage` genérico sirve para COMBOS/TECNICA I/II; STRETCHING = página estilo INITIUM por D160-04).
- **YA resuelto:** `formatNameWithParams` (`session-data-transformer.ts:62` + espejo `format-params.ts:603`) ya maneja `combos` (rounds-only) y `stretching` (default). ⚠ **3 copias espejo** — tocar una = tocar las otras en el MISMO commit (`format-params.ts:589-593` lo exige por escrito). ⚠ commit `39281671` (tabata sin rondas / formato del nivel canónico) tocó este código — revisar antes de extender.

### Admin UI (SEM-07, SEM-08)
- **`GeneratePage.vue`** — `MODE_OPTIONS` (~L384) solo Regular/ROM (tabla persistida, NO tocar su enum). Sumar control nuevo de override por día (área "Alcance de generación" ~L42-80). `handleGenerate()` debe armar+enviar `dayModes`.
- **`useGenerateApi.ts::generateWeek()`** (~L36) — extender `options` para pasar `dayModes` al body.
- **`SessionsPage.vue`** — `isDayGroupRom()` (~L407) + `isRom` de `dayGroups` (~L429) solo chequean `'rom'`; extender a combos/técnica (usan `DISPLAY_LEVELS` normales, 6 niveles). Badges nuevos.
- **`EditableBlockCard.vue`** — `ROLE_DISPLAY_NAMES` (~L400) solo ROM → agregar labels D160-02; color del header (~L436) sin rama combos/técnica/stretching. `FormatParamsEditor.vue` (~L219) YA agrupa `combos` rounds-only; `block-validator.ts` YA restringe formatos por rol → SEM-08 es casi solo labels/colores + verificar que el dropdown use el fetch de formatos compatibles con el rol real.

### Member app (SEM-10)
- **`useSessionPlayer.ts::playableBlocks`** (~L65) YA genérico: sin DEUTEROS reproduce todos los bloques en orden → lógica probablemente sin cambios.
- **`types/session.ts`** — `BlockRole` (union cerrado ~L12) y `Session.sessionMode` (~L140 `'regular'|'rom'`) → ampliar. Al ampliar, TS forzará a completar TODOS los `Record<BlockRole,...>` (ventaja: no quedan huecos silenciosos). Labels: `BlockCard.vue:89`, `DayPlayer.vue:267`, `BlockProgressionView.vue:193`, `useGoalPlanSession.ts:88` + duplicado `GoalPlanSession.vue:232`, colores `blockColors.ts` (4 funciones).

### SEM-11 — inventario de copias rol→label (11+, en 3 apps)
1 `tv/roster.ts:92` (TV) · 2 `pdf/session-data-transformer.ts` literales+`ROM_ZONE_LABELS:390` (PDF) · 3 `admin/service.ts:174-183` (badge admin, tocado en 159) · 4 `EditableBlockCard.vue:400` + 5 colores `:436` (admin editor) · 6 `useGoalPlanSession.ts:88` + 7 `GoalPlanSession.vue:232` (dup) · 8 `DayPlayer.vue:267` · 9 `BlockProgressionView.vue:193` · 10 `BlockCard.vue:78` · 11 `blockColors.ts` (app). **Ya divergentes entre sí** → la centralización (D160-03) sincroniza además de agregar.

---

## Restricciones / no-pisar
- NO extender el enum de `PUT /admin/sessions/day-modes` (D-02). El único canal de combos/técnica es el body `dayModes` de `/generate`.
- NO re-tocar el layout visual reciente de TV (`28d926dd`/`b89521d1`/`30e8601e`) — SEM-15 = solo datos (roster + labels).
- `formatNameWithParams` y `FORMAT_DICTATED_TYPES`: sincronizar copias espejo en el mismo commit.
- Staging-first estricto; 159+160 se pushean juntas. Migraciones: la 160 probablemente NO trae migraciones nuevas (es frontend/lectura) — verificar en plan-phase.
