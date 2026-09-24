-- Direccion de la sede Alberti (Argentina). Pedido 2026-09-24.
--
-- La 0211 dio de alta la sede Alberti sin address (branches.address solo
-- existe desde la 0132, posterior al alta de otras sedes via seed). El link
-- de mapas del Cómo llegar de la app (shared/maps.ts buildMapsUrl) lo arma
-- a partir de branches.address, asi que sin este dato la sede no tiene mapa.
--
-- Match por code (unico de El Templo), mismo patron que 0221. Formato de
-- direccion igual al resto de las sedes de la 0132 (calle + numero).
-- Cambio de dato de prod via migracion, nunca via seed. Idempotente.

UPDATE branches SET address = 'Alberti 2024' WHERE code = 'ALBERTI';
