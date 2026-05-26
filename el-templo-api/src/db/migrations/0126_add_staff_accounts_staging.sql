-- @data-only
-- Crea 3 cuentas de staff (admin/gestion) para el entorno de staging.
-- Cada INSERT usa guard NOT EXISTS por email, asi que es idempotente y seguro
-- en produccion: estas cuentas YA existen en prod, por lo que ahi el INSERT se
-- saltea sin tocar las cuentas reales ni sus contrasenas. En staging (donde no
-- existen) las crea con la contrasena inicial provista.
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
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'martinfigueras@eltemplo.org');

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
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'micaeladelpiero@eltemplo.org');

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
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'fernandaetchepare@eltemplo.org');
