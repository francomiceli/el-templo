-- 0301_subscription_member_notified_seen.sql
-- Planes: aviso al socio cuando el admin le carga una membresia (2026-10-28).
--
-- Los socios pagan antes del vencimiento y no sabian si la renovacion quedo
-- cargada. Estas dos columnas alimentan la pelotita de la tab Planes de la app.
--
-- 1. member_notified_at: instante en que el staff cargo la membresia a mano
--    (alta, cambio de plan o renovacion) y se le aviso al socio. NULL = nunca se
--    le aviso, o la fila nacio por un camino que no avisa.
-- 2. member_seen_at: instante en que el socio abrio la tab Planes despues del
--    aviso. NULL = todavia no la vio.
--
-- Semantica de no visto: member_notified_at IS NOT NULL AND member_seen_at IS NULL.
-- Las filas existentes quedan NULL y NULL, o sea nada nuevo, asi que ningun socio
-- ve una pelotita por membresias viejas.
--
-- Columnas nullable al final de la tabla, mismo tipo que paused_at. Cero datos en
-- la migracion.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente.

ALTER TABLE `subscriptions`
  ADD COLUMN `member_notified_at` timestamp NULL DEFAULT NULL,
  ADD COLUMN `member_seen_at` timestamp NULL DEFAULT NULL;
