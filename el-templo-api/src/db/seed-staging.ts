import "dotenv/config";
import { faker } from "@faker-js/faker/locale/es";
import * as argon2 from "argon2";
import { branches, users } from "./schema";
import { createSingleConnection } from "./index";
import { seedSPOM } from "./seed-spom";
import {
  failTenantArg,
  queryFnFromConnection,
  requireTenant,
} from "./scripts/require-tenant";
import { tenantValues, tenantWhere } from "../modules/shared/tenant";

// Fixed seed for reproducible data
faker.seed(12345);

// SAFETY: Refuse to run against production database
const DB_NAME = process.env.DB_NAME || "eltemplo";
if (DB_NAME === "eltemplo") {
  throw new Error(
    "SAFETY: Refusing to seed production database. Set DB_NAME=eltemplo_staging",
  );
}

/**
 * `--tenant=<id>` es OBLIGATORIO (fase 169 D-06, retrofit fase 173 D-03): hasta
 * este retrofit, el seed escribía siempre al `DEFAULT 1` de `tenant_id` sin
 * decirlo. Con el flag, el operador elige el gimnasio y los `users` que este
 * script crea nacen ahí (`tenantValues`). El `DELETE` de `users` también se
 * acota por gimnasio (`tenantWhere`): así una corrida para el gimnasio 2 no le
 * borra los socios al 1. `branches` queda FUERA del alcance de este retrofit
 * (D-02, cirugía mínima — no es una tabla del módulo `members`): sigue
 * reseteándose entero, tal cual hacía antes.
 */
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
    // Gimnasio: ANTES de cualquier escritura (fase 169 D-06, retrofit 173
    // D-03). Corta con exit 2 sin haber tocado la base.
    const ctx = await requireTenant(queryFnFromConnection(connection));
    console.log(`Tenant: ${ctx.tenantId}`);

    // Clear users and branches (disable FK checks for cascading references).
    // `users` se acota por gimnasio (tenantWhere): una corrida para el
    // gimnasio 2 no le borra los socios al 1. `branches` sigue reseteándose
    // ENTERO (fuera del alcance de este plan, D-02).
    console.log("Clearing users and branches...");
    await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
    await db.delete(users).where(tenantWhere(users, ctx));
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
    await db.insert(users).values(
      [
        {
          email: "test-member@eltemplo.org",
          passwordHash,
          firstName: "Test",
          lastName: "Member",
          role: "member" as const,
          level: "sigma" as const,
          branchId: 1,
        },
        {
          email: "test-admin@eltemplo.org",
          passwordHash,
          firstName: "Test",
          lastName: "Admin",
          role: "owner" as const,
          level: "spartan" as const,
          branchId: 1,
        },
      ].map((u) => tenantValues(ctx, u)),
    );
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
    await db.insert(users).values(coachData.map((u) => tenantValues(ctx, u)));
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
    await db.insert(users).values(memberData.map((u) => tenantValues(ctx, u)));
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
    .catch((err: unknown) => failTenantArg(err, "seed-staging"));
}

export { seedStaging };
