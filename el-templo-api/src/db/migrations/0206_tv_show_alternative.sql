-- Fase 178 (bloque alternativo tecnica/combos) -- baja de la rotacion automatica
-- de deuteros y alta del toggle "Ver alternativo" en tv_class_state.
--
-- La rotacion automatica de deuteros (feature 0205 / fase 164, a0e07140) se
-- elimina por completo: quedaba acoplada al viejo layout 1x1 de deuteros, y la
-- fase 178 lo reemplaza por una grilla 2x2 fija (sin rotacion server-side).
--   deuteros_auto_rotate  se borra
--   deuteros_pinned_at    se borra
--
-- En su lugar, el bloque alternativo de tecnica/combos (TECNICA_II_ALT /
-- COMBOS_II_ALT) necesita un toggle persistido por sede: el profe elige mostrar
-- el bloque principal o el alternativo en el TV, mismo cronometro para los dos.
--   show_alternative      BOOLEAN NOT NULL DEFAULT FALSE, una fila por sede,
--                         espejada por N televisores (mismo patron D-04 que el
--                         resto de tv_class_state).
ALTER TABLE tv_class_state
  DROP COLUMN deuteros_auto_rotate,
  DROP COLUMN deuteros_pinned_at,
  ADD COLUMN show_alternative BOOLEAN NOT NULL DEFAULT FALSE;
