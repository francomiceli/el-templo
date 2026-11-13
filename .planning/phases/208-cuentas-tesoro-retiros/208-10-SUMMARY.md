---
phase: 208-cuentas-tesoro-retiros
plan: 10
subsystem: admin
tags: [admin, caja, retiros, destino, tesoro, mov-egresos]
requires: [208-05, 208-06, 208-08, 208-09]
provides:
  - "Registrar retiro" con destino obligatorio (Caja central o Tesoro de la misma moneda)
  - historial de retiros con columna y detalle Destino
  - patas de retiro nuevo legibles en Mov./Egresos
  - prefijos de moneda desde la lista unica en los dialogos de retiro y mov./egreso
affects: [208-11]
tech-stack:
  added: []
  patterns: [descartar respuestas viejas con contador de request al cambiar de caja]
key-files:
  modified:
    - el-templo-admin/src/components/caja/RegistrarRetiroDialog.vue
    - el-templo-admin/src/components/caja/RetirosTab.vue
    - el-templo-admin/src/components/caja/MovEgresosTab.vue
    - el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue
decisions:
  - "Sin destinos: el selector se reemplaza por un banner; owner ve la salida a Caja -> Cuentas, no-owner 'pedile al dueño'"
  - "Preseleccion: un unico destino, o la Caja central si hay varios; nunca el Tesoro automaticamente"
duration: ~20 min
completed: 2026-11-11
---

# Phase 208 Plan 10: Retiros con destino en el admin Summary

El diálogo "Registrar retiro" exige elegir Caja central o Tesoro de la misma moneda (opciones de `getWithdrawalDestinations`), el historial muestra el destino y Mov./Egresos distingue las patas de los retiros nuevos.

## Commits

| Tarea | Commit | Descripción |
|-------|--------|-------------|
| 1 | `7017ac0e6` | retiro con destino obligatorio (Caja central o Tesoro) |
| 2 | `83b290fd3` | destino de retiros en el historial y retiros en Mov./Egresos |

## Qué se hizo

- **Task 1 (`RegistrarRetiroDialog.vue`):** estado `destinations / loadingDestinations / destinationId`; `loadDestinations()` se llama desde `onCajaChange` y `onShow` (con contador de request para descartar respuestas viejas) y preselecciona el único destino o la Central. `q-select` "¿A dónde va la plata? *" (`Nombre · Tesoro | Caja central`); si la lista viene vacía, banner cálido con la salida (owner: Caja → Cuentas → "Caja central y Tesoro"; no-owner: pedirle al dueño). Línea "Sale de {caja} y entra a {destino}." `canSubmit` exige destino, el body manda `destinationCashRegisterId`, el notify suma " → {destino}", `resetAll` limpia todo. Etiqueta de origen con `Tesoro` / `Central` / `Efectivo` / `Banco`. **Se quitó el `@ts-expect-error` TODO(208-10).** `currencySymbol` local reemplazado por el de `utils/currencies`. Comentario de cabecera actualizado. Se mantienen conteo, "te llevás", resumen del cajón y reglas; el origen banco usa el mismo selector de destino.
- **Task 2:** `RetirosTab`: columna "Destino" (`Sin destino (anterior)` en gris para los viejos) y fila "Destino" en el detalle; texto de anulación según `format` (nuevo: "La plata vuelve a {caja} y sale de {destino}…"; viejo: el texto de siempre); la anulación sigue por `voidExpense`. `MovEgresosTab`: `rowLabel/rowColor/isWithdrawalLeg` (cash_transfer con `responsibleName`) → "Retiro" (rojo en la salida, gris en la entrada) y concepto "Retiro · {responsable} · notas"; badge, título y detalle usan esas funciones; los retiros viejos (expense) siguen como "Egreso". `RegistrarMovEgresoDialog`: solo `currencySymbol` importado y sufijo " · Tesoro" en las etiquetas de cajas (submit intacto, por la T0).

## Verificación

- vue-tsc admin: 27 (base 27, diff contra la base vacío; sin TS2578, el `@ts-expect-error` ya no está). vue-tsc app: 21 (base 21).
- eslint limpio (0 errores) en los 4 archivos; `pnpm lint` global: 0 errores, 8 warnings preexistentes.
- Sin tests de componentes: el comportamiento queda para la UAT de 208-11.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

## Decisiones del ejecutor

- Mientras cargan los destinos (lista aún vacía) se muestra el selector con spinner, no el banner, para que no parpadee el aviso "no hay destinos".
- En Mov./Egresos el signo "−" del monto sigue solo para `expense/refund` (como estaba); la pata de salida del retiro se distingue por el badge rojo y el concepto, sin tocar `isEgreso`.
- Una cash_transfer común nunca trae `responsibleName`, así que no se confunde con un retiro.

## Hallazgos para 208-11

- `CerrarCajaDialog.vue:315` todavía tiene un `currencySymbol` local (EUR/ARS, sin USD): quedó fuera del plan. Conviene reemplazarlo por el de `utils/currencies` si el cierre de caja puede ser en USD.
- El filtro "Movimientos" de Mov./Egresos incluye las patas de los retiros nuevos (son cash_transfer); queda anotado en el código.
- `RetirosTab` y otros selectores de caja (Mov./Egresos, `RetirosTab`) muestran solo el nombre de la caja, sin sufijo Tesoro.
- Prettier de lint-staged reformateó líneas no relacionadas en los archivos tocados (mínimo).

## UAT manual (para 208-11)

1. Caja -> Cuentas -> "Retirar" desde una caja de efectivo con Central en la moneda: el selector de destino viene preseleccionado con la Central; si hay Tesoro, aparece como opción; el texto "Sale de X y entra a Y." se actualiza.
2. Elegir el Tesoro, completar responsable/conteo/monto y registrar: notify "Retiro registrado: … → Tesoro ARS"; en Saldos baja la caja y sube el Tesoro.
3. Sin destino elegido (o sin Central/Tesoro en la moneda, por ejemplo una caja USD): botón deshabilitado y banner; como owner menciona Caja → Cuentas, como no-owner "Pedile al dueño".
4. Retiro desde cuenta banco: mismo selector de destino, sin conteo.
5. Errores de la API (moneda distinta, fecha anterior al corte, saldo insuficiente, diferencia sin nota) se muestran como notify con el mensaje del servidor.
6. Caja -> Retiros: columna "Destino" con el nombre en los nuevos y "Sin destino (anterior)" en gris en los viejos; el detalle tiene "Destino".
7. Anular un retiro nuevo: el texto menciona "vuelve a {caja} y sale de {destino}"; tras anular, ambas cajas recuperan el saldo. Anular un retiro viejo: texto de siempre.
8. Caja -> Mov./Egresos: las dos patas del retiro nuevo aparecen como "Retiro" ("Retiro · responsable"), la de salida en rojo; los retiros viejos siguen "Egreso". "Registrar movimiento": las cajas Tesoro llevan el sufijo " · Tesoro" y los prefijos de moneda USD muestran `US$`.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Commits `7017ac0e6` y `83b290fd3` presentes en la rama; `@ts-expect-error` ausente de `RegistrarRetiroDialog.vue`; ningún `currencySymbol` local en los dos diálogos del plan.
