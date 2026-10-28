-- 0278_blog_post_sin_cantidad_sedes.sql
-- El post "Entrenar en comunidad" decia "Ocho sedes" y "El Templo tiene 8 sedes entre Mar del
-- Plata y Barcelona". La cifra fija ya no es real y el verificador de la web (fase 195) la
-- prohibe: frenaba la publicacion de la web nueva. Se reescribe sin cantidad, asi no vuelve a
-- quedar vieja cuando se abra o se cierre una sede (pedido de Franco, 2026-10-28).
-- Solo cambia ese post y solo esas dos frases (REPLACE no toca nada si ya no estan).
UPDATE blog_posts
  SET body = REPLACE(
        REPLACE(body, '## Ocho sedes, una comunidad', '## Muchas sedes, una comunidad'),
        'El Templo tiene 8 sedes entre Mar del Plata y Barcelona.',
        'El Templo tiene sedes en Mar del Plata y en Barcelona.'
      )
  WHERE slug = 'entrenar-comunidad-calistenia-progreso-compartido' AND tenant_id = 1;
