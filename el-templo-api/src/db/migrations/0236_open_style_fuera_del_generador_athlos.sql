-- Open Style deja de ser candidato automatico del generador para el bloque
-- Athlos (feedback de los profes 2026-09-21: lunes, martes y viernes el ultimo
-- bloque salia "seteado en Open Style"). No era un fallback: en la matriz de
-- compatibilidad Open Style empata con el mejor score (1) para Sigma/Omega en
-- las intensidades 55/60/90/95 y gana el desempate aleatorio de stage-5.
--
-- compatibility = 0 lo excluye de la seleccion (format-fallback filtra
-- compatibility > 0) sin borrar las filas, asi el formato sigue existiendo y
-- se puede elegir a mano en el editor de sesiones. Nucleus no se toca: el
-- pedido fue solo por el ultimo bloque.
-- Idempotente: si ya corrio, el UPDATE no matchea filas.
-- Sin punto-y-coma dentro de comentarios (regla dura del skill).

UPDATE `format_compatibility` fc
JOIN `formats` f ON f.`id` = fc.`format_id` AND f.`tenant_id` = fc.`tenant_id`
SET fc.`compatibility` = 0
WHERE f.`name` = 'Open Style' AND fc.`block` = 'athlos' AND fc.`compatibility` > 0;
