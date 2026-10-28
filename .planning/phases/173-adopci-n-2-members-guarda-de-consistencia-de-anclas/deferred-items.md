# Deferred items — hallazgos fuera de alcance

## 2026-08-09 — 173-30 (Task 1): el switch — SALDADO. 2 accesos reales a `users` bloqueaban el cierre, y 3 hallazgos colaterales quedan documentados para 174/175

**Estado: SALDADO por 173-30**, commits `f5874215` (allowlist) y `afc4fe78`
(strict entry) en `feat/173-adopcion-members` (worktree `et-173`).

**Lo que este plan CERRÓ de la lista de abajo:**

1. **173-23 "colateral positivo de `reports/service.ts`" — CONFIRMADO Y CERRADO.**
   La entrada `{reports/service.ts, users}` de la allowlist real **sí** seguía
   viva tras 173-23: quedaba UN acceso genuino sin migrar,
   `reports/service.ts:1530` (fragmento de búsqueda por nombre dentro de
   `getExpiredMembers`, el mismo patrón que `goal-plans/routes.ts:484` — el
   AND con el `tenantWhere` del join real de la misma query lo hace redundante,
   el lint lo marca igual porque juzga por statement). Se cerró con la MISMA
   exención `tenant-safe` que ya tiene `goal-plans/routes.ts:484`. **No** era
   un bug de aislamiento real (la query completa sí filtraba), pero bloqueaba
   la allowlist en cero.
2. **Bug real nuevo, no documentado por ningún plan anterior:**
   `src/scripts/backfill-historical-payments.ts:386` — el pre-flight
   `existingMembers` (`SELECT id FROM users WHERE id IN (...)`) no tenía
   `tenantWhere(users, ctx)` pese a que el script ya resuelve `ctx` con
   `requireTenant` tres líneas antes. Corregido con `and(tenantWhere(users,
ctx), inArray(...))`. Impacto real: bajo (script one-shot ya ejecutado
   según su cabecera, y el pre-flight solo verifica existencia), pero era un
   acceso genuino sin filtrar y bloqueaba el switch.
3. **Gate de la lente estática (`con-06-lint.test.ts`) estaba REVENTADO desde
   ANTES de que este plan tocara una línea** — hallazgo nuevo: al medir
   `tablasConDeuda.size` en el HEAD de arranque de este plan (`15ec3ba1`), ya
   daba **74** (no 81): 7 de las 8 tablas de `members` ya habían quedado sin
   ningún acceso vivo por el trabajo acumulado de 173-01..29, y el gate
   `.toBeGreaterThanOrEqual(81)` de `con-06-lint.test.ts` nunca se había vuelto
   a correr contra el árbol real después de esos planes (cada uno verificó su
   propio recorte, ninguno corrió `con-06-lint.test.ts` completo). Con el fix
   del punto 2 (baja de 74 a 73), el número real es 73. Actualizado con
   contabilidad explícita (172: 81, 173: 73), igual que el precedente de
   172-21.
4. **6 fixtures sintéticos de `con-06-lint.test.ts` usaban `users`/
   `member_profiles` como ejemplos genéricos de "tabla gym-owned NO strict"**
   — al declarar `members` strict (Task 2), esas dos tablas dejaron de servir
   como ejemplo y rompían 6 `it` del describe "los cuatro gates del ratchet"
   (mismo criterio que el propio archivo documenta para `bookings`: cambiar la
   tabla del fixture, no la aserción). Se reemplazaron por `schedules` y
   `subscription_plans` en `test/tenancy/__fixtures__/lint/accesos.ts` y
   `exenciones.ts`, con el docblock explicando el motivo.

**Verificado:** `pnpm lint:tenant` → `DISCREPANCIAS: 0` (339 entradas, todas
correspondientes a deuda real de otros módulos); `con-06-lint.test.ts` 38/38;
`test/db/tenant-tables.test.ts` 18/18; suite completa (261 archivos, ~3443
tests) verde con `members` strict de verdad, sin sonda. Detalle completo en
`173-30-SUMMARY.md`.

**Decisión tomada sobre la deuda de 173-25 (58 INSERTs sin `tenantValues`,
ver la entrada de abajo): NO se tocan en este plan.** Siguen sin ser un throw
real (Drizzle siempre incluye `tenant_id` en el SQL compilado del INSERT, el
sentinel no distingue `DEFAULT` de un valor explícito), y arreglarlos exige
tocar archivos fuera de `files_modified` de 173-30 (D-02 no lo permite:
cirugía mínima es sobre las 3 tablas/2 bugs que bloqueaban el switch, no un
barrido general). Queda igual de diferida a 174/175 (dueño natural de los
archivos que los contienen).

## 2026-08-09 — 173-28: `POST /api/admin/users/:userId/program-addons` escribía `program_enrollments` sin `tenantValues` — cross-tenant real (pricePaid=0), y el gap adyacente que NO se arregla

**Contexto:** esta ruta vive en `src/modules/programs/routes.ts` (módulo
`programs`, diferido a 174/175) pero su `:userId` es un socio — el ancla
`users.tenant_id` SÍ está en el alcance de esta fase (D-02: cirugía mínima
sobre la tabla strict, aunque el archivo sea ajeno).

**Hallazgo verificado EN VIVO antes del fix:** ni el lookup de `activeSub` de
la ruta ni `EnrollmentService.enrollAddon` (`src/modules/programs/
enrollment-service.ts`) chequeaban de qué gimnasio era `request.params.userId`.
Un staff del gimnasio 2 podía POSTear a `/api/admin/users/<userId de El
Templo>/program-addons` con `pricePaid` ausente o `0` (el camino "regalo" que
NO pasa por `transactionService.create` — strict desde la fase 172, que
hubiera bloqueado el caso con `pricePaid>0`) y recibir un 200 real, con una
fila nueva en `program_enrollments` para el socio ajeno.

**Fix aplicado en este plan** (`src/modules/programs/routes.ts`, commit
`bc4e34a2`): un `SELECT users` con `tenantWhere(users, ctx)` ANTES del lookup
de suscripción activa — socio ajeno → 404 "Miembro no encontrado", mismo
contrato D-06 que el resto del módulo `members`. Probado en
`iso-03-members-altas-y-staff.test.ts` (describe "add-on de programa").

**Lo que NO se arregló (fuera de alcance de D-02):** el `INSERT` de
`EnrollmentService.enrollAddon` sobre `schema.programEnrollments`
(`enrollment-service.ts:407-419`) NO usa `tenantValues(ctx, {...})` — escribe
un objeto plano, así que la fila SIEMPRE nace con `tenant_id = DEFAULT 1`
(El Templo), sin importar de qué gimnasio sea el actor. Esto significa que
incluso una inscripción 100% LEGÍTIMA de un staff del gimnasio 2 sobre su
PROPIO socio deja una fila de `program_enrollments` con el `tenant_id`
incorrecto. No se corrigió porque `program_enrollments`/`programs` no son
tablas `strict` de esta fase (pertenecen a la adopción de `programs`/
`subscriptions` en 174/175, D-02 prohíbe ensanchar el alcance) — y por eso el
control positivo de ese `describe` NO afirma el `tenant_id` de la fila creada
(afirma userId + conteo, documentado inline en el test).

**A quién le queda:** dueño natural es la fase que adopte `programs`/
`subscriptions` (174/175) — agregar `tenantValues` a ese INSERT es un cambio
de una línea, pero corresponde a esa fase por D-02.

## 2026-08-09 — 173-28: `user_branches` NO tiene el mismo "cinturón" de FK compuesta que `users.branch_id` — hallazgo de la mutación de cierre de Task 2

**Procedimiento:** siguiendo el criterio de cierre del plan, se rompió
temporalmente (revertido, `git status --porcelain src/modules/users/
service.ts` limpio después) `assertBranchDelGimnasio` dentro de
`src/modules/users/service.ts`, reemplazándolo por una versión local que
resuelve CUALQUIER sede existente ignorando el gimnasio del `ctx` — simulando
que el helper de ADO-07 (D-05) no filtrara por tenant. Se corrió
`iso-03-members-altas-y-staff.test.ts` completo (31 tests) con la mutación
activa.

**Resultado: solo 1 test se puso rojo** (`branchIds[] MIXTO`, `POST
/api/admin/users`). Los otros dos casos de sede cruzada de staff
(`branchId` primario de `POST /api/admin/users` y de `PUT /api/admin/users/
:userId`) siguieron en VERDE pese a la mutación — pero por un motivo
DISTINTO al esperado: la respuesta pasó de 404 a **500** (`"Error interno del
servidor"`), IDÉNTICA para el branchId ajeno y para un branchId
directamente inexistente (verificado con un `console.log` temporal, no
commiteado). La causa: la FK compuesta `users(tenant_id, branch_id) →
branches(tenant_id, id)` de la migración 0200 (plan 173-12) rechaza el
`INSERT`/`UPDATE` de `users` a nivel de MySQL cuando el `branch_id` resuelto
(por el helper mutado) no pertenece al mismo `tenant_id` — un rechazo real
(el ancla NUNCA queda escrita cruzada), pero sin pasar por el `catch` que
mapea `NotFoundError` a 404: el error de MySQL no es una `AppError`, así que
`handleServiceError` lo trata como desconocido y devuelve 500.

**El caso que SÍ se puso rojo (`branchIds[] MIXTO`) revela la asimetría real:**
`user_branches` (la segunda tabla que D-08 nombra explícitamente como parte
del ancla — "`users.branch_id` y `user_branches.branch_id`") **NO tiene una
FK compuesta equivalente** hacia `branches(tenant_id, id)`. Con el helper de
app mutado, el `INSERT` de `user_branches` para el `branchIds[]` mixto
(`[sede propia, sede de El Templo]`) se completó SIN error: la respuesta fue
201 real, con `branchIds: [<propia>, <ajena>]` en el body — una fila de
`user_branches` quedó con `tenant_id = TENANT_DOS` pero `branch_id` de una
sede de El Templo, exactamente la divergencia de anclas que ADO-07 existe
para impedir.

**Por qué esto NO es una vulnerabilidad hoy:** bajo el código real (sin
mutar), `assertBranchDelGimnasio` SÍ filtra por gimnasio — el caso nunca se
alcanza (confirmado: 31/31 verde sin la mutación, incluido este mismo test).
Es exclusivamente un hallazgo de profundidad de defensa: si el helper de app
alguna vez regresionara, `users.branch_id` todavía tendría el cinturón de la
FK (aunque salga como 500 en vez del 404 esperado — otro hallazgo menor, ver
abajo), pero `user_branches.branch_id` quedaría COMPLETAMENTE desprotegido.

**No se corrigió acá** (agregar una FK compuesta a `user_branches` es una
migración nueva — "no migraciones" es una regla dura de este plan, y además
es un cambio arquitectónico que excede el alcance de un plan de batería de
tests). Documentado para que quien revise el cierre de la fase (173-30) o
diseñe un futuro hardening de `user_branches` lo tenga registrado.

**Hallazgo menor asociado:** cuando la FK compuesta de `users` SÍ rechaza (el
caso de arriba), el error de MySQL no está mapeado a un 404 — sale como 500
genérico. Bajo el código real esto es inalcanzable (el helper de app
siempre filtra antes), pero si alguna vez se quisiera un cinturón-y-tirantes
más prolijo, capturar el error de FK y mapearlo al mismo contrato D-06 (404)
sería la mejora natural — no arreglado acá por la misma razón (fuera del
alcance de un plan de test, y hoy inalcanzable en producción).

## 2026-08-09 — 173-27 (Task 1): `getReferralOverview` lee `referrals` sin `tenantWhere` propio — depende por completo de que las escrituras nunca dejen una fila cross-tenant

**No es un archivo de este plan** (`src/modules/referrals/service.ts` pertenece
al módulo `referrals`, explícitamente diferido a las fases 174-175 en
`173-CONTEXT.md`, sección "Deferred Ideas": _"Migración completa de
analytics, scheduling, subscriptions..., referidos..."_). `files_modified`
del 173-27 es solo el archivo de test.

**Hallazgo:** `getReferralOverview` (invocado por `GET
/api/admin/members/:userId/referrals`) arma su query de vínculos así:

```ts
const links = await this.db
  .select({
    referrerId: referrals.referrerId,
    referredId: referrals.referredId,
    status: referrals.status,
  })
  .from(referrals)
  .where(
    and(
      ne(referrals.status, "revoked"),
      or(eq(referrals.referrerId, userId), eq(referrals.referredId, userId)),
    ),
  );
```

Sin `tenantWhere(referrals, ctx)`. Si existiera una fila de `referrals` con
un `referrerId`/`referredId` de OTRO gimnasio (dato corrupto o histórico
pre-migración), esta query la traería igual, exponiendo el `userId` numérico
crudo de la contraparte (`ReferralLinkView.userId = counterpartyId`) y el
`state` derivado — aunque el `fullName` SÍ queda scopeado (la resolución de
nombre en la misma función hace `tenantWhere(users, ctx)`, así que el nombre
resolvería vacío).

**Por qué NO se puso rojo en la batería del 173-27:** el ÚNICO camino de
escritura de esta fase que puede crear un vínculo (`POST
/:userId/referrals` → `assignReferrerToMember`, T-173-08) valida
`tenantWhere(users, {tenantId})` sobre el `referrerId` ANTES de insertar —
un referidor de otro gimnasio da 404 y la fila jamás se crea (test de este
plan: "asignar como referidor a un socio de El Templo se rechaza..."). Con
ese invariante sostenido en el 100% de los casos, la ausencia de
`tenantWhere` en la LECTURA es defensa en profundidad rota, no un boquete
ejercitable por la API actual.

**Por qué queda para 174/175:** `referrals` no está en
`TENANT_STRICT_MODULES.members` (D-08 del CONTEXT: el alcance de esta fase
es el ancla `users`/`user_branches` y sus 8 tablas, `referrals` es del
módulo homónimo). Si una fase futura migra `referrals` a strict, este
`.select()` va a hacer throw del sentinel igual — el fix natural
(`tenantWhere(referrals, ctx)` en el WHERE) queda documentado acá para
cuando ese módulo se toque.

## 2026-08-09 — 173-26 (Task 2): mutación de cierre sobre `listMembers` no da rojo — el aislamiento del listado depende también del invariante de anclas (ADO-07), no solo del filtro directo sobre `users`

**No es un bug de este plan** (no se tocó `src/modules/members/service.ts`).
Descubierto durante la mutación de cierre que el propio plan pide (romper el
`tenantWhere` del constructor de filtros de `listMembers` y verificar que
los tests esperados se pongan en rojo).

**Hallazgo:** comentar `conditions.push(tenantWhere(schema.users, ctx))` (la
línea 141, PRIMER elemento del array de `listMembers`) y correr la batería
completa de `test/tenancy/iso-03-members-listados.test.ts` da **22/22
verdes igual** — ningún test se puso en rojo, incluidos los 2 de
`GET /api/admin/members`.

**Causa:** las tres queries de `listMembers` (`countPromise`/`rowsPromise`/
`totalDebtPromise`) hacen `innerJoin(schema.branches, and(tenantWhere(branches,
ctx), eq(branches.id, users.branchId)))`. Como el socio ajeno de El Templo
tiene `branchId` de una sede de OTRO tenant, ese JOIN (filtrado por
`tenant_id` del lado de `branches`) ya excluye la fila ajena aunque el
filtro directo sobre `users` esté ausente — son dos filtros independientes
sosteniendo el mismo resultado, la trampa que el propio plan pedía
documentar en los dos sentidos.

**Por qué le queda a 173-29/30 (ADO-07):** esta protección "de más" depende
por completo de que `users.branch_id` apunte SIEMPRE a una sede del MISMO
gimnasio que el usuario — exactamente el invariante que la guarda de anclas
(D-05 del CONTEXT: helper `assertBranchDelGimnasio`/FK compuesta migración
0198+) existe para hacer imposible de romper. Si ese invariante llegara a
violarse (un socio con `branchId` de una sede ajena — el escenario mina M10
que ADO-07 previene), el JOIN dejaría de proteger y el filtro directo sobre
`users` sería la ÚNICA barrera de `listMembers`. **No se debe quitar la
línea 141 aunque hoy sea redundante.** Recomendación: cuando 173-29/30
verifiquen el cierre de ADO-07, usar esta misma mutación (constructor de
`listMembers`) como caso de prueba de que la guarda de anclas es la que
sostiene la redundancia, no un JOIN que "por las dudas" alcanza.

**Verificado:** mutación revertida sin commitear inmediatamente después de
la corrida (`cp` desde backup en `/tmp`), `git status --porcelain
src/modules/members/service.ts` vacío. Detalle completo en
`173-26-SUMMARY.md`, sección "Hallazgos (mutación de cierre)".

## 2026-08-09 — 173-25 (Task 3): barrido estático encuentra 58 `INSERT` de Drizzle sin `tenantValues` fuera del alcance de este plan — no bloquean el throw, informativo para 173-30

**Contexto:** el barrido global de la Task 3 (script ad-hoc, ver SUMMARY) sobre
LAS 8 tablas del módulo, en TODO `test/` (249 archivos), separa dos canales:
(A) `SELECT`/`UPDATE`/`DELETE`/SQL crudo — el canal que el sentinel evalúa por
presencia de `tenant_id` en la zona de predicado — y (B) `.insert(schema.X)`
de Drizzle. El canal A da **0** (verificado, ver SUMMARY). El canal B da
**58 sitios** en archivos que NO son de este plan (la mayoría de `173-22`,
`173-23`, `173-24` y de fases previas a la 173): `.insert(schema.users)` /
`.insert(schema.memberProfiles)` / `.insert(schema.userStatusHistory)` /
`.insert(schema.userBranches)` sin `tenantValues(ctx, {...})`.

**Por qué NO son throws y por qué NO se tocaron:** confirmado empíricamente
(múltiples corridas de la suite completa con la sonda encendida, `grep -c
TenantSentinelError` = 0 en todas): Drizzle genera el INSERT listando TODAS
las columnas del schema, incluida `tenant_id`, usando la palabra clave
`default` para las no provistas — el string `tenant_id` está SIEMPRE presente
en el SQL compilado de un `.insert()`, se pase o no `tenantValues`. El
sentinel (`analyzeSql`, etapa 4) solo chequea presencia del literal, no
corrección (documentado en su propio docblock): un INSERT sin `tenantValues`
satisface la presencia igual y nunca hace throw. Esto es una característica
real de la herramienta, no una casualidad — verificado con el error real de
`test/migrations/0109_reconcile_soledad.test.ts` (SQL **crudo**, sin la
columna `tenant_id` en absoluto) que SÍ hacía throw, contra decenas de
`.insert(schema.users)` de Drizzle que nunca lo hicieron pese a no llevar
`tenantValues`.

**Riesgo real (bajo, pero no cero):** para los ~58 sitios, la fila cae en el
`DEFAULT 1` de la columna. En archivos single-tenant (la inmensa mayoría) esto
es equivalente a estampar tenant 1 a mano — no es un bug. El único sitio con
riesgo real detectado es `test/tenancy/con-01-uniques-cross-tenant.test.ts`
(4 de los 58), que SÍ siembra un segundo tenant — pero esos 4 inserts
puntuales no fallaron en la corrida completa de la Task 3 de este plan (con-01
100% verde con la sonda encendida), así que no hay evidencia de que estén mal.

**A quién le queda:** **173-30** — al cerrar el switch definitivo, decidir si
vale la pena una pasada de "INSERT completeness" sobre estos 58 sitios (fuera
del `files_modified` de 173-22/23/24/25) o si se acepta como deuda conocida
igual que el resto de los sitios `tenant-safe`. La lista completa de archivos
y líneas está en el output del script de la Task 3 (no versionado, en el
scratchpad de la sesión — se puede regenerar con el barrido descripto en
`173-25-SUMMARY.md`).

## 2026-08-08 — 173-24: `test/tenancy/` (fixtures del gimnasio 2) NUNCA verificado con la sonda de `members` — 31+6+5 rojos en 3 archivos

**Estado: RESUELTO por 173-25** (Task 1), commit `a64034a7` en
`feat/173-adopcion-members` (worktree `et-173`).

**Causa raíz real (NO era la hipótesis de 173-24):** los 3 archivos
(`iso-03-finance-coach-load.test.ts`, `iso-02-fixtures.test.ts`,
`ancla-autorregistro.test.ts`) NO tenían ningún bug de siembra del gimnasio 2
— `seedSecondTenant`/`createStaffUser`/`createTestMember` ya estampaban
`tenantId` explícito, verificado por 173-21. La causa única y real era
`test/fixtures/finance-gimnasio-dos.ts::adminSemillaId` (fixture de la fase
172, NO de esta fase): un `SELECT id FROM users WHERE email = ?` sin
`tenantWhere`, que hacía throw ANTES de que cualquiera de los 3 archivos
llegara a sembrar el gimnasio 2 (era una dependencia compartida: los tres
llaman a `sembrarFinanzasTemplo`, que llama a `adminSemillaId`). Un solo
`tenantWhere(schema.users, CTX_TEMPLO)` en esa función arregló los 98 tests
de los 3 archivos de una sola vez — cero relación con la siembra del
gimnasio 2 en sí. `iso-02-fixtures.test.ts` y `ancla-autorregistro.test.ts`
sí tenían además lecturas de evidencia (`tenantDeLaFila`/`campoDeLaFila`)
con exención `tenant-safe` como comentario TS (no embebida en el SQL,
invisible al sentinel) o sin exención — se corrigieron con el mismo patrón
que 173-22 estableció para `auth/routes.ts` (embeber el tag dentro del
fragmento `sql`).

**Verificado:** `vitest run --no-file-parallelism test/tenancy/iso-02-fixtures.test.ts
test/tenancy/ancla-autorregistro.test.ts test/tenancy/iso-03-finance-cajas.test.ts
test/tenancy/iso-03-finance-coach-load.test.ts test/tenancy/iso-03-finance-transacciones.test.ts`
→ 100% verde (era 31+6+5 rojo). Detalle completo en
`173-25-SUMMARY.md` (Task 1, hallazgo "root cause único").

**Hallazgo original (histórico, para contexto):**

**No es un archivo de este plan** (`files_modified` de 173-24: `test/analytics/`,
`test/scheduling/`, `test/attendance/`, `test/check-ins/`, `test/segmentation/`,
`test/onboarding/`, `test/ratings/`, `test/improvement-proposals/`, campañas,
notificaciones y los 6 archivos sueltos de trial). Descubierto al armar una
corrida de regresión acumulada más amplia que la que pide el `<verify>` literal
de este plan (agregué `test/tenancy` porque canonical_refs lo cita como
"idioma de la batería" — sobre-alcance mío, no del plan).

**Síntoma:** con la sonda de `members` encendida, `test/tenancy/iso-03-finance-coach-load.test.ts`
da **31/31 rojo**, `test/tenancy/iso-02-fixtures.test.ts` **6/13 rojo** y
`test/tenancy/ancla-autorregistro.test.ts` **5/6 rojo** — los tres ejercitan
`seedSecondTenant`/`createStaffUser`/`createTestMember`/`registerUser` para
sembrar el "gimnasio 2" (tenant 90671).

**Verificado que NO es un rojo del sentinel:** `grep -c TenantSentinelError`
sobre el log completo de esa corrida da **0** — son puros `AssertionError`
(conteos, aislamiento cross-tenant) sin el error del sentinel en la cadena de
`cause`. No se investigó la causa raíz (fuera de mi `files_modified`), pero la
hipótesis más probable por los nombres de los tests ("el admin y el coach
nacen en el gimnasio 2", "createStaffUser SIN tenantId escribe en El Templo")
es que algún camino de siembra del gimnasio 2 no está estampando el
`tenantId` explícito y el `DEFAULT 1` de la columna los hace nacer en El
Templo — visible recién ahora porque es la PRIMERA vez que alguien corre
estos 3 archivos con `users` en `TENANT_STRICT_MODULES`.

**Por qué nadie lo vio antes:** confirmado por grep en `files_modified` de
173-21 (`test/helpers.ts`, `test/setup.ts`, `test/fixtures/second-tenant.ts`),
173-22 (`test/members/`, `test/users/`, `test/auth/`, `test/shared/`, leads) y
173-23 (`test/subscriptions/`, `test/finance/`, `test/reports/`, `test/coach/`,
`test/programs/`, `test/referrals/`) — **ninguno de los tres planes incluye
`test/tenancy/`** en su `files_modified`. 173-21-SUMMARY.md línea 83 confirma
que su propia verificación de `test/tenancy test/db` fue "sin sonda". Es
terreno nunca hardeneado contra el throw de `members`.

**A quién le queda:** **173-30** (el switch) no puede prender `members` en
`TENANT_STRICT_MODULES` de forma permanente mientras estos 3 archivos revienten
— son parte de la batería de aislamiento del propio milestone (ISO-02/03) y
deberían ser los PRIMEROS en pasar, no los últimos. Recomiendo que el planner
de 173-30 (o un plan de hardening dedicado antes) revise `test/helpers.ts` /
`test/fixtures/second-tenant.ts` con la sonda encendida para encontrar el(los)
sitio(s) exacto(s) que no estampan tenant explícito en la siembra del gimnasio 2.

## 2026-08-08 — 173-24: corrida de regresión acumulada (173-22+173-23+173-24) contaminada por el flake horario de calendario (>21:00 AR) — 46 rojos, CERO son del sentinel

**Contexto:** el `<action>` de la Task 2 de este plan pide cerrar con "la
corrida de regresión acumulada de los grupos 173-22 + 173-23 + 173-24". Se
armó esa corrida combinando el `files_modified` textual de los 3 planes
(corregido tras un primer intento que sobre-incluía `test/tenancy`, ver
hallazgo de arriba) — **153 archivos, 1862 tests** — con la sonda de `members`
encendida, arrancando **21:03:52 hora AR**.

**Resultado: 15 archivos con 46 tests rojos, pero `grep -c TenantSentinelError`
sobre el log completo da 0.** Se inspeccionó el detalle de varios a mano:
`test/analytics/analytics.test.ts` ("counts a member with an in-effect
subscription" espera 1, recibe 0 — `activeMemberExists` depende de que
`endDate` sea futuro respecto de `CURDATE()`), `test/reports-trial-sessions.test.ts`
("attended filter" espera `[1481]`, recibe `[]`), `test/subscriptions/lifecycle.test.ts`
("autoExpireDueSubscriptions... without a read" — cron de vencimiento),
`test/improvement-proposals/improvement-proposals.test.ts` ("filters by date
range" — compara `new Date().toISOString().split("T")[0]` en JS/UTC contra
filas escritas con fecha de servidor) — **todos son comparaciones de fecha
relativas a `NOW()`/`CURDATE()` que se corren después de las 21:00 hora AR**
(UTC-3), la misma ventana de flake que la memoria del proyecto ya documenta
para analytics (ver `reference_test_arpu_dependiente_del_calendario.md`,
`reference_fake_timers_salto_relativo.md`) — acá se confirma que la ventana
afecta a CUALQUIER test con lógica de fecha relativa, no solo a analytics.

**Tres de los 15 archivos son míos** (`test/analytics/advanced-finance.test.ts`,
`analytics.test.ts`, `engagement.test.ts`) — los tres habían corrido **100%
verdes** en la verificación oficial de la Task 1 (antes de las 20:06 hora AR,
mismo día). Dos más están en mi `files_modified` sin que yo los tocara
(`test/improvement-proposals/improvement-proposals.test.ts`,
`test/reports-trial-sessions.test.ts`) y también habían corrido verdes en la
verificación oficial de la Task 2 (antes de las 20:45 hora AR). Los 10
restantes son de 173-22/173-23 (`test/members/`, `test/users/`,
`test/subscriptions/`, `test/subscriptions-conversion-hook.test.ts`,
`test/finance/coach-load-alta.test.ts`), ninguno tocado por este plan.

**No se investigó ni se corrigió ninguno** — el flake horario es una
propiedad del RELOJ del runner al momento de correr, no del código, y
"arreglarlo" ajustando aserciones violaría la regla del doc 07 §6 (nunca
ajustar un número sin explicar POR QUÉ cambió realmente). La verificación
oficial de ambas tasks de este plan (los `<verify>` literales del plan, ver
SUMMARY) se hizo ANTES de las 21:00 y quedó 100% limpia — es la que cuenta
para el `<acceptance_criteria>` de 173-24.

**A quién le queda:** quien vuelva a correr la regresión acumulada completa
de 173-22+173-23+173-24 (173-30 u otro plan de cierre) debe hacerlo **antes de
las 21:00 hora AR** para obtener una señal limpia, o tratar cualquier rojo sin
`TenantSentinelError` en la cadena de `cause` como sospechoso de calendario
antes de diagnosticarlo como regresión de tenancy — exactamente el criterio
que el propio plan 173-24 ya pedía aplicar a `test/analytics` en su Task 1.

**Confirmación 173-25 (Task 2, 2026-08-08/09):** el mismo patrón de flake
apareció en un archivo NUEVO no listado arriba —
`test/migrations/0111-program-enrollments-addon-columns.test.ts` (Test 3 y
Test 4, matching `s.start_date <= DATE(pe2.enrolled_at)` con `today` calculado
en JS/UTC vía `new Date().toISOString().slice(0,10)` contra `enrolled_at`
insertado con el reloj de MySQL) — reproducido en corridas repetidas después
de las 21:00 y de nuevo cerca de las 23:00 hora AR, con `grep -c
TenantSentinelError` = 0 en ambas. **No es un archivo de este plan** (no está
en `files_modified` de 173-25) y no se tocó. Confirma que la ventana de flake
afecta a CUALQUIER comparación de fecha relativa al reloj del proceso Node
(UTC) contra el reloj de MySQL (local), no solo a los módulos ya identificados
— agregar a la lista de "sospechosos de calendario" de quien corra la
regresión completa.

## 2026-08-08 — 173-23: RESUELTO — `recomputeUserStatus`/`activateScheduledSub` (subscriptions/service.ts, deuda de la 173-14) bloqueaban CUALQUIER lectura de suscripción

**Estado: CERRADO por 173-23**, commit `cd3174f3` en `feat/173-adopcion-members`
(worktree `et-173`).

**No es un archivo de este plan** (`files_modified` de 173-23 son rutas
`test/`). Descubierto al correr `test/subscriptions` + `test/finance` con la
sonda de `members` encendida: 13 tests en 4 archivos ajenos al diff de test
(`lifecycle.test.ts`, `bundle-todos-los-programas.test.ts`,
`expire-cancel-linked-program.test.ts`, `plan-programs-access.test.ts`)
daban 500 en cualquier renovación, cancelación o simple `GET` de la
suscripción de un socio.

**Causa raíz:** la 173-14 dejó documentado (`ctx: TenantContext | null`,
comentario "DEUDA CON DUEÑO — FASE 174") que `autoExpireSubscriptions`
—invocado por `getMemberSubscription(s)`/`getMemberSubscriptionHistory`,
que a su vez alimentan prácticamente CUALQUIER lectura de suscripción—
llama a `recomputeUserStatus(null, …)` y `activateScheduledSub(null, …)`
sin `ctx`. Mientras `users` no era strict eso era inocuo; con `users` en
`TENANT_STRICT_MODULES` (el switch que esta fase prepara), las 4 queries de
ese camino (`SELECT status FROM users`, el `UPDATE users` crudo, el
`SELECT`/`UPDATE` de `branchId` en `activateScheduledSub`) hacen throw
siempre — no es un caso de borde, es la mayoría de los flujos de vida de
una suscripción.

**Por qué se corrigió acá (Rule 3, no scope creep):** threadear un `ctx`
real hasta `autoExpireSubscriptions` exige migrar `scheduling/booking-service.ts`
y rutas member-facing de la app — eso sigue siendo trabajo de la fase 174,
intacto. Lo que se arregló es SOLO la superficie que bloqueaba la
verificación de este plan: el mismo guard `isNotNull(tabla.tenantId)` que
173-08 estableció para métodos PK-scoped sin `ctx` externo, aplicado a las
4 queries del camino `ctx === null` (2 en `recomputeUserStatus`, 2 en
`activateScheduledSub`). Cero archivos nuevos tocados fuera de
`subscriptions/service.ts` (el mismo archivo que ya había tocado la 173-14).
La guarda ADO-07 de `activateScheduledSub` (validación de sede contra el
gimnasio) sigue condicionada a `ctx` real — esa parte de la deuda sigue
intacta para la fase 174, solo se cerró el throw del sentinel.

**Verificado:** sonda de members encendida a mano, `vitest run
--no-file-parallelism test/subscriptions test/finance` 605/605 (antes: 127
rojos), `tsc --noEmit` limpio, `typecheck:tests` 175/175 baseline sin
regresión.

**A quién le queda:** la fase 174 sigue siendo dueña de cerrar el camino
completo (threadear `ctx` real por `getMemberSubscriptions`(plural)/
`getMemberSubscriptionHistory` y sus ~8 call sites, incluida la guarda
ADO-07 de `activateScheduledSub`) — este hallazgo solo evita que el switch
de 173-30 deje el módulo de suscripciones inoperable.

## 2026-08-08 — 173-23: RESUELTO — 4 métodos de `reports/service.ts` (deuda de la 173-05) sin `ctx`, bloqueaban `/expired-members`, `/expiring`, `/inactive` y `/trial-sessions`

**Estado: CERRADO por 173-23**, commit `5a2958ef` en `feat/173-adopcion-members`
(worktree `et-173`).

**No es un archivo de este plan.** Descubierto al correr `test/reports` +
`test/coach` + `test/programs` + `test/referrals` con la sonda de `members`
encendida: `test/reports/expired-members.test.ts`, `test/reports/reports.test.ts`
(`GET /expiring`, `GET /inactive`) y `test/reports-trial-sessions.test.ts`
fallaban EN BLOQUE (50 tests) con 500 silencioso (sin `TenantSentinelError`
visible en el log del test porque `handleServiceError` lo aplana a "Error
interno del servidor" — hubo que reproducir el request a mano con
`NODE_ENV=development` para ver el throw real).

**Causa raíz:** la 173-05-SUMMARY ya había documentado 4 métodos de
`reports/service.ts` como deuda diferida ("todavía no recibe `ctx`"):
`getExpiredMembers`, `getTrialConversionReport`, `getTrialSessionsReport`,
`loadRosterAttribution`. De esos, `getTrialConversionReport` ya tenía `ctx`
(cerrado por algún plan posterior); los otros 3 seguían sin él — más
`getExpiringMemberships`/`getInactiveMembers`, dos métodos con el mismo
patrón (join `subscriptions`+`users` sin `tenantWhere` en ningún lado) que
el inventario de la 173-05 no había nombrado explícitamente.

**Por qué se corrigió acá (Rule 3, no scope creep):** los 5 métodos
(`getExpiredMembers`, `getExpiringMemberships`, `getInactiveMembers`,
`getTrialSessionsReport` + su helper privado `loadRosterAttribution`)
tienen **un único call site cada uno**, todos dentro de
`reports/routes.ts` — ningún módulo ajeno los llama. Threadear
`ctx: TenantContext` es cirugía mínima real (mismo archivo que ya tocó la
173-05), no un ensanche de D-02. Se agregó `ctx` primero a los 5 métodos +
sus 2 wrappers de export (`exportExpiringMemberships`/`exportInactiveMembers`),
con `tenantWhere`/`AND tenant_id = ?` en cada acceso a `users`/`subscriptions`
(INNER JOIN → en el ON; el `creator` de `getTrialSessionsReport` es LEFT
JOIN → filtro en el ON, nunca en el WHERE, para no convertirlo en INNER), y
`assertTenant` en los 7 call sites de `reports/routes.ts`.

**Colateral positivo para 173-30:** la 173-05-SUMMARY dejaba escrito que la
entrada `{reports/service.ts, users}` de la allowlist real "no puede
desaparecer solo con ese plan" por esta deuda. Con los 4 métodos que
listaba (más los 2 no nombrados) ya migrados, 173-30 debería poder
verificar si esa entrada de allowlist ya cierra — no se tocó la allowlist
en este plan (fuera de alcance de 173-23), pero el bloqueador que la
mantenía viva puede estar resuelto.

**Hallazgo adicional en el camino:** `referrals/service.ts::getAbTestResults`
tenía una exención `tenant-safe` (173-08) escrita SOLO como comentario TS
sobre la cadena de Drizzle — exime al lint (ancla AST) pero no al sentinel
(D-17, mismo patrón que 173-21 encontró en `auth/routes.ts`). Se repitió el
tag embebido en un fragmento `sql\`` del `where`.

**Verificado:** sonda de members encendida a mano, `vitest run
--no-file-parallelism test/reports test/coach test/programs test/referrals`
255/255 (antes: 50 rojos), `tsc --noEmit` limpio, regresión conjunta
173-22+173-23 (10 carpetas, 96 archivos, 1130 tests) verde.

**A quién le queda:** 173-30 — confirmar con `pnpm lint:tenant` (allowlist
de trabajo sin la entrada `{reports/service.ts, users}`) si esta fase ya
cerró esa deuda o si queda algún acceso residual sin nombrar.

## 2026-08-08 — 173-22 (pre-task): RESUELTO — `auth/routes.ts` ahora sobrevive al throw

**Estado: CERRADO por 173-22**, commit `daf75094` en `feat/173-adopcion-members`
(worktree `et-173`). Ver el hallazgo original más abajo ("173-21: `auth/routes.ts`
NO sobrevive al throw...") para la causa raíz completa.

**Fix aplicado:** las 5 anotaciones `tenant-safe` de `auth/routes.ts` (login,
register ×3, refresh) se mantuvieron como comentario TS (siguen exiendo al
LINT, que ancla por AST) y ADEMÁS se repitió el mismo tag `/* tenant-safe:
<motivo> */` embebido DENTRO del fragmento `sql` que arma cada predicado del
`where` — el único canal que el sentinel lee en runtime (D-17). Mismo
tratamiento para los 3 `SELECT COUNT(*)` de `contar()` en
`test/tenancy/con-01-uniques-cross-tenant.test.ts` (email/dni/referral_code)
que leen `users` cross-tenant a propósito (categoría "lectura de evidencia").

**Verificado en vivo:** sonda de members encendida a mano (`users` +
7 tablas propias en `TENANT_STRICT_MODULES`), login/registro/refresh reales
vía `getAuthToken`/`registerUser` sin 500 (sonda de verificación, revertida
sin commitear). La sonda de 173-21 es ahora utilizable para 173-23/24/25 sin
que el login enmascare la señal real de cada módulo.

## 2026-08-08 — 173-20: `test/branch-access.test.ts` roto por 173-11 (5 tests)

**Estado: RESUELTO por 173-22**, commit `604a892e` en `feat/173-adopcion-members`
(worktree `et-173`). Causa raíz confirmada exactamente como se diagnosticó
abajo: los 10 objetos `CountryScope` de `describe("canAccessBranch — unit")`
no llevaban `tenantId` (campo requerido desde 173-04) — `assertTenant` lanzaba,
el `catch` interno de `canAccessBranch` (173-11) lo convertía en `false`, y los
5 casos que esperaban `true` quedaban en rojo mientras los 5 que esperaban
`false` pasaban por el motivo equivocado. Fix: se agregó `tenantId: 1` (El
Templo, gimnasio de los fixtures de este archivo) a los 10 objetos. Efecto
colateral positivo: esto también resolvió 10 errores `TS2345` preexistentes
del baseline de `typecheck:tests` (185 → 175, actualizado en el mismo commit).
**Confirmado:** ningún test de este describe (ni del resto del archivo, ni de
`country-scope.test.ts`) cambió de significado por D-14 — la causa era un bug
de construcción del test, no una consecuencia del cambio de país→gimnasio.
Los 33 tests de `branch-access.test.ts` (2 `todo` preexistentes aparte) pasan
verdes con la sonda de members encendida.

**No es un archivo de este plan** (`files_modified` de 173-20: `members/routes.ts`,
`members/leads-routes.ts`). Descubierto al correr una batería más amplia para
verificar que mi cambio no rompiera nada alrededor de `GET /admin/members/branches`
y de los referidos de la ficha.

**Síntoma:** 5 tests de `describe("canAccessBranch — unit")` fallan con
`expected false to be true`:

- `returns true for virtual branch (any role)`
- `returns true for owner regardless of country`
- `admin/gestion: same country → true`
- `coach: branchId in scope.branchIds → true`
- `member: branchId === scope.userBranchId → true`

**Causa raíz (leída, no corregida):** `canAccessBranch` (173-11, D-14) ahora
llama `assertTenant(scope, ...)` internamente y necesita `scope.tenantId:
number`. Los objetos de scope que este test construye a mano (p. ej. `{
country: "AR", branchIds: [], isOwner: false, role: "admin", userBranchId:
null }`) NO tienen `tenantId` — `assertTenant` lanza, el `catch` interno de
`canAccessBranch` lo convierte en `return false`, y los 5 casos que esperaban
`true` quedan en rojo. Los casos que esperaban `false` siguen en verde, pero
por el motivo EQUIVOCADO (denegado por `tenantId` ausente, no por la regla que
el test dice estar probando) — la batería ya no ejercita el motor de reglas
real para ninguno de los 10 casos de `canAccessBranch — unit`.

**Por qué no lo arreglé acá:** `branch-access.ts` y su test no están en
`files_modified` de 173-20 (D-02, cirugía mínima). El cambio que rompió el
test es de 173-11 (`bcffd26d`/`f95712b6`, ya commiteado), que sí tocó
`iso-03-finance-transacciones.test.ts` pero no `test/branch-access.test.ts`
— un archivo con el mismo `canAccessBranch` bajo prueba que quedó afuera del
barrido de esa fase.

**A quién le queda:** dueño natural es 173-11 (ya ejecutado) o quien cierre el
switch (173-30) antes de dar el módulo por adoptado — la batería en rojo es
justamente el tipo de regresión silenciosa que el switch debería atrapar.
Agregar `tenantId` (el de El Templo, tenant 1) a los 10 objetos de scope de
`canAccessBranch — unit` alcanza para restaurar la cobertura real.

**Verificado:** no está causado por 173-20 — ni `members/routes.ts` ni
`members/leads-routes.ts` importan ni llaman a `canAccessBranch` de forma que
mi diff pueda afectar su comportamiento; el archivo `branch-access.ts` no
aparece en `git diff` de ninguno de los commits de este plan.

## 2026-08-08 — 173-21: `auth/routes.ts` NO sobrevive al throw pese a tener

anotaciones `tenant-safe` (CRÍTICO — bloquea la utilidad de la sonda para 173-22..25)

**No es un archivo de este plan** (`files_modified` de 173-21: `test/helpers.ts`,
`test/setup.ts`, `test/fixtures/second-tenant.ts`). Descubierto al ejecutar la
verificación en caliente que el propio plan pide (`members` + las 8 tablas
puestas a mano en `TENANT_STRICT_MODULES`, revertida sin commitear después).

**Síntoma:** con la sonda encendida, `pnpm exec vitest run --no-file-parallelism
test/tenancy test/db` pasó de 273/275 a **116/275** (148 tests rojos, 12 de 17
archivos). La inmensa mayoría de los rojos son un solo síntoma repetido: **CUALQUIER
login** (incluido `admin@test.com`, no solo socios del gimnasio 2) devuelve 500:

```
Login failed for admin@test.com: {"statusCode":500,"error":"Internal Server Error",
"message":"Failed query: select `id`, `email`, ... from `users` where `users`.`email`
= ? limit ?\nparams: admin@test.com,1"}
```

**Causa raíz (leída, no corregida):** `src/modules/auth/routes.ts` tiene 5
anotaciones `/* tenant-safe: ... */` (líneas 82, 99, 125, 475, 657 — 3 en
`/register` para los chequeos de duplicado por email/dni/referral_code, 1 en
`/login`, 1 en `/refresh`), escritas por la fase 173-15 para el canal del
**LINT**. Pero las 5 son comentarios de bloque de TypeScript colgados **arriba**
de una cadena del query builder de Drizzle (`fastify.db.select({...}).from(users)
.where(eq(users.email, email))`) — **no dentro de un `sql` crudo**. Drizzle nunca
emite ese comentario en el texto SQL que llega al pool: el sentinel (que lee
únicamente el string final, `src/db/sentinel/analyze.ts` etapa 2) ve un SELECT
desnudo sobre `users` sin `tenant_id` en el predicado y hace **throw** en cada
login/register. Es exactamente la distinción de canales D-17 (170): estas 5
anotaciones son legibles por el LINT (ancladas por AST al código fuente) pero
**no son legibles por el SENTINEL** (que solo mira el SQL de runtime).

**Por qué nadie lo vio hasta ahora:** `users` recién entra a
`TENANT_STRICT_MODULES` en esta fase (D-01); durante 173-01..20 el sentinel
nunca hacía throw sobre `users`, así que estas 5 anotaciones nunca se ejercitaron
contra el mecanismo real. Es la primera vez que alguien enciende la sonda con
`users` adentro Y ejercita un login real de punta a punta (`app.inject` vía
`getAuthToken`/`registerUser` de `test/helpers.ts`).

**Los 3 `TenantSentinelError` que SÍ aparecen completos en el log** (no
enmascarados por la respuesta 500 genérica) son de `test/tenancy/
con-01-uniques-cross-tenant.test.ts:307` (`contar()`, sus propios `SELECT
COUNT(*) AS n FROM users WHERE dni/email/referral_code = ?` sin anotar) — un
archivo de test que NO es de este plan y que necesita su propia anotación
`tenant-safe` embebida en el SQL (categoría "lectura de evidencia" de la regla
de 173-21), tarea de uno de los 4 planes de endurecimiento (173-22..25).

**Por qué esto es CRÍTICO para 173-22..25, no un dato de color:** la sonda que
este plan documenta como procedimiento reproducible ("encender `members`, correr
la batería, medir cuánto falta") es **inutilizable** hasta que se resuelva esto:
cualquier test que use `getAuthToken`/`registerUser`/`seedSecondTenant` —o sea,
casi toda la batería ISO-03 y las anclas— va a fallar en el login, enmascarando
la señal real que 173-22..25 necesitan medir (qué le falta a CADA módulo, no
que el login esté roto).

**No lo corregí acá:** `auth/routes.ts` no está en `files_modified` de 173-21
(D-02, cirugía mínima), y la corrección correcta no es obvia ni mecánica —
requiere decidir CÓMO embeber una exención legible por el sentinel en una cadena
del query builder de Drizzle (no existe precedente en el repo: todas las
exenciones `tenant-safe` documentadas hasta ahora, incluidas las de `test/`, son
sobre `sql` crudo o `conn.query()` con el comentario dentro del string). Opciones
que un plan futuro debería evaluar: (a) reescribir estas 5 lecturas como `sql`
crudo con el comentario embebido (mismo patrón que `cleanAllTestData`); (b) un
helper que envuelva `.from()` con un fragmento `sql.raw()` portando el
comentario. Ninguna la elegí porque cambia código de producción fuera de mi
alcance declarado.

**A quién le queda:** dueño natural es **173-30** (el switch) — no puede cerrar
el switch de `members` mientras estas 5 lecturas de `auth/routes.ts` hagan throw
en producción real. Pero dado el impacto en la UTILIZACIÓN de la sonda por
173-22..25, recomiendo que el planner de la próxima ola lo resuelva ANTES,
como una tarea de infraestructura compartida (mismo espíritu que este plan),
no al final.
