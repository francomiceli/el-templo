# Phase 157: Núcleo transaccional de referidos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 157-Núcleo transaccional de referidos
**Areas discussed:** Definición de "activo", Caída de contraparte, Ventana de cualificación, Calibración %/tope

---

## Definición de "activo"

| Option                | Description                                                                                                                           | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Cobertura vigente     | `deriveCoveredUntil(db,userId) >= hoy` (helper fase 144): plan pago y no vencido. Fiel a "mientras ambos sigan pagando", reusa infra. | ✓        |
| users.status='activo' | Más simple pero `status` es derivado (cron/on-login), puede desfasarse; no capta "venció ayer".                                       |          |
| Ambos a la vez        | status Y cobertura. Más estricto pero redundante y frágil (dos fuentes que discrepan).                                                |          |

**User's choice:** Cobertura vigente
**Notes:** Reusa el helper único `deriveCoveredUntil` de fase 144. Es el criterio para evaluar la contraparte de cada vínculo al cobrar.

---

## Caída de contraparte

| Option                | Description                                                                                                     | Selected |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Suspende, reactivable | Vínculo `qualified` permanente; descuento recomputado por cobertura en cada cobro; reactiva si la parte vuelve. | ✓        |
| Revoca permanente     | Una caída mata el vínculo para siempre. Más punitivo, desincentiva reactivación.                                |          |

**User's choice:** Suspende, reactivable
**Notes:** Coherente con "se evalúa en cada cobro" y con la intención "si cualquiera se cae, el descuento se cae" (pero vuelve si el caído se reactiva).

---

## Ventana de cualificación

| Option             | Description                                                                                          | Selected |
| ------------------ | ---------------------------------------------------------------------------------------------------- | -------- |
| Sin límite         | El referido cuenta cuando pague, tarde lo que tarde. El trigger de pago ya es la barrera antifraude. | ✓        |
| Ventana de 60 días | Debe pagar dentro de 60 días del registro. Antifraude extra, más complejidad.                        |          |
| Ventana de 90 días | Igual, más laxo.                                                                                     |          |

**User's choice:** Sin límite
**Notes:** El trigger es "pagó" (D-01), no "se registró" — la barrera antifraude ya existe.

---

## Calibración %/tope

| Option                            | Description                                                            | Selected |
| --------------------------------- | ---------------------------------------------------------------------- | -------- |
| Config ajustable, arranca 10%/40% | Sembrar en `aura_config`: 10%/vínculo, tope 40%; ajustable sin deploy. | ✓        |
| Fijo en código 10%/40%            | Hardcodear; cambiar requiere deploy.                                   |          |
| Otros valores                     | Otros números de arranque.                                             |          |

**User's choice:** Config ajustable, arranca 10%/40%
**Notes:** El % por vínculo y el tope son las perillas de erosión de ingreso; se calibran con números reales.

---

## Claude's Discretion

Aceptadas por el usuario ("Listo, escribí el CONTEXT") con estos defaults:

- **Formato del código:** derivado legible `FRAN-A3B2` (prefijo nombre + sufijo aleatorio único).
- **Backfill de códigos:** generación lazy + script de backfill disponible (no 2000 de una).
- **Almacenamiento del registro AURA:** tabla dedicada `referral_credits` (auditable), sin netear en `aura_transactions` ni inflar el balance gastable.

## Deferred Ideas

- Fase 158: pantalla "Mis referidos", notificaciones, panel admin.
- Categoría de notificación (`motivacion` vs `referidos`) → fase 158.
- Orden vs v5.4: ejecutar 157 después de fases 154/151 de v5.4 (montar sobre lo reformado).
- Todo `v51-milestone-data-rollout.md`: falso positivo del matcher, no integrado.
