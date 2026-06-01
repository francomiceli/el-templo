# Phase 119: Campaña de sesión de prueba freemium - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
**Areas discussed:** Estado al auto-reservar, Oferta (ventana y qué elige), Elegibilidad fina + re-envío, Tracking del funnel

---

## Pre-decisiones (conversación previa, antes de discuss)

| Decisión         | Valor                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Audiencia        | Todos los freemium elegibles (sin sub, sin trial previo)              |
| Canal de reserva | App self-service (deep link) + WhatsApp al flujo tradicional          |
| Estructura GSD   | Una sola fase grande (4 capas)                                        |
| Sistema de email | Resend + infra propia liviana, **reutilizable** para futuras campañas |

---

## Estado al auto-reservar

| Option                                       | Description                                                                                                                                    | Selected |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pasa a 'prueba' al reservar                  | Reusa trials-service (opera sobre 'prueba'), aparece en reporte de recepción (114), avanza funnel; createdBy=null para distinguir self-service | ✓        |
| Queda 'freemium', pasa a 'prueba' al asistir | Funnel más limpio pero requiere modificar trials-service y recepción no lo ve hasta que asiste                                                 |          |
| Queda 'freemium' siempre                     | Lo menos invasivo, pero no entra al reporte de trials ni avanza funnel                                                                         |          |

**User's choice:** Pasa a 'prueba' al reservar.
**Notes:** Coherente con el modelo existente; el self-service queda como lead caliente desde el momento de la reserva.

---

## Oferta — ventana y qué elige

| Option    | Description                                         | Selected |
| --------- | --------------------------------------------------- | -------- |
| 14 días   | Urgencia equilibrada, calendario ampliado a 14 días |          |
| 7 días    | Más urgencia, riesgo si abre tarde                  |          |
| 30 días   | Más relajado, mejor para inactivos, menos urgencia  | ✓        |
| No expira | Máxima flexibilidad, cero urgencia                  |          |

**User's choice (ventana):** 30 días.

| Option                                               | Description                                 | Selected |
| ---------------------------------------------------- | ------------------------------------------- | -------- |
| Todas las sedes físicas del país + cualquier horario | Máxima conversión, reusa el grid            | ✓        |
| Todas las sedes, solo horarios 'intro'               | Control de a qué clases entran, más trabajo |          |
| Una sola sede destacada                              | Simplifica pero limita                      |          |

**User's choice (sedes/horarios):** Todas las sedes + cualquier horario.
**Notes:** Reusar el selector de sucursal que ya existe para planes multisede. El email debe informar la dirección de cada sede para que el freemium sepa dónde queda antes de entrar a explorar las clases por sede.

---

## Elegibilidad fina + re-envío

| Option                              | Description                                                                                            | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Todos, incluidos ghosts e inactivos | Campaña de reactivación; los dormidos son el target. Default: no enviar a registros de últimos ~3 días | ✓        |
| Solo con algo de actividad          | Excluir ghosts; mejor deliverability, menos volumen                                                    |          |
| Excluir registros >1 año            | Sacar emails probablemente muertos                                                                     |          |

**User's choice (elegibilidad):** Todos, incluidos ghosts e inactivos.

| Option                            | Description                                            | Selected |
| --------------------------------- | ------------------------------------------------------ | -------- |
| Un solo envío esta campaña        | Sistema preparado para follow-up futuro, scope acotado | ✓        |
| Follow-up automático en esta fase | Más conversión pero suma scheduler/re-targeting        |          |

**User's choice (re-envío):** Un solo envío esta campaña.

---

## Tracking del funnel

| Option                          | Description                                            | Selected |
| ------------------------------- | ------------------------------------------------------ | -------- |
| Completo, con pixel de apertura | enviado→abierto(pixel)→click→reservó→asistió→convirtió | ✓        |
| Sin pixel de apertura           | Sin la métrica de apertura                             |          |

**User's choice (alcance):** Completo con pixel de apertura.

| Option                                  | Description                                | Selected |
| --------------------------------------- | ------------------------------------------ | -------- |
| Sección "Campañas" dedicada en el admin | Hogar del sistema reutilizable             | ✓        |
| Tab dentro de analytics/Reportes        | Reusa patrón 117/118 pero mezcla conceptos |          |
| Sin UI ahora — datos + export           | Lo más rápido, sin visibilidad cómoda      |          |

**User's choice (dónde se ve):** Sección "Campañas" dedicada en el admin.
**Notes:** Unsubscribe definido como solo marketing/campañas (no afecta transaccionales ni push) — sin objeción.

---

## Claude's Discretion

- Esquema de tablas de campaña/envíos/eventos de tracking y columna `source` para distinguir self-service.
- Mecanismo del token (firma, payload, pre-identificación de la pantalla de reserva).
- Implementación del pixel de apertura y redirect de click.
- Cómo se ofrece la reserva-de-prueba a un freemium en ReservasPage.vue y el endpoint nuevo.
- Estructura del deep link + fallback sin app.
- Copy/tono/asunto del email (a iterar con el usuario).
- Número y mensaje del CTA de WhatsApp.

## Deferred Ideas

- Follow-up/re-envío automático (scheduler de re-targeting).
- Conversión automática post-asistencia.
- Recordatorio pre-sesión.
- Landing web de reserva.
- Email Service Swap (Resend → nodemailer + Workspace SMTP).
- Centralizar el cliente Resend duplicado.
