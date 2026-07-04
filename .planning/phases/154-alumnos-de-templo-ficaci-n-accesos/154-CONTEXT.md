# Phase 154: Alumnos (de-Templo-ficación + accesos) - Context

**Gathered:** 2026-07-04 (modo `--auto` — decisiones = opción recomendada, autorizado por el usuario)
**Status:** Ready for planning

<domain>
## Phase Boundary

De-Templo-ficación y accesos de la página de Alumnos del admin: "Crear alumno" como acción prominente (ALUM-01), "Registrar cobro" como acción directa en la fila junto al lápiz (ALUM-02), reglas de precio por medio de pago configurables con default sin recargo (ALUM-03), "Avatar" renombrado a concepto neutro conservando el mecanismo (ALUM-04), y niveles griegos gateados como superficie Templo (ALUM-05). Requirements: ALUM-01..05.

NO incluye: asistencia por QR desde la app del alumno (HOR-F1, out of scope del milestone), registro automático de entrenamientos, cambios al flujo interno del PoS de Cobros (fase 151), cambios de datos/DB para avatar o niveles (solo UI/gating), tenants.

**Arrastrado de fases previas (no re-decidir):** 149 D-04 seguridad real en la API + UI solo esconde; 149 nav: Alumnos es categoría libre (profe la ve); constraint SaaS sin Templo-ismos nuevos en core (los gates van en `templo-config.ts` / config, no hardcodeados en componentes); 151: el PoS es `/cobros` (CobrosPage.vue); migraciones a mano con el runner propio (`db:generate` roto), nunca `;` en comentarios SQL.

</domain>

<decisions>
## Implementation Decisions

### Crear alumno prominente (ALUM-01)

- **D-01: Botón primario grande "Crear alumno"** como LA acción principal del header de AlumnosPage (label completo, no-dense, color primary). "Nuevo en Prueba" y el export a Excel se degradan a acciones secundarias (menores visualmente). Reusa el flujo existente `showCreateDialog` → MemberFormDialog — sin flujo nuevo de alta.

### Registrar cobro desde la fila (ALUM-02)

- **D-02: Acción directa en la fila = ícono junto al lápiz que navega a `/cobros?memberId={id}`.** CobrosPage aprende a preseleccionar el socio desde el query param (hoy no lo soporta — `selectedMember` es estado interno). No se duplica el PoS ni se abre un dialog de cobro paralelo: DRY con el rediseño de la fase 151. La acción también satisface el pedido de Nacho de "no anidado dentro de la ficha".

### Reglas de precio por medio de pago → config (ALUM-03)

- **D-03: Toggle global en `system_settings`** (key-value store existente, `el-templo-api/src/db/schema/system-settings.ts`): una key tipo `pricing_by_payment_method` con default **off** = sin recargo (todos los medios usan `priceRegular`/`priceZero`; tarjeta deja de usar `priceCreditCard`). Migración de datos (INSERT idempotente) la deja **on** para la instalación El Templo — el comportamiento actual en prod no cambia.
- **D-04: El mecanismo per-plan se conserva:** las columnas `priceRegular`/`priceCreditCard`/`priceZero` de `subscription_plans` NO se tocan; la config solo gatea si `getBasePriceFor` (CobrosPage.vue:1255) aplica el precio de tarjeta. La API expone la setting (endpoint de config o incluida en payload existente de planes/config) para que el admin la consulte al calcular precio, y el backend que recalcula precio server-side (coach-load / PoS 148) respeta la misma regla — un solo punto de verdad, no duplicar la lógica en front y back con criterios distintos.
- **D-05: UI de la config en la categoría Configuración del admin, owner-only** (guard API + nav 149). PlanFormDialog esconde el campo de precio-tarjeta cuando la regla está off.

### Avatar → concepto neutro (ALUM-04)

- **D-06: "Avatar" se renombra a "Categoría"** (categoría de socio) en toda la UI del admin: columna de AlumnosPage, filtro (`avatarFilterOptions`, "Sin avatar"→"Sin categoría"), ficha del alumno y MemberFormDialog. **NO usar "Segmento"**: colisiona con el concepto existente `member_segment` (fase 136 — Prime/Digital/Fantasma) que ya aparece en filtros/analytics; dos "segmentos" distintos en la misma pantalla sería ambiguo. El mecanismo subyacente (`avatarType` en API/DB, valores actuales) queda intacto — rename de labels only.

### Niveles griegos gateados como Templo (ALUM-05)

- **D-07: Gating por superficie Templo vía `templo-config.ts`** (mismo patrón que el gating de Entrenamiento y los overrides de la fase 149): flag/constante de superficie que controla la columna "Nivel" (glyphs `greekLevel`), el filtro por nivel de AlumnosPage y la visibilidad en AlumnoDetailPage. Default white-label: ocultos; El Templo: visibles. `users.level` y toda la lógica de niveles quedan intactos (no se borra nada, consistente con NAV-04).
- **D-08: El gate es por superficie/instalación, NO por usuario** (no reusar `canAccessTraining`, que es un gate por-persona para Fran/owner). Es la misma naturaleza que el gateo de Campañas/Puntuaciones de 149.

### Claude's Discretion

- Naming exacto de la setting key y su shape (`'on'/'off'` vs boolean serializado) y del helper API que la expone.
- Ícono del botón de cobro en la fila (p.ej. `payments`/`attach_money`) y tooltip.
- Layout final del header de AlumnosPage (orden de botones secundarios).
- Cómo CobrosPage consume `?memberId=` (fetch del socio + prefill del paso correspondiente del flow multi-paso de 151) y qué pasa si el id no existe (toast + flujo normal).
- Si el gating de niveles esconde también la columna en el export Excel de Alumnos (recomendado: sí, consistencia).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — §Alumnos (líneas ~129-145): "Crear nuevo alumno como opción más grande", "el registro de pago tiene que tener un acceso directo... como el lápiz de acciones", "reglas de negocio [de precio tarjeta]... estandarizar para la marca blanca, quitarlas o dejar que el usuario pueda ponerlas", "estandarizaría niveles... quitaría el avatar".
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — mapa image22-28 → AlumnosPage/AlumnoDetailPage/PagosPage (`getBasePriceFor`, `greekLevel()`, `avatarType`).

### Superficie a modificar (admin)

- `el-templo-admin/src/pages/AlumnosPage.vue` — header (~20-45: botones Nuevo/Nuevo en Prueba/export), fila de acciones (~283: lápiz), columna avatar (~251-257, 554-556), filtro avatar (~148-149, 467-480), columna Nivel + `greekLevel()` (~245, 599-607), filtro de nivel (~442-447).
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — labels de avatar y nivel en la ficha.
- `el-templo-admin/src/components/MemberFormDialog.vue` — label del campo avatar.
- `el-templo-admin/src/pages/CobrosPage.vue` — `getBasePriceFor` (~1255) consulta la config (D-03/D-04); consumo de `?memberId=` (D-02).
- `el-templo-admin/src/components/PlanFormDialog.vue` — esconder campo precio-tarjeta cuando la regla está off (D-05).
- `el-templo-admin/src/config/templo-config.ts` — flag de superficie para niveles griegos (D-07/D-08); patrón de overrides Templo de 149.

### API y schema

- `el-templo-api/src/db/schema/system-settings.ts` — key-value store donde vive la setting de precios (D-03); patrón de uso existente (streaks).
- `el-templo-api/src/modules/coach/coach-load-routes.ts` (PoS 148) — recalcula precio server-side por medio de pago (tarjeta=priceCreditCard): debe respetar la misma config (D-04).
- `el-templo-api/src/db/schema/subscription-plans.ts` — `priceRegular`/`priceCreditCard`/`priceZero` se conservan (D-04).
- Migración de datos nueva (INSERT idempotente en `system_settings` para El Templo, D-03) — runner propio, numeración siguiente a la última en `el-templo-api/src/db/migrations/`.

### Contexto de fases previas

- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — patrón de gating de superficies Templo + D-04 seguridad en API.
- `.planning/phases/153-mejoras-de-deudas/153-CONTEXT.md` — decisiones frescas del hub de Deudas (los tabs conviven con las acciones de fila de Alumnos).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `MemberFormDialog` + `showCreateDialog` — flujo de alta existente para D-01.
- `CobrosPage.vue` (fase 151, pasos separados) con `selectedMember` — punto de prefill para D-02.
- `system_settings` (key-value con `settingKey` UNIQUE) — casa natural de la config D-03, ya usado por streaks.
- Patrón de overrides Templo en `templo-config.ts` (149) — base del gate de niveles (D-07).
- Patrón de migraciones idempotentes por key (INSERT ... ON DUPLICATE / WHERE NOT EXISTS) del tren v5.2/v5.3.

### Established Patterns

- **La seguridad real vive en la API** — la setting de precios se lee/escribe con guard owner-only server-side; PlanFormDialog/Configuración solo esconden.
- **Tests de integración obligatorios** para endpoints nuevos/modificados: setting CRUD + efecto de la regla en el recálculo server-side del precio (coach-load con regla on/off).
- **Tests NO se corren localmente** (CI); gates locales = `tsc --noEmit` (API) y `pnpm lint` (admin).
- **Sin `git add -A`**; archivos pre-existentes modificados del working tree no se tocan.

### Integration Points

- AlumnosPage header + fila de acciones.
- CobrosPage: query param + `getBasePriceFor` gateado por config.
- coach-load-routes (148): mismo gate de precio server-side.
- templo-config.ts: flag de superficie niveles.
- Configuración (nav 149): sección nueva owner-only para la regla de precios.

</code_context>

<specifics>
## Specific Ideas

- Nacho: "Crear nuevo alumno como opción más grande" (ítem 1), "acceso directo... como el lápiz de acciones" (ítem 2), "Necesito ver estas reglas de negocio porque las tenemos que estandarizar para la marca blanca, quitarlas o dejar que el usuario pueda ponerlas" (ítem 3 → D-03: el usuario puede ponerlas), "quitaría el avatar (o expliquenme cuál es la idea de eso)" (ítem 4 → se conserva el mecanismo con nombre neutro "Categoría", D-06).
- Nacho: "Yo estandarizaría niveles, como para poder hacerle un seguimiento con denominaciones sencillas" → los niveles griegos salen del default white-label (D-07); una estandarización de niveles neutra es idea futura, fuera de esta fase.

</specifics>

<deferred>
## Deferred Ideas

- **Sistema de niveles estandarizado white-label** (denominaciones sencillas para cualquier gimnasio) — Nacho lo sugiere; esta fase solo gatea los griegos como Templo. Sería fase/milestone futuro.
- **Asistencia por QR desde la app del alumno + registro automático de entrenamientos** — ya out of scope del milestone (HOR-F1).
- **Reglas de precio más ricas que on/off** (recargo % configurable por medio) — la fase entrega el toggle; recargos parametrizables quedan para tenancy/config avanzada.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — match 0.6 por keywords genéricas; NO incorporado por sexta vez (149-154): rollout de datos del sistema de entrenamiento v5.1, sin relación con la página de Alumnos. Se anota la desviación de la regla auto-fold (score ≥ 0.4) por falso positivo reiterado.

</deferred>

---

_Phase: 154-Alumnos (de-Templo-ficación + accesos)_
_Context gathered: 2026-07-04 via --auto (recommended options)_
