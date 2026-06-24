# Phase 140: Carga única que propaga + cobro suelto + rol profe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 140-Carga única que propaga + cobro suelto + rol profe
**Areas discussed:** Pantalla de carga (UX), Cobro suelto, Rol coach, Idempotencia

---

## La pantalla de carga (UX)

| Option                                 | Description                                                                                           | Selected |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Pantalla dedicada + autocompletar plan | 'Cargar pago' propia del coach; busca socio → autocompleta plan+monto (editable) → medio → confirmar. | ✓        |
| Pantalla dedicada + profe elige plan   | Mismo, pero el profe elige plan/monto a mano cada vez.                                                |          |
| Desde el perfil del socio              | Sin pantalla dedicada; carga desde el perfil.                                                         |          |

**User's choice:** Pantalla dedicada + autocompletar plan + **mobile-web estilo PoS**.
**Notes:** Franco agregó el requisito clave: la vista mobile-web (lo que usan los profes en el celular) debe parecerse a un **PoS** — botones grandes y simples para ejecutar en el momento. El admin es web-only; el coach lo usa en el teléfono. Renovación del plan = autocompletar (el sistema sabe el plan del socio); monto editable; cambiar de plan = caso aparte/admin.

---

## Cobro suelto

| Option                                                    | Description                                                                         | Selected     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| Sacar producto/anónimo, reformular a no-plan con concepto | Cobro suelto = socio conocido + monto libre + concepto libre, no renueva membresía. | ✓            |
| Producto/clase suelta/anónimo (del brief)                 | Venta de producto, drop-in, cobro sin socio.                                        | (descartado) |

**User's choice:** Cobro suelto reformulado = pago a **socio conocido** + monto libre + **concepto libre** (texto), NO renueva membresía, entra a caja, nace PENDIENTE. Sin schema de tabla nuevo.
**Notes:** Franco no reconocía "cobro suelto" — se investigó el milestone: salió del **brief** (`BRIEF:46`, "el modelo lo aguanta, falta la pantalla"), prioridad **BAJA** en research (FEATURES:99), NO una necesidad de Franco. Confirmó "siempre se cobran planes". Se descartó el caso producto/drop-in/anónimo. Idas y vueltas sobre "deuda" (saldar saldo arrastrado) → se decidió NO modelar deuda en profundidad; el concepto libre cubre el caso flojo. Quedó: cobro suelto simple a socio con concepto. (Ejemplo: Juan compra remera $8.000 efectivo → cobro suelto, concepto "remera", entra a caja, no toca membresía.)

---

## Rol coach (qué ve)

| Option                             | Description                                                                                    | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Sus pagos cargados (hoy/recientes) | El coach ve la lista de lo que él cargó (historial tipo PoS), nada de saldos/otros/validación. | ✓        |
| Nada, solo cargar                  | Fire-and-forget, sin lista.                                                                    |          |

**User's choice:** Sus pagos cargados (hoy/recientes).
**Notes:** "Profe" = rol `coach` existente. Hoy excluido de FINANCE_WRITE/VOID/ADJUSTMENT/READ. 140 agrega un permiso de CARGA acotado con coach (NO void/adjustment/read completo). Carga → PENDIENTE (137, server-side). Coach NO valida/observa/anula/ve saldos (CARGA-04, test de autorización). Ve sus cargas + el dato del socio para autocompletar.

---

## Idempotencia

| Option                        | Description                                                                         | Selected |
| ----------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Ticket único por confirmación | Idempotency key del cliente; mismo key = no-op; key nuevo = pasa. Estándar robusto. | ✓        |
| Dedup por socio+monto+ventana | Heurístico por monto/tiempo; puede bloquear un segundo pago legítimo.               |          |

**User's choice:** Ticket único por confirmación.
**Notes:** PoS mobile → doble-tap/reintento común. Idempotency key generada por el cliente en cada Confirmar; el servidor deduplica (mismo key = devuelve el resultado existente, no duplica; key nuevo = pasa). Persistir el key único (migración 0156 o tabla). Toda la propagación en una db.transaction (CARGA-02).

## Claude's Discretion

- `kind` exacto del cobro suelto (adjustment no sirve — es owner/admin/gestion; necesita kind inflow sin link creable por coach; research decide reusar vs enum mínimo).
- Almacenamiento del idempotency key (columna única vs tabla).
- Endpoint de autocompletar (plan vigente + monto) + read scoped de "mis cargas".
- Estructura de la pantalla PoS (componentes Quasar existentes) — se fija en el UI-SPEC.

## Deferred Ideas

- Producto/clase suelta/anónimo → descartado (no es caso real).
- Modelado formal de deuda → no v1.
- Cambio de plan desde pantalla coach → admin/futuro.
- Reportes/bandeja/saldos → 141. Config → 142.
