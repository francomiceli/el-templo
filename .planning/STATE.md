---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: "Tenancy — El Templo pasa a ser tenant #1"
status: executing
stopped_at: Completed 172-05-PLAN.md
last_updated: "2026-07-30T22:54:16.264Z"
last_activity: 2026-07-30
progress:
  total_phases: 11
  completed_phases: 4
  total_plans: 59
  completed_plans: 34
  percent: 36
---

# Project State

## Project Reference

See: .planning/PROJECT.md (milestone v6.0 initialized 2026-07-26)

**Core value (v6.0):** El Templo pasa de "una gimnasia hardcodeada" a "el tenant #1 de una plataforma multi-tenant", **sin downtime y sin que el staff note nada**. Alcance: tablas `tenants`/`tenant_settings` + `tenant_id` denormalizado en las 87 tablas gym-owned + las 5 capas de enforcement (scope server-side, helpers `tenantWhere`/`tenantValues` + `TenantContext`, sentinel de pool mysql2, lint en CI, manifiesto de rutas fail-closed + batería de aislamiento), y adopción módulo a módulo en orden estricto de criticidad: finance → members → subscriptions → scheduling → analytics → resto core. 11 fases (166-176), 24 REQ-IDs (FUND/COL/CON/ISO/ADO/MOD). Reglas duras: `tenant_id` SIEMPRE server-side (jamás payload ni JWT); migraciones incrementales compatibles con código viejo (nullable → backfill → NOT NULL); staging-first estricto; reservar bloque de numeración al arrancar la 166 (**actualizado 2026-07-27: la 166 aplicó 0190 y 0191 en `eltemplo_staging` y en `eltemplo` — el tope en producción es 0191 y las fases siguientes reservan desde 0192**). **Gate del MILESTONE (no de una fase): el tenant 2 no se onboardea hasta que la batería de aislamiento (ISO-03) esté verde sobre el 100% de las rutas core `tenant-scoped`.** Diseño CERRADO en `.docs/saas-multitenancy/` (README + docs 03/04/05/06, §8 resuelto 2026-07-26) — no re-litigar en discuss/plan-phase.
**Current focus:** Phase 172 — adopci-n-1-piloto-finance

## Current Position

Phase: 172 (adopci-n-1-piloto-finance) — EXECUTING
Plan: 7 of 23
Status: Ready to execute
Last activity: 2026-07-30
Next: `/gsd:execute-phase 172` sigue por el plan **172-07** (el 172-05 quedó cerrado: era el que faltaba de la wave 2). En paralelo sigue pendiente el plan **169-09**, el último de la fase 169 (gate consolidado + rollout), y siguen pendientes

**Deuda de allowlist acumulada en `feat/172-adopcion-finance`: 21 entradas** (9 del plan 172-02 + 4 del 172-03 + 6 del 172-04 + 2 del 172-06). El archivo real `tenant-lint-allowlist.json` tiene **un solo dueño, el plan 172-21**, así que `pnpm lint:tenant` sin `--allowlist` sale **rojo con `DISCREPANCIAS: 21`** en esa rama — todas `staleNoLongerViolating`, o sea deuda ya pagada esperando que la borren. **No es una regresión, pero si la rama se mergea a `staging` antes del 172-21, CI queda rojo por esto.**

**172-05 cerrado — la línea de base de D-12 ("el staff ve los mismos números") YA ESTÁ TOMADA, y se tomó sobre el staging correcto.** `el-templo-api/src/scripts/snapshot-finance-endpoints.ts` (commit `173e2127`, 735 líneas, **cero dependencias nuevas** — `fetch` nativo) golpea 7 agregadores con GET, normaliza y guarda; `--diff` compara y sale 1 si difieren. **La foto está en `$HOME/.el-templo-snapshots/172/antes.json`** (99.483 bytes, permisos `600`, **fuera del repo y fuera de `.planning/`** — tiene plata real y nombres de socios, T-172-05-01): los **7 endpoints en 200**, con 13 cajas con saldo, 62 movimientos, 42 transacciones, 7 deudas y el summary con sus 4 agregados. Se capturó con CR-CAJA desplegado y **sin una sola línea de la fase 172** corriendo en staging, que es exactamente lo que el gate D-13 pedía: **el diff del 172-22 va a medir solo la migración de tenancy, sin mezclar el cambio de caja.** **Tres cosas que el plan 172-22 tiene que saber:** (1) el comando de cierre ya está escrito — `--diff=$HOME/.el-templo-snapshots/172/antes.json <despues.json>`, exit 0 = D-12 cumplido, exit 1 = hay un número movido y el script imprime el path exacto (`.body.rows[7].amount`, con los dos valores); (2) **no cambiar el rango fijo** `2026-01-01..2026-06-30` — el script corta con **exit 2** si los dos snapshots tienen rangos distintos, porque comparar rangos distintos no es un diff sino una confusión; (3) hace falta otro **JWT de admin/owner de staging**, que **dura 30 minutos**. **El determinismo se probó donde se puede probar de verdad:** dos capturas contra staging separadas por 8 s dan diff vacío, pero eso sólo prueba que en 8 s nadie cobró nada — la prueba real fue contra un servidor falso descartable que devuelve las **filas mezcladas**, `generatedAt`/`requestId`/`timestamp` nuevos en cada request y **450 filas en 3 páginas**: diff vacío igual, y con **un solo monto cambiado** a mano el diff sale rojo señalando el campo. **Dos decisiones de diseño que no son obvias:** el script **pagina hasta agotar `total`** (con el tope de 200 filas, un cambio de índice —que es lo que esta fase hace— cambiaría _qué filas_ caen en la página 1 y el diff compararía conjuntos distintos), y **el orden de las listas NO es señal a propósito** (MySQL puede devolver los empates al revés al cambiar de índice sin que ningún número se mueva; un cambio de orden visible lo caza el UAT, no este script). **Trampa cazada al escribirlo, que vale para cualquier script que golpee la API:** mandarle `dateFrom` a un endpoint cuyo schema no lo declara **no da 400** — Fastify compila ajv con `removeAdditional: true` y lo **strippea en silencio**, así que el snapshot habría dicho "rango 2026-H1" sobre el histórico completo de deudas; el rango se mapea al nombre real de cada schema (`accruedFrom`/`accruedTo` en `outstanding-balances`, ninguno en `cost-centers/all`). Otras salvaguardas: una captura con algún endpoint fuera de 200 se guarda en `<ruta>.parcial` y **nunca** con el nombre bueno, y una respuesta que no es JSON (la trampa conocida de apuntar al vhost del front, que devuelve HTML de nginx) queda legible como `noEsJson`. **El script no está cableado a ningún pipeline y sólo hace GETs.** **ADO-01 sigue Pending:** este plan no migra una línea de `finance`, construye el instrumento con el que se mide si la migración salió bien.

**172-06 cerrado — el ABM de `finance` (centros de costo, cuentas bancarias y cajas de efectivo) ya no cruza gimnasios, y la trampa que el PATTERNS marcaba como riesgo 3 quedó cerrada.** `createEfectivoCaja` tenía el `ctx` en la firma desde la fase anterior y **no estaba migrado**: el SELECT que hace cumplir el invariante "una caja efectivo activa por (sucursal, moneda)" no filtraba por gimnasio —así que la caja de otro gimnasio en la misma sucursal bloqueaba el alta con un 409 que además delataba su existencia— y el INSERT no pasaba por `tenantValues` (la caja nacía en el tenant 1 por el `DEFAULT` de la columna, no por decisión de nadie). **El criterio de terminado es el inventario del lint, jamás la firma.** 18 métodos con `ctx` primero, 17 `tenantWhere` nuevos y 3 INSERT por `tenantValues`. **`assertUniqueName` compara por gimnasio**: antes, el guard y la unique compuesta de la fase 168 decían cosas distintas (el índice permitía el alta del segundo "Alquiler", el guard la rechazaba con un 409 que revelaba los nombres del vecino). **Tres cosas para copiar:** (1) **los 6 UPDATE también llevan `tenantWhere`** aunque el SELECT previo ya corte con 404 — el WHERE de una escritura no se apoya en una lectura anterior; (2) el `tenantWhere` de `branches` en el **LEFT JOIN** de `listActiveCajasWithBalance` va **en el `ON`**: en el WHERE, `NULL = 1` es falso para las cajas central/banco (`branch_id NULL`), el LEFT se vuelve INNER y esas cajas **desaparecen del listado de saldos en silencio con el lint en verde**; (3) tercera aparición de la misma trampa de la fase — en `listAllCostCenters` el filtro puesto como primer elemento del array `conditions` daba SQL correcto pero **dejaba el statement violando**, porque el lint mide por statement: **el gimnasio se nombra en el statement que nombra la tabla, inline, sin excepciones**. `validateBankAccountForCharge` (closure del plugin de coach-load, sin `request` a mano) recibe el `ctx` primero y sus 4 call sites lo resuelven con `assertTenant`. **Se corrió UN archivo de test contra MySQL real** (permitido por la task, es verificación dirigida): `test/finance/cash-balances.test.ts` **8/8 verde sin tocar expectativas**, que es lo que prueba que los saldos siguen dando los mismos números y que el owner sigue viendo las cajas branch-less — el `argon2` que la 172-01 dejó como bandera no dio problema. **Cero archivos de test tocados:** el plan pedía agregar el ctx a "call sites directos al service" de 4 archivos y **esos call sites no existen** (ejercitan las rutas por HTTP). **Riesgo residual explícito para el plan 172-09:** `getBalance` sigue **sin `ctx`** y suma `financial_transactions` por `cash_register_id` sin nombrar el gimnasio; sus 3 callers internos le pasan ids ya scopeados, así que hoy no hay camino de fuga, pero eso **no está probado**. Commits: `361f3eae`, `6d261929`, `49bac06d`. **ADO-01 sigue Pending**: este plan cierra la MITAD de un archivo de `finance`.

**Las 6 del 172-04:** `coach/service.ts` (`balances` + `users` colateral), `members/service.ts` (`balances`) y `scripts/backfill-historical-payments.ts` (`balances`, `financial_transactions`, `transaction_links`). El script de backfill histórico **ya no corre sin `--tenant`**: muere con exit **2** antes de leer una fila (verificado en vivo, igual que el `--tenant=999999` inexistente; con `--tenant=1` sigue y falla con **1** en el pre-flight de datos, que es la separación de códigos funcionando). **Aviso para el plan 172-07:** la firma de `MemberService.listMembers` cambió — el `ctx` va **primero** (`listMembers(ctx, params)`), y `members/routes.ts` ya lo resuelve con `assertTenant(request.scope, "members.list")`.

**Worktree de la fase 172:** `/home/franco/projects/et-172`, rama `feat/172-adopcion-finance`, base `a6272df0` = `origin/master` **con CR-CAJA adentro** (los 3 commits `1f033f62`/`362d795a`/`a6272df0` encima del tren `29e61c8b` de las fases 170+171). Se eligió esa base y no `29e61c8b` porque CR-CAJA reescribió `finance/coach-load-routes.ts` y `subscriptions/service.ts`, que son **dos de los archivos que esta fase migra**: partir de antes garantizaba conflicto sobre exactamente las líneas en juego. **A diferencia de las fases 166-170, este worktree tiene `node_modules` PROPIO** (`pnpm install --frozen-lockfile` en `el-templo-api`, 3,4 s con el store caliente, lockfile byte-idéntico md5 `5f468b75…`): no hay symlink que crear ni borrar alrededor de los commits. `.env` y `.env.development` copiados desde `et-170-sentinel`. **Al branch se le sacó el upstream** — `git worktree add -b … origin/master` lo dejaba trackeando `origin/master`, y en este repo un `git push` sin argumentos a master **es un deploy a producción**. **Baseline verde registrado antes de tocar una línea:** `tsc --noEmit` exit 0, `pnpm lint:tenant` exit 0 con `DISCREPANCIAS: 0`, **allowlist en 501 entradas** (la línea de partida contra la que D-06 mide el descenso a 0 en `finance`) y 10 exenciones `tenant-safe` heredadas, **ninguna de finance**. Dos banderas para los planes siguientes: (1) el install dejó **build scripts sin aprobar** (`argon2`, `esbuild`, `@firebase/util`, `protobufjs`) — si un test con MySQL real falla por el binding nativo de `argon2`, la salida es `pnpm approve-builds`, que es **gate humano de dependencias**, no una decisión de oficio; (2) `.docs/saas-multitenancy/` **no está versionada**, así que no existe en el worktree — el plan que escriba `07-receta-adopcion.md` (D-11) tiene que crearlo en el checkout principal. **ADO-01 sigue Pending a propósito:** lo citan 18 de los 23 planes y el requisito es "`finance` migrado al patrón completo"; lo cierra el gate consolidado del final de la fase, no este plan.

Siguen pendientes `/gsd:verify-phase 168` (los 6 planes ejecutados; la migración 0196 aplicada en `eltemplo_staging` y `eltemplo` con 0 discrepancias y exit 0 en el verificador de uniques en las dos bases; falta el smoke funcional por UI de Franco, cerrado como pendiente por decisión suya). Siguen pendientes `/gsd:verify-phase 166` y `/gsd:verify-phase 167` por el mismo motivo.

**Worktree de la fase 169:** `/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura` sobre `origin/master` (`1200b8af`). `.env`/`.env.development` copiados desde el worktree de la 168 — **no correr ningún install ahí**: el `pnpm-lock.yaml` es byte-idéntico al de los worktrees 166/167/168 y el `node_modules` se resuelve por **symlink a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules`** (el del 168 no existe hoy). El symlink se crea antes de cada typecheck/corrida de tests y **se borra antes de commitear** (la regla `node_modules/` del `.gitignore` no matchea un symlink). Commits de código del plan 01: `c21baefd` (`src/modules/shared/tenant.ts`) y `f6bc7ecc` (`test/tenancy/tenant-helpers.test.ts`); del plan 02: `0426d4de` (expire-lost-leads + wellhub-sync) y `bb85aa64` (mark-no-shows + reassign-multibranch). Nada pusheado. **Esta fase NO agrega migraciones**; si alguna la necesitara, reserva desde **0197**.

**169-08 cerrado — el criterio 2 del ROADMAP está probado por comportamiento y la auditoría D-08 encontró algo de verdad.** El plan daba por casi seguro que los 6 sitios que spreadean el body ya estaban cerrados y pedía "confirmarlo, no asumirlo": **5 de 6 lo estaban, y el que no era el peor de la lista.** `createMemberSchema` —la ruta de **alta de socio asistida**, el spread #1, la escritura de mayor volumen del admin— no declaraba `additionalProperties: false`, así que cualquier propiedad desconocida del payload (`tenantId` la primera) viajaba entera hasta `createMember`. No había explotación posible porque el service enumera campos en su `.values()`, pero eso es una costumbre y no un contrato. Se cerró con el docblock que cita `src/db/schema/tenant-column.ts:11-16` y el precedente de `createdBy` (`members/routes.ts:766`), y **cerrar el schema NO rompe clientes viejos**: Fastify compila ajv con `removeAdditional: true`, así que una propiedad desconocida se **strippea en silencio** en vez de dar 400 (comportamiento que el propio repo ya documenta en `updateLeadSchema`). Los otros 5 quedaron intactos y `createProductSchema` sumó el `export` que le faltaba. **El guard es por IMPORT y no por grep**, con los dos motivos escritos: un grep cuenta la palabra en un comentario **y** cuenta la de un sub-schema anidado (`createTransactionSchema` y `createCampaignSchema` tienen las dos, y la que importa es la de la raíz del `body`). El mensaje de cada `expect` nombra **el sitio de spread que ese schema protege** y dice qué hacer cuando se caiga: devolver el `additionalProperties: false`, o —si la ruta de verdad necesita propiedades libres— **dejar de spreadear el body**; body abierto y spread son compatibles de a uno, nunca juntos. **Fail-closed probado en vivo** (se sacó el `additionalProperties` recién agregado, la suite quedó en rojo con el mensaje completo, se restauró sin commitear el estado roto). **Batería D-09: 5 rutas × 2 casos** (alta de socio, alta de lead de prueba, cobro, asignación de plan y reserva; spoofeado y control), aserciones por `SELECT tenant_id ... WHERE id = ?` sobre la fila realmente creada —ningún schema de respuesta expone la columna— con el gimnasio spoofeado **90369 sembrado y existente**, re-verificado **en cada una de las 10 aserciones** y no una sola vez al principio (con un id inventado la fila nacería en 1 por la FK y no por el código: T-168-15). **Dos de las 5 rutas tienen el body ABIERTO** (`assignPlanSchema` y `reserveSchema` no están en el inventario D-08 porque sus handlers no spreadean): ahí el `tenantId` spoofeado **llega de verdad a `request.body`** y el handler igual lo ignora — son la evidencia más fuerte de la batería, y la de la reserva la produce desde el borde menos privilegiado del repo (actor socio, no staff). **Desviación operativa a recordar: los comentarios que escribas NO pueden contener el literal `...request.body`** — la auditoría cuenta esos sitios con un grep y mis propios docblocks llevaron el conteo de 6 a 8 hasta que se reescribieron. **`branches` no fue trampa acá** (a diferencia del 169-06): este archivo no siembra sedes, el gimnasio de prueba sólo tiene que existir. Residuo verificado por SQL en `eltemplo_test_1`: tenant 90369 = 0, filas con `tenant_id <> 1` = 0, El Templo en `active`. Commits: `5378a5af` y `a70ee297`. **CON-03 sigue Pending**: lo cierra el gate consolidado del 169-09.

**169-07 cerrado — CON-04 ya no tiene ningún camino sin request descubierto: crons, webhook, `tv_pairings` y CLI están los cuatro.** `src/db/scripts/require-tenant.ts` exige `--tenant=<id>` en todo script que ESCRIBA una tabla gym-owned, acepta las dos formas del flag (`--tenant=7` y `--tenant 7`), rechaza vacío/no-numérico/no-entero/`<= 0`, y **valida contra la DB que el gimnasio EXISTA** antes de que el script toque una fila (un typo de id corta en vez de escribir en el gimnasio de otro, T-169-33). Todo error de USO sale con **exit code 2** vía `TenantArgError` —la convención del repo es 0 OK / 1 discrepancias de datos / 2 conexión o uso, de `verify-tenant-uniques.ts`— y `failTenantArg` reserva el 1 para "corrió y falló". **D-07 implementado y escrito en el docblock: el CLI NO exige `status = 'active'`** — un gimnasio suspendido o archivado resuelve igual y sólo avisa por stderr, porque el CLI es tooling de OPERADOR y un gimnasio suspendido sigue necesitando exports y limpiezas. Es un contrato deliberadamente distinto al de los crons (D-01) y al del webhook (D-05), y está escrito así para que nadie lo "unifique" después. La capa de datos va **inyectada** (`TenantQueryFn`, mismo idioma del `QueryFn` de `verify-tenant-uniques.ts`), que es lo que permite probar toda la validación **sin abrir una conexión**: `test/unit/require-tenant.test.ts`, **16 tests verdes**, con dos aserciones que no son obvias — que el id viaja parametrizado afirmando **la AUSENCIA del número en el string del SQL** (una interpolación que además pasara `params` engañaría a una aserción de sola inclusión, T-169-34) y que los **dos** estados no activos del enum resuelven igual y avisan. **Este plan hizo gate RED de verdad**, el primero de la fase: el test se commiteó fallando (`e1fa91f4`, `Cannot find module`, 3,2 s) antes de escribir la implementación; los planes 01-06 registraron el orden inverso porque sus tests eran MySQL-backed y cada vuelta costaba 100 s. **`scripts/seed-onboarding-aura.ts` es el ejemplar de los dos helpers sin request:** `requireTenant(queryFnFromConnection(connection))` antes de la primera query, `and(tenantWhere(auraConfig, ctx), eq(...))` con `tenantWhere` de PRIMER término, `tenantValues(ctx, {...})` en el INSERT y el `tenantId` en los dos `console.log`. **Las 6 exenciones** (`run-migrations`, los dos `verify-tenant-*`, `seed`, `seed-spom`, `wellhub-sandbox`) llevan `/* tenant-safe: <motivo> */` con el motivo escrito **en un comentario de bloque APARTE pegado abajo del docblock** — un `/* */` no se puede anidar dentro de un `/** */` — más la línea que aclara que la fase 170 es la que las lee; los tres seeds/runner son cambio de comentarios puro (**0 líneas borradas**, verificado por `numstat`). **Las 3 corridas manuales contra la base LOCAL** quedaron registradas: sin flag → **2** con el uso correcto, `--tenant=999999` → **2** nombrando el id, `--tenant=1` → **0** salteando la fila existente. `db:migrate`, `db:verify-tenant` y `db:verify-uniques` siguen corriendo con exit 0. **Dato nuevo y valioso para las fases de adopción 172-175: `tenantValues` NO ensancha los tipos literales** — se verificó con `tsc` que el enum de Drizzle compila sin ningún `as const`, así que el `as const` que el retrofit traía se sacó y el motivo quedó escrito en el archivo (desviación Rule 3, commit `d980234f`). Segunda observación registrada: el test unitario tarda ~96 s de reloj **y no es por el test** — `vitest.config.ts` declara `test/setup.ts` como `setupFiles` y ese archivo provisiona la base MySQL del worker en un `beforeAll` global para TODO archivo, incluidos los de `test/unit/`; el archivo en sí no abre ninguna conexión (lo prueba el gate RED, que falló en 3,2 s). Commits: `e1fa91f4`, `978402e1`, `df2455bc`, `d980234f`. **CON-04 sigue Pending**: lo cierra el gate consolidado del 169-09.

**169-06 cerrado — la mina M7 queda cerrada por los dos lados y la única excepción legítima del milestone ya está anotada.** El INSERT pre-claim de `TvPairingService.start()` lleva `/* tenant-safe: pairing pre-claim */` **en su propia línea** más una sección de docblock con el motivo: la fila nace ANTES de que se sepa de quién es el televisor (`branch_id` nulo hasta el claim), así que no hay scope del cual sacar el dueño y **estampar ahí sería inventarlo** — un dueño inventado es peor que el DEFAULT, porque el claim lo pisa un instante después. Los motivos M8 de los dos códigos globales **no se repiten**: el docblock apunta a `src/db/tenant-tables.ts:249-252`. **`claim` cambió de firma** —`claim(ctx: TenantContext, userCode, branchId, claimedBy, name?)`, **única firma de service que toca la fase 169** (habilitada por CON-04)— y su `.set()` pasa por `tenantValues(ctx, …)`. **El `ctx` va PRIMERO a propósito:** al final, un call site viejo habría compilado con los argumentos corridos. **El `WHERE` del UPDATE sigue SIN `tenantWhere` y hay un comentario adentro del `.where()` que lo declara correcto** (T-169-30): el `user_code` es global por diseño y el claim es justamente la operación que DESCUBRE el tenant, así que filtrarlo dejaría el pairing imposible de reclamar. **`consume()` propaga:** el `select` trae `tvPairings.tenantId` y el INSERT de `tv_devices` pasa por `tenantValues({ tenantId: pairing.tenantId }, …)` — el televisor pollea SIN sesión, así que el gimnasio sale de la fila ya reclamada, nunca de un scope de request. El borde: `control-routes.ts` pasa `assertTenant(request.scope, "tv pair claim")` como primer argumento (ni `!` ni `?? 1`) y **`tvPairClaimSchema.body` sumó `additionalProperties: false`** (precedente T-164-43). El comentario de `src/db/schema/tv.ts` dejó de prometer trabajo futuro: ahora dice qué quedó hecho en la 169 y que falta la 170 (el sentinel que lee estas anotaciones). **6 tests verdes** en `test/tv/tv-pairing-tenant.test.ts` (437 líneas, 99,3 s) y los **17** de `tv-pairing.test.ts` intactos sin tocar el archivo. **Desviación (Rule 2): el archivo SÍ siembra un segundo gimnasio (id 90569) aunque el plan decía que no hacía falta** — con sólo el tenant 1, las dos aserciones centrales pasarían en verde aunque el service no estampara nada (`DEFAULT 1` desde la 167 + staff tenant 1 = valor correcto y accidental indistinguibles). El test del dueño del 90569 arranca afirmando que ANTES del claim la fila está en 1, así que el 90569 posterior sólo pudo escribirlo el claim; el spoofeo de `tenantId` en el body también se hace con ese staff (valor 424242) por el mismo motivo. La cabecera declara que **NO es un test de aislamiento** (eso es ISO-03, fase 172). **Trampa nueva para los planes siguientes: `cleanAllTestData` NO limpia `branches`** (no está en `TABLES_TO_CLEAN`), así que las sedes sobreviven entre tests del worker y la fila de `tenants` no se puede borrar mientras una sede la referencie (`fk_branches_tenant`) — el archivo tiene un `limpiarRastro()` incondicional que borra sedes primero y gimnasio después. Segunda desviación (Rule 3, cosmética): el `grep -c 'tenantValues'` del `<verify>` del plan cuenta también la línea del `import`, así que el conteo real es 3 y no 2; se verificó con `grep -c 'tenantValues('`, que da exactamente los 2 call sites. Commits: `64629f56` y `0847c8da`. **CON-04 sigue Pending** (falta el último camino sin request: los scripts CLI con `--tenant`).

**169-05 cerrado — la mina M6 ya no existe: el webhook público de Wellhub deriva su tenant server-side.** `event_data.gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id` → `tenants.status`, sin leer NUNCA el tenant del payload (Wellhub manda SU `gym.id`; el mapeo vive en nuestra DB). Los dos lookups del service —`findBranchByGymId` y `findPublishedSlot`— traen ahora `tenantId` + `tenantStatus` con **`leftJoin` a `tenants`**, y el LEFT quedó comentado con su consecuencia concreta en cada uno: con join estricto, una sede de gimnasio no resoluble caería en `gym_sin_sede` (mensaje FALSO: la sede existe) o el slot se trataría como "no publicado" — camino que **además le manda un PATCH de rechazo a Wellhub**. **Un solo helper privado, `resolverTenant`**, evalúa la tabla de corte para los dos caminos que crean datos y devuelve una unión discriminada `{ ok: true, ctx } | { ok: false, corte }` con el `WebhookHandleResult` YA ARMADO (no un booleano): el `!== "active"` aparece **una sola vez fuera de comentarios** en todo el archivo. **D-04 intacto** (`gym_sin_sede` conserva literalmente status, outcome, detail y mensaje de log) y **D-05 implementado**: `tenant_no_activo` con `log.warn({ gymId, branchId, tenantId, tenantStatus })` y `tenant_no_resoluble` con `log.error`, los dos 200 `skipped`. El corte va **ANTES de `findOrCreateVisitor`** en los dos caminos (checkin: línea 321 vs. 330; booking-requested: 518 vs. 561) — un gimnasio suspendido no llega a crear un usuario ni a facturarle una visita a Wellhub. **`handleBookingCanceled` NO corta**, con el motivo escrito: una cancelación libera cupo de una reserva que ya existe y bloquearla dejaría cupo fantasma en la grilla; el corte comercial aplica a lo que CREA datos, no a lo que los libera. **Estampado de `wellhub_events`:** `WebhookHandleResult` sumó `tenantId?: number`, el `UPDATE` de cierre de `handleEvent` construye el `.set()` condicionalmente y el INSERT previo lleva `/* tenant-safe: idempotencia global previa a la derivacion del tenant (M8) */` — la fila nace antes de la derivación porque el dedup por `event_id` es unique GLOBAL y componerlo por tenant sería circular. El comentario stale de `src/db/schema/wellhub.ts` ("es trabajo de la fase 169") quedó actualizado. **7 tests verdes** en `test/wellhub/webhook-tenant-derivation.test.ts` (tenant ad-hoc **90469**, 102,6 s) con las **dos sedes sembradas con `tenantId` explícito** (trampa del DEFAULT 1) y **aserciones de exclusión** en cada corte (cero usuarios, cero asistencias, cero llamadas al endpoint facturable) — no sólo el código HTTP. **El test que prueba de verdad el estampado es el del gimnasio ACTIVO distinto de 1:** los otros pasarían en verde con un `tenantId: 1` hardcodeado o incluso sin `UPDATE`, porque la columna tiene `DEFAULT 1`. `webhook-checkin.test.ts` **sin tocar**, 12 verdes. Commits: `58b4ea84` y `e2d7793f`. Dos desviaciones: el caso `tenant_no_resoluble` **no se simula** (exige una `branches.tenant_id` huérfana y la FK lo impide sin apagar `FOREIGN_KEY_CHECKS` sobre la base compartida del worker) y se sumó `tenantId` a los `log.info` de éxito (Rule 2: en el único camino sin sesión, el log tiene que decir de qué gimnasio era lo que se creó). **CON-04 sigue Pending** (faltan CLI y `tv_pairings`).

**169-04 cerrado — el criterio 3 del ROADMAP ya no es una propiedad del helper: está probado sobre CRONS REALES.** `test/tenancy/con-04-crons-per-tenant.test.ts` (segundo tenant ad-hoc **90269**, 8 tests verdes en 80 s) afirma con `toHaveBeenCalledTimes` **exacto** que el cuerpo de `runAutoApprove` corre **2** veces con dos gimnasios activos y **1** con el 90269 en `suspended` y en `archived` (los dos estados no activos del enum, no sólo el feliz); que si el cuerpo explota en la 2ª vuelta `runAutoApprove` **resuelve** y el acumulador conserva el `{ approved: 3 }` del gimnasio sano (D-03 sobre un job real); y un smoke de `runExpireLostLeads` **sin spy**, contra MySQL, que prueba que un cuerpo con `sql` crudo sobrevive al sweep con dos tenants. **La técnica a copiar en los planes siguientes:** se espía el MÉTODO DEL SERVICE (`AdminSessionService.prototype.autoApprovePendingSessions`), **nunca** `forEachActiveTenant` — mockear el sweep probaría el mock; espiando el service quedan vivos `listActiveTenants` contra MySQL, el loop y el `try/catch` por iteración, y el corte cae justo donde empieza la lógica de negocio que esta fase no toca (D-02). Funciona porque los jobs instancian sus services DENTRO del cuerpo por tenant (169-02/169-03). **Gate fail-closed de D-01 puesto:** el mismo archivo lee `src/jobs/` con `fs` y exige (a) que la lista ordenada de `.ts` sea exactamente los 7 conocidos —lista completa, no sólo el conteo, para que un rename también rompa— y (b) que todo archivo con `cron.schedule` contenga `forEachActiveTenant`, **descartando las líneas de comentario antes de buscar** (sin ese filtro, la prosa del docblock de cualquier job satisfaría el gate). Los dos `expect` enumeran los incumplidores por nombre y dicen qué hacer; la única forma de eximir un job es sumarlo a `JOBS_EXENTOS` (mapa nombre→motivo, hoy vacío) con `/* tenant-safe: <motivo> */` en el fuente — nunca un `skip`. **Fail-closed verificado en vivo** con un `src/jobs/__gate-probe.ts` temporal: los dos gates cayeron listándolo, y la sonda se borró sin commitear. `src/index.ts` sumó **10 líneas de comentario, 0 deleciones** (verificado por `git diff --numstat`): documenta que la lista de gimnasios activos se resuelve **por corrida y no en el boot**, para que activar o suspender un gimnasio aplique en el tick siguiente sin reiniciar el proceso; las 7 llamadas `startXJob(app.db)` quedaron idénticas. Commits: `3f69a1fe` y `d79d5569`. **Cero desviaciones.** **CON-04 sigue Pending** (faltan webhook, `tv_pairings` y CLI).

**169-03 cerrado — los 7 crons de D-01 completos.** Los 3 asimétricos (`auto-approve`, `auto-resume-pauses` y `notification-cron`) ahora tienen función pura exportada y barren por gimnasio activo. Commits: `dbb89644` (los dos primeros) y `f3036876` (los 4 schedules de notificaciones). **Cuatro funciones nuevas que antes no existían y hacían intesteables esos caminos:** `runAutoApprove(db)` → `{ approved }`, `runAutoResumePauses(db)` → `{ resumed, activated, expired }`, `runNotificationQueueTick(db)` → `{ sent, failed, purged }` y `runBatchSegmentRecalculation(db)` → `{ transitionsFound, notificationsQueued, ghostReattempts }`; los cuerpos privados son `…ForTenant` / `…ForTenantTz`, grepeables para el gate del 169-04. En `notification-cron` el sweep va DENTRO de cada `runX` (nunca en el callback del `cron.schedule`), con `jobName` distinto por camino: `notification-queue`, `notification-segments`, `notification-morning-energy` y `notification-weekly-summary` — siguen existiendo exactamente 4 `cron.schedule` y ninguno tiene lógica de negocio. **`runPlanRenewalWarnings` NO tiene sweep propio** (ya corre dentro del cuerpo por tenant de `runBatchSegmentRecalculation`; agregarle uno la haría correr N²) y su firma `(db, notificationService)` quedó intacta: los 6 tests de `test/notification-plan-renewal.test.ts` pasan **sin tocar el archivo**. **Primera anotación de exención de la fase:** `/* tenant-safe: seed de templates global hasta la adopción de notifications (fase 175) */` sobre la llamada a `seedTemplates()` — envolverla en el sweep no sembraría templates por gimnasio, correría el MISMO insert global N veces duplicando las filas del tenant 1. Dos desviaciones registradas, las dos de la misma familia: los schedules 1 y 2 no loguean total agregado (sus contadores ya se loguean por gimnasio; duplicarlos arriba sería la misma línea sin atribución de tenant, igual que el summary de wellhub-sync) y el `try/catch` externo del cuerpo del schedule 2 se movió al scheduler para que el catch por iteración del sweep pueda atribuir el error a un gimnasio (D-03). Los 3 `try/catch` internos de `auto-resume-pauses` y los `try/catch` por perfil quedaron intactos. **CON-04 sigue Pending** (faltan webhook, `tv_pairings`, CLI y el gate de cobertura).

**169-02 cerrado — 4 de los 7 crons ya barren por tenant activo.** `expire-lost-leads`, `wellhub-sync`, `mark-no-shows` y `reassign-multibranch` (los que ya tenían la separación `runX(db)` / `startXJob(db)`) corren su cuerpo dentro de `forEachActiveTenant`, con el `tenantId` como campo estructurado en una línea de log por vuelta y aislamiento de errores por gimnasio. **Patrón para el 169-03:** cuerpo por tenant PRIVADO con nombre grepeable `…ForTenant…` + `runX` público que acumula por closure y **conserva exactamente su tipo de retorno** — por eso los 3 archivos de test que invocan estos jobs (22 tests) siguen verdes **sin tocarlos**. Tres cosas que el plan siguiente debería copiar: (1) en `mark-no-shows` el sweep se puso en `runMarkNoShowsForTz`, que es lo que usa el scheduler (`runMarkNoShows` no corre nunca en producción), con el tenant POR FUERA del loop de timezone porque la lista de tz sale de `branches` y se scopeará en la 173; (2) en `wellhub-sync` el guard `if (!config) return null` precede al sweep y su función se declaró primera en el archivo para que el orden de lectura refleje el de ejecución (T-169-11); (3) el log por vuelta va a la ENTRADA del cuerpo cuando hay early return, para no duplicar el statement. Desviación registrada: el summary de Wellhub se loguea ahora en el cuerpo (con `tenantId`) y **ya no** en `startWellhubSyncJob` — el tipo de retorno lockeado no transporta el tenantId hasta el scheduler y, con varios gimnasios, atribuiría el summary del último a todos. **CON-04 sigue Pending a propósito** (faltan los 3 crons del 169-03, el webhook, el CLI y `tv_pairings`).

**169-01 cerrado — la única API de tenancy existe.** `src/modules/shared/tenant.ts` (277 líneas, 10 exports) con la firma LOCKEADA del doc 03 §3: `tenantWhere(table, scope)` → `eq(table.tenantId, scope.tenantId)` y `tenantValues(scope, values)` → `{ ...values, tenantId: scope.tenantId }` (el tenant del scope va DESPUÉS del spread: mitigación de mass-assignment de tipo y de runtime a la vez). El punto de fricción que marcó el PATTERNS —`CountryScope.tenantId` es `number | null` y la firma pide `number`— se resolvió con **`assertTenant(scope, where)` exportado y fail-closed: `AppError` 403 `TENANT_UNRESOLVED`**, llamado en el CALL SITE para que el narrowing sea visible en el diff. Prohibidos el non-null assertion y el `?? 1` (verificado por grep en el `<verify>` del plan). Además `listActiveTenants` (comparación POSITIVA contra `'active'`) y `forEachActiveTenant` (loop secuencial, `try/catch` DENTRO del loop, `log.error({ err, tenantId, job })` y sigue — D-03), listos para los 7 crons del plan 169-04. `TenantLogger` es una interfaz estructural mínima y se verificó por typecheck que la satisfacen tanto `pino()` como `FastifyBaseLogger`, así que los jobs pasan su logger directo, sin adaptador. **13 tests verdes** en `test/tenancy/tenant-helpers.test.ts` contra MySQL real con un segundo tenant ad-hoc **id 90169** (el 90168 es del `con-01`: dos archivos con el mismo id se pisan con `isolate: false`; los ids de los otros archivos de la fase son 90269 / 90369 / 90469). Ojo para los planes siguientes: **`aura_config.source_type` sigue siendo unique GLOBAL** (deuda consciente allowlisteada), así que dos tenants NO pueden compartir el mismo `source_type` en un test.

**Tope de migración aplicado en producción: 0196.** Las fases siguientes reservan desde **0197**. La `0196_tenant_unique_contracts.sql` está aplicada **una sola vez en `eltemplo_staging` y una sola vez en `eltemplo`** (verificado en `_migrations` de cada base), desplegada por el plan 168-06 el 2026-07-27. Ya no hace falta consultar la rama de la fase: vive en `origin/master`.

**Rollout de la 168 (168-06):** `origin/master` = **`1200b8af`** (los 10 commits de la fase, push fast-forward — `origin/master` no se había movido de `68c447cf`, así que no hizo falta merge y los 10 SHAs quedaron intactos). `origin/staging` = **`f934693c`** (merge `--no-ff` vía la rama descartable `tren/168-staging`, ya borrada). **Los 29 commits de CAJA/finance parados en staging NO viajaron a prod** (`merge-base --is-ancestor origin/staging HEAD` falla). Cuatro señales humanas registradas con hora y alcance en `168-06-SUMMARY.md`. Deploy paths reales, descubiertos con `pm2 describe`: `/opt/el-templo-staging/api` y `/var/www/api`.

**Evidencia contra las dos bases reales:** 12 contratos compuestos con `tenant_id` en `SEQ_IN_INDEX=1`, **los 12 nombres viejos ausentes** y los 4 índices secundarios con `NON_UNIQUE=1`, verificados por `INFORMATION_SCHEMA` en `eltemplo_staging` y en `eltemplo`; `verify-tenant-uniques.js` con `DISCREPANCIAS: 0` y exit 0 en ambas, M8 11/11. **CON-01 y CON-02 marcados completos** en REQUIREMENTS.md. Prod: 7135 users, 130 planes, 1 tenant, cero filas fuera de `tenant_id=1`. **Ojo con leer el reloj como evidencia:** el step de migraciones tardó 4 s en las dos bases, pero eso no prueba nada — la heurística `alreadyApplied` del runner tolera `"Can't DROP"`, así que un `DROP INDEX` con el nombre equivocado habría salido verde en el deploy. Lo que lo prueba es `viejos_sobrevivientes = 0` contra `INFORMATION_SCHEMA`.

**Pendiente de la 168: el smoke funcional por UI** (criterio 5 del ROADMAP, cero cambio de comportamiento para el staff): dar de alta un socio con un DNI que ya exista y ver que lo sigue rechazando, y crear una sede con código repetido y ver lo mismo. Cerrado como pendiente por decisión de Franco, igual que en 166 y 167.

**Worktree de la fase 168:** `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql` = `1200b8af`, **vivo hasta el UAT** (patrón de las fases 166 y 167). Respaldada en `origin/feat/168-contratos-sql`. `.env`/`.env.development` copiados — **no correr ningún install ahí**; el `node_modules` es un symlink al worktree 167 que se crea y se borra alrededor de cada typecheck (la regla `node_modules/` del `.gitignore` no matchea un symlink, así que dejarlo ensucia `git status`). El `.sql` de la 0196 YA está commiteado: viajó junto al schema Drizzle en `ec835050` (168-02, Hard Rule 3). Commits de código de la fase: `ec835050` (uniques compuestas + 4 índices secundarios + la 0196), `5d5c0bc7` (los 11 comentarios M8), `758f2aa3` (registro canónico de uniques con motivo), `44618ca2` (verificador `verify-tenant-uniques.ts` + script `db:verify-uniques`) y `ba37a148` (el 12º contrato), `2c1af25f` + `a0216641` (168-04: `test/tenancy/con-01-uniques-cross-tenant.test.ts`, los 12 contratos probados por comportamiento) y `55c4059f` + `dbff616f` + `1200b8af` (168-05: introspección de la 0196, el verificador como gate de CI y el gate anti-podredumbre de los registros). Nada pusheado — el rollout a staging y prod es del plan 168-06.

**Gate de CI puesto (168-05):** `test/migrations/0196-tenant-unique-contracts.test.ts` (638 líneas, 12 tests) verifica por `INFORMATION_SCHEMA` los 12 contratos compuestos, los 4 índices secundarios y que los **12 nombres viejos NO sobrevivan** —"presente lo nuevo" y "ausente lo viejo" son dos afirmaciones distintas y `test/setup.ts` tolera `"Can't DROP"`—, y corre `verifyTenantUniques` con `makeQueryFn(app)` con un test por categoría de hallazgo más `formatReport(report)` dentro del mensaje del `expect` de discrepancias. `test/db/tenant-tables.test.ts` sumó 7 gates de forma sobre los registros de uniques sin tocar los 5 de la 167 (87/4/91 intactos). **Fail-closed probado en vivo:** una unique global de prueba sobre `activities` dejó la suite en rojo con el reporte completo, y fue revertida (0 sobrevivientes). Ojo local: correr **más de un archivo de test a la vez** revienta el timeout de 120 s del provisioning en esta máquina (preexistente, reproducido con archivos de la 166/167) — usar `--no-file-parallelism` para los sanity-checks.

**CON-01 probado por comportamiento (168-04):** `test/tenancy/con-01-uniques-cross-tenant.test.ts` (941 líneas, 14 tests verdes) siembra un segundo tenant (id fijo **90168**) e inserta los mismos valores que El Templo en las diez tablas convertidas: MySQL los acepta cross-tenant y sigue rechazando el duplicado intra-tenant con `ER_DUP_ENTRY`. **28 aserciones de contrato sobre los 12 contratos.** El helper de rechazo exige el errno de MySQL específicamente (una FK rota no puede hacerlo pasar) y las 8 fixtures exigen `tenantId` como primer parámetro obligatorio, así que `tsc` rechaza un payload que caería en el tenant 1 por el DEFAULT de la 167. La mina M3 (`campaign_unsubscribes`) tiene describe propio con el caso `user_id` NULL. Cero contaminación verificada por SQL después de la corrida: `tenants` = 1 y 0 filas del tenant 90168. El archivo NO toca `test/helpers.ts`.

**Contrato cerrado (168-03):** `TENANT_GLOBAL_UNIQUES` ya existe en `src/db/tenant-tables.ts` con las 11 M8 y su motivo, junto a `TENANT_UNIQUE_ALLOWLIST` (37 entradas) y `PLATFORM_PHYSICAL_TABLES`. Los 11 comentarios M8 del schema apuntan a un export real.

**La 0196 tiene 12 contratos, no 11.** El verificador fail-closed del 168-03 encontró `subscription_plans.ux_subscription_plans_name_country` — unique global de tabla CORE gym-owned que la lista D-01 no tenía porque el índice existe en MySQL desde la migración **0091** y nunca se declaró en el schema Drizzle (drift schema↔DB; por eso el inventario del doc 05 anotó "name NO es unique"). Franco eligió el 2026-07-27 convertirla **dentro de la misma 0196** (opción A, no una 0197 aparte) y el drift quedó cerrado en el schema. Todo assert que cuente contratos convertidos dice **12**, y la 0196 tiene **10** `ALTER TABLE`. **Aplicado en las tres bases** (local, `eltemplo_staging` y `eltemplo`) con `discrepancies: 0` y exit 0 en las tres. **Efecto de InnoDB a tener presente:** al crear `uq_subscription_plans_tenant_name_country`, InnoDB dropea solo el índice auto-creado `fk_subscription_plans_tenant` porque la unique nueva ya sirve a la FK — la FK sigue viva y `tablesWithoutTenantIndex` da 0. Ocurrió igual en las tres bases, como estaba previsto.

**Deuda anotada para ISO-03 (fase 171):** la arista lógica `completed_sessions.day_id -> sessions.day_id` no cubre el 98,8% de las filas en producción (15.449 de 15.631 huérfanas). No es una discrepancia hoy —todo está en `tenant_id=1`— pero esa tabla no tiene verificación por derivación. Staging no lo detecta (no tiene el histórico). Hipótesis sobre la semántica de `day_id` NO verificada. Detalle en `167-07-SUMMARY.md`.

**Numeración:** v6.0 arranca en **166** — el ROADMAP tiene DOS "Phase 164" (TV de sucursal, viva en el worktree `et-164-tv`, y una legacy de v5.8) y la 165 está tomada por v5.8. Nada por debajo de 166 se renumera. La fase 164 (TV) sigue abierta en su worktree y se cierra por su propio carril, fuera de este milestone.

## Performance Metrics

**Velocity:**

- Total plans completed: 91 (v4.1)
- Average duration: ~11min
- Total execution time: ~122min

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
| ----- | ----- | ------ | -------- |
| 58    | 2/2   | ~30min | ~15min   |
| 59    | 4/4   | ~34min | ~9min    |
| 60    | 3/3   | ~52min | ~17min   |
| 97    | 3     | -      | -        |
| 127   | 2     | -      | -        |
| 128   | 3     | -      | -        |
| 129   | 2     | -      | -        |
| 130   | 4     | -      | -        |
| 131   | 3     | -      | -        |
| 150   | 6     | -      | -        |
| 151   | 5     | -      | -        |
| 152   | 6     | -      | -        |
| 153   | 4     | -      | -        |
| 154   | 5     | -      | -        |
| 155   | 4     | -      | -        |
| 156   | 5     | -      | -        |
| 166   | 6     | -      | -        |
| 167   | 7     | -      | -        |
| 168   | 6     | -      | -        |
| 169   | 9     | -      | -        |

**Recent Trend (from v4.0):**

- Last 5 plans: 63-02 (6min), 63-03 (4min), 63-01 (39min), 61-02 (25min), 61-01 (23min)
- Trend: Stable

_Updated after each plan completion_
| Phase 59 P02 | 4min | 2 tasks | 3 files |
| Phase 59 P03 | 15min | 2 tasks | 2 files |
| Phase 59 P04 | 6min | 2 tasks | 7 files |
| Phase 60 P01 | 25min | 2 tasks | 17 files |
| Phase 60 P02 | 22min | 2 tasks | 11 files |
| Phase 60 P03 | 5min | 2 tasks | 7 files |
| Phase 61 P01 | 23min | 2 tasks | 20 files |
| Phase 61 P02 | 25min | 2 tasks | 17 files |
| Phase 63 P01 | 39min | 2 tasks | 29 files |
| Phase 63 P02 | 6min | 2 tasks | 13 files |
| Phase 63 P03 | 4min | 2 tasks | 4 files |
| Phase 64 P01 | 26min | 2 tasks | 11 files |
| Phase 64 P03 | 47min | 2 tasks | 8 files |
| Phase 65 P01 | 7min | 2 tasks | 7 files |
| Phase 65 P02 | 3min | 2 tasks | 5 files |
| Phase 66 P01 | 11min | 2 tasks | 38 files |
| Phase 66 P02 | 4min | 2 tasks | 8 files |
| Phase 67 P01 | 6min | 2 tasks | 14 files |
| Phase 67 P02 | 9min | 2 tasks | 13 files |
| Phase 68 P01 | 6min | 2 tasks | 8 files |
| Phase 68 P02 | 9min | 2 tasks | 18 files |
| Phase 69 P01 | 13min | 2 tasks | 11 files |
| Phase 69 P02 | 2min | 2 tasks | 3 files |
| Phase 70 P01 | 6min | 2 tasks | 5 files |
| Phase 70 P02 | 4min | 2 tasks | 5 files |
| Phase 71 P02 | 5min | 2 tasks | 8 files |
| Phase 71 P01 | 15min | 2 tasks | 7 files |
| Phase 72 P01 | 4min | 2 tasks | 2 files |
| Phase 73 P01 | 3min | 2 tasks | 2 files |
| Phase 72 P03 | 3min | 2 tasks | 2 files |
| Phase 72 P02 | 5min | 2 tasks | 4 files |
| Phase 73 P02 | 4min | 2 tasks | 5 files |
| Phase 74 P01 | 2min | 2 tasks | 7 files |
| Phase 74 P02 | 2min | 2 tasks | 7 files |
| Phase 75 P01 | 4min | 2 tasks | 3 files |
| Phase 75 P02 | 2min | 2 tasks | 1 files |
| Phase 78 P01 | 13min | 2 tasks | 17 files |
| Phase 78 P02 | 7min | 2 tasks | 13 files |
| Phase 78 P03 | 5min | 1 tasks | 5 files |
| Phase 80 P03 | 2min | 2 tasks | 2 files |
| Phase 80 P01 | 6min | 2 tasks | 7 files |
| Phase 80 P02 | 6min | 2 tasks | 11 files |
| Phase 81 P01 | 14min | 2 tasks | 14 files |
| Phase 81 P02 | 2min | 1 tasks | 3 files |
| Phase 82 P01 | 16min | 2 tasks | 12 files |
| Phase 82 P02 | 4min | 2 tasks | 5 files |
| Phase 82 P03 | 2 | 1 tasks | 2 files |
| Phase 83 P01 | 8min | 2 tasks | 8 files |
| Phase 83 P02 | 4min | 2 tasks | 4 files |
| Phase 83 P04 | 5min | 2 tasks | 7 files |
| Phase 83 P03 | 7min | 2 tasks | 7 files |
| Phase 83 P05 | 16min | 2 tasks | 5 files |
| Phase 84 P02 | 2min | 2 tasks | 6 files |
| Phase 84 P01 | 5min | 2 tasks | 8 files |
| Phase 84 P03 | 4min | 2 tasks | 3 files |
| Phase 84 P04 | 4min | 2 tasks | 4 files |
| Phase 84 P06 | 2min | 2 tasks | 3 files |
| Phase 84 P05 | 3min | 2 tasks | 3 files |
| Phase 84 P07 | 6min | 2 tasks | 7 files |
| Phase 86 P03 | 2min | 2 tasks | 4 files |
| Phase 86 P02 | 2min | 2 tasks | 4 files |
| Phase 86 P01 | 5min | 2 tasks | 7 files |
| Phase 86 P04 | 2min | 2 tasks | 2 files |
| Phase 86 P05 | 6min | 2 tasks | 8 files |
| Phase 86 P06 | 7min | 2 tasks | 3 files |
| Phase 89 P07 | 6min | 2 tasks | 2 files |
| Phase 90 P01 | 12min | 2 tasks | 9 files |
| Phase 90 P03 | 13min | 3 tasks | 8 files |
| Phase 99 P02 | 20 | 2 tasks | 8 files |
| Phase 100 P04 | ~12m | 2 tasks | 7 files |
| Phase 100 P05 | 18m | 1 tasks | 3 files |
| Phase 101 P01 | 1min | 3 tasks | 3 files |
| Phase 101 P03 | 299 | 4 tasks | 4 files |
| Phase 102 P03 | 35m | 2 tasks | 4 files |
| Phase 102 P04 | ~20m | 4 tasks | 5 files |
| Phase 102 P05 | ~15m | 3 tasks | 3 files |
| Phase 103 P01 | ~25m | 2 tasks | 3 files |
| Phase 103 P02 | 30min | 3 tasks | 3 files |
| Phase 103 P03 | 10min | 2 tasks | 3 files |
| Phase 103 P06 | 8min | 3 tasks | 8 files |
| Phase 103 P04 | 30min | 2 tasks | 11 files |
| Phase 103 P07 | 5min | 3 tasks | 3 files |
| Phase 103 P05 | 3 | 2 tasks | 3 files |
| Phase 104 P04 | 23 min | 3 tasks | 6 files |
| Phase 105 P01 | 12min | 3 tasks | 5 files |
| Phase 105 P02 | 7min | 3 tasks | 5 files |
| Phase 105 P03 | 4min | 2 tasks | 4 files |
| Phase 105 P04 | 6min | 2 tasks | 2 files |
| Phase 105 P05 | 10min | 2 tasks | 4 files |
| Phase 105 P06 | 67min | 2 tasks | 13 files |
| Phase Phase 105 PP07 | 5min | 2 tasks tasks | 3 files files |
| Phase 106 P01 | 10min | 3 tasks | 7 files |
| Phase Phase 106 PP02 | 25min | 3 tasks tasks | 5 files files |
| Phase 106 P03 | 50min | 4 tasks | 7 files |
| Phase Phase 106 PP04 | 21min | 3 tasks tasks | 3 files files |
| Phase 106 P05 | 7min | 3 tasks | 9 files |
| Phase 109 P01 | 22min | 2 tasks tasks | 4 files files |
| Phase 109 P02 | 20min | 3 tasks tasks | 5 files files |
| Phase 109 P03 | 50min | 3 tasks tasks | 8 files files |
| Phase 109 P04 | 9min | 3 tasks | 8 files |
| Phase 109 P05 | 10min | 2 tasks | 2 files |
| Phase 110 P02 | 109 | 3 tasks | 1 files |
| Phase 110 P06 | 25m | 3 tasks | 6 files |
| Phase 111 P01 | 5min | 3 tasks | 6 files |
| Phase 111 P02 | 6min | 3 tasks | 6 files |
| Phase 111 P03 | 58min | 3 tasks | 10 files |
| Phase 111 P04 | 21min | 2 tasks | 8 files |
| Phase 112 P01 | 19min | 3 tasks | 6 files |
| Phase 112 P02 | 24min | 3 tasks | 9 files |
| Phase 112 P03 | 30min | 3 tasks | 3 files |
| Phase 112 P04 | 26min | 5 tasks | 8 files |
| Phase 113 P01 | 25min | 3 tasks | 6 files |
| Phase 113 P02 | 7min | 3 tasks | 4 files |
| Phase 114 P03 | 11min | 2 tasks | 2 files |
| Phase 114 P04 | 12min | 3 tasks | 6 files |
| Phase 116 P01 | 3min | 3 tasks | 6 files |
| Phase 116 P02 | 3min | 3 tasks | 1 files |
| Phase 116 P03 | 5min | 3 tasks | 6 files |
| Phase 116 P04 | 3min | 2 tasks | 3 files |
| Phase 116 P05 | 16min | 2 tasks | 2 files |
| Phase 117 P01 | 75min | 2 tasks | 7 files |
| Phase 117 P03 | ~30min | 2 tasks | 5 files |
| Phase 117 P04 | ~20min | 2 tasks | 5 files |
| Phase 117 P05 | 25min | 2 tasks | 4 files |
| Phase 117 P06 | ~40min | 3 tasks | 14 files |
| Phase 118 P01 | 25min | 2 tasks | 3 files |
| Phase 118 P02 | 18min | 2 tasks | 5 files |
| Phase 118 P05 | ~10min | 2 tasks | 2 files |
| Phase 118 P03 | ~12min | 2 tasks | 5 files |
| Phase 118 P04 | 5min | 2 tasks | 5 files |
| Phase 119 P01 | ~14min | 3 tasks | 16 files |
| Phase 119 P02 | 12 | 2 tasks | 8 files |
| Phase 119 P03 | ~22min | 2 tasks | 6 files |
| Phase 119 P04 | ~9min | 3 tasks | 12 files |
| Phase 119 P06 | ~12min | 2 tasks | 6 files |
| Phase 120 P01 | 2min | 3 tasks | 3 files |
| Phase 120 P02 | ~6min | 3 tasks | 3 files |
| Phase 120 P03 | ~3min | 3 tasks | 3 files |
| Phase 120 P04 | 6min | 3 tasks | 5 files |
| Phase 121 P01 | 5min | 3 tasks | 3 files |
| Phase 121 P02 | 6min | 3 tasks | 5 files |
| Phase 121 P03 | 4min | 3 tasks | 5 files |
| Phase 122 P01 | 7min | 2 tasks | 3 files |
| Phase 122 P02 | 18min | 2 tasks | 4 files |
| Phase 122 P03 | ~9min | 1 tasks | 1 files |
| Phase 123 P01 | 12min | 3 tasks | 5 files |
| Phase 123 P02 | 7 | 3 tasks | 5 files |
| Phase 123 P03 | ~5min | 3 tasks | 5 files |
| Phase 124 P01 | 6min | 2 tasks | 4 files |
| Phase 124 P02 | 12min | 2 tasks | 2 files |
| Phase 125 P02 | ~25min | 2 tasks | 4 files |
| Phase 125 P03 | 30min | 2 tasks | 5 files |
| Phase 126 P01 | 2min | 2 tasks | 3 files |
| Phase 126 P02 | 6min | 2 tasks | 2 files |
| Phase 126 P03 | 5min | 2 tasks | 2 files |
| Phase 127 P01 | 22min | 3 tasks | 8 files |
| Phase 127 P02 | ~25min | 2 tasks | 7 files |
| Phase 128 P01 | 6min | 2 tasks | 2 files |
| Phase 128 P02 | ~12min | 2 tasks | 7 files |
| Phase 128 P03 | ~15min | 2 tasks | 5 files |
| Phase 129 P01 | ~35min | 2 tasks | 18 files |
| Phase 129 P02 | ~25min | 2 tasks | 7 files |
| Phase 130 P03 | ~2min | 2 tasks | 3 files |
| Phase 130 P04 | ~10min | 1 task | 1 file |
| Phase 131 P02 | ~35m | 2 tasks | 17 files |
| Phase 132 P01 | ~25min | 2 tasks | 11 files |
| Phase 132 P02 | 20min | 2 tasks | 5 files |
| Phase 132 P3 | 12 | 2 tasks | 2 files |
| Phase 132 P04 | ~2min | 2 tasks | 2 files |
| Phase 132 P5 | ~8min | 2 tasks | 2 files |
| Phase 132 P06 | 15min | 3 tasks | 4 files |
| Phase 133 P01 | 7min | 2 tasks tasks | 5 files files |
| Phase 133 P02 | 6min | 2 tasks | 7 files |
| Phase 133 P03 | 20min | 3 tasks | 6 files |
| Phase 133 P04 | ~32min | 2 tasks | 9 files |
| Phase 133 P05 | 19min | 3 tasks | 5 files |
| Phase 133 P06 | 22min | 3 tasks | 4 files |
| Phase 133 P07 | ~8min | 2 tasks | 4 files |
| Phase 134 P01 | ~14min | 3 tasks | 3 files |
| Phase 134 P03 | 10min | 1 tasks | 1 files |
| Phase 134 P02 | ~3min | 2 tasks | 4 files |
| Phase 135 P01 | 5min | 3 tasks | 2 files |
| Phase 135 P03 | ~8min | 3 tasks | 3 files |
| Phase 135 P04 | ~12min | 2 tasks | 4 files |
| Phase 143 P01 | 5min | 2 tasks | 4 files |
| Phase 143 P02 | ~7min | 2 tasks | 7 files |
| Phase 143 P03 | ~8min | 2 tasks | 2 files |
| Phase 143 P05 | ~6min | 2 tasks | 3 files |
| Phase 137 P01 | ~12min | 3 tasks | 6 files |
| Phase 137 P02 | ~40min | 3 tasks | 6 files |
| Phase 137 P03 | ~18min | 3 tasks | 9 files |
| Phase 138 P01 | 10min | 3 tasks | 5 files |
| Phase 138 P138-02 | ~75min | 3 tasks | 13 files |
| Phase 138 P138-03 | ~30min | 2 tasks | 3 files |
| Phase 139 P139-01 | 13min | 3 tasks | 9 files |
| Phase 139 P139-02 | 4min | 2 tasks | 2 files |
| Phase 139 P139-03 | 7min | 3 tasks | 6 files |
| Phase 140 P140-01 | ~9min | 3 tasks | 7 files |
| Phase 140 P02 | 6min | 3 tasks | 6 files |
| Phase 140 P03 | 12 | 2 tasks | 4 files |
| Phase 141 P01 | 5min | 3 tasks | 8 files |
| Phase 141 P02 | ~7min | 2 tasks | 5 files |
| Phase 141 P03 | 12min | 3 tasks | 6 files |
| Phase 141 P04 | ~9min | 2 tasks | 3 files |
| Phase 142 P01 | ~18min | 2 tasks | 8 files |
| Phase 142 P02 | ~6min | 1 tasks | 2 files |
| Phase 142 P142-03 | ~12min | 2 tasks | 4 files |
| Phase 144 P01 | 12min | 3 tasks | 6 files |
| Phase 144 P02 | 8min | 2 tasks | 2 files |
| Phase 144 P03 | ~15min | 3 tasks | 4 files |
| Phase 144 P04 | 20 | 2 tasks | 5 files |
| Phase 145 P01 | ~20min | 3 tasks | 8 files |
| Phase 145 P02 | ~12min | 2 tasks | 5 files |
| Phase 147 P02 | ~12min | 3 tasks | 4 files |
| Phase 148 P01 | 10min | 3 tasks | 8 files |
| Phase 148 P02 | 12min | 2 tasks | 1 files |
| Phase 148 P03 | 8min | 2 tasks | 2 files |
| Phase 148 P04 | 18min | 2 tasks | 1 files |
| Phase 148 P05 | 22min | 3 tasks | 2 files |
| Phase 149 P01 | 18min | 3 tasks | 6 files |
| Phase 149 P02 | 12min | 2 tasks | 7 files |
| Phase 149 P03 | 4min | 2 tasks | 2 files |
| Phase 149 P04 | ~8min | 2 tasks | 5 files |
| Phase 149 P05 | 7min | 2 tasks | 5 files |
| Phase 149 P06 | 6min | 1 tasks | 3 files |
| Phase 150 P02 | 3min | 2 tasks | 2 files |
| Phase 150 P03 | 15min | 2 tasks | 2 files |
| Phase 150 P04 | ~8min | 2 tasks | 3 files |
| Phase 150 P05 | ~10min | 2 tasks | 4 files |
| Phase 150 P06 | 13min | 3 tasks | 6 files |
| Phase 151 P01 | 30min | 3 tasks | 5 files |
| Phase 151 P02 | 4min | 2 tasks | 2 files |
| Phase 151 P04 | ~12min | 2 tasks | 2 files |
| Phase 151 P05 | ~10min | 2 tasks | 3 files |
| Phase 152 P01 | 10min | 3 tasks | 3 files |
| Phase 152 P02 | 2min | 2 tasks | 3 files |
| Phase 152 P03 | ~15min | 3 tasks | 5 files |
| Phase 152 P04 | ~15min | 3 tasks | 5 files |
| Phase 152 P05 | 12min | 3 tasks | 7 files |
| Phase 152 P06 | ~12min | 3 tasks | 5 files |
| Phase 153 P01 | 12min | 3 tasks | 5 files |
| Phase 153 P02 | 7min | 3 tasks | 5 files |
| Phase 153 P03 | ~5min | 3 tasks | 8 files |
| Phase 153 P04 | 3min | 3 tasks | 4 files |
| Phase 154 P1 | 18min | 2 tasks | 7 files |
| Phase 154 P02 | ~20min | 2 tasks | 5 files |
| Phase 154 P03 | 12min | 2 tasks | 4 files |
| Phase 154 P04 | ~10min | 2 tasks | 3 files |
| Phase 154 P05 | 9min | 2 tasks | 3 files |
| Phase 155 P01 | 5min | 3 tasks | 4 files |
| Phase 155 P02 | 4min | 2 tasks | 5 files |
| Phase 155 P03 | 3min | 2 tasks | 4 files |
| Phase 155 P04 | 7min | 1 tasks | 1 files |
| Phase 156 P01 | 5min | 2 tasks | 8 files |
| Phase 156 P04 | ~2min | 2 tasks | 3 files |
| Phase 156 P02 | 12min | 2 tasks | 7 files |
| Phase 156 P03 | 18min | 3 tasks | 3 files |
| Phase 156 P05 | ~4min | 3 tasks | 6 files |
| Phase 158 P01 | ~20min | 3 tasks | 7 files |
| Phase 158 P02 | 9min | 3 tasks | 8 files |
| Phase 167 P06 | ~30min | 3 tasks | 3 files |
| Phase 158 P03 | ~10min | 2 tasks | 3 files |
| Phase 158 P04 | 15 | 2 tasks | 3 files |
| Phase 161 P01 | 18min | 3 tasks | 8 files |
| Phase 161 P02 | ~28min | 3 tasks | 4 files |
| Phase 161 P03 | 30min | 3 tasks | 3 files |
| Phase 161 P04 | 13min | 2 tasks | 11 files |
| Phase 161 P05 | 10min | 2 tasks | 5 files |
| Phase 161 P06 | ~9min | 3 tasks | 3 files |
| Phase 162 P01 | ~12min | 2 tasks | 4 files |
| Phase 162 P02 | 14min | 2 tasks | 3 files |
| Phase 162 P03 | ~14min | 3 tasks | 4 files |
| Phase 162 P04 | ~5min | 3 tasks | 3 files |
| Phase 162 P06 | ~13min | 2 tasks | 4 files |
| Phase 166 P01 | 5min | 3 tasks | 3 files |
| Phase 166 P02 | 4min | 2 tasks | 3 files |
| Phase 166 P03 | 15min | 2 tasks | 1 files |
| Phase 166 P04 | 10min | 2 tasks | 2 files |
| Phase 166 P05 | 27min | 2 tasks | 1 files |
| Phase 166 P06 | ~2h45min | 2 tasks | 0 files |
| Phase 167 P01 | 9min | 3 tasks | 3 files |
| Phase 167 P02 | 15min | 2 tasks | 29 files |
| Phase 167 P03 | 12min | 2 tasks | 8 files |
| Phase 167 P04 | ~10min | 2 tasks | 23 files |
| Phase 167 P05 | ~10min | 2 tasks | 17 files |
| Phase 168 P01 | 6min | 3 tasks | 1 files |
| Phase 168 P02 | 5min | 2 tasks | 13 files |
| Phase 168 P03 | 45min | 3 tasks | 5 files |
| Phase 168 P04 | 15min | 2 tasks | 1 files |
| Phase 168 P05 | 40min | 3 tasks | 2 files |
| Phase 168 P06 | ~53min | 2 tasks | 0 files |
| Phase 169 P01 | ~9min | 3 tasks | 2 files |
| Phase 169 P02 | ~14min | 2 tasks | 4 files |
| Phase 169 P05 | ~18min | 2 tasks | 3 files |
| Phase 169 P06 | ~15min | 2 tasks | 5 files |
| Phase 169 P08 | ~17min | 2 tasks | 3 files |
| Phase 172 P01 | 6min | 2 tasks | 0 files |
| Phase 172 P02 | 55min | 2 tasks | 11 files |
| Phase 172 P03 | 13min | 2 tasks | 2 files |
| Phase 172 P04 | 11min | 2 tasks | 5 files |
| Phase 172 P06 | 25min | 3 tasks | 3 files |
| Phase 172 P05 | 15min | 2 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 164 added (standalone admin/api, sin migraciones de sesiones; diseño YA validado en mockup v8): Pantalla TV de sucursal — plani viva por bloque (reemplaza el flujo de PNGs descargados del PDF builder) + timer por formato + video del ejercicio + control remoto del profe. Ruta pública `/tv` en el-templo-admin (marco 16:9, estética del PDF: mármol/Cinzel/NunitoSans/navy+oro de `session-pdf-builder.ts`); layout 2 columnas 45/55: lista del nivel elegido (ejercicio actual gigante) + timer abajo, video mp4 del ejercicio a la derecha (R2 público vía `assembleVideoUrl`). Control remoto = sección coach del admin en el celular: bloque, nivel (α/Δ/Σ/☉; deshabilitado en INITIUM/PYROS que es lista compartida y titula PYROS), ejercicio actual, timer start/reset. Comunicación celular↔TV SIN conexión directa: fila de estado por sede en la API, el TV hace polling 2-3s con device token (vinculación por código corto estilo Netflix), timers viajan como timestamp de inicio y el TV cuenta local. Origen: sugerencia #1 de los socios (6/42 piden reloj/segundero). Spec de UI: mockup navegable https://claude.ai/code/artifact/f61d5518-5716-4620-b02e-1696d961e100 + `164-UI-SPEC.md` + template HTML en el phase dir. Prerequisito operativo: wifi en Moreno. (TV-SUCURSAL)
- v5.4 milestone roadmapped (phases 149-156, 33 reqs, granularity fine): Reforma del Admin — Correcciones white-label (pre-tenants). Deriva de `.docs/saas-multitenancy/Correcciones El Templo.md` + `01-analisis-correcciones-admin.md`. Continúa numeración desde 148 (NO reset). **149 Nav+RBAC foundational** (categorías Finanzas/Alumnos/Horarios/Planes + gating dueño-vs-empleado + gateo de features Templo fuera del MVP, no borradas). **150 Cuentas bancarias** (ABM flexible 3-obligatorios + baja lógica + retiros del dueño; levanta CAJA-F1 de v5.3) precede a **151 Cobros** (Pagos→Cobros, pasos separados, fecha/hora, COBRO-04 asocia cuenta). **152 Caja** (reorden tabs + estado por fila + filtro por día + validador + ABM centros de costo sobre `cost_centers` de v5.3 fase 147 + nota Saldos). **153 Deudas** (fecha+motivo+plan asociado+no-renovaciones; reutiliza `misc_reason` de v5.3 fase 145 — verificar, no duplicar). **154 Alumnos** (crear prominente + cobro en la fila + precio x medio config + avatar→segmento + niveles griegos gateados Templo). **155 Horarios** (clases simultáneas + crear clase desde slot + capacidad por actividad). **156 Planes** (Planes de pago vs Rutinas de entrenamiento + Zero a config + multi-programa por plan + suba de precio sin romper históricos con test). SIN tenants este milestone. (v5.4-ROADMAP)
- Phase 148 added (continúa numeración tras v5.3 145-147; depende de v5.2 137/140/141 + v5.3 146): PoS profe — alta de alumno + plan en el cobro. El profe carga el plan directamente en el cobro (extiende `CargarPagoPage.vue` / Fase 140), creando al alumno si es nuevo, reemplazando el Google Form→Excel→admin. Modelo crear-en-vivo + validar-después (pago nace `pendiente` → bandeja Fase 137/141). Decisiones cerradas con el usuario (BRIEF-POS-PROFE-ALTA-ALUMNO.md): dedup por DNI (`check-duplicates`), cascade en void (desactiva membresía + alumno inactivo, no borra), sucursal default del profe editable, precio según medio de pago (tarjeta=`priceCreditCard`, resto=`priceRegular`/`priceZero` toggle Zero, parcial deja deuda), selector de turnos estructurado solo planes `fixed` (reusa `FixedSchedulePicker.vue`). Backend: endpoint nuevo en `coach-load-routes.ts` atómico e idempotente (resolver/crear alumno + `assignPlan(scheduleIds)` + transacción `pendiente`). Hallazgos: "Zero"=columna de precio no plan aparte; crear alumno mínimo ya existe (`POST /members/trial`, email null). Sobre `staging`, tren v5.2/v5.3. Decisiones cerradas → puede ir directo a /gsd-plan-phase (discuss opcional). (POS-NEW)
- Phase 144 added (standalone app/api/admin, numerada después de 143, NO depende de ella ni del Módulo Contable v5.2): Notificaciones y bloqueo de vencimiento de membresía/plan — 3 entregables: (1) notificación push de vencimiento de plan ~7d antes, réplica del cron "Program Renewal Warning" pero sobre `subscriptions.end_date` + nuevo template `plan_renewal_warning` en `notifications/types.ts`; (2) pop-up in-app a 7 y 3 días del vencimiento con botón a WhatsApp (`buildWhatsAppUrl`); (3) bloqueo de reserva cuando `booking_date > subscription.end_date` en `booking-service.ts reserve()` (hoy ese check NO existe — bug latente) + pop-up en `ReservasPage.vue` con botón a WhatsApp. Reutiliza `pending_notifications`+FCM+`notification-cron` y `el-templo-app/src/utils/whatsapp.ts`. Decisiones abiertas (categoría entrenamiento vs programas, copy 7 vs 3d, anti-repetición del pop-up, salteable vs bloqueante, planes sin end_date, alcance presencial vs online) → discuss-phase. (PLAN-NOTIF, PLAN-POPUP, BOOK-BLOCK)
- Phase 143 added (standalone app/admin, numerada después de v5.2 Módulo Contable 137-142, NO depende de ella): Profesor por clase + Puntuación post clase presencial — construir la cadena profe↔clase inexistente (asignación owner profe↔sucursal en Horarios, profe se marca como dictante escaneando el QR de la instancia validado contra su sucursal, app muestra el profe) + rating del profesor estilo Uber vía pop-up al volver a la app tras una clase presencial. Solo presencial; puntúa al profesor (no RPE). Reutiliza role `coach`+`user_branches`. Brief: `BRIEF-PUNTUACION-PROFES.md`. Decisiones abiertas (escala, salteable, co-dictado, fallback sin scan, reporte owner) → discuss-phase.
- Phase 137 added (nueva milestone v5.2 Módulo Contable): Máquina de estados de validación — CIMIENTO. `validation_status` (pendiente/observado/corregido/validado) ORTOGONAL al soft-void existente (ANULADO); el filtro canónico de "dinero firme" pasa a `validation_status='validado' AND voided_at IS NULL`, sin romper las 6 métricas v5.0 (migración DEFAULT 'validado' + backfill + auditar call sites). Profe→PENDIENTE / admin→VALIDADO; corregir=anular+recrear; membresía se activa al instante. Bloquea 138-142. (VAL-01..07)
- Phase 138 added: Entidad caja + saldos — tabla `cash_registers` (efectivo×sucursal + central + banco×moneda, `currency` fija) + `cash_register_id` en el ledger (≠ branchId) + saldo firme derivado (solo VALIDADOS, pendientes aparte) + aislamiento de moneda. (CAJA-01..04)
- Phase 139 added: Movimientos inter-caja y egresos — movimiento=una fila (origen+destino, neto 0) con esperado-vs-contado; egreso=destino NULL + nota libre (sin categoría); ambos void ortogonal; no contaminan `balances`; `cash_transfer`/`expense` en KINDS_ALLOWED_WITHOUT_LINKS. (MOV-01..04)
- Phase 140 added: Carga única que propaga + cobro suelto + rol profe (CORAZÓN) — extender `recordAssignmentCharge` (cashRegisterId + validationStatus por rol), UI dead-simple idempotente, cobro suelto sin membresía, rol profe acotado (carga PENDIENTE, no valida/anula/ve saldos). (CARGA-01..04)
- Phase 141 added: Reportes para la admin — bandeja de pendientes por antigüedad (+ observados + alerta configurable), saldo firme/pendiente por caja, historial de movimientos/egresos, reusando export Excel/PDF existente. (REP-01..04)
- Phase 142 added: Config + transición Contabilium — perillas de config (política de validación; activación instantánea/diferida) con casa definida (`finance_settings` tras borrado del subsistema en 136-07) + regla documentada de "qué dato manda" en la convivencia con Contabilium (corte limpio + asientos de apertura). (MIG-01, MIG-02)
- Phase 133 added: Calidad del árbol — hitos canónicos + variantes (milestone_exercise_id), bandas de dificultad con kairos, sub-grupos por category fina, prereqs cross-ruta (R1-R4 de tree-quality-research.md; decisiones cerradas 2026-06-07)
- Phase 134 added: Árbol del miembro — estados de nodo Bloqueado/Disponible/Dominado + criterio de avance objetivo 3×8/3×30s en player (R5-R6)
- Phase 135 added: Árbol del admin — jerarquía visual de hitos/variantes en /tree-map (auto-poblar milestone_exercise_id con la heurística de 133 + render hito colapsable con variantes; hoy Front Lever se ve plano porque los hitos nunca se poblaron)
- Phase 70 added: Personalizadas Cycle Config — configurable cycle length per plan, progress bars in member app
- Phase 86 added: QR Promo — Free Month Campaign
- Phase 88 (was 89): Gender-Based Notification Personalization — gender inference, registration field, gendered notification copy
- Phase 88 (old): Reservation Rules — Per-Plan Booking Configuration — removed from v4.4
- Phase 98 added: Multi-currency and country-scoped plans — AR/ES plan segregation with EUR pricing, owner country toggle, branch-scoped filtering
- Phase 100 added: Games format, exercise route overhaul, and session editor route UX — coach-driven session authoring changes (new format, INITIUM block titles, new games route, Spanish route renaming)
- Phase 101 added: Debt tracking — flag members with outstanding debt via new `debts` table (one active per user, soft-cancel for history), admin AlumnosPage filter + total debt banner grouped by currency, MemberFormDialog deudor toggle + amount + note; intentionally not integrated with payments table in this phase
- Phase 102 added: Trial Classes (Sesiones de Prueba) — admins register potential members for a single free trial via SlotDetailDialog; `bookings.is_trial` excludes trials from capacity; one-trial-per-phone guard; "Clases de prueba" counter on alumno detail; Leads filter inferred from booking history (no `users.status` column — Option B); conversion to member reuses existing edit + Gestionar Plan flows
- Phase 104 added: Planes vs Programas + Bundle "Todos los Programas" — separar conceptualmente plan presencial de programa virtual; nueva columna `subscription_plans.grants_all_programs` para el bundle; nueva columna `users.current_program_enrollment_id` para programa activo cuando hay múltiples enrollments; gating de `/sessions/*` por tipo de dayId (presencial vs enrollment); selector de programa en weekly view del member app; reemplazo de gating frágil de ReservasPage por `hasPresencialPlan`; seed del nuevo plan bundle ($20.000 ARS, 30 días)
- Phase 110 added: Admin users por país + multi-sede staff — admin/gestion/owner alcance por país (`users.country`), coach/recepción multi-sede (`user_branches`), `branch_id` NOT NULL como sede personal, staff multisucursal por rol en app de miembros, Templo Online global, owner bypass; extiende `country-scope.ts` para usar `users.country` directamente y agregar branchIds para coach/recepción
- Phase 114 added: Reporte tabular de sesiones de prueba — reemplaza el CSV manual de Google Sheets por reporte filtrable en módulo Reportes del admin (11 columnas: Lead, Fecha, Hora, Sucursal, Asistió, Estado del Lead, Gestiona, Comentarios, Turno, Periodo, Semana); nuevos campos `users.lead_status` (enum), `users.lead_notes` (TEXT), `bookings.created_by` (FK); hooks de subscription para auto-cerrar lead + prefijar plan en comentarios; descarta Rep./Asistió post rep./Asistencia Final/Profe1/Profe2 del CSV original
- Phase 116 added: Refresh tokens auth — reemplaza JWT único de 7d por access (30m) + refresh token (30d sliding) con rotación obligatoria y reuse detection; nueva tabla `refresh_tokens` (hash, expires_at, revoked_at); endpoints `/auth/refresh` y `/auth/logout` reales; interceptor de axios en app+admin con lock compartido para evitar refresh storms; API backwards-compatible (devuelve `{ token, accessToken, refreshToken }`) para no romper apps viejas en Play Store. Origen: bug recurrente de logout cada 7d en app de miembros. SPEC creado originalmente como Phase 115 (commit huérfano 8be596bf), renumerado a 116 porque 115 quedó asignado a "Evento Desafío de la Barra"
- Phase 117 added: Analytics — correcciones de exactitud + métrica de miembros únicos. Corrige 4 bugs descubiertos analizando prod (2026-05-26): KPI de activos lee `users.status` obsoleto (~48 fantasmas, sin cron), no-show rate usa enum inexistente `'confirmed'` (→ siempre 100%/0), revenue suma ARS+EUR en vista owner, trend de activos circular mezcla freemium/prueba. Arquitectura: centralizar la definición de "activo" (hoy triplicada en recomputeUserStatus/analytics/reports), filtrar `is_archived` en plan distribution, split del service de 1112 LOC (facade) + `applyScope`. Feature: miembros únicos últimos 7/14/30 días en tab Asistencias. Detalle completo con refs archivo:línea en FINDINGS.md del directorio de la fase
- Phase 132 added (nueva milestone v5.2): UI de Métricas de Gestión — exponer en el admin las 6 métricas de gestión de v5.0 (ticket promedio, churn de no-renovación, tasa de renovación, LTV, frecuencia de asistencia, funnel de sesiones) que hoy existen solo en backend (endpoints `/admin/analytics/{ticket,churn,renewal,ltv,frequency,trial-funnel}`), cableando `useAnalyticsApi.ts` + tipos + tabs nuevos en `AnaliticasPage.vue`, y eliminando físicamente las métricas viejas/ARPU deprecadas. Frontend-only, sin migraciones. Milestone separada para no mezclar con el Nuevo Sistema de Entrenamiento (v5.1, en curso)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Merge admin apps: Net features rebuilt in Vue/Quasar within existing el-templo-admin
- Modular monolith: formalize src/modules/ pattern with explicit boundaries
- Constructor DI pattern for services (established in Phase 56)
- Resend over nodemailer for EmailService (Phase 57)
- Plan-first admin member creation with auto-subscription (Phase 57)
- Production seed uses CONFIRM_PRODUCTION_SEED=yes safety gate (Phase 58)
- Nullable column extension pattern for backward-compatible schema changes (Phase 59)
- [Phase 59]: documentType required in create mode only, optional in edit mode for backward compatibility
- [Phase 59]: CSV import script uses static imports for drizzle-orm to avoid dynamic import type mismatches
- [Phase 59]: 84 unique legacy plan names found, all created as archived subscription_plans on import
- [Phase 59]: Bulk migration sets pricePaid=0 for legacy-to-current plan migrations (admin adjusts later)
- [Phase 60]: system_settings key-value table for global config (grace period, future settings)
- [Phase 60]: Budget pre-calculated at subscription creation: ceil(durationDays/7) \* classesPerWeek
- [Phase 60]: fixedDays stored as JSON array on subscription record for per-subscription flexibility
- [Phase 60]: DAY_LABELS shared constant in subscription types for UI day display
- [Phase 60]: Conditional stepper step pattern using computed confirmStep for dynamic step count
- [Phase 60]: Grace period intercept bypasses auto-expire; getSubscriptionWithGracePeriod queries raw status
- [Phase 60]: SettingsService optional on SubscriptionService for backward-compatible grace-period-aware auto-expire
- [Phase 60]: Force check-in decrements budget to maintain accuracy despite bypassing all other checks
- [Phase 61]: Grace period fully removed -- expired subscription = immediate hard block
- [Phase 61]: QR scan immediately creates "confirmado" status and awards 10 AURA (no two-step model)
- [Phase 61]: subscription_schedules junction table for fixed-plan schedule slot references (replaces fixedDays JSON)
- [Phase 61]: SettingsService kept as empty shell for future settings extensibility
- [Phase 61]: Setter DI pattern (setBookingService) for SubscriptionService<->BookingService circular dependency
- [Phase 61]: Coach check-in from slot always allows action but returns subscription warnings
- [Phase 61]: Attendance undo uses AURA spend for reversal (graceful if insufficient balance)
- [Phase 63]: Subscription renewal extends existing record (same ID) rather than creating new subscription
- [Phase 63]: Auto-payment recording on assign/change/renew via PaymentService DI in SubscriptionService
- [Phase 63]: Morosos/balance/overdue concept fully removed from payments, members, analytics, attendance, booking
- [Phase 63]: Renewal end date preview computed client-side from subscription duration; actual calculation server-side
- [Phase 63]: Payment method selector pattern: QSelect with PAYMENT_METHOD_OPTIONS, emit-value, map-options
- [Phase 63]: Recepcionista added to AdminRole type for caja route access
- [Phase 63]: Morosos/overdue UI fully removed from sidebar, AlumnosPage, AlumnoDetailPage
- [Phase 64]: Reused blog image presigned URL pattern for member photos (PutObjectCommand + getSignedUrl)
- [Phase 64]: [Phase 64]: exceljs for server-side Excel export with styled headers; drizzle-kit push replaces raw SQL migration parsing in test setup
- [Phase 64]: Proration credit uses pricePaid (actual amount paid) not priceRegular; applied via priceOverrideAmount to reuse assignPlan logic
- [Phase 64]: Preview endpoint pattern: GET /change-plan-preview returns mutation preview before POST confirmation
- [Phase 65]: Raw SQL for charge history recorder self-join (drizzle lacks multi-alias on same table)
- [Phase 65]: Export methods reuse query methods with high limit for DRY
- [Phase 65]: Paginated report pattern: PaginatedResult<T> with rows/total/page/limit
- [Phase 65]: Single-file ReportesPage with inline tabs for data table simplicity; per-tab independent date ranges
- [Phase 66]: Centralized role permission registry in shared/permissions.ts; all modules import role groups, never define local arrays
- [Phase 66]: Owner replaces superadmin throughout API; four-role hierarchy: owner > admin > coach = recepcionista (parallel)
- [Phase 66]: Cast pattern (ROLES as readonly string[]).includes() for const array TypeScript compatibility
- [Phase 66]: Permission-aware sidebar with isCoachRole/isAdminRole/isCajaRole/isOwnerRole computed props
- [Phase 66]: Role-based route redirect: recepcionista -> /alumnos, all others -> /sessions
- [Phase 67]: DayId prefix changed from J- to P- for personalizada sessions
- [Phase 67]: API response keys renamed: journey -> personalizada, journeys -> personalizadas
- [Phase 67]: Spanish error messages updated to use personalizada terminology
- [Phase 68]: BlockProgressionView props updated to match current interface in PersonalizadaSession.vue
- [Phase 69]: checkSubscription queries active/paused subscriptions joined to plans where isPersonalizada=true
- [Phase 69]: AURA award failure on personalizada completion is logged but does not fail the completion (graceful degradation)
- [Phase 69]: Used q-tooltip on toggle instead of hint prop for cleaner UI
- [Phase 70]: cycleWeeks derived from ceil(durationDays/7) -- no new DB column, all data from existing tables
- [Phase 70]: Change button hidden when wrap-up card shows (wrap-up has own CTA); fetchPersonalizadaData awaited to set default tab
- [Phase 71]: Removed selectPersonalizada from store and API composable since only deleted pages used it
- [Phase 71]: PersonalizadasService instantiated in SubscriptionService constructor (no circular dependency)
- [Phase 72]: Secondary plan query pattern in member-routes handler for plan-level fields, avoiding shared SubscriptionDetail type modification
- [Phase 73]: No new types needed -- member plan response shape derived inline with field filtering
- [Phase 72]: Three-mode Mi Camino layout: unified personalizada view (no tabs), archived tabs with renewal banner, and unchanged regular member view
- [Phase 72]: Context-aware /training page branches on hasActivePersonalizada/hasActiveSubscription; post-session flows unified to /mi-camino
- [Phase 73]: Inline MemberPlan interface in PlanesPage -- no shared type for single-use response shape
- [Phase 74]: Capacitor v8 requires Node >=22; used nvm to switch during cap sync/doctor
- [Phase 74]: minSdkVersion raised from 23 to 24 per Capacitor 8 requirements; versionName set to 1.0.0
- [Phase 74]: Production-only ProGuard via androidComponents API (staging unminified for readable stack traces)
- [Phase 74]: Cleartext traffic controlled via flavor manifest overlays (staging enables, production disables)
- [Phase 75]: Variant-scoped signing via applicationVariants.configureEach (not buildTypes.release conditional) to ensure only productionRelease gets signing
- [Phase 75]: Key alias hardcoded as 'upload' in build.gradle (not secret, not configurable) for simplicity
- [Phase 75]: Master branch guard as explicit shell check (not branch filter) so workflow_dispatch from non-master fails with clear error
- [Phase 78]: onboarding_completion added to both aura_transactions and aura_config source type enums for consistency
- [Phase 78]: GET /onboarding/profile returns 204 No Content (not 404) for not-yet-completed onboarding
- [Phase 78]: AURA award failure gracefully degraded on onboarding -- profile creation succeeds regardless
- [Phase 78]: Onboarding route registered as top-level (not under layout) for full-screen quiz without bottom tabs
- [Phase 78]: Router guard checks role===member before redirecting to onboarding; coaches/admins/owners skip onboarding
- [Phase 78]: Added OnboardingProfileSummary type to admin MemberProfile for TypeScript safety (plan said dynamic access, CLAUDE.md no-any rule requires proper typing)
- [Phase 80]: RPE contextual message uses hasInteracted ref + watcher pattern in SessionSummary for clean component boundary
- [Phase 80]: TIMESTAMPDIFF for weekly summary duration calculation; MemberSegment type duplicated in member app (same as admin pattern)
- [Phase 80]: useRouter() import instead of template $router for vue-tsc type safety in card components
- [Phase 80]: Segment-driven card ordering via computed CardId array with template v-for for dynamic reordering
- [Phase 81]: Created member_profiles table from scratch (Phase 78 reverted) with streak columns; future phases add onboarding/segmentation columns
- [Phase 81]: StreakService owns milestone config reading (not SettingsService) to avoid cross-module dependency
- [Phase 81]: Used $primary (terracotta) for StreakRow background tint, $accent (charcoal) for text — matches brand palette
- [Phase 82]: Drizzle wraps MySQL errors in err.cause -- duplicate key detection must check cause.code/cause.sqlMessage
- [Phase 82]: Body area forced to null for soreness='ninguna' regardless of client input
- [Phase 82]: Check-in row placed between welcome header and GeneralContent (adapted from plan due to missing StreakRow/card-loop)
- [Phase 82]: Check-in feedback loop: advisory messages above subtitle with priority order energy > soreness > sleep (D-10)
- [Phase 83]: Polymorphic content blocks via single table with block_type enum and nullable type-specific columns
- [Phase 83]: Program enrollment tracks sessions_completed_this_week as counter with week_unlocked_at timestamp for session-gated weekly unlocks
- [Phase 83]: Per-route auth instead of onRequest hook for mixed ADMIN_ROLES/COACH_ROLES permissions within programs plugin
- [Phase 83]: hasActivePersonalizada migrated from subscription.isPersonalizada to hasActiveProgramEnrollment ref (per D-08)
- [Phase 83]: WeeklySummaryCard gated to program-enrolled members only (per D-15)
- [Phase 83]: Vertical QStepper wizard for multi-step program creation; payment confirmation checkbox as hard gate on enrollment per D-39; program analytics on AnaliticasPage per D-40
- [Phase 83]: Calendar-week gating: nextWeekStartDate = enrolledAt + (currentWeek \* 7 days), compared against current date for dual-condition advancement
- [Phase 83]: AURA program bonuses use independent try/catch blocks -- weekly and completion awards fail independently with graceful degradation
- [Phase 84]: Logger error() second arg must be LogData object not plain string; boot order: push-notifications after modules in quasar.config.js
- [Phase 84]: FcmMessaging interface + dynamic import for compile-time safety without firebase-admin dependency
- [Phase 84]: Queue-based notification delivery: all notifications flow through pending_notifications table with 15-min cron polling
- [Phase 84]: Inline JSON schemas in notification routes.ts for module self-containment; MemberSegment type cast for drizzle enum inArray queries
- [Phase 84]: Direct calculateSegment() call in batch cron bypasses 1-hour cooldown; program renewal warning in daily batch cron
- [Phase 84]: Logger error() uses LogData object as second arg per Phase 84 convention
- [Phase 84]: DRY_RUN=true in test file and CI env for FCM mocking; FIREBASE_SERVICE_ACCOUNT_BASE64 in .env.production for production FCM sends
- [Phase 86]: Reservas tab always visible for all users; online users see empty state instead of booking grid
- [Phase 86]: 302 (temporary) redirects for promo QR URLs since campaigns are time-limited
- [Phase 86]: QR codes encode eltemplo.org redirect URLs (not final destination) for future-proof redirect changes
- [Phase 86]: AssignPlan called with branchId from user's resolved branch (ONLINE) and paymentMethod='cash' since pricePaid=0 skips payment recording
- [Phase 86]: Manual migration SQL instead of drizzle-kit generate to avoid interactive prompts in non-interactive execution
- [Phase 86]: Used underscore prefix (\_promoApplied) for unused destructured response field to avoid lint warnings
- [Phase 86]: Promo routes registered inside existing subscriptionRoutes plugin, sharing the SUBSCRIPTION_ROLES auth guard hook
- [Phase 86]: promoPlans deletion placed in Layer 3 of cleanAllTestData before subscriptionPlans for FK ordering
- [Phase 89]: Ladder prescriber divides by LADDER_ROUNDS=5 for per-round reps (production: 25 edits, -15.1 avg delta)
- [Phase 89]: Pyramid gets dedicated prescriber with PYRAMID_VOLUME_FACTOR=2 (production: 10 edits, -28.5 avg delta)
- [Phase 89]: Multi-round format audit: all 16 prescribers checked, only Ladder+Pyramid needed fixing
- [Phase 90]: Manual migration SQL (0068) for avatar profiling schema — consistent with Phase 86 precedent to avoid interactive drizzle-kit prompts
- [Phase 90]: V2 onboarding service method alongside V1 for backward compatibility; old columns nullable, new columns nullable
- [Phase 90]: Server-side gender read from users table in /complete handler — never trust client-provided gender for avatar resolution (T-90-02)
- [Phase 90]: avatarType filter uses NOT EXISTS subquery for 'none' to catch both missing profiles and null avatar_type
- 100-04: Admin route-labels dictionary duplicated byte-for-byte from member-app copy; D-01 preserved (admin exercises + sessions lists unchanged)
- Phase 100-05: PDF pipeline consumes Spanish route labels via pre-resolved PdfLevelBlock.routeLabel field; customTitle flows through PdfBlockPage with byte-identical null fallback
- Phase 101-01: debts table migration renumbered from 0094 to 0096 because Phase 100 claimed 0094/0095
- Phase 101-01: one-active-debt-per-user invariant enforced at service layer (MySQL lacks partial unique indexes); idx_debts_user_active composite index backs the service lookup
- Phase 101-01: FK fk_debts_user_id has no ON DELETE/UPDATE — users are soft-deleted via users.deleted_at so no cascade needed
- Plan 102-03: EXISTS subquery for hasUsedTrial (no new index); reused isActiveSubquery pattern for leads filter.
- Plan 102-05: Trial counter placed in header q-card-section (NOT SubscriptionCard) so it renders for sub-less leads; `Tipo` filter label chosen to avoid clashing with existing `Estado` (Activo/Inactivo) label; filters.status default = null so axios serializer omits the key, matching level/segment/avatarType convention.
- Plan 103-01: Single atomic SQL migration (0100) adds users.status ENUM(freemium/prueba/activo/inactivo) DEFAULT NULL + users.staff_disabled, drops users.is_active and idx_users_is_active, swaps in idx_users_status; backfill is 6 sequential UPDATEs guarded by `WHERE status IS NULL` (idempotent). Hand-written SQL (not drizzle-kit generate) because the runner cannot produce backfill UPDATEs. CRITICAL: SQL comments must not contain inline `;` because run-migrations.ts splits on `;` BEFORE stripping `--` comments.
- Plan 103-03: Per-endpoint explicit status at /register (freemium) and /api/admin/trials (prueba). Folded the leftover trials-service.ts isActive: true into the same edit (Rule 3). Test file uses real clock — vi.useFakeTimers desyncs from MySQL CURDATE() in Plan 02 recomputeUserStatus.
- Plan 103-06: PATCH /api/admin/users/:id/status payload renamed isActive→disabled with additionalProperties:false rejecting legacy shape (T-103-09 mitigated end-to-end); UserService.toggleDisabled is an explicit-value setter (no server-side toggle) so concurrent admin clicks converge instead of fighting; createStaff insert path explicitly writes status:null (BLOCKER 1 fix per CONTEXT D-12); admin-app UsuariosPage UX wording preserved while underlying boolean flips from isActive to staffDisabled
- Plan 103-04: Members API contract migration — drop derived isActiveSubquery (3 sites in service.ts) and project users.status directly; createMember insert is single-owner (status='prueba' as const, BLOCKER 3); analytics countActiveMembers + SlotAttendancePanel hidden refs migrated; legacy ?status=leads/alumnos returns 400 (no shim); admin types/SlotAttendancePanel migrated in lockstep; AlumnosPage/AlumnoDetailPage explicitly deferred to Plan 05.
- Plan 103-07: New staff_disabled login gate at POST /login closes pre-existing security loophole — non-member roles with staff_disabled=true are now rejected with 401 Cuenta desactivada (was previously enforced only at the column level, never at runtime). staffDisabled is projected ONLY in /login SELECT (sole consumer); /me deliberately omits it to keep auth response surface minimal. Phase 103 R3 grep gate satisfied: only 2 doc-comment matches remain (analytics/users service.ts), no runtime users.isActive references.
- Plan 103-05: Shared useStatusBadge composable (named exports getColor/getLabel) reused by both AlumnosPage row chip and AlumnoDetailPage header chip; trial counter v-if uses status !== 'activo' to preserve original semantic (visible for freemium/prueba/inactivo, hidden for activo); no shim — single status param replaces dual isActive+leadsOnly logic at all 4 API call sites.
- Plan 105-01: financial_transactions enums declared inline via mysqlEnum (D-05); TS literals derived via $inferSelect downstream; circular schema imports between financial-transactions.ts and transaction-links.ts work via Drizzle thunks
- Plan 105-01: transaction_links.target_id has no DB-level FK; service layer enforces heterogeneous integrity by target_kind per SPEC §7. balances.amount is signed int (negatives allowed for saldo a favor per D-08)
- Plan 105-01: Migration 0106 ordering CREATE×3 then DROP×2 protects against partial-failure data loss; MySQL \_migrations table column is name not filename so verification SQL must use WHERE name=…
- Plan 105-02: Sign convention LOCKED — balances.amount > 0 = miembro debe; = 0 = saldado; < 0 = saldo a favor (D-08). Inflow REDUCES outstanding; outflow INCREASES; sign multiplier (+1/-1) handles create/void in one code path.
- Plan 105-02: Lazy seed from subscriptions.pricePaid is two-step (SELECT existing → INSERT-with-seed OR UPDATE delta) inside db.transaction, NOT a single ON DUPLICATE KEY UPDATE. The seed value depends on a per-target lookup which a single upsert cannot express.
- Plan 105-02: TXN-05 immutability enforced by TS surface — TransactionService deliberately exposes no update() method. Test K probes via cast: (txService as Record<string, unknown>).update is undefined.
- Plan 105-02: Tests seed subscriptions directly via Drizzle insert (not the /assign API) because /assign still calls paymentService.recordPayment against the dropped payments table — that path is repaired by Plan 03.
- Plan 105-03: Renew callsite (RenewSubscriptionInput has no branchId) resolves branchId via users.branchId lookup with fallback to 'Templo Online' virtual branch — throws if neither resolves; SPEC §1 NOT NULL invariant maintained
- Plan 105-03: All 4 transactionService.create callsites pass amount===allocatedAmount (preserves legacy full-payment assumption); transactionDate===effectiveDate (legacy paymentDate semantics)
- Plan 105-03: SubscriptionService takes transactionService?: TransactionService via 4th positional constructor arg; type-only import at consumer, concrete-class import at 3 DI sites (auth/routes, subscriptions/routes, auto-resume-pauses)
- Plan 105-04: D-01 canonical revenue filter (kind IN ('plan_charge','debt_settlement') AND direction='inflow' AND voided_at IS NULL) applied across 4 analytics methods + 4 reports query blocks; getRevenueByBranch dropped users join (branch_id is first-class on financial_transactions); paymentDate alias preserved (sourced from ft.transaction_date) so frontend ChargeReportRow consumers stay unchanged
- Plan 105-04: getChargeHistory queries (Drizzle count + raw SQL row fetch) join through transaction_links pivot (target_kind='subscription') because financial_transactions has no direct subscription_id; 4-table → 5-table chain preserves response semantics
- Plan 105-04: getRevenueByMethod tightened payment-method type guard from 'as' cast to literal-union check (T-105-17 defense-in-depth — kind/direction filter already excludes aura_credit/internal but the cast would silently misroute leakage)
- Plan 105-05: MemberListItem.debt field DELETED (not renamed) — Plan 07 admin frontend must drop AlumnosPage Deuda column + MemberFormDialog Deuda section. TotalDebtRow[] banner contract preserved with new 'outstanding balance' semantics from balances cache.
- Plan 105-05: PATCH /api/admin/members/:userId hardened with Fastify additionalProperties:false (NOT Zod .strict()) — module convention is Fastify schemas; legacy clients posting isDebtor/debtAmount/debtCurrency/debtNote/debt get HTTP 400 (T-105-18 mitigation).
- Plan 105-06: pure-deletion plan with regex-based grep gate; usePaymentsApi.ts admin composable deferred to Plan 07 because CajaPage.vue still consumes it; subscriptions/types.ts inline import('../payments/types').PaymentMethod replaced with top-level import from '../finance/types' (Rule 3 fix); 7 test files migrated from PaymentService DI / schema.payments queries / /api/admin/payments POST helpers to TransactionService + BalanceService DI / financialTransactions+transactionLinks queries / direct ft+tl inserts
- Plan 105-06: helpers.ts TABLES_TO_CLEAN had stale schema.payments + schema.debts entries that crashed cleanAllTestData with getTableName(undefined) after schema files deleted — both lines removed (Rule 3); test suite recovered from 21/58 file-pass to 58/58
- Plan 105-06: 1 reports.test.ts assertion negated from toBeDefined→toBeUndefined for voided-row visibility because Plan 04 D-01 canonical revenue filter (voided_at IS NULL) excludes voided rows from /charges by design; legacy test asserted contradictory behavior (Rule 1 — bug)
- Plan 105-07: AlumnosPage per-row Deuda column DELETED (not stubbed) — backend Plan 05 removed MemberListItem.debt; banner aggregate (totalDebtByCurrency) preserves admin prioritization signal at list level; per-member saldo detail returns in Phase 108 via dedicated /financial-history endpoint
- Plan 105-07: usePaymentsApi.ts NOT deleted — Option A selected over Option B (stub CajaPage). Phase 106 owns CajaPage migration to /api/admin/transactions + new useTransactionsApi composable; deleting now would force a stub-and-rewrite-twice pattern. Cost during gap: CajaPage shows 404 banner (admin-staging-only)
- Plan 106-01: PaginatedResult<T> relocated to shared/types.ts (finance is the second consumer); reports/types.ts re-exports for zero callsite churn
- Plan 106-01: Drizzle alias() pattern for recorder self-join in TransactionService.list — first non-raw-SQL recorder join in the codebase
- Plan 106-01: TransactionService.list pagination clamped server-side (max=200) as defense-in-depth (T-106-LISTSIZE) even though route layer also caps via Fastify schema
- Plan 106-01: Test fixture bug fixes — branch.code <= 20 chars (Rule 1); kind='refund' with empty links forbidden, used 'advance_payment' instead (Rule 1)
- Plan 106-02: country gate uses !request.scope.isOwner (request.scope.country always populated by attachCountryScope default 'AR'); plan-template's if (request.scope.country) check would have run cross-country guard for owners and broken S3/VS2 (Rule 1)
- Plan 106-02: V3/V4 retargeted from extra-property rejection (plan template) to wrong-type rejection (project reality) because Fastify default AJV STRIPS extra props silently — documented project-wide in current-program.test.ts:340 + trials.test.ts:1116; V3b pins the strip behavior (Rule 1)
- Owner-aware country resolution: owner without ?country sees ALL countries (no filter); owner with ?country=XX filters; non-owners locked to scope.country (T-106-02 mitigation per Phase 106-03)
- Plan 106-04: financialHistorySchema response uses additionalProperties:true on loose-passthrough objects (transaction, links, voidInfo) — Fastify fast-json-stringify strips unlisted fields by default, so Warning #6 idiom requires the explicit escape hatch (Rule 1 fix). Phase 109 audit can flip to strict by replacing with full property listings.
- Plan 106-04: GET /api/admin/members/:userId/financial-history mounted on members/routes.ts (D-09 sub-resource) with per-handler FINANCE_READ_ROLES privacy override placed BEFORE target lookup so coach denials don't disclose membership existence. Cross-country guard uses !request.scope.isOwner (NOT scope.country) per Plan 02 SUMMARY lesson.
- Plan 124-01: leverage modeled as nullable varchar(50), NOT a global enum (D-03/D-05); palanca is structured-but-optional. Contracción reuses the existing effort field (D-02). Gesto is a first-class catalog table exercise_subfamilies (D-01).
- Plan 124-01: canonical_exercise_id + route_pending added as schema only in 124; saneo data writes (canonical pointers + route-pending flags) deferred to Plan 02 TS script (detect/report before mutating, analog backfill-gender.ts).
- Plan 124-01: migration 0137 is pure additive DDL (zero row mutations) so historical FKs from session_prescriptions/program_content_blocks stay intact (D-07 soft-merge, no deletes); additive/idempotent/reversible.
- Plan 106-05: backward-compat aliases (PAYMENT_METHOD_OPTIONS as alias of PAYMENT_METHOD_FILTER_OPTIONS, LegacyPaymentMethod 3-key narrow type) avoid renaming churn across unrelated callsites; only CajaPage business logic changed. Phase 109 widens.
- Plan 106-05: kind='plan_charge' bind on listTransactions in CajaPage preserves legacy /payments cobros semantics during Phase 106 (D-14 closure scope); debt_settlement surfaces via Plan 04 financial-history. Phase 109 adds UI kind dropdown.
- Plan 106-05: Task 1 grep regex for owner-override was overly strict (Prettier formatted across multiple lines); used Plan 03 SUMMARY canonical evidence (grep -c 'request.scope.isOwner' routes.ts === 4) as verification gate. No Plan 03 file modifications — Wave 4 conflict-free invariant intact.
- Plan 109-01: revenueByKind extended FinanceSummary additively (D-11); refund=0 by design (W4 negative assertion in RBK3); placeholder zeros in Task 1 commit kept tsc clean before Task 2 wired real groupBy
- Plan 109-02: getOutstandingBalances service lives in ReportsService (not finance/transaction-service) — D-08 path is /api/admin/reports/outstanding-balances and reports module already mounts CAJA_ROLES + attachCountryScope; finance counterpart getOutstandingConcepts stays per-member because /financial-history is mounted under members/
- Plan 109-02: bucket math in JS (computeAgeInDaysOB / computeBucketOB), not SQL CASE — preserves Phase 108 future-date clamp at 0, portable across DB session timezones, ~150 timestamp diffs per request is negligible
- Plan 109-02: owner without ?country sees ALL countries (no filter); owner with ?country=AR|ES filters; non-owner locked to scope.country — mirrors GET /api/admin/finance/transactions/summary, NOT the simpler /access etc. pattern, because Deudas is the one report that surfaces multi-currency totals (D-06)
- Plan 109-02: bucketTotals schema typed as object with additionalProperties:true — needed because shape flips between flat BucketTotals (non-owner) and per-currency keyed map (owner); fast-json-stringify would otherwise strip the EUR/ARS keys
- Plan 109-03: Task 3 redirected from client-side xlsx to server-side exceljs (xlsx not installed in admin; Phase 64 P03 reports pattern is server-side; net result is simpler client + single-source-of-truth filter semantics)
- Plan 109-03: TransactionExportRow extends TransactionListItem with voidReason — minimal additive contract for 'Razon anulacion' column without leaking the field into the standard listing
- Plan 109-03: Conceptos column rendered as '<TARGET_KIND_LABEL_ES> #<targetId>' joined by ', ' (W5 stub — granular labels deferred until ops requests)
- Plan 109-04: Excel export redirected from client-side xlsx (not installed in admin) to backend endpoint /api/admin/reports/outstanding-balances/export — mirrors Plan 109-03 redirection precedent; net result is simpler client + single-source-of-truth filter semantics + integration tests against real MySQL
- Plan 109-04: DeudasReport encapsulates own load lifecycle on mount + filter/countryScope watches; ReportesPage.fetchTabData switch unchanged (no case 'deudas' needed) — keeps component self-contained and avoids two competing data flows when owner toggles country
- Plan 119-05: CODE-COMPLETE con verificación humana DIFERIDA. Tasks 1-2 commiteados (f3abcbb9 composable + 3-state ReservasPage; cc0a015a deep links + App Links/Universal Links). El checkpoint blocking Task 3 (3 estados + reserve flow + deep link + warm-brand sobre device/emulator) NO se ejecutó por decisión del usuario; los 6 ítems quedan persistidos en 119-05-HUMAN-UAT.md (status: partial, todos [pending], blocked_by: physical-device). Dos TODOs del deployer gatean producción (no el UAT): SHA-256 fingerprints reales en assetlinks.json desde Play App Signing, y servir /.well-known/\* como JSON estático excluido del SPA catch-all de app.eltemplo.org.
- Plan 109-04: bucketTotals shape discriminator at runtime (Object.prototype.hasOwnProperty.call(bt, '0-30')) — gracefully handles flat BucketTotals (non-owner) vs per-currency keyed map (owner) without runtime assertion
- Plan 109-05: cross-aggregation sanity test asserts Σ revenueByMethod = Σ revenueByKind = Σ revenueByBranch = monthlyRevenue over a single mixed-scenario seed (10 rows incl. 1 voided + 1 outflow refund); 5/5 cases PASS; W7 symmetric branch invariant covered explicitly
- Plan 109-05: VERIFICATION.md scaffold mirrors Phase 108 pattern + adds prominent "Smoke Pendiente — Handoff al Operador" section at top because skip_checkpoints mode (Phase 107/108 precedent); 6 smoke escenarios PENDING, 22/22 D-XX decisions covered, "NO viernes" appears 4× in sign-off pre-flight
- Plan 109-05: country=AR query param applied to all 5 sanity test requests to bypass owner-no-country wide-open behavior (Phase 106 P03 invariant) and keep tests deterministic against eltemplo_test leftover rows
- Plan 110-02: Migration 0107 applied to local DB; users.country populated for admin (1 row, AR), 7 user_branches rows inserted for coaches; owner stays NULL per D-12.
- Plan 110-06: Wired requireBranchAccess into 25 admin endpoints across 6 modules; added module-level attachCountryScope to scheduling-admin and attendance-admin (Rule 3); harmonized 2 inline 403 bodies to BRANCH_OUT_OF_SCOPE shape; documented 4 audit-table drifts surfaced by Warning 7 grep pre-step.
- Plan 111-01: normalizePhone helper landed at backend (modules/shared/phone.ts) and admin frontend (utils/phone.ts) as 1:1 mirror with sync-warning JSDoc — D-25 path B (no shared workspace package) chosen for minimum effort. createMember + updateMember now apply .trim() to firstName/lastName before db.insert/update (D-26) closing the Soledad Mailland trailing-space bug class.
- Plan 111-02: Hand-wrote 0108_create_audit_log.sql instead of pnpm db:generate — drizzle-kit meta/\_journal.json snapshot is at 0059 while DB is at 0107 so generate either prompts interactively or pollutes the file (Phase 86 / 90 / 103-01 precedent). Drizzle schema in src/db/schema/audit-log.ts is canonical.
- Plan 111-02: auditLog.write helper takes REQUIRED tx handle (not optional). Helper does NOT open its own transaction — atomicity owned by caller. Test 2 verifies rollback removes the row. T-111-09 mitigation is structural, not runtime.
- Plan 111-02: TxHandle imported from finance/balance-service (canonical export site) rather than redefined locally. AuditTargetKind union includes 'member' to support REQ-8 reconciliation entries.
- Phase 111-03: cancelSubscription signature gained required actorId param; 3 internal callers updated to source from request.user.userId (T-111-14/15 mitigation)
- Phase 111-03: Structured 4xx body emitted by route layer via JSON.parse on BadRequestError.message — preserves global handleServiceError pipeline; cancelErrorSchema whitelists code+details for Fastify response serializer
- Plan 120-02: subscriptions.price_regular_snapshot (nullable int, migration 0136, ONLY migration in Phase 120 per D-06) captures the plan's priceRegular at the 4 real-charge insert sites (assign/change-now/change-after/renew). The 5th bulkMigratePlan insert (pricePaid:0, no plan_charge) is deliberately left NULL — grep count == 4 by design. No backfill (list price was never stored); historical discount falls back to current priceRegular with disclaimer in Plan 04.
- Plan 111-04: phone match runs at SQL level via RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) — no schema change, no index. Reused for both /admin/members/check-duplicates and /auth/register phone block (single source of normalization in shared/phone.ts).

Plan 111-04: helpers.ts registerUser default phone now per-call unique via timestamp-tail + in-process counter (Rule 3 fix unblocking dozens of legacy callers under the new uniqueness check). Mirrors existing dni randomization pattern.
Plan 111-04: 400 MISSING_QUERY enforced at route handler (not schema required:[]) so the structured 4xx body carries explicit code per Phase 110 D-05.
Plan 111-04: dedup by user id with matchedField='dni' preferred when both criteria match the same row — admin sees the stronger identifier first.

- Plan 113-01: half-open interval overlap (`a.start < b.end AND a.end > b.start`) on HH:MM strings via drizzle `lt`/`gt` — strict inequality makes back-to-back boundaries non-overlapping; `is_active=1` filter so historic deactivated rows (Constitución 10am case) don't block reuse.
- Plan 113-01: ConflictError payload extension idiom — TS intersection cast (`ConflictError & { affectedSchedules?: AffectedScheduleRef[] }`) attached at service layer, route handler bypasses shared `handleServiceError` for one specific 409 shape; Fastify `fast-json-stringify` requires explicit declaration of `affectedSchedules` in `updateActivitySchema.response[409]` or it would silently strip the rich payload.
- Plan 113-01: activity name uniqueness on rename uses `ne(id)` to exclude self — no-op renames (same name) are allowed and never query, idempotent.
- Plan 113-02: ActivitiesDialog.vue refactored from `<q-dialog>` floating modal into an embedded panel (props `:active` instead of `:show`, no `update:show` emit) — file kept by name, parent imports under alias `ActivitiesPanel` to minimize git history churn while honoring the tabbed layout (D-18). HorariosPage gained q-tabs (Horarios | Actividades), a `Crear horario` header button gated by `v-if="activeTab === 'horarios'"` and `:disable="!selectedBranchId"`, and an `onCascadeError` toast that lists up to 5 affected schedules using `DAY_SHORT_LABELS[dow] HH:MM-HH:MM (branchName)` plus "y N más" overflow. SlotDetailDialog.vue intentionally untouched (D-19).
- Plan 113-02: Slot creation 4xx errors render INLINE on the form (text-negative caption) instead of as a toast — UX rationale is the admin keeps the form open and corrects the conflicting time/branch immediately. Cascade-error from activity deactivation DOES use a toast (no form to preserve).
- Plan 113-02: Tasks 2 and 3 committed together (Rule 3) because Task 3 changed ActivitiesDialog's props/emit contract spanning HorariosPage; splitting would have left an intermediate state failing tsc. 3 pre-existing tsc errors in `pdf/session-pdf-builder.ts` (pdfmake @types drift) deferred to a future housekeeping plan; verified by stash that they were not introduced by this plan.
- Plan 119-01: campaign schema foundation — 4 reusable tables (campaigns/campaign_sends/campaign_events/campaign_unsubscribes) mirroring user-status-history.ts; UNIQUE(campaign_id,user_id) for audience idempotency (D-12), UNIQUE(email) for unsubscribe suppression (D-15); branches.address + bookings.source nullable columns. Migration backfill matches sedes by name LIKE (not code) because branch codes drift across environments — each UPDATE is an idempotent no-op where the sede is absent. 8 Wave 0 RED scaffolds use it.todo (compile-valid, no DB execution) honoring the project rule to not run the full suite locally.

- Plan 111-06: data-fix migrations use defensive WHERE-on-BEFORE-state guards + DELETE by id + INSERT … SELECT … WHERE NOT EXISTS — re-runnable as 0-row no-op (verified by Tests 2 and 3)
- Plan 111-06: refactored run-migrations.ts to export splitSqlStatements + guarded auto-run with require.main check, so integration tests share the production parser without triggering a real migration on import
- Plan 111-06: balance for sub 6382 zeroed explicitly in step 4 (D-19 — eliminates the inseguro lazy applyDelta path)
- Plan 112-01: deferred-NOT-NULL pattern for source enum — column added NULL-tolerant first, backfilled in 3 priority steps (plan_linked → plan_bundle → admin_addon fallback), then ALTER … MODIFY tightens to NOT NULL in Step 5 (fails fast if any row remained NULL, surfaces partial-backfill bugs as hard failures)
- Plan 112-01: WHERE source IS NULL guards on every backfill UPDATE so a manual replay outside the runner is a 0-row no-op (defense in depth on top of the \_migrations tracker)
- Plan 112-01: Drizzle schema source enum has no .default(...) — callers must pass explicit source value; Plan 02 EnrollmentService owns that responsibility (the 6 existing inserts in subscriptions/service.ts wired with explicit source + subscription_id directly under Rule 3 to compile, will be replaced by EnrollmentService.enrollFromPlan in Plan 02)
- Plan 112-02: Plan-flag preconditions wrap requireEnrollmentService() calls — chokepoint skipped for plans without linkedProgramId/grantsAllPrograms; preserves test instantiations omitting EnrollmentService and avoids spurious DI errors on flows with no enrollment work
- Plan 112-02: tearDownForSubscription dual-lookup strategy — (a) rows with subscription_id = subId AND (b) user-scoped rows with subscription_id IS NULL matching the cancelled sub's plan binding; preserves R4 protection regression test for direct-DB-inserted bundle rows AND backward-compat for ambiguous Plan-01-backfill leftovers
- Plan 112-02: Renewal + activateScheduledSub call sites preserve legacy 'skip if active enrollment exists' guard around enrollFromPlan — enrollFromPlan's linked-program branch is unconditionally cancel-then-insert (assignPlan/changePlan need it), so the guard prevents resetting currentWeek=1 on a still-running mid-program enrollment
- Plan 112-03: tearDownForSubscription gained optional excludeSources param so admin_addon survives the changePlanNow teardown step and can be relocated by transferAddons inside the new-sub tx; default empty preserves D-18 cancel/expire teardown across all sources
- Plan 112-03: pause/resume cascades use optional-chaining (this.enrollmentService?.) instead of requireEnrollmentService — preserves legacy direct-instantiation tests in lifecycle.test.ts; mirrors Plan 02 plan-flag precondition pattern for routes that don't wire EnrollmentService
- Plan 112-03: changePlanNow keeps tearDownForSubscription OUTSIDE the new-sub tx (Plan 02 placement) — moving it inside causes the new sub to act as a protector for the OLD plan's enrollments via tearDown's protection-program logic, which broke the bundle changePlanNow test
- Plan 112-03: activateScheduledSub places transferAddons unconditionally at top of method (right after status flip), BEFORE the conditional predecessor tearDown — admin_addons relocate ahead of any cancel; idempotent via no-op when 0 rows match (D-20)
- Plan 112-04: D-13 LOCKED — extend transaction_links.target_kind with 'enrollment' (NOT extend kind enum); kind='plan_charge' reused so Phase 105-04 D-01 canonical revenue filter stays unchanged; granular trazability lives at the link layer
- Plan 112-04: D-22 LOCKED — RBAC = FINANCE_WRITE_ROLES (owner|admin|gestion|recepcion); recepcion already creates kind='plan_charge' transactions via assignPlan today (Phase 107)
- Plan 112-04: BalanceService.applyDelta gained early-skip for target_kind='enrollment' (Rule 1) — admin add-on charges are one-shot, no running obligation; mirrors existing 'transaction' precedent in the same method
- Plan 112-04: EnrollmentService constructor takes optional 3rd-arg transactionService — only the new admin route wires it; Plan 02's 11 DI sites unchanged because they never call enrollAddon
- Plan 112-04: cancel audit reuses action='plan_assigned' with payload.cancelledByAdmin=true rather than extending the AuditAction enum — minimal-surface, defer enum widening
- Phase 114-03: SET clause ordering matters in recomputeUserStatus — lead_status/lead_notes BEFORE converted_at to respect MySQL's left-to-right SET evaluation semantics
- Plan 114-04: branch-scope via canAccessBranch inline (lead branchId on users row, not request payload)
- [Phase ?]: Plan 116-01: refresh tokens persist sha256 hex only; plaintext never stored (T-116-01)
- [Phase ?]: Plan 116-01: rotate() returns { newToken, userId } chaining old->new via replaced_by_id self-FK; reuse of a revoked token revokes the whole family (T-116-02)
- [Phase ?]: Plan 116-01: 30m access expiry exposed via fastify.accessTokenExpiresIn decorator + JWT_ACCESS_EXPIRES_IN env; legacy token sign stays 7d, fastify.authenticate unchanged (Req 8)
- [Phase ?]: Plan 116-02: migracion 0125 aplicada a DB local (eltemplo); checkpoint humano reservado para staging/prod
- [Phase ?]: Plan 116-02: /auth/refresh y /auth/logout publicos body-based (D-04); rotate() devuelve userId, la ruta consulta users para firmar el access JWT
- [Phase ?]: Plan 116-02: login/register devuelven { token, accessToken, refreshToken } (token legacy 7d intacto, Req 7); change-password revoca todos + emite par nuevo (D-01); delete-account revoca explicito (D-05)
- [Phase ?]: Plan 116-03: refresh lock en boot/axios.ts (refreshPromise module-scope); createAuthErrorHandler exportado para testeo (D-02)
- [Phase ?]: Plan 116-03: useTokenStorage dual-key con lectura legacy authToken como access + cleanup diferido en setTokens; aliases getToken/removeToken backwards-compat (D-03)
- [Phase ?]: Plan 116-03: authStore login/register persisten via setTokens (BLOCKER); boot refresh silencioso si access expiro antes de /auth/me, legacy va directo (Req 11)
- [Phase ?]: Plan 116-04: authStore admin login persiste ambos tokens (BLOCKER), logout borra las 3 keys, checkAuth lee adminAccessToken con fallback
- [Phase ?]: Plan 116-04: interceptor admin con lock (refreshPromise module-scope) + dual-key localStorage (adminAccessToken/adminRefreshToken) + cleanup diferido del adminToken legacy (D-02/D-03)
- [Phase ?]: Plan 116-04: test del lock admin escrito pero NO ejecutado — vitest ausente en admin; checkpoint blocking-human, no se instalo ninguna dependencia
- [Phase ?]: Plan 116-05: suite de integración refresh/rotación/reuse/revocación/dual-access verde contra eltemplo_test (Req 14); refresh_tokens en TABLES_TO_CLEAN
- [Phase ?]: Plan 116-05: el test DB auto-provisiona migración 0125 desde src/db/migrations en cada worker fresco (setup.ts); fixtures via registerUser por el phone-block de Phase 111
- Plan 117-03: AttendanceMetricsService nuevo (D-09, NO toca el monolito service.ts) — uniqueMembers COUNT(DISTINCT member_id) por ventana half-open (D-08) + checkInAdoptionByBranch vía LEFT JOIN attendance ON (member+schedule+date) porque attendance no tiene booking_id FK; ratio 0..1 (warning <50% es frontend, Plan 05); applyScope reutilizado sobre attendance.branchId / schedules.branchId
- Plan 117-03: el módulo analytics está gateado a ADMIN_ROLES=[admin,owner] — coach/recepción reciben 403 en el onRequest hook antes del scope de sede, así que el test de no-fuga T-117-01 usa un admin AR denegado (403, cross-country Rule 3) en una sede ES, no un coach
- Plan 117-04: EngagementService nuevo (D-09/D-12) reutiliza segmentation — countActiveBySegment lee member_profiles.segment vía LEFT JOIN + COALESCE(segment,'sinSegmento') + activeMemberExists (NUNCA users.status); bucket sinSegmento para activos sin segment calculado; getEngagementNominalList (en_riesgo/ghost activos) usa subquery correlacionada para planName (sin fan-out); applyScope sobre users.branchId; GET /engagement devuelve { counts, nominalList } con phone gated por ADMIN_ROLES + scope (T-117-01/T-117-06)
- [Phase ?]: 117-05: attentionList completo (overdue buckets + daysOverdue real + yaPago + segment), renewalRate 7/14/30, habló-con-coach diferido (D-14/15/16/17)
- Plan 117-06: frontend admin completo (D-11..D-17): AsistenciaTab (únicos 7/14/30 + segmentos + worklist en_riesgo/ghost con WhatsApp + warning ratio <50%), MiembrosTab (vencidos buckets + daysOverdue real + renewalRate + flag ya-pagó + priorización por segmento), FinanzasTab (revenue ARS/EUR separado). Checkpoint visual APROBADO. Follow-ups misma fase: tab Asistencia MOVIDA de AnaliticasPage a ReportesPage para habilitar rol gestion + nuevo ANALYTICS_OPERATIONAL_ROLES (gestion+admin+owner) en el onRequest hook con guard per-route requireAdminAnalytics en los 3 endpoints admin-only (/, /members, /financial) + test de RBAC (gestion 200 operacionales / 403 admin-only); ocultar bucket "Sin segmento" + tooltips de segmento; rename display-only Digital Warrior→Digital, Ghost→Fantasma en SEGMENT_LABELS (claves DB sin cambios). Sin dependencias nuevas (T-117-SC). Phase 117 ejecutada 6/6.
- [Phase ?]: Plan 118-01: hooks de user_status_history en members/service.ts (3 sitios 'prueba', from=null en altas, read-before/write-after en convertFreemiumToTrial) y members/routes.ts (2 sitios admin 'inactivo'), todos con source='admin' y dedupe from==to dentro de la tx del UPDATE; recomputeUserStatus intacto (source='recompute'). Test real-MySQL 6/6. Donde el guard de TS prueba que el status siempre cambia se omite el branch de dedupe (TS2367).
- [Phase ?]: Plan 118-02: RetentionService nuevo (D-09, no toca analytics/service.ts); CONSECUTIVE_CYCLE_GAP_DAYS=30 (D-04); gap >30d corta racha sin reiniciar cohorte (D-05); cohorte=mes de primera sub valida + distribucion de ciclos sobre activeMemberExists (D-06); GET /retention admin-only requireAdminAnalytics, gestion 403 (D-11); ventanas invalidas contadas en invalidWindowSubs y salteadas (T-118-05); test real-MySQL 14/14
- [Phase 118]: Plan 118-05: D-09 borrado del display las 2 cards de engagement por segmento (AsistenciaTab) + fetch/prop en ReportesPage; backend, EngagementService, engagement.test.ts, getEngagement del composable y modulo segmentation INTACTOS
- [Phase 118]: Plan 118-03: AdvancedFinanceService nuevo (D-09, no toca analytics/service.ts); caja replica el filtro canonico de getRevenueTrend (kind plan_charge/debt_settlement, inflow, voided_at NULL) por moneda; devengado prorratea pricePaid sobre ventana efectiva [start, MIN(end, cancelledAt)] porque cancelSubscription NO acorta end_date (D-07); ARPU = devengado/mes / activeMemberExists (NUNCA users.status) con guard div-by-zero -> ARPU 0 (D-08); ARS/EUR jamas sumadas; /advanced-finance ADMIN_ROLES-only requireAdminAnalytics, gestion 403 (D-11); ventanas invalidas (null/0/end<start) excluidas + excludedInvalidWindow (T-118-08); test real-MySQL 14/14 (D-12)
- [Phase ?]: Plan 118-04: FunnelService nuevo (D-09, monolito intacto); cohorte=mes de users.created_at (D-03); activo histórico aproximado con MIN(subscriptions.created_at) (D-01); medianas por etapa null-safe; /funnel admin-only (D-11)
- [Phase 119]: Plan 119-02: instalado mjml@5.2.2 (D-23, única dep aprobada); mjml v5 es async → trialCampaignHtml devuelve Promise<string>; añadido src/types/mjml.d.ts (v5 sin types); EmailService.sendCampaignBatch con idempotencyKey + degradación silenciosa (D-12); CAMPAIGN_EMAIL_FROM como placeholder TBD (Plan 07, D-17); template MJML bulletproof con VML roundrect, paleta cálida (sin azul), imágenes self-hosted en eltemplo.org/email (D-27)
- [Phase ?]: Plan 119-03: standalone reserveTrialSelfService promotes freemium→prueba + history + booking in ONE tx; one-per-lifetime + cancelled-row reactivation inline (D-01/D-26).
- [Phase ?]: Plan 119-03: booking window parameterized via assertDateWithinWindow(windowDays) — reserve=+2d, validateTrialBookingDate=+30d (D-05); trial path skips the subscription check.
- [Phase ?]: Plan 119-03: BookingService injected into TrialService as optional 3rd ctor arg; reserveTrialSchema additionalProperties:false rejects forged token — server-side state is sole authorization (D-21).
- [Phase ?]: Plan 119-04: HMAC campaign token identifies sendId only, never authorizes (D-21); exp now+30d epoch seconds (D-04).
- [Phase ?]: Plan 119-04: /track/click derives its 302 destination via CampaignService.trialDeepLink against a fixed allowlisted host (app.eltemplo.org, D-25) with a fail-closed host assertion — never echoes raw query input (anti open-redirect).
- [Phase ?]: Plan 119-04: send() enrolls idempotently via ON DUPLICATE KEY on UNIQUE(campaign_id,user_id), chunks ≤100 to EmailService.sendCampaignBatch with idempotencyKey, degrades without RESEND_API_KEY (no new Resend in module, Pitfall 3).
- [Phase ?]: Plan 119-04: campaign funnel 'convirtió' = user_status_history toStatus='activo' after sent_at, aligned with funnel-service.ts (A6); attendance/conversion join on userId within the sent_at + self_service window.
- [Phase 119]: Plan 119-06: CODE-COMPLETE con verificación humana DIFERIDA por decisión del usuario (2026-06-02). Tasks 1-2 commiteados (812f9c82 useCampaignsApi + CampaignFunnel; 2d718bcc CampaniasPage + route + nav + create dialog + send confirmation). El checkpoint blocking Task 3 (nav por rol, sección standalone /campanias, crear borrador, filas de lista, funnel 6 etapas + caveat Apple-Mail-Privacy, confirmación de envío con conteo de destinatarios, warm-brand sin azul) NO se ejecutó ni se auto-aprobó; los 7 ítems quedan persistidos en 119-06-HUMAN-UAT.md (status: partial, todos [pending], blocked_by: admin-staging-build). Correr contra admin-staging antes del envío en vivo de la campaña (Plan 07). Fase avanza a plan 7/7.
- [Phase 119]: Plan 119-07: HUMAN-GATE-PENDING (2026-06-02). Plan no-autónomo: sólo Task 1 era automatizable y quedó commiteado (2a9dcbc4 — finaliza .env.example del sender de campañas: RESEND_API_KEY prod-required + degradación silenciosa, CAMPAIGN_EMAIL_FROM con sender send.eltemplo.org + pasos humanos de verificación de dominio Resend/DNS SPF/DKIM/Envelope-From/MX que conviven con Google Workspace, D-17). Tasks 2-4 son gates humanos bloqueantes que el usuario ejecuta externamente (NO auto-aprobados, NO se disparó ningún envío real, NO se pushea): (A) verificar dominio Resend, (B) setear secrets prod, (C) copy + imágenes logo/hero + números WhatsApp, (D) arreglar serving de .well-known, (E) crear campaña + preview cross-client + "Enviar campaña" irreversible (D-11). Verificación .well-known en app.eltemplo.org: ambos paths devuelven el index.html del SPA (HTTP 200 pero content-type text/html), NO el JSON — los deep-link files de Plan 05 NO se sirven correctamente todavía → follow-up dependiente de deploy (sin deploy no solicitado, MEMORY). Checklist humano completo A-E en 119-07-SUMMARY.md.
- [Phase ?]: 120-01: deriveDurationTier derives tier from durationDays (named constants 1/31), not planTier enum — rename-robust, no migration (D-01/D-02)
- [Phase ?]: 120-01: metricShape { nominal, percentage, n } envelope + verbatim median; div-by-zero guard returns 0/null, never NaN (FUND-02)
- [Phase 120]: Plan 120-04: Ticket value + discount numerator from subscriptions.price_paid, NOT financial_transactions.amount (cash received can be partial → would misreport partials as discounts); FT is universe/period filter ONLY (kind='plan_charge' only, half-open [from,to), currency-isolated)
- [Phase 120]: Plan 120-04: excludedNoLink (mandatory) = in-period plan_charge universe minus matched-subscription count per currency; INNER join on target_kind='subscription' excludes enrollment-only charges, surfaced not dropped
- [Phase 120]: Plan 120-04: Cohort split listPrice (price_paid==listBase AND no override) vs discounted (below base OR override); listBase = priceRegularSnapshot ?? plan.priceRegular, snapshot-null counted in historicalFallbackCount; $0 charges in neither cohort
- [Phase ?]: Phase 121 Plan 01: extracted shared expiry-cohort engine (expiry-cohort.ts) — churn + renovación consume one cohort definition (RENOV-01 DRY)
- [Phase ?]: Phase 121: CHURN_COMPARISON_WINDOWS=[5,10,15], RENOVATION_WINDOW_DEFAULT_DAYS=15 (D-07)
- [Phase ?]: Churn person-based via JS folding over per-person cohort rows; identical maturity+retention gating across official/multi-N/series/breakdown paths
- [Phase ?]: Legacy churn/retention metrics annotated @deprecated (D-09); physical removal deferred to admin-UI phase
- [Phase ?]: Renovación = matured AND retained over the SAME per-person cohort churn uses; renewal.n equals churn's denominator (RENOV-01), asserted in renewal.test.ts
- [Phase ?]: enGracia exposed as the número vivo (RENOV-03/D-07); renov%+churn% reconcile only over the matured cohort, grace residual surfaced not folded
- [Phase ?]: getRenewalRate annotated @deprecated Phase 121 D-09 pointing to GET /renewal; behavior + callers unchanged, removal deferred to admin-UI phase
- [Phase ?]: Plan 122-01: KM median = first event time S(t)<=0.5; ties collapse to one step; censored customers stay in at-risk denominator (D-122-05)
- [Phase ?]: Plan 122-01: LtvMonetary keeps ARS/EUR as separate LtvCurrencyBlock (never summed, D-122-09); projected vs observed LTV both real-payment based (D-122-07)
- [Phase ?]: Plan 122-03: ltv.test.ts asserts headline derives from churn.window.churn.percentage for identical filters (both services instantiated); cohort n includes censored lives (=== churn n, D-122-05); observed monetary = exact real-payment sum seeded below list price (D-122-08); ARS/EUR never summed (D-122-09); gestion 403 / admin 200; voidedAt marker from MySQL NOW() keeps grep 'new Date()' literal at 0 for TZ-flake safety.
- [Phase ?]: 123-01: Frequency bands as named constants BAJO_MAX=1.5/MEDIO_MAX=2.5 visits/week; membership age on users.createdAt clamped [1,4] weeks (D-123-03/04)
- [Phase ?]: 123-01: getFrequency scoped; coolingOrInactiveUserIds scope-unaware (global nightly batch); checkInAdoption reused from AttendanceMetricsService (D-123-06)
- [Phase ?]: TrialFunnelService (123-02): asistió desde bookings.status (no attendance, D-123-07); compró = primera sub paga en [sesión, sesión+window) vía DATE_ADD; leads nuevos vía NOT EXISTS sub paga previa; subqueries correlacionadas con prefijo explícito schema.bookings.\* (lección 121/122)
- [Phase ?]: Plan 123-03: Frequency golden-case override forces en_riesgo for active members with 0 visits in tuneable system_settings window (default 28d); fed into existing 03:00 batch via single batched query, no new cron, login path unchanged (D-123-01/02)
- [Phase ?]: 124-02: saneo en script TS (no SQL) reporta conteos antes de mutar; soft-merge a canonical MIN(id) sin deletes; route_pending por route='' (D-06/D-07/D-08)
- [Phase ?]: 125-01: heuristic bootstrap (no LLM/API) writes pending proposals to exercise_dimension_proposals; UNIQUE(exercise_id) + INSERT...WHERE NOT EXISTS idempotent; route guess only for route_pending; never writes truth columns (TREE-02)
- [Phase ?]: 125-02: accept es transaccional (resolve-or-create subfamilia + truth columns + status flip atómico); reject solo status; nunca contracción ni delete
- [Phase ?]: 125-02: TREE-03 (API revisión de profes) completo — /admin/exercises/proposals\* bajo hook TRAINING_ROLES; tests CI deferidos
- [Phase ?]: 125-03: TREE-03 frontend (ProposalReviewPage + useProposalsApi) consumiendo /admin/exercises/proposals\*; tabla agrupada por ruta con inline-edit + accept/reject + aceptar-grupo; nav y ruta /proposals (coach/owner)
- [Phase ?]: Plan 126-01: exercise_progressions edge table — source enum (auto|manual) partitions regenerable auto backbone from preserved manual overrides (D-03); both endpoint FKs ON DELETE CASCADE (T-126-01); edge UNIQUE backs Plan 02 dedupe; hand-written migration 0139.
- [Phase ?]: Plan 126-02: graph constructor regenerates only source='auto' edges (DELETE WHERE source='auto' + bulk INSERT in a transaction), never touching manual profe overrides (D-03)
- [Phase ?]: Plan 126-02: backbone partitioned by composite subfamilyId|effort so effort is never crossed (D-04); chains ordered by dl with stable id tiebreak (D-05); strictly consecutive, no cross-edges (D-02)
- [Phase ?]: 127-01: reached proxy = (dl <= level ceiling) OR (exerciseId in completed sessions via session_prescriptions); branch b active, replaceable by 131 dominado registry
- [Phase ?]: 127-01: tree grouping by exercises.pattern collapsed to 5 categories (Traccion/Empuje/Piernas/Core/Movilidad); KL/CARDIO/PLYO->Piernas, FLOW->Movilidad, empty->Movilidad fallback with warn log
- [Phase ?]: 127-01: GET /api/tree-progress/me member-scoped to request.user.userId; node set = 126 DAG scope predicate; all 5 categories always render
- [Phase ?]: 127-02: Mi Árbol member view (/mi-arbol) renders GET /tree-progress/me verbatim — render-only, server % (D-05); local gate = lint+quasar build (no vue-tsc in app); human-verify DEFERRED to HUMAN-UAT
- [Phase 129]: 129-01 (KAIROS-01): kairos added FIRST to users.level enum (order kairos,alfa,delta,sigma,omega,spartan), DEFAULT stays alfa (default change = phase 130); migration 0140 byte-identical to TS schema (enum-drift lesson 125/126), no `;` in SQL comments
- [Phase 129]: 129-01: kairos->levelGroup alfa_delta via explicit switch case (D-02), no new LevelGroup; kairos reuses Alfa difficulty cap (3) + Alfa glyph (α) since it inherits Alfa content (D-03)
- [Phase 129]: 129-01: introduced `ContentLevel = Exclude<ExerciseLevel,'kairos'>` + `toContentLevel()` (kairos->alfa) to separate member levels from the kairos-less exercises.level enum; encodes the D-03 inheritance once for Plan 02. completed_sessions.session_level widened in lock-step (presencial check-in snapshots users.level)
- [Phase 129]: 129-01: local gates = API tsc + app/admin lint+build (vue-tsc absent); selector/preview UI NOT touched (deferred to phase 130). Executed on staging, NOT pushed
- [Phase 129]: 129-02 (KAIROS-02/03): kairos generation gated behind isKairos(ctx.memberLevel) at 4 minimal pipeline points (stage-3 budget 2/block, stage-5 + INITIUM linear format Singlet/For Quality, stage-6 alfa-only dificultadLineal=1, INITIUM size 2); all branches pure-additive, non-kairos paths byte-identical (D-07). New queryFormatByName() in format-fallback.ts.
- [Phase 129]: 129-02 Task 2 = Option B (orchestrator decision): full SPOM-seeded end-to-end generation is NOT CI-runnable here (SPOM CSVs git-ignored under .docs/, seedSPOM() mis-pathed), so the gate is proven at the unit level (mock DB + fallback modules, real gated functions) mirroring rom-generator.test.ts. test/unit/kairos-gate.test.ts covers isKairos + stage-3/5/6 + INITIUM + D-07 regression. tsc green. Executed on staging, NOT pushed — push to staging for CI to run the suite.
- [Phase 130]: 130-03 (KAIROS-07 admin half, D-04): Kairos added FIRST to every admin level option array (MemberFormDialog levelOptions, AlumnosPage levelFilterOptions) matching constants/levels.ts LEVEL_ORDER; both MemberFormDialog form defaults flipped alfa→kairos (D-01). Display maps on AlumnosPage + AlumnoDetailPage gained kairos → glyph 'α' (reuses Alfa's, member-app parity), name 'Kairos', warm color amber-6 (lighter than alfa's amber-8, entry tier; no blue, no hex). No markup change — q-select dropdown holds 6 entries natively. Local gate = admin lint (0 errors) + quasar build (succeeded, vue-tsc clean). human-verify checkpoint DEFERRED (overnight); visual UAT pending. staging, not pushed.
- [Phase ?]: 131-02: coach dominado/bajado view in a separate /api/admin/exercise-adjustments plugin (TRAINING_ROLES, 403 for members); member POST untouched
- [Phase ?]: 131-02: tree-% reached AUGMENTED with latest-dominado per node (latest-per-node wins); level/SPOM untouched (D-06)
- [Phase 131]: 131-03 (CAPSTONE v5.1): in-session adjustment is a member-facing surface on BlockProgressionView (detail row, not ExerciseCard). useExerciseAdjustment composable returns {neighbor,message} from POST /exercise-adjustments; PARENT (DayPlayer) owns the swap — mutates the SOURCE session.blocks[*].exercises[i] (playableBlocks computed re-derives), replacing ONLY exerciseId/exerciseName/contraction + clearing videoUrl (endpoint serves none, refetched next load), preserving reps/seconds/format/dose/sortOrder/rest (D-03). isSubmitting guard + :disable = one-tap-one-step. neighbor null → q.notify message, no change. Never touches level/SPOM (D-06). Local gate = app lint (0 errors) + vue-tsc clean on the 3 files (no pnpm typecheck script). human-verify visual UAT DEFERRED (overnight). staging, not pushed.
- [Phase ?]: [Phase 132]: planId threaded via shared subscriptionPlanFilter() in expiry-cohort.ts (DRY across churn/renewal/ltv); ticket excludedNoLink suppressed under planId
- [Phase ?]: [Phase 132]: TrialTurno literal moved to types.ts (no circular import); trial-funnel-service re-exports; new-lead exclusion stays planId-unrestricted
- [Phase ?]: [Phase 132]: frequency coolingDown[] enriched with name+phone reusing the existing users join (D-12, export-ready in one call)
- [Phase ?]: [Phase 132]: frequency turno filter applied in SQL (join schedules + hour range) not in-memory, since frequency aggregates visit counts in the DB
- [Phase 142]: 142-03 (FINAL plan, MIG-01 UI — phase 142 COMPLETE 3/3): mini "Configuración de Caja" admin page = ONE numeric field (umbral de pendientes, días, integer min 1, no upper bound in UI). useFinanceConfigApi mirrors useFinanceLoadApi (loading/saving/error + cleanup(), NO onUnmounted inside, no any, createLogger). FULL path /admin/finance/config/overdue-threshold for GET+PUT (admin axios baseURL has /api; finance plugin prefix /admin/finance; bare /finance/... would 404). GET on mount populates field, PUT on save with positive/negative notify. Route /configuracion-caja meta.allowedRoles ['admin','owner'] + nav q-item under Administracion section gated isAdminRole (excludes gestion/recepcion/coach; backend per-handler ADMIN_ROLES is the real gate). Warm palette no blue. Logger error() takes LogData record not raw unknown → wrap as {error: msg}. Pre-existing tsc errors (vitest types in axios-refresh-lock.test.ts, @types/pdfmake mismatch) out of scope. Commits 14b4dedc + 0543d44e. staging, not pushed.
- [Phase ?]: 132-03: frontend contract layer — 6 mirrored analytics interfaces + MetricShape + 6 typed fetch methods + turno/window filters
- [Phase ?]: [Phase 132]: .vue verified via eslint (type-aware); vue-tsc not installed, full SFC typecheck in CI
- [Phase ?]: [Phase 132]: ConversionTab + IngresosTab presentational (props-in); page 132-06 owns fetch
- [Phase ?]: 132-06: 6 v5.0 metrics wired into AnaliticasPage across 4 thematic tabs + Plan/Turno filters; deprecated FunnelTab/ARPU/Renovación/Tasa-de-retención deleted (D-15/16/17/18)
- [Phase ?]: [Phase 133]: Opción A confirmada — tabla exercise_milestone_proposals separada del truth (espejo de 0138); milestone_exercise_id solo se escribe en el accept transaccional del profe
- [Phase ?]: [Phase 133]: FK proposed_milestone_exercise_id con nombre acortado (62 chars) por límite de 64 de MySQL en nombres de constraint
- [Phase ?]: [Phase 133]: levelColor consolidada en constants/levels.ts + DL_BANDS locked (kairos 1-2/alfa 3/delta 4-6/sigma 7-8/omega 9-10/spartan 11-12); dlBand+bandTextClass como API de bandas para planes 06/07
- [Phase ?]: [Phase 133]: stripe de banda via colors.getPaletteColor() de Quasar (token como fuente de verdad, sin hex hardcodeado); contraste charcoal sobre amber (kairos/alfa)
- [Phase ?]: 133-03: matching de movimiento por ORDEN DECLARADO del MOVEMENT_VOCAB (no sort por longitud) — OA gana a TTB en nombres 'OA TTB ...'
- [Phase ?]: 133-03: proposeMilestones corre sobre el catálogo COMPLETO y particiona internamente; exclusión de ya-propuestos solo en el INSERT
- [Phase ?]: 133-03: ejercicios sin movimiento detectado no se agrupan — cada uno propuesto como hito con confidence 40
- [Phase 133]: 133-04: filtro de variantes con helper compartido backboneNodeConditions() + espejo crudo testeado; subGroup dominante en memoria con tie-break por code-points; readBackboneNodes() exportado para el test de consistencia
- [Phase 133]: 133-05: acceptInTransaction extraído de ProposalService.accept — el accept de hito/variante embebe el accept de dimensión en SU transacción (una pasada del profe = una tx)
- [Phase 133]: 133-05: validaciones de variante corren DENTRO de la tx después del accept de dimensión — un fallo tardío rollbackea todo (atomicidad observable por test)
- [Phase 133]: 133-05: extra props en bodies se STRIPPEAN (Ajv removeAdditional + additionalProperties:false), no rechazan 400 — contrato de plataforma existente
- [Phase ?]: 133-06: Reject 'análogo' = dispatch — fila con propuesta de hito rechaza solo ese eje (rejectMilestoneReview); la dimensión queda pendiente y revisable
- [Phase ?]: 133-06: MilestoneReviewList extraído como componente presentacional con emits granulares (evita vue/no-mutating-props); TreeMapPage conserva estado y mutaciones
- [Phase ?]: 133-06: 'Aceptar todas' saltea variantes sin hito elegido y acepta secuencialmente los dos ejes por fila (una tx backend c/u) + bulkAccept para solo-dimensión
- [Phase 133]: 133-07: arista agregada prereq-agg usa routes.code; click en R4 manual conserva la baja existente con el copy LOCKED en el diálogo; búsqueda scopeada al filtro de sub-grupo
- [Phase ?]: [Phase 134]: member tree node state/band server-computed in buildMemberTree (D-05); separate layer from reached/percent
- [Phase ?]: [Phase 134]: dominado is evidence-only (adjustments=dominado OR completed session); dl<=ceiling never dominates (D-01)
- [Phase ?]: [Phase 134]: disponible/bloqueado use D-06 hybrid gating; en_progreso frontier computed in a second per-route pass (D-02)
- [Phase ?]: 134-03 advance criterion
- [Phase ?]: [Phase 135]: bootstrap-milestones --apply milestone-only by contract (aborts on pending dimension proposals, exit 2); reuses acceptMilestoneReview as the only milestone_exercise_id writer, hitos before variantes, idempotent (pending-only)
- [Phase ?]: [Phase 143-01]: class_coach_assignments uniqueIndex natural-key (branch,week,day,slot) impide doble profe por slot/semana a nivel DB (D-A2)
- [Phase ?]: [Phase 143-01]: coach_ratings append-only sin unique; guard one-shot miembro+clase en service layer (D-P2)
- [Phase 143-05]: RatingPromptDialog (Surface 2) class-framed estilo Uber: salteable (sin persistent, D-P1) + one-shot por clase vía Capacitor Preferences (D-P2); nunca expone al profe (D-A3); estrellas Terracotta color=primary
- [Phase 143-05]: el-templo-app sin script typecheck ni vue-tsc; verificación canónica de frontend = ESLint (plugin vue); tsc reporta errores pre-existentes de resolución .vue fuera de scope
- [Phase ?]: [Phase 137]: Migration 0153 hand-written (not drizzle-kit generate) — runner reads .sql by name + \_migrations table is source of truth; generate prompted for unrelated sessions.goal_plan_type drift
- [Phase ?]: 137-03: 13 firm-money call sites centralized through firm-money.ts with validation_status='validado'; subscriptions cancel guard kept as deliberate integrity exception — VAL-05 blast-radius closed; backfill keeps the 6 v5.0 metrics identical
- [Phase 138]: [Phase 138]: cutoff_date is a per-caja column seeded with one global value (no settings-table dependency); cash_registers seed is SELECT-driven off branches (8 on prod baseline, scales with branch count)
- [Phase 138]: 138-02: resolveCashRegister (single reusable caja resolver, D-01) + currency guard (D-09) live in CashRegisterService; wired at the single create() insert site so all 9 create paths auto-stamp cash_register_id server-side (CAJA-02/04). Reused by phase 140.
- [Phase 138]: 138-03: CashRegisterService.getBalance = saldo DERIVADO (no materializado, D-08) = opening_balance + Σ validados de la caja DESDE cutoff_date, reusando firmMoneyConditions() (filtro canónico 137, nunca inlineado). PENDIENTES en SUM separada, nunca sumados al firme (CAJA-03). inflow-only en 138 con marker // TODO 139 (egresos firmados). Suite de integración CAJA-01..04 (18 tests). Backend-only (D-10, sin REST/UI). Phase 138 COMPLETE.
- [Phase ?]: [Phase 139]: branch_id NULLABLE (extends D-06) — movimientos/egresos branch-less almacenan NULL; aggregations branchId INNER JOIN branches
- [Phase ?]: [Phase 139]: getSummary excluye cash_transfer/expense + applyDelta no-op en links vacíos — movimiento no infla revenue ni toca balances
- [Phase 139]: 139-03: MovementService facade — movimiento = asiento 2 filas cash_transfer (outflow origen + inflow destino) linkeadas both-ways vía transaction_links, en una db.transaction, neto 0; guard same-currency antes de escribir; reconciliación D-04 = fila kind='adjustment' separada en origen SOLO si counted!=expected (el getBalance firmado auto-corrige el saldo a lo contado) + audit 'reconciliation' SIEMPRE (expected/counted/diff); egreso = 1 fila expense outflow; void-the-pair vía voidPair descubre ambas patas + ajuste desde cualquier leg id (transaction_links en ambas direcciones). 4 rutas admin-only (FINANCE_VOID_ROLES server-side, rol nunca del body) + country scope por caja→branch (branch-less = owner-only, 404 cross-country). 10 tests MOV-01..04 + RBAC verdes. Backend-only. Phase 139 COMPLETE.
- [Phase ?]: [Phase 140-01] idempotency_key as nullable UNIQUE column on financial_transactions (not separate table) — D-09; MySQL allows unlimited NULLs so admin/historical rows never collide
- [Phase ?]: [Phase 140-01] FINANCE_LOAD_ROLES = FINANCE_WRITE_ROLES + coach (load-only); coach stays out of VOID/ADJUSTMENT/READ — D-06/D-08
- [Phase ?]: [Phase 140-01] ER_DUP_ENTRY return-existing handling deferred to Wave 2 (Pitfall 3: renewal tx rolls back before re-read)
- [Phase ?]: Phase 140-02: coach load endpoints in a SEPARATE plugin with its own FINANCE_LOAD_ROLES guard (finance module's FINANCE_READ_ROLES hook excludes coach); idempotency dedup at endpoint layer (ER_DUP_ENTRY -> re-read existing on fresh connection, Pitfall 3)
- [Phase ?]: [Phase 142]: finance config reuses system_settings (finance.pending_overdue_days), read-with-fallback to OVERDUE_DAYS; owner/admin-only GET/PUT (per-handler ADMIN_ROLES closes the gestion trap); dynamic threshold in listPendingTray; migration 0157 seeds default 3
- [Phase ?]: [Phase 142-02 / MIG-02]: transition doc tracked under .planning/phases/142-.../ because .docs/ is gitignored (ops-facing copy still on disk at .docs/modulo-contable/); opening-balance migration kept as a TEMPLATE outside src/db/migrations/ so the runner can never execute placeholder/zero values on deploy — copied + filled with real physical counts at go-live; cutoff date deferred to Franco (single clean cutoff recommended); cajas stay at 0 in 142
- [Phase ?]: [144-01]: deriveCoveredUntil standalone (MAX(end_date) sobre cadena active+scheduled, end_date NOT NULL) + getCoveredUntil delega; cron importa la fn, booking/routes usan el método — DRY, 3 call sites
- [Phase ?]: [144-01]: 3 templates plan_renewal_warning_7d/\_3d/\_expired bajo categoría nueva 'planes' (route /reservas), no uno parametrizado
- [Phase ?]: [144-01]: migración hand-written 0158 (db:generate roto por drift de sessions.goal_plan_type + journal stale 0059); enum 'planes' appended last en ambas tablas + backfill idempotente NOT EXISTS
- [Phase ?]: 144-02: exact-date band (end_date = CURDATE()+N) is the plan-renewal cron's per-threshold idempotency (no tracking column); D-05 suppression via deriveCoveredUntil === threshold
- [Phase ?]: 144-03: GET /api/members/subscription/coverage vive en member-routes.ts (auth-only), NO en routes.ts (admin-gated → 403 a todo socio); id server-derived (IDOR T-144-08), retorna {coveredUntil, daysRemaining} con daysRemaining anclado a medianoche UTC sobre fecha AR
- [Phase ?]: 144-03: PlanExpiryDialog gate daysRemaining >= 0 && <= 3 (fix plan-checker — /coverage no barre autoExpire, negativos los cubren push del día + booking block); once-per-DAY via Preferences plan_expiry_shown_v1 (YYYY-MM-DD); país desde userStore.profile.branchCountry (authStore.country no existe); clon de RatingPromptDialog montado en MainLayout
- [Phase ?]: Phase 144 BOOK-BLOCK: reserve() blocks classes past the server-derived chained covered-until with a distinguishable COVERAGE_EXPIRED code; ReservasPage shows a renewal dialog only for that code
- [Phase ?]: [148-01] createdMemberId se persiste DENTRO de la tx del charge (W-1), sin UPDATE separado, para no dejar alumno activo huérfano ante crash
- [Phase ?]: 148-05: modo 'Alta + plan' como panel inline (A1) reusando typeahead/payment/sticky/idempotencia; monto autocalc por watcher [plan,medio,Zero] editable; chip 'Nuevo' por id de transaccion (sobrevive al re-fetch de mis-cargas)
- [Phase 149]: RBAC re-expresado como core white-label + override Templo (TEMPLO_RBAC_OVERRIDES, dirección override→core D-06); guard per-handler PLANES_WRITE_ROLES cierra D-11; PROGRAMAS_ROLES cierra la puerta trasera de gestion en el CRUD admin de programs (D-15)
- [Phase ?]: 149-02: umbral de pendientes hardcodeado en OVERDUE_DAYS=3 (Opción A, D-13); perilla de Configuración de Caja eliminada de la API sin migración
- [Phase ?]: [Phase 149-03] Nav-model declarativo único (templo-config.ts) como fuente de verdad del drawer; elimina los 7 computed ad-hoc (DRY resuelta). Programas dueño-only en nav (D-15). Flag TEMPLO_ENABLED semilla de config por-tenant (D-06).
- [Phase 149]: Landing por rol en '/' (D-14): función redirect resuelve Fran (coach+canAccessTraining) antes que dueño; empleado→/pagos, dueño→/alumnos, Fran→/sessions
- [Phase 149]: /programas dueño-only en el router guard (DUENO_ROLES, D-15) consistente con nav (Plan 03) y API (Plan 01); canEditPlans oculta edición de Planes al empleado (D-09/D-10)
- [Phase ?]: PROGRAMAS_LIST_ROLES (sin coach, D-10) reabre GET /admin/programs al staff administrativo; coach no fetchea el catálogo en PlanesPage (sin 403/Sentry)
- [Phase ?]: 149-06: landing por rol en beforeEach post-checkAuth; indice / con fallback estatico /pagos
- [Phase ?]: Nombre de cuenta banco derivado en el service (D-03); validacion uno-de-dos en el service no en el schema (D-02)
- [Phase 150]: Plan 150-03: GET /cash-registers sin guard stricter; solo escrituras exigen ADMIN_ROLES (D-12)
- [Phase 150]: Plan 150-03: close re-fetchea vía listBankAccounts para devolver { account, balance } y honrar el contrato del plan
- [Phase ?]: Frontend ABM cuentas bancarias (150-04): UpdateBankAccountInput sin currency (moneda fija D-04), form sin campo Nombre (derivado D-03), validación de formato CBU/CUIT liviana no bloqueante para cuentas del exterior
- [Phase ?]: Phase 151-01 (COBRO-04): PoS bank-account imputation — bankAccountId validated server-side (assertChosenBankAccount: banco+active+currency-match → 400) then threaded as trusted-internal cashRegisterIdOverride into subscriptions service; body never sets cashRegisterId so the v5.3 server-derived invariant holds. Applied on all 4 charge paths (settle/misc direct override, renew/alta delegated) + new coach-reachable GET /coach-load/bank-accounts.
- [Phase 151]: COBRO-04 bank-account selector renders only for transfer/card; Efectivo never sends bankAccountId
- [Phase 151]: Added optional defaultCurrency prop to CuentaBancariaFormDialog to preselect the charge currency (additive, backward-compatible)
- [Phase ?]: 151-05: Sede selector restored to step-2 alta (reachable for every alta); operator-visible branchId attribution recovered while server keeps deriving the rest of the payload
- [Phase ?]: cost_centers unique index (name, country) tras los renames de seeds para no colisionar (152 D-08)
- [Phase 152]: validated_by/at NULLABLE en financial_transactions: solo pendiente→validado las setea, nacidos-validados e históricos quedan NULL (152 D-06)
- [Phase ?]: 152-02: Reorden de tabs de Caja y relabel Transacciones->Historial de cobros sin tocar las keys de CAJA_TABS (contrato ?tab= intacto)
- [Phase ?]: 152-02: Nota de Saldos como q-banner fijo no dismissible (D-10) combinando saldo firme + aviso egresos/retiros
- [Phase 152]: 152-03: validate() denormaliza validated_by/at (read path del validador); correct()/admin-load quedan NULL — la UI los distingue como 'Validado al registrar' (D-06)
- [Phase 152]: 152-05: DateRangeFilter compartido (mes↔días, contrato { dateFrom, dateTo }) + utils date-range.ts/validation-status.ts extraídos (DRY), usados por Movimientos e Historial de cobros
- [Phase 152]: 152-05: filtro por estado del Historial de cobros server-side (query param validationStatus), no client-side, por lista paginada (D-04)
- [Phase 152]: 152-06: rename FE CostCenter → CostCenterItem (selector active-only) reservando CostCenter al ABM full-row con isActive; mirror del backend, evita type lie
- [Phase 153]: 153-02: cohorte de vencidos en modules/reports/ hereda el guard CAJA_ROLES (coach 403, D-12) sin tocar el endpoint coach; exclusion de dato sucio via end_date >= start_date; dedup + paginacion en JS para que total cuente miembros distintos
- [Phase ?]: Plan 153-03: DeudasPage pasa a hub de tabs (Por socio verbatim / Por deuda con motivo/fecha-registro/periodo/nota); coach solo ve Por socio via DEUDAS_DETAIL_ROLES; el reporte de deudas sale de Reportes
- [Phase ?]: 153-04: tab Vencidos (DeudasPage) consume /admin/reports/expired-members; orden por vencimiento más reciente delegado al backend (daysOverdue ASC), gated como Por deuda (coach fuera, D-12)
- [Phase ?]: 154-03: TEMPLO_GREEK_LEVELS = flag de superficie por instalacion (D-08), hermano de TEMPLO_ENABLED, NO canAccessTraining
- [Phase ?]: 155-02: maxCapacity con null explicito limpia el cupo de actividad (patron !== undefined); ausencia deja el valor intacto
- [Phase ?]: 155-02: validacion server-side del cupo en body schema (integer|null, 1-500); maxCapacity declarado en response schema o fast-json-stringify lo strippea
- [Phase ?]: 155-03: cupo por actividad en la UI del admin (input Cupo con hint de herencia, validación client-side entero positivo/vacío, autoridad en el API 155-02)
- [Phase ?]: 155-03: CreateSlotDialog gana prop initial (prefill editable para 155-04) + creación de actividad inline reusando createActivity (opción sentinel en el q-select, cero backend nuevo)
- [Phase ?]: 155-04: grilla admin multi-slot por celda (slotMap Map<string,WeeklySlotView[]>) con render apilado; click de detalle/borrado por slot puntual desktop+mobile sin round-trip por (hora,día); click en celda vacía abre CreateSlotDialog prefilleado
- [Phase ?]: Precio Zero a config: key pricing.zero_price_enabled (GET staff/PUT owner), default OFF, seed 0168 ON El Templo; gate en resolvePriceType + boarding pass
- [Phase 156]: 156-05: UI admin de Zero (toggle en /configuracion/precios + gates en PlanForm/AssignPlan/Cobros) y multi-select de programas cableado a programIds; la UI solo esconde, el gate real es server-side (156-01/156-02)
- [Phase ?]: 158-02: notificacion de vinculo activado best-effort dentro de qualifyReferralOnCharge (try/catch + log.warn, nunca rompe el cobro D-33); categoria 'referidos' apendada ultima en el enum (mig 0177); qualifyFirstPayment devuelve el flip para notificar una sola vez
- [Phase ?]: 161-02: conflicto de assign por categoryGroup (3 grupos) — el pase especial no choca con presencial ni online
- [Phase ?]: 161-02: renew discrimina la sub por subscriptionId (valida ownership); guard D-09 en los 4 callsites de referral
- [Phase ?]: 161-06: gating duro de especiales server-side; PassRequiredError→code PASS_REQUIRED en /reserve; D-04 cuenta reservas futuras pendientes; staff bypass con aviso en adminAddBooking
- [Phase ?]: 162-03: reporte REP-01 socio/externo por sub que cubre session_date + fallback; sin montos; anti JOIN-fanout
- [Phase ?]: Fase 166 corre en el worktree /home/franco/projects/et-166-tenancy (rama feat/166-tenancy-fundacion, base origin/master 8ac9ba9f) — el checkout principal no se toca
- [Phase ?]: Bloque de migraciones v6.0 reservado: 0190 (tanda A, aplicada) y 0191 (tanda B, plan 166-02). Maximo real verificado 0189 en las 3 fuentes (arbol, \_migrations local, todas las ramas)
- [Phase ?]: tenants.status usa mysqlEnum con primer argumento 'status' — se descarta 'tenant_status' del snippet del README seccion 5; la migracion 0190 lo espeja byte a byte
- [Phase 166]: tenant_id en las anclas es NOT NULL DEFAULT 1 (camino A): sin DEFAULT los INSERT IGNORE de test/setup.ts no insertan y el rolling deploy queda sin red — Verificado empiricamente en 166-02: insert sin tenant_id en users y branches resuelve a 1. El DEFAULT se repite en el MODIFY porque MySQL lo pierde. Se re-evalua cuando exista tenant 2, fuera de v6.0
- [Phase ?]: 166-03: FUND-01/FUND-02 probados por introspeccion de INFORMATION_SCHEMA (12 it()), no por inspeccion manual
- [Phase ?]: 166-03: regresion dirigida verde (32 archivos / 538 tests) sin ajustar una sola expectativa — el camino A (tenant_id NOT NULL DEFAULT 1) cumplio
- [Phase 166]: El corte por tenants.status compara contra 'active' (deny-by-default) en vez de enumerar suspended/archived — Fail-closed frente al futuro: si el enum gana un estado y nadie lo agrega a la lista, con la enumeracion pasaria; contra 'active' deniega. Comportamiento identico para el enum actual (tests de suspended y archived verdes)
- [Phase 166]: attachScope lanza AppError con code TENANT_SUSPENDED en vez de recibir reply: el 403 sale con code igual — Verificado sobre fastify 5.7.4 instalado (defaultErrorHandler -> fallbackErrorHandler serializa { statusCode, code: error.code, error, message }). Permite el enforcement sin cambiar la firma de 2 parametros ni tocar los 22 call sites (CD-03)
- [Phase ?]: 166-05: el 403 de tenant suspendido llega por HTTP con code TENANT_SUSPENDED y error Forbidden — verificado sobre 3 rutas reales (admin members, admin plans, member app), no solo a nivel de objeto de error
- [Phase 166]: 166-06: rollout staging-first via rama descartable tren/166-staging (staging estaba 25 commits adelante de master); la rama de fase quedo pura y el push a master fue fast-forward de 5 commits, sin arrastrar a prod el trabajo de CAJA parado en staging
- [Phase 166]: 166-06: migraciones 0190 y 0191 aplicadas en eltemplo_staging y en eltemplo; el tope de migracion en produccion pasa de 0189 a 0191 y las fases siguientes reservan desde 0192
- [Phase 167]: Numeros de migracion de la tanda C reservados: 0192-0195 (maximo real 0191 confirmado en 4 fuentes)
- [Phase 167]: Helper tenantIdColumn() sin fallback: los schemas de la tanda C insertan 'tenantId: tenantIdColumn(),'
- [Phase 167]: Clasificacion canonica 87 gym-owned / 4 exentas en src/db/tenant-tables.ts con gate fail-closed contra las 91 tablas del schema
- [Phase ?]: 167-02: la tanda C declara el DEFAULT desde el ADD COLUMN (fix WR-01 del review 166) — no copiar el ciclo de la 0191 en 167-03/04/05
- [Phase ?]: 167-02: todo .select({...}) explicito tipado como typeof <tabla>.inferSelect rompe tsc al sumar tenant_id (caso balances/BalanceRow) — grepear inferSelect antes de cada tanda
- [Phase ?]: 167-03: minas M3 y M6 anotadas en el codigo (campaign_unsubscribes y wellhub_events), no solo en el plan — la fase que cierra cada deuda queda escrita en el schema
- [Phase ?]: 167-05: tanda C COMPLETA en local — 87 columnas tenant_id NOT NULL DEFAULT 1, 88 FKs a tenants, 0 filas mal backfilleadas sobre 26.519, conjunto identico a GYM_OWNED_TABLES en las dos direcciones
- [Phase ?]: 167-05: el predicado de 'tabla tenant-aware' es NOT NULL DEFAULT 1, NO 'existe la columna tenant_id' — tenant_settings tiene la columna sin default (es su clave logica) y es EXENTA: con el predicado equivocado la comparacion da 88 vs 87
- [Phase ?]: 167-05: MySQL LIKE no soporta clases de caracteres — el criterio LIKE '019[2-5]%' devuelve 0 siempre. Usar REGEXP '^019[2-5]'. Un falso negativo asi es indistinguible de un fallo real en la salida
- [Phase ?]: 167-05: tv_pairings recibe la columna conservando su forma pre-claim (mina M7): insert sin tenant_id queda en 1 con branch_id NULL. Sus dos codigos quedan uniques GLOBALES para siempre (lista M8) porque el claim resuelve sin scope
- [Phase ?]: 167-06: COL-02 completo — verify-tenant-backfill.ts (solo lectura) prueba 87 tablas, 125 aristas de FK leidas de INFORMATION_SCHEMA en runtime, 14 aristas logicas M9 y 53 cadenas hasta un ancla, con 0 discrepancias. Exit 0/1/2. Corre por CLI (pnpm db:verify-tenant, o dist/ en el server) y como gate de CI
- [Phase ?]: 167-06: adulterar una base `eltemplo_test_*` ANTES de correr vitest no prueba NADA — test/setup-global.ts las dropea todas al arrancar y el provisioning las recrea desde los .sql. La prueba negativa que pedia el plan dio verde sin haber ejercitado nada. Para ejercitar un gate de la suite, adulterar DENTRO del proceso de test
- [Phase ?]: 167-06: una prueba negativa en verde hay que leerla con sospecha — 'el gate no se puso rojo' y 'la adulteracion nunca existio' se ven identicos desde afuera. Hay que probar que la adulteracion seguia viva en el momento de medir
- [Phase ?]: 167-06: EXPECTED_ANCHORLESS = 32, contrastada contra doc 05 comparando CONJUNTOS DE NOMBRES (no totales): el '37 + 3 parciales' del resumen no decompone porque incluye las 2 exentas y NO incluye las 8 tablas de §2.7 (marcadas en el titulo de la seccion). Las 4 de la familia sessions difieren porque el doc mide 'conceptualmente no deriva' y el script mide 'existe camino de FKs declaradas' (sessions.approved_by -> users es NULLABLE pero existe)
- [Phase ?]: 168-01: la 0196 convierte las 11 uniques globales a UNIQUE (tenant_id, ...) con DROP+ADD atomico en un solo ALTER por tabla — las 9 tablas lo aceptaron sin errno 150
- [Phase ?]: 168-01: cero DDL de INDEX(tenant_id) en la 0196 (D-07) — las FK de las 0192-0195 ya dejaron el indice auto-creado y las anclas tienen el explicito de la 0191
- [Phase ?]: Fase 168: el .sql de la 0196 se commiteó junto al schema Drizzle en 168-02 (Hard Rule 3), no en el rollout de 168-06
- [Phase ?]: Fase 168: los 11 comentarios M8 del schema referencian TENANT_GLOBAL_UNIQUES de src/db/tenant-tables.ts — contrato de nombre para el plan 168-03
- [Phase ?]: 168-03: el gate fail-closed encontro un 12o contrato de unicidad fuera de D-01 (subscription_plans name+country), invisible desde 2024 por drift schema-DB. Franco eligio convertirlo dentro de la misma 0196 (opcion A)
- [Phase ?]: 168-04: los tests de CON-01 cubren 12 contratos, no 11 — el 12º (subscription_plans name+country) viene del hallazgo de drift del 168-03
- [Phase ?]: 168-04: el invariante 'todo insert estampa tenantId' se hace cumplir por el tipo (tenantId como primer parámetro obligatorio de las 8 fixtures), no por grep — tsc rechaza un payload sin tenant
- [Phase ?]: 168-05: el test de introspección de la 0196 es de SOLO LECTURA (no llama a cleanAllTestData) y el gate de CI consume verifyTenantUniques con makeQueryFn(app), así que CI y el CLI contra staging/prod ejecutan literalmente el mismo código
- [Phase ?]: 168-05: la prueba manual del fail-closed hay que inyectarla DENTRO del beforeAll del test — el globalSetup de vitest dropea las bases per-worker al arrancar cada corrida, así que un índice de prueba creado por SQL antes da falso verde
- [Phase 168]: 168-06: rollout de la tanda D a las dos bases reales — la 0196 aplicada UNA vez en eltemplo_staging y UNA en eltemplo, con 12 contratos compuestos presentes, los 12 nombres viejos ausentes y verify-tenant-uniques.js en 0 discrepancias/exit 0 en ambas. CON-01 y CON-02 cerrados en producción
- [Phase 168]: 168-06: NO se squashearon los 10 commits de los planes 01-05 en el "commit único" que pedía el Task 1 — reescribir esos SHAs habría invalidado la evidencia que citan los cinco SUMMARY (mismo motivo por el que la 167 eligió merge --no-ff sobre rebase). Se verificaron los invariantes reales del gate: árbol limpio, diff exacto de 20 archivos, una sola migración, cero deleciones
- [Phase 168]: 168-06: push a master de la RAMA DE FASE y fast-forward (origin/master no se había movido de 68c447cf) — sin merge commit, sin rebase, y con merge-base --is-ancestor origin/staging HEAD fallando, así que los 29 commits de CAJA/finance parados en staging no viajaron a prod
- [Phase 168]: 168-06: el step de migraciones de un deploy NO es evidencia — tardó 4 s en las dos bases, pero la heurística alreadyApplied del runner tolera "Can't DROP" y un DROP INDEX mal nombrado saldría verde. La evidencia es la ausencia de los 12 nombres viejos en INFORMATION_SCHEMA de cada base real
- [Phase 169]: 169-01: assertTenant es el unico puente entre CountryScope.tenantId (number|null) y la firma lockeada del doc 03 §3 — lanza AppError 403 TENANT_UNRESOLVED; prohibidos el non-null assertion y el default numerico
- [Phase 169]: 169-01: tenant.ts NO se exporta desde el barrel shared/index.ts (consistencia con country-scope.ts, importado por path directo desde sus 22 call sites)
- [Phase ?]: 169-05: el corte por tenant_no_resoluble NO estampa tenantId — branches.tenant_id apuntaría a una fila inexistente de tenants (dueño falso + choque con la FK)
- [Phase ?]: 169-05: handleBookingCanceled NO se corta por estado del tenant — el corte comercial aplica a lo que CREA datos, no a lo que los libera (cupo fantasma en la grilla)
- [Phase ?]: 172-01: el worktree et-172 se creó desde a6272df0 (origin/master CON CR-CAJA), no desde 29e61c8b — CR-CAJA reescribió coach-load-routes.ts y subscriptions/service.ts, los dos archivos que la fase migra
- [Phase ?]: 172-01: node_modules propio con pnpm install --frozen-lockfile en vez del symlink de las fases 166-170 (3,4 s con el store caliente) — 23 planes no aguantan el ritual de crear y borrar el symlink alrededor de cada commit
- [Phase ?]: 172-01: al branch de fase se le sacó el upstream (git worktree add lo dejó trackeando origin/master, y en este repo todo push a master es un deploy a prod)
- [Phase ?]: 172-02: el tenantWhere va en el statement de la QUERY (el lint razona por statement); los fragmentos sql de fecha viajan por helper con la columna como parametro
- [Phase ?]: 172-02: scopear un statement paga la deuda de todas las tablas que joinea — 172-21 debe borrar 9 entradas de allowlist, no 6
- [Phase ?]: 172-03: los helpers que devuelven fragmentos SQL reciben las COLUMNAS por parametro (buildOutstandingScope), no el ctx — el lint mide por statement y el filtro en el array no vuelve cumplidores a los pushes
- [Phase ?]: 172-03: tenantWhere de tabla LEFT JOINeada va en el ON, nunca en el WHERE (en el WHERE el LEFT se vuelve INNER y desaparecen las deudas sin gestion)
- [Phase ?]: 172-04: el tenantWhere va en el statement de la QUERY, no en el array de conditions — el array ni siquiera cuenta como acceso para el lint
- [Phase ?]: 172-04: listMembers scopea TAMBIEN el EXISTS crudo de debtorOnly — sin el, el filtro de deudores miraba la deuda de todos los gimnasios
- [Phase ?]: 172-06: el criterio de terminado de un metodo migrado es el inventario del lint, nunca la firma (createEfectivoCaja tenia ctx y estaba sin migrar)
- [Phase ?]: 172-06: el tenantWhere de una tabla LEFT JOINeada va en el ON; en el WHERE el LEFT se vuelve INNER y borra filas con el lint en verde
- [Phase ?]: 172-06: los UPDATE del ABM llevan tenantWhere propio — el WHERE de una escritura no se apoya en el SELECT previo

### Pending Todos

- [x] **Phase 112 Plan 01: Schema migration** — completed 2026-05-04 (4 add-on columns + paused enum + backfill applied locally, idempotent, tsc clean)
- [ ] **Phase 112 Plan 02: EnrollmentService extraction** — wave 2, depends on Plan 01 (next)
- [ ] **Phase 112 Plans 03-06** — lifecycle hooks, admin add-on API, admin UI, member-app verification
- [ ] **Rollout de datos v5.1** — poblar milestone_exercise_id (local + prod) — `.planning/todos/pending/v51-milestone-data-rollout.md`
- [x] **Compensar días (pausa retroactiva) en admin** — implementado 2026-06-10 (endpoint + modal + tests, pendiente CI/UAT) — `.planning/todos/completed/2026-06-10-compensar-d-as-pausa-retroactiva-en-admin.md`

### Blockers/Concerns

- Plan 111-06 task 3 awaiting staging + production runs of migration 0109_reconcile_soledad_mailland.sql (human checkpoint — operator must run pnpm db:migrate on staging then approve prod)
- Plan 112-01 awaiting staging + production runs of migration 0111_program_enrollments_addon_columns.sql (human checkpoint — operator must run pnpm db:migrate on staging, sanity-check `SELECT COUNT(*) FROM program_enrollments WHERE source IS NULL` returns 0, then approve prod)
- Plan 112-01 deferred item: pre-existing test-DB provisioning bug (per-worker setup mis-tolerates Unknown-table errors at migration 0070, blocks `pnpm test` boot via `formats.description` schema drift). Documented in `.planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md`. Out of scope for v4.85; recommend a future housekeeping plan.
- Plan 112-04 awaiting staging+prod runs of migration 0112_transaction_links_target_kind_enrollment.sql (human checkpoint — operator must run pnpm db:migrate on staging, verify SHOW COLUMNS shows the new 4-value enum + \_migrations row, then approve prod)
- Plan 116-02 awaiting staging + production runs of migration 0125_create_refresh_tokens.sql (human checkpoint — operator must run pnpm db:migrate on staging, verify SHOW COLUMNS FROM refresh_tokens + fila en \_migrations, then approve prod)
- Plan 116-04: vitest+jsdom no instalados en el admin — test del lock escrito y commiteado pero sin correr; requiere decision del usuario (instalar devDeps o aceptar cobertura del test de la member app)
- Plan 117-02: migraciones 0128_create_user_status_history.sql + 0129_backfill_user_status_history.sql APROBADAS y aplicadas LOCALMENTE (checkpoint humano approved). Pendiente: aplicación en staging + producción vía pipeline (operator corre pnpm db:migrate on staging, verifica 0128/0129 en \_migrations + SELECT COUNT(\*) FROM user_status_history > 0, confirma re-run no-op, luego aprueba prod). Staging-first STRICT, no merge to master ni push sin confirmación.
- Plan 122-02: LTV headline reuses ChurnService (1÷churn pct), never recomputed; churn 0 → null (never NaN/∞)
- Plan 122-02: survival cohort closed=matured&&!retained (event), active/in-grace=censored (kept); life span first-start..last-expiry (closed) / first-start..today (censored), months=days÷30; first-start as correlated MIN(start_date) subquery (same user+branch, non-paused)
- Plan 122-02: monetary LTV from financial_transactions canonical filter (never list price); observed=mean closed totals, monthlyRealRevenue=mean(total÷months), projected=headline×monthlyRealRevenue; ARS/EUR never summed; ft upper bound EXCLUSIVE to match half-open cohort
- Plan 122-02: ARPU annotated @deprecated D-122-01 (math/schema/type byte-unchanged) — LTV monetary is canonical replacement, physical removal deferred to admin-UI phase (Phase 121 D-09 precedent)
- Plan 122-02: no integration test in this plan — test/analytics/ltv.test.ts owned by Plan 03, runs in CI only
- Plan 130-01: migration 0141 flips users.level DEFAULT alfa→kairos (additive, existing rows untouched) + ADD COLUMN level_override BOOLEAN DEFAULT 0; enum order byte-identical to schema/0140; both statements in one file, no `;` in comments
- Plan 130-01: new-member level=kairos at every creation path (auth/register insert+echo, createMember default ||"kairos", createTrialMember); explicit input.level still honored; legacy import-members.ts deliberately kept "alfa" (historical levels)
- Plan 130-01: updateMember sets level_override=true ONLY on a level change → sticky coach decision. Contract for Plan 02: auto-graduation MUST skip members with level_override=true. Non-level edits leave level + flag untouched (D-05)
- Plan 130-02 (KAIROS-05, D-02/D-03): KAIROS_GRADUATION_THRESHOLD=12 lives in shared/training-constants.ts (single source, no inline literal). GraduationService.maybeGraduateKairos(userId): one-way kairos→alfa at threshold, early-returns on non-kairos OR level_override=true, guarded `UPDATE ... WHERE id=? AND level='kairos'` (idempotent/race-safe). Count is TOTAL completed_sessions (all levels)
- Plan 130-02: graduation is event-driven (NO cron), wired as a guarded try/catch side effect into all 3 completed-session insert paths — sessions/routes.ts + goal-plans/routes.ts (after AURA award), attendance/service.ts (inline inside recordPresencialSession after the presencial mirror insert). 5 tests in test/kairos/kairos-graduation.test.ts (CI). API tsc green. staging, not pushed
- Plan 130-04 (KAIROS-07 app half, D-04): decision pre-resolved include-kairos (overnight). Prepended `{ value: 'kairos', label: 'α Kairos' }` FIRST in LEVEL_SELECTOR_QUESTION.options (onboarding/types.ts) → self-pick now kairos→alfa→delta→sigma→omega (5 boxes; spartan still excluded — earned, not claimed). 5 boxes is below OnboardingQuestion's `>5` scrollable threshold → no layout break. HeaderLevelDropdown.vue already v-for's TRAINING_LEVELS (kairos first since 129) → VERIFIED, no change. Gate = app lint (0 errs) + quasar build (succeeded; vue-tsc not a runnable script here, build covers full tsc). human-verify (visual UAT) DEFERRED. KAIROS-07 now complete app+admin. staging, not pushed. Phase 130 ready_for_verification.

## Session Continuity

Last session: 2026-07-30T22:54:06.369Z
Stopped at: Completed 172-04-PLAN.md
Resume file: None

**Planned Phase:** 114 (Reporte tabular de sesiones de prueba) — 7 plans — 2026-05-12T18:39:04.628Z
