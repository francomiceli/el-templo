-- Tema de la placa de aviso de TV (2026-10-06): claro u oscuro, elegido por
-- el admin. Hasta hoy el velo lo decidía la TV según la pantalla anterior
-- (reposo diurno o cierre nocturno) y un aviso manual disparado desde la
-- flexibilidad inicial quedaba con el título bronce sobre el fondo claro.
-- varchar y no enum de MySQL a propósito (misma decisión que
-- tv_class_state.screen). Valores: 'claro' | 'oscuro'.
-- Backfill: flex_inicio siempre se pintó de día, todo lo demás de noche.
ALTER TABLE `tv_avisos` ADD COLUMN `tema` varchar(10) NOT NULL DEFAULT 'oscuro';
UPDATE `tv_avisos` SET `tema` = 'claro' WHERE `mode` = 'flex_inicio';
