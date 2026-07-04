# El Templo

## What This Is

A multi-app platform for El Templo Calistenia, a calisthenics gym chain with 8 locations (7 Mar del Plata, 1 Barcelona). The monorepo contains: a Fastify API (el-templo-api), a member mobile app (el-templo-app), a coach/admin web app (el-templo-admin), and a public-facing marketing site (el-templo-web). v1 delivered the Training module, v2 the Admin app, v3 the landing page and public web presence, v4 begins ecosystem integration — consolidating admin operations, adding attendance/scheduling, and laying the foundation for AURA economy and lifestyle features.

## Current Milestone: v5.4 Reforma del Admin — Correcciones white-label (pre-tenants)

**Goal:** Reorganizar el admin según `Correcciones El Templo.md` para dejarlo listo como MVP white-label — nav por categorías, RBAC dueño-vs-empleado, pantallas simplificadas y de-Templo-ficación de la superficie MVP (Finanzas, Alumnos, Horarios, Planes) — SIN introducir tenants todavía. Primera etapa del camino SaaS (decisión: reforma PRIMERO, tenancy DESPUÉS, secuencial).

**Target features:**

- **Nav + RBAC:** categorías Finanzas / Alumnos / Horarios / Planes; Finanzas y Planes solo admin/owner; profe ve solo Pagos + Planes read-only; Alumnos y Horarios libres. Campañas/Profes/Puntuaciones/landing fuera del MVP (gateadas, no borradas).
- **Finanzas:** Pagos→"Cobros" simplificado (pantallas separadas); cuentas bancarias flexibles (crear/cerrar; Banco, N°, Titular, CUIT, CBU/CVU, Alias; 3 obligatorios); transferencia/tarjeta obligadas a asociar cuenta; Caja reordenada (Movimientos portada, Pendientes 2°, Transacciones→"Cobros" con etiqueta validada/pendiente + filtro por día + detalle con validador); categorías de egreso configurables ("Pago a proveedores", "Retiros"); retiros del dueño.
- **Deudas:** fecha de registro, motivo, pago asociado + vencidos de plan (cruza con lo que v5.3 ya agregó — verificar en plan-phase).
- **Alumnos:** crear alumno prominente; cobro como acción directa en la fila; precio por medio de pago configurable (hoy regla Templo hardcodeada); avatar → "segmento" (nombre neutro, mismo mecanismo); niveles griegos gateados como Templo.
- **Horarios:** clases simultáneas en la misma sucursal; crear clase desde el slot (generalizar "test de profe"); capacidad por actividad.
- **Planes:** separar "Planes de pago" de "Rutinas de entrenamiento"; precio "Zero" → config; selección múltiple de programas por plan; verificar que actualizar precio por inflación no rompa históricos.

**Regla dura transversal:** todo cambio de API adopta los patrones del diseño SaaS validado (`.docs/saas-multitenancy/`): motor vs plantilla, regla de dirección de imports (doc 04), sin nuevos Templo-ismos en core.

**Out of scope this milestone:**

- Tabla `tenants`, `tenant_id`, mecanismo de módulos (fase de tenancy posterior, diseño ya validado en `.docs/saas-multitenancy/04-mecanismo-modulos.md`).
- Correcciones finas de Analíticas (cobrado vs devengado, no-renovaciones, LTV, retención) — diferidas a milestone posterior; solo se mueve Analíticas/Reportes dentro de Finanzas en el nav.
- Asistencia por QR desde la app del alumno (cruza a la app de miembros, post-MVP).
- App de miembros multi-tenant (diferida, funda el repo SaaS).

**Reference:** `.docs/saas-multitenancy/Correcciones El Templo.md` (doc crudo de Nacho) + `01-analisis-correcciones-admin.md` (análisis bajo lente SaaS, mapa imagen→código) + `README.md` §0 (decisión de secuencia).

## Next Milestone (planned, not active): v5.5 Sistema de Referidos

**Ejecuta DESPUÉS de v5.4** (decisión de Franco, 2026-07-02: reforma del admin primero; referidos se monta sobre el alta de alumno y los cobros ya reformados). v5.4 sigue siendo el milestone activo — v5.5 está roadmapped y a la espera.

**Goal:** Sistema de referidos double-sided AURA-native: cada vínculo, una vez que el referido paga su primer plan (`qualified`), otorga a **ambas** partes un % de descuento en su cuota **mientras las dos sigan activas**, evaluado en cada cobro, acumulable por múltiples vínculos hasta un tope. No-discrecional (se auto-aplica); AURA queda como anotación interna.

**Fases:** 157 (núcleo transaccional: schema+migración, atribución doble canal, cualificación en `assignPlan`, cómputo del descuento simétrico, registro AURA) y 158 (visibilidad: pantalla "Mis referidos", notificaciones, panel admin opcional). 12 requirements (REF/DESC/AURA/VIS) — inline en el ROADMAP hasta activar el milestone.

**Solapamiento con v5.4:** fase 157 cruza fase 154 (alta de alumno) y fase 151 (`assignPlan`) — verificar en plan-phase, montar sobre lo reformado.

**Fuente de verdad:** `BRIEF-SISTEMA-REFERIDOS.md` (raíz). Infra AURA ya reserva `sourceType:"referral"` sin cablear.

## Previous Milestone: v5.3 Mejoras Caja / Módulo Contable (feedback v5.2)

**Goal:** Resolver el feedback operativo de v5.2 sobre la caja y la PoS del profe — imputación correcta de caja, cobro de socios sin plan activo, arqueo por caja y clasificación de egresos.

**Target features:**

- **A) Aviso de deuda en la PoS:** al seleccionar al alumno en "Cargar pago", aviso destacado si tiene deuda (ambos modos). Dato ya disponible (`autocompletar.outstanding`).
- **B) Imputación de caja en la validación (fundacional):** el profe cobra sin elegir caja; el cobro nace con **caja sugerida** (sede del profe vía `recordedBy` / banco por moneda), **no definitiva**. Gestión **confirma o cambia** la caja al validar (el validar, hoy inmutable, se abre para recibir `cash_register_id`). Incluye **múltiples cuentas banco** (modelar varias cajas tipo `banco`; staging seedea **Galicia** + **Mercado Pago**).
- **C) Cobro suelto → alta de plan:** dropdown **Motivo** (Sin plan activo / Otro, como campo) + chip "Sin plan — asignar" en Pendientes que lleva a la ficha + al asignar el plan, gestión **usa la plata del cobro suelto** (anular+recrear `plan_charge` vinculado a la sub, atómico) + **bloqueo del "Validar" manual** para los "sin plan".
- **D) "Movimientos de caja" como arqueo por caja:** la pestaña pasa a mostrar **todo lo imputado a la caja** (cobros + egresos + traspasos + ajustes), filtrando por `cash_register_id`; pendientes y validados **marcados**; **Cobros** en el filtro Tipo. "Transacciones" (vista comercial) se mantiene.
- **E) Centros de costo para egresos:** tabla `cost_centers` (por país) + columna obligatoria en la transacción + selector en el dialog de egreso + seed (Alquiler Constitución / Librería / Viáticos profes / Varios). Reporte por centro de costo y ABM desde UI **diferidos**.

**Decisiones clave:**

- **B es fundacional para C y D:** la caja sugerida en Pendientes habilita el arqueo (D) y la imputación del anticipo (C).
- **Cobro suelto→plan:** anular+recrear `plan_charge` (Cabo 1=A, cuenta como ingreso de plan); excedente NO se aplica (Cabo 2); bloquear "Validar" manual de "sin plan" (Cabo 3); al asignar, gestión ve TODOS los cobros sueltos pendientes del socio (robustez).
- **Múltiples cuentas banco:** se modelan varias cajas tipo `banco`; staging arranca con seeds Galicia + Mercado Pago (de mentira).
- **Centros de costo:** obligatorios con "Varios" de escape; solo egresos (kind `expense`).
- **Descartados del feedback** (sin trabajo): cambiar plan en el cobro (es de gestión), sugerir precio (ya existe en `AssignPlanDialog`), cargar turnos fijos (ya existe en gestión), dinero pendiente en caja (ya aparece como "pendiente", no suma firme).

**Out of scope this milestone:**

- **Reporte de egresos por centro de costo** + **ABM de centros de costo desde UI** (diferido a un paso posterior — staging usa los seeds).
- **ABM de cuentas banco desde UI** (staging usa seeds Galicia/Mercado Pago).

**Reference:** `BRIEF-FEEDBACK-V52-CAJA.md` (raíz, decisiones consolidadas de los 10 puntos de feedback de v5.2).

## Earlier Milestone: v5.2 Módulo Contable en el Administrador — Libro de Caja

**Goal:** Convertir al Administrador en el libro de caja único (fuente de verdad), eliminando el triple tipeo del registro de pagos, con validación de pagos (PENDIENTE→VALIDADO) y gestión de cajas (efectivo/banco) con movimientos inter-caja y egresos. Se monta sobre el modelo financiero transaccional existente (v4.8).

**Target features:**

- **Carga única que propaga (corazón del milestone):** UI dead-simple para que el profe cargue un pago **una sola vez** en el Administrador, y esa carga active la membresía al instante + registre el dinero en caja, automáticamente. Elimina el doble/triple tipeo (Forms + Contabilium + Admin) del lado de El Templo.
- **Máquina de estados de validación:** profe carga PENDIENTE / admin carga VALIDADO; flujo OBSERVADO→CORREGIDO ("corregir" = anular+recrear, no UPDATE). ANULADO se mantiene **ortogonal** (soft-void existente), NO como estado del enum. "Dinero firme" = `status='validado' AND voided_at IS NULL`. Activar membresía ≠ validar pago.
- **Entidad Caja:** efectivo por sucursal + efectivo central + **banco por moneda** (banco ARS + banco EUR; cada caja tiene `currency` fija, hereda el aislamiento de moneda del ledger). Saldo firme = solo VALIDADOS; saldo derivado en v1 (materializar solo con evidencia de performance).
- **Movimientos inter-caja y egresos:** movimiento = **una sola fila** (origen+destino, neto 0); egreso = misma fila con destino NULL (salida real, sin categoría / nota libre por ahora). Reusan `financial_transactions` extendiendo `kind`. `memberId` deja de bloquear egresos (sentinel o nullable).
- **Reportes para la admin:** bandeja de pendientes (por antigüedad) + observados, saldo por caja, historial de movimientos/egresos. Reusa el export Excel/PDF existente.

**Decisiones clave:**

- **~60% del modelo YA EXISTE (v4.8): se construye ENCIMA, no se rediseña.** `transaction_links` ya hace pago≠membresía; soft-void ya es ANULADO-con-rastro; `recordAssignmentCharge` ya activa membresía+cobro+saldo atómicamente; aislamiento de moneda ya cableado. **Cero dependencias nuevas.**
- **Blast radius del estado de validación (riesgo ALTO):** hoy la "caja" filtra `inflow AND voided_at IS NULL` sin estado de validación. Meter PENDIENTE obliga a reescribir el filtro canónico de ingresos que consumen ~6 lugares, **incluidas las 6 métricas de gestión de v5.0 (fases 120-123)**. Mitigación: migración `DEFAULT 'validado'` + backfill + auditar todos los call sites.
- **Contabilium: reemplazo progresivo** (facturación electrónica AFIP/ARCA = lo último). Durante la transición conviven; definir regla explícita de "qué dato manda" por etapa.
- **Refunds:** estado ANULADO con rastro (nunca borrar), solo admin; popup decide membresía 1-a-1 (default: queda activa).
- **No hay cierre de caja diario:** la reconciliación física = el momento del movimiento/retiro (esperado vs. contado). El control cotidiano ES la validación.
- **Perillas de config (validación todos/dudosos, activación instantánea/diferida):** la fase 136-07 borró el subsistema de settings del admin → definir nueva casa en discuss-phase.

**Out of scope this milestone:**

- Facturación electrónica AFIP/ARCA (último escalón del reemplazo de Contabilium).
- Categorización de egresos (proveedor/dueño/gasto) — por ahora salida + nota libre.
- Gateway de pago automático / integración con medio de pago — todo es carga manual.
- Cierre de turno con float, sync bidireccional con Contabilium — anti-features descartados.
- Reestructuración financiera en Google Sheets (plan de cuentas, márgenes, proyección) — otro documento.

**Reference:** `BRIEF-MODULO-CONTABLE-FRANCO.md` (raíz, brief de diseño consolidado) + `.planning/research/modulo-contable/` (FEATURES/ARCHITECTURE/PITFALLS/STACK con contraste vs. brief).

## Earlier Milestone: v5.1 Nuevo Sistema de Entrenamiento

**Goal:** Reestructurar el sistema de entrenamiento alrededor de un árbol de habilidades (DAG) construido sobre 3 ejes ortogonales (gesto / palanca / contracción), y sobre ese cimiento habilitar el nivel Kairos para principiantes y el ajuste de dificultad in-session.

**Target features (3 ejes, en orden de construcción):**

- **Eje 2 — Árbol de habilidades (CIMIENTO, va primero):** estructurar gesto/palanca/contracción como datos (bootstrap LLM + revisión de profes); auto-construir el grafo ramificado desde el orden del SPOM/`dificultadLineal`; editor de árbol en el admin para que los profes ajusten precedencias/agrupaciones; % de avance visible; saneo de datos (~103 ejercicios sin ruta, duplicados, `position` sucio que mezcla 3 cosas).
- **Eje 1 — Nivel Kairos:** nuevo nivel (enum 5→6 niveles), modelo híbrido que hereda de Alfa (`difficulty=1`), con capa que fuerza formato **solo lineal + 2 ejercicios por bloque**; todos los alumnos nuevos arrancan en Kairos (cambia default `users.level` de `alfa` a `kairos`); graduación a Alfa por criterio automático (X sesiones) o salto manual del coach; UI del 6º recuadrito en el selector de nivel.
- **Eje 3 — Ajuste de dificultad in-session:** botones ↓más fácil / más difícil↑ por ejercicio durante la sesión; el árbol sirve el vecino un escalón arriba/abajo (misma ruta × contracción, conservando bloque/formato/dosis); registro nuevo de "dominado" que alimenta el % del árbol, lo ve el coach y habilita upsell futuro. NO cambia automáticamente el nivel ni el SPOM.

**Decisiones clave:**

- **Scope completo confirmado** (Franco, no achicar). Se arranca por el árbol (fase 0 de estructuración de datos) como cimiento de los otros dos ejes.
- Modelado por **estructuración de las 3 dimensiones** (no cablear aristas a mano): bootstrap asistido por LLM + revisión humana de profes. El orden, el grafo y el eje 3 emergen de las dimensiones.
- El árbol **auto-construye desde el orden del SPOM/`dificultadLineal`**; los profes ajustan precedencias/agrupaciones después en el editor de árbol del admin → desbloquea el milestone sin esperar curaduría manual previa. `BRIEF-PROFES` NO es bloqueante.
- Kairos: alcance de código **solo estructural** (formato lineal + 2 ej/bloque + ejercicios simplificados de Alfa `difficulty=1`). La "conversión de la sesión de prueba" es motivación del lado profes/clase, **NO requisito de código** — no se ata al funnel 123 de v5.0.
- Persistencia de "dominado": registro nuevo (hoy solo hay "completado" local + RPE).

**Out of scope this milestone:**

- Cambio automático de nivel o de la planificación del SPOM a partir del ajuste in-session (sigue siendo criterio del coach).
- Contenido propio de Kairos cargado por Fran (mientras tanto hereda de Alfa).
- Pendientes finos de dominio que NO bloquean el código: INITIUM en Kairos (¿2 ej o excluido?), número exacto de sesiones para graduar, dosis lineales exactas, definición precisa de "dominar", trabajo "de pie" del audio del Trainer.

**Reference:** `.planning/research/new-training-system-design.md` (doc de diseño, fuente de verdad) + `.docs/new-training-system/BRIEF-PROFES.md` (decisiones de dominio para los profes) + audios en `.docs/new-training-system/`.

## Older Milestone: v5.0 Métricas de Gestión

**Phases 120-123.** Backend-first: 6 bloques de métricas de gestión (churn no-renovación person-based, tasa de renovación, funnel de sesiones de prueba, frecuencia de asistencia, LTV con Kaplan-Meier, ticket promedio), con aislamiento de moneda ARS/EUR y breakdowns comparables por sucursal/país/plan. Reemplaza churn/retención viejos y ARPU. 120 en prod; 121-122 CI-verde en `origin/staging`; 123 (asistencia+funnel) local sin pushear (UAT pendiente). UI del admin para exponer los 6 bloques quedó para un milestone de frontend posterior. Refs: `ESPECIFICACION-METRICAS-GESTION.md`, `METRICAS_GESTION_HANDOFF_2026-06-02.md`.

## Earlier Milestone: v4.85 Enrollment Service + Admin Add-ons

**Phases 112-114.** `EnrollmentService` centraliza el lifecycle de `programEnrollments`; endpoint admin de program add-ons con precio opcional; transferencia automática de add-ons en cambio de plan; teardown en cancel/expire. (Fases sueltas posteriores sin milestone formal: 116 refresh tokens, 117-118 analytics, 119 campaña freemium.)

## Earlier Milestone: v4.8 Modelo Financiero

**Phases 105-109.** Completed 2026-04-29. Modelo transaccional unificado (`financial_transactions` + `transaction_links`) reemplazando `payments` + `debts`. CajaPage v2 con summary por kind, reporte aging de deudas, export Excel.

## Earlier Milestone: v4.7 Full Body & ROM — Coach Session Requests

**Phases 96-104** (96-97 plus ad hoc 98-104). Completed 2026-04-27.

## Earlier Milestone: v4.3 Android Play Store Launch

**Goal:** Publish the member app (el-templo-app) on Google Play Store — Capacitor version alignment, release signing with upload keystore, production AAB build workflow, Play Store listing with all compliance forms, and launch through testing tracks to production.

**Target features:**

- Capacitor version alignment (CLI v8 ↔ native plugins) and version management strategy
- Upload keystore generation with secure storage (GitHub Secrets) and backup documentation
- Production signed AAB build via GitHub Actions (`build-android-production.yml`)
- Play Store listing: descriptions, screenshots, feature graphic, privacy policy
- Compliance: data safety form, content rating (IARC), target audience declaration
- Internal testing → production track promotion → live on Play Store

## Core Value

Members know exactly what to train today, complete guided sessions with block structure and timers, see their progress accumulate, and advance through levels — transforming daily training into visible progression toward mastery.

**v4.3 core value:** Members can install El Templo from Google Play Store like any real app — no sideloading, no APK files, just search and install.

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0, v2.0, and v3.0 -->

- ✓ Authentication, SPOM engine, session generation (v1.0)
- ✓ Admin session review/editing, PDF generation (v2.0)
- ✓ Per-member journeys, video integration (v2.0)
- ✓ CI/CD, staging, Sentry monitoring, deploy pipeline (v2.0)
- ✓ Landing page, franchise forms, blog, Gladius showcase (v3.0)
- ✓ Brand alignment, Day Player redesign (v3.0)
- ✓ Academy and App landing pages (v3.0)
- ✓ Architecture foundation, virtual branch, AURA tables, module boundaries (v4.0)
- ✓ Lifestyle content extraction from arete-web (v4.0)
- ✓ Member management CRUD, subscriptions, payments, attendance, scheduling, analytics (v4.0)
- ✓ QR check-in, class booking, dashboard analytics (v4.0)
- ✓ Registration flow fixes, codebase health, god object decomposition (v4.0)
- ✓ Production deployment, data import, plan config, QR access, cash box, reports, roles (v4.1)
- ✓ Clases Personalizadas: full rename, subscription gating, AURA rewards, cycle config, plan-driven assignment, unified training UX, plan catalog (v4.2)

### Active

See: .planning/REQUIREMENTS.md (v5.4 scope — Reforma del Admin white-label)

### Out of Scope

- ~~**APK Signing / Play Store**~~ — Now active as v4.3 (Phases 74-77)
- ~~**Nuevo Sistema de Entrenamiento**~~ — Now active as v5.1 (nivel Kairos + árbol de habilidades + ajuste de dificultad in-session; diseño en `.planning/research/new-training-system-design.md`)
- **Lifestyle / Mi Camino** — v5.x/v6.0 (habits, journal, challenges, philosophical tools)
- **AURA Economy (milestones, store)** — v5.x/v6.0 (foundation tables in v4.0, but economy features later)
- **Social / Agora** — v6.0+ (feed, missions, reactions, career path)
- **Online model + Payment gateway** — v6.0+ (freemium, premium gate, Mercado Pago/Stripe)
- **Multi-tenancy / SaaS** — Not a goal. El Templo only.
- **DeportNet import** — One-time migration, already done
- **Zero Pricing Engine (full)** — Over-engineered. Simpler AURA-discount pricing when needed.

## Context

**Ecosystem architecture discovery (complete):** 10-phase discovery process defining unified ecosystem vision. Full decisions in memory file `ecosystem-architecture-discovery.md`. Key decisions: one currency (AURA), one level system (Alfa→Spartan), modular monolith, virtual "Templo Online" branch, freemium online model.

**El-Templo-Net (reference codebase):** Next.js/Hono/PostgreSQL admin panel with members CRUD, subscriptions, payments, class scheduling, analytics, attendance. 16 tables, multi-tenant. Code used as reference only — features rebuilt in Vue/Quasar + Fastify/MySQL.

**Arete App (reference codebase):** React Native/Expo lifestyle app with 39 habits, journal, challenges, philosophical tools, AURUM economy. Code used as reference only — features rebuilt in Vue/Capacitor when lifestyle module is built.

**Build sequence (7 phases across multiple milestones):**

1. ✓ Light restructure (v4.0)
2. ✱ Admin consolidation (v4.0 started, v4.1 completes)
3. ✓ Attendance & scheduling (v4.0)
4. Lifestyle / Mi Camino (v5.0)
5. AURA economy (v5.0)
6. Social / Agora (v5.0+)
7. Online model + Payment gateway (v6.0+)

**Key execution principle:** Ship each phase to production before starting the next. Don't let "building the ecosystem" become a never-ending staging branch.

## Constraints

- **Stack**: Vue 3/Quasar/Capacitor (frontend) + Fastify/Drizzle/MySQL (backend). All new code on this stack.
- **Architecture**: Modular monolith — one Fastify API with explicit module boundaries. Each module owns its routes, services, schemas, and tables.
- **DB design**: Users table stays lean (auth, profile, branchId, level). Module-specific data in dedicated tables (aura_balances, subscriptions, habit_streaks, etc.).
- **Admin**: Extend existing el-templo-admin. Current "Alumnos" section absorbs Net's member management.
- **Frontend**: One member app (el-templo-app) with lazy-loaded modules.
- **Reference code**: Net and Arete codebases are reference only — not imported directly.
- **Infrastructure**: Same EC2/Nginx/PM2 deployment as existing apps.

## Key Decisions

| Decision                           | Rationale                                                                         | Outcome   |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------- |
| Training module first              | Highest daily value, foundation for progression system                            | ✓ Good    |
| Algorithmic session generation     | SPOM rules exist, coaches shouldn't manually build programs                       | ✓ Good    |
| Shell + module architecture        | Future modules need clean integration points                                      | ✓ Good    |
| Gym-wide SPOM (not per-member)     | Simplifies generation, matches gym operational model                              | ✓ Good    |
| Multi-branch from start            | Avoid architectural rework when scaling to more locations                         | ✓ Good    |
| Nuxt 3 for landing                 | Purpose-built for SSR/SSG, lighter for marketing site                             | ✓ Good    |
| Brand alignment in v3.0            | Unified visual identity before ecosystem expansion                                | ✓ Good    |
| Unified AURA currency              | Single currency (not AURA + AURUM). Simpler UX, one wallet                        | — Pending |
| Single level system (Alfa→Spartan) | Multiple progression ladders confuse users                                        | — Pending |
| Virtual "Templo Online" branch     | Avoids making branchId nullable everywhere. Clean code path for online users      | — Pending |
| Modular monolith                   | Formalizes existing src/modules/ pattern. Prevents tangling as features grow      | — Pending |
| Modular DB (lean users table)      | Prevents god table. Each module owns its data in dedicated tables                 | — Pending |
| Merge admin apps                   | One admin for training content + business ops. Net features rebuilt in Vue/Quasar | — Pending |
| Auto-generated missions first      | Social works without coach effort. Coach-created missions as enhancement          | — Pending |
| AURA tracking from day 1           | Foundation tables track activity early so early adopters aren't penalized         | — Pending |
| Payment gateway with online model  | Don't delay revenue — online premium conversion requires payment processing       | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-07-04 — Fase 152 (Reorganización de Caja + egresos configurables) completa: 6/6 planes, verificación 6/6 must-haves (CAJA-01..06), UAT aprobada. Entregó: migración 0165 (validated_by/at + índice único cost_centers + seeds genéricos), Movimientos como portada de Caja, "Historial de cobros" con chip validada/pendiente + filtro por estado + validador en detalle, DateRangeFilter mes↔día compartido, ABM de centros de costo (API + UI en Cuentas, baja lógica, unicidad por país), banner de saldo firme en Saldos. Quedan 5 warnings advisory en 152-REVIEW.md (export Excel sin filtro estado, country no pinneado para admin no-owner, mes default UTC). Próxima: fase 153 Mejoras de Deudas. Fase 151 completa 2026-07-03. Milestone v5.4 (Reforma del Admin — Correcciones white-label) initialized 2026-07-02; primera etapa del camino SaaS: reforma PRIMERO, tenancy DESPUÉS. v5.3 queda en `verifying` (UAT pendientes, ya en prod vía tren 0e8b928c). Fuente: .docs/saas-multitenancy/Correcciones El Templo.md + 01-analisis-correcciones-admin.md._
