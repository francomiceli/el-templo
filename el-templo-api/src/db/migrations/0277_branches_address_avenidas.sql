-- 0277_branches_address_avenidas.sql
-- Direcciones de Juan B. Justo y Mario Bravo con "Av." (pedido de Franco, 2026-10-28).
--
-- La web (fase 195) publica branches.address tal cual. La 0271 dejo "Juan B. Justo 1018"
-- y Mario Bravo conservaba "Mario Bravo 618", sin el "Av." de la direccion real.
-- Va como migracion nueva (y no editando la 0271) porque staging ya aplico la 0271.
-- El mismo dato lo ven el admin y la app, asi que el cambio es correcto en todos lados.
UPDATE branches
  SET address = 'Av. Juan B. Justo 1018'
  WHERE code = 'ALEM' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET address = 'Av. Mario Bravo 618'
  WHERE code = 'MOGOTES' AND tenant_id = 1;
