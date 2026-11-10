# Phase 207 — Centavos en el sistema de plata + sede del alumno en cada cobro

Milestone: `.planning/egresos-rendiciones/MILESTONE.md`. Decisiones de producto: `.planning/egresos-rendiciones/DECISIONES.md` (D-06, D-14). Este archivo fija las decisiones de implementación (tomadas por el orquestador con autonomía delegada por Franco, 2026-11-10).

## Objetivo

1. Que el ledger de plata y las cajas guarden importes con **centavos exactos** (ARS, EUR y — desde la 208 — USD), de punta a punta: DB, API (validación + respuesta), admin (inputs y formato), exportaciones Excel y reportes. Base para Egresos (209), donde los gastos traen centavos ($77.570,82) y los saldos bancarios deben coincidir con el extracto.
2. Que cada cobro guarde la **sede del alumno al momento del pago** (snapshot), para que los resultados y rendiciones de un mes cerrado no cambien si el alumno se muda de sede.

## Estado actual (relevado 2026-11-10, origin/master)

- `financial_transactions.amount` = `int` (unidades enteras: pesos o euros). Admin formatea con `maximumFractionDigits: 0` (`el-templo-admin/src/utils/format-price.ts`). Rutas validan `type: "integer"` (p. ej. `coach-load-routes.ts:166,199,242`). El comentario "cents" de `coach-load-routes.ts:132` es ENGAÑOSO: son unidades enteras.
- Otras columnas de plata del circuito de caja: `transaction_links.allocated_amount`, `balances.amount` (deuda, firmado), `cash_registers.opening_balance` y `change_fund`, `cash_counts` (esperado/contado/diferencia). Inventariar TODAS (schema + SQL crudo).
- Sede del alumno: no se guarda en el cobro. `getIncomeByMemberBranch` (`modules/finance/transaction-service.ts` ~2749) lee `users.branch_id` actual con fallback a `financial_transactions.branch_id`. Lo usan el Tablero semanal (`modules/weekly-board`) y el Excel de Reportes → Cobros ("Sede del alumno", `modules/reports/routes.ts:625`).
- Pool mysql2 en `el-templo-api/src/db/index.ts` (revisar `decimalNumbers`: con DECIMAL, mysql2 devuelve strings salvo esa opción).

## Decisiones de implementación

- **DI-01 Representación: `DECIMAL(14,2)` manteniendo la unidad (pesos/euros), NO centavos enteros.** Motivo: los datos existentes siguen válidos sin multiplicar por 100, el contrato de la API no cambia de unidad (los frontends y la app del socio siguen recibiendo pesos), y MySQL suma DECIMAL exacto. Drizzle: `decimal(..., { precision: 14, scale: 2, mode: "number" })` si la versión instalada lo soporta (verificar); si no, definir un custom type que devuelva `number`. Habilitar `decimalNumbers: true` en el pool (y en las conexiones de migraciones/tests si aplican) para que los SUM/agregados de SQL crudo lleguen como number — y auditar todo SQL crudo (`sql\`SUM(...)\``, `CAST`, `COALESCE`) que hoy asuma enteros.
- **DI-02 Aritmética en JS:** helper único `roundMoney(n) = Math.round(n * 100) / 100` (y comparaciones de igualdad con tolerancia de medio centavo o comparando en centavos enteros `Math.round(n*100)`). Prohibido acumular floats sin redondear al final. Donde se sumen importes en JS (allocations, saldos, reparto de pagos), sumar en centavos enteros y dividir al final.
- **DI-03 Alcance de columnas:** el ledger y el circuito de caja: `financial_transactions.amount`, `transaction_links.allocated_amount`, `balances.amount`, `cash_registers.opening_balance`/`change_fund`, `cash_counts.*` (importes) y cualquier otra columna de importe que se sume/compare contra ellas (p. ej. snapshots del Tablero si guardan importes, `debt_management` si tiene montos). **Fuera de alcance:** precios de catálogo (planes, promos, partners, comisiones, AURA, referidos) — siguen enteros; una columna DECIMAL acepta esos valores enteros sin cambios. Si el inventario muestra una columna dudosa, decidir con el criterio "¿se suma o compara contra el saldo de una caja?".
- **DI-04 API:** validaciones de importes del circuito de caja pasan de `integer` a `number` con `multipleOf: 0.01` (o validación equivalente explícita: máx 2 decimales, > 0 donde aplique). Respuestas: number (no string).
- **DI-05 Admin:** inputs de importe aceptan coma decimal (es-AR) y hasta 2 decimales; `formatPrice` muestra decimales SOLO si el importe no es entero (min 0, max 2) para no ensuciar las pantallas actuales. Excel: formato numérico con 2 decimales en columnas de importe del circuito de caja.
- **DI-06 App del socio (`el-templo-app`):** revisar si muestra importes del ledger (historial financiero, deuda). Si sí, mismo criterio de formato (decimales solo si no es entero). No hay inputs de plata en la app salvo que el inventario diga lo contrario.
- **DI-07 Sede del alumno (D-14):** columna nueva `financial_transactions.member_branch_id` (nullable, FK a `branches`, índice compuesto útil para reportes por mes). Se completa en TODA alta de cobro con `user_id` (plan_charge, debt_settlement, advance_payment, refund, adjustment con socio…): valor = `users.branch_id` del socio EN ESE MOMENTO, dentro de la misma tx. Backfill en la migración: `UPDATE ... JOIN users` para filas con `user_id` (sede actual = mejor dato disponible). `getIncomeByMemberBranch` y el Excel de Reportes pasan a leer la columna (fallback a `branch_id` del cobro si es NULL, como hoy). Una correctiva (`correct()`) copia el `member_branch_id` de la original.
- **DI-08 Migración única** (o dos si conviene separar ALTERs de backfill): ALTER de tipos + columna nueva + backfill. Sin `;` en comentarios SQL. Probar que corre en la DB de test y que el runner la registra.
- **DI-09 Sin cambio de comportamiento visible** salvo: se pueden cargar centavos y se ven cuando existen. Todos los totales actuales (Caja, Reportes, Analíticas, Tablero) deben dar IGUAL que antes para datos enteros — agregar un test de no-regresión que compare saldos/totales con datos enteros antes/después donde sea práctico.

## Tests requeridos

- Alta de cobro/traslado/ajuste con centavos → saldo exacto (p. ej. 3 × 33,33 + 0,01 = 100,00).
- Rutas rechazan 3 decimales y aceptan 2.
- `member_branch_id` se guarda en altas de cobro (POS profe, ficha admin, renovación/cron si genera cobros, settlement de deuda) y NO cambia si después se cambia la sede del alumno; `getIncomeByMemberBranch` usa el snapshot.
- Tablero/Reportes siguen dando lo mismo con datos enteros.
- Gates de tenancy que correspondan (columna nueva en tabla gym-owned: revisar si algún contrato enumera columnas).

## Fuera de alcance

Todo lo de Egresos, cuentas USD/Tesoro, retiros (fases 208-212).
