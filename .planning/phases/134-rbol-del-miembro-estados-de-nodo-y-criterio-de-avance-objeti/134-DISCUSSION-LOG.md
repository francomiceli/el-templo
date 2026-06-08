# Phase 134: Árbol del miembro — estados de nodo y criterio de avance objetivo (member app) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti
**Areas discussed:** Definición de los 4 estados, Semántica del %, Criterio R5 (derivado vs campo), Prerequisitos para Bloqueado, Tratamiento visual de Mi Árbol

---

## R6 — Definición de los 4 estados (qué significa "Dominado")

| Opción                             | Descripción                                                 | Elegida |
| ---------------------------------- | ----------------------------------------------------------- | ------- |
| Dominado = evidencia real          | dl≤techo NO alcanza; exige tap dominado O sesión completada | ✓       |
| Dominado = reached actual (amplio) | Reusa el `reached` binario (incluye dl≤techo)               |         |
| Tres tiers de evidencia            | Dominado=tap, En progreso=sesión, Disponible=dl≤techo       |         |

**User's choice:** Dominado = evidencia real.
**Notes:** Coherente con R5 (dominar debe ser falsable). Consecuencia: la mayor parte del sub-techo queda Disponible, no Dominado.

## R6 — Definición de "En progreso"

| Opción                        | Descripción                                           | Elegida |
| ----------------------------- | ----------------------------------------------------- | ------- |
| Frontera de la ruta           | Primer hito no-dominado con prereqs OK (uno por ruta) | ✓       |
| En mi programa activo         | Nodo en prescripciones de la semana vigente           |         |
| Sin 'En progreso' (3 estados) | Colapsar a Dominado/Disponible/Bloqueado              |         |

**User's choice:** Frontera de la ruta.
**Notes:** Cero costo backend; "antorcha" next-up clara.

## Semántica del % del anillo

| Opción                     | Descripción                                           | Elegida |
| -------------------------- | ----------------------------------------------------- | ------- |
| % = alcanzable de tu nivel | Mantener fórmula actual, re-etiquetar; estados aparte | ✓       |
| % = dominado (evidencia)   | % cuenta solo dominados; cae fuerte                   |         |
| Dos porcentajes            | Mostrar dominado + alcance                            |         |

**User's choice:** % = alcanzable de tu nivel.
**Notes:** Evita regresión de percepción (que el % se desplome de un día para otro). Hay que comunicar que anillo (alcance) y verde (dominio) miden cosas distintas.

## R5 — Criterio de avance en el player

| Opción                       | Descripción                                        | Elegida |
| ---------------------------- | -------------------------------------------------- | ------- |
| Derivado de la contracción   | ISO→3×30s, CON/EXC→3×8 (reinicia 3×5); 0 migración | ✓       |
| Campo curado por hito        | Columna `advance_criterion` + UI admin             |         |
| Híbrido: derivado + override | Regla default + override opcional por hito         |         |

**User's choice:** Derivado de la contracción.
**Notes:** Determinístico, coincide con la regla del roadmap/RR; imposible que quede sin cargar.

## R6 — Prerequisitos para "Bloqueado"

| Opción                  | Descripción                                                                            | Elegida |
| ----------------------- | -------------------------------------------------------------------------------------- | ------- |
| Híbrido nivel + grafo   | Disponible si dl≤techo O prereqs grafo dominados; Bloqueado si dl>techo Y falta prereq | ✓       |
| Solo nivel (techo)      | Umbral dl≤techo; ignora aristas                                                        |         |
| Solo grafo (secuencial) | Predecesor inmediato dominado; colapsa con En progreso                                 |         |

**User's choice:** Híbrido nivel + grafo.
**Notes:** Honra R4 (rutas de élite bloqueadas hasta dominar prereq cross-ruta); degrada bien sin aristas curadas.

## R6 — Tratamiento visual de Mi Árbol

| Opción                        | Descripción                                                            | Elegida |
| ----------------------------- | ---------------------------------------------------------------------- | ------- |
| Refresh de la lista actual    | Lista por ruta + color banda + dl + ícono/color por estado; solo hitos | ✓       |
| Hitos expandibles + variantes | Suma variantes al abrir el hito (cambia contrato)                      |         |
| Mapa skill-tree (grafo)       | Rediseño Vue Flow en member                                            |         |

**User's choice:** Refresh de la lista actual.
**Notes:** Bajo riesgo, entra completo en la fase. Variantes y grafo → fases aparte.

## Claude's Discretion

- Íconos/colores exactos por estado y banda (reusar paleta de niveles, sin azul).
- Layout del texto de criterio en el player.
- Forma de exponer `state` en el contrato `GET /tree-progress/me` (preferible server-side).

## Deferred Ideas

- Hitos expandibles + variantes en member (cambia contrato) — fase aparte.
- Mapa skill-tree con Vue Flow en member — fase aparte.
- Criterio R5 curado/override por hito — si aparece un caso no cubierto por la regla.
- Split de TTB (TTB/Windshield/ATW) — con los profes en la revisión del mapa.
