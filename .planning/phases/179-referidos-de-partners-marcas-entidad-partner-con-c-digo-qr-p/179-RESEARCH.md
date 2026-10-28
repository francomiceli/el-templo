# Phase 179: Referidos de partners/marcas - Research

**Researched:** 2026-08-22
**Domain:** Integración interna (Fastify + Drizzle + MySQL / Quasar admin+app) — sistema de atribución y comisiones espejo del módulo `referrals`
**Confidence:** HIGH (todo el hallazgo es arqueología de código verificada sobre `origin/master`; cero dependencia de librerías nuevas)

> **Nota de baseline (leer antes que nada):** este checkout (`docs/planning-untracked-2026-08`, HEAD `755267ee`) está **151 commits detrás de `origin/master`**. Todo lo que sigue fue leído con `git show origin/master:<archivo>`, NO del working tree. El planner debe partir de `origin/master`, no de este HEAD. [VERIFIED: `git rev-list --count HEAD..origin/master` = 151]

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Camino físico del QR / captura del código**

- **D-01:** La tarjeta lleva **DOS QRs**: uno a Play Store y otro a App Store, más el **código legible impreso** (ej. `CAFEX`).
- **D-02:** El código NO viaja por las stores (iOS no tiene install referrer nativo; no se paga Branch/AppsFlyer). Entra por **campo manual "¿Tenés un código?"** nuevo en `RegisterPage.vue` (hoy solo lee query params, no tiene campo manual).
- **D-03:** El campo manual es **unificado**: acepta los 3 tipos de código — promo (`promo_plans.promoCode`), código de socio (`users.referral_code`) y código de partner — resolviendo en 3 espacios de nombres sin colisiones (validar unicidad cruzada al crear partners).
- **D-04:** Los QRs se generan con **botón en el admin** (CRUD de partners): descarga los 2 PNGs con el código impreso, listos para imprenta. Patrón: `tools/generate-branch-qrs.ts`. Sin plantilla de tarjeta PDF en v1.

**Semana gratis (benefit_type = free_pass)**

- **D-05:** El beneficio "gratis" es una **semana completa**: plan bonificado de 7 días precio 0 (reusa `membership_kind` bonificada + la mecánica fase 177: `durationDays=7` deriva budget nativo).
- **D-06:** La semana se **activa al reservar la primera clase**, no al registro. El registro deja el beneficio "pendiente"; se calca el patrón freemium fase 119 (`trial-eligibility` + reserva sin plan activo en `ReservasPage`): elegibilidad "beneficio partner pendiente" muestra la grilla, y la primera reserva dispara `assignPlan` (7 días) arrancando ese día.
- **D-07:** El beneficio pendiente **vence a los 30 días** del registro si no reservó. El vínculo con el partner queda vivo para atribución (si paga después, la comisión dispara igual).
- **D-08:** Semana terminada sin conversión → **entra al funnel de leads v5.8** (`lead_status` + reporte) para seguimiento manual de la sede, con origen partner visible.

**Descuento % (benefit_type = discount_percent)**

- **D-09:** Aplica **solo a la primera cuota** (one-shot en el primer pago). Registro auditable por cobro estilo `referral_credits`.
- **D-10:** **No stackea**: si hay otro descuento aplicable (aura, promo), se aplica **el mayor**, nunca ambos. Con referidos socio no hay conflicto (origen excluyente, D-12).

**Comisión y liquidación**

- **D-11:** Comisión **monto fijo one-time** por membresía confirmada; trigger = mismo hook `qualifyFirstPayment` (primer pago > 0). `partner_commissions` con `subscription_id` UNIQUE (idempotencia).
- **D-12:** **Exclusividad de origen**: un socio tiene UN origen — `referrals` (socio) XOR `partner_referrals`. 409 al intentar el segundo.
- **D-13:** **AR + ES desde el arranque**: el partner hereda país/moneda de su sede; `partner_commissions.currency` explícita; UAT en ambas monedas.
- **D-14:** Revocación del vínculo o anulación del pago generador → **void automático** de comisiones `pending`. Las `settled` no se tocan (histórico).
- **D-15:** **Asignación retroactiva de partner** desde la ficha del alumno (calca `assignReferrerToMember` fase 173): si el referido ya pagó, nace `qualified` y genera la comisión.
- **D-16:** Liquidación **batch por partner**: un botón "Liquidar" marca todo lo `pending` como `settled` en un acto, con fecha y usuario, detalle por comisión auditable. Sin corte por fecha ni selección por ítem en v1.

**Regla dura del boundary:** NO tocar `referrals` ni `computeReferralDiscountPercent` — tablas espejo separadas.

### Claude's Discretion

- Shape exacto de las 3 tablas (columnas auxiliares, índices), naming de endpoints, y dónde vive la resolución unificada de códigos.
- UX fina del campo de código en el registro (validación en vivo vs al submit, badges).
- Cómo se marca "beneficio pendiente" (columna en `partner_referrals` vs estado derivado).
- Si el plan bonificado de 7 días es un plan seed oculto del picker (patrón fase 177) o se crea por sede/país.

### Deferred Ideas (OUT OF SCOPE)

- Dashboard self-service para el partner (el reporte de conversiones en admin alcanza).
- Beneficios inversos para miembros en locales del partner ("carnet de beneficios").
- Sponsors en TV (momentos de descanso del timer).
- Pases como moneda B2B / corporate wellness.
- Challenges co-brandeados; win-back conjunto por audiencias.
- Install Referrer de Android para pre-llenar el código (mejora futura del campo manual).
- Plantilla de tarjeta PDF completa co-brandeada (v1 entrega solo los QRs + código).

</user_constraints>

<phase_requirements>

## Phase Requirements

**No hay REQ-IDs mapeados.** `.planning/REQUIREMENTS.md` cubre exclusivamente el milestone **v6.0 Tenancy** (FUND/COL/CON/ISO/ADO/MOD, 24 IDs, todos asignados a las fases 166-176). La fase 179 es una feature de producto fuera de ese milestone y **no debe reclamar ninguno de esos IDs**. [VERIFIED: `.planning/REQUIREMENTS.md` §Traceability]

Consecuencia para el planner: los criterios de aceptación se derivan de las decisiones D-01…D-16 del CONTEXT, no de REQUIREMENTS.md. Recomendado numerarlos `PART-01…PART-nn` en el plan para trazabilidad interna de la fase.

</phase_requirements>

## Summary

Esta fase NO es una fase de librerías: es **integración quirúrgica sobre cuatro subsistemas maduros del monorepo** (referidos socio-a-socio de la 157, cadena de pricing de `subscriptions`, freemium/trial de la 119, funnel de leads de la 163/165) más un CRUD de admin nuevo. No hace falta instalar ni una dependencia: `qrcode@1.5.4` y `jszip@3.10.1` **ya están en `el-templo-admin/package.json`**, así que los 2 PNGs de D-04 se generan 100% client-side sin tocar el API ni pedir permiso de instalación.

El hallazgo estructural más importante es que **`origin/master` NO es pre-tenancy**: las fases 166-171 (migraciones 0190-0196, `src/modules/shared/tenant.ts`, `tenantIdColumn()`, `attachScope`, el manifiesto de rutas y el lint ratchet) ya están en master y en prod. Lo que master NO tiene es la _adopción por módulo_ (173-176, en staging). Esto cambia el cálculo de la fase en dos direcciones: (a) **hay 4 gates de CI que una tabla/ruta nueva dispara** y que el plan debe cubrir explícitamente (manifiesto de rutas, lista de tablas gym-owned con conteo hardcodeado, registro de uniques, lint de tenancy que **solo puede achicarse**); (b) si el código nuevo se escribe _tenancy-native_ desde el minuto cero (`tenantWhere`/`tenantValues`/`assertTenant`), pasa el gate de master **y** hace merge limpio con el tren v6.0 — se evita el "doble shape" que hoy sufren `referrals/service.ts` y `transaction-service.ts`.

El segundo hallazgo es que **dos decisiones del CONTEXT chocan con invariantes vivos del código** y necesitan resolución en el plan (no son ambigüedades de research, son conflictos reales): **D-08** (funnel de leads) no funciona tal como está escrito porque el cron `expire-lost-leads` exige `users.status='prueba'` + booking `is_trial=1`, y un socio que consumió la semana gratis queda `inactivo` sin booking de prueba; y **D-06** colisiona con la elegibilidad freemium existente — hoy un registrado con código de partner es _también_ elegible a la sesión de prueba gratuita de la 119, así que hay que decidir precedencia o queda la puerta abierta a "semana gratis + clase de prueba".

**Primary recommendation:** módulo API nuevo y aislado `src/modules/referral-partners/` (3 tablas, servicio propio, rutas admin propias), escrito tenancy-native, que se engancha al resto del sistema en **exactamente cinco costuras conocidas** (`auth/routes.ts` registro, los 4 charge-paths de `subscriptions/service.ts` vía un helper espejo del de referidos, `transaction-service.voidInTx` para el void automático, `scheduling` para activar la semana, `members/routes.ts` para la retroactiva) — sin tocar una línea de `referrals/service.ts`. Para la semana gratis, **reusar los planes `plan_category='paquete'` que la fase 177 ya sembró** (`Paquete · 1 sem · N/sem`, 7 días, budget derivado, ya excluidos de AURA/boarding/referidos) asignándolos con `priceOverrideAmount: 0` — eso deriva `membership_kind='bonificada'` gratis y ahorra una migración de planes seed.

## Architectural Responsibility Map

| Capability                                            | Primary Tier                                                 | Secondary Tier          | Rationale                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entidad partner (CRUD, código, beneficio, comisión)   | API / Backend (`referral-partners`)                          | Admin (Quasar)          | Datos gym-owned con tenancy; la UI solo consume                                                                                                                                                                                             |
| Generación de los 2 QR PNG + código impreso (D-04)    | Admin / Client (browser)                                     | —                       | `qrcode` ya es dependencia del admin; el contenido del QR es una URL pública de store, sin secreto → no necesita firmar nada server-side (contrasta con `shared/qr-token.ts`, que sí firma HMAC porque el QR de check-in es una credencial) |
| Resolución unificada del código en el registro (D-03) | API / Backend (`auth/routes.ts` + resolver del módulo nuevo) | App (campo de input)    | Server-side siempre: el cliente manda un string, nunca un `partnerId` (precedente Security V4/T-157-08 del `?ref=`)                                                                                                                         |
| Aplicación del descuento % (D-09/D-10)                | API / Backend (`subscriptions/service.ts`)                   | —                       | La price-math vive en las 4 charge-paths; el front nunca calcula precio (DESC-05)                                                                                                                                                           |
| Cualificación + alta de comisión (D-11)               | API / Backend (charge-paths)                                 | —                       | Mismo punto único que `qualifyReferralOnCharge`                                                                                                                                                                                             |
| Activación de la semana gratis (D-05/D-06)            | API / Backend (`scheduling` + `subscriptions.assignPlan`)    | App (`ReservasPage`)    | La app dispara, el server autoriza y asigna: la elegibilidad es estado server-side (precedente D-20/D-21 de la 119)                                                                                                                         |
| Vencimiento del beneficio a 30 días (D-07)            | API / Backend (derivado en lectura)                          | —                       | Recomendado derivado/lazy para NO crear un job nuevo (que dispararía el gate CON-04)                                                                                                                                                        |
| Liquidación batch (D-16)                              | API / Backend (`referral-partners`)                          | Admin (botón + confirm) | Flip de estado + auditoría; el sistema no mueve plata (D-04 del BRIEF)                                                                                                                                                                      |
| Void de comisiones pendientes (D-14)                  | API / Backend (`finance/transaction-service.voidInTx`)       | —                       | Ya existe la costura donde el void cancela la suscripción enlazada                                                                                                                                                                          |
| Reporte de conversiones por partner                   | API / Backend (`referral-partners`)                          | Admin (tab/página)      | Agregados por tenant + país                                                                                                                                                                                                                 |

## Standard Stack

### Core (todo ya instalado — CERO dependencias nuevas)

| Library       | Version | Purpose                                                | Why Standard                                                                                                                                                                                                                                                  |
| ------------- | ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-orm` | ^0.45.1 | Schema + queries del módulo nuevo                      | Es el ORM del repo; una tabla nueva se declara en `src/db/schema/<archivo>.ts` + export en `index.ts` [VERIFIED: `el-templo-api/package.json` @ origin/master]                                                                                                |
| `fastify`     | ^5.7.4  | Rutas admin + member                                   | Framework del API [VERIFIED: package.json]                                                                                                                                                                                                                    |
| `mysql2`      | ^3.16.1 | Driver                                                 | — [VERIFIED: package.json]                                                                                                                                                                                                                                    |
| `qrcode`      | ^1.5.4  | Generar los 2 PNG de D-04                              | **Ya es dependencia de `el-templo-admin`**, con `@types/qrcode` ^1.5.6 en devDependencies. `1.5.4` es además la última publicada en npm (modificada 2025-11-13) [VERIFIED: `git show origin/master:el-templo-admin/package.json` + `npm view qrcode version`] |
| `jszip`       | ^3.10.1 | (Opcional) empaquetar los 2 PNG en un .zip de descarga | Ya es dependencia del admin [VERIFIED: package.json]                                                                                                                                                                                                          |
| `vitest`      | ^4.0.18 | Tests de integración contra MySQL real                 | Suite del API [VERIFIED: package.json]                                                                                                                                                                                                                        |
| `quasar`      | ^2.16.0 | UI admin y app                                         | — [VERIFIED: package.json]                                                                                                                                                                                                                                    |

### Supporting (piezas internas del repo que el plan debe reusar, no reescribir)

| Módulo interno             | Ruta                                                            | Purpose                                                                                       | When to Use                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helpers de tenancy         | `el-templo-api/src/modules/shared/tenant.ts`                    | `tenantWhere`, `tenantValues`, `assertTenant`, `forEachActiveTenant`                          | **En TODO acceso a las tablas nuevas.** No opcional: el lint de CI lo exige (ver Pitfall 1)                                                                                         |
| Columna de tenancy         | `src/db/schema/tenant-column.ts` → `tenantIdColumn()`           | Declara `tenant_id NOT NULL DEFAULT 1 FK tenants(id)`                                         | En las 3 tablas nuevas                                                                                                                                                              |
| Errores de dominio         | `src/modules/shared/errors.ts`                                  | `BadRequestError`, `ConflictError`, `NotFoundError`                                           | 409 de exclusividad (D-12), 404 de partner inexistente                                                                                                                              |
| Sets de roles              | `src/modules/shared/permissions.ts`                             | `ADMIN_ROLES`, `ANALYTICS_OPERATIONAL_ROLES`, `FINANCE_VOID_ROLES`, `MEMBER_LIFECYCLE_ROLES`… | Gate de las rutas admin nuevas                                                                                                                                                      |
| Detección de duplicate key | `referrals/service.ts` `isDuplicateKeyError()` (líneas 660-674) | Narrowing de `ER_DUP_ENTRY` a través de la cadena `cause` de Drizzle                          | Carrera del UNIQUE en la retroactiva y en el alta de comisión — **copiar el helper, no importarlo desde `referrals` si eso obliga a exportarlo** (regla dura: no tocar `referrals`) |
| Soft-void contable         | `finance/firm-money.ts`, `movement-service.ts`                  | Vocabulario `voided_at` + razón + `voidedBy`                                                  | Espejarlo en `partner_commissions`                                                                                                                                                  |

### Alternatives Considered

| Instead of                                                  | Could Use                                                                                     | Tradeoff                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generar QR client-side en el admin                          | Endpoint API que devuelve PNG                                                                 | Obligaría a agregar `qrcode` a `el-templo-api/package.json` → **gate de "nunca instalar deps sin preguntar"** + peso extra en el server, a cambio de nada (el contenido del QR no es secreto)                                                                                                                                           |
| Reusar los planes `paquete` de la 177 para la semana gratis | Migración con planes seed nuevos "Semana de regalo" AR/ES                                     | Los seed nuevos dan un nombre lindo en la app del socio ("Semana de regalo" vs "Paquete · 1 sem · 3/sem") a cambio de +2 filas por país en la migración, un `plan_category` a decidir y filtrado extra en el picker. **Recomendado: empezar con `paquete` reusado; si Franco quiere el nombre bonito, es un INSERT de 2 filas después** |
| Tabla `partner_discount_credits` (4ta tabla)                | Columnas `partner_discount_percent/amount` en `subscriptions` + campos en `partner_referrals` | Como el descuento es one-shot (D-09), una fila por vínculo alcanza: la 4ta tabla sería una tabla de 1 fila por partner*referral. \*\*Recomendado: 2 columnas en `subscriptions` (espejando el precedente D-23 de `referral_discount*\_`) + `applied\_\_`en`partner_referrals`\*\*                                                       |
| Job cron de vencimiento del beneficio (D-07)                | Vencimiento derivado en lectura (`created_at + 30d < CURDATE()`)                              | Un job nuevo dispara el gate CON-04 (`JOBS_ESPERADOS` + `forEachActiveTenant`) y agrega superficie operativa por un cálculo que es una resta de fechas. **Recomendado: derivado**, con columna `benefit_expires_at` materializada al crear el vínculo para que sea auditable y extensible a mano                                        |

**Installation:**

```bash
# NINGUNA. Cero paquetes nuevos en las 3 apps.
# Verificación de que qrcode ya está disponible en el admin:
git show origin/master:el-templo-admin/package.json | grep -E '"(qrcode|jszip|@types/qrcode)"'
```

## Package Legitimacy Audit

**Esta fase no instala paquetes externos.** Todas las librerías usadas ya son dependencias declaradas y en uso en el repo desde hace meses.

| Package  | Registry | Age                                                         | Downloads           | Source Repo                    | slopcheck                      | Disposition                                              |
| -------- | -------- | ----------------------------------------------------------- | ------------------- | ------------------------------ | ------------------------------ | -------------------------------------------------------- |
| `qrcode` | npm      | Ya instalado (^1.5.4, latest = 1.5.4, publicada 2025-11-13) | n/a (dep existente) | github.com/soldair/node-qrcode | no ejecutado (sin instalación) | Aprobado — dependencia preexistente de `el-templo-admin` |
| `jszip`  | npm      | Ya instalado (^3.10.1)                                      | n/a (dep existente) | github.com/Stuk/jszip          | no ejecutado                   | Aprobado — dependencia preexistente                      |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

_slopcheck no se ejecutó porque la fase no agrega paquetes; la verificación aplicable fue confirmar que los nombres ya viven en `package.json` commiteado y que la versión de `qrcode` sigue siendo la vigente en el registry._ [VERIFIED: npm registry — `npm view qrcode version` → 1.5.4]

**Regla dura del proyecto:** si durante la ejecución aparece la tentación de instalar algo (por ejemplo un generador de PDF de tarjetas), **hay que preguntarle a Franco antes** — está en CLAUDE.md/memoria como gate humano. La plantilla PDF además está explícitamente diferida.

## Architecture Patterns

### System Architecture Diagram

```
                  TARJETA FÍSICA
        [QR Play Store] [QR App Store] [ CAFEX ]
                 │              │          │
                 └──────┬───────┘          │ (código legible, se tipea)
                        ▼                  │
                  Store → instala app      │
                        │                  │
                        ▼                  ▼
              ┌───────────────────────────────────────┐
              │  RegisterPage.vue  (app + web SPA)    │
              │  campo unificado "¿Tenés un código?"  │
              └──────────────────┬────────────────────┘
                                 │ POST /api/auth/register { code }
                                 ▼
              ┌────────────────────────────────────────────────┐
              │  auth/routes.ts  — 3 bloques best-effort       │
              │  resolveSignupCode(code) → discriminated union │
              └───┬────────────────┬──────────────────┬────────┘
                  │ kind=promo     │ kind=member      │ kind=partner   ◄── NUEVO
                  ▼                ▼                  ▼
          promo_plans        referrals (157)   partner_referrals
          assignPlan()       status=pending    status=pending
                                               benefit_status=pending
                                               (409 si ya hay origen — D-12)
                                                       │
        ┌──────────────────────────────────────────────┴───────────────┐
        │                                                              │
   benefit_type = free_pass (D-05/D-06)                    benefit_type = discount_percent
        │                                                              │
        ▼                                                              │
  ReservasPage: grilla visible con                                     │
  "beneficio partner pendiente"                                        │
        │ 1ra reserva                                                  │
        ▼                                                              │
  assignPlan(paquete 1sem, priceOverride 0)                            │
  → membership_kind='bonificada', pricePaid=0                          │
  → NO cualifica (pricePaid<=0), NO comisiona                          │
        │                                                              │
        │ semana termina                                               │
        ▼                                                              │
  ¿compró?  ──no──► reporte "vencidos sin conversión" (D-08, ver Open Q2)
        │ sí                                                           │
        └──────────────┬───────────────────────────────────────────────┘
                       ▼
       ┌────────────────────────────────────────────────────┐
       │ subscriptions/service.ts — 4 charge-paths          │
       │  assignPlan / changePlanNow / changePlanAfterCurrent│
       │  / renewSubscription   (+ getPricingPreview)       │
       │                                                    │
       │  1. qualifyPartnerOnCharge(userId, pricePaid>0)    │ ◄── NUEVO, espejo de
       │     → partner_referrals pending→qualified          │     qualifyReferralOnCharge
       │     → INSERT partner_commissions (UNIQUE sub_id)   │
       │  2. descuento partner one-shot, GANA EL MAYOR      │
       │     vs AURA (D-10) → subscriptions.partner_*       │
       └───────────────────────┬────────────────────────────┘
                               │
        ┌──────────────────────┴───────────────────────────┐
        ▼                                                  ▼
  ADMIN /partners                             finance: void de transacción
  ├─ CRUD + botón QR (qrcode client-side)     transaction-service.voidInTx
  ├─ Conversiones por partner                 └─► void de comisiones pending (D-14)
  └─ Liquidar (batch pending→settled, D-16)
  AlumnoDetailPage → MemberReferralsTab
  └─ asignar partner retroactivo (D-15)
```

### Recommended Project Structure

```
el-templo-api/src/
├── db/schema/
│   ├── referral-partners.ts        # 3 tablas nuevas (o 1 archivo por tabla,
│   ├── partner-referrals.ts        #  siguiendo la convención "1 archivo = 1 tabla"
│   ├── partner-commissions.ts      #  de referrals.ts / referral-credits.ts)
│   └── index.ts                    # + exports (obligatorio: el gate de tablas lo lee)
├── db/tenant-tables.ts             # + 3 nombres en GYM_OWNED_TABLES  ◄── GATE
├── db/migrations/0209_referral_partners.sql
└── modules/referral-partners/
    ├── index.ts
    ├── service.ts                  # PartnerReferralService (tenancy-native: recibe ctx)
    ├── code-resolver.ts            # resolveSignupCode() — 3 espacios de nombres (D-03)
    ├── admin-routes.ts             # /api/admin/referral-partners
    ├── schemas.ts                  # JSON Schemas Fastify
    └── types.ts

el-templo-api/test/
├── referral-partners/*.test.ts     # espeja test/referrals/*.test.ts
└── tenant-manifest.ts              # + 1 entrada por ruta nueva  ◄── GATE
└── db/tenant-tables.test.ts        # bump del conteo 88→91 / 92→95  ◄── GATE

el-templo-admin/src/
├── pages/PartnersPage.vue          # CRUD + conversiones + liquidación (tabs)
├── components/partners/
│   ├── PartnerFormDialog.vue       # calca PromoFormDialog.vue
│   ├── PartnerQrDialog.vue         # qrcode client-side → 2 PNG
│   └── PartnerSettleDialog.vue
├── components/MemberReferralsTab.vue  # + sección "Partner" (retroactiva D-15)
├── router/routes.ts                # + ruta con meta.allowedRoles
└── config/templo-config.ts         # + item de nav

el-templo-app/src/
├── pages/RegisterPage.vue          # + campo unificado de código (D-02/D-03)
├── pages/ReservasPage.vue          # + estado "beneficio partner pendiente" (D-06)
└── composables/useSchedulingApi.ts # + llamada de elegibilidad/activación
```

### Pattern 1: Servicio tenancy-native desde el minuto cero (NO negociable)

**What:** Todo método del servicio nuevo recibe `ctx: { tenantId: number }` y usa `tenantWhere`/`tenantValues`.
**When to use:** Siempre. Es la única salida válida del gate CON-06 para código nuevo (ver Pitfall 1) y además hace que el merge con el tren v6.0 sea trivial.
**Example:**

```ts
// Fuente del patrón: el-templo-api/src/modules/referrals/service.ts:434-519
// (assignReferrerToMember, fase 173 — el único método de ese archivo que ya
//  está migrado en origin/master)
import { tenantValues, tenantWhere } from "../shared/tenant";

async createPartner(
  ctx: { tenantId: number },
  input: CreatePartnerInput,
): Promise<{ id: number }> {
  const [dup] = await this.db
    .select({ id: referralPartners.id })
    .from(referralPartners)
    .where(and(tenantWhere(referralPartners, ctx), eq(referralPartners.code, input.code)))
    .limit(1);
  if (dup) throw new ConflictError("Ya existe un partner con ese código");

  const res = await this.db
    .insert(referralPartners)
    .values(tenantValues(ctx, { ...input }));
  return { id: Number(res[0].insertId) };
}
```

En la ruta, el `ctx` sale de `assertTenant`:

```ts
// Fuente: el-templo-api/src/modules/members/routes.ts:1745-1757
tenantId: assertTenant(request.scope, "referralPartners.create"),
```

### Pattern 2: Flip idempotente + comisión, espejo exacto de la 157

**What:** Un `UPDATE ... WHERE referred_id=? AND status='pending'` guardado (idempotente y race-safe) precedido de un `SELECT` para saber si hubo flip real, más un `INSERT ... ON DUPLICATE KEY UPDATE` para la comisión.
**When to use:** En el hook de "membresía confirmada" (D-11).
**Example:**

```ts
// Fuente del patrón: referrals/service.ts:367-404 (qualifyFirstPayment)
//                  + referrals/service.ts:529-553 (recordReferralCredit)
async qualifyAndCommission(
  ctx: TenantCtx,
  payerUserId: number,
  subscriptionId: number,
): Promise<void> {
  const [pending] = await this.db
    .select({
      linkId: partnerReferrals.id,
      partnerId: partnerReferrals.partnerId,
      commissionType: referralPartners.commissionType,
      commissionValue: referralPartners.commissionValue,
      currency: referralPartners.currency,
    })
    .from(partnerReferrals)
    .innerJoin(referralPartners, eq(referralPartners.id, partnerReferrals.partnerId))
    .where(and(
      tenantWhere(partnerReferrals, ctx),
      eq(partnerReferrals.referredId, payerUserId),
      eq(partnerReferrals.status, "pending"),
    ))
    .limit(1);

  await this.db.update(partnerReferrals)
    .set({ status: "qualified", qualifiedAt: new Date() })
    .where(and(
      tenantWhere(partnerReferrals, ctx),
      eq(partnerReferrals.referredId, payerUserId),
      eq(partnerReferrals.status, "pending"),
    ));

  if (!pending || pending.commissionType === "none") return;

  await this.db.insert(partnerCommissions)
    .values(tenantValues(ctx, {
      partnerId: pending.partnerId,
      partnerReferralId: pending.linkId,
      subscriptionId,                       // UNIQUE → idempotencia por cobro
      amount: pending.commissionValue,
      currency: pending.currency,
      status: "pending",
    }))
    // Re-cobro del mismo cargo → no-op (mismo truco que referral_credits)
    .onDuplicateKeyUpdate({ set: { subscriptionId } });
}
```

### Pattern 3: Semana gratis = `assignPlan` de un `paquete` con override 0

**What:** No hace falta inventar un tipo de membresía. Un plan `plan_category='paquete'` de 7 días asignado con `priceOverrideAmount: 0` produce exactamente el efecto deseado.
**Why it works (los 5 efectos, todos verificados en código):**

1. `durationDays = 7` → `endDate = startDate + 7` [`subs-service.ts:1502`]
2. `classesRemaining = ceil(7/7) * classesPerWeek` → budget nativo [`subs-service.ts:1678-1681`]
3. `priceOverrideAmount === 0` ⇒ `membershipKind = 'bonificada'` **automáticamente** [`subs-service.ts:1729`] — ese es el ÚNICO camino por el que hoy se setea `bonificada`
4. `pricePaid = 0` ⇒ `qualifyReferralOnCharge` no-op (`if (pricePaid <= 0) return`) [`subs-service.ts:499`] y no se registra cobro (precedente del promo en `auth/routes.ts:250-261`: "neutral value; pricePaid=0 skips payment recording")
5. `excludedFromAura('paquete')` y `excludedFromBoardingPass('paquete')` son `true` [`subscriptions/types.ts:101-116`] → cero interacción con AURA/boarding

```ts
// Activación de la semana (server-side, tras validar el beneficio pendiente)
await subscriptionService.assignPlan(
  userId,
  {
    planId: semanaPlanId, // "Paquete · 1 sem · N/sem" del país del socio
    branchId,
    startDate: todayInTz(branchTimezone),
    priceTypeApplied: "regular",
    paymentMethod: "cash", // neutral: pricePaid=0 no registra cobro
    priceOverrideAmount: 0,
    priceOverrideReason: `Semana de regalo — partner ${partner.name} (${partner.code})`,
  },
  userId, // self-assignment, precedente del promo
);
```

**Bonus:** el guard de solapamiento por grupo de plan [`subs-service.ts:1455-1475`] ya impide activar la semana si el socio tiene una presencial activa — no hay que escribir esa validación.

### Pattern 4: Resolver unificado de códigos con back-compat

**What:** Una función pura que mapea un string a un espacio de nombres, con **prioridad explícita** y normalización.
**When to use:** En el registro (D-03). Vive en el módulo nuevo para no tocar `referrals`.

```ts
// el-templo-api/src/modules/referral-partners/code-resolver.ts
export type SignupCode =
  | {
      kind: "partner";
      partnerId: number;
      tenantId: number;
      branchId: number | null;
    }
  | { kind: "member"; referrerId: number }
  | { kind: "promo"; promoId: number }
  | { kind: "unknown" };

// Orden: partner → promo → socio. Los 3 espacios se validan disjuntos al crear
// el partner (chequeo contra users.referral_code y promo_plans.promo_code),
// así que el orden solo importa ante datos corruptos.
```

**Back-compat obligatoria:** el body de `/api/auth/register` hoy acepta `promoCode` y `ref` [`auth-routes.ts:37-39`]. Las builds nativas viejas van a seguir mandándolos por meses. El campo `code` nuevo se **suma**, no reemplaza; el server resuelve `code ?? ref ?? promoCode`.

### Anti-Patterns to Avoid

- **Generalizar `resolveReferralCode` in-place:** viola la regla dura del CONTEXT y arrastra los 8 acoples a `users` documentados en el BRIEF. El resolver nuevo vive en el módulo nuevo y _llama_ al de referidos como una de sus tres ramas.
- **Escribir el servicio sin `ctx` "porque master todavía no adoptó `referrals`":** el lint de CI compara contra la rama base y **toda entrada nueva en el allowlist es rojo** (ver Pitfall 1). No hay atajo.
- **Confiar en `benefit_type` que venga del cliente:** el beneficio se lee del partner server-side. El cliente manda un código, nada más.
- **Meter la lógica de comisión dentro del `if (!excludedFromReferrals(...))` existente:** ese guard existe para el descuento simétrico socio-a-socio; la comisión de partner es sobre _una venta_, no sobre el descuento. Ver Open Question 3.
- **Crear un job cron para vencer beneficios:** dispara el gate CON-04 por una resta de fechas.
- **Reusar `is_trial=true` para la semana gratis:** rompería el "una prueba por vida" y la contabilidad de capacidad (los trials **bypassean** la capacidad de la grilla a propósito [`trials-service.ts` docblock líneas 19-22]). La semana gratis es una suscripción real y debe contar en capacidad.

## Don't Hand-Roll

| Problem                                    | Don't Build                                | Use Instead                                                                                                                      | Why                                                                                                                          |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Idempotencia del alta de comisión          | Chequeo `SELECT` + `INSERT`                | `subscription_id` UNIQUE + `.onDuplicateKeyUpdate()`                                                                             | Precedente exacto `referral_credits` (`unique_referral_credit_sub`); el `SELECT`+`INSERT` tiene ventana de carrera real      |
| Detección de clave duplicada               | `err.message.includes("Duplicate")`        | Copiar `isDuplicateKeyError()` de `referrals/service.ts:660-674`                                                                 | Drizzle envuelve el error de mysql2 en `DrizzleQueryError`; el `code`/`errno` real puede estar 1-4 niveles abajo en `.cause` |
| Un socio = un origen (D-12)                | Validación solo en servicio                | UNIQUE en `partner_referrals.referred_id` **+** chequeo cruzado en servicio **+** catch de `ER_DUP_ENTRY`                        | Es el patrón textual de `assignReferrerToMember` (dos admins, dos pestañas — la carrera es real y está documentada)          |
| Generar QR PNG                             | Canvas a mano / servicio externo / CDN     | `qrcode` (ya instalado en admin)                                                                                                 | Además: **prohibido CDN en producción** (regla del proyecto)                                                                 |
| Presupuesto de clases de la semana         | Contar reservas a mano                     | `classesPerWeek` del plan → `ceil(durationDays/7)*classesPerWeek`                                                                | Ya lo deriva `assignPlan` [`subs-service.ts:1678`]                                                                           |
| Marcar la membresía como bonificada        | `UPDATE subscriptions SET membership_kind` | `priceOverrideAmount: 0` en `assignPlan`                                                                                         | Es el único camino canónico [`subs-service.ts:1729`]; escribir la columna a mano crea drift con el override/razón            |
| Auditoría del void                         | Borrar la fila de comisión                 | `status='void'` + `voided_at` + razón                                                                                            | Espíritu del módulo contable (`firm-money.ts`, `movement-service.ts`): nada se borra                                         |
| Cancelar la suscripción al anular el cobro | Lógica propia                              | Ya existe: `transaction-service.voidInTx` línea ~525 encuentra el link `targetKind='subscription'` y llama `_cancelSubscription` | Ahí mismo va el void de comisiones, dentro de la misma tx                                                                    |

**Key insight:** el 157 ya resolvió, con incidentes de producción documentados en sus docblocks, todos los problemas difíciles de un sistema de atribución (idempotencia por cobro, carreras del UNIQUE, orden flip-antes-de-cómputo, degradación graceful del alta). La fase 179 es **calcar con disciplina**, no rediseñar. Cada vez que aparezca la tentación de "hacerlo mejor", primero leer el docblock del método equivalente en `referrals/service.ts`: casi siempre explica por qué esa forma "peor" es la correcta.

## Common Pitfalls

### Pitfall 1: El lint de tenancy (CON-06) SOLO PUEDE ACHICARSE — no hay escapatoria

**What goes wrong:** Se escribe el servicio nuevo con `db.select().from(referralPartners).where(eq(...))` sin `tenantWhere`. CI falla en `test/tenancy/con-06-lint.test.ts` y el step "Tenant lint (CON-06)" del workflow. Se intenta "arreglar" agregando el par `{file, table}` a `tenant-lint-allowlist.json` → **sigue rojo**, porque el gate compara la lista contra la de la rama base y toda entrada ganada es una discrepancia.
**Why it happens:** `referrals/service.ts` está en el allowlist (deuda tolerada de antes de la 170), así que el código existente "parece" no necesitar `tenantWhere` y se copia el estilo.
**How to avoid:** escribir tenancy-native desde el primer commit. Las dos únicas salidas válidas son (a) `tenantWhere`/`tenantValues`, o (b) comentario de bloque `/* tenant-safe: <motivo> */` pegado al acceso.
**Warning signs:** `pnpm --dir el-templo-api lint:tenant` en rojo local.
[VERIFIED: `el-templo-api/tenant-lint-allowlist.json` §note D-13/D-14 + `.github/workflows/ci.yml:63-64` + memoria `reference_gates_tenancy_ruta_job_nueva`]

### Pitfall 2: Cuatro gates de CI se disparan por tablas y rutas nuevas (uno tiene conteos hardcodeados)

**What goes wrong:** el PR compila y los tests del módulo pasan, pero CI cae en tests de tenancy que no tienen nada que ver con la feature.
**How to avoid — checklist textual:**

| Gate              | Archivo                                               | Qué hacer                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ISO-01 manifiesto | `test/tenant-manifest.ts`                             | Una entrada `"MÉTODO /path": { categoria: "tenant-scoped" }` **por cada ruta nueva** (sin comodines, D-01) + bumpear `ENTRADAS_BASELINE` y el número en el título del `it` de `test/tenancy/iso-01-manifiesto.test.ts` |
| COL-01 tablas     | `src/db/tenant-tables.ts` → `GYM_OWNED_TABLES`        | Agregar los 3 nombres de tabla                                                                                                                                                                                         |
| COL-01 conteos    | `test/db/tenant-tables.test.ts`                       | **Bumpear los números hardcodeados**: hoy `GYM_OWNED_TABLES.length = 88`, `schemaTables.size = 92` → con 3 tablas van a 91 y 95                                                                                        |
| CON-01 uniques    | `src/db/tenant-tables.ts` → `TENANT_UNIQUE_ALLOWLIST` | Toda unique que NO empiece con `tenant_id` necesita entrada **con motivo escrito**. Ver Pitfall 3                                                                                                                      |

[VERIFIED: `test/db/tenant-tables.test.ts:97-106` @ origin/master]

### Pitfall 3: Las UNIQUE de las tablas nuevas tienen dos formas correctas distintas

**What goes wrong:** se declara `code varchar(16).unique()` inline y el verificador de uniques lo reporta como discrepancia (o peor: dos gimnasios no pueden tener el mismo vanity code cuando llegue el tenant 2).
**How to avoid:** cada unique cae en una de dos categorías, con tratamiento distinto:

- **`referral_partners.code`** → NO deriva de ninguna FK scopeada ⇒ **unique compuesta** `uq_referral_partners_tenant_code (tenant_id, code)`. Es exactamente lo que la fase 168 le hizo a `promo_plans.promo_code` (`uq_promo_plans_tenant_promo_code`) y a `branches.code`.
- **`partner_referrals.referred_id`** y **`partner_commissions.subscription_id`** → derivadas de FK ya scopeada (`users` / `subscriptions`) ⇒ quedan simples **+ entrada en `TENANT_UNIQUE_ALLOWLIST` con motivo**, calcada palabra por palabra de las entradas gemelas que ya existen: `"referrals.referrals_referred_id_unique"` y `"referral_credits.unique_referral_credit_sub"`.

**Warning signs:** `pnpm --dir el-templo-api db:verify-uniques` en rojo.
[VERIFIED: `src/db/tenant-tables.ts:239-345` @ origin/master]

### Pitfall 4: D-08 no funciona tal como está escrito — el funnel de leads exige `status='prueba'`

**What goes wrong:** se asume que "semana terminada sin conversión → funnel de leads" es gratis porque el funnel ya existe. No lo es.
**Why it happens:** el cron `expire-lost-leads.ts` filtra `u.status = 'prueba'` **y** exige un JOIN con la última booking `is_trial = 1` no cancelada. Un socio que consumió la semana gratis tiene `status='inactivo'` (la sub expiró) y **cero bookings `is_trial`** (reservó con plan real). No entra jamás. Además `users.lead_status` está documentado como "NULL para staff/freemium/activo/inactivo" — escribirlo sobre un `inactivo` rompe ese invariante y el reporte de la 163.
**How to avoid:** decidir explícitamente en el plan entre:
(a) **Reporte propio** "beneficios de partner sin conversión" en la página de Partners (o tab de Reportes), sin tocar `lead_status` — barato, no rompe invariantes, cumple el espíritu de D-08 (que la sede haga seguimiento manual con el origen partner visible). **Recomendado.**
(b) Extender el pipeline de leads a una clase de candidato nueva — toca el cron (gate CON-04), el reporte de la 163 y el invariante de `lead_status`. Caro y riesgoso.
**Warning signs:** una tarea del plan que diga "marcar lead_status='en_seguimiento'" sin haber leído `expire-lost-leads.ts`.
[VERIFIED: `src/jobs/expire-lost-leads.ts:56-70` + `src/db/schema/users.ts:76-83` @ origin/master]

### Pitfall 5: El registrado con código de partner también es elegible a la sesión de prueba gratis

**What goes wrong:** el socio usa la clase de prueba de la 119 **y** la semana gratis del partner — dos beneficios por el mismo lead.
**Why it happens:** `getTrialEligibility` devuelve `eligible: true` con la sola condición `status==='freemium'` + sin sub activa + sin booking `is_trial` previa. El vínculo con el partner no participa de ese predicado.
**How to avoid:** decidir precedencia. Recomendado: **si hay `partner_referrals` con `benefit_status='pending'` y `benefit_type='free_pass'`, la semana gana** y la app no ofrece la sesión de prueba (o la ofrece solo tras vencido el beneficio). Implementable como un guard extra en `getTrialEligibility` (una consulta más) o resolviendo la precedencia en la respuesta de elegibilidad.
**Warning signs:** el plan agrega un estado nuevo a `ReservasPage` sin tocar la elegibilidad de trial.
[VERIFIED: `scheduling/trials-service.ts:415-455` @ origin/master]

### Pitfall 6: "Gana el mayor" (D-10) requiere resolver ANTES de gastar AURA

**What goes wrong:** el socio pide descuento AURA en el mismo cobro donde aplica el descuento de partner. El código actual llama `auraService.spend()` **antes** de tocar los descuentos posteriores [`subs-service.ts:1625`]. Si después el partner gana, el socio **ya perdió sus puntos AURA** por un descuento que no se aplicó.
**How to avoid:** en `assignPlan`, resolver el ganador antes del bloque AURA: computar el `%` candidato del partner (lectura pura, sin efectos) y, si gana, **no llamar a `spend()`**. Si gana AURA, aplicar AURA y marcar el beneficio del partner como consumido/perdido según se decida (ver Open Question 4).
**Warning signs:** un test que asigna plan con `auraSpend` y beneficio de partner y no verifica el saldo AURA del socio después.
[VERIFIED: `subscriptions/service.ts:1604-1636` @ origin/master]

### Pitfall 7: El descuento one-shot necesita un ancla de "primera cuota" que no sea la fecha

**What goes wrong:** se implementa "primera cuota" como "el cobro cuya fecha coincide con el alta" o "el primer `subscriptions` del socio", y se rompe con altas prorrateadas, cambios de plan y re-cobros.
**How to avoid:** la invariante limpia es **el descuento de partner se aplica exactamente en el cargo que cualifica el vínculo** (el mismo `pricePaid > 0` que flippea `pending → qualified`). Un solo predicado, imposible de aplicar dos veces gracias al UPDATE guardado. Persistir `applied_percent`/`applied_amount`/`applied_subscription_id` en `partner_referrals` para auditar.
**Nota de borde ya resuelta por el código:** el alta prorrateada a fin de mes (`prorateToMonthEnd`) excluye explícitamente descuentos automáticos [`subs-service.ts:1652`]. Decidir si el partner sigue esa misma exclusión (recomendado: sí, por coherencia — el proporcional es el precio final).

### Pitfall 8: Migraciones — numeración, punto y coma, y el host compartido

**What goes wrong:** tres trampas conocidas del repo, todas con incidentes previos.
**How to avoid:**

- **Numeración:** `origin/master` llega a **0208**; `origin/staging` también llega a 0208 (le falta el 0207). El worktree `et-176` tiene un `0207_seed_module_flags.sql` **sin pushear** que colisiona con `0207_paquete_clases_matrix.sql` de master (colisión del tren, ajena a esta fase). Regla del skill: cuando master y staging divergen, numerar **después del máximo de staging** ⇒ **la fase 179 toma `0209`** (y `0210`+ si necesita más de un archivo). Re-verificar `_migrations` al momento de planificar. [VERIFIED: `git ls-tree origin/master|origin/staging el-templo-api/src/db/migrations/`]
- **Nunca un `;` dentro de un comentario `--`**: el runner splitea por `;` antes de stripear comentarios (rompió todo CI una vez, migración 0119). Usar `--> statement-breakpoint`.
- **Staging y prod comparten servidor MySQL**: toda migración commiteada terminará corriendo contra prod. Cero datos de prueba en migraciones.
- **`drizzle-kit generate` está roto** por drift de `goal_plan_type`: **escribir el SQL a mano**, con el enum byte-idéntico al `mysqlEnum` del schema.

[VERIFIED: `.claude/skills/el-templo-db-migrations/SKILL.md` Hard Rules 1-6 + §Shipping out of order]

### Pitfall 9: El campo manual en `RegisterPage.vue` no llega a los usuarios hasta el build de tiendas

**What goes wrong:** se imprimen las tarjetas y la gente instala una build vieja que no tiene el campo de código.
**Why it happens:** `el-templo-app` se despliega como SPA web (actualiza al instante) **y** como app nativa Capacitor (`com.eltemplo.app`), que requiere build + revisión de tiendas. Los QRs de D-01 apuntan a las tiendas, o sea que el 100% del flujo de partner pasa por la app nativa.
**How to avoid:** el plan debe incluir **bump de versión + builds de tienda** como dependencia dura previa a repartir tarjetas (convención del repo: feature = minor ⇒ `1.7.1 → 1.8.0`), y el material impreso no sale hasta que la build esté publicada.
[VERIFIED: `el-templo-app/package.json` version 1.7.1 + `src-capacitor/capacitor.config.ts` appId `com.eltemplo.app`]

### Pitfall 10: Las URLs de las tiendas NO están en el repo

**What goes wrong:** se implementa el generador de QR y no hay qué codificar.
**Why it happens:** `el-templo-web/data/app-landing.ts` tiene `storeLinks.appStore = "#"` (placeholder). La URL de Play se puede derivar del appId (`https://play.google.com/store/apps/details?id=com.eltemplo.app`), pero la de App Store necesita el **Apple ID numérico**, que no vive en el repo.
**How to avoid:** tarea de plan con `checkpoint:human-verify` — pedirle a Franco las dos URLs definitivas; guardarlas en `system_settings` (o constantes del admin) en vez de hardcodearlas en tres lados.
[VERIFIED: `git show origin/master:el-templo-web/data/app-landing.ts:212-214`]

## Code Examples

### Costura 1 — Registro: dónde se engancha el bloque partner

```ts
// el-templo-api/src/modules/auth/routes.ts @ origin/master
// :199  status: "freemium" as const        ← el alta nace freemium
// :206  if (promoCode) { ... }             ← bloque 1, best-effort (try/catch, log.error)
// :296  if (ref) { ... }                   ← bloque 2, best-effort (try/catch, log.warn)
// :331  generateReferralCode(userId)       ← bloque 3, best-effort
//
// El bloque partner es un CUARTO bloque best-effort en la misma cadena.
// Regla heredada (T-157-11 / UI-SPEC hard rule): NADA de esto puede bloquear
// el alta. Si el partner no resuelve, el usuario queda registrado igual.
```

**Ojo con la tenancy en el registro:** el alta es una ruta **no autenticada**, no hay `request.scope`. El `tenant_id` del `partner_referrals` nuevo debe derivarse de la fila del partner (`partner.tenantId`), igual que el webhook de Wellhub deriva el tenant desde `branches.wellhub_gym_id` — es una de las 4 fuentes legítimas de `TenantContext` documentadas en `shared/tenant.ts`.

### Costura 2 — Los 4 charge-paths + el preview

```ts
// el-templo-api/src/modules/subscriptions/service.ts @ origin/master
//
// Helpers privados a espejar (NO reusar los de referidos, crear los gemelos):
//   :496  qualifyReferralOnCharge(payerUserId, pricePaid)   → gate `pricePaid <= 0 → return`
//   :535  computePriceWithReferralDiscount(userId, base)    → Math.floor(base * pct/100)
//   :555  recordReferralCreditOnCharge(...)                 → no-op si amount <= 0
//
// Puntos de llamada (los 5 que hay que tocar):
//   assignPlan              :1307   → bloque referidos :1652-1661, credit :2006
//   changePlanNow           :3326   → bloque referidos :3469-3476, credit :3715
//   changePlanAfterCurrent  :3801   → bloque referidos :3997-4004, credit :4129
//   renewSubscription       :4166   → bloque referidos :4440-4447, credit :4711
//   getPricingPreview       :4852   → :4923 (SOLO LECTURA: no flippea ni escribe)
//
// El preview usa `simulatePendingQualification` para mostrar el precio que se
// va a cobrar de verdad. El equivalente de partner debe hacer lo mismo o el
// PoS va a mostrar un precio distinto al cobrado (bug de paridad conocido:
// existe test/referrals/preview-parity.test.ts justamente por esto).
```

### Costura 3 — Void automático (D-14)

```ts
// el-templo-api/src/modules/finance/transaction-service.ts @ origin/master
//   :453  async voidInTx(...)
//   :525  const subLink = linkRows.find((l) => l.targetKind === "subscription");
//   :540  await this.subscriptionCanceller._cancelSubscription(...)
//
// Ahí, DENTRO de la misma tx, va:
//   UPDATE partner_commissions SET status='void', voided_at=NOW(), void_reason=?
//   WHERE subscription_id = ? AND status = 'pending'
// (las 'settled' quedan intactas por diseño — D-14)
```

### Costura 4 — Elegibilidad y activación de la semana

```ts
// Patrón a calcar: el-templo-api/src/modules/scheduling/trials-service.ts
//   :212  reserveTrialSelfService()  ← valida, y en UNA db.transaction promueve
//                                       el estado del user + inserta la booking
//   :415  getTrialEligibility()      ← 3 estados que la app consume
//
// Recomendación: UN endpoint que active y reserve en un solo request
// (POST /api/members/scheduling/reserve-partner-week), igual que reserve-trial.
// Dos llamadas separadas (activar plan / reservar) dejan un medio-estado feo:
// semana consumida sin clase reservada si la segunda falla.
```

### Costura 5 — Retroactiva (D-15)

```ts
// Espejo de: referrals/service.ts:434-519 (assignReferrerToMember)
// Ruta espejo de: members/routes.ts:1731-1757
//   POST /api/admin/members/:userId/partner-referral
// Reglas heredadas: 404 si el partner no existe; 409 si el socio ya tiene
// origen (referrals O partner_referrals — D-12); el estado inicial usa el
// MISMO umbral que el cobro (`subscriptions.pricePaid > 0` acotado por
// tenantWhere) → nace 'qualified' y dispara la comisión.
// `qualifiedAt` = AHORA, no la fecha del pago viejo (razonamiento en el
// docblock original: fechar hacia atrás mentiría sobre cuándo empezó el beneficio).
```

### QR client-side en el admin (D-04)

```ts
// el-templo-admin — qrcode ya es dependencia, no hay que instalar nada
import QRCode from "qrcode";

async function downloadStoreQr(
  kind: "play" | "appstore",
  url: string,
  code: string,
) {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#ffffff" },
  });
  // (opciones idénticas a tools/generate-branch-qrs.ts, que ya produce los PNG
  //  de check-in que la imprenta usa hoy → mismo resultado físico validado)
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `qr-${code}-${kind}.png`;
  a.click();
}
```

## State of the Art

| Old Approach                                   | Current Approach                                                                                                                                                                                        | When Changed                         | Impact                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| "master es pre-tenancy" (supuesto del BRIEF)   | **master tiene tenancy de infraestructura** (166-171: migraciones 0190-0196, `shared/tenant.ts`, manifiesto, lint, sentinel) y le falta solo la **adopción por módulo** (172-176, en staging)           | Fases 166-171 en prod                | El plan debe cubrir los 4 gates desde el día uno; y escribir tenancy-native evita el doble shape                                        |
| `referrals/service.ts` con una sola forma      | **Dos formas divergentes**: master usa `ctx`/`tenantWhere` SOLO en `assignReferrerToMember`; `origin/staging` tiene el archivo entero migrado (`ctx` en todos los métodos, `tenantWhere` en 10+ sitios) | Fase 175 (staging)                   | Si el código nuevo _no_ toca `referrals` (regla dura), el conflicto de merge se limita a los charge-paths de `subscriptions/service.ts` |
| Sin `membership_kind`                          | `membership_kind` (`paga`/`bonificada`/`staff`), derivado de `priceOverrideAmount === 0`                                                                                                                | Migración 0199 (2026-08-07)          | La semana gratis sale etiquetada correcta sin código nuevo                                                                              |
| Sin planes cortos                              | `plan_category='paquete'`: 36 filas seed (semanas 1-3 × frecuencia 1-6 × AR/ES), `duration_days = semanas*7`                                                                                            | Fase 177, migración 0207 (en master) | La semana gratis puede reusar `Paquete · 1 sem · N/sem`                                                                                 |
| Descuentos solo AURA                           | `subscriptions.referral_discount_percent/amount` como columnas separadas (D-23)                                                                                                                         | Fase 157                             | Precedente exacto para `partner_discount_*`                                                                                             |
| `tools/generate-branch-qrs.ts` como script CLI | Sigue siendo el patrón de referencia para opciones de QR, pero **la generación de D-04 va client-side**                                                                                                 | —                                    | Evita agregar `qrcode` al API                                                                                                           |

**Deprecated/outdated en el BRIEF (corregir al planificar):**

- "La app **ya lee** `route.query.ref` — cero cambios en la app para la captura": cierto para el link, pero D-02 cambió el camino a **campo manual**, que sí es un cambio de app + build de tiendas.
- "Tenancy: la fase es pre-merge del tren v6.0 en master": la infraestructura de tenancy ya está en master; lo pre-merge es la adopción de módulos.
- "0208 ya tomado por analytics iter2 — verificar colisión": verificado. Siguiente libre real = **0209**.

## Project Constraints (from CLAUDE.md)

Directivas accionables que el plan debe respetar (misma autoridad que las decisiones lockeadas):

| #   | Directiva                                                                                                                                                                                                                   | Impacto en esta fase                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Logging:** API usa `request.log`/`app.log` (Pino). Front usa `createLogger()` de `src/utils/logger.ts`. **Nunca `console.log`**                                                                                           | Los bloques best-effort del registro y la activación de la semana loguean con `request.log.warn`, como los bloques existentes |
| 2   | **TypeScript:** prohibido `any`. `catch (err: unknown)` + `instanceof Error`                                                                                                                                                | El resolver de códigos devuelve union discriminada, no `any`                                                                  |
| 3   | **Tests de API:** toda ruta nueva **debe** traer test de integración en `el-templo-api/test/` contra MySQL real (`eltemplo_test`)                                                                                           | Un archivo de test por superficie (ver Validation Architecture)                                                               |
| 4   | **DB:** schema por Drizzle; SQL a mano commiteado junto al schema; `pnpm db:migrate` (custom runner); **prohibido `drizzle-kit migrate`**; `db:push` no va en trabajo commiteado                                            | Migración `0209_*.sql` escrita a mano, en el mismo commit que los archivos de schema                                          |
| 5   | **Env vars:** toda var nueva se agrega al `.env.example` correspondiente                                                                                                                                                    | Probablemente ninguna (las URLs de tienda mejor en `system_settings`)                                                         |
| 6   | **Pre-commit:** husky + lint-staged (Prettier). Si falla, **commit nuevo, no `--amend`**                                                                                                                                    | —                                                                                                                             |
| 7   | **Patterns:** facade para servicios complejos; stores Pinia composition API; composables exponen `cleanup()` sin `onUnmounted` adentro                                                                                      | El servicio del módulo nuevo es simple: una clase con DI `(db, log)`, como `ReferralService`                                  |
| 8   | **Ejecución GSD:** el modelo caro planifica; los planes detallados los ejecuta `gsd-executor` con `model: sonnet`, **secuencialmente** (worktree compartido), verificando worktree limpio + typecheck + lint tras cada plan | Planes con must_haves, artefactos y verificación explícita                                                                    |
| 9   | **UI en español**, código/comentarios pueden ser bilingües                                                                                                                                                                  | Todos los strings de admin/app en español                                                                                     |

**De la memoria del proyecto (gates humanos, misma autoridad):** nunca instalar dependencias sin preguntar · nunca `git add -A` (stagear por ruta) · preguntar antes de cada `push` y de cada `ssh` · no correr la suite completa local (CI lo hace; typecheck sí) · no hardcodear ids de `users` en tests (resolver `admin@test.com`) · version bump feature = minor · sin CDN en producción.

## Runtime State Inventory

_(No aplica en el sentido clásico — la fase es greenfield, no un rename. Pero sí tiene estado externo que ninguna migración toca y que el plan debe listar como dependencia operativa:)_

| Categoría                | Ítems                                                                       | Acción requerida                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Material físico impreso  | Tarjetas con QRs + código legible del partner                               | **No se imprimen hasta que la build de tiendas con el campo de código esté publicada** (Pitfall 9). Un código impreso mal es papel tirado |
| URLs de tiendas          | `storeLinks.appStore = "#"` en la web; Apple ID numérico ausente del repo   | Human checkpoint: pedir las 2 URLs a Franco antes de generar QRs (Pitfall 10)                                                             |
| Builds nativas           | `com.eltemplo.app` (prod), `com.eltemplo.app.staging`                       | Bump `el-templo-app/version.txt` + propagar a proyectos nativos + workflows de build                                                      |
| Datos de partners reales | Nombre, código vanity, beneficio, comisión, sede, contacto de cada comercio | Los carga Franco/Nacho por el admin. **No van en una migración** (no son datos de sistema)                                                |
| Numeración de migración  | `_migrations` en el MySQL compartido staging/prod                           | Re-verificar el máximo real al momento de escribir el SQL (`SELECT name FROM _migrations ORDER BY name DESC LIMIT 5`)                     |

## Environment Availability

| Dependency                  | Required By                             | Available           | Version                                   | Fallback                                 |
| --------------------------- | --------------------------------------- | ------------------- | ----------------------------------------- | ---------------------------------------- |
| Node.js                     | API + builds                            | ✓                   | v22.22.0                                  | —                                        |
| pnpm                        | monorepo                                | ✓                   | 10.28.2                                   | —                                        |
| MySQL (local)               | `pnpm db:migrate`, tests de integración | ✓                   | 8.0.46                                    | —                                        |
| vitest                      | suite del API                           | ✓                   | instalado en `el-templo-api/node_modules` | —                                        |
| `qrcode` (admin)            | D-04                                    | ✓                   | ^1.5.4 en `el-templo-admin`               | —                                        |
| `tsx`                       | runner de migraciones / tools           | ✓ (vía `pnpm exec`) | —                                         | —                                        |
| URLs de Play/App Store      | Contenido de los 2 QRs                  | ✗                   | —                                         | **Sin fallback** — requiere input humano |
| Apple ID numérico de la app | URL de App Store                        | ✗                   | —                                         | **Sin fallback** — requiere input humano |

**Missing dependencies with no fallback:**

- URLs definitivas de las dos tiendas (bloquean el entregable "botón que descarga los 2 PNG" en su forma final; el resto de la fase avanza igual con URLs placeholder configurables).

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | vitest ^4.0.18 (integración contra MySQL real, una DB por worker: `eltemplo_test_<POOL_ID>`)                                     |
| Config file        | `el-templo-api/vitest.config.ts` (globalSetup `test/setup-global.ts`, setupFiles `test/setup.ts`, `pool: forks`, `maxWorkers` 4) |
| Quick run command  | `pnpm --dir el-templo-api exec vitest run test/referral-partners`                                                                |
| Full suite command | `pnpm --dir el-templo-api test`                                                                                                  |
| Typecheck          | `pnpm --dir el-templo-api exec tsc --noEmit` · frontends: `vue-tsc` (CI **no** typechequea app ni admin)                         |
| Tenancy lint       | `pnpm --dir el-templo-api lint:tenant`                                                                                           |

**Regla del proyecto:** la suite completa la corre CI, no el dev local. Localmente: typecheck + el subconjunto de tests de la fase. Cuando se corran tests, **siempre en foreground con timeout amplio** — prohibido `run_in_background` y loops de espera con `pgrep` (se matchean a sí mismos y cuelgan al ejecutor).

### Phase Requirements → Test Map

| Req       | Comportamiento                                                                                                                      | Test Type                | Automated Command                                                                                                         | File Exists?                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| D-03      | Resolver unificado: partner / promo / socio / desconocido; back-compat de `ref` y `promoCode`                                       | unit+integration         | `vitest run test/referral-partners/code-resolver.test.ts`                                                                 | ❌ Wave 0                                                  |
| D-03      | Alta de partner rechaza código que colisiona con `users.referral_code` o `promo_plans.promo_code`                                   | integration              | `vitest run test/referral-partners/partner-crud.test.ts`                                                                  | ❌ Wave 0                                                  |
| D-12      | Exclusividad de origen: 409 en ambos sentidos (socio→partner y partner→socio)                                                       | integration              | `vitest run test/referral-partners/exclusividad-origen.test.ts`                                                           | ❌ Wave 0                                                  |
| D-11      | Primer pago > 0 flippea a `qualified` **y** crea comisión; re-cobro NO duplica (UNIQUE)                                             | integration              | `vitest run test/referral-partners/qualification-commission.test.ts`                                                      | ❌ Wave 0 (espejar `test/referrals/qualification.test.ts`) |
| D-11      | Pago de $0 (bonificada/semana gratis) NO cualifica ni comisiona                                                                     | integration              | idem archivo                                                                                                              | ❌ Wave 0                                                  |
| D-09/D-10 | Descuento one-shot en el cargo que cualifica; gana-el-mayor vs AURA **sin gastar puntos** cuando pierde                             | integration              | `vitest run test/referral-partners/discount-charge.test.ts` (espejar `test/referrals/discount-charge.test.ts`)            | ❌ Wave 0                                                  |
| D-09      | Paridad preview↔cobro del precio con descuento de partner                                                                           | integration              | `vitest run test/referral-partners/preview-parity.test.ts` (espejar el de referidos)                                      | ❌ Wave 0                                                  |
| D-05/D-06 | Activación de la semana: plan 7 días, `membership_kind='bonificada'`, budget derivado, reserva creada; segunda activación rechazada | integration              | `vitest run test/referral-partners/semana-gratis.test.ts`                                                                 | ❌ Wave 0                                                  |
| D-06      | Precedencia semana gratis vs sesión de prueba freemium                                                                              | integration              | idem archivo                                                                                                              | ❌ Wave 0                                                  |
| D-07      | Beneficio vencido a 30 días: no activable, vínculo sigue vivo para atribución                                                       | integration              | idem archivo                                                                                                              | ❌ Wave 0                                                  |
| D-13      | Comisión en ARS y en EUR según sede/país del partner                                                                                | integration              | `vitest run test/referral-partners/qualification-commission.test.ts`                                                      | ❌ Wave 0                                                  |
| D-14      | Void de transacción → comisiones `pending` a `void`; `settled` intactas                                                             | integration              | `vitest run test/referral-partners/void-comisiones.test.ts`                                                               | ❌ Wave 0                                                  |
| D-15      | Retroactiva: 404 partner inexistente, 409 doble origen, nace `qualified` si ya pagó                                                 | integration              | `vitest run test/referral-partners/admin-assign-partner.test.ts` (espejar `test/referrals/admin-assign-referrer.test.ts`) | ❌ Wave 0                                                  |
| D-16      | Liquidación batch: todo `pending` del partner → `settled` con fecha+usuario; idempotente; no toca otros partners                    | integration              | `vitest run test/referral-partners/liquidacion.test.ts`                                                                   | ❌ Wave 0                                                  |
| Gates     | Manifiesto de rutas, tablas gym-owned, uniques, lint                                                                                | integration (ya existen) | `vitest run test/tenancy test/db/tenant-tables.test.ts`                                                                   | ✅ existen — hay que **actualizarlos**                     |
| RBAC      | Roles no autorizados reciben 403 en las rutas admin nuevas                                                                          | integration              | `vitest run test/referral-partners/partner-crud.test.ts`                                                                  | ❌ Wave 0                                                  |

### Sampling Rate

- **Per task commit:** `pnpm --dir el-templo-api exec tsc --noEmit` + `vitest run test/referral-partners` (+ `vue-tsc` si el commit toca admin/app)
- **Per wave merge:** `vitest run test/referral-partners test/referrals test/tenancy test/db/tenant-tables.test.ts` + `lint:tenant`
- **Phase gate:** suite completa en CI verde antes de `/gsd:verify-work` (no local, por regla del proyecto)

### Wave 0 Gaps

- [ ] `test/referral-partners/` — el directorio entero (13 archivos según el mapa de arriba)
- [ ] Fixtures/helpers: alta de partner de prueba + socio referido por partner (extensión de `test/helpers.ts`; **resolver ids de usuario por email**, nunca hardcodear)
- [ ] Actualización de los 4 gates existentes (manifiesto, conteos de tablas, allowlist de uniques, lint)
- [ ] Framework install: **no hace falta** — vitest ya instalado y configurado

## Security Domain

### Applicable ASVS Categories

| ASVS Category               | Applies          | Standard Control                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | sí (parcial)     | El registro sigue siendo público; el código NO es credencial. Las rutas admin usan `fastify.authenticate` + set de roles de `shared/permissions.ts`                                                                                                                                                                                                                         |
| V3 Session Management       | no               | Sin superficie nueva de sesión                                                                                                                                                                                                                                                                                                                                              |
| V4 Access Control           | **sí (crítico)** | (a) **IDOR/tenancy:** todo acceso con `tenantWhere`/`assertTenant`; (b) **RBAC:** liquidar comisiones es acción con consecuencia económica → gatear con un set restrictivo tipo `FINANCE_VOID_ROLES` (`owner`/`admin`/`gestion`), no con `ALL_STAFF_ROLES`; (c) el cliente manda un **código**, jamás un `partnerId` o un `benefit_value` (precedente Security V4/T-157-08) |
| V5 Input Validation         | sí               | JSON Schema de Fastify en toda ruta nueva (patrón `schemas.ts` del repo); `code` normalizado (upper + trim) y con largo/charset acotados; `benefit_value` 1-100 para porcentaje; `commission_value >= 0`                                                                                                                                                                    |
| V6 Cryptography             | no               | Los QRs de esta fase apuntan a URLs públicas de tienda: **no llevan token ni firma**. (Contraste deliberado: `shared/qr-token.ts` firma HMAC porque el QR de check-in _sí_ es una credencial. No copiar ese patrón acá sin necesidad.)                                                                                                                                      |
| V7 Error handling / Logging | sí               | Bloques best-effort loguean con `request.log.warn` sin PII cruda; el código del partner puede loguearse (no es secreto)                                                                                                                                                                                                                                                     |
| V8 Data protection          | sí (menor)       | Contacto del partner (nombre/teléfono) es dato personal de un tercero: no exponerlo en superficies member-facing                                                                                                                                                                                                                                                            |

### Known Threat Patterns for este stack

| Pattern                                                                    | STRIDE                             | Standard Mitigation                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enumeración de códigos de partner en el registro                           | Information Disclosure             | Respuesta uniforme: código inválido = alta exitosa sin beneficio (ya es el comportamiento de `?ref` hoy); no revelar "ese código no existe" con timing/mensaje distinto |
| Auto-referencia / fraude de atribución                                     | Spoofing                           | UNIQUE `referred_id` + exclusividad de origen (D-12) + comisión atada a `pricePaid > 0` real. Precedente: `test/referrals/anti-fraud.test.ts` — **espejarlo**           |
| Doble cobro de comisión por re-cobro del mismo cargo                       | Tampering                          | `subscription_id` UNIQUE + `onDuplicateKeyUpdate`                                                                                                                       |
| Doble consumo del beneficio (dos requests simultáneos activan dos semanas) | Tampering                          | UPDATE guardado `WHERE benefit_status='pending'` (chequeo del `affectedRows`) + el guard de solapamiento de `assignPlan` como segunda línea                             |
| Cross-tenant read/write en las tablas nuevas                               | Information Disclosure / Elevation | `tenantWhere`/`tenantValues` + entrada en el manifiesto + batería ISO-03                                                                                                |
| Escalada por payload en la retroactiva (asignar partner de otro gimnasio)  | Elevation of Privilege             | `assertTenant` + validar que el partner pertenece al tenant del scope                                                                                                   |
| Inyección SQL                                                              | Tampering                          | Drizzle parametriza; en `sql` crudo, interpolar solo enteros ya validados (precedente del `windowDays` en `expire-lost-leads.ts`)                                       |

## Assumptions Log

| #   | Claim                                                                                                                                                    | Section             | Risk if Wrong                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | La colación de MySQL hace las comparaciones de `code` case-insensitive (`utf8mb4_*_ci`), así que `CAFEX` y `cafex` matchean                              | Pattern 4           | Si es `_bin`/`_cs`, un socio que tipea minúsculas no obtiene el beneficio. **Mitigación barata e independiente: normalizar a upper+trim en el server al guardar y al resolver** — hacerlo igual, y verificar la colación con `SHOW FULL COLUMNS` en la tarea de schema |
| A2  | La frecuencia semanal correcta para la semana gratis es un valor a definir con Franco (¿3/sem? ¿libre?)                                                  | Pattern 3 / Open Q1 | Un budget muy chico frustra al lead; muy grande regala demasiado                                                                                                                                                                                                       |
| A3  | El descuento de partner debe seguir las mismas exclusiones por categoría que el de referidos (`especial`, `paquete`) y la exclusión del alta prorrateada | Pitfall 7           | Si Franco quiere que el descuento aplique a un paquete, hay que separar los guards                                                                                                                                                                                     |
| A4  | `settled` implica "el partner cobró fuera del sistema"; el sistema no genera egreso en caja                                                              | Liquidación         | Si Franco espera que la liquidación impacte caja/gastos, el alcance crece (módulo contable) — el BRIEF dice explícitamente que NO mueve plata                                                                                                                          |
| A5  | Los 3 espacios de códigos son hoy disjuntos en producción (ningún `promo_code` igual a un `referral_code`)                                               | Pattern 4           | Un choque preexistente haría que el resolver elija mal. Verificable con una query de una línea antes de escribir el resolver                                                                                                                                           |
| A6  | El plan de la fase se ejecuta con base `origin/master` y luego se porta a staging (precedente del fix N+1 de referidos)                                  | State of the Art    | Si Franco prefiere esperar al tren v6.0 en master, la fase se simplifica (un solo shape) pero se demora — **decisión de Franco, no del planner**                                                                                                                       |

## Open Questions (RESOLVED)

> Las 6 quedaron cerradas en la sesión de contexto del 2026-08-22 (`179-CONTEXT.md`). Cada una lleva su resolución inline y el ID de decisión que la fija.

1. **¿Cuántas clases incluye la semana gratis?**
   - Lo que sabemos: `classesRemaining = ceil(durationDays/7) * classesPerWeek`, y la 177 sembró paquetes de 1 semana con frecuencias 1 a 6.
   - Lo que falta: el número comercial (y si es el mismo en AR y ES).
   - Recomendación: 3/semana como default (frecuencia más vendida), configurable por partner en v2. Confirmar con Franco en el checkpoint de arranque.
   - ✅ **RESUELTA — D-19:** 3 clases por semana (plan `paquete` de 1 semana, frecuencia 3, precio 0). Mismo valor en AR y ES; configurable por partner queda para v2.

2. **D-08 tal como está escrito no es implementable** (ver Pitfall 4).
   - Lo que sabemos: el funnel de leads exige `status='prueba'` + booking `is_trial`; el `lead_status` es NULL por diseño para `inactivo`.
   - Recomendación: reporte propio "beneficios de partner sin conversión" en la página de Partners, sin escribir `lead_status`. Requiere OK de Franco porque cambia la letra de la decisión.
   - ✅ **RESUELTA — D-08 reescrita (OK Franco 2026-08-22):** se adopta el reporte propio. PROHIBIDO escribir `users.lead_status` o tocar el pipeline de leads v5.8. Se implementa en 179-10 (`listBenefitsWithoutConversion`).

3. **¿La comisión de partner dispara con la compra de un `paquete` o un pase `especial`?**
   - Lo que sabemos: `excludedFromReferrals()` excluye `especial` y `paquete` del descuento simétrico socio-a-socio; el guard existente envuelve flip + descuento juntos.
   - Recomendación: separar los guards — **comisión** = `pricePaid > 0` (cualquier categoría: es una venta real), **descuento de partner** = mismas exclusiones que el de referidos. Confirmar con Franco (afecta cuánta plata se paga).
   - ✅ **RESUELTA — D-17:** la comisión dispara con **toda venta real** (`pricePaid > 0`, cualquier categoría, incluidos `paquete` y `especial`). El descuento de partner mantiene las exclusiones de `excludedFromReferrals`; la comisión NO usa ese guard.

4. **Si AURA gana el "gana el mayor", ¿el beneficio de partner se consume o queda vivo?**
   - Lo que sabemos: D-09 dice one-shot en la primera cuota; D-10 dice gana el mayor.
   - Recomendación: se **consume igual** (queda registrado `applied_percent = 0` con motivo "perdió vs AURA"), porque "primera cuota" ya pasó. Alternativa (dejarlo vivo para la segunda cuota) contradice D-09.
   - ✅ **RESUELTA — D-20:** se **consume igual**, con `applied_percent = 0` y motivo "perdió vs AURA". Además el ganador se resuelve **antes** del bloque AURA (lectura pura, sin `spend()` si gana el partner).

5. **¿Página propia `/partners` o tab dentro de Planes/Reportes?**
   - Lo que sabemos: son 3 superficies (CRUD, conversiones, liquidación) y el patrón del repo para eso es página con `q-tabs` (`ReportesPage.vue`, `PlanesPage.vue`).
   - Recomendación: página propia `/partners` con 3 tabs, ítem de nav en el header "Finanzas" o "Configuración" de `templo-config.ts`, `meta.allowedRoles` restrictivo.
   - ✅ **RESUELTA — D-20:** página propia `/partners` con 3 tabs (CRUD / conversiones / liquidación) y `meta.allowedRoles` restrictivo.

6. **¿Dónde viven las URLs de tienda?** Recomendación: `system_settings` (claves `app.store_url.android` / `app.store_url.ios`), leídas por el admin al generar el QR — evita hardcodear y permite cambiarlas sin deploy. Requiere las URLs reales de Franco.
   - ✅ **RESUELTA — D-20:** `system_settings` con las claves `app.store_url.android` / `app.store_url.ios`, leídas por el admin al generar el QR. ⚠ Faltan las URLs reales — la de iOS bloquea el QR final, no el desarrollo.

## Sources

### Primary (HIGH confidence)

Todo lo siguiente fue leído directamente de `origin/master` (commit de referencia: `6ff65ae3`) con `git show`:

- `el-templo-api/src/modules/referrals/service.ts` — `generateReferralCode:97`, `resolveReferralCode:138`, `computeReferralDiscountPercent:190`, `qualifyFirstPayment:367`, `assignReferrerToMember:434`, `recordReferralCredit:529`, `isDuplicateKeyError:660`
- `el-templo-api/src/modules/subscriptions/service.ts` (6092 líneas) — helpers de referidos `:496/:535/:555`, `assignPlan:1307`, guard de solapamiento `:1455`, cadena de precio `:1514-1637`, bloque referidos `:1652`, `membershipKind:1729`, `changePlanNow:3326`, `changePlanAfterCurrent:3801`, `renewSubscription:4166`, `getPricingPreview:4852`
- `el-templo-api/src/modules/auth/routes.ts` — `RegisterBody:28-40`, `status freemium:199`, bloque promo `:206`, bloque referido `:296`
- `el-templo-api/src/modules/scheduling/trials-service.ts` — docblock `:1-22`, `reserveTrialSelfService:212`, `getTrialEligibility:415`
- `el-templo-api/src/modules/finance/transaction-service.ts` — `voidInTx:453`, back-edge de cancelación `:525-540`
- `el-templo-api/src/jobs/expire-lost-leads.ts` — predicados del candidato `:56-70`
- `el-templo-api/src/db/schema/` — `referrals.ts`, `referral-credits.ts`, `promo-plans.ts`, `subscriptions.ts`, `subscription-plans.ts`, `users.ts`, `branches.ts`, `transaction-links.ts`, `tenant-column.ts`
- `el-templo-api/src/db/tenant-tables.ts` — `GYM_OWNED_TABLES:69`, `TENANT_GLOBAL_UNIQUES:239`, `TENANT_UNIQUE_ALLOWLIST:293`
- `el-templo-api/test/tenant-manifest.ts` (docblock de reglas) · `el-templo-api/test/db/tenant-tables.test.ts:97-106` · `el-templo-api/test/tenancy/*`
- `el-templo-api/tenant-lint-allowlist.json` (§note, D-13/D-14/D-16)
- `el-templo-api/src/db/migrations/0199_membership_kind.sql`, `0207_paquete_clases_matrix.sql`
- `el-templo-api/vitest.config.ts` · `el-templo-api/package.json` · `.github/workflows/ci.yml`
- `el-templo-admin/package.json` (qrcode ^1.5.4, jszip ^3.10.1) · `src/router/routes.ts` · `src/config/templo-config.ts` · `src/pages/ReportesPage.vue` · `src/components/AssignPlanDialog.vue:1442-1461`
- `el-templo-app/src/pages/RegisterPage.vue` · `src/pages/ReservasPage.vue:880-960` · `src-capacitor/capacitor.config.ts` · `package.json` (v1.7.1)
- `el-templo-web/data/app-landing.ts:212-214` (storeLinks placeholder)
- `tools/generate-branch-qrs.ts`
- `.claude/skills/el-templo-db-migrations/SKILL.md` (Hard Rules 1-6, runner, host compartido, numeración fuera de orden)
- `.claude/skills/el-templo-change-control/SKILL.md` (staging-first, gates humanos, clasificación de cambio)
- `CLAUDE.md` · `.planning/REQUIREMENTS.md` · memoria `reference_gates_tenancy_ruta_job_nueva`
- `npm view qrcode version` → `1.5.4` (latest, publicada 2025-11-13)

### Secondary (MEDIUM confidence)

- Estado de ramas/worktrees para la numeración de migración: `git ls-tree origin/master|origin/staging`, inventario de 50 worktrees (`0207_seed_module_flags.sql` sin pushear en `et-176`)
- Memoria del proyecto (`MEMORY.md`, topic files de las fases 173/175.1/176/177) para el estado del tren v6.0

### Tertiary (LOW confidence)

- Ninguna. **No se usó WebSearch**: el dominio es 100% interno y la única dependencia externa (`qrcode`) ya está instalada y se verificó contra el registry.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — cero paquetes nuevos; los existentes están en `package.json` commiteado y verificados contra npm
- Arquitectura y costuras de integración: **HIGH** — las 5 costuras se leyeron línea por línea sobre `origin/master` con números de línea citados
- Pitfalls 1-3 (gates de tenancy): **HIGH** — verificados contra los archivos de gate y sus assertions hardcodeadas
- Pitfalls 4-6 (conflictos con D-06/D-08/D-10): **HIGH** en el diagnóstico técnico, **MEDIUM** en la resolución propuesta (requieren decisión de producto de Franco)
- Numeración de migración: **MEDIUM** — verificada contra master, staging y 50 worktrees hoy; el tren se mueve, re-verificar `_migrations` al planificar
- Estimación de la interacción con el tren v6.0: **MEDIUM** — depende de cuándo baje el tren a master, que es una decisión de Franco

**Research date:** 2026-08-22
**Valid until:** ~2026-09-05 (14 días). Se invalida antes si: el tren v6.0 baja a master (cambia el shape de `referrals`/`subscriptions` y la numeración de migraciones), o si se publica una build de app con cambios en `RegisterPage.vue`.
