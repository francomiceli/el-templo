-- Aura por asistencia configurable por actividad (pedido 2026-11-25).
--
-- Hasta ahora toda asistencia acreditaba 5 de Aura (AURA_AMOUNTS.attendance,
-- fase 214 D-18), fuera una clase de la semana o un evento especial como una
-- masterclass. Columna nueva en activities, NULL = la de su categoria
-- (AURA_AMOUNTS en aura/amounts.ts: especial 10, regular 5). Se edita desde
-- Horarios / Actividades en el admin. Rango validado en la API: 0 a 50
-- (0 = la actividad no da Aura). El historial de las especiales se
-- re-valoriza aparte en la 0359.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).

ALTER TABLE activities ADD COLUMN aura_amount INT NULL AFTER cancel_close_minutes;
