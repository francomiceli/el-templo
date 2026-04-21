-- Phase 98 correction — normalize ES plan prices from cents to whole euros.
--
-- 0091 seeded the 12 ES plans with prices stored as cents (Flex 7000 = EUR 70)
-- to match a "formatPrice divides by 100" assumption in el-templo-admin and
-- el-templo-app. But AR plans are stored as whole pesos, not centavos, across
-- the existing codebase. Mixing conventions broke AR price displays the moment
-- formatPrice was adopted on PlanesPage.vue. Project convention is: no minor
-- units anywhere. Every stored monetary value is a whole unit of its currency.
--
-- This migration divides the seeded ES prices by 100 so they match the rest
-- of the system. formatPrice has been updated in the same phase to stop
-- dividing by 100. AR rows are untouched (they were always whole pesos).
--
-- Only affects price_regular and price_zero. price_credit_card is NULL for
-- all seeded ES rows (set NULL in 0091), so nothing to normalize there.

UPDATE subscription_plans
   SET price_regular = price_regular / 100,
       price_zero = price_zero / 100
 WHERE country = 'ES';
