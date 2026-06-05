# Phase 125: Bootstrap (heurístico) + revisión de profes - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-06-04
**Phase:** 125-bootstrap + revisión de profes de la descomposición
**Areas discussed:** Estado revisable, Qué propone el motor, Cómo corre el bootstrap, UX de revisión

---

## Estado revisable (modelo de datos)

| Option                       | Description                                                 | Selected |
| ---------------------------- | ----------------------------------------------------------- | -------- |
| Tabla de propuestas separada | `exercise_dimension_proposals`; aceptar escribe a exercises | ✓        |
| Flag en exercises            | LLM escribe directo + dimensions_confirmed=false            |          |

**User's choice:** Tabla separada. No contamina exercises; 126 solo lee confirmado; auditable/re-ejecutable.

---

## Qué propone el motor

| Option                                  | Description                       | Selected |
| --------------------------------------- | --------------------------------- | -------- |
| Sub-familia + leverage + ruta-pendiente | Nombres canónicos; no toca effort | ✓        |
| + validar effort                        | Mete al motor en la contracción   |          |
| Solo sub-familia                        | Leverage/ruta a mano              |          |

**User's choice:** Sub-familia (canónica) + leverage + ruta para route_pending; effort se confía. Normalización fina → profes/128.

---

## Cómo corre el bootstrap — y el cambio de motor LLM → heurístico

| Option                       | Description                            | Selected |
| ---------------------------- | -------------------------------------- | -------- |
| Script one-off re-ejecutable | Analog saneo-exercises.ts, idempotente | ✓        |
| Job desde el admin           | Endpoint + long-job + progreso UI      |          |

**User's choice:** Script one-off (lo corren devs; profes solo revisan).

**Aclaraciones pedidas por Franco (Other):**

1. "¿Qué es el bootstrap LLM / cómo lo usan los profes?" → Se explicó: proceso de un solo uso que auto-propone la descomposición de ~1.493 nombres; profes solo usan la pantalla de revisión, no disparan el motor.
2. "¿Qué es el Anthropic SDK? Nunca usé Claude por API." → Se explicó la API/SDK. Al verificar: la `ANTHROPIC_API_KEY` es **placeholder** en `.env.example` y **NO se pasa en ningún deploy** → la feature de IA de franchise (Phase 38) **nunca corrió en prod** (código durmiente). Corrección de un claim previo incorrecto.

**Decisión de motor:**

| Option                | Description                                                                    | Selected |
| --------------------- | ------------------------------------------------------------------------------ | -------- |
| Heurístico (sin API)  | Reglas sobre códigos de ruta + keywords de palanca; cero key/costo/dependencia | ✓        |
| LLM (sacar key nueva) | Mejor calidad sub-familia fina; requiere key válida                            |          |
| Híbrido               | Heurístico + LLM para los no-clasificables                                     |          |

**User's choice:** **Heurístico, sin API.** Cambia TREE-02 de "LLM" a "bootstrap heurístico" (mismo objetivo, distinto motor). Alineado wording en REQUIREMENTS + ROADMAP.

---

## UX de revisión de profes

| Option                            | Description                                                                      | Selected |
| --------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Tabla filtrable + aceptar en lote | Agrupada por ruta, edición inline, aceptar-grupo + override; reusa ExercisesPage | ✓        |
| Cola por ejercicio                | Uno por uno (inviable para 1.493)                                                |          |
| Solo lo dudoso                    | Auto-aceptar alta confianza, revisar dudosos                                     |          |

**User's choice:** Tabla filtrable + aceptar en lote. Sobre lista plana (el árbol no existe hasta 126); distinta del editor de árbol (128).

## Claude's Discretion

- Columnas/índices exactos de `exercise_dimension_proposals`; forma del endpoint (list/accept/reject/bulk); mapa ruta→sub-familia base y keywords de palanca del heurístico; nº de migración (~0138).

## Deferred Ideas

- Motor LLM/híbrido (si hay key válida en el futuro).
- Auto-aceptación por umbral de confianza.
- Normalización fina de sub-familias (revisión + 128).
- Limpieza de `effort` (~30% sucio).
