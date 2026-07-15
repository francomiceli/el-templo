# Phase 163: Máquina de estados automática del lead - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning
**Source:** Sesión con Franco (repaso punto por punto del brief `.docs/sp-auto/brief-fran-automatizacion-sesiones-prueba.md`) + 3 mapeos de codebase. Sustituye discuss-phase (corrida autónoma aprobada por Franco; ver `.planning/AUTONOMOUS-DECISIONS-v5.8.md`).

<domain>
## Phase Boundary

El estado del lead de sesión de prueba se mantiene solo: cron diario que vence En seguimiento → Perdido pasada la ventana X sin compra; X sembrado del p90 histórico y configurable en `system_settings`; reset Perdido → En seguimiento al agendar nueva SP; columna `lead_status_source` (auto/manual); backfill retroactivo de los ≈112 vencidos con backup + dry-run. NO incluye: cambios de UI del reporte (fase 164), teléfono obligatorio ni self-service (fase 165), campañas de recupero (out of scope del milestone).

</domain>

<decisions>
## Implementation Decisions

### Máquina de estados (D-01 a D-04) — LOCKED

- **D-01**: Ganado SIN ventana — el hook existente `recomputeUserStatus` (`el-templo-api/src/modules/subscriptions/service.ts:5607-5732`) ya marca `lead_status='ganado'` + `purchased_plan_id` + `converted_at` en la compra. NO se modifica esa semántica: cualquier compra marca Ganado, incluso si estaba Perdido (recuperado). X NO gatea el Ganado.
- **D-02**: Perdido lo vence un **cron diario nuevo** en `el-templo-api/src/jobs/` (misma infra node-cron que `mark-no-shows.ts` / `auto-approve.ts`; arranque desde `index.ts:34-40`). Regla: lead (`users.status='prueba'`) con `lead_status` En seguimiento (o NULL efectivo) y `converted_at IS NULL`, cuya **última booking `is_trial=1` no cancelada** tiene `booking_date` + X días < hoy → `lead_status='perdido'`. Aplica a asistió y no-asistió por igual (el campo Asistió NO toca el estado). Exponer también un `runXxx` invocable manualmente como hace `mark-no-shows.ts`.
- **D-03**: Reset Perdido → En seguimiento: al crear una nueva booking de prueba para un lead Perdido (admin `TrialService.bookTrial` y self-service `reserveTrialSelfService`, ambos en `el-templo-api/src/modules/scheduling/trials-service.ts`), setear `lead_status='en_seguimiento'` (source `auto`). La ventana corre sola desde la nueva sesión porque el cron mira la última booking no cancelada. OJO: el flujo self-service es "una prueba por vida" — el reset ahí aplica cuando gestión cancela la vieja y el lead reserva de nuevo, o vía bookTrial de admin; no cambiar la regla una-por-vida en esta fase.
- **D-04**: El cron NUNCA pisa un estado puesto a mano: si `lead_status_source='manual'`, el cron lo saltea. El PATCH manual (`el-templo-api/src/modules/members/leads-routes.ts` → `MemberService.updateLead` en `members/service.ts:1099`) setea `source='manual'`. El hook de compra y el reset de D-03 setean `auto` (el automatismo legítimo sí puede pisar — p.ej. Ganado por compra sobre un manual Perdido sigue funcionando como hoy).

### Ventana X (D-05, D-06) — LOCKED

- **D-05**: X vive en `system_settings` (tabla key-value existente, schema `el-templo-api/src/db/schema/system-settings.ts`), key `leads.perdido_window_days`, valor entero en días. El cron la lee en cada corrida; sin cache persistente.
- **D-06**: Seed por migración que **calcula el p90 dinámicamente** sobre los datos de la DB donde corre: para cada lead Ganado (`converted_at IS NOT NULL` + booking `is_trial=1` no cancelada), días entre la fecha de esa sesión y `MIN(subscriptions.created_at)` del user; p90 de esa distribución redondeado hacia arriba. Si hay menos de 20 casos usables → default 14 días. (Decisión autónoma #4: permite sembrar el valor real de prod sin acceso previo; el valor efectivo queda como ítem de verificación humana.) MySQL 8: p90 vía window functions (PERCENT_RANK/NTILE) o cálculo en el runner TS si el SQL puro se complica — elegir lo más simple y testeable.

### Columna source (D-07) — LOCKED

- **D-07**: `users.lead_status_source` ENUM('auto','manual') NULL (NULL = histórico/desconocido, se trata como `auto` para el cron salvo que se decida backfillear). Escrituras: hook de compra → 'auto'; cron → 'auto'; reset D-03 → 'auto'; `updateLead` PATCH → 'manual'; alta de lead (default en_seguimiento) → 'auto'.

### Backfill (D-08) — LOCKED

- **D-08**: Migración de backfill (misma migración o siguiente a la del schema): (1) crear tabla backup `users_lead_backup_XXXX` (patrón exacto de `0170_lead_purchased_plan_ganado.sql`); (2) aplicar la regla del cron retroactivamente a los En seguimiento con última sesión + X días vencida y sin compra → 'perdido' (source 'auto'). El dry-run contra prod es pendiente humano (script/query de conteo commiteado junto a la migración; ver AUTONOMOUS-DECISIONS #5). Conteos de referencia del brief (al 15/07): 211 Perdido / 136 En seguimiento / 105 Ganado sobre 452; ≈112 En seguimiento con fecha pasada deberían mover a Perdido.

### Claude's Discretion

- Nombre exacto del archivo del job y horario del cron (sugerido: corrida diaria de madrugada hora AR, patrón de `notification-cron.ts` con TZ America/Argentina/Buenos_Aires).
- Detalle de índices si la query del cron lo amerita (ya existen `idx_users_lead_status`).
- Estructura interna del servicio (función pura testeable + wrapper cron, como los jobs existentes).
- Cómo exponer el valor X para lectura (helper de settings existente si lo hay).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief y decisiones

- `.docs/sp-auto/brief-fran-automatizacion-sesiones-prueba.md` — brief de Nacho; puntos 2 (máquina de estados), 3 (ventana X), 6 (guardrails), 7 (backfill).
- `.planning/AUTONOMOUS-DECISIONS-v5.8.md` — decisiones de la corrida autónoma.

### Código existente sobre el que se monta

- `el-templo-api/src/db/schema/users.ts` — enum `lead_status` (líneas 75-79), `purchased_plan_id`, `converted_at`, `created_by`, índices.
- `el-templo-api/src/modules/subscriptions/service.ts` — `recomputeUserStatus` (5607-5732, hook de Ganado; orden LEFT-TO-RIGHT de MySQL comentado en 5627-5634 — NO romper).
- `el-templo-api/src/modules/scheduling/trials-service.ts` — `bookTrial` (~585), `reserveTrialSelfService` (~189), regla una-prueba-por-vida.
- `el-templo-api/src/modules/members/service.ts` — `updateLead` (1099, invariante ganado⇔plan 1149-1170) y alta de lead (~869, 1061).
- `el-templo-api/src/modules/members/leads-routes.ts` — PATCH /api/admin/leads/:userId.
- `el-templo-api/src/jobs/mark-no-shows.ts` y `auto-approve.ts` — patrón de cron a imitar (start + run invocable).
- `el-templo-api/src/index.ts` (34-40) — arranque de jobs.
- `el-templo-api/src/db/schema/system-settings.ts` — tabla key-value.
- `el-templo-api/src/db/migrations/0170_lead_purchased_plan_ganado.sql` — precedente exacto de backup + reclasificación de leads.

### Reglas de migraciones (OBLIGATORIO)

- Skill del repo `.claude/skills/el-templo-db-migrations/` — runner custom, numeración por archivo, nunca `;` en comentarios SQL, SQL commiteado junto al schema. Última aplicada **0180**; hay un `0181` en rama no ejecutada — verificar máximo real antes de numerar.

</canonical_refs>

<specifics>
## Specific Ideas

- El cron debe loguear (Pino) cuántos leads venció por corrida, y saltear los `source='manual'` con contador aparte.
- Tests de integración (patrón `el-templo-api/test/`, DB real `eltemplo_test`): vencimiento básico, no-vence dentro de ventana, no-pisa manual, reset al re-agendar, lee X de settings, p90/default del seed.
- La derivación "última booking is_trial no cancelada" ya existe como patrón en `ReportsService.getTrialSessionsReport` (`reports/service.ts:1475`) — reusar la semántica para que cron y reporte cuenten lo mismo.

</specifics>

<deferred>
## Deferred Ideas

- Exponer X en la UI de configuración del admin (AUTO-F1, future).
- Indicador auto/manual en el reporte → fase 164 (REPRO-03).
- Teléfono obligatorio y UAT self-service → fase 165.

</deferred>

---

_Phase: 163-m-quina-de-estados-autom-tica-del-lead_
_Context gathered: 2026-07-15 (sesión con Franco, corrida autónoma)_
