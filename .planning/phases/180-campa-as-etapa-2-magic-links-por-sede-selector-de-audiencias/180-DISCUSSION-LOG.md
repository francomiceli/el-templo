# Phase 180: Campañas etapa 2 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-22
**Phase:** 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
**Areas discussed:** Magic link: sesión y seguridad, CTA por sede del freemium, Audiencias: definición y UX, ReservasPage informativa

---

## Magic link: sesión y seguridad

| Option                       | Description                                                  | Selected |
| ---------------------------- | ------------------------------------------------------------ | -------- |
| Login completo (Recomendado) | Emite el mismo par access 30m + refresh 30d del login normal | ✓        |
| Sesión acotada solo-reserva  | Scope limitado a trial-eligibility + reserve-trial           |          |
| Vos decidís                  | Discreción de Claude                                         |          |

| Option                      | Description                     | Selected |
| --------------------------- | ------------------------------- | -------- |
| Multi-uso 30d (Recomendado) | Loguea hasta expirar a 30d      |          |
| One-use + página intermedia | POST del botón consume el token |          |
| One-use estricto en GET     | Se quema con el prefetch        |          |

**User's choice:** "multi uso 7d" — multi-uso pero con expiración a 7 días (custom).

| Option                                 | Description                                                 | Selected |
| -------------------------------------- | ----------------------------------------------------------- | -------- |
| Ruta web nueva en la app (Recomendado) | Ruta pública en el-templo-app que valida, loguea y redirige | ✓        |
| Página en la landing (el-templo-web)   | Valida en eltemplo.org y redirige cross-domain              |          |

| Option                                              | Description                       | Selected |
| --------------------------------------------------- | --------------------------------- | -------- |
| Mismo user navega; distinto reemplaza (Recomendado) | Determinista, reemplazo explícito | ✓        |
| Respetar siempre la sesión existente                | Nunca pisa sesión activa          |          |

**Notes:** Asunción comunicada sin objeción: token de login vencido degrada a login normal con redirect, tracking intacto.

---

## CTA por sede del freemium

| Option                             | Description                                                    | Selected |
| ---------------------------------- | -------------------------------------------------------------- | -------- |
| Genérico al selector (Recomendado) | Sin física asignada → CTA genérico; con física → personalizado |          |
| Default por país                   | Preselecciona sede default del país                            |          |
| Vos decidís                        | Discreción de Claude                                           |          |

**User's choice (rediseño):** "debe ver un popup antes de poder reservar en el que se le informan las sedes y las direcciones de cada una; esto lo convierte en un solo CTA en el mail" — un solo CTA magic link; sede se elige en popup in-app; tabla de sedes del mail queda informativa sin links por fila.

| Option                                     | Description                                 | Selected |
| ------------------------------------------ | ------------------------------------------- | -------- |
| Todo freemium en modo prueba (Recomendado) | Popup por elegibilidad, venga del mail o no | ✓        |
| Solo quien llega por el magic link         | Popup solo en aterrizaje de campaña         |          |

| Option                                     | Description                               | Selected |
| ------------------------------------------ | ----------------------------------------- | -------- |
| Popup elige, selector queda (Recomendado)  | Popup inicial setea el selector existente | ✓        |
| Popup reemplaza al selector en modo prueba | Sede solo vía popup                       |          |

---

## Audiencias: definición y UX

| Option                              | Description                     | Selected |
| ----------------------------------- | ------------------------------- | -------- |
| Ex-socios que pagaron (Recomendado) | inactivo + tuvo suscripción     | ✓        |
| Todos los inactivos                 | Sin filtro de historial de pago |          |

**Notes:** El usuario pidió aclaración del concepto "bajas" antes de decidir (no existe como estado; se explicó inactivo vs ex-socio).

| Option                               | Description                        | Selected |
| ------------------------------------ | ---------------------------------- | -------- |
| Tuvo trial y no compró (Recomendado) | booking is_trial sin plan comprado | ✓        |
| Solo leadStatus='perdido'            | Marca explícita de recepción       |          |
| Dos segmentos separados              | no_show vs asistió-sin-comprar     |          |

| Option                          | Description                   | Selected |
| ------------------------------- | ----------------------------- | -------- |
| Referidos pending (Recomendado) | referredId con status pending | ✓        |
| Referidores activos             | Socios que ya refirieron      |          |
| Ambos, como segmentos separados |                               |          |
| Vos decidís                     |                               |          |

| Option                               | Description                            | Selected |
| ------------------------------------ | -------------------------------------- | -------- |
| Segmentos predefinidos (Recomendado) | Dropdown + scope país + preview conteo | ✓        |
| Builder de filtros combinables       | Filtros componibles                    |          |

| Option                                  | Description                     | Selected |
| --------------------------------------- | ------------------------------- | -------- |
| Destino fijo por segmento (Recomendado) | Mapeo predefinido por audiencia | ✓        |
| Destino elegible por campaña            | Select de destino en el form    |          |

| Option                                | Description                    | Selected |
| ------------------------------------- | ------------------------------ | -------- |
| Un segmento por campaña (Recomendado) | Copy y destino coherentes      | ✓        |
| Multi-select con dedupe               | Combinar segmentos en un envío |          |

---

## ReservasPage informativa

| Option                         | Description                                | Selected |
| ------------------------------ | ------------------------------------------ | -------- |
| Solo modo prueba (Recomendado) | Card primera vez solo para freemium/prueba | ✓        |
| También socios nuevos          | Incluir socios <2 semanas                  |          |

| Option                        | Description                          | Selected |
| ----------------------------- | ------------------------------------ | -------- |
| Vos decidís (Recomendado)     | Claude elige mecánica del calendario |          |
| Link a Google Calendar        | Un solo link web                     |          |
| ICS + Google según plataforma |                                      |          |

**User's choice:** "¿vamos a hacer esto? no sería mejor enviar notificaciones propias de nuestra app? igual si no es muy costoso agregar lo de calendar" → follow-up:

| Option                                 | Description                                                | Selected |
| -------------------------------------- | ---------------------------------------------------------- | -------- |
| Push + calendario barato (Recomendado) | Recordatorio push pre-sesión + link Google Calendar mínimo | ✓        |
| Solo push, sin calendario              |                                                            |          |
| Solo calendario, push diferido         | Como estaba en el brief                                    |          |

| Option                          | Description                                           | Selected |
| ------------------------------- | ----------------------------------------------------- | -------- |
| Ustedes por admin (Recomendado) | Descripciones cargadas como dato vía ActivitiesDialog | ✓        |
| Claude propone y va por seed    | Copy commiteado por migración                         |          |

| Option                                | Description                                        | Selected |
| ------------------------------------- | -------------------------------------------------- | -------- |
| Enriquecer lo existente (Recomendado) | Estado "prueba reservada" enriquecido, persistente | ✓        |
| Pantalla de éxito dedicada            | Vista tipo ticket adicional                        |          |

---

## Claude's Discretion

- Mecánica del canje token→sesión y si el token de login extiende el HMAC de campaña o es token aparte.
- Detalle del recordatorio push (template, timing, texto) y del link de Google Calendar.
- Diseño visual del popup de sedes y bottom sheet de actividad.
- Naming de segmentos en la UI; esquema de persistencia del segmento en `campaigns`.

## Deferred Ideas

- Self-service de re-alta para bajas (pago desde el mail).
- Builder de filtros de audiencia.
- Follow-up automático a no-abiertos (sigue de la 119).
- Magic link como forgot-password general (primer passwordless del sistema — fase de auth propia).
- ICS multiplataforma.
- Gestión de sedes en el admin (sigue de la 119).
