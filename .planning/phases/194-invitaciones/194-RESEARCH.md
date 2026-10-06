# Phase 194: Invitaciones - Research

**Researched:** 2026-10-06
**Domain:** Backend Fastify + Drizzle/MySQL (suscripciones, precios, leads, tenancy v6.0) + app Quasar (socio) + admin Quasar
**Confidence:** HIGH en el mapa del código (leído línea por línea sobre `origin/master` `c17f79791`); MEDIUM en dos hallazgos de comportamiento que conviene fijar con un test de caracterización antes de cambiar (ver Pitfalls 4 y 5)

<user_constraints>
## User Constraints (de CONTEXT.md)

### Decisiones cerradas (copiadas de 194-CONTEXT.md; no se reabren)

**Modelo conceptual**
- **D-01 (Sin estado de alumno nuevo):** el invitado queda en `users.status='prueba'` mientras usa sus accesos. NO se agrega valor al enum `USER_STATUS_VALUES`. Al activar la invitación: freemium/inactivo/prueba → `prueba` (registrar en `user_status_history`, source acorde).
- **D-02 (Accesos = plan `is_trial`, opción A):** los 3 accesos son una suscripción $0 a un plan **"Invitación"** con `subscription_plans.is_trial=1`, `plan_category='paquete'` (o la que el research determine que no choca), `multi_branch=1`, **uno por país** (AR y ES, moneda propia). Se asigna vía `assignPlan` con `priceOverrideAmount: 0` → `membership_kind='bonificada'`. Molde: `scheduling/partner-week-service.ts` y `scheduling/especial-trial-service.ts`. OJO: la semana de regalo de partners **nunca se usó en prod** (0 subs).
  - Cupo exacto 3: `classesRemaining = ceil(durationDays/7)*classesPerWeek` → plan con `duration_days=7`, `classes_per_week=3` + `endDateOverride` = 10 días hábiles (D-15). Alternativa válida si el research la prefiere: relajar `assertPlanInvariants` (`subscriptions/service.ts:~524`). Decidir en plan con justificación.
  - Reservas, check-in QR/coach/force, no-shows y el contador x/3 funcionan sin tocar.
- **D-03 (Invariante con nombre: "un plan `is_trial` da ACCESO, nunca MEMBRESÍA"):** se centraliza en **un único helper** usado por TODOS los predicados de "membresía vigente": `recomputeUserStatus` (EXISTS + 4 CASE), `activeMemberExists` y hermanos, `effectiveStatusExpr` + export, `deriveCoveredUntil` y batch ("activo" del descuento). Unificar copias duplicadas es parte del objetivo. Prod 2026-10-06: el cambio altera 0 estados hoy. Plan 6 "Sesión de Prueba" AR: 2001 subs, todas cancelled/expired (1988 de un import del 2026-03-16).
- **D-04 (Tabla nueva `invitations` con historial):** una fila por invitación activada (invitador, invitado, canal `self_service|assisted`, `activated_at`, `access_expires_at`, `subscription_id`, `created_by`, tenant). Fuente de verdad del cupo, ventana de 90 días, estados de "Mis invitados" y etapa del lead. Nunca se borran filas.
- **D-05 (`referrals` = vínculo de descuento, se crea al comprar):** `referrals.referred_id` sigue UNIQUE. La fila se crea (directamente `qualified`) cuando el invitado compra su primer plan pago que admite descuento, a nombre del invitador de la **invitación más reciente** dentro de la ventana de D-13.
- **D-06 (Activación con sesión iniciada):** link → (registro | login) → pantalla "Activar invitación" → servidor valida elegibilidad (D-11/D-12) + cupo (D-10) → crea `invitations` + asigna plan Invitación + status `prueba` + lead (D-18). Lead sin email/password: el research define el camino (canal asistido o "reclamar cuenta") — no crear duplicados.
- **D-07 (Compra con accesos vigentes):** al comprar un plan real con accesos vigentes, cerrar el remanente de la sub de invitación en la misma transacción.

**Descuentos**
- **D-08 (Gana el mayor):** no se acumula con AURA ni otras promos: se aplica el mayor. Precedente partner vs AURA. Aplica desde la próxima renovación también a vínculos existentes. El research define qué cuenta como "otra promo".
- **D-09 (Tope % del invitador = 40%):** se mantiene `system_settings['referral.max_percent_cap']=40`.
- **D-10b (Flag por plan):** columna nueva tipo `allows_invitation_discount`, editable en el admin; si el plan no la tiene, ni cualifica ni descuenta. Se suma a `excludedFromReferrals` y al prorrateo.
- **D-10c (Tope en dinero por cobro, por país):** arranca VACÍO = sin tope; UI de configuración en admin.
- **D-10d ("Activo" = membresía vigente):** cobertura vigente vía `deriveCoveredUntil` excluyendo `is_trial`. Sin deuda ni asistencia.
- **D-10e:** invitado 10% fijo mientras ambos activos; invitador 10% por invitado activo hasta el tope; recálculo en cada cobro; baja desde la próxima renovación. Verificar equivalencia, no reescribir.

**Reglas de invitación**
- **D-10 (Cupo):** 2/mes calendario (tz de la sede del invitador), se consume al activar, no acumula, invitador con membresía vigente.
- **D-11:** invitado nunca tuvo membresía (subs no-`is_trial`) o su última cobertura terminó hace ≥ 6 meses. Un socio vigente no puede ser invitado.
- **D-12:** ventana de 90 días por PERSONA; la SP comercial no bloquea.
- **D-13 (Compra tardía):** hasta 30 días después del vencimiento de los accesos el vínculo igual se crea. Configurable.
- **D-14 (Sedes):** cualquier sede del país; NO cross-country.
- **D-15 (Días hábiles):** lun-sáb menos feriados de `holidays` del país; helper nuevo; tz de la sede; ojo expiración UTC.
- **D-16 (Canal asistido):** recepción crea la invitación en nombre del socio con las mismas reglas.
- **D-17:** "¿Quién lo trajo?" retroactivo sigue creando vínculo de descuento sin accesos, con reglas nuevas, sin consumir cupo.
- **Identificación:** teléfono obligatorio en el flujo de invitación; DNI opcional; dedupe por teléfono (últimos 10) + DNI + email.

**Leads**
- **D-18:** se reusan `en_seguimiento|ganado|perdido`; al activar → `en_seguimiento` con origen "Invitación" (campo nuevo o derivado — decide el research) + invitador. Etapa derivada (Invitado/Entrenando/Vencido). Compra → `ganado`. El cron `expire-lost-leads` NO toca leads de invitación. Gate de conversión de `recomputeUserStatus` extendido con "o tiene invitación activada"; NO marcar reservas como `is_trial`. Filtro por origen en el listado de leads.

**App y admin**
- "Mis invitados" (renombra `MisReferidosPage.vue`): cupo, link, lista con estados derivados (Invitado/Entrenando/Vencido/Socio activo/Inactivo), descuento. Links `/register?ref=CODE` siguen funcionando. Rebranding de todo copy user-facing; nombres internos quedan.
- **D-19 (Reporte):** activaciones/mes, conversión, invitados activos, monto de descuentos/mes (`referral_credits`).
- Parámetros configurables: cupo (2), accesos (3), vigencia (10 hábiles), ventana reinvitación (90 d), inactividad ex socio (6 m), compra tardía (30 d), % invitado (10), % por invitado activo (10), tope % (40), tope dinero por país (vacío).

**Migración de datos:** 9 vínculos (8 qualified, 1 pending) se conservan; corregir vínculo 3 invertido (prod: referrer 7286 → referred 6613 debe quedar 6613 → 7286) por migración con guard; backup + correr sobre copia y validar (9 vínculos, 16 `referral_credits`).

### Claude's Discretion
- Nombres internos de tablas/columnas/helpers.
- `endDateOverride` vs relajar `assertPlanInvariants` (justificar).
- `system_settings` vs `tenant_settings` según tenancy v6.0.
- División en planes (granularidad fine).

### Deferred Ideas (OUT OF SCOPE)
- Nada del brief queda diferido (D-19 entra). Fuera de fase: partners/marcas (`partner_referrals`, salvo el guard mínimo de Pitfall 2), SP comercial (`bookings.is_trial`), auto-renovación, definición de deuda.
</user_constraints>

<phase_requirements>
## Phase Requirements

La fase no tiene REQ-IDs; los criterios de éxito del ROADMAP (SC-1..SC-6) hacen de requisitos.

| ID | Descripción | Qué lo habilita en este research |
|----|-------------|----------------------------------|
| SC-1 | Socio activo comparte link; el invitado (nuevo o ex socio ≥6 m) activa, queda en `prueba`, reserva y hace check-in de hasta 3 clases en cualquier sede de su país durante 10 días hábiles | Plan Invitación (§Patrón 2), activación (§Patrón 3), días hábiles (§Patrón 6), elegibilidad (§Patrón 4), migración de sede virtual→física (Pitfall 1) |
| SC-2 | Cupo 2/mes y ventana 90 días por persona en app y recepción | `invitations` + locks (§Patrón 3), servicio único para ambos canales (§Arquitectura) |
| SC-3 | Descuento si compra un plan habilitado (hasta 30 d tarde); gana el mayor vs AURA/promos; tope 40% y tope en dinero por país | Árbitro de descuentos (§Patrón 5), flag por plan, tope en dinero, materialización del vínculo al cobrar |
| SC-4 | Un plan `is_trial` nunca vuelve "activo" a nadie: invariante en un único helper | Inventario D-03 (§Patrón 1) — 13 sitios con file:line |
| SC-5 | "Mis invitados" + lead con origen Invitación + reporte | §Patrón 7 (estados), §Patrón 8 (leads), §Patrón 9 (reporte) |
| SC-6 | Vínculos existentes conservan historial; vínculo invertido corregido por migración | §Plan de migraciones, migración 0259 con guards |
</phase_requirements>

## Project Constraints (de CLAUDE.md y skills del repo)

- **Logging:** API con Pino (`request.log`/`app.log`), nunca `console.log`. Front: `createLogger()`.
- **TypeScript:** sin `any`; `catch (err: unknown)` + `instanceof Error`.
- **Tests de API:** toda ruta nueva lleva test de integración en `el-templo-api/test/` contra MySQL real; nunca hardcodear `users.id`; fechas relativas a `todayStr()/dateOffsetStr()` o `todayInTz(sede)` (memorias `reference_test_*`). Suite completa la corre CI; local: typecheck + el archivo de test nuevo.
- **Migraciones:** escritas a mano en `el-templo-api/src/db/migrations/NNNN_*.sql`, en el MISMO commit que el schema `.ts`; nunca `drizzle-kit migrate`; nunca `;` dentro de un comentario `--`; `mysqlEnum` primer argumento = nombre físico de columna; datos de prod por migración, datos de test nunca; statements idempotentes (`WHERE NOT EXISTS`). Staging y prod comparten host MySQL.
- **Env vars:** si se agrega una, actualizar `.env.example` (esta fase no necesita ninguna).
- **Patrones:** servicios fachada para lógica compleja; Pinia con `setup`; composables con `cleanup()`.
- **Change control:** `git add` por ruta explícita; staging-first; preguntar antes de push/SSH; no instalar dependencias sin permiso; bump de `el-templo-app/version.txt` (feature = minor) para builds de tienda; checkout principal compartido.
- **Tenancy v6.0:** `tenant_id` siempre server-side; `tenantWhere`/`tenantValues`; ruta nueva → manifiesto + `ENTRADAS_BASELINE` (+ caso ISO-03 si cae en un prefijo vigilado); tabla nueva → 5 conteos fijos; correr `pnpm lint:tenant` local.
- **Ejecución GSD:** planes detallados con must_haves; ejecutores secuenciales (worktree compartido); tests solo en foreground.

## Summary

El núcleo de referidos (fases 157/158/173) ya implementa casi todo el modelo de descuento del brief: vínculo simétrico, 10% por vínculo cuya contraparte tiene cobertura, tope 40%, recálculo en cada cobro y baja desde la próxima renovación (`referrals/service.ts:227-282`). D-10e es equivalente a lo que hay (verificado). Lo nuevo de verdad está en cuatro frentes: (1) **accesos gratis** como suscripción a un plan `is_trial` (nada en el código distingue hoy un plan `is_trial` de una membresía: hay **13 predicados** que habría que cambiar para que el invitado no quede "activo", y el export SEPA de España está entre ellos); (2) **reglas anti-abuso**, que necesitan la tabla `invitations` más locks de fila para no pasarse del cupo bajo concurrencia; (3) **"gana el mayor"**, que obliga a decidir el ganador ANTES del filtro AURA (hoy AURA, partner y referido se suman en 3 de las 4 charge-paths) y a comparar **montos**, no porcentajes, porque existe el tope en dinero; (4) **leads**, porque el pipeline de leads del admin es el reporte de Sesiones de Prueba (una fila por reserva SP) y los invitados no tienen reservas SP.

Encontré cinco trampas que el CONTEXT no anticipa y que rompen la fase si nadie las ve: (a) `assignPlan` **rechaza** un plan del grupo presencial (incluye `paquete`) a un socio con sede virtual, y el autorregistro deja al socio en la sede virtual ONLINE salvo que venga `?branchId` (`auth/routes.ts:184-216`, `subscriptions/service.ts:1931-1951`). La activación tiene que mudar al invitado a una sede física antes de asignar. (b) La semana de regalo de partners busca su plan por `(paquete, 7 días, 3/sem)` sin mirar `is_trial` (`partner-week-service.ts:278-292`): un plan Invitación con esos mismos valores puede chocar con ella. (c) `deriveCoveredUntil` también alimenta el bloqueo de reservas por cobertura (`booking-service.ts:199-203`). Si se le saca `is_trial` en el lugar, al invitado se le rompe el bloqueo de fechas. Hacen falta dos semánticas: cobertura de acceso y cobertura de membresía. (d) El admin **recalcula en el cliente** el descuento de referido como `floor(base*pct/100)` en el diálogo de renovación (`MemberSubscriptionTab.vue:1125`) y en la rama de precio personalizado (`AssignPlanDialog.vue:1601-1603`). Con tope en dinero y "gana el mayor", el monto precargado no va a coincidir con el que calcula el servidor y el cobro se rechaza. (e) La base de renovación suma de vuelta el descuento de referido pero no el de AURA ni el de partner (`service.ts:5398-5401`), así que esos descuentos quedan pegados en todas las renovaciones siguientes. Con "gana el mayor" eso termina en acumulación encubierta.

**Recomendación principal:** construir primero, y aparte, la invariante D-03 (helper `shared/membership.ts` + migración de los 13 sitios + tests de caracterización; hoy no cambia ningún estado). Después la tabla, los planes y el `InvitationService` único para los dos canales. Después el árbitro de descuentos en un solo módulo usado por las 4 charge-paths y los 3 previews, con el admin pasando a consumir montos del servidor. Y al final las superficies (app, admin, reporte). La invariante tiene que estar en producción ANTES de que exista la primera sub de invitación: si no, el invitado queda `activo` en el mismo `assignPlan`.

## Architectural Responsibility Map

| Capacidad | Tier principal | Tier secundario | Por qué |
|-----------|----------------|-----------------|---------|
| Invariante "is_trial ≠ membresía" | API / DB (fragmento SQL) | — | Lo consumen UPDATEs crudos, analytics y exports; tiene que vivir como SQL |
| Elegibilidad, cupo y ventana | API (`InvitationService`) | DB (locks de fila) | Antifraude: jamás en el cliente; el canal asistido y la app comparten un único servicio |
| Activación (sub de accesos, status, lead) | API | — | Transiciones de estado con historial; `assignPlan` es el único camino a `bonificada` |
| Días hábiles | API (función pura + loader de `holidays`) | — | Depende de la tz de la sede y de los feriados por país del tenant |
| Árbitro de descuentos (gana el mayor, flag, tope $) | API (`subscriptions`) | Módulo AURA vía hook `pricing.adjust` | Tiene que ser idéntico en cobro y preview; AURA vive detrás del filter |
| Precio mostrado en el admin | API (preview) | Admin (solo render) | El admin no puede recomputar: hoy duplica la cuenta y desincroniza (Pitfall 6) |
| Estados de "Mis invitados" / etapa del lead | API (derivados en lectura) | App/Admin render | "100% derivados, nada manual"; no hace falta cron |
| Parámetros configurables | DB `tenant_settings` (nuevos) + `system_settings` (tope 40 existente) | Admin UI (settings) | Regla v6.1 "todo parámetro en tenant_settings"; precedente `whatsapp.sales_number.<PAIS>` |
| Link de invitación | App web (`app.eltemplo.org`) | App nativa | El AASA solo cubre `/r/trial*` → el link abre en el navegador |

## Standard Stack

No hay librerías nuevas. Todo se construye con lo que ya está en el repo.

### Core (existente, verificado en el árbol)
| Pieza | Dónde | Para qué en esta fase |
|-------|-------|------------------------|
| Fastify + Drizzle ORM (mysql2) | `el-templo-api` | Rutas y servicios nuevos |
| `tenantWhere`/`tenantValues`/`assertTenant` | `src/modules/shared/tenant.ts` | Toda query nueva [VERIFIED: código] |
| `assignPlan` (con `endDateOverride`, `priceOverrideAmount`) | `subscriptions/service.ts:1885`, `:2098-2112` | Sub de accesos $0 → `bonificada` [VERIFIED: código] |
| `resolvePlanPrice` + hook `pricing.adjust` | `subscriptions/pricing.ts:108`, `aura/pricing-benefits.ts` | Competencia con AURA vía `competingDiscountPercent` [VERIFIED: código] |
| `todayInTz`, `addDays` | `shared/date-utils.ts:120`, `:15` | Fechas por sede [VERIFIED: código] |
| `holidays` (por tenant + país) | `db/schema/holidays.ts`, `scheduling/holiday-service.ts:142-215` | Días hábiles [VERIFIED: código] |
| `tenant_settings` KV | `db/schema/tenants.ts:73-85`; precedente `communications/sales-number.ts` | Parámetros nuevos por país [VERIFIED: código] |
| `normalizePhone` / `sanitizePhoneForStorage` | `shared/phone.ts:11`, `:34` | Dedupe por últimos 10 dígitos [VERIFIED: código] |
| vitest 4 + MySQL real | `el-templo-api/vitest.config.ts`, `test/helpers.ts` | Tests de integración [VERIFIED: código] |

**Instalación:** ninguna.

## Package Legitimacy Audit

La fase no instala paquetes externos, así que no corresponde correr slopcheck.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (ninguno) | — | — | — | — | — | — |

**Packages removidos:** ninguno. **Sospechosos:** ninguno.
**Ojo:** `vue-tsc` **no está instalado** ni en `el-templo-app` ni en `el-templo-admin` (verificado en `node_modules/.bin` y en el store pnpm del checkout principal). Para typechequear los `.vue` habría que instalarlo, y eso necesita permiso explícito de Franco (regla de dependencias). Ver Environment Availability.

## Architecture Patterns

### Diagrama del sistema

```
                 ┌──────────────── App socio (web app.eltemplo.org / nativa) ───────────────┐
 link /invitacion/CODE ─▶ Landing ─┬─ sin sesión ─▶ /register?ref=CODE (tel obligatorio) ─┐
 link viejo /register?ref=CODE ────┘─ con sesión ───────────────────────────────────────┐   │
                                                                                         ▼   ▼
                                                     Pantalla "Activar invitación" (sede física + tel)
                                                                     │ POST /api/members/referrals/invitations/activate
 Admin ficha ─ "Crear invitación" (canal asistido) ─ POST /api/admin/members/:id/invitations ─┐
                                                                     ▼                        ▼
                                          ┌─────────── InvitationService.activate(ctx, ...) ───────────┐
                                          │ 1. resolver invitador (código o id) en el tenant            │
                                          │ 2. tx corta: SELECT ... FOR UPDATE (invitador, invitado)    │
                                          │    · invitador con membresía vigente (D-10d)                │
                                          │    · cupo del mes en tz del invitador (D-10)                │
                                          │    · invitado: sin membresía ≥6 m (D-11), 90 d persona (D-12)│
                                          │    · INSERT invitations (status=active)                     │
                                          │ 3. mudar a sede física + tel + status prueba + lead         │
                                          │ 4. assignPlan(plan Invitación del país, $0, endDateOverride)│
                                          │    └─ si falla: invitations.status=voided (compensación)    │
                                          └──────────────────────────────────────────────────────────────┘
                                                                     │
         Reservas / check-in / no-shows  ◀── sub paquete is_trial (3 clases, vence día hábil 10)
                                                                     │
  Cobro de plan real (assignPlan | changePlanNow | changePlanAfterCurrent | renewSubscription)
         │ 0. D-07: cerrar sub de invitación vigente del mismo grupo (status completed)
         │ 1. candidato de vínculo: invitación activa o vencida hace ≤30 d (D-13) + flag del plan
         │    → crea referrals(qualified) si el cobro es pago (D-05)
         │ 2. árbitro: montos de partner / invitación (tope $ por país) vs AURA (pre-filter)
         │ 3. aplica el ganador; referral_credits; notificación al invitador
         ▼
  recomputeUserStatus (helper D-03) → status activo + lead ganado (gate EXISTS invitations)
         ▼
  Lecturas derivadas: "Mis invitados" (GET /api/members/referrals), ficha admin, Reportes ▸ Invitaciones
```

### Estructura recomendada
```
el-templo-api/src/
├── modules/shared/membership.ts          # NUEVO: invariante D-03 (fragmentos SQL)
├── modules/shared/business-days.ts       # NUEVO: addBusinessDays puro + loader de feriados
├── modules/invitations/                  # NUEVO módulo (o dentro de referrals/; ver nota)
│   ├── service.ts                        # InvitationService: elegibilidad, activar, anular, listar
│   ├── settings.ts                       # lectura/escritura tenant_settings invitations.*
│   ├── states.ts                         # derivación pura de estados (Invitado/Entrenando/…)
│   ├── report-service.ts                 # D-19 + listado de leads de invitación
│   └── types.ts
├── modules/subscriptions/discount-arbiter.ts  # NUEVO: gana el mayor + flag + tope $ (único lugar)
├── db/schema/invitations.ts              # NUEVO
└── db/migrations/0255..0260_*.sql
```
Nota de tenancy: si `invitations` se agrega al módulo strict `referrals` de `TENANT_STRICT_MODULES` (`src/db/tenant-tables.ts:637`), conviene que el código viva en `modules/referrals/` (por ejemplo `referrals/invitation-service.ts`), así el boundary del módulo coincide con el de sus tablas. Es lo recomendado: menos superficie para el lint.

### Patrón 1: Invariante D-03 — inventario exhaustivo y forma del helper

**Inventario (todas en `el-templo-api/src/`; [VERIFIED: grep de `start_date <= CURDATE()`, `subscription_status IN ('active'`, `inArray(subscriptions.status, ["active"`]):**

| # | Sitio | Qué hace | Acción |
|---|-------|----------|--------|
| 1 | `modules/subscriptions/service.ts:7721-7731` | `u.status = CASE WHEN EXISTS(sub vigente) THEN 'activo'` | Usar helper |
| 2 | `…service.ts:7732-7747` | `lead_status='ganado'` (EXISTS sub vigente AND EXISTS SP) | Helper + gate extendido (§Patrón 8) |
| 3 | `…service.ts:7748-7763` | `lead_status_source='auto'` (mismo gate) | Ídem |
| 4 | `…service.ts:7764-7789` | `purchased_plan_id` (gate + subquery `s2` del plan) | Helper en el gate Y en `s2` (que no elija el plan Invitación) |
| 5 | `…service.ts:7790-7808` | `converted_at` (mismo gate) | Ídem |
| 6 | `modules/shared/active-member.ts` | 5 helpers: `activeMemberExists`, `activeNonEspecialMemberExists`, `activePayingNonEspecialMemberExists`, `activeSubOfKindExists`, `activePayingMemberExists` (cada uno en 2 variantes ctx/sin ctx) | Reescribirlos sobre el helper (son ~10 copias del mismo EXISTS) |
| 7 | consumidores de (6): `analytics/service.ts:339-353,377,496,861,993`, `analytics/engagement-service.ts:86,183`, `analytics/retention-service.ts:339`, `analytics/advanced-finance-service.ts:415`, `reports/service.ts:1692`, `members/service.ts:624,2555` | KPIs, churn, ARPU, filtro de membresía, **export SEPA** | Se arreglan solos al cambiar (6) |
| 8 | `modules/members/service.ts:319-332` | `effectiveStatusExpr` del listado de alumnos | Helper |
| 9 | `modules/members/service.ts:642-655` | `effectiveStatusExpr` (copia en la búsqueda del panel de turno) | Helper. El export (`:2405`) lee la columna `users.status`, que queda bien por (1) |
| 10 | `modules/subscriptions/service.ts:290-368` | `deriveCoveredUntil(Batch)` | **NO tocar en el lugar** (ver abajo); crear `deriveMembershipCoveredUntil(Batch)` |
| 11 | `modules/referrals/service.ts:268,338` | descuento y estado por vínculo con la cobertura de la contraparte | Pasar a la variante de membresía |
| 12 | `modules/analytics/frequency-service.ts:305,663` | población "activa" para frecuencia (ya excluye `especial`) | Agregar exclusión `is_trial` |
| 13 | `modules/renewals/service.ts:111-125` | `notEspecialTrialPlan()` excluye solo el `is_trial` especial ("promo gratuito online conserva su comportamiento") | Generalizar a todo `is_trial` (el invariante lo pide; hoy no hay subs vigentes de promo online según el relevamiento de prod) |

Revisados y **sin cambio** (semántica de ACCESO, no de membresía): `shared/covered-until.ts` (pill "Venc" y el export: al invitado le sirve ver su vencimiento), `booking-service.ts:199-203` (bloqueo por cobertura), `subscriptions/member-routes.ts:166` (`/coverage`), `communications/prompt-service.ts`, `segmentation/service.ts:116` (ya devuelve null si la sub vigente no es `presencial`), `finance/transaction-service.ts:1789` (`hasActivePlan` de la bandeja), `analytics/engagement-service.ts:199-208` (solo nombre del plan), `members/service.ts:233-251,350-356,2408-2421` (filtro y nombre de plan). Scripts de import (`db/import-*.ts`): no aplican.

**Por qué hacen falta dos coberturas:** `deriveCoveredUntil` es la fuente del bloqueo de reservas (`booking-service.ts:199`, "rechaza una clase con fecha posterior al covered-until"). Si se le saca `is_trial`, un invitado sin otra sub queda con `null`, y `null` "nunca bloquea" (guard D-14 del docblock, `service.ts:264-266`): podría reservar clases con fecha posterior al vencimiento de sus accesos. D-03 menciona `deriveCoveredUntil` como "activo del descuento". Ese consumidor es el (11) y pasa a usar la variante de membresía. La cobertura de acceso queda como está. [VERIFIED: código]

**Forma del helper (prescriptiva):**
```typescript
// src/modules/shared/membership.ts — fase 194 D-03
// "Un plan is_trial da ACCESO, nunca MEMBRESÍA". ÚNICA definición; no escribir otra copia.
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Alias de subscriptions admitidos (union cerrada → sql.raw seguro). */
export type SubAlias = "s" | "s2" | "subscriptions";

/** La sub NO es de un plan is_trial (correlacionado por plan_id; misma forma que
 *  activeNonEspecialMemberExists, active-member.ts:108-110). */
export function notTrialPlanSql(alias: SubAlias): SQL {
  /* tenant-safe: subquery por PK de plan (ids globalmente únicos), viaja AND-eada
     dentro de una query externa ya scopeada por tenant */
  return sql`${sql.raw(alias)}.plan_id NOT IN (SELECT id FROM subscription_plans WHERE is_trial = 1)`;
}

/** Membresía VIGENTE hoy (active/paused, arrancada, no vencida, no is_trial). */
export function membershipInEffectSql(alias: SubAlias): SQL {
  const a = sql.raw(alias);
  return sql`${a}.subscription_status IN ('active','paused')
    AND ${a}.start_date <= CURDATE()
    AND (${a}.end_date IS NULL OR ${a}.end_date >= CURDATE())
    AND ${notTrialPlanSql(alias)}`;
}

/** Variante query-builder (Drizzle) para consultas sobre schema.subscriptions. */
export function membershipPlanCondition(): SQL {
  return sql`${schema.subscriptions.planId} NOT IN (SELECT id FROM subscription_plans WHERE is_trial = 1)`;
}
```
Uso en `recomputeUserStatus`: `WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND ${membershipInEffectSql("s")}) THEN 'activo'`. **Ojo con el orden de los SET** (comentario de `service.ts:7698-7707`): el gate de `converted_at` tiene que seguir yendo al final. Conviene armar el gate UNA vez como const SQL y reusarlo en los 4 CASE. Eso ya es DRY sobre lo que hay hoy. Correr `pnpm lint:tenant` sobre cada statement tocado: el lint juzga por statement y por texto.

### Patrón 2: Plan "Invitación" — `endDateOverride`, no relajar invariantes

**Recomendación:** plan `paquete`, `is_trial=1`, `multi_branch=1`, **`duration_days=6`**, `classes_per_week=3`, precio 0, uno por país (AR/ARS, ES/EUR). Asignación con `endDateOverride` = día hábil 10. **No relajar `assertPlanInvariants`.**

Justificación [VERIFIED: código]:
- `classesRemaining = ceil(durationDays/7)*classesPerWeek` se calcula con `plan.durationDays`, no con el `endDate` (`service.ts:2312-2315`). Con 6 días da `ceil(6/7)*3 = 3`, y `endDateOverride` no lo altera (`service.ts:2098-2112`).
- **6 y no 7:** con `duration_days >= 7` el plan entra en los recordatorios de "tu membresía vence" (`EXPIRY_REMINDER_MIN_DURATION_DAYS = 7`, `service.ts:370`, que usan push, pop-up y reglas) y en el módulo Renovaciones (`MIN_RENEWAL_PLAN_DURATION_DAYS = 7`, `renewals/service.ts:111`). Además, `partner-week-service.ts:278-292` busca su plan por `paquete + duration_days=7 + classes_per_week=3` **sin filtrar `is_trial` y con `.limit(1)` sin ORDER BY**: un plan Invitación de 7 días podría salir elegido para la semana de regalo (y al revés). Con 6 días no hay choque. Igual hay que sumar `eq(isTrial,false)` a esa query (Pitfall 2).
- El tope semanal (`booking-service.ts:345-360`) usa `plan.classesPerWeek=3`, que no limita más que el total de 3.
- Relajar `assertPlanInvariants` (permitir `monthly_class_budget` en `paquete`) no gana nada: `endDateOverride` hace falta igual porque 10 días hábiles es un largo variable en días corridos.
- **"Accesos" configurable = `classes_per_week` del plan Invitación** (editable en el admin de planes, sin deploy). No agregar un `classesBudgetOverride` paralelo: serían dos fuentes de verdad.
- Identificación server-side del plan, mismo criterio que la prueba de Yoga (`especial-trial-service.ts:154,195`): `is_trial=1 AND plan_category='paquete' AND country=? AND is_active AND NOT is_archived`, por tenant. Si hay más de uno: `log.error` y fallar cerrado (como `partner-week-service.ts:294-303`).

**D-07 (cerrar el remanente):** el chequeo de solapamiento por grupo (`service.ts:2007-2068`) hoy da **409** si existe la sub de invitación (paquete = grupo presencial). Hay que excluir del conflicto las subs de planes Invitación (`is_trial=1 AND paquete`) y, **dentro de la tx de `assignPlan`** (`service.ts:2339`), marcarlas `completed` (no `cancelled`: los reportes de bajas leen `cancelled`). Lo mismo para `changePlanAfterCurrent` (la sub nueva queda encolada después de la invitación: no hay conflicto) y para `changePlanNow` (cierra la vieja como `changed`: ya cubierto). Además, **bloquear** `renewSubscription` sobre una sub de plan Invitación y el `assignPlan` manual del plan Invitación desde rutas admin (hoy no hay ningún guard `is_trial` en `subscriptions/service.ts`; renovar los accesos gratis los haría infinitos).

### Patrón 3: Activación — un servicio, dos canales, locks de fila

`InvitationService.activate(ctx, { inviterId | code, invitedUserId, branchId, phone, dni?, channel, createdBy })`:

1. **Resolver invitador** en el tenant (`resolveReferralCode(ctx, code)`, `referrals/service.ts:164`; nunca un id del cliente en el canal app). Rechazar `inviter === invited`.
2. **Tx corta con locks:** `SELECT id FROM users WHERE tenant_id=? AND id IN (?,?) ORDER BY id FOR UPDATE` (orden fijo para evitar deadlocks), y dentro: membresía vigente del invitador (`deriveMembershipCoveredUntil >= todayInTz(sedeInvitador)`), cupo del mes (`COUNT(*) FROM invitations WHERE inviter_id=? AND quota_month=? AND status='active'`), D-11 y D-12 (Patrón 4), dedupe por teléfono/DNI contra OTROS usuarios del tenant, `INSERT invitations`. Commit.
3. **Datos del invitado** (precedente `members/service.ts:1365-1460` `convertFreemiumToTrial`, en una tx): mudar a la sede física elegida (`assertBranchDelGimnasio`, rechazar virtual), guardar el teléfono con `sanitizePhoneForStorage`, `status='prueba'` + fila en `user_status_history` con `source='invitation'` (varchar(16), `user-status-history.ts:50`), `lead_status='en_seguimiento'`, `lead_status_source='auto'`, `purchased_plan_id=NULL` (mantiene la invariante `ganado ⇔ purchased_plan_id` de `users.ts:91-93`).
4. **`assignPlan`** (maneja su propia tx; no acepta tx externa — misma limitación que documenta `partner-week-service.ts:174-195`) con `priceOverrideAmount: 0`, `priceOverrideReason: "Invitación de <nombre>"`, `startDate = todayInTz(sede)`, `endDateOverride = addBusinessDays(...)`. Después, `UPDATE invitations SET subscription_id=?`.
5. **Compensación:** si (3) o (4) fallan, `invitations.status='voided'` con `void_reason='activation_failed'` (no se borra: D-04) y se propaga el error. El cupo y la ventana solo cuentan filas `active`.

Por qué locks y no un UNIQUE "ingenioso": dos activaciones simultáneas del mismo invitador (dos invitados que tocan el link a la vez, o app + recepción) pasarían el COUNT las dos. `FOR UPDATE` sobre la fila del invitador las serializa y es explícito.

**Orden obligatorio respecto de D-03:** `assignPlan` corre `recomputeUserStatus`. Sin el helper, la sub $0 vigente pone `status='activo'` y dispara el gate de conversión. Con el helper, el invitado `prueba` sigue `prueba` (rama `ELSE u.status`).

**D-06 — cuentas existentes (flujo mínimo seguro):**
- **Tiene cuenta con email** (ex socio, freemium): el registro da 409 por email/DNI/teléfono (`auth/routes.ts:105-205`) → la app muestra "Ya tenés cuenta: iniciá sesión para activar tu invitación" y lleva el código al login (`/login?invitacion=CODE`) → pantalla de activación. Si olvidó la contraseña: el flujo por código de 6 dígitos que ya existe. La activación siempre es para `request.user`: nadie puede activar sobre la cuenta de otro.
- **Lead de recepción sin email/contraseña** (`createTrialMember`, `members/service.ts:1143-1240`, nace con `MEMBER_TEMP_PASSWORD` y sin email): **no hay forma segura de reclamar la cuenta por teléfono** (no hay OTP por SMS/WhatsApp; el reset de contraseña es por email). Camino recomendado: canal asistido D-16. El 409 por teléfono del registro muestra "Ya estás registrado/a en El Templo: pedí en recepción que activen tu invitación". Recepción activa desde la ficha y, si la persona quiere usar la app, le carga el email y le resetea la contraseña (acción existente `resetMemberPassword`). Cero duplicados, cero toma de cuentas.
- **Teléfono obligatorio sin chocar con App Store:** `RegisterPage.vue:265` documenta que DNI y teléfono son opcionales por la guía 5.1.1(v). Recomendado: obligatorio solo cuando el registro viene con código de invitación, y siempre en la pantalla de activación (el servidor lo exige ahí). Así el 409 por teléfono salta ANTES de crear una cuenta duplicada. [ASSUMED: que un requisito condicional al flujo de invitación no afecte la revisión de tienda]

### Patrón 4: Elegibilidad del invitado (D-11/D-12)

```sql
-- D-11: fin de la última cobertura de MEMBRESÍA (no is_trial), en el tenant
SELECT MAX(LEAST(COALESCE(s.end_date, '9999-12-31'),
                 COALESCE(DATE(s.cancelled_at), '9999-12-31'))) AS last_end
FROM subscriptions s
JOIN subscription_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
WHERE s.tenant_id = ? AND s.user_id = ?
  AND p.is_trial = 0
  AND s.subscription_status <> 'scheduled'
  AND s.start_date <= LEAST(COALESCE(s.end_date,'9999-12-31'), COALESCE(DATE(s.cancelled_at),'9999-12-31'))
```
- `last_end IS NULL` → nunca fue socio → elegible.
- `last_end >= hoy` → socio vigente → no elegible ("ya sos socio").
- Elegible si `last_end <= hoy(tz) - N meses` (N = `invitations.ex_member_inactivity_months`, default 6; restar meses en JS sobre el string de `todayInTz`).
- `cancelSubscription` no toca `end_date`, solo pone `cancelled_at` (`service.ts:3829-3832`): por eso el `LEAST`. Una sub cancelada antes de arrancar no cuenta (guard `start_date <=`).
- Las 1988 subs importadas del plan 6 quedan afuera por `p.is_trial = 0` (siempre que el plan 6 tenga `is_trial=1`, como dice el CONTEXT).
- Las subs bonificadas o de staff **sí cuentan** como membresía (D-11 dice "subs no-is_trial").

**D-12 (90 días por persona):** `EXISTS invitations i WHERE i.tenant_id=? AND i.status='active' AND i.activated_at >= NOW() - INTERVAL N DAY AND (i.invited_user_id = ? OR i.invited_phone_last10 = ? OR (i.invited_dni IS NOT NULL AND i.invited_dni = ?))`. Guardar el teléfono (últimos 10) y el DNI como **snapshot** en la fila hace que la ventana sea por persona aunque esa persona tenga dos cuentas. La SP previa no se consulta (D-12).

### Patrón 5: Árbitro de descuentos (D-08, D-10b, D-10c) — un solo lugar

**Hoy** [VERIFIED: código]:
| Charge-path | AURA | Partner | Referido |
|---|---|---|---|
| `assignPlan` (`:2160-2290`) | sí (filter) | compite con AURA por % (pre-filter) | se aplica ENCIMA del neto (compone) |
| `changePlanAfterCurrent` (`~:5021-5095`) | sí | ídem | compone |
| `changePlanNow` (`:4430-4477`) | no (`supports.discounts:false`) | directo sobre el neto | compone sobre partner |
| `renewSubscription` (`:5700-5768`) | no | directo | compone sobre partner |
| Previews: `getPricingPreview` (`:6346-6391`), `getChangePlanPreview` (`:4185-4227`), renovación = cálculo del cliente | — | — | — |

**Qué compite (propuesta para D-08):**
| Beneficio | ¿Compite con la invitación? | Regla |
|---|---|---|
| AURA (puntos, discrecional) | Sí | Gana el mayor **por monto**; empate → gana la invitación y NO se gastan puntos (precedente partner, `pricing-benefits.ts:181-189`) |
| Partner (1ª cuota) | Sí | Máximo por monto (hoy componen: cambia el comportamiento de la fase 179, que tiene 0 usos según el CONTEXT) |
| Boarding pass (precio Zero, exclusivo) | Sí, como exclusivo | Con boarding pass no hay descuento de invitación en ese cobro (mismo trato que partner, `service.ts:2245-2247`); el preview lo muestra y el staff elige |
| Precio personalizado (override con motivo, en ESTE cobro) | **Decisión del usuario** (Open Q1) | Recomendado: el override es el precio final, sin invitación encima (igual que prorrateo y partner) |
| Base heredada de la renovación (incluye overrides negociados viejos) | No | Es "el precio del socio", no una promo (precedente Pomilio, `service.ts:5624-5643`) |
| Prorrateo fin de mes | Excluido como hoy | Sin cambios |
| Promo code (`promo_plans`) | No aplica en la práctica | Se asigna en el registro, antes de que exista el vínculo (D-05) |
| Precio Zero como lista (`priceTypeApplied='zero'` sin boarding) | No | Es una lista de precios, no una promo [ASSUMED] |

**Implementación (`subscriptions/discount-arbiter.ts`):**
```typescript
// Forma propuesta; el planner ajusta nombres.
export interface InvitationDiscountCandidate {
  percent: number;          // nominal (side-aware: invitado vs invitador)
  amount: number;           // floor(base*pct/100) recortado por el tope $ del país
  createsLinkFromInvitationId: number | null; // D-05: vínculo a materializar si el cobro es pago
}
// 1) ANTES de resolvePlanPrice: candidato de invitación (+ partner) sobre la BASE del cobro
// 2) competingDiscount = max(partner.amount, invitation.amount) → al filter
//    (extender PricingAdjustCtx con `competingDiscountAmount`, o pasar el % efectivo
//     = amount*100/basePrice; el módulo compara contra floor(base*tier/100))
// 3) DESPUÉS del filter: si AURA aplicó → ninguno de los dos; si no → aplica el mayor
// 4) Gate de cobro pago: basePrice > 0 (proxy de pricePaid > 0: AURA tope 30%, override excluido)
```
- **Por montos, no por %:** con el tope en dinero, una invitación del 10% recortada a $20.000 sobre $360.000 vale 5,5% efectivo. Un AURA del 10% le gana. El hook hoy solo recibe `competingDiscountPercent` (`shared/hooks.ts:176`, `pricing-benefits.ts:185,210`).
- **Flag por plan (D-10b):** `planAllowsInvitationDiscount(plan) = plan.allowsInvitationDiscount && !excludedFromReferrals(plan.planCategory)`. El guard por categoría queda como piso duro (el admin deshabilita el toggle para `especial`/`paquete`). Reemplaza los 7 `excludedFromReferrals(...)` de `service.ts:822,2280,4216,4465,5083,5756,6379` en el camino del referido. **Ojo:** `resolvePartnerDiscountCandidate` (`:822`) también usa `excludedFromReferrals`; el partner no lleva el flag nuevo.
- **Tope $ (D-10c):** clave `invitations.discount_cap_amount.<AR|ES>` en `tenant_settings` (sin fila = sin tope). Se aplica al monto de invitación de **cualquier** cobro (invitado o invitador). `referral_credits.percent` guarda el nominal y `amount` el recortado. El add-back de renovación (`service.ts:5398-5401`) ya usa el monto guardado: queda correcto.
- **% del invitado vs por invitado activo:** hoy un solo `percentPerLink` (`aura_config['referral']`) sirve para los dos lados. Para que sean configurables por separado, `computeReferralDiscountPercent` (`referrals/service.ts:227`) suma `invitee_percent` por el vínculo donde el usuario es `referred` y `per_link_percent` por cada vínculo donde es `referrer`, con el tope del total. Con 10/10 da exactamente lo mismo que hoy (D-10e).
- **Previews:** las tres superficies llaman al MISMO árbitro con `mode: 'preview'` (sin escribir, simulando el vínculo a materializar). La renovación necesita que `getRenewalPreview` (`service.ts:5470`) devuelva **montos** (descuento ganador, monto de invitación, precio final): el admin deja de multiplicar en el cliente (Pitfall 6).

**D-05 en el cobro (materializar el vínculo):** antes de computar, si el pagador no tiene fila en `referrals` y existe una `invitations` activa con `access_expires_on + late_window_days >= hoy(tz)` (la más reciente), el plan admite descuento y la base es > 0, se hace `INSERT referrals (referrer=inviter, referred=payer, status='qualified', qualified_at=NOW(), attribution_channel=<canal de la invitación>, copy_variant=referralCopyVariant(inviter))` y se espeja `users.referred_by`. Va en la misma etapa que `qualifyReferralOnCharge` (`service.ts:712-745`) y con la misma notificación best-effort al invitador (copy renombrado). Si ya existe una fila en `referrals` para ese invitado (UNIQUE `referred_id`), se mantiene la existente y se loguea (Open Q8).

### Patrón 6: Días hábiles (D-15)

```typescript
// src/modules/shared/business-days.ts — función PURA (testeable sin DB)
/** Devuelve el N-ésimo día hábil (lun-sáb, sin feriados) contando desde el día
 *  SIGUIENTE a `fromDate` (ver Open Q9). Fechas 'YYYY-MM-DD' en el calendario de la sede. */
export function addBusinessDays(fromDate: string, n: number, holidays: ReadonlySet<string>): string {
  let d = fromDate; let count = 0;
  while (count < n) {
    d = addDays(d, 1);                                   // shared/date-utils.ts:15 (UTC-noon safe)
    const dow = new Date(d + "T12:00:00Z").getUTCDay();  // 0 = domingo
    if (dow !== 0 && !holidays.has(d)) count++;
  }
  return d;
}
// Loader: holidays del (tenant, país) entre fromDate y fromDate+N*2+14 días,
// con tenantWhere(holidays, ctx) — misma forma que holiday-service.ts:178-215.
```
- `startDate = todayInTz(branch.timezone)`, `endDateOverride = addBusinessDays(startDate, N, feriados)`. El `end_date` es **inclusivo**: el bloqueo de reservas permite `date <= coveredUntil` (`booking-service.ts:201`).
- **Vencimiento en UTC (preexistente):** `autoExpireSubscriptions` compara `endDate < today` con `today = new Date().toISOString()` (`service.ts:6432-6451`) y `recomputeUserStatus` usa `CURDATE()` de MySQL. En AR (UTC-3) cualquier sub vence a las **21:00 locales** de su `end_date`. Para el invitado, una clase de 21 h el último día hábil puede fallar en el check-in QR ("No tenes una suscripcion activa"). Recomendado: no tocar la expiración global en esta fase; documentarlo y, si molesta, cubrirlo con el check-in forzado del profe. [VERIFIED: código]

### Patrón 7: "Mis invitados" — estados derivados

Extender `GET /api/members/referrals` (`referrals/routes.ts:20-25` → `getReferralOverview`) con un bloque `invitations`: `{ quota: { limit, used, remaining, month }, inviteUrl, invitees: [...] }`. Es la misma ruta, con su caso ISO-03 ya existente; hay que extender la aserción de shape.

Derivación por invitación (batch, sin N+1; precedente `deriveCoveredUntilBatch`):
| Estado | Regla (en orden) |
|---|---|
| Socio activo | compró (sub paga no-trial con `created_at >= activated_at`) Y `deriveMembershipCoveredUntil >= hoy`. Flag aparte `sumaDescuento` = existe `referrals` inviter→invitee `qualified` |
| Inactivo | compró y ya no tiene cobertura de membresía |
| Vencido | no compró Y (`access_expires_on < hoy` O accesos agotados `classes_remaining = 0`) — ver Open Q11 |
| Entrenando | no compró, vigente, `classes_budget - classes_remaining > 0` |
| Invitado | no compró, vigente, 0 accesos usados |

"Accesos usados x/N" = `classes_budget - classes_remaining` de la sub de invitación. Coincide con el contador de la app e incluye los no-shows descontados por `jobs/mark-no-shows.ts:232-240`. Nunca hardcodear 3: leer `classes_budget`.

### Patrón 8: Leads (D-18)

- **Origen "Invitación": derivado, sin columna nueva.** `EXISTS invitations i WHERE i.invited_user_id = users.id AND i.status='active'`. `invitations` es la fuente de verdad (D-04), y una columna nueva en `users` sería otra copia más del enum de origen.
- **Gate de conversión** (`service.ts:7732-7808`): `AND (EXISTS bookings.is_trial=1 OR EXISTS invitations activas)`. Para un ex socio con `converted_at` ya seteado, el gate `u.converted_at IS NULL` nunca dispara. Por eso **además** hace falta un paso explícito de "conversión de invitación" dentro de `recomputeUserStatus` (mismo tx): si hay membresía vigente **paga** (`price_paid > 0`) creada después de una invitación activa sin `converted_at`, se setean `invitations.converted_at` y `converted_subscription_id`, y en `users` `lead_status='ganado'`, `lead_status_source='auto'`, `purchased_plan_id=<plan comprado>` (solo si `lead_status_source <> 'manual'`, mismo respeto que el cron, `expire-lost-leads.ts:132-138`).
- **Cron `expire-lost-leads`:** `candidateBaseConditions` (`expire-lost-leads.ts:73-82`) toma leads `prueba` con una SP vieja. **Un invitado que hizo SP antes (D-12 lo permite) se vencería a `perdido` al día siguiente de activar.** Agregar `AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.tenant_id = ${ctx.tenantId} AND i.invited_user_id = u.id AND i.status='active')` al UPDATE y al COUNT (`:130-150`).
- **Dónde se listan:** el "listado de leads" operativo es Reportes ▸ Sesiones de Prueba (`reports/service.ts:2167`, una fila por **reserva SP**; su filtro `origin` es `app|admin` = `bookings.source`, `:2681-2690`). Los invitados no tienen reserva SP, así que no entran ahí. Recomendado: **pestaña nueva "Invitaciones" en Reportes** (una fila por invitación: invitado + WhatsApp, invitador con link a la ficha, activación, x/N, vencimiento, sedes donde entrenó (DISTINCT `attendance.branch_id` entre activación y vencimiento), etapa derivada, `lead_status` editable vía el `PATCH /api/admin/leads/:userId` existente) + KPIs de D-19 arriba. Y el filtro mínimo pedido: `origen = Invitación` en `AlumnosPage.vue` (filtro `status=prueba` existente + EXISTS invitations en `listMembers`).

### Patrón 9: Reporte D-19
- Activaciones/mes: `COUNT(*) GROUP BY DATE_FORMAT(activated_at,'%Y-%m')` (`status='active'`).
- Conversión: `COUNT(converted_at) / COUNT(*)` por cohorte de mes de activación.
- Invitados activos: invitaciones con invitado con cobertura de membresía (variante batch).
- Descuentos/mes: `SUM(referral_credits.amount) JOIN subscriptions` agrupado por mes **y moneda** (`subscriptions.currency`). Nunca sumar ARS con EUR. Incluye los vínculos heredados (es "monto del programa").

### Anti-patrones a evitar
- **Cambiar `deriveCoveredUntil` en el lugar:** rompe el bloqueo de reservas (Patrón 1).
- **Marcar las reservas del invitado `is_trial`:** prohibido por D-18; contamina SP (cupo 3/turno, cadencia, reportes).
- **Recalcular descuentos en el admin:** cualquier `floor(base*pct/100)` del cliente queda desincronizado por el tope en dinero.
- **Comparar AURA vs invitación por %:** el tope en dinero lo vuelve incorrecto.
- **`cancelSubscription` para cerrar la invitación (D-07):** perdona deuda, cuenta como baja y exige anular cobros. Usar un UPDATE `completed` dentro de la tx.
- **Cron para vencer invitaciones o mover etapas:** todo se deriva en lectura (precedente CON-04 de partner-week, `partner-week-service.ts:30-31`).

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Crear la sub de accesos | INSERT propio en `subscriptions` | `assignPlan` con `priceOverrideAmount:0` + `endDateOverride` | Único camino canónico a `bonificada`, recompute, historial, migración de sede, cajas |
| Fecha "hoy" por sede | `new Date().toISOString()` | `todayInTz(branch.timezone)` | UTC rompe de noche en AR (memoria `reference_test_shifts_utc_vs_tz_sede`) |
| Sumar días | `Date.setDate` local | `addDays` de `shared/date-utils.ts` | Usa mediodía UTC, sin corrimientos |
| Normalizar teléfono | regex nueva | `normalizePhone` (comparar) / `sanitizePhoneForStorage` (guardar) | Ya resuelven AR/ES; el dedupe usa `RIGHT(REGEXP_REPLACE(...),10)` |
| Parámetros por país | tabla nueva | `tenant_settings` con clave `invitations.<param>.<PAIS>` (patrón `sales-number.ts:42-117`) | Ya tenant-scoped, upsert idempotente |
| Código del link | código nuevo | `users.referral_code` (`generateReferralCode` lazy) | Único por tenant, ya en los links compartidos |
| Errores de duplicado | parseo de mensajes | `isDuplicateKeyError` (`referrals/service.ts:782`) | Recorre `err.cause` de Drizzle |

## Runtime State Inventory

La fase incluye un rebranding y una migración de datos, así que se completa el inventario.

| Categoría | Qué hay | Acción |
|---|---|---|
| Datos guardados | `referrals` (9 filas; id=3 invertida), `referral_credits` (16), `users.referred_by` (espejo), `aura_transactions` con `description` "Descuento por referido: N%" (solo histórico) | Migración 0259 para el vínculo 3 + espejos; las descripciones viejas no se tocan (historial) y el texto nuevo se cambia en código (`referrals/service.ts:649`) |
| Config viva en DB (editable, no en git) | `notification_templates` fila `referral_link_activated` por tenant (sembrada con `INSERT IGNORE`, `notifications/service.ts:999-1023`: **cambiar `TEMPLATE_SEEDS` no actualiza la fila existente**); `avisos` fila `card_referral` (copy editable desde Comunicaciones, sembrada por la mig 0217); `aura_config['referral']` (10); `system_settings['referral.max_percent_cap']` (40) | Migración 0260: UPDATE con guard "solo si el texto sigue siendo el default" (no pisar copy editado por staff). aura_config/cap: sin cambio |
| Estado registrado en el SO / clientes | Builds nativas publicadas con la ruta `/mis-referidos` y los push/avisos ya enviados con `destination_section='referidos'` | Mantener la clave interna `referidos` y la ruta `/mis-referidos` como alias/redirect de la ruta nueva |
| Secrets / env vars | Ninguno — verificado por grep (no hay env de referidos) | Ninguna |
| Artefactos / links ya compartidos | URLs `https://app.eltemplo.org/register?ref=CODE` en WhatsApp de socios | Compat: `RegisterPage` sigue leyendo `ref` (`RegisterPage.vue:242-255`) y, tras registrar, lleva a la activación |

## Common Pitfalls

### Pitfall 1: `assignPlan` rechaza el plan Invitación a un invitado en sede virtual
**Qué pasa:** el autorregistro sin `?branchId` deja al socio en la sede `ONLINE` (`auth/routes.ts:202-216`). `assignPlan` tira "Plan presencial requiere sede física. Convertí al alumno primero." porque `paquete` es del grupo presencial (`service.ts:1931-1951`), y además valida `plan.country === member.branchCountry` (`:1915-1919`).
**Cómo evitarlo:** la activación pide una sede física (selector como `PartnerWeekService`, `ActivatePartnerWeekInput.branchId`) y muda al invitado ANTES de `assignPlan` (precedente `convertFreemiumToTrial`). Es probablemente lo mismo que habría roto la semana de partners en uso real.
**Señal temprana:** test "registro por link sin branchId → activar" en rojo con 400.

### Pitfall 2: colisión con la semana de regalo de partners
**Qué pasa:** `partner-week-service.ts:278-292` elige `paquete/7/3` del país sin `is_trial` ni ORDER BY.
**Cómo evitarlo:** plan Invitación de 6 días + agregar `eq(subscriptionPlans.isTrial, false)` en esa query, con un test en `test/referral-partners/semana-gratis.test.ts`.

### Pitfall 3: invariante D-03 a medias
**Qué pasa:** cambiar solo `recomputeUserStatus` deja al invitado "activo" en KPIs, frecuencia, Renovaciones y **en el export SEPA de España** (`members/service.ts:2555`, archivo que se le pasa al banco).
**Cómo evitarlo:** usar el inventario de 13 sitios y un test por cada familia (status, listado, SEPA, analytics, renovaciones, descuento).
**Señal temprana:** `grep -rn "subscription_status IN ('active'" src` sin `membership` cerca.

### Pitfall 4: la base de renovación arrastra AURA y partner (bug latente, MEDIUM)
**Qué pasa:** `resolveRenewalBase` suma de vuelta solo `referralDiscountAmount` (`service.ts:5398-5401`). Un período pagado con AURA 10% o con partner hereda ese precio rebajado en todas las renovaciones siguientes. Con "gana el mayor", la invitación se aplica encima de una base que ya trae otra promo: es acumulación encubierta.
**Cómo evitarlo:** escribir primero un test de caracterización (alta con AURA → renovar → ver `pricePaid`), confirmarlo y decidir (Open Q4). Para el add-back de AURA hay que reconstruir el monto (`aura_discount` guarda **puntos**, no plata; el % está en `aura_discount_percent`).

### Pitfall 5: gate de cobro pago dentro del árbitro
**Qué pasa:** hoy la cualificación exige `pricePaid > 0` DESPUÉS de AURA. Para decidir antes del filter hay que usar `basePrice > 0`.
**Cómo evitarlo:** usar `basePrice > 0` como proxy (AURA tope 30%, el override queda excluido por Open Q1) y testear la paridad con `test/referrals/preview-parity.test.ts`.

### Pitfall 6: el admin recalcula descuentos en el cliente
**Qué pasa:** `MemberSubscriptionTab.vue:1120-1126` (renovación) y `AssignPlanDialog.vue:1597-1611` (override) hacen `floor(base*pct/100)` con el % del preview. Con tope en dinero o "gana el mayor", el "monto recibido" precargado no coincide y el backend rechaza el cobro.
**Cómo evitarlo:** el servidor devuelve montos finales (preview de renovación con descuento; preview de alta que acepte `priceOverrideAmount`), el admin solo los muestra, y API y admin se publican en el mismo tren.

### Pitfall 7: gates de tenancy que tsc no ve
**Qué pasa:** CI rojo por conteos fijos.
**Cómo evitarlo** (lista exacta para la tabla `invitations` y las rutas nuevas):
1. `src/db/tenant-tables.ts`: sumar a `GYM_OWNED_TABLES` y a `TENANT_STRICT_MODULES.referrals` (`:637`).
2. `test/db/tenant-tables.test.ts`: `GYM_OWNED_TABLES.length` 99→100 (`:116`), `schemaTables.size` 103→104 (`:121`), `MODULOS_DECLARADOS.referrals` (`:450`) + título del it (`:468`).
3. `test/migrations/0192-0195-tenant-columns.test.ts:170`: `gymOwnedChecked` 99→100.
4. `test/migrations/0196-tenant-unique-contracts.test.ts:638-639`: conteo + texto "de las 99 tablas".
5. `test/helpers.ts:197` `TABLES_TO_CLEAN`: `schema.invitations` ANTES de `subscriptions`/`users` (FKs).
6. Sin UNIQUE no compuesto en `invitations` (si no, `db:verify-uniques` exige una entrada en el mapa de derivadas, `tenant-tables.ts:330-360`). Usar índices simples.
7. Por cada ruta nueva: `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` (hoy **447**, `iso-01-manifiesto.test.ts:316`).
8. Rutas bajo `/api/members/referrals` o `/api/admin/referrals`: caso ISO-03 en `iso-03-referrals.test.ts` + `CASOS_BASELINE` de `iso-03-cobertura-analytics-resto.test.ts:254` (hoy **57**). Rutas bajo los prefijos de members (`/api/admin/members/...`): `iso-03-members-*.test.ts` + `CASOS_BASELINE` de `iso-03-cobertura-members.test.ts:188` (hoy **33**). Si se toca algo bajo `/api/admin/subscriptions`: `iso-03-cobertura-subs-sched.test.ts:194` (hoy **71**).
9. Sin jobs nuevos → `con-04` no cambia.
10. `pnpm lint:tenant` local en cada plan; tests que consulten `users`/`subscriptions` directo necesitan `tenantWhere(tabla, TEMPLO_CTX)`.
**Ojo:** los conteos son los de `origin/master`. El tren v6.1 (`feat/v6.1-gimnasio`, sin push) también los mueve: el que integre segundo resuelve el conflicto sumando.

### Pitfall 8: la etapa "SP previa" vence al invitado
Ver Patrón 8 (exclusión en `expire-lost-leads`).

### Pitfall 9: semántica de `register` con `ref`
**Qué pasa:** hoy `POST /auth/register` con `ref`/`code` de socio crea `referrals` `pending` self-service (`auth/routes.ts:466-501`). Bajo D-05 eso abre un hueco: descuento sin cupo ni elegibilidad.
**Cómo evitarlo:** el registro deja de crear `referrals` (devuelve una pista `invitation: { code }` para que la app vaya a activar). Los tests `test/referrals/{anti-fraud,member-endpoint,ab-copy-test,admin-referrals-endpoint}.test.ts`, `test/auth/register.test.ts` y `iso-03-auth.test.ts` usan `ref` y hay que actualizarlos (Open Q7).

### Pitfall 10: reservas pendientes por encima del saldo
**Qué pasa:** el saldo baja recién en el check-in. Dentro de la ventana de +2 días un invitado puede tener reservadas más clases que las que le quedan (el paso 5c que cuenta las pendientes solo corre para especiales, `booking-service.ts:263-280`). El QR después bloquea en 0 (`attendance/service.ts:226-231`), pero el lugar ya quedó ocupado.
**Cómo evitarlo:** opcional y de bajo riesgo: aplicar el conteo de pendientes también a subs de plan Invitación.

## Code Examples

### Lock + cupo (forma recomendada)
```typescript
// Fuente: patrón propio; locks de fila InnoDB. Tenancy: tenantWhere en cada statement.
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT id FROM users
    WHERE tenant_id = ${ctx.tenantId} AND id IN (${inviterId}, ${invitedUserId})
    ORDER BY id FOR UPDATE`);
  const [{ used }] = await tx.select({ used: sql<number>`COUNT(*)` })
    .from(schema.invitations)
    .where(and(tenantWhere(schema.invitations, ctx),
      eq(schema.invitations.inviterId, inviterId),
      eq(schema.invitations.quotaMonth, quotaMonth),        // 'YYYY-MM' en tz de la sede del invitador
      eq(schema.invitations.status, "active")));
  if (Number(used) >= settings.monthlyQuota) throw new ConflictError("…");
  // … D-11 / D-12 / dedupe … luego INSERT con tenantValues(ctx, {...})
});
```

### Exclusión en el cron de leads
```typescript
// expire-lost-leads.ts — agregar al UPDATE y al COUNT (tenant inline: el lint juzga por statement)
AND NOT EXISTS (
  SELECT 1 FROM invitations i
  WHERE i.tenant_id = ${ctx.tenantId} AND i.invited_user_id = u.id AND i.status = 'active'
)
```

### Parámetro por país (precedente `sales-number.ts`)
```typescript
export const INVITATION_CAP_KEY_PREFIX = "invitations.discount_cap_amount.";
// get → null si no hay fila o no es entero > 0 (fail-closed = sin tope); set → upsert con tenantValues
```

## Plan de migraciones (numeración libre desde 0255)

Verificado: `origin/master` y `origin/staging` terminan en **0254** (`0254_schedules_deleted_from.sql`). La rama local `feat/v6.1-gimnasio` ocupa **0245-0252** y la 192.3 tiene reservada la **0253** (memoria). **Empezar en 0255 y volver a verificar al ejecutar** (`git ls-tree` de master, staging y del tren).

| Nº | Archivo | Contenido | Guards |
|---|---|---|---|
| 0255 | `0255_invitations.sql` | `CREATE TABLE invitations` (id, tenant_id NOT NULL DEFAULT 1 FK tenants, inviter_id FK users, invited_user_id FK users, `channel` enum('self_service','assisted'), `status` enum('active','voided') DEFAULT 'active', activated_at, quota_month CHAR(7), access_starts_on DATE, access_expires_on DATE, subscription_id NULL FK, branch_id FK branches, invited_phone_last10 VARCHAR(10), invited_dni VARCHAR(20) NULL, converted_at NULL, converted_subscription_id NULL FK, created_by NULL FK ON DELETE SET NULL, voided_at/voided_by/void_reason, created_at, updated_at; índices `(tenant_id, inviter_id, quota_month)`, `(tenant_id, invited_user_id, activated_at)`, `(tenant_id, invited_phone_last10)`) | `CREATE TABLE IF NOT EXISTS`; los nombres de enum coinciden byte a byte con `mysqlEnum("channel"…)`/`mysqlEnum("status"…)` del schema |
| 0256 | `0256_plans_allows_invitation_discount.sql` | `ALTER TABLE subscription_plans ADD COLUMN allows_invitation_discount TINYINT(1) NOT NULL DEFAULT 0` + `UPDATE ... SET allows_invitation_discount = 1 WHERE plan_category NOT IN ('especial','paquete')` (espejo exacto del comportamiento de hoy; Open Q5) | La columna duplicada la tolera el runner; el UPDATE es idempotente |
| 0257 | `0257_invitation_plans.sql` | INSERT de "Invitación" AR/ARS y ES/EUR: `paquete`, `is_trial=1`, `multi_branch=1`, `duration_days=6`, `classes_per_week=3`, precios 0, `plan_tier='other'`, `booking_mode='flexible'`, `allows_invitation_discount=0` | `WHERE NOT EXISTS (tenant_id=1, name, country)` (molde `0244`) |
| 0258 | (opcional) settings | **No sembrar**: defaults en código con fallback explícito (como `referral.max_percent_cap`, `referrals/service.ts:67-72`); el tope en dinero arranca sin fila | — |
| 0259 | `0259_fix_referral_3_inverted.sql` | `UPDATE referrals SET referrer_id=6613, referred_id=7286, copy_variant='B' WHERE id=3 AND tenant_id=1 AND referrer_id=7286 AND referred_id=6613 AND NOT EXISTS (SELECT 1 FROM (SELECT referred_id FROM referrals WHERE id<>3) x WHERE x.referred_id=7286)`; `users.referred_by`: 6613→NULL si =7286, 7286→6613 si NULL; `status` según si 7286 tiene un pago > 0 (Open Q13) | Guards por id + estado esperado (no-op si prod difiere). La derived table evita el error 1093. `referral_credits` no se toca (es por pagador; simétrico) |
| 0260 | `0260_rebrand_invitaciones_copy.sql` | `UPDATE notification_templates SET title/body/female... WHERE template_key='referral_link_activated' AND title='¡Tu referido pagó!'`; `UPDATE avisos SET ... WHERE code='card_referral' AND title='Vos decidís cuánto bajás tu cuota'` (guard por texto default) | Solo pisa el copy que sigue siendo el default |

Schema: `src/db/schema/invitations.ts` (exportado en `schema/index.ts`) + `allowsInvitationDiscount: boolean("allows_invitation_discount").default(false).notNull()` en `subscription-plans.ts`. Cada `.sql` va en el mismo commit que su `.ts`. Sin `;` en los comentarios.

**Backup y "correr sobre copia" (brief):** el deploy NO hace backup de la DB (skill db-migrations). Recomendado: checkpoint humano antes del tren a master con `mysqldump` de `referrals`, `referral_credits`, `subscription_plans` y `users(id, referred_by)`, y validar conteos (9 vínculos, 16 créditos) sobre `eltemplo_staging` recién clonada. Requiere SSH: pedir OK a Franco.

## Rebranding — inventario (copy user-facing)

**App socio (`el-templo-app/src`):** `pages/MisReferidosPage.vue` (título `:4`, error `:14,:200`, "Tu código" `:24`, botón "Compartir mi código" `:32`, "Te trajo" `:84`, vacío `:107-110`, labels de estado `:176-186`, share `:255-257`, fallback `:277`, URL hardcodeada `:161`); `pages/ProfilePage.vue:89-92` ("Mis referidos"); `pages/RegisterPage.vue:45` ("CÓDIGO DE REFERIDO"); `modules/progression/components/ReferralCtaCard.vue:24` (badge "Referidos"), `:62-63` (fallbacks); `config/destinations.ts:44-46` (label); `router/routes.ts:88-90` (agregar `mis-invitados` + alias/redirect `mis-referidos`); tests `boot/__tests__/push-destination.test.ts:37-38`, `utils/__tests__/aviso-navigation.test.ts:45-52`.

**Admin (`el-templo-admin/src`):** `pages/AlumnoDetailPage.vue:369` (tab "Referidos"); `components/MemberReferralsTab.vue:12,45,52,72,446,472-473,486`; `components/ReferrerSelect.vue:57`; `components/MemberFormDialog.vue:161`; `components/AssignPlanDialog.vue:643`; `components/MemberSubscriptionTab.vue:342`; `pages/AnaliticasPage.vue:239`; `components/analytics/ReferidosAbTab.vue:6,53,104`; `config/destinations.ts:45`; `config/system-audiences.ts:100`; `config/rule-triggers.ts:177,245`; `types/campaign.ts:30`; `composables/useMembersApi.ts:448,473`.

**API (copy que ve el usuario o el staff):** `notifications/types.ts:256-263` (seed); `subscriptions/service.ts:730` (`bodyOverride`); `referrals/service.ts:649` (descripción AURA); `communications/system-avisos.ts:171-180`; `communications/destinations.ts:79`; mensajes de error `referrals/service.ts:523,543,557,595`, `members/routes.ts:1872`, `referral-partners/service.ts:814`. Filas en DB: migración 0260.

**Links:** nueva ruta web `/invitacion/:code` (landing → login/registro → activación); `/register?ref=CODE` sigue andando (`RegisterPage` lo lee; post-registro → activación). El AASA y Android solo cubren `/r/trial*` (`public/.well-known/apple-app-site-association`, `AndroidManifest.xml:32`): **sin trabajo de deep link nativo en esta fase**. El link abre en el navegador, que es lo que pasa hoy con `?ref`. Centralizar la URL base (hoy hardcodeada en `MisReferidosPage.vue:161`): conviene que el servidor la devuelva en `inviteUrl`.

## Domiciliación `direct_debit` (ES) — respuesta a la pregunta 6

- El monto de cada período sale del charge-path que corre el staff al renovar o cobrar con `paymentMethod: 'direct_debit'` (validado solo para sedes ES, `finance/transaction-service.ts:281-291`). Ese path recalcula el descuento en cada cobro (`renewSubscription`, `service.ts:5756-5768`). **El sistema sí refleja el descuento recalculado.** [VERIFIED: código]
- **Pero** el export SEPA mensual (`members/service.ts:2534-2585`) **no tiene columna de importe**: el banco debita lo que carga Leandro aparte (memoria `project_domiciliacion_espana`: "Sin monto de cuota en el export"). Si el descuento cambia (un invitado se da de baja, tope en dinero, gana el mayor), el banco puede debitar un monto distinto del que registra el sistema. Recomendado (Open Q10): sumar al export una columna "Importe próximo período" calculada con el preview de renovación (el mismo árbitro).
- El export SEPA usa `activeMemberExists`: sin D-03, un invitado ES con solo accesos **aparecería en el archivo del banco**. D-03 lo cierra.

## State of the Art (dentro del repo)

| Antes | Ahora | Cuándo | Impacto |
|---|---|---|---|
| Referido = vínculo al registrarse (`pending`) | Invitación activada + vínculo al comprar (`qualified` directo) | Esta fase (D-05) | El registro deja de crear `referrals` |
| Descuentos que se suman (AURA → referido) | Gana el mayor por monto | Esta fase (D-08) | Cambia precios desde la próxima renovación |
| `is_trial` de plan = solo "oculto del catálogo" | `is_trial` = acceso, nunca membresía | Esta fase (D-03) | 13 predicados |
| A/B del copy de la card | Copy editable en Comunicaciones (D-15 de la 193) | 2026-09 | El rebrand de la card va por migración de datos, no por código |

## Assumptions Log

| # | Supuesto | Sección | Riesgo si es falso |
|---|----------|---------|--------------------|
| A1 | Que el teléfono obligatorio SOLO en el flujo de invitación no traiga problemas con la guía 5.1.1(v) de App Store | Patrón 3 | Rechazo en la revisión de la build nativa |
| A2 | Que el "Precio Zero" sea una lista de precios y no una promo | Patrón 5 | La invitación se sumaría con una promo |
| A3 | Que `holidays` tenga cargados los feriados de ES (Barcelona) en prod | Patrón 6 | Vigencias de ES más cortas de lo debido |
| A4 | Que el plan 6 "Sesión de Prueba" tenga `is_trial=1` (lo dice el CONTEXT, no lo verifiqué en esta sesión) | Patrón 4 | Ex leads de la importación figurarían como "ex socios" |
| A5 | Que no haya subs vigentes de planes `is_trial` online (promo) además de las 2 de Yoga | Patrón 1 (#13) | Cambiaría el estado de esos usuarios |
| A6 | Que la base heredada de renovación arrastre AURA y partner (leído del código, sin test que lo confirme) | Pitfall 4 | Si me equivoqué, el arreglo sobra |
| A7 | Que no exista un "listado de leads" distinto del reporte de Sesiones de Prueba y del filtro de AlumnosPage | Patrón 8 | La UI de leads iría en otro lugar |

## Open Questions (RESOLVED)

Todas resueltas por Franco el 2026-10-06 (addendum D-20..D-29 de `194-CONTEXT.md`).

1. **Precio personalizado + invitación** — hoy se suman (el override con motivo recibe referido encima, también en renovación). Recomendado: el override es el precio final, sin invitación (consistente con partner y prorrateo). Alternativa: que se sigan sumando. — RESOLVED: D-20
2. **Boarding pass vs invitación** — recomendado: exclusivo (sin invitación en ese cobro). — RESOLVED: D-26a
3. **Partner vs invitación** — hoy se suman; con D-08 pasarían a "el mayor". ¿Confirmar? (0 usos de partner en prod según el CONTEXT.) — RESOLVED: D-21
4. **Base de renovación con AURA/partner pegados (Pitfall 4)** — ¿corregir el add-back? Sube el precio de renovación de quien usó AURA o partner alguna vez. Es sensible para el negocio. Recomendado: caracterizar primero y decidir con números. — RESOLVED: D-22
5. **Backfill del flag por plan** — el CONTEXT dice "true para presencial mensual", pero "nadie pierde descuento" pide espejar lo de hoy (todo menos `especial`/`paquete`, online incluido). Recomendado: espejo exacto y que gestión desmarque después; default para planes nuevos = `false` (opt-in). — RESOLVED: D-23
6. **Alta con "Referido por"** (`members/service.ts:1070-1100`) — ¿sigue como vínculo de descuento sin accesos (semántica D-17) o pasa a ser "Crear invitación"? Recomendado: queda como D-17 con label renombrado, más una acción separada "Crear invitación (N accesos)". — RESOLVED: D-24
7. **Registro con `?ref`** — recomendado: deja de crear `referrals` `pending`; solo lleva a la activación. — RESOLVED: D-26b
8. **Invitado con vínculo `referrals` previo** (UNIQUE `referred_id`) invitado por otra persona — recomendado: mantener el vínculo viejo (rarísimo; 9 vínculos en total). — RESOLVED: D-26c
9. **¿El día de activación cuenta como día hábil 1?** — recomendado: no. Los accesos se pueden usar desde ese día y la vigencia vence en el 10.º día hábil siguiente. — RESOLVED: D-26d
10. **Export SEPA con importe** — ¿se suma la columna "importe próximo período"? (scope extra chico). — RESOLVED: D-25
11. **Agotó los 3 accesos antes de la fecha** — ¿"Vencido" o "Entrenando" hasta la fecha? Recomendado: "Vencido" (no puede reservar más). — RESOLVED: D-26e
12. **Feriados de ES cargados en prod** — verificar con un query de solo lectura antes de ejecutar. — RESOLVED: D-29
13. **Vínculo 3:** ¿Guido (7286) ya pagó? Define si queda `qualified` o `pending` tras el swap. Verificar en prod (solo lectura) y fijar el valor en la migración. — RESOLVED: D-28
14. **`vue-tsc`** no está instalado en app ni admin: ¿autorizar la instalación (dev dep) o verificar los frontends con build + eslint + revisión? — RESOLVED: D-27

## Environment Availability

| Dependencia | Para qué | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node | API/tests | ✓ | v22.22.0 | — |
| pnpm | scripts | ✓ | 10.28.2 | — |
| MySQL server local | tests de integración | ✓ (corriendo; el cliente pide credenciales del `.env`) | 8.0.46 | CI |
| `node_modules` + `.env` en el worktree | typecheck/tests | ✗ en `et-194-invitaciones` | — | Symlinkear `node_modules` y copiar `.env`/`.env.development` del checkout principal (memoria: precedente `et-domiciliacion`) |
| `vue-tsc` (app/admin) | typecheck de `.vue` | ✗ | — | Pedir permiso para instalarlo; si no, `quasar build` + eslint + revisión manual |
| `tsc` (API) | typecheck | ✓ (en el checkout principal) | — | — |

**Faltantes que bloquean:** ninguno (con el symlink).
**Faltantes con alternativa:** `vue-tsc`.

## Validation Architecture

### Test Framework
| Propiedad | Valor |
|---|---|
| Framework | vitest 4 (API, MySQL real por worker `eltemplo_test_<POOL_ID>`); vitest en app (solo utils puros); admin sin runner |
| Config | `el-templo-api/vitest.config.ts` |
| Corrida rápida | `cd el-templo-api && pnpm exec vitest run test/invitations/<archivo>.test.ts --hookTimeout 600000` (en foreground) |
| Suite completa | CI en el push a staging (no local, por convención) |
| Gates estáticos | `pnpm exec tsc --noEmit`, `pnpm lint:tenant`, `pnpm typecheck:tests`, `pnpm db:verify-uniques` (con DB) |

### Mapa requisito → test
| Req | Comportamiento | Tipo | Archivo (nuevo salvo indicación) |
|---|---|---|---|
| SC-4 | Sub `is_trial` vigente: status no pasa a `activo`, no figura en `activeMemberExists`/SEPA/listado/frecuencia/renovaciones; socio con presencial + Yoga trial sigue igual; reserva por cobertura sin cambios | integración | `test/invitations/membership-invariant.test.ts` |
| SC-4 | `deriveMembershipCoveredUntilBatch` ignora `is_trial`; el descuento no cuenta contraparte con solo accesos | integración | ídem + extender `test/referrals/discount-computation.test.ts` |
| SC-1 | `addBusinessDays`: domingos, feriados AR/ES, fin de mes, feriado en sábado | unit (pura) | `test/shared/business-days.test.ts` |
| SC-1 | Activación self-service: freemium en sede virtual → sede física + `prueba` + historial `invitation` + lead `en_seguimiento` + sub bonificada 3 clases, `end_date` = día hábil 10 | integración | `test/invitations/activate.test.ts` |
| SC-1 | Reserva + check-in QR en otra sede del país OK; otro país rechazado; 4.ª clase rechazada; vence sin cron | integración | `test/invitations/access-usage.test.ts` |
| SC-2 | Cupo 2/mes (3.ª → 409); mes siguiente se libera; anulada no cuenta; dos activaciones simultáneas no superan el cupo (`Promise.all`) | integración | `test/invitations/quota.test.ts` |
| SC-2 | D-11: nunca socio OK; ex socio < 6 m rechazado; ≥ 6 m OK; vigente rechazado; subs importadas `is_trial` no cuentan; cancelada usa `cancelled_at` | integración | `test/invitations/eligibility.test.ts` |
| SC-2 | D-12: 90 días por persona, incluso con otra cuenta del mismo teléfono; SP previa no bloquea | integración | ídem |
| SC-2 | Canal asistido mismas reglas; lead sin email activable por recepción; registro con tel existente → 409 sin duplicado | integración | `test/invitations/assisted.test.ts`, extender `test/auth/register.test.ts` |
| SC-3 | Compra con accesos vigentes cierra la sub (completed) sin 409; vínculo `qualified` creado; 10% en el primer cobro si el invitador está activo; compra a +31 d sin vínculo; plan sin flag ni cualifica ni descuenta | integración | `test/invitations/conversion-link.test.ts` |
| SC-3 | Gana el mayor: AURA > invitación (se gastan puntos, sin invitación); invitación ≥ AURA (puntos intactos); tope $ recorta y hace ganar a AURA; partner vs invitación; 4 charge-paths | integración | `test/invitations/discount-arbiter.test.ts` |
| SC-3 | Paridad preview ↔ cobro (alta, cambio de plan, renovación con montos) | integración | extender `test/referrals/preview-parity.test.ts` |
| SC-3 | Tope 40% intacto; % invitado vs por vínculo configurables; equivalencia con hoy en 10/10 | integración | extender `test/referrals/discount-charge.test.ts` |
| SC-5 | "Mis invitados": cupo, URL, 5 estados derivados, x/N desde `classes_budget` | integración | `test/invitations/member-overview.test.ts` |
| SC-5 | Lead: gate de conversión con invitación; ex socio con `converted_at` previo pasa a `ganado`; el cron no vence leads de invitación con SP vieja; `manual` respetado | integración | `test/invitations/leads.test.ts`, extender `test/expire-lost-leads.test.ts` |
| SC-5 | Reporte: activaciones/mes, conversión, activos, descuentos/mes por moneda | integración | `test/invitations/report.test.ts` |
| SC-6 | Migración 0259 idempotente y no-op si el estado difiere; 0260 no pisa copy editado | integración (migraciones) | `test/migrations/0259-0260-invitaciones.test.ts` |
| Tenancy | Rutas nuevas aisladas (404/400 jamás 403, más control positivo) | integración | `iso-03-referrals.test.ts`, `iso-03-members-*.test.ts` + baselines |
| Partner | La semana de regalo no elige el plan Invitación | integración | extender `test/referral-partners/semana-gratis.test.ts` |
| Frontends | Tipos de la app/admin | estático | `vue-tsc` (si se autoriza) o build + eslint; app: vitest de utils puros (estados/URL) |

### Frecuencia de muestreo
- **Por commit de tarea:** `tsc --noEmit` + `lint:tenant` + el test nuevo del plan.
- **Por plan:** worktree limpio + typecheck + lint (regla del orquestador).
- **Gate de fase:** CI verde en staging antes de `/gsd:verify-work`.

### Wave 0
- [ ] `test/invitations/_helpers.ts`: fábrica de invitador con membresía vigente, invitado freemium en sede virtual, feriados por país, `TEMPLO_CTX`.
- [ ] Symlink de `node_modules` + `.env` en el worktree.
- [ ] Decisión sobre `vue-tsc` (Open Q14).

## Security Domain

| Categoría ASVS | Aplica | Control |
|---|---|---|
| V2 Authentication | sí | Activación solo con JWT (`fastify.authenticate`); sin toma de cuenta por teléfono (Patrón 3) |
| V3 Session | no | — |
| V4 Access Control | sí | `userId` del token (IDOR, precedente `referrals/routes.ts:9-10`); canal asistido limitado a `MEMBER_LIFECYCLE_ROLES` + `assertReferralTargetInScope`; ajustes con escritura solo owner (`settings/routes.ts`); `tenant_id` server-side |
| V5 Input Validation | sí | JSON-Schema de Fastify (código ≤ 24, teléfono, branchId entero); plan Invitación resuelto server-side, nunca del body |
| V6 Cryptography | no | — |
| V11 Business Logic | sí | Locks de cupo, ventana por persona con snapshot de tel/DNI, bloqueo de renovar/asignar a mano el plan Invitación, gate de cobro pago |

| Amenaza | STRIDE | Mitigación |
|---|---|---|
| Rotar invitados entre socios | Elevation (abuso) | Ventana de 90 días por persona (tel/DNI snapshot) |
| Carrera de cupo | Tampering | `SELECT … FOR UPDATE` |
| Cuenta nueva para "lavar" el historial | Spoofing | Dedupe por teléfono/DNI en el registro con invitación y en la activación |
| Renovar accesos gratis | Elevation | Guard en `renewSubscription` / `assignPlan` admin |
| Enumerar códigos para ver nombres | Info disclosure | Sin endpoint público de preview; el nombre del invitador se devuelve solo autenticado |
| Cruce de tenant | Info disclosure | `tenantWhere` en todo + ISO-03 |

## Propuesta de división en planes (granularidad fine, backend primero)

> Superada por la planificación: la división final (30 planes, numeración distinta) está en `ROADMAP.md` Phase 194 y en los `194-NN-PLAN.md`. La tabla queda como registro de la propuesta original.

| # | Plan | Depende de | Riesgo en prod |
|---|---|---|---|
| 01 | Invariante D-03: `shared/membership.ts` + 13 sitios + `deriveMembershipCoveredUntil(Batch)` + tests de caracterización | — | Medio (amplio, pero 0 cambios de estado en prod hoy) |
| 02 | Tabla `invitations` + schema + 5 conteos de tenancy + `TABLES_TO_CLEAN` (mig 0255) | — | Bajo |
| 03 | Flag `allows_invitation_discount` (0256) + planes Invitación (0257) + guard partner-week + bloqueo de renovar/asignar a mano el plan Invitación + D-07 (conflicto/cierre) | 01, 02 | Medio (toca `assignPlan`) |
| 04 | `addBusinessDays` + loader de feriados + settings de invitaciones (`tenant_settings`, defaults) + rutas `GET/PUT /api/admin/settings/invitations` | 02 | Bajo |
| 05 | `InvitationService`: elegibilidad, activación con locks, compensación, anulación + tests | 01, 02, 03, 04 | Bajo (código nuevo) |
| 06 | Rutas app: `GET …/invitations/eligibility`, `POST …/invitations/activate` (bajo `/api/members/referrals`) + cambio de `register` (Pitfall 9) + ISO-01/ISO-03 | 05 | Medio (registro) |
| 07 | Rutas admin: crear/anular invitación asistida + lead nuevo con invitación + ISO | 05 | Bajo |
| 08 | Árbitro de descuentos: materializar vínculo (D-05/D-13), flag, tope $, % por lado, gana el mayor (hook AURA por monto) en 4 charge-paths + 3 previews (renovación con montos) | 03, 04, 05 | **Alto (cobros)**: caracterizar antes |
| 09 | Leads: gate de conversión + conversión de invitación + exclusión en el cron | 05, 08 | Medio |
| 10 | "Mis invitados" API (overview extendido) + ficha admin (overview) | 05, 08, 09 | Bajo |
| 11 | Reporte D-19 + listado de leads de invitación + filtro de origen en `listMembers` | 09 | Bajo |
| 12 | Migraciones de datos: 0259 (vínculo 3) + 0260 (copy) + test de migración | 02 | Bajo (guards) |
| 13 | App: Mis invitados, landing/activación, login/registro con código, rebrand, alias de ruta, bump 1.8.2 | 06, 10 | Medio (build de tienda) |
| 14 | Admin: rebrand, tab de invitaciones en la ficha, flag en el form de planes, UI de settings, Reportes ▸ Invitaciones, previews por monto (Pitfall 6) | 07, 08, 11 | **Alto si se publica separado de 08** |

**Orden crítico:** 01 tiene que llegar a prod antes que 05, o en el mismo tren y nunca después. 08 y 14 van juntos (precarga de montos). Lo que puede romper producción: cobros (08, 14), check-in/reservas (03 si se toca mal el conflicto de grupo; 01 si se toca `deriveCoveredUntil` en el lugar) y registro (06).

## Sources

### Primarias (HIGH) — código leído en esta sesión (`origin/master` `c17f79791`)
- `el-templo-api/src/modules/referrals/service.ts` (completo), `subscriptions/service.ts` (líneas citadas), `subscriptions/pricing.ts`, `subscriptions/types.ts:100-160`, `aura/pricing-benefits.ts`, `shared/active-member.ts`, `shared/covered-until.ts`, `members/service.ts` (listados, `createTrialMember`, `checkDuplicates`, export SEPA), `auth/routes.ts:40-620`, `auth/schemas.ts`, `scheduling/partner-week-service.ts`, `scheduling/especial-trial-service.ts`, `scheduling/booking-service.ts`, `scheduling/holiday-service.ts`, `attendance/service.ts`, `jobs/expire-lost-leads.ts`, `renewals/service.ts`, `notifications/{types,service,rules}.ts`, `communications/{sales-number,system-avisos}.ts`, `reports/service.ts:2140-2260`, `db/schema/{subscription-plans,subscriptions,referrals,referral-credits,users,holidays,tenants,system-settings,promo-plans}.ts`, `db/tenant-tables.ts`, tests de tenancy (baselines citados).
- App/admin: `RegisterPage.vue`, `MisReferidosPage.vue`, `ReferralCtaCard.vue`, `routes.ts`, `.well-known/apple-app-site-association`, `AssignPlanDialog.vue`, `MemberSubscriptionTab.vue`, `MemberReferralsTab.vue`, `AlumnosPage.vue`.
- Skills del repo: `el-templo-db-migrations`, `el-templo-change-control`.

### Secundarias (MEDIUM) — memoria del proyecto
- `project_domiciliacion_espana.md` (export SEPA sin importe), `project_referidos_asignacion_retroactiva.md` (vínculo 3), `project_referidos_preview_y_config.md`, `reference_tabla_gym_owned_nueva_cinco_conteos.md`, `reference_gates_tenancy_ruta_job_nueva.md`, `reference_ci_no_typecheck_frontends.md`.

### Terciarias (LOW)
- Ninguna fuente web: la fase es 100% del código propio.

## Metadata

**Confianza:**
- Stack: HIGH — no hay librerías nuevas; todo verificado en el árbol.
- Arquitectura: HIGH — cada punto de enganche tiene file:line.
- Pitfalls: HIGH para 1, 2, 3, 6, 7, 8 y 9 (leídos en el código); MEDIUM para 4 y 5 (inferidos de la lectura, piden test de caracterización).

**Fecha:** 2026-10-06
**Válido hasta:** ~2026-10-20 (el código se mueve rápido: rehacer los greps de baselines y numeración de migraciones al ejecutar).
