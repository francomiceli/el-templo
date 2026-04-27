# Phase 104: Planes vs Programas + Bundle "Todos los Programas" — Specification

**Created:** 2026-04-27
**Ambiguity score:** 0.19
**Requirements:** 11 locked

## Goal

Separar formalmente el acceso a la planificación presencial del templo (gateado por `subscription_plans.planCategory='presencial'`) del acceso a programas virtuales (gateado por `program_enrollments` activo), e introducir un nuevo `subscription_plan` "Todos los Programas" — marcado con `grants_all_programs=true` — que durante su vigencia inscribe al usuario en todos los `programs.isActive=true`. Habilitar UX de selección de programa en el weekly view del member app y reemplazar el gating frágil de la página de reservas por una capability explícita `hasPresencialPlan`.

## Background

El modelo de datos ya separa planes (`subscription_plans`) y programas (`programs`), con `subscription_plans.linkedProgramId` permitiendo auto-inscripción 1:1 al comprar un plan online. Hoy `el-templo-api/src/modules/sessions/routes.ts:266-281` deriva `goalPlanType` del enrollment activo y construye dayIds `GP-{tipo}-W{n}-{day}-{level}` para programas o `W{n}-{day}-{level}` para el templo, **pero no enforce ningún gating**: cualquier autenticado con suscripción ve cualquier sesión cuyo dayId se construya correctamente. El member app (`el-templo-app/src/modules/training/pages/TrainingIndex.vue:46`) bloquea con "Activá Tu Plan" si `!hasActiveSubscription`, sin importar si el usuario tiene un programa activo. La página de reservas (`el-templo-app/src/pages/ReservasPage.vue:9`) bloquea por `!hasActiveSubscription || isOnlineUser`, donde `isOnlineUser` se deriva del flag de sucursal virtual — un proxy frágil del concepto "no es presencial". No existe modelo de "acceso a todos los programas" ni mecanismo para que un usuario con múltiples enrollments simultáneos elija cuál ver. El pedido fue formalizado por audios de WhatsApp del 2026-04-27 (`.docs/WhatsApp Ptt 2026-04-27 at 13.30.16.txt`, `13.33.19.txt`, `13.43.05.txt`, `13.43.21.txt`, `13.43.41.txt`) con motivación explícita anti-piratería ("una persona externa puede comprar por 15 mil pesos esto y dar clases al aire libre y no es la idea").

## Requirements

1. **R1 — Nueva columna `grants_all_programs` en `subscription_plans`**: Bandera booleana que marca planes que dan acceso a todos los programas activos.
   - Current: La tabla `subscription_plans` no tiene ningún campo para representar acceso multi-programa; `linkedProgramId` solo soporta 1:1.
   - Target: Migración SQL que ejecuta `ALTER TABLE subscription_plans ADD COLUMN grants_all_programs BOOLEAN NOT NULL DEFAULT false`. Schema Drizzle (`el-templo-api/src/db/schema/subscription-plans.ts`) actualizado en consecuencia.
   - Acceptance: `pnpm db:migrate` aplica la migración limpiamente; un `SELECT grants_all_programs FROM subscription_plans` devuelve `false` para todos los planes existentes.

2. **R2 — Seed del plan bundle "Todos los Programas"**: Nuevo `subscription_plan` que activa el bundle con duración propia.
   - Current: No existe ningún plan con `grants_all_programs=true`.
   - Target: Migración SQL que inserta el plan con `name='Todos los Programas'`, `plan_tier='other'`, `plan_category='online_regular'`, `booking_mode='flexible'`, `linked_program_id=NULL`, `grants_all_programs=true`, `duration_days=30`, `price_regular=20000`, `price_zero=20000`, `country='AR'`, `currency='ARS'`, `is_active=true`.
   - Acceptance: `SELECT * FROM subscription_plans WHERE grants_all_programs = TRUE` devuelve exactamente una fila con los valores especificados.

3. **R3 — Auto-inscripción del bundle a todos los programas activos**: Al asignar/comprar un plan con `grants_all_programs=true`, el usuario queda inscripto en cada `program` con `is_active=true` que no tenga un enrollment activo previo.
   - Current: La asignación de plan solo crea un enrollment vía `linkedProgramId`. No hay lógica multi-enrollment.
   - Target: El servicio de subscriptions (`el-templo-api/src/modules/subscriptions/service.ts`) detecta `grants_all_programs` al crear una suscripción y crea un `program_enrollment` (status='active', currentWeek=1) por cada programa activo donde no haya ya enrollment activo del mismo usuario. Idempotente.
   - Acceptance: Test de integración: crear suscripción para usuario sin enrollments con plan bundle → query `SELECT COUNT(*) FROM program_enrollments WHERE user_id=? AND status='active'` devuelve `count(programs WHERE is_active=true)`. Re-asignar el mismo plan no crea duplicados.

4. **R4 — Cierre de enrollments al expirar/cancelar suscripción bundle**: Cuando una suscripción con `grants_all_programs=true` pasa a `expired` o `cancelled`, los enrollments creados por esa suscripción se cierran.
   - Current: Las suscripciones expiradas no afectan enrollments.
   - Target: Las transiciones de status a `expired`/`cancelled` actualizan los enrollments asociados a `status='cancelled'`. Si el usuario tenía un enrollment del mismo programa adquirido por otra vía (ej. plan online_regular previo), ese enrollment NO se toca — solo los creados por el bundle.
   - Acceptance: Test de integración: usuario con bundle → 5 enrollments activos → expirar suscripción bundle → 5 enrollments en status='cancelled'. Test secundario: usuario con plan online_regular previo + bundle nuevo → expirar bundle → enrollment del plan previo permanece active.

5. **R5 — Nueva columna `users.current_program_enrollment_id`**: Puntero al programa activo del usuario (cuál muestra hoy en home).
   - Current: La tabla `users` no tiene este campo. La API deriva implícitamente del único enrollment activo.
   - Target: Migración SQL `ALTER TABLE users ADD COLUMN current_program_enrollment_id INT NULL, ADD CONSTRAINT fk_users_current_program FOREIGN KEY (current_program_enrollment_id) REFERENCES program_enrollments(id) ON DELETE SET NULL`. Schema Drizzle actualizado.
   - Acceptance: Migración aplica; columna existe nullable con FK; valores por default = NULL; eliminar un enrollment con FK seteada deja `current_program_enrollment_id` en NULL.

6. **R6 — Endpoint para set/get del programa activo**: El member app puede leer y cambiar `currentProgramEnrollmentId`.
   - Current: No existe endpoint.
   - Target: `GET /members/me/current-program` devuelve `{ enrollmentId: number | null, program: {...} | null }` derivado del valor en users; `PUT /members/me/current-program` con body `{ enrollmentId: number | null }` valida que el enrollment exista, esté activo y pertenezca al usuario, luego escribe la columna. `null` se acepta como valor válido (significa "vista Templo") solo si el usuario tiene un plan presencial activo.
   - Acceptance: Test de integración: GET inicial → `{enrollmentId: null, ...}`; PUT con enrollment válido del usuario → 200 + valor persistido en DB; PUT con enrollment de otro usuario → 403; PUT con `null` siendo usuario sin plan presencial → 403; PUT con `null` siendo usuario presencial → 200 + columna NULL.

7. **R7 — Gating de `/sessions/*` por tipo de dayId**: Las sesiones del templo (`W*`) requieren plan presencial; las de programa (`GP-*`) requieren enrollment activo en ese programa.
   - Current: `el-templo-api/src/modules/sessions/routes.ts` (handlers de `/sessions/weekly` y `/sessions/daily`) no validan ownership del tipo de session — solo verifican autenticación.
   - Target: Después de construir el dayId, los handlers validan: si dayId empieza con `W` → user debe tener una suscripción activa con `planCategory='presencial'`; si dayId empieza con `GP-{type}-` → user debe tener un `program_enrollment` con status='active' cuyo programa tenga `goalPlanType=type`. Si la validación falla, devuelve 403 con mensaje explícito.
   - Acceptance: Test de integración (4 casos): (a) usuario online-only pidiendo session `W*` → 403; (b) usuario sin enrollment pidiendo session `GP-piernas_gluteos-*` → 403; (c) usuario presencial pidiendo `W*` → 200; (d) usuario con enrollment al programa correcto pidiendo `GP-{type}-*` → 200.

8. **R8 — Parámetro `view` en `/sessions/weekly` y `/sessions/daily`**: El frontend elige qué vista renderizar; sin parámetro, la API usa default basado en `currentProgramEnrollmentId`.
   - Current: La API decide automáticamente: si hay enrollment con goalPlanType → fuerza `GP-`; si no → `W`.
   - Target: Aceptar query param `view=templo|program`. Con `view=templo` construye dayId `W*`, con `view=program` usa el programa apuntado por `currentProgramEnrollmentId` (404 si NULL). Sin `view`: si `currentProgramEnrollmentId` no es NULL → vista programa; si es NULL y hay plan presencial → templo; si ninguno → 404. Respuesta incluye campo `view` indicando cuál se sirvió.
   - Acceptance: Test de integración: GET `/sessions/weekly?view=templo` siendo presencial+programa → sesiones W*; GET `/sessions/weekly?view=program` mismo usuario → sesiones GP-*; GET sin `view` con `currentProgramEnrollmentId=null` y plan presencial → sesiones W\*.

9. **R9 — Selector de programa en weekly view del member app**: El usuario puede cambiar entre programas (y Templo si presencial) desde el header del weekly view.
   - Current: `el-templo-app/src/modules/training/pages/TrainingIndex.vue` y `useWeekData.ts` no tienen UI ni lógica de selección.
   - Target: Componente selector en el header del weekly view que abre un sheet/dialog listando: (a) cada `program_enrollment` activo del usuario con su nombre y `currentWeek/durationWeeks`; (b) opción "Templo" si el usuario tiene plan presencial activo. Tap en una opción llama `PUT /members/me/current-program` y refresca el weekly view. El selector se oculta si el usuario tiene una sola opción posible.
   - Acceptance: UAT manual con 3 perfiles: (i) presencial puro → sin selector visible, ve weekly Templo; (ii) online con 1 programa → sin selector visible, ve weekly del programa; (iii) presencial + bundle → selector visible con N+1 opciones (N programas + Templo), cambiar opción re-rendea el weekly view.

10. **R10 — Entrada al ícono Entrenar para usuarios online-only**: Usuarios con suscripción online (sin plan presencial) ya no caen en el bloqueo "Activá Tu Plan".
    - Current: `TrainingIndex.vue:9-29` muestra estado bloqueado si `!hasActiveSubscription`. Un usuario online-only entra y ve el bloqueo aunque tenga programas activos.
    - Target: La condición de bloqueo cambia a "no tiene plan presencial activo Y no tiene programas activos". Si tiene programas activos, va directo al weekly view de su `currentProgramEnrollmentId` (o el primer enrollment si es NULL en este perfil).
    - Acceptance: UAT manual: usuario con solo plan online_regular activo → tap en Entrenar → ve weekly view del programa correspondiente (no la pantalla "Activá Tu Plan"). Usuario sin plan ni enrollment → sigue viendo "Activá Tu Plan".

11. **R11 — Reemplazo del gating de ReservasPage por `hasPresencialPlan`**: Las reservas se bloquean basándose en plan presencial, no en proxy de sucursal virtual.
    - Current: `el-templo-app/src/pages/ReservasPage.vue:9` usa `!hasActiveSubscription || isOnlineUser` donde `isOnlineUser = profile.branchIsVirtual ?? false`.
    - Target: `userStore` expone computed `hasPresencialPlan = subscription?.plan?.planCategory === 'presencial'` (basado en suscripción activa). La condición de `ReservasPage` cambia a `!hasPresencialPlan`. El bloqueo se aplica a: usuarios sin suscripción, con plan online (regular/goal/coach), con bundle.
    - Acceptance: UAT manual con 4 perfiles: (i) sin suscripción → bloqueado; (ii) plan presencial → puede reservar; (iii) plan online → bloqueado; (iv) bundle "Todos los Programas" → bloqueado.

## Boundaries

**In scope:**

- Migración A: `ALTER TABLE subscription_plans ADD COLUMN grants_all_programs BOOLEAN NOT NULL DEFAULT false` + actualización del schema Drizzle.
- Migración B: seed del plan "Todos los Programas" (online_regular, 30 días, $20.000 ARS, grantsAllPrograms=true, country=AR, currency=ARS).
- Migración C: `users.current_program_enrollment_id INT NULL` con FK a `program_enrollments(id)` ON DELETE SET NULL.
- Service de subscriptions: auto-creación de enrollments al crear suscripción con `grants_all_programs=true`; auto-cierre de esos enrollments al expirar/cancelar la suscripción bundle.
- Endpoints `GET/PUT /members/me/current-program`.
- Gating de `/sessions/weekly` y `/sessions/daily` por tipo de dayId.
- Parámetro `view` en endpoints de sessions con resolución default basada en `currentProgramEnrollmentId`.
- Member app: selector de programa en weekly view header.
- Member app: relajación del bloqueo en `TrainingIndex.vue` para online-only.
- Member app: reemplazo de `isOnlineUser` por `hasPresencialPlan` en `ReservasPage.vue`.
- Admin: toggle `grantsAllPrograms` en formularios de creación/edición de planes (`PlanFormDialog`).
- Tests de integración para los endpoints nuevos y para el gating de sessions.

**Out of scope:**

- Aceleración de programas (saltar `sessionsPerWeekToAdvance`) — descartado: era error de transcripción de "acceder a"; no es feature.
- Progreso/badges/% completado/UI de "mis programas completados" — diferido al milestone "AURA economy" del roadmap.
- Adaptación del programa al nivel del usuario (alfa/delta/sigma/omega) — fuera de alcance, modelo actual ya adapta sesiones por nivel.
- Cambio de `subscription_plans.bookingMode` a nullable — cambio de schema mayor, no necesario para este pedido.
- Migración del catálogo de programas existentes a un nuevo modelo de "purchased vs assigned" — no se introduce esta distinción.
- Endpoint admin para gestionar enrollments del bundle (cancelación granular) — el cierre es atómico a la suscripción.
- Versiones cortas (1 mes) y largas (3 meses) de cada programa — la duración del bundle resuelve el problema de duraciones desiguales.
- Lógica de "elegir un programa por defecto al activar bundle" más sofisticada que "primer programa por id ASC" — heurística simple suficiente para v1.
- Soft-delete o historial de qué programa estaba activo cuando — solo se guarda el actual.
- Análisis/reportes de uso del bundle por país o sucursal — fuera de scope, va con reporting general.

## Constraints

- Schema migrations deben seguir el patrón del runner custom `el-templo-api/src/db/run-migrations.ts` (ver CLAUDE.md): nada de `drizzle-kit migrate`. La columna `grants_all_programs` es `NOT NULL DEFAULT false` para no requerir backfill.
- La auto-creación de enrollments del bundle debe ser idempotente (re-run de la lógica no crea duplicados) y atómica con la creación de la suscripción (misma transacción DB).
- El gating de sessions debe rechazar con 403 explícito (no 404) para que el frontend pueda diferenciar "no autorizado" de "session no existe".
- El parámetro `view` debe ser optional para mantener backward-compat con clientes existentes (apps en producción no lo enviarán hasta que se haga release).
- El selector del weekly view debe ocultarse cuando el usuario tiene una sola opción real (no mostrar UI inútil).
- `currentProgramEnrollmentId` debe limpiarse (set a NULL) cuando el enrollment apuntado pasa a status != 'active'. Esto puede resolverse en el service al cambiar status, o vía cleanup batch — decidir en plan-phase.
- Los textos UI nuevos van en español (UI del member app y admin).
- No instalar/actualizar dependencias (memoria del usuario: `feedback_no_auto_install_deps`).
- No hacer push a master (memoria: `feedback_staging_first_strict`); commits locales únicamente.

## Acceptance Criteria

- [ ] Migración A aplicada: `subscription_plans.grants_all_programs` existe como BOOLEAN NOT NULL DEFAULT false.
- [ ] Migración B aplicada: existe exactamente 1 row en `subscription_plans` con `grants_all_programs=true` y los valores especificados en R2.
- [ ] Migración C aplicada: `users.current_program_enrollment_id` existe como INT NULL con FK a `program_enrollments(id)`.
- [ ] Crear suscripción bundle para usuario sin enrollments → enrollments activos = N (todos los programas activos).
- [ ] Cancelar suscripción bundle → todos los enrollments creados por ella pasan a `cancelled`.
- [ ] `GET /members/me/current-program` devuelve enrollment correcto o `null`.
- [ ] `PUT /members/me/current-program` valida ownership y status; rechaza enrollment ajeno o expirado con 403.
- [ ] `GET /sessions/weekly?view=templo` para usuario online-only devuelve 403.
- [ ] `GET /sessions/weekly?view=program` para usuario sin enrollment devuelve 403.
- [ ] `GET /sessions/weekly` sin `view` resuelve a la vista correcta según `currentProgramEnrollmentId`.
- [ ] Member app: usuario presencial+bundle ve selector con N+1 opciones; cambiar re-rendea weekly view.
- [ ] Member app: usuario online-only entra al ícono Entrenar y ve weekly view de su programa (no "Activá Tu Plan").
- [ ] Member app: `ReservasPage` muestra "Activá Tu Plan" para usuarios con plan online (cualquier categoría) y bundle.
- [ ] Admin: `PlanFormDialog` permite togglear `grantsAllPrograms` al crear/editar planes.
- [ ] Tests de integración cubren los 11 requirements; suite verde con `pnpm test`.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                             |
| ------------------- | ----- | ----- | ------ | ----------------------------------------------------------------- |
| Goal Clarity        | 0.85  | 0.75  | ✓      | Goal específico con tres componentes claros (split + bundle + UX) |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | Out-of-scope explícito y razonado para 9 ítems                    |
| Constraint Clarity  | 0.70  | 0.65  | ✓      | Constraints técnicos y de proceso enumerados                      |
| Acceptance Criteria | 0.75  | 0.70  | ✓      | 14 checkboxes pass/fail; 11 reqs con acceptance individual        |
| **Ambiguity**       | 0.19  | ≤0.20 | ✓      | Gate passed — proceed to discuss-phase                            |

## Interview Log

| Round | Perspective     | Question summary                                 | Decision locked                                                                           |
| ----- | --------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 0     | Pre-spec        | (5 audios WhatsApp + análisis previo en chat)    | 3 casos de usuario (presencial, presencial+programa, online-only) + bundle como objetivo  |
| 0     | Researcher      | ¿Cómo está hoy el modelo de planes vs programas? | Modelo ya separado; falta gating + bundle + UI selector                                   |
| 0     | Simplifier      | ¿Mínimo viable?                                  | Bundle como subscription_plan + flag + auto-enroll; sin badges ni aceleración             |
| 0     | Boundary Keeper | ¿Qué NO va?                                      | Aceleración (descartada), badges (diferidos), versiones cortas de programas (innecesario) |
| 0     | Failure Analyst | ¿Anti-piratería cómo se enforce?                 | Gating en /sessions/\* por tipo de dayId, no por endpoint; 403 explícito                  |
| 0     | Seed Closer     | ¿Cómo modelar "qué programa estoy viendo hoy"?   | users.current_program_enrollment_id (FK nullable); selector escribe ahí                   |

[Auto-selected en Step 3: ambigüedad inicial = 0.19, ≤ 0.20 con todos los mínimos cumplidos. Spec generado directamente desde contexto consolidado de la conversación previa.]

---

_Phase: 104-planes-vs-programas-bundle_
_Spec created: 2026-04-27_
_Next step: /gsd-discuss-phase 104 — implementation decisions (cómo hacer auto-enroll atómico, cómo invalidar `currentProgramEnrollmentId` cuando expira el enrollment, qué endpoint admin para inspeccionar enrollments del bundle, etc.)_
