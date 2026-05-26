# Fase 117 — Hallazgos de origen (sesión de análisis sobre datos de producción)

Origen: sesión de analítica de miembros sobre prod (2026-05-26). Se revisó
`el-templo-api/src/modules/analytics/` (service.ts 1112 LOC + routes/schemas/types).
Los números los validamos contra la DB de producción.

## 🔴 Bugs de correctitud

### 1. KPI de activos lee un campo obsoleto

- `countActiveMembers` (`analytics/service.ts:191`) cuenta `users.status='activo'`.
- Ese campo **no lo recalcula nadie periódicamente**: solo se actualiza por evento
  de suscripción vía `recomputeUserStatus` (`subscriptions/service.ts:4115`). No hay cron.
- Medido en prod: **~48 activos "fantasma"** (sub vencida pero `status` sin actualizar).
  El KPI sobre-cuenta (panel mostraba 692 AR; el global `status='activo'` da 749).
- El comentario en `:195` afirma equivalencia con el `EXISTS` "porque el Plan 103 hizo
  backfill" — fue un backfill único; el drift se acumula desde entonces.
- Predicado canónico de "activo" (de recomputeUserStatus):
  `EXISTS sub WHERE subscription_status IN ('active','paused') AND start_date <= CURDATE()
 AND (end_date IS NULL OR end_date >= CURDATE())`.

### 2. No-show rate compara con un status inexistente

- `getNoShowRate` (`analytics/service.ts:731`) usa `status IN ('confirmed','no_show')`.
- El enum real es `'confirmado'` (ver `db/schema/bookings.ts` bookingStatusEnum), NO `'confirmed'`.
- Efecto: el denominador solo cuenta `no_show` → **tasa de no-show siempre ~100% o 0**.
- `getSlotOccupancy` (`:646`) sí usa `'confirmado'` correctamente → es un typo aislado.

### 3. Ingresos suman monedas distintas

- `sumRevenue` (`:1001`), `getRevenueTrend` (`:800`), `getRevenueByMethod` (`:849`),
  `getRevenueByBranch` (`:901`) hacen `SUM(amount)` **sin agrupar por currency**.
- Vista owner (sin filtro de país, `scope.country=null`) → suma **ARS + EUR** en un número
  (ej: $16.000.000 ARS + €3.000 = "16.003.000").
- `getOutstandingByCurrency` (`:929`) SÍ separa por moneda y documenta
  "Currencies are NEVER summed across" — los helpers de revenue violan esa regla.

### 4. Trend de activos circular

- `getActiveMembersKpi` (`:183`): `priorCount = currentCount - newInPeriod + churnedInPeriod`.
- `newInPeriod` (`countNewMembers` `:269`) cuenta TODOS los `role='member'` creados en el
  período — incluye **freemium y prueba**, no solo activos. Mezcla cohortes → trend distorsionado.

## 🟠 Arquitectura

### 5. "Activo" definido en 3 lugares divergentes

- Canónico: `recomputeUserStatus` (`subscriptions/service.ts:4115`).
- Analytics: campo guardado `users.status`.
- `reports/service.ts`: su propia variante.
- Síntoma: la confusión 692 vs 749. **Centralizar** en un predicado/helper SQL compartido
  (p.ej. `shared/active-member.ts` o una vista). Decisión abierta: ¿además arreglar el drift
  de `users.status` con un cron diario, o que analytics deje de depender del campo y use el
  EXISTS en vivo? (tradeoff: consistencia del campo para otros consumidores vs costo del cron).

### 6. plan distribution no filtra archivados y agrupa por nombre no único

- `getPlanDistribution` (`:396`) no filtra `is_archived` → planes legacy contaminan
  (misma clase de bug que el `duration_days` corregido en migración `0127`).
- Agrupa por `subscription_plans.name`, que NO es único: "Flex" existe para AR (id 1) y
  ES (id 105) → en vista global se fusionan AR+ES. Agrupar por id o (name, country).

## 🟡 Code quality / tests

### 7. DRY — service monolítico

- `analytics/service.ts` = 1112 LOC en un solo service.
- ~15 repeticiones del bloque "armar conditions branchId/country + innerJoin branches".
- Patrón frágil repetido: `country !== undefined ? base.innerJoin(...)... : base...`.
- Contra el patrón facade del CLAUDE.md. Proponer split por dominio
  (Kpi / Member / Attendance / Finance) + helper `applyScope(query, filters)`.

### 8. Tests

- El bug `'confirmed'` sobrevivió → falta test de no-show rate con datos reales.
- Falta caso multi-moneda en los tests financieros (ARS + EUR juntos).
- CLAUDE.md exige tests de integración para rutas nuevas (`el-templo-api/test/`, MySQL real).

## 🟢 Performance (menor)

### 9. DATE() sobre columnas indexadas

- `DATE(checked_in_at)` (`:513`, `:1021`), `DATE(created_at)` (`:277`) anulan el uso de índice.
- Sin impacto hoy (3.681 checkins) pero escala mal. Evaluar rangos `>= dateFrom AND < dateTo+1`.

## ✨ Feature nueva — Miembros únicos en tab de Asistencias

- Agregar a la tab de **Asistencias** del admin (`el-templo-admin`) una métrica de
  **miembros únicos** en ventanas de **últimos 7 / 14 / 30 días**.
- Backend: extender `getAttendanceAnalytics` (`analytics/service.ts:109`) →
  `COUNT(DISTINCT member_id)` sobre `attendance` por ventana, respetando scope branch/country.
- Frontend: render en la tab de asistencias (admin).
- Nota de contexto: hoy hay sedes que NO registran check-in (ej. Chapadmalal: 20 de 22
  reservan y nadie pasa lista) → esta métrica también expone el problema operativo de
  adopción del check-in, no solo el engagement real.

## Alcance / restricciones

- Toca backend (`el-templo-api/src/modules/analytics`) y frontend (`el-templo-admin`).
- Tests de integración nuevos obligatorios.
- Flujo staging-first estricto. Cambios de datos prod vía migración (ya hay precedente: `0127`).
- Decisión de producto pendiente: ¿el "activo" canónico debe excluir o incluir los ~48 drift?
  (probablemente excluirlos = mostrar el número real).
