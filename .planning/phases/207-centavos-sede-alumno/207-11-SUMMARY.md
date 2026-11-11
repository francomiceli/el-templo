---
phase: 207-centavos-sede-alumno
plan: 11
subsystem: admin-money-inputs
tags: [money, MoneyInput, caja, arqueo, retiro, traslado, fondo-de-cambio]
requires: ["207-10"]
provides:
  - "Cerrar caja, Retiro, Traslado/Egreso, corrección de la Bandeja, saldo inicial de caja efectivo y fondo de cambio aceptan centavos (MoneyInput / parseMoneyInput)"
  - "diferencia de arqueo, 'te llevás', disponible y restante en centavos exactos (utils/money)"
affects: [207-12]
key-files:
  modified:
    - el-templo-admin/src/components/caja/CerrarCajaDialog.vue
    - el-templo-admin/src/components/caja/RegistrarRetiroDialog.vue
    - el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue
    - el-templo-admin/src/components/caja/CajaEfectivoFormDialog.vue
    - el-templo-admin/src/components/caja/CuentasTab.vue
metrics:
  tasks: 2
  completed: 2026-11-10
---

# Phase 207 Plan 11: inputs de plata de Caja con centavos

Todos los importes del módulo Caja usan `MoneyInput` (o el parser es-AR en el prompt del fondo de cambio) y la aritmética pasa por `utils/money.ts`. El conteo por denominaciones no existe en estos diálogos (no hay cantidades de billetes), así que no hubo nada que mantener entero.

## Commits

- `b4e80f8a9` feat(207-11): arqueo y retiro con MoneyInput y aritmética en centavos
- `d6254eafb` feat(207-11): traslado, egreso, corrección, saldo inicial y fondo de cambio con centavos

## Verificación

| Gate | Antes | Después |
|------|-------|---------|
| vue-tsc admin (`error TS`) | 27 | 27 (el único error en `caja/` es `onExportBandeja` en BandejaPendientesTab:38, preexistente) |
| eslint de los 6 archivos | - | 0 errores, 0 warnings |

Tests: ninguno (el admin no tiene tests de componentes; la lógica de plata ya está cubierta por `utils/__tests__/money.test.ts` de 207-09). No se corrió vitest.

Prettier: `CerrarCajaDialog.vue` y `RegistrarRetiroDialog.vue` ya no pasaban `prettier --check` en HEAD (lint-staged solo corre eslint en el admin); no se reformatearon para no ensuciar el diff.

## Cambios por archivo

- `CerrarCajaDialog.vue`: `countedAmount` con `MoneyInput` (regla de obligatorio, mantiene `autofocus`, suffix, label). `difference = roundMoney(contado - esperado)`; "coincide" con `moneyEquals`; signo con `compareMoney`; suma firme + pendiente con `sumMoney`; `canSubmit`, el aviso de último cierre y la notificación con `moneyEquals`/`compareMoney`. Contado 1000,10 vs esperado 1000,1 = diferencia 0.
- `RegistrarRetiroDialog.vue`: los tres importes (conteo, "te llevás", Monto banco) con `MoneyInput`. `toInt` eliminado y reemplazado por `nonNegativeMoney`. `difference`, `available` y el nuevo `remaining` (lo que queda después del retiro) con `roundMoney`; `amountValue > available` y la sugerencia con `compareMoney`; signo de la diferencia con `compareMoney`; `notesRequired` con `moneyEquals`. `onAmountInput` ahora recibe `number | null`.
- `RegistrarMovEgresoDialog.vue` (cambio mínimo, solo inputs y comparaciones): `mov.amount`, `mov.countedAmount` y `egreso.amount` con `MoneyInput`; regla `amountRules` (> 0) para los dos montos; `canSubmitMov/Egreso` con `compareMoney`. No se tocó `submit*` ni `resetAll`: el merge con `fix/traslados-idempotencia` debería quedar limpio (solo comparten el bloque de imports y el template de los inputs).
- `BandejaPendientesTab.vue`: `corregir.amount` con `MoneyInput`; "hay cambios" con `moneyEquals` (corregir 100,50 -> 100,5 no genera un cambio fantasma). El ID de socio queda `type="number"`.
- `CajaEfectivoFormDialog.vue`: `openingBalance` pasa a `number | null` con `MoneyInput`.
- `CuentasTab.vue`: prompt del fondo de cambio de `type: 'number'` a `'text'`, `model: formatMoneyNumber(...)`, `isValid` con `parseMoneyInput(v).ok`, `onOk` re-parsea y manda `parsed.value`.

## `type="number"` que quedan en `src/components/caja/`

```
BandejaPendientesTab.vue:314:  type="number"   (corregir.memberId -> ID de socio, NO es importe)
```

Ningún `v-model.number` de importes ni `Number.isInteger` en Caja.

## Decisiones del ejecutor

- **Reset a null de MoneyInput en el Retiro:** con `selectedCajaId` cambiando de efectivo a efectivo, `pending` no se desmonta, y `onCajaChange` resetea `amount`/`countedAmount` a `null` con los inputs montados: un texto inválido tipeado a medio escribir sobreviviría al reset (limitación del 09). Resuelto sin tocar el componente: `inputsKey` (contador) como `:key` de los tres `MoneyInput`, incrementado en `onCajaChange` y `resetAll`; remonta los inputs y el texto vuelve a reflejar el modelo. En los demás diálogos (Cerrar caja, Mov/Egreso, Caja efectivo, Corregir) el input vive dentro de contenido que se desmonta (`v-else-if="expected"`, `q-dialog`, `v-else` de `loadingCajas`), así que no hizo falta.
- **Saldo inicial obligatorio (`CajaEfectivoFormDialog`):** `MoneyInput` emite `null` tanto para vacío como para texto inválido, y mandar un `null` como 0 hubiera abierto la caja con saldo 0 ante un "12,345" mal tipeado. Se eligió la opción conservadora: el campo exige un valor (el default es 0, el hint dice "Dejalo en 0") y `canSubmit` lo requiere; vacío muestra "Ingresá el saldo inicial (0 si arranca vacía)".
- **Campos de importe opcionales (conteo del traslado, conteo del Retiro, monto de la corrección):** un texto inválido se comporta como vacío (el input muestra el error rojo, pero el botón no se bloquea y se manda sin ese campo). Es la limitación general de `MoneyInput` (null = vacío o inválido). No se resolvió acá por no tocar la lógica de submit de `RegistrarMovEgresoDialog` (conflicto con la otra rama); recomendable como mejora de `MoneyInput` (p. ej. evento `invalid` o `validate()` previo al submit) en un plan posterior.
- Prompt del fondo de cambio: vacío no es válido (`parseMoneyInput` devuelve `empty`), 0 sí.
- `RegistrarMovEgresoDialog`: `amountRules` (regla > 0) como constante del script; las reglas del `q-input` anterior eran solo `min` HTML sin efecto.

## Desviaciones

Ninguna respecto del plan salvo lo anotado arriba (`inputsKey` en el Retiro, saldo inicial obligatorio).

## Bugs encontrados

- `BandejaPendientesTab.vue:38`: error de vue-tsc preexistente (`onExportBandeja` inexistente en el tipo del componente). Ya está en la línea base de 27; no se tocó.

## UAT manual

1. Cerrar caja contando "1.234,50" con esperado 1.234: banner "Sobra $0,50", pide motivo; con "1.234" coincide.
2. Traslado de "0,50" entre dos cajas: se registra por $0,50; "0,505" muestra "Máximo 2 decimales".
3. Retiro: contar "10.000,25" con esperado 10.000 -> sobrante $0,25 y "te llevás" sugerido exacto; el restante ("Después del retiro quedan") sale exacto; cambiar de caja limpia los campos aunque haya texto inválido.
4. Cuentas -> Fondo de cambio: abrir (muestra el valor actual, p. ej. "500"), escribir "500,50", guardar; vacío o "500,555" deja el botón Aceptar deshabilitado.
5. Caja efectivo nueva con saldo inicial "1.500,75": queda abierta con ese saldo; saldo vacío no deja abrir.
6. Bandeja: corregir un cobro de $100 a "100,50" manda el monto; dejar "100" sin tocar da "No hay cambios".

## Known Stubs

Ninguno.

## Self-Check: PASSED
