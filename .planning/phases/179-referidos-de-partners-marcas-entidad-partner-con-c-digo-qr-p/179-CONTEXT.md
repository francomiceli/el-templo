# Phase 179: Referidos de partners/marcas - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Un comercio partner (entidad propia, NO un `users` row) tiene código/QR en tarjetas físicas. Quien se registra con ese código recibe un beneficio configurable por partner (descuento % en primera cuota o semana gratis de entrenamiento); el partner acumula una comisión fija one-time por cada membresía confirmada (primer pago > 0); el admin gestiona partners, ve conversiones y liquida comisiones manualmente. **Regla dura: NO tocar `referrals` ni `computeReferralDiscountPercent`** — tablas espejo separadas.

Standalone api/app/admin. NO depende del tren v6.0 (pero coordinar shape pre/post-tenancy al pushear, como el fix N+1 de referidos).

</domain>

<decisions>
## Implementation Decisions

### Camino físico del QR / captura del código

- **D-01:** La tarjeta lleva **DOS QRs**: uno a Play Store y otro a App Store, más el **código legible impreso** (ej. `CAFEX`).
- **D-02:** El código NO viaja por las stores (iOS no tiene install referrer nativo; no se paga Branch/AppsFlyer). Entra por **campo manual "¿Tenés un código?"** nuevo en `RegisterPage.vue` (hoy solo lee query params, no tiene campo manual).
- **D-03:** El campo manual es **unificado**: acepta los 3 tipos de código — promo (`promo_plans.promoCode`), código de socio (`users.referral_code`) y código de partner — resolviendo en 3 espacios de nombres sin colisiones (validar unicidad cruzada al crear partners).
- **D-04:** Los QRs se generan con **botón en el admin** (CRUD de partners): descarga los 2 PNGs con el código impreso, listos para imprenta. Patrón: `tools/generate-branch-qrs.ts`. Sin plantilla de tarjeta PDF en v1.

### Semana gratis (benefit_type = free_pass)

- **D-05:** El beneficio "gratis" es una **semana completa**: plan bonificado de 7 días precio 0 (reusa `membership_kind` bonificada + la mecánica fase 177: `durationDays=7` deriva budget nativo).
- **D-06:** La semana se **activa al reservar la primera clase**, no al registro. El registro deja el beneficio "pendiente"; se calca el patrón freemium fase 119 (`trial-eligibility` + reserva sin plan activo en `ReservasPage`): elegibilidad "beneficio partner pendiente" muestra la grilla, y la primera reserva dispara `assignPlan` (7 días) arrancando ese día.
- **D-07:** El beneficio pendiente **vence a los 30 días** del registro si no reservó. El vínculo con el partner queda vivo para atribución (si paga después, la comisión dispara igual).
- **D-08 (reescrita post-research, OK Franco 2026-08-22):** Semana terminada sin conversión → **reporte propio "beneficios de partner sin conversión"** en la página de Partners, para seguimiento manual de la sede. NO escribe `lead_status` ni toca el pipeline de leads v5.8 (el funnel exige `status='prueba'` + booking `is_trial`, incompatible con el consumidor de semana de partner que queda `inactivo`).

### Descuento % (benefit_type = discount_percent)

- **D-09:** Aplica **solo a la primera cuota** (one-shot en el primer pago). Registro auditable por cobro estilo `referral_credits`.
- **D-10:** **No stackea**: si hay otro descuento aplicable (aura, promo), se aplica **el mayor**, nunca ambos. Con referidos socio no hay conflicto (origen excluyente, D-12).

### Comisión y liquidación

- **D-11:** Comisión **monto fijo one-time** por membresía confirmada; trigger = mismo hook `qualifyFirstPayment` (primer pago > 0). `partner_commissions` con `subscription_id` UNIQUE (idempotencia).
- **D-12:** **Exclusividad de origen**: un socio tiene UN origen — `referrals` (socio) XOR `partner_referrals`. 409 al intentar el segundo.
- **D-13:** **AR + ES desde el arranque**: el partner hereda país/moneda de su sede; `partner_commissions.currency` explícita; UAT en ambas monedas.
- **D-14:** Revocación del vínculo o anulación del pago generador → **void automático** de comisiones `pending`. Las `settled` no se tocan (histórico).
- **D-15:** **Asignación retroactiva de partner** desde la ficha del alumno (calca `assignReferrerToMember` fase 173): si el referido ya pagó, nace `qualified` y genera la comisión.
- **D-16:** Liquidación **batch por partner**: un botón "Liquidar" marca todo lo `pending` como `settled` en un acto, con fecha y usuario, detalle por comisión auditable. Sin corte por fecha ni selección por ítem en v1.

### Decisiones post-research (OK Franco 2026-08-22)

- **D-17:** La **comisión dispara con toda venta real** (`pricePaid > 0`, cualquier categoría, incluidos `paquete` y `especial`). Guards separados: el **descuento de partner** mantiene las mismas exclusiones que el descuento de referidos (`excludedFromReferrals`); la comisión NO usa ese guard.
- **D-18:** **Sin doble gratis**: quien canjea código de partner (semana gratis) deja de ser elegible a la sesión de prueba freemium (fase 119). La elegibilidad de trial debe excluir a miembros con beneficio de partner pendiente o consumido.
- **D-19:** La semana gratis incluye **3 clases por semana** (plan `paquete` de 1 semana, frecuencia 3, precio 0). Mismo valor en AR y ES; configurable por partner queda para v2.
- **D-20 (recomendaciones técnicas del research, adoptadas):** página propia `/partners` en el admin con 3 tabs (CRUD / conversiones / liquidación) y `meta.allowedRoles` restrictivo; URLs de tienda en `system_settings` (`app.store_url.android` / `app.store_url.ios`) leídas por el admin al generar QRs (⚠ faltan las URLs reales — la de iOS bloquea el QR final, no el desarrollo); en "gana el mayor" (D-10) el ganador se resuelve **antes** del bloque AURA (lectura pura, sin `spend()` si gana el partner) y si gana AURA el beneficio de partner se **consume igual** (`applied_percent = 0`, motivo "perdió vs AURA", coherente con D-09); el módulo se escribe **tenancy-native desde el día uno** (master ya tiene la infra 166-171; actualizar los conteos hardcodeados de `test/db/tenant-tables.test.ts`); migración estimada **0209** (re-verificar `_migrations` al ejecutar).

### Claude's Discretion

- Shape exacto de las 3 tablas (columnas auxiliares, índices), naming de endpoints, y dónde vive la resolución unificada de códigos.
- UX fina del campo de código en el registro (validación en vivo vs al submit, badges).
- Cómo se marca "beneficio pendiente" (columna en `partner_referrals` vs estado derivado).
- Si el plan bonificado de 7 días es un plan seed oculto del picker (patrón fase 177) o se crea por sede/país.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de la fase

- `.planning/phases/179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p/BRIEF-PARTNER-REFERRALS.md` — Diseño completo: schema propuesto (3 tablas), flujo, mapa del sistema de referidos actual y los 8 acoples del referidor a `users` que justifican la entidad separada. **Leer primero.**

### Sistema de referidos actual (no tocar, calcar)

- `el-templo-api/src/modules/referrals/service.ts` — `resolveReferralCode`, `qualifyFirstPayment` (trigger de confirmación), `recordReferralCredit` (patrón idempotencia), `assignReferrerToMember` (patrón retroactiva).
- `el-templo-api/src/db/schema/referrals.ts` y `referral-credits.ts` — shape a espejar.

### Assets a reusar

- `el-templo-app/src/pages/RegisterPage.vue` — query params `ref`/`promo`/`branchId`, badges; acá va el campo manual unificado.
- `el-templo-app/src/composables/useSchedulingApi.ts` + `el-templo-app/src/pages/ReservasPage.vue` — patrón freemium 119: `trial-eligibility`, reserva sin plan activo, estados de la grilla.
- `el-templo-admin/src/pages/PlanesPage.vue` (tab Promos) + `PromoFormDialog.vue` — patrón de códigos con link de registro (`showPromoLink` → `app.eltemplo.org/register?promo=`).
- `tools/generate-branch-qrs.ts` — generación de QR PNGs (portar el patrón a endpoint/botón de admin).
- Fase 177 (paquete de clases) — mecánica de planes cortos: `durationDays=semanas×7` deriva budget; plan seed oculto del picker.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Hook `qualifyFirstPayment`** (referrals/service.ts:367-404): punto único de "membresía confirmada" — el flip de `partner_referrals` y la creación de la comisión se cuelgan ahí.
- **Patrón freemium 119**: reserva sin plan activo ya resuelta end-to-end (API + ReservasPage); la elegibilidad por beneficio partner pendiente es una extensión, no un flujo nuevo.
- **`membership_kind` bonificada + planes cortos 177**: la semana gratis es un assignPlan común de un plan precio 0 de 7 días.
- **Funnel de leads v5.8** (`lead_status`, reporte de sesiones de prueba): destino post-semana sin conversión.
- **`referral_credits`**: patrón append-only con `subscription_id` UNIQUE para idempotencia — calcar en `partner_commissions`.

### Established Patterns

- Registro con graceful degradation: si la resolución del código falla, el alta sigue (auth/routes.ts:285-324).
- Soft-void ortogonal del módulo contable: `pending|settled|void` en comisiones sigue ese espíritu.
- Tenancy: toda tabla nueva lleva `tenant_id` (tren v6.0 en staging); ruta nueva dispara los 3 gates de tenancy — coordinar shape del código para el doble mundo master(pre-tenancy)/staging(tenancy) mientras el tren no baje.

### Integration Points

- `resolveReferralCode` / flujo de registro (auth/routes.ts) — resolución unificada de 3 espacios de códigos.
- `BookingService.reserve()` / trial-eligibility (scheduling) — elegibilidad por beneficio pendiente.
- Módulo de cobro que llama `qualifyFirstPayment` — extender para partner_referrals.
- Admin: sección nueva de Partners + tab Referidos de la ficha del alumno (retroactiva) + descuento en el alta (gana-el-mayor).

</code_context>

<specifics>
## Specific Ideas

- Tarjeta física: 2 QRs (stores) + código legible grande. El usuario referenció el patrón de las promos ("fijate en promos dentro de planes") como antecedente de códigos con link de registro.
- Migración: numerar next-after-master — **0208 ya tomado** por analytics iter2; verificar colisión con trenes pendientes al momento de planificar.

</specifics>

<deferred>
## Deferred Ideas

Ideas del brainstorm de co-marketing que NO entran en esta fase (registradas en BRIEF §Ideas descartadas/diferidas):

- Dashboard self-service para el partner (el reporte de conversiones en admin alcanza).
- Beneficios inversos para miembros en locales del partner ("carnet de beneficios").
- Sponsors en TV (momentos de descanso del timer).
- Pases como moneda B2B / corporate wellness.
- Challenges co-brandeados; win-back conjunto por audiencias.
- Install Referrer de Android para pre-llenar el código (mejora futura del campo manual).
- Plantilla de tarjeta PDF completa co-brandeada (v1 entrega solo los QRs + código).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`): match espurio por keywords genéricas — sin relación con esta fase.

</deferred>

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Context gathered: 2026-08-22_
