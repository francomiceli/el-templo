# Stack — Módulo Contable / Libro de Caja

**Proyecto:** El Templo · módulo contable sobre backend Fastify/Drizzle/MySQL + admin Quasar/Vue3
**Fecha:** 2026-06-23
**Veredicto:** **Cero dependencias nuevas.** Todo se resuelve con el stack ya presente y con patrones que ya viven en el código.
**Confianza:** HIGH (verificado contra el código del repo, no contra training data).

---

## TL;DR — qué NO agregar

| Tentación                                              | Por qué NO                                                                                                                                                              | Qué usar en su lugar                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Lib de state machine (XState, etc.)                    | 5 estados, transiciones triviales, gobernadas por permiso de rol. Una FSM declarativa es over-engineering.                                                              | `mysqlEnum` de Drizzle + `validateTransition()` en el service (precedente: `kind`/`direction` ya son enums en `financial_transactions`). |
| Pesimismo/lib de locking, Redis, colas                 | Concurrencia de caja es bajísima (staff conocido, no e-commerce).                                                                                                       | `db.transaction()` + `SELECT ... FOR UPDATE` — **el patrón ya existe** en `aura/service.ts:114-116`.                                     |
| Tabla de saldo materializado nuevo / motor de balances | Ya hay cache de saldos (`balances`) actualizada atómicamente dentro de la txn del ledger (`balance-service.ts`). El saldo de caja se deriva con un `SUM(...)` indexado. | Vista/query agregada sobre `financial_transactions` + `caja_movements`. Cache opcional, no de entrada.                                   |
| Lib de Excel/CSV nueva en el admin                     | El admin **no** tiene lib de Excel; el export es **server-side con `exceljs`** (ya en `el-templo-api`).                                                                 | Reusar `exceljs` en la API y devolver `.xlsx` (patrón `CajaPage` → `/admin/finance/transactions/export`).                                |
| Lib de PDF nueva                                       | `pdfmake` ya está en el admin; `exceljs`/render server-side ya cubren reportes.                                                                                         | Reusar `pdfmake` (admin) si hace falta PDF; si no, exceljs.                                                                              |
| Date/Decimal libs (dayjs, decimal.js, dinero)          | Montos son `int` (centavos/enteros) y fechas `date mode:"string"` — convención ya establecida en el schema financiero.                                                  | Mantener `int` para amount y la convención de fecha existente.                                                                           |
| Subsistema de "settings/thresholds" nuevo              | Fase 136 **borró** un subsistema de settings; existe `system_settings` (key-value).                                                                                     | `system_settings` para las "perillas" (política de validación, antigüedad de pendiente).                                                 |

---

## 1. Máquina de estados de validación (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO/ANULADO)

**Resuelto con lo que YA hay. No agregar lib de FSM.**

- **Almacenamiento:** una columna `status: mysqlEnum("status", [...])` en `financial_transactions` (o tabla satélite si no se quiere tocar la tabla caliente — decisión de schema, no de stack). Precedente directo: `kind` y `direction` ya son `mysqlEnum` inline en esa misma tabla (`financial-transactions.ts:26,33`).
  - ⚠️ Nota del repo: el **1er argumento de `mysqlEnum` es el nombre de columna** y debe coincidir con la migración o CI rompe con "Unknown column" (tsc no lo ve). Ver `reference_drizzle_enum_column_name.md`.
- **Transiciones:** función pura `assertTransition(from, to, actorRole)` en `transaction-service.ts`. 5 estados, ~6 aristas, gobernadas por rol (profe vs admin) — una tabla de adyacencia o `switch` explícito alcanza y es más legible que un DSL de XState. Encaja con la preferencia del proyecto: **explícito sobre clever**.
- **Trazabilidad:** el soft-void ya existe (`voidedAt`/`voidedBy`/`voidReason`). El estado ANULADO reusa ese mecanismo. Para PENDIENTE→VALIDADO/OBSERVADO conviene agregar `validatedBy`/`validatedAt` y un log de transiciones (hay `audit-log.ts` y `session-edit-logs.ts` como precedentes de auditoría).

**Confianza: HIGH** — el patrón enum + service validation ya está en esta misma tabla.

## 2. Saldos de caja en tiempo real / concurrencia

**Resuelto con transacciones MySQL + row locks. No agregar nada.**

- **Atomicidad:** `db.transaction(async (tx) => ...)` ya se usa en `transaction-service.ts:244` y `balance-service.ts` está diseñado para que el update de cache sea atómico con el insert del ledger ("MUST be called inside the same `db.transaction` as the ledger insert"). El **movimiento inter-caja (doble entrada)** y el **egreso** son inserts en la misma txn — exactamente este patrón.
- **Concurrencia:** `SELECT ... FOR UPDATE` ya está implementado para lockear filas de saldo (`aura/service.ts:114-116`). Si se materializa un saldo por caja, se lockea esa fila igual. Para una cadena de gimnasios el volumen no justifica locking optimista ni colas.
- **Saldo "en tiempo real":** dos opciones, ambas sin deps nuevas:
  1. **Derivado** (`SUM` sobre `financial_transactions` VALIDADO + `caja_movements`), apoyado en los índices ya existentes (`idx_financial_tx_branch_date`). Simple, sin drift posible.
  2. **Cache materializado** estilo `balances` (ya existe el patrón) si el `SUM` se vuelve caro. **Recomendación: empezar derivado**, materializar solo si hay evidencia de lentitud (evitar premature optimization).
- **Regla del brief** (PENDIENTE no suma al saldo firme): es un `WHERE status = 'VALIDADO'`, no requiere nada de stack.

**Confianza: HIGH** — `db.transaction` + `FOR UPDATE` + cache `balances` ya en producción.

## 3. UI del profe (mobile-friendly en admin web)

**Resuelto con componentes Quasar existentes. No agregar UI kit.**

- Quasar 2.16 ya cubre todo: `QForm`/`QInput`/`QSelect`/`QBtn` para la carga, `QDialog` para el popup de anulación (decide membresía 1-a-1), `QList`/`QItem`/`QBadge` para la lista de pendientes por antigüedad, `QTable` para reportes. Todos responsive por defecto (`$q.screen`).
- El admin es web-only pero responsive; "dead-simple para profe" es diseño de pantalla, no stack. No hace falta Capacitor ni una app aparte.
- Stores con Pinia composition API (patrón ya estandarizado, ver CLAUDE.md). Composables con `cleanup()`, sin `onUnmounted` interno.

**Confianza: HIGH** — Quasar es el framework del admin; estos componentes ya se usan en `CajaPage`/`AlumnosPage`.

## 4. Reportes (saldos por caja, movimientos, egresos)

**Reusar el pipeline de export existente. No agregar lib.**

- **Excel:** el export es **server-side con `exceljs`** (`el-templo-api`, dep ya presente). El admin solo descarga el `.xlsx` (`CajaPage` → `transactionsApi.exportToExcel` → `GET /admin/finance/transactions/export`). Los nuevos reportes (saldo por caja, movimientos, egresos, pendientes) son **nuevas queries + nuevas hojas exceljs en la misma ruta/módulo**, no una tecnología nueva.
- **PDF:** `pdfmake` ya está en el admin si se quiere PDF; pero para reportes contables el `.xlsx` es lo natural y ya está.
- **Tablas en pantalla:** `QTable` con paginación server-side (patrón ya en el admin).

**Confianza: HIGH** — `exceljs` en API y `pdfmake` en admin verificados en `package.json`.

---

## Lo único "nuevo" que NO es stack

Es **schema + lógica de dominio**, no dependencias:

- Tabla/columna de `status` (FSM de validación).
- Entidad `caja` (efectivo/banco) con saldo, y operaciones `caja_movement` (doble entrada) + `egreso` (solo debita).
- Filas de auditoría de transición (validó/observó/corrigió quién y cuándo).
- Claves nuevas en `system_settings` para las perillas.

Todo se modela con `mysqlTable`/`mysqlEnum`/`int`/`timestamp` ya en uso. Migraciones vía `pnpm db:generate` + commit del SQL (recordar: nunca `drizzle-kit migrate`; `_migrations` es la fuente de verdad; nunca `;` dentro de comentarios SQL).

---

## Contraste con el brief

**(a) Supuestos de stack del brief que SE SOSTIENEN.**
El brief acierta de lleno: declara que "gran parte del modelo YA EXISTE" (`financial_transactions`, `subscriptions`, `transaction_links`, `balances`) y que efectivo-vs-electrónico + pago-vs-membresía **no requieren schema nuevo, solo filtro/relación existente**. Verificado en el código: `paymentMethod` + `branchId` están en la tabla, y `transaction_links` es el pivote M:N. El brief también asume implícitamente que la FSM es "la pieza que falta" pero **no pide** una lib de state machine — coherente con resolverla vía enum. Y trata el módulo como "el libro de caja = lo que hoy es el Excel" sin pedir herramienta de Excel nueva, lo cual calza con el export server-side `exceljs` ya existente.

**(b) Dónde el brief PODRÍA implicar stack nuevo no justificado.**
Un punto a vigilar: la **"reconciliación física: saldo esperado vs. contado en el origen, para registrar diferencias físicas"** (sección 6-bis, op. de movimiento). Es tentador interpretarlo como un subsistema de conteo/arqueo. **No lo es:** son dos campos `int` (esperado/contado) + un `diff` en la fila del movimiento — cero stack. Segundo punto: el brief menciona que el pendiente **"se alerta cuando pasa de cierto tiempo"**; eso podría empujar a un scheduler/cron nuevo, pero el proyecto ya corre crons (ej. recálculo de segmentación 3AM, fase 136) — reusar ese mecanismo, **no** agregar BullMQ/agenda. Tercero, "facturación electrónica AFIP/ARCA" está explícitamente diferida a lo último; cuando llegue **sí** traerá dependencia nueva (SDK AFIP), pero está fuera del scope de este milestone y el brief lo dice. No hay en el brief ningún supuesto que fuerce una dependencia nueva dentro del alcance actual.
