# Phase 142: Config + transición Contabilium - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

**La fase que CIERRA el milestone v5.2.** Dos entregables:

1. **MIG-01 — casa de config:** la **única perilla real** del módulo (el **umbral de pendientes**, seam de 141) tiene una casa funcional desde el admin, leída de `system_settings`, no cableada en código. Las otras perillas candidatas (validación todos/dudosos, activación instant/diferida) **se descartan** — quedan clavadas en su default correcto (validar todos, activar al instante), sin switch.
2. **MIG-02 — documento de transición Contabilium:** la regla escrita "qué dato manda" durante la convivencia (ingresos/caja en el Admin desde el corte; AFIP en Contabilium, fuera de scope) + el criterio de corte limpio + el mecanismo de carga de saldos de apertura por caja. La **fecha/estrategia de corte concreta la define Franco al go-live** (142 deja todo listo, sin fijarla).

**Depende de 137** (la perilla del umbral gobierna la alerta de pendientes). Última fase del milestone.

### En scope (142)

- **Backend config (MIG-01):** reusar `system_settings` (key-value global existente; la 136-07 borró el módulo `src/modules/settings/`, NO la tabla). Setting `finance.pending_overdue_days` (default 3). Patrón de lectura con fallback a default (espejo de `getStreakMilestoneConfig` en streaks/service.ts). Migración **0157** para seedear el setting. Endpoint get/set owner/admin.
- **Wire del seam de 141:** `OVERDUE_DAYS` (constante en finance/constants.ts) pasa a **leerse de `system_settings`** (fallback 3); el `/pending-tray` ya devuelve `thresholdDays`, ahora dinámico.
- **Mini pantalla "Configuración de Caja" (admin):** owner/admin, reusa `system_settings`; hoy un campo (umbral de pendientes), extensible. Reconstruye una superficie de settings mínima (la 136-07 borró el módulo viejo).
- **MIG-02 — documento de transición** (deliverable escrito, en `.docs/` o `.planning/`): regla "qué dato manda" + corte limpio + mecanismo de apertura. Incluye el **template de migración de saldos de apertura** por caja (a correr al go-live con los conteos reales de Franco; en 142 las cajas siguen en 0 / placeholder).
- Tests (config get/set + RBAC + el umbral dinámico afecta la alerta).

### Fuera de scope (142 / descartado)

- **Perilla de validación (todos/dudosos)** → DESCARTADA. Queda "validar todos" (137). "Solo dudosos" necesita reglas automáticas que son futuras; sin valor real hoy.
- **Perilla de activación (instant/diferida)** → DESCARTADA. Queda instantánea (137). Diferida sería mala UX (el socio no entrena hasta validar).
- **Pantalla de edición de saldos de apertura** → DESCARTADA como perilla. Los saldos se cargan **una sola vez por migración** al go-live, no por UI.
- **Reglas automáticas de "dudosos"** (montos fuera de rango, socio nuevo, efectivo alto) → futuras, fuera de v5.2.
- **Facturación electrónica AFIP/ARCA** → último escalón del reemplazo de Contabilium, fuera de todo el milestone.
- **Scoping por sucursal** de la config → no; el umbral es global (`system_settings` es global).

</domain>

<decisions>
## Implementation Decisions

### Perillas (solo el umbral)

- **D-01:** La **única perilla configurable** de 142 es el **umbral de pendientes** (a los cuántos días un pendiente dispara la alerta de la bandeja). Default **3** (heredado de 141). Las otras candidatas (validación, activación) **NO se construyen** — quedan clavadas en su comportamiento actual.
- **D-02 (validación):** queda **"validar todos"** (137, sin switch). "Solo dudosos" necesita reglas automáticas futuras → sin valor real hoy; no se construye el switch (sería scope especulativo, lección del cobro suelto).
- **D-03 (activación):** queda **instantánea** (137, sin switch). "Diferida" haría que el socio no entrene hasta que la admin valide → mala UX; no se construye.

### Casa de config

- **D-04:** **Reusar `system_settings`** (key-value global existente), NO una tabla `finance_settings` nueva. La 136-07 borró el módulo `src/modules/settings/`, no la tabla `system_settings` (la usan streaks/segmentation/finance). Setting `finance.pending_overdue_days`. Migración **0157** lo seedea (default 3). Lectura con fallback a default (espejo de `getStreakMilestoneConfig`).
- **D-05:** El seam de 141 (`OVERDUE_DAYS` en finance/constants.ts) pasa a **leer de `system_settings`** con 3 como fallback. El `/pending-tray` ya devuelve `thresholdDays`; ahora es dinámico, así la bandeja y el contador de la 141 respetan el valor configurado sin tocar la UI de 141.
- **D-06:** **Mini pantalla "Configuración de Caja"** dedicada en el admin (owner/admin gated), reusa `system_settings`. Hoy un solo campo (umbral), pero es "la casa" que pide MIG-01 — un lugar definido y extensible para las perillas del módulo. NO inline en el hub de Caja (evita config desparramada). Config global (no por sucursal).

### Transición Contabilium (MIG-02 — documento)

- **D-07:** Entregable = **documento escrito** de la regla de transición. Contenido: (a) **corte limpio** — desde la fecha de go-live el registro de **ingresos y caja vive SOLO en el Administrador**; antes = Contabilium; (b) **qué dato manda en la convivencia**: Admin = ingresos+caja (fuente de verdad desde el corte), **Contabilium = solo facturación AFIP** (fuera de scope, último escalón); (c) criterio de corte limpio: las cajas arrancan en su **saldo de apertura** (conteo físico), **sin backfill histórico** (138 D-05/D-06 ya lo implementó); (d) el mecanismo de carga de aperturas.
- **D-08:** La **fecha/estrategia de corte concreta la define Franco al go-live** — 142 NO la fija. Recomendación documentada: **corte limpio único** (todas las sucursales el mismo día) por nitidez, pero queda a criterio de Franco (puede ser escalonado).
- **D-09:** **Saldos de apertura por migración, no por UI.** 142 deja el **template/mecanismo de migración** listo; al go-live se corre con los conteos físicos reales que pase Franco (regla del proyecto: datos de prod por migración). En 142 las cajas siguen en 0/placeholder.

### Claude's Discretion

- Estructura exacta del setting (`finance.pending_overdue_days` como int en text) y el helper de lectura con fallback.
- Si el documento MIG-02 vive en `.docs/modulo-contable/` o `.planning/` (deliverable, no código).
- REST shape del endpoint de config (get/set) + el composable/pantalla Quasar (reusa componentes existentes; mini formulario).
- Si la mini pantalla de config necesita un UI-SPEC formal o alcanza con el patrón de formularios existente (es un solo campo numérico — probablemente mínimo).
- Forma del template de migración de aperturas (script comentado / migración placeholder a completar al go-live).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone

- `BRIEF-MODULO-CONTABLE-FRANCO.md` — sección 5 (perillas como config) + la transición Contabilium (reemplazo progresivo, AFIP último).
- `.planning/research/modulo-contable/ARCHITECTURE.md` § "Perillas (sección 5 del brief) como configuración" + el reemplazo de Contabilium.

### Fases previas

- `.planning/phases/137-.../137-SUMMARY.md` — validación todos + activación instantánea (los defaults que quedan clavados).
- `.planning/phases/138-.../138-SUMMARY.md` — `opening_balance`/`cutoff_date` por caja (las aperturas que MIG-02 carga); 138 D-05/D-06 (corte limpio, sin backfill histórico).
- `.planning/phases/141-.../141-SUMMARY.md` — el seam `OVERDUE_DAYS`/`thresholdDays` que 142 vuelve dinámico.

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 142 (MIG-01, MIG-02).
- `.planning/REQUIREMENTS.md` — MIG-01, MIG-02.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/db/schema/system-settings.ts` — la tabla `system_settings` (key-value global, `settingKey` unique + `settingValue` text). La casa de config reusa esto, sin tabla nueva.
- `el-templo-api/src/modules/streaks/service.ts` `getStreakMilestoneConfig()` (~270) — **el patrón a espejar**: lee N settings de `system_settings` con fallback a defaults. El umbral usa el mismo patrón.
- `el-templo-api/src/modules/finance/constants.ts` `OVERDUE_DAYS=3` (141) — pasa a leerse de `system_settings` con 3 como fallback. El comentario ya anota "la 142 lo reconstruye".
- `el-templo-api/src/modules/finance/routes.ts` `/pending-tray` — ya devuelve `thresholdDays`; ahora dinámico desde config.
- `el-templo-admin` — patrón de formularios/composables existente para la mini pantalla de config (Pinia + composable cleanup(), sin onUnmounted; createLogger; paleta cálida).
- `.planning/phases/138-.../138-SUMMARY.md` — `cash_registers.opening_balance`/`cutoff_date` (el target de la migración de aperturas de MIG-02).

### Established Patterns

- **Settings con fallback** (streaks): leer de `system_settings`, default si ausente — sin romper si el setting no existe.
- **Datos de prod por migración** (regla del proyecto): las aperturas reales se cargan por migración al go-live, no por seed re-run ni UI.
- **RBAC** (permissions.ts): config = owner/admin; el coach no.
- **isCajaRole** gatea la superficie de caja/config.

### Integration Points

- **El umbral dinámico** afecta la alerta de la bandeja (141) sin tocar su UI — solo cambia de dónde sale `thresholdDays`.
- **Migración 0157** seedea el setting (default 3) — aditiva, sin `;` en comentarios SQL, hand-written si `db:generate` choca con el drift `sessions.goal_plan_type`.
- **MIG-02 doc** referencia 138 (opening_balance/cutoff_date) — el mecanismo de apertura escribe ahí.

</code_context>

<specifics>
## Specific Ideas

- **Cuidar el scope (lección cobro suelto):** de 4 perillas candidatas del brief, solo el **umbral** es real. Validación/activación se descartan (los defaults clavados son lo correcto).
- Reusar `system_settings` (no inventar tabla); patrón de `getStreakMilestoneConfig`.
- MIG-02 = **documento** + mecanismo de apertura; la **fecha de corte la define Franco al go-live**.
- Recomendación de corte: **único limpio** (todas el mismo día), pero a criterio de Franco.

</specifics>

<deferred>
## Deferred Ideas

- **Perilla de validación (todos/dudosos)** + reglas automáticas de "dudosos" → futuro, fuera de v5.2.
- **Perilla de activación (instant/diferida)** → descartada (instantánea es lo correcto).
- **Pantalla de edición de aperturas** → no (migración al go-live).
- **Scoping por sucursal de la config** → no (global).
- **Facturación AFIP/ARCA** → último escalón del reemplazo de Contabilium, fuera del milestone.

</deferred>

---

_Phase: 142-Config + transición Contabilium_
_Context gathered: 2026-06-24_
