-- Formato "evento" de los avisos de TV (2026-11-12): una columna JSON opcional
-- con fecha, hora, lugar, sello y foto. Con el valor cargado la TV pinta una
-- tarjeta de evento en lugar de la placa de título + cuerpo. NULL = placa,
-- que es lo que queda en todas las filas existentes (sin backfill).
-- El nombre del evento va en `title` y el subtítulo en `body`, para que un
-- televisor con el bundle viejo siga mostrando una placa legible.
ALTER TABLE `tv_avisos` ADD COLUMN `evento` json NULL;
