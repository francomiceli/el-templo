-- Populate descriptions for the 6 original subscription plans
-- These descriptions appear in the member-facing Planes catalog (PlanesPage)
-- Based on .docs/admin-docs/datos-membresias-actuales-templo.txt

UPDATE `subscription_plans`
SET `description` = 'Turnos fijos en una sede. Incluye 2 sesiones de regalo en tu primer mes.'
WHERE `name` = 'Flex' AND `description` IS NULL;

UPDATE `subscription_plans`
SET `description` = 'Turnos fijos o libres en una sede. Incluye acceso a clases ROM los sabados.'
WHERE `name` = 'Flex+' AND `description` IS NULL;

UPDATE `subscription_plans`
SET `description` = 'Turnos fijos en una sede. Compromiso de 4 meses con 2 sesiones de regalo.'
WHERE `name` = 'Foundation' AND `description` IS NULL;

UPDATE `subscription_plans`
SET `description` = 'Turnos fijos o libres con acceso a todas las sedes. Incluye clases ROM los sabados.'
WHERE `name` = 'Foundation+' AND `description` IS NULL;

UPDATE `subscription_plans`
SET `description` = 'Nuestro plan mas completo. Turnos fijos o libres en todas las sedes con acceso a ROM y eventos exclusivos.'
WHERE `name` = 'Performance' AND `description` IS NULL;

UPDATE `subscription_plans`
SET `description` = 'Sesion de prueba gratuita para conocer El Templo.'
WHERE `name` = 'Sesión de Prueba' AND `description` IS NULL;
