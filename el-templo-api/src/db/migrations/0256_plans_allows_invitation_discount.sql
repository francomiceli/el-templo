-- 0256_plans_allows_invitation_discount.sql
-- Fase 194 (D-10b/D-23): flag por plan `allows_invitation_discount`. Si el plan
-- del cobro no lo tiene, el cobro no cualifica el vinculo de invitacion ni
-- recibe el descuento. Editable desde el admin de planes. Default 0 para planes
-- nuevos (opt-in).
--
-- Backfill D-23 (espejo exacto del comportamiento de hoy, nadie pierde
-- descuento por esta migracion): 1 en todo plan salvo especial, paquete e
-- is_trial. Gestion desmarca despues los planes largos o de clase unica desde
-- el admin. Los planes Invitacion (0257) nacen con el flag en 0.
--
-- Guard del UPDATE: el runner de migraciones NO saltea los statements que
-- siguen a un Duplicate column name, solo deja de tirar errores. En una
-- re-ejecucion el UPDATE volveria a correr y re-marcaria planes que gestion
-- desmarco a mano. Por eso el UPDATE solo corre si todavia no hay ningun plan
-- marcado: el backfill ocurre exactamente una vez. La derived table evita el
-- error 1093 de MySQL (no se puede leer la tabla que se actualiza).
--
-- Sin datos de test. Hand-written, NUNCA drizzle-kit push o migrate. Numeracion
-- verificada con git ls-tree contra origin/master y origin/staging (tope 0254).

ALTER TABLE subscription_plans ADD COLUMN allows_invitation_discount TINYINT(1) NOT NULL DEFAULT 0;

UPDATE subscription_plans
SET allows_invitation_discount = 1
WHERE plan_category NOT IN ('especial', 'paquete')
  AND is_trial = 0
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM subscription_plans WHERE allows_invitation_discount = 1) marcado);
