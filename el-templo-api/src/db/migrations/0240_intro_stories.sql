-- SPEC "Empeza aca" B (persistencia y metrica). member_profiles suma 3
-- columnas para registrar las historias de bienvenida del socio:
--   intro_stories_seen_at      primera vez que las abrio (aunque las haya
--                              cerrado antes del final)
--   intro_stories_completed_at solo si llego al ultimo slide
--   intro_stories_last_slide   indice donde quedo (metrica, no gatea nada)
--
-- Las 3 arrancan NULL para toda fila existente: nadie vio historias que
-- todavia no existian. Ver src/db/schema/member-profiles.ts y el endpoint
-- POST /auth/me/intro-stories (src/modules/auth/routes.ts).

ALTER TABLE member_profiles
  ADD COLUMN intro_stories_seen_at TIMESTAMP NULL,
  ADD COLUMN intro_stories_completed_at TIMESTAMP NULL,
  ADD COLUMN intro_stories_last_slide INT NULL;
