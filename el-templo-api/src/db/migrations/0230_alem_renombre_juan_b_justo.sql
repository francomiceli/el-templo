-- Mudanza de la sede Alem a Juan B. Justo 1018 (pedido de Nacho 2026-09-18).
-- La sede pasa a llamarse "Juan B. Justo" en todos lados (admin, app, TV,
-- reportes). Se RENOMBRA la sede existente en vez de crear una nueva para no
-- partir la historia (1.500 suscripciones, 1.215 alumnos, horarios, caja,
-- staff, QR de asistencia y login del TV cuelgan del mismo id). Precedente:
-- 0208 (Mogotes pasa a Sur, Sur pasa a Mario Bravo en la fase 193).
--
-- Se mantiene el code interno ALEM (estable, lo usan QR e integraciones).
-- La caja de efectivo de la sede se llama igual que la sede (convencion del
-- feedback de caja 2026-09-07), asi que se renombra junto con ella.
--
-- Match por code y por branch_id, nunca por name. Idempotente: re-ejecutar
-- deja los mismos valores. Sin punto-y-coma dentro de comentarios (regla dura
-- del skill el-templo-db-migrations).

UPDATE branches
  SET name = 'Juan B. Justo',
      address = 'Juan B. Justo 1018'
  WHERE code = 'ALEM';
--> statement-breakpoint
UPDATE cash_registers
  SET name = 'Juan B. Justo'
  WHERE type = 'efectivo'
    AND name = 'Alem'
    AND branch_id = (SELECT id FROM branches WHERE code = 'ALEM' LIMIT 1);
