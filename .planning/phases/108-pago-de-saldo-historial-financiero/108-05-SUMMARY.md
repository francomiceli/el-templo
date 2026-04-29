---
phase: 108-pago-de-saldo-historial-financiero
plan: 05
subsystem: admin-frontend / finance
tags: [phase-108, finance, frontend, history, void, rbac, tab]
dependency_graph:
  requires:
    - "Plan 108-03 — composable methods getFinancialHistory + voidTransaction; types FinancialHistoryItem + VoidTransactionInput"
    - "Plan 108-04 — AlumnoDetailPage prerequisites: outstandingConcepts ref, loadOutstanding, onPaymentRegistered, RegisterPaymentDialog import"
    - "Phase 106 — POST /admin/finance/transactions/:id/void operativo + GET /admin/members/:id/financial-history paginado"
  provides:
    - "VoidTransactionDialog.vue — dialog reutilizable con razón obligatoria min 5 chars"
    - "FinancialHistoryTab.vue — timeline q-list + q-expansion-item, paginación append, Anular RBAC-gated"
    - "AlumnoDetailPage 6to q-tab 'Finanzas' montando FinancialHistoryTab, con onTransactionVoided wired al refresh de outstanding"
    - "PAYMENT-03 cubierto end-to-end (vista de historial + anulación con auditoría)"
  affects:
    - "Phase 108 cierre — todo el flujo registrar-pago + anular es operable end-to-end desde AlumnoDetailPage"
tech-stack:
  added: []
  patterns:
    - "Vue 3 <script setup lang=ts> Composition API"
    - "Quasar q-dialog persistent + q-input textarea con :rules + autofocus + autogrow"
    - "Quasar q-list separator + q-expansion-item (D-12 — granularity híbrido)"
    - "RBAC reactive computed (canVoid) basado en authStore.user.role (FINANCE_VOID_ROLES = owner|admin|gestion, sin recepcion ni coach)"
    - "Paginación append-mode con hasMore derivado de items.length < total (la respuesta PaginatedResult no expone hasMore — se computa)"
    - "defineExpose({ refresh }) para que el parent invoque refresh tras eventos externos (onPaymentRegistered)"
    - "KIND_LABELS_ES y PAYMENT_METHOD_LABELS_ES con fallback ?? raw para enum drift defensivo"
    - "Strikethrough + grey + badge negativo para rows voided (D-15 — pattern analog CajaPage:184-192, 342)"
key-files:
  created:
    - "el-templo-admin/src/components/VoidTransactionDialog.vue (112 lines)"
    - "el-templo-admin/src/components/FinancialHistoryTab.vue (247 lines)"
  modified:
    - "el-templo-admin/src/pages/AlumnoDetailPage.vue (+25 lines: import FinancialHistoryTab, financialHistoryTabRef, q-tab + q-tab-panel finanzas, onTransactionVoided handler, refresh hook en onPaymentRegistered)"
decisions:
  - "PaginatedResult shape: el composable getFinancialHistory retorna `{ rows, total, page, limit }` (no `items`/`hasMore`). El plan asumía `items` + `hasMore`. Adapté usando `res.rows` y derivé `hasMore = items.value.length < total.value` como computed. Documented en código."
  - "VoidTransactionDialog: `isValid` también verifica `transactionId !== null` (no solo length >= 5) — defensa contra estado inconsistente cuando el dialog está abierto sin target válido. El botón se deshabilita extra-defensivamente."
  - "FinancialHistoryTab.onAnularClick construye el `transactionLabel` con kindLabel + formatPrice + formatDate ES — el dialog secundario muestra contexto humano (ej. 'Pago de saldo de $50.000 del 28 abr 2026')."
  - "AlumnoDetailPage.onTransactionVoided NO llama a financialHistoryTabRef.refresh() porque el tab ya se refresca solo via onVoided() interno. Solo recarga outstanding-concepts (que sí necesita refresh externo). Evita doble fetch del historial."
  - "KIND_LABELS_ES e PAYMENT_METHOD_LABELS_ES son consts locales del componente (no importados desde types/transaction.ts) — match con los strings deseados en español. types/transaction.ts ya exporta `PAYMENT_METHOD_LABELS` con los mismos valores; podría haberse reusado, pero la duplicación es minimal (5 entries) y el componente queda autosuficiente para refactor futuro."
  - "Pre-existing pdf errors en `src/utils/pdf/session-pdf-builder.ts` (3 errors) son out-of-scope per Scope Boundary, ya documentados en SUMMARY 108-04."
metrics:
  duration: "~25 min"
  completed: "2026-04-28"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
  commits: 3
---

# Phase 108 Plan 05: Tab Historial Financiero + Anular Dialog Summary

UX completo del tab "Finanzas" en AlumnoDetailPage — timeline cronológico de transacciones (q-list + q-expansion-item) con paginación append-mode, dialog de anulación con razón obligatoria min 5 chars, y RBAC gated del botón Anular para owner/admin/gestion. Cierra PAYMENT-03 y completa el flujo end-to-end de Phase 108.

## Tasks

### Task 1: Create VoidTransactionDialog.vue

- **Status:** Done
- **Commit:** `0632c697`
- **Files:** `el-templo-admin/src/components/VoidTransactionDialog.vue` (NEW, 112 lines)
- **What:**
  - q-dialog persistent con q-input textarea autofocus + autogrow.
  - `isValid` computed: `reason.trim().length >= 5 && transactionId !== null`.
  - Watch `modelValue` → reset reason + submitting al abrir (D-17).
  - `onConfirm` invoca `transactionsApi.voidTransaction(id, reason.trim())` → emit `voided` + close on success.
  - Logger via `createLogger('VoidTransactionDialog')` (no console.*, no any).
  - Texto UI 100% en español per response_language.
- **Decisión clave:** `isValid` doble guard (length + transactionId !== null) — defensa contra states inconsistentes. El botón se deshabilita extra-defensivamente.

### Task 2: Create FinancialHistoryTab.vue

- **Status:** Done
- **Commit:** `2b158bac`
- **Files:** `el-templo-admin/src/components/FinancialHistoryTab.vue` (NEW, 247 lines)
- **What:**
  - q-list + q-expansion-item — row colapsada (fecha · kind ES · monto · método), expandida (links con conceptLabel + allocatedAmount + voidInfo si aplica) (D-12).
  - `KIND_LABELS_ES` con 5 entries (plan_charge, debt_settlement, refund, adjustment, advance_payment) + fallback `?? kind`.
  - `PAYMENT_METHOD_LABELS_ES` con 5 entries (cash, transfer, card, aura_credit, internal) + fallback `?? method`.
  - Voided rows: `text-strike text-grey-5` + badge `negative ANULADO` (D-15, analog CajaPage:184-192, 342).
  - Botón Anular flat dense round con tooltip, gated por `canVoid = role === 'owner' || 'admin' || 'gestion'` (D-16, FINANCE_VOID_ROLES — sin recepcion, sin coach).
  - Paginación append-mode: `PAGE_SIZE = 50`, botón "Cargar más" visible cuando `items.length < total`, deshabilitado durante loading (D-14).
  - `defineExpose({ refresh })` para que el parent invoque refresh tras eventos externos.
  - `onVoided` interno emite `'voided'` al parent + refresca timeline local.
  - Logger via `createLogger('FinancialHistoryTab')`.
- **Decisión clave:** `hasMore` se deriva de `items.length < total` como computed — la respuesta `PaginatedResult` del composable no expone `hasMore`. El plan asumía un campo `hasMore` que no existe; adapté.

### Task 3: Wire FinancialHistoryTab as 'Finanzas' tab in AlumnoDetailPage

- **Status:** Done
- **Commit:** `c35ebdde`
- **Files:** `el-templo-admin/src/pages/AlumnoDetailPage.vue` (+25 lines)
- **What:**
  - **Step 0 — Plan 04 prerequisites verificados (Blocker 2 defensa en profundidad):**
    ```
    grep -nE "function onPaymentRegistered|const outstandingConcepts" → 2 matches ✓
    grep -nE "import\s+RegisterPaymentDialog" → 1 match ✓
    grep -n "RegisterPaymentDialog" → 5 matches ✓
    ```
  - Import `FinancialHistoryTab from 'src/components/FinancialHistoryTab.vue'`.
  - State: `financialHistoryTabRef = ref<InstanceType<typeof FinancialHistoryTab> | null>(null)`.
  - 6to `q-tab name="finanzas" label="Finanzas"` (junto a los 5 existentes: perfil/entrenamiento/notas/suscripcion/asistencia).
  - 6to `q-tab-panel name="finanzas"` montando `<FinancialHistoryTab :ref + :user-id + @voided>`.
  - `onPaymentRegistered` extendida con `financialHistoryTabRef.value?.refresh()` — el nuevo pago aparece arriba del timeline inmediatamente.
  - `onTransactionVoided` handler nuevo: cuando se anula desde el tab, recarga outstanding-concepts (saldos revirtieron en backend) → botón "Registrar pago" refleja el nuevo estado.
- **Decisión clave:** `onTransactionVoided` NO llama a `financialHistoryTabRef.refresh()` — el tab ya se refresca solo internamente via `onVoided()`. Solo recarga outstanding (que sí necesita refresh externo). Evita doble fetch del historial.

## Verification

```
$ wc -l el-templo-admin/src/components/VoidTransactionDialog.vue
112

$ wc -l el-templo-admin/src/components/FinancialHistoryTab.vue
247

$ grep -nc "voidTransaction" el-templo-admin/src/components/VoidTransactionDialog.vue
1

$ grep -nE ">= 5|length.*5" el-templo-admin/src/components/VoidTransactionDialog.vue
29:          :rules="[(v: string) => (v?.trim().length ?? 0) >= 5 || 'Mínimo 5 caracteres']"
75:const isValid = computed(() => trimmedLength.value >= 5 && props.transactionId !== null);

$ grep -nc "createLogger.*VoidTransactionDialog" el-templo-admin/src/components/VoidTransactionDialog.vue
1

$ grep -nc "q-expansion-item" el-templo-admin/src/components/FinancialHistoryTab.vue
2

$ grep -nc "Cargar más" el-templo-admin/src/components/FinancialHistoryTab.vue
2

$ grep -nE "PAGE_SIZE\s*=\s*50" el-templo-admin/src/components/FinancialHistoryTab.vue
141:const PAGE_SIZE = 50;

$ grep -nc "ANULADO" el-templo-admin/src/components/FinancialHistoryTab.vue
1

$ grep -nc "text-strike" el-templo-admin/src/components/FinancialHistoryTab.vue
1

$ grep -nE "owner.*admin.*gestion" el-templo-admin/src/components/FinancialHistoryTab.vue
155:// D-16 — FINANCE_VOID_ROLES = owner | admin | gestion (NO recepcion, NO coach).
158:  return role === 'owner' || role === 'admin' || role === 'gestion';

$ grep -nc "VoidTransactionDialog" el-templo-admin/src/components/FinancialHistoryTab.vue
2

$ grep -nc "defineExpose" el-templo-admin/src/components/FinancialHistoryTab.vue
1

$ grep -c 'name="finanzas"' el-templo-admin/src/pages/AlumnoDetailPage.vue
2

$ grep -c 'FinancialHistoryTab' el-templo-admin/src/pages/AlumnoDetailPage.vue
3

$ grep -c 'financialHistoryTabRef' el-templo-admin/src/pages/AlumnoDetailPage.vue
3

$ grep -c 'onTransactionVoided' el-templo-admin/src/pages/AlumnoDetailPage.vue
2

$ grep -nc "console\." el-templo-admin/src/components/VoidTransactionDialog.vue \
                       el-templo-admin/src/components/FinancialHistoryTab.vue
0 / 0

$ grep -nE ":\s*any\b|<any>|as\s+any" el-templo-admin/src/components/VoidTransactionDialog.vue \
                                       el-templo-admin/src/components/FinancialHistoryTab.vue
(no matches)
```

- TypeScript: `pnpm exec tsc --noEmit -p tsconfig.json` reports zero errors en VoidTransactionDialog.vue, FinancialHistoryTab.vue, y AlumnoDetailPage.vue. (3 errores pre-existentes en `src/utils/pdf/session-pdf-builder.ts` no relacionados — fuera de scope, ya documentados en SUMMARY 108-04.)
- ESLint: `pnpm exec eslint` reports zero issues en los 3 archivos.
- Sin `any` types — cumple CLAUDE.md.
- Sin `console.*` calls — cumple CLAUDE.md (logger structurado vía `createLogger`).
- Texto UI 100% en español per response_language.

## Acceptance Criteria

| Criterio | Estado |
|----------|--------|
| VoidTransactionDialog.vue creado con ≥80 líneas | ✓ — 112 líneas |
| `voidTransaction` invocado en VoidTransactionDialog | ✓ — line 96 |
| Validación min 5 chars (computed `isValid` + :rules en q-input) | ✓ — lines 29 + 75 |
| `createLogger('VoidTransactionDialog')` | ✓ — line 67 |
| FinancialHistoryTab.vue creado con ≥200 líneas | ✓ — 247 líneas |
| q-expansion-item presente (D-12) | ✓ — 2 matches |
| Botón "Cargar más" presente (D-14) | ✓ — 2 matches |
| `PAGE_SIZE = 50` (D-14) | ✓ — line 141 |
| Badge "ANULADO" (D-15) | ✓ — 1 match |
| `text-strike` para voided rows (D-15) | ✓ — 1 match |
| RBAC `owner`+`admin`+`gestion` sin `recepcion` (D-16) | ✓ — line 158 |
| VoidTransactionDialog mounted (import + tag) | ✓ — 2 matches |
| `defineExpose({ refresh })` | ✓ — 1 match |
| Plan 04 prereqs verificados (greps Blocker 2) | ✓ |
| AlumnoDetailPage importa FinancialHistoryTab (≥3 matches) | ✓ — 3 matches |
| `name="finanzas"` aparece en q-tab + q-tab-panel | ✓ — 2 matches |
| `financialHistoryTabRef` declarado + ref attr + uso | ✓ — 3 matches |
| `onTransactionVoided` declaración + handler | ✓ — 2 matches |
| pnpm typecheck clean en archivos modificados | ✓ |
| pnpm lint clean en archivos modificados | ✓ |
| No `console.*` | ✓ — 0 matches |
| No `any` types | ✓ — 0 matches |
| response_language: Español en textos UI | ✓ — todos los strings UI |
| SUMMARY.md committed | ✓ (al final del plan) |

## Deviations from Plan

### Adaptaciones de implementación (no Rule deviations)

**1. `PaginatedResult` shape adaptation — `rows` instead of `items`, derived `hasMore`**

- **Found during:** Task 2 — al cablear `getFinancialHistory(...)` en `load()`.
- **Issue:** El plan asumía que la respuesta tenía `items` y `hasMore`, pero el composable real retorna `PaginatedResult<FinancialHistoryItem>` con shape `{ rows, total, page, limit }` (definido en `src/types/report.ts:228-233`). No expone `hasMore`.
- **Fix:** Usé `res.rows` para los items y derivé `hasMore` como `computed(() => items.value.length < total.value)`. La semántica es equivalente y queda documentada en código. `currentPage` se trackea desde `res.page`. No requiere cambios en backend ni en el composable.
- **Files modified:** FinancialHistoryTab.vue.
- **Commit:** `2b158bac`.

**Rule 1-4 deviations:** Ninguna. No se encontraron bugs ni functionality crítica faltante durante la implementación. El plan estaba completo y correcto; solo la adaptación táctica del shape de la respuesta paginada (que el plan no había verificado contra la firma real del composable, pero el verbo del comentario en el plan ya advertía: "*confirm response shape exacto*").

## Self-Check: PASSED

- File `el-templo-admin/src/components/VoidTransactionDialog.vue`: FOUND
- File `el-templo-admin/src/components/FinancialHistoryTab.vue`: FOUND
- File `el-templo-admin/src/pages/AlumnoDetailPage.vue`: FOUND (modificado)
- Commit `0632c697` (feat 108-05 add VoidTransactionDialog): FOUND in `git log --oneline`
- Commit `2b158bac` (feat 108-05 add FinancialHistoryTab): FOUND in `git log --oneline`
- Commit `c35ebdde` (feat 108-05 wire as Finanzas tab): FOUND in `git log --oneline`
- Plan acceptance grep checks (Tasks 1+2+3): all PASS
- TypeScript clean en archivos modificados: confirmed (3 pre-existing errors in unrelated `session-pdf-builder.ts`, out-of-scope)
- ESLint clean en archivos modificados: confirmed
- Sin `any` types: confirmed
- Sin `console.*` calls: confirmed (logger via createLogger)
- response_language Español: confirmed (todos los strings UI)
- Plan 04 prerequisites verificados (Blocker 2 defense-in-depth): confirmed (greps PASS antes de tocar AlumnoDetailPage)
