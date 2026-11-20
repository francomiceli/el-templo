-- 0347_member_profiles_community.sql
-- Fase 214 Comunidad de anotados (D-05, D-06, D-11, D-47).
--
-- member_profiles suma 2 columnas para la visibilidad del alumno en la lista
-- de anotados de una clase:
--   community_visible          preferencia explicita del alumno. NULL significa
--                              que rige la regla por defecto (adulto y sede
--                              argentina), asi al cumplir 18 pasa a visible sin
--                              guardar nada
--   community_notice_seen_at   primera vez que vio el aviso de visibilidad. La
--                              API no la pisa en las marcas siguientes
--
-- Las dos arrancan NULL para toda fila existente: nadie eligio nada ni vio un
-- aviso que todavia no existia. Cero datos. Ver src/db/schema/member-profiles.ts
-- y src/modules/scheduling/community-visibility.ts.

ALTER TABLE member_profiles
  ADD COLUMN community_visible TINYINT(1) NULL,
  ADD COLUMN community_notice_seen_at TIMESTAMP NULL;
