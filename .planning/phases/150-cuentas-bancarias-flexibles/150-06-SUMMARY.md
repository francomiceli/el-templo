---
phase: 150-cuentas-bancarias-flexibles
plan: 06
subsystem: finance / caja
tags: [rbac, nullability, ui-gate, gap-closure]
gap_closure: true
requires:
  - "Planes 150-01..150-05 (ABM de cuentas bancarias ya construido)"
provides:
  - "Guard ADMIN_ROLES en-handler en GET /cash-registers (D-12, 5/5 endpoints)"
  - "Tests RBAC de lectura y ciclo de vida (GET/PATCH/close/reactivate → 403 gestion)"
  - "BankAccount.bankName/accountHolder como string | null (espejo del backend)"
  - "Fallback ?? '' en edición de cuentas banco legacy (no crashea)"
  - "Botón 'Registrar retiro' gateado por v-if isOwner (owner-only)"
  - "Notificación de prefill de caja fallido en RegistrarMovEgresoDialog"
affects:
  - "el-templo-api/src/modules/finance/routes.ts"
  - "el-templo-admin/src/types/transaction.ts"
  - "el-templo-admin/src/components/caja/*"
tech-stack:
  added: []
  patterns:
    - "Guard en-handler ADMIN_ROLES replicado en el 5º endpoint (GET) — cierra fuga a FINANCE_READ_ROLES"
    - "Nullability mirror front↔back para filas legacy con columnas NULL"
key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/finance/routes.ts"
    - "el-templo-api/test/finance/bank-accounts.test.ts"
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue"
    - "el-templo-admin/src/components/caja/CuentasTab.vue"
    - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue"
decisions:
  - "CTA-03 se cierra con la opción mínima (a): gate v-if isOwner + notify. NO se amplía enforceCajaScope — el retiro sigue owner-only en esta fase (per CONTEXT/REVIEW)."
metrics:
  duration: "~13 min"
  completed: 2026-07-03
  tasks: 3
  files: 6
---

# Phase 150 Plan 06: Cierre de gaps CR-01/CR-02/CR-03 Summary

Fixes quirúrgicos que restauran los 3 truths fallidos (1/4) de la verificación de fase 150: nullability mirror que crashea la edición de cuentas banco legacy (CR-01), guard de autorización faltante en `GET /cash-registers` (CR-02), y gate de rol + notify en el flujo de retiro (CR-03). No se re-implementa el ABM — solo saneo puntual sobre código de los planes 150-01..150-05.

## What Was Built

**Task 1 (CR-02, seguridad):** Guard `ADMIN_ROLES` en-handler agregado al inicio de `GET /cash-registers` (routes.ts), replicando exactamente el patrón de los 4 endpoints de escritura hermanos — retorna 403 antes de `listBankAccounts()` para roles que pasan el hook `FINANCE_READ_ROLES` (gestion/recepcion) pero no son admin/owner. Ahora los 5 endpoints del ABM son admin/owner-only (D-12). Se agregó un describe nuevo "D-12: guard admin/owner en lectura y ciclo de vida" en bank-accounts.test.ts con 6 casos RBAC: GET gestion/coach → 403, GET owner → 200, y PATCH/close/reactivate con gestion → 403 (cierra el gap de cobertura WR-06 que dejó pasar CR-02).

**Task 2 (CR-01):** `BankAccount.bankName`/`accountHolder` pasan a `string | null` en transaction.ts, espejando `BankAccountRow` del backend — las 2 cajas banco preexistentes (Banco ARS/Banco EUR, seed de fase 138) tienen esas columnas en NULL tras la migración 0163. En `CuentaBancariaFormDialog.vue onShow()` se asigna con coalescencia `acc.bankName ?? ''` / `acc.accountHolder ?? ''`, de modo que el computed `canSubmit` opera siempre sobre string. Abrir 'Editar' sobre una cuenta legacy ya no lanza `TypeError` en `.trim()`.

**Task 3 (CR-03):** `v-if="isOwner"` agregado al botón 'Registrar retiro' en CuentasTab.vue (la prop ya estaba declarada, solo faltaba usarla como gate) — alinea la UI con la capacidad real del backend, donde `scope.isOwner` es true solo para 'owner' y las cajas banco (branchId=null) se excluyen del selector y de `enforceCajaScope` para no-owners. En `RegistrarMovEgresoDialog.vue onShow()`, el prefill de caja ahora emite `$q.notify` type 'warning' cuando `prefillCajaId` no coincide con ninguna caja cargada, en vez del no-op silencioso.

## Verification Results

- `cd el-templo-api && pnpm build` → verde, sin errores de tipos, sin `any`.
- `cd el-templo-admin && npx vue-tsc --noEmit` filtrado a los 4 archivos de fase → sin errores nuevos.
- Consumers de `bankName`/`accountHolder` en el frontend son solo interpolaciones `{{ }}` en CuentasTab (renderizan null como vacío) — sin regresión de tipos.
- Tests de integración RBAC corren en CI (convención del proyecto: no se corre el suite local).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `el-templo-api/src/modules/finance/routes.ts` — FOUND (guard en GET /cash-registers)
- `el-templo-api/test/finance/bank-accounts.test.ts` — FOUND (describe RBAC nuevo)
- `el-templo-admin/src/types/transaction.ts` — FOUND (string | null)
- `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue` — FOUND (?? '')
- `el-templo-admin/src/components/caja/CuentasTab.vue` — FOUND (v-if isOwner)
- `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` — FOUND ($q.notify warning)
- Commits: 2d96ff19, 5b283121, 57472b83 — FOUND
