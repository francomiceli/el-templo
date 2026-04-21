import dotenv from "dotenv";
import path from "node:path";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { eq, and, sql } from "drizzle-orm";
import { createSingleConnection } from "./index";
import { branches, activities, subscriptionPlans, schedules } from "./schema";

// SAFETY: Require explicit confirmation to run against production
if (process.env.CONFIRM_PRODUCTION_SEED !== "yes") {
  throw new Error(
    "SAFETY: Set CONFIRM_PRODUCTION_SEED=yes to run this script. " +
      "This seeds operational data (branches, plans, schedules) into the target database.",
  );
}

/**
 * Production seed script.
 *
 * Seeds OPERATIONAL data only (branches, activity, subscription plans, schedules).
 * - Does NOT create or delete users (production has real users).
 * - Does NOT seed SPOM data (production already has it from initial setup).
 * - Idempotent: checks for existing records before inserting, updates if needed.
 * - Safe to re-run multiple times.
 */
async function seedProduction() {
  console.log("Production seed starting...");
  console.log(`Target database: ${process.env.DB_NAME || "eltemplo"}\n`);

  const { db, connection } = await createSingleConnection();

  try {
    // ── Step 1: Branches ──────────────────────────────────────────────
    // branches.code is UNIQUE, so onDuplicateKeyUpdate works correctly here.
    console.log("--- Seeding branches ---");

    const branchesData = [
      {
        name: "El Templo Alem",
        code: "ALEM",
        maxCapacity: 12,
        isVirtual: false,
      },
      {
        name: "El Templo Constitucion",
        code: "CONST",
        maxCapacity: 22,
        isVirtual: false,
      },
      {
        name: "El Templo Jujuy",
        code: "JUJUY",
        maxCapacity: 12,
        isVirtual: false,
      },
      {
        name: "El Templo Mogotes",
        code: "MOGOTES",
        maxCapacity: 22,
        isVirtual: false,
      },
      {
        name: "El Templo Moreno",
        code: "MORENO",
        maxCapacity: 22,
        isVirtual: false,
      },
      {
        name: "Templo Online",
        code: "ONLINE",
        maxCapacity: 999,
        isVirtual: true,
      },
    ];

    for (const branch of branchesData) {
      await db
        .insert(branches)
        .values(branch)
        .onDuplicateKeyUpdate({
          set: {
            name: sql`VALUES(name)`,
            maxCapacity: sql`VALUES(max_capacity)`,
            isVirtual: sql`VALUES(is_virtual)`,
          },
        });
    }
    console.log(`Upserted ${branchesData.length} branches`);

    // ── Step 2: Activity ──────────────────────────────────────────────
    // activities has no unique constraint on name, so check-then-insert.
    console.log("\n--- Seeding activity ---");

    const existingActivity = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "Calistenia"))
      .limit(1);

    if (existingActivity.length === 0) {
      await db
        .insert(activities)
        .values({ name: "Calistenia", isActive: true });
      console.log("Created activity: Calistenia");
    } else {
      await db
        .update(activities)
        .set({ isActive: true })
        .where(eq(activities.name, "Calistenia"));
      console.log("Activity already exists: Calistenia (ensured active)");
    }

    // Fetch activity ID for schedule creation
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "Calistenia"))
      .limit(1);

    if (!activity) {
      throw new Error("Failed to find Calistenia activity after insert");
    }
    const activityId = activity.id;

    // ── Step 3: Subscription Plans ────────────────────────────────────
    // subscription_plans has no unique constraint on name, so check-then-insert/update.
    console.log("\n--- Seeding subscription plans ---");

    const plansData = [
      {
        name: "Flex",
        description:
          "Turnos fijos en una sede. Incluye 2 sesiones de regalo en tu primer mes.",
        planCategory: "presencial" as const,
        planTier: "flex" as const,
        bookingMode: "fixed" as const,
        priceRegular: 80000,
        priceZero: 65000,
        priceCreditCard: null,
        durationDays: 30,
        classesPerWeek: 2,
        multiBranch: false,
        isTrial: false,
      },
      {
        name: "Flex+",
        description:
          "Turnos fijos o libres en una sede. Incluye acceso a clases ROM los sabados.",
        planCategory: "presencial" as const,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        priceRegular: 100000,
        priceZero: 80000,
        priceCreditCard: null,
        durationDays: 30,
        classesPerWeek: 6,
        multiBranch: false,
        isTrial: false,
      },
      {
        name: "Foundation",
        description:
          "Turnos fijos en una sede. Compromiso de 4 meses con 2 sesiones de regalo.",
        planCategory: "presencial" as const,
        planTier: "foundation" as const,
        bookingMode: "fixed" as const,
        priceRegular: 250000,
        priceZero: 220000,
        priceCreditCard: 280000,
        durationDays: 120,
        classesPerWeek: 2,
        multiBranch: false,
        isTrial: false,
      },
      {
        name: "Foundation+",
        description:
          "Turnos fijos o libres con acceso a todas las sedes. Incluye clases ROM los sabados.",
        planCategory: "presencial" as const,
        planTier: "foundation" as const,
        bookingMode: "flexible" as const,
        priceRegular: 350000,
        priceZero: 315000,
        priceCreditCard: 370000,
        durationDays: 120,
        classesPerWeek: 6,
        multiBranch: true,
        isTrial: false,
      },
      {
        name: "Performance",
        description:
          "Nuestro plan mas completo. Turnos fijos o libres en todas las sedes con acceso a ROM y eventos exclusivos.",
        planCategory: "presencial" as const,
        planTier: "performance" as const,
        bookingMode: "flexible" as const,
        priceRegular: 600000,
        priceZero: 560000,
        priceCreditCard: 670000,
        durationDays: 240,
        classesPerWeek: 6,
        multiBranch: true,
        isTrial: false,
      },
      {
        name: "Sesión de Prueba",
        description: "Sesion de prueba gratuita para conocer El Templo.",
        planCategory: "presencial" as const,
        planTier: "other" as const,
        bookingMode: "flexible" as const,
        priceRegular: 0,
        priceZero: 0,
        priceCreditCard: null,
        durationDays: 1,
        classesPerWeek: 1,
        multiBranch: false,
        isTrial: true,
      },
    ];

    let plansCreated = 0;
    let plansUpdated = 0;

    for (const plan of plansData) {
      const existing = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, plan.name))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(subscriptionPlans).values(plan);
        plansCreated++;
      } else {
        const { name: _name, ...updateData } = plan;
        await db
          .update(subscriptionPlans)
          .set(updateData)
          .where(eq(subscriptionPlans.id, existing[0].id));
        plansUpdated++;
      }
    }
    console.log(
      `Subscription plans: ${plansCreated} created, ${plansUpdated} updated (${plansData.length} total)`,
    );

    // ── Step 4: Schedule Slots ────────────────────────────────────────
    // schedules has no unique constraint, so check by (branchId, activityId, dayOfWeek, startTime).
    console.log("\n--- Seeding schedule slots ---");

    // Fetch physical branch IDs
    const physicalBranches = await db
      .select({ id: branches.id, code: branches.code })
      .from(branches)
      .where(and(eq(branches.isVirtual, false), eq(branches.isActive, true)));

    if (physicalBranches.length === 0) {
      throw new Error("No physical branches found -- cannot seed schedules");
    }

    // Weekday slots: Mon-Fri, 8 sessions per day
    const weekdayTimes = [
      { start: "07:00", end: "08:00" },
      { start: "08:00", end: "09:00" },
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
      { start: "17:00", end: "18:00" },
      { start: "18:00", end: "19:00" },
      { start: "19:00", end: "20:00" },
      { start: "20:00", end: "21:00" },
    ];

    // Saturday slots: ROM classes, 3 sessions
    const saturdayTimes = [
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
      { start: "11:00", end: "12:00" },
    ];

    let schedulesCreated = 0;
    let schedulesSkipped = 0;

    for (const branch of physicalBranches) {
      const allSlots = [
        // Weekday slots (Mon=1 through Fri=5)
        ...Array.from({ length: 5 }, (_, dayIdx) =>
          weekdayTimes.map((time) => ({
            branchId: branch.id,
            activityId,
            dayOfWeek: dayIdx + 1,
            startTime: time.start,
            endTime: time.end,
            isActive: true,
          })),
        ).flat(),
        // Saturday slots (day=6)
        ...saturdayTimes.map((time) => ({
          branchId: branch.id,
          activityId,
          dayOfWeek: 6,
          startTime: time.start,
          endTime: time.end,
          isActive: true,
        })),
      ];

      for (const slot of allSlots) {
        const existing = await db
          .select({ id: schedules.id })
          .from(schedules)
          .where(
            and(
              eq(schedules.branchId, slot.branchId),
              eq(schedules.activityId, slot.activityId),
              eq(schedules.dayOfWeek, slot.dayOfWeek),
              eq(schedules.startTime, slot.startTime),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(schedules).values(slot);
          schedulesCreated++;
        } else {
          schedulesSkipped++;
        }
      }

      const branchSlotCount = weekdayTimes.length * 5 + saturdayTimes.length;
      console.log(`  ${branch.code}: ${branchSlotCount} slots`);
    }
    console.log(
      `Schedule slots: ${schedulesCreated} created, ${schedulesSkipped} already existed (${schedulesCreated + schedulesSkipped} total)`,
    );

    // ── Summary ───────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(50));
    console.log("PRODUCTION SEED SUMMARY");
    console.log("=".repeat(50));
    console.log(
      `  Branches: ${branchesData.length} (${branchesData.filter((b) => !b.isVirtual).length} physical + 1 virtual)`,
    );
    console.log(`  Activity: 1 (Calistenia)`);
    console.log(`  Subscription plans: ${plansData.length}`);
    console.log(
      `  Schedule slots: ${schedulesCreated + schedulesSkipped} (across ${physicalBranches.length} branches)`,
    );
    console.log("=".repeat(50));
    console.log("Production seed complete.");
  } finally {
    await connection.end();
  }
}

// Self-executing when run directly
if (require.main === module) {
  seedProduction()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Production seed failed:", message);
      process.exit(1);
    });
}

export { seedProduction };
