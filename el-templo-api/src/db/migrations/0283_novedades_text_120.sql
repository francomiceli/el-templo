-- 0283_novedades_text_120.sql
-- Ajustes de app 2026-10-18 (Franco): la card de Novedades de Mi Templo pasa de
-- UNA linea a DOS lineas visibles y lo que no entra sube despacio. El texto
-- tiene que admitir al menos tres lineas (unos 38 caracteres por linea en un
-- celular de 375px), asi que el maximo pasa de 80 a 120 caracteres.
-- Espeja NOVEDAD_TEXT_MAX_LENGTH en novedades-service.ts y NOVEDAD_TEXT_MAX
-- en el admin. Solo agranda la columna: ninguna fila existente se trunca.
-- Escrita a mano (db:generate sigue roto por la deriva de goal_plan_type).
ALTER TABLE `novedades` MODIFY COLUMN `text` varchar(120) NOT NULL;
