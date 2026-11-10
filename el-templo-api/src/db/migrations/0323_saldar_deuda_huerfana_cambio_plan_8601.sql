-- Hotfix 2026-11-10 (caso Luis Pascual, user 8601). Escrita a mano.
-- Flex (sub 9967, sin cobrar, deuda 65000) se cambio a Flex+ (sub 10023)
-- y despues se cancelo la 10023. El cancel saldo solo la deuda de la 10023 y
-- dejo viva la de la 9967 (status changed), que se sumo al volver a cargarle
-- Flex (sub 10140). El fix de codigo ya cubre los casos futuros, esta
-- migracion salda la unica deuda huerfana que hay en prod (verificado por
-- consulta de solo lectura el 2026-11-10).
-- Guardas: la 9967 tiene que seguir en changed y su sucesora 10023 cancelada,
-- y solo se pisa una deuda positiva (un saldo a favor no se toca).
-- En bases sin esas filas (tests, staging clonado viejo) no hace nada.
UPDATE balances b
SET b.amount = 0, b.last_recomputed_at = NOW()
WHERE b.tenant_id = 1
  AND b.member_id = 8601
  AND b.target_kind = 'subscription'
  AND b.target_id = 9967
  AND b.amount > 0
  AND EXISTS (
    SELECT 1 FROM subscriptions prev
    WHERE prev.id = 9967
      AND prev.user_id = 8601
      AND prev.subscription_status = 'changed'
  )
  AND EXISTS (
    SELECT 1 FROM subscriptions nxt
    WHERE nxt.id = 10023
      AND nxt.user_id = 8601
      AND nxt.previous_subscription_id = 9967
      AND nxt.subscription_status = 'cancelled'
  );
