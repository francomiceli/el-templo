# Retiro de centavos en los tests de la API (D-23) — Summary

Fecha: 2026-11-11. Rama `feat/egresos-rendiciones`. Tarea acotada posterior al commit `9a342ad84` (la plata vuelve a unidades enteras).

## Archivos adaptados (todo en `el-templo-api/test/`)

| Archivo | Cambio |
| --- | --- |
| `finance/withdrawals-destino.test.ts` | ~36 literales decimales pasados a enteros (cobros 1000 + 2000, retiro 3000, apertura Tesoro 500, faltante 1, sobrante 1, etc.), saldos esperados recalculados a mano, aserciones de texto de las notas ("contado 4999", "contado 1001") ajustadas. |
| `finance/arqueo-apertura.test.ts` | 1234.56 -> 1234, 234.56 -> 234, 334.56 -> 334, 150.5 -> 150 (diferencia 50). Título "con centavos" renombrado. |
| `finance/member-branch-snapshot.test.ts` | Todo lo del snapshot de sede intacto. El caso del Tablero (100.10 + 200.20 = 300.3) se reescribió en enteros (100 + 200 en A, 50 en C). Referencias a `centavos-*.test.ts` (ya borrados) sacadas de los comentarios. |
| `finance/cuentas-usd-tesoro.test.ts` | 250.75/750.75/1500.75/100.5 a enteros. |
| `finance/regla-medio-cuenta.test.ts` | 1000.5/250.25/750.25/300.5/699.5 a enteros (1000/250/750/300/700). |
| `migrations/0329-tesoro-cheque.test.ts` | monto 1234.56 -> 1234 (no afirmaba nada de DECIMAL). |
| `migrations/0327-0328-sede-alumno.test.ts` | INSERT crudo con 1500.50 -> 1500 y ajuste del test de "0327 no contiene datos" (ver Desviaciones). |

Revisados con grep (literales decimales, "centavo", `toBeCloseTo`, `toFixed`, `* 100`, `/ 100`) y sin cambios porque no hay plata con decimales: `withdrawal-formats`, `no-regresion-208`, `withdrawals`, `cash-counts`, `summary-*`, `transaction*`, `tenancy/iso-*`, `tenant-manifest.ts`, fixtures. Quedan, a propósito, `matrix.test.ts` (`pctCierre` toBeCloseTo 33.3333: es un porcentaje, no plata) y `reports/attribution-report.test.ts` (`MoneyBag` redondeando a 2 decimales, de la fase 195, ajeno a este revert).

## Casos borrados

Ninguno. El único caso que existía solo para probar aritmética de centavos (Tablero 100.10 + 200.20 con floats) tenía equivalente en enteros y se reescribió.

## Guardas nuevas (decimal -> 400)

- `withdrawals-destino.test.ts`: "importe decimal (amount o countedAmount) -> 400 y no escribe nada" (`amount: 100.5` y `amount: 500, countedAmount: 1000.5`; sin filas nuevas y saldo intacto).
- `arqueo-apertura.test.ts`: el caso de validaciones del body suma `countedAmount: 100.5` (ya tenía 1.005).
- `cuentas-usd-tesoro.test.ts`: alta de Tesoro con `openingBalance` 100.5 y 1.005 -> 400.

Verificado: las tres rutas responden 400 (schema `type: "integer"`; Ajv con `coerceTypes` no trunca un número no entero). No hubo que tocar código.

## Desviaciones

**[Rule 1 - Bug en test] `0327-0328-sede-alumno.test.ts` "0327 no contiene datos (solo ALTER)"** esperaba 6 sentencias, pero la migración 0327 reescrita por el revert tiene un solo ALTER (ADD COLUMN `member_branch_id` + FK + índice). Se cambió a `length === 1`, con aserciones extra: contiene `ADD COLUMN \`member_branch_id\`` y no contiene `MODIFY`/`DECIMAL`. No hay bug en el código.

## Corridas (foreground, de a 2 archivos)

| Archivo | Resultado |
| --- | --- |
| `finance/withdrawals-destino` | 21 pasaron |
| `finance/arqueo-apertura` | 17 pasaron |
| `finance/member-branch-snapshot` | 14 pasaron |
| `finance/cuentas-usd-tesoro` | 17 pasaron |
| `finance/regla-medio-cuenta` | 17 pasaron |
| `migrations/0329-tesoro-cheque` | 5 pasaron |
| `migrations/0327-0328-sede-alumno` | 24 pasaron (la 1ª corrida falló 1 por la desviación de arriba) |
| `finance/no-regresion-208` | 14 pasaron |
| `finance/withdrawals` | 28 pasaron |
| `finance/cash-counts` | 15 pasaron |
| `finance/withdrawal-formats` | 21 pasaron |
| `finance/movement-service` | 14 pasaron |
| `finance/income-by-branch` | 4 pasaron |
| `weekly-board/by-branch-caja-alumnos` | 12 pasaron |
| `tenancy/iso-01-manifiesto` | 13 pasaron |

Dos corridas fallaron por `Hook timed out in 540000ms` en el provisioning de la DB de test (`test/setup.ts:293`) sin ejecutar ningún test: la de `member-branch-snapshot + cuentas-usd-tesoro` (pasó al reintentar, 31/31) y la primera de `by-branch-caja-alumnos + iso-01-manifiesto`. Es el flake conocido de provisioning, no un error de código.

## Bugs de código encontrados y arreglados

Ninguno: el código del revert estaba bien, solo había tests desactualizados.

## Verificación final

- `npx tsc --noEmit` en `el-templo-api`: 0 errores.
- `npm run -s typecheck:tests`: 18 discrepancias (igual que antes; el script además avisa de 2 entradas obsoletas del baseline en `attendance.test.ts` y `lifecycle.test.ts`, preexistentes y ajenas).
