-- @data-only
-- Crea 3 cuentas de staff (admin/gestion) para el entorno de staging.
--
-- Cada INSERT tiene dos guards en el WHERE:
--   1. NOT EXISTS por email: idempotente y seguro en produccion. Estas cuentas
--      YA existen en prod, asi que ahi el INSERT se saltea sin tocar las cuentas
--      reales ni sus contrasenas. En staging (donde no existen) las crea.
--   2. DATABASE() NOT REGEXP '^eltemplo_test': NO insertar en las bases de test.
--      Las suites de integracion calibran ids de usuario fijos (p.ej.
--      admin@test.com debe quedar en id=2, contando solo el coach de la
--      migracion 0017). Insertar usuarios aca correria el auto-increment y
--      romperia esos tests. La base de test es la unica donde queremos saltear
--      la insercion -- staging y prod NO matchean este patron.
-- branch_id=1 (El Templo Moreno), country=AR (scope admin/gestion), level=alfa,
-- status NULL (convencion de staff). Hashes argon2id precomputados.
INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, country, level)
SELECT
  'martinfigueras@eltemplo.org',
  '$argon2id$v=19$m=65536,t=3,p=4$HFW63LTGZYBJ+n0DrgafqQ$gN5Ej7EGIku84UgBauqMCT+Z3mbMGXBYu0deN7AeR/k',
  'Martín',
  'Figueras',
  'admin',
  1,
  'AR',
  'alfa'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'martinfigueras@eltemplo.org')
  AND DATABASE() NOT REGEXP '^eltemplo_test';

INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, country, level)
SELECT
  'micaeladelpiero@eltemplo.org',
  '$argon2id$v=19$m=65536,t=3,p=4$XOTumLw33Oj9GqbGKEgcyQ$t8TizkTMPAQJLGftbxYp9A+BD1Zg5mvpH1xuKt8DFzc',
  'Micaela',
  'Del Piero',
  'gestion',
  1,
  'AR',
  'alfa'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'micaeladelpiero@eltemplo.org')
  AND DATABASE() NOT REGEXP '^eltemplo_test';

INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, country, level)
SELECT
  'fernandaetchepare@eltemplo.org',
  '$argon2id$v=19$m=65536,t=3,p=4$qYC19PFw+nfunU+0LVC6AQ$zmA+2F9K1YLl8CULOfOatQwJjGBcGmNHqvW8n0nESoQ',
  'Fernanda',
  'Etchepare',
  'gestion',
  1,
  'AR',
  'alfa'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'fernandaetchepare@eltemplo.org')
  AND DATABASE() NOT REGEXP '^eltemplo_test';
