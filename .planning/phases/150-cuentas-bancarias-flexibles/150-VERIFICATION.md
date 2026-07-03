---
phase: 150-cuentas-bancarias-flexibles
verified: 2026-07-03T11:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 1/4
  gaps_closed:
    - "CR-01: editar cuenta legacy (bankName/accountHolder NULL) ya no crashea el dialog"
    - "CR-02: GET /cash-registers es admin/owner-only (403 gestion/coach), con tests RBAC"
    - "CR-03: botón 'Registrar retiro' gateado por isOwner + notify de prefill fallido"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 150: Cuentas Bancarias Flexibles Verification Report

**Phase Goal:** El admin gestiona cuentas bancarias flexibles (crear/cerrar) y registra retiros del dueño, para que los cobros bancarios puedan asociarse a una cuenta y los saldos reflejen la realidad.
**Verified:** 2026-07-03T11:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 150-06)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                    | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CTA-01: crear cuenta bancaria con solo 3 obligatorios (mantenido desde verificación inicial)                             | ✓ VERIFIED | Sin cambios en plan 06; re-confirmado: `createBankAccountSchema` exige bankName/accountHolder/currency; `assertTransferIdentifier`; frontend sin campo "Nombre"; tests create 201/400.                                                                                                                                                                                                                                                                                                |
| 2   | El admin puede abrir 'Editar' sobre una cuenta legacy (bankName/accountHolder NULL) sin que el dialog crashee (CR-01)    | ✓ VERIFIED | `transaction.ts:504-505` ahora `bankName: string \| null; accountHolder: string \| null;` (mirror exacto del backend `BankAccountRow`). `CuentaBancariaFormDialog.vue:183-184` onShow() asigna `acc.bankName ?? ''` / `acc.accountHolder ?? ''` antes de que `canSubmit` (línea 152) llame `.trim()`. Confirmado leyendo el código actual, commit `5b283121`.                                                                                                                         |
| 3   | GET /cash-registers responde 403 para gestion/recepcion; ABM admin/owner-only en los 5 endpoints (CR-02, D-12)           | ✓ VERIFIED | `routes.ts:1289-1303`: el handler GET ahora abre con el mismo guard `!(ADMIN_ROLES as readonly string[]).includes(request.user.role)` → 403, idéntico al patrón de los 4 endpoints de escritura. `bank-accounts.test.ts:297-381` (describe "D-12: guard admin/owner en lectura y ciclo de vida") cubre GET gestion→403, GET coach→403, GET owner→200 (array `accounts`), PATCH/close/reactivate gestion→403. Commit `2d96ff19`.                                                       |
| 4   | El botón 'Registrar retiro' solo se renderiza para el owner; prefill de caja fallido notifica en vez de no-opear (CR-03) | ✓ VERIFIED | `CuentasTab.vue:44-54`: el `<q-btn icon="payments" @click="openRetiro(...)">` tiene `v-if="isOwner"`. `CajaPage.vue:95` define `isOwner = computed(() => authStore.user?.role === 'owner')` y lo pasa a `CuentasTab`. `RegistrarMovEgresoDialog.vue:264-274` onShow(): cuando `prefillCajaId !== undefined` y no hay match en `cajas.value`, emite `$q.notify({ type: 'warning', message: 'La caja indicada no está disponible...' })` en vez de no-op silencioso. Commit `57472b83`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                           | Expected                                                                  | Status     | Details                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-api/src/modules/finance/routes.ts`                      | 5 endpoints ABM con guard `ADMIN_ROLES` (POST/PATCH/close/reactivate/GET) | ✓ VERIFIED | Los 5 handlers (líneas 1198, 1220, 1243, 1267, 1289) tienen el guard idéntico en-handler antes de tocar el service.                                                      |
| `el-templo-api/test/finance/bank-accounts.test.ts`                 | Tests RBAC GET + PATCH/close/reactivate → 403 gestion                     | ✓ VERIFIED | Describe nuevo "D-12: guard admin/owner en lectura y ciclo de vida" (líneas 297-381), 6 casos: GET gestion/coach 403, GET owner 200, PATCH/close/reactivate gestion 403. |
| `el-templo-admin/src/types/transaction.ts`                         | `BankAccount.bankName`/`accountHolder` como `string \| null`              | ✓ VERIFIED | Líneas 504-505 confirmadas.                                                                                                                                              |
| `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue` | `onShow()` con fallback `?? ''`                                           | ✓ VERIFIED | Líneas 183-184 confirmadas.                                                                                                                                              |
| `el-templo-admin/src/components/caja/CuentasTab.vue`               | Botón 'Registrar retiro' gateado por `v-if="isOwner"`                     | ✓ VERIFIED | Línea 45 confirmada; `isOwner` prop recibida desde `CajaPage.vue` (`role === 'owner'`).                                                                                  |
| `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` | `$q.notify` en prefill fallido                                            | ✓ VERIFIED | Líneas 268-274 confirmadas, `type: 'warning'`.                                                                                                                           |

### Key Link Verification

| From                                            | To                            | Via                                                | Status  | Details                                                                                  |
| ----------------------------------------------- | ----------------------------- | -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `routes.ts` (GET /cash-registers)               | `ADMIN_ROLES`                 | guard en-handler 403 antes de `listBankAccounts()` | ✓ WIRED | Confirmado, 5/5 endpoints ahora (antes 4/5).                                             |
| `CuentaBancariaFormDialog.vue` (onShow)         | `form.bankName/accountHolder` | asignación con coalescencia `?? ''`                | ✓ WIRED | Confirmado; `canSubmit` opera siempre sobre `string`.                                    |
| `CuentasTab.vue` (botón retiro)                 | `isOwner`                     | `v-if`                                             | ✓ WIRED | Confirmado; `isOwner` fluye desde `CajaPage.vue` computed sobre `authStore.user.role`.   |
| `RegistrarMovEgresoDialog.vue` (onShow prefill) | `$q.notify`                   | rama `else` cuando no hay match en `cajas.value`   | ✓ WIRED | Confirmado; el notify solo dispara cuando se pidió prefill y falló, no en egreso normal. |

### Data-Flow Trace (Level 4)

| Artifact                                      | Data Variable                        | Source                                                                            | Produces Real Data                                   | Status                      |
| --------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| `CuentaBancariaFormDialog.vue` (modo edición) | `form.bankName`/`form.accountHolder` | `props.account` (fila real, puede tener `null`)                                   | Sí, saneado con `?? ''` antes de usarse en `.trim()` | ✓ FLOWING (ya no ⚠️ HOLLOW) |
| `routes.ts` GET /cash-registers               | `request.user.role`                  | JWT decodificado por el auth hook                                                 | Sí, chequeado contra `ADMIN_ROLES` antes de la query | ✓ FLOWING                   |
| retiro prellenado (CTA-03, owner)             | `egreso.cajaId`                      | `getCashRegisterBalances()` (owner ve todas las cajas, incl. banco branchId=null) | Sí, para owner (único rol que ve el botón ahora)     | ✓ FLOWING                   |

### Behavioral Spot-Checks

| Behavior                                                         | Command                                                                                | Result                                                                                            | Status |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| GET /cash-registers guard ADMIN_ROLES presente en los 5 handlers | `grep -n "ADMIN_ROLES as readonly string" el-templo-api/src/modules/finance/routes.ts` | 5 ocurrencias (líneas 1203, 1225, 1248, 1272, 1291) — antes 4                                     | ✓ PASS |
| `BankAccount` nullability mirror                                 | lectura directa `transaction.ts:504-505` vs `types.ts:585-586` (backend)               | Ambos `string \| null`                                                                            | ✓ PASS |
| `onShow()` fallback en edición                                   | lectura directa `CuentaBancariaFormDialog.vue:183-184`                                 | `acc.bankName ?? ''` / `acc.accountHolder ?? ''`                                                  | ✓ PASS |
| Botón 'Registrar retiro' gateado                                 | lectura directa `CuentasTab.vue:45`                                                    | `v-if="isOwner"` presente en el `<q-btn icon="payments">`                                         | ✓ PASS |
| Notify de prefill fallido                                        | lectura directa `RegistrarMovEgresoDialog.vue:268-274`                                 | `$q.notify({ type: 'warning', ... })` en la rama `else`                                           | ✓ PASS |
| Tests RBAC de lectura/ciclo de vida presentes                    | lectura completa de `bank-accounts.test.ts:297-381`                                    | 6 `it` nuevos (GET gestion/coach 403, GET owner 200, PATCH/close/reactivate gestion 403)          | ✓ PASS |
| Commits reales, no solo narrativa de SUMMARY                     | `git log --oneline -3 -- routes.ts transaction.ts CuentasTab.vue`                      | `2d96ff19`, `5b283121`, `57472b83` — 3 commits distintos, uno por CR, contenido coincide con diff | ✓ PASS |
| Working tree limpio en los 6 archivos modificados                | `git status --short <6 archivos>`                                                      | Sin salida — todo committeado                                                                     | ✓ PASS |

Nota: no se re-ejecutó `pnpm build` / `vue-tsc` en este verificador (ya confirmados verdes por el orquestador, per instrucción explícita de la tarea). El resto de checks son de lectura de código fuente actual, no de narrativa de SUMMARY.

### Probe Execution

No hay probes formales (`scripts/*/tests/probe-*.sh`) para esta fase. Los tests de integración (`bank-accounts.test.ts`) corren en CI, no localmente (convención del proyecto) — se evaluó su contenido leyendo el archivo completo; los 6 casos RBAC nuevos están presentes y usan el harness existente (`app.inject`, tokens `ownerToken`/`gestionToken`/`coachToken`, helper `createAccount`).

### Requirements Coverage

| Requirement | Source Plan                    | Description                                             | Status      | Evidence                                                                                                                                                                                                               |
| ----------- | ------------------------------ | ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTA-01      | 150-01..150-06                 | Crear/editar cuenta bancaria, solo 3 obligatorios       | ✓ SATISFIED | Creación y edición (incl. cuentas legacy con nulls) funcionan sin crash. CR-01 cerrado.                                                                                                                                |
| CTA-02      | 150-02, 150-03, 150-05, 150-06 | Cerrar/desactivar, conserva historial, admin/owner-only | ✓ SATISFIED | Close/reactivate funcionan; los 5 endpoints (incl. GET) son ahora admin/owner-only con tests RBAC. CR-02 cerrado.                                                                                                      |
| CTA-03      | 150-01, 150-05, 150-06         | Retiro del dueño impactando saldo                       | ✓ SATISFIED | Funciona para role='owner' (único caso soportado en esta fase, documentado explícitamente); UI gateada para no inducir mala imputación en no-owners. CR-03 cerrado con la opción mínima (a) del REVIEW: gate + notify. |

REQUIREMENTS.md (líneas 38-40, 105-107) marca las 3 como `Complete` — esta re-verificación ahora concuerda con esa marca en base a evidencia de código (a diferencia de la verificación inicial, que la contradecía).

**Nota sobre alcance de CTA-03:** el retiro del dueño queda documentado como owner-only en esta fase (decisión explícita del plan 150-06, per CONTEXT/REVIEW: "NO se amplía enforceCajaScope"). Esto no es un gap — es el alcance aceptado para cerrar CR-03 con la opción mínima. Si en el futuro se requiere que admins no-owner registren retiros, eso sería una fase/plan nuevo, no una regresión de esta fase.

### Anti-Patterns Found

Ningún marcador de deuda (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`) en los 6 archivos modificados por el plan 150-06 (grep ejecutado; los matches encontrados son falsos positivos: "todos" en strings de UI, `placeholder=` de un input HTML, comentarios de dominio "todo lo"). Sin `console.*`. Sin `any` nuevo (confirmado por `pnpm build`/`vue-tsc` verdes per orquestador).

### Human Verification Required

Ninguno. Los 3 gaps se cerraron con fixes puntuales verificables por código: mirror de tipos + coalescencia (CR-01), guard de rol en-handler + tests (CR-02), `v-if` + `$q.notify` (CR-03). Ningún cambio requiere juicio visual/UX nuevo más allá de lo ya aprobado en el checkpoint humano de 150-05 (que cubrió el ABM feliz como owner). El caso "abrir Editar sobre Banco ARS/EUR" y "GET con rol gestion" y "botón retiro ausente para no-owner" son verificables 100% por lectura de código (tipo de dato, presencia de un `if`, presencia de un `v-if`) — no ambigüedad de comportamiento.

### Gaps Summary

Los 3 hallazgos Critical de la verificación inicial (CR-01, CR-02, CR-03) están cerrados en el código, no solo en SUMMARY.md:

1. **CR-01** — `transaction.ts:504-505` ahora declara `string | null` (antes mentía con `string`); `CuentaBancariaFormDialog.vue:183-184` sanea con `?? ''` antes de que `canSubmit` llame `.trim()`. Editar "Banco ARS"/"Banco EUR" (preexistentes, NULL tras migración 0163) ya no crashea.
2. **CR-02** — `routes.ts:1291-1296` agrega el guard `ADMIN_ROLES` al handler GET, idéntico al de los 4 endpoints de escritura. `bank-accounts.test.ts` tiene 6 tests RBAC nuevos que confirman 403 para gestion/coach y 200 para owner en GET, y 403 para gestion en PATCH/close/reactivate — cerrando también el gap de cobertura WR-06 que había dejado pasar CR-02 sin ser detectado.
3. **CR-03** — `CuentasTab.vue:45` gatea el botón 'Registrar retiro' con `v-if="isOwner"` (prop ya declarada, ahora usada); `RegistrarMovEgresoDialog.vue:268-274` notifica con `$q.notify({type:'warning'})` cuando el prefill de caja no encuentra match, en vez de no-opear en silencio. La decisión de alcance (retiro owner-only en esta fase, sin ampliar `enforceCajaScope`) está documentada explícitamente en el plan 150-06 y en este reporte.

Los 3 commits (`2d96ff19`, `5b283121`, `57472b83`) están en el working tree, cada uno aislado por CR, con diffs que coinciden exactamente con lo que 150-06-SUMMARY.md narra. `git status` está limpio en los 6 archivos afectados. El resto de hallazgos Warning/Info del REVIEW (WR-01 a WR-07, IN-01 a IN-04) no eran must-haves de la fase (no bloquearon el goal ni fueron parte de los must_haves del plan 150-06) — quedan fuera del alcance de esta re-verificación, tal como estaba planificado.

**Fase 150: goal achieved. 4/4 must-haves verificados, 0 gaps, 0 items de verificación humana pendientes.**

---

_Verified: 2026-07-03T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
