-- 0261: Fase 194 D-26 rebrand del copy vivo de la notificacion y del aviso
-- Escrita a mano (db:generate esta roto por drift, ver skill el-templo-db-migrations).
--
-- TEMPLATE_SEEDS y system-avisos se siembran con INSERT IGNORE, por eso cambiar
-- el codigo no actualiza las filas que ya existen en DB. Esta migracion renombra
-- el copy de esas filas SOLO si siguen con el texto por defecto: si el staff las
-- edito desde el admin no se pisan (el UPDATE es no-op). Reaplicar es no-op.
-- Los textos nuevos son identicos byte a byte a los seeds en codigo
-- (notifications/types.ts y communications/system-avisos.ts).
--
-- La ruta queda en la ruta vieja de la app porque las builds de tienda hasta la
-- 1.8.1 no tienen la ruta nueva. En la 1.8.2 la ruta vieja es un alias que
-- redirige. Cambiar la ruta cuando se retiren las builds viejas.
-- La categoria y la seccion de destino con clave interna no cambian.
-- Sin punto y coma en comentarios ni en los textos, el runner separa antes de
-- strippear comentarios.

-- 1. Notificacion al invitador cuando su invitado paga el primer plan.
UPDATE notification_templates
SET title = '¡Tu invitado se sumó!',
    body = '{Nombre} pagó su primer plan. Ya tenés tu descuento por invitación activo.',
    title_female = '¡Tu invitada se sumó!',
    body_female = '{Nombre} pagó su primer plan. Ya tenés tu descuento por invitación activo.',
    route = '/mis-referidos'
WHERE template_key = 'referral_link_activated'
  AND title = '¡Tu referido pagó!'
  AND body = '{Nombre} pagó su primer plan. Ya tenés tu descuento activo.'
  AND title_female = '¡Tu referida pagó!'
  AND body_female = '{Nombre} pagó su primer plan. Ya tenés tu descuento activo.';

-- 2. Tarjeta de invitaciones del inicio de la app (se conserva el titulo).
UPDATE avisos
SET body = 'Invitá a entrenar: cada persona que invites y se sume baja tu cuota.',
    button_text = 'Invitar'
WHERE kind = 'system'
  AND code = 'card_referral'
  AND body = 'Invitá a entrenar: cada persona que traigas suma descuento a tu cuota.'
  AND button_text = 'Compartir código';
