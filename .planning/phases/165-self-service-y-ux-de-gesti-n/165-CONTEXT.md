# Phase 165: Self-service y UX de gestión - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Source:** Sesión con Franco (brief `.docs/sp-auto/`, pedido explícito de autogestión de SP para freemium + mejoras de gestión) + mapeos de codebase. Sustituye discuss-phase (corrida autónoma; ver `.planning/AUTONOMOUS-DECISIONS-v5.8.md`).

<domain>
## Phase Boundary

El flujo self-service freemium→prueba EXISTENTE (Phase 119: elegibilidad + reserva + promoción atómica, ya en prod sin UAT) queda verificado end-to-end por tests de integración y corregido donde falle; toda reserva de sesión de prueba pasa a exigir teléfono del lead (alta admin + self-service con captura en el diálogo de la app); y gestión gana dos mejoras evidentes para el recupero/conversión: teléfono+WhatsApp en el reporte de SP y acceso directo a la ficha del lead para convertirlo. NO incluye: campañas de recupero automatizadas, cambios a la regla una-prueba-por-vida, rediseños de flujo que requieran relevamiento con Nacho (quedan documentados como pendiente).

</domain>

<decisions>
## Implementation Decisions

### SELF-01 — Verificación E2E del flujo existente (D-01) — LOCKED

- **D-01**: Test de integración E2E a nivel API que recorre el funnel completo: `POST /register` (queda freemium) → `GET /members/scheduling/trial-eligibility` (elegible) → `POST /members/scheduling/reserve-trial` (promueve freemium→prueba, booking `is_trial=1` `source='self_service'`, lead_status en_seguimiento source auto — cableado por 163) → el lead aparece en `GET /api/admin/reports/trial-sessions`. Más los negativos clave: con sub activa NO elegible; segunda prueba NO permitida (una por vida); cancelación self-service revierte prueba→freemium. Lo que falle en el recorrido se CORRIGE en esta fase (ese es el punto de SELF-01). La UAT visual (app real en staging/prod) queda como human verification.

### SELF-02 / SELF-03 — Teléfono obligatorio (D-02 a D-05) — LOCKED

- **D-02**: Alta admin de lead de prueba: `phone` pasa a requerido (no vacío) en los schemas/validación de los caminos que crean un user `status='prueba'` (`POST /api/admin/members` en modo prueba / `createTrialMember`, y `convert-to-trial` si el user no tiene teléfono) y en `TrialMemberFormDialog.vue` (campo required con regla). Mensaje accionable en español.
- **D-03**: `bookTrial` (agendar SP a un lead existente desde el admin): si el member no tiene `phone` → 409 tipado con mensaje accionable ("Cargale el teléfono al lead antes de agendar la prueba" o similar). El error se muestra con el patrón extract-error existente del admin. La REPROGRAMACIÓN (164) queda exenta (la booking ya existía).
- **D-04**: `reserveTrialSelfService`: acepta `phone` opcional en el body; si el user no tiene `phone` y no viene en el body → 400/409 tipado `PHONE_REQUIRED`; si viene, se persiste en `users.phone` (trim, validación mínima de formato laxa — no inventar validador estricto) dentro de la misma operación y se continúa. `getTrialEligibility` expone `phoneRequired: boolean` (true si el perfil no tiene teléfono) para que la app sepa pedirlo de antemano.
- **D-05**: App member (`ReservasPage.vue`, diálogo de confirmación de reserva de prueba): si `phoneRequired`, input de teléfono requerido en el diálogo (tel keyboard, validación no-vacío) que viaja en el body del reserve. El REGISTRO no cambia (el teléfono se pide recién al reservar la prueba — cero fricción extra en signup).

### SELF-04 — Mejoras de gestión evidentes (D-06, D-07) — LOCKED

- **D-06**: Reporte de Sesiones de Prueba: columna "Teléfono" con link WhatsApp (patrón wa.me ya usado en `SesionesDePruebaDialog.vue`) — insumo directo del recupero de Perdidos segmentado por Asistió (brief punto 2). Incluir el teléfono también en el export CSV.
- **D-07**: Reporte de Sesiones de Prueba: acción por fila "Ver ficha" que navega a `alumnos/:userId` (ficha del lead, donde ya vive la edición de estado y la asignación de plan) — reduce los clics del camino convertir/gestionar. Sin construir pantallas nuevas.
- Todo lo demás del rubro "mejorar la experiencia de gestión" que requiera relevar fricciones reales con Nacho queda explícitamente FUERA y documentado en el HUMAN-UAT / pendientes del milestone.

### Claude's Discretion

- Forma exacta de los códigos de error tipados (seguir `PASS_REQUIRED`/`COVERAGE_EXPIRED` de booking-service) y de los schemas AJV.
- Si `phoneRequired` va como campo nuevo en la respuesta de eligibility o endpoint aparte (preferir campo en eligibility).
- Detalles del input de teléfono en la app (máscara, prefijo) — seguir patrones existentes del perfil si los hay.
- Estructura de los tests (helpers de 163/164; fecha LOCAL no UTC).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Flujo self-service existente (Phase 119)
- `el-templo-api/src/modules/scheduling/trials-service.ts` — `reserveTrialSelfService` (~189-356), `cancelTrialSelfService` (~498), `getTrialEligibility` (~371-465), `bookTrial` (~585+), reglas: una-prueba-por-vida, sede física, BLOCKING_SUBSCRIPTION_STATUSES (~50).
- `el-templo-api/src/modules/scheduling/routes.ts` — rutas member `POST /reserve-trial` (~856), `POST /cancel-trial` (~876), `GET /trial-eligibility` (~892); rutas admin trials.
- `el-templo-api/src/modules/auth/routes.ts` — `POST /register` (~47, status freemium ~194) y `auth/schemas.ts` (phone opcional hoy).
- `el-templo-app/src/pages/ReservasPage.vue` — modo prueba (~72-250), `confirmTrialReserve()` (~1495), `loadTrialEligibility()` (~1621), diálogo de confirmación.
- `el-templo-app/src/composables/useSchedulingApi.ts` — `reserveTrial`, `getTrialEligibility`.
- `el-templo-api/src/modules/members/service.ts` — `createTrialMember` (~869/916 zona), `convertToTrial` (~1061), `updateLead` (~1099).
- `el-templo-admin/src/components/TrialMemberFormDialog.vue` — alta de lead modo prueba.
- `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` — patrón wa.me existente.
- `el-templo-api/src/modules/reports/service.ts` — `getTrialSessionsReport` (~1475) + export (columnas post-164).
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue` — tabla del reporte (post-164).
- Tests existentes: `el-templo-api/test/scheduling-reserve-trial.test.ts`, `scheduling-cancel-trial.test.ts`, `scheduling-trial-eligibility.test.ts`, `convert-freemium-to-trial.test.ts`, `reports-trial-sessions.test.ts`, `test/scheduling/reschedule-trial.test.ts` (164).

### Reglas del repo (OBLIGATORIO)
- Fase 163/164 SUMMARYs (reset de estado, source, reporte extendido). Test-date helper con fecha LOCAL (CURDATE es ART).
- Gate admin/app: `vue-tsc` NO está instalado en el-templo-admin (usar eslint como gate; NO instalar deps). En el-templo-app verificar si `vue-tsc` existe antes de usarlo; si no, eslint.
- Sin migraciones esperadas (phone ya existe en users). Si apareciera una, verificar numeración.

</canonical_refs>

<specifics>
## Specific Ideas

- El E2E de SELF-01 es también el test de regresión del milestone completo: valida que 163 (reset/source) y el funnel 119 conviven.
- El mensaje de error de teléfono en admin debe decir QUÉ hacer (ir a la ficha y cargar el teléfono).
- Los leads viejos sin teléfono seguirán existiendo — el reporte simplemente muestra la celda vacía (sin link) y el bookTrial los rechaza hasta que se les cargue (comportamiento decidido: el teléfono es condición para agendar nueva SP, no retroactivo).
- `el-templo-app` necesita `pnpm install --frozen-lockfile` en el worktree antes de sus gates (ya hecho para api y admin).

</specifics>

<deferred>
## Deferred Ideas

- Relevamiento de fricciones reales de gestión con Nacho (programar SP, convertir) — pendiente humano del milestone; lo que salga alimenta una fase futura.
- Validación estricta de formato de teléfono / normalización E.164 — fuera de scope (formato laxo).
- Exponer X en la UI de configuración (AUTO-F1, future).

</deferred>

---

*Phase: 165-self-service-y-ux-de-gesti-n*
*Context gathered: 2026-07-16 (sesión con Franco, corrida autónoma)*
