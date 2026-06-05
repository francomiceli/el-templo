# Phase 130: Asignación, graduación y selector de Kairos - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous synthesis (overnight run) from ROADMAP §Phase 130 + codebase scout. Open decisions resolved by Claude.

<domain>
## Phase Boundary

Todo alumno nuevo **arranca en Kairos** y avanza a Alfa **automáticamente** (umbral configurable de sesiones completadas) **o por salto manual del coach** (que anula la graduación automática y no se vuelve a degradar). El nivel Kairos se ve en los **selectores de app y admin** (6º recuadrito) sin romper el layout. Cubre **KAIROS-04, KAIROS-05, KAIROS-06, KAIROS-07**. Depende de 129 (el nivel ya existe y genera sesiones).

**NO incluye:** la capa de generación Kairos (129, ya hecha); ajuste in-session (131). 130 es asignación + graduación + visibilidad del selector.
</domain>

<decisions>
## Implementation Decisions

### Default Kairos (KAIROS-04)

- **D-01:** Cambiar el default de `users.level` de `alfa` a `kairos`: en el schema (`users.ts:99` `levelEnum.default("alfa")` → `.default("kairos")`) **y** en una migración hand-written (`ALTER TABLE users MODIFY level ENUM('kairos','alfa','delta','sigma','omega','spartan') NOT NULL DEFAULT 'kairos'`) — próximo número libre (~0141; confirmar; 0140 fue 129). **Aditiva, NO toca filas existentes** (los alumnos actuales conservan su nivel). Actualizar TODOS los puntos que hardcodean el nivel inicial de un alumno nuevo a `"alfa"` → `"kairos"` (scout: `auth/routes.ts:177`, `members/service.ts:643`/`:752`, y los que el planner encuentre). Coordinar con los flujos de registro/onboarding/trial. NO cambiar el nivel de miembros existentes.

### Graduación automática (KAIROS-05)

- **D-02:** Un alumno **kairos** gradúa **automáticamente a alfa** al alcanzar un **umbral configurable de sesiones completadas**. Umbral por defecto: **12** sesiones completadas (≈1 mes a 3×/sem), expuesto como constante/config editable (NO hardcode disperso). Sólo promueve kairos→alfa (una vía, nunca degrada). Disparo **event-driven al completar una sesión** (al registrarse una completed-session, si el alumno es kairos y no tiene override y su conteo de completadas ≥ umbral → set level=alfa). Preferir esto a un cron nuevo; si ya existe un batch nightly relevante, el planner puede reusarlo, pero el camino simple es al completar sesión.

### Salto manual del coach (KAIROS-06)

- **D-03:** El coach puede **saltar manualmente** a un alumno a cualquier nivel; ese salto **anula la graduación automática** y **no debe volver a degradar/cambiar** por el automático. Implementación: nueva columna booleana **`level_override`** en `users` (migración, default `false`). Cuando un coach cambia el nivel manualmente, se setea `level_override=true`. La graduación automática **SALTA** a los alumnos con `level_override=true`. (Combinar con la migración de D-01 en un único `ALTER`/`ADD COLUMN` 0141, o dos statements en el mismo archivo.) El endpoint admin de cambio de nivel ya existe (el planner lo localiza) — extenderlo para setear el flag.

### Selector 6º recuadrito (KAIROS-07)

- **D-04:** El selector de nivel muestra el **6º recuadrito (Kairos)** en **app** y **admin** sin romper el layout (scroll/paginado/wrap donde haga falta). Kairos va **primero** (orden kairos→alfa→…→spartan). Reusar los componentes de selector existentes + tokens de marca cálidos (sin azul). El planner localiza los selectores reales (app: cerca de `useLevelSelectionStorage.ts`; admin: cerca de `constants/levels.ts`).

### Invariante crítico (brownfield)

- **D-05:** El cambio de default + graduación **NO debe alterar a los alumnos existentes** ni romper registro/login/onboarding/trial. La migración es aditiva (default + columna nueva). Regression: un alumno existente alfa+ sigue igual; un alumno nuevo nace kairos; un kairos con override no gradúa; un kairos sin override gradúa a alfa al cruzar el umbral.

### Claude's Discretion

- Umbral exacto (default 12, configurable) y dónde vive la config (constante en código vs tabla config existente).
- Punto exacto del disparo de graduación (hook al crear completed-session vs servicio dedicado).
- Tipo/labels del recuadrito Kairos en cada selector (griego/medallón como los otros niveles).
- Si `level_override` se llama así o reusa un patrón existente (preferir explícito).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Default + migración (KAIROS-04)

- `el-templo-api/src/db/schema/users.ts` — `levelEnum.default("alfa")` (l.99) → `.default("kairos")`; agregar `level_override` boolean.
- `el-templo-api/src/modules/auth/routes.ts` (~l.177 `level: "alfa"`) y `el-templo-api/src/modules/members/service.ts` (~l.643, ~l.752 `level: "alfa"`) — puntos de creación de alumno nuevo.
- `el-templo-api/src/db/migrations/` — última 0140; próxima ~0141 (hand-written, sin `;` en comentarios, commitear junto al schema). **Lección drift enum:** el `ALTER` del enum debe listar los MISMOS valores/orden que el schema TS; `level_override` columna nueva no es enum.

### Graduación + salto manual (KAIROS-05/06)

- `el-templo-api/src/db/schema/completed-sessions.ts` — conteo de sesiones completadas por miembro.
- El endpoint/servicio admin de cambio de nivel de un alumno (el planner lo localiza en `admin/` o `members/`) — extender para `level_override`.
- `el-templo-api/src/modules/members/service.ts` — servicios de miembro.

### Selector (KAIROS-07)

- `el-templo-app/src/composables/useLevelSelectionStorage.ts` + el componente de selector de nivel de la app (el planner lo localiza).
- `el-templo-admin/src/constants/levels.ts` (`LEVEL_ORDER`) + el selector de nivel del admin.

### Convenciones

- `CLAUDE.md` §Database (runner custom, `pnpm db:migrate`, nunca drizzle-kit migrate, sin `;` en comentarios), §API tests (CI), §Frontend Quasar/Vue/Pinia, §sin `any`, §Logging.
- Marca cálida sin azul.
  </canonical_refs>

<specifics>
## Specific Ideas
- Cambiar el default afecta TODO registro nuevo — el planner debe cubrir registro/onboarding/trial (no dejar un path que siga forzando alfa).
- La graduación es one-way (kairos→alfa) + el override del coach es sticky (no se revierte). Tests explícitos de ambos.
</specifics>

<deferred>
## Deferred Ideas
- Ajuste in-session / registro dominado (131).
- Graduaciones más allá de kairos→alfa (resto de niveles sigue siendo criterio del coach).
- Notificaciones/celebración de graduación (fuera de alcance).
</deferred>

---

_Phase: 130-Asignación, graduación y selector de Kairos_
_Context gathered: 2026-06-05 (autonomous)_
