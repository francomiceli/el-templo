-- Fase 180 (D-11/D-14): campaigns gana la columna que persiste a que
-- segmento de socios le habla cada campana. Hoy TODAS las campanas van a
-- freemium elegibles (fase 119) -- D-11/D-12 piden elegir entre 5 segmentos
-- predefinidos por campana, con preview de conteo antes de enviar.
--
-- Segmentos validos (D-12), resueltos server-side en audience-service.ts:
--   freemium_elegibles | bajas | prueba_no_convertida | alerta_ausente | referidos_pendientes
--
-- DEFAULT 'freemium_elegibles' evita cualquier backfill: las campanas ya
-- existentes de la fase 119 son, por definicion, todas de ese segmento.
ALTER TABLE campaigns
  ADD COLUMN segment VARCHAR(32) NOT NULL DEFAULT 'freemium_elegibles';
