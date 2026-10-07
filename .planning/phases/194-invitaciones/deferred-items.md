# Fase 194 — ítems diferidos (fuera de alcance de los planes)

## Tests preexistentes que usan `todayStr()` (UTC) fallan entre 21:00 y 24:00 ART

Detectado en 194-13 (2026-10-06, ~21:05 ART = 00:05 UTC del 07). `test/helpers.ts#todayStr()` devuelve la fecha UTC; de noche
(UTC ya es "mañana") `assignPlan` con `startDate: todayStr()` crea una sub que arranca mañana respecto de `CURDATE()` (ART), así que
el socio no pasa a `activo`. Fallan por esto, sin relación con 194-13 (el caso "no-ops for non-trial users" espera `activo` y recibe
`freemium`):

- `test/subscriptions-conversion-hook.test.ts` (5 casos)
- `test/invitations/purchase-closes-access.test.ts` > "comprar un plan real: 201, accesos `completed`..."

Es la trampa ya documentada (`reference_test_shifts_utc_vs_tz_sede`). Arreglo: pasar `startDate: todayInTz(<tz de la sede>)` en esos
tests (así lo hace `test/invitations/leads.test.ts`). No se tocó en 194-13 (fuera de alcance). No se corrió contra el árbol anterior (sin stash/checkout de por medio): la atribución a la fecha se infiere del síntoma (el caso de un no-trial tampoco llega a `activo`, que no depende de nada de leads) y de que los 11 casos de `leads.test.ts` pasan con `startDate` en la tz de la sede. Conviene re-correrlos de día.
