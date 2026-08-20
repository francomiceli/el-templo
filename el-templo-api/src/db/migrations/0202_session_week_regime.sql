-- 0202_session_week_regime.sql
-- Fase 159 (SEM-05, D-18): ancla historica semana->regimen. Tabla nueva que
-- persiste que dia de cada semana fue combos y cual tecnica, retro-etiquetada
-- W12-W26 por la migracion de datos 0203 -- como METADATA, sin tocar ni una
-- fila del historico de `sessions` (el coach hackeaba el regimen real sobre
-- session_mode='regular').
--
-- Es la PRIMERA tabla gym-owned que nace con tenant_id desde el arranque (no
-- un ALTER de la tanda C, fases 167/192-195): compone el contrato de columna
-- de tenant-column.ts (tenant_id int NOT NULL DEFAULT 1 + FK a tenants) con el
-- estilo de unique compuesta tenant_id-primero de la migracion 0196 (CON-01).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189). NUNCA drizzle-kit
-- push/migrate -- la tabla _migrations es la unica fuente de verdad, local y
-- prod.
--
-- Numeracion: 0201_aura_planes_accesos.sql es la ultima en origin/master
-- (hueco en 0200, lo ocupa el tren v6.0 de tenancy que todavia no mergeo a
-- master). origin/staging tiene 0200_anclas_tenant_branch.sql pero ninguna
-- rama llega a 0202 -- verificado con `git ls-tree --name-only <ref>
-- el-templo-api/src/db/migrations/` contra master y staging antes de escribir
-- este archivo, asi que 0202 es el siguiente libre real en ambas.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `session_week_regime` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `week` int NOT NULL,
  `day` enum('lunes','martes','miercoles','jueves','viernes','sabado') NOT NULL,
  `inferred_mode` varchar(10) NOT NULL,
  `source` varchar(20) NOT NULL,
  `confidence` int DEFAULT NULL,
  `evidence` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_week_regime_tenant_week_day` (`tenant_id`, `week`, `day`),
  CONSTRAINT `fk_session_week_regime_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
