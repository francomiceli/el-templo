# Fase 201 — Reglas para el ejecutor (gsd-executor, model sonnet)

Este archivo es INPUT de todos los planes 201-NN. Leerlo entero antes de la primera tarea. Ante una duda de producto
manda `201-CONTEXT.md` (D-01..D-22) y, detrás, `ref/conquer-desarrollo-sintesis.md` (la spec). Los defaults de las
ambigüedades (A1–A19 de `201-RESEARCH.md` §9.2) están ADOPTADOS por D-20: no re-interpretar. Si aparece una ambigüedad
NUEVA, anotarla en el SUMMARY con la opción elegida (la más simple que cumpla la spec) y seguir: la cadena no se frena
con preguntas.

## Entorno

- Worktree: `/home/franco/projects/et-201-conquer`, rama `feat/201-conquer` (base `origin/staging`, tiene la 197).
  Trabajar SOLO acá, con rutas absolutas en cada comando (el cwd se resetea entre llamadas). Si el harness rechaza un
  `cd X && git ...` compuesto, separar en dos llamadas.
- El checkout principal `/home/franco/projects/el-templo` y la rama 196 (`/home/franco/projects/et-196-personalizados`,
  la "cantera", D-03/D-04) son de SOLO LECTURA. Se copian piezas de la 196 leyendo por ruta absoluta; nunca se escribe ahí.
- **GATE DE PRE-FLIGHT (`node_modules`):** los gates locales (`npx tsc --noEmit`, `pnpm lint:tenant`, `pnpm typecheck:tests`,
  `pnpm lint`, `vue-tsc`) necesitan `node_modules` en `el-templo-api`, `el-templo-app` y `el-templo-admin` del worktree. Los instala
  el ORQUESTADOR (con OK de Franco) ANTES del plan 201-01. Primer comando de CADA plan:
  `test -d /home/franco/projects/et-201-conquer/el-templo-api/node_modules && test -d /home/franco/projects/et-201-conquer/el-templo-app/node_modules && test -d /home/franco/projects/et-201-conquer/el-templo-admin/node_modules`.
  Si falla: PARAR el plan sin tocar nada y reportarlo (sin node_modules, 201-01 no arranca). El ejecutor **NUNCA** corre
  `pnpm install`, `pnpm add`, `npm i`, `pnpm update`, ni crea symlinks a `node_modules` ajenos.
- `vue-tsc` no está en app ni admin y NO se instala. Se usa EN SOLO LECTURA el binario
  `/home/franco/projects/et-195-seo/el-templo-web/node_modules/.bin/vue-tsc` (fallback:
  `/home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc`). Criterio: ningún error en archivos del
  plan (hay errores preexistentes ajenos; filtrar con `grep`).
- **Sin dependencias nuevas (D-19).** Sin CDN (los HTML de `ref/` linkean Google Fonts: NO copiar esa línea). Sin bump de
  versión (`package.json`, `version.txt` quedan como están). Nada de SSH, nada de `git push`.

## Gates locales por tarea

- API (toda tarea que toca `el-templo-api/src` o `el-templo-api/test`):
  - `cd /home/franco/projects/et-201-conquer/el-templo-api && npx tsc --noEmit`
  - `cd /home/franco/projects/et-201-conquer/el-templo-api && pnpm lint:tenant`
  - Si toca tests: `cd /home/franco/projects/et-201-conquer/el-templo-api && pnpm typecheck:tests 2>&1 | grep -E "test/(conquer|unit/conquer|migrations/0290)"`
    → no tiene que imprimir nada (hay deuda preexistente ajena; el criterio es que NINGÚN archivo del plan aparezca).
- App: `cd /home/franco/projects/et-201-conquer/el-templo-app && pnpm lint` y
  `$VUE_TSC --noEmit -p /home/franco/projects/et-201-conquer/el-templo-app/tsconfig.json 2>&1 | grep -E "src/modules/conquer|<otros archivos del plan>"` vacío.
- Admin: igual con `el-templo-admin`.
- Módulos puros del motor (`engine.ts`, `calendar.ts`, `rules.ts`, `lighting.ts`): CERO imports, sin `enum`, sin
  `namespace`, sin parameter properties (tienen que correr con `node --no-warnings` por type-stripping de Node 22).
  Se verifican con `node --no-warnings /home/franco/projects/et-201-conquer/el-templo-api/test/conquer/oracle-check.mjs`
  (lo crea 201-02 y lo amplían 201-03 y 201-04).
- Greps de higiene en todo archivo tocado (tienen que NO imprimir nada):
  - `grep -nE "console\.(log|warn|error|info|debug)" <archivos>` (front: `createLogger()`; API: `request.log`/`fastify.log`).
  - `grep -nE ":\s*any\b|<any>|as any\b" <archivos>`.
  - En `.vue`/`.scss` del app: `grep -nE "fonts\.googleapis|fonts\.gstatic" <archivos>` (sin CDN).
- `grep -c` cuenta comentarios: si un gate cuenta tokens, filtrar antes (`grep -vE "^\s*(//|\*|/\*|<!--|--)" archivo | grep -c token`).
  Nunca un gate `== 0` sobre un archivo sin filtrar.
- Al cerrar cada plan: `git -C /home/franco/projects/et-201-conquer status --porcelain` tiene que salir VACÍO.

## Tests

- Se ESCRIBEN siempre (integración del API en `el-templo-api/test/conquer/`, unitarios puros en `el-templo-api/test/unit/`,
  utils puras del app en `el-templo-app/src/modules/conquer/**/__tests__/`). **Corren en CI, NO localmente** (regla del
  proyecto). PROHIBIDO `pnpm test`, `vitest run` y cualquier corrida de vitest local. El admin no tiene vitest.
- Comandos SOLO en primer plano. **PROHIBIDO `run_in_background`, `&`, `nohup`, y loops de espera con `sleep`/`pgrep`/`ps`**
  (se matchean a sí mismos y quedan colgados).
- **Mutation testing razonado:** cada plan con tests lista 2-4 mutantes. Para cada uno: aplicar el cambio en el código de
  producción, confirmar LEYENDO el test qué `expect` concreto fallaría (citar archivo y línea en el SUMMARY), y revertir
  (`git diff` limpio sobre ese archivo antes de commitear). En los módulos puros, además, correr `oracle-check.mjs` o el
  `node -e` del plan con el mutante aplicado y ver que falla. Si un mutante no lo atrapa ningún test, agregar el test.
- Usuarios SIEMPRE con fábricas (`createTestMember`, `createStaffUser`, `registerUser`); NUNCA ids de `users` hardcodeados.
- Fechas relativas: `todayInTz(tz)`, `addDays`, `mondayOf`/`shiftDate`. Literales de calendario SOLO en tests unitarios
  puros. Historial de días pasados: insertarlo DIRECTO en la base con la fábrica `insertConquerSession` de
  `test/conquer/_helpers.ts` (el archivo nace en 201-05; `insertConquerSession` la agrega 201-07); `PUT /sessions` solo para "hoy". Si hace falta fijar
  "hoy": SOLO `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)` calculado desde `Date.now()` real, ANTES
  de loguear, y `vi.useRealTimers()` en `afterEach`.
- Queries directas de un test a tablas strict (todas las `conquer_*`, `users`, `tenant_settings`) llevan
  `tenantWhere(tabla, TEMPLO_CTX)` (`TEMPLO_CTX` se exporta de `test/conquer/_helpers.ts`). INSERT directos con
  `tenantValues(TEMPLO_CTX, {...})`.
- `cleanAllTestData` limpia las 6 tablas de ESTADO (`conquer_session_steps`, `conquer_sessions`, `conquer_steps`,
  `conquer_alerts`, `conquer_body_checks`, `conquer_members`) pero NO el catálogo (`conquer_ladders`, `conquer_rungs`,
  `conquer_exercises`, `conquer_template_days`), que lo siembra la migración 0292. Un test que modifique el catálogo
  restaura la fila original en `afterEach`/`afterAll`. `tenant_settings` tampoco se limpia: borrar `conquer.%` a mano en
  `beforeEach`/`afterEach` del test que lo toque.
- Toda ruta nueva: test de integración con (a) el caso feliz, (b) el rol sin permiso (403) donde aplique, (c) el recurso
  ajeno (otro alumno / otro gimnasio con `seedSecondTenant`) → 404, nunca 200 ni 500, (d) validación (400).
  Toda ruta con 2+ ids anidados valida la pertenencia de cada hijo a su padre y al tenant + test cross-ID.
- Fastify con `additionalProperties:false` DESCARTA claves extra (no las rechaza). Cada campo nuevo de una respuesta necesita
  su entrada en el JSON-schema de respuesta o el serializador lo borra en silencio.
- El MySQL local corre en otra zona horaria que Node: comparar timestamps en SQL, nunca contra `new Date()` de JS. MySQL
  redondea TIMESTAMP al segundo.

## Código

- API: Fastify + Drizzle. Logs con `request.log`/`fastify.log` (Pino), nunca `console.*`. **Nunca loguear claves de foto,
  URLs firmadas, perímetros ni peso** (solo `{ checkId, pose }`).
- Toda query sobre una tabla gym-owned: `tenantWhere(tabla, ctx)` en lecturas/updates/deletes y `tenantValues(ctx, {...})` en
  inserts (`src/modules/shared/tenant.ts`, import por path directo). En `sql` crudo, `tenant_id = ${ctx.tenantId}` inline.
  `ctx` sale SIEMPRE de `await attachCountryScope(request, fastify.db)` + `assertTenant(request.scope, "conquer.<algo>")`,
  nunca del body ni del query. `userId` del alumno SIEMPRE de `request.user.userId`. No agregar nada a
  `tenant-lint-allowlist.json` (salida válida alternativa: `/* tenant-safe: motivo */`).
- Columnas en `.select({...})` de un join: SIEMPRE calificadas (`schema.tabla.columna`). `FOR UPDATE` primero en la tx.
  Variable asignada dentro del callback de `db.transaction`: `let x = null as number | null`.
- Rutas Conquer: alumno bajo `/api/members/conquer`, admin bajo `/api/admin/conquer`, ambas registradas con
  `moduleScope(app, "templo-training", ...)` en `src/app.ts`. Guard de rol del admin en `onRequest` (NO en `preHandler`:
  con preHandler un rol sin permiso con body inválido recibe 400 en vez de 403), resuelto SOLO con
  `canManageConquer` de `src/modules/conquer/permissions.ts` (D-08; un solo helper). Fotos: `canViewConquerPhotos`.
- Cada ruta nueva: entrada `"MÉTODO /url"` en `test/tenant-manifest.ts` con `categoria: "templo-module", modulo: "templo-training"`
  y `ENTRADAS_BASELINE` de `test/tenancy/iso-01-manifiesto.test.ts` sumando N SOBRE EL VALOR ACTUAL (aritmética, no copiar
  un número de otro lado) + el número en el título del `it` + una línea de comentario con la fecha y la fase.
- Errores de negocio: `AppError(mensaje en español, status, CODE)` con `CODE` en MAYÚSCULAS (`CONQUER_...`); las rutas
  serializan `{ error, code }` explícitamente cuando el app necesita ramificar.
- Funciones de más de ~80 líneas: partir en helpers con nombre. Explícito > ingenioso. Comentarios en español citando la
  decisión: `// Fase 201 D-16: ...` o `// Fase 201 §4.4: ...`.
- El app NUNCA recalcula el motor: pinta objetivo/estado/propuestas que manda el API (anti-patrón de la research).
- Front (Quasar + Vue 3.5 + Pinia): `createLogger()` de `src/utils/logger.ts`; stores con `defineStore('x', () => {...})`;
  composables exponen `cleanup()` y NO usan `onUnmounted` adentro; sin `any`; `catch (err: unknown)` + `instanceof Error`.
  Toda acción muestra el `error` del API en un `Notify` (los 409/400 traen copy en español); botones con `:loading`.
- Formato a mano (en este worktree el pre-commit NO corre). App y admin (`.prettierrc.json`): sin punto y coma, comillas
  simples, ancho 100. API: con punto y coma, comillas dobles, ancho 80, comas finales. Imitar el archivo vecino.
- Copy en español rioplatense con voseo y tildes ("clase", nunca "turno"). Al alumno, Conquer es "Conquer" y los niveles
  "Ternero", "Novillo", "Toro".
- **Estética (variante B · Pórtico nocturno, hallazgo 2 del UAT local; SUPERA la versión D-09/D-22 de sol, nubes y Cormorant):**
  manda la sección "Estética" de `201-28-PLAN.md` (DA-15 a DA-18) y el sketch
  `/home/franco/projects/el-templo/.planning/sketches/022-conquer-templo-clasico/` (variante B, solo lectura). Conquer usa
  la página, las cards, los botones y la tipografía del app. Los colores de Conquer (azul noche `#131d44`, dorados) van en
  terminaciones y en UNA pieza oscura (`.cq-dark`, `CqPortico`). Nada de sol, nubes ni lo "dreamy". Fuentes del app en todo,
  también en los números: Geologica para el texto y las letras griegas Α Β Γ Ω, Montserrat 700/800 con
  `tabular-nums lining-nums` para títulos, nombre del nivel y números grandes, y Cinzel SOLO en los kickers. NADA de
  Cormorant ni `@fontsource` en el chunk de Conquer. Las fuentes se usan SIEMPRE vía `var(--cq-font-*)`, nunca con
  `font-family` literal. Los tokens `--cq-*` viven SOLO dentro de `.cq-root { }` de `styles/conquer.scss`. Nada global: ni
  en `src/css/app.scss` ni en `_brand.scss`. Los hex de la submarca no aparecen fuera de ese bloque. Siguen vigentes: sin
  rojo ni verde salvo el chip SUBIR y el semáforo del coach (admin), texto en color sólido (`rgba` solo en fondos, sombras y
  bordes), hitbox ≥ 44 px, todo a 390 px de ancho y animaciones dentro de `@media (prefers-reduced-motion: no-preference)`.
  La puerta "Conquer" de Entrenar (`EntrenarTabs.vue`) NO cambia (DA-18).
- Admin: colores de Quasar `info`/`primary` pueden ser azules: en el admin usar los tokens cálidos de El Templo (el azul de
  la submarca es SOLO del app del alumno).

## Migraciones

- Números de la fase: **0290, 0291, 0292** (D-21; la 200 tiene 0287–0289). ANTES de crear el primer `.sql`, chequear:
  `ls /home/franco/projects/et-201-conquer/el-templo-api/src/db/migrations/*.sql | sort | tail -3`,
  `git -C /home/franco/projects/et-201-conquer fetch origin` (permitido: solo lectura del remoto) y
  `git -C /home/franco/projects/et-201-conquer ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | sort | tail -3`
  (idem `origin/staging`), y `ls /home/franco/projects/et-*/el-templo-api/src/db/migrations/029*.sql 2>/dev/null`.
  Si 0290, 0291 o 0292 ya existen en alguno, PARAR el plan y reportarlo (no renumerar por cuenta propia).
- SQL a mano en `el-templo-api/src/db/migrations/NNNN_nombre.sql`, en el MISMO commit que el schema `.ts`.
- NUNCA `;` dentro de un comentario `--` ni dentro de un literal de texto. Usar `--> statement-breakpoint` entre statements en
  los archivos con INSERT. NUNCA `drizzle-kit push/migrate/generate`, `pnpm db:push`, `pnpm db:generate`, `pnpm db:migrate`.
- `mysqlEnum("nombre_columna", [...])`: el primer argumento ES el nombre físico de la columna; nombre y valores (en orden)
  idénticos byte a byte al SQL.
- Todo UNIQUE de tabla gym-owned empieza por `tenant_id`. `tenant_id int NOT NULL DEFAULT 1` + FK a `tenants`.
- Contenido de producto (escaleras, ejercicios, plantillas) por migración, idempotente (`INSERT IGNORE` sobre UNIQUE),
  SOLO tenant 1, resolviendo ids por `code` (nunca ids fijos). Datos de prueba NUNCA en una migración (staging y prod
  comparten MySQL).

## Git

- `git add` SIEMPRE por ruta explícita. PROHIBIDO `git add -A`, `git add .`, `git commit -a`, `git stash`, `--amend`.
- Un commit por tarea: `feat(201-NN): ...`, `test(201-NN): ...`, `fix(201-NN): ...`, `docs(201-NN): ...`. El mensaje termina
  con una línea en blanco + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- NO tocar ni commitear `.planning/STATE.md`, `.planning/ROADMAP.md` ni memorias. Docs SOLO dentro de
  `.planning/phases/201-conquer/` (el SUMMARY del plan sí va ahí).
- NUNCA commitear en el checkout principal ni en la 196. Revisar `git show --stat HEAD` después de cada commit.
- Si un commit falla por un hook, NO usar `--no-verify` ni tocar `core.hooksPath`: arreglar y hacer un commit NUEVO.
- `prettier --write` solo con rutas explícitas.

## Lecciones heredadas (196 y 197) que aplican acá

- (196) Un `const` de módulo con SQL que nombra una tabla gym-owned necesita su propio `/* tenant-safe: ... */` o
  `lint:tenant` falla.
- (196) `tenant_settings`: sumar el prefijo `conquer.%` a `KNOWN_KEY_PATTERNS` de `test/migrations/0190-0191-tenants.test.ts`
  (lo hace 201-05).
- (196) Validaciones en loop dentro de un solo `it` esconden mutantes: usar `it.each`.
- (196) Fotos: el código degrada a 503 limpio sin `R2_PRIVATE_BUCKET_NAME` (y JAMÁS cae al bucket público); los tests
  mockean el store con `vi.spyOn(privateMediaResolver, "resolve")` y no dependen de R2 real.
- (197) `BodyFigure.vue` mide con `getBBox`: montarlo con `v-if` cuando el contenedor ya es visible, nunca dentro de
  `v-show`/`display:none`. NO modificar `src/components/anatomy/*` (lo comparten la 197 y la 200): el tema dorado se hace
  con `:deep()` desde un contenedor de Conquer.
- (197) El destino de pop-ups se extrae por regex contigua `key/label/route`: SIN comentarios dentro de la tupla.

## Lecciones acumuladas de la fase 201

(El orquestador agrega acá, entre planes, las trampas que encontraron los ejecutores anteriores. Leerlas.)

- (orquestador, 2026-10-21) La rama se rebaseó sobre `origin/staging` con la fase 200 adentro (migraciones 0287 y 0288 ya
  existen; la 200 reservó hasta 0289). `node_modules` de los tres paquetes están como symlinks puestos por el orquestador:
  el pre-flight `test -d` pasa; no tocarlos.
- (201-01) `decimal` de Drizzle devuelve `string` (`armCm`, `weightKg`…): convertir a número en el servicio. Los `date` son
  `mode: "string"` (YYYY-MM-DD). `schema/conquer.ts` exporta `CONQUER_LEVELS`, `CONQUER_STEP_KEYS`, `CONQUER_MODES`,
  `CONQUER_UNITS` (`as const`): usarlos, no redeclarar uniones. `conquer_session_steps` solo tiene `created_at`.
  El test de la semilla (201-02) va en el mismo `test/migrations/0290-0292-conquer.test.ts`. Conteos de tenancy tras 201-01:
  114 gym-owned / 119 schema.
- (201-02) `start_steps` está sembrado como `[{step, rung, mode}]` y `rung` es el **code** del peldaño (`half_lay`,
  `oap_asistida`), no el nombre del oráculo. `oracle.next(history, unit)` usa E1 de Planche press (`reps`) o Planche hold
  (`s`); historial vacío → piso (3 reps / 4 s). En `oracle-check.mjs` las secciones nuevas van donde dice
  "3. motor (lo suma 201-03)", antes del `process.exit(1)` final. Los tests importan `../conquer/oracle` sin extensión.
  El fixture `conquer-app.html` conserva su `<link>` de Google Fonts (es fixture, no se sirve): no lo toques.
- (201-03) `engine.ts`: `nextTarget` devuelve `{ target, estado }`. `selectReales` conserva el orden de entrada entre filas
  del mismo día → la ruta ordena por `created_at` antes de llamarla. `harderPosition`/`easierPosition` reciben solo
  posiciones activas y devuelven una POSICIÓN (la ruta resuelve `rung_id` por `(ladder_id, position)`). Subir se ofrece
  con `pickSubir` && `harderPosition !== null`; si es `null` → alerta `tope_escalera`. `caidaE1` espera marcas ya
  filtradas con `selectReales` (≥ 4). El motor trata `0` como marca válida: la ruta decide antes qué escalón está sin cargar.
- (201-04) Posición MAYOR en la escalera = escalón MÁS FÁCIL. `rules.ts` no sabe de fechas: el servicio calcula `blockWeek`,
  `daysDone`/`maxPain` (sin contar `sabado`) con "hoy" de `todayInTz(sede)`. `lightZones` espera `worked` ya calculado con
  `exerciseWorked({e1,e2,e3})` e ignora zonas fuera de las 15 (p. ej. `tibialis` de la 200). Tests de CI importan
  `../../src/modules/conquer/{calendar,rules,lighting}` sin extensión.
- (201-05) Manifiesto de rutas: 482 entradas tras 201-05 (sumar sobre el valor ACTUAL del archivo). En el API NO existe
  `pnpm lint` (cae a un binario del sistema): gates del API = `tsc`, `lint:tenant`, `typecheck:tests`. En el admin, el
  `onRequest` de rol corre antes del guard de módulo: un rol sin permiso recibe 403 aun en un gimnasio sin el módulo; para
  probar el 404 cross-tenant usar owner/admin. Campos nuevos de `GET /state` (`home` en 201-07, `bodyCheck` en 201-12) van
  en `conquerStateResponseSchema` de `schemas.ts` o el serializador los borra. `saveConquerSettings` (201-14) reusa
  `CONQUER_SETTING_KEYS` y `CONQUER_SETTING_RANGES`. Contratos JSON exactos de las rutas: `201-05-SUMMARY.md`.
- (201-06) `INSERT` multi-fila: `.values(rows)` falla `lint:tenant`; escribir `.values(rows.map((r) => tenantValues(ctx, r)))`
  inline en la llamada. `handleServiceError` NO manda `code`: para `{ error, code }` existe `sendConquerError` (hoy privado
  en `admin-routes.ts`); si lo necesitás en otra ruta, moverlo a un archivo compartido del módulo (p. ej. `errors.ts`) y
  reusarlo, no duplicarlo. Helpers de test: `readConquerSteps` (Map `"ejercicio:e1|e2|e3|hold"` → code de peldaño) y
  `createActiveConquerMember` (crea un admin nuevo por llamada). 4 escalones por ejercicio: Toro 4 días = 48 filas.
  Manifiesto: 484 entradas tras 201-06.
- (201-07) `lint:tenant` mira cada statement por separado: armar condiciones en un array y pasar `and(...conditions)` FALLA.
  Poner `tenantWhere` inline en el `.where(and(tenantWhere(...), ...))` y, para condiciones opcionales,
  `cond ? ne(...) : undefined`. `loadMemberContext` ya crea los escalones faltantes (no repetirlo). Recalcular escalón:
  `computeTodayStep` (`today-service.ts`) y `applyRungChange` (`step-service.ts`). `resolveMemberTimezone` vive en
  `timezone.ts`; `sendConquerError` en `errors.ts` (compartido). Ojo con imports circulares entre servicios del módulo.
  En 201-12, `bodyCheck` de `GET /state` con UNA query más, sin otro `loadMemberContext`. Manifiesto: 487 tras 201-07.
  Contratos `TodayResponse`, `HomeView` y PUT de sesión: `201-07-SUMMARY.md`.
- (201-08) Drizzle arma el `SET` de `ON DUPLICATE KEY UPDATE` en el ORDEN DE COLUMNAS DE LA TABLA, no del objeto: una
  columna del SET no puede depender de otra que se reasigna en el mismo SET. `alerts-service.ts` ya tiene
  `upsertEventAlert` y `autoResolveEventAlert` (ampliar ahí, no duplicar). La alerta de tope se emite dentro de la tx del
  guardado (`syncTopeAlerts`). `buildProgress(db, ctx, userId)` sirve tal cual para la ficha del admin (201-11).
  `neighborRung` vive en `catalog-service.ts`. Los servicios que mutan devuelven `void` y la ruta responde con el builder
  (evita imports circulares). Fastify descarta claves extra del body (`removeAdditional`): no hay 400 por campo extra.
  Manifiesto: 490 tras 201-08.
- (201-09) `MAX(date)` en SQL crudo vuelve como `Date`: usar `DATE_FORMAT(MAX(col), '%Y-%m-%d')`. `checkHasContent` y
  `checkHasContentSql` (201-12) cambian juntas. Para cerrar alertas desde otro flujo (201-10/11) usar
  `updateAlertStatus(..., "resuelta")` (guarda `resolved_by`, el sistema no la reabre). Vista de alerta: `alert-view.ts`
  (`getBoardAlert`); `BoardAlert`/`toBoardAlert` en `board-service.ts`. Manifiesto: 492 tras 201-09. Contratos
  `BoardResponse`/`BoardAlert`: `201-09-SUMMARY.md`.
- (201-10) Toro tiene 5 días en la semana del plan (el sábado al final). Tests con historial de combos insertado directo:
  fijar `combo_state` antes con `setComboState` y correr `activationDate` hacia atrás (la fábrica activa HOY y filtra el
  historial anterior). `session_steps` no admite `.values([])`: saltear el insert si no hay filas. Campo nuevo en
  `ComboView` → `comboViewSchema`. Sábado: sin `lighting` y zonas vacías al guardar (D-13 no define zonas para combos; el
  app no muestra mapa en el sábado). `opening` llega siempre precargado; el sábado trae `push`/`pull` sin `exercises`.
  Manifiesto: 493 tras 201-10.
- (201-11) Body de Fastify: `oneOf` + `additionalProperties:false` BORRA en silencio las claves de las otras ramas (Ajv
  `removeAdditional`): usar schema plano y validar en el servicio. No llamar a `loadMemberContext` después de
  `lockActiveMember` en la misma tx (puede escribir escalones y trabarse contra el lock): armar el contexto antes, como
  `applyCut`. Revertir mutantes con `git -C /home/franco/projects/et-201-conquer checkout -- <ruta>` (ruta relativa al
  repo) y verificar `git status`. Las acciones de la ficha devuelven la `FichaResponse` completa: el admin (201-22)
  reemplaza su estado con esa respuesta. Manifiesto: 497 tras 201-11.
- (201-12) `privateMediaResolver.resolve` TIRA el 503 (no devuelve `null`). `fastify.r2` solo existe con las 4 variables
  `R2_*` del bucket de videos: sin ellas, fotos → 503 aunque esté `R2_PRIVATE_BUCKET_NAME`. `member.bodyCheck` viene en
  `GET /state` solo con `status = activo`. Helpers de test: `insertBodyCheckRow(..., { empty: true })`, `mockPrivateMedia()`.
  Validaciones que deben quedar DETRÁS de 404/503 se hacen en el servicio, no con `enum` en el JSON-schema.
  `.github/workflows/deploy-staging.yml` es CRLF: si se toca, respetar CRLF. Manifiesto: 503 tras 201-12. Contratos
  del control físico para el app (201-20): `201-12-SUMMARY.md`.
- (201-13) Galería: `day0` = control con contenido más viejo, `last` = el más nuevo (`null` si hay uno solo); solo alumnos
  `activo`. `canViewConquerPhotos` es alias de `canManageConquer`. La lista de controles del admin trae el de hoy aunque
  esté vacío (igual que `listChecks`). Manifiesto: 507 tras 201-13. Contratos para 201-20/22: `201-13-SUMMARY.md`.
- (201-14) Los 400 de Ajv (`maxLength`, `minProperties`…) NO traen `code`: solo las validaciones del servicio devuelven
  `{ error, code }` (el front muestra `error` igual). Las mutaciones del catálogo devuelven la vista actualizada: el admin
  (201-23) reemplaza su estado con esa respuesta. Al reordenar escaleras, mandar TODOS los ids (también los desactivados).
  Un peldaño en uso se puede desactivar (solo se prohíben los de la tabla de arranque). Manifiesto: 515 tras 201-14 (fin
  del API). Contratos de las 8 rutas del catálogo: `201-14-SUMMARY.md`.
- (orquestador, antes de 201-15) Desde acá son planes de app/admin. Baseline `pnpm lint` y `vue-tsc` de app y admin
  tomados por el orquestador antes de 201-15 (lint OK en ambos; único error preexistente de vue-tsc que matchea es `src/router/routes.ts(139,29) TS7016 ErrorNotFound.vue`, ajeno): si algo de Conquer/Entrenar aparece en `vue-tsc`, es del plan en curso.
- (201-15) Hay DOS panes de Conquer a reemplazar en 201-17: `ComingSoonPane kind="conquer"` en `EntrenarView.vue` (rama
  `v-else`) y en `EntrenarVidriera.vue` (`.vidriera__pane`, sin blur). Ids: `paneId('conquer')`/`tabId('conquer')`.
  `TabKey` se importa de `../utils/entrenarTabs`; flags en `ENTRENAR_TAB_FLAGS`. No pasar prettier sobre archivos enteros
  ajenos (los espejos `destinations.ts` reformatean líneas que no son del plan): formatear a mano lo propio.
- (201-16, SUPERADA por la variante B desde 201-28) La raíz de cada pantalla ya no es `CqSky`: es `CqScreen`
  (`.cq-root .cq-screen`, que importa `conquer.scss`). Los botones son `CqButton` y la pieza oscura es `CqPortico`.
  `CqSky`, `CqSun` y `CqCloudButton` quedan de LEGADO hasta que 201-34 los borra: ninguna pantalla migrada los usa.
  Sigue vigente: el store NO muestra `Notify`. La vista observa `error` o el `false` de las acciones y notifica. El error
  del API se muestra solo si trae `code` `CONQUER_*`; si no, va el texto fijo de la acción. El PUT del archivo a
  `uploadUrl` (201-20) va con axios pelado, sin header de auth. `estadoChip(null)` = "Sin datos".
- (201-17; desde 201-28 léase `CqScreen` donde dice `CqSky`) Cada estado de `ConquerTab` es su propia raíz `CqSky`. `.cq-enter` funciona solo como DESCENDIENTE de `.cq-root`
  (no sobre la raíz). Para pisar el padding de `CqSky` desde un padre: `.mi-clase.cq-sky`. En `ConquerHome` hay ganchos
  `<!-- 201-18: CTA principal -->` y `<!-- 201-19/20: accesos -->`. `mustPromptDay0` lo usa 201-20.
  **Encargo del orquestador para 201-18:** `HomeLastByDay.e1` del API no trae `unilateral`, así que Inicio nunca dice
  "por lado". Sumar `unilateral` a esa vista en el API (servicio + `schemas.ts` + un `expect` en el test de Hoy existente)
  y usarlo en `ConquerHome`. Commit propio `fix(201-18): ...`.
- (201-18) `q-dialog`/`q-menu`/`q-select` se TELETRANSPORTAN fuera de `.cq-root` y pierden los tokens: todo diálogo u hoja de
  Conquer lleva su propia raíz `.cq-root` (padding = `--cq-pad-x`/`--cq-pad-bottom`); para desplegables usar `<select>`
  nativo `.cq-select`. 201-19 registra la ruta del sábado con nombre EXACTO `conquer-sabado` (Hoy/Inicio ya la usan con
  `hasRoute`). Reusar `CqComboCard` (max 13), `CqCounter`, `.cq-select` en el sábado y `CqBodyMap` en Progreso.
  `GET /today` de un Toro con los 4 días hechos devuelve la vista del sábado (`exercises` vacío). `shortDate` está en `format.ts`.
- (201-19) `POST /combos/:comboKey/subir` devuelve solo `{ combo }` (el app relee `GET /progress`). `progress.days` puede
  traer días sin ejercicios (sábado de Toro): filtrarlos antes de pintar. `calibrationText`/`canResolveCalibration` están en
  `format.ts`. En `ConquerHome` el gancho para 201-20 es `<!-- 201-20: accesos ... -->`; `.cq-link` sirve sobre `<router-link>`.
  **Encargo del orquestador para 201-20:** `ProgressStep` del API no trae `unilateral` → Progreso nunca dice "por lado".
  Sumarlo en `progress-service` + `schemas.ts` (+ un `expect` en el test de Progreso existente), tomándolo del peldaño
  ACTUAL del escalón, y usarlo en la pantalla de Progreso con `unitText`. Commit propio `fix(201-20): ...`.
- (201-20) Páginas de Conquer abiertas en frío: `loadState()` y redirigir a la tab si la vista es `bloqueado`/`pedido`.
  El API no marca el control de "hoy" (el app compara con la fecha local). Store: `applyBodyCheck`, `applyPublishPermission`.
  No agregar comentarios solo para satisfacer un grep de verify: si el grep del plan no calza con un buen diseño, anotarlo
  en el SUMMARY como desvío.
- (201-21) CORRECCIÓN: el `.prettierrc.json` del ADMIN tiene `semi: true` (manda ese archivo, no lo dicho arriba). En el
  admin, errores de Conquer con `ConquerApiError`/`toConquerError` (priorizan el `error` en español del API; `extractError`
  prioriza `message`). 4xx → `log.warn` (`log.error` va a Sentry). La ficha registra la ruta `conquer-alumno` con
  `params.userId` (el tablero ya navega ahí). `q-tab-panel` desmonta el inactivo: cada tab carga en `onMounted` y recarga
  con la prop `reloadToken`; tabs nuevas → nombre en `TAB_NAMES` de `ConquerPage`. "Hace N días": `utils/conquer-format.ts`.
  Colores: `secondary`/`accent`, nunca `primary`/`info`.
- (201-22) En `q-select` que dispara una llamada: `:model-value` + `@update:model-value` (no `v-model`), para revertir
  si el API falla. `conquer-format.ts` del admin ya tiene labels, marcas, alertas, poses y `SEVERITY_CHIP_COLOR`: reusar.
  `ConquerPhoto.vue` pide la URL firmada (Evolución y Galería lo comparten).
  **Encargo del orquestador para 201-23:** las banderas "Autorizó publicar"/"Sin cara" no vienen en la ficha: hoy
  `ConquerEvolution` llama a `getGallery()` y busca al alumno (falla si no tiene controles con contenido). Sumar
  `publishEnabled` y `publishNoFace` a `FichaMember` en el API (servicio + `schemas.ts` + un `expect` en el test de ficha
  existente), usarlos en `ConquerEvolution` y quitar la llamada a la galería. Commit propio `fix(201-23): ...`. Y enlazar
  "Extendé la escalera desde Catálogo" con `?tab=catalogo` cuando exista la tab.
- (201-23) Encargo de banderas de publicación hecho (`FichaMember.publishEnabled/publishNoFace`). Para 201-24: sumar al UAT
  (además de lo del plan) los puntos que los ejecutores dejaron para mirar a ojo: picker de 5 días de Toro a 390 px, hoja de
  guardado con figura + calibración, `<select>` nativos en iOS, curva del E1 en pantallas anchas (`preserveAspectRatio`),
  comparador de 226 px y tabla de 4 columnas del control, letras griegas que caen a Georgia (Cormorant sin subset griego),
  y que el sábado de Toro NO muestra mapa muscular (D-13 no define zonas para combos: validación de Nacho).
  Y una sección "Probar en local" (antes de staging): migrar la base LOCAL, levantar API + app + admin, cuentas de prueba.
- (orquestador, 2026-10-22, cierre de hallazgos del UAT local) 201-25/26 alinean el catálogo con `.docs/conquer-catalogo.md`
  (anexo de Nacho, fuente de verdad del catálogo). La base LOCAL de Franco ya tiene 0290-0292 aplicadas: la 0293 tiene que
  correr sobre esa base sin romper (alumno Toro de prueba user 28 ya activado con historial). El orquestador corre
  `pnpm db:migrate` en local después de 201-25; el ejecutor NO.
- (201-26) Las 9 trampas para 27-35 están en `201-26-SUMMARY.md` §"Trampas para los planes 27-35": leerlas. Resumen: el copy
  del método vive en `CQ_TEXTOS` (`app utils/format.ts`), así que la guía y el rediseño lo IMPORTAN, no lo duplican. Los modos
  y las frases de las alertas (`BoardAlert.text`) los manda el API. `TodayExercise.rungs` (E1-E3) es distinto de `holdRungs`
  (hold final). El tope avisa al LLEGAR. `alert-text.ts` no puede tener imports.
- (201-26) Para revertir un mutante en un archivo con cambios propios sin commitear, NO usar `git checkout -- <archivo>`:
  borra toda la edición. Copiarlo a scratchpad con `cp`, mutar, restaurar con `cp` y verificar con `git diff`.

## Overrides y lecciones de la fase 202 (planes 202-01..15)

Para los planes 202-NN este archivo vale entero, con estos cambios (mandan sobre lo de arriba):

- (orquestador, 2026-10-26) **Planes:** `.planning/phases/202-conquer-tutoriales-correcciones/202-NN-PLAN.md`. Decisiones de
  producto D-25..D-29 al final de `201-CONTEXT.md`; de diseño DA-37..DA-52 en `202-01-PLAN.md`.
- **Migraciones: 0298 y 0299** (no 0290-0292). El chequeo de §Migraciones se hace con esos números
  (`ls /home/franco/projects/et-*/el-templo-api/src/db/migrations/029[89]*.sql`). El 2026-10-26: master llega a 0297, nadie usa 0298/0299.
- **Niveles visibles:** Legionario / Centurión / Espartano (`LEVEL_INFO` del app). Los códigos siguen `ternero` / `novillo` / `toro`.
- **Docs y SUMMARY** van en `.planning/phases/202-conquer-tutoriales-correcciones/` (no en la carpeta de la 201). Commits
  `feat(202-NN): ...`, `test(202-NN): ...`, `fix(202-NN): ...`, `docs(202-NN): ...`.
- La rama tiene mergeado `origin/master` del 2026-10-26 (`2b53b55b1`: app 1.8.6, Novedades push con 0297, revisión de
  anatomía). Conteos de tenancy y manifiesto de rutas: sumar sobre el valor ACTUAL del archivo, nunca sobre los números
  de las lecciones de la 201.
- Línea base del orquestador (2026-10-26, tras el merge): `tsc` y `lint:tenant` del API verdes; `pnpm lint` de app y admin
  verdes. `vue-tsc`: el path del worktree contiene "conquer", así que filtrar por `src/modules/conquer`, `src/pages/conquer`,
  `src/components/conquer` o el archivo concreto, NUNCA por `conquer` a secas. Errores preexistentes ajenos que aparecen con
  un grep amplio: app `src/router/routes.ts(139,29) TS7016`, admin `src/utils/pdf/session-pdf-builder.ts(224,11) TS2339`.
- Sin bucket R2 privado ni CORS todavía (los crea Franco): el código degrada a 503 limpio sin `R2_PRIVATE_BUCKET_NAME` y los
  tests mockean el storage (ver lección 196 de fotos y la de 201-12). Nada se prueba contra R2 real.
- (202-01) Drizzle: `schema.conquerCorrections` / `schema.conquerTutorials`, `CONQUER_CORRECTION_STATUSES`, tipos
  `ConquerCorrectionRow` / `ConquerTutorialRow` / `ConquerCorrectionStatus`. La base NO impone "escalón o combo" (DA-41):
  lo valida el servicio. `video_seconds` NOT NULL; `video_key` NULL solo tras borrado (con `video_deleted_at`/`_by`).
  `reply_seen_at` NULL = el alumno no vio la respuesta. `reply_video_key` sin UNIQUE (la clave lleva correctionId + uuid).
  Los UNIQUE de `conquer_tutorials` admiten NULL: upsert con `onDuplicateKeyUpdate` o buscar antes con `tenantWhere`.
  `exercise_id`: CASCADE en tutorials, restrict en corrections. Las dos tablas ya están en `TABLES_TO_CLEAN` y en
  `limpiarSegundoGimnasio`. Tenancy tras 202-01: 116 gym-owned / 121 schema. Manifiesto: `ENTRADAS_BASELINE` = 516
  (`test/tenancy/iso-01-manifiesto.test.ts:386`) antes de las rutas de la 202. La base local NO tiene 0298/0299 aplicadas
  (el orquestador no migra la base de Franco sin su OK): no depender de eso.
- (202-02) Contratos de `video-rules.ts` y `private-media.ts`: `202-02-SUMMARY.md`. Trampas: (1) `privateMediaResolver.resolve(fastify)`
  sin 2º argumento = FOTOS; toda ruta de video pasa `"videos"` (si no, el 503 sale con código/copy de fotos).
  (2) `mockPrivateMedia` trae `head` = `image/jpeg` 1 KB: para video pisarlo (`head: async () => ({ contentLength: n, contentType: "video/mp4" })`)
  o `checkUploadedVideo` da `"tipo"`; para afirmar borrados pasar `remove: vi.fn(...)`. (3) Tutoriales:
  `checkUploadedVideo(head, TUTORIAL_VIDEO_MAX_BYTES, [TUTORIAL_CONTENT_TYPE])`; correcciones: `CORRECTION_VIDEO_MAX_BYTES` +
  `VIDEO_CONTENT_TYPES`. (4) `isValidVideoSeconds` no redondea (redondea el cliente, DA-40). (5) `normalizeText` mide tras
  `trim` y da `value: null` si vacío; la regla "texto o video" (DA-43) la decide la ruta. (6) Clave del coach →
  `isCorrectionReplyKey`; del alumno → `isOwnCorrectionVideoKey` (disjuntas). (7) `remove` re-tira todo error que no sea
  "no existe": la ruta lo captura, responde `VideoStorageUnavailableError` sin loguear la clave y no toca la fila.
  (8) Los `verify` con `! grep` sin filtrar comentarios matchean docblocks: no escribir esas palabras en comentarios.
- (202-03) Contratos de `correction-service.ts` (y JSON de las 3 rutas del alumno): `202-03-SUMMARY.md`. Exporta
  `loadCorrectionRows(db, ctx, { userId?, id?, status?, limit, order })`, `toCorrectionView` (vista del ALUMNO: sin claves ni
  nombre del coach; 202-05 arma la suya sobre la misma fila), `callVideoStore(fastify, { correctionId?, userId? }, call)`,
  `listCorrectionTargets`, `getMemberCorrections`, `requestCorrectionUpload`, `createCorrection`, `MEMBER_CORRECTIONS_LIMIT`.
  Trampas: `CorrectionRow.firstName/lastName` son `string | null` y `level` `Level | null` (armar nombre con `?? ""`).
  `loadCorrectionRows({ id })` NO filtra por alumno: las rutas del alumno pasan `userId` + `id`. `resolve(fastify, "videos")`
  va FUERA de `callVideoStore` (tira el 503 solo); `presignGet`/`head`/`remove` pasan `{ correctionId }` como info.
  202-05: responder con `status='respondida'` + `reply_*` en UNA update con `WHERE status = 'pendiente'` (DA-43).
  Helpers de test: `CONQUER_CORRECTIONS_URL`, `insertConquerCorrection(app, userId, overrides)`, `postCorrectionRaw(app, token, body)`.
  Sin fila en `conquer_members` → 409 `CONQUER_NO_ACTIVO`; sin módulo → 404. Manifiesto: 519 tras 202-03. Tenancy 116/121.
- (202-04) `GET /corrections/:id/video-url?who=alumno|coach` → `{ available, url, expiresIn }` (300 s); clave NULL u objeto
  vencido → `available: false` (NO es error; el 503 sí). `POST /corrections/seen` → `{ unseenReplies: 0 }`. `member.corrections`
  `{ pending, unseenReplies }` viene en `GET /state` y `POST /unlock-request` SOLO con alumno `activo`. Helpers:
  `resolveCorrectionVideo(fastify, key | null, { correctionId })` (retorna por clave NULL ANTES de `resolve(fastify, "videos")`:
  no mover ese `resolve` arriba), `getMemberCorrectionVideoUrl` (filtra por userId del token: el coach NO lo usa),
  `markRepliesSeen`, `correctionCounts`. Schemas `correctionVideoUrlSchema`, `correctionsSeenSchema`, `correctionCountsSchema`
  (`correction-schemas.ts` NO importa de `schemas.ts`). App: `who` en minúsculas; el store actualiza `member.corrections` tras
  `seen` y tras crear (o relee `/state`). Tests: corrección `respondida` necesita `repliedAt` + `replyText` o `replyVideoKey`;
  aislamiento: un alumno del gimnasio 2 sin fila `conquer_members` activa da 409 antes del 404. Manifiesto: 521 tras 202-04.
- (202-05) Rutas del coach en `registerCorrectionAdminRoutes(fastify)` (`correction-routes.ts`, al final de `conquerAdminRoutes`):
  `GET /corrections` (sin `status` = `pendiente`; inválido → 400 `CONQUER_CORRECCION_ESTADO_INVALIDO`), `GET .../video-url`
  (mismo contrato que el del alumno; orden 404 → 400 `CONQUER_VIDEO_QUIEN_INVALIDO` → storage; `who` obligatorio), contador, y
  `DELETE` del video del alumno (devuelve la vista completa con `videoDeleted: true`). Vista `AdminCorrectionView` =
  `CorrectionView` sin `replyUnseen` + `userId`, `memberName`, `level` (null sin fila conquer_members), `videoDeletedAt`,
  `repliedByName` (solo nombre de pila), `canReply`; sin claves de video (con `videoDeleted: false` hay clave).
  `loadCorrectionRows` acepta `orderBy?: "createdAt" | "repliedAt"`. 202-06: UNA update con `WHERE status='pendiente'` y vista con
  `loadAdminCorrection` + `toAdminCorrectionView`. Tests: 404 cross-tenant con `gym2.adminToken` + `setModuleFlag(app, TENANT_DOS,
  "templo-training", true)`; `insertGym2Correction` y `mockVideoStore({ head?, remove? })` son locales a
  `corrections-admin.test.ts` (si otro plan los necesita, MOVERLOS a `_helpers.ts`, no duplicarlos). Manifiesto: 525 tras 202-05.
- (202-06) Respuesta del coach: `POST .../reply-upload-url` body `{ contentType }` → `{ uploadUrl, key, contentType, expiresIn: 600,
  maxBytes }` (misma forma que la del alumno); `POST .../reply` body `{ text?, key?, durationSec? }` → `AdminCorrectionView`
  completa con `status: "respondida"` y `canReply: false` (el admin 202-10 REEMPLAZA su item con esa respuesta). Orden de
  errores en `202-06-SUMMARY.md`; solo texto no toca el storage. Los 400 de Ajv no traen `code`: el admin muestra `error`.
  `confirmCorrectionVideo(fastify, store, key, info)` (exportada de `correction-service.ts`) es la ÚNICA confirmación de video
  (HEAD + `checkUploadedVideo` + limpieza): reusarla en tutoriales si calza, no duplicar. `mockVideoStore({ head?, remove?,
  presignPut? })` ya vive en `test/conquer/_helpers.ts` (devuelve los 4 espías). Si `canReply` es false, el front no ofrece
  responder. Manifiesto: 527 tras 202-06.
- (202-07, FIN DEL API) Contratos JSON de tutoriales (alumno y admin) en `202-07-SUMMARY.md` §Contratos: leerlos antes de
  tocar admin/app. Admin bajo `canManageConquer`; `GET/PUT/DELETE` del admin devuelven la MISMA vista
  `{ storageReady, exercises: [{ exerciseId, url|null }], combos: [{ comboKey, label, url|null }] }` (reemplazar el estado con
  la respuesta). El PUT a `uploadUrl` lleva `Content-Type: video/mp4` (firmado): el admin convierte con `transcodeToMp4` ANTES
  de pedir la URL (el API rechaza `.mov`). Vista del alumno filtra los sin URL. Ojo: el CORS del bucket público para PUT
  desde el admin de STAGING lo tiene que habilitar Franco (hoy Ejercicios solo sube en prod) — no es tarea del ejecutor.
  Manifiesto: 533 tras 202-07. Tenancy 116/121.
- (orquestador, antes de 202-08) Desde acá son planes de admin y app. Gates de front: `pnpm lint` del paquete y `vue-tsc`
  filtrado por los archivos del plan (ver línea base arriba). Baseline re-tomada tras 202-07: lint OK en app y admin, ningún
  error de vue-tsc en archivos de conquer/tutorial/corrección/video.
- (202-08) Admin: `useConquerVideoUpload()` (`el-templo-admin/src/composables/useConquerVideoUpload.ts`) → `{ phase, percent,
  prepareMp4, putToBucket, reset, cleanup }`. `prepareMp4(file, { maxBytes, maxSeconds? })` → `{ ok: true, file, seconds } |
  { ok: false, message }` (no notifica; con `maxSeconds` lee la duración ANTES de convertir y `seconds` queda en 1..max).
  `putToBucket` = PUT sin auth con `Content-Type: video/mp4`; si falla tira Error con copy en español y loguea solo el status.
  `phase` vuelve a `idle` entre los dos pasos: la vista lleva su propio `busy`. 202-10 lo REUSA para el video del coach.
  Store `useConquerTutorialsStore` (`view`, `loading`, `load`, `apply`, `exerciseUrl`, `comboTutorial`). Cliente
  `useConquerAdminApi`: `getTutorials`, `requestTutorialUpload`, `confirmTutorial`, `deleteTutorial`; tipos `TutorialTarget`,
  `TutorialTargetInput`, `AdminTutorials`, `TutorialUploadUrl` en `types/conquer.ts`. `getVideoDuration` vive en
  `src/utils/videoDuration.ts`. Notificar con `useQuasar().notify` como los vecinos. No pasar `data-test` a un componente
  que ya tiene el suyo en el root (lo pisa).
- (202-09) Admin bandeja: `ConquerCorrections.vue` (prop `reloadToken`), `ConquerCorrectionDialog.vue` (props `modelValue`,
  `correction: AdminCorrection | null`; emits `update:modelValue`, `changed: [AdminCorrection]`), `ConquerCorrectionVideo.vue`
  (props `correctionId`, `who`). Cliente: `listCorrections`, `countCorrections`, `getCorrectionVideoUrl`,
  `deleteCorrectionVideo`; tipos `AdminCorrection`, `CorrectionStatus`, `CorrectionVideoWho`, `CorrectionReply`,
  `CorrectionVideoUrl`. `durationText(seconds)` en `utils/conquer-format.ts`. 202-10: el formulario va en el hueco
  `<!-- 202-10: respuesta del coach -->` del diálogo con `v-if="correction.canReply"`, y SOLO emite `changed` con la vista del
  `POST .../reply` (`ConquerCorrections.onChanged` saca la fila, actualiza el diálogo y el contador). `NavBadge` `'conquer'`
  reemplazó a `'conquer-requests'` (suma pedidos + correcciones).
- (202-10, FIN DEL ADMIN) Desde acá son planes del APP (Capacitor). `useConquerVideoUpload` y `transcodeToMp4` son SOLO del
  admin: en el app no existen y NO se agregan dependencias (el video del alumno NO se convierte, DA-52). La respuesta del coach
  queda con `reply_seen_at = NULL` → cuenta en `member.corrections.unseenReplies` hasta `POST /corrections/seen`. El video del
  coach es MP4 y el app pide su URL con `who=coach`. Repaso de lecciones del app de la 201 que siguen vigentes: 201-16/17/18
  (`CqScreen`, `.cq-root` en diálogos teletransportados, `<select>` nativo), 201-20 (cold open con `loadState()`; el store no
  notifica), 201-26 (copy en `CQ_TEXTOS`, revertir mutantes con `cp`). Subida desde el app: `window.CapacitorWebFetch`
  (DA-51), nunca CapacitorHttp ni axios con base64.
- (orquestador, tras 202-11) **NO usar `rm`** (ni para limpiar copias del scratchpad): dispara un permiso que Franco tiene que
  aprobar a mano y la cadena queda frenada horas. Las copias de mutantes se dejan en el scratchpad; para restaurar un archivo,
  `cp` desde la copia.
- (202-11) App: `useConquerStore()` suma `tutorials` (`null` = no cargó o falló → sin botón), `loadTutorials()` (idempotente,
  las pantallas la llaman al montar), `exerciseTutorialUrl(exerciseId)` (el `exerciseId` de `TodayExercise`),
  `comboTutorialUrl(comboKey)`, `applyCorrectionCounts(counts)` (no hace nada sin `member`; tras crear → `pending + 1`, tras
  `seen` → `unseenReplies: 0`). Leer `member?.corrections ?? { pending: 0, unseenReplies: 0 }`. Cliente `useConquerApi()`
  (instancia propia por pantalla, `api.cleanup()` al desmontar, el store no notifica): `getCorrections`,
  `requestCorrectionUpload(contentType)`, `createCorrection(body)`, `getCorrectionVideoUrl(id, who)` (`available: false` no
  tira: mostrar "ya no está disponible"; la URL firmada no se guarda ni se loguea), `markCorrectionsSeen`, `getTutorials`.
  Utils: `videoFile.ts` (`checkVideo`, `videoMimeOf`, `videoSeconds`, `formatSeconds`, `VIDEO_MAX_*`) y `corrections.ts`
  (`groupCorrections`, `correctionChip`, `remainingSlots`, `targetGroups`). La duración la lee la pantalla (metadata de un
  `<video>` con `URL.createObjectURL`); si no se puede, `null` → `duracion`. El PUT lleva EXACTO el `Content-Type` pedido.
  Body: `exerciseId` + `step` O `comboKey`, nunca los dos. El 409 `CONQUER_CORRECCIONES_TOPE` puede llegar igual: mostrar `error`.
- (202-12) `CqVideoSheet` (props `modelValue`, `title`, `url: string | null`, `loading?`, `unavailable?`): el padre pide la URL
  firmada con SU instancia de `useConquerApi()` (cleanup al desmontar), abre con `loading`, pasa `url` al llegar y
  `unavailable` si `available: false`. El texto fijo es "Video no disponible": para los borrados de D-28 ("Este video ya no
  está disponible") sumar una prop opcional de mensaje (default el texto actual) en vez de duplicar la hoja; si lo hacés,
  generalizá también el `log.warn` ("tutorial video failed") a algo neutro. `CqTutorialButton` lee el store de tutoriales: NO
  sirve para correcciones; para "Ver mi video"/"Ver la respuesta" usar `.cq-textlink` de 44 px que abra `CqVideoSheet`.
  Hojas nuevas: raíz `.cq-root` propia y estilos DENTRO del componente (un `.cq-root .x` anidado no alcanza a la raíz).
  Chequeos de `git diff origin/staging` en los verify ven commits de master mergeados: comparar contra el commit previo al plan.
- (202-13) Pantalla `ConquerCorrectionsPage.vue` + `CqCorrectionSheet` (prop `videoUrl` = función de la página). 202-14: el botón
  "Mandar video" va en la `CqPortico` donde está el comentario `<!-- 202-14: ... -->`, `CqButton variant="on-night"`,
  deshabilitado con `slots === 0`. Tras crear: `corr.applyCreated(view)` (lista + cupos) Y `store.applyCorrectionCounts({ pending
  + 1, unseenReplies })` (Inicio): las DOS. Hoja de envío con raíz `.cq-root`, estilos scoped y `persistent` mientras sube.
  `URL.createObjectURL` → `revokeObjectURL` siempre. Fechas: `createdAt`/`repliedAt` son instantes UTC → `localDayOf(iso)` de
  `corrections.ts` antes de `shortDate` (nunca cortar el ISO). Info.plist: tiene `NSCameraUsageDescription` (sumarle los videos
  de correcciones) y `NSPhotoLibraryUsageDescription`, NO `NSMicrophoneUsageDescription` (sin ella grabar con audio cierra la
  app en iOS). Android: el selector de archivos/cámara del sistema no necesita `RECORD_AUDIO` en la app; no sumar permisos que
  el plan no pida. Sin `cap sync`: el build nativo lo hace Franco.
- (202-14, FIN DEL CÓDIGO) Envío: `useCorrectionUpload.ts` + `CqCorrectionSendSheet.vue`; Info.plist con
  `NSMicrophoneUsageDescription` (requiere `cap sync` + build iOS nuevo, lo hace Franco). Para 202-15: los requisitos de
  infraestructura, build nativo y la lista de "a ojo / teléfono real" están en `202-14-SUMMARY.md` §"Para 202-15"; juntar
  además los "para mirar a ojo" de 202-08..13. La guía de prueba sigue siendo UNA: `../201-conquer/201-UAT.md` (ampliarla).
