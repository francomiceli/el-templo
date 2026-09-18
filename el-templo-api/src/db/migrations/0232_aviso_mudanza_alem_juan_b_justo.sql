-- Aviso pop-up de la mudanza de Alem a Juan B. Justo 1018 (pedido de Nacho
-- 2026-09-18), por el sistema de comunicaciones de la fase 193.
--
-- Pop-up que se muestra UNA sola vez por socio la proxima vez que abra la
-- app (frequency_type once, el visto queda en aviso_events). Activo desde
-- ya, sin fecha de fin: se pausa o edita desde el admin (Comunicaciones)
-- cuando corresponda. Alcance: todos los socios de Argentina
-- (scope_countries AR). No se acota por sede porque el pedido es que lo vea
-- todo el mundo, pero no tiene sentido para Barcelona.
--
-- kind custom con un code propio para que el INSERT sea idempotente por la
-- unique (tenant_id, code). El code NO esta en ORCHESTRATED_POPUP_CODES, asi
-- que el arbitro de pop-ups lo trata como un aviso custom mas (prioridad:
-- vencimiento de plan, despues este, despues calificacion).
--
-- ES UNA MIGRACION DE DATOS DE PROD (staging y prod comparten MySQL, regla 4
-- del skill el-templo-db-migrations). Sin punto-y-coma en comentarios.

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`,
   `scope_branch_ids`, `scope_countries`, `scope_segments`, `sort_order`)
SELECT 1, 'custom', 'mudanza_alem_jbj_2026_09', 'popup',
  'Alem se muda a un espacio más grande!',
  'A partir de ahora nos encontrás en Juan B. Justo 1018, un espacio más amplio para seguir entrenando juntos. ¡Te esperamos!',
  'Entendido', 'app_section', 'mi_templo', NULL,
  'once', NULL, 'active',
  NULL, JSON_ARRAY('AR'), NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = 1 AND a.code = 'mudanza_alem_jbj_2026_09'
);
