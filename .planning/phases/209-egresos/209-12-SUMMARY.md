---
phase: 209-egresos
plan: 12
subsystem: admin
tags: [egresos, admin, quasar, rubros, caja, refactor]
requires: [209-11]
provides:
  - components/egresos/RubrosTab.vue (ABM de rubros en Egresos, solo owner y admin)
  - Acceso "Cargar un gasto en Egresos" desde el diálogo de Caja a /egresos?tab=gastos&nuevo=1
affects: [209-13]
tech-stack:
  added: []
  patterns: [mover sin duplicar, reuso de useTransactionsApi y CategoriaEgresoFormDialog]
key-files:
  created:
    - el-templo-admin/src/components/egresos/RubrosTab.vue
  modified:
    - el-templo-admin/src/components/caja/CuentasTab.vue
    - el-templo-admin/src/components/caja/CategoriaEgresoFormDialog.vue
    - el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue
    - el-templo-admin/src/pages/EgresosPage.vue
    - el-templo-admin/src/pages/CajaPage.vue
decisions:
  - La pestaña Rubros no repite el chequeo de rol (canManage): EgresosPage ya solo la monta para owner y admin
  - Un banner de acceso en vez de un botón suelto, solo para EGRESOS_ROLES
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 209 Plan 12: Rubros a Egresos y "Egreso" fuera de Caja Summary

Los rubros (lista, alta, renombrar, desactivar, reactivar) viven ahora en Egresos → Rubros con los mismos endpoints `/cost-centers*`, y el diálogo de Caja ya no carga egresos: queda el movimiento entre cajas y un acceso a Egresos → Nuevo gasto.

## Qué se hizo

1. **Task 1** (`fdcdc9979`): `RubrosTab.vue` nuevo (prop `selectedCountry`, recarga al cambiar de país, textos de "rubro"); `CuentasTab.vue` sin la sección de categorías (template, script, imports, carga en `onMounted` y en el `watch`); `CategoriaEgresoFormDialog.vue` con textos de rubro (archivo sin renombrar, DI-17); `EgresosPage.vue` monta `<RubrosTab :selected-country="selectedCountry" />` en el panel `rubros`; `CajaPage.vue` solo comentarios.
2. **Task 2** (`018090185`): `RegistrarMovEgresoDialog.vue` sin tabs, sin panel Egreso, sin estado/carga de centros de costo ni `registerExpense`, sin las props `prefill*`; título "Registrar movimiento"; banner `bg-amber-1`/`text-brown-9` con botón "Cargar un gasto en Egresos" (solo `EGRESOS_ROLES`).
3. **Extra** (`4c88fb617`): `BandejaPendientesTab.vue` mostraba "Error al corregir el pago" fijo; ahora muestra el `message` del servidor.

## Diff resumido

**`CuentasTab.vue`** (2 líneas insertadas y 188 borradas): se fue el `q-separator` + la sección "Categorías de egreso" (`q-table` de `costCenters`, botón "Nueva categoría", acciones renombrar/desactivar/reactivar) y el `<CategoriaEgresoFormDialog>`; del script `costCenters`, `loadingCategorias`, `categoriaColumns`, `loadCostCenters`, `showCategoriaForm`, `editingCategoria`, `openCreateCategoria`, `openEditCategoria`, `onSavedCategoria`, `onDeactivateCategoria`, `deactivateCategoria`, `onReactivateCategoria`, `reactivateCategoria`, el import del diálogo y del tipo `CostCenter`, y las dos llamadas a `loadCostCenters()`. Lo único agregado son 2 líneas: el import de tipos sin `CostCenter` y un comentario ("cajas y cuentas"). Cajas, cuentas bancarias, Caja central y Tesoro, fondo de cambio, retiros y sus diálogos: sin cambios (verificado con `git diff` y un `+` que solo trae esas 2 líneas).

**`RegistrarMovEgresoDialog.vue`** (`git diff -w`: +39/-180): título; fuera `q-tabs`/`q-tab-panels`/panel Egreso, estado `tab`, `egreso`, `costCenters*`, `costCenterOptions`, `loadCostCenters`, `egresoSymbol`, `canSubmitEgreso`, `submitEgreso`, el botón "Registrar egreso" y las props `prefillTab`/`prefillCajaId`/`prefillCostCenterName`; `onShow` solo carga cajas. El panel de movimiento queda con los mismos campos, reglas (`destinoOptions` por moneda, `onOrigenChange`, `canSubmitMov`) y `submitMovimiento`; solo cambia el contenedor (`q-card-section` en vez de `q-tab-panel`, mismo padding). Se suma `canGoToEgresos` (rol en `EGRESOS_ROLES`) y `goToNuevoGasto`. La regla "medio↔cuenta" no existe en este diálogo (el traslado solo exige misma moneda y caja distinta); no se tocó nada de eso.

## Cómo se navega a "Egresos → Nuevo gasto" (para 209-13)

`router.push({ path: '/egresos', query: { tab: 'gastos', nuevo: '1' } })`, es decir `/egresos?tab=gastos&nuevo=1`. El acceso cierra el diálogo antes de navegar. `EgresosPage` ya lee `?tab=` y conserva el resto del query al hacer `router.replace({ query: { ...route.query, tab } })`, así que `nuevo=1` sobrevive. **Nada lee `nuevo` todavía**: 209-13 tiene que, al montar la pestaña Gastos (y también si ya estaba montada, por `keep-alive`: usar un `watch` sobre `route.query.nuevo`), abrir el diálogo de nuevo gasto cuando `route.query.nuevo === '1'` y después limpiarlo con `router.replace({ query: { ...route.query, nuevo: undefined } })` para que un refresh no reabra el diálogo.

## Lugares revisados con grep

- `RegistrarMovEgresoDialog|prefill-tab|prefillTab|prefill-caja|prefillCajaId|prefill-cost|prefillCostCenterName` en todo `src/`: el único consumidor del diálogo es `MovEgresosTab.vue:241`, que pasa solo `v-model`, `selected-country`, `is-owner` y escucha `@registered`. Ningún componente pasaba `prefill*`.
- `CajaPage.vue` no usa el diálogo ni sus eventos (solo montaba `MovEgresosTab`).
- `CuentasTab` se monta solo en `CajaPage.vue:87` con `selected-country` e `is-owner`; no emite eventos que alguien escuche. `CategoriaEgresoFormDialog` y `loadCostCenters` ya no aparecen en `CuentasTab`; el diálogo solo lo importa ahora `RubrosTab` (grep final de `CategoriaEgresoFormDialog|loadCostCenters` en `src/`: solo `RubrosTab` y el propio diálogo). El diálogo de movimiento ya no tiene `registerExpense`, `name="egreso"` ni `prefillTab`.
- `grep -rniE "categor[ií]as? de egreso" src`: quedan textos en `useTransactionsApi.ts` (mensajes de error genéricos y comentarios) y `types/transaction.ts` (comentarios); el comentario de `templo-config.ts:160` dice que `CuentasTab` oculta el ABM de categorías (ahora desactualizado, no se tocó por no estar en el plan).
- Funciones de `useTransactionsApi.ts` que quedaron sin uso en el admin: `registerExpense` y `getCostCenters` (y el tipo `CostCenterItem`/`RegisterExpenseInput`). No se borraron (lint no lo exige).
- `MovEgresosTab.vue`: el botón "Registrar" sigue abriendo el diálogo (ahora solo movimiento); no queda botón ni evento colgado. Sus comentarios dicen "movimiento / egreso" y el listado sigue mostrando los egresos viejos y los pagos de gastos (listados sin tocar).

## Anular desde Caja un pago de gasto (400)

La API rechaza con 400 y el mensaje "Este movimiento es el pago de un gasto: anulalo desde Egresos, en el detalle del gasto" en tres entradas (`expense-payment-guard.ts`): `POST /transactions/:id/void`, `POST /transactions/:id/correct` y `POST /expenses/:id/void`. En el admin:

- `MovimientosTab.confirmVoid`, `VoidTransactionDialog` y `BandejaPendientesTab.submitAnular` usan `extractError` (lee `response.data.message`) y notifican con ese texto: OK, sin cambios.
- `RetirosTab.voidWithdrawal` (`/expenses/:id/void`) usa `extractError`: OK.
- `BandejaPendientesTab` al **corregir** (`correctTransaction`) mostraba un texto fijo; se cambió a `extractError(err, 'Error al corregir el pago')` con `timeout: 5000` (commit `4c88fb617`, 3 líneas).

## Verificación

| Corrida | Resultado |
|---|---|
| `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 tras cada tarea (ningún error en `RubrosTab`, `CuentasTab`, `CategoriaEgresoFormDialog`, `EgresosPage`, `CajaPage`, `RegistrarMovEgresoDialog`, `BandejaPendientesTab`) |
| `pnpm lint` | 0 errores, 8 warnings (los mismos preexistentes) |
| `npx prettier --check` de los archivos tocados | limpio |
| `grep "registerExpense\|name=\"egreso\"\|prefillTab"` en el diálogo | vacío; `grep nuevo` encuentra `goToNuevoGasto` |
| `grep -n "Categor" CuentasTab.vue` | vacío |

Sin tests de componentes (plan): el comportamiento va a la UAT (209-17). No se tocó la API.

## Deviations from Plan

**1. [Rule 1 - Bug] `BandejaPendientesTab.vue` mostraba un texto genérico al corregir un pago.** Pedido en el prompt (mostrar el `message` del servidor). Fix de 3 líneas con `extractError`. Commit `4c88fb617`.

Fuera de eso, el plan se ejecutó tal cual. Se ajustaron también dos comentarios de `CajaPage.vue` (el del `q-tab` Cuentas y el de `canManageCatalog`) y el JSDoc de `CategoriaEgresoFormDialog` (dice "selector de Egresos").

## Decisiones del ejecutor

- `RubrosTab.vue` no repite `canManage`: la pestaña solo se monta para owner y admin y la API (`ADMIN_ROLES`) es el gate real (T-209-39).
- Textos: "Desactivado" en el badge de rubros inactivos (antes "Cerrada"); ayuda en el encabezado y diálogo de desactivar con "gastos" en vez de "egresos".
- Acceso a Egresos en un `q-banner` con botón flat, visible solo para `EGRESOS_ROLES` (gestión, admin, owner); `admin_sede` no lo ve.
- Se dejó el botón "Registrar" de `MovEgresosTab` como está (abre el diálogo, ahora de traslados).
- No se actualizó el comentario de `templo-config.ts:160` ni los de `MovEgresosTab.vue` (fuera de la lista del plan).

## Known Stubs

Ninguno nuevo. `nuevo=1` todavía no lo consume nadie (lo hace 209-13): hasta entonces el acceso lleva a Egresos → Gastos con el panel vacío.

## Threat Flags

None. T-209-39 mitigado (pestaña solo admin/owner y rutas `/cost-centers*` con `ADMIN_ROLES` sin cambios). T-209-40 aceptado: `POST /expenses` sigue vivo en la API y ya no hay UI que lo llame.

## Self-Check: PASSED

- `RubrosTab.vue` existe en disco; commits `fdcdc9979`, `018090185` y `4c88fb617` están en la rama; sin borrados de archivos en los commits.
