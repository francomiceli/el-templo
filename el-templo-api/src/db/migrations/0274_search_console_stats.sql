-- 0274_search_console_stats.sql
-- Fase 195 (Web SEO local + AEO + atribucion), plan 09, D-21.2.
-- Estadisticas de Google Search Console por pagina y consulta.
--
-- Un job semanal (lunes 07:00 de Argentina) trae de la API de Search Console
-- consultas, clics, impresiones, CTR y posicion por pagina para el periodo
-- [hoy - 9 dias, hoy - 3 dias] (GSC publica con 2-3 dias de demora). Guarda un
-- renglon por (pagina, consulta) del periodo.
--
-- Sin unique a proposito: pagina y consulta (500 caracteres cada una) no
-- caben juntas en el limite de largo de un indice. La idempotencia es borrar
-- las filas del tenant con ese mismo period_start y period_end y reinsertar
-- dentro de una transaccion. Re-correr el mismo periodo deja la misma
-- cantidad de filas.
--
-- El indice usa un prefijo de 191 caracteres de page para respetar el limite
-- de largo de clave de InnoDB con utf8mb4.
--
-- Nace tenant-scoped y STRICT en el modulo marketing
-- (src/db/tenant-tables.ts TENANT_STRICT_MODULES["marketing"]).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type. NUNCA drizzle-kit push/migrate -- la tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: bloque reservado 0270-0279 de la fase 195 (D-28).
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `search_console_stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `page` varchar(500) NOT NULL,
  `query` varchar(500) NULL,
  `clicks` int NOT NULL,
  `impressions` int NOT NULL,
  `ctr` decimal(6,4) NOT NULL,
  `position` decimal(6,2) NOT NULL,
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_search_console_stats_tenant_period` (`tenant_id`, `period_end`, `page`(191)),
  CONSTRAINT `fk_search_console_stats_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
