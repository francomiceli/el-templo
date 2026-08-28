# Requirements: El Templo — Milestone v6.1 Módulo Gimnasio

**Defined:** 2026-08-27
**Core Value (v6.1):** El primer gimnasio que no es El Templo puede operar sobre la plataforma: el super-owner lo da de alta con un wizard, sus profes arman y asignan rutinas desde un catálogo curado, sus alumnos registran lo que realmente hicieron y ven su evolución, y el profe deja de planificar a ciegas. La brecha entre lo planificado y lo realizado — que hoy no existe en ningún lado — pasa a ser el dato central del módulo.

**Fuente:** `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` (brief Nacho 2026-07-24 + addendum A1-A7 2026-07-26). Las decisiones ya tomadas del addendum (A1 módulo duro, A2 dos catálogos, A3 prior modelos separados, A4 categoría derivada, A5 desde-cero solo profe, A7 secuencia) NO se re-litigan; la fase de diseño resuelve lo abierto (7 definiciones + A6).

## v1 Requirements

### Diseño (DIS)

- [x] **DIS-01**: Las 7 definiciones del brief están respondidas y documentadas antes de construir — modelo de datos Calistenia vs Gimnasio (bloqueante; prior A3: NO comparten), alcance global/local y promoción sin romper historial, comportamiento offline, estrategia de recálculo de récords, modelado de agrupaciones (superseries/circuitos), esquema e índices para la consulta "historial de este alumno en este ejercicio", y mapa de parámetros configurables en `tenant_settings`
- [x] **DIS-02**: La superficie member-facing multi-tenant está decidida y documentada (dónde viven ejecución y registro; `el-templo-app` NO se transforma; puede adelantar la discusión del split de repos)

### Plataforma super-owner (PLAT)

- [ ] **PLAT-01**: El super-owner tiene un rol de plataforma propio, autenticado y separado de los roles de tenant (owner/admin/coach)
- [ ] **PLAT-02**: El super-owner puede crear un tenant con un wizard (identidad del gimnasio, info básica)
- [ ] **PLAT-03**: El alta de tenant aprovisiona todo automáticamente: sede virtual propia (receta 07 §1.4), `tenant_settings` con defaults, módulos Templo OFF / Gimnasio ON
- [ ] **PLAT-04**: El super-owner ve un panel de tenants con métricas por tenant (alumnos, clases, actividad)
- [ ] **PLAT-05**: El super-owner puede suspender/archivar un tenant desde el panel (el enforcement 403 ya existe desde v6.0)

### Catálogo de ejercicios (CAT)

- [ ] **CAT-01**: Todos los gimnasios ven y usan el catálogo global de ejercicios (tablas nuevas — `exercises` del SPOM no se toca)
- [ ] **CAT-02**: Un gimnasio puede crear ejercicios propios, visibles solo para él
- [ ] **CAT-03**: Editar un ejercicio global genera automáticamente una copia local editable; el global nunca muta
- [ ] **CAT-04**: La plataforma puede promover un ejercicio local a global sin romper registros históricos ni métricas del alumno
- [ ] **CAT-05**: Los ejercicios se desactivan, no se borran: salen del buscador y de rutinas nuevas pero resuelven todo el historial
- [ ] **CAT-06**: Las taxonomías cerradas del §2.3 (14 grupos musculares, 25 equipamientos, 9 patrones) se validan en la carga — ningún valor fuera de lista — y la categoría (7 valores, A4) es capa derivada por mapeo fijo, no campo editable
- [ ] **CAT-07**: El buscador encuentra por nombre canónico y alias, y filtra por taxonomías
- [ ] **CAT-08**: Catálogo inicial de 40-80 ejercicios publicados: generado con agentes contra base de prueba, los 9 patrones cubiertos, validación de duplicados/sinónimos, revisión humana Borrador→Publicado, backup + carga transaccional reversible

### Plantillas y rutinas (RUT)

- [ ] **RUT-01**: Existen plantillas globales de la plataforma y cada gimnasio/profe puede crear y guardar las suyas
- [ ] **RUT-02**: La plantilla estructura día → ejercicio (orden, series objetivo, reps valor/rango, peso sugerido opcional, descanso, observaciones) y soporta superseries/circuitos como bloques simples
- [ ] **RUT-03**: El profe clona una plantilla, la ajusta y la asigna; la original no se toca
- [ ] **RUT-04**: La rutina asignada es una COPIA con fecha de inicio (y fin opcional) — editar la plantilla después jamás modifica lo ya asignado
- [ ] **RUT-05**: Un alumno tiene una rutina activa por vez; las anteriores quedan en su historial consultable
- [ ] **RUT-06**: Cuando el profe modifica una rutina en curso, el alumno ve el cambio como modificación con su fecha
- [ ] **RUT-07**: La autogestión es un permiso por gimnasio (default OFF): apagado, el alumno sin rutina ve una invitación a hablar con un profe (nunca pantalla en blanco); prendido, se autoasigna plantillas del catálogo de su gimnasio, marcadas como autoasignadas
- [ ] **RUT-08**: El profe puede crear una rutina desde cero eligiendo ejercicios del catálogo y guardarla como plantilla propia del gimnasio (solo profe en v1, A5)

### Ejecución y registro (REG)

- [ ] **REG-01**: Fricción mínima al cargar: valores del profe precargados, botón "hice lo planificado" que completa la serie de un toque, la serie siguiente hereda el peso, steppers en vez de teclado libre, y carga al final de la sesión permitida
- [ ] **REG-02**: La sesión tiene estados Pendiente / En curso / Completada / Abandonada — completada SOLO por cierre manual del alumno; abandonada por timeout parametrizable (default 12h) conservando lo cargado sin sumar a la métrica
- [ ] **REG-03**: El registro por serie captura según el tipo de carga: reps, peso, duración, distancia, y para peso corporal el lastre/asistencia; acepta cero y valores parciales; kg en v1 (libras previsto en el modelo)
- [ ] **REG-04**: El alumno (o el profe) reemplaza un ejercicio por una de sus alternativas con un toque, y el registro guarda el ejercicio efectivamente realizado, no el planificado
- [ ] **REG-05**: El alumno corrige sus registros hasta 24h después de finalizada la sesión (parametrizable); después queda solo-lectura salvo para el profe; toda edición/eliminación recalcula los récords

### Valoración (VAL)

- [ ] **VAL-01**: Al terminar cada ejercicio el alumno puede responder "¿Cómo te resultó?" (Fácil / Adecuado / Difícil) — opcional, saltearlo nunca bloquea la sesión
- [ ] **VAL-02**: El alumno puede marcar molestia (Sí/No) indicando dónde y con comentario libre — opcional

### Evolución del alumno (EVO)

- [ ] **EVO-01**: El alumno ve su récord de peso por ejercicio con la fecha en que lo logró, recalculado ante todo alta/edición/baja de registro
- [ ] **EVO-02**: Al abrir un ejercicio, el alumno ve qué hizo la última vez que lo entrenó
- [ ] **EVO-03**: El alumno ve sus sesiones completadas del mes con el mes anterior al lado

### Panel del profesor (PROF)

- [ ] **PROF-01**: El profe ve la lista de sus alumnos con rutina activa, última sesión registrada y señales destacadas
- [ ] **PROF-02**: Las señales saltan a la vista sin buscarlas: molestia registrada (prioridad máxima), ejercicio Difícil ×N sesiones seguidas (default 3), Fácil repetido, alumno sin sesiones en N días (default 14) — umbrales configurables por gimnasio en `tenant_settings`
- [ ] **PROF-03**: La ficha del alumno muestra rutina asignada, historial de sesiones, planificado vs realizado por ejercicio y valoraciones; el profe ajusta series/reps/pesos desde ahí

### Onboarding tenant 2 (ONB)

- [ ] **ONB-01**: Un gimnasio real queda dado de alta con el wizard y operando el módulo Gimnasio en producción — la prueba de fuego del SaaS

## v2 Requirements

### Catálogo y contenido

- **CAT-V2-01**: Videos e imágenes por ejercicio (los campos quedan previstos vacíos en v1)
- **CAT-V2-02**: Sugerencia automática de alternativa cuando el alumno marca que no puede hacer un ejercicio

### Ejecución y evolución

- **REG-V2-01**: Temporizador de descanso entre series con aviso
- **VAL-V2-01**: Preferencia (me gusta / no me gusta) y sensación (muy bien / incómodo / dolor) en la valoración
- **EVO-V2-01**: Volumen total, 1RM estimado, récords de repeticiones y de volumen, gráficos de evolución, feedback automático en texto
- **RUT-V2-01**: Rutina desde cero para el alumno autogestionado
- **RUT-V2-02**: Exportar la rutina a PDF

## Out of Scope

| Feature                                                     | Reason                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Equipamiento configurado por gimnasio/sede                  | Explícitamente fuera por brief §2.3 — se etiqueta en el ejercicio; las alternativas manuales (§2.6) son la salida  |
| 1RM estimado                                                | Decisión deliberada del brief §7 — número que se malinterpreta y termina en máximos sin supervisión                |
| Libras                                                      | kg en v1; el modelo lo deja previsto                                                                               |
| Transformación de SPOM / `el-templo-app`                    | Regla firme desde v6.0 — jamás se transforman; el módulo Gimnasio es frontera dura (A1)                            |
| Toggle de consentimiento de privacidad                      | Decisión del brief §9 — aviso único en onboarding; profe ve lo de sus alumnos de su gimnasio, nada cruza gimnasios |
| Renombres/navegación del doc original (Guía→Gimnasio, etc.) | Brief aparte según Nacho — no es parte de este milestone                                                           |
| Split de repos                                              | Trigger intacto; la fase de diseño (DIS-02) puede adelantar la discusión pero ejecutarlo no entra en v6.1          |

## Traceability

| Requirement | Phase     | Status  |
| ----------- | --------- | ------- |
| DIS-01      | Phase 181 | Done    |
| DIS-02      | Phase 181 | Done    |
| PLAT-01     | Phase 182 | Pending |
| PLAT-02     | Phase 182 | Pending |
| PLAT-03     | Phase 182 | Pending |
| PLAT-04     | Phase 183 | Pending |
| PLAT-05     | Phase 183 | Pending |
| CAT-01      | Phase 184 | Pending |
| CAT-02      | Phase 184 | Pending |
| CAT-06      | Phase 184 | Pending |
| CAT-03      | Phase 185 | Pending |
| CAT-04      | Phase 185 | Pending |
| CAT-05      | Phase 185 | Pending |
| CAT-07      | Phase 185 | Pending |
| CAT-08      | Phase 186 | Pending |
| RUT-01      | Phase 187 | Pending |
| RUT-02      | Phase 187 | Pending |
| RUT-08      | Phase 187 | Pending |
| RUT-03      | Phase 188 | Pending |
| RUT-04      | Phase 188 | Pending |
| RUT-05      | Phase 188 | Pending |
| RUT-06      | Phase 188 | Pending |
| RUT-07      | Phase 188 | Pending |
| REG-01      | Phase 189 | Pending |
| REG-02      | Phase 189 | Pending |
| REG-03      | Phase 189 | Pending |
| REG-04      | Phase 189 | Pending |
| REG-05      | Phase 190 | Pending |
| VAL-01      | Phase 190 | Pending |
| VAL-02      | Phase 190 | Pending |
| EVO-01      | Phase 190 | Pending |
| EVO-02      | Phase 190 | Pending |
| EVO-03      | Phase 190 | Pending |
| PROF-01     | Phase 191 | Pending |
| PROF-02     | Phase 191 | Pending |
| PROF-03     | Phase 191 | Pending |
| ONB-01      | Phase 192 | Pending |

**Coverage:**

- v1 requirements: **37 total** (el conteo previo de "34" era erróneo — verificado por REQ-ID)
- Mapped to phases: 37 ✓
- Unmapped: 0

**Fases del milestone:** 181-192 (179-180 tomadas por fases en vuelo fuera del milestone). Migraciones reservan desde **0216**.

---

_Requirements defined: 2026-08-27_
_Last updated: 2026-08-27 — trazabilidad completada al crear el ROADMAP de v6.1 (12 fases, 181-192); conteo de v1 corregido 34 → 37_
