---
status: partial
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
source: [119-06-SUMMARY.md]
started: 2026-06-02T02:52:20Z
updated: 2026-06-02T02:52:20Z
---

## Current Test

[testing paused — 7 items outstanding (admin browser verification deferred from Task 3 blocking checkpoint per user decision 2026-06-02)]

## Tests

### 1. Nav visibility by role

expected: La entrada "Campañas" (icono `campaign`) aparece en el nav izquierdo del admin para owner/admin, dentro del grupo "Gestion", y está AUSENTE para roles inferiores (coach/recepcionista). Mismo gate que quien puede enviar (`isAdminRole` = owner/admin).
result: [pending]
blocked_by: admin-staging-build
reason: Requiere admin-staging corriendo + sesiones de prueba con distintos roles para verificar visibilidad del q-item.

### 2. Standalone section

expected: Navegar a /campanias muestra una sección standalone (NO embebida dentro de Analíticas/Reportes) con el header `text-h5` "Campañas" + caption "Envíos masivos y seguimiento de conversión" + filtros de país (solo owner) y sede.
result: [pending]
blocked_by: admin-staging-build
reason: Verificación visual de layout sobre admin-staging.

### 3. Create draft

expected: Tocar "Nueva campaña" abre un diálogo (name, subject, copy = headline/subheadline/body, país opcional para owner, heroImageUrl opcional). Al confirmar llama createCampaign → POST /api/campaigns/admin, notifica, refresca la lista, y la nueva campaña aparece como borrador con badge gris "draft" (D-12).
result: [pending]
blocked_by: admin-staging-build
reason: Requiere admin-staging + backend Plan 04 con endpoint de creación operativo.

### 4. List rows

expected: La lista de campañas (q-table) muestra nombre, badge de estado (draft gris / sending warning / sent positive), fecha de envío y cantidad de destinatarios; el click en una fila (o la acción `trending_up`) abre el detalle de funnel (D-19).
result: [pending]
blocked_by: admin-staging-build
reason: Requiere datos de campañas en distintos estados sobre admin-staging.

### 5. 6-stage funnel + Apple-Mail-Privacy caveat

expected: Abrir el funnel de una campaña renderiza las 6 etapas (enviado → abierto → click → reservó → asistió → convirtió), con las barras de primera + convirtió en $primary (terracotta), y el banner de caveat naranja en la etapa "abierto" con la copy exacta "Aproximado — Apple Mail Privacy puede inflar las aperturas. El click es la métrica confiable." SIN gate comingSoon (datos live) (D-18).
result: [pending]
blocked_by: admin-staging-build
reason: Requiere una campaña con métricas de funnel sobre admin-staging.

### 6. Send confirmation with recipient count

expected: Tocar "Enviar campaña" abre un diálogo de confirmación que llama getEligibleCount y muestra la copy exacta — Título "Enviar campaña", Body "Vas a enviar este email a {N} personas. Esta acción no se puede deshacer. ¿Continuar?", Confirmar "Enviar a {N}" — ANTES de llamar sendCampaign (envío masivo irreversible, D-11). Cancelar sin enviar.
result: [pending]
blocked_by: admin-staging-build
reason: Requiere admin-staging + endpoint eligible-count; verificar el gate sin disparar el envío real.

### 7. Warm-brand, no blue

expected: La sección /campanias y todos sus diálogos (crear, enviar) usan la paleta cálida de marca (terracotta/cream), SIN azul/navy en ninguna parte.
result: [pending]
blocked_by: admin-staging-build
reason: Verificación visual sobre admin-staging.

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 7

## Gaps

<!-- Vacío: sin issues reportados. Estos ítems están DIFERIDOS (no fallados) por decisión del usuario (2026-06-02). Correr contra admin-staging antes de enviar la campaña en vivo (Plan 07). -->
