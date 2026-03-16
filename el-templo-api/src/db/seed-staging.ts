import "dotenv/config";
import { faker } from "@faker-js/faker/locale/es";
import * as argon2 from "argon2";
import { branches, users } from "./schema";
import { createSingleConnection } from "./index";
import { seedSPOM } from "./seed-spom";

// Fixed seed for reproducible data
faker.seed(12345);

// SAFETY: Refuse to run against production database
const DB_NAME = process.env.DB_NAME || "eltemplo";
if (DB_NAME === "eltemplo") {
  throw new Error(
    "SAFETY: Refusing to seed production database. Set DB_NAME=eltemplo_staging",
  );
}

async function seedStaging() {
  console.log("Staging seed starting...");
  console.log(`Target database: ${DB_NAME}\n`);

  // Step 1: Seed all SPOM reference data (exercises, routes, formats, etc.)
  // SKIP_SPOM=true skips CSV-based seeding (use when SPOM data was imported from production dump)
  if (process.env.SKIP_SPOM === "true") {
    console.log("--- Skipping SPOM seed (SKIP_SPOM=true) ---\n");
  } else {
    console.log("--- Seeding SPOM reference data ---");
    await seedSPOM();
    console.log("");
  }

  // Step 2: Create branches and users
  const { db, connection } = await createSingleConnection();

  try {
    // Clear users and branches (disable FK checks for cascading references)
    console.log("Clearing users and branches...");
    await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
    await db.delete(users);
    await db.delete(branches);
    await connection.execute("ALTER TABLE branches AUTO_INCREMENT = 1");
    await connection.execute("ALTER TABLE users AUTO_INCREMENT = 1");
    await connection.execute("SET FOREIGN_KEY_CHECKS = 1");

    // Create 5 branches (same as production seed)
    console.log("Creating branches...");
    const branchesData = [
      { name: "El Templo Moreno", code: "MORENO" },
      { name: "El Templo Alem", code: "ALEM" },
      { name: "El Templo Constitucion", code: "CONST" },
      { name: "El Templo Jujuy", code: "JUJUY" },
      { name: "El Templo Mogotes", code: "MOGOTES" },
      { name: "El Templo Park", code: "PARK" },
    ];
    await db.insert(branches).values(branchesData);
    console.log(`Created ${branchesData.length} branches`);

    // Hash password once, reuse for all users
    const password = process.env.STAGING_SEED_PASSWORD || "templo2026";
    const passwordHash = await argon2.hash(password);

    // Create 2 known test users
    console.log("Creating test users...");
    await db.insert(users).values([
      {
        email: "test-member@eltemplo.org",
        passwordHash,
        firstName: "Test",
        lastName: "Member",
        role: "member",
        level: "sigma",
        branchId: 1,
      },
      {
        email: "test-admin@eltemplo.org",
        passwordHash,
        firstName: "Test",
        lastName: "Admin",
        role: "superadmin",
        level: "spartan",
        branchId: 1,
      },
    ]);
    console.log("Created 2 test users");

    // Create 3 coaches with faker names
    console.log("Creating coaches...");
    const coachData = Array.from({ length: 3 }, (_, i) => ({
      email: `coach-staging-${i + 1}@eltemplo.org`,
      passwordHash,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: "coach" as const,
      level: "omega" as const,
      branchId: (i % 3) + 1, // Spread across branches 1-3
    }));
    await db.insert(users).values(coachData);
    console.log(`Created ${coachData.length} coaches`);

    // Create 15 fake members with faker names
    console.log("Creating fake members...");
    const levels = ["alfa", "delta", "sigma", "omega"] as const;
    const memberData = Array.from({ length: 15 }, (_, i) => ({
      email: `member-staging-${i + 1}@eltemplo.org`,
      passwordHash,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: "member" as const,
      level: levels[i % levels.length],
      branchId: (i % 5) + 1, // Spread across all 5 branches
    }));
    await db.insert(users).values(memberData);
    console.log(`Created ${memberData.length} members`);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("STAGING SEED SUMMARY");
    console.log("=".repeat(50));
    console.log(`  Branches: ${branchesData.length}`);
    console.log(
      `  Test users: 2 (test-member@eltemplo.org, test-admin@eltemplo.org)`,
    );
    console.log(`  Coaches: ${coachData.length}`);
    console.log(`  Members: ${memberData.length}`);
    console.log(`  Total users: ${2 + coachData.length + memberData.length}`);
    console.log("=".repeat(50));
    console.log("Staging seed complete.");
  } finally {
    await connection.end();
  }
}

// Self-executing when run directly
if (require.main === module) {
  seedStaging()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Staging seed failed:", message);
      process.exit(1);
    });
}

export { seedStaging };
