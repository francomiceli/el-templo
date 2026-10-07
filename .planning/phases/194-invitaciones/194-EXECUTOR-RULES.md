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

### Tras 194-08
- `InvitationService` en `referrals/invitation-service.ts` (+ `invitation-types.ts`); contrato en `194-08-SUMMARY.md`. Todos los `InvitationRuleError` → 409; invitado inexistente → 404.
- Bajo lock: pasar el `tx` a las funciones (`deriveMembershipCoveredUntil*` ya aceptan `TxHandle`); los settings se leen por el pool.
- `lint:tenant`: un fragmento `sql\`...\`` con columnas de `subscriptions` en statement aparte necesita `/* tenant-safe: ... */` pegado; no usar alias `const s = schema.subscriptions`.
- `tenant_settings` NO está en `TABLES_TO_CLEAN`: borrar `invitations.%` a mano en `beforeEach`.
- `bookings.status`: `reservado|qr_escaneado|confirmado|cancelado|lista_espera|no_show` (no existe `asistio`; asistió = `qr_escaneado|confirmado`).
- Fechas de expresiones SQL mixtas (`LEAST`/`COALESCE`): `CAST(... AS CHAR)`.
- **194-09 (orquestador):** agregar regla — un invitado con sub NO-trial `scheduled` (ya compró y arranca después) NO es elegible (mismo motivo que socio vigente). Test incluido.

### Tras 194-09
- **`InvitationService` recibe `BookingService` como 4.º argumento del constructor** (`voidInvitation` falla cerrado sin él). 194-10 y 194-12 lo inyectan al armar el servicio en las rutas. Helpers de test: `buildInvitationServices`, `createInviterWithCode`, `getAdminUserId`, `uniquePhone10`, `resetInvitationSettings`.
- `SubscriptionService.closeInvitationAccess` (público) es el único cierre de accesos (compra, anulación, compensación).
- `activate` compensa en falla (snapshot de status/sede/teléfono/DNI/lead, historial con `source='invitation_undo'`). Invitado de sede virtual elige cualquier sede física y recibe el plan del país de esa sede; invitado ya en sede física de otro país → 400.
- Día fijo en tests de reserva/check-in: `vi.useFakeTimers({ toFake: ["Date"] })` + `setSystemTime(<hoy AR>T13:00Z)` antes de loguear, clases 10:10.
- `FOR UPDATE` tiene que ser lo PRIMERO de la tx (snapshot posterior ve el COUNT de la activación previa).
- Abierto a propósito: sub puede nacer `scheduled` en ES 00-02h locales (UTC de `assignPlan`, global); no-show no descuenta saldo (comportamiento global).

### Tras 194-10
- Rutas app: `GET /api/members/referrals/invitations/eligibility`, `POST .../activate`. Errores `{ error, message, reason }` (404 código inexistente, 400 `phone_required`, 409 reglas). Mapeo compartido: `sendInvitationError` en `referrals/invitation-errors.ts` (reusar en 194-12).
- Para 400 explícito por claves extra en el body: `preValidation` `rejectUnknownBodyKeys` (Fastify con `additionalProperties:false` las borra en silencio).
- `InvitationService.previewActivation` corre las mismas reglas que `activate` sin identidad (teléfono/DNI se validan al activar).
- La sede 1 del fixture de referrals es física pero INACTIVA (no aparece en listados de sedes activas).
- En `activate`, invitador sin membresía → 409 antes de resolver sede: tests de "sede ajena → 404" necesitan invitador con membresía vigente.
- `prettier --write` con globs reformatea archivos ajenos: pasar rutas explícitas. Scripts python: escribirlos con Write y ejecutarlos aparte.

### Tras 194-32 (refactor, calidad de código — pedido explícito de Franco)
- Reglas en `referrals/invitation-rules.ts` (`InvitationRules`: cupo, membresía del invitador, elegibilidad, identidad, historial, `loadUserWithTimezone`, `resolveTimezone`). Orquestación en `referrals/invitation-service.ts` (~960 líneas: activate, void, compensación). `rules` NUNCA importa `service`.
- **NO seguir engordando `invitation-service.ts`.** Funcionalidad nueva (overview de "Mis invitados", etapa de lead, reporte, canal asistido si crece) va en su PROPIO archivo de `referrals/` (p.ej. `invitation-overview.ts`, `invitation-leads.ts`, `invitation-report.ts`) y compone `InvitationRules`/`InvitationService`. Funciones de >~80 líneas: partir en helpers con nombre.
- **NO engordar `subscriptions/service.ts`** (8k+ líneas, deuda previa): en cobros, cada charge-path hace UNA llamada al árbitro (`discount-arbiter.ts`) y la lógica vive en el árbitro.
- Planes ahora se ejecutan agrupados (un ejecutor corre varios PLAN seguidos, un SUMMARY por plan).

### Tras 194-11..13
- **Fecha de los tests:** NUNCA `todayStr()` (UTC) como `startDate` de una compra/alta: de noche (21-24 ART) arranca "mañana" respecto de `CURDATE()` y el socio no pasa a `activo`. Usar `todayInTz(<tz de la sede>)`. El helper `assignPlan` de `test/subscriptions/_helpers.ts` usa `todayStr()` por defecto: pasar `startDate` explícito. (`test/subscriptions-conversion-hook.test.ts` falla de noche por esto: preexistente; CI corre en UTC y no lo ve.)
- Registro con código de socio: exige `phone`, responde 200 (no 201), ya NO crea fila en `referrals` (D-26b) y devuelve `invitation: { code }`.
- Canal asistido en `referrals/invitation-assisted.ts`; armado compartido de servicios en `referrals/invitation-factory.ts` (usarlo en rutas nuevas). Conversión de leads en `referrals/invitation-conversion.ts`.
- **194-14..18: NO tocar el bloque que llama a `attributeInvitationPurchase` en `recomputeUserStatus`.**
- MySQL redondea TIMESTAMP al segundo: comparar con tolerancia de 1 s.
- `CASOS_BASELINE` cuenta `describe` (no `it`): un `describe` con clave de ruta por ruta nueva.

### Tras 194-14 (árbitro listo, sin cablear)
- Contrato del árbitro en `194-14-SUMMARY.md` y docblock de `subscriptions/discount-arbiter.ts`: `resolveInvitationDiscountCandidate` → `pickCoreCompetitor` → hook AURA por monto (`PricingAdjustCtx.competingDiscountAmount`) → `applyArbiterResult(priceAfterFilter, ...)`. Usar EXACTAMENTE ese orden en cada charge-path; no reimplementar gates ni topes en `service.ts`.
- Vínculo: `referrals/invitation-link.ts` (`findLinkableInvitation`, `materializeInvitationLink` idempotente). El candidato trae `linkToMaterialize` aunque el % sea 0: materializar igual dentro de la tx del cobro.
- `% por lado`: `ReferralService.computeInvitationDiscountPercent` (acepta `simulateInvitationLink`); `computeReferralDiscountPercent` delega.
- Tests del lado invitador: resembrar `aura_config.referral` en `beforeEach` (si no, valor stale).
- **194-19:** `getReferralOverview` tiene `perLinkPercent`/`activeCount` de un solo %: abrir el desglose por lado (invitado vs invitador).

### Tras 194-15 (assignPlan cableado)
- Patrón a replicar en 16/17/18: helper privado ÚNICO `computeChargeDiscounts({ mode: "charge" | "preview", ... })` en `service.ts` (+ `resolveChargeInvitation`/`prepareChargeDiscounts`/`settleChargeDiscounts`). Cada charge-path y su preview lo llaman UNA vez → paridad por construcción. No crear variantes.
- `createPlan` (API y fixtures) crea con `allowsInvitationDiscount=false`: todo test de descuento necesita `allowsInvitationDiscount: true` en el plan.
- Cada campo nuevo de un preview necesita su entrada en el schema de respuesta (`subscriptions/schemas.ts`), o el serializador lo descarta.
- Otra sesión del repo (p.ej. `et-195-seo`) puede correr vitest a la vez y dropear `eltemplo_test_N`: fallas en 1-5 ms con `ER_BAD_DB_ERROR` = corrida invalidada, repetir.
- `vi.spyOn(auditLog, "write").mockRejectedValueOnce(...)` sirve para probar atomicidad.
- Anotaciones pendientes: 194-16 ((g)), 194-17 ((f1) (f2)), 194-18 ((i) (i2) (j)).
- `lifecycle.test.ts` "autoExpireDueSubscriptions" falla de noche por `todayStr()` UTC: preexistente, no tocar.

### Tras 194-16 (changePlanAfterCurrent cableado)
- Reusar `settlementColumns` (`discount-arbiter.ts`) y `materializeSettlementLink` (`service.ts`); `computeChargeDiscounts` acepta `chargeCallSite` opcional (sumar `change-now`/`renew` al tipo si hace falta, no crear variante).
- Tests de cambio de plan/renovación: plan DESTINO con `allowsInvitationDiscount: true`. Tests nuevos de charge-paths van en `test/invitations/discount-arbiter-paths.test.ts` (un `describe` por charge-path).
- Variable asignada dentro del callback de `db.transaction`: `let x = null as number | null` (TS la angosta a `null`).
- **194-17:** `changePlanNow` tiene `supports.discounts=false` y su base es el neto post-prorrateo. **194-18:** además del árbitro y D-22, guard de plan Invitación en `getRenewalPreview` (lección tras 194-06).

### Tras 194-17 (changePlanNow cableado)
- `computeChargeDiscounts` acepta `auraSupported`, `prorationCredit`, `chargeCallSite: "change-now"` y devuelve `priceAfterFilter`. Para renovación, sumar `"renew"` y lo que haga falta como parámetros opcionales, sin variantes.
- **194-18:** al cablear `renewSubscription`, ELIMINAR `computePriceWithReferralDiscount` y el `qualifyReferralOnCharge` sin gate (quedan vivos solo por renew). Quedan 3 anotaciones `194: cambia en 194-18` ((i), (i2), (j)).
- **194-23 (admin):** en "mantener vencimiento" el admin usa su propia diferencia como precio; no pisarla con el `netAmount` del preview.
- Planes de `createPlan` sin `classesPerWeek: undefined` prorratean por clases, no por días: derivar números de `preview.proration.remainingValue`.
- Mutation testing: correr mutantes de a uno si alguno rompe todo el flujo (enmascara a los demás).

### Tras 194-18 (cobros completos: 14..18)
- Las 4 charge-paths y sus 3 previews pasan por `computeChargeDiscounts`. Renovación: `resolveRenewalCharge` (charge/preview), base en `subscriptions/renewal-base.ts`, fin de mes en `subscriptions/month-end.ts`. Caracterización con 0 anotaciones pendientes.
- **Contrato final de previews para 194-23** en `194-18-SUMMARY.md` (`RenewalPreview`: `basePrice`, `invitationDiscount*`, `partnerDiscount*`, `winningDiscount`, `finalPrice`; querystring `startDate`, `prorateToMonthEnd`, `priceOverrideAmount`, `priceOverrideReason`). El admin hoy multiplica % en el cliente (`MemberSubscriptionTab.vue`, `AssignPlanDialog.vue`): 194-23 lo reemplaza por los montos del servidor. **API y admin viajan juntos.**
- La PoS del profe (`coach-load-routes.ts` `renewAmountFor`) ya precarga `finalPrice`.
- Un Bash de más de 600 s pasa a segundo plano solo: ≤3 archivos de integración por corrida.
