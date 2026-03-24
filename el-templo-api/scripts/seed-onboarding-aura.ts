/**
 * One-time seed script: add onboarding_completion source type to aura_config.
 *
 * Run with: npx tsx scripts/seed-onboarding-aura.ts
 *
 * Safe to run multiple times — uses INSERT IGNORE to skip if already present.
 */
import "dotenv/config";
import { createSingleConnection } from "../src/db";
import { auraConfig } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const { db, connection } = await createSingleConnection();

  // Check if already exists
  const existing = await db
    .select({ id: auraConfig.id })
    .from(auraConfig)
    .where(eq(auraConfig.sourceType, "onboarding_completion"))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      "onboarding_completion aura_config already exists, skipping.",
    );
  } else {
    await db.insert(auraConfig).values({
      sourceType: "onboarding_completion",
      defaultAmount: 50,
      description: "AURA reward for completing onboarding quiz",
      isActive: true,
    });
    console.log(
      "Inserted aura_config row: onboarding_completion (50 AURA)",
    );
  }

  await connection.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
