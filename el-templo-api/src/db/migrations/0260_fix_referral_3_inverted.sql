-- 0260: Fase 194 D-28 corrige el vinculo de referidos id=3 que quedo invertido
-- Escrita a mano (db:generate esta roto por drift, ver skill el-templo-db-migrations).
--
-- Estado esperado de prod (verificado 2026-10-06):
--   referrals.id=3 tiene referrer 7286 (Guido) y referred 6613 (Valentina)
--   users.referred_by: 6613 apunta a 7286 y 7286 es NULL
-- Estado destino: Valentina (6613) invito a Guido (7286). El vinculo queda
-- referrer 6613 y referred 7286, status qualified, copy_variant B (6613 es impar)
-- y users.referred_by espejado: 6613 NULL y 7286 apunta a 6613.
--
-- Guards: cada statement apunta a ids concretos de prod y exige el estado
-- esperado. Si la fila difiere (corregida a mano, o ya existe otro vinculo con
-- referred 7286) es no-op y NUNCA pisa datos distintos. Los dos UPDATE de users
-- solo corren si el vinculo 3 ya esta corregido. Reaplicar es no-op. En CI,
-- staging y local esos ids no existen, asi que tampoco hace nada.
-- qualified_at toma la fecha de alta de la sub 8074 (primer pago real de Guido,
-- 2026-08-04) y cae a NOW() si esa sub no existe.
-- Las tablas de creditos y de movimientos AURA NO se tocan, el historial queda
-- como esta (D-28, SC-6 conserva los 9 vinculos).
-- Sin punto y coma en comentarios ni en strings, el runner separa antes de
-- strippear comentarios.

-- 1. Corregir el vinculo (derived table para evitar el error 1093 de MySQL).
UPDATE referrals
SET referrer_id = 6613,
    referred_id = 7286,
    status = 'qualified',
    qualified_at = COALESCE(
      qualified_at,
      (SELECT sp.created_at FROM subscriptions sp WHERE sp.id = 8074 AND sp.user_id = 7286 AND sp.tenant_id = 1),
      NOW()
    ),
    copy_variant = 'B'
WHERE id = 3
  AND tenant_id = 1
  AND referrer_id = 7286
  AND referred_id = 6613
  AND NOT EXISTS (SELECT 1 FROM (SELECT r.referred_id FROM referrals r WHERE r.id <> 3 AND r.referred_id = 7286) x);

-- 2. Espejar users.referred_by de Valentina: ya no fue referida por Guido.
UPDATE users
SET referred_by = NULL
WHERE id = 6613
  AND tenant_id = 1
  AND referred_by = 7286
  AND EXISTS (SELECT 1 FROM (SELECT r.id FROM referrals r WHERE r.id = 3 AND r.tenant_id = 1 AND r.referrer_id = 6613 AND r.referred_id = 7286) y);

-- 3. Espejar users.referred_by de Guido: lo invito Valentina.
UPDATE users
SET referred_by = 6613
WHERE id = 7286
  AND tenant_id = 1
  AND referred_by IS NULL
  AND EXISTS (SELECT 1 FROM (SELECT r.id FROM referrals r WHERE r.id = 3 AND r.tenant_id = 1 AND r.referrer_id = 6613 AND r.referred_id = 7286) z);
