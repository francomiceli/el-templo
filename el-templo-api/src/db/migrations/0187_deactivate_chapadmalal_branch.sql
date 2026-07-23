-- Chapadmalal sale de la OPERACION DIARIA, no del historico.
--
-- Contexto (relevado en prod 2026-07-22):
--   - Ultima reserva de la sede: 2026-06-25. Cero reservas futuras.
--   - Cero check-ins en toda su historia (la tabla attendance nunca tuvo una
--     fila de esta sede) y cero roster de profes cargado.
--   - 23 usuarios, todos role=member: 21 inactivos y 2 activos.
--
-- Que se desactiva:
--   - La sede, para que salga de los 8 puntos que filtran por is_active
--     (selector de alta, horarios reservables, cron de no-shows, cron de
--     notificaciones, sync de Wellhub, caja).
--   - Sus 16 schedules activos, para no dejar horarios vivos colgando de una
--     sede inactiva -- cualquier query que mire schedules sin joinear branches
--     los seguiria viendo.
--
-- Que NO se toca (el historico se conserva entero):
--   - 283 bookings y 40 suscripciones: siguen apuntando a estos schedules, por
--     eso se desactivan en vez de borrarse. Un DELETE dejaria el historico sin
--     poder resolver sede ni horario.
--   - Los 23 usuarios mantienen su branch_id.
--   - Ninguna suscripcion se cancela. Firmapaz (hasta 2026-08-24) se queda
--     como esta: su cuenta de socio es secundaria, la de profe es otra
--     (role=coach, sede Mogotes) y esto no la toca.
--
-- Que SI se mueve:
--   - Vicenzotti pasa de Chapadmalal a Mogotes con su suscripcion vigente
--     (hasta 2026-09-24), para no dejarla pagando un plan sin sede donde
--     reservar. No reservo nunca en otra sede, asi que el destino es una
--     decision operativa, no un dato que se pueda inferir de su historial.
--
-- Reversible: volver los is_active a 1 y el branch_id de Vicenzotti a la sede
-- de Chapadmalal.
--
-- Se filtra por code / email y no por id porque los ids pueden diferir entre
-- entornos (ver 0086/0087, donde el code de esta misma sede quedo truncado en
-- staging).

-- 1. Vicenzotti a Mogotes. branch_source = 'manual' es obligatorio: sin eso el
--    cron de recategorizacion multisucursal (0185) no ve una reasignacion
--    reciente que respetar y podria volver a moverla.
UPDATE users
SET branch_id = (SELECT id FROM branches WHERE code = 'MOGOTES'),
    branch_updated_at = NOW(),
    branch_source = 'manual'
WHERE email = 'solevicen@gmail.com';

-- 2. Su suscripcion VIGENTE acompana el cambio de sede. Las vencidas quedan
--    apuntando a Chapadmalal a proposito: son historico.
UPDATE subscriptions su
JOIN users u ON u.id = su.user_id
SET su.branch_id = (SELECT id FROM branches WHERE code = 'MOGOTES')
WHERE u.email = 'solevicen@gmail.com'
  AND su.subscription_status IN ('active', 'scheduled', 'paused');

-- 3. La sede sale de la operacion diaria.
UPDATE branches
SET is_active = 0
WHERE code = 'CHAPADMALAL';

UPDATE schedules s
JOIN branches b ON b.id = s.branch_id
SET s.is_active = 0
WHERE b.code = 'CHAPADMALAL';
