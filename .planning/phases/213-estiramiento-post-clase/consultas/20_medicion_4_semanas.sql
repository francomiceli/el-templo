-- 213 Estiramiento post-clase: medicion a 4 semanas por grupo (D-16 y SPEC 5.4)
-- SOLO LECTURA: solo SET de variables de sesion, SELECT y WITH. Nunca modifica datos.
-- Se corre en produccion con el usuario de solo lectura, bloque por bloque.
-- Sin conversion de zona horaria (en prod devuelve NULL sin las tablas de zonas): local_date ya esta en hora de la sede.
-- Resultados agregados por grupo, sin nombres de alumnos.

-- ============================================================
-- PARAMETROS: completar a mano antes de correr
-- ============================================================
-- @desde = fecha de encendido de la plantilla stretch_followup en produccion (YYYY-MM-DD)
-- @hasta = @desde mas 28 dias (YYYY-MM-DD), inclusive
-- Mientras tengan el texto YYYY-MM-DD las consultas fallan a proposito para no medir sin fechas
SET @desde = 'YYYY-MM-DD';
SET @hasta = 'YYYY-MM-DD';

-- ============================================================
-- BLOQUE 1: embudo por grupo y metrica de exito (D-16)
-- ofertas = asistencias elegibles, una por alumno y dia (UNIQUE tenant, alumno, dia)
-- completados_cada_100 = metrica de exito. Esperado 3 a 4 en los grupos con push, menos de 1 en control
-- apertura_pct = abiertos / enviados (solo tiene sentido en los grupos con push)
-- completados_sobre_empezados_pct = completados / empezados
-- ============================================================
SELECT o.arm,
  COUNT(*) AS ofertas,
  SUM(o.card_seen_at IS NOT NULL) AS card_vista,
  SUM(o.push_queued_at IS NOT NULL) AS push_encolado,
  SUM(o.push_sent_at IS NOT NULL) AS push_enviado,
  SUM(o.push_opened_at IS NOT NULL) AS push_abierto,
  SUM(o.started_at IS NOT NULL) AS empezados,
  SUM(o.started_at IS NOT NULL AND o.started_from = 'card') AS empezados_desde_card,
  SUM(o.started_at IS NOT NULL AND o.started_from = 'push') AS empezados_desde_push,
  SUM(o.completed_at IS NOT NULL) AS completados,
  SUM(o.completed_at IS NOT NULL AND o.aura_awarded = 1) AS completados_con_aura,
  ROUND(100 * SUM(o.completed_at IS NOT NULL) / COUNT(*), 2) AS completados_cada_100,
  ROUND(100 * SUM(o.push_opened_at IS NOT NULL) / NULLIF(SUM(o.push_sent_at IS NOT NULL), 0), 1) AS apertura_pct,
  ROUND(100 * SUM(o.completed_at IS NOT NULL) / NULLIF(SUM(o.started_at IS NOT NULL), 0), 1) AS completados_sobre_empezados_pct
FROM stretch_offers o
WHERE o.tenant_id = 1
  AND o.local_date BETWEEN @desde AND @hasta
GROUP BY o.arm
ORDER BY FIELD(o.arm, 'control', 'push_30', 'push_60');

-- 1b: los dos grupos con push juntos contra control (filas del umbral push contra control menos del doble)
SELECT t.grupo,
  COUNT(*) AS ofertas,
  SUM(t.completada) AS completados,
  ROUND(100 * SUM(t.completada) / COUNT(*), 2) AS completados_cada_100
FROM (
  SELECT IF(o.arm = 'control', 'control', 'con_push') AS grupo,
    (o.completed_at IS NOT NULL) AS completada
  FROM stretch_offers o
  WHERE o.tenant_id = 1
    AND o.local_date BETWEEN @desde AND @hasta
) t
GROUP BY t.grupo
ORDER BY t.grupo;

-- ============================================================
-- BLOQUE 2: motivos de no envio por grupo
-- push_decision: queued, control, ya_empezo, plantilla_apagada, sin_token, categoria_apagada,
-- tope_semanal, pausa_sin_abrir, fuera_de_horario, error_encolado, fallo_envio
-- NULL = la oferta la creo la card y el tick todavia no la decidio
-- ============================================================
SELECT o.arm, o.push_decision,
  COUNT(*) AS ofertas,
  ROUND(100 * COUNT(*) / tot.n, 1) AS pct_del_grupo
FROM stretch_offers o
JOIN (
  SELECT arm, COUNT(*) AS n
  FROM stretch_offers
  WHERE tenant_id = 1
    AND local_date BETWEEN @desde AND @hasta
  GROUP BY arm
) tot ON tot.arm = o.arm
WHERE o.tenant_id = 1
  AND o.local_date BETWEEN @desde AND @hasta
GROUP BY o.arm, o.push_decision, tot.n
ORDER BY FIELD(o.arm, 'control', 'push_30', 'push_60'), ofertas DESC;

-- ============================================================
-- BLOQUE 3: cuidado, categoria entrenamiento apagada al cierre
-- Alumnos con al menos una oferta en el periodo, por grupo
-- apagada_al_cierre = tiene la categoria apagada hoy (base historica 2,8 por ciento)
-- apagada_en_el_periodo = ademas la fila de preferencias cambio desde @desde
-- Comparar la diferencia entre grupos con push y control (umbral 1,5 puntos)
-- ============================================================
SELECT x.arm,
  COUNT(*) AS alumnos,
  SUM(x.apagada) AS apagada_al_cierre,
  ROUND(100 * SUM(x.apagada) / COUNT(*), 2) AS apagada_al_cierre_pct,
  SUM(x.apagada_en_periodo) AS apagada_en_el_periodo,
  ROUND(100 * SUM(x.apagada_en_periodo) / COUNT(*), 2) AS apagada_en_el_periodo_pct
FROM (
  SELECT o.user_id, MIN(o.arm) AS arm,
    EXISTS (
      SELECT 1 FROM notification_preferences p
      WHERE p.tenant_id = 1 AND p.user_id = o.user_id
        AND p.notification_category = 'entrenamiento' AND p.enabled = 0
    ) AS apagada,
    EXISTS (
      SELECT 1 FROM notification_preferences p
      WHERE p.tenant_id = 1 AND p.user_id = o.user_id
        AND p.notification_category = 'entrenamiento' AND p.enabled = 0
        AND p.updated_at >= @desde
    ) AS apagada_en_periodo
  FROM stretch_offers o
  WHERE o.tenant_id = 1
    AND o.local_date BETWEEN @desde AND @hasta
  GROUP BY o.user_id
) x
GROUP BY x.arm
ORDER BY FIELD(x.arm, 'control', 'push_30', 'push_60');

-- ============================================================
-- BLOQUE 4: cuidado, asistencias por alumno y por semana
-- El grupo se recalcula con el mismo hash que la app: CRC32 de 'stretch-v1:' y el id, modulo 100
-- 0 a 19 control, 20 a 59 push_30, 60 a 99 push_60
-- Semanas ancladas al lunes con la fecha de la fila (WEEKDAY: lunes = 0)
-- periodo antes = las 4 semanas anteriores a @desde, durante = @desde a @hasta
-- Comparar el cambio antes a durante de los grupos con push contra el de control
-- ============================================================
SELECT w.arm, w.periodo,
  COUNT(*) AS alumno_semanas,
  COUNT(DISTINCT w.user_id) AS alumnos,
  ROUND(AVG(w.asistencias), 3) AS asistencias_por_alumno_por_semana
FROM (
  SELECT a.member_id AS user_id,
    DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY) AS semana_lunes,
    IF(a.session_date < @desde, 'antes', 'durante') AS periodo,
    CASE
      WHEN CRC32(CONCAT('stretch-v1:', a.member_id)) % 100 < 20 THEN 'control'
      WHEN CRC32(CONCAT('stretch-v1:', a.member_id)) % 100 < 60 THEN 'push_30'
      ELSE 'push_60'
    END AS arm,
    COUNT(*) AS asistencias
  FROM attendance a
  WHERE a.tenant_id = 1
    AND a.session_date BETWEEN DATE_SUB(@desde, INTERVAL 28 DAY) AND @hasta
  GROUP BY a.member_id,
    DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY),
    IF(a.session_date < @desde, 'antes', 'durante')
) w
GROUP BY w.arm, w.periodo
ORDER BY FIELD(w.arm, 'control', 'push_30', 'push_60'), w.periodo;

-- ============================================================
-- BLOQUE 5: duracion real de los estiramientos completados contra la planificada
-- La mediana se aproxima con ROW_NUMBER (promedio de las dos filas del medio)
-- real_sobre_plan cerca de 1 = la gente sigue el reloj. Muy por debajo = marca y sale antes
-- ============================================================
WITH c AS (
  SELECT o.arm,
    o.duration_seconds AS d,
    o.planned_seconds AS p,
    ROW_NUMBER() OVER (PARTITION BY o.arm ORDER BY o.duration_seconds) AS rn,
    COUNT(*) OVER (PARTITION BY o.arm) AS n
  FROM stretch_offers o
  WHERE o.tenant_id = 1
    AND o.local_date BETWEEN @desde AND @hasta
    AND o.completed_at IS NOT NULL
    AND o.duration_seconds IS NOT NULL
)
SELECT c.arm,
  MAX(c.n) AS completados,
  ROUND(AVG(c.d)) AS duracion_promedio_s,
  ROUND(AVG(CASE WHEN c.rn IN (FLOOR((c.n + 1) / 2), CEIL((c.n + 1) / 2)) THEN c.d END)) AS duracion_mediana_s,
  ROUND(AVG(c.p)) AS planificado_promedio_s,
  ROUND(AVG(c.d) / AVG(c.p), 2) AS real_sobre_plan
FROM c
GROUP BY c.arm
ORDER BY FIELD(c.arm, 'control', 'push_30', 'push_60');

-- ============================================================
-- UMBRALES PARA APAGAR (SPEC 5.4) y que bloque responde cada fila
-- ------------------------------------------------------------
-- Completados cada 100 asistencias elegibles, grupos con push, menos de 1,5: apagar el push. Bloque 1
-- Completados cada 100, grupo control, menos de 0,5 y ademas lo anterior: retirar la feature, cambio con deploy (D-13). Bloque 1
-- Push contra control, menos del doble: apagar el push y dejar la card. Bloque 1b
-- Alumnos que apagan entrenamiento, push contra control, mas de 1,5 puntos de diferencia: apagar el push ese mismo dia. Bloque 3
-- Apertura del push menos de 4 por ciento: revisar texto y momento antes de apagar. Bloque 1 (apertura_pct)
-- Completados sobre empezados menos de 50 por ciento: acortar la rutina a 4 estiramientos. Bloque 1 (y duracion en el bloque 5)
-- Cuidado extra: asistencias por alumno y por semana en push contra control. Bloque 4
-- Motivos de no envio, para entender por que un grupo con push rinde menos de lo esperado. Bloque 2
-- ============================================================
