-- 0271_seed_branches_web.sql
-- Fase 195 (D-01/D-07/D-10/D-16/D-30): datos de sedes para la web publica y
-- WhatsApp de ventas por pais.
--
-- Cada UPDATE va keyed por code Y tenant_id = 1 (El Templo): en una DB sin esas
-- sedes (tests, tenants nuevos) es un no-op. Re-ejecutar deja los mismos
-- valores (idempotente). NO se tocan name, timezone, place_id, phone,
-- postal_code ni maps_url (llegan con los links de Franco, plan 195-14).
--
-- Las coordenadas son aproximadas y sirven solo para ordenar y mapear. Las
-- exactas llegan con el Place ID (D-08).
--
-- ALEM ya se llama Juan B. Justo desde la 0230 (el code interno es estable).
-- El Templo Park es un espacio de comunidad (web_kind community_space) y no
-- una sede. CHAPADMALAL y ONLINE quedan fuera de la web (publish_on_web = 0).
--
-- Al final, INSERT IGNORE de los dos numeros de WhatsApp de ventas
-- (key whatsapp.sales_number.AR y .ES, solo digitos, ver
-- modules/communications/sales-number.ts). La unique uq_tenant_setting impide
-- pisar un valor ya cargado desde el admin.
--
-- Sin punto-y-coma dentro de comentarios (regla dura del skill
-- el-templo-db-migrations).

UPDATE branches
  SET web_slug = 'constitucion', public_name = 'Constitución',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -37.956600, longitude = -57.571000,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'CONST' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'jujuy', public_name = 'Jujuy',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -38.011700, longitude = -57.568400,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'JUJUY' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'moreno', public_name = 'Moreno',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -37.995800, longitude = -57.560500,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'MORENO' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'juan-b-justo', public_name = 'Juan B. Justo',
      address = 'Juan B. Justo 1018',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -38.033500, longitude = -57.552200,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'ALEM' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'alberti', public_name = 'Alberti',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -38.001900, longitude = -57.546000,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'ALBERTI' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'mario-bravo', public_name = 'Mario Bravo',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -38.079700, longitude = -57.546800,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'MOGOTES' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'parque-primavesi', public_name = 'El Templo Park',
      address = 'Parque Primavesi',
      locality = 'Mar del Plata', region = 'Buenos Aires',
      latitude = -38.028700, longitude = -57.542400,
      photo_url = '/images/photos/sede-park.webp',
      publish_on_web = 1, web_kind = 'community_space'
  WHERE code = 'PARK' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET web_slug = 'barcelona', public_name = 'Barcelona (Eixample)',
      address = 'Av. Diagonal 368',
      locality = 'Barcelona', region = 'Cataluña', country = 'ES',
      latitude = 41.399600, longitude = 2.170900,
      publish_on_web = 1, web_kind = 'gym'
  WHERE code = 'BCN' AND tenant_id = 1;
--> statement-breakpoint
UPDATE branches
  SET publish_on_web = 0
  WHERE code IN ('CHAPADMALAL', 'ONLINE') AND tenant_id = 1;
--> statement-breakpoint
INSERT IGNORE INTO tenant_settings (tenant_id, setting_key, setting_value)
  VALUES (1, 'whatsapp.sales_number.AR', '5492235820521'),
         (1, 'whatsapp.sales_number.ES', '34680774331');
