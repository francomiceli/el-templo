# Deferred items — fase 175 (NO se ejecutan en la cadena autónoma)

## D1 — Fix de seguridad `subscriptions.branch_id` (heredado de 174.1-06)

`assignPlan`/`changePlanNow`/`changePlanAfterCurrent`/`renewSubscription` (subscriptions/service.ts) persisten
`input.branchId` crudo en `subscriptions.branch_id` sin `assertBranchDelGimnasio(ctx, input.branchId)` previo — un
staff del gimnasio 2 puede apuntar la fila a una sede de otro gimnasio (misma clase que 173-11/13-18 cerraron para
`users.branch_id`). La fila nace con `tenant_id` correcto pero `branch_id` ajeno (tampering directo, no un 403/404 filtrable).

**Por qué queda fuera de la cadena autónoma:** toca 4 métodos de un archivo strict de ~6700 líneas con blast radius no
verificable en un turno; es un endurecimiento de seguridad que merece supervisión. **Recomendación:** plan dedicado bajo
supervisión (candidato a un 175-07 o a la 175.1), con batería de aislamiento propia (branchId ajeno + userId/planId propios
→ 404, sin fila nueva). Detalle: `174.1-.../deferred-items.md`.

## D2 — ADO-05: verificación número-a-número de analytics (checkpoint humano)

El CÓDIGO de analytics quedó cerrado (el único gap real, `unique-members`, lo salda 175-06). Pero el SC1 de la fase exige
comparar snapshots ANTES/DESPUÉS en **staging** de churn, renovación, LTV, ticket, asistencia, funnel y altas/bajas para el
tenant 1 (que deben dar EXACTAMENTE los mismos números). Eso requiere correr las métricas contra la DB de staging → no se puede
hacer en la cadena autónoma. **Acción de Franco:** cuando el tren v6.0 esté en staging, correr los reportes y comparar contra
la línea base pre-tenancy. Entrypoints listados en `175-CONTEXT.md`.

## D3 — 17 tests rojos PRE-EXISTENTES en test/subscriptions + test/members

`recomputeUserStatus` no transiciona `users.status` en corridas PARCIALES (verde en suite completa); `ageInDays` off-by-one.
**Verificado pre-existente** (rojos en la base, no causados por 174.1/175). NO son deuda de 175. Si algún verify parcial de un
plan 175 los toca, ignorarlos como flake de aislamiento conocido — NO ajustar expectativas ni "arreglarlos" dentro de un plan.
Detalle y evidencia: `174.1-.../deferred-items.md` sección 174.1-05b.

## D4 — Las 17 entradas de allowlist `analytics` `branches`-por-país

Patrón derivado tolerado (branches joineado solo por `.country`, derivado de una tabla ya scopeada), igual que
reports:1545/goal-plans:488. 175 NO las toca (solo remueve `unique-members`). Se saldan en 175.1 (switch) o se convierten en
exención tenant-safe con anotación explícita ahí.

## D6 — ~120 tests rojos PRE-EXISTENTES en test/subscriptions + test/referrals (hallado durante 175-04, MISMA clase que D3/D5 pero MUCHO más grande)

Al correr `test/referrals test/subscriptions` juntos (foreground, `--no-file-parallelism`) para verificar 175-04: **125 de 370
tests rojos, 30 de 41 archivos con al menos un fallo.** Root cause verificado en ~10 archivos distintos (aura-annotation,
discount-computation, admin-assign-referrer, member-endpoint, bookings-reactivation, pricing-golden, zero-price-gate, y otros):
helpers de fixture con SQL crudo (`app.db.execute(sql\`INSERT INTO subscriptions (...)...\`)`sin columna`tenant_id`, o
`.from(schema.subscriptions)/.from(schema.bookings)`sin`tenantWhere`) que el `TenantSentinelError`corta porque`subscriptions`/`bookings`/`schedules`/`subscription_schedules`/`subscription_plans`ya están en`TENANT_STRICT_MODULES`(switch de fases previas — 172/173/174.1, ANTERIOR a 175). Ejemplos de helpers afectados:`createSubscription`(aura-annotation.test.ts:41),`giveCoverage`(discount-computation.test.ts, member-endpoint.test.ts),`givePaidSubscription`(admin-assign-referrer.test.ts:97),`seedQualifiedReferral`(pricing-golden.test.ts:104),`futureBookingCount`(bookings-reactivation.test.ts:90),`readSub` (zero-price-gate.test.ts:66).

**Verificado pre-existente, NO causado por 175-04:** ninguno de los archivos/helpers de arriba está en el diff de 175-04
(`referrals/service.ts`, `subscriptions/service.ts` secciones de referidos, `shared/active-member.ts`,
`jobs/notification-cron.ts`, `auth/routes.ts`, `members/service.ts`, `scripts/backfill-referral-codes.ts` + los tests que SÍ
edité: `code-generation.test.ts`, `ab-copy-test.test.ts`, `discount-computation.test.ts`/`admin-assign-referrer.test.ts`/
`member-endpoint.test.ts`/`aura-annotation.test.ts` — SOLO en la firma de las llamadas a `ReferralService`, nunca en los
helpers de fixture que fallan). Confirmación positiva: los 3 archivos donde MI cambio es la pieza central que se ejercita de
punta a punta (`code-generation.test.ts` 7/7, `ab-copy-test.test.ts` 7/7, `backfill-codes.test.ts` 4/4, `anti-fraud.test.ts`
6/6) pasan **100% verde** — los rojos aparecen únicamente en tests bloqueados ANTES de llegar a mi código, dentro del propio
helper de siembra.

**Por qué NO se arregló en 175-04:** blast radius de ~20-30 archivos de test ajenos a `referrals`/`deriveCoveredUntil`/
`active-member` (toca `bookings`, `schedules`, `subscription_plans`, `subscription_schedules` — módulos de `scheduling`/
`subscriptions` core, no de este plan). Es la MISMA clase de deuda que D3 (fixture no actualizado cuando un módulo pasó a
strict) y D5 (mismo patrón, 1 sola ocurrencia en `campaigns`), pero en un orden de magnitud mayor: **D3 documentó 17
casos "recomputeUserStatus/ageInDays"; este hallazgo es un bug DISTINTO (TenantSentinelError por SQL crudo sin tenant_id),
NO contabilizado en D3, y ~7x más grande.** **Acción sugerida:** un plan de limpieza de fixtures dedicado (candidato a
175.1 o un plan aparte) que audite `test/subscriptions/_helpers.ts` + los helpers locales de cada archivo y les agregue
`tenant_id`/`tenantWhere` — no es seguro intentarlo dentro de la cadena autónoma de un plan de referrals.

## D5 — 1 test rojo PRE-EXISTENTE en test/campaigns-funnel.test.ts (hallado durante 175-01)

`test/campaigns-funnel.test.ts:211` (`D-18: a booking before sent_at is NOT attributed to the campaign`) hace
`app.db.update(schema.bookings).set({ bookedAt: ... }).where(eq(schema.bookings.id, id))` — un UPDATE crudo de fixture sin
`tenantWhere`/`tenantValues`. El sentinel de tenancy lo corta (`TenantSentinelError`) porque `bookings` (scheduling) ya es
`TENANT_STRICT_MODULES` desde el switch de **174.1** — anterior a esta fase. **Verificado pre-existente:** ni
`campaigns-funnel.test.ts` ni `funnel()` (`campaigns/service.ts`) están en el diff de 175-01 (`funnel()` está explícitamente
fuera de alcance del plan — "YA está migrado de 173-08, no tocar"). Misma clase que D3 (fixture de test que no se actualizó
cuando un módulo pasó a strict), pero en un archivo de `campaigns` no listado en D3. NO se arregló en 175-01 (scope boundary:
no es un archivo de las `<files>` del plan). **Acción sugerida:** un plan de limpieza de fixtures (o el mismo owner de D3)
agrega `tenantWhere(schema.bookings, CTX)` al WHERE de esa línea.
