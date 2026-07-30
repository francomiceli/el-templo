// Módulo: tenant-manifest — clasificación canónica "¿esta ruta ve datos de UN
//                           gimnasio?" (v6.0, fase 171, ISO-01)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------
// El aislamiento multi-tenant se construyó de abajo hacia arriba: la columna
// (fase 166/167), las uniques compuestas (168), los helpers de escritura (169)
// y el sentinel + lint (170). Falta el backstop de arriba: una ruta nueva que
// consulte una tabla gym-owned sin scope de gimnasio no la atrapa ninguna de
// esas capas si el autor simplemente no pensó en el tema.
//
// Este registro es la contrapartida por el eje "rutas" de lo que
// `src/db/tenant-tables.ts` es por el eje "tablas": una lista escrita a mano,
// versionada, que un gate cruza contra la realidad. El gate es
// `test/tenancy/iso-01-manifiesto.test.ts` y es fail-closed en las dos
// direcciones: una ruta registrada sin entrada acá deja la suite en rojo
// nombrándola, y una entrada que ya no corresponde a ninguna ruta registrada
// (typo, rename, ruta borrada) también.
//
// DE DÓNDE SALE LA LISTA
// ----------------------
// De un volcado one-shot del hook `onRoute` de Fastify sobre `buildApp()`,
// hecho una sola vez al construir la fase 171 (el seam es `BuildAppOptions` en
// `src/app.ts`).
//
// Volcado del 2026-07-29 sobre `feat/170-sentinel-lint`: 569 eventos `onRoute`,
// 199 de ellos `HEAD` sintéticos, **370 rutas** clasificadas acá — 221
// `tenant-scoped`, 141 `templo-module` (102 training, 35 marketing, 3
// onboarding, 1 gamification) y 8 `global`. 0 claves duplicadas, 0 `HEAD`
// huérfanos.
//
// 2026-07-30 — **372 rutas** (223 `tenant-scoped`): el merge de `origin/staging`
// para el tren a master trajo dos rutas de caja en efectivo escritas en paralelo
// a esta fase, el gate ISO-01 las nombró en CI y se clasificaron `tenant-scoped`
// (las dos ya llamaban `assertTenant`). Ver el docblock de `ENTRADAS_BASELINE`
// en `test/tenancy/iso-01-manifiesto.test.ts`.
//
// Ese reparto es el APROBADO en el checkpoint del plan 171-06 (Franco,
// 2026-07-29). El volcado del plan 171-02 había propuesto 221 / 11 / 138; la
// única diferencia son las 3 rutas de `labs-inquiries`, que pasaron de `global`
// a `templo-marketing` por decisión de Franco (ver el veredicto del caso 3, en
// el bloque templo-marketing · app-landing). Por eso se movieron SOLO dos
// números —`global` 11 → 8 y `templo-module` 138 → 141— y `tenant-scoped` quedó
// en 221: las tres rutas salieron de `global`, no de la masa. El TOTAL tampoco
// se movió: una recategorización cambia la etiqueta, no la cantidad de rutas.
//
// Siguiendo D-16 de la fase 170: **no se commitea ningún
// regenerador**. Refrescar la lista con un script convertiría la clasificación
// en un trámite ("correr el script y commitear el diff") en vez de una decisión
// por ruta, que es exactamente lo que este archivo compra. Toda ruta nueva
// agrega su línea a mano, y esa edición ES la decisión consciente.
//
// POR QUÉ NO HAY COMODINES
// ------------------------
// D-01: entradas explícitas por ruta exacta (método + path), sin reglas por
// prefijo. Una regla comodín del estilo "todo `/api/admin/*` es tenant-scoped"
// clasificaría automáticamente rutas que todavía no existen, y con eso vaciaría
// el criterio 2 del ROADMAP de la fase 171 (una ruta nueva sin clasificar tiene
// que romper CI). Por eso el registro es un `Record` de clave exacta y no hay,
// en todo este archivo, ningún matching por prefijo.
//
// POR QUÉ EL MOTIVO ES OBLIGATORIO EN global
// ------------------------------------------
// D-02: `global` es la categoría peligrosa — es la que dice "esta ruta ve datos
// de todos los gimnasios y está bien". Sin motivo escrito, en un año nadie
// puede auditar si esa decisión fue deliberada o un descuido, y la categoría se
// vuelve la alfombra debajo de la cual barrer rutas que no se quiso pensar. Es
// el mismo espíritu de las exenciones `/* tenant-safe: <motivo> */` del lint de
// la 170 y de `TENANT_GLOBAL_UNIQUES` en `src/db/tenant-tables.ts`. El motivo
// se valida en runtime (`compararManifiesto` → `sinMotivo`): vacío o con un
// marcador de trabajo pendiente cuenta como ausente.
// Las `tenant-scoped` no llevan anotación: son el default masivo, y equivocarse
// hacia tenant-scoped sobra protección en vez de faltar.
//
// POR QUÉ templo-module SE ETIQUETA HOY
// -------------------------------------
// D-07: los features exclusivos de El Templo (SPOM, gladius, academy,
// tree-editor…) se marcan `templo-module` ya en esta fase aunque el enforcement
// `requireModule` llegue recién en la fase 176 — esa fase va a LEER esta
// etiqueta, no a re-decidirla. La decisión consciente se toma una sola vez, con
// revisión humana de la lista corta, y de paso las fases 172-175 no arrastran
// esas rutas a la batería de aislamiento sin necesidad. Toda entrada
// `templo-module` declara CUÁL módulo (`sinModulo` lo valida en runtime).
//
// QUÉ NO ES ESTE ARCHIVO
// ----------------------
// No es runtime de producción: nada en `src/` lo importa ni puede importarlo.
// Vive en `test/` a propósito, y por eso el lint de tenancy de la fase 170 —que
// solo mira `src/`— no lo analiza. Tampoco tiene dependencias: es TypeScript
// puro sin un solo import, lo que permite typechequearlo suelto con `tsc`
// (`tsconfig.json` incluye solo `src/**`, así que CI no typechequea `test/` —
// esa es la única red que tiene, junto con las validaciones de forma que el
// gate corre en runtime).

/** Las tres categorías posibles. No hay una cuarta, y agregarla es una decisión de diseño. */
const CATEGORIAS = ["tenant-scoped", "global", "templo-module"] as const;

/**
 * - `tenant-scoped`: la ruta lee o escribe datos de UN gimnasio. Es el default
 *   masivo y no lleva anotación.
 * - `global`: la ruta es genuinamente transversal a todos los gimnasios (o
 *   pre-scope: resuelve el tenant recién a partir de lo que encuentra). Lleva
 *   `motivo` obligatorio (D-02).
 * - `templo-module`: la ruta pertenece a un feature exclusivo de El Templo.
 *   Lleva `modulo` obligatorio (D-07).
 */
export type Categoria = (typeof CATEGORIAS)[number];

/** Módulos Templo del doc `.docs/saas-multitenancy/04-mecanismo-modulos.md`. */
const MODULOS_TEMPLO = [
  "templo-training",
  "templo-gamification",
  "templo-marketing",
  "templo-onboarding",
] as const;

export type ModuloTemplo = (typeof MODULOS_TEMPLO)[number];

export interface EntradaManifiesto {
  categoria: Categoria;
  /**
   * D-02: OBLIGATORIO y no vacío cuando `categoria === "global"`. Oración
   * completa que nombra la causa concreta ("el webhook se procesa antes de
   * saber a qué gimnasio pertenece"), no una etiqueta ("es global"). Un
   * "TODO" o un "pendiente" cuentan como ausente.
   */
  motivo?: string;
  /**
   * D-07: OBLIGATORIO cuando `categoria === "templo-module"`. Es la etiqueta
   * que la fase 176 va a leer para exigir `requireModule` en la ruta.
   */
  modulo?: ModuloTemplo;
}

/**
 * El manifiesto. La clave es `` `${MÉTODO} ${url}` `` con la url tal cual la
 * reporta el hook `onRoute` (ya viene con el prefijo compuesto del plugin).
 *
 * 372 entradas, una por ruta exacta (D-01). Orden: plataforma, auth, los
 * prefijos del API alfabéticamente, y al final los cuatro bloques `templo-*`.
 * Reparto: 223 `tenant-scoped` · 8 `global` · 141 `templo-module`.
 *
 * La clasificación está APROBADA por el dueño del producto: Franco revisó las
 * dos listas peligrosas (`global` entera y las fronteras de `templo-module`) y
 * los 14 grupos dudosos uno por uno en el checkpoint del plan 171-06, el
 * 2026-07-29 (D-03 / D-04). Cada grupo que estuvo en duda lleva arriba un
 * comentario que arranca con `D-04 veredicto:` con la decisión y su fuente: la
 * duda existió, y su resolución es información que se conserva. No queda
 * ninguna duda abierta.
 *
 * El único override sobre la recomendación del plan 171-02 fue el de las tres
 * rutas de `labs-inquiries`, que pasaron de `global` a `templo-marketing` (bajó
 * `global` de 11 a 8 y subió `templo-module` de 138 a 141; `tenant-scoped` no se
 * movió). Está registrado en `171-CLASIFICACION.md`, sección C caso 3, con el
 * motivo textual de Franco.
 *
 * El precedente de "el registro existe con el motivo al lado" es
 * `TENANT_GLOBAL_UNIQUES` de `src/db/tenant-tables.ts`: la única forma de
 * eximir algo es escribir por qué.
 */
export const TENANT_MANIFEST: Record<string, EntradaManifiesto> = {
  // ── plataforma ────────────────────────────────────────────────────────────
  "GET /health": {
    categoria: "global",
    motivo:
      "Liveness probe del proceso: devuelve un objeto fijo y no consulta ninguna tabla, así que no hay datos de ningún gimnasio que aislar.",
  },
  "OPTIONS *": {
    categoria: "global",
    motivo:
      "Preflight CORS que registra @fastify/cors: responde cabeceras y termina, sin ejecutar una sola línea de lógica de negocio ni tocar la base.",
  },

  // ── auth ──────────────────────────────────────────────────────────────────
  "POST /api/auth/login": {
    categoria: "global",
    motivo:
      "Resuelve la identidad ANTES de conocer el gimnasio: busca por el email pelado y el tenant sale de la fila encontrada, no al revés.",
  },
  "POST /api/auth/refresh": {
    categoria: "global",
    motivo:
      "Mismo lookup pre-scope que el login pero sobre el hash del refresh token: el tenant se deriva de la fila del token, que se encuentra sin ningún scope.",
  },
  "POST /api/auth/logout": {
    categoria: "global",
    motivo:
      "Invalida el refresh token del portador y no lee ni escribe una sola fila de datos de un gimnasio.",
  },
  // D-04 veredicto (caso 1): confirmada `tenant-scoped`. Es pública y sin sesión
  // como sus tres hermanas `global`, pero CREA una fila gym-owned, y eso manda.
  // Hoy cae en el DEFAULT 1 de la columna porque auth no es tenant-aware hasta la
  // fase 175 (ADO-06). Aprobado por Franco en el checkpoint del plan 171-06,
  // 2026-07-29.
  "POST /api/auth/register": { categoria: "tenant-scoped" },
  // D-04 veredicto (caso 2): confirmadas `tenant-scoped`. Son self-scoped por el
  // token del portador; que cuelguen de /api/auth —global en sus otras rutas— es
  // una frontera de prefijo, no un argumento. Sin conflicto documental. Aprobado
  // por Franco en el checkpoint del plan 171-06, 2026-07-29. Nota de exactitud:
  // las dos últimas se registran como POST, no como PATCH/DELETE que anotaba el
  // RESEARCH — el volcado del app real es la única fuente válida de la clave.
  "GET /api/auth/me": { categoria: "tenant-scoped" },
  "POST /api/auth/me/change-password": { categoria: "tenant-scoped" },
  "POST /api/auth/me/delete-account": { categoria: "tenant-scoped" },

  // ── /api/admin/analytics ──────────────────────────────────────────────────
  "GET /api/admin/analytics": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/advanced-finance": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/attendance": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/attendance/checkin-adoption": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/analytics/attendance/unique-members": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/analytics/churn": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/churned-members": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/churned-members/export": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/analytics/class-ratings": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/engagement": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/especiales": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/especiales/export": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/financial": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/frequency": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/funnel": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/ltv": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/member-flows": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/members": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/renewal": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/retention": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/ticket": { categoria: "tenant-scoped" },
  "GET /api/admin/analytics/trial-funnel": { categoria: "tenant-scoped" },

  // ── /api/admin/attendance ─────────────────────────────────────────────────
  "DELETE /api/admin/attendance/:attendanceId": { categoria: "tenant-scoped" },
  "GET /api/admin/attendance/member/:userId": { categoria: "tenant-scoped" },
  "GET /api/admin/attendance/slot/:scheduleId/:date": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/attendance/force": { categoria: "tenant-scoped" },
  "POST /api/admin/attendance/slot/:scheduleId/:date/check-in": {
    categoria: "tenant-scoped",
  },

  // ── /api/admin/coach ──────────────────────────────────────────────────────
  "GET /api/admin/coach/outstanding-balances": { categoria: "tenant-scoped" },

  // ── /api/admin/finance ────────────────────────────────────────────────────
  "GET /api/admin/finance/cash-registers": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/cash-registers/balances": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/cash-registers/balances/export": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/coach-load/autocompletar/:userId": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/coach-load/bank-accounts": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/coach-load/caja-efectivo": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/coach-load/mis-cargas": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/cost-centers": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/cost-centers/all": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/movements-history": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/movements-history/export": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/pending-tray": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/pending-tray/export": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/transactions": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/transactions/export": { categoria: "tenant-scoped" },
  "GET /api/admin/finance/transactions/pending-misc/:memberId": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/finance/transactions/summary": { categoria: "tenant-scoped" },
  "PATCH /api/admin/finance/cash-registers/:id": { categoria: "tenant-scoped" },
  "PATCH /api/admin/finance/cost-centers/:id": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/cash-registers": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/cash-registers/:id/close": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/cash-registers/:id/reactivate": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/cash-registers/efectivo": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/coach-load/alta": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/coach-load/misc": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/coach-load/pay-plan": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/cost-centers": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/cost-centers/:id/deactivate": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/cost-centers/:id/reactivate": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/expenses": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/expenses/:id/void": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/movements": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/movements/:id/void": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/transactions": { categoria: "tenant-scoped" },
  "POST /api/admin/finance/transactions/:id/correct": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/transactions/:id/observe": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/transactions/:id/validate": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/finance/transactions/:id/void": {
    categoria: "tenant-scoped",
  },

  // ── /api/admin/improvement-proposals ──────────────────────────────────────
  "GET /api/admin/improvement-proposals": { categoria: "tenant-scoped" },
  "GET /api/admin/improvement-proposals/export": { categoria: "tenant-scoped" },

  // ── /api/admin/leads ──────────────────────────────────────────────────────
  "PATCH /api/admin/leads/:userId": { categoria: "tenant-scoped" },

  // ── /api/admin/members ────────────────────────────────────────────────────
  "DELETE /api/admin/members/:userId": { categoria: "tenant-scoped" },
  "DELETE /api/admin/members/:userId/notes/:noteId": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/members": { categoria: "tenant-scoped" },
  "GET /api/admin/members/:userId": { categoria: "tenant-scoped" },
  "GET /api/admin/members/:userId/financial-history": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/members/:userId/notes": { categoria: "tenant-scoped" },
  "GET /api/admin/members/:userId/outstanding-concepts": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/members/:userId/referrals": { categoria: "tenant-scoped" },
  "GET /api/admin/members/:userId/session-levels": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/members/branches": { categoria: "tenant-scoped" },
  "GET /api/admin/members/check-dni": { categoria: "tenant-scoped" },
  "GET /api/admin/members/check-duplicates": { categoria: "tenant-scoped" },
  "GET /api/admin/members/export": { categoria: "tenant-scoped" },
  "GET /api/admin/members/export-sepa": { categoria: "tenant-scoped" },
  "GET /api/admin/members/search": { categoria: "tenant-scoped" },
  "POST /api/admin/members": { categoria: "tenant-scoped" },
  "POST /api/admin/members/:userId/convert-to-trial": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/members/:userId/notes": { categoria: "tenant-scoped" },
  "POST /api/admin/members/:userId/photo/upload-url": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/members/trial": { categoria: "tenant-scoped" },
  "PUT /api/admin/members/:userId": { categoria: "tenant-scoped" },
  "PUT /api/admin/members/:userId/notes/:noteId": {
    categoria: "tenant-scoped",
  },
  "PUT /api/admin/members/:userId/password": { categoria: "tenant-scoped" },

  // ── /api/admin/ratings ────────────────────────────────────────────────────
  // D-04 veredicto (caso 6): confirmadas `tenant-scoped` (core). "Rating de clase"
  // suena a feature Templo, pero `coach_ratings` es tabla core y la usa cualquier
  // gimnasio que tenga coaches; el doc 04 §2.1 no lista `ratings` en ningún
  // módulo. Aprobado por Franco en el checkpoint del plan 171-06, 2026-07-29
  // (idem /api/members/ratings más abajo, caso 7).
  "GET /api/admin/ratings": { categoria: "tenant-scoped" },
  "GET /api/admin/ratings/coaches": { categoria: "tenant-scoped" },
  "GET /api/admin/ratings/roster": { categoria: "tenant-scoped" },
  "POST /api/admin/ratings/roster": { categoria: "tenant-scoped" },

  // ── /api/admin/referrals ──────────────────────────────────────────────────
  "GET /api/admin/referrals/ab-results": { categoria: "tenant-scoped" },

  // ── /api/admin/reports ────────────────────────────────────────────────────
  "GET /api/admin/reports/access": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/access/export": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/charges": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/charges/export": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/expired-members": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/expiring": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/expiring/export": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/inactive": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/inactive/export": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/multibranch-reassignment-preview": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/reports/outstanding-balances": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/outstanding-balances/export": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/reports/trial-conversion": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/trial-sessions": { categoria: "tenant-scoped" },
  "GET /api/admin/reports/trial-sessions/export": {
    categoria: "tenant-scoped",
  },
  "PATCH /api/admin/reports/outstanding-balances/:balanceId/management": {
    categoria: "tenant-scoped",
  },

  // ── /api/admin/scheduling ─────────────────────────────────────────────────
  "DELETE /api/admin/scheduling/bookings/:bookingId": {
    categoria: "tenant-scoped",
  },
  "DELETE /api/admin/scheduling/holidays/:holidayId": {
    categoria: "tenant-scoped",
  },
  "DELETE /api/admin/scheduling/schedules/:scheduleId/cancel-date/:date": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/scheduling/activities": { categoria: "tenant-scoped" },
  "GET /api/admin/scheduling/holidays": { categoria: "tenant-scoped" },
  "GET /api/admin/scheduling/schedules/:scheduleId/deletion-preview": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/scheduling/schedules/:scheduleId/detail": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/scheduling/schedules/:scheduleId/next-available": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/scheduling/schedules/weekly": { categoria: "tenant-scoped" },
  "GET /api/admin/scheduling/trials": { categoria: "tenant-scoped" },
  "GET /api/admin/scheduling/trials/eligible": { categoria: "tenant-scoped" },
  "PATCH /api/admin/scheduling/schedules/:scheduleId/activity": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/scheduling/activities": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/bookings": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/holidays": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/schedules": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/schedules/:scheduleId/cancel-date": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/scheduling/schedules/:scheduleId/delete-from-date": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/scheduling/schedules/seed": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/trials": { categoria: "tenant-scoped" },
  "POST /api/admin/scheduling/trials/:bookingId/reschedule": {
    categoria: "tenant-scoped",
  },
  "PUT /api/admin/scheduling/activities/:activityId": {
    categoria: "tenant-scoped",
  },
  "PUT /api/admin/scheduling/schedules/:scheduleId/toggle": {
    categoria: "tenant-scoped",
  },

  // ── /api/admin/settings ───────────────────────────────────────────────────
  "GET /api/admin/settings/pricing/card-surcharge": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/settings/pricing/zero-price": { categoria: "tenant-scoped" },
  "PUT /api/admin/settings/pricing/card-surcharge": {
    categoria: "tenant-scoped",
  },
  "PUT /api/admin/settings/pricing/zero-price": { categoria: "tenant-scoped" },

  // ── /api/admin/subscriptions ──────────────────────────────────────────────
  "GET /api/admin/subscriptions/members/:userId/class-usage": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/subscriptions/members/:userId/subscription": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/subscriptions/members/:userId/subscription/change-plan-preview":
    { categoria: "tenant-scoped" },
  "GET /api/admin/subscriptions/members/:userId/subscription/history": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/subscriptions/members/:userId/subscription/pricing-preview": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/subscriptions/members/:userId/subscriptions": {
    categoria: "tenant-scoped",
  },
  "GET /api/admin/subscriptions/plans": { categoria: "tenant-scoped" },
  "GET /api/admin/subscriptions/plans/:planId": { categoria: "tenant-scoped" },
  "GET /api/admin/subscriptions/promo-plans": { categoria: "tenant-scoped" },
  "GET /api/admin/subscriptions/subscriptions/:subscriptionId/schedule-changes":
    { categoria: "tenant-scoped" },
  "PATCH /api/admin/subscriptions/plans/:planId/deactivate": {
    categoria: "tenant-scoped",
  },
  "PATCH /api/admin/subscriptions/promo-plans/:promoId": {
    categoria: "tenant-scoped",
  },
  "PATCH /api/admin/subscriptions/promo-plans/:promoId/deactivate": {
    categoria: "tenant-scoped",
  },
  "PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/schedules": {
    categoria: "tenant-scoped",
  },
  "PATCH /api/admin/subscriptions/subscriptions/:subscriptionId/start-date": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/bulk-migrate": { categoria: "tenant-scoped" },
  "POST /api/admin/subscriptions/members/:userId/subscription/assign": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/members/:userId/subscription/cancel": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/members/:userId/subscription/change-plan": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/members/:userId/subscription/pause": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/members/:userId/subscription/renew": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/members/:userId/subscription/resume": {
    categoria: "tenant-scoped",
  },
  "POST /api/admin/subscriptions/plans": { categoria: "tenant-scoped" },
  "POST /api/admin/subscriptions/promo-plans": { categoria: "tenant-scoped" },
  "POST /api/admin/subscriptions/subscriptions/:subscriptionId/compensate-days":
    { categoria: "tenant-scoped" },
  "PUT /api/admin/subscriptions/plans/:planId": { categoria: "tenant-scoped" },

  // ── /api/admin/tv ─────────────────────────────────────────────────────────
  "GET /api/admin/tv/control/context": { categoria: "tenant-scoped" },
  "GET /api/admin/tv/devices": { categoria: "tenant-scoped" },
  "POST /api/admin/tv/control/end-class": { categoria: "tenant-scoped" },
  "POST /api/admin/tv/control/state": { categoria: "tenant-scoped" },
  "POST /api/admin/tv/devices/:id/revoke": { categoria: "tenant-scoped" },
  "POST /api/admin/tv/pair/claim": { categoria: "tenant-scoped" },

  // ── /api/admin/users ──────────────────────────────────────────────────────
  "GET /api/admin/users": { categoria: "tenant-scoped" },
  "PATCH /api/admin/users/:userId/status": { categoria: "tenant-scoped" },
  "POST /api/admin/users": { categoria: "tenant-scoped" },
  "POST /api/admin/users/:userId/program-addons": {
    categoria: "tenant-scoped",
  },
  "PUT /api/admin/users/:userId": { categoria: "tenant-scoped" },

  // ── /api/app ──────────────────────────────────────────────────────────────
  // El prefijo entero vive en templo-marketing (app-landing), más abajo: no se
  // parte. Ver el veredicto del caso 3 del checkpoint 171-06.

  // ── /api/campaigns ────────────────────────────────────────────────────────
  "GET /api/campaigns/admin": { categoria: "tenant-scoped" },
  "GET /api/campaigns/admin/:id/funnel": { categoria: "tenant-scoped" },
  "GET /api/campaigns/admin/eligible-count": { categoria: "tenant-scoped" },
  "GET /api/campaigns/admin/sender": { categoria: "tenant-scoped" },
  "POST /api/campaigns/admin": { categoria: "tenant-scoped" },
  "POST /api/campaigns/admin/:id/send": { categoria: "tenant-scoped" },
  "POST /api/campaigns/admin/:id/test": { categoria: "tenant-scoped" },
  // D-04 veredicto (caso 5 — el segundo conflicto de docs): confirmadas
  // `tenant-scoped`, NO `global`. Son públicas y se resuelven por token, que es el
  // perfil típico de una `global`, pero la decisión Q5 del doc 06 §8 hizo la
  // supresión de unsubscribes POR TENANT (`uq (tenant_id, email)`): marcarlas
  // `global` contradiría esa decisión y dejaría Q5 sin backstop en la fase 175.
  // Aprobado por Franco en el checkpoint del plan 171-06, 2026-07-29, con una
  // salvedad textual que es material de PLANNING de la fase 175 y no cambia la
  // clasificación de hoy: "queda por verificar si campaigns está realmente
  // preparado para que cada tenant lo use (armando su propia campaña con su
  // propio mail saliente, etc.) — es material de la fase 175 (adopción)".
  "GET /api/campaigns/track/click": { categoria: "tenant-scoped" },
  "GET /api/campaigns/track/open": { categoria: "tenant-scoped" },
  "GET /api/campaigns/unsubscribe": { categoria: "tenant-scoped" },

  // ── /api/members/attendance ───────────────────────────────────────────────
  "GET /api/members/attendance/history": { categoria: "tenant-scoped" },
  "POST /api/members/attendance/check-in": { categoria: "tenant-scoped" },

  // ── /api/members/improvement-proposals ────────────────────────────────────
  "GET /api/members/improvement-proposals/prompt-status": {
    categoria: "tenant-scoped",
  },
  "POST /api/members/improvement-proposals": { categoria: "tenant-scoped" },

  // ── /api/members/ratings ──────────────────────────────────────────────────
  // D-04 veredicto (caso 7): confirmadas `tenant-scoped` (core). Misma duda que
  // /api/admin/ratings y misma razón: `coach_ratings` es tabla core. Aprobado por
  // Franco en el checkpoint del plan 171-06, 2026-07-29.
  "GET /api/members/ratings/pending": { categoria: "tenant-scoped" },
  "POST /api/members/ratings": { categoria: "tenant-scoped" },

  // ── /api/members/referrals ────────────────────────────────────────────────
  "GET /api/members/referrals": { categoria: "tenant-scoped" },
  "POST /api/members/referrals/cta-click": { categoria: "tenant-scoped" },

  // ── /api/members/scheduling ───────────────────────────────────────────────
  "DELETE /api/members/scheduling/bookings/:bookingId": {
    categoria: "tenant-scoped",
  },
  "GET /api/members/scheduling/bonus-usage": { categoria: "tenant-scoped" },
  "GET /api/members/scheduling/branches": { categoria: "tenant-scoped" },
  "GET /api/members/scheduling/my-bookings": { categoria: "tenant-scoped" },
  "GET /api/members/scheduling/trial-eligibility": {
    categoria: "tenant-scoped",
  },
  "GET /api/members/scheduling/weekly": { categoria: "tenant-scoped" },
  "POST /api/members/scheduling/cancel-trial": { categoria: "tenant-scoped" },
  "POST /api/members/scheduling/reserve": { categoria: "tenant-scoped" },
  "POST /api/members/scheduling/reserve-trial": { categoria: "tenant-scoped" },

  // ── /api/members/subscription ─────────────────────────────────────────────
  "GET /api/members/subscription/coverage": { categoria: "tenant-scoped" },
  "GET /api/members/subscription/me/especial-pass": {
    categoria: "tenant-scoped",
  },
  "GET /api/members/subscription/me/subscription": {
    categoria: "tenant-scoped",
  },
  "GET /api/members/subscription/plans": { categoria: "tenant-scoped" },

  // ── /api/notifications ────────────────────────────────────────────────────
  "GET /api/notifications/admin/templates": { categoria: "tenant-scoped" },
  "GET /api/notifications/preferences": { categoria: "tenant-scoped" },
  "POST /api/notifications/:id/opened": { categoria: "tenant-scoped" },
  "POST /api/notifications/admin/seed-templates": {
    categoria: "tenant-scoped",
  },
  "POST /api/notifications/admin/send-segment": { categoria: "tenant-scoped" },
  "POST /api/notifications/token": { categoria: "tenant-scoped" },
  "PUT /api/notifications/admin/templates/:id": { categoria: "tenant-scoped" },
  "PUT /api/notifications/preferences": { categoria: "tenant-scoped" },

  // ── /api/tv ───────────────────────────────────────────────────────────────
  "POST /api/tv/pair/start": {
    categoria: "global",
    motivo:
      "Pre-claim (mina M7): la fila de pairing nace ANTES de saber de quién es el televisor — `branch_id` queda nulo hasta que el staff hace el claim.",
  },
  "GET /api/tv/pair/status": {
    categoria: "global",
    motivo:
      "Pre-claim: el televisor poll-ea su device code sin sesión ni sede asignada, así que la fila que consulta todavía no pertenece a ningún gimnasio.",
  },
  // D-04 veredicto (caso 8): confirmadas `tenant-scoped`. El televisor no tiene
  // JWT ni scope, igual que las dos rutas de pairing que sí son `global`, pero
  // éstas son POST-claim: el tenant sale de la fila ya reclamada y no de una fila
  // pre-claim sin dueño. Aprobado por Franco en el checkpoint del plan 171-06,
  // 2026-07-29.
  "GET /api/tv/me": { categoria: "tenant-scoped" },
  "GET /api/tv/state": { categoria: "tenant-scoped" },
  "POST /api/tv/client-log": { categoria: "tenant-scoped" },

  // ── /api/webhooks ─────────────────────────────────────────────────────────
  "POST /api/webhooks/wellhub": {
    categoria: "global",
    motivo:
      "Entrada pública sin sesión: Wellhub no manda tenant y el gimnasio se DERIVA server-side desde `gym.id` contra `branches.wellhub_gym_id` (CON-04, cerrado en 169-05).",
  },

  // ══ templo-training ═══════════════════════════════════════════════════════
  // Doc 04 §2.1: spom, sessions, admin(editor), exercises, exercise-adjustments,
  // tree-editor, tree-progress, goal-plans, progression, programs, check-ins,
  // formats, routes, day-modes, weekly-rotator, saved-blocks, evaluation-requests.

  // ── templo-training · /spom (fuera de /api) ───────────────────────────────
  "GET /spom/exercises": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /spom/lookup": { categoria: "templo-module", modulo: "templo-training" },
  "GET /spom/tables": { categoria: "templo-module", modulo: "templo-training" },
  "GET /spom/week": { categoria: "templo-module", modulo: "templo-training" },
  "PUT /spom/week": { categoria: "templo-module", modulo: "templo-training" },

  // ── templo-training · /api/sessions ───────────────────────────────────────
  "GET /api/sessions/:id": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/sessions/daily": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/sessions/weekly": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/sessions/complete": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/sessions/generate": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · /api/admin/sessions ─────────────────────────────────
  "DELETE /api/admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId":
    { categoria: "templo-module", modulo: "templo-training" },
  "GET /api/admin/sessions": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/:id": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/:id/preview": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/coverage": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/day-details": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/day-modes": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/sessions/pending-count": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/custom-title": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId":
    { categoria: "templo-module", modulo: "templo-training" },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/reorder":
    { categoria: "templo-module", modulo: "templo-training" },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/format": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/format-params": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/role": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/sessions/:sessionId/blocks/:blockId/route": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:id/approve": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:id/reset": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:id/revert": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:sessionId/blocks/:blockId/exercises": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/swap":
    { categoria: "templo-module", modulo: "templo-training" },
  "POST /api/admin/sessions/:sessionId/blocks/:blockId/mobility/swap": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/:sessionId/blocks/:blockId/swap": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/sessions/bulk-approve": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PUT /api/admin/sessions/day-modes": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · editor (blocks, generate, routes, weeks, saved-blocks,
  //    formats) ──────────────────────────────────────────────────────────────
  "GET /api/admin/blocks/pool": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/generate": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/routes": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/weeks/:week/summary": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "DELETE /api/admin/saved-blocks/:id": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/saved-blocks": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/saved-blocks": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/formats/compatible": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/formats/compatible-batch": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · /api/admin/exercises ────────────────────────────────
  "DELETE /api/admin/exercises/:exerciseId/video": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises/mobility-pool": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises/pool": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises/proposals": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises/route-progression-map": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/exercises/search": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PATCH /api/admin/exercises/:exerciseId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/:exerciseId/upload-complete": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/:exerciseId/upload-url": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/bulk-update-equipment": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/bulk-upload-urls": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/proposals/:id/accept": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/proposals/:id/reject": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/exercises/proposals/bulk-accept": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · exercise-adjustments ────────────────────────────────
  "GET /api/admin/exercise-adjustments/:memberId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/exercise-adjustments": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · tree-editor ─────────────────────────────────────────
  "GET /api/admin/tree-editor/milestone-review": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/tree-editor/milestone/:exerciseId/variants": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/tree-editor/tree": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/milestone-review/accept": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/milestone-review/reject": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/milestone/promote": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/precedence": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/regroup": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/tree-editor/reorder": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · tree-progress ───────────────────────────────────────
  "GET /api/tree-progress/me": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · goal-plans ──────────────────────────────────────────
  "GET /api/admin/goal-plans/members": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/goal-plans/members/:userId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/goal-plans/generate": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/goal-plans/active": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/goal-plans/archived": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/goal-plans/metadata": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/goal-plans/session": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/goal-plans/stats": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/goal-plans/complete": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · progression / evaluation-requests ───────────────────
  "GET /api/progression/stats": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/progression/weekly-summary": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/progression/request-evaluation": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · programs ────────────────────────────────────────────
  "GET /api/admin/programs": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/programs/:programId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/programs/analytics": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/admin/programs/enrollments/user/:userId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/programs": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/programs/:programId/content": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/programs/:programId/deactivate": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/programs/enrollments/:enrollmentId/advance": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/admin/programs/enrollments/:enrollmentId/cancel": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PUT /api/admin/programs/:programId": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/members/programs/catalog": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/members/programs/has-goal-plan-access": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/members/programs/my-progress": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  // D-04 veredicto (caso 9): confirmadas `templo-training`. Viven bajo
  // /api/members/me, que en el resto del API es core, pero lo que sirven es el
  // programa de ENTRENAMIENTO y sus inscripciones, y el doc 04 §2.1 pone
  // `programs` en templo-training. Aprobado por Franco en el checkpoint del plan
  // 171-06, 2026-07-29.
  "GET /api/members/me/current-program": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/members/me/enrollments": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "PUT /api/members/me/current-program": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ── templo-training · check-ins ───────────────────────────────────────────
  // D-04 veredicto (caso 10): confirmadas `templo-training`. El doc 04 §2.1 lista
  // `check-ins` (el feature de entrenamiento) como Templo. TRAMPA DE NOMBRE que la
  // revisión confirmó a propósito: NO es el check-in de asistencia
  // (POST /api/members/attendance/check-in), que es CORE y quedó tenant-scoped.
  // Aprobado por Franco en el checkpoint del plan 171-06, 2026-07-29.
  "GET /api/admin/check-ins": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "GET /api/check-ins/today": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
  "POST /api/check-ins": {
    categoria: "templo-module",
    modulo: "templo-training",
  },

  // ══ templo-gamification ═══════════════════════════════════════════════════
  // Doc 04 §2.1: aura + aura-*, lifestyle, bar-challenge. AURA no expone rutas
  // propias (es un service interno), así que el módulo aporta una sola.
  "POST /api/bar-challenge/result": {
    categoria: "templo-module",
    modulo: "templo-gamification",
  },

  // ══ templo-marketing ══════════════════════════════════════════════════════
  // Doc 04 §2.1: blog, academy, gladius, franchise, app-landing.

  // ── templo-marketing · blog ───────────────────────────────────────────────
  // D-04 veredicto (caso 11): confirmadas `templo-marketing`. Son rutas públicas de
  // eltemplo.org —contenido de marca, no del gimnasio— y el doc 04 §2.1 pone
  // `blog` en templo-marketing; las tablas de blog son gym-owned. Aprobado por
  // Franco en el checkpoint del plan 171-06, 2026-07-29.
  "DELETE /api/blog/admin/posts/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "DELETE /api/blog/admin/tags/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/admin/posts": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/admin/posts/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/admin/tags": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/posts": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/posts/:slug": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/posts/:slug/related": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/tags": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/blog/tags/:slug/posts": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/blog/admin/posts": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/blog/admin/tags": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/blog/admin/upload-image": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PUT /api/blog/admin/posts/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PUT /api/blog/admin/posts/:id/tags": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PUT /api/blog/admin/tags/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },

  // ── templo-marketing · academy ────────────────────────────────────────────
  // D-04 veredicto (caso 12): confirmadas `templo-marketing`. La academia es
  // formación de marca y el doc 04 §2.1 pone `academy` en templo-marketing;
  // `academy_inquiries` es gym-owned. Aprobado por Franco en el checkpoint del
  // plan 171-06, 2026-07-29.
  "GET /api/academy/admin/inquiries": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/academy/inquire": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },

  // ── templo-marketing · gladius ────────────────────────────────────────────
  // D-04 veredicto (caso 13): confirmadas `templo-marketing`. Tienda pública de la
  // marca y el doc 04 §2.1 pone `gladius` en templo-marketing; `gladius_products`
  // y sus consultas son gym-owned. Aprobado por Franco en el checkpoint del plan
  // 171-06, 2026-07-29.
  "DELETE /api/gladius/admin/products/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/gladius/admin/products": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/gladius/products": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/gladius/products/:slug": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/gladius/admin/products": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/gladius/inquire": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PUT /api/gladius/admin/products/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },

  // ── templo-marketing · franchise ──────────────────────────────────────────
  // D-04 veredicto (caso 14): confirmadas `templo-marketing`. Franquiciar "El
  // Templo" es la MARCA y no el gimnasio —roza plataforma, como las labs-inquiries
  // del caso 3—, pero el doc 04 §2.1 lo pone en templo-marketing y ninguna decisión
  // del doc 06 §8 lo contradice. Aprobado por Franco en el checkpoint del plan
  // 171-06, 2026-07-29, en la misma dirección que el override del caso 3: lo de la
  // marca es del Templo, o sea tenant #1, no de la plataforma.
  "GET /api/franchise/admin/applications": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "GET /api/franchise/admin/applications/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PATCH /api/franchise/admin/applications/:id": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/franchise/admin/applications/:id/generate": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/franchise/apply": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },

  // ── templo-marketing · app-landing (waitlist + labs-inquiries) ────────────
  // D-04 veredicto (caso 4): confirmada `templo-marketing`. `app_waitlist` SÍ es
  // gym-owned y el doc 04 §2.1 la pone acá. Aprobado por Franco en el checkpoint
  // del plan 171-06, 2026-07-29.
  "GET /api/app/admin/waitlist": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/app/waitlist": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  // D-04 veredicto (caso 3 — OVERRIDE, el único de la revisión): estas tres eran
  // el conflicto real de documentación. El plan 171-02 las recomendaba `global`
  // siguiendo la decisión Q2 del doc 06 §8 (`labs_inquiries` = tabla de
  // PLATAFORMA, leads del propio SaaS). Franco decidió lo contrario en el
  // checkpoint del plan 171-06, el 2026-07-29, con estas palabras: "todo eso es
  // parte del Templo". Van a `templo-marketing`, o sea que para la clasificación
  // de RUTAS gana el mapeo carpeta → módulo del doc 04 §2.1 (`app-landing`
  // entero es templo-marketing) por sobre la recomendación Q2-global, y el
  // prefijo /api/app deja de partirse. Fuente: veredicto de Franco en el
  // checkpoint 171-06 (2026-07-29), registrado en 171-CLASIFICACION.md §C caso
  // 3; supersede la recomendación Q2-global PARA ESTAS RUTAS. Consecuencia
  // buscada: quedan protegidas por el aislamiento en vez de exentas.
  "GET /api/app/admin/labs-inquiries": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "PATCH /api/app/admin/labs-inquiries/:id/status": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },
  "POST /api/app/labs-inquiry": {
    categoria: "templo-module",
    modulo: "templo-marketing",
  },

  // ══ templo-onboarding ═════════════════════════════════════════════════════
  // Doc 04 §2.1: onboarding, onboarding-analytics.
  "GET /api/onboarding/profile": {
    categoria: "templo-module",
    modulo: "templo-onboarding",
  },
  "POST /api/onboarding/analytics": {
    categoria: "templo-module",
    modulo: "templo-onboarding",
  },
  "POST /api/onboarding/complete": {
    categoria: "templo-module",
    modulo: "templo-onboarding",
  },
};

/**
 * Claves de ruta de UN evento `onRoute`.
 *
 * Fastify dispara un solo evento para `app.route({ method: ["POST", "PUT"] })`,
 * con `method` como array. Expandirlo es obligatorio: una ruta declarada con
 * dos métodos son dos entradas del manifiesto, porque son dos decisiones
 * distintas (el GET de un recurso puede ser global y su PUT no).
 *
 * Acepta `string | readonly string[]` porque eso es literalmente lo que trae
 * `RouteOptions["method"]` en runtime.
 */
export function clavesDeEvento(
  metodo: string | readonly string[],
  url: string,
): string[] {
  const metodos = typeof metodo === "string" ? [metodo] : metodo;
  return metodos.map((m) => `${m.trim().toUpperCase()} ${url}`);
}

/** Resultado de `particionarObservadas`. */
export interface Particion {
  /** Claves que van al manifiesto (todo lo que no es HEAD), únicas y ordenadas. */
  rutas: string[];
  /** HEAD que NO se explican por un GET hermano. Deben ser cero. */
  headHuerfanos: string[];
}

/**
 * Separa los `HEAD` del resto y, de paso, deja evidencia de que ninguno se
 * descartó a ciegas.
 *
 * POR QUÉ EL FILTRO NO ES COSMÉTICO
 * ---------------------------------
 * Fastify 5 trae `exposeHeadRoutes: true` por default: por cada `GET` dispara
 * también un evento `HEAD` sintético (199 de los 569 eventos del app real).
 * Meterlos al manifiesto sería duplicar cada decisión sin agregar información.
 *
 * Pero filtrar `HEAD` a secas sería el anti-patrón: si mañana alguien declara
 * un `HEAD` A MANO —una ruta real, con su handler y su acceso a datos— el
 * filtro ciego la dejaría fuera del backstop en silencio, que es exactamente lo
 * que este archivo existe para impedir. Un HEAD manual tiene DOS formas
 * posibles y las dos se detectan (WR-03 de la review de fase):
 *
 *   1. HEAD sin `GET` hermano: sale por `headHuerfanos` y el gate lo pone en
 *      rojo.
 *   2. HEAD conviviendo con un `GET` de la misma url — que en Fastify obliga a
 *      registrar ese GET con `exposeHeadRoute: false` (si no, el HEAD sintético
 *      choca con el manual). Un GET así NO genera HEAD sintético, o sea que
 *      cualquier HEAD observado en su url es a mano seguro: va a `rutas` y el
 *      manifiesto tiene que clasificarlo como a cualquier otra. Para eso existe
 *      el segundo parámetro, `urlsGetSinHeadSintetico`: las urls de los GET que
 *      el hook `onRoute` vio con `exposeHeadRoute: false`. Sin ese dato, este
 *      caso era indistinguible de un sintético y se colaba por el filtro en
 *      silencio.
 *
 * POR QUÉ SE COMPARA TAMBIÉN SIN LA BARRA FINAL
 * ---------------------------------------------
 * Una ruta declarada en `"/"` dentro de un plugin con prefijo dispara un tercer
 * evento fantasma, `HEAD <prefijo>/` con barra final, que no tiene `GET`
 * hermano con esa url exacta (son 7 en el app real). Se resuelve comparando el
 * HEAD contra el set de GET con y sin barra final (mismo criterio para
 * `urlsGetSinHeadSintetico`).
 *
 * Lo que NO se hace es normalizar la barra final de TODAS las urls:
 * `ignoreTrailingSlash` está en su default `false`, o sea que
 * `/api/admin/analytics` y `/api/admin/analytics/` son rutas DISTINTAS para
 * find-my-way. Colapsarlas escondería una ruta real detrás de otra.
 */
export function particionarObservadas(
  claves: readonly string[],
  urlsGetSinHeadSintetico: readonly string[] = [],
): Particion {
  const heads: string[] = [];
  const rutas = new Set<string>();
  const urlsGet = new Set<string>();
  const sinSintetico = new Set(urlsGetSinHeadSintetico);

  for (const clave of claves) {
    const corte = clave.indexOf(" ");
    const metodo = corte === -1 ? clave : clave.slice(0, corte);
    const url = corte === -1 ? "" : clave.slice(corte + 1);

    if (metodo === "HEAD") {
      // Caso 2 del docblock: el GET de esta url renunció al HEAD sintético
      // (`exposeHeadRoute: false`), así que este HEAD es una ruta declarada a
      // mano. Se clasifica como cualquier otra, no se filtra.
      if (sinSintetico.has(url) || sinSintetico.has(url.replace(/\/$/, ""))) {
        rutas.add(clave);
        continue;
      }
      heads.push(clave);
      continue;
    }
    rutas.add(clave);
    if (metodo === "GET") urlsGet.add(url);
  }

  const headHuerfanos = new Set(
    heads.filter((clave) => {
      const url = clave.slice(clave.indexOf(" ") + 1);
      return !urlsGet.has(url) && !urlsGet.has(url.replace(/\/$/, ""));
    }),
  );

  return {
    rutas: Array.from(rutas).sort(),
    headHuerfanos: Array.from(headHuerfanos).sort(),
  };
}

/** Las cinco formas en que el manifiesto y la realidad pueden discrepar. */
export interface Discrepancias {
  /** Observadas en runtime que no tienen entrada. Una ruta nueva sin clasificar cae acá. */
  faltantes: string[];
  /** Entradas que ya no corresponden a ninguna ruta registrada (typo, rename, ruta borrada). */
  fantasmas: string[];
  /** Entradas `global` sin motivo utilizable (D-02). */
  sinMotivo: string[];
  /** Entradas `templo-module` sin módulo declarado o con uno inválido (D-07). */
  sinModulo: string[];
  /** Entradas con una `categoria` fuera de las tres. Solo pasa porque nadie typechequea `test/`. */
  categoriaInvalida: string[];
}

/**
 * Marcadores que convierten un motivo escrito en un motivo inservible.
 *
 * Son DOS regex a propósito, no una con flag `i` (WR-01 de la review de fase):
 *
 * - Los marcadores de trabajo (TODO/FIXME/TBD/XXX) se buscan case-SENSITIVE.
 *   Con la flag `i`, `\bTODO\b` matchea la palabra castellana "todo" — una de
 *   las más comunes del idioma en el que D-02 exige escribir los motivos: un
 *   motivo legítimo como "aplica a todo el sistema" quedaría reportado como
 *   pendiente. Falso negativo aceptado a cambio: un "todo"/"fixme" en
 *   minúsculas usado como marcador no se detecta — la convención universal los
 *   escribe en mayúsculas y ningún linter del repo los busca en minúsculas
 *   tampoco.
 * - "pendiente" sí es case-insensitive (es prosa castellana, puede arrancar
 *   oración) pero lleva `\b` en los dos extremos: sin límites de palabra,
 *   "independiente" y "dependiente" —adjetivos normales en un motivo tipo "el
 *   endpoint es independiente del gimnasio"— disparaban el marcador.
 */
const MARCADORES_TRABAJO = /\b(TODO|FIXME|TBD|XXX)\b/;
const MARCADOR_PENDIENTE = /\bpendiente\b/i;

/** ¿El motivo es en realidad un marcador de trabajo pendiente? */
function esMotivoPendiente(motivo: string): boolean {
  return MARCADORES_TRABAJO.test(motivo) || MARCADOR_PENDIENTE.test(motivo);
}

const CATEGORIAS_VALIDAS: ReadonlySet<string> = new Set(CATEGORIAS);
const MODULOS_VALIDOS: ReadonlySet<string> = new Set(MODULOS_TEMPLO);

/**
 * Compara lo observado en runtime contra el manifiesto y devuelve las cinco
 * listas de discrepancias, cada una única y ordenada.
 *
 * ES UNA FUNCIÓN PURA Y EL MANIFIESTO ES UN PARÁMETRO
 * ---------------------------------------------------
 * El segundo parámetro tiene default, pero existe: NO borrarlo ni volverlo
 * obligatorio. Es lo que permite que el gate del plan 171-03 demuestre el
 * criterio 2 del ROADMAP ("una ruta nueva sin clasificar rompe CI") con
 * fixtures sintéticos —una lista de rutas inventada, un manifiesto inventado—
 * en vez de asumirlo. El precedente es `lintTenantSources` de la fase 170, que
 * `con-06` invoca dos veces: una sobre fixtures y otra sobre el repo real.
 *
 * `observadas` se espera SIN los HEAD (ver `particionarObservadas`), y se
 * declara `readonly string[]` y no un tipo literal de las claves porque las
 * claves salen de `onRoute` en runtime, no del compilador.
 */
export function compararManifiesto(
  observadas: readonly string[],
  manifiesto: Readonly<Record<string, EntradaManifiesto>> = TENANT_MANIFEST,
): Discrepancias {
  const observadasSet = new Set(observadas);
  const clavesManifiesto = Object.keys(manifiesto);

  const faltantes = new Set(
    Array.from(observadasSet).filter((clave) => !(clave in manifiesto)),
  );
  const fantasmas = new Set(
    clavesManifiesto.filter((clave) => !observadasSet.has(clave)),
  );

  const sinMotivo: string[] = [];
  const sinModulo: string[] = [];
  const categoriaInvalida: string[] = [];

  for (const clave of clavesManifiesto) {
    const entrada: EntradaManifiesto | undefined = manifiesto[clave];
    if (!entrada) continue;

    const categoria: string = entrada.categoria;
    if (!CATEGORIAS_VALIDAS.has(categoria)) {
      // Categoría inválida y listo: no tiene sentido exigirle motivo o módulo
      // a una entrada cuya categoría no se entiende.
      categoriaInvalida.push(clave);
      continue;
    }

    if (categoria === "global") {
      const motivo = entrada.motivo;
      const utilizable =
        typeof motivo === "string" &&
        motivo.trim().length > 0 &&
        !esMotivoPendiente(motivo);
      if (!utilizable) sinMotivo.push(clave);
    }

    if (categoria === "templo-module") {
      const modulo: string | undefined = entrada.modulo;
      if (modulo === undefined || !MODULOS_VALIDOS.has(modulo)) {
        sinModulo.push(clave);
      }
    }
  }

  return {
    faltantes: Array.from(faltantes).sort(),
    fantasmas: Array.from(fantasmas).sort(),
    sinMotivo: Array.from(new Set(sinMotivo)).sort(),
    sinModulo: Array.from(new Set(sinModulo)).sort(),
    categoriaInvalida: Array.from(new Set(categoriaInvalida)).sort(),
  };
}
