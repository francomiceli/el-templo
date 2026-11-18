-- Fase 215 (criterio 8): conciliación de Aura con regalos
-- SOLO LECTURA. No correr sin OK de Franco. Correr en staging y después en producción.
-- Devuelve filas solo cuando algo no cierra. No lleva nombres ni datos personales, solo ids internos.
--
-- Cada bloque tiene que dar 0 filas. Si uno da filas, anotar el bloque y las filas y avisar:
-- no se corrige nada a mano sin revisarlo.
--
-- Contexto de cómo se registra un regalo:
--   Regalo vigente: una fila en aura_gifts y UNA fila de ledger con source_type social, reference_type aura_gift,
--   reference_id igual al id del regalo, a nombre de quien recibe, por el monto del regalo.
--   Regalo anulado: la fila del regalo se conserva con status anulado, y el ledger suma UNA fila más con
--   reference_type aura_gift_void y el monto en negativo, también a nombre de quien recibe.
--   Quien da no pierde Aura: no hay fila de ledger a su nombre.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;

-- a. Saldo guardado contra la Aura ganada recalculada desde cero
-- Aura ganada = suma del ledger sin los canjes (manual_adjustment de subscription y subscription_discount),
-- que es la definición de la app (earnedRowsFilter). Los canjes se calculan aparte.
-- El saldo guardado (aura_balances) tiene que ser igual a Aura ganada más canjes (los canjes son negativos).
-- Esperado: 0 filas. Una fila es un usuario cuyo saldo no coincide con su ledger.
SELECT b.tenant_id,
       b.user_id,
       b.balance AS saldo_guardado,
       COALESCE(g.ganada, 0) AS aura_ganada,
       COALESCE(g.canjes, 0) AS canjes
FROM aura_balances b
LEFT JOIN (
  SELECT t.tenant_id,
         t.user_id,
         SUM(CASE
               WHEN t.source_type = 'subscription_discount'
                 OR (t.source_type = 'manual_adjustment' AND t.reference_type <=> 'subscription')
               THEN 0 ELSE t.amount
             END) AS ganada,
         SUM(CASE
               WHEN t.source_type = 'subscription_discount'
                 OR (t.source_type = 'manual_adjustment' AND t.reference_type <=> 'subscription')
               THEN t.amount ELSE 0
             END) AS canjes
  FROM aura_transactions t
  GROUP BY t.tenant_id, t.user_id
) g ON g.tenant_id = b.tenant_id AND g.user_id = b.user_id
WHERE b.balance <> COALESCE(g.ganada, 0) + COALESCE(g.canjes, 0);

-- a2. Usuarios con filas de ledger y sin fila de saldo
-- Esperado: 0 filas. Una fila es alguien con movimientos que no figura en aura_balances.
SELECT t.tenant_id, t.user_id, SUM(t.amount) AS suma_ledger
FROM aura_transactions t
LEFT JOIN aura_balances b ON b.tenant_id = t.tenant_id AND b.user_id = t.user_id
WHERE b.id IS NULL
GROUP BY t.tenant_id, t.user_id
HAVING SUM(t.amount) <> 0;

-- b. Regalos sin su fila aura_gift en el ledger (o con más de una)
-- Esperado: 0 filas. Cada regalo, vigente o anulado, tiene exactamente una fila aura_gift a nombre de quien recibe.
SELECT g.tenant_id, g.id AS regalo_id, g.status, COUNT(t.id) AS filas_en_ledger
FROM aura_gifts g
LEFT JOIN aura_transactions t
  ON t.tenant_id = g.tenant_id
 AND t.source_type = 'social'
 AND t.reference_type = 'aura_gift'
 AND t.reference_id = g.id
 AND t.user_id = g.receiver_user_id
GROUP BY g.tenant_id, g.id, g.status
HAVING COUNT(t.id) <> 1;

-- c. Filas aura_gift en el ledger sin regalo
-- Esperado: 0 filas. Si aparece alguna, mirar si la persona que dio fue borrada del sistema:
-- al borrarla se borran en cascada sus regalos, y el ledger de quien recibió queda.
SELECT t.tenant_id, t.id AS fila_ledger_id, t.user_id, t.amount, t.reference_id AS regalo_id
FROM aura_transactions t
LEFT JOIN aura_gifts g ON g.tenant_id = t.tenant_id AND g.id = t.reference_id
WHERE t.source_type = 'social'
  AND t.reference_type = 'aura_gift'
  AND g.id IS NULL;

-- d. Anulaciones que no cierran
-- d1. Regalos anulados sin su fila aura_gift_void (o con más de una)
-- Esperado: 0 filas.
SELECT g.tenant_id, g.id AS regalo_id, COUNT(t.id) AS filas_de_anulacion
FROM aura_gifts g
LEFT JOIN aura_transactions t
  ON t.tenant_id = g.tenant_id
 AND t.source_type = 'social'
 AND t.reference_type = 'aura_gift_void'
 AND t.reference_id = g.id
WHERE g.status = 'anulado'
GROUP BY g.tenant_id, g.id
HAVING COUNT(t.id) <> 1;

-- d2. Filas aura_gift_void de regalos que siguen vigentes, o de regalos que no existen
-- Esperado: 0 filas.
SELECT t.tenant_id, t.id AS fila_ledger_id, t.reference_id AS regalo_id, g.status
FROM aura_transactions t
LEFT JOIN aura_gifts g ON g.tenant_id = t.tenant_id AND g.id = t.reference_id
WHERE t.source_type = 'social'
  AND t.reference_type = 'aura_gift_void'
  AND (g.id IS NULL OR g.status <> 'anulado');

-- e. Montos o personas del ledger que no coinciden con el regalo
-- Esperado: 0 filas. El regalo suma su monto a quien recibe, y la anulación resta exactamente ese monto a la misma persona.
SELECT t.tenant_id,
       t.id AS fila_ledger_id,
       t.reference_type,
       t.amount AS monto_ledger,
       g.amount AS monto_regalo,
       t.user_id AS usuario_ledger,
       g.receiver_user_id AS usuario_regalo
FROM aura_transactions t
JOIN aura_gifts g ON g.tenant_id = t.tenant_id AND g.id = t.reference_id
WHERE t.source_type = 'social'
  AND t.reference_type IN ('aura_gift', 'aura_gift_void')
  AND (
       t.user_id <> g.receiver_user_id
    OR (t.reference_type = 'aura_gift' AND t.amount <> g.amount)
    OR (t.reference_type = 'aura_gift_void' AND t.amount <> -g.amount)
  );

-- f. Un regalo nunca resta ni suma cero
-- Esperado: 0 filas. Las filas aura_gift son siempre positivas (a quien da no se le descuenta nada,
-- y la única resta es la fila aura_gift_void de quien recibe).
SELECT t.tenant_id, t.id AS fila_ledger_id, t.user_id, t.amount, t.reference_type
FROM aura_transactions t
WHERE t.source_type = 'social'
  AND t.reference_type = 'aura_gift'
  AND t.amount <= 0;
