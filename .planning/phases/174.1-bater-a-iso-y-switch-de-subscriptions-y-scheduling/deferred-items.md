# Deferred items — fuera de scope de los planes 174.1-\*

## 174.1-05b — 17 tests rojos en `test/subscriptions`+`test/members`, PRE-EXISTENTES (no causados por este plan)

**Descubierto en:** 174.1-05b, al correr el verify de Task 2 (`test/subscriptions test/members`).

**Síntoma:** 7 archivos / 17 tests fallan, todos con el mismo patrón raíz: `recomputeUserStatus`
no transiciona `users.status` de `freemium`→`activo` (o `activo`→`inactivo`) cuando debería, y/o
`user_status_history` no registra la fila esperada. Ejemplos:

- `test/subscriptions/user-status-history.test.ts` — "(a) records a freemium → activo row on assignPlan"
  y "(b) does NOT insert a duplicate when status is unchanged": `getHistory(userId)` devuelve `[]`
  en vez de 1 fila.
- `test/subscriptions/expire-cancel-linked-program.test.ts` — 3 tests: `u.status` queda en
  `'freemium'` en vez de `'inactivo'`/`'activo'` tras `cancelSubscription`/`autoExpireSubscriptions`.
- `test/subscriptions/lifecycle.test.ts` — `autoExpireDueSubscriptions` no recomputa `activo`.
- `test/members/user-status-history-hooks.test.ts` — mismo patrón.
- `test/members/outstanding-concepts.test.ts` — 2 tests con `ageInDays` off-by-one (posible
  sensibilidad de calendario, ver `reference_test_arpu_dependiente_del_calendario.md`).

**Verificación de que es pre-existente (no lo causa 174.1-05b):** aislado con `git checkout --`
sobre `subscriptions/service.ts` + `shared/active-member.ts` + `scheduling/booking-service.ts`,
volviendo el worktree al estado exacto de:

1. Después de Task 1 de este plan (commit `1c86f7ec`) sin Task 2 — **mismo fallo**.
2. Antes de TODO 174.1-05b (`HEAD~1` = `07a364a8`, cierre de 174.1-05) — **mismo fallo, idéntico
   mensaje y línea**.

La corrida completa de `test/subscriptions test/members` con el WIP de 174.1-05b restaurado da
EXACTAMENTE los mismos números que antes de tocar una sola línea: **7 archivos / 17 tests rojos,
30 archivos / 426 tests verdes**. Cero regresiones nuevas.

**No se investigó la causa raíz** (fuera de scope — el plan prohíbe "re-correr el build esperando
que se arregle solo" y el scope boundary es tocar SOLO lo que el plan pide). Hipótesis no
confirmada: algo en el pipeline `assignPlan` → `recomputeUserStatus` (el UPDATE con CASE sobre
`subscription_status`) no ve la sub recién insertada como `active` en el momento del recompute —
posible timing/transacción o un cambio de un plan anterior de esta MISMA fase (03/04/05) que
tocó `analytics`/`programs`/`goal-plans`/`streaks` y no se verificó contra `test/subscriptions`
en su momento (D-07 de esta fase pide correr `test/tenancy` pero no exige el módulo completo de
`test/subscriptions` en CADA plan intermedio).

**Acción:** NO se tocó. Reportado para que el orquestador decida si abre un plan de fix dedicado
(fuera de 174.1) o lo prioriza en la 175. El gate del switch (plan 10, Task 3 de este plan) NO
depende de esto — el `unlistedViolations: 0` del lint es independiente del estado de estos tests.

## 174.1-06 — Hallazgo de seguridad: `input.branchId` de escritura de subs NUNCA se valida contra el tenant

**Descubierto en:** 174.1-06, al leer `assignPlan`/`changePlanNow`/`changePlanAfterCurrent`/
`renewSubscription` (`src/modules/subscriptions/service.ts`) para escribir la batería de escritura.

**Síntoma:** las 4 escrituras de lifecycle que aceptan `branchId` en el body lo persisten crudo en
`subscriptions.branch_id` (`tenantValues(ctx, {..., branchId: input.branchId, ...})`) sin ningún
`tenantWhere(branches, ctx)`/`assertBranchDelGimnasio(ctx, input.branchId)` previo. La única llamada
a `assertBranchDelGimnasio` que existe en `assignPlan` está condicionada a
`member.branchId !== input.branchId && currentBranch.isVirtual` (la rama de auto-migración desde
sede virtual) — un socio en sede FÍSICA (el caso común) nunca pasa por esa validación.

**Impacto:** un staff del gimnasio 2 puede hoy pasar el `branchId` de El Templo en el body de
`assign`/`change-plan`/`renew` (con `userId`/`planId` propios, sin tocar nada ajeno de esas dos
columnas) y la fila nace con `tenant_id = TENANT_DOS` correcto pero `branch_id` apuntando a una
sede de OTRO gimnasio — la misma clase de inconsistencia de ancla que 173-11/173-13..18 cerraron
para `users.branch_id`/`user_branches.branch_id`, pero nunca se migró para `subscriptions.branch_id`.
No es un 403/404 filtrable (D-06) porque ni siquiera intenta leer nada ajeno — es tampering directo
de la propia fila con un FK a otra sede.

**Por qué no se arregló en 174.1-06:** el `threat_model` del plan lista `:userId`/`:subscriptionId`/
`bulk-migrate`/pricing/403 como boundaries, no `branchId` en el body de escritura. El fix toca 4
métodos de un archivo de ~6700 líneas, fuera de `files_modified` (que es solo el archivo de test) y
con blast radius no verificable en el turno de un solo plan de batería. `iso-03-subs-escritura.test.ts`
(174.1-06) documenta el hallazgo en su docblock y usa siempre `branchId` PROPIO en sus controles
positivos de assign/change-plan — no afirma la conducta insegura actual como "correcta".

**Acción sugerida:** un plan dedicado (fuera de 174.1, candidato 175) que agregue
`assertBranchDelGimnasio(ctx, input.branchId)` temprano en las 4 escrituras, con su propia batería
de aislamiento (branchId ajeno + userId/planId propios → 404, sin fila nueva).
