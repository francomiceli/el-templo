-- Phase 135 (Block A -> prod) -- poblar exercises.milestone_exercise_id (R1 hito/variante).
--
-- QUE HACE
--   Asigna milestone_exercise_id a 47 variantes (apuntando a 23 hitos) -- el
--   resultado del seed heuristico local (bootstrap-milestones --apply tras
--   aceptar las propuestas de dimension). Esto dibuja la jerarquia hito->variante
--   en el arbol del admin (fase 135-04) y saca esas 47 variantes de la fila plana
--   del backbone, colgandolas bajo su hito canonico.
--
--   ALCANCE ACOTADO -- esta migracion NO escribe habilidad/progression_step/route
--   (las ~1176 aceptaciones de dimension del seed local quedan fuera a proposito:
--   son adivinanzas de baja confianza, no hacen falta para el visual y no tienen
--   clave natural limpia). El agrupamiento fino lo completan los profes con el
--   editor (milestone/promote, regroup, drawer de revision).
--
-- KEYING (D-07)
--   Snapshot keyeado por IDENTIDAD NATURAL, no por id (los id divergen entre
--   local/staging/prod). Las 70 filas involucradas (47 variantes + 23 hitos)
--   tienen clave UNICA en (exercise, route, effort, dificultad_lineal) -- 0
--   colisiones verificadas en el catalogo. Cada UPDATE matchea exactamente una
--   variante y resuelve su hito por la misma 4-tupla via self-JOIN. Validado:
--   aplicar este archivo sobre una copia pre-seed reproduce el resultado del
--   bootstrap por id byte-identico (0 filas difieren).
--
-- IDEMPOTENCIA / SEGURIDAD
--   Cada UPDATE lleva "AND v.milestone_exercise_id IS NULL" -- re-correr no pisa
--   correcciones de profe ni reasigna. El _migrations table igual evita re-run.
--   Una variante cuyo nombre/ruta no exista en el entorno destino simplemente no
--   matchea (no-op seguro), nunca falla.
--
-- ROLLBACK (D-05)
--   Poner milestone_exercise_id = NULL en las 47 variantes de este archivo
--   (mismo matching por exercise + route + effort + dificultad_lineal), o
--   restaurar desde el backup pre-deploy del pipeline. La self-FK ON DELETE SET
--   NULL ya garantiza que una variante huerfana vuelve a hito.
--
-- NOTA backbone -- setear milestone_exercise_id saca la variante del backbone
--   (member-tree/getNeighbor/rebuild) por la condicion de scope existente. Es el
--   efecto buscado (la variante deja la fila plana y cuelga del hito). Afecta solo
--   estas 47 filas.

UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  FULL' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 FULL' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=10 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  FULL' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL WIDE PRESS FULL' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=12 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  FULL' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL WIDE PRESS TO 90 FULL' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=12 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  HALF LAYOUT' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=9 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 HALF LAYOUT' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=9 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  STR' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=8 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 STR' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=8 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS ADV TUCK' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=6 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 ADV TUCK' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=6 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS SUPER ADV' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=7 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 SUPER ADV' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=7 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS TUCK' AND h.route='FL' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL PRESS TO 90 TUCK' AND v.route='FL' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL PRESS  FULL' AND h.route='FL' AND h.effort='EXC' AND h.dificultad_lineal=9 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL WIDE PRESS FULL' AND v.route='FL' AND v.effort='EXC' AND v.dificultad_lineal=10 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL  FULL' AND h.route='FL' AND h.effort='ISO' AND h.dificultad_lineal=9 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL WIDE FULL' AND v.route='FL' AND v.effort='ISO' AND v.dificultad_lineal=10 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='FL  FULL' AND h.route='FL' AND h.effort='ISO' AND h.dificultad_lineal=9 SET v.milestone_exercise_id=h.id WHERE v.exercise='FL WIDE FULL' AND v.route='FL' AND v.effort='ISO' AND v.dificultad_lineal=11 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OAP TOP  STRICT' AND h.route='OAP' AND h.effort='ISO' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='OAP MID  STRICT' AND v.route='OAP' AND v.effort='ISO' AND v.dificultad_lineal=10 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OAP TOP ASSISTED' AND h.route='OAP' AND h.effort='ISO' AND h.dificultad_lineal=8 SET v.milestone_exercise_id=h.id WHERE v.exercise='OAP MID ASSISTED' AND v.route='OAP' AND v.effort='ISO' AND v.dificultad_lineal=8 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OA TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='OA TTB  TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OA TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='OA TTB SUPINE TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OA TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='OA TTB SUPINE 90 TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=7 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  STR' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB SUPINE BA STR' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  STR' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB SUPINE STR' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB OL TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=1 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BA 1/2 W TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 1/2 W TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BA MID TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB  TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BA TOP TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 BA MID SUPINE STR' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA TOP SUPINE STR' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB OL SCISSOR 90 TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=2 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA TOP SUPINE TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=2 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA MID SUPINE TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB ATW TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BA ATW TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB ATW TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB ATW OA TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=8 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB ATW TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB ATW OA SUPINE TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=9 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB BENT ARM MID STR' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BENT ARM TOP STR' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB WINDSHIELD TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 1/2 WINDSHIELD BA SUPINE TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB WINDSHIELD TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB BA WINDSHIELD TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB WINDSHIELD TUCK' AND h.route='TTB' AND h.effort='CON' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='1/2 WINDSHIELD OA TUCK' AND v.route='TTB' AND v.effort='CON' AND v.dificultad_lineal=8 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='INVERTED RING OA  FULL' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='INVERTED RING SUPINE OA ASSISTED FULL' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=9 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='INVERTED RING OA  FULL' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='INVERTED RING OA ASSISTED FULL' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=9 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='INVERTED RING OA  FULL' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=10 SET v.milestone_exercise_id=h.id WHERE v.exercise='INVERTED RING SUPINE OA  FULL' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=10 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='OA TTB  TUCK' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=5 SET v.milestone_exercise_id=h.id WHERE v.exercise='OA TTB SUPINE TUCK' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=6 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 STR' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=3 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 SUPINE STR' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 STR' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=3 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA MID STR' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 STR' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=3 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 SUPINE STR' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 STR' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=3 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA TOP STR' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=4 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=1 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 SUPINE TUCK' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=1 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=1 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 SUPINE TUCK' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=2 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=1 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA TOP TUCK' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB 90 TUCK' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=1 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB 90 BA MID TUCK' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=3 AND v.milestone_exercise_id IS NULL;
UPDATE exercises v JOIN exercises h ON h.exercise='TTB V STR' AND h.route='TTB' AND h.effort='ISO' AND h.dificultad_lineal=4 SET v.milestone_exercise_id=h.id WHERE v.exercise='TTB V SUPINE STR' AND v.route='TTB' AND v.effort='ISO' AND v.dificultad_lineal=5 AND v.milestone_exercise_id IS NULL;

