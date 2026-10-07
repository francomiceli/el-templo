---
phase: 194-invitaciones
plan: 19
subsystem: api
tags: [invitations, overview, mis-invitados, derived-states, d-26e, d-10e, sc-5, sc-6]
requires:
  - phase: 194-03
    provides: deriveMembershipCoveredUntilBatch (cobertura de membresia)
  - phase: 194-08
    provides: InvitationRules (cupo) / getInvitationSettings
  - phase: 194-14
    provides: computeInvitationDiscountPercent (% por lado)
provides:
  - estados derivados de invitados y etapa de lead (funciones puras)
  - bloques `invitations` e `invitedBy` en el overview (ruta del socio y ficha admin)
  - desglose del descuento por lado (`discount.bySide`)
  - loadTrainedBranches (sedes donde entreno, batch) reusable por 194-20
affects: [194-20, 194-24, 194-26, 194-27]
tech-stack:
  patterns: [lo nuevo vive en archivos propios de referrals/ y service.ts solo delega]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-states.ts
    - el-templo-api/src/modules/referrals/invitation-overview.ts
    - el-templo-api/src/modules/referrals/invitation-trained-branches.ts
    - el-templo-api/test/invitations/invitation-states.test.ts
    - el-templo-api/test/invitations/member-overview.test.ts
  modified:
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/referrals/types.ts
    - el-templo-api/src/modules/referrals/invitation-rules.ts
    - el-templo-api/test/referrals/member-endpoint.test.ts
    - el-templo-api/test/tenancy/iso-03-referrals.test.ts
key-decisions:
  - "Los estados y la etapa se derivan en lectura con funciones puras que reciben `today` (sin reloj ni DB); la misma regla alimenta el overview (194-19) y, espejada en SQL, el listado de leads (194-20)"
  - "`sumaDescuento` = vinculo `qualified` inviter->invitee Y el invitado con cobertura de membresia hoy (coincide con `activeInvitees` y con `discount.bySide.inviter.activeCount`)"
  - "'Compro' = sub PAGA (price_paid > 0), no-trial, creada desde la activacion de ESA invitacion; una sub cancelada cuenta como compra (estado inactivo)"
  - "El descuento se abre por lado en el bloque historico `discount.bySide` (inviter/invitee), con el % del invitado desde `invitations.invitee_percent`"
requirements-completed: [SC-5, SC-6, D-04, D-10, D-26, D-18, D-10e]
completed: 2026-10-07
---

# Phase 194 Plan 19: "Mis invitados" API Summary

**`GET /api/members/referrals` y la ficha `GET /api/admin/members/:userId/referrals` devuelven, en una sola llamada y con un numero constante de queries, el cupo del mes, el link `/invitacion/CODE`, la lista de invitados con estado derivado (Socio activo / Inactivo / Vencido / Entrenando / Invitado), accesos x/N, el descuento abierto por lado y el bloque "invitado por" con etapa y sedes donde entreno; los vinculos heredados siguen listados.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `c3d4bc57e` | `invitation-states.ts` (`deriveInviteeState`, `deriveLeadStage`, `accessesUsed`) + 19 casos unitarios |
| 2 | `19d6f6fa8` | `invitation-overview.ts`, `invitation-trained-branches.ts`, `getReferralOverview` delega + `bySide`, tipos, 17 casos de integracion, shape en `member-endpoint` e ISO-03 |

## Contrato final del overview (para 194-24 admin y 194-27 app)

`ReferralOverview` conserva TODOS los campos viejos y suma:

```ts
discount.bySide: {
  inviter: { perLinkPercent: number; activeCount: number; percent: number };  // % aura_config['referral'] x vinculos activos como invitador (sin tope)
  invitee: { perLinkPercent: number; activeCount: number; percent: number };  // % invitations.invitee_percent, a lo sumo 1 vinculo
}
invitations: {
  quota: { limit; used; remaining; month };            // mes de cupo en la tz de la sede del usuario
  inviteUrl: string;                                    // `${FRONTEND_URL || https://app.eltemplo.org}/invitacion/<CODE>` (server-side)
  invitees: InviteeView[];                              // invitaciones active, la mas reciente primero; despues el legado
  discount: { percent: number; activeInvitees: number } // percent = el mismo de `discount.percent`
}
invitedBy: InvitedByView | null                         // invitacion active mas reciente donde el usuario es el INVITADO

InviteeView {
  invitationId: number | null;      // null en legacy_link
  userId: number; firstName: string; lastInitial: string;   // nunca telefono/DNI/email
  state: "socio_activo" | "inactivo" | "vencido" | "entrenando" | "invitado";
  accessesUsed: number | null;      // classes_budget - classes_remaining; null en legacy
  accessesBudget: number | null;    // N (classes_budget), nunca 3 hardcodeado
  activatedAt: string | null;       // ISO 8601
  accessExpiresOn: string | null;   // 'YYYY-MM-DD'
  sumaDescuento: boolean;
  source: "invitation" | "legacy_link";
}
InvitedByView {
  inviterId: number; inviterName: string;   // nombre completo (las partes del vinculo se conocen, D-29)
  activatedAt: string; accessesUsed: number; accessesBudget: number; accessExpiresOn: string;
  stage: "invitado" | "entrenando" | "vencido" | "convertido";
  branchesTrained: string[];                // nombres de sede, sin repetir, ordenados
  channel: "self_service" | "assisted";
}
```

Reglas de derivacion (orden fijo, `invitation-states.ts`):

- `deriveInviteeState`: compro + cobertura de membresia >= hoy -> `socio_activo`; compro sin cobertura -> `inactivo`; no compro y (`hoy > access_expires_on` o `classes_remaining = 0`) -> `vencido` (D-26e); no compro vigente con usados > 0 -> `entrenando`; usados = 0 -> `invitado`.
- `deriveLeadStage` (la usa `invitedBy` y la usara 194-20): `convertido` si la invitacion tiene `converted_at` -> `vencido` -> `entrenando` -> `invitado`. La expresion SQL de 194-20 tiene que ser identica en reglas y orden.
- Legado (sin invitacion): `qualified` = compro (`socio_activo`/`inactivo` por cobertura), `pending` = `invitado`. Sin accesos (`null`).
- `today` = `todayInTz` de la sede del usuario (no UTC) en el bloque nuevo.

## Tests

- `invitation-states.test.ts`: 19 verdes (tabla de casos incl. N=4, ultimo dia vigente, agotada, legado, `accessesUsed` acotado).
- `member-overview.test.ts`: 17 verdes. Cupo con anuladas, link, 5 estados + vencido por agotado con N=4, orden y shape, privacidad (11 claves exactas), "compro" exige paga/no-trial/posterior a la activacion, legado (4 formas), dedupe invitacion+vinculo, descuento (`activeInvitees`, paridad con `computeReferralDiscountPercent`, `bySide` con `invitee_percent`=15), `invitedBy` (ventana, otro miembro, sedes sin repetir, vencido/convertido/anulada), conteo de queries constante (spy sobre `dbPool.query`: 1 vs 5 invitados, y con legado 1 vs 4), HTTP del socio, ficha admin (mismo bloque) e IDOR del invitado.
- `member-endpoint.test.ts` 6 verdes (shape nuevo + paridad) e `iso-03-referrals.test.ts` 14 verdes (los bloques nuevos tampoco cruzan de gimnasio).
- **Mutation testing** (9 mutantes, todos atrapados; ronda 1 con 4 y ronda 2 con 3 a la vez, cada uno rompe un test distinto): `>` -> `>=` en el vencimiento (unitario), sacar `status='active'` (cupo/anuladas), sacar `price_paid > 0` (compro), sacar el limite superior de `loadTrainedBranches` (invitedBy), sacar `created_at >= activated_at` (compro), sacar `!isCovered` de `sumaDescuento` (descuento), sacar el dedupe de legado (una sola vez). Revertidos; corrida final verde.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan, copy "referid" en los archivos nuevos sin lineas fuera de comentarios.

## Deviations from Plan

**1. [Ubicacion, regla de 194-32] La logica vive en `referrals/invitation-overview.ts`, no inline en `service.ts`.** `getReferralOverview` solo delega (`new InvitationOverview(...).build(...)`). Consecuencias en los criterios literales: `grep "/invitacion/"` y `grep deriveInviteeState` sobre `service.ts` dan 0 (viven en `invitation-overview.ts`); `app.eltemplo.org/register` = 0 en ambos. `invitation-service.ts` (listado en el plan) NO se toco.

**2. [Extra, lecciones 194-14/32] Descuento por lado.** `ReferralDiscountView.bySide` (inviter/invitee) es aditivo; `getReferralOverview` ahora lee los % con `getInvitationSettings` (misma fuente que el cobro) en vez de `getReferralConfig`.

**3. [Interpretacion] `sumaDescuento` exige ademas cobertura hoy.** RESEARCH decia solo "vinculo qualified"; para que "cuantos invitados activos generan el descuento" coincida con el cobro (que solo suma contrapartes cubiertas), la marca exige vinculo `qualified` y cobertura de membresia. Solo la invitacion MAS RECIENTE de cada persona lleva la marca (`referred_id` es UNIQUE).

**4. [Interpretacion] "Compro" cuenta tambien subs canceladas.** Una sub paga cancelada deja al invitado `inactivo` (cierto: compro y se fue) en vez de volverlo a `vencido`/`invitado`.

**5. [Menor] `InvitationRules.computeQuota` y `loadUserWithTimezone` pasaron de privados a publicos** para que el overview reuse la tz y el cupo sin recargar al usuario.

## Lecciones para planes siguientes

- Una corrida de 3 archivos de integracion tarda ~300 s; 2 archivos ~260 s; un archivo ~130 s. Los tests puros (`invitation-states`) tambien pagan el provisioning de la DB.
- Contar queries de un servicio: `vi.spyOn(app.dbPool, "query")` ve todas las queries de Drizzle (el sentinel de tenancy parchea el mismo pool); restaurar con `mockRestore()` en `finally`.
- `loadTrainedBranches(exec, ctx, invitationIds)` (`referrals/invitation-trained-branches.ts`) resuelve las sedes de N invitaciones en UNA query: 194-20 debe reusarlo para el listado.
- El `today` de una derivacion pura se resuelve afuera con `todayInTz(<tz de la sede>)`; para fixtures de invitados usar `activatedAt: new Date(Date.now() - N * DAY_MS)` y `accessExpiresOn: addDays(today, k)`.
- Fixtures de cupo en una sub de accesos: `createActiveSub` no setea `classes_budget/remaining`; actualizarlos por DB despues (helper `accessSub` del test).
- Tras editar el SQL de un mutante, restaurar desde una copia en el scratchpad con `cp` en llamadas separadas (el hook rechaza `cp && git ...` compuestos).

## Allowlist de copy

Vacia.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-63 (nombre + inicial, test de claves exactas), T-194-64 (guard existente de la ficha, sin cambios), T-194-65 (batch, test de conteo constante), T-194-66 (URL server-side) cubiertos.

## Self-Check: PASSED
