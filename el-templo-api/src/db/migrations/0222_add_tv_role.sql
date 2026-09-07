-- Rol 'tv': cuenta dedicada para loguear los televisores de las sedes.
-- Incidente 2026-09-07: las pantallas estaban logueadas con la cuenta de un
-- coach y al editarle las sedes desde Usuarios quedaron en 403 congeladas.
-- El rol 'tv' ve todas las sedes del gimnasio sin depender de user_branches
-- y solo accede a la seccion TV del admin.

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv') NOT NULL;

-- Cuenta dedicada de los televisores (pedido de Franco 2026-09-07). Solo entra
-- a la seccion TV del admin, por eso la contrasena simple no expone nada mas.
-- Mismos dos guards que la migracion 0126: NOT EXISTS por email (idempotente)
-- y DATABASE() NOT REGEXP '^eltemplo_test' (las suites calibran ids fijos de
-- users, insertar aca correria el auto-increment). tenant_id=1 (El Templo),
-- branch_id=1 (Moreno) como sede de casa, sin country ni user_branches:
-- el acceso a todas las sedes sale del rol. Hash argon2id precomputado.
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, branch_id, country, level)
SELECT
  1,
  'tv@eltemplo.org',
  '$argon2id$v=19$m=65536,t=3,p=4$Qt2ZwhFiRAk6iR4kMWtqJg$OL7I7jaUv0k/ewiOQ7oZ4+tHZWBJu1D9+pYllemjFC4',
  'Televisor',
  'El Templo',
  'tv',
  1,
  NULL,
  'alfa'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'tv@eltemplo.org')
  AND DATABASE() NOT REGEXP '^eltemplo_test';
