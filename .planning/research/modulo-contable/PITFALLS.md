# Domain Pitfalls — Módulo Contable / Libro de Caja

**Domain:** libro de caja sobre un ledger transaccional existente (validación de pagos + movimientos inter-caja + egresos)
**Researched:** 2026-06-23
**Confianza global:** HIGH para los pitfalls anclados en el código actual (leí `financial-transactions.ts`, `balances.ts`, `transaction-links.ts`, `balance-service.ts`, `transaction-service.ts`); MEDIUM para los patrones de dominio contable (libro de caja, doble entrada, reconciliación).

> **Hallazgo de raíz que atraviesa casi todos los pitfalls:** hoy `getSummary` (la "caja") filtra **`direction='inflow' AND voided_at IS NULL`** y nada más (`transaction-service.ts:772-775`). **No existe ningún estado de validación.** Toda transacción nace firme y cuenta como dinero el instante en que se inserta. La pieza central del milestone —el estado PENDIENTE— rompe ese supuesto en TODO el sistema de reportes/caja/métricas v5.0. Si no se rediseña el filtro canónico de ingresos, un PENDIENTE va a contar como plata real desde el primer día. Este es el pitfall #1 y condiciona el ordenamiento de fases.

---

## Pitfalls Críticos (causan rewrite o data corrupta)

### C-1. El filtro canónico de ingresos no conoce "validado": PENDIENTE cuenta como plata real

**Señal de alerta:** la caja/summary/dashboard muestra un total que sube apenas el profe carga, antes de que la admin valide; el saldo de caja no coincide con la plata contada; métricas v5.0 (ingresos, ticket promedio, LTV) inflan números con pagos sin validar.
**Raíz:** el filtro de "dinero firme" en todo el código es `direction='inflow' AND voided_at IS NULL`. PENDIENTE no resta. Si solo se agrega una columna `status` sin tocar los ~6 lugares que suman ingresos, el dato sale mal en silencio.
**Prevención:**

- Definir un **filtro canónico único** de "dinero firme" = `voided_at IS NULL AND status='validado'` y centralizarlo (helper/where-builder reutilizable), no copiar la condición en cada query.
- Auditar TODOS los consumidores del ledger antes de mergear el estado: `getSummary`, balances, métricas v5.0 (120-123), saldo por caja nuevo. El brief asume "PENDIENTE no suma al saldo firme" (6-bis pto 1) pero NO menciona que eso obliga a reescribir el filtro existente.
- Backfill: las transacciones históricas deben nacer `status='validado'` en la migración (no NULL, no PENDIENTE), o todo el histórico desaparece de los reportes.
  **Detección:** test de regresión que cargue un PENDIENTE y verifique que summary/saldo NO se mueven; y que al validar, sí.
  **Fase:** **primera fase del milestone** (máquina de estados + migración del filtro canónico). Es el cimiento.

### C-2. Drift entre saldo de caja materializado y la suma real del ledger

**Señal de alerta:** el saldo guardado de una caja no coincide con `SUM` de sus movimientos; aparece después de un void, un error de red a mitad de operación, o dos operaciones concurrentes.
**Raíz:** si la caja guarda un `saldo` materializado (como `balances`), todo mutador debe actualizarlo **dentro de la misma `db.transaction`** que inserta el movimiento. El proyecto YA tiene el patrón correcto (`BalanceService.applyDelta` recibe el `tx` handle y es el único mutador — `balance-service.ts:46-86`). El riesgo es **no replicarlo**: un endpoint nuevo de egreso/movimiento que actualice el saldo en una query suelta fuera de la transacción.
**Prevención:**

- Decisión explícita: ¿saldo **materializado** (rápido, riesgo de drift) o **derivado on-the-fly** (`SUM` siempre correcto, más lento)? Para 8 sedes y bajo volumen, **derivado es más seguro y suficiente** — recomendación: empezar derivado, materializar solo si hay problema de performance medido.
- Si se materializa: un único service mutador (facade, como `BalanceService`), `applyDelta(tx, ...)` atómico, **prohibido** `update` directo del saldo desde routes.
- Job de reconciliación que compare saldo materializado vs `SUM(ledger)` y alerte ante drift.
  **Detección:** test que corra N operaciones concurrentes contra una caja y verifique saldo == suma.
  **Fase:** fase de "entidad caja + saldo" (modela cómo se calcula el saldo antes de construir movimientos/egresos encima).

### C-3. Movimiento inter-caja que no cuadra (doble entrada parcial)

**Señal de alerta:** un movimiento Jujuy→Central debitó el origen pero no acreditó el destino (o viceversa) por un fallo a mitad de camino; la suma global de cajas ≠ cero tras un movimiento que debería ser neto cero.
**Raíz:** el movimiento inter-caja es **doble entrada** (debita origen + acredita destino, neto sistema = 0 — brief 6-bis). Si las dos patas se insertan en operaciones separadas, una puede fallar y el dinero "se evapora" o se duplica.
**Prevención:**

- Las dos patas de un movimiento SIEMPRE en la **misma `db.transaction`**; o modelar el movimiento como **una sola fila** (`caja_origen`, `caja_destino`, `monto`) y derivar los dos efectos al leer (más simple, imposible de descuadrar).
- Recomendación: **una fila por movimiento** con origen+destino, no dos asientos. Elimina la clase entera de bug. El egreso es la misma fila con `caja_destino = NULL` (sale del sistema).
- Invariante testeada: `SUM(saldos de todas las cajas de misma moneda)` no cambia tras un movimiento inter-caja.
  **Detección:** test de invariante de conservación; chaos test (matar tx a mitad).
  **Fase:** fase de movimientos/egresos.

### C-4. Confusión ANULADO (soft-void existente) vs. nueva máquina de estados

**Señal de alerta:** dos formas de "anular" coexisten; queries que chequean `voided_at IS NULL` ignoran un pago en estado OBSERVADO/PENDIENTE y lo cuentan, o viceversa; auditoría ambigua sobre si un pago está "muerto".
**Raíz:** el brief (sección 3) pone ANULADO **dentro** de la máquina de estados PENDIENTE→VALIDADO→ANULADO, pero en el código ANULADO **ya existe** como soft-void (`voidedAt`/`voidedBy`/`voidReason`) y es **ortogonal** a cualquier `status`. Un pago VALIDADO puede luego ser void. Tratar ANULADO como un valor más del enum `status` choca con el modelo real.
**Prevención:**

- **No** colapsar void dentro del enum `status`. Modelo correcto: dos ejes ortogonales —
  - `status` ∈ {PENDIENTE, OBSERVADO, CORREGIDO, VALIDADO} (ciclo de control).
  - soft-void = sigue siendo el triplete existente (reversa contable con rastro).
- "Dinero firme" = `status='validado' AND voided_at IS NULL`. Anular un validado = soft-void (ya implementado, reusa `TransactionService.void` + `applyDelta(sign=-1)` que ya revierte la cache atómicamente — `transaction-service.ts:239`).
- Anular un PENDIENTE (brief lo permite): no hay plata firme que revertir, pero **sí** hay que dejar rastro. Decidir si es void o un `status` terminal "descartado". Recomendación: void igual, para una sola semántica de "muerto con rastro".
- Reusar el `audit-log` existente (`actorId`, `action`, ya usado en void — `transaction-service.ts:282-292`) para todas las transiciones de estado, no inventar otro mecanismo.
  **Detección:** matriz de tests por combinación (status × voided) confirmando qué cuenta como firme.
  **Fase:** primera fase (junto con la máquina de estados — C-1).

---

## Pitfalls Moderados

### M-1. Activar membresía sin pago real / abuso del rol profe

**Señal de alerta:** membresías activas cuya transacción quedó PENDIENTE para siempre; un profe activa repetido sin que la plata aparezca; pendientes que envejecen sin reconciliar.
**Raíz:** el brief separa correctamente activar≠validar, y el riesgo es "chico y manejable" porque el staff es conocido. Pero "manejable" exige que las herramientas de control **existan**, no que se asuman.
**Prevención:**

- Trazabilidad ya disponible: `recordedBy` está en el schema (`financial-transactions.ts:48`). Asegurar que se setea siempre con el usuario real (profe vs admin), no con un service account.
- **Lista de pendientes ordenada por antigüedad + alerta configurable** (brief 6-bis pto 4 / pendiente pto 7). El brief lo nombra pero NO define el umbral ni quién recibe la alerta — refinar en discuss-phase.
- Métrica de control: pendientes por profe/sede, antigüedad promedio del pendiente. Un profe con muchos pendientes viejos = señal.
- Perilla "primer pago de socio nuevo exige validación previa" (brief pto 5) cierra el peor caso de abuso.
  **Detección:** vista de pendientes por antigüedad; alerta automática > umbral.
  **Fase:** fase de UI de control/pendientes (después de la máquina de estados).

### M-2. Reconciliación física vs. registrada sin lugar para registrar la diferencia

**Señal de alerta:** al hacer un retiro/movimiento, la plata contada no coincide con el saldo del sistema y no hay dónde anotar el faltante/sobrante; se "ajusta" silenciosamente o se pierde.
**Raíz:** sin cierre diario, el **único** punto de verdad física es el movimiento/retiro (brief 6-bis). Si ese momento no captura `saldo_esperado` vs `saldo_contado`, las diferencias se ocultan en el ajuste.
**Prevención:**

- La operación de movimiento DEBE registrar saldo esperado vs contado (el brief lo pide explícitamente — 6-bis pto 2) y persistir la diferencia como un asiento de ajuste con rastro, no como una corrección del saldo.
- Reusar `kind='adjustment'` ya existente en el enum para la diferencia de caja, ligado al movimiento.
  **Detección:** reporte de diferencias de caja por sede/operación.
  **Fase:** fase de movimientos/egresos.

### M-3. Egreso sin categoría hoy → deuda técnica al categorizar retroactivamente

**Señal de alerta:** meses de egresos con solo nota libre; al querer reportar gasto por proveedor/dueño/tipo, hay que re-clasificar a mano cientos de filas con texto ambiguo.
**Raíz:** decisión consciente de Franco (egreso = salida + nota libre, categoría = fase posterior — brief 6-bis). Aceptable, pero el costo de re-categorizar crece con el tiempo.
**Prevención:**

- Diseñar el schema del egreso con `category_id` **nullable desde el día 1** (la columna existe vacía), aunque la UI no la pida aún. Agregar la columna después es una migración cara y obliga a backfill manual; tenerla nullable es gratis.
- Mantener la **nota libre estructurada** (no un blob): al menos un campo "beneficiario/concepto" separado del comentario, para que un futuro categorizador semi-automático tenga de dónde agarrar.
- Definir el set de categorías futuras AHORA (aunque no se use) para que las notas se escriban consistentes.
  **Detección:** % de egresos sin categoría a lo largo del tiempo (cuando exista la categoría).
  **Fase:** fase de egresos (decidir el schema nullable); categorización = fase posterior.

### M-4. Mezcla ARS/EUR en una caja o movimiento; conversión implícita

**Señal de alerta:** una caja suma ARS + EUR en un mismo total; un movimiento mueve plata entre cajas de distinta moneda; un saldo "global" que oculta dos monedas.
**Raíz:** el sistema YA aísla por moneda con disciplina —`balances` tiene `currency` en su UNIQUE key (`balances.ts:43-48`), y `applyDelta` **rechaza** moneda inconsistente con un throw explícito (`balance-service.ts:154-158`). El riesgo es que las **entidades nuevas (caja, movimiento, egreso) NO hereden esa disciplina**.
**Prevención:**

- Cada **caja tiene una moneda fija** (`currency` NOT NULL en la entidad caja). Una caja efectivo Barcelona = EUR; Jujuy = ARS. Saldo siempre por (caja) → implícitamente por moneda.
- Movimiento inter-caja: **prohibir** origen y destino de distinta moneda (validación a nivel service, espejo de `balance-service.ts:154`). El cambio de divisa, si alguna vez ocurre, es egreso + ingreso explícitos, NUNCA un movimiento con conversión implícita.
- "Banco una sola global" (brief 6-bis) es **peligroso multi-país**: si caen ARS y EUR en la misma caja banco, se mezclan. Recomendación: banco por moneda (banco-ARS, banco-EUR), no una sola. **El brief no contempla esto.**
- Nunca un total cross-currency en UI sin la moneda al lado; sin tasa de conversión hardcodeada.
  **Detección:** test que rechace movimiento ARS↔EUR; assert de que ningún reporte sume monedas distintas.
  **Fase:** fase de entidad caja (la moneda es atributo fundacional de la caja).

### M-5. Doble carga / convivencia con Contabilium durante la transición

**Señal de alerta:** el mismo pago vive en Contabilium y en el Administrador con montos distintos; nadie sabe cuál es la verdad; al "apagar" Contabilium faltan datos históricos.
**Raíz:** el brief decide reemplazo **progresivo** con convivencia (sección 6). La convivencia es exactamente el problema de "tres registros que no coinciden" que el módulo viene a resolver — solo que ahora con dos sistemas en vez de tres durante un período.
**Prevención:**

- **Corte limpio por fecha** para el registro de ingresos/caja: a partir del día X, la caja vive SOLO en el Administrador; Contabilium se sigue usando solo para lo no migrado (facturación AFIP). No "ambos registran el ingreso" — eso recrea el doble tipeo.
- **No migrar el histórico transaccional** de Contabilium al ledger (riesgo de duplicar y ensuciar métricas). Contabilium queda como archivo de consulta para lo viejo; el Administrador arranca su caja desde el corte con saldos iniciales de apertura por caja (un asiento `kind='adjustment'` de apertura).
- Marcar facturación como dimensión futura sin construirla: un flag nullable "facturado / vía" (brief pto 6 lo sugiere). Schema-ready, no funcional aún.
- Validar el encuadre fiscal con el contador ANTES de tocar facturación (el brief lo advierte; no es scope de este módulo).
  **Detección:** durante convivencia, conciliación periódica caja-Administrador vs Contabilium hasta confiar.
  **Fase:** discuss-phase de la primera fase (decidir corte limpio vs convivencia + asientos de apertura). El brief lo deja como pendiente abierto.

---

## Pitfalls Menores

### m-1. `amount` como `int` (centavos) y redondeo

**Señal de alerta:** diferencias de 1 centavo en sumas; asunción equivocada de que `int` son pesos enteros.
**Prevención:** confirmar la unidad de `amount` (`financial-transactions.ts:34` es `int`) — verificar si es centavos o unidad entera y mantener la misma convención en caja/movimiento/egreso. Nunca floats para dinero.
**Fase:** fase de entidad caja.

### m-2. Permisos: que el profe pueda validar/anular por un bug de autorización

**Señal de alerta:** un profe transiciona un pago a VALIDADO o ejecuta un egreso.
**Prevención:** autorización por rol en cada transición (tabla de permisos del brief sección 4), testeada explícitamente. Egresos/anulaciones = solo admin.
**Fase:** fase de máquina de estados + fase de egresos.

### m-3. Borrado de saldos cero / filas de auditoría

**Señal de alerta:** alguien "limpia" filas con amount=0.
**Prevención:** ya hay decisión (D-07: filas cero se preservan — `balances.ts:18-21`). Replicar: NUNCA borrar filas del libro de caja; todo es soft-void con rastro.
**Fase:** transversal.

---

## Phase-Specific Warnings

| Fase (tema)                      | Pitfall probable                                             | Mitigación                                                                                                      |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Máquina de estados de validación | C-1 (filtro canónico) + C-4 (void ortogonal)                 | Filtro firme centralizado `validado AND voided IS NULL`; status y void como ejes separados; backfill `validado` |
| Entidad caja + saldo             | C-2 (drift) + M-4 (moneda) + m-1 (unidad)                    | Saldo derivado por defecto; `currency` NOT NULL por caja; banco por moneda                                      |
| Movimientos inter-caja + egresos | C-3 (doble entrada) + M-2 (reconciliación) + M-3 (categoría) | Una fila por movimiento; capturar esperado vs contado; `category_id` nullable día 1                             |
| UI control / pendientes          | M-1 (abuso/envejecimiento)                                   | Lista por antigüedad + alerta configurable + métrica por profe                                                  |
| Migración / Contabilium          | M-5 (doble carga)                                            | Corte limpio por fecha + asientos de apertura; no migrar histórico al ledger                                    |

---

## Contraste con el brief

### (a) Pitfalls que el brief YA mitiga explícitamente

- **C-4 parcial / void con rastro:** el brief define ANULADO como "con rastro, nunca borrar, solo admin, motivo+autor+fecha" (sección 3) — alineado con el soft-void existente.
- **M-1 (abuso/envejecimiento):** el brief nombra trazabilidad por carga firmada, lista de pendientes por antigüedad con alerta, y la perilla "primer pago de socio nuevo exige validación" (secciones 2, 5, 6-bis).
- **M-2 (reconciliación):** el brief pide explícitamente registrar "saldo esperado vs. contado en el origen para registrar diferencias físicas" (6-bis pto 2).
- **M-3 (egreso sin categoría):** decisión consciente con `category_id` futura (6-bis); el riesgo de deuda técnica está reconocido como "fase posterior".
- **C-3 conceptual:** el brief distingue correctamente movimiento (doble entrada, neto 0) de egreso (solo debita), incluyendo depósito efectivo→banco como movimiento (6-bis).
- **M-5 (Contabilium):** reemplazo progresivo, facturación al final, flag de facturado futuro, advertencia de validar fiscal con contador (sección 6).

### (b) Pitfalls que el brief NO menciona y son riesgo real

- **C-1 (el más importante):** el brief dice "PENDIENTE no suma al saldo firme" (6-bis pto 1) pero **NO reconoce que el filtro canónico de ingresos ya existe en el código** (`direction='inflow' AND voided_at IS NULL`) y NO conoce estados. Agregar PENDIENTE obliga a reescribir ~6 consumidores (summary, balances, métricas v5.0) y a hacer backfill `validado`. Sin esto, todo pendiente cuenta como plata real. **Riesgo crítico no nombrado.**
- **C-2 (drift de saldo materializado):** el brief habla de "saldo por caja" pero no decide materializado vs derivado ni nombra el riesgo de drift/concurrencia. El proyecto tiene el patrón atómico correcto (`applyDelta(tx)`), pero el brief no exige replicarlo.
- **M-4 banco multi-moneda:** el brief define "banco = una sola global" — **peligroso** con sede en Barcelona (EUR) + Argentina (ARS). Mezclaría monedas en una caja. El brief no menciona aislamiento de moneda en las cajas nuevas, pese a que el ledger ya lo aísla con disciplina.
- **C-4 (ortogonalidad void/status):** el brief dibuja ANULADO como un estado **dentro** de la máquina (PENDIENTE→...→ANULADO), cuando en el código void es ortogonal a status (un VALIDADO puede luego anularse). Tratarlo como un valor del enum chocaría con el modelo real y con el `TransactionService.void` ya implementado.
- **Migración (corte limpio vs convivencia):** el brief lo deja como pendiente abierto (pto 7) sin recomendación; el riesgo de doble carga durante convivencia es real y no está dimensionado.

### (c) Supuestos del brief que son peligrosos

1. **"Banco = una sola caja global"** (6-bis): rompe el aislamiento de moneda con la sede de Barcelona. Recomendación: banco por moneda.
2. **"Gran parte del modelo YA EXISTE → el scope es chico"** (handoff): cierto para entidades, pero el brief **subestima** que introducir un estado de validación toca el filtro canónico de ingresos del que dependen la caja Y las 6 métricas de gestión de v5.0 (fases 120-123). El blast radius es mayor que "agregar una columna".
3. **"El riesgo de activar sin pago es chico y manejable"** (sección 2): verdadero solo si las herramientas de control (lista por antigüedad, alertas, umbral, métrica por profe) se construyen de verdad. El brief las nombra pero deja umbral y destinatario sin definir — si esa fase se recorta, el control queda en el papel.
4. **ANULADO modelado como estado del enum** (diagrama sección 3): debe ser eje ortogonal (soft-void existente), no un valor de `status`. Implementarlo como enum value generaría queries inconsistentes sobre "qué es dinero firme".
5. **Convivencia con Contabilium sin corte explícito:** "vamos recreando funciones... mientras tanto conviven" (sección 6) reintroduce el doble tipeo que el módulo combate, salvo que se fije un corte limpio por fecha para la caja. Asumir convivencia sin corte es peligroso.
