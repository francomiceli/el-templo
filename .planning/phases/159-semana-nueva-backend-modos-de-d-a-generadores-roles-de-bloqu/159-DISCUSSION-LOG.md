# Phase 159: Semana nueva backend — modos de día, generadores, roles de bloque y horarios - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
**Areas discussed:** Parámetro reps del combo, Composición de bloques I/II, Bloque STRETCHING, Clases en horarios

---

## Parámetro reps del combo

| Option                           | Description                                                     | Selected |
| -------------------------------- | --------------------------------------------------------------- | -------- |
| Veces que se repite la secuencia | Rounds presentado como "repeticiones del combo"                 |          |
| Reps por ejercicio individual    | Cada ejercicio con su número de reps (como Complex/Combos prod) |          |
| Confirmar con el coach           | Validar con Frank                                               |          |

**User's choice:** Free-text — "acá hay que seguir con la forma actual de reps que usa el profe".
**Notes:** Se mantiene el formato "Combos" ya en prod (rondas + reps por ejercicio). No se introduce parámetro único de reps. Supera la redacción original de SEM-02.

---

## Composición de bloques I y II

| Option                          | Description                            | Selected |
| ------------------------------- | -------------------------------------- | -------- |
| COMBOS I superior / II inferior | Filtro por ruta tren superior/inferior | ✓        |
| Ambos full body (FB)            | Sin filtro de ruta                     |          |
| Confirmar con el coach          | —                                      |          |

**User's choice (combos):** I = tren superior, II = tren inferior.

**User's choice (técnica):** Free-text — "el día de técnicas se basa en trabajar dos bloques de una misma ruta, para afianzar el aprendizaje de la misma (ej. técnica I y II es planche); el generador debería elegir la misma ruta, luego el profesor la edita". Pidió además investigación SSH read-only para ver cómo se vienen haciendo.

**User's choice (niveles):** Sí, los 6 niveles (alfa, delta, sigma, omega, kairos, spartan).

---

## Bloque STRETCHING

| Option                                          | Description                     | Selected |
| ----------------------------------------------- | ------------------------------- | -------- |
| Rol STRETCHING, nivel único, formato Stretching | Rol propio + formato 0172       |          |
| Reutilizar rol/pool de ROM (movilidad)          | mobility_related + pool 126 ej. | ✓        |
| Confirmar con el coach                          | —                               |          |

**User's choice:** Reutilizar el pool de movilidad de ROM. Selección: generador elige 4, coach edita.
**Notes:** Bloque final llamado STRETCHING (cerrado en la spec), nivel único.

---

## Clases en horarios

| Option                                    | Description                        | Selected |
| ----------------------------------------- | ---------------------------------- | -------- |
| Solo nombre visible derivado del day_mode | Etiqueta, sin tocar reservas/cupos | ✓        |
| Actividad nueva en activities             | Con reservas/cupos/gating          |          |
| Confirmar con Franco/Nacho                | —                                  |          |

**User's choice:** Nombre visible derivado del modo del día (mié="Combos", jue="Técnica"); además renombrar "Calistenia" → "General" para los días regulares. Global todas las sedes.
**Notes:** Los alumnos ven Combos/Técnica según el día en vez de Calistenia; el resto de la semana "General".

---

## Corrección post-SSH (2026-08-13) — investigación read-only en prod

El usuario aportó que ya existen planis "del 17-23" preparadas para el nuevo sistema y que asumen mié=técnica/jue=combos (al revés de lo asumido). Investigación SSH read-only (DB `eltemplo`) reveló:

- **El régimen ALTERNA por decisión del profe, no es fijo ni por paridad.** NUCLEUS por semana: W21 mié Combos/jue técnica; W23 igual; W24/W25/W26 mié técnica/jue combos. La conclusión del discovery ("fijo desde W19") quedó desmentida.
- Las "planis del 17-23" = **semana 26** (creada 11-ago). La semana 27 real aún solo tiene el sábado ROM.
- Combos: `{"type":"combos","rounds":""}` + reps por ejercicio (confirma "forma actual").
- 6 niveles reales (alfa/delta/kairos/omega/spartan/sigma) en 3 level_group.
- Bloque final actual = EPIKOS (Flow Guiado/Circuito cooperativo) → lo reemplaza STRETCHING.

**Decisiones corregidas (AskUserQuestion 2026-08-13):**

- Modelo: **el profe elige el tipo de sesión por día en `/generate`** (regular/rom/combos/tecnica); day_modes queda solo default ROM. (Reemplaza el modelo day_modes-fijo de la primera pasada — D-02/D-03.)
- Etiqueta en horarios/app: **derivada de la sesión generada del día** (combos→Combos, tecnica→Técnica, regular→General), no un mapeo fijo mié/jue. (D-15.)
- **Base de rama = master** (v6.0 no va a master aún).

## Claude's Discretion

- Convención de nombres de roles nuevos (seguir estilo ROM\_\*).
- Degradación cuando el pool de ruta es fino para 6 niveles × 2 bloques.
- Cantidad exacta de ejercicios por combo (arrancar de lo que muestre el discovery, editable).

## Deferred Ideas

- Actividades reales Combos/Técnica en `activities` con reservas propias.
- `day_modes` por sede (`branch_id`).
- Viernes como modo "open" (sigue regular).
- Reps del combo como parámetro único (reabrir solo si el coach lo pide).
- Todo revisado no incorporado: "Rollout de datos v5.1 — poblar milestone_exercise_id".
  </content>
