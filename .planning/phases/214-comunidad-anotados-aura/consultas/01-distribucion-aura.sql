-- Fase 214: distribución real de Aura para definir los umbrales de nivel
-- SOLO LECTURA. Se corre contra la base de producción con OK de Franco
-- Devuelve solo agregados, ningún dato personal
-- "Ganado" = todo lo acreditado, neto de reversas y ajustes, sin restar canjes
--   (canje = fila negativa con reference_type 'subscription')

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

-- A. Panorama por gimnasio y rol: cuántos usuarios tienen saldo
SELECT u.tenant_id,
       u.role,
       COUNT(*) AS usuarios,
       COALESCE(SUM(b.balance > 0), 0) AS con_saldo,
       COALESCE(SUM(b.balance), 0) AS saldo_total,
       COALESCE(MAX(b.balance), 0) AS saldo_max
FROM users u
LEFT JOIN aura_balances b ON b.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY u.tenant_id, u.role
ORDER BY u.tenant_id, usuarios DESC;

-- B. Ledger por fuente, referencia y signo
SELECT t.source_type,
       COALESCE(t.reference_type, '-') AS referencia,
       SIGN(t.amount) AS signo,
       COUNT(*) AS filas,
       SUM(t.amount) AS total,
       DATE(MIN(t.created_at)) AS desde,
       DATE(MAX(t.created_at)) AS hasta
FROM aura_transactions t
GROUP BY t.source_type, COALESCE(t.reference_type, '-'), SIGN(t.amount)
ORDER BY t.source_type, signo;

-- C. Conciliación: saldo guardado contra la suma del ledger, por usuario
SELECT COUNT(*) AS usuarios,
       SUM(x.saldo = x.ledger) AS coinciden,
       SUM(x.saldo <> x.ledger) AS difieren,
       MAX(ABS(x.saldo - x.ledger)) AS diferencia_max
FROM (
  SELECT u.id,
         COALESCE(b.balance, 0) AS saldo,
         COALESCE(l.total, 0) AS ledger
  FROM users u
  LEFT JOIN aura_balances b ON b.user_id = u.id
  LEFT JOIN (
    SELECT user_id, SUM(amount) AS total
    FROM aura_transactions
    GROUP BY user_id
  ) l ON l.user_id = u.id
  WHERE b.user_id IS NOT NULL OR l.user_id IS NOT NULL
) x;

-- D. Percentiles de lo ganado y del saldo, solo alumnos (role member)
--    activos_56d = con al menos una asistencia en los últimos 56 días
WITH g AS (
  SELECT u.id,
         u.tenant_id,
         COALESCE(b.balance, 0) AS saldo,
         COALESCE(e.ganado, 0) AS ganado,
         EXISTS (
           SELECT 1
           FROM attendance a
           WHERE a.member_id = u.id
             AND a.session_date >= CURDATE() - INTERVAL 56 DAY
         ) AS activo
  FROM users u
  LEFT JOIN aura_balances b ON b.user_id = u.id
  LEFT JOIN (
    SELECT user_id, SUM(amount) AS ganado
    FROM aura_transactions
    WHERE NOT (amount < 0 AND COALESCE(reference_type, '') = 'subscription')
    GROUP BY user_id
  ) e ON e.user_id = u.id
  WHERE u.role = 'member'
    AND u.deleted_at IS NULL
),
r AS (
  SELECT 'ganado, activos_56d' AS poblacion, tenant_id, ganado AS v,
         PERCENT_RANK() OVER (PARTITION BY tenant_id ORDER BY ganado) AS pr
  FROM g
  WHERE activo = 1
  UNION ALL
  SELECT 'saldo, activos_56d', tenant_id, saldo,
         PERCENT_RANK() OVER (PARTITION BY tenant_id ORDER BY saldo)
  FROM g
  WHERE activo = 1
  UNION ALL
  SELECT 'ganado, todos con Aura', tenant_id, ganado,
         PERCENT_RANK() OVER (PARTITION BY tenant_id ORDER BY ganado)
  FROM g
  WHERE ganado > 0
)
SELECT poblacion,
       tenant_id,
       COUNT(*) AS n,
       SUM(v <= 0) AS en_cero,
       MIN(CASE WHEN pr >= 0.10 THEN v END) AS p10,
       MIN(CASE WHEN pr >= 0.25 THEN v END) AS p25,
       MIN(CASE WHEN pr >= 0.50 THEN v END) AS p50,
       MIN(CASE WHEN pr >= 0.75 THEN v END) AS p75,
       MIN(CASE WHEN pr >= 0.90 THEN v END) AS p90,
       MIN(CASE WHEN pr >= 0.95 THEN v END) AS p95,
       MIN(CASE WHEN pr >= 0.99 THEN v END) AS p99,
       MAX(v) AS maximo,
       ROUND(AVG(v)) AS promedio
FROM r
GROUP BY poblacion, tenant_id
ORDER BY tenant_id, poblacion;

-- E. Histograma de lo ganado entre alumnos activos, para elegir cortes redondos
SELECT h.tramo, COUNT(*) AS alumnos
FROM (
  SELECT CASE
           WHEN e.ganado IS NULL OR e.ganado <= 0 THEN '0000 sin Aura'
           WHEN e.ganado < 50 THEN '0001 a 49'
           WHEN e.ganado < 100 THEN '0050 a 99'
           WHEN e.ganado < 200 THEN '0100 a 199'
           WHEN e.ganado < 350 THEN '0200 a 349'
           WHEN e.ganado < 500 THEN '0350 a 499'
           WHEN e.ganado < 750 THEN '0500 a 749'
           WHEN e.ganado < 1000 THEN '0750 a 999'
           WHEN e.ganado < 1500 THEN '1000 a 1499'
           WHEN e.ganado < 2000 THEN '1500 a 1999'
           WHEN e.ganado < 3000 THEN '2000 a 2999'
           WHEN e.ganado < 5000 THEN '3000 a 4999'
           ELSE '5000 o más'
         END AS tramo
  FROM users u
  LEFT JOIN (
    SELECT user_id, SUM(amount) AS ganado
    FROM aura_transactions
    WHERE NOT (amount < 0 AND COALESCE(reference_type, '') = 'subscription')
    GROUP BY user_id
  ) e ON e.user_id = u.id
  WHERE u.role = 'member'
    AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM attendance a
      WHERE a.member_id = u.id
        AND a.session_date >= CURDATE() - INTERVAL 56 DAY
    )
) h
GROUP BY h.tramo
ORDER BY h.tramo;
