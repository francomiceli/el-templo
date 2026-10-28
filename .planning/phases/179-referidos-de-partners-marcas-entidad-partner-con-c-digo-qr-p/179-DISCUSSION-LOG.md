# Phase 179: Referidos de partners/marcas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-22
**Phase:** 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
**Areas discussed:** Camino físico del QR, Mecánica del pase/semana gratis, Alcance del descuento %, Ciclo de vida de la comisión

---

## Camino físico del QR

| Option                       | Description                                             | Selected |
| ---------------------------- | ------------------------------------------------------- | -------- |
| Registro web directo         | QR → app.eltemplo.org/register?ref=CODE en el navegador |          |
| Landing co-brandeada         | Página intermedia con logo del partner                  |          |
| Redirect corto de la API     | api/r/p/CODE registra escaneo y redirige                |          |
| (Other) Dos QRs a las stores | Un QR a Play Store y otro a App Store por tarjeta       | ✓        |

**User's choice:** Dos QRs por tarjeta (Play Store / App Store).
**Notes:** Se explicó que las stores no propagan el código (iOS sin install referrer nativo) → el código entra por otra vía.

| Option                            | Description                                                           | Selected |
| --------------------------------- | --------------------------------------------------------------------- | -------- |
| Código impreso + campo manual     | Código legible en tarjeta + campo "¿Tenés un código?" en RegisterPage | ✓        |
| Manual + Install Referrer Android | Ídem + pre-llenado vía Play Store referrer                            |          |
| Tercer QR al registro web         | QR extra a app.eltemplo.org/register?ref=CODE                         |          |

**User's choice:** Código impreso + campo manual.
**Notes:** El usuario recordó el antecedente de códigos con link en "Promos" dentro de Planes (promo_plans, `showPromoLink`); verificado como asset reusable.

| Option                        | Description                                        | Selected |
| ----------------------------- | -------------------------------------------------- | -------- |
| Unificado: acepta los 3 tipos | promo + código de socio + partner en un solo campo | ✓        |
| Solo códigos de partner       | Promo y referido siguen solo por link              |          |
| Partner + referido de socio   | Promos quedan solo por link                        |          |

**User's choice:** Campo unificado (3 espacios de nombres).

| Option                       | Description                                                  | Selected |
| ---------------------------- | ------------------------------------------------------------ | -------- |
| Botón en el admin            | Descarga los 2 QRs PNG con código, desde el CRUD de partners | ✓        |
| Botón + plantilla de tarjeta | Además genera la tarjeta PDF completa                        |          |
| Script en tools/             | Sin UI, corrida manual del dev                               |          |

**User's choice:** Botón en el admin.

---

## Mecánica del pase/semana gratis

| Option                         | Description                                                      | Selected |
| ------------------------------ | ---------------------------------------------------------------- | -------- |
| Semana gratis                  | Plan bonificado 7 días precio 0 (membership_kind + mecánica 177) | ✓        |
| Una clase de prueba            | Trial v5.8 con funnel de leads existente                         |          |
| Días configurables por partner | Plan bonificado de N días según acuerdo                          |          |

**User's choice:** Semana gratis.

| Option                       | Description                                    | Selected |
| ---------------------------- | ---------------------------------------------- | -------- |
| Al reservar la primera clase | Beneficio pendiente; assignPlan al reservar    | ✓        |
| Automático al registrarse    | La semana corre desde el registro              |          |
| La activa la sede            | Staff asigna el plan cuando la persona aparece |          |

**User's choice:** Al reservar la primera clase.
**Notes:** El usuario preguntó si "reservar sin plan activo" existía; se verificó que la fase 119 (freemium) lo construyó (`trial-eligibility` + `reserve-trial` + estados en ReservasPage) — la semana gratis calca ese patrón.

| Option                   | Description                                         | Selected |
| ------------------------ | --------------------------------------------------- | -------- |
| Vence a los 30 días      | Expira si no reserva; vínculo queda para atribución | ✓        |
| No vence nunca           | Disponible hasta usarlo                             |          |
| Configurable por partner | Días de validez como campo                          |          |

**User's choice:** 30 días.

| Option                     | Description                                        | Selected |
| -------------------------- | -------------------------------------------------- | -------- |
| Entra al funnel de leads   | lead_status v5.8 + reporte, origen partner visible | ✓        |
| Nada, queda inactivo       | Solo atribución futura                             |          |
| Seguimiento + aviso in-app | Funnel + pop-up de planes al vencer                |          |

**User's choice:** Funnel de leads.

---

## Alcance del descuento %

| Option                       | Description                | Selected |
| ---------------------------- | -------------------------- | -------- |
| Solo la primera cuota        | One-shot en el primer pago | ✓        |
| N cuotas configurables       | "-15% por 3 meses"         |          |
| Mientras dure el primer plan | Muere al renovar/cambiar   |          |

**User's choice:** Solo primera cuota.

| Option                    | Description                                         | Selected |
| ------------------------- | --------------------------------------------------- | -------- |
| No stackea: gana el mayor | Se aplica el descuento más conveniente, nunca ambos | ✓        |
| Stackea aditivo           | Partner + aura se suman con tope                    |          |
| Partner excluye todo      | Solo el del partner aunque otro fuera mayor         |          |

**User's choice:** Gana el mayor.

---

## Ciclo de vida de la comisión

| Option                                | Description                            | Selected |
| ------------------------------------- | -------------------------------------- | -------- |
| Solo Argentina, schema listo para EUR | v1 solo AR, currency en schema         |          |
| AR + ES desde el arranque             | Barcelona entra ya; UAT en dos monedas | ✓        |

**User's choice:** AR + ES desde el arranque.

| Option                        | Description                                            | Selected |
| ----------------------------- | ------------------------------------------------------ | -------- |
| Void automático de pendientes | Revocar/anular pago → pending → void; settled intactas | ✓        |
| Void manual                   | Admin decide caso a caso                               |          |

**User's choice:** Void automático.

| Option                        | Description                                             | Selected |
| ----------------------------- | ------------------------------------------------------- | -------- |
| Sí, desde la ficha del alumno | Calca assignReferrerToMember; si ya pagó nace qualified | ✓        |
| No en v1                      | Solo atribución por código                              |          |

**User's choice:** Retroactiva sí.

| Option                  | Description                                           | Selected |
| ----------------------- | ----------------------------------------------------- | -------- |
| Batch por partner       | "Liquidar" marca todo lo pending, con fecha y usuario | ✓        |
| Selección por ítem      | Checkboxes por comisión                               |          |
| Batch + corte por fecha | Todo lo pending hasta una fecha                       |          |

**User's choice:** Batch por partner.

---

## Claude's Discretion

- Shape exacto de tablas, índices y naming de endpoints.
- UX fina del campo de código (validación en vivo vs submit, badges).
- Representación de "beneficio pendiente" (columna vs derivado).
- Plan bonificado 7 días: seed oculto del picker vs por sede/país.

## Deferred Ideas

- Install Referrer de Android (pre-llenar código).
- Plantilla de tarjeta PDF co-brandeada.
- Ideas del brainstorm de co-marketing: dashboard del partner, carnet de beneficios para miembros, sponsors en TV, pases B2B, challenges, win-back conjunto (ver BRIEF §Ideas descartadas/diferidas).
