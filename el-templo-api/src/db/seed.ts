import "dotenv/config";
import * as argon2 from "argon2";
import { branches, users } from "./schema";
import { createSingleConnection } from "./index";

// Get passwords from environment variables
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD;

if (!SEED_ADMIN_PASSWORD || !SEED_DEFAULT_PASSWORD) {
  console.error("❌ Missing required environment variables:");
  if (!SEED_ADMIN_PASSWORD) console.error("  - SEED_ADMIN_PASSWORD");
  if (!SEED_DEFAULT_PASSWORD) console.error("  - SEED_DEFAULT_PASSWORD");
  console.error(
    "\nSet these in your .env file before running the seed script.",
  );
  process.exit(1);
}

async function seed() {
  const { db, connection } = await createSingleConnection();

  console.log("🌱 Seeding database...");

  // Clear existing data
  console.log("Clearing existing data...");
  await db.delete(users);
  await db.delete(branches);

  // Insert branches
  console.log("Creating branches...");
  const branchesData = [
    { name: "El Templo Moreno", code: "MORENO" },
    { name: "El Templo Alem", code: "ALEM" },
    { name: "El Templo Constitución", code: "CONST" },
    { name: "El Templo Jujuy", code: "JUJUY" },
    { name: "El Templo Mogotes", code: "MOGOTES" },
    { name: "El Templo Park", code: "PARK" },
  ];

  await db.insert(branches).values(branchesData);
  const branchIds = Array.from({ length: 5 }, (_, i) => i + 1);
  console.log(`✓ Created ${branchesData.length} branches`);

  // Hash passwords from environment variables (validated at startup)
  const defaultPasswordHash = await argon2.hash(SEED_DEFAULT_PASSWORD!);
  const adminPasswordHash = await argon2.hash(SEED_ADMIN_PASSWORD!);

  // Insert superadmin
  console.log("Creating superadmin...");
  await db.insert(users).values({
    email: "admin@eltemplo.com",
    passwordHash: adminPasswordHash,
    firstName: "Super",
    lastName: "Admin",
    role: "superadmin",
    branchId: branchIds[0], // Centro
    level: "spartan",
  });
  console.log("✓ Created superadmin (admin@eltemplo.com)");

  // Insert coaches (1 per branch)
  console.log("Creating coaches...");
  const coaches = branchIds.map((branchId, index) => ({
    email: `coach${index + 1}@eltemplo.com`,
    passwordHash: defaultPasswordHash,
    firstName: `Coach`,
    lastName: `${index + 1}`,
    role: "coach" as const,
    branchId,
    level: "omega" as const,
  }));

  await db.insert(users).values(coaches);
  console.log(`✓ Created ${coaches.length} coaches`);

  // Insert members (4 per branch)
  console.log("Creating members...");
  const levels = ["alfa", "delta", "sigma", "omega"] as const;
  const members = branchIds.flatMap((branchId, branchIndex) =>
    levels.map((level, levelIndex) => ({
      email: `member${branchIndex * 4 + levelIndex + 1}@eltemplo.com`,
      passwordHash: defaultPasswordHash,
      firstName: `Member`,
      lastName: `${branchIndex * 4 + levelIndex + 1}`,
      role: "member" as const,
      branchId,
      level,
    })),
  );

  await db.insert(users).values(members);
  console.log(`✓ Created ${members.length} members`);

  // Summary (without exposing passwords)
  console.log("\n✅ Seeding complete!");
  console.log(`
Summary:
- 5 branches
- 1 superadmin (admin@eltemplo.com)
- 5 coaches (coach1-5@eltemplo.com)
- 20 members (member1-20@eltemplo.com)

Total users: 26
  `);

  await connection.end();
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
