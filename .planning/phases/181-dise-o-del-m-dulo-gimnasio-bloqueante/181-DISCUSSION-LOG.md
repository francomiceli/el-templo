# Phase 181: Diseño del módulo Gimnasio (bloqueante) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-27
**Phase:** 181-Diseño del módulo Gimnasio (bloqueante)
**Areas discussed:** Prior A3: modelo de datos, Superficie member-facing (DIS-02), Formato y validación del doc

---

## Cross-reference de todos

| Option                  | Description                                                                                                  | Selected |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| No plegar (Recomendado) | `v51-milestone-data-rollout.md` es rollout de datos del SPOM, sin relación con el diseño del módulo Gimnasio | ✓        |
| Plegar a la fase        | Incorporarlo al CONTEXT.md de la 181                                                                         |          |

**User's choice:** No plegar.

## Selección de áreas

Ofrecidas: Prior A3 modelo de datos / Superficie member-facing (DIS-02) / Ambición offline (def. 3) / Formato y validación del doc.
**Seleccionadas:** las tres primeras excepto offline (offline quedó a discreción de Claude/research).

---

## Prior A3: modelo de datos

| Option                         | Description                                                                                                    | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| Cerrada, doc fundamenta (Rec.) | Se toma como decisión; el doc escribe el fundamento y el caso peso-corporal-con-lastre, sin matriz comparativa | ✓        |
| Evaluación genuina             | Comparación seria unificar-vs-separar con trade-offs, decisión al final de la fase                             |          |

**User's choice:** Cerrada, doc fundamenta.

| Option                       | Description                                                                                          | Selected |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Exclusión mutua en v1 (Rec.) | Un tenant tiene UN sistema activo (Templo XOR Gimnasio); híbrido anotado como pregunta abierta de v2 |          |
| Diseñar el caso híbrido      | Contemplar tenant con ambos módulos y presentación unificada de dos historiales                      |          |
| (Freeform)                   | —                                                                                                    | ✓        |

**User's choice:** "No existe ni existirá el caso híbrido" — más fuerte que la opción recomendada: exclusión mutua como invariante, ni siquiera pregunta abierta de v2. Un alumno siempre ve UN historial.

---

## Superficie member-facing (DIS-02)

| Option                          | Description                                                         | Selected            |
| ------------------------------- | ------------------------------------------------------------------- | ------------------- |
| Nueva app en el monorepo (Rec.) | Cuarta app junto a api/app/admin, mismo stack, split NO se adelanta | ✓ (tras aclaración) |
| Repo nuevo (adelanta split)     | App multi-tenant en repo propio desde el día 1                      |                     |
| Decidir en la fase              | El doc compara y decide durante la 181                              |                     |

**User's choice:** Primero pidió aclaración ("¿estamos decidiendo el admin o la app? ¿el-templo-admin debería ser hogar de los nuevos tenants?"). Se aclaró el esquema de dos superficies: staff en `el-templo-admin` (ya multi-tenant, secciones gateadas) + alumnos en nueva web app/PWA del monorepo. El usuario confirmó: "sí, estamos en sintonía".

| Option                             | Description                                                                        | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Un dominio único para todos (Rec.) | app.<plataforma>.com, tenant resuelto desde la cuenta post-login                   |          |
| Subdominio por gimnasio            | gimnasioX.<plataforma>.com, branding pre-login, wizard aprovisiona DNS/nginx/certs | ✓        |
| Que lo resuelva el diseño          | El doc compara ambas con el research                                               |          |

**User's choice:** Subdominio por gimnasio (contra la recomendación — al usuario le importa el branding/URL propia por tenant).

---

## Formato y validación del doc

| Option                          | Description                                          | Selected |
| ------------------------------- | ---------------------------------------------------- | -------- |
| .docs/.../08-\*.md único (Rec.) | Un solo doc siguiendo la serie 01-07 del diseño v6.0 | ✓        |
| Varios docs por tema            | Separar por tema; fragmenta el documento de diseño   |          |

**User's choice:** Doc único `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`.

| Option                      | Description                                                                | Selected |
| --------------------------- | -------------------------------------------------------------------------- | -------- |
| Tablas+índices clave (Rec.) | Entidades, columnas clave, FKs e índices críticos; DDL final en fases 184+ | ✓        |
| DDL completo en el doc      | Schema Drizzle/SQL entero en el doc                                        |          |
| Solo conceptual             | Entidades y relaciones sin índices                                         |          |

**User's choice:** Tablas+índices clave.

| Option                              | Description                                         | Selected |
| ----------------------------------- | --------------------------------------------------- | -------- |
| Nacho firma = gate de cierre (Rec.) | La fase no se cierra sin OK de Nacho                |          |
| Franco firma, Nacho informativo     | Franco cierra; Nacho recibe el doc como información |          |
| (Freeform)                          | —                                                   | ✓        |

**User's choice:** "Valido ahora" → Franco firma sin gate de Nacho, y el pendiente A4 se validó en la misma discusión: mapeo confirmado tal cual (antebrazo→Bíceps, cuello→Core, 7 categorías) — "vamos con esto".

---

## Corrección post-discusión (2026-08-27) — modelo de app de alumnos

Disparador: análisis de políticas de tiendas (App Store Guidelines 4.3 spam / 4.2.6 template apps) aportado por el usuario desde otra consulta.

| Option                                    | Description                                                                                   | Selected |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| A — App container única multi-tenant      | Una sola app en tiendas desde la cuenta de la plataforma, branding por tenant en runtime      | ✓        |
| B — App por gimnasio (cuenta del cliente) | Cada gimnasio publica desde SU cuenta Apple/Google (4.2.6); requiere automatización de builds |          |
| C — N apps desde nuestra cuenta           | Prohibido por 4.3 (spam) — descartado de plano                                                |          |
| PWA sin tiendas (decisión original)       | Lo capturado en la discusión original ("sin tiendas en v1")                                   |          |

**User's choice:** "Mi objetivo es que pueda mantener una sola app en las tiendas para esto, pero que los miembros la vean cada una con su branding particular" → Opción A. D-03 corregida y D-11 agregada en CONTEXT.md.

**Follow-up (misma fecha):** el usuario preguntó si el trade-off de ícono/nombre genéricos es superable ("me gustaría mostrar ícono y nombre propios de cada gimnasio"). Análisis: dentro de Opción A el ícono es cambiable solo desde un set pre-empaquetado (release por gimnasio nuevo) y el nombre es imposible en iOS; ícono+nombre reales en la tienda solo los da el modelo 4.2.6. Acordado ("estoy de acuerdo") → **D-12**: v1 = A + PWA por subdominio para marca propia; "app con tu marca" como add-on premium futuro vía 4.2.6 (cuenta del gimnasio + builds automatizadas); requisito de diseño: branding 100% config por tenant, nunca código.

## Claude's Discretion

- Ambición offline (definición 3) — resolver en diseño/research con los guardrails del brief.
- Recálculo de récords (def. 4), superseries/circuitos (def. 5), esquema e índices (def. 6), mapa de `tenant_settings` (def. 7) — territorio del researcher/planner.
- Nombre/branding de la nueva app de alumnos — proponer en el doc.

## Deferred Ideas

Ninguna — la discusión se mantuvo dentro del alcance. Todo revisado no plegado: `v51-milestone-data-rollout.md`.
