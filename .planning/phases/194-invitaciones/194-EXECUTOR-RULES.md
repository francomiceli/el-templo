# Fase 194 — Reglas para el ejecutor (gsd-executor, model sonnet)

Este archivo es INPUT de todos los planes 194-NN. Leerlo entero antes de la primera tarea.

## Entorno

- Worktree: `/home/franco/projects/et-194-invitaciones`, rama `feat/194-invitaciones`. Trabajar SOLO acá. Usar rutas absolutas en cada comando (el cwd se resetea entre llamadas).
- `node_modules` de los 3 paquetes y `.env`/`.env.development` de la API ya están symlinkeados/copiados. **PROHIBIDO instalar o actualizar dependencias** (`pnpm add`, `pnpm install`, `npm i`, `pnpm update`). Si algo "falta", parar y reportarlo en el SUMMARY.
- `vue-tsc` NO está instalado y NO se instala (D-27). Los frontends se verifican con `pnpm lint` + `pnpm build` (quasar build) dentro de cada paquete.

## Tests

- **SOLO en foreground**, con timeout amplio. Forma canónica:
  `cd /home/franco/projects/et-194-invitaciones/el-templo-api && timeout 900 pnpm exec vitest run <archivo1> [<archivo2>] --hookTimeout 600000`
- **PROHIBIDO** `run_in_background`, `&`, `nohup`, loops de espera con `sleep`/`pgrep`/`ps` (se matchean a sí mismos y quedan colgados). Nunca dos vitest a la vez (las DB por worker se pisan).
- **NUNCA la suite completa** (`pnpm test` sin archivo). Solo los archivos que el plan nombra en `<verify>`. La suite completa la corre CI.
- Si un test de integración falla por provisioning de DB (timeout de `provisionWorkerDB`, `ER_LOCK_DEADLOCK` en setup), re-correr UNA vez el mismo archivo antes de diagnosticar.
- Nunca hardcodear `users.id` en tests (crear usuarios con las fábricas). Fechas siempre relativas (`todayInTz(tz)`, `addDays`), nunca literales de calendario salvo en tests unitarios puros de funciones de fecha.
- Toda query directa a `users`/`subscriptions`/`invitations` en un test lleva `tenantWhere(tabla, TEMPLO_CTX)` (o el ctx del fixture) — si no, `lint:tenant`/`typecheck:tests` fallan.

## Chequeo de copy "referido" (rebrand, planes de admin y app)

Copy visible = cualquier línea que NO sea comentario y que no sea uno de los identificadores internos permitidos. Comando canónico
(reemplazar FILES por los archivos de la tarea; tiene que NO imprimir nada):

`grep -nE "[Rr]eferid" FILES | grep -vE ":[0-9]+:[[:space:]]*(//|\*|<!--)|mis-referidos|referidos_pendientes|ReferidosAbTab|[\"']referidos[\"']"`

- Excluye: líneas de comentario (`//`, `*`, `<!--`), la ruta vieja `mis-referidos` (alias), la clave interna `'referidos'` /
  `"referidos"` (destinos de push/avisos de builds publicadas), el segmento `referidos_pendientes` y el nombre de archivo
  `ReferidosAbTab`. Los identificadores TS en inglés (`referral*`, `Referral*`) no matchean `[Rr]eferid`.
- Si queda una línea que es identificador interno legítimo y no está en la lista, NO ampliar el regex: copiarla textual en una
  sección "Allowlist de copy" del SUMMARY con el motivo, y hacer que el criterio compare contra esa allowlist.

## Excepciones explícitas a las reglas de tests

- **ids de usuario hardcodeados:** SOLO `test/migrations/0258-0259-invitaciones.test.ts` (plan 194-21) puede sembrar `users.id`
  6613 y 7286 y `referrals.id` 3 explícitos, porque la migración 0258 apunta a esos ids de producción (precedente
  `test/migrations/0109_reconcile_soledad.test.ts`). Verificar antes de insertar que no existan en la DB del worker y borrarlos
  en `afterAll`. Ningún otro test de la fase hardcodea ids.

## Gates estáticos (correr al cerrar cada tarea de API)

- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm exec tsc --noEmit`
- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm lint:tenant`
- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm typecheck:tests` (cuando el plan toca tests)

## Código

- API: logs con `request.log`/`app.log`/`this.log` (Pino), nunca `console.*`. Front: `createLogger()` de `src/utils/logger.ts`.
- Sin `any`. `catch (err: unknown)` + `instanceof Error`.
- Toda query nueva: `tenantWhere(tabla, ctx)` en lecturas/updates, `tenantValues(ctx, {...})` en inserts, y `s.tenant_id = ${ctx.tenantId}` inline en SQL crudo (el lint juzga por statement). `tenant_id` SIEMPRE server-side, jamás del body.
- Comentar en español, con la decisión que se implementa (`// Fase 194 D-XX: ...`).

## Migraciones

- SQL escrito a mano en `el-templo-api/src/db/migrations/NNNN_nombre.sql`, **en el MISMO commit** que el schema `.ts`.
- Antes de crear una migración: `ls /home/franco/projects/et-194-invitaciones/el-templo-api/src/db/migrations/*.sql | sort | tail -3` y además `git -C /home/franco/projects/et-194-invitaciones ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | sort | tail -2` y lo mismo con `origin/staging`. La fase reserva **0255-0259**; si alguno ya está ocupado en master/staging, PARAR y reportar (no renumerar por cuenta propia).
- **NUNCA** `;` dentro de un comentario `--`. **NUNCA** `drizzle-kit push`, `drizzle-kit migrate`, `pnpm db:push`, `pnpm db:generate`.
- `mysqlEnum("nombre_columna", [...])`: el primer argumento ES el nombre físico de la columna y debe coincidir byte a byte con el SQL (nombre y lista de valores en el mismo orden).
- Statements de datos idempotentes (`WHERE NOT EXISTS`, guards por estado esperado). Datos de test NUNCA en una migración.
- **NO correr `pnpm db:migrate` ni `pnpm db:verify-uniques`** contra la DB local `eltemplo`: la comparten otros worktrees (tren v6.1 con otras migraciones). La DB de test por worker se provisiona sola.
- El "push de schema" de esta fase = los tests de integración provisionan la DB de test con el runner propio (`test/setup.ts` → `splitSqlStatements`). Un plan de schema NO está completo hasta que un test que toca la tabla/columna nueva pasa.

## Git

- `git add` SIEMPRE por ruta explícita. **PROHIBIDO** `git add -A`, `git add .`, `git commit -a`.
- Un commit por tarea: `feat(194-NN): ...`, `test(194-NN): ...`, `fix(194-NN): ...`.
- **NO commitear docs fuera de `.planning/phases/194-invitaciones/`** (nada de STATE.md, ROADMAP.md, memorias). El SUMMARY del plan sí va en el phase dir.
- Si el pre-commit (lint-staged) falla: arreglar y hacer un commit NUEVO (no `--amend`).
- **NUNCA** `git push`, nunca SSH, nunca tocar `master`/`staging`.
- `git stash` prohibido (stack compartido entre worktrees).

## Lecciones acumuladas de la fase

(El orquestador agrega acá, entre planes, las trampas que encontraron los ejecutores anteriores. Leerlas.)

### Tras 194-01
- Cada archivo de integración tarda ~170 s (provisioning de la DB del worker); 3 archivos ~340 s. Usar `timeout 900` y no más de 3-4 archivos por corrida.
- Fábricas compartidas en `el-templo-api/test/invitations/_helpers.ts`: ctx = `fixtureCtx(app)` (`{ app, tenant }`), `ensurePhysicalBranch`, `ensureVirtualBranch`, `createActiveSub` (inserta directo, NO corre `recomputeUserStatus`; acepta `createdAt`). Reusarlas, no duplicar.
- Helper canónico de membresía: `el-templo-api/src/modules/shared/membership.ts` (`membershipInEffectSql(alias)`, `notTrialPlanSql(alias)`). Toda condición nueva de "membresía vigente" lo usa; nunca re-escribir el EXISTS a mano.
- Disparar `recomputeUserStatus` sin la API: con ctx → sub `scheduled` con `startOffsetDays: -1` + `new SubscriptionService(db, log, undefined, new EnrollmentService(db, log)).activateDueScheduledSubs(ctx.tenant)`; con `ctx=null` → `autoExpireDueSubscriptions()` (también necesita `EnrollmentService`).
- `GET /api/admin/members/search` responde `{ members: [...] }`, no un array.
- Un `const` de módulo con SQL que nombra `subscription_plans`/`users` necesita su propio comentario `/* tenant-safe: ... */` o `lint:tenant` falla.
- `subscription_plans` está en `TABLES_TO_CLEAN`: crear planes DESPUÉS de `cleanAllTestData`.
- `pnpm typecheck:tests` sale 1 por deuda PREEXISTENTE ajena (test/unit/*, attendance, check-ins, email, tenancy/mod-02-hooks, analytics, lifecycle). Criterio real: ningún archivo tocado/creado por el plan aparece en los errores (filtrar la salida por los paths del plan).
- Versión de la app de la fase = **1.8.2** (patch, decisión de Franco), no 1.9.0.

### Tras 194-02 (D-22 CONFIRMADO)
- Test de caracterización: `el-templo-api/test/invitations/discount-characterization.test.ts` (18 casos). Para cobros reales usar HTTP con `test/subscriptions/_helpers.ts`.
- `cleanAllTestData` vacía `aura_config` y `system_settings`: resembrar `referral.max_percent_cap` y la fila `aura_config` `referral` en el `beforeEach`.
- Prorrateo determinístico de `changePlanNow`: sub plan A (100000) con `startDate` -15 días → `remainingValue` 50000. Asignarla ANTES de crear vínculos/partner.
- Boarding pass requiere `PRICING_SETTINGS_KEYS.zeroPrice` = `on` (restaurar en `try/finally`).
- Al cambiar una expectativa en 194-15..18: reemplazar la línea `194: cambia en ...` por `// 194-NN D-XX: <qué cambió>` en el mismo commit (el conteo de anotaciones pendientes debe bajar).
- `getRenewalPreview` hoy devuelve solo `{subscriptionId, base, source}`; el `toEqual` del caso (h) se rompe a propósito cuando 194-18 agregue campos.
- Comandos con `cd` a rutas calculadas los bloquea el worktree: usar rutas absolutas literales.

### Tras 194-03
- Coberturas: `deriveCoveredUntil(Batch)` = ACCESO (reservas, sin cambios); `deriveMembershipCoveredUntil(Batch)` = MEMBRESÍA. No crear un tercer sabor: usar el flag `membershipOnly` del impl privado.
- `membershipPlanCondition()` compone en `and(...)` de Drizzle; `membershipInEffectSql(alias)` / `notTrialPlanSql(alias)` para SQL crudo.
- Una subquery escalar no devuelve 2 columnas: fragmento compartido + desempate `s.id DESC`.
- `createTrialPlan` usa 6 días por defecto (bajo el corte de Renovaciones = 7). Para probar exclusión `is_trial` en Renovaciones, `durationDays >= 7`.
- Tests de xlsx leen por header, no por posición.
- Vistas que solo MUESTRAN el plan que la persona tiene (listado de alumnos, filtro por plan, panel de turno, engagement) muestran "Invitación" a propósito para invitados; no "arreglarlas".
- Plan 194-31 agregado por el orquestador (indicadores de membresía restantes); se ejecuta después de 194-03.

### Tras 194-31
- Analytics de membresía: filtrar por PLAN `is_trial` (`excludeTrialSubs()` en `analytics/especial-exclusion.ts`, compuesto dentro de `excludeInternalSubs()`), NO por `membership_kind` (una sub is_trial es `paga` por defecto; solo es `bonificada` con override 0).
- `expiry-cohort.ts` (`s2`/`s_next`) no excluye is_trial a propósito: un ex socio necesita ≥6 meses sin membresía para ser invitado (D-11), así que una invitación nunca cae en la ventana de retención. No tocar.
- El hook del harness rechaza `cd X && git ...` y `git -C`: hacer `cd` y `git` en llamadas separadas, rutas literales.

### Tras 194-04
- Tabla `invitations` (mig 0255) lista: fábrica `createInvitationRow` en `test/invitations/_helpers.ts`; ya está en `TABLES_TO_CLEAN`, `GYM_OWNED_TABLES` (100), módulo strict `referrals`, y `limpiarSegundoGimnasio` la borra antes de users.
- Archivos de tenancy juntos ~270 s; un archivo ~110 s.
- Crear/editar archivos con Write/Edit; Bash en llamadas simples (el hook rechaza heredocs + cd + && largos).

### Tras 194-05
- Helpers de plan: `isInvitationPlan`, `planAllowsInvitationDiscount`, `invitationPlanIdsSql`, `findInvitationPlan` (falla cerrado con 0 o >1 plan). Plan Invitación = `paquete`, `duration_days=6`, `is_trial=1`, `multi_branch=1`, uno por país; vigencia real por `endDateOverride`.
- La API de planes NO acepta `paquete` en create/update (enum de entrada): sembrar planes `paquete` por DB en tests.
- Tests que aplican SQL de migración cross-tenant por `app.dbPool` necesitan prefijo `/* tenant-safe: ... */` (sentinel).
- `.limit(1)` sin `orderBy` en `subscription_plans` ordena por el índice único de nombre: un test que dependa de eso controla el nombre.
- Los planes Invitación aparecen hoy en "Vender otro pase" del admin (como el de Yoga): lo resuelve 194-25; `assignPlan` los rechaza desde 194-06.

### Tras 194-06
- `assignInvitationPlan` (interno, único que asigna el plan Invitación): pasar `priceOverrideAmount: 0` + `priceOverrideReason` (sin razón → 400), y `adminId` = `users.id` real (audit_log con FK; en tests el id de `admin@test.com`, nunca `1`).
- Con precio 0 no hay transacción de cobro: alcanza `SubscriptionService` + `EnrollmentService`, sin `TransactionService`.
- Reservas reales en tests: `registerUser` + `getAuthToken` (los socios de `createMemberInPhysicalBranch` no loguean); `cleanAllTestData` vacía actividades y feriados → sembrar horario por día ISO en `beforeEach`. Regla un turno por día + ventana +2 días: reservas lejanas se siembran por DB.
- Compra con accesos vigentes: la sub de invitación pasa a `completed` en la misma tx (D-07); `scheduled` sigue dando 409.
- **194-18:** `getRenewalPreview` de una sub Invitación todavía devuelve datos (renovar da 400): agregarle el mismo guard.

### Tras 194-07
- Días hábiles: `el-templo-api/src/modules/shared/business-days.ts` (`addBusinessDays`, `loadHolidaySet`, `businessDaysHorizon`). Feriados: `loadHolidaySet(db, ctx, country, from, addDays(start, businessDaysHorizon(n)))`; país = el de la SEDE del invitado, no el del invitador.
- Parámetros: `getInvitationSettings(db, ctx, log)` en `referrals/invitation-settings.ts` (3er parámetro = logger: pasar `this.log`/`request.log`). Tope $ por país sin fila = sin tope.
- Fastify con `additionalProperties:false` DESCARTA claves extra (200), no las rechaza; validar en el servicio si hace falta 400.
- Molde de tests de rutas con varios roles: `test/invitations/settings.test.ts` (staff en `beforeAll`, reset de su namespace en vez de `cleanAllTestData`).
- Si el hook rechaza un comando compuesto, una parte YA pudo haberse ejecutado: verificar estado (`git diff`) antes de reintentar. Editar con Edit/Write.
