# Phase 108: Pago de Saldo + Historial Financiero - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-04-28
**Phase:** 108-pago-de-saldo-historial-financiero
**Areas discussed:** Endpoint outstanding concepts, antigüedad+descripción, split allocation+Σ, historial granularity+UI, anular en historial, multi-moneda, botón sin saldos pendientes

---

## Endpoint outstanding concepts

| Option                                                                  | Selected |
| ----------------------------------------------------------------------- | -------- |
| Endpoint dedicado `GET /members/:id/outstanding-concepts` (Recomendado) | ✓        |
| Derivar en frontend del financial-history paginado                      |          |

---

## Antigüedad + descripción

### Fecha base para ageInDays

| Option                                                   | Selected |
| -------------------------------------------------------- | -------- |
| Desde effective_date (cuándo devenga) (Recomendado)      | ✓        |
| Desde transaction_date (cuándo se cobró por primera vez) |          |

**Aclaración del usuario:** preguntó qué es ageInDays. Se explicó con un mockup del dialog mostrando "Hace 45 días" al lado del concepto. Después seleccionó la opción A.

### Formato de descripción

| Option                                                                              | Selected |
| ----------------------------------------------------------------------------------- | -------- |
| Texto humano completo: "Mensualidad Marzo 2026 - Performance Mensual" (Recomendado) | ✓        |
| Texto + monto original entre paréntesis                                             |          |

---

## Split allocation UX

| Option                                                               | Selected |
| -------------------------------------------------------------------- | -------- |
| Auto-FIFO + botón "Pagar todo" + admin puede modificar (Recomendado) | ✓        |
| Manual puro: admin tipea cada concepto                               |          |
| Manual con botón "Pagar todo"                                        |          |

---

## Σ ≠ monto recibido (sobre/sub-cobro)

| Option                                                                | Selected |
| --------------------------------------------------------------------- | -------- |
| Bloquear: Σ debe ser exactamente igual a monto recibido (Recomendado) | ✓        |
| Permitir: sobrante como advance_payment automático                    |          |
| Permitir con confirmación explícita (warning + checkbox)              |          |

**Frase del usuario:** "se cancela la deuda y se le da el vuelto, no se acepta que le quede saldo a favor". Decisión clara. Convergente con Phase 107 (cap superior = pricePaid).

**Aclaración previa:** preguntó "que es esto?" sobre advance_payment / saldo a favor. Se explicó con escenario operativo concreto (Juan trae $100k para $80k de deuda).

---

## Historial granularity

| Option                                                            | Selected |
| ----------------------------------------------------------------- | -------- |
| Híbrido: row por transacción, expandible para split (Recomendado) | ✓        |
| Row por transacción sin detalle de splits                         |          |
| Row por (transacción × link)                                      |          |

---

## UI patrón del Historial

| Option                                               | Selected |
| ---------------------------------------------------- | -------- |
| Tab nuevo en AlumnoDetailPage (q-tabs) (Recomendado) | ✓        |
| Sección colapsable en la página                      |          |
| Modal/dialog desde un botón                          |          |

---

## Botón "Anular" en historial

| Option                                                                 | Selected |
| ---------------------------------------------------------------------- | -------- |
| Sí: botón por fila + dialog "Razón" + endpoint existente (Recomendado) | ✓        |
| No: SQL-only por ahora                                                 |          |
| Sí pero solo para owner/admin/gestion                                  |          |

**Aclaración del usuario:** preguntó "que es esto?" sobre anular. Se explicó con caso operativo (admin cobró $50k pero era $30k, necesita corregir). Después seleccionó A. Se asume que el RBAC respeta el FINANCE_VOID_ROLES de Phase 106 D-03 (recepción y coach NO ven el botón).

---

## Multi-moneda

| Option                                                  | Selected |
| ------------------------------------------------------- | -------- |
| Selector de moneda si tiene >1 moneda con saldos        |          |
| Listar todos juntos agrupados por moneda con validación |          |
| Asumir solo la moneda actual del alumno                 |          |

**Frase del usuario:** "esto nunca va a pasar, un alumno no pasa de un país a otro". Decisión: asumir single-currency por miembro (la de su sucursal). Si data anomaly aparece, log a Sentry como warning.

---

## Botón "Registrar pago" sin saldos pendientes

| Option                                                          | Selected |
| --------------------------------------------------------------- | -------- |
| Deshabilitado con tooltip "Sin saldos pendientes" (Recomendado) | ✓        |
| Oculto cuando no hay saldos                                     |          |
| Habilitado siempre, dialog distinto para adjustment libre       |          |

---

## Claude's Discretion

- Texto exacto del tooltip "Sin saldos pendientes".
- Estilo visual del badge "Anulado" en el historial.
- Pre-armado de razones de anulación (dropdown vs input libre).
- Granularity de logs estructurados al registrar pago.
- Si "Cargar más" del historial usa offset/limit o cursor-based.

## Deferred Ideas

- UI para registrar otros tipos de cobro (ventas, donaciones).
- Refunds parciales.
- Multi-method split en un solo pago.
- Saldos a favor desde el dialog (explícitamente rechazado).
- Anular y des-anular vía UI (anulación es one-way).
- Filtros avanzados en el historial.
- Exports del historial individual del miembro.
