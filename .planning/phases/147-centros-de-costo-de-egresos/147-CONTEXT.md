# Phase 147 — Centros de costo de egresos · CONTEXT

> Fuente de verdad: `BRIEF-FEEDBACK-V52-CAJA.md` (Punto 10) + ROADMAP Phase 147 + REQUIREMENTS EGR-01..03.
> Generado en **run autónomo desatendido** (milestone v5.3). Decisiones de ambigüedad se registran en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (Fase 147), NO se frena.

## Goal

Cada egreso (`kind='expense'`) se clasifica **obligatoriamente** en un centro de costo, para reportar gasto por rubro más adelante. Catálogo `cost_centers` por país, seedeado en AR. El reporte agrupado y el ABM desde UI quedan **diferidos** (Paso 2, fuera de scope).

## Requirements

- **EGR-01**: Catálogo `cost_centers` (por país), seedeado AR con **Alquiler Constitución / Librería / Viáticos profes / Varios**.
- **EGR-02**: Registrar un egreso **exige** elegir un centro de costo (obligatorio; "Varios" como escape). Solo aplica a `kind='expense'`.
- **EGR-03**: La lista "Movimientos de caja" muestra el **centro de costo** de cada egreso.

## Decisiones de diseño (del brief, NO re-preguntar)

1. **Tabla `cost_centers`**: lista simple por país. Columnas mínimas: `id`, `name`, `country` (AR/ES, alineado a cómo `cash_registers`/planes manejan país), `is_active` (soft-disable), timestamps. Seed AR: las 4 de arriba. "Varios" es el escape obligatorio (siempre presente).
2. **`cost_center_id`** en `financial_transactions`: nullable a nivel DB (las filas históricas y los no-egresos quedan NULL), pero **obligatorio a nivel aplicación SOLO para `kind='expense'`** (validado en el endpoint/servicio de egreso). No tocar otros kinds.
3. **Endpoint** para listar centros de costo activos por país (consumido por el selector del dialog). RBAC igual al resto del hub de caja (FINANCE_VOID_ROLES: gestion/admin/owner).
4. **Selector** en `RegistrarMovEgresoDialog.vue` (dialog de egreso de la fase 139): obligatorio, default razonable (no forzar "Varios" silenciosamente — el usuario elige; si querés, "Varios" puede ser el preseleccionado, registrá la decisión).
5. **Columna "Centro de costo"** en `MovEgresosTab.vue` (la lista del arqueo por caja, fase 146/141): muestra el nombre del centro para filas `expense`; vacío/"—" para otros kinds. `listMovEgresos` debe devolver el nombre del centro (join a `cost_centers`).
6. **Migración** nueva: próxima libre es **0161** (última aplicada 0160). Puede ser una sola migración (CREATE TABLE + ALTER ADD COLUMN + seed AR idempotente) o dividida — criterio del planner. **Reglas estrictas del proyecto:** nunca `;` dentro de comentarios SQL (el runner splittea por `;` antes de strippear `--`); seed idempotente (INSERT ... WHERE NOT EXISTS / derived tables, evitar error 1093); commitear el `.sql` junto al schema Drizzle.
7. **Drizzle**: `mysqlEnum` 1er-arg = nombre de columna (debe coincidir con la migración o CI falla con Unknown column). Si `country` se modela como enum, respetar esto.

## Anchors (recon ya hecho)

- Schema Drizzle finance: `el-templo-api/src/db/schema/financial-transactions.ts`, `cash-registers.ts`. Nuevo archivo `cost-centers.ts` (analogía: `cash-registers.ts`). Exportar en el barrel del schema.
- Servicio de egreso: `el-templo-api/src/modules/finance/movement-service.ts` (`registerExpense`) — recon: `RegisterExpenseInput { cajaId, amount, notes }` hoy SIN categoría; agregar `costCenterId`.
- Ruta: `el-templo-api/src/modules/finance/routes.ts:618` `POST /expenses` (`registerExpenseSchema` ~línea 40). Agregar `costCenterId` al body+schema (required). Nuevo `GET /cost-centers` (por país).
- Arqueo query: `transaction-service.ts` `listMovEgresos` (~línea 1341+) — join a `cost_centers`, devolver `costCenterName`.
- Barrel/labels: `routes.ts:1430` (`expense: "Egreso"`).
- FE dialog: `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue`.
- FE lista: `el-templo-admin/src/components/caja/MovEgresosTab.vue` (ya tocada en 146-06 — agregar columna sin romper lo existente).
- FE tipos/composable: `el-templo-admin/src/types/transaction.ts`, composable del hub de caja (probablemente `useTransactionsApi.ts` / `useFinanceLoadApi.ts`).

## Out of scope (diferido — NO hacer)

- Reporte de egresos agrupado por centro de costo.
- ABM de centros de costo desde UI (crear/editar/desactivar).
- Centros de costo para kinds distintos de `expense`.
- Seed ES (solo AR para staging).

## Tests

- API: tests de integración para `GET /cost-centers` (por país) y `POST /expenses` rechazando egreso sin `costCenterId` (400) y aceptándolo con uno válido; `listMovEgresos` devuelve `costCenterName` en filas expense. Correr puntual (`pnpm test` del archivo), NO el suite completo (corre en CI al pushear).
- Typecheck local (api `tsc`, admin `vue-tsc` filtrando archivos tocados).

## Reglas del run autónomo (heredadas del milestone)

- Branch **staging**, **NO pushear** (Franco revisa+pushea de mañana).
- **NO `git add -A`** — stagear por ruta. Commits atómicos.
- Ante ambigüedad: **adivinar + registrar en AUTONOMOUS-DECISIONS-v5.3.md + seguir** (no frenar).
