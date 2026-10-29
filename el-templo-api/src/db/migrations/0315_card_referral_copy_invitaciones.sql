-- 0315: copy nuevo de la tarjeta de invitaciones del inicio de la app (pedido de Franco 2026-10-29)
-- Escrita a mano (db:generate esta roto por drift, ver skill el-templo-db-migrations).
--
-- Acompaña el rediseño de Mis invitados y la novedad con push de invitaciones: el
-- titulo deja "Vos decidís cuánto bajás tu cuota" y el texto repite lo de la push
-- (3 clases gratis para el invitado y descuento para los dos si se suma).
--
-- system-avisos se siembra con INSERT IGNORE, por eso cambiar el codigo no actualiza la
-- fila que ya existe en DB. Igual que la 0261, el UPDATE solo pisa el copy si sigue con
-- el texto por defecto: si el staff lo edito desde el admin no se toca (no-op).
-- Reaplicar es no-op. Los textos nuevos son identicos byte a byte al seed en codigo
-- (communications/system-avisos.ts) y al respaldo de la app (ReferralCtaCard.vue).
-- Numero 0315: la 0302 a 0314 las ocupa el tren 192 (sin push), tabla independiente.
-- Sin punto y coma en comentarios ni en los textos, el runner separa antes de
-- strippear comentarios.

UPDATE avisos
SET title = 'Invitá a entrenar a tus amigos',
    body = 'Tienen 3 clases gratis y, si se suman, los dos tienen descuento.'
WHERE kind = 'system'
  AND code = 'card_referral'
  AND title = 'Vos decidís cuánto bajás tu cuota'
  AND body = 'Invitá a entrenar: cada persona que invites y se sume baja tu cuota.';
