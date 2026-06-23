# Arquitectura — Módulo Contable / Libro de Caja

**Dominio:** módulo contable sobre ledger transaccional existente (v4.8, fases 105-112)
**Stack:** Fastify + Drizzle + MySQL (`el-templo-api`), facade pattern en `modules/finance/`
**Investigado:** 2026-06-23
**Confianza global:** HIGH (basado en lectura directa del schema + servicios existentes)

---

## Resumen ejecutivo

El modelo v4.8 ya resuelve ~60% de lo que pide el brief: separación pago↔membresía (`transaction_links`), inmutabilidad + soft-void, atomicidad sub+cobro+balance (`recordAssignmentCharge` dentro de `db.transaction`), aislamiento por moneda (`currency` NOT NULL en cada fila + guard en `applyDelta`), y revenue "firme" filtrado por `direction='inflow' AND voided_at IS NULL`.

Lo que **falta** y es el verdadero scope: (1) máquina de estados de validación, (2) entidad caja con saldo, (3) movimientos inter-caja + egresos, (4) endpoint de carga única que también impacte caja. La decisión arquitectónica central es **no duplicar el ledger**: las nuevas capacidades se montan ENCIMA de `financial_transactions` extendiéndolo, no creando un libro paralelo. El único riesgo grave es que el filtro de "saldo firme" hoy NO conoce el concepto de validación — toda transacción nace firme. Eso hay que cambiarlo de forma controlada para no romper los reportes v5.0 (fases 117-123) que ya consumen ese filtro.

---

## Punto 1 — Máquina de estados de validación

**Decisión recomendada: columna `validation_status` en `financial_transactions` + tabla de eventos `transaction_validation_events` para el rastro.**

### Por qué columna, no tabla-de-estado-pura

El estado actual es un atributo de la transacción que se consulta en CADA query de saldo/reporte. Tenerlo como columna indexada (`idx` sobre `(validation_status, voided_at)`) evita un JOIN en todos los reportes existentes. El historial (quién pasó de PENDIENTE→OBSERVADO, motivo, cuándo) va a una tabla append-only separada — exactamente el patrón que ya usa `audit-log.ts` (write-only, `tx` requerido, sin update/delete surface). Reusar ese helper.

### Schema nuevo

```
financial_transactions:
  + validation_status mysqlEnum('pendiente','observado','corregido','validado')
                      NOT NULL DEFAULT 'validado'   -- default = backward-compat

transaction_validation_events (NUEVA):
  id, transaction_id (FK), from_status, to_status,
  actor_id (FK users), reason text NULL, created_at
```

### Cómo coexiste con soft-void (ANULADO)

**Son ejes ortogonales, NO un solo enum.** El brief dibuja ANULADO como un estado más, pero técnicamente el soft-void ya existe (`voidedAt/voidedBy/voidReason`) y los reportes lo respetan. Mantenerlos separados:

- `validation_status` ∈ {pendiente, observado, corregido, validado} — el ciclo de control.
- `voidedAt IS NOT NULL` — la anulación con rastro (ya implementada en `void()`).

ANULADO efectivo = `voidedAt IS NOT NULL` sin importar el `validation_status`. Esto evita reescribir el método `void()` y el `applyDelta(..., -1)` que ya revierte correctamente. La UI presenta "ANULADO" leyendo `voidedAt`.

### Impacto en el saldo "firme" (CRÍTICO — punto de mayor riesgo)

Hoy `getSummary` (transaction-service.ts:772) filtra solo `direction='inflow' AND voided_at IS NULL`. Una transacción PENDIENTE entraría al saldo firme — eso viola el brief.

**Cambio requerido:** el filtro de saldo firme pasa a `voided_at IS NULL AND validation_status = 'validado'`.

- **Membresía / balances (deuda del socio):** NO cambian. El `balances` cache debe seguir reflejando la obligación apenas se activa la membresía (membresía se activa al instante). El `applyDelta` corre igual en el create, independiente del status. Un PENDIENTE ya saldó la deuda del socio aunque la plata no sea "firme en caja". Esto es correcto: el socio no debe, pero la admin todavía no confirmó el efectivo.
- **Saldo de CAJA firme:** SÍ excluye PENDIENTE. Es una vista distinta del balance del socio.
- **Migración de defaults:** `DEFAULT 'validado'` deja todas las filas históricas como validadas → reportes v5.0 no cambian de números. HIGH confidence en que esto es seguro.

**Distinción conceptual a documentar fuerte:** "el socio no debe" (balances) ≠ "la plata está firme en caja" (validation_status). El brief las mezcla; el código ya las tiene separadas y hay que mantenerlo así.

### Perillas (sección 5 del brief) como configuración

- Política de validación (validar todos vs. solo dudosos) y activación (instantánea vs. requiere validación) van a una tabla `finance_settings` (o reusar el patrón de settings que existió hasta fase 136 — verificar que no se haya borrado el subsistema; según memoria la fase 136-07 eliminó la página de thresholds). Recomendación: tabla simple key/value scoped por branch/country, NO cablear.

---

## Punto 2 — Entidad `caja` (cash_registers)

**Decisión recomendada: tabla nueva `cash_registers` + columna `cash_register_id` (NULLABLE) en `financial_transactions`. Saldo DERIVADO por default, con opción de materialización futura.**

### Schema nuevo

```
cash_registers (NUEVA):
  id, name varchar, type mysqlEnum('efectivo','banco') NOT NULL,
  branch_id int NULL  -- FK branches; NULL para caja banco global y central
  currency varchar(3) NOT NULL,  -- aislamiento por moneda igual que el ledger
  is_active boolean DEFAULT true,
  created_at, updated_at

financial_transactions:
  + cash_register_id int NULL references cash_registers(id)
```

### Relación con branchId (NO mapea 1:1)

El brief lo dice explícito: caja ≠ sucursal. Modelado:

- Caja efectivo por sucursal: `type='efectivo', branch_id=X`.
- Caja efectivo central: `type='efectivo', branch_id=NULL` (o un branch sentinel).
- Caja banco global: `type='banco', branch_id=NULL`, una sola por moneda.

`branchId` se mantiene NOT NULL en `financial_transactions` (es dónde ocurrió el cobro). `cash_register_id` es ADÓNDE fue la plata. Una transferencia cobrada en sucursal Jujuy: `branchId=Jujuy, cash_register_id=Banco`. Esto resuelve elegantemente el "efectivo vs electrónico" sin tocar `paymentMethod`.

**Aislamiento por moneda:** AR usa cajas ARS, ES usa cajas EUR. La caja banco "global" es global por país, no entre países — recomendar UNA caja banco por moneda (ARS y EUR), no una sola literal. El brief dice "una sola global" pensando solo en AR; marcar este gap.

### Saldo: derivado vs. materializado

**Recomendación: DERIVADO (suma de movimientos validados) en v1, con vista/método cacheable.** Razones:

1. El ledger es la fuente de verdad (ya es inmutable). Un saldo materializado introduce el clásico riesgo de divergencia cache↔ledger.
2. Volumen bajo (8 sedes, gimnasio, no e-commerce). Un `SUM` con índice es trivial.
3. El precedente `balances` existe pero se mantiene atómico vía `applyDelta`; replicar ese patrón para caja es posible pero es deuda prematura.

Fórmula de saldo (sección 6-bis del brief):

```
saldo_caja = Σ(inflows validados a esta caja)
           + Σ(movimientos entrantes)
           − Σ(movimientos salientes)
           − Σ(egresos)
```

Si en producción el `SUM` se vuelve lento (improbable), materializar después con el mismo patrón `applyDelta`. Diseñar la firma del servicio (`CashRegisterService.getBalance`) para que el caller no sepa si es derivado o cacheado.

---

## Punto 3 — Movimientos inter-caja y egresos

**Decisión recomendada: reusar `financial_transactions` extendiendo `kind`, NO entidad separada.** Doble entrada vía dos filas linkeadas.

### Por qué reusar el ledger

El brief ya lo intuye ("caja = libro de caja"). Crear una tabla `cash_movements` paralela fragmenta la verdad financiera y obliga a UNIR dos ledgers para cualquier reporte. La regla de oro del CFO en el brief —"una transacción = una fuente de verdad"— aplica al schema.

### Extensiones de enum

```
financial_transactions.kind: + 'cash_transfer'  (movimiento inter-caja)
                             + 'expense'         (egreso/retiro)
```

`direction` ya tiene inflow/outflow — suficiente.

### Patrón de doble entrada (movimiento inter-caja, neto 0)

Un movimiento Jujuy→Central = **dos filas** atómicas en una `db.transaction`:

```
fila A: kind='cash_transfer', direction='outflow', cash_register_id=Jujuy,  amount=N
fila B: kind='cash_transfer', direction='inflow',  cash_register_id=Central, amount=N
```

Linkeadas entre sí por `transaction_links` (targetKind='transaction', targetId apunta a la otra fila) — el M:N ya soporta esto. Neto sistema = 0. Ambas validadas al instante (las hace admin).

**Moneda mixta:** un movimiento inter-caja SOLO entre cajas de la misma moneda. Validar `origen.currency === destino.currency` en el servicio (precedente: `applyDelta` ya tira si `sub.currency !== transaction.currency`). Depósito efectivo→banco = movimiento, misma moneda. NO hay conversión FX en v1 — marcar como gap si alguna vez se mueve plata cross-currency.

### Egreso (salida real, neto negativo)

**Una sola fila:**

```
kind='expense', direction='outflow', cash_register_id=origen, amount=N,
notes=<nota libre>  -- sin categoría en v1 (decisión Franco)
```

- `memberId`: el ledger lo tiene NOT NULL. Egreso no tiene socio → necesita un member sentinel (ej. usuario "sistema/gimnasio") O hacer `memberId` nullable. **Recomendación: member sentinel** para no tocar la constraint NOT NULL existente y no romper los JOINs de reportes que asumen member. Decisión a confirmar — es el roce más concreto con el modelo existente.
- `links`: egreso no linkea a subscription/debt. Agregar `'expense'` a `KINDS_ALLOWED_WITHOUT_LINKS` (transaction-service.ts:55). Idem `cash_transfer`.
- `applyDelta`: estos kinds NO deben tocar `balances` (no son deuda de socio). Como no llevan links de subscription/debt_balance, `applyDelta` los ignora naturalmente (itera sobre links; sin links relevantes = no-op). Verificar.

### Reconciliación física (sección 6-bis)

El movimiento es el punto de reconciliación. Capturar en la fila/evento: `expected_amount` (saldo derivado al momento) vs. `counted_amount` (lo que se contó físico). La diferencia se registra como un `kind='adjustment'` separado o un campo `discrepancy` en el movimiento. Reusar action `'reconciliation'` que YA existe en `AuditAction` (audit-log.ts:30) — señal de que esto estaba previsto.

---

## Punto 4 — Carga única que propaga (membresía + cobro + caja, atómico)

**Decisión recomendada: extender `recordAssignmentCharge` para setear `cash_register_id` + `validation_status`, NO crear endpoint nuevo paralelo.**

El flujo atómico YA EXISTE. `subscriptions/service.ts` envuelve en `this.db.transaction(async (tx) => {...})`: activa sub → recompute status → `recordAssignmentCharge(tx, ...)` que llama `transactionService.create(input, adminId, tx)`. Todo rollback-junto (CHARGE-03 / D-10). Esto es exactamente la "carga única" del brief.

### Qué se modifica

1. `CreateTransactionInput` (types.ts): agregar `cashRegisterId?` y `validationStatus?`.
2. `recordAssignmentCharge` params: agregar `cashRegisterId` + `recorderRole` ('profe'|'admin').
3. Derivar status del rol: profe→`'pendiente'`, admin→`'validado'`. Esta es la regla del brief (sección 4). Derivar en el servicio, no confiar en el cliente.
4. `transactionService.create`: persistir ambos campos nuevos. La membresía se activa igual (status de la sub no depende de validation_status del cobro — separación activar≠validar, ya respetada por la arquitectura).

### Resolución de caja por defecto

Dado `paymentMethod` + `branchId`, resolver `cashRegisterId` automáticamente:

- `cash` → caja efectivo de ese branch.
- `transfer`/`card` → caja banco de esa moneda.
- `aura_credit`/`internal` → sin caja (cash_register_id NULL) — no es plata física.

Esto evita que el front tenga que elegir caja en el 99% de los casos. Servicio `CashRegisterService.resolveDefault(paymentMethod, branchId, currency)`.

### Endpoint de cobro suelto (UI nueva del brief)

El modelo ya soporta cobro sin sub (`kind='adjustment'`/`'advance_payment'` sin links). Solo falta la pantalla + un endpoint thin que llame `transactionService.create` con `cashRegisterId` resuelto y `validation_status` por rol. NO requiere schema nuevo.

---

## Punto 5 — Orden de construcción sugerido

```
Fase A — Validation state machine (fundacional, mayor riesgo)
  - migración: validation_status + transaction_validation_events
  - cambiar filtro de saldo firme en getSummary (+ auditar consumidores v5.0)
  - service: transiciones + reuso de audit-log
  - DEFAULT 'validado' protege reportes históricos
  Razón de ir primero: cambia el significado de "firme" que todo lo demás consume.

Fase B — Entidad caja (cash_registers)
  - migración: tabla + cash_register_id nullable en ledger
  - seed de cajas (efectivo×sucursal, central, banco×moneda)
  - CashRegisterService.getBalance (derivado) + resolveDefault
  Depende de A (saldo firme ya filtra por validado).

Fase C — Movimientos inter-caja + egresos
  - extender enum kind ('cash_transfer','expense')
  - KINDS_ALLOWED_WITHOUT_LINKS, member sentinel para egreso
  - doble entrada atómica + reconciliación (expected vs counted)
  Depende de B (necesita cajas con saldo).

Fase D — Carga única + cobro suelto (UI)
  - extender recordAssignmentCharge (cashRegisterId, validationStatus por rol)
  - endpoint cobro suelto + resolveDefault
  - panel admin: pendientes por antigüedad, observados, saldos, movimientos
  Depende de A+B+C.

Fase E (futura, fuera milestone) — facturación electrónica AFIP/ARCA
  - el brief la deja última; diseñar solo el hook (campo invoiced/invoice_via)
```

**Dependencias clave:** A bloquea todo (redefine "firme"). B antes de C (movimientos necesitan cajas). D consume A+B+C. Perillas de config pueden ir en A o D.

---

## Puntos de integración concretos (archivo → tabla)

| Qué                                                                 | Archivo / tabla                                                                                        | Nuevo / Modificado |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| `validation_status` + índice                                        | `db/schema/financial-transactions.ts`                                                                  | Modificado         |
| Eventos de validación                                               | `db/schema/transaction-validation-events.ts`                                                           | Nuevo              |
| Filtro saldo firme                                                  | `modules/finance/transaction-service.ts:772` (`getSummary`) y todo consumidor del filtro inflow+voided | Modificado         |
| Entidad caja                                                        | `db/schema/cash-registers.ts`                                                                          | Nuevo              |
| `cash_register_id` en ledger                                        | `db/schema/financial-transactions.ts`                                                                  | Modificado         |
| `CashRegisterService`                                               | `modules/finance/cash-register-service.ts`                                                             | Nuevo              |
| Enum `kind` (`cash_transfer`,`expense`)                             | `db/schema/financial-transactions.ts`                                                                  | Modificado         |
| `KINDS_ALLOWED_WITHOUT_LINKS`                                       | `modules/finance/transaction-service.ts:55`                                                            | Modificado         |
| Carga única                                                         | `modules/subscriptions/service.ts` (`recordAssignmentCharge`)                                          | Modificado         |
| Inputs de transacción                                               | `modules/finance/types.ts` (`CreateTransactionInput`)                                                  | Modificado         |
| Rastro de validación / reconciliación                               | `modules/shared/audit-log.ts` (reusa `reconciliation`; agregar acciones de validación)                 | Modificado         |
| Rutas (validar/observar/corregir, movimiento, egreso, cobro suelto) | `modules/finance/routes.ts`                                                                            | Modificado         |
| Perillas de config                                                  | `finance_settings` (tabla)                                                                             | Nuevo              |

---

## Contraste con el brief

### (a) Decisiones de arquitectura del brief que son SÓLIDAS

- **Caja = entidad de primera clase con `branch_id` desacoplado.** Correcto: el ledger ya separa "dónde se cobró" de "adónde fue la plata". Modelarla como tabla propia es la decisión justa.
- **Reusar el modelo v4.8 en vez de rediseñar.** El hallazgo del brief (pago≠membresía ya existe vía `transaction_links`; efectivo/electrónico ya separable) es 100% correcto verificado contra el schema.
- **Activar≠validar.** La arquitectura YA soporta esto: la membresía se activa en su propia lógica de status, el cobro es una fila independiente. El brief encaja sin fricción.
- **ANULADO con rastro, nunca borrar.** Ya implementado (soft-void + `void()` que revierte `balances` y escribe audit). El brief no pide nada que no exista.
- **Doble entrada para movimiento, una entrada para egreso, neto 0 vs negativo.** Conceptualmente impecable y mapeable directo a dos/una fila(s) del ledger.
- **Sin cierre diario; reconciliación = el retiro.** Simplifica el modelo: no hay entidad "cierre", solo el evento movimiento con expected vs counted. El `AuditAction='reconciliation'` ya existente confirma que estaba previsto.

### (b) Gaps de arquitectura que el brief NO resuelve (hay que decidir)

1. **Status vs soft-void: ¿un enum o dos ejes?** El brief dibuja ANULADO dentro de la máquina de estados. Técnicamente conviene mantenerlos ortogonales (`validation_status` + `voidedAt`) para no reescribir `void()`. Decisión pendiente, recomendación: dos ejes.
2. **Saldo del socio (balances) vs saldo de caja firme.** El brief mezcla "no entra a caja como confirmado" con "membresía activa". El código las tiene separadas; hay que decidir explícitamente que un PENDIENTE salda la deuda del socio (balances) pero NO suma a caja firme. Sin esta decisión, el equipo va a romper algo.
3. **`memberId` NOT NULL para egresos.** Un egreso no tiene socio. El brief no lo nota. Decidir: member sentinel (recomendado) vs hacer la columna nullable (toca constraint + JOINs existentes).
4. **"Banco = una sola global" ignora multi-moneda.** El brief razona solo en AR. Con ES (EUR) hace falta una caja banco por moneda. Decidir el alcance real (¿el milestone incluye ES o es AR-first?).
5. **Saldo derivado vs materializado.** El brief dice "saldo por caja" sin especificar implementación. Recomendación derivado en v1; decidir umbral para materializar.
6. **Perillas como config:** el brief pide que NO estén cableadas pero no dice dónde viven. Hay que decidir la tabla `finance_settings` y su scope (global/branch/country), sobre todo tras la eliminación del subsistema de settings en fase 136-07.
7. **Antigüedad del pendiente (alerta):** el brief lo deja abierto (punto 7). Define un cron/vista; no es schema nuevo pero sí una decisión de fase D.

### (c) Riesgos técnicos de integración con v4.8

1. **ALTO — Redefinir "firme" rompe reportes v5.0.** Las fases 117-123 (analytics, LTV, churn, asistencia/funnel) y `getSummary` consumen el filtro `inflow + voided_at IS NULL`. Agregar `AND validation_status='validado'` cambia los números si hubiera filas no-validadas. Mitigación: `DEFAULT 'validado'` en la migración + auditar TODOS los call sites del filtro antes de cambiarlo. Tests de regresión sobre reportes existentes.
2. **MEDIO — `applyDelta` y los nuevos kinds.** `cash_transfer`/`expense` no deben tocar `balances`. Hoy `applyDelta` itera links; sin links de subscription/debt es no-op, pero hay que VERIFICARLO con test, porque el M:N targetKind='transaction' (usado para linkear las dos patas del movimiento) ya se ignora (balance-service.ts:89) — confirmar que el doble-entry no contamina balances.
3. **MEDIO — Atomicidad del doble-entry.** Las dos filas del movimiento inter-caja DEBEN crearse en una sola `db.transaction`. `transactionService.create` acepta `tx` opcional (D-09), así que es factible, pero el servicio de movimiento tiene que abrir la transacción y pasar el handle a ambos `create`. Riesgo de media-pata si se implementa con dos llamadas sin tx compartida.
4. **MEDIO — Migración con `;` en comentarios SQL.** Memoria del proyecto: el runner splittea por `;` antes de strippear `--`. Los enums extendidos y la tabla de eventos van en migraciones nuevas; cuidar comentarios. Commitear el SQL junto al schema.
5. **BAJO — Inmutabilidad vs validación.** El ledger es deliberadamente inmutable (sin `update`, solo `void()`). "OBSERVADO/CORREGIDO" implica corregir monto/socio. Si "corregir" muta la fila, viola la inmutabilidad TXN-05. Recomendación: corregir = anular la fila errónea + crear una nueva corregida (preserva inmutabilidad + rastro), NO `UPDATE amount`. Decidir esto explícito o se rompe la invariante central de v4.8.
6. **BAJO — `recordedBy` vs rol.** El status por rol (profe→pendiente, admin→validado) se deriva del rol del `recordedBy`. Hay que resolver el rol server-side desde el principal autenticado (no confiar en el cliente), igual que audit-log hace con `actorId`.
