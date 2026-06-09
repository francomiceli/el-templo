-- Remediacion del bug de renovacion sobre planes importados (2026-06-09).
-- renewSubscription elegia la sub "vigente" ordenando solo por created_at
-- entre active y expired. La importacion legacy del 2026-04-01 creo subs
-- historicas expiradas con created_at MAS NUEVO que el de la sub realmente
-- activa, asi que el renew eligio la expirada, la trato como plan vencido y
-- creo una segunda sub ACTIVA desde hoy. Afecto a 3 miembros (Lecatsas,
-- Lorenzino, Pandolfo). Aca se corrigen las 3 subs erroneas in-place para
-- dejarlas exactamente como una renovacion correcta, es decir programadas
-- desde el fin de la vigente (fin = inicio + 180 dias, misma formula del
-- renew) y con la vigente como predecesora. El precio Promo de 360000 y la
-- deuda en balances ya estan bien grabados y no se tocan.
-- Guardas estrictas (id + user + estado + fechas) para ser no-op en
-- cualquier entorno que no tenga estas filas exactas.

-- Alejandro Lecatsas: vigente 4751 termina 2026-09-11
UPDATE subscriptions
SET subscription_status = 'scheduled', start_date = '2026-09-11', end_date = '2027-03-10', previous_subscription_id = 4751
WHERE id = 7079 AND user_id = 5117 AND subscription_status = 'active'
  AND start_date = '2026-06-09' AND previous_subscription_id = 5850;

-- Mercedes Lorenzino: vigente 1941 termina 2026-09-09
UPDATE subscriptions
SET subscription_status = 'scheduled', start_date = '2026-09-09', end_date = '2027-03-08', previous_subscription_id = 1941
WHERE id = 7088 AND user_id = 2111 AND subscription_status = 'active'
  AND start_date = '2026-06-09' AND previous_subscription_id = 5528;

-- Ana Belen Pandolfo: vigente 2238 termina 2026-09-01
UPDATE subscriptions
SET subscription_status = 'scheduled', start_date = '2026-09-01', end_date = '2027-02-28', previous_subscription_id = 2238
WHERE id = 7089 AND user_id = 2434 AND subscription_status = 'active'
  AND start_date = '2026-06-09' AND previous_subscription_id = 5559;

-- Las subs importadas vuelven a su estado pre-bug. El renew las habia
-- marcado completed al tratarlas como la sub que se renovaba.
UPDATE subscriptions
SET subscription_status = 'expired'
WHERE id = 5850 AND user_id = 5117 AND subscription_status = 'completed' AND end_date = '2026-03-11';

UPDATE subscriptions
SET subscription_status = 'expired'
WHERE id = 5528 AND user_id = 2111 AND subscription_status = 'completed' AND end_date = '2026-03-09';

UPDATE subscriptions
SET subscription_status = 'expired'
WHERE id = 5559 AND user_id = 2434 AND subscription_status = 'completed' AND end_date = '2026-03-01';
