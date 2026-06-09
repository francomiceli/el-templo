-- Extension manual de membresia pedida por la sede Constitucion (jun 2026),
-- 15 dias para Gabriel y Manuel Ranieri. Ambos PROGRAMA 6 MESES activo
-- 2026-01-29 a 2026-07-28, sin turnos fijos, sin renovacion programada y
-- sin cupo de clases, asi que extender end_date no tiene efectos
-- colaterales. Guardas estrictas para ser no-op fuera de produccion.

-- Gabriel Ranieri
UPDATE subscriptions
SET end_date = '2026-08-12'
WHERE id = 2375 AND user_id = 2577 AND subscription_status = 'active' AND end_date = '2026-07-28';

-- Manuel Ranieri
UPDATE subscriptions
SET end_date = '2026-08-12'
WHERE id = 2376 AND user_id = 2578 AND subscription_status = 'active' AND end_date = '2026-07-28';
