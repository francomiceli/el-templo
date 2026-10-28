# Roadmap: El Templo

## Milestones

- ✅ **v1.0 Training Module** — Phases 1-12 (shipped 2026-02-03)
- ✅ **v2.0 Admin App** — Phases 13-28 (shipped 2026-02-28)
- ✅ **v3.0 Landing Page** — Phases 29-44 (shipped 2026-03-03)
- ✅ **v4.0 → v4.85 Ecosystem / Admin / Stores / Modelo Financiero** — Phases 45-114
- ✅ **v5.0 → v5.4 Métricas, Entrenamiento, Contable, Reforma del Admin** — Phases 120-156
- ✅ **v5.5 → v5.8 Referidos, Actividades con Aura, Sesiones de Prueba** — Phases 157-165 (archivo: `milestones/v5.8-ROADMAP.md`)
- ✅ **v6.0 Tenancy — El Templo pasa a ser tenant #1** — Phases 166-178 (SHIPPED 2026-08-26 — archivo completo en `milestones/v6.0-ROADMAP.md`)
- ✅ **Fases en vuelo fuera de milestone** — 179 (referidos partners/marcas) y 180 (freemium etapa 2): en master `9ecc1c2e`, migs 0210+0215, cerradas fuera de v6.1. **No se renumeran ni se tocan desde este roadmap.**
- 🚧 **v6.1 Módulo Gimnasio** — Phases 181-192.3: 181 (diseño) en master; 182-192.2 ejecutadas en el tren `feat/v6.1-gimnasio` **SIN PUSH** (UAT pendiente); 192.3 Workout Engine ejecutada en rama aparte, por integrar al tren
- ✅ **Fuera de milestone, en master/prod (2026-10-28)** — 193 Comunicaciones, 194 Invitaciones, 197 Entrenar (tabs/Libre/Desafíos ocultos por flag), 199 Rediseño Mi Templo, 200 Anatomía, 201 Conquer v2 (tab oculta), 202 Conquer tutoriales, 204 Usuarios Wellhub
- ✅ **Fuera de milestone** — 203 Carga sin parpadeos EN MASTER 2026-10-28 (app 1.9.2)
- 📦 **Archivada / en espera** — 196 Personalizados + Conquer v1 (archivada, reemplazada por 201; tag `archive/196-personalizados`); 198 AURA configurable por fuente (en espera, sin planificar)

> El detalle de las fases 1-178 vive en los archivos de milestone (`milestones/v6.0-ROADMAP.md`, `milestones/v5.8-ROADMAP.md`) y en `MILESTONES.md`. Este documento arranca en la fase 181 e incluye las fases 193-204, que corren fuera del milestone v6.1.

---

# 🚧 v6.1 Módulo Gimnasio (Phases 181-192.3) + fases fuera de milestone (193-204)

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
- 193-204 son fases fuera del milestone v6.1 (shippean solas desde `origin/master`); sus secciones están intercaladas por número

- [x] **Phase 181: Diseño del módulo Gimnasio (bloqueante)** - Responder las 7 definiciones del brief + la superficie member-facing antes de escribir código de producto
- [ ] **Phase 182: Plataforma — rol super-owner + wizard de alta de tenant** - Crear un gimnasio nuevo con aprovisionamiento completo en un flujo — **[en el tren]**
- [ ] **Phase 183: Plataforma — panel de tenants** - Ver métricas por tenant y gobernar su estado (suspender/archivar) — **[en el tren]**
- [ ] **Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías** - Tablas nuevas, catálogo global de la plataforma y ejercicios propios por gimnasio, taxonomías cerradas validadas — **[en el tren]**
- [ ] **Phase 185: Catálogo — ciclo de vida y buscador** - Copia local automática, promoción local→global, desactivación sin romper historial, búsqueda por nombre/alias/taxonomías — **[en el tren]**
- [ ] **Phase 186: Carga inicial del catálogo** - 40-80 ejercicios publicados, generados con agentes y revisados por humano, con protocolo de migración — **[en el tren]**
- [ ] **Phase 187: Plantillas de rutina** - Plantillas globales y del gimnasio, estructura día→ejercicio con superseries/circuitos, creación desde cero por el profe — **[en el tren]**
- [ ] **Phase 188: Asignación de rutinas al alumno** - Clonar y asignar como copia inmutable, una activa por vez, historial, modificaciones fechadas, autogestión configurable — **[en el tren]**
- [ ] **Phase 188.1: Chasis de Kaia y pantalla Mi rutina (INSERTED)** - Nace la quinta app del monorepo (Kaia, DIS-02) con su chasis de plataforma, y el alumno ve su rutina consumiendo el contrato de la fase 188 sin cambios de API — **[en el tren]**
- [ ] **Phase 189: Ejecución y registro de la sesión** - El corazón: fricción mínima, estados de sesión, registro por serie de lo efectivamente realizado — **[en el tren]**
- [ ] **Phase 190: Valoración, evolución y edición con recálculo** - Fácil/Adecuado/Difícil + molestia, récord de peso, vez anterior, sesiones del mes, y edición dentro de plazo que recalcula — **[en el tren]**
- [ ] **Phase 191: Panel del profesor** - Lista de alumnos con señales servidas sin buscarlas y ficha con planificado vs realizado — **[en el tren]**
- [ ] **Phase 192: Onboarding del tenant 2 (cierre del milestone)** - Un gimnasio real dado de alta con el wizard y operando en producción — **[en el tren, UAT 192-13 en curso]**
- [ ] **Phase 192.1: Asistencia (check-in) para gimnasios** (INSERTED) — código 11/11 ejecutado 2026-09-27, 🔴 UAT `192.1-UAT.md` pendiente - El alumno marca su llegada escaneando el QR de la sede desde Kaia; el gimnasio ve quién vino. Antes del push a staging (192-14) — **[en el tren]**
- [ ] **Phase 192.2: Clases con horario para gimnasios** (INSERTED) — 19/19 planes ejecutados, UAT pendiente (`192.2-UAT.md`) — módulo `clases` elegible al crear el gimnasio + reservas desde Kaia + menú del gimnasio cliente ordenado. Antes del push a staging (192-14) — **[en el tren]**
- [ ] **Phase 192.3: Workout Engine** (INSERTED) — origen del dato, cumplimiento, precarga, métricas del alumno y feedback de rutina (revisión `.docs/saas-mejoras.md`). Antes del primer gimnasio real — **[rama `feat/192.3-workout-engine`, por integrar al tren]**
- [x] **Phase 193: Comunicaciones (fuera del milestone)** - Una sección única "Comunicaciones" en el admin desde la que el staff gobierna todo lo que El Templo le dice al socio y al profe: notificaciones push con **destino** elegido de una lista (sección de la app o WhatsApp de ventas con texto), **avisos pop-up** en la app con vigencia, frecuencia por socio… — **[EN MASTER]**
- [x] **Phase 194: Invitaciones (fuera del milestone)** - Referidos → Invitaciones: 3 accesos gratis en prueba, cupo 2/mes, ventana 90 días, descuento por conversión con flag por plan, leads con origen Invitación — **[EN MASTER]**
- [x] **Phase 195: Web SEO local + AEO + atribución (fuera del milestone)** - eltemplo.org con datos reales desde `branches`, páginas por sede, schema correcto, medición GA4/Meta/Search Console, atribución propia + CAPI, y guía final de pasos en Meta y Google — **[EN MASTER 2026-10-28; integraciones apagadas hasta cargar secrets]**
- [ ] **Phase 196: Personalizados Online (fuera del milestone)** - Plan individual copiado de una plantilla y ajustado por alumno, solicitud con intake editable, cobro por suscripción online_coach, ficha con hitos, estados/banderas y tablero en el admin — **[ARCHIVADA, reemplazada por 201 (tag `archive/196-personalizados`)]**
- [x] **Phase 197: Entrenar en tabs + canasta + bloque libre (fuera del milestone)** - Entrenar con 4 tabs (Semana · Libre · Desafíos · Conquer), canasta de bloques de su subnivel filtrada por figura tocable, bloque libre en el player con +5 AURA (primero del día que llega a 10') — **[EN MASTER (tabs/Libre/Desafíos ocultos por flag)]**
- [ ] **Phase 198: AURA configurable por fuente (fuera del milestone)** - Apartado en Configuración general del admin para definir cuánta AURA da cada fuente (asistencia, bloque extra, rachas…) — **[EN ESPERA, sin planificar]**
- [x] **Phase 199: Rediseño de Mi Templo + patrocinadores (fuera del milestone)** - Jerarquía nueva (card de hoy oscura con turno real, QR solo en la ventana del turno), contraste WCAG 100 %, fondo detrás en toda la app, y carrusel de patrocinadores de plataforma cargados desde Partners — **[EN MASTER]**
- [x] **Phase 200: Anatomía funcional (fuera del milestone)** - Un solo modelo de contenido (archivos) músculo ↔ zona ↔ ruta ↔ rol que reemplaza a `muscle-zones.ts`, con la sección Anatomía del admin para profes, la Guía partida en dos (Empezá acá + Tu cuerpo) y el cuerpo tocable en Entrenar — **[EN MASTER]**
- [x] **Phase 201: Conquer v2 de cero, simple (fuera del milestone)** - Modo Conquer simple según la síntesis de Nacho del 2026-10-21. El coach activa al alumno eligiendo nivel y días. El alumno carga un número por escalón y la app calcula objetivos y cuándo subir. El coach trabaja por excepción con alertas. — **[EN MASTER (tab oculta)]**
- [x] **Phase 202: Conquer — tutoriales y correcciones con video (fuera del milestone)** - Pedidos del profe probando la 201 en staging. Tutoriales: un video por ejercicio y por combo que sube el coach y el alumno ve con "Ver cómo se hace". Correcciones: el alumno manda un video de 30 s como máximo, el coach responde con texto y/o video y puede borrar el del alumno… — **[EN MASTER]**
- [x] **Phase 203: Carga sin parpadeos (fuera del milestone)** - Las pantallas de la app no muestran contenido equivocado mientras llegan los datos: regla única de carga (esperar / reservar lugar / ocultar), pedidos en paralelo, sin pedidos repetidos al arranque y HTTP/2 en la API — **[EN MASTER (app 1.9.2)]**
- [x] **Phase 204: Usuarios Wellhub como tipo de usuario (fuera del milestone)** - Distinguir a quien usa Wellhub en admin, Horarios y métricas — visitantes nuevos, ex-alumnos y socios activos vinculados por email — y que sus reservas no toquen el plan del socio — **[EN MASTER]**

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

### Phase 188.1: Chasis de Kaia y pantalla Mi rutina (INSERTED)

**Estado (2026-10-28)**: Ejecutada 15/15 en el tren `feat/v6.1-gimnasio` (SIN PUSH). Pendiente: UAT, `workbox-build` y secrets `KAIA_*`.

**Goal**: Nace la quinta app del monorepo (Kaia, DIS-02) con su chasis de plataforma, y el alumno ve su rutina consumiendo el contrato de la fase 188 sin cambios de API
**Depends on**: Phase 188 (contrato `/api/members/gym/*`) y Phase 182 (dominio de plataforma, CORS)
**Requirements**: RUT-07 (superficie del alumno: invitación / autoasignación), DIS-02 (materialización)
**Success Criteria** (what must be TRUE):

1. Existe la app Kaia como scaffold de Quasar (spa + pwa + capacitor) en el monorepo, sin clonar `el-templo-app`, con logger, token storage, Sentry y branding por tenant en runtime (DIS-02 (c)-(d), (i))
2. Un alumno de un gimnasio entra por el subdominio de su gimnasio (H-3 / D-06) y ve "Mi rutina": rutina activa con días, ejercicios y marcas de modificación con fecha, o la invitación a hablar con un profe si no tiene ninguna
3. Con autogestión prendida, el alumno elige una plantilla publicada de su gimnasio y se la autoasigna desde la app; con autogestión apagada la opción no existe
4. El alumno consulta el historial de rutinas anteriores en solo lectura
5. La 188.1 no toca `el-templo-app`; los gates de CI del monorepo siguen verdes con la app nueva incluida en el pipeline. **ENMENDADO por `188.1-CONTEXT.md` (usuario, 2026-09-10):** la 188.1 SÍ toca `el-templo-api`, acotado a DOS rutas nuevas (login scoped al tenant y branding público) más el contacto del gimnasio en `tenant_settings` — nada más

**Plans**: 15 plans (10 olas; ejecución SECUENCIAL en el worktree compartido `et-182`)

Plans:
**Ola 1**

- [x] 188.1-01-PLAN.md — API: extracción del emisor de tokens + `POST /api/members/auth/login` scoped al tenant
- [x] 188.1-05-PLAN.md — Kaia: esqueleto de `kaia-app/`, toolchain, paleta sin hex y manifest PWA *(incluye checkpoint humano por `workbox-build`)*

**Ola 2** *(bloqueada por la Ola 1)*

- [x] 188.1-02-PLAN.md — API: `GET /api/public/tenant/branding` + namespace `contact.*` + excepción acotada del hook pre-login
- [x] 188.1-06-PLAN.md — Kaia: infraestructura copiada (axios con `X-Tenant-Slug`, token storage, logger, Sentry, tz) + tests

**Ola 3** *(bloqueada por la Ola 2)*

- [x] 188.1-03-PLAN.md — API: contacto en el wizard de alta + `GET/PATCH /api/admin/gym/settings` con contacto y slug
- [x] 188.1-07-PLAN.md — Kaia: proyecto nativo `org.eltemplo.kaia` (Android/iOS) + assets placeholder + `cap sync`
- [x] 188.1-08-PLAN.md — Kaia: branding en runtime (`boot/tenant`, store de tenant, `setCssVar`, slug por hostname)

**Ola 4** *(bloqueada por la Ola 3)*

- [x] 188.1-04-PLAN.md — Admin: campos de contacto en el wizard + tarjeta de código de gimnasio y contacto en Ajustes
- [x] 188.1-09-PLAN.md — Kaia: store de auth, boot de sesión y guard puro del router + rutas

**Ola 5** *(bloqueada por la Ola 4)*

- [x] 188.1-10-PLAN.md — Kaia: shell, picker de gimnasio, login, cambio de contraseña forzado y los 4 estados especiales

**Ola 6** *(bloqueada por la Ola 5)*

- [x] 188.1-11-PLAN.md — Kaia: pelotitas de día, cards de ejercicio, bloques de agrupación y `RoutineView`

**Ola 7** *(bloqueada por la Ola 6)*

- [x] 188.1-12-PLAN.md — Kaia: pantalla Mi rutina con banner descartable, chips, aviso de inicio futuro y empty state con WhatsApp

**Ola 8** *(bloqueada por la Ola 7)*

- [x] 188.1-13-PLAN.md — Kaia: autoasignación de plantillas, historial y detalle en solo lectura

**Ola 9** *(bloqueada por la Ola 8)*

- [x] 188.1-14-PLAN.md — CI/deploy de la quinta app, 4 workflows nativos, runbook del vhost y `CLAUDE.md` de 3 a 5 apps

**Ola 10** *(bloqueada por la Ola 9)*

- [ ] 188.1-15-PLAN.md — Verificación integral + `188.1-UAT.md` + checkpoint humano (no auto-aprobable)

**UI hint**: yes
**Nota**: insertada el 2026-09-07 al discutir la 188 — la 189/190/192 necesitan esta superficie y el roadmap no le había dado fase propia. Planificada el 2026-09-10 sobre `188.1-CONTEXT.md` (D-00..D-27), `188.1-DECISION-SCAFFOLD-HIBRIDO.md`, `188.1-PATTERNS.md` y `188.1-UI-SPEC.md`.

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

### Phase 192.1: Asistencia (check-in) para gimnasios (INSERTED)

**Estado (2026-10-28)**: Código 11/11 en el tren `feat/v6.1-gimnasio` (mig 0250, SIN PUSH). Pendiente: UAT `192.1-UAT.md`.

**Goal**: Un gimnasio cliente registra la asistencia de sus alumnos: el alumno marca su llegada escaneando el QR de la sede desde Kaia (o el staff la marca por él) y el gimnasio ve quién vino, sin ningún efecto propio del Templo
**Depends on**: Phase 188.1 (chasis de Kaia, login por tenant), Phase 191 (ficha de gimnasio del alumno) y 192-13-GAP (menú del admin por tenant)
**Requirements**: CHK-01, CHK-02, CHK-03, CHK-04, CHK-05
**Success Criteria** (what must be TRUE):

1. Un alumno de un gimnasio cliente escanea el QR de su sede desde Kaia (web y nativo) y su llegada queda registrada una sola vez por día; el QR de otro gimnasio es rechazado
2. Sin turno reservado; si no tiene plan vigente (o superó su tope) la llegada se registra igual, el alumno ve "acercate a recepción" y el staff la ve marcada
3. El staff marca manualmente la llegada de un alumno desde el admin
4. El dueño descarga desde el admin el QR de asistencia de cada sede, listo para imprimir
5. Gimnasio → Asistencia muestra las llegadas del día por sede (buscador, alertas "sin plan vigente") y la ficha de gimnasio del alumno muestra su historial de asistencias
6. Una llegada en un gimnasio cliente no genera Aura, sesiones SPOM ni ningún efecto del Templo; El Templo sigue exactamente igual

**Plans**: 11 plans (worktree propio `et-192-1-asistencia`, rama `feat/192.1-asistencia-gimnasios` desde `feat/v6.1-gimnasio`; se integra antes de 192-14). Ejecución secuencial, una ola por plan. Migración única 0250.

Plans:

- [x] 192.1-01-PLAN.md — API: migración 0250 sobre `attendance` + lecturas con estado de plan + gates de Aura/SPOM por módulo (D-09) + regresión del Templo
- [x] 192.1-02-PLAN.md — API: rama gimnasio del check-in sin turno (una por día en tz de la sede, avisos D-04, idempotente, QR de otro gimnasio)
- [x] 192.1-03-PLAN.md — API: 4 rutas del módulo Gimnasio (lista del día, marcado manual, token del QR, "hoy" del alumno) + manifiesto
- [x] 192.1-04-PLAN.md — API: batería ISO-03 (49 → 53) + verificador HTTP de aislamiento + lint de tenant
- [x] 192.1-05-PLAN.md — Kaia: capa de datos de asistencia (API, store, mapeo de estados, regla D-05) + tests
- [x] 192.1-06-PLAN.md — Kaia: FAB + pantalla de escaneo + ruta gateada + permisos de cámara nativos
- [x] 192.1-07-PLAN.md — Kaia: indicador "Llegada registrada hoy" + sugerencia D-05 en Mi rutina
- [x] 192.1-08-PLAN.md — Admin: tipos, API, formato, chip de alerta y fila de llegada
- [x] 192.1-09-PLAN.md — Admin: pantalla Asistencia + marcado manual + descarga del QR de sede + nav/ruta
- [x] 192.1-10-PLAN.md — Admin: tab Asistencias en la ficha de gimnasio del alumno
- [x] 192.1-11-PLAN.md — Cierre: guion de UAT (`192.1-UAT.md`) + verificación integral de gates

**Nota**: insertada el 2026-09-27 durante el UAT 192-13 — Franco decidió que el gimnasio real arranque con asistencia desde el día 1. Discuss en `192.1-CONTEXT.md`.

### Phase 192.2: Clases con horario para gimnasios (INSERTED)

**Estado (2026-10-28)**: 19/19 planes ejecutados, ff al tren `3deb49a24` (migs 0251/0252, SIN PUSH). Pendiente: UAT `192.2-UAT.md`.

**Goal**: Al crear un gimnasio se elige si da clases con horario (módulo `clases`); si las da, sus alumnos ven la grilla y reservan desde Kaia, y el menú del admin de un gimnasio cliente queda ordenado según lo que realmente usa
**Depends on**: Phase 192.1 (asistencia con QR), 192-13-GAP (menú del admin por tenant)
**Requirements**: CLA-01, CLA-02, CLA-03, CLA-04, CLA-05, CLA-06, CLA-07, CLA-08
**Success Criteria** (what must be TRUE):

1. Al crear un gimnasio en el wizard se elige si da clases; se puede cambiar después desde plataforma; si da clases, la sede física es obligatoria
2. Un gimnasio sin clases no ve Horarios (menú oculto, API 404); uno con clases arma su grilla en el admin
3. El alumno de un gimnasio con clases ve la grilla de su sede en Kaia, reserva, cancela, entra en lista de espera y ve sus reservas, con las reglas de anticipación/cancelación que configuró el dueño
4. El QR marca la clase reservada (±20 min) sin doble descuento; sin reserva cuenta como llegada libre
5. El menú del admin de un gimnasio cliente queda ordenado (Mi jornada, Seguimiento, Asistencia en Gestión, Planes sin sección duplicada) y el del Templo queda idéntico
6. Un gimnasio no ve datos ni superficies del Templo en horarios/reservas; El Templo sigue exactamente igual (reservas, cancelación, check-in con reserva, no-show)
7. Un gimnasio híbrido muestra sus horarios libres (actividades "sin reserva") en la grilla de Kaia como información, sin poder reservarlos; la llegada con QR en ese horario cuenta como llegada libre
**Plans:** 19/19 plans ejecutados (secuenciales, worktree compartido) — UAT pendiente

Plans:
- [x] 192.2-01-PLAN.md — módulo `clases` + migración 0251 (ON para El Templo) + base de dev `eltemplo_192_2`
- [x] 192.2-02-PLAN.md — gate de horarios/reservas por `clases` + inventario de consumidores + manifiesto/ISO
- [x] 192.2-03-PLAN.md — fuga de etiqueta derivada cerrada (sessions por tenant) + sin push del Templo para gimnasios
- [x] 192.2-04-PLAN.md — reglas de reserva por gimnasio (anticipación / límite de cancelación) en el core
- [x] 192.2-05-PLAN.md — horarios libres: `activities.requires_booking` (migración 0252) + rechazo de reservas
- [x] 192.2-06-PLAN.md — QR/marcado manual marcan la clase reservada sin doble descuento
- [x] 192.2-07-PLAN.md — no-show sin doble descuento + semana en tz de sede + clase en lecturas de asistencia
- [x] 192.2-08-PLAN.md — alta de gimnasio con `clases` (sede física obligatoria)
- [x] 192.2-09-PLAN.md — interruptor de `clases` en plataforma (impacto + cancelación de reservas futuras)
- [x] 192.2-10-PLAN.md — admin: menú ordenado del gimnasio cliente + Horarios gateado
- [x] 192.2-11-PLAN.md — admin: Horarios sin superficies del Templo + estado vacío
- [x] 192.2-12-PLAN.md — admin: horarios libres + sin turno fijo sin clases
- [x] 192.2-13-PLAN.md — admin: card "Reservas de clases" + chip de clase en Asistencia
- [x] 192.2-14-PLAN.md — admin plataforma: wizard "¿Da clases?" + interruptor con diálogo
- [x] 192.2-15-PLAN.md — Kaia: capa de datos de Clases (tipos, utilidades, API, store)
- [x] 192.2-16-PLAN.md — Kaia: pestaña Clases (Horarios, reservar, lista de espera)
- [x] 192.2-17-PLAN.md — Kaia: Mis reservas + cancelar / salir de la lista
- [x] 192.2-18-PLAN.md — Kaia: escaneo con clase marcada
- [x] 192.2-19-PLAN.md — verificación integral + 192.2-UAT.md

### Phase 192.3: Workout Engine — origen del dato, cumplimiento, precarga, métricas y feedback de rutina (INSERTED)

**Estado (2026-10-28)**: Ejecutada 19/19 en `feat/192.3-workout-engine` (`6bbf7bcd2`), NO integrada al tren: falta integrar (renumerar la migración 0253) y UAT.

**Goal**: Pulir el corazón de Kaia con las decisiones de la revisión `.docs/saas-mejoras.md` (2026-09-30): cada serie sabe si fue tipeada o confirmada, la sesión dice si se cumplió lo prescripto, la precarga usa la última vez cuando el profe no cargó peso, el alumno ve racha/cumplimiento/progresión y el profe recibe si al alumno le gusta la rutina
**Depends on**: Phase 189 (sesión y series), 190 (valoración/evolución), 191 (panel del profesor)
**Requirements**: WKE-01, WKE-02, WKE-03, WKE-04, WKE-05, WKE-06
**Success Criteria** (what must be TRUE):

1. Cada serie guarda su origen (`registrado` o `confirmado`); los récords cuentan ambos y el dato queda disponible para rankings futuros
2. Al terminar, si quedan ejercicios sin nada cargado, Kaia pregunta una sola vez "¿Hiciste el resto como estaba?"; Sí completa esas series como `confirmado`
3. Cada sesión cerrada tiene cumplimiento calculado (completa / con cambios / incompleta), visible en el resumen del alumno y en el panel del profe
4. La precarga de peso usa el del profe si existe; si no, la última vez del alumno en ese ejercicio
5. El alumno ve su racha semanal, su cumplimiento del mes y un gráfico de progresión por ejercicio
6. En la 4ª sesión con una rutina y al terminarla, Kaia pregunta "¿Te está gustando esta rutina?" y la respuesta llega al profe como señal
7. El Templo no cambia en nada; todo gateado por el módulo gimnasio y aislado por tenant

**Plans:** 0 plans

Plans:

- [x] 19 planes ejecutados en la rama `feat/192.3-workout-engine` (detalle en sus SUMMARY); por integrar al tren

### Phase 193: Comunicaciones (FUERA de v6.1 — se crea y shippea sola)

**Estado (2026-10-28)**: EN MASTER/PROD (fase fuera de v6.1, shippeó sola; app 1.8.0). 16/17 planes: 193-17 con tasks 1-2 hechas (bump + verificación) y el UAT humano final pendiente.

**Goal**: Una sección única "Comunicaciones" en el admin desde la que el staff gobierna todo lo que El Templo le dice al socio y al profe: notificaciones push con **destino** elegido de una lista (sección de la app o WhatsApp de ventas con texto), **avisos pop-up** en la app con vigencia, frecuencia por socio, alcance y métricas (y la calificación de clase baja a una vez por semana para dejarles lugar), **tarjetas de Mi Templo** con contenido editable, y **avisos en TV** que el profe activa desde el control o que reemplazan la flexibilidad inicial/final.
**Depends on**: ninguna fase de v6.1. Rama `feat/193-comunicaciones` desde `origin/master` fresco, staging-first, sin esperar al tren 182-186.
**Requirements**: COM-01, COM-02, COM-03, COM-04
**Success Criteria** (what must be TRUE):

1. En Notificaciones push (plantillas y envío a segmento) el campo de texto libre "Ruta de destino" desaparece: se elige de una lista curada de secciones de la app o "WhatsApp de ventas" con mensaje editable, y la app resuelve el número AR/ES por sede del socio al tocar la push
2. El staff crea un aviso pop-up (título, mensaje, botón, destino, vigencia, frecuencia por socio, alcance por sede/país/segmento) y el socio lo ve en la app respetando "un solo pop-up automático por apertura", con contadores de mostrado/cerrado/clic visibles en el admin
3. La calificación de clase se pide como máximo una vez por semana por socio (regla server-side), y el resto de los días toca el aviso vigente
4. Las tarjetas fijas de Mi Templo (mejoras, referidos, upsell, programa) se editan desde el admin sin deploy, y el staff puede crear tarjetas nuevas con destino que aparecen en el carrusel
5. Un aviso de TV activo aparece como botón nuevo en la tira de bloques del control del profe y, según su modo, reemplaza la pantalla de flexibilidad inicial o final por la sede elegida
6. Versiones viejas de la app no rompen al recibir una push con destino WhatsApp (fallback a Mi Templo)

**Reglas duras de la fase:**

- **Migraciones: numera desde 0216** (tope de prod = 0215). Al pushear el tren v6.1 (182-186, hoy sin push) se renumeran sus 0216/0217 locales después del tope que deje la 193. Sin `;` en comentarios SQL.
- Toca las 3 apps: api (modelo de avisos + destino + regla semanal de rating + estado TV), admin (sección Comunicaciones + control/pantalla TV), app (ruta interna `/contacto-ventas`, pop-up genérico, tarjeta editable) → **bump minor de la app + builds de tiendas**.
- Reusa lo existente, no duplica: `notification_templates.route`, `buildWhatsAppUrl` (AR/ES por país), los 4 diálogos globales de `MainLayout.vue`, `tv_class_state` + poll de 750 ms, velos crema/charcoal de transición.
- Ruta nueva → manifiesto de rutas fail-closed + gates de tenancy (`tenantWhere`), como toda ruta desde v6.0.

**Plans**: 17 planes en 11 waves (planificado 2026-09-02). Ejecución SECUENCIAL con `gsd-executor` sonnet en el worktree `~/projects/et-193`. Migraciones: 0216 (tablas), 0217 (seed de avisos de sistema), 0218 (destino en push).

Plans:

**Wave 1**

- [x] 193-01-PLAN.md — Destinos curados (API + espejos admin/app) y número de ventas en `tenant_settings` (wave 1)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 193-02-PLAN.md — Schema `avisos`/`aviso_events`/`tv_avisos` + migración 0216 + registros de tenancy (wave 2)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 193-03-PLAN.md — Avisos de sistema: catálogo, seed reutilizable y migración de datos 0217 (wave 3)

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 193-04-PLAN.md — API de avisos: service, rutas admin, métricas, ver socios, manifiesto e ISO (wave 4)

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 193-05-PLAN.md — Endpoint único "qué pop-up toca hoy", eventos por socio, tarjetas y config (wave 5)

**Wave 6** _(blocked on Wave 5 completion)_

- [x] 193-06-PLAN.md — Push con destino común: migración 0218, validación y payload FCM compatible (wave 6)
- [x] 193-07-PLAN.md — API de avisos de TV, gateada por `templo-training` (wave 6)

**Wave 7** _(blocked on Wave 6 completion)_

- [x] 193-08-PLAN.md — Admin: sección Comunicaciones (menú, ruta, redirect) + pestaña Push con selector (wave 7)
- [x] 193-09-PLAN.md — App: `/contacto-ventas`, tap de push con destino y número del servidor (wave 7)
- [x] 193-10-PLAN.md — TV: `screen: 'aviso'` en el estado + botón AVISO en el control (wave 7)

**Wave 8** _(blocked on Wave 7 completion)_

- [x] 193-11-PLAN.md — Admin: pestaña Avisos en la app (editor, preview, métricas, ver socios) (wave 8)
- [x] 193-12-PLAN.md — App: un solo pop-up por apertura desde el endpoint único (wave 8)
- [x] 193-13-PLAN.md — TV: render de la placa + modo reemplazo de flexibilidad (wave 8)

**Wave 9** _(blocked on Wave 8 completion)_

- [x] 193-14-PLAN.md — Admin: pestaña Tarjetas de Mi Templo + Ajustes (número de ventas) (wave 9)
- [x] 193-15-PLAN.md — App: carrusel con copy del servidor + tarjetas libres (wave 9)

**Wave 10** _(blocked on Wave 9 completion)_

- [x] 193-16-PLAN.md — Admin: pestaña Avisos en TV (CRUD + preview de placa) (wave 10)

**Wave 11** _(blocked on Wave 10 completion)_

- [ ] 193-17-PLAN.md — Bump minor de la app (1.8.0) + UAT humano final (wave 11, checkpoint) — **tasks 1-2 hechas (bump 1.8.0 + verificación), task 3 = UAT humano PENDIENTE**

### Phase 194: Invitaciones (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN MASTER/PROD (2026-10-07, migs 0255-0259, app 1.8.2) + fixes de UX 2026-10-13. Los checkboxes de planes de abajo no se mantuvieron al día: ver los SUMMARY de `.planning/phases/194-invitaciones/`. Pendiente: UAT AR+ES.

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

### Phase 195: Web SEO local + AEO + atribución (fuera del milestone v6.1)

**Estado (2026-10-28)**: 14/14 planes ejecutados. EN MASTER 2026-10-28 (con migs 0270-0274, 0277 y 0278, web armada después de la API). Integraciones (GA4, Pixel, CAPI, gasto Meta, Search Console, GBP) apagadas hasta cargar los secrets: la card "Integraciones apagadas" de Reportes › Origen de altas lo recuerda. Pendiente: pasos manuales de Google/Meta (guía 195-14) y build de tienda (plugin in-app-review).

**Goal**: Que eltemplo.org traiga alumnos nuevos: datos de sedes siempre correctos (fuente única `branches`), páginas por sede/disciplina/profes indexables y citables por buscadores e IA, medición real (GA4, Pixel, Search Console, Bing) y atribución de punta a punta (de dónde vino cada alumno → pagó), automatizando todo lo posible del lado de Meta y Google
**Depends on**: nada bloqueante (web Nuxt 4 SSG en producción). Migración de `branches` se numera al momento de ejecutar (194 usa 0255+).
**Requirements**: decisiones D-01..D-23 en `.planning/phases/195-web-seo-local-aeo-atribucion/195-CONTEXT.md`; investigación y decisiones textuales en `.planning/phases/195-web-seo-local-aeo-atribucion/195-RESEARCH-SEO-AEO.md` (fuente: `.planning/research/seo-aeo-2026-10-05.md`). Todo en UNA fase (Franco 2026-10-06), incluido el fix urgente de la dirección Juan B. Justo 1018.
**Success Criteria** (what must be TRUE):

1. Ninguna dirección, sede o conteo publicado en la web contradice la tabla `branches` (JBJ 1018, sin Chapadmalal, Park como espacio de comunidad); la web se regenera con un botón "solo web" en GitHub
2. Cada sede tiene su página con `ExerciseGym` (`@id`, geo, horarios reales, `parentOrganization`) y la home tiene un `Organization` raíz único; Barcelona vive en `/es/` con hreflang recíproco
3. URLs inexistentes devuelven 404 real, los redirects son 301/302 reales y staging/app/admin no son indexables
4. GA4, Meta Pixel, Search Console y Bing reciben datos de producción; robots.txt permite explícitamente los bots de búsqueda IA y llms.txt se genera desde los datos de sedes
5. Cada alta guarda su origen (utm/promo/referrer, incluido tráfico de IA) y Reportes muestra registros → prueba → pago → facturación por campaña y sede; los eventos de conversión llegan a Meta por CAPI (con consentimiento donde aplique)
6. Existe una guía final paso a paso de lo que Franco/equipo hace en Meta y Google, reducida al mínimo por la automatización

**Plans:** 14 plans (ejecución secuencial, una wave por plan; reglas comunes en `195-EXECUTION-RULES.md`)

Plans:

- [x] 195-01-PLAN.md — Datos de sedes primero: migs 0270/0271 (columnas web + JBJ 1018, Park comunidad, sin Chapadmalal, WhatsApp por país) + parche de la web estática
- [x] 195-02-PLAN.md — Endpoint público GET /api/web/site-data (sedes, horarios regulares fusionados, marca, WhatsApp) + ISO-01
- [x] 195-03-PLAN.md — Pipeline de build web (prebuild desde la API, fixture, robots IA, llms.txt generado, sitemap sin catch, verificador SEO en CI, WhatsApp desde datos)
- [x] 195-04-PLAN.md — Grafo JSON-LD propio (Organization + ExerciseGym por sede) + hub /sedes + páginas por sede AR/ES
- [x] 195-05-PLAN.md — Disciplinas (incl. Aura/Yoga), profes Person (archivo de datos), primera clase gratis, planes sin precios, blog técnico
- [x] 195-06-PLAN.md — /es Barcelona + hreflang + banner RGPD con Consent Mode v2 + captura first-touch + Smart App Banner
- [x] 195-07-PLAN.md — Atribución propia: mig 0272 signup_attributions, clasificador de canal con IA, ganchos en register/alta de prueba, admin y app
- [x] 195-08-PLAN.md — Meta: mig 0273, CAPI como outbox (sin ES ni iOS), gasto diario de campañas, /privacidad reescrita
- [x] 195-09-PLAN.md — Google: mig 0274, job Search Console (JWT propio), sync de Google Business Profile detrás de flag, scripts locales
- [x] 195-10-PLAN.md — Reportes › Origen de altas: embudo por canal/campaña/sede/moneda, costo por alumno pago, IA y Search Console
- [x] 195-11-PLAN.md — CI/CD: botón solo-web, backup/rollback por proyecto, deploy tolerante a falla web, secrets de medición, rollout en 2 pasos
- [x] 195-12-PLAN.md — App: .well-known al artifact, validador, reseña in-app (plugin aprobado por Franco); bump de versión descartado por Franco
- [x] 195-13-PLAN.md — nginx — DESCARTADO por Franco (2026-10-07): sin cambios en el servidor; noindex movido al código
- [x] 195-14-PLAN.md — Guía final para Franco (Meta, Google, bloque C, ASO) + generador de datos exactos de sedes + planilla de prompts IA

### Phase 196: Personalizados Online (fuera del milestone v6.1)

**Estado (2026-10-28)**: ARCHIVADA, reemplazada por la 201 (Conquer v2 de cero). Rama guardada como cantera: tag `archive/196-personalizados`. No se ejecuta; texto conservado como referencia (Personalizados Online + Conquer v1).

**Goal**: Un usuario de la app pide "Entrená con Nacho" con un intake; el staff cobra, arma su plan copiando la plantilla sugerida y lo ajusta a mano; el alumno ve y entrena "Tu plan con Nacho" (solo él), y el admin sigue cada personalizado con hitos, estados y banderas
**Depends on**: Programas/goal plans y editor de sesiones (en producción), fase 193 (aviso `card_program`)
**Requirements**: brief `.planning/phases/196-personalizados-online/196-BRIEF-PERSONALIZADOS.md`; decisiones D-01..D-27 + addendum D-28..D-36 en `196-CONTEXT.md` (todas locked); criterios de éxito 1-5 (abajo)
**Success Criteria** (what must be TRUE):

1. Desde la tarjeta de Mi Templo, un socio presencial o El Templo Online completa el intake (preguntas editables desde el admin sin deploy) y ve el estado de su solicitud
2. El staff marca el pago (suscripción `online_coach`, cobro en caja), arma el plan desde la plantilla sugerida (copia independiente) y lo edita con el editor de sesiones; editar la plantilla no toca planes entregados y viceversa
3. "Entregar plan" arranca el ciclo ese día; el alumno ve solo su plan, con semanas relativas a la entrega, progreso y videos; un plan privado no aparece en ningún catálogo ni bundle
4. El tablero muestra estados derivados (§4.4) y banderas (demorado, en riesgo, contacto pendiente, lesión) calculados con parámetros configurables; la ficha registra hitos y ciclos y nunca borra historial
5. Los permisos respetan la matriz: owner/admin todo, gestión/recepción estado+pago, coach solo sus personalizados sin pagos

**Plans**: 13 plans (ejecución secuencial en un solo worktree `et-196-personalizados`; ola = número de plan). Reglas del ejecutor en `196-EXECUTOR-RULES.md`. Migraciones 0262-0264.

Plans:

- [ ] 196-01-PLAN.md — Esquema (0262), seeds de intake (0263) y planes online_coach inactivos (0264), gates de tenancy, fábricas de test
- [ ] 196-02-PLAN.md — Privacidad del programa privado (D-02, helper único + 14 puntos de exposición) + parseDayId con PZ
- [ ] 196-03-PLAN.md — Suscripción online_coach: D-08, descuentos excluidos (D-29), cobro con chargeDate y sub scheduled, enrollment atado a la cadena de subs
- [ ] 196-04-PLAN.md — Clonado del plan personal desde la plantilla (semanas relativas, extensión, días y semanas)
- [ ] 196-05-PLAN.md — Resolución para el alumno (/weekly, /daily, IDOR de /sessions/:id, progreso y "Tu plan con {responsable}")
- [ ] 196-06-PLAN.md — Aislamiento de filas PZ en la plani compartida + gate del editor por dueño del plan + sets de permisos
- [ ] 196-07-PLAN.md — Parámetros, motor puro de estados/banderas, tablero/ficha por rol e hitos
- [ ] 196-08-PLAN.md — Responsables, ABM del intake y endpoints del socio (snapshot, sugerencia, lesión, dedupe)
- [ ] 196-09-PLAN.md — Acciones: marcar pago (crédito del Online), descartar, armar, entregar, estructura, extensión al renovar
- [ ] 196-10-PLAN.md — Admin: página Personalizados (tablero) + ficha + diálogos de acción
- [ ] 196-11-PLAN.md — Admin: editor del plan (SessionEditPage modo PZ + semanas/días), configuración, ajustes en Planes/venta/programas
- [ ] 196-12-PLAN.md — App: AppSectionKey `personalizado`, flujo intake → confirmación, tarjeta con estados, "Tu plan con {responsable}"
- [ ] 196-13-PLAN.md — E2E de la fase, pre-flight, guía de UAT + checklist de deploy, checkpoint humano

### Phase 197: Entrenar en tabs + canasta de bloques + bloque libre (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN MASTER/PROD (`9964701ba`, 2026-10-21, migs 0285/0286). Tabs, Libre y Desafíos OCULTOS por flag: en prod solo se ve Semana. Pendiente: 197-23 (UAT guiado en teléfono).

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

### Phase 198: AURA configurable por fuente (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN ESPERA, sin planificar (falta discuss-phase y `198-CONTEXT.md`).

**Goal**: El owner define desde el admin cuánta AURA da cada fuente, sin deploy
**Depends on**: Phase 197 (fuente nueva "bloque extra")
**Requirements**: pedido de Franco 2026-10-13 ("tenemos mucho que progresar"); hoy `aura_config` es una tabla global sin tenant y sin UI (`settings/routes.ts` ~287). A formalizar en `198-CONTEXT.md` con discuss-phase (incluye decidir si pasa a ser por gimnasio)
**Success Criteria** (what must be TRUE):

1. En Configuración general hay un apartado AURA que lista cada fuente (asistencia, sesión completa, bloque extra, rachas, etc.) con su valor actual
2. El owner cambia un valor y las nuevas acreditaciones usan el valor nuevo; lo ya acreditado no cambia
3. Los cambios quedan auditados (quién, cuándo, valor anterior y nuevo) y solo roles autorizados pueden editarlos

**Plans**: TBD (discuss-phase pendiente)

### Phase 199: Rediseño de Mi Templo + patrocinadores (FUERA de v6.1 — se shippea con Novedades)

**Estado (2026-10-28)**: EN MASTER/PROD (`e2520b47a`, 2026-10-16, migs 0275+0279, app 1.8.3). Planes 01-20 ejecutados; el 21 es el checkpoint de UAT (`199-UAT.md`, `status: partial`). La carpeta tiene 31 PLAN: del 22 en adelante se agregaron durante la ejecución/UAT.

**Goal**: Mi Templo deja de apilar ~12 cards con el mismo peso: en 3 segundos el socio sabe qué le toca hoy y tiene a un toque la acción de este momento. Todos los textos pasan contraste WCAG 2.2 sobre el fondo real, la foto de fondo deja de velar las cards en toda la app, y se suma un carrusel de patrocinadores (de la plataforma) que se carga desde el admin de Partners.
**Depends on**: Novedades (`feat/novedades-mi-templo`, en staging, sin master). Rama `feat/199-mi-templo-rediseno` desde `feat/novedades-mi-templo` (`de257ec70`), worktree `~/projects/et-199-mi-templo`. Sube a staging junto con Novedades y van juntas a master.
**Requirements**: D-01..D-26 (decisiones de `199-CONTEXT.md`)
**Success Criteria** (what must be TRUE):

1. 100 % de los textos de Mi Templo pasan WCAG 2.2 (4.5:1 texto, 3:1 grande/UI) medidos sobre el fondo real, en las 7 variantes de captura
2. La card de hoy entra en el primer viewport de 390×844 en todas las variantes; sin overflow horizontal a 360/390/412
3. El botón QR flotante solo aparece en la ventana ±20 min del turno reservado (misma ventana que el server), extendido con "Marcar asistencia", y desaparece al marcar
4. La card de hoy muestra la ruta del día y el turno real del socio (o "Reservá"); sin plan muestra "Arrancá tu plan" o "Renová tu plan" según si tuvo plan antes
5. La foto de fondo se pinta detrás de las cards en toda la app (capturas antes/después de Mi Templo, Entrenar, Reservas, Planes, Guía y Perfil)
6. El staff de El Templo crea, ordena, activa y programa patrocinadores desde Partners con vista previa; el socio los ve en Mi Templo filtrados por país, abre el detalle y canjea con código o carnet (canje solo con plan activo); vistas/taps/canjes medidos por marca
7. vue-tsc sin errores nuevos (baseline app 18 / admin 21), API tsc 0, lint:tenant limpio, tests nuevos de integración verdes en CI

**Reglas duras de la fase:**

- **Sin bump de versión** (Novedades ya trae 1.8.3).
- **Migraciones desde 0279** (la 196, sin pushear, llega a 0278; la que shippee segunda renumera). Sin `;` en comentarios SQL.
- Tabla de patrocinadores = **de plataforma** (no gym-owned); tabla de métricas = gym-owned (5 conteos de tenancy). Rutas nuevas → 3 gates de tenancy.
- `@fontsource/nunito-sans` aprobada por Franco (única dependencia nueva).
- Tests locales: NO correr vitest local (CI); typecheck y lint sí, tras cada plan.

**Plans**: 21 plans, secuenciales (worktree compartido, una wave por plan)

- [x] 199-01-PLAN.md — DB: migración 0279 + schema sponsor_brands (plataforma) / sponsor_views (gym-owned) + gates de tenancy 103/5/108 (wave 1)
- [x] 199-02-PLAN.md — API: contratos (guard solo El Templo, contraste WCAG, límite en system_settings) + SponsorsService (wave 2)
- [x] 199-03-PLAN.md — API: rutas admin/socio de patrocinadores + logo en R2 + manifiesto (463 -> 472) (wave 3)
- [x] 199-04-PLAN.md — API: tests de integración de patrocinadores (roles, límite, canje con plan, eventos, aislamiento) (wave 4)
- [x] 199-05-PLAN.md — API: GET /me/plan-status (nunca tuvo vs venció) + test + ISO-03 (71 -> 72) + manifiesto (473) (wave 5)
- [x] 199-06-PLAN.md — API: my-bookings con sede/zona/asistencia + branchTimezone en /auth/me + tests (wave 6)
- [x] 199-07-PLAN.md — API+App: avisos pop-up como primera novedad (una sola fuente, D-13) (wave 7)
- [x] 199-08-PLAN.md — Admin: cliente de patrocinadores, contraste y subida de imagen genérica (wave 8)
- [x] 199-09-PLAN.md — Admin: editor de patrocinadores con contraste en vivo y vista previa de card y hoja (wave 9)
- [x] 199-10-PLAN.md — Admin: pestaña Patrocinadores en Partners (orden, límite, métricas) + atajo desde el partner (wave 10)
- [x] 199-11-PLAN.md — App: Nunito Sans + Cinzel, foto de fondo detrás en toda la app, saludo/tab bar sólidos (wave 11)
- [x] 199-12-PLAN.md — App: turno de hoy (store) + FAB QR solo en la ventana ±20 min, extendido (wave 12)
- [x] 199-13-PLAN.md — App: frases activas del TV + frase del día clara palabra por palabra (wave 13)
- [x] 199-14-PLAN.md — App: lógica pura de la card de hoy por gate + estado de plan (wave 14)
- [x] 199-15-PLAN.md — App: TodayCard A' cableada en Mi Templo con zona de la sede (wave 15)
- [x] 199-16-PLAN.md — App: registro del día compacto + Tu semana sin RPE + evaluación con gate (wave 16)
- [x] 199-17-PLAN.md — App: Para vos claro sin dots + Proponer una mejora en Perfil (wave 17)
- [x] 199-18-PLAN.md — App: store y carrusel de patrocinadores (wave 18)
- [x] 199-19-PLAN.md — App: hoja de beneficio + carnet en vivo (canje solo con plan) (wave 19)
- [x] 199-20-PLAN.md — App: pila final de D-02 + borrado de cards reemplazadas (wave 20)
- [ ] 199-21-PLAN.md — Capturas después + contraste/fold + UAT humano (checkpoint) (wave 21)

### Phase 201: Conquer v2 (de cero, simple)

**Estado (2026-10-28)**: EN MASTER/PROD vía `release/conquer-master` (`15097c9b1`, 2026-10-27, migs 0290-0294), con la tab de Conquer OCULTA (`ENTRENAR_TABS_ENABLED=false`). Reemplaza a la 196 (archivada). Los checkboxes de planes no se mantuvieron al día: 34 SUMMARY en `.planning/phases/201-conquer/`. Pendiente: UAT del profe (`201-UAT.md`).

**Goal**: Modo Conquer simple según la síntesis de Nacho del 2026-10-21. El coach activa al alumno eligiendo nivel y días. El alumno carga un número por escalón y la app calcula objetivos y cuándo subir. El coach trabaja por excepción con alertas.
**Depends on**: Phase 197 (tabs de Entrenar, en staging); de cero, la rama 196 queda guardada como cantera
**Requirements**: `.planning/phases/201-conquer/ref/conquer-desarrollo-sintesis.md` + decisiones en `201-CONTEXT.md`. Los criterios de éxito son el §12 de la síntesis.
**Plans**: 35 plans (ejecución secuencial en un solo worktree, una ola por plan; ejecutor sonnet; tests en CI). 201-25..35: hallazgos del UAT local. Los pedidos del UAT en staging (D-25..D-29) pasaron a la Phase 202.

Plans:

- [ ] 201-01-PLAN.md — Schema y DDL de las 10 tablas (0290/0291) + gates de tenancy
- [ ] 201-02-PLAN.md — Semilla del catálogo (0292) + fixture del oráculo
- [ ] 201-03-PLAN.md — Motor puro (§4) + test diferencial contra el oráculo
- [ ] 201-04-PLAN.md — Reglas puras: calendario (D-16), caída, recortes, nivel, encendido muscular
- [ ] 201-05-PLAN.md — Permisos (D-08), settings, carga del catálogo, estado y pedidos de desbloqueo (D-12)
- [ ] 201-06-PLAN.md — Alta del alumno por nivel y días + edición
- [ ] 201-07-PLAN.md — API de Hoy, guardado de la sesión, cambio de escalón, home
- [ ] 201-08-PLAN.md — Progreso, Subir, calibración, base de alertas
- [ ] 201-09-PLAN.md — Alertas (con reapertura), alertas derivadas, tablero
- [ ] 201-10-PLAN.md — Combos de Toro y Sábado (opening opcional)
- [ ] 201-11-PLAN.md — Recortes, paso de nivel, ficha del alumno
- [ ] 201-12-PLAN.md — Control físico con fotos privadas, día 0 (regla de contenido), env vars
- [ ] 201-13-PLAN.md — Permiso de publicación, fotos en el admin, galería
- [ ] 201-14-PLAN.md — API de edición de catálogo y ajustes (D-14)
- [ ] 201-15-PLAN.md — Tabs de Entrenar Semana + Conquer, D-17, destino `conquer` del pop-up
- [ ] 201-16-PLAN.md — App: capa de datos + submarca (tokens, letras, componentes, portada)
- [ ] 201-17-PLAN.md — App: ConquerTab, Bloqueado, Inicio, Niveles
- [ ] 201-18-PLAN.md — App: pantalla Hoy
- [ ] 201-19-PLAN.md — App: Progreso y Sábado
- [ ] 201-20-PLAN.md — App: control físico y Evolución
- [ ] 201-21-PLAN.md — Admin: pedidos, alta, tablero
- [ ] 201-22-PLAN.md — Admin: ficha del alumno y galería
- [ ] 201-23-PLAN.md — Admin: catálogo y ajustes
- [ ] 201-24-PLAN.md — E2E del recorrido + UAT + checkpoint humano (Franco + Nacho)
- [ ] 201-25-PLAN.md — Catálogo del anexo de Nacho, parte datos (0293)
- [ ] 201-26-PLAN.md — Catálogo del anexo: reglas, modos, textos y alertas
- [ ] 201-27-PLAN.md — Guía "¿Cómo funciona?": dato (0294), ruta y contenido
- [ ] 201-28-PLAN.md — Estética variante B del sketch 022: base visual
- [ ] 201-29-PLAN.md — Guía: pantalla, ruta y disparo después del día 0
- [ ] 201-30-PLAN.md — Inicio y camino de niveles con la variante B
- [ ] 201-31-PLAN.md — Hoy, hoja de guardado y Sábado con la variante B
- [ ] 201-32-PLAN.md — Progreso con la variante B
- [ ] 201-33-PLAN.md — Control físico y Evolución con la variante B
- [ ] 201-34-PLAN.md — Fuera el cielo; UAT y CONTEXT al día (D-23, D-24)
- [ ] 201-35-PLAN.md — Barrido final y prueba visual de Franco (checkpoint)

## Progress

**Execution Order (milestone v6.1):** 181 → 182 → 183 → 184 → 185 → 186 → 187 → 188 → 188.1 → 189 → 190 → 191 → 192 → 192.1 → 192.2 → 192.3. Las fases fuera del milestone (193-204) se ejecutaron en paralelo y shippean por su cuenta (staging-first). Estado real al 2026-10-28 en la tabla de abajo.

(182-183 pueden solaparse conceptualmente con 184-186: la capa de plataforma no depende del diseño del catálogo salvo el default de módulos de PLAT-03.)

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 181. Diseño del módulo | v6.1 | 6/6 | Complete (en master) | - |
| 182. Rol plataforma + wizard | v6.1 | ejecutada | En el tren, SIN PUSH | - |
| 183. Panel de tenants | v6.1 | ejecutada | En el tren, SIN PUSH | - |
| 184. Catálogo modelo + taxos | v6.1 | ejecutada | En el tren, UAT pendiente | - |
| 185. Catálogo ciclo de vida | v6.1 | ejecutada | En el tren, UAT pendiente | - |
| 186. Carga inicial catálogo | v6.1 | ejecutada | En el tren, SIN PUSH | - |
| 187. Plantillas de rutina | v6.1 | ejecutada | En el tren, UAT pendiente | - |
| 188. Asignación de rutinas | v6.1 | ejecutada | En el tren, UAT pendiente | - |
| 188.1 Chasis de Kaia | v6.1 | 15/15 | En el tren, UAT pendiente | - |
| 189. Ejecución y registro | v6.1 | 15/15 | En el tren, UAT 1-7 pendiente | - |
| 190. Valoración y evolución | v6.1 | 12/12 | En el tren, UAT pendiente | - |
| 191. Panel del profesor | v6.1 | 14/14 | En el tren, UAT pendiente | - |
| 192. Onboarding tenant 2 | v6.1 | en curso | En el tren, UAT guiado 192-13 en curso | - |
| 192.1 Asistencia gimnasios | v6.1 | 11/11 | En el tren, UAT pendiente | - |
| 192.2 Clases gimnasios | v6.1 | 19/19 | En el tren, UAT pendiente | - |
| 192.3 Workout Engine | v6.1 | 19/19 | Rama aparte, por integrar al tren | - |
| 193. Comunicaciones | fuera | 16/17 | EN MASTER (UAT pendiente) | - |
| 194. Invitaciones | fuera | completa | EN MASTER (UAT pendiente) | 2026-10-07 |
| 195. Web SEO + atribución | fuera | 14/14 | EN STAGING, no en master (human_needed) | - |
| 196. Personalizados Online | fuera | 47 planes (13 en esta lista) | ARCHIVADA (reemplazada por 201) | - |
| 197. Entrenar en tabs + Libre | fuera | 22/23 | EN MASTER (tabs/Libre/Desafíos ocultos) | 2026-10-21 |
| 198. AURA configurable | fuera | 0/TBD | En espera, sin planificar | - |
| 199. Rediseño Mi Templo | fuera | 20/21 | EN MASTER (UAT parcial) | 2026-10-16 |
| 200. Anatomía funcional | fuera | 23/23 | EN MASTER | 2026-10-22 |
| 201. Conquer v2 | fuera | 34/35 | EN MASTER (tab oculta) | 2026-10-27 |
| 202. Conquer tutoriales | fuera | 15/15 | EN MASTER | 2026-10-27 |
| 203. Carga sin parpadeos | fuera | 16/17 (02 cancelado) | En master | 2026-10-28 |
| 204. Usuarios Wellhub | fuera | 16/16 | EN MASTER | 2026-10-27 |

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

### Phase 202: Conquer — tutoriales y correcciones con video

**Estado (2026-10-28)**: EN MASTER/PROD junto con la 201 (migs 0298/0299; bucket privado `el-templo-privado`). 15/15 SUMMARY. Pendiente: UAT y build de tiendas cuando se defina el Player.

**Goal**: Pedidos del profe probando la 201 en staging. Tutoriales: un video por ejercicio y por combo que sube el coach y el alumno ve con "Ver cómo se hace". Correcciones: el alumno manda un video de 30 s como máximo, el coach responde con texto y/o video y puede borrar el del alumno. Videos de alumnos en el bucket R2 privado con vencimiento a los 60 días.
**Depends on**: Phase 201 (Conquer v2, en staging)
**Requirements**: D-25..D-29 de `.planning/phases/201-conquer/201-CONTEXT.md`; decisiones DA-37..DA-52 en `202-01-PLAN.md`. Retomar desde `202-HANDOFF.md`.
**Plans**: 15 plans (planificados 2026-10-23 como 201-36..50 y renumerados; ejecución secuencial en el worktree de la 201, ejecutor sonnet, tests en CI)

Plans:

- [ ] 202-01-PLAN.md — Tablas de correcciones y tutoriales (0298/0299) + tenancy
- [ ] 202-02-PLAN.md — Reglas de video y almacenamiento privado para videos
- [ ] 202-03-PLAN.md — API alumno: objetivos, URL de subida y alta de la corrección
- [ ] 202-04-PLAN.md — API alumno: ver videos, respuestas vistas y contador en el estado
- [ ] 202-05-PLAN.md — API coach: bandeja, contador, videos y borrar el del alumno
- [ ] 202-06-PLAN.md — API coach: respuesta con texto y/o video
- [ ] 202-07-PLAN.md — API tutoriales (bucket público, admin + alumno)
- [ ] 202-08-PLAN.md — Admin: tutoriales en Catálogo y Ajustes de combos
- [ ] 202-09-PLAN.md — Admin: bandeja de correcciones, contador del menú y borrado
- [ ] 202-10-PLAN.md — Admin: respuesta del coach
- [ ] 202-11-PLAN.md — App: datos, store y validación del video (puros con test)
- [ ] 202-12-PLAN.md — App: "Ver cómo se hace" en Hoy, Progreso y combos
- [ ] 202-13-PLAN.md — App: pantalla de correcciones y contador en Inicio
- [ ] 202-14-PLAN.md — App: mandar un video (grabar/galería) + permiso de micrófono iOS
- [ ] 202-15-PLAN.md — Barrido final y UAT (infra R2, casos D-25..D-29)

### Phase 200: Anatomía funcional — profes, Guía y Entrenar (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN MASTER/PROD (`df84f9392`, 2026-10-22, migs 0287/0288), 23/23. Guía y Tu cuerpo PRENDIDOS en prod por decisión de Franco. Pendiente: builds de tienda 1.8.5, UAT, kinesiólogo.

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

### Phase 203: Carga sin parpadeos (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN MASTER, app 1.9.2. Ejecutada el 2026-10-28: 02 cancelado (HTTP/2 ya activo y la API ya se logueaba en access.log; nginx no se toca), 03 = `203-BASELINE.md` sobre los logs existentes, 04-16 + 7 fixes de code-review. Arranque con plan activo: 16 pedidos (base 19). UAT aprobado por uso en staging; el checklist detallado de `203-UAT.md` no se corrió. Pendiente: builds de tiendas 1.9.2 y repetir la medición del BASELINE.

**Goal**: Ninguna pantalla de la app muestra un texto, card o estado equivocado mientras llegan sus datos ("todavía no sé" nunca se dibuja como "no"), las cards no empujan el contenido al aparecer, y el arranque hace menos pedidos y los hace sin cola
**Depends on**: nada. Base `origin/master` `ab4342b27` (app 1.8.6); rebaseada el 2026-10-28 sobre `1735ef656` y planes reajustados por "Tu plan" (ver Addendum del CONTEXT). (La 202 es Conquer tutoriales, en `feat/201-conquer`.) Sale staging → master como bugfix (patch, bump fuera de la fase)
**Requirements**: `203-HALLAZGOS.md` (métricas del server 2026-10-23, inventario de pedidos BEFORE `f6a4c9ae7` vs NOW `ab4342b27`, 10 candidatos de parpadeo)
**Success Criteria** (what must be TRUE):

1. Planes: nunca muestra "No hay planes disponibles" ni los planes regulares solos antes de "Por Objetivos"; la página aparece completa y sus pedidos van en paralelo
2. Mi Templo: la card de hoy, el estado de socio virtual, las acciones secundarias y las cards de Novedades/patrocinadores/check-in/semana no muestran un estado intermedio equivocado ni empujan el contenido al llegar
3. Entrenar, Perfil y Reservas siguen la misma regla; Entrenar no queda con `/sessions/weekly` pedido con parámetros decididos antes de tiempo
4. El arranque no pide dos veces my-progress, current-program ni enrollments; el total de pedidos al abrir la app con plan activo baja respecto de los 19 actuales (18 + el plan-status de la pelotita de Planes)
5. La API sirve HTTP/2 (`deploy/nginx/api.eltemplo.org` + aplicado en el server con OK de Franco) y la app funciona igual en iOS y Android con CapacitorHttp
6. UAT en teléfono con red limitada: ninguna de las pantallas del inventario parpadea

**Plans:** 17 plans (17 olas secuenciales — worktree compartido; 01-03 infra con checkpoints de Franco, después la app)

Plans:

**Wave 1**

- [x] 203-01-PLAN.md — Script de verificación h2/h1.1 + config viva de nginx al repo + diff http2 explícito y access_log permanente sin la TV

**Wave 2** _(blocked on Wave 1 completion)_

- [x] ~~203-02-PLAN.md~~ (CANCELADO) — Aplicar nginx en staging y prod con OK de Franco, script verde en los dos, playbook apunta al log nuevo

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 203-03-PLAN.md — Checkpoint de 1-2 días: línea base del access_log (203-BASELINE.md)

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 203-04-PLAN.md — useUserStore dueño único del estado del socio: todo en paralelo (D-15), promesa compartida, banderas loaded/failed

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 203-05-PLAN.md — my-bookings ×2 → 1 (parámetro weeks retrocompatible en la API + test) y loadedTz

**Wave 6** _(blocked on Wave 5 completion)_

- [x] 203-06-PLAN.md — Reservas multi-sede pide /weekly una sola vez (R-1)

**Wave 7** _(blocked on Wave 6 completion)_

- [x] 203-07-PLAN.md — Helpers: tope D-07, regla de slot, flag 'tuvo contenido' (D-02) precargado, CardSkeleton

**Wave 8** _(blocked on Wave 7 completion)_

- [x] 203-08-PLAN.md — Planes (con "Tu plan") aparece completa: resumen, planes y catálogo en paralelo, my-progress del store, un esqueleto por sección y sin 'No hay planes' antes de tiempo (D-04)

**Wave 9** _(blocked on Wave 8 completion)_

- [x] 203-09-PLAN.md — /sessions/weekly sin view (el server decide) + loaded + tests de API del default

**Wave 10** _(blocked on Wave 9 completion)_

- [x] 203-10-PLAN.md — Card de hoy: entradas de carga, tope y estado neutral (D-05/D-07/D-18)

**Wave 11** _(blocked on Wave 10 completion)_

- [x] 203-11-PLAN.md — Mi Templo en paralelo y sin duplicados + saludo/turnos esperan el perfil real (D-08)

**Wave 12** _(blocked on Wave 11 completion)_

- [x] 203-12-PLAN.md — Stores de Mi Templo con loaded/lastLoadOk, statsLoaded; toast de stats intacto (D-16)

**Wave 13** _(blocked on Wave 12 completion)_

- [x] 203-13-PLAN.md — Mi Templo reserva el lugar de sus cards, sin loader ni error de página (D-02/D-16)

**Wave 14** _(blocked on Wave 13 completion)_

- [x] 203-14-PLAN.md — Entrenar (TrainingIndex) y Perfil no deciden 'sin plan' antes de tiempo

**Wave 15** _(blocked on Wave 14 completion)_

- [x] 203-15-PLAN.md — CTA de Entrenar sin 'Empezar → Continuar' (C-10)

**Wave 16** _(blocked on Wave 15 completion)_

- [x] 203-16-PLAN.md — Latencia artificial y contador de pedidos solo en dev (VITE_DEV_LATENCY_MS)

**Wave 17** _(blocked on Wave 16 completion)_

- [x] 203-17-PLAN.md — Checklist 203-UAT.md + UAT de Franco con red limitada

### Phase 204: Usuarios Wellhub como tipo de usuario (fuera del milestone v6.1)

**Estado (2026-10-28)**: EN MASTER/PROD (`e74a06874`, 2026-10-27, mig 0300 va a prod ANTES que 0290-0299 de Conquer), 16/16. Pendiente: UAT en prod con Wellhub real y revisar D-22..D-28.

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

---

_Unificado el 2026-10-28 (rescate de docs del master local): sobre el ROADMAP de origin/master se sumaron las fases 188.1, 192.1-192.3, 193, 195, 196 (archivada), 198 y 199, 203, con su estado real. Textos de fase tomados de master local (193, 199), `origin/staging` (195), `feat/203-carga-sin-parpadeos` (203), `archive/196-personalizados` (196, 198) y el tren `feat/v6.1-gimnasio` / `feat/192.3-workout-engine` (188.1, 192.x)._
