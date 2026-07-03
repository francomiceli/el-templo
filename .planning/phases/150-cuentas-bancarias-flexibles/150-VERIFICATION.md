---
phase: 150-cuentas-bancarias-flexibles
verified: 2026-07-03T05:10:00Z
status: gaps_found
score: 1/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "El admin puede editar una cuenta bancaria existente sin que el dialog crashee (ABM completo, plan 04/05 must_have)"
    status: failed
    reason: "CR-01 (150-REVIEW.md): el tipo frontend `BankAccount` declara `bankName`/`accountHolder` como `string` no-nulos, pero el backend (`types.ts:585-586`) los declara `string | null` porque las 2 cajas banco preexistentes (Banco ARS/Banco EUR, seed de fase 138) tienen esas columnas en NULL tras la migración 0163. `CuentaBancariaFormDialog.vue:183-184` asigna `form.bankName = acc.bankName` sin fallback, y el computed `canSubmit` (línea 152) llama `form.bankName.trim()` → TypeError en runtime al abrir 'Editar' sobre cualquiera de esas 2 cuentas ya existentes en prod."
    artifacts:
      - path: "el-templo-admin/src/types/transaction.ts"
        issue: "Línea 549-550: `bankName: string; accountHolder: string;` — debería ser `string | null` para reflejar el backend"
      - path: "el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue"
        issue: "Líneas 183-184 asignan el valor crudo sin `?? ''`; línea 152 hace `.trim()` sobre un valor que puede ser null"
    missing:
      - "Mirror de nullabilidad `string | null` en `BankAccount.bankName`/`accountHolder` (transaction.ts)"
      - "`form.bankName = acc.bankName ?? ''` y `form.accountHolder = acc.accountHolder ?? ''` en onShow()"
  - truth: "El ABM de cuentas bancarias permanece admin/owner-only en los 5 endpoints (D-12, must_have de 150-03: 'routes.ts provides 5 endpoints ABM ... con guard ADMIN_ROLES')"
    status: failed
    reason: "CR-02 (150-REVIEW.md), confirmado en código: `GET /cash-registers` (routes.ts:1289-1296) NO tiene el guard `ADMIN_ROLES` en-handler que sí tienen los 4 endpoints de escritura (create/update/close/reactivate). Solo queda protegido por el hook de módulo `FINANCE_READ_ROLES`, que incluye 'gestion' y 'recepcion' (permissions.ts:250-255). Esos roles pueden leer CBU/CVU/alias/CUIT/número de cuenta y el saldo FIRME de cuentas banco country-agnostic vía API directa, contradiciendo D-12 y el invariante de fase 141 (cajas central/banco → owner-only para no-owners, cash-register-service.ts:271-273)."
    artifacts:
      - path: "el-templo-api/src/modules/finance/routes.ts"
        issue: "Línea 1289: `fastify.get('/cash-registers', async (request, reply) => {` sin chequeo de `ADMIN_ROLES` antes de llamar `listBankAccounts()`"
    missing:
      - "Guard `if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) return reply.code(403)...` al inicio del handler GET /cash-registers, igual que los otros 4 endpoints"
      - "Test RBAC para GET (gestion/recepcion → 403) — ausente en bank-accounts.test.ts (WR-06)"
  - truth: "El admin puede registrar un retiro del dueño desde una cuenta bancaria o caja, impactando el saldo (CTA-03)"
    status: failed
    reason: "CR-03 (150-REVIEW.md), confirmado en código: el botón 'Registrar retiro' en CuentasTab.vue (líneas 44-53) se renderiza sin gate `v-if isOwner` para toda cuenta banco. Para un usuario con role='admin' (distinto de role='owner'; `scope.isOwner` solo es true para 'owner', country-scope.ts:80), el flujo está roto en dos capas: (1) `GET /cash-registers/balances` excluye toda caja branchId=null para no-owners (cash-register-service.ts:271-272, `if (c.branchId === null) continue`), por lo que la cuenta bancaria a retirar NO aparece en el selector de caja del dialog de egreso y `prefillCajaId` no-opea silenciosamente; (2) aunque se pudiera seleccionar, `POST /expenses` corre `enforceCajaScope` que devuelve 404 para cajas branchId=null a no-owners. Resultado: un admin no-owner que hace clic en 'Registrar retiro' sobre una cuenta banco termina completando el egreso contra una caja efectivo de sucursal equivocada (dinero mal imputado) o recibe un 404 confuso — el feature solo funciona para role='owner', pero el botón se muestra a cualquier viewer del tab."
    artifacts:
      - path: "el-templo-admin/src/components/caja/CuentasTab.vue"
        issue: 'Botón ''Registrar retiro'' (líneas 44-53) sin `v-if="isOwner"`; prop `isOwner` está declarada (línea 123) pero no se usa para gatear esta acción'
      - path: "el-templo-api/src/modules/finance/cash-register-service.ts"
        issue: "Línea 271-272: `if (c.branchId === null) continue;` excluye cajas banco del listado de saldos para no-owners, sin excepción para el flujo de retiro"
    missing:
      - 'Gate `v-if="isOwner"` en el botón ''Registrar retiro'' de CuentasTab.vue (mínimo), o ampliar el scope de no-owners para cajas banco en el flujo de retiro específicamente'
      - "Notificación (`$q.notify`) cuando `prefillCajaId` no se encuentra en la lista de cajas cargada, en vez de fallar en silencio"
  - truth: "El admin puede crear una cuenta bancaria con Banco, N° de cuenta, Titular, CUIT, CBU/CVU, Alias, exigiendo solo 3 campos obligatorios (CTA-01)"
    status: passed
    reason: "Verificado en código y tests: schema `createBankAccountSchema` exige solo bankName/accountHolder/currency; service `assertTransferIdentifier` rechaza sin CBU/CVU ni Alias (400); `deriveBankAccountName` deriva el nombre visible; frontend `CuentaBancariaFormDialog.vue` no pide 'Nombre' y espeja la regla uno-de-dos en `canSubmit`. Tests de integración cubren create-201, create-400-sin-identificador, y fallback de nombre."
deferred: []
human_verification: []
---

# Phase 150: Cuentas Bancarias Flexibles Verification Report

**Phase Goal:** El admin gestiona cuentas bancarias flexibles (crear/cerrar) y registra retiros del dueño, para que los cobros bancarios puedan asociarse a una cuenta y los saldos reflejen la realidad.
**Verified:** 2026-07-03T05:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                        | Status     | Evidence                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CTA-01: crear cuenta bancaria con solo 3 campos obligatorios                 | ✓ VERIFIED | `schemas.ts` `createBankAccountSchema.required=["bankName","accountHolder","currency"]`; `cash-register-service.ts` `assertTransferIdentifier`; `CuentaBancariaFormDialog.vue` sin campo Nombre, `canSubmit` espeja uno-de-dos; tests create 201/400 en `bank-accounts.test.ts`             |
| 2   | Editar una cuenta bancaria existente sin crash (ABM completo, plan 04/05)    | ✗ FAILED   | CR-01 confirmado: `transaction.ts:549-550` declara `bankName`/`accountHolder` no-nulos vs backend `string\|null`; `CuentaBancariaFormDialog.vue:183-184,152` asigna sin `??` y hace `.trim()` — crashea al editar "Banco ARS"/"Banco EUR" (preexistentes en prod, NULL tras migración 0163) |
| 3   | CTA-02: cerrar/desactivar conservando historial, ABM admin/owner-only (D-12) | ✗ FAILED   | Close/reactivate funcionan y preservan historial (verificado), pero `GET /cash-registers` (routes.ts:1289) carece del guard `ADMIN_ROLES` que sí tienen los otros 4 endpoints — gestion/recepcion leen CBU/CUIT/balances de cuentas banco vía API directa (CR-02)                           |
| 4   | CTA-03: registrar retiro del dueño impactando el saldo                       | ✗ FAILED   | Funciona para role='owner' (aprobado en checkpoint humano), pero estructuralmente roto para role='admin' no-owner: caja banco excluida del selector (`branchId===null` skip) + `enforceCajaScope` 404 — el botón se renderiza sin `v-if="isOwner"` induciendo mala imputación (CR-03)       |

**Score:** 1/4 truths verified

### Required Artifacts

| Artifact                                                             | Expected                                                                 | Status                                  | Details                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/cash-registers.ts`                      | 6 columnas bancarias nullable                                            | ✓ VERIFIED                              | Confirmado vía migración 0163 aplicada y schema Drizzle (plan 01)                                                                                                                                       |
| `el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql` | ALTER + seed idempotente 'Retiros'                                       | ✓ VERIFIED                              | SQL leído: ALTER de 6 columnas AFTER currency, seed `INSERT...SELECT...FROM DUAL WHERE NOT EXISTS`, sin `;` en comentarios                                                                              |
| `el-templo-api/src/modules/finance/types.ts`                         | Tipos `CreateBankAccountInput`/`UpdateBankAccountInput`/`BankAccountRow` | ✓ VERIFIED                              | `UpdateBankAccountInput` sin `currency`; `bankName`/`accountHolder` correctamente `string\|null` en `BankAccountRow`                                                                                    |
| `el-templo-api/src/modules/finance/cash-register-service.ts`         | CRUD + uno-de-dos + moneda inmutable                                     | ✓ VERIFIED (con gap de scope en retiro) | `createBankAccount`/`updateBankAccount`/`closeBankAccount`/`reactivateBankAccount`/`listBankAccounts` presentes; `assertTransferIdentifier`; `currency` nunca en el SET del update                      |
| `el-templo-api/src/modules/finance/routes.ts`                        | 5 endpoints ABM con guard `ADMIN_ROLES`                                  | ✗ STUB parcial                          | 4/5 endpoints (POST/PATCH/close/reactivate) tienen el guard; **GET no lo tiene** (CR-02)                                                                                                                |
| `el-templo-api/test/finance/bank-accounts.test.ts`                   | Suite de integración ≥9 casos                                            | ✓ VERIFIED (con gaps de cobertura)      | 11 casos `it(...)` presentes cubriendo create/uno-de-dos/patch/close/reactivate/guard-en-create/seed/moneda-inmutable; **falta RBAC en GET, en PATCH/close/reactivate, y test de currency EUR (WR-06)** |
| `el-templo-admin/src/types/transaction.ts`                           | `BankAccount`/`CreateBankAccountInput`/`UpdateBankAccountInput`          | ⚠️ HOLLOW                               | Tipos presentes y `UpdateBankAccountInput` sin `currency`, pero `BankAccount.bankName`/`accountHolder` mienten sobre nullability (CR-01), rompiendo la edición de cuentas legacy                        |
| `el-templo-admin/src/composables/useTransactionsApi.ts`              | 5 métodos API del ABM                                                    | ✓ VERIFIED                              | `listBankAccounts`/`createBankAccount`/`updateBankAccount`/`closeBankAccount`/`reactivateBankAccount` presentes, patrón `extractError`+loading/finally                                                  |
| `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue`   | Dialog alta/edición reutilizable                                         | ⚠️ HOLLOW en edición                    | Alta funciona; edición crashea sobre cuentas con `bankName`/`accountHolder` null (CR-01)                                                                                                                |
| `el-templo-admin/src/components/caja/CuentasTab.vue`                 | Listado ABM + acciones + retiro prellenado                               | ⚠️ WIRED con gap funcional              | Tab montado, editar/cerrar/reactivar wireados; "Registrar retiro" wireado pero sin gate de rol, produce mala imputación para admin no-owner (CR-03)                                                     |
| `el-templo-admin/src/pages/CajaPage.vue`                             | Tab 'Cuentas' montado                                                    | ✓ VERIFIED                              | `<q-tab name="cuentas">` + `<CuentasTab>` en el panel                                                                                                                                                   |
| `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue`   | Prefill de retiro (centro 'Retiros' + caja)                              | ✓ VERIFIED (prefill en sí mismo)        | Props `prefillTab`/`prefillCajaId`/`prefillCostCenterName` presentes, preselección por name/id en onShow; el prefill funciona, el problema es upstream (caja banco no listada para no-owner, CR-03)     |

### Key Link Verification

| From                                  | To                                                       | Via                                             | Status                        | Details                                                                                                   |
| ------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cash-register-service.ts`            | `cash-registers.ts` (schema)                             | INSERT/UPDATE sobre columnas bancarias          | ✓ WIRED                       | Confirmado por lectura de código                                                                          |
| `createBankAccount/updateBankAccount` | `BadRequestError`                                        | validación uno-de-dos                           | ✓ WIRED                       | `assertTransferIdentifier` lanza `BadRequestError`                                                        |
| `routes.ts` (escritura)               | `ADMIN_ROLES`                                            | guard en-handler 403                            | ✓ WIRED (4/5)                 | GET no lo tiene — ver gap CR-02                                                                           |
| `CuentaBancariaFormDialog.vue`        | `useTransactionsApi.createBankAccount/updateBankAccount` | submit del form                                 | ⚠️ PARTIAL                    | Create wireado y funcional; update wireado pero crashea antes del submit para cuentas legacy (CR-01)      |
| `CuentasTab.vue`                      | `CuentaBancariaFormDialog`                               | montaje del dialog de alta/edición              | ✓ WIRED (con el gap anterior) | Montado correctamente                                                                                     |
| `CuentasTab.vue`                      | `RegistrarMovEgresoDialog`                               | acción 'Registrar retiro' con prefill 'Retiros' | ⚠️ WIRED pero con scope roto  | El link técnico existe; el dato que fluye (lista de cajas para no-owner) excluye la caja objetivo (CR-03) |

### Data-Flow Trace (Level 4)

| Artifact                                      | Data Variable                        | Source                                                                                                                       | Produces Real Data                                                                                    | Status                                                                                                    |
| --------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CuentasTab.vue`                              | `accounts` (q-table rows)            | `listBankAccounts()` → `GET /cash-registers` → `cashRegisterService.listBankAccounts()` (SELECT real, sin filtrar is_active) | Sí                                                                                                    | ✓ FLOWING                                                                                                 |
| `CuentaBancariaFormDialog.vue` (modo edición) | `form.bankName`/`form.accountHolder` | `props.account` (fila real del listado)                                                                                      | Sí, pero puede ser `null` para 2 filas reales (legacy)                                                | ⚠️ HOLLOW en ese subconjunto — el dato real (`null`) no se sanea antes de usarse, causando el crash CR-01 |
| retiro prellenado                             | `egreso.cajaId` (prefill)            | `getCashRegisterBalances()` filtrado por scope                                                                               | Para no-owner, la caja banco objetivo está ausente del array fuente → prefill no-opea silenciosamente | ✗ DISCONNECTED para el caso admin-no-owner (CR-03)                                                        |

### Behavioral Spot-Checks

| Behavior                                       | Command                                                               | Result                                                                                                     | Status                            |
| ---------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| tsc backend verde                              | `cd el-templo-api && pnpm build`                                      | Sin errores                                                                                                | ✓ PASS                            |
| vue-tsc frontend                               | `cd el-templo-admin && npx vue-tsc --noEmit`                          | Errores preexistentes fuera de scope (pdfmake, ProgramWizardDialog, etc.), ninguno en archivos de fase 150 | ✓ PASS (para el scope de la fase) |
| GET /cash-registers sin guard ADMIN_ROLES      | inspección directa de `routes.ts:1289-1296`                           | Confirmado: no hay chequeo de rol antes de `listBankAccounts()`                                            | ✗ FAIL (CR-02)                    |
| `BankAccount.bankName` nullability mismatch    | `grep -n "bankName" transaction.ts` (549) vs `types.ts` (585) backend | `string` (frontend) vs `string \| null` (backend)                                                          | ✗ FAIL (CR-01)                    |
| Botón "Registrar retiro" gateado por `isOwner` | `grep -n "isOwner" CuentasTab.vue`                                    | Prop declarada pero no usada como `v-if` en el botón de retiro (solo en template general)                  | ✗ FAIL (CR-03)                    |

### Probe Execution

No hay probes formales (`scripts/*/tests/probe-*.sh`) declarados para esta fase. Los tests de integración (`bank-accounts.test.ts`) corren en CI, no localmente (convención del proyecto, CLAUDE.md) — no ejecutados por este verificador; se evaluó su cobertura por lectura de código (ver WR-06 abajo, gap parcial de cobertura, no bloqueante en sí mismo pero corrobora que CR-02 no fue detectado por los tests existentes).

### Requirements Coverage

| Requirement | Source Plan                    | Description                                | Status                                              | Evidence                                                                                                                                                                                                                     |
| ----------- | ------------------------------ | ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA-01      | 150-01, 150-02, 150-03, 150-04 | Crear cuenta bancaria, solo 3 obligatorios | ✓ SATISFIED (creación) / ⚠️ comprometido en edición | Creación funciona end-to-end y testeada; edición de cuentas existentes crashea (CR-01) — REQUIREMENTS.md lo marca `[x] Complete`, pero el ABM (crear+editar) no está íntegro                                                 |
| CTA-02      | 150-02, 150-03, 150-05         | Cerrar/desactivar, conserva historial      | ✗ BLOCKED                                           | Mecánica de close/reactivate funciona, pero el endpoint de lectura del ABM (GET) no respeta el guard admin/owner (D-12) — CR-02 es un incumplimiento directo del must_have "5 endpoints ABM con guard ADMIN_ROLES" de 150-03 |
| CTA-03      | 150-01, 150-05                 | Retiro del dueño impactando saldo          | ✗ BLOCKED                                           | Funciona solo para role='owner'; roto/mal-imputa para role='admin' no-owner (CR-03) — sin gate de rol en la UI y sin excepción de scope en el backend para este flujo específico                                             |

**Nota:** REQUIREMENTS.md (líneas 105-107) marca las 3 como `Complete`, y las 3 casillas `[x]` (líneas 38-40) también están tildadas. Esta verificación contradice esa marca para CTA-02 y CTA-03 en base a evidencia de código, no a la narrativa de SUMMARY.md.

### Anti-Patterns Found

Ningún marcador de deuda (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`) ni `console.*` en los archivos modificados de la fase. No hay placeholders ni stubs de "coming soon". El gap real no es deuda técnica marcada sino un desajuste de contrato de tipos (CR-01) y dos gaps de autorización/scope (CR-02, CR-03) — todos ya documentados formalmente en `150-REVIEW.md` como Critical/BLOCKER y confirmados por este verificador leyendo el código fuente actual (sin cambios desde el commit `131f8a95`, `git status` limpio en los archivos afectados).

### Human Verification Required

Ninguno. Los 3 gaps están confirmados por evidencia de código (no requieren juicio humano): tipo declarado vs valor real, ausencia de un `if` de guard, y ausencia de un `v-if`. El checkpoint humano de 150-05 fue aprobado, pero cubrió el camino feliz como `owner` con cuentas nuevas — no ejercitó editar una cuenta legacy preexistente ni el flujo de retiro con un usuario `role='admin'` no-owner, que son precisamente los casos que romperían.

### Gaps Summary

Los 5 planes se ejecutaron y los artefactos existen y compilan (`tsc`/`vue-tsc` verdes, sin `any`, sin debt markers). Sin embargo, una revisión de código posterior (`150-REVIEW.md`, `status: issues_found`, 3 Critical) identificó 3 fallas concretas que este verificador confirmó leyendo el código fuente actual (working tree limpio, sin commits de fix desde `131f8a95`):

1. **CR-01 (editar crashea):** el mirror de tipos frontend miente sobre nullability de `bankName`/`accountHolder`, y las 2 cuentas banco preexistentes en prod (fase 138) tienen esos campos NULL tras la migración 0163 — clickear "Editar" sobre ellas revienta el dialog en runtime.
2. **CR-02 (GET sin guard):** de los "5 endpoints ABM con guard ADMIN_ROLES" que el plan 150-03 declara como must_have, solo 4 lo tienen — el GET queda expuesto a gestion/recepcion vía API directa, exponiendo CBU/CUIT/alias/saldo firme de cuentas banco que el invariante de fase 141 reserva a owner-only para roles no-owner.
3. **CR-03 (retiro roto para admin no-owner):** el botón "Registrar retiro" se muestra sin gate de rol, pero el flujo subyacente (selector de cajas + `enforceCajaScope`) excluye estructuralmente las cajas banco para cualquier no-owner — terminando en mala imputación silenciosa del dinero o un 404 confuso.

Estos 3 hallazgos comprometen directamente 3 de los 4 truths derivados de los success criteria de la fase (CTA-01 en su faceta de edición, CTA-02 en su garantía de acceso admin/owner-only, y CTA-03 en su funcionamiento para el rol admin). El checkpoint humano aprobado no ejercitó estos caminos específicos (editar cuenta legacy, retiro como `role=admin` no-owner), por lo que la aprobación visual no contradice esta evidencia — simplemente no cubrió esos casos.

**Esto luce intencional/omitido, no deliberado.** No se sugiere override: los 3 hallazgos ya están documentados como BLOCKER en `150-REVIEW.md` con fixes concretos propuestos por el propio proceso de revisión de código; no hay evidencia de que una implementación alternativa cubra la intención. Corresponde cerrarlos con un plan de fix antes de avanzar a la fase 151/152 que dependen de esta base (COBRO-04 reutiliza el dialog de alta; fase 152 reordena el mismo tab).

---

_Verified: 2026-07-03T05:10:00Z_
_Verifier: Claude (gsd-verifier)_
