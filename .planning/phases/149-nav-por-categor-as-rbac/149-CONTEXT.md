# Phase 149: Nav por categorías + RBAC - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

El nav plano del admin (`el-templo-admin/src/router/routes.ts` + `layouts/AdminLayout.vue`) se agrupa en categorías **Finanzas / Alumnos / Horarios / Planes** con visibilidad por rol de 2 niveles (dueño vs empleado), gating consistente frontend + API, y las features Templo (Campañas, Profes/Puntuaciones, landing, Entrenamiento) gateadas fuera del nav MVP sin borrarlas. Requirements: NAV-01, NAV-02, NAV-03, NAV-04. NO incluye: rediseño de pantallas internas (fases 150-156), tenants, ni correcciones de Analíticas.

</domain>

<decisions>
## Implementation Decisions

### Mapeo de roles negocio→enum (RBAC)

- **D-01: 2 niveles estrictos como default white-label.** Dueño = `owner` + `admin` (ven todo el MVP). Empleado = `coach` + `gestion` + `recepcion` (ven: Cobros/Pagos, Planes read-only, Alumnos, Horarios).
- **D-02: Excepción Templo — gestion.** En El Templo, gestion **además** ve Reportes y Deudas. Esta excepción NO es core: se expresa vía el mecanismo de overrides Templo (D-06).
- **D-03: Excepción Templo — coach y Deudas.** Core white-label: Deudas es dueño-only. En El Templo, **todos los coaches** ven el tab Deudas simplificado (excepción por tenant/deployment, NO por persona — distinto de `canAccessTraining` que gatea por email). El aviso de deuda en la PoS (v5.3) es core y no cambia.
- **D-04: Gating frontend + API consistentes.** Donde un rol pierde acceso en el nav, el guard de la API se ajusta igual (p.ej. si gestion-core pierde Reportes, la ruta API refleja el nuevo set incluyendo la excepción Templo). Sin puertas traseras: la seguridad real vive en la API (patrón fase 142).
- **D-05: Verificar usuarios reales antes de shippear.** Antes de aplicar el downgrade de gestion, verificar qué usuarios tienen rol `gestion`/`recepcion` en prod (impacto operativo real).

### Mecanismo de gateo Templo

- **D-06: Config central en código.** Un solo lugar por app que declara features Templo activas y overrides RBAC: p.ej. `templo-config.ts` en el admin + extensión de `shared/permissions.ts` en la API. Explícito, sin infra nueva; cuando llegue la tenancy se convierte en config por tenant (patrón `.docs/saas-multitenancy/04-mecanismo-modulos.md`).
- **D-07: Sección "Templo" al final del drawer.** Campañas, Profes/Puntuaciones, Blog, Gladius, Academy, App Waitlist, Labs, Franquicias van a una sección propia al final, visible solo con el gate Templo + el rol que corresponda a cada item (hoy owner/admin). Todo sigue navegable como hoy.
- **D-08: Entrenamiento se muda a la sección Templo.** Sesiones/Programador/Ejercicios/Árbol dejan de ser la primera sección y pasan a la sección Templo, manteniendo `canAccessTraining()` (gate por email a Fran Scaine) intacto. El nav MVP queda 100% white-label.

### Planes read-only para el empleado

- **D-09: Misma PlanesPage condicionada por rol.** Sin página nueva: la PlanesPage actual oculta crear/editar/archivar y dialogs de edición para el empleado. Una sola fuente de verdad visual.
- **D-10: Alcance de lectura = planes de pago + promos vigentes** (qué incluye + precios, lo que el profe necesita en mostrador). Programas (rutinas) NO se le muestra al empleado — es superficie de entrenamiento que la fase 156 gateará como Templo.
- **D-11: Cerrar la escritura en la API.** Hallazgo: hoy el módulo subscriptions tiene un único guard module-wide (`SUBSCRIPTION_ROLES` = los 5 roles staff) y los POST/PUT/PATCH de plans/promo-plans NO tienen guard extra — un coach puede escribir planes por API. Esta fase agrega guards de escritura dueño-only (admin/owner) en el CRUD de plans y promo-plans, dejando los GET abiertos a staff.

### Estructura visual del nav

- **D-12: Headers + items planos, como hoy.** Mismo patrón actual del drawer (`q-item-label header` + items), re-agrupado en las 4 categorías MVP + sección Configuración + sección Templo. Sin componentes nuevos de expansión.
- **D-13: Huérfanos.** Notificaciones y Usuarios van a una sección **"Configuración"** al final del drawer (con sus roles actuales: admin/owner y owner). **ConfiguracionCajaPage se elimina por completo** — página, entrada de nav y el setting "Umbral de pendientes (días)" (queda el default hardcodeado). Decisión explícita del usuario: la perilla de fase 142 se borra.
- **D-14: Landing por rol.** `/` redirige según rol: empleado → Cobros/Pagos (su PoS); dueño → Alumnos. Fran Scaine (training coach) sigue cayendo en Sesiones vía `canAccessTraining`.
- **D-15: Programas queda dentro de la categoría Planes, dueño-only.** El empleado no lo ve. La fase 156 decide su destino final (subcategoría Templo).

### Claude's Discretion

- Naming exacto de la sección Templo del drawer (p.ej. "El Templo" / "Marketing") y de la sección "Configuración".
- Íconos y orden interno de items dentro de cada categoría.
- Detalle de implementación de la redirección por rol (guard del router vs redirect dinámico).
- Cómo estructurar internamente `templo-config.ts` / la extensión de permissions (mientras cumpla D-06: un solo lugar por app, explícito).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — doc crudo de Nacho; §1 define las categorías del nav y el RBAC dueño/empleado.
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — análisis bajo lente SaaS; §1 (re-estructuración global y RBAC), §2 (mapa imagen→pantalla→código), §5 (riesgo RBAC vs enum actual).
- `.docs/saas-multitenancy/README.md` §0 — decisión de secuencia (reforma primero, tenancy después).
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — patrón de módulos/config al que el gate Templo (D-06) debe converger; regla de dirección de imports módulo→core.

### Código base del RBAC actual

- `el-templo-api/src/modules/shared/permissions.ts` — registro central de roles (ALL_STAFF_ROLES, ADMIN_ROLES, SUBSCRIPTION_ROLES, COACH_DEBTS_ROLES, `canAccessTraining` + TRAINING_EXCLUSIVE_COACH_EMAIL). Los nuevos sets dueño/empleado y overrides Templo viven acá.
- `el-templo-admin/src/router/routes.ts` — nav plano actual con `meta.allowedRoles` por ruta.
- `el-templo-admin/src/layouts/AdminLayout.vue` — drawer actual (4 secciones planas) + 7 computed de visibilidad ad-hoc (líneas ~228-259) que esta fase reemplaza/reagrupa.
- `el-templo-admin/src/types/admin.ts` — tipo `AdminRole` + RouteMeta (`allowedRoles`, `trainingOnly`).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `canAccessTraining()` (API `shared/permissions.ts` + espejo en admin `utils/trainingAccess.ts`): patrón existente de gate Templo-específico; se conserva intacto y Entrenamiento se muda de sección (D-08).
- `meta.allowedRoles` + router guard existente: mecanismo de gating por ruta ya cableado — la fase re-declara los sets, no inventa guard nuevo.
- Sets de roles centralizados en `shared/permissions.ts` (fase 66): la extensión dueño/empleado + overrides Templo entra en el mismo archivo (API) y su equivalente en el admin.

### Established Patterns

- **"La seguridad real vive en la API"** (comentario fase 142 en routes.ts): el nav esconde, la API bloquea. D-04 lo vuelve regla de la fase.
- **Duplicación conocida a resolver**: los computed de visibilidad de `AdminLayout.vue` duplican los `allowedRoles` de `routes.ts` (comentarios "keep in sync"). La re-estructuración es la oportunidad de derivar la visibilidad del drawer desde una única definición (categorías + roles) en vez de 7 computed sueltos.
- Constraint SaaS transversal (ROADMAP v5.4): motor vs plantilla, sin nuevos Templo-ismos en core — los overrides Templo van marcados y centralizados (D-06), nunca inline en páginas.

### Integration Points

- `el-templo-api/src/modules/subscriptions/routes.ts` — guard module-wide `SUBSCRIPTION_ROLES`; acá se agregan los guards de escritura dueño-only del CRUD de plans/promo-plans (D-11).
- Rutas API de Reportes/Deudas/Caja/Analíticas — ajustar sets de roles según D-01/D-02/D-03 (con overrides Templo).
- `PlanesPage.vue` — condicionales de edición por rol (D-09/D-10).
- Redirect raíz `'/' → /sessions` en routes.ts — reemplazar por landing por rol (D-14).
- `ConfiguracionCajaPage.vue` + su ruta + entrada de drawer + el setting de umbral de pendientes (API) — eliminación completa (D-13).

</code_context>

<specifics>
## Specific Ideas

- El drawer mantiene el patrón visual actual (headers + items planos) — el usuario descartó explícitamente categorías expandibles y submenús.
- Las excepciones Templo de RBAC (gestion→Reportes+Deudas, coach→Deudas simplificado) son la primera aplicación del principio de Nacho "lo Templo se dibuja encima": el core define 2 niveles limpios y El Templo los extiende vía config central.

</specifics>

<deferred>
## Deferred Ideas

- **Destino final de Programas (rutinas)** — subcategoría Templo gateada: se decide en la **fase 156** (en 149 queda dentro de Planes, dueño-only).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — poblar `milestone_exercise_id`) — revisado y NO incorporado: es un rollout de datos del sistema de entrenamiento v5.1, sin relación con nav/RBAC (match débil por keywords genéricas).

</deferred>

---

_Phase: 149-Nav por categorías + RBAC_
_Context gathered: 2026-07-02_
