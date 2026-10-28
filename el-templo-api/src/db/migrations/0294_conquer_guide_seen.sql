-- 0294_conquer_guide_seen.sql
-- Fase 201 (Conquer v2), hallazgo 1 del UAT local, DA-21: la guia introductoria
-- "Como funciona?" se muestra una sola vez por alumno.
--
-- guide_seen_at guarda la fecha en que el alumno vio la guia (la PRIMERA vez,
-- el API no la pisa). NULL significa que todavia no la vio. Vive en la base y no
-- en el telefono para que sobreviva a reinstalar el app y a cambiar de equipo.
--
-- La columna arranca NULL para todos los alumnos que ya existen: los alumnos
-- activos veran la guia una vez despues de migrar (DA-25).
--
-- Numeracion: 0294 porque la 0293 es del catalogo del anexo (plan 201-25).
--
-- Cero datos en esta migracion (staging y prod comparten servidor MySQL).
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.

ALTER TABLE `conquer_members` ADD COLUMN guide_seen_at datetime NULL AFTER publish_changed_at;
