# Phase 158: Visibilidad y comunicación - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

La capa de VISIBILIDAD del sistema de referidos (v5.5): el socio ve el estado
de sus vínculos y el descuento vigente, es avisado cuando un vínculo se
activa, y gestión consulta los referidos desde la ficha del alumno.

**Solo lee y comunica lo que la fase 157 produjo** (tablas `referrals` /
`referral_credits`, `users.referralCode` / `referredBy`,
`ReferralService.computeReferralDiscountPercent`, config 10%/tope 40%).
**NO altera la mecánica** de atribución, cualificación ni cómputo del
descuento.

Requirements del roadmap: VIS-01 (pantalla "Mis referidos"), VIS-02
(notificación de activación; la de "por caerse" se difiere), VIS-03 (admin —
resuelto como sección en ficha, dashboard global diferido).
</domain>

<decisions>
## Implementation Decisions

Las 4 áreas se resolvieron con recomendaciones de Claude aprobadas en bloque
por Franco (2026-07-11).

### Pantalla "Mis referidos" (app) — VIS-01

- **D-26 (Ubicación):** entrada desde `ProfilePage` → página propia
  `MisReferidosPage`. NO es tab principal de navegación.
- **D-27 (Estructura, de arriba hacia abajo):**
  1. **Tu código + botón Compartir** — share nativo (Capacitor) con el link
     `?ref=CODE`. Esta pantalla ES la herramienta de difusión del código
     (hoy el código de 157 no tiene ninguna UI).
  2. **Descuento vigente:** "Estás pagando X% menos" con desglose explícito
     (N vínculos activos × 10%, tope 40% — leer los valores de config, no
     hardcodear).
  3. **Lista de vínculos** con nombre completo y estado.
- **D-28 (Estados por vínculo, wording usuario):** `Pendiente` (se registró,
  todavía no pagó su primer plan) / `Activo` (descontando) / `Suspendido`
  (la otra parte está vencida; aclarar "se reactiva si vuelve"). Mapeo:
  `pending` → Pendiente; `qualified` + contraparte cubierta → Activo;
  `qualified` + contraparte vencida → Suspendido (estado DERIVADO con
  `deriveCoveredUntil`, igual que el cómputo del descuento — nunca
  `users.status`). `revoked` no se muestra.
- **D-29 (Simetría):** la pantalla muestra ambos lados: los vínculos donde
  soy referidor ("Trajiste a X") y donde soy referido ("Te trajo X").
  Nombre completo — en el gym se conocen por definición del vínculo.
- **D-30 (API):** endpoint nuevo `GET /members/referrals` que devuelve: mi
  `referralCode` (generándolo lazy si falta, con
  `ReferralService.generateReferralCode`), la lista de vínculos con estado
  derivado, y el descuento vigente (% y desglose) reusando
  `computeReferralDiscountPercent`.

### Notificaciones — VIS-02

- **D-31 (Alcance):** SOLO la notificación de **vínculo activado**, push al
  **referidor** ("¡Tu referido pagó! Ya tenés tu descuento"). El referido no
  recibe push (ya ve el descuento en su primer cobro). La notificación de
  "descuento por caerse" queda **diferida** (necesita cron de vigilancia de
  vencimientos de contrapartes y puede ser ruidosa; el estado Suspendido ya
  es visible en la pantalla).
- **D-32 (Categoría):** categoría NUEVA `referidos` en
  `notificationCategoryEnum` — migración de enum (**0177+**, verificar tope
  real al planificar) + template en `seedTemplates()` + preferencia
  opt-out granular como las demás categorías.
- **D-33 (Trigger):** al momento del flip a `qualified`
  (`ReferralService.qualifyFirstPayment`, fase 157) → `queueNotification` de
  la infra existente. El envío es best-effort: un fallo de notificación
  NUNCA rompe el cobro (mismo criterio que el resto de la cola).

### Panel admin — VIS-03 (opcional del roadmap)

- **D-34 (Forma mínima):** sección "Referidos" en la **ficha del alumno**
  del admin: quién lo trajo (con link a esa ficha) + a quiénes trajo +
  estado de cada vínculo (mismo estado derivado que la app). Es donde
  gestión consulta caso a caso.
- **D-35 (Diferido):** el listado/dashboard GLOBAL del programa (métricas,
  conversión, ranking de referidores) NO va en esta fase — se difiere hasta
  que haya volumen que analizar.

### Puesta en marcha

- **D-36 (Secuencia de lanzamiento):** deploy de la fase → correr
  `backfill-referral-codes.ts --apply` en prod (D-25 de la 157, requiere ok
  de Franco para SSH) → anuncio único del programa.
- **D-37 (Anuncio):** una sola notificación ad-hoc por la infra existente
  (`queueAdHocNotification`, categoría `anuncios`): "Nuevo: programa de
  referidos". SIN banners nuevos ni onboarding in-app (scope creep).

### Claude's Discretion

- Copy exacto de la pantalla y la notificación (respetando los wordings de
  D-28/D-31), layout visual dentro del design system Quasar existente.
- Shape exacto de la respuesta de `GET /members/referrals`.
- Cómo obtiene la ficha del admin los datos (endpoint nuevo vs extender el
  detalle de member existente) — decidir en planning según el patrón del
  módulo members.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del sistema (fuente de verdad)

- `BRIEF-SISTEMA-REFERIDOS.md` (raíz del repo) — diseño completo del
  programa; §Visibilidad aplica a esta fase.
- `.planning/ROADMAP.md` — sección "v5.5 (Sistema de Referidos)", Phase
  Details fase 158 (VIS-01..03).
- `.planning/phases/157-n-cleo-transaccional-de-referidos/157-CONTEXT.md` —
  D-01..D-25 lockeadas; esta fase NO las re-abre.
- `.planning/phases/157-n-cleo-transaccional-de-referidos/157-VERIFICATION.md`
  — qué existe y dónde (paths y líneas verificadas del núcleo).

### Código de la fase 157 a consumir (no modificar la mecánica)

- `el-templo-api/src/modules/referrals/service.ts` — `ReferralService`:
  `generateReferralCode`, `computeReferralDiscountPercent`,
  `getReferralConfig`, `qualifyFirstPayment` (acá va el hook de D-33).
- `el-templo-api/src/db/schema/referrals.ts` +
  `el-templo-api/src/db/schema/referral-credits.ts` — modelo del vínculo y
  del crédito.
- `el-templo-api/src/scripts/backfill-referral-codes.ts` — script D-25/D-36.

### Infra de notificaciones a reusar

- `el-templo-api/src/db/schema/notifications.ts:16` —
  `notificationCategoryEnum` (agregar `referidos`, migración de enum).
- `el-templo-api/src/modules/notifications/service.ts` —
  `queueNotification` (:226), `queueAdHocNotification` (:318),
  `seedTemplates` (:617), preferencias por categoría (:151/:185).

### Superficies a extender

- `el-templo-app/src/pages/ProfilePage.vue` — entrada a la pantalla nueva.
- Ficha del alumno del admin (módulo members del admin) — sección
  "Referidos" (D-34); ubicar el componente exacto en planning.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Infra push completa** (FCM + `device_tokens` + cola + templates +
  preferencias por categoría): la notificación de activación es solo una
  categoría + template + un `queueNotification` en el punto correcto.
- **`ReferralService`** ya expone todo lo que la pantalla necesita
  (código, config, % vigente); el endpoint de la app es mayormente
  composición.
- **`deriveCoveredUntil`** — único criterio de "activo" (D-09/D-24 de 157);
  el estado `Suspendido` de la UI se deriva con el mismo helper.
- **Share nativo Capacitor** — verificar plugin existente en la app
  (`@capacitor/share` o fallback a clipboard) en planning.

### Established Patterns

- Migraciones hand-written numeradas (0177+ tentativo — verificar tope al
  planificar), SQL commiteado junto al schema, sin `;` en comentarios.
- Notificaciones best-effort: nunca romper el flujo transaccional por un
  fallo de push.
- Tests de integración para rutas nuevas (`GET /members/referrals`, datos de
  ficha admin).

### Integration Points

- `qualifyFirstPayment` (referrals/service.ts) → hook de notificación D-33.
- `ProfilePage.vue` → link a `MisReferidosPage` (ruta nueva en la app).
- Ficha del alumno (admin) → sección Referidos.

</code_context>

<specifics>
## Specific Ideas

- El desglose del descuento debe ser pedagógico: "3 vínculos activos × 10% =
  30% (tope 40%)" — el socio tiene que entender POR QUÉ paga lo que paga.
- `Suspendido` siempre con la aclaración "se reactiva si vuelve" — la
  mecánica D-10 (suspende, no revoca) tiene que leerse en la UI.

</specifics>

<deferred>
## Deferred Ideas

- **Notificación "descuento por caerse"** (VIS-02 opcional) — requiere cron
  de vigilancia de vencimiento de contrapartes; evaluar post-lanzamiento.
- **Dashboard global de referidos en el admin** (métricas del programa,
  conversión, ranking) — cuando haya volumen (D-35).
- **Banner/onboarding in-app del programa** — descartado por ahora (D-37:
  solo anuncio push único).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — mismo falso positivo del matcher que en
  la fase 157 (keywords genéricas), sin relación con referidos. No
  integrado.

</deferred>

---

_Phase: 158-Visibilidad y comunicación_
_Context gathered: 2026-07-11_
