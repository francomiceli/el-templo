# Phase 202: Carga sin parpadeos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-23
**Phase:** 202-carga-sin-parpadeos
**Areas discussed:** Qué se ve mientras carga, Mi Templo: qué espera a qué, Red lenta / perfil tardío, HTTP/2: cuándo y cómo

---

## Qué se ve mientras carga

| Option | Description | Selected |
|--------|-------------|----------|
| Esqueleto que reserva lugar | Cada card ocupa su espacio final con esqueleto; se rellena sin mover nada | ✓ |
| Loader de página hasta tener todo | Un spinner hasta que llegan todos los pedidos | |
| Ocultar hasta tener datos | La card no existe hasta tener dato; sigue empujando | |

| Option (cards que pueden quedar vacías) | Description | Selected |
|--------|-------------|----------|
| Esqueleto solo si suele tener datos | Recordar en el teléfono si la última vez tuvo contenido | ✓ |
| Siempre esqueleto y colapsar | Salto hacia arriba cuando no hay contenido | |
| Ubicar las opcionales al final | Cambia el orden de Mi Templo (199) | |

| Option (último dato conocido) | Description | Selected |
|--------|-------------|----------|
| No, solo esqueletos | Nunca mostrar dato posiblemente viejo | ✓ |
| Sí, solo datos que casi no cambian | Perfil, sede, catálogo desde el teléfono | |
| Sí, para todo | App abre llena; riesgo de dato viejo | |

| Option (Planes) | Description | Selected |
|--------|-------------|----------|
| Completa de una vez | Pedidos en paralelo, esqueletos mientras | ✓ |
| Por secciones | Cada sección con su esqueleto | |

**User's choice:** las cuatro recomendadas.

---

## Mi Templo: qué espera a qué

| Option (card de hoy) | Description | Selected |
|--------|-------------|----------|
| Esqueleto hasta tener todo lo suyo | /sessions/weekly en paralelo | ✓ |
| Mostrar ya y completar detalles | Mantiene el cambio de título | |

| Option (acciones secundarias) | Description | Selected |
|--------|-------------|----------|
| Sí, la card sale completa | plan-status + trial-eligibility en paralelo con la suscripción | ✓ |
| No, lugar reservado para el botón | Hueco o salto si no corresponde botón | |

| Option (pedido que falla o tarda) | Description | Selected |
|--------|-------------|----------|
| Tope y mostrar lo seguro | ~6–8 s, sin inventar estados, se completa si llega después | ✓ |
| Mensaje de error con reintentar | Más ruido con señal floja | |
| Esqueleto hasta que llegue | Gris indefinido con mala señal | |

---

## Red lenta / perfil tardío

| Option | Description | Selected |
|--------|-------------|----------|
| Esqueleto en lo que depende del perfil | Nunca adivinar presencial/virtual | ✓ |
| Saludo genérico + esqueleto en la card | "Hola!" sin nombre | |
| Aviso "Conectando…" | Elemento extra que aparece/desaparece | |

**Notes:** tz por defecto sin perfil, Entrenar con params adivinados y "Sin suscripción activa" en Perfil quedan a criterio de Claude con la misma regla.

---

## HTTP/2: cuándo y cómo

| Option (cuándo) | Description | Selected |
|--------|-------------|----------|
| Primero, solo, y medir | Antes/después limpio | ✓ |
| Al final de la fase | No se puede atribuir la mejora | |

| Option (cómo) | Description | Selected |
|--------|-------------|----------|
| Staging primero + log temporal | | |
| Staging primero, sin log | | |
| Directo a prod | | |

**User's choice (free text):** "que sea staging primero pero un check automatico, que no requiera que yo use la app de staging para probar".

**Follow-up:** se propuso un access_log temporal → Franco: "¿por qué temporal? ¿es pesado? me voy a olvidar de apagarlo". Explicado: ~60k líneas/día sin la TV, <1 MB/día comprimido, rotación existente.

| Option (access_log de la API) | Description | Selected |
|--------|-------------|----------|
| Sí, permanente sin la TV | Protocolo + tiempo, excluye el sondeo de TV | ✓ |
| Permanente con todo | +350k líneas/día de TV | |
| No | Solo el script | |

---

## Claude's Discretion

- Fuente única para sacar pedidos repetidos; componente y alto de los esqueletos; valor exacto del tope; reparto en planes; `progressionStore.loading`; CTA Empezar/Continuar de Entrenar.

## Deferred Ideas

- Stale-while-revalidate de contenido (descartado por ahora).
- Endpoint agregado para Mi Templo (cambio de API).
