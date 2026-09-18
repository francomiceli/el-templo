-- Extension de 2 dias a las membresias de la sede Alem (ahora Juan B. Justo)
-- por la mudanza (pedido de Nacho 2026-09-18). Precedente: 0149 (extension
-- manual Ranieri). Aca es masiva, asi que las guardas son por estado y por
-- un marcador en notes que hace la migracion idempotente: una segunda corrida
-- no vuelve a sumar dias.
--
-- Alcance:
--   1. Suscripciones ACTIVAS y PAUSADAS de la sede: end_date + 2 dias.
--   2. Suscripciones PROGRAMADAS (renovacion futura ya cargada) de la sede:
--      start_date y end_date + 2 dias, para que sigan arrancando el dia
--      siguiente al fin de la activa que se extiende y no se solapen.
-- Fuera de alcance: canceladas, vencidas, completadas y cambiadas.
--
-- No toca cobros ni precios (el cargo ya esta cobrado). Los recordatorios de
-- vencimiento se calculan por fecha exacta en el cron, asi que corren solos
-- 2 dias hacia adelante sin duplicarse.
--
-- Sede resuelta por code (ALEM), nunca por nombre ni id fijo. Sin
-- punto-y-coma dentro de comentarios (regla dura del skill).

UPDATE subscriptions
  SET end_date = DATE_ADD(end_date, INTERVAL 2 DAY),
      notes = CONCAT(COALESCE(notes, ''), ' [mudanza JBJ 2026-09: +2 dias]')
  WHERE branch_id = (SELECT id FROM branches WHERE code = 'ALEM' LIMIT 1)
    AND subscription_status IN ('active', 'paused')
    AND end_date IS NOT NULL
    AND (notes IS NULL OR notes NOT LIKE '%[mudanza JBJ 2026-09: +2 dias]%');
--> statement-breakpoint
UPDATE subscriptions
  SET start_date = DATE_ADD(start_date, INTERVAL 2 DAY),
      end_date = DATE_ADD(end_date, INTERVAL 2 DAY),
      notes = CONCAT(COALESCE(notes, ''), ' [mudanza JBJ 2026-09: +2 dias]')
  WHERE branch_id = (SELECT id FROM branches WHERE code = 'ALEM' LIMIT 1)
    AND subscription_status = 'scheduled'
    AND end_date IS NOT NULL
    AND (notes IS NULL OR notes NOT LIKE '%[mudanza JBJ 2026-09: +2 dias]%');
