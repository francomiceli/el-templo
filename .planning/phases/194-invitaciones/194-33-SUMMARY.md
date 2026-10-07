---
phase: 194-invitaciones
plan: 33
subsystem: api
tags: [code-review, invitaciones, plan-invitacion, settings, canal-asistido, sepa, refactor]
requires: [194-29]
provides:
  - "Plan Invitación protegido (updatePlan/deactivatePlan/create) y accesos editables por settings"
  - "GET/PUT /api/admin/settings/invitations con accessesPerInvitation por país y limits"
  - "Post-cobro único (charge-side-effects.ts), cobertura/duplicate-key/config/avisos fuera del ciclo de imports"
affects: [194-34]
key-files:
  created:
    - el-templo-api/src/modules/subscriptions/invitation-plan-guard.ts
    - el-templo-api/src/modules/subscriptions/charge-side-effects.ts
    - el-templo-api/src/modules/subscriptions/coverage.ts
    - el-templo-api/src/modules/subscriptions/invitation-access.ts
    - el-templo-api/src/modules/referrals/referral-config.ts
    - el-templo-api/src/modules/referrals/duplicate-key.ts
    - el-templo-api/src/modules/referrals/invitation-link-notifications.ts
    - el-templo-api/src/modules/referrals/invitation-purchase.ts
    - el-templo-api/src/modules/shared/dni.ts
    - el-templo-api/test/invitations/invitation-plan-protection.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/referrals/invitation-settings.ts
    - el-templo-api/src/modules/members/routes.ts
metrics:
  commits: 14
  service-ts-lines: "8086 -> 7629 (-457)"
---

# Phase 194 Plan 33: fixes del code review (API) Summary

Corrige del lado API los hallazgos de `194-REVIEW.md` acordados con Franco: HI-02, ME-01..ME-08 (ME-09 queda para UAT), LO-02, LO-03, LO-04, LO-06, LO-07. HI-01 NO se corrige.

## Hallazgo -> commit -> test

| Hallazgo | Tipo | Commit | Test |
|---|---|---|---|
| HI-02 plan Invitación inmutable, 1 por país, accesos por settings | comportamiento | `84395c462` | `invitation-plan-protection.test.ts` (24: PUT 400 por isTrial/categoría/multiBranch/precios/classesPerWeek, PATCH deactivate 400, 409 de segundo plan por país, PUT de accesos + activación posterior, rangos, atómico, roles) |
| LO-03 rangos en una fuente | refactor | `84395c462` | mismo archivo (`limits` del GET == `getInvitationSettingLimits()`), `settings.test.ts` (27 verdes con el schema generado) |
| ME-02 ciclo de importaciones | refactor | `3f4050b7c` | `discount-arbiter.test`, `covered-until.test`, `code-generation.test` (89) |
| ME-01 post-cobro único | refactor | `c045d6f1c` | `discount-arbiter-paths` (64), `conversion-link`, `preview-parity` (124 en total), más partners `discount-charge`, `change-plan-charge`, `qualification-commission`, `renewal` |
| ME-07 una definición de "compró" | refactor | `4630b1b4c` | `member-overview`, `conversion-link`, `leads` (51) |
| LO-02 código muerto y wrappers | refactor | `4ca5a80fa` | `quota`, `activate`, `void`, `eligibility`, `assisted`, `discount-arbiter`, `discount-characterization`, `change-plan-charge`, `preview-parity`, `member-plans`, `pricing-golden`, `admin-assign-referrer`, `member-endpoint`, `discount-computation` |
| LO-04 helper de meses y zona horaria | refactor | `fe1628ef5` | `quota.test.ts` (21, +`addMonths/shiftMonth`), `report`, `leads-list` |
| ME-03 copy del invitado | comportamiento | `17a112339` | `member-routes.test.ts` (copy genérico para cupo/membresía, 2ª persona, copy del staff intacto) |
| ME-04 solo `member` en el canal app | comportamiento | `17a112339` | `member-routes.test.ts` (coach/recepcion/gestion 403 en GET y POST, ficha sin cambios, control 200/201) |
| ME-05 `admin_sede` acotado a sus sedes | comportamiento | `9fb3172b3` | `assisted.test.ts` (+7: invitador/invitado de otra sede 404, sede destino ajena 403, anular otra sede 404, `/trial`, control gestion). Con mutación: sin el chequeo fallan invitador ajeno y `/trial` |
| ME-06 compra con inicio futuro recorta accesos | comportamiento | `1ddad6f27` | `purchase-closes-access.test.ts` (+5: recorte, pausados, no alarga, inicio hoy cierra, rollback) |
| ME-08 "Importe último cobro" | comportamiento | `00bb1e2c3` | `sepa-domiciliacion.test.ts` (13) |
| LO-06 DNI normalizado, teléfono con rastro | comportamiento | `a41418b02`, `c398d3a62` | `activate.test.ts` (+4: `dni_taken` con formato en ambos sentidos, guardado normalizado, audit de reemplazo y sin rastro cuando no corresponde) |
| LO-07 403 y nombre del set | comportamiento | `9bf1c2e93` | `report.test.ts` (mensaje), `rbac-sets.test.ts` |
| (extra) 3 casos de renovación de `pricing-golden` desfasados | test | `c12e567f2` | `pricing-golden.test.ts` (32) |

HI-01 (activación sin atomicidad ni barrido): riesgo ACEPTADO por Franco. Un corte de proceso entre el commit de la fila `invitations` y el final del paso 4 deja una invitación `active` sin sub que consume cupo y ventana; hoy el rescate es manual. Queda documentado en `194-REVIEW.md`.

## Tamaño de `subscriptions/service.ts`

8086 -> **7629 líneas (-457)**. Salen el post-cobro de las 4 charge-paths (`charge-side-effects.ts`, ~270 líneas con docblocks) y las derivaciones de covered-until (`coverage.ts`, 257 líneas); entra solo el cableado (guards de plan, recorte ME-06, `chargeEffectsDeps`). `invitation-service.ts` 959 -> 937.

## Contrato nuevo para 194-34

### `GET /api/admin/settings/invitations` (cualquier staff) y `PUT` (gestion/admin/owner)

Respuesta de ambos (el PUT devuelve la misma vista):

```
{
  monthlyQuota, accessBusinessDays, reinviteWindowDays, exMemberInactivityMonths,
  latePurchaseWindowDays, inviteePercent,            // enteros, como antes
  discountCapAmount: { AR: number|null, ES: number|null },
  perLinkPercent, maxPercentCap,                      // solo lectura, como antes
  accessesPerInvitation: { AR: number|null, ES: number|null },   // NUEVO: classes_per_week del plan Invitación activo del país; null = el país no tiene plan
  limits: {                                           // NUEVO: rangos inclusivos del servidor
    monthlyQuota: {min,max}, accessBusinessDays: {min,max}, reinviteWindowDays: {min,max},
    exMemberInactivityMonths: {min,max}, latePurchaseWindowDays: {min,max}, inviteePercent: {min,max},
    accessesPerInvitation: {min: 1, max: 10}
  }
}
```

PUT acepta parcial: `accessesPerInvitation: { AR?: 1..10, ES?: 1..10 }` (entero, por país, sin `null`). Un país sin plan Invitación da 400 y el patch completo no se escribe (misma transacción). Países desconocidos se descartan en silencio (`additionalProperties:false`). Las activaciones nuevas usan el valor nuevo; las ya activadas conservan su `classes_budget`. El admin no debe duplicar los rangos: leer `limits`.

### Planes (`PUT /plans/:id`, `PATCH /plans/:id/deactivate`)

Para un plan con `isTrial && planCategory === "paquete"` (el campo ya viene en la lista y el detalle):
- `PUT` con un valor DISTINTO al actual de `isTrial`, `planCategory`, `multiBranch`, `priceRegular`, `priceZero`, `priceCreditCard` -> 400 "El plan Invitación es del sistema...". `classesPerWeek` distinto -> 400 "Los accesos del plan Invitación se cambian en Configuración > Invitaciones". Reenviar el mismo valor (el formulario manda el plan completo) y renombrar/describir siguen dando 200.
- `PATCH deactivate` -> 400.
- Un segundo plan Invitación en el mismo país (create, o update que lo convierta) -> 409. La API de entrada no acepta `paquete`, así que ese 409 solo se alcanza por servicio.

### Canal app del socio

- `GET .../invitations/eligibility` y `POST .../invitations/activate`: `role !== "member"` -> **403** `{ error: "Acceso denegado", message: "Solo los socios pueden activar una invitación" }`.
- `message` ahora es copy del INVITADO (`INVITEE_MESSAGES`, segunda persona); cupo agotado y membresía vencida del invitador devuelven el mismo texto genérico ("Esta invitación no está disponible en este momento. Pedile a quien te invitó que te mande otra más adelante."). El `reason` no cambia (la app sigue decidiendo "definitivo" por `reason`). El canal asistido sigue con `INELIGIBLE_MESSAGES`.

### Otros contratos que cambian

- Export SEPA: columnas `Importe último cobro` y `Moneda último cobro` (antes `Importe`/`Moneda`), siguen al final.
- `pricing-preview` y `change-plan-preview` ya NO traen `referralDiscountPercent/Amount` (deprecados desde 194-15/17); usar `invitationDiscountPercent/Amount`. Las columnas `referral_*` de la SUB (y su tipo en `types/subscription.ts` del admin) no cambian.
- Ficha del admin / listados no cambian.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 3 casos de `pricing-golden` (renovación) rotos desde 194-18**
- **Found during:** LO-02 (corrida de `pricing-golden`)
- **Issue:** 194-18 (D-22/D-08) verificó las suites de renovación pero no `pricing-golden`: la renovación ya no hereda el descuento AURA del alta (base 10000, no 9000) y los planes creados por API necesitan `allowsInvitationDiscount`. Fallaban "AURA heredado", "referral evaluado fresco" y "combo".
- **Fix:** expectativas actualizadas (9000 -> 10000; 8100 -> 9000) y flag en los planes, con el motivo en comentario. No toca producción.
- **Commit:** `c12e567f2`

**2. [Rule 3 - alcance] LO-06 con rastro en audit_log en vez de no pisar el teléfono**
- El review ofrecía "no pisar si ya hay uno válido (o guardar el cambio en audit_log)". Se eligió el rastro: un socio que cambió de número y tipea el actual en la app lo necesita en `users.phone` para que gestión lo contacte. Acción nueva `invitation_phone_replaced` (columna `varchar`, sin migración).

**3. [Hallazgo parcialmente ya cubierto] ME-05**
- Con mutación del chequeo nuevo, "invitado de otra sede" y "anular de otra sede" siguen dando 404: ya los cortaba un guard previo del módulo. El hueco real era el INVITADOR (y el invitador del alta `/trial`), ahora cerrado.

**4. [Alcance de ME-07] "compró" sigue siendo dos preguntas, ahora en un solo archivo**
- `paidSinceActivationSql` (compró, cualquier estado: alimenta `inactivo` en "Mis invitados") y `paidMembershipInEffectSql` (compra vigente: gate de conversión). Unificarlas en una sola cambiaba números (un socio que dejó vencer su membresía dejaría de verse `inactivo`). Se dejó sin cambio de comportamiento; **la decisión de producto de si una compra cancelada o programada debe convertir sigue abierta** (anotada en el docblock de `invitation-purchase.ts`).

**5. [Alcance de ME-02] Queda un ciclo preexistente**
- Salieron del ciclo `referrals/service`, `invitation-settings`, `invitation-rules`, `invitation-overview`, `invitation-link` y `discount-arbiter`. Queda `communications <-> notifications <-> subscriptions/service/member-routes`, que existe en master y es ajeno a la fase.

### Deuda que no se tocó
- `getInvitationSettings(db, ctx, log)`: el 3.er parámetro quedó sin uso (renombrado `_log`) para no tocar ~15 llamadores.
- ME-09 (corte UTC del último día hábil): queda para UAT, ya en el checklist.
- LO-01, LO-08, LO-09 fuera por decisión. LO-05 y LO-10 (frontends) y los restos de copy de LO-07 (`ReferralCtaCard`, "null accesos" en el admin) son de 194-34.
- `pnpm typecheck:tests` sale 1 por deuda preexistente ajena (analytics 2->4, attendance y lifecycle con entradas obsoletas del baseline, `test/unit/*`); ningún archivo de este plan agrega errores (los de `sepa-domiciliacion` y `change-plan-charge` están en líneas que no se tocaron).

## Gates

`tsc --noEmit` 0, `lint:tenant` 0 discrepancias. Sin rutas ni roles nuevos: manifiesto y baselines de tenancy intactos. Sin migraciones, sin dependencias nuevas.

## Lecciones para el resto de la fase

- `lint:tenant` exige el `tenantWhere` LITERAL en cada statement: un helper que devuelva la condición de plan/tenant, o un `sql` de `invitations` en una constante aparte, da discrepancia. Repetir el filtro inline y pegar `/* tenant-safe: ... */` al fragmento.
- Un script Python largo con heredoc dentro de un `Bash` compuesto lo bloquea el hook: escribirlo con Write y ejecutarlo en una llamada simple.
- `pnpm exec vitest` dentro de `Bash` pasa a segundo plano a los 120 s: pasar `timeout: 600000` a la herramienta.
- `cleanAllTestData` borra los usuarios staff: crearlos en `beforeEach`, no en `beforeAll`.
- El `reason` de la preview de elegibilidad sigue exponiendo `inviter_quota_exhausted`/`inviter_not_member` en el JSON (la app no lo muestra). Si Franco quiere cerrar también ese dato hay que colapsarlos en un `reason` genérico y tocar `DEFINITIVE_REASONS` de la app.

## Self-Check: PASSED

Archivos creados verificados en disco; los 14 commits existen en `git log 12f19831a..HEAD`.
