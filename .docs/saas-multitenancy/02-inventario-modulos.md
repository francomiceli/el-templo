# Fase 2 — Inventario núcleo vs Templo: grilla para discusión caso por caso

> **Estado:** ✅ INVENTARIO DISCUTIDO Y CERRADO con Nacho (2026-07-02) — §1 CORE y §2
> TEMPLO confirmados en bloque, zona gris §3 decidida 8/8, **§4.1 y §4.2 decididos**.
> DOC COMPLETO — lo que sigue es el diseño del mecanismo de módulos. Evidencia: lectura de
> services/routes/schema reales de `el-templo-api` + mapeo de páginas de `el-templo-admin`.
> Complementa el análisis por pantalla de [`01-analisis-correcciones-admin.md`](./01-analisis-correcciones-admin.md).

## Resumen ejecutivo

De **37 módulos API** y 66 tablas: **~13 módulos CORE claros**, **~16 TEMPLO claros**, y
**8 en zona gris (DISCUTIR)** — esa zona gris es la agenda de discusión. Además: **7 puntos
de acople** donde pantallas MVP del admin llaman módulos Templo, y **4 acoples backend**
donde services core inyectan `AuraService`.

---

## 1. CORE claro — ✅ CONFIRMADO en bloque (Nacho, 2026-07-02)

> Con dos matices decididos en la discusión: `coach` = core **vía roles** (ver nota abajo)
> y `notifications` = core **dormido para tenants ≠ 1** hasta la app multi-tenant.
> `ratings` confirmado core-apagado (pertenencia ≠ scope del MVP).

| Módulo | Qué hace | Nota |
|---|---|---|
| `auth`, `users`, `members` | Login/JWT, staff CRUD, socios CRUD | `users.ts` tiene columnas Templo embebidas → §4.1 |
| `finance` | Caja, ledger, movimientos, centros de costo | El corazón del MVP según doc de Nacho |
| `subscriptions` | Planes de pago + ciclo de vida | ⚠️ pricing inyecta descuento AURA → §4.2 |
| `scheduling`, `attendance` | Horarios, grilla, bookings, check-in QR | |
| `analytics`, `reports` | KPIs read-only, reportes | menos `/programs/analytics` y trial-sessions (SPOM) |
| `coach` (deudas), `email`, `notifications`, `shared` | Deudas en puerta, Resend, push, utils | `email`: motor genérico, templates Templo → §4.3. `coach` → ver decisión abajo |

> ✅ **NOTA (Nacho, 2026-07-02) — `notifications` (push):** core, pero **estructuralmente
> dormido para tenants ≠ 1**: el push requiere una app de miembros instalada, y esa app
> multi-tenant es justamente la diferida que fundará el repo SaaS (README §6). No es un
> toggle comercial (como `ratings`) sino un prerrequisito estructural. Mientras tanto,
> **el canal member-facing del SaaS es `email`** (funciona sin app). Los templates de push
> siguen el patrón motor-vs-plantilla (§4.3) cuando toque.

> ✅ **DECIDIDO (Nacho, 2026-07-02) — `coach` (cobros/deudas en puerta):** el
> coach-cajero es un **modo operativo del Templo** (sucursales sin recepción → el profe
> recibe efectivo y algunas transferencias), NO el caso típico de un gimnasio. Para el SaaS:
> la **funcionalidad** de cobros/deudas es core y funciona como detalla
> `Correcciones El Templo.md` (superficie de Finanzas/PoS); **quién la ve se gobierna por
> roles** configurables (RBAC), no por un módulo aparte. El módulo `coach` de la API no se
> borra — sus vistas quedan como superficie core gateada por rol, y el Templo simplemente
> habilita ese rol para sus profes.
| `ratings` | Rating 1–5 de coach post-clase | Módulo genérico aunque "Profes" esté OUT del MVP — decisión de *scope*, no de pertenencia |

**Tablas CORE adicionales:** `activities`, `balances`, `holidays`, `cost-centers`,
`class-coach-assignments`, `coach-ratings`, `member-notes`, `promo-plans`,
`subscription-schedules`, `subscription-schedule-changes`, `system-settings`(→`tenant_settings`),
`transaction-links`, `user-status-history`, `financial-transactions`.

## 2. TEMPLO claro — ✅ CONFIRMADO en bloque (Nacho, 2026-07-02)

> Con la decisión de ejercicios/rutinas incorporada (nota abajo): SPOM completo queda
> Templo; catálogo genérico global + motor de rutinas se construyen nuevos como core.

| Grupo | Módulos / tablas | Evidencia |
|---|---|---|
| **Motor SPOM** (metodología) | `spom`, `sessions`, `admin`(editor sesiones), `exercises`, `exercise-adjustments`, `tree-editor`, `tree-progress`, `goal-plans`, `progression` + tablas `spom-*`, `session-*`, `exercise-*`, `formats`, `format-compatibility`, `routes`, `day-modes`, `weekly-rotator`, `intensity/contraction-rules`, `saved-blocks`, `evaluation-requests` | Niveles griegos, bloques INITIUM/NUCLEUS, árbol de progresión |

> ✅ **DECIDIDO (Nacho, 2026-07-02) — ejercicios y rutinas:** la tabla `exercises` actual
> ES el árbol SPOM (verificado: `route`, `progression_step`, `milestone_exercise_id`,
> `habilidad` + 4 satélites de metodología) → queda **módulo Templo, no se transforma**.
> La visión genérica se construye NUEVA como core (mismo patrón que la app de miembros):
> **(a) catálogo genérico de ejercicios GLOBAL** (sin `tenant_id`, curado por nosotros —
> "los gimnasios convencionales usan más o menos los mismos" — con disponibilidad por
> tenant según equipamiento/máquinas) y **(b) motor de rutinas automatizadas tipo-SPOM
> para gimnasios convencionales** (core futuro, post-MVP, diferenciador del SaaS).
> SPOM podría eventualmente consumir el catálogo como base — se decide cuando exista.
| **Gamificación** | `aura` + `aura-*`, `bar-challenge`, `lifestyle` | Economía AURA, retos propios |
| **Marketing/marca** | `blog`, `academy`, `gladius`, `franchise`, `app-landing` + sus tablas | Marca El Templo, WhatsApp fijo, CTAs propios |

## 3. ZONA GRIS — ✅ 8/8 DECIDIDOS (2026-07-02)

**Lente transversal acordado:** los ítems member-facing se clasifican por *naturaleza*
ahora, pero su activación para tenants ≠ 1 espera a la app de miembros multi-tenant
(mismo estatus que push, ver nota `notifications` en §1).

1. ✅ **`campaigns` → MOTOR CORE + contenido por-tenant** (decidido). Mismo patrón que
   `email` (§4.3): la maquinaria de broadcast (audiencia, batch, funnel, unsubscribes) es
   core aunque siga OUT del MVP; templates/campañas concretas = contenido del tenant.
   Nota: campañas por email funcionan sin app → canal member-facing del SaaS.
2. ✅ **`programs` → TEMPLO hoy; la noción SaaS de "programas" queda INTEGRADA al futuro
   motor de entrenamiento genérico tipo-SPOM** (decidido, palabras de Nacho). No se
   transforma el CRUD actual (acoplado a goal-plans/AURA); "rutinas por objetivo/nivel/días"
   es alcance del motor core futuro (ver decisión de ejercicios en §2).
3. ✅ **`member-profiles` → NO partir la tabla; partir el significado** (decidido).
   Columnas genéricas (goal, experiencia, foco) = core; las de metodología
   (`current_streak`, `avatar_type`) las gobierna el mecanismo de módulos (NULL/ignoradas
   para otros tenants). Se re-evalúa solo si el mecanismo pide extracción física.
4. ✅ **`segmentation` → CORE con umbrales por `tenant_settings`** (decidido). El algoritmo
   (cron 3AM + on-login, fase 136) sirve a cualquier gimnasio; los cut-points del Templo
   pasan a ser defaults. Feature de retención = argumento de venta del SaaS.
5. ✅ **`streaks` → núcleo de racha CORE, recompensa como hook de módulo** (decidido).
   Dormido sin app; AuraService en StreaksService es uno de los 4 acoples de §4.2.
6. ✅ **`check-ins` (wellness diario) → TEMPLO por ahora** (decidido). Su único consumidor
   es SPOM; si el motor de entrenamiento genérico quiere wellness-input, se diseña ahí.
   Promocionable a core-flag ante demanda de un tenant.
7. ✅ **`onboarding` + `onboarding-analytics` → TEMPLO hoy** (decidido). El onboarding
   genérico nace junto con la app de miembros multi-tenant (mismo patrón que
   app/ejercicios/programs: no transformar, construir nuevo).
8. ✅ **`member-logins` → CORE** (decidido). Su consumidor principal (segmentation) es core;
   para tenants sin app simplemente no genera filas.

## 4. Acoples a desacoplar (hallazgos transversales)

### 4.1 `users.ts` tiene la metodología embebida — ✅ DECIDIDO (2026-07-02)
Inventario completo (34 columnas): 26 genéricas core; 8 Templo en 4 grupos. Decisión:
- **`level` + `level_override`** (niveles griegos) y **`current_program_enrollment_id`**
  (programs): **quedan como columnas gobernadas por el mecanismo de módulos** (mismo
  criterio que member-profiles: partir el significado, no la tabla).
- **`bar_challenge_*` (×3): SE CONSERVAN** — decisión REVERTIDA (Nacho, 2026-07-02) tras
  la verificación en prod: el evento SÍ se usó (18 intentos 23-28 may 2026, 1 completado
  con 346s). El módulo `bar-challenge` queda como parte de `templo-gamification`
  (re-usable en futuros eventos); sus columnas siguen el mismo criterio que
  `level`/`level_override`: gobernadas por el mecanismo de módulos.
- **`boarding_pass_used`**: Templo-ismo de pricing — mismo destino que el descuento AURA
  (hook de pricing, §4.2).

### 4.2 `AuraService` inyectado en services core — ✅ DIRECCIÓN DECIDIDA (2026-07-02)
`subscriptions` (descuento AURA en pricing), `onboarding`, `streaks`, `programs` reciben
`AuraService` en el constructor. Hallazgo adicional: la cadena de pricing real es
**`override → boarding pass → AURA → precio de plan`** — hay DOS beneficios Templo
horneados en el pricing core, no uno.
**Dirección confirmada por Nacho: hooks/eventos** — el core define puntos de extensión
con nombre (ej. "ajustes de precio", "post-onboarding", "post-racha") y los módulos se
registran al boot; el core NUNCA importa código de módulo (principio rector #2). El diseño
fino (registro, orden, manejo de errores) es la próxima discusión: el mecanismo de módulos.

### 4.3 Motor vs plantilla (patrón repetido)
`email` y `campaigns`: motor reutilizable + contenido Templo hardcodeado. La separación
motor-core / plantillas-por-tenant aparecerá también en notificaciones push (`template_key`).

### 4.4 Acoples del admin (7 puntos, detalle del inventario del admin)
1. `AlumnoDetailPage` → exercise-adjustments + goal-plans (SPOM en la ficha de alumno).
2. `useMembersApi` → `/admin/members/:id/session-levels` (niveles en el modelo de alumno).
3. `HorariosPage` → `useRatingsApi` (roster de coaches para asignar slots — ojo: el *roster*
   es core aunque Puntuaciones esté OUT).
4. `AnaliticasPage` → `/admin/programs/analytics`.
5. `ReportesPage` → `/admin/reports/trial-sessions` (sesiones SPOM).
6. `PlanesPage` → mezcla planes de pago (IN) con programas/rutinas (OUT) en una pantalla —
   coincide con la separación que pidió el doc de Nacho ("Rutinas de entrenamiento" vs
   "Planes de pago").
7. `AdminLayout`/`useAdminStore` → badge/banner de sesiones SPOM como dependencia
   estructural del layout (gated por `canSeeTraining`, pero estructural).

**Dato positivo del admin:** el gating por rol del `AdminLayout` ya implementa casi
exactamente el RBAC que pide el doc de correcciones (Finanzas/Planes para admin+owner,
Pagos visible para coach, Landing solo owner). La re-estructuración de nav es reorganizar,
no reinventar permisos.

---

## 5. Cómo usar este doc en la discusión

Orden sugerido: primero confirmar en bloque §1 (CORE claro) y §2 (TEMPLO claro) — deberían
ser rápidos; después los 8 de §3 uno por uno (son los que definen el mecanismo de módulos);
por último las 2 decisiones estructurales de §4.1 y §4.2, que conviene decidir DESPUÉS de
la zona gris porque el mecanismo de módulos depende de cuántas cosas terminen siendo
"core con hook por-tenant".

## Registro de cambios
- **2026-07-01** — Creación autónoma (3 exploraciones paralelas: módulos API, tablas,
  admin). Pendiente: discusión caso por caso con Nacho.
- **2026-07-02** — Discusión con Nacho: **§1 CORE y §2 TEMPLO confirmados en bloque** (con
  decisiones: ejercicios/rutinas = construir nuevo core, `coach` = core vía roles,
  `notifications` = core dormido sin app). **Zona gris: 4/8 decididos** (campaigns,
  programs, member-profiles, segmentation). Pendientes: streaks, check-ins, onboarding,
  member-logins (propuestas listas en §3), y luego §4.1/§4.2.
- **2026-07-02 (cierre grilla)** — **Zona gris 8/8 decididos**: streaks (núcleo core +
  recompensa hook), check-ins (Templo), onboarding (Templo, genérico nace con la app),
  member-logins (core). Queda §4.1 (columnas users.ts) y §4.2 (AuraService) → antesala
  del mecanismo de módulos.
- **2026-07-02 (cierre §4)** — **§4.1 decidido** (columnas Templo quedan gobernadas por
  módulos; `bar_challenge_*` se borra con su módulo, previa verificación en prod;
  `boarding_pass_used` = hook de pricing) y **§4.2 dirección decidida** (hooks/eventos,
  core nunca importa módulos). Hallazgo: cadena de pricing `override → boarding → AURA`.
  **Inventario 100% cerrado.**
