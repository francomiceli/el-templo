---
phase: 208-cuentas-tesoro-retiros
plan: 09
subsystem: admin
tags: [admin, caja, cuentas, tesoro, usd, arqueo-apertura, saldos]
requires: [208-02, 208-04, 208-08]
provides:
  - altas de caja de efectivo y cuenta banco con USD
  - TesoroFormDialog (alta de Tesoro, owner)
  - ArqueoAperturaDialog (arqueo de apertura de Central/Tesoro, owner)
  - seccion "Caja central y Tesoro" en Caja -> Cuentas (owner)
  - grupo "Tesoro" en Saldos por caja
affects: [208-10, 208-11]
tech-stack:
  added: []
  patterns: [dialogos con q-dialog + v-model computado, MoneyInput obligatorio con null bloqueando submit]
key-files:
  created:
    - el-templo-admin/src/components/caja/TesoroFormDialog.vue
    - el-templo-admin/src/components/caja/ArqueoAperturaDialog.vue
  modified:
    - el-templo-admin/src/components/caja/CajaEfectivoFormDialog.vue
    - el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
    - el-templo-admin/src/components/caja/CuentasTab.vue
    - el-templo-admin/src/components/caja/SaldosPorCajaTab.vue
decisions:
  - "El esperado del arqueo en la UI replica el de la API: fondo de cambio + saldo firme + pendiente"
  - "El nombre del Tesoro sigue a la moneda mientras no se edite a mano"
duration: ~20 min
completed: 2026-11-11
---

# Phase 208 Plan 09: Cuentas y Saldos del admin (USD, Tesoro, arqueo de apertura) Summary

Altas de caja y cuenta banco con USD, seccion "Caja central y Tesoro" para el dueño con alta de Tesoro y arqueo de apertura, y grupo "Tesoro" en Saldos (solo si hay alguno, subtotales por moneda).

## Commits

| Tarea | Commit | Descripcion |
|-------|--------|-------------|
| 1 | `bb3188e45` | cajas y cuentas en USD desde el admin |
| 2 | `f6c497366` | Tesoro y arqueo de apertura en Caja -> Cuentas |
| 3 | `6740138e9` | grupo Tesoro en Saldos por caja |

## Que se hizo

- **Task 1:** `CajaEfectivoFormDialog` y `CuentaBancariaFormDialog` usan `ACCOUNT_CURRENCY_OPTIONS` (se borraron los `currencyOptions` locales) y `AccountCurrency`. Hint de la caja de efectivo: "Una caja por sede y moneda. No se puede cambiar después." El default sigue saliendo del pais.
- **Task 2:** `TesoroFormDialog` (moneda, nombre sugerido "Tesoro {moneda}" editable, saldo de apertura con `MoneyInput` obligatorio, 0 explicito; el 409/403 del server se muestra tal cual con `extractError`). `ArqueoAperturaDialog` (saldo del sistema, fondo de cambio y pendiente si existen, `MoneyInput` contado, banner de diferencia en vivo sobrante/faltante/coincide, notas opcionales, notify con el saldo final). `CuentasTab`: seccion entre cajas de efectivo y cuentas bancarias, bajo `v-if="isOwner"` (los dos dialogos tambien), tabla con badge Tesoro/Central, moneda, saldo firme y boton "Arqueo de apertura"; sale de la misma carga `getCashRegisterBalances` (sin llamada extra) y se refresca tras crear/arquear.
- **Task 3:** `groups` en Saldos: Central excluye Tesoros; grupo "Tesoro" insertado despues de "Efectivo central" y antes de Banco solo con filas; subtotales con `perCurrencySubtotals`. Sin Tesoros la pantalla queda identica (DI-09).

## Verificacion

- vue-tsc admin: 27 (base 27), diff contra la base vacio (el unico error de `caja/` es el preexistente de `BandejaPendientesTab.onExportBandeja`). vue-tsc app: 21 (base 21).
- eslint limpio en los 6 archivos del plan; prettier aplicado.
- Sin tests automaticos (el plan indica que no hay tests de componentes del admin): el comportamiento se verifica en la UAT 208-11.
- Nota: `pnpm exec vue-tsc` no encuentra el binario en este worktree (node_modules por symlink); se uso `npx vue-tsc --noEmit`, que anda.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

## Decisiones del ejecutor

- El banner de diferencia del arqueo calcula `contado - (fondo + firme + pendiente)`, que es exactamente el esperado de `MovementService.registerOpeningCount` (verificado leyendo la API). Se muestran fondo y pendiente como lineas informativas solo si son mayores a 0.
- Dialogo de Tesoro: al cambiar la moneda el nombre sugerido la sigue solo si esta vacio o es uno de los sugeridos; un nombre editado a mano se respeta. Moneda inicial = la del pais del hub (ES -> EUR, resto ARS).
- `notes` del arqueo se envia como `null` si esta vacio.

## Hallazgos para 208-10 / 208-11

- **208-10:** `RegistrarRetiroDialog.vue` sigue con el `@ts-expect-error TODO(208-10)`; hay que quitarlo al cablear el destino. `CuentasTab` abre ese dialogo (`openRetiroCaja`) con `lock-caja`; el selector de destino sale de `getWithdrawalDestinations`. Si no hay destinos, mensaje con salida hacia "Caja central y Tesoro" de Cuentas (que solo ve el dueño: si el que retira no es owner, decir que lo cree el dueño).
- La seccion "Caja central y Tesoro" muestra TAMBIEN la Caja central (si existe en esa moneda); no tiene boton "crear Central": solo se crea Tesoro (el plan no lo pide).
- `currencySymbol` local de `RegistrarMovEgresoDialog.vue` y `RegistrarRetiroDialog.vue` aun por reemplazar por `utils/currencies.ts` (208-10).
- Hallazgo preexistente (no tocado): `BandejaPendientesTab.vue(38)` tiene un error TS2339 `onExportBandeja` (parte de los 27 de la base).

## UAT manual (para 208-11)

1. Caja -> Cuentas -> "Abrir caja": el select de moneda ofrece ARS, EUR y USD; abrir una caja USD en una sede sin caja USD queda en la tabla con `US$`.
2. Caja -> Cuentas -> "Nueva cuenta": el select de moneda ofrece USD; crear una cuenta USD y ver su saldo con `US$`.
3. Como owner: seccion "Caja central y Tesoro" visible con la Central (badge Central). Como admin/gestion: la seccion no aparece.
4. "Nuevo Tesoro": nombre por defecto "Tesoro ARS"; cambiar la moneda a USD cambia el nombre a "Tesoro USD"; saldo de apertura vacio bloquea "Crear Tesoro"; con 0 o con un importe (ej. 1.500,50) crea el Tesoro y aparece con badge Tesoro y el saldo.
5. Crear un segundo Tesoro en la misma moneda: notify con el mensaje 409 del server ("Ya hay un Tesoro activo en ...").
6. "Arqueo de apertura" en el Tesoro: mostrar saldo del sistema; contar un monto mayor -> banner "ajuste de +... (sobrante)", menor -> "−... (faltante)", igual -> "Coincide: no se crea ajuste". Registrar: notify con el saldo final igual a lo contado (menos fondo de cambio/pendiente), y la tabla se actualiza.
7. Caja -> Saldos: con un Tesoro, aparece el grupo "Tesoro" entre "Efectivo central" y "Banco", con subtotal por moneda (USD aparte de ARS); sin Tesoros el grupo no aparece y la pantalla es igual que antes.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos creados existen (TesoroFormDialog.vue, ArqueoAperturaDialog.vue).
- Commits `bb3188e45`, `f6c497366`, `6740138e9` presentes en la rama.
