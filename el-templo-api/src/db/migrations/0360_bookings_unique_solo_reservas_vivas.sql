-- 0360 - La regla "una sola reserva por alumno, horario y dia" pasa a valer
-- SOLO para las reservas vivas (reservado, qr_escaneado, confirmado,
-- lista_espera). Las canceladas y no_show quedan como historial y pueden
-- convivir con una reserva nueva del mismo turno.
--
-- Caso Maria Eugenia Rossi (2026-11-25): le movieron la clase de prueba del
-- miercoles al martes despues de mandarle el seguimiento (trial_followups),
-- y al querer entrar en lista de espera del miercoles el reserve() borraba la
-- prueba cancelada para liberar el indice unico. El FK de trial_followups lo
-- impedia y la API respondia 500. Ademas, borrar canceladas o no_show para
-- re-reservar perdia historial (las faltas desaparecian).
--
-- Mecanica: columna generada VIRTUAL active_slot = 1 si la reserva esta viva,
-- NULL si no. El indice unico nuevo incluye active_slot y MySQL admite
-- multiples NULL en un UNIQUE, asi que solo choca una segunda reserva VIVA.
-- El indice viejo garantizaba a lo sumo una fila por turno, asi que el nuevo
-- no puede fallar al crearse. El FK de member_id sigue cubierto por
-- idx_bookings_member_date (y por el indice nuevo, que tambien empieza por
-- member_id). Escrita a mano (drizzle-kit generate sigue roto por drift).
-- Los valores del CASE coinciden con bookingStatusEnum en schema/bookings.ts.

ALTER TABLE `bookings`
  ADD COLUMN `active_slot` tinyint GENERATED ALWAYS AS (
    CASE WHEN `booking_status` IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera') THEN 1 ELSE NULL END
  ) VIRTUAL;

CREATE UNIQUE INDEX `idx_bookings_member_schedule_date_active`
  ON `bookings` (`member_id`, `schedule_id`, `booking_date`, `active_slot`);

DROP INDEX `idx_bookings_member_schedule_date` ON `bookings`;
