-- Renombre de sedes a nombres cortos (pedido de Nacho 2026-08-21)
--
-- Se quita el prefijo "El Templo " de todas las sedes y "Mogotes" pasa a
-- llamarse "Sur". branches.name es puramente de display -- ninguna logica de
-- negocio decide por el nombre (todo va por id/code/country), asi que el
-- cambio es seguro y aplica en vivo en admin, metricas, TV y exports.
--
-- La app de miembros hoy arma "Sede X" con un regex del front sobre el nombre
-- largo -- tras este renombre mostrara el nombre corto hasta que salga un build
-- a tiendas que reponga el prefijo. Decision de producto (rename ahora, app
-- despues).
--
-- Match por code (no por name), estable. NO se referencia tenant_id: esta
-- migracion corre tambien contra prod, donde la columna tenant_id todavia no
-- existe (el tren v6.0 aun no esta en master). En la DB de staging (con
-- tenancy) los codes son unicos por tenant y estas sedes son de El Templo.
--
-- Cambio de dato de prod via migracion, nunca via seed (regla del repo).
-- Idempotente -- re-ejecutar deja los mismos nombres.

UPDATE branches SET name = 'Moreno' WHERE code = 'MORENO';
--> statement-breakpoint
UPDATE branches SET name = 'Alem' WHERE code = 'ALEM';
--> statement-breakpoint
UPDATE branches SET name = 'Constitucion' WHERE code = 'CONST';
--> statement-breakpoint
UPDATE branches SET name = 'Jujuy' WHERE code = 'JUJUY';
--> statement-breakpoint
UPDATE branches SET name = 'Sur' WHERE code = 'MOGOTES';
--> statement-breakpoint
UPDATE branches SET name = 'Barcelona' WHERE code = 'BCN';
--> statement-breakpoint
UPDATE branches SET name = 'Online' WHERE code = 'ONLINE';
--> statement-breakpoint
UPDATE branches SET name = 'Park' WHERE code = 'PARK';
--> statement-breakpoint
UPDATE branches SET name = 'Chapadmalal' WHERE code = 'CHAPADMALAL';
