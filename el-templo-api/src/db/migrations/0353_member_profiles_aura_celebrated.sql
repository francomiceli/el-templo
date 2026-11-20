-- 0353_member_profiles_aura_celebrated.sql
-- Fase 215 (#33): celebracion chica de Aura al abrir Mi Templo.
--
-- member_profiles suma 1 columna:
--   aura_celebrated_until_id   id del ultimo movimiento de aura_transactions que
--                              ya no hace falta celebrar. NULL significa que el
--                              alumno nunca consulto la celebracion: la primera
--                              consulta fija la marca en el maximo actual sin
--                              celebrar el historial. Nunca retrocede
--
-- La marca vive en el servidor para que la celebracion salga una sola vez por
-- movimiento aunque el alumno use dos telefonos. Arranca NULL para toda fila
-- existente. Cero datos. Ver src/db/schema/member-profiles.ts y
-- src/modules/aura/celebration-routes.ts.

ALTER TABLE member_profiles
  ADD COLUMN aura_celebrated_until_id INT NULL;
