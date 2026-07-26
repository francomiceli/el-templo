-- Copia las referencias de video de produccion a staging.
--
-- NO es una migracion y no debe moverse a src/db/migrations/: el runner las aplica
-- tambien en prod, y esto solo tiene sentido en staging.
--
-- Por que hace falta: los archivos de video YA son compartidos (R2_PUBLIC_URL apunta al
-- mismo worker en los dos entornos), pero la base de staging es un clon congelado y su
-- columna exercises.video_url quedo vacia para todo lo que se cargo en prod despues del
-- clonado. Sin esto, la pantalla de sede en staging muestra "VIDEO PROXIMAMENTE" en casi
-- todos los ejercicios y no se puede probar el video de verdad.
--
-- Es seguro porque los ids de exercises coinciden 1 a 1 entre ambas bases (verificado por
-- pattern + category) y la escritura toca UNICAMENTE eltemplo_staging: prod entra como
-- lectura del JOIN. Nunca al reves.
--
-- Como correrlo (desde el EC2, con las credenciales del .env de staging):
--   mysql -h"$DB_HOST" -u"$DB_USER" < staging_copy_exercise_videos.sql
--
-- Corrido por ultima vez: 2026-07-25 (144 filas, staging paso de 58 a 202 con video).

-- 1. Respaldo de la columna, para poder revertir
CREATE TABLE IF NOT EXISTS eltemplo_staging.exercises_video_backup_20260725 AS
  SELECT id, video_url FROM eltemplo_staging.exercises;

-- 2. Copia solo lo que falta, sin pisar nada que staging ya tenga
UPDATE eltemplo_staging.exercises s
  JOIN eltemplo.exercises p ON p.id = s.id
   SET s.video_url = p.video_url
 WHERE s.video_url IS NULL AND p.video_url IS NOT NULL;

-- 3. Control
SELECT COUNT(*) AS ejercicios, COUNT(video_url) AS con_video
  FROM eltemplo_staging.exercises;

-- Para revertir:
--   UPDATE eltemplo_staging.exercises s
--     JOIN eltemplo_staging.exercises_video_backup_20260725 b ON b.id = s.id
--      SET s.video_url = b.video_url
