# Roadmap: El Templo

## Milestones

- ✅ **v1.0 Training Module** — Phases 1-12 (shipped 2026-02-03)
- ✅ **v2.0 Admin App** — Phases 13-28 (shipped 2026-02-28)
- ✅ **v3.0 Landing Page** — Phases 29-44 (shipped 2026-03-03)
- ✅ **v4.0 → v4.85 Ecosystem / Admin / Stores / Modelo Financiero** — Phases 45-114
- ✅ **v5.0 → v5.4 Métricas, Entrenamiento, Contable, Reforma del Admin** — Phases 120-156
- ✅ **v5.5 → v5.8 Referidos, Actividades con Aura, Sesiones de Prueba** — Phases 157-165 (archivo: `milestones/v5.8-ROADMAP.md`)
- ✅ **v6.0 Tenancy — El Templo pasa a ser tenant #1** — Phases 166-178 (SHIPPED 2026-08-26 — archivo completo en `milestones/v6.0-ROADMAP.md`)
- 🚧 **Fases en vuelo fuera de milestone** — 179 (referidos partners/marcas) y 180 (freemium etapa 2): en master `9ecc1c2e`, migs 0210+0215, cierran fuera de v6.1. **No se renumeran ni se tocan desde este roadmap.**
- 🚧 **v6.1 Módulo Gimnasio** — Phases 181-192 (planned)

> El detalle de las fases 1-178 vive en los archivos de milestone (`milestones/v6.0-ROADMAP.md`, `milestones/v5.8-ROADMAP.md`) y en `MILESTONES.md`. Este documento arranca en la fase 181.

---

# 🚧 v6.1 Módulo Gimnasio (Phases 181-192)

## Overview

v6.0 dejó a El Templo corriendo como tenant #1 de una plataforma multi-tenant con enforcement en 5 capas y el onboarding del tenant 2 técnicamente desbloqueado. v6.1 construye **el primer módulo de producto para tenants que NO son El Templo** y lo pone a prueba con un gimnasio real.

El recorrido: primero se cierra la **fase de diseño bloqueante** (las 7 definiciones del brief + la superficie member-facing), porque la definición 1 —¿Calistenia y Gimnasio comparten modelo de datos?— condiciona absolutamente todo lo que viene. En paralelo conceptual se levanta la **capa de plataforma super-owner** (rol propio, wizard de alta con aprovisionamiento completo, panel de tenants). Después baja la cadena natural del producto: **catálogo** de ejercicios (global de la plataforma + local por gimnasio, taxonomías cerradas, nada se borra) → **plantillas y rutinas** (se clonan, la asignada es copia y jamás muta) → **ejecución y registro** con fricción mínima, que es el corazón del módulo → **valoración y evolución** del alumno (récord, vez anterior, sesiones del mes) → **panel del profesor** con las señales de alarma servidas sin buscarlas. Cierra con la prueba de fuego: **un gimnasio real dado de alta con el wizard, operando el módulo en producción**.

## Reglas duras del milestone (aplican a TODAS las fases)

1. **Módulo duro (A1):** tablas propias, rutas propias, **cero imports desde/hacia el SPOM en ninguna dirección**. Acople permitido solo por FK a `users`/`branches`/`tenants` + lectura de `subscriptions`. `exercises` del SPOM **no se toca** (A2). Cada tenant ve UN solo sistema de entrenamiento.
2. **Gateado por `module.gimnasio.enabled`** (mecanismo de la fase 176: flag en `tenant_settings` + guard `requireModule` → 404). Toda ruta nueva entra al manifiesto de rutas fail-closed o el CI queda rojo.
3. **Migraciones reservan desde 0216** (prod en 0215 tras el tren 179+180). SQL hand-written junto al schema Drizzle, mismo commit. Nunca `drizzle-kit migrate`. Sin `;` dentro de comentarios `--`.
4. **Staging-first estricto:** todo llega a prod vía `staging`. Push y SSH son gates humanos.
5. **Todo parámetro configurable vive en `tenant_settings`** (autogestión, timeout de abandono, plazo de edición, umbrales del panel del profe) — nunca hardcodeado.
6. **Guardrails del brief:** nada se borra (se desactiva); taxonomías validadas en la carga; aislamiento total entre gimnasios (incluido el buscador); la rutina asignada no muta; privacidad sin toggle (aviso único en onboarding); el registro guarda lo **realizado**, no lo planificado; pesos/reps aceptan cero y parciales.

## Phases

**Phase Numbering:**

- Integer phases (181, 182, …): trabajo planificado del milestone
- Decimal phases (181.1, …): inserciones urgentes (marcadas INSERTED)
- 179-180 están tomadas por fases en vuelo fuera del milestone — este roadmap arranca en 181

- [x] **Phase 181: Diseño del módulo Gimnasio (bloqueante)** - Responder las 7 definiciones del brief + la superficie member-facing antes de escribir código de producto
- [ ] **Phase 182: Plataforma — rol super-owner + wizard de alta de tenant** - Crear un gimnasio nuevo con aprovisionamiento completo en un flujo
- [ ] **Phase 183: Plataforma — panel de tenants** - Ver métricas por tenant y gobernar su estado (suspender/archivar)
- [ ] **Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías** - Tablas nuevas, catálogo global de la plataforma y ejercicios propios por gimnasio, taxonomías cerradas validadas
- [ ] **Phase 185: Catálogo — ciclo de vida y buscador** - Copia local automática, promoción local→global, desactivación sin romper historial, búsqueda por nombre/alias/taxonomías
- [ ] **Phase 186: Carga inicial del catálogo** - 40-80 ejercicios publicados, generados con agentes y revisados por humano, con protocolo de migración
- [ ] **Phase 187: Plantillas de rutina** - Plantillas globales y del gimnasio, estructura día→ejercicio con superseries/circuitos, creación desde cero por el profe
- [ ] **Phase 188: Asignación de rutinas al alumno** - Clonar y asignar como copia inmutable, una activa por vez, historial, modificaciones fechadas, autogestión configurable
- [ ] **Phase 189: Ejecución y registro de la sesión** - El corazón: fricción mínima, estados de sesión, registro por serie de lo efectivamente realizado
- [ ] **Phase 190: Valoración, evolución y edición con recálculo** - Fácil/Adecuado/Difícil + molestia, récord de peso, vez anterior, sesiones del mes, y edición dentro de plazo que recalcula
- [ ] **Phase 191: Panel del profesor** - Lista de alumnos con señales servidas sin buscarlas y ficha con planificado vs realizado
- [ ] **Phase 192: Onboarding del tenant 2 (cierre del milestone)** - Un gimnasio real dado de alta con el wizard y operando en producción
- [ ] **Phase 194: Invitaciones (fuera del milestone)** - Referidos → Invitaciones: 3 accesos gratis en prueba, cupo 2/mes, ventana 90 días, descuento por conversión con flag por plan, leads con origen Invitación
- [ ] **Phase 197: Entrenar en tabs + canasta + bloque libre (fuera del milestone)** - Entrenar con 4 tabs (Semana · Libre · Desafíos · Conquer), canasta de bloques de su subnivel filtrada por figura tocable, bloque libre en el player con +5 AURA (primero del día que llega a 10')
- [ ] **Phase 200: Anatomía funcional (fuera del milestone)** - Un solo modelo de contenido (archivos) músculo ↔ zona ↔ ruta ↔ rol que reemplaza a `muscle-zones.ts`, con la sección Anatomía del admin para profes, la Guía partida en dos (Empezá acá + Tu cuerpo) y el cuerpo tocable en Entrenar
- [ ] **Phase 204: Usuarios Wellhub como tipo de usuario (fuera del milestone)** - Distinguir a quien usa Wellhub en admin, Horarios y métricas — visitantes nuevos, ex-alumnos y socios activos vinculados por email — y que sus reservas no toquen el plan del socio

## Phase Details

### Phase 181: Diseño del módulo Gimnasio (bloqueante)

**Goal**: Las decisiones que condicionan todo el milestone quedan resueltas y escritas antes de construir — sobre todo la definición 1 (modelo de datos Calistenia vs Gimnasio) y dónde vive la superficie member-facing multi-tenant
**Depends on**: Nothing (primera fase del milestone; bloquea a todas las demás)
**Requirements**: DIS-01, DIS-02
**Success Criteria** (what must be TRUE):

1. Existe un documento de diseño donde las 7 definiciones del brief están respondidas con decisión explícita y fundamento: modelo de datos Calistenia vs Gimnasio (prior A3: NO comparten), alcance global/local + promoción sin romper historial, comportamiento offline, estrategia de recálculo de récords, modelado de superseries/circuitos, esquema e índices para "historial de este alumno en este ejercicio", y el mapa de parámetros configurables en `tenant_settings`
2. La superficie member-facing multi-tenant está decidida y documentada (dónde viven ejecución y registro), con constancia explícita de que `el-templo-app` no se transforma y de si la decisión adelanta o no la discusión del split de repos
3. El diseño de datos respeta la frontera dura A1/A2 de forma verificable: tablas propias, cero imports SPOM en ninguna dirección, `exercises` intacta, y el acople limitado a FK sobre `users`/`branches`/`tenants` + lectura de `subscriptions`
4. Cada decisión del documento queda trazada a los requirements que habilita, de modo que las fases 182-192 puedan planificarse sin re-litigar el addendum A1-A7

**Plans**: 6 plans (6 olas secuenciales — todas escriben sobre el mismo documento)

Plans:

**Wave 1**

- [x] 181-01-PLAN.md — Esqueleto del doc 08, verificador estructural y precondiciones de plataforma (H-1..H-4)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 181-02-PLAN.md — Definición 1 (modelo de datos Calistenia vs Gimnasio) y Definición 2 (alcance global/local, ciclo de vida del catálogo, taxonomías)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 181-03-PLAN.md — Definiciones 3, 4 y 5 (offline y sync, recálculo de récords, superseries/circuitos)

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 181-04-PLAN.md — Definición 6 (entidades, FKs, índices, volumen) y Definición 7 (mapa de tenant_settings)

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 181-05-PLAN.md — DIS-02 (superficie member-facing multi-tenant) y seguridad del diseño (STRIDE)

**Wave 6** _(blocked on Wave 5 completion)_

- [x] 181-06-PLAN.md — Frontera A1/A2, trazabilidad REQ, reconciliación del README y firma de Franco

### Phase 182: Plataforma — rol super-owner + wizard de alta de tenant

**Goal**: Existe un actor por encima de los tenants que puede dar de alta un gimnasio nuevo, completamente aprovisionado, sin tocar la base a mano
**Depends on**: Phase 181 (el modelo del rol de plataforma se define ahí)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):

1. El super-owner se autentica con un rol de plataforma propio, distinto y separado de owner/admin/coach — un usuario de tenant nunca puede alcanzar sus rutas, y el super-owner no hereda permisos de tenant por accidente
2. El super-owner completa un wizard (identidad del gimnasio, info básica) y al terminar el tenant existe y es utilizable
3. El alta deja el tenant aprovisionado sin pasos manuales: sede virtual propia según receta 07 §1.4, `tenant_settings` con los defaults del milestone, módulos Templo OFF y `module.gimnasio.enabled` ON
4. Un tenant creado con el wizard queda aislado desde el minuto cero: sus datos no aparecen en ninguna consulta de otro tenant y las baterías de aislamiento siguen verdes

**Plans**: 10 plans (7 olas)

Plans:

**Wave 1**

- [ ] 182-01-PLAN.md — Schema `platform_users`/`platform_audit_log`, migración 0216, clasificación en `tenant-tables.ts` y variables de entorno de plataforma

**Wave 2** _(blocked on Wave 1 completion)_

- [ ] 182-02-PLAN.md — Auth de plataforma: segundo JWT con secreto y decorador propios, `POST /auth/login` + `GET /auth/me`, manifiesto y batería de cruce de tokens

**Wave 3** _(blocked on Wave 2 completion)_

- [ ] 182-03-PLAN.md — Rate limit del login de plataforma (checkpoint humano: instalar `@fastify/rate-limit` o limitador en memoria)
- [ ] 182-04-PLAN.md — Resolución de tenant pre-login por `Origin`/`X-Tenant-Slug` (D-18), CORS con regex anclada y no-regresión de El Templo

**Wave 4** _(blocked on Wave 3 completion)_

- [ ] 182-05-PLAN.md — `provisionTenant()` transaccional, `POST /tenants` + `GET /tenants/slug-disponible`, auditoría y batería de alta
- [ ] 182-06-PLAN.md — CLI de bootstrap del super-owner, runbook de infra en `deploy/` y enmienda D-18 en el doc 08 §H-3

**Wave 5** _(blocked on Wave 4 completion)_

- [ ] 182-07-PLAN.md — Batería `iso-04` de aislamiento de plataforma + caso de crons sobre un tenant recién aprovisionado
- [ ] 182-08-PLAN.md — Admin: instancia axios `platformApi`, store `platformAuth`, guard propio, login y home de `/plataforma`

**Wave 6** _(blocked on Wave 5 completion)_

- [ ] 182-09-PLAN.md — Admin: wizard `q-stepper` de 5 pasos, contraseña del owner y pantalla final (checkpoint de verificación humana)

**Wave 7** _(blocked on Wave 6 completion)_

- [ ] 182-10-PLAN.md — Gates humanos: infra en staging y prod (DNS, cert DNS-01, vhost wildcard), bootstrap del super-owner, tenant `demo` staging→prod y UAT de no-regresión

**UI hint**: yes

### Phase 183: Plataforma — panel de tenants

**Goal**: El super-owner puede ver cómo está cada gimnasio de la plataforma y gobernar su estado sin entrar a la base
**Depends on**: Phase 182
**Requirements**: PLAT-04, PLAT-05
**Success Criteria** (what must be TRUE):

1. El super-owner ve un listado de tenants con métricas por tenant (alumnos, clases, actividad) que le permiten distinguir de un vistazo un gimnasio vivo de uno inactivo
2. El super-owner suspende o archiva un tenant desde el panel y el cambio surte efecto inmediato (los usuarios de ese tenant reciben el 403 que ya existe desde v6.0)
3. El super-owner revierte una suspensión desde el mismo panel y el tenant vuelve a operar sin intervención manual
4. Las métricas del panel son agregados por tenant y jamás filtran datos de un gimnasio dentro del recuento de otro

**Plans**: TBD
**UI hint**: yes

### Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías

**Goal**: Todo gimnasio arranca con un catálogo curado de la plataforma y puede sumarle ejercicios propios, con taxonomías que no admiten basura
**Depends on**: Phase 181
**Requirements**: CAT-01, CAT-02, CAT-06
**Success Criteria** (what must be TRUE):

1. Un profe de cualquier gimnasio ve y usa los ejercicios del catálogo global de la plataforma sin que nadie se los haya copiado a su gimnasio
2. Un gimnasio crea ejercicios propios y solo él los ve: no aparecen en el catálogo de otro gimnasio ni en el global
3. Al cargar o editar un ejercicio, un valor fuera de las listas cerradas del §2.3 (14 grupos musculares, 25 equipamientos, 9 patrones) es rechazado con un error entendible
4. La categoría del ejercicio (7 valores) se muestra derivada por el mapeo fijo de A4 y no puede editarse a mano en ninguna superficie
5. Las tablas del catálogo son nuevas y `exercises` del SPOM queda byte a byte intacta

**Plans**: TBD
**UI hint**: yes

### Phase 185: Catálogo — ciclo de vida y buscador

**Goal**: El catálogo evoluciona (se personaliza, se promueve, se retira) sin que ningún registro histórico de ningún alumno quede huérfano
**Depends on**: Phase 184
**Requirements**: CAT-03, CAT-04, CAT-05, CAT-07
**Success Criteria** (what must be TRUE):

1. Un profe edita un ejercicio global, su gimnasio queda con una copia local editada, y el ejercicio global sigue idéntico para el resto de los gimnasios
2. La plataforma promueve un ejercicio local a global y todos los registros históricos y métricas de los alumnos que lo usaban siguen resolviendo al mismo ejercicio, sin duplicados ni récords perdidos
3. Un ejercicio desactivado desaparece del buscador y no puede sumarse a rutinas nuevas, pero todas las sesiones y récords viejos que lo referencian se siguen viendo completos
4. El profe encuentra un ejercicio escribiendo su nombre canónico o un alias, y filtra por grupo muscular, equipamiento y patrón
5. El buscador de un gimnasio nunca devuelve un ejercicio local de otro gimnasio

**Plans**: TBD
**UI hint**: yes

### Phase 186: Carga inicial del catálogo

**Goal**: La plataforma arranca con un catálogo real y usable, no con una tabla vacía
**Depends on**: Phase 185
**Requirements**: CAT-08
**Success Criteria** (what must be TRUE):

1. El catálogo global tiene entre 40 y 80 ejercicios en estado Publicado y los 9 patrones del §2.3 están cubiertos
2. Ningún ejercicio publicado duplica a otro por nombre o sinónimo, y toda taxonomía cargada pasa la validación de la fase 184
3. Todo ejercicio llegó a Publicado después de pasar por Borrador y por una revisión humana explícita — la generación con agentes nunca publica sola
4. La carga se ejecutó contra una base de prueba primero, con backup previo y de forma transaccional reversible, siguiendo el protocolo de migración del brief
5. Un profe de un gimnasio nuevo puede armar una rutina completa usando solo el catálogo inicial

**Plans**: TBD

### Phase 187: Plantillas de rutina

**Goal**: El profe tiene material de partida y herramientas para estructurar el entrenamiento de sus alumnos
**Depends on**: Phase 185 (Phase 186 para contenido real de catálogo)
**Requirements**: RUT-01, RUT-02, RUT-08
**Success Criteria** (what must be TRUE):

1. El profe ve plantillas globales de la plataforma y las plantillas propias de su gimnasio, y puede guardar plantillas nuevas que quedan solo en su gimnasio
2. El profe estructura una plantilla como día → ejercicio con orden, series objetivo, reps (valor o rango), peso sugerido opcional, descanso y observaciones
3. El profe agrupa ejercicios en superserie o circuito y esa agrupación se conserva al guardar, reabrir y clonar la plantilla
4. El profe arma una rutina desde cero eligiendo ejercicios del catálogo y la guarda como plantilla propia del gimnasio
5. Un alumno no puede crear plantillas ni rutinas desde cero en v1 (A5) — la superficie sencillamente no se lo ofrece

**Plans**: TBD
**UI hint**: yes

### Phase 188: Asignación de rutinas al alumno

**Goal**: El alumno tiene una rutina que es suya, estable y trazable — y el gimnasio decide si el alumno puede autoasignarse
**Depends on**: Phase 187
**Requirements**: RUT-03, RUT-04, RUT-05, RUT-06, RUT-07
**Success Criteria** (what must be TRUE):

1. El profe clona una plantilla, la ajusta y la asigna a un alumno con fecha de inicio (y fin opcional); la plantilla original queda sin tocar
2. Editar la plantilla después de asignarla no cambia absolutamente nada de la rutina que el alumno ya tiene
3. El alumno tiene una sola rutina activa a la vez y puede consultar las anteriores en su historial
4. Cuando el profe modifica la rutina en curso, el alumno ve el cambio identificado como modificación con su fecha, no como si siempre hubiera estado ahí
5. Con autogestión apagada (default) el alumno sin rutina ve una invitación a hablar con un profe —nunca una pantalla en blanco—; con autogestión prendida se autoasigna plantillas del catálogo de su gimnasio y quedan marcadas como autoasignadas

**Plans**: TBD
**UI hint**: yes

### Phase 189: Ejecución y registro de la sesión

**Goal**: El alumno registra lo que realmente hizo con la menor fricción posible — el corazón del módulo
**Depends on**: Phase 188 (y la superficie member-facing decidida en Phase 181 / DIS-02)
**Requirements**: REG-01, REG-02, REG-03, REG-04
**Success Criteria** (what must be TRUE):

1. El alumno completa una serie de un toque con "hice lo planificado", los valores del profe vienen precargados, la serie siguiente hereda el peso y los valores se ajustan con steppers en vez de teclado libre
2. El alumno puede cargar toda la sesión al final en vez de serie por serie, sin perder ningún dato
3. La sesión pasa por Pendiente / En curso / Completada / Abandonada: solo se marca Completada por cierre manual del alumno, y el timeout parametrizable (default 12h) la abandona conservando lo cargado sin sumarlo a la métrica
4. El registro por serie captura reps, peso, duración, distancia y —en peso corporal— lastre o asistencia; acepta cero y valores parciales; los pesos se guardan en kg con el modelo preparado para libras
5. El alumno (o el profe) reemplaza un ejercicio por una alternativa con un toque y lo que queda registrado es el ejercicio efectivamente realizado, no el planificado

**Plans**: TBD
**UI hint**: yes

### Phase 190: Valoración, evolución y edición con recálculo

**Goal**: El alumno le pone contexto a lo que hizo y ve que su esfuerzo acumula — y corregir un error nunca deja una métrica mintiendo
**Depends on**: Phase 189
**Requirements**: REG-05, VAL-01, VAL-02, EVO-01, EVO-02, EVO-03
**Success Criteria** (what must be TRUE):

1. Al terminar un ejercicio el alumno puede responder "¿Cómo te resultó?" (Fácil / Adecuado / Difícil) y saltearla nunca bloquea ni interrumpe la sesión
2. El alumno puede marcar molestia (Sí/No) indicando dónde y con un comentario libre, también opcional
3. El alumno ve su récord de peso por ejercicio con la fecha en que lo logró
4. Al abrir un ejercicio, el alumno ve qué hizo la última vez que lo entrenó, y ve sus sesiones completadas del mes con el mes anterior al lado
5. El alumno corrige o elimina registros hasta 24h después de finalizada la sesión (plazo parametrizable) y después queda solo-lectura salvo para el profe; toda alta, edición o baja deja los récords recalculados y correctos, sin quedar nunca un récord fantasma de un registro borrado

**Plans**: TBD
**UI hint**: yes

### Phase 191: Panel del profesor

**Goal**: El profe deja de planificar a ciegas: ve la brecha entre lo planificado y lo realizado, y las señales de alarma le saltan a la vista
**Depends on**: Phase 190
**Requirements**: PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):

1. El profe abre su panel y ve la lista de sus alumnos con rutina activa y última sesión registrada, sin filtrar ni buscar nada
2. Las señales aparecen destacadas en esa misma lista: molestia registrada con prioridad máxima, ejercicio marcado Difícil N sesiones seguidas (default 3), Fácil repetido, y alumno sin sesiones en N días (default 14)
3. El gimnasio ajusta esos umbrales desde `tenant_settings` y el panel refleja los valores del gimnasio, no constantes de código
4. La ficha del alumno muestra rutina asignada, historial de sesiones, planificado vs realizado por ejercicio y las valoraciones registradas
5. El profe ajusta series, reps y pesos de la rutina en curso desde la ficha, y solo ve alumnos de su propio gimnasio — nada cruza gimnasios

**Plans**: TBD
**UI hint**: yes

### Phase 192: Onboarding del tenant 2 (cierre del milestone)

**Goal**: La prueba de fuego del SaaS — un gimnasio real, que no es El Templo, operando en producción
**Depends on**: Phase 183 y Phase 191 (todo el módulo Gimnasio + toda la capa de plataforma)
**Requirements**: ONB-01
**Success Criteria** (what must be TRUE):

1. Un gimnasio real quedó dado de alta en producción usando el wizard del super-owner, sin ningún paso manual sobre la base
2. Sus profes cargaron ejercicios/plantillas y asignaron rutinas reales a alumnos reales usando el módulo Gimnasio
3. Al menos un alumno real registró sesiones completas y ve su evolución, y su profe ve esas sesiones en el panel
4. Ningún dato de El Templo (tenant 1) es visible desde el tenant 2 ni viceversa, verificado en producción con los verificadores de aislamiento de v6.0
5. El tenant 2 tiene los módulos Templo apagados y solo ve el sistema de entrenamiento del módulo Gimnasio

**Plans**: TBD

### Phase 194: Invitaciones (fuera del milestone v6.1)

**Goal**: El socio invita a alguien a entrenar; el invitado activa, queda en prueba con 3 accesos gratis en 10 días hábiles, entra al pipeline de leads, y si compra se activa el descuento por invitación con reglas anti-abuso
**Depends on**: Fases 157/158/173 (núcleo de referidos, ya en producción)
**Requirements**: brief `.planning/phases/194-invitaciones/194-BRIEF-INVITACIONES.md`; decisiones D-01..D-19 + addendum D-20..D-29 en `194-CONTEXT.md` (todas locked); Success Criteria SC-1..SC-6 (abajo) funcionan como requisitos (sin REQ-IDs formales)
**Success Criteria** (what must be TRUE):

1. Un socio activo comparte su link; el invitado (nuevo o ex socio ≥6 meses) activa la invitación, queda en `prueba` y reserva y hace check-in de hasta 3 clases en cualquier sede de su país durante 10 días hábiles
2. El cupo de 2 por mes y la ventana de 90 días por persona se respetan por ambos canales (app y recepción)
3. Si el invitado compra un plan habilitado (hasta 30 días después de vencer los accesos), ambos reciben el descuento; aplica "gana el mayor" frente a AURA/promos, tope 40% y tope en dinero por país configurable
4. Un plan `is_trial` nunca vuelve "activo" a nadie (status, cobertura, analytics): invariante centralizada en un único helper
5. "Mis invitados" muestra cupo, estados derivados y descuento; el admin muestra el lead con origen Invitación, etapa y accesos x/3, y el reporte del programa
6. Los vínculos existentes conservan su historial y descuentos; el vínculo invertido (Guido/Valentina) queda corregido por migración

**Plans**: 30 plans (ejecución secuencial en un solo worktree; olas = orden de dependencias). Viajan juntos: 194-14..194-18 (árbitro) + 194-23 (admin). La invariante 194-01/03 va en el mismo tren o antes que 194-09.

Plans:

- [ ] 194-01-PLAN.md — Invariante D-03 parte 1: helper `shared/membership.ts` + recomputeUserStatus, active-member, listado de alumnos
- [ ] 194-02-PLAN.md — Caracterización de cobros (4 charge-paths + 3 previews + veredicto D-22), solo tests
- [ ] 194-03-PLAN.md — Invariante D-03 parte 2: cobertura de membresía, descuento, frecuencia, renovaciones + export SEPA con importe (D-25)
- [ ] 194-04-PLAN.md — Tabla `invitations` (mig 0255) + gates de tenancy + fixture del 2.º gimnasio
- [ ] 194-05-PLAN.md — Flag `allows_invitation_discount` (0256, D-23, backfill con guard) + planes Invitación AR/ES (0257) + guard semana de partners
- [ ] 194-06-PLAN.md — D-07 cierre de accesos al comprar + `assignInvitationPlan` interno (plan Invitación no asignable por rutas) + reservas pendientes vs saldo
- [ ] 194-07-PLAN.md — Días hábiles (D-15) + parámetros del programa en tenant_settings + GET/PUT settings
- [ ] 194-08-PLAN.md — InvitationService: cupo (D-10), invitador vigente, elegibilidad D-11/D-12, identidad
- [ ] 194-09-PLAN.md — InvitationService: activación con locks + compensación; anulación; uso real de accesos (SC-1)
- [ ] 194-10-PLAN.md — Rutas app: eligibility + activate (canal self-service)
- [ ] 194-11-PLAN.md — Registro sin vínculo pending (D-26b) + teléfono obligatorio con código + adaptación de 4 tests de referidos
- [ ] 194-12-PLAN.md — Canal asistido (D-16) + "Lo invita" en Nuevo en Prueba (D-24) + D-17 sin cupo
- [ ] 194-13-PLAN.md — Leads: gate de conversión con invitación + conversión atribuida + cron de perdidos (D-18)
- [ ] 194-14-PLAN.md — Árbitro de descuentos (núcleo) + % por lado + vínculo al comprar + AURA por monto
- [ ] 194-15-PLAN.md — Árbitro en assignPlan + getPricingPreview
- [ ] 194-16-PLAN.md — Árbitro en changePlanAfterCurrent
- [ ] 194-17-PLAN.md — Árbitro en changePlanNow + getChangePlanPreview
- [ ] 194-18-PLAN.md — Árbitro en renewSubscription + getRenewalPreview con montos + D-22 (condicional)
- [ ] 194-19-PLAN.md — "Mis invitados" API (cupo, link, estados derivados, invitedBy)
- [ ] 194-20-PLAN.md — Reporte D-19 + bandeja de leads de invitación (etapa en SQL) + filtro origen en alumnos
- [ ] 194-21-PLAN.md — Migraciones de datos de prod: 0258 (vínculo 3, D-28) y 0259 (copy notificación/aviso)
- [ ] 194-22-PLAN.md — Rebrand de copy de la API + segmento `referidos_pendientes` remapeado
- [ ] 194-23-PLAN.md — Admin: previews por monto del servidor (Pitfall 6) — viaja con el árbitro
- [ ] 194-24-PLAN.md — Admin: ficha Invitaciones + crear/anular invitación + altas con "Lo invita"/"Invitado por"
- [ ] 194-25-PLAN.md — Admin: flag en planes + Configuración ▸ Invitaciones (tope en dinero por país)
- [ ] 194-26-PLAN.md — Admin: Reportes ▸ Invitaciones + filtro de alumnos + rebrand restante
- [ ] 194-27-PLAN.md — App: Mis invitados + rebrand + alias `/mis-referidos`
- [ ] 194-28-PLAN.md — App: landing `/invitacion/:code` + Activar invitación + registro/login con código + versión 1.8.2
- [ ] 194-29-PLAN.md — Pre-flight de release: numeración, gates y builds de los 3 paquetes, checklist
- [ ] 194-30-PLAN.md — Checkpoints humanos: feriados ES (D-29), backup + validación, UAT AR+ES, SEPA con Leandro

### Phase 197: Entrenar en tabs + canasta de bloques + bloque libre (fuera del milestone v6.1)

**Goal**: Entrenar se ordena en 4 tabs y el socio puede elegir y hacer un bloque de trabajo suelto de las planis aprobadas de su subnivel, buscándolo por zona del cuerpo, en el player, sumando 5 AURA con el primer bloque del día que llega a 10 minutos
**Depends on**: intro TV "recorrido" en master (`tv/muscle-zones.ts`, `25f941f4d`). Independiente de la 196 (D-01: Conquer queda "Próximamente")
**Requirements**: `197-CONTEXT.md` (D-01..D-18), decisiones de Franco 2026-10-20
**Success Criteria** (what must be TRUE):

1. Entrenar muestra 4 tabs (Semana · Libre · Desafíos · Conquer). Semana: tira de días, título + CTA, chips de bloque con figura (Nucleus por defecto) y lista de ejercicios. Desafíos y Conquer: "Próximamente". Sin plan: vidriera desenfocada con "Activá Tu Plan"
2. Libre lista los bloques de trabajo aprobados del subnivel hasta hoy (sin GP, con ROM, sin INITIUM), sin duplicados, de 20 en 20, filtrables por grupo de zona tocando la figura o los chips, con la sugerencia de complemento
3. Un bloque se juega en el player en modo bloque libre. Cuenta y se guarda al terminar sus ejercicios (si abandona, no se guarda nada). Si el formato no declara minutos, el reloj corre libre
4. +5 AURA (fuente nueva `extra_block` en `aura_config`) solo para el primer bloque libre del día (zona de la sede) que llega a 10 minutos
5. El bloque libre se registra en `extra_blocks_completed` y no cambia racha, programa, RPE/evaluación, `todaySession` ni contadores (tests de integración)
6. Contrastes del player y la Guía en sólido (WCAG 2.2) y link "Probá el modo Libre" en la card de hoy de Mi Templo

**Plans**: 23 plans (ejecución secuencial en un solo worktree, una ola por plan; ejecutor sonnet; sin typecheck ni tests locales: los tests se escriben y corren en CI). Reglas del ejecutor: `197-EXECUTOR-RULES.md`.

Plans:

- [x] 197-01-PLAN.md — API: migraciones 0285 (fuente AURA `extra_block` = 5) y 0286 (`extra_blocks_completed`) + schema + AuraSourceType
- [x] 197-02-PLAN.md — API: gates de tenancy de la tabla nueva (gym-owned strict `free-blocks`, conteos 104/109, limpieza de fixtures)
- [x] 197-03-PLAN.md — API: `session-view`/`session-response` fuera de sessions/routes + grupos de zona puros en muscle-zones (D-10)
- [x] 197-04-PLAN.md — API: `zones`/`groups` por bloque en /weekly y /daily + fixtures de la canasta
- [x] 197-05-PLAN.md — API (TDD): ranking puro de la canasta (dedupe, orden, "ya lo trabajaste hoy", página) + weekDayToDate
- [x] 197-06-PLAN.md — API: FreeBlocksService (subnivel, ≤ hoy en tz de la sede, sin GP, roles, contexto de hoy, AURA disponible)
- [x] 197-07-PLAN.md — API: GET /sessions/free-blocks y /free-blocks/:blockId + manifiesto 475 + integración de la canasta
- [x] 197-08-PLAN.md — API: POST /sessions/free-blocks/complete con AURA del día (≥10', primero del día, extra_block_day) + manifiesto 476 + tests
- [x] 197-09-PLAN.md — API: invariante de contadores (D-13) + aislamiento de tenant de las 3 rutas
- [x] 197-10-PLAN.md — App: tokens/mixins del rework + figura anatómica compartida (copia única con cmp, chunk propio, D-07)
- [x] 197-11-PLAN.md — App: utilidades puras (formato D-11, CTA de Semana, rótulos de semana, sugerencia de Libre) + tests
- [x] 197-12-PLAN.md — App: Semana A (useTrainingWeek, rótulo y flechas, tira de días, título + CTA) + DayPlayer abre otras semanas
- [x] 197-13-PLAN.md — App: Semana B (chips apilados, figura con Nucleus por defecto, lista de ejercicios)
- [x] 197-14-PLAN.md — App: tipos, store de la canasta y cierre del bloque libre
- [x] 197-15-PLAN.md — App: player en modo libre (neutraliza NUCLEUS/DEUTEROS, último bloque, barrita dorada, sin ajustes)
- [x] 197-16-PLAN.md — App: pantallas del bloque libre (inicio, celebración, resumen con "Seguir entrenando")
- [x] 197-17-PLAN.md — App: ruta /training/libre/:blockId y FreeBlockPlayer (Session sintética XB, guardado y AURA)
- [x] 197-18-PLAN.md — App: tab Libre (aviso de AURA, sugerencia, figura tocable, chips, lista de 20 en 20, vacío)
- [x] 197-19-PLAN.md — App: Entrenar en 4 tabs "puertas" + Próximamente + ?tab=libre + vidriera sin plan; fin del carrusel viejo
- [x] 197-20-PLAN.md — App: contraste D-16 en player (sesión completa incluida) y Guía
- [x] 197-21-PLAN.md — App: link "Probá el modo Libre" en la card de hoy de Mi Templo (D-17)
- [x] 197-22-PLAN.md — Verificación visual medida (capturas 360/390/412, contraste, viewport, desborde) — checkpoint de build
- [ ] 197-23-PLAN.md — UAT guiado de Franco en staging (checkpoint)


## Progress

**Execution Order:** 181 → 182 → 183 → 184 → 185 → 186 → 187 → 188 → 189 → 190 → 191 → 192

(182-183 pueden solaparse conceptualmente con 184-186: la capa de plataforma no depende del diseño del catálogo salvo el default de módulos de PLAT-03.)

| Phase                        | Milestone | Plans Complete | Status      | Completed |
| ---------------------------- | --------- | -------------- | ----------- | --------- |
| 181. Diseño del módulo       | v6.1      | 0/6            | Not started | -         |
| 182. Rol plataforma + wizard | v6.1      | 0/TBD          | Not started | -         |
| 183. Panel de tenants        | v6.1      | 0/TBD          | Not started | -         |
| 184. Catálogo modelo + taxos | v6.1      | 0/TBD          | Not started | -         |
| 185. Catálogo ciclo de vida  | v6.1      | 0/TBD          | Not started | -         |
| 186. Carga inicial catálogo  | v6.1      | 0/TBD          | Not started | -         |
| 187. Plantillas de rutina    | v6.1      | 0/TBD          | Not started | -         |
| 188. Asignación de rutinas   | v6.1      | 0/TBD          | Not started | -         |
| 189. Ejecución y registro    | v6.1      | 0/TBD          | Not started | -         |
| 190. Valoración y evolución  | v6.1      | 0/TBD          | Not started | -         |
| 191. Panel del profesor      | v6.1      | 0/TBD          | Not started | -         |
| 192. Onboarding tenant 2     | v6.1      | 0/TBD          | Not started | -         |

## Coverage

**v1 requirements:** 37 mapeados / 37 totales ✓ — sin huérfanos, sin duplicados.

| Categoría | Requirements                                                     | Fase(s)         |
| --------- | ---------------------------------------------------------------- | --------------- |
| DIS       | DIS-01, DIS-02                                                   | 181             |
| PLAT      | PLAT-01, PLAT-02, PLAT-03 / PLAT-04, PLAT-05                     | 182 / 183       |
| CAT       | CAT-01, CAT-02, CAT-06 / CAT-03, CAT-04, CAT-05, CAT-07 / CAT-08 | 184 / 185 / 186 |
| RUT       | RUT-01, RUT-02, RUT-08 / RUT-03..RUT-07                          | 187 / 188       |
| REG       | REG-01..REG-04 / REG-05                                          | 189 / 190       |
| VAL       | VAL-01, VAL-02                                                   | 190             |
| EVO       | EVO-01, EVO-02, EVO-03                                           | 190             |
| PROF      | PROF-01, PROF-02, PROF-03                                        | 191             |
| ONB       | ONB-01                                                           | 192             |

> **Nota de conteo:** REQUIREMENTS.md declaraba "34 total" en su bloque de coverage; el conteo real de REQ-IDs v1 es **37**. Corregido en REQUIREMENTS.md al crear este roadmap.

---

_Roadmap v6.1 creado 2026-08-27. Fases 181-192. Migraciones reservan desde 0216._

### Phase 200: Anatomía funcional — profes, Guía y Entrenar (fuera del milestone v6.1)

**Goal**: Profes y socios entienden qué trabaja cada ejercicio: un modelo de contenido único (músculo, zona del dibujo, ruta, rol, ficha) alimenta la sección Anatomía del admin, la vista Tu cuerpo de la Guía y el cuerpo tocable de Entrenar, y reemplaza a `muscle-zones.ts` como fuente de zonas
**Depends on**: fase 197 (pantalla Semana con chips + figura, `BodyFigure.vue`, zonas por bloque). Base `origin/staging` `99152a195`; sale con o después del tren de la 197
**Requirements**: `200-CONTEXT.md` (D1–D20 + P1–P4), investigación `.planning/research/anatomia-profes-2026-10-21.md`, sketches 019 (B2), 020 (síntesis), 021 (A2)
**Success Criteria** (what must be TRUE):

1. El contenido (28 músculos, 30 rutas con roles, fichas de profe y de alumno, glosario) vive en archivos versionados, validados por tests de coherencia contra `routes` y el dibujo, en estado borrador
2. TV, `/weekly`/`/daily` y la canasta pintan zonas desde el modelo nuevo; las diferencias con `muscle-zones.ts` están documentadas como correcciones
3. Admin › Anatomía (celular): cuerpo tocable → hoja con músculos y roles como frase con (i) → ficha completa de la ruta con marcas de evidencia y "Borrador · sin validar"
4. Guía en dos cards (Empezá acá + Tu cuerpo) y Tu cuerpo en tono alumno (qué hace, 3 grupos, ficha corta), detrás de `ANATOMIA_ALUMNOS_ENABLED`
5. Entrenar › Semana: tocar una zona abre la hoja con "Hoy en tu clase", marca los chips de los bloques que la trabajan y no mezcla los dos modos ni recarga la lista
6. Nombres D1 en DB/TV/app y los 5 SISSY SQ OL en SS, por migraciones 0287+

**Plans:** 23 plans (ejecución secuencial, un plan por wave)

Plans:
- [x] 200-01-PLAN.md — Contrato de tipos, 16 regiones, 28 músculos, glosario, grupos de alumno y validador
- [x] 200-02-PLAN.md — Catálogo de banderas (§3.1/§3.2) y citas del Apéndice A con validación
- [x] 200-03-PLAN.md — Relaciones de las 7 rutas PULL + ficha completa de FL
- [x] 200-04-PLAN.md — Relaciones de las 8 rutas PUSH + HR, índice RUTAS y validarRutas
- [x] 200-05-PLAN.md — Relaciones de las 14 rutas LOWER/MOVILIDAD/FLOW + ficha de PS + cobertura de las 30
- [x] 200-06-PLAN.md — Proyección ruta → zonas, hits "Hoy en tu clase" (con fallback ROM), snapshot pre-200 y diferencias aprobadas
- [x] 200-07-PLAN.md — TV, /weekly, /daily y canasta al modelo + zoneHits; adiós al mapeo anterior de zonas
- [x] 200-08-PLAN.md — Tests de integración de canasta, /weekly y TV por ruta
- [x] 200-09-PLAN.md — GET /api/admin/anatomy y GET /api/anatomy con recorte por audiencia, roles R1 y manifiesto
- [x] 200-10-PLAN.md — Migraciones 0287 (nombres D1) y 0288 (SISSY → SS) + route-labels ×3
- [x] 200-11-PLAN.md — Admin: tipos, store, figura por rol, ruta /anatomia y menú
- [x] 200-12-PLAN.md — Admin: hoja desde abajo con roles como frase e (i), profundos y escritorio
- [x] 200-13-PLAN.md — Admin: ficha de ruta a pantalla completa con marcas y glosario
- [x] 200-14-PLAN.md — App: flag ANATOMIA_ALUMNOS_ENABLED, tibialis, BodyFigure extensible, store y hoja de alumno
- [x] 200-15-PLAN.md — App: Guía en dos cards, Tu cuerpo y ficha corta
- [x] 200-16-PLAN.md — App: Semana tocable con Hoy en tu clase y modos sin mezclar
- [x] 200-17-PLAN.md — Fichas FLR, OAP, OAR, MU, TTB
- [x] 200-18-PLAN.md — Fichas MN/RP, BL, HD/ID, OAPU, PL
- [x] 200-19-PLAN.md — Fichas PLPU, HS, HSPU, PHS, HR
- [x] 200-20-PLAN.md — Fichas L, QC, SS, SU, DS
- [x] 200-21-PLAN.md — Fichas HT, NC, REVERSE HYPER, SPAGAT
- [x] 200-22-PLAN.md — Fichas BRIDGE, SIDE PCK, PIKE, AF
- [x] 200-23-PLAN.md — Cierre: coherencia estricta, barrido, UAT y firma de validación

### Phase 204: Usuarios Wellhub como tipo de usuario (fuera del milestone v6.1)

**Goal**: El staff distingue a quien viene por Wellhub (visitante nuevo, ex-alumno o socio activo vinculado por email) en el admin y en Horarios, las métricas separan la actividad Wellhub de la de socios, y una reserva o visita Wellhub nunca afecta el plan de un socio
**Depends on**: integración Wellhub en prod (piloto Moreno, gym 856836, master `66939bec8` 2026-10-27). Base `origin/master` `3bf682d95`
**Requirements**: inventario `204-INVENTARIO.md`; decisiones a tomar en discuss-phase
**Success Criteria** (what must be TRUE):

1. Admin: estado 'wellhub' con label, color y filtro propios (hoy badge vacío, filtro rechazado con 400, export en blanco); la etiqueta "Wellhub" sale de `gympass_id` y es permanente aunque el estado cambie
2. Ex-alumnos y socios activos vinculados por email se ven como tales + Wellhub; los ex-alumnos salen de la campaña `bajas`
3. Horarios: el roster de la clase marca las reservas/asistencias Wellhub antes y después del check-in
4. Métricas de asistencia, no-show, embudo y log de accesos separan Wellhub de socios; existe un reporte Wellhub por sede (visitas/mes, conversión Wellhub → socio)
5. Un no-show o una visita Wellhub no descuenta clases ni consume el límite diario/semanal del plan de un socio activo
6. Tests de integración cubren los tres casos (visitante nuevo, ex-alumno, socio activo)

**Plans:** 16 plans (16 olas secuenciales — ejecutores comparten worktree)

Plans:
- [x] 204-01-PLAN.md — Migración 0300 (attendance_source += wellhub_manual, tabla wellhub_conversions) + gates de tenancy
- [x] 204-02-PLAN.md — Helper wellhub-sources + fixtures de las 3 personas + fugas D-18 de asistencia (no-show, QR, límites)
- [x] 204-03-PLAN.md — Fugas D-18 de reservas (límites semanal/presupuesto/bonus, regla del día) + guards del webhook
- [x] 204-04-PLAN.md — Presente a mano Wellhub (D-19): coachCheckIn/removeCheckIn + upgrade a validada
- [x] 204-05-PLAN.md — Reservas Wellhub no cancelables por staff ni socio; ciclo del plan y baja no las tocan (D-11/D-24/D-25)
- [x] 204-06-PLAN.md — Horarios API: origen de la reserva en ambos rosters (D-10)
- [x] 204-07-PLAN.md — Members API: etiqueta Wellhub, status=wellhub, Solo Wellhub, export, buscador, bajas (D-01..D-12)
- [x] 204-08-PLAN.md — Evento de conversión Wellhub → socio en recomputeUserStatus + embudo entryOrigin wellhub (D-04/D-23/D-15)
- [x] 204-09-PLAN.md — API card Wellhub de la ficha + POST app-access (D-20/D-26) + ISO-01/ISO-03
- [x] 204-10-PLAN.md — API unir duplicado Wellhub (D-05/D-21) transaccional con auditoría + ISO-03
- [x] 204-11-PLAN.md — API reporte Wellhub por sede y mes + categoría Wellhub en log de accesos (D-16/D-14)
- [x] 204-12-PLAN.md — Admin: estado/etiqueta Wellhub, toggle Solo Wellhub, fuentes de asistencia
- [x] 204-13-PLAN.md — Admin: chip y cancelación deshabilitada en Horarios + aviso en Cobros (D-09/D-10/D-11)
- [x] 204-14-PLAN.md — Admin: card Wellhub en la ficha, Asociar al templo, Enviar acceso a la app
- [x] 204-15-PLAN.md — Admin: diálogo Unir con alumno existente (D-21)
- [x] 204-16-PLAN.md — Admin: pestaña Reportes › Wellhub + filtro Wellhub del log de accesos
