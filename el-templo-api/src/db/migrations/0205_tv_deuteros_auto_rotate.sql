-- Fase 164 (TV de sucursal) -- rotacion automatica de deuteros
-- Las dos estaciones de deuteros (I y II) comparten un unico timer y en el TV
-- rotan solas cada 10s. Dos columnas por sede en tv_class_state:
--   deuteros_auto_rotate  flag on/off desde el control del profe (arranca en TRUE)
--   deuteros_pinned_at    sello de la ultima seleccion manual (pisada de 30s)
-- Mismo patron fsp 3 que timer_started_at para el sello con milisegundos.
ALTER TABLE tv_class_state
  ADD COLUMN deuteros_auto_rotate BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN deuteros_pinned_at TIMESTAMP(3) NULL;
