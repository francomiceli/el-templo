# Phase 194: Invitaciones (rebranding de referidos + accesos gratis + reglas anti-abuso + leads) - Context

**Gathered:** 2026-10-06 (relevamiento de código sobre `origin/master` `c17f79791` + lectura read-only de prod + 3 rondas de decisiones con Franco)
**Status:** Ready for planning
**Brief fuente:** `194-BRIEF-INVITACIONES.md` (de Nacho, 2026-10-06) — copia en este directorio.

<domain>
## Phase Boundary

El sistema de referidos de socios (fases 157/158/173) se convierte en **Invitaciones**:

1. **Rebranding** user-facing (app + admin): referido/referir → invitado/invitar/invitaciones. Links viejos `?ref=` siguen funcionando.
2. **Invitación con accesos gratis:** el socio invita; el invitado activa y recibe **3 accesos gratis en 10 días hábiles** en cualquier sede de su país. Durante ese período el invitado es un alumno **en prueba** (`users.status='prueba'`), NO un socio.
3. **Reglas anti-abuso:** invitador activo con cupo 2/mes (se consume al activar); invitado elegible solo si nunca fue socio o lleva ≥6 meses sin membresía, y si no recibió/usó invitación en los últimos 90 días (por persona, de quien sea).
4. **Descuento por conversión:** reusa el núcleo de la fase 157 (10%/vínculo, simétrico, recurrente mientras ambos activos) con los ajustes de D-08..D-12.
5. **"Mis invitados"** en la app (cupo restante, link, lista con estados derivados, descuento actual).
6. **Leads:** cada invitación activada crea/actualiza un lead con origen "Invitación" en el admin.
7. **Reporte del programa** en el admin.

**Fuera de esta fase:** partners/marcas (fase 179, tablas `partner_referrals` — NO tocar), cambios a la Sesión de Prueba comercial (SP, `bookings.is_trial`), auto-renovación, cualquier cambio a la definición de deuda.
</domain>

<decisions>
## Implementation Decisions

### Modelo conceptual (decidido con Franco, NO re-litigar)

- **D-01 (Sin estado de alumno nuevo):** el invitado queda en `users.status='prueba'` mientras usa sus accesos. NO se agrega valor al enum `USER_STATUS_VALUES`. Al activar la invitación: freemium/inactivo/prueba → `prueba` (registrar en `user_status_history`, source acorde).
- **D-02 (Accesos = plan `is_trial`, opción A):** los 3 accesos son una suscripción $0 a un plan **"Invitación"** con `subscription_plans.is_trial=1`, `plan_category='paquete'` (o la que el research determine que no choca), `multi_branch=1`, **uno por país** (AR y ES, moneda propia). Se asigna vía `assignPlan` con `priceOverrideAmount: 0` → `membership_kind='bonificada'`. Molde: `scheduling/partner-week-service.ts` (semana de regalo de partners) y `scheduling/especial-trial-service.ts` (Yoga). OJO: la semana de regalo de partners **nunca se usó en prod** (0 subs) — su código no está probado en uso real.
  - Cupo exacto 3: `classesRemaining = ceil(durationDays/7)*classesPerWeek` → plan con `duration_days=7`, `classes_per_week=3` + `endDateOverride` = 10 días hábiles (D-15). Alternativa válida si el research la prefiere: relajar `assertPlanInvariants` (`subscriptions/service.ts:~524`). Decidir en plan con justificación.
  - Reservas, check-in QR/coach/force, no-shows y el contador x/3 funcionan sin tocar (ya dependen de la suscripción, no del status).
- **D-03 (Invariante con nombre: "un plan `is_trial` da ACCESO, nunca MEMBRESÍA"):** se centraliza en **un único helper** (nombre sugerido `membershipSubscriptionWhere()` / fragmento SQL equivalente) usado por TODOS los predicados de "membresía vigente":
  - `recomputeUserStatus` (`subscriptions/service.ts:~7672`) — el EXISTS que pone `activo` y los 4 CASE de conversión de lead.
  - `activeMemberExists` y hermanos (`shared/active-member.ts`) — analytics/reportes.
  - `effectiveStatusExpr` del listado de alumnos (`members/service.ts:~319`) y el export.
  - `deriveCoveredUntil` y su versión batch (`subscriptions/service.ts:~290/~332`) — "activo" del descuento.
  - Hoy esas copias están duplicadas a mano: unificarlas es parte del objetivo (DRY explícito).
  - Prod verificado 2026-10-06: las únicas subs `is_trial` vigentes son 2 de Yoga (plan 193) y ambos usuarios tienen presencial vigente → **el cambio altera 0 estados hoy**. Plan 6 "Sesión de Prueba" AR: 2001 subs, todas cancelled/expired (1988 de un import del 2026-03-16).
- **D-04 (Tabla nueva `invitations` con historial):** una fila por invitación activada (invitador, invitado `users.id`, canal `self_service|assisted`, `activated_at`, `access_expires_at`, `subscription_id` de los accesos, `created_by`, tenant). Es la fuente de verdad del cupo mensual, la ventana de 90 días, los estados de "Mis invitados" y la etapa del lead. Nunca se borran filas.
- **D-05 (`referrals` = vínculo de descuento, se crea al comprar):** `referrals.referred_id` sigue UNIQUE. Para invitaciones, la fila de `referrals` se crea (directamente `qualified`) cuando el invitado compra su primer plan pago que admite descuento, a nombre del invitador de la **invitación más reciente** dentro de la ventana de D-13. Así `computeReferralDiscountPercent` y las 4 charge-paths + previews quedan casi intactos.
- **D-06 (Activación con sesión iniciada):** el registro hoy da 409 a quien ya existe (email, DNI, teléfono últimos 10 dígitos) → un ex socio o un lead cargado por recepción no puede pasar por `/register`. Flujo: link → (registro si no tiene cuenta | login si la tiene) → pantalla "Activar invitación" → servidor valida elegibilidad (D-11/D-12) + cupo del invitador (D-10) → crea `invitations` + asigna plan Invitación + status `prueba` + lead (D-18). Si la persona existe como lead sin email/password (alta de recepción), el research debe definir el camino (p.ej. canal asistido D-16, o "reclamar cuenta" por teléfono) — no crear duplicados.
- **D-07 (Compra mientras tiene accesos vigentes):** `paquete` y `presencial` comparten grupo de categoría y no pueden solaparse (`subscriptions/service.ts:~2009-2036`). Al comprar un plan real con accesos vigentes, cerrar el remanente de la sub de invitación en la misma transacción.

### Descuentos (decisiones de Franco 2026-10-06)

- **D-08 (Gana el mayor):** el descuento por invitación **no se acumula** con AURA ni otras promos: se aplica el mayor (hoy componen: AURA sobre base y referido sobre el neto — `subscriptions/service.ts:~2174-2289`). Precedente a copiar: partner vs AURA "gana el mayor". Aplica desde la próxima renovación también a los vínculos existentes (sin recortes retroactivos). Definir en research qué cuenta como "otra promo" (AURA, promoCode, price override manual, etc.).
- **D-09 (Tope % del invitador = 40%):** se mantiene `system_settings['referral.max_percent_cap']=40` (el brief proponía 50; Franco decidió 40). Configurable sin deploy.
- **D-10b (Planes que admiten descuento = flag por plan):** columna nueva en `subscription_plans` tipo `allows_invitation_discount` (default a definir: true para presencial mensual; el research propone backfill), editable en el admin de planes. Si el plan del cobro no la tiene, ni cualifica ni descuenta. Se suma a las exclusiones existentes (`excludedFromReferrals`: `especial`, `paquete`; prorrateo a fin de mes).
- **D-10c (Tope en dinero por cobro):** máximo absoluto de descuento por invitación por cobro, **por país** (ARS/EUR), en `system_settings` (o `tenant_settings` si corresponde por tenancy). **Arranca VACÍO = sin tope**; gestión lo carga cuando quiera (UI de configuración en admin). Ejemplo: tope $20.000 → PROGRAMA 6 MESES $360.000 con 10% descontaría $20.000 en vez de $36.000.
- **D-10d ("Activo" = membresía vigente):** se mantiene la definición actual (cobertura vigente vía `deriveCoveredUntil`, ahora excluyendo planes `is_trial` por D-03). Sin chequeo de deuda ni asistencia.
- **D-10e (Del brief, ya implementado):** invitado 10% fijo mientras él y su invitador sigan activos; invitador 10% por invitado activo hasta el tope; se recalcula en cada cobro; la baja aplica desde la próxima renovación. Es lo que ya hace el núcleo simétrico de la 157 — verificar equivalencia, no reescribir.

### Reglas de invitación

- **D-10 (Cupo invitador):** 2 invitaciones por mes calendario (tz de la sede del invitador). Se consume al **activar**, no al compartir. No acumula. El invitador debe tener membresía vigente (D-10d) para que se active una invitación suya.
- **D-11 (Elegibilidad del invitado — historial):** nunca tuvo membresía (subs no-`is_trial`), o su última cobertura terminó hace **≥ 6 meses**. Un socio vigente no puede ser invitado.
- **D-12 (Elegibilidad — ventana 90 días por PERSONA):** no puede haber activado una invitación (de quien sea) en los últimos 90 días. La SP comercial previa **no bloquea**.
- **D-13 (Compra tardía):** si el invitado compra **hasta 30 días después** del vencimiento de sus accesos, el vínculo de descuento igual se crea. Pasado eso, no. Configurable.
- **D-14 (Sedes):** accesos válidos en **cualquier sede del país** del invitado (plan por país + `multi_branch=1`). NO cross-country (el guard `booking-service.ts:~223-241` se mantiene).
- **D-15 (Días hábiles = lun-sáb menos feriados):** vigencia = 10 días hábiles desde la activación, contando lunes a sábado y excluyendo feriados de la tabla `holidays` del país de la sede (`scheduling/holiday-service.ts`). Helper nuevo (no existe ninguno de business days). Usar tz de la sede (`shared/date-utils.ts`). Ojo: la expiración de subs hoy compara en UTC (`subscriptions/service.ts:~6432`).
- **D-16 (Canal asistido):** recepción/gestión puede **crear la invitación en nombre del socio** desde el admin, con las **mismas reglas** (cupo + elegibilidad). Es el canal que de verdad se usa: 7 de 9 vínculos actuales son `assisted`.
- **D-17 (Asignación retroactiva se mantiene):** el "¿Quién lo trajo?" de la ficha (`assignReferrerToMember`, `POST /admin/members/:userId/referrals`) para alguien que ya compró sin invitación sigue creando un vínculo de **descuento sin accesos**, con las reglas nuevas (flag por plan, tope), y **NO consume cupo**.
- **Identificación:** **teléfono obligatorio** en el flujo de invitación (registro y alta asistida); DNI opcional. Dedupe contra socios y leads existentes por teléfono normalizado (últimos 10 dígitos, como `checkDuplicates`) + DNI + email. Ojo inconsistencia conocida: self-service guarda con `sanitizePhoneForStorage` y `createTrialMember` compara con `normalizePhone`.

### Leads

- **D-18 (Reusar `lead_status`):** se mantienen `en_seguimiento|ganado|perdido`. Al activar → `en_seguimiento` con **origen "Invitación"** (campo nuevo de origen del lead, o derivado de `invitations` — decidir en research) + invitador vinculado. **Etapa derivada** (Invitado / Entrenando / Vencido) calculada desde `invitations` + asistencias, mostrada como etiqueta. Compra → `ganado`. El cron `jobs/expire-lost-leads.ts` (`leads.perdido_window_days=5` en prod) **NO toca leads de invitación**.
  - El gate de conversión en `recomputeUserStatus` hoy exige `EXISTS bookings.is_trial=1`: extenderlo con "o tiene una invitación activada". NO marcar las reservas del invitado como `is_trial` (contaminaría SP: cupo 3/turno, cadencia M1-M3, reportes de SP).
  - Datos visibles: fecha de activación, accesos usados x/3, vencimiento, sede donde entrenó. Filtro por origen "Invitación" en el listado de leads.

### App y admin

- **"Mis invitados"** (renombra `MisReferidosPage.vue`): "Te quedan N de 2 invitaciones", compartir link, lista de invitados con estado derivado (Invitado / Entrenando / Vencido / Socio activo / Inactivo), descuento actual y cuántos invitados activos lo generan. Estados 100% derivados, nada manual.
- **Links:** nueva ruta de invitación; `/register?ref=CODE` sigue funcionando (redirect o compat). URL base hoy hardcodeada en `MisReferidosPage.vue:~161`.
- **Rebranding:** todo copy user-facing (app, admin, notificación `referral_link_activated`, aviso `card_referral`, segmento `referidos_pendientes`, tab "Referidos" de la ficha, tab A/B de Analíticas, línea "Descuento referido" en previews de `AssignPlanDialog.vue`). Nombres internos quedan.
- **D-19 (Reporte):** incluido — invitaciones activadas por mes, tasa de conversión (compran / activan), invitados activos totales, monto de descuentos por mes (de `referral_credits`).
- **Parámetros configurables** (ninguno hardcodeado): cupo/mes (2), accesos (3), vigencia (10 días hábiles), ventana reinvitación (90 d), inactividad ex socio (6 meses), ventana compra tardía (30 d), % invitado (10), % por invitado activo (10, hoy `aura_config.referral`), tope % (40), tope dinero por país (vacío).

### Migración de datos existentes

- Los 9 vínculos actuales (8 qualified, 1 pending) se conservan con sus descuentos. Nadie pierde descuento por el cambio de reglas, salvo el paso a "gana el mayor" desde la próxima renovación (D-08). Nadie supera el tope (máx actual 10%).
- **Corregir vínculo 3 invertido:** en prod figura referrer Guido (7286) → referred Valentina (6613); fue Valentina quien compartió su código (memoria `project_referidos_asignacion_retroactiva`). Hoy no cambia plata (simétrico); con el modelo invitador/invitado sí. Corrección por **migración de datos** (prod data via migrations), con guard por ids + estado esperado.
- Backup de tablas involucradas antes de migrar; correr primero sobre copia y validar conteos (9 vínculos, 16 `referral_credits` al 2026-10-06).

### Claude's Discretion

- Nombres internos de tablas/columnas/helpers.
- Si el plan Invitación usa `endDateOverride` o se relaja `assertPlanInvariants` (justificar).
- Dónde viven los parámetros (`system_settings` vs `tenant_settings`) según lo que exija la tenancy de v6.0.
- División en planes (fine granularity).
</decisions>

<canonical_refs>
## Canonical References (origin/master `c17f79791`, líneas aproximadas)

- Referidos: `el-templo-api/src/modules/referrals/service.ts` (config `:67-72,:182-206`; `computeReferralDiscountPercent` `:227-282`; estados derivados `:364-380`; `qualifyFirstPayment` `:420-470`; `assignReferrerToMember`), `db/schema/referrals.ts`, `db/schema/referral-credits.ts`, mig `0176_referrals_core.sql`.
- Charge paths con descuento: `subscriptions/service.ts` `assignPlan` (`:2280`), `changePlanNow` (`:4465`), `changePlanAfterCurrent` (`:5083`), `renewSubscription` (`:5756`, add-back `:5636`), previews (`:4216`, `:6379` `getPricingPreview`); `qualifyReferralOnCharge` (`:712`); exclusiones `subscriptions/types.ts:129-145`.
- Status/lead: `recomputeUserStatus` `subscriptions/service.ts:7672-7849`; `shared/active-member.ts`; `members/service.ts:~319` (`effectiveStatusExpr`); `jobs/expire-lost-leads.ts`; `members/leads-routes.ts`; `analytics/trial-funnel-service.ts`.
- Molde accesos $0: `scheduling/partner-week-service.ts` (`:276-316`), `scheduling/especial-trial-service.ts` (cabecera explica `is_trial` del plan).
- Registro: `auth/routes.ts` (dedupe `:105-205`, atribución `:456-500`, código `:561`), `auth/schemas.ts:1-30`, app `pages/RegisterPage.vue` (`:244` ref, `:265` comentario App Store), `utils/signup-code.ts`, `resolveSignupCode`.
- App: `pages/MisReferidosPage.vue`, `modules/progression/components/ReferralCtaCard.vue`, `pages/ProfilePage.vue:89-92`, `config/destinations.ts:44`, `communications/system-avisos.ts:171`.
- Admin: `components/MemberReferralsTab.vue`, `components/ReferrerSelect.vue`, `MemberFormDialog.vue:153`, `AssignPlanDialog.vue:449,641,724`, `components/analytics/ReferidosAbTab.vue`, `AlumnosPage.vue`, `TrialSessionsReport.vue`.
- Reservas/check-in: `scheduling/booking-service.ts` (país `:223-241`, saldo `:253-261`, ventana `:64-65`), `attendance/service.ts` (multi_branch `:180-198`, QR `:330-346`, coach `:834/:951-965`, force `:534-548`).
- Feriados/tz: `db/schema/holidays.ts`, `scheduling/holiday-service.ts`, `shared/date-utils.ts`.
- Tests existentes: `test/referrals/*` (14 archivos), `test/auth/register.test.ts`, `test/members/check-duplicates.test.ts`, `test/tenancy/iso-03-referrals.test.ts`.
</canonical_refs>

<code_context>
## Gates y trampas conocidas (de memoria del proyecto)

- **Migraciones:** origin/master y staging en **0254**; el tren v6.1 (`feat/v6.1-gimnasio`, sin push) ocupa 0245-0253 → esta fase arranca en **0255**. Verificar al momento de ejecutar. SQL hand-written junto al schema, mismo commit, sin `;` en comentarios `--`. Nunca `drizzle-kit migrate`.
- **Tabla gym-owned nueva** (`invitations`) toca 5 conteos fijos de tenancy (memoria `reference_tabla_gym_owned_nueva_cinco_conteos`). **Ruta/job nuevo** dispara 3 gates (manifiesto `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` en `test/tenancy/iso-01-manifiesto.test.ts` + `lint:tenant`). Correr `pnpm lint:tenant` local.
- Drizzle `mysqlEnum` 1er arg = nombre de columna; columnas sin calificar en subqueries.
- `users.status` enum replicado a mano en ~10 lugares (no se toca por D-01).
- CI no typechequea app ni admin → `vue-tsc` local.
- App: cambios en la app socio → bump de `el-templo-app/version.txt` (feature = minor) + builds de tienda.
- Tests: nunca hardcodear `users.id`; fechas fijas rompen por calendario; UTC vs `todayInTz(sede)`.
- **Pendiente de research:** cómo el monto de domiciliación (`direct_debit`, ES) refleja el descuento recalculado en cada cobro.
</code_context>

<deferred>
## Deferred

- Nada del brief queda diferido: el reporte opcional entra (D-19).
</deferred>
