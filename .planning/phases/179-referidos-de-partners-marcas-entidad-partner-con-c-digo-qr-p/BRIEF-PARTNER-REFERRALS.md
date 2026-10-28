# BRIEF — Fase 179: Referidos de partners/marcas

**Fecha:** 2026-08-22 · **Decisiones cerradas con el usuario** (ver §Decisiones)
**Standalone** api/app/admin. NO depende del tren v6.0. **Regla dura: no tocar `referrals` ni `computeReferralDiscountPercent`** (lógica simétrica + cap + covered-until es delicada; riesgo cero de regresión al descuento entre socios).

## Objetivo de negocio

Co-marketing con comercios locales: el partner reparte tarjetas físicas con un QR de registro. Quien se registra con ese código recibe un beneficio (descuento o pase gratis); el partner cobra una comisión fija por cada membresía confirmada. La atribución medible de punta a punta (QR → registro → primer pago) es el diferencial frente a publicidad barrial.

## Decisiones cerradas (2026-08-22)

1. **Entidad separada, NO usuario-fantasma.** El partner no es una fila de `users`.
2. **Beneficio del referido: configurable por partner** — descuento % en primera(s) cuota(s) **o** pase/semana gratis (`benefit_type` + `benefit_value`).
3. **Comisión: monto fijo one-time** por membresía confirmada (primer pago > 0). Nada recurrente en v1.
4. **Liquidación manual:** el sistema registra deuda acumulada y el admin marca "liquidado". El sistema NO mueve plata (mismo espíritu que caja).
5. Ejecución como fase GSD.

## Diseño propuesto

### Schema (3 tablas nuevas)

**`referral_partners`**

- `id`, `tenant_id`
- `name`, `code` varchar(16) UNIQUE — admite vanity codes ("CAFEX"); verificar no-colisión contra `users.referral_code` al crear (dos espacios de nombres, un resolver)
- `benefit_type` enum (`discount_percent` | `free_pass`) + `benefit_value`
- `commission_type` enum (`none` | `fixed`) + `commission_value` (dejar el enum abierto a `percent_first_payment` futuro)
- `branch_id` FK opcional (partner de barrio → pre-selecciona sede en registro)
- `active` bool, contacto/notas, timestamps

**`partner_referrals`** (espejo de `referrals`)

- `partner_id` FK, `referred_id` FK users **UNIQUE**
- `status` enum `pending|qualified|revoked`, `qualified_at`, `created_by`, timestamps
- **Exclusividad cruzada:** un socio tiene UN origen — si ya existe en `referrals` (como referido) no entra acá, y viceversa. Chequeo en servicio, 409 igual al actual.

**`partner_commissions`** (calcada de `referral_credits`)

- `partner_id`, `partner_referral_id`, `subscription_id` **UNIQUE** (idempotencia por cobro, mismo truco que `referral_credits`)
- `amount`, `currency`, `status` enum `pending|settled|void`, `settled_at`, `settled_by`

### Flujo

1. Admin crea partner con código/beneficio/comisión → genera QR + tarjeta (herramienta calcada de `tools/generate-branch-qrs.ts`, URL de registro con `?ref=CODE` y opcional `&branchId=N`).
2. Registro: la app **ya lee** `route.query.ref` (`RegisterPage.vue:228-231`) y lo manda en el body — cero cambios en la app para la captura. `resolveReferralCode` se generaliza a dos espacios: `users.referralCode` → referido socio (flujo actual intacto); `referral_partners.code` → inserta `partner_referrals` pending. Graceful degradation igual que hoy.
3. Beneficio del referido se aplica según `benefit_type` (descuento en primer `pricePaid` / pase gratis vía trials-aura — definir mecánica exacta en discuss/plan).
4. Confirmación: mismo hook `qualifyFirstPayment` (`referrals/service.ts:367-404`, primer pago > 0) → flip `pending→qualified` en `partner_referrals` + insert en `partner_commissions` si `commission_type != none`.
5. Liquidación: admin ve acumulado pending por partner → marca batch como settled.

### Admin v1

- CRUD de partners (+ descarga de QR/tarjeta)
- Conversiones por partner (registros → qualified) — sirve además como reporte para renovar el acuerdo comercial
- Pantalla de liquidación (pending acumulado → settle)
- `ReferrerSelect.vue` (autocomplete de socios) NO se toca.

## Mapa del sistema actual (relevado 2026-08-22)

- `referrals` (fase 157): `referrer_id` FK `users.id` NOT NULL; `referred_id` FK users UNIQUE; `status pending|qualified|revoked`; `attribution_channel self_service|assisted`; `copy_variant` A/B.
- `referral_credits`: append-only, `subscription_id` UNIQUE = idempotencia por cobro.
- `users.referral_code` varchar(16) UNIQUE (lazy, `PREFIJO-XXXX`, unicidad por constraint+retry); `users.referred_by` FK users (espejo desnormalizado).
- Config actual de recompensa socio-a-socio: `aura_config['referral'].default_amount` (10%) + `system_settings['referral.max_percent_cap']` (40). Sin UI de admin.
- Servicio: `el-templo-api/src/modules/referrals/service.ts` — `generateReferralCode`, `resolveReferralCode` (código 1:1 con user), `computeReferralDiscountPercent` (simétrico, covered-until, cap), `qualifyFirstPayment` (D-20), `recordReferralCredit`, `assignReferrerToMember` (retroactiva, fase 173, D-13 no auto-referencia).
- Registro: `auth/routes.ts:285-324` recibe `ref` en body (self_service); alta asistida `members/routes.ts:625-660` recibe `referredBy` userId; retroactiva vía admin.
- App: `RegisterPage.vue` lee `route.query.ref`, `branchId`, `promo`. La web pública NO propaga `?ref=` (gap conocido, no bloquea v1 — el QR apunta al registro de la app).
- QR infra: `shared/qr-token.ts` (HMAC checkin por sede) + `tools/generate-branch-qrs.ts` → PNGs.
- Campañas 119: token HMAC stateless (`campaigns/token-service.ts`) — patrón reusable, no ligado a referidos.

### Los 8 acoples del referidor a `users` (por qué NO se generaliza in-place)

1. `referrals.referrer_id` hard FK a `users.id` NOT NULL.
2. Código vive en `users.referral_code` (1:1 usuario).
3. `users.referred_by` FK users.
4. `computeReferralDiscountPercent`/`getReferralOverview`: simetría basada en `subscriptions` + `deriveCoveredUntil` de ambos lados — un comercio no tiene suscripción ni cobertura.
5. `recordReferralCredit` → `referral_credits.user_id` + `aura_transactions` (AURA diseñado para NO mover dinero real).
6. `assignReferrerToMember` valida contra `users.deletedAt`.
7. `ReferrerSelect.vue` busca en padrón de socios.
8. `copy_variant` A/B deriva de paridad de `referrer_id` en el espacio de PKs de users.

## Preguntas abiertas para discuss/plan

- Mecánica exacta del **pase/semana gratis**: ¿trial v5.8, pase aura externo, o membresía corta bonificada (`membership_kind`)? Definir qué pasa si el referido después compra membresía (¿la comisión dispara igual con el primer pago > 0? sí por diseño, verificar).
- Descuento % del referido: ¿solo primera cuota o N cuotas? ¿interactúa con el cap de referidos socio-a-socio? (No debería: orígenes excluyentes.)
- Moneda de la comisión (AR/ES) y partners en España.
- ¿Asignación retroactiva de partner (equivalente a `assignReferrerToMember`)? Probablemente sí, barato.
- Revocación (`revoked`) → ¿void de comisión pendiente?
- Numeración de migración: next-after-master; **0208 ya tomado** por analytics iter2; verificar colisiones con trenes pendientes.
- Tenancy: ruta/job nuevo dispara los 3 gates de tenancy (ver reference_gates_tenancy_ruta_job_nueva) — la fase es pre-merge del tren v6.0 en master, coordinar shape igual que el fix N+1 de referidos.

## Ideas descartadas / diferidas (contexto del brainstorm)

- Dashboard self-service para el partner: diferido — el reporte de conversiones en admin alcanza para renovar acuerdos.
- Beneficios inversos para miembros en locales del partner ("carnet de beneficios"), sponsors en TV (momentos de descanso), pases como moneda B2B, challenges co-brandeados, win-back conjunto por audiencias: quedaron como ideas de roadmap comercial, fuera de esta fase.
