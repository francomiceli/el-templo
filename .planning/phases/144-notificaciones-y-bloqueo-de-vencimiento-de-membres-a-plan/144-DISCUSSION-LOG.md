# Phase 144: Notificaciones y bloqueo de vencimiento de membresía/plan - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
**Areas discussed:** Push: categoría y disparo, Pop-up in-app: comportamiento, Bloqueo de reserva: alcance, Renovación ya agendada

---

## Push: categoría

| Option             | Description                                                     | Selected |
| ------------------ | --------------------------------------------------------------- | -------- |
| entrenamiento      | Lo que pidió el usuario; la membresía habilita el entrenamiento |          |
| programas          | Lo que usa el análogo program_renewal_warning; puede confundir  |          |
| nueva: 'membresia' | Categoría nueva dedicada, más blast radius                      |          |

**User's choice:** Categoría nueva, que se llame "Planes" (display). Enum value `planes`.
**Notes:** Prefirió una categoría propia con su toggle, distinta del nombre tentativo "membresia".

## Push: disparo

| Option           | Description                           | Selected |
| ---------------- | ------------------------------------- | -------- |
| Solo a 7 días    | Un único push, igual a programas      |          |
| A 7 y a 3 días   | Dos push, copy distinto               |          |
| 7, 3 y al vencer | Tres push: 7d, 3d y el día que venció | ✓        |

**User's choice:** Las 3, y que se puedan deshabilitar si no se quieren usar.
**Notes:** El "deshabilitar" se resuelve con el toggle de la categoría "Planes" en notification_preferences (mecanismo existente).

## Pop-up in-app: salteable

| Option                   | Description                                 | Selected |
| ------------------------ | ------------------------------------------- | -------- |
| Salteable (botón cerrar) | X / "Ahora no" + botón WhatsApp, no bloquea | ✓        |
| Bloqueante               | Obliga a tocar WhatsApp/renovar             |          |

**User's choice:** Salteable (opción 1).
**Notes:** Corrigió que el **pop-up es a falta de 3 días, no de 7** (los 7d quedan solo en el push).

## Pop-up in-app: repetición

| Option           | Description                             | Selected |
| ---------------- | --------------------------------------- | -------- |
| 1 vez por umbral | Una sola vez al cruzar cada umbral      |          |
| 1 vez por día    | Reaparece cada día hasta cerrar/renovar | ✓        |
| Cada apertura    | Cada vez que abre la app                |          |

**User's choice:** 1 vez por día desde ≤3d, hasta que renueve.

## Bloqueo de reserva: alcance

| Option           | Description                                                  | Selected |
| ---------------- | ------------------------------------------------------------ | -------- |
| Solo presencial  | Solo clases presenciales (único flujo de reserva con grilla) | ✓        |
| Todos los planes | Cualquier plan con end_date                                  |          |

**User's choice:** Solo presencial.

## Bloqueo de reserva: end_date NULL

| Option              | Description                            | Selected |
| ------------------- | -------------------------------------- | -------- |
| Nunca bloquear      | NULL = no validar, reservar libremente | ✓        |
| Tratar como vencido | NULL = bloquear                        |          |

**User's choice:** Nunca bloquear (opción 1).
**Notes:** Preguntó qué planes tienen end_date NULL. Respuesta verificada en código: `subscription_plans.duration_days` es NOT NULL y `end_date` se computa siempre = startDate + durationDays; un NULL solo aparecería en filas legacy/manuales. La guarda es defensiva.

## Renovación ya agendada: supresión

| Option                              | Description                                                | Selected |
| ----------------------------------- | ---------------------------------------------------------- | -------- |
| Suprimir avisos y bloqueo           | Si hay cobertura (active+scheduled), no avisar ni bloquear | ✓        |
| Igual avisar/bloquear por la actual | Mirar solo la activa de hoy                                |          |

**User's choice:** Suprimir avisos y bloqueo.

## Renovación ya agendada: cobertura del bloqueo

| Option                         | Description                                          | Selected |
| ------------------------------ | ---------------------------------------------------- | -------- |
| Sí, permitir (mirar la cadena) | Validar contra el end_date de la última de la cadena | ✓        |
| No, solo la actual             | Validar solo contra la activa de hoy                 |          |

**User's choice:** Sí, permitir (mirar la cadena).
**Notes:** De aquí sale el concepto transversal "fecha cubierta" en CONTEXT.md.

---

## Claude's Discretion

- Copy exacto de mensajes (push y pop-ups) y texto pre-cargado del WhatsApp.
- Mecanismo concreto de idempotencia por umbral del cron.
- 3 templates separados vs. 1 parametrizado por días.
- Persistencia del "visto por día" del pop-up (local vs. servidor).

## Deferred Ideas

- Renovación/pago dentro de la app (sin salir a WhatsApp).
- Tracking de conversión a WhatsApp.
- Recordatorios por email/SMS.
- Todo revisado-no-incorporado: `v51-milestone-data-rollout.md` (otra feature, árbol v5.1).
