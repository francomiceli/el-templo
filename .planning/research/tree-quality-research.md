# Research: Calidad del Árbol de Progresiones — comparación con frameworks de referencia

**Fecha:** 2026-06-07
**Método:** análisis de la DB propia (staging local post-0144, bootstrap corrido) + deep research web con verificación adversarial (101 agentes; fuentes primarias: charts oficiales de Overcoming Gravity 2nd Ed, r/bodyweightfitness RR, Calimove, Boostcamp, Calitree). Claims citados abajo sobrevivieron votación 3-0; una variante más fuerte del claim de bandas FIG fue refutada 0-3 y se descartó.

---

## 1. Radiografía del árbol propio (datos reales)

| Métrica                                                              | Valor                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Catálogo total                                                       | 1.493 ejercicios                                                         |
| En backbone (canónico, CON/EXC/ISO, sin habilidad, ruta no excluida) | 973 nodos en 59 particiones (ruta × esfuerzo)                            |
| Particiones con 21-40 ejercicios                                     | 14 (414 ejercicios)                                                      |
| Particiones con 40+ ejercicios                                       | 3 (209 ejercicios) — TTB CON llega a **102**                             |
| Valores distintos de dificultad_lineal                               | 12 (1-12)                                                                |
| `progression_step` / `habilidad` poblados                            | 0 (pendiente revisión de profes; 1.176 propuestas)                       |
| Sin ruta                                                             | 103 (CARDIO 43, PLYO 36, KL 19, LOWER 5) — correctamente fuera del árbol |

**Problema central verificado:** TTB CON tiene 102 ejercicios y solo 11 niveles → 5-16 empates por nivel con orden arbitrario. Muestreo de los 16 empatados en dl=5: NO son variantes del mismo ejercicio, son **movimientos distintos** (TTB, Around-The-World, Windshield, Bent-Arm, One-Arm) cada uno con su mini-escalera de posición (tuck→pike→straddle). Falta el nivel intermedio ruta → movimiento/hito → variante.

**Activos sin explotar:**

- `category` fina ya existe y está poblada: PULL VERTICAL (291) / PULL HORIZONTAL (198) / PUSH HORIZONTAL (263) / PUSH VERTICAL (151) / KNEE DOMINANT (130) / HIP DOMINANT (130) / CORE ANTERIOR-POSTERIOR-LATERAL — coincide 1:1 con cómo los frameworks serios subdividen.
- `exercise_2` (movimiento base) agrupa bien en algunas rutas (FL: 28 movimientos × 4.5 variantes) pero está sucio/vacío en otras (TTB casi único por fila; BL en NULL) → un agrupamiento por movimiento requiere normalización tipo `route-progression-map`, no sale gratis.
- Las aristas manuales de precedencia (fase 128) ya existen y son el mecanismo exacto para prerequisitos cross-ruta.

## 2. Cómo lo hacen los frameworks de referencia (verificado)

**Overcoming Gravity (el estándar más riguroso):**

- **Doble eje explícito**: 4 charts por patrón (Handstand/Pulling/Pushing/Misc) × 8-9 columnas de habilidad objetivo por chart (~35 rutas). Patrón × habilidad conviven — igual que nuestro pattern/category × ruta. ✅ nuestro modelo de ejes es correcto.
- **Escala global de 16 niveles compartida por todas las rutas**, anclada al FIG Code of Points (estándar externo), con **bandas nombradas**: Beg(1-4) / A(5) / Int(6-8) / B(9) / Adv(10-12) / C(13) / Elite(14-16).
- **Escaleras CORTAS y dispersas: 4-13 hitos por ruta**, uno por nivel, celdas vacías donde no hay paso. Las variantes NO están en el chart — viven aparte ("Book Page #"). El chart solo muestra hitos canónicos.
- **Prerequisitos cross-ruta como grafo** (sombreado gris): Iron Cross no inventa escalones bajos; marca en gris "Full BL", "Half-Lay FL", "RTO 75° Dips" en otras columnas/charts. Rutas de élite arrancan en niveles altos.
- **Nivel explícito visible** en la app oficial: "Jumping Pull-ups – Level 1", "Full Front Lever – Level 8".
- Distingue **tipo de trabajo**: isométricos de fuerza (FL/BL/planche) vs skill/balance (handstand) vs bent-arm — eje adicional que usa estructuralmente (split straight-arm/bent-arm).

**r/bodyweightfitness RR:** 9 escaleras lineales por patrón, sin números — avance gateado por **criterio objetivo**: 3×8 reps dinámico (reinicia en 3×5), 3×30s isométrico.

**Calimove:** 6 niveles-pirámide globales con sub-rango interno por nivel; progresiones de 7 hitos con **múltiples variantes laterales agrupadas por nivel** (Nivel 4 push-up = Ring/Decline/Pike/Pseudo-Planche juntas). Hitos gruesos + variantes colgando, nunca escalera larga.

**Calitree (app skill tree):** 8 dominios en un solo eje, 100+ skills, estados Locked/Available/In Progress/Completed por prerequisitos — visualización videojuego por estados, no escala fina.

**Convergencia de TODOS los frameworks:** hitos gruesos sobre escala global compartida con bandas nombradas; las variantes cuelgan del hito; nadie expone escaleras de 100 pasos ni escala fina sin bandas.

## 3. Recomendaciones concretas para nuestro modelo

| #   | Cambio                                                                                                                                                                                                                       | Mecanismo                                                                                                                                         | Evidencia                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R1  | **Hitos canónicos**: cada (ruta × esfuerzo) = escalera de 8-13 hitos; el resto del catálogo se degrada a **variante de un hito**                                                                                             | Nuevo vínculo `milestone_exercise_id` (o reuso disciplinado de `canonical_exercise_id`); backbone solo hitos; variantes visibles al abrir el hito | OG (4-13/chart), Calimove (variantes laterales por nivel)          |
| R2  | **Bandas nombradas sobre dl 1-12**: mapear a los niveles existentes (alfa ≤3, delta 4-6, sigma 7-8, omega 9-10, spartan 11-12) con color por banda en cada nodo + nivel numérico visible                                     | Solo UI + `level-mapping` existente; dl sigue siendo escala global comparable entre rutas (estilo FIG)                                            | OG bandas, Boostcamp "– Level N"                                   |
| R3  | **Sub-grupos por `category` fina** dentro de las 5 categorías (Tracción → Pull Vertical / Pull Horizontal, etc.) como agrupador visual/filtro — la riqueza queda en las rutas, no convertirla en eje de navegación principal | Columna ya poblada; solo category-map + UI                                                                                                        | OG vive con 4 charts gruesos porque las 35 columnas dan la riqueza |
| R4  | **Prerequisitos cross-ruta para rutas de élite** (FLR arranca en dl 5, PLPU en dl 4): declarar aristas grises hacia hitos de otras rutas en vez de rellenar escalones bajos                                                  | Aristas `manual` de 128 ya existentes + render distinto (gris/punteado) en el mapa                                                                | Patrón "Rec PRE-REQs in Gray" de OG                                |
| R5  | **Criterio de avance objetivo por hito** (3×8 dinámico / 3×30s isométrico) para que "dominado" tenga definición falsable, no solo el tap                                                                                     | Campo de criterio en el hito + texto en player                                                                                                    | RR                                                                 |
| R6  | **Estados de nodo tipo videojuego** en la vista miembro: Bloqueado/Disponible/En progreso/Dominado por prerequisitos                                                                                                         | tree-progress ya calcula reached; agregar estado "available" (vecino de reached)                                                                  | Calitree                                                           |

**Orden sugerido:** R2+R3 (baratos, solo lectura/UI, mejoran visibilidad ya) → R1 (el estructural, requiere curación de profes — encaja con la revisión de propuestas pendiente: aceptar propuesta podría marcar hito vs variante) → R4 → R6 (member app) → R5.

## 4. Decisiones tomadas (2026-06-07, con el usuario)

1. **R1 vínculo:** columna nueva `milestone_exercise_id` (NO reusar `canonical_exercise_id` — semánticas distintas; canonical queda libre para dedup futura). Backbone agrega `AND milestone_exercise_id IS NULL`.
2. **R1 curación:** heurística propone hitos (ejercicio más canónico por movimiento × escalón, token exacto del route-progression-map), profe corrige en el drawer de revisión del mapa. Mismo patrón bootstrap→revisión de fase 125.
3. **R2 bandas:** niveles de miembro existentes INCLUYENDO kairos: kairos dl 1-2, alfa 3, delta 4-6, sigma 7-8, omega 9-10, spartan 11-12. Color por nivel + dl numérico visible en cada nodo.
4. **TTB split:** se decide después CON los profes en la revisión, pero la separación TTB / Windshield / ATW es importante — dejar señalizado en la UI de revisión (no perderlo).

## 5. Decisiones abiertas originales (histórico)

1. R1: ¿el vínculo hito↔variante es columna nueva (`milestone_exercise_id`) o se reusa `canonical_exercise_id` (hoy sin uso real: 0 filas)? Reusar evita migración pero mezcla semánticas ("mismo ejercicio con otro nombre" vs "variante del hito").
2. R1: ¿quién elige los hitos? Opción A: heurística (el de nombre más corto / más genérico por movimiento+posición) propuesta al profe; Opción B: 100% manual en el drawer de revisión.
3. R2: ¿bandas = niveles de miembro existentes (alfa…spartan, ya cargados de significado) o bandas nuevas neutras (Básico/Intermedio/Avanzado/Elite)?
4. ¿TTB amerita partirse en 2-3 rutas (TTB / Windshield / ATW) además de hitos? Los datos sugieren que mezcla movimientos genuinamente distintos.
