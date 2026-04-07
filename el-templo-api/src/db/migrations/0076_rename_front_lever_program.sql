-- Rename "Tu Front Lever" to "Tu Primer Front Lever" per product doc
UPDATE `programs` SET `name` = 'Tu Primer Front Lever' WHERE `name` = 'Tu Front Lever';
UPDATE `subscription_plans` SET `name` = 'Tu Primer Front Lever' WHERE `name` = 'Tu Front Lever';
UPDATE `subscription_plans` SET `description` = 'Progresion estructurada para lograr tu primer front lever en 12 semanas.' WHERE `name` = 'Tu Primer Front Lever';
