---
phase: 194-invitaciones
reviewed: 2026-10-07T00:00:00Z
depth: deep
files_reviewed: 114
files_reviewed_list:
  - el-templo-api/src/modules/subscriptions/discount-arbiter.ts
  - el-templo-api/src/modules/subscriptions/renewal-base.ts
  - el-templo-api/src/modules/subscriptions/month-end.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/src/modules/subscriptions/routes.ts
  - el-templo-api/src/modules/subscriptions/schemas.ts
  - el-templo-api/src/modules/subscriptions/pricing.ts
  - el-templo-api/src/modules/aura/pricing-benefits.ts
  - el-templo-api/src/modules/referrals/invitation-link.ts
  - el-templo-api/src/modules/referrals/invitation-service.ts
  - el-templo-api/src/modules/referrals/invitation-rules.ts
  - el-templo-api/src/modules/referrals/invitation-settings.ts
  - el-templo-api/src/modules/referrals/invitation-conversion.ts
  - el-templo-api/src/modules/referrals/invitation-assisted.ts
  - el-templo-api/src/modules/referrals/invitation-overview.ts
  - el-templo-api/src/modules/referrals/invitation-lead-list.ts
  - el-templo-api/src/modules/referrals/invitation-report.ts
  - el-templo-api/src/modules/referrals/invitation-states.ts
  - el-templo-api/src/modules/referrals/invitation-types.ts
  - el-templo-api/src/modules/referrals/invitation-schemas.ts
  - el-templo-api/src/modules/referrals/invitation-errors.ts
  - el-templo-api/src/modules/referrals/invitation-factory.ts
  - el-templo-api/src/modules/referrals/invitation-trained-branches.ts
  - el-templo-api/src/modules/referrals/service.ts
  - el-templo-api/src/modules/referrals/types.ts
  - el-templo-api/src/modules/referrals/routes.ts
  - el-templo-api/src/modules/referrals/admin-routes.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/schemas.ts
  - el-templo-api/src/modules/auth/routes.ts
  - el-templo-api/src/modules/settings/routes.ts
  - el-templo-api/src/modules/scheduling/booking-service.ts
  - el-templo-api/src/modules/shared/membership.ts
  - el-templo-api/src/modules/shared/active-member.ts
  - el-templo-api/src/modules/shared/business-days.ts
  - el-templo-api/src/modules/shared/permissions.ts
  - el-templo-api/src/modules/campaigns/audience-service.ts
  - el-templo-api/src/modules/finance/coach-load-routes.ts
  - el-templo-api/src/modules/renewals/service.ts
  - el-templo-api/src/jobs/expire-lost-leads.ts
  - el-templo-api/src/db/schema/invitations.ts
  - el-templo-api/src/db/migrations/0255_invitations.sql
  - el-templo-api/src/db/migrations/0256_plans_allows_invitation_discount.sql
  - el-templo-api/src/db/migrations/0257_invitation_plans.sql
  - el-templo-api/src/db/migrations/0260_fix_referral_3_inverted.sql
  - el-templo-api/src/db/migrations/0261_rebrand_invitaciones_copy.sql
  - el-templo-app/src/pages/ActivarInvitacionPage.vue
  - el-templo-app/src/pages/InvitacionLandingPage.vue
  - el-templo-app/src/pages/MisInvitadosPage.vue
  - el-templo-app/src/pages/RegisterPage.vue
  - el-templo-app/src/pages/LoginPage.vue
  - el-templo-app/src/router/guards.ts
  - el-templo-app/src/router/routes.ts
  - el-templo-app/src/stores/useAuthStore.ts
  - el-templo-app/src/utils/pending-invitation.ts
  - el-templo-app/src/utils/invitation-view.ts
  - el-templo-app/src/utils/signup-code.ts
  - el-templo-app/src/modules/progression/components/ReferralCtaCard.vue
  - el-templo-admin/src/components/AssignPlanDialog.vue
  - el-templo-admin/src/components/MemberSubscriptionTab.vue
  - el-templo-admin/src/components/InvitationCreateDialog.vue
  - el-templo-admin/src/components/TrialMemberFormDialog.vue
  - el-templo-admin/src/components/PlanFormDialog.vue
  - el-templo-admin/src/components/reports/InvitationsReport.vue
  - el-templo-admin/src/components/settings/InvitationSettingsCard.vue
  - el-templo-admin/src/pages/AlumnosPage.vue
findings:
  blocker: 0
  high: 2
  medium: 9
  low: 10
  total: 21
  critical: 2
  warning: 9
  info: 11
status: issues_found
---

# Fase 194 (Invitaciones): Reporte de revisión de código

**Revisado:** 2026-10-07
**Profundidad:** deep (flujo de cobros trazado extremo a extremo, análisis de ciclos de importación, tenancy, frontends)
**Alcance:** lo que aporta la fase sobre `origin/master` (`git diff origin/master...HEAD`, 114 archivos de `src/`); tests solo como chequeo de calidad.
**Verificaciones mecánicas corridas:** `tsc --noEmit` (API) limpio, `pnpm lint:tenant` con `DISCREPANCIAS: 0`, `eslint` limpio sobre los archivos nuevos de app y admin. Sin `any`, sin `console.*`, sin `@ts-ignore` en el diff.

## Resumen

La parte más riesgosa (plata) está bien resuelta y mejor que lo que había: un único árbitro de descuentos (`discount-arbiter.ts`) con funciones puras, preview y cobro compartiendo `computeChargeDiscounts`, el vínculo de descuento creado dentro de la transacción del cobro, el admin dejó de recalcular descuentos en el cliente, y hay tests de paridad, de concurrencia del cupo y de aislamiento de tenant. No encontré ningún bug de plata que cambie un importe cobrado ni ninguna fuga entre gimnasios. **No hay BLOCKER.**

Lo que sí hay son dos riesgos de integridad/operación que conviene resolver antes de abrir el programa (HIGH), y una deuda de mantenibilidad concreta que el dueño pidió evitar: el post-cobro está copiado 4 veces en `subscriptions/service.ts` (que sigue creciendo, 7850 a 8086 líneas), hay un ciclo de importaciones de 14 módulos que ahora incluye el árbitro, y quedó código muerto de la transición.

---

## HIGH

### HI-01: La activación es una saga de 5 pasos sin atomicidad ni barrido de huérfanas; un corte entre el paso 2 y el 4 quema cupo y ventana en silencio

**Archivo:** `el-templo-api/src/modules/referrals/invitation-service.ts:326-505` (pasos 2 a 4) y `:859-945` (`compensateFailedActivation`)
**Problema:** el paso 2 hace commit de la fila `invitations` (`status='active'`), que ya consume cupo del invitador (2/mes) y ventana de 90 días del invitado. Recién después vienen `applyInviteeData` (paso 3) y `assignInvitationPlan` (paso 4), cada uno en su propia transacción. La compensación solo corre dentro del `catch` del mismo request. Si el proceso muere entre el commit del paso 2 y el final del paso 4 (reinicio de pm2 en un deploy, OOM, corte de red hacia MySQL, timeout del gateway), nadie anula la fila: queda una invitación `active` sin `subscription_id`, sin accesos y sin pasar a `prueba`, y:
- el invitador pierde 1 de sus 2 invitaciones del mes,
- el invitado queda bloqueado 90 días por `invitee_recent_invitation` sin haber recibido nunca los accesos,
- el listado de leads y "Mis invitados" muestran un invitado "Invitado" con accesos inexistentes (`accessesUsed: null`).

Además `compensateFailedActivation` traga sus propios errores (`catch` + `log.error`), con lo que un fallo de la compensación deja exactamente el mismo estado huérfano. El único rescate hoy es que un staff lo detecte y anule a mano.
**Por qué importa:** es pérdida silenciosa de un derecho del usuario (accesos prometidos) y de cupo, sin alarma. La probabilidad por request es baja, pero cada deploy tiene una ventana.
**Fix:** agregar un barrido idempotente (job diario o el mismo cron de `expire-lost-leads`) que anule como `voided` con `void_reason='activation_failed'` las invitaciones `active` con `subscription_id IS NULL` y `created_at < NOW() - INTERVAL 10 MINUTE`, y que loguee por Pino/Sentry cuando encuentre alguna. Alternativa más robusta: insertar la fila con un estado intermedio (`pending`) que no cuenta para cupo ni ventana, y pasarla a `active` en el mismo `UPDATE` que setea `subscription_id` (así un corte deja una fila `pending` inocua).

### HI-02: El plan "Invitación" se identifica por dos flags editables (`is_trial` + `paquete`) y ningún método de planes lo protege; una edición desde el admin cambia retroactivamente qué es membresía

**Archivo:** `el-templo-api/src/modules/subscriptions/service.ts:1478` (`updatePlan`), `:1640` (`deactivatePlan`), `:1350` (`findInvitationPlan`); `el-templo-api/src/modules/subscriptions/types.ts:142` (`isInvitationPlan`); `el-templo-api/src/modules/shared/membership.ts:49,85`
**Problema:** la invariante central de la fase (D-03: "`is_trial` da acceso, nunca membresía") depende de una columna mutable del plan, y la identidad del plan Invitación depende de otras dos. `updatePlan`/`deactivatePlan`/archivar no tienen ningún guard para ese plan, y el formulario de planes del admin expone `isTrial`, `planCategory`, precio y accesos por semana. Consecuencias reproducibles leyendo el código:
1. Alguien de gestión/owner que desmarca "plan de prueba" en el plan Invitación hace que todas las subs de invitación existentes pasen a contar como membresía en `membershipInEffectSql`: los invitados quedan `activo`, entran a analytics/SEPA/renovaciones, `assignPlan` deja de bloquear el plan y el plan aparece en el catálogo de la app a precio 0.
2. Crear (o dejar) un segundo plan `is_trial` + `paquete` en el mismo país hace que `findInvitationPlan` falle cerrado (`rows.length !== 1`) y se caigan todas las activaciones de ese país.
3. Desactivar/archivar el plan tiene el mismo efecto que (2), con un 400 "No hay un plan de Invitación configurado" que el invitado no puede resolver.
4. Cambiar `classes_per_week` cambia silenciosamente los accesos (es intencional, D-02), pero también `price_regular` > 0 queda permitido.

Tampoco existe ningún camino para dar de alta el plan en un tenant nuevo: la migración 0257 siembra solo `tenant_id = 1`, así que para cualquier gimnasio 2 las invitaciones fallan con el 400 de arriba.
**Por qué importa:** una acción de configuración legítima y plausible rompe un invariante de plata/estado sin ningún aviso.
**Fix:** (a) `assertInvitationPlanImmutable` en `updatePlan`/`deactivatePlan`/archive: si el plan existente cumple `isInvitationPlan`, rechazar cambios a `isTrial`, `planCategory`, `isActive`, `isArchived`, `priceRegular`, `multiBranch`, y rechazar crear un segundo plan que cumpla `isInvitationPlan` en el mismo gimnasio y país; (b) a mediano plazo, una columna explícita (`plan_kind` o `is_invitation`) en vez de inferirlo de dos flags de negocio; (c) documentar en el checklist de release/onboarding de tenant el seed del plan Invitación por país.

---

## MEDIUM

### ME-01: El post-cobro está copiado 4 veces en `subscriptions/service.ts` (y el archivo creció 236 líneas netas)

**Archivo:** `el-templo-api/src/modules/subscriptions/service.ts:3026-3070` (assign), `:5043-5085` (changePlanNow), `:5508-5550` (changePlanAfterCurrent), `:6338-6385` (renew); y los bloques gemelos de pre-cobro en `:2553-2574`, `:4754-4760`, `:5340-5346`, `:6020-6028`
**Problema:** cada charge-path repite la misma secuencia: `settlementColumns` + `qualifyReferralOnCharge` (antes de la tx), `materializeSettlementLink` dentro de la tx, y después del commit `notifyInviterLinkActivated` + `recordReferralCreditOnCharge` + `qualifyPartnerOnCharge` + `consumePartnerBenefitAfterCharge`, además de la variable `let linkedInviterId = null as number | null` con su comentario sobre el cast. Son ~45 líneas por path, 4 veces. La fase extrajo `month-end.ts`, `renewal-base.ts` y `discount-arbiter.ts` (bien), pero el archivo pasó de 7850 a 8086 líneas. Si mañana se agrega otro efecto post-cobro (otro descuento, otra notificación) hay que acordarse de tocar los 4 lugares, y el orden entre ellos ya tuvo un bug de ese tipo en la historia del repo (el comentario sobre el gemelo de partners).
**Fix:** extraer a `subscriptions/charge-side-effects.ts` un `settleChargeSideEffects(ctx, { userId, subscriptionId, pricePaid, settlement, partnerCandidate, columns, linkedInviterId })` para el post-commit y un `prepareChargeColumns()` para el pre-cobro, y que las 4 charge-paths lo llamen. Es refactor mecánico cubierto por `discount-arbiter-paths.test.ts` (60 casos).

### ME-02: Ciclo de importaciones de 14 módulos que ahora atraviesa el árbitro

**Archivo:** `el-templo-api/src/modules/referrals/service.ts:56-57`, `invitation-settings.ts:49,200`, `invitation-rules.ts:49-50`, `invitation-link.ts:31`, `subscriptions/discount-arbiter.ts:53-61`, `subscriptions/service.ts:110-120`
**Problema:** el análisis de importaciones (excluyendo `import type`) da una única componente fuertemente conexa de 14 archivos que incluye `referrals/service`, `invitation-settings`, `invitation-rules`, `invitation-overview`, `invitation-conversion`, `invitation-link`, `subscriptions/discount-arbiter` y `subscriptions/service`. El ciclo conocido `service` <-> `invitation-settings` existe porque `getInvitationSettings` hace `new ReferralService(db, log).getReferralConfig()` solo para leer dos números; y `service` -> `invitation-overview` -> `invitation-rules` -> `invitation-settings` -> `service` lo cierra. Hoy funciona porque todo se usa dentro de funciones (no hay uso en tiempo de carga), pero cualquier `const` de módulo que use una de estas clases, o un cambio de orden de imports, va a producir un `undefined` en runtime difícil de rastrear. Además `getInvitationSettings` se invoca 3 a 5 veces por cobro (árbitro, `computeInvitationDiscountPercent`, `findLinkableInvitation` vía el árbitro) y cada una instancia un servicio.
**Fix:** sacar `getReferralConfig` de la clase a `referrals/referral-config.ts` (función pura `(db) => Promise<ReferralConfig>`); `invitation-settings.ts` importa solo eso y `ReferralService` lo reusa. Eso rompe el ciclo de raíz. Opcional: que `computeChargeDiscounts` lea `getInvitationSettings` una vez y lo pase por `deps`.

### ME-03: Los mensajes de inelegibilidad están escritos para el invitador/staff pero la app los muestra al invitado (copy incorrecto y fuga del estado del invitador)

**Archivo:** `el-templo-api/src/modules/referrals/invitation-types.ts:115-135`; consumido en `invitation-service.ts` (`previewActivation`, `message: INELIGIBLE_MESSAGES[reason]`) y `el-templo-app/src/pages/ActivarInvitacionPage.vue:236`
**Problema:** `GET .../invitations/eligibility` devuelve `message` y la página lo pinta tal cual como `blockedMessage` al invitado. Pero:
- `inviter_quota_exhausted`: "Ya usaste todas tus invitaciones de este mes..." lo lee el invitado y entiende que es SU cupo.
- `inviter_not_member`: "Para invitar necesitás tener una membresía vigente. Renová la tuya..." también va al invitado, y además le revela que quien lo invitó no tiene membresía vigente (dato de otro socio).
- `invitee_is_member` / `invitee_recent_member` / `invitee_recent_invitation`: "Esta persona ya tiene..." en tercera persona, y es el propio usuario quien lo lee.
**Fix:** en `previewActivation` devolver solo el `reason` estable y que cada cliente traduzca: la app con copy en segunda persona y genérico para los motivos del invitador ("Esta invitación no está disponible en este momento. Pedile a quien te invitó que te mande otra más adelante."), y el admin con los textos actuales. O dos tablas de mensajes (`INVITEE_MESSAGES` / `STAFF_MESSAGES`).

### ME-04: Los endpoints de activación del canal app no restringen el rol; cualquier token autenticado (coach, recepción, admin) puede activarse y se le reescribe status, sede y teléfono

**Archivo:** `el-templo-api/src/modules/referrals/routes.ts:76-147`; efecto en `invitation-service.ts:730-815` (`applyInviteeData`)
**Problema:** `GET /invitations/eligibility` y `POST /invitations/activate` usan solo `fastify.authenticate`. El `userId` sale del token, no del body (correcto, no hay IDOR), pero no se exige `role === 'member'`. Un usuario staff que llame al endpoint pasa por la misma lógica y `applyInviteeData` le cambia `status` a `prueba` (con fila en `user_status_history`), le muda `branch_id`, le sobreescribe `phone` y le pone `lead_status`. El guard de la app solo evita que un staff llegue a la pantalla, no a la API.
**Fix:** `preHandler` que rechace con 403 si `request.user.role !== 'member'` (o `MEMBER_ROLES` si existe en `shared/permissions`), más un test de que un coach recibe 403.

### ME-05: En el canal asistido los roles con alcance por sede (`admin_sede`) operan sobre cualquier socio y cualquier invitador del país, y mueven al invitado a su sede

**Archivo:** `el-templo-api/src/modules/members/routes.ts:2057` (`isMemberInScope`), `:2144-2215` (rutas `POST /:userId/invitations` y `.../void`); `shared/permissions.ts` (`INVITATION_ASSISTED_ROLES`, `MEMBER_LIFECYCLE_ROLES`)
**Problema:** `requireBranchAccess({ from: "body.branchId" })` solo valida la sede DESTINO. `isMemberInScope` (usado para `:userId` y para `inviterId`) compara solo el país. Para `admin_sede` (que tiene `enforcedBranchIds`), la combinación permite: crear una invitación para un lead de otra sede del mismo país, y `applyInviteeData` lo reasigna a la sede del `admin_sede` (`branchSource: 'manual'`, que además protege el cambio del cron de recategorización); y anular invitaciones de invitados de otras sedes. Es el mismo criterio de país-solo que ya tenía `assertReferralTargetInScope` en master, pero esas rutas eran de lectura/asignación de vínculo, y estas escriben (plan, status, sede).
**Fix:** si el actor es `isBranchScopedRole`, exigir además que la sede ACTUAL del invitado (y la del invitador) esté en `enforcedBranchIds(request.scope)`; o excluir a `admin_sede` de `INVITATION_ASSISTED_ROLES` / void si el brief no lo pide. Test de aislamiento por sede.

### ME-06: Al comprar un plan con inicio futuro se cierran de inmediato los accesos de invitación que todavía no se usaron

**Archivo:** `el-templo-api/src/modules/subscriptions/service.ts:2381-2395` (selección) y `:2823-2845` (cierre)
**Problema:** el cierre D-07 se dispara si la sub de invitación solapa con la nueva (`endDate > startDate` de la nueva), no cuando la nueva arranca. Si el invitado compra hoy con `startDate` dentro de 5 días (el flujo "arranca cuando venga" existe) y sus accesos vencen en 8, la sub de invitación pasa a `completed` hoy y la nueva queda `scheduled` hasta dentro de 5 días: durante esos días no tiene accesos ni plan, aunque había comprado. Además `closeInvitationAccess` deja `end_date` y `classes_remaining` intactos, así que la reserva ya hecha dentro de esa ventana depende de cómo `reserve` elija la sub vigente.
**Fix:** cuando `input.startDate > today`, no cerrar: dejar la sub de invitación vigente y cerrarla en la activación de la `scheduled` (`activateScheduledSub`), o acortar su `end_date` a `startDate - 1` en lugar de pasarla a `completed`. Test: compra con inicio futuro y accesos remanentes.

### ME-07: Tres definiciones distintas de "compró" para una invitación

**Archivo:** `el-templo-api/src/modules/referrals/invitation-overview.ts:251` (`purchased` SQL), `invitation-conversion.ts:37-53` (`paidAfterInvitationSql`) y `:187-219` (`findLatestPaidSubscription`), `invitation-states.ts:84` (legado: `qualified` = compró)
**Problema:** el overview cuenta como compra cualquier sub no-trial con `price_paid > 0` creada desde la activación, SIN exigir que esté vigente (una sub cancelada cuenta y el estado pasa a `inactivo`). La conversión (`attributeInvitationPurchase` y el gate del lead) exige `membershipInEffectSql` (activa/pausada, ya arrancada, no vencida). Resultado: un invitado que compró y canceló se ve `inactivo` en "Mis invitados" pero la invitación nunca tuvo `converted_at` (el reporte no la cuenta como convertida y la etapa del lead queda `vencido`); y un invitado con compra `scheduled` figura "compró" en el overview y todavía no convertido. Hoy son números distintos para la misma pregunta en dos pantallas.
**Fix:** una sola función/fragmento (`invitation-purchase.ts`) con la definición acordada y que overview, conversión, etapa del lead y reporte la reusen; decidir explícitamente si "compró" incluye canceladas y programadas.

### ME-08: La columna "Importe" del export SEPA muestra lo pagado en el período vigente, no lo que se va a debitar en el próximo ciclo

**Archivo:** `el-templo-api/src/modules/members/service.ts:2574-2640` (subqueries `amountSubquery`/`currencySubquery`); `members/routes.ts` (columnas `Importe`/`Moneda`)
**Problema:** D-25 pidió un importe informativo para Leandro. Se exporta `price_paid` de la membresía vigente HOY. Si el socio está en un período prorrateado (alta del 25 al 30: 12 EUR) o en uno con descuento por invitación ya aplicado, ese es el número que aparece junto al IBAN y al deudor, pero el débito del mes siguiente es el de la renovación (base heredada, D-22, menos el descuento que corresponda al nuevo ciclo, que puede ser distinto). Quien usa el archivo para armar la remesa puede debitar de menos o de más sin darse cuenta. Hay además un solo importe aunque el socio tenga dos membresías vigentes.
**Fix:** o renombrar la columna a "Último importe cobrado" y dejarlo explícito en el encabezado, o (mejor) calcular el importe del próximo ciclo con el mismo helper del preview de renovación (`resolveRenewalCharge` en modo preview) para los socios con débito, que es lo que D-25 buscaba ("importe registrado... descuento incluido").

### ME-09: Los cortes de "hoy" en UTC acortan los accesos del último día hábil en Argentina

**Archivo:** `el-templo-api/src/modules/subscriptions/service.ts:6671` (`autoExpireSubscriptions`, `today` por `toISOString()`), `shared/membership.ts:59-62` (`CURDATE()`); documentado en `shared/business-days.ts:16-23`
**Problema:** la fase promete "10 días hábiles" y calcula `access_expires_on` correctamente en la tz de la sede, pero la expiración de la sub compara `end_date < hoy UTC`. En AR (UTC-3) la sub vence a las 21:00 locales del último día, así que una clase de las 20:00 o 21:00 de ese día falla para el invitado. El comentario del helper lo reconoce y lo "mitiga con el check-in forzado del profe". Es una promesa comercial recortada para el segmento más sensible (el invitado que decide si se queda), y las clases de la noche son las más pedidas.
**Fix:** para subs de invitación, fijar `end_date` un día después de `access_expires_on` solo en la sub (y mantener `invitations.access_expires_on` como el día inclusivo que se muestra), o resolver `today` por la tz de la sede de la sub en `autoExpireSubscriptions` (cambio global, requiere decisión). Como mínimo, dejarlo en el checklist de UAT con una prueba a las 21:30 hora AR.

---

## LOW

### LO-01: Dos efectos secundarios quedan fuera de la transacción del cobro (flip del vínculo `pending` y registro del crédito)

**Archivo:** `subscriptions/service.ts:2574`, `:4760`, `:5346`, `:6028` (`qualifyReferralOnCharge` antes de abrir la tx) y `:3038`, `:5054`, `:5519`, `:6349` (`recordReferralCreditOnCharge` después)
**Problema:** ambos son comportamiento heredado, pero ahora que el precio ya no depende del flip (el árbitro lo simula) no hay razón para que corra antes de la tx: si el insert de la sub o `recordAssignmentCharge` fallan, el vínculo legado queda `qualified` sin cobro. Y si falla `recordReferralCredit` después del commit, la sub tiene `referral_discount_amount` y el reporte D-19 (que suma `referral_credits`) pierde ese descuento.
**Fix:** mover ambos dentro de la tx (reciben `tx`), o dejar el crédito como derivable de las columnas `referral_*` de la sub y deprecar `referral_credits` para el reporte.

### LO-02: Código muerto y wrappers que solo existen para los tests

**Archivo:** `subscriptions/discount-arbiter.ts:106,160` y `service.ts:914` (`boardingPassApplied` siempre `false`, la rama "solo vínculo" por boarding pass de `resolveChargeInvitation` es inalcanzable en producción); `referrals/invitation-service.ts:100-145` (`getInviterQuota`, `evaluateInviteeEligibility`, `assertIdentityNotTaken` y `assertInviteeEligible` solo pasan la llamada a `InvitationRules`, sin uso en `src/` salvo `activate`); `referrals/service.ts:235` (`computeReferralDiscountPercent` es un wrapper de una línea de `computeInvitationDiscountPercent`); `subscriptions/types.ts:727,772` y `service.ts:4534,6636` (`referralDiscountPercent/Amount` de los previews marcados `@deprecated ... hasta 194-23`; el admin ya migró, ya no los lee)
**Fix:** borrar `boardingPassApplied` y su rama, los delegadores (los tests pueden instanciar `InvitationRules`), y los campos `@deprecated` de los previews y de `pricingPreviewResponseSchema`/`changePlanPreviewSchema`.

### LO-03: Rangos de los parámetros duplicados en 3 lugares

**Archivo:** `referrals/invitation-settings.ts:70-97` (`INT_SETTINGS`), `settings/routes.ts` (esquema JSON del `PUT /invitations`), `el-templo-admin/src/components/settings/InvitationSettingsCard.vue` (`numericFields` con "Mismos rangos que valida el servidor")
**Problema:** cambiar un máximo exige tocar 3 archivos en 2 repos y no hay nada que avise si divergen.
**Fix:** generar el esquema de la ruta desde `INT_SETTINGS`, y devolver `limits: { monthlyQuota: {min, max}, ... }` en el `GET /invitations` para que el admin los use.

### LO-04: Tres copias del mismo cálculo de meses y tres constantes de zona horaria

**Archivo:** `referrals/invitation-rules.ts:72` (`subtractMonths`), `referrals/invitation-report.ts:94-100` (`shiftMonth`), `el-templo-admin/.../InvitationsReport.vue:288` (`shiftMonth`); `FALLBACK_TIMEZONE` en `invitation-overview.ts` y `invitation-lead-list.ts`, y `REPORT_TIMEZONE` en `invitation-report.ts`, los tres con `America/Argentina/Buenos_Aires`
**Problema:** además, el reporte resuelve "el mes actual" siempre en hora de Buenos Aires aunque el dueño sea de España, y `currentMonth()` del admin usa la hora del navegador.
**Fix:** mover el helper de meses a `shared/date-utils.ts` y una constante `DEFAULT_TENANT_TIMEZONE` (idealmente leída del gimnasio).

### LO-05: El "Te invitó" de la app muestra el nombre completo del invitador mientras que el resto de la lista respeta "nombre + inicial"

**Archivo:** `referrals/invitation-overview.ts:363` (`buildInvitedBy`, `inviterName` con apellido completo) vs `T-194-63` ("nombre de pila + inicial del apellido") aplicado en `nameParts`; mostrado en `el-templo-app/src/pages/MisInvitadosPage.vue:60`
**Fix:** usar `nameParts` también para el invitador en la respuesta del socio; dejar el nombre completo solo para la ficha del admin.

### LO-06: `phone`/`dni` se comparan sin normalizar el DNI y el teléfono se sobreescribe siempre

**Archivo:** `referrals/invitation-rules.ts:284-298,401-405` (`eq(users.dni, dni)` y `eq(i.invitedDni, dni)` literales), `invitation-service.ts:758` (`phone: data.phone` incondicional)
**Problema:** "12.345.678" y "12345678" son personas distintas para la regla anti-abuso, y el campo del DNI en la app es texto libre. Y un socio ex con teléfono válido en su ficha lo pierde si tipea otro (o un typo) al activar; el dedupe real por teléfono lo cubre `phone_taken`, pero el dato viejo se pisa sin dejar rastro.
**Fix:** normalizar DNI a `[0-9A-Za-z]` en mayúsculas antes de guardar y comparar, y no pisar `users.phone` si ya existe uno válido (o guardar el cambio en `audit_log`).

### LO-07: Copy y mensajes desfasados

**Archivo:** `el-templo-app/src/modules/progression/components/ReferralCtaCard.vue:62-63` (`FALLBACK_SUBTITLE` sigue diciendo "cada persona que traigas suma descuento a tu cuota", distinto del cuerpo nuevo de la migración 0261); `referrals/admin-routes.ts:68-71` (las rutas nuevas de invitaciones devuelven "No tenés acceso a los resultados del A/B test"); `admin-routes.ts` y `shared/permissions.ts` (`REFERRAL_AB_RESULTS_ROLES` gobierna el reporte de invitaciones y la bandeja de leads: el nombre ya no describe el uso); `el-templo-admin/.../InvitationCreateDialog.vue` y `TrialMemberFormDialog.vue` (`${activation.classesBudget} accesos` imprime "null accesos" si `classesBudget` es `null`)
**Fix:** alinear el fallback con el seed, mensaje 403 genérico, renombrar la constante a `REFERRAL_PROGRAM_REPORT_ROLES`, y contemplar `null` en las notificaciones.

### LO-08: Residuos del test A/B de copy que la fase vuelve a escribir

**Archivo:** `referrals/invitation-link.ts:29,153` (`copyVariant: referralCopyVariant(link.inviterId)` al materializar el vínculo)
**Problema:** el test A/B se retiró en la app (comentario de `ReferralCtaCard.vue`: "El helper de la app `utils/ab-variant.ts` se borró"), pero el backend sigue sellando variantes, `POST /cta-click` sigue recibiendo clics sin variante visible y existe una pestaña de analíticas para medirlo. La fase agrega un nuevo escritor al concepto muerto.
**Fix:** decidir si el A/B se retira del todo (ruta, columna, pestaña `ReferidosAbTab`) o se reactiva; en cualquier caso, no sumar escritores nuevos.

### LO-09: Ruido de formateo mezclado con la lógica en archivos tocados

**Archivo:** `members/routes.ts` (el bloque de `/search` reindentado completo, ~50 líneas), `auth/routes.ts` (`introStories*`, líneas ~1024, 1282, 1314), `referrals/service.ts` (`and(tenantWhere(...))`), `members/service.ts` (`crossBranch`), `communications/system-avisos.ts` (import multilínea), `db/schema/subscription-plans.ts` (reindentado de `specialLine`)
**Problema:** son cambios de Prettier sin relación con la fase que agrandan el diff y dificultan `git blame`.
**Fix:** para el futuro, commitear el formateo aparte; no es necesario revertirlos ahora.

### LO-10: Frontends

**Archivo:** `el-templo-app/src/pages/ActivarInvitacionPage.vue:226-263`, `el-templo-app/src/utils/pending-invitation.ts:27,34-40`, `el-templo-app/src/utils/signup-code.ts`, `el-templo-admin/src/components/TrialMemberFormDialog.vue:126-136`
**Problema (varios menores):**
- `ActivarInvitacionPage.vue` (398 líneas) mezcla contrato de API, máquina de estados y llamadas `api` directas; las respuestas de `eligibility` al cambiar de sede pueden llegar desordenadas (no hay contador anti-race como el que sí agregó el admin en `MemberSubscriptionTab`).
- El formato del código (`^[A-Z0-9-]{1,24}$`) vive en 3 lugares (servidor `codeProperty`, `pending-invitation.ts`, `signup-code.ts`), y los motivos "definitivos" (`DEFINITIVE_REASONS`) son strings copiados del servidor sin tipo compartido.
- El código pendiente en `localStorage` sobrevive a un cambio de cuenta en el mismo dispositivo: lo consume el próximo usuario que se loguee (7 días).
- `canInvite` del admin duplica `INVITATION_ASSISTED_ROLES` del backend.
**Fix:** sin urgencia; extraer un composable `useInvitationActivation` con contador de secuencia, y un único módulo de formato de código por app.

---

## Observaciones que NO son hallazgos (verificadas)

- **Atomicidad del vínculo de descuento:** `materializeInvitationLink` corre dentro de la tx del cobro en las 4 charge-paths; el `UNIQUE(referred_id)` se maneja sin lanzar. Correcto.
- **Doble descuento:** `applyArbiterResult` aplica un único ganador; AURA solo gana con monto estrictamente mayor y en empate NO gasta puntos (`coreCompetitorMatchesTier` comparte la función entre commit y preview). Correcto.
- **Cupo bajo concurrencia:** lock `FOR UPDATE` de invitador e invitado en orden de id antes del primer SELECT consistente; hay tests con `Promise.allSettled`. Correcto.
- **Tenancy:** todas las queries nuevas pasan por `tenantWhere`/`tenantValues` o llevan `tenant_id` inline en el SQL crudo; `lint:tenant` sin discrepancias; `invitations` está en `GYM_OWNED_TABLES` y en `TENANT_STRICT_MODULES`.
- **IDOR en rutas de socio:** el `userId` sale siempre del token; el body con claves extra (`invitedUserId`, `inviterId`) da 400 explícito por `rejectUnknownBodyKeys`.
- **Migraciones:** 0255 a 0257 idempotentes y sin datos de prueba; 0260 con guards por id y estado esperado; ningún `;` en comentarios SQL.
- **Base heredada de renovación (D-22):** `reconstructRenewalBase` y `invertAuraDiscount` son correctas (inversión exacta de `floor`, elige la solución mayor, fail-safe sin AURA con aviso).

---

## Salud general del código

La fase quedó **mantenible en lo nuevo y con deuda heredada que creció un poco**. Los 14 archivos de `referrals/invitation-*` son pequeños, puros donde se puede, con una responsabilidad clara y una densidad de tests muy superior al promedio del repo (cobros, concurrencia, paridad preview/cobro, aislamiento de tenant); el árbitro de descuentos es un buen diseño y el admin dejó de duplicar matemática de precios. Lo que sigue oliendo a spaghetti es el cableado: `subscriptions/service.ts` repite 4 veces el post-cobro y sigue creciendo, hay un ciclo de importaciones de 14 módulos, y el plan Invitación depende de flags editables sin protección. Los comentarios con IDs de decisión (`D-26b`, `T-194-86`, `194-15`) en el código de producción obligan a leer `.planning/` para entender qué hace una línea; conviene que cada comentario explique el porqué sin remitir al plan. Resolviendo HI-01, HI-02, ME-01 y ME-02 antes del push, la deuda nueva queda acotada.

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
