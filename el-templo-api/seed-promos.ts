/**
 * Seed script for initial promo plans
 *
 * TEMPLOPASSBCN: BCN branch inauguration
 * AURACLUB1: Aura Club first event
 *
 * Validity window: 2026-03-29 00:01 to 2026-03-30 12:00 (UTC-3 = America/Argentina/Buenos_Aires)
 * In UTC: 2026-03-29 03:01 to 2026-03-30 15:00
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { subscriptionPlans } from "./src/db/schema/subscription-plans";
import { promoPlans } from "./src/db/schema/promo-plans";

async function seedPromos() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "eltemplo",
  });

  const db = drizzle(connection);

  try {
    // Check if "Promo Gratuito 30 Dias" subscription plan already exists
    const existingPlan = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, "Promo Gratuito 30 Dias"))
      .limit(1);

    let subscriptionPlanId: number;

    if (existingPlan.length > 0) {
      subscriptionPlanId = existingPlan[0].id;
      console.log(
        `Subscription plan "Promo Gratuito 30 Dias" already exists (id=${subscriptionPlanId})`,
      );
    } else {
      // Create the online subscription plan for promo users
      const planResult = await db.insert(subscriptionPlans).values({
        name: "Promo Gratuito 30 Dias",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 0,
        priceZero: 0,
        durationDays: 30,
        isOnline: true,
        isTrial: true,
      });
      subscriptionPlanId = Number(planResult[0].insertId);
      console.log(
        `Created subscription plan "Promo Gratuito 30 Dias" (id=${subscriptionPlanId})`,
      );
    }

    // Validity window in UTC: 2026-03-29 03:01 to 2026-03-30 15:00
    const startDate = new Date("2026-03-29T03:01:00Z");
    const expiryDate = new Date("2026-03-30T15:00:00Z");

    // Seed TEMPLOPASSBCN
    const existingBcn = await db
      .select({ id: promoPlans.id })
      .from(promoPlans)
      .where(eq(promoPlans.promoCode, "TEMPLOPASSBCN"))
      .limit(1);

    if (existingBcn.length === 0) {
      await db.insert(promoPlans).values({
        name: "Templo Pass BCN",
        promoCode: "TEMPLOPASSBCN",
        planDurationDays: 30,
        subscriptionPlanId,
        startDate,
        expiryDate,
        promoType: "auto",
      });
      console.log("Seeded promo: TEMPLOPASSBCN");
    } else {
      console.log("Promo TEMPLOPASSBCN already exists, skipping");
    }

    // Seed AURACLUB1
    const existingAura = await db
      .select({ id: promoPlans.id })
      .from(promoPlans)
      .where(eq(promoPlans.promoCode, "AURACLUB1"))
      .limit(1);

    if (existingAura.length === 0) {
      await db.insert(promoPlans).values({
        name: "Aura Club Inaugural",
        promoCode: "AURACLUB1",
        planDurationDays: 30,
        subscriptionPlanId,
        startDate,
        expiryDate,
        promoType: "auto",
      });
      console.log("Seeded promo: AURACLUB1");
    } else {
      console.log("Promo AURACLUB1 already exists, skipping");
    }

    console.log("Promo seed complete!");
  } finally {
    await connection.end();
  }
}

seedPromos().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
