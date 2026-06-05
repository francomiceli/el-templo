# Requirements: El Templo v5.1 — Nuevo Sistema de Entrenamiento

**Defined:** 2026-06-04
**Core Value:** El sistema de entrenamiento deja de progresar de forma implícita (subir de nivel + `dificultadLineal`) y pasa a apoyarse en un **árbol de habilidades** explícito, construido sobre 3 ejes ortogonales (gesto / palanca / contracción). Sobre ese cimiento, un principiante absoluto entra por el nivel **Kairos** (sesiones ultra-simples que heredan de Alfa) y cualquier alumno puede **ajustar la dificultad de un ejercicio en plena sesión**, con el árbol sirviendo el equivalente correcto y recordando lo que domina.

**Reference:** `.planning/research/new-training-system-design.md` (doc de diseño, fuente de verdad) + `.docs/new-training-system/BRIEF-PROFES.md` (decisiones de dominio) + audios en `.docs/new-training-system/`.

**Orden de construcción:** el **árbol (Eje 2) es el cimiento** y va primero (fase 0 de estructuración de datos). Kairos (Eje 1) y el ajuste in-session (Eje 3) se apoyan sobre él.

**Decisiones ya tomadas (no se re-litigan):**

- Modelado por **estructuración de las 3 dimensiones** (gesto/palanca/contracción), no cableando aristas a mano. El grafo y el orden emergen de las dimensiones + el SPOM.
- Primer pase **heurístico** (reglas sobre códigos de ruta + keywords, sin API) propone la descomposición; **revisión humana de profes** la fija. _(Cambiado de LLM a heurístico en discuss-125 — la `ANTHROPIC_API_KEY` es placeholder/nunca desplegada.)_
- El árbol **auto-construye desde el orden del SPOM/`dificultadLineal`**; los profes ajustan después en un **editor de árbol del admin**. `BRIEF-PROFES` NO bloquea el milestone.
- Kairos: modelo **híbrido** (nivel real que hereda de Alfa, ejercicios `difficulty=1`, formato **solo lineal + 2 ej/bloque**). Alcance de código **solo estructural** — la conversión de la sesión de prueba es del lado profes/clase, NO requisito de código.
- Alumnos nuevos arrancan en **Kairos** por defecto; graduación automática (X sesiones) o salto manual del coach.
- Eje 3: disparo **manual** (botones), criterio binario contra la prescripción del SPOM, un escalón por toque, **se recuerda** lo dominado pero **NO** cambia nivel ni SPOM automáticamente.

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO ahora):**

- Agrupación visible del árbol: `category` (fina, ~22 valores) vs `pattern` (gruesa, ~9). El feedback de profes apunta a `category`.
- Eje transversal "estático/dinámico": atributo/filtro (no categoría paralela) — confirmar con profes.
- INITIUM en sesiones Kairos: ¿se baja a 2 ejercicios o queda excluido del "2 por bloque"?
- Umbral exacto de sesiones para graduar Kairos → Alfa.
- Cómo se **captura** "dominar" (criterio binario ya decidido: cumplir o no la prescripción del bloque del día).
- Dosis lineales exactas de Kairos (4×12, 5×8…) — de los profes.

---

## v5.1 Requirements

18 requirements en 3 categorías (3 ejes). El árbol (TREE) es el cimiento y se construye primero.

### Eje 2 — Árbol de habilidades (TREE) · cimiento

- [x] **TREE-01**: Las 3 dimensiones de cada ejercicio (gesto/sub-familia, palanca/posición, contracción) existen como datos estructurados en el esquema, separadas del campo `position` actual (que hoy mezcla palanca + implemento + orientación).
- [x] **TREE-02**: Un proceso de bootstrap **heurístico** (reglas deterministas sobre los códigos de ruta + keywords de palanca, sin API) propone la descomposición (gesto / palanca / ruta para los `route_pending`) de cada ejercicio a partir de su nombre, con salida revisable antes de aplicarse. _(Motor cambiado de LLM a heurístico en discuss-125; mismo objetivo, distinto motor.)_
- [x] **TREE-03**: Los profes pueden revisar y corregir la descomposición propuesta antes de fijarla como dato de verdad.
- [x] **TREE-04**: El sistema auto-construye el grafo ramificado (DAG) de progresiones a partir del orden del SPOM/`dificultadLineal` y las 3 dimensiones estructuradas (sub-familias paralelas dentro de cada ruta, ordenadas por palanca y contracción).
- [x] **TREE-05**: Los ejercicios quedan saneados: los ~103 sin ruta reciben ruta, los duplicados (mismo ejercicio repetido en varios niveles) se resuelven y `position` se separa en sus conceptos.
- [x] **TREE-06**: El miembro ve su % de avance por familia/nodo del árbol, agrupado por la categoría temática existente (Tracción / Empuje / Piernas / Core / Movilidad).
- [x] **TREE-07**: Los profes editan el árbol desde una sección nueva del admin: reordenan ejercicios, agrupan/separan sub-familias y ajustan precedencias sobre el grafo ya construido.

### Eje 1 — Nivel Kairos (KAIROS)

- [x] **KAIROS-01**: El nivel `kairos` existe en el enum de niveles en API, app y admin (5→6 niveles: kairos → alfa → delta → sigma → omega → spartan), incluido su mapeo a level-group.
- [x] **KAIROS-02**: La generación de sesión Kairos hereda de Alfa, tomando los ejercicios Alfa de `difficulty = 1` (el escalón más fácil) mientras no haya contenido propio de Kairos.
- [x] **KAIROS-03**: Las sesiones Kairos fuerzan, sobre el esqueleto de bloques normal, formato **solo lineal** (sets×reps) con exactamente **2 ejercicios por bloque** (sin EMOM/AMRAP/circuitos/complejos).
- [x] **KAIROS-04**: Los alumnos nuevos arrancan en Kairos por defecto (cambia el default de `users.level` de `alfa` a `kairos`).
- [x] **KAIROS-05**: Un alumno gradúa automáticamente de Kairos a Alfa al cumplir un umbral configurable de sesiones completadas.
- [x] **KAIROS-06**: El coach puede saltar manualmente a un alumno de nivel, anulando la graduación automática.
- [x] **KAIROS-07**: El selector de nivel muestra el 6º recuadrito (Kairos) en app y admin sin romper el layout (scroll/paginado donde haga falta).

### Eje 3 — Ajuste de dificultad in-session (ADJUST)

- [ ] **ADJUST-01**: Durante la sesión, el miembro puede pedir "↓ más fácil" o "más difícil ↑" por ejercicio desde el player.
- [ ] **ADJUST-02**: Al pedir el ajuste, el árbol sirve el ejercicio vecino un escalón arriba/abajo conservando ruta, contracción, formato y dosis del bloque (solo cambia el ejercicio por su vecino en la cadena ruta × contracción).
- [x] **ADJUST-03**: El sistema persiste un registro de "ejercicio dominado / bajado" por miembro (nuevo, distinto del "completado" local + RPE de la sesión entera).
- [ ] **ADJUST-04**: El registro de dominado alimenta el % de avance del árbol (TREE-06) y es visible para el coach.

---

## Future Requirements (deferred)

- **Contenido propio de Kairos** cargado por los profes (ejercicios específicos del nivel); mientras tanto Kairos hereda de Alfa.
- **Upsell por estancamiento** ("estancado en piernas → plan de $X") apoyado en el registro de dominados del árbol.
- **Ejes adicionales** de dificultad si los profes los identifican (tempo, rango, asistencia con banda).
- **Trabajo "de pie"** y otras prescripciones de Kairos pendientes del audio del Trainer.

## Out of Scope

- Cambio automático de nivel o de la planificación del SPOM a partir del ajuste in-session (sigue siendo criterio del coach).
- Sistema de "dominar" por volumen/repeticiones (el criterio es binario contra la prescripción del bloque, no acumulativo).
- Atar Kairos al funnel de conversión de la sesión de prueba (fase 123 de v5.0): la conversión es del lado profes/clase, no de este milestone.
- UI del admin para las 6 métricas de v5.0 (milestone de frontend aparte, en cola).
- Splits mecánicos de archivos largos (v4.9 Refactor Splits, en cola).

## Traceability

<!-- REQ-ID → Phase (filled by roadmap). 18/18 mapped (fases 124-131, v5.1). -->

| Requirement | Phase     | Status        |
| ----------- | --------- | ------------- |
| TREE-01     | Phase 124 | Complete      |
| TREE-02     | Phase 125 | Complete      |
| TREE-03     | Phase 125 | Complete      |
| TREE-04     | Phase 126 | Complete      |
| TREE-05     | Phase 124 | Complete      |
| TREE-06     | Phase 127 | Complete      |
| TREE-07     | Phase 128 | Complete      |
| KAIROS-01   | Phase 129 | Complete      |
| KAIROS-02   | Phase 129 | Complete      |
| KAIROS-03   | Phase 129 | Complete      |
| KAIROS-04   | Phase 130 | Done          |
| KAIROS-05   | Phase 130 | Done          |
| KAIROS-06   | Phase 130 | Done          |
| KAIROS-07   | Phase 130 | Done          |
| ADJUST-01   | Phase 131 | Pending       |
| ADJUST-02   | Phase 131 | Pending       |
| ADJUST-03   | Phase 131 | Done (131-01) |
| ADJUST-04   | Phase 131 | Pending       |
