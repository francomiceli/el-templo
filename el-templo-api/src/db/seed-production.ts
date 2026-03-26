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

// ── Types ──────────────────────────────────────────────────────────────
interface TimeSlot {
  start: string;
  end: string;
}

interface BranchScheduleConfig {
  weekdayTimes: TimeSlot[];
  saturdayTimes: TimeSlot[];
}

/**
 * Production seed script.
 *
 * Seeds OPERATIONAL data only (branches, activities, subscription plans, schedules).
 * - Does NOT create or delete users (production has real users).
 * - Does NOT seed SPOM data (production already has it from initial setup).
 * - Idempotent: checks for existing records before inserting, updates if needed.
 * - Safe to re-run multiple times.
 */
async function seedProduction() {
  console.info("Production seed starting...");
  console.info(`Target database: ${process.env.DB_NAME || "eltemplo"}\n`);

  const { db, connection } = await createSingleConnection();

  try {
    // ── Step 1: Branches ──────────────────────────────────────────────
    // branches.code is UNIQUE, so onDuplicateKeyUpdate works correctly here.
    console.info("--- Seeding branches ---");

    const branchesData = [
      {
        name: "El Templo Constitucion",
        code: "CONST",
        address: "Av. Constitucion 6745, Mar del Plata",
        googleMapsUrl: "https://maps.app.goo.gl/vi9c8ErtHr7RpQxD6",
        maxCapacity: 22,
        isVirtual: false,
      },
      {
        name: "El Templo Jujuy",
        code: "JUJUY",
        address: "Jujuy 3761, Mar del Plata",
        googleMapsUrl: "https://maps.app.goo.gl/EFEVhYhphKKaZqF5A",
        maxCapacity: 12,
        isVirtual: false,
      },
      {
        name: "El Templo Alem",
        code: "ALEM",
        address: "Alem 3958, Mar del Plata",
        googleMapsUrl: "https://maps.app.goo.gl/KiyqJQJYG1LbUsAL6",
        maxCapacity: 12,
        isVirtual: false,
      },
      {
        name: "El Templo Moreno",
        code: "MORENO",
        address: "Moreno 3751, Mar del Plata",
        googleMapsUrl: "https://maps.app.goo.gl/aY1SbjKH9DQRNsqr7",
        maxCapacity: 22,
        isVirtual: false,
      },
      {
        name: "El Templo Mogotes",
        code: "MOGOTES",
        address: "Mario Bravo 618, Mar del Plata",
        googleMapsUrl: "https://maps.app.goo.gl/qMQxrhVxVnKMNxbN7",
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
            address: sql`VALUES(address)`,
            googleMapsUrl: sql`VALUES(google_maps_url)`,
            maxCapacity: sql`VALUES(max_capacity)`,
            isVirtual: sql`VALUES(is_virtual)`,
          },
        });
    }
    console.info(`Upserted ${branchesData.length} branches`);

    // ── Step 2: Activities ────────────────────────────────────────────
    // activities has no unique constraint on name, so check-then-insert.
    console.info("\n--- Seeding activities ---");

    const activitiesData = [
      { name: "Sesion Grupal", description: "Sesion de calistenia grupal" },
      {
        name: "Calisthenics ROM",
        description: "Sesion de movilidad y rango de movimiento (sabados)",
      },
    ];

    for (const activityData of activitiesData) {
      const existing = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.name, activityData.name))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(activities).values({ ...activityData, isActive: true });
        console.info(`Created activity: ${activityData.name}`);
      } else {
        await db
          .update(activities)
          .set({ isActive: true, description: activityData.description })
          .where(eq(activities.name, activityData.name));
        console.info(
          `Activity already exists: ${activityData.name} (ensured active)`,
        );
      }
    }

    // ── Step 3: Fetch activity IDs ────────────────────────────────────
    // Both IDs fetched BEFORE schedule loop. Saturday slots use romActivityId,
    // weekday slots use sesionGrupalId. Mixing them would silently create wrong schedules.
    const [sesionGrupalRow] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "Sesion Grupal"))
      .limit(1);

    if (!sesionGrupalRow) {
      throw new Error("Failed to find Sesion Grupal activity after insert");
    }
    const sesionGrupalId = sesionGrupalRow.id;

    const [romRow] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "Calisthenics ROM"))
      .limit(1);

    if (!romRow) {
      throw new Error("Failed to find Calisthenics ROM activity after insert");
    }
    const romActivityId = romRow.id;

    // ── Step 4: Subscription Plans ────────────────────────────────────
    // subscription_plans has no unique constraint on name, so check-then-insert/update.
    console.info("\n--- Seeding subscription plans ---");

    const plansData = [
      {
        name: "Flex",
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
        name: "Sesion de Prueba",
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
    console.info(
      `Subscription plans: ${plansCreated} created, ${plansUpdated} updated (${plansData.length} total)`,
    );

    // ── Step 5: Schedule Slots ────────────────────────────────────────
    // Per-branch schedules from business-data.md (Paso 41).
    // schedules has no unique constraint, so check by (branchId, activityId, dayOfWeek, startTime).
    console.info("\n--- Seeding schedule slots ---");

    // Fetch physical branch IDs
    const physicalBranches = await db
      .select({ id: branches.id, code: branches.code })
      .from(branches)
      .where(and(eq(branches.isVirtual, false), eq(branches.isActive, true)));

    if (physicalBranches.length === 0) {
      throw new Error("No physical branches found -- cannot seed schedules");
    }

    // Per-branch schedule configuration matching real business data (Paso 41)
    const branchSchedules: Record<string, BranchScheduleConfig> = {
      // Constitucion: 7 weekday slots (no 10:00), NO Saturdays
      CONST: {
        weekdayTimes: [
          { start: "07:00", end: "08:00" },
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "17:00", end: "18:00" },
          { start: "18:00", end: "19:00" },
          { start: "19:00", end: "20:00" },
          { start: "20:00", end: "21:00" },
        ],
        saturdayTimes: [],
      },
      // Jujuy: 8 weekday slots, NO Saturdays
      JUJUY: {
        weekdayTimes: [
          { start: "07:00", end: "08:00" },
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "17:00", end: "18:00" },
          { start: "18:00", end: "19:00" },
          { start: "19:00", end: "20:00" },
          { start: "20:00", end: "21:00" },
        ],
        saturdayTimes: [],
      },
      // Moreno: 8 weekday slots + 4 Saturday ROM slots
      MORENO: {
        weekdayTimes: [
          { start: "07:00", end: "08:00" },
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "17:00", end: "18:00" },
          { start: "18:00", end: "19:00" },
          { start: "19:00", end: "20:00" },
          { start: "20:00", end: "21:00" },
        ],
        saturdayTimes: [
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "11:00", end: "12:00" },
        ],
      },
      // Alem: 8 weekday slots + 4 Saturday ROM slots
      ALEM: {
        weekdayTimes: [
          { start: "07:00", end: "08:00" },
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "17:00", end: "18:00" },
          { start: "18:00", end: "19:00" },
          { start: "19:00", end: "20:00" },
          { start: "20:00", end: "21:00" },
        ],
        saturdayTimes: [
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "11:00", end: "12:00" },
        ],
      },
      // Mogotes (Mario Bravo): 8 weekday slots, NO Saturdays
      MOGOTES: {
        weekdayTimes: [
          { start: "07:00", end: "08:00" },
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" },
          { start: "17:00", end: "18:00" },
          { start: "18:00", end: "19:00" },
          { start: "19:00", end: "20:00" },
          { start: "20:00", end: "21:00" },
        ],
        saturdayTimes: [],
      },
    };

    let schedulesCreated = 0;
    let schedulesSkipped = 0;

    for (const branch of physicalBranches) {
      const scheduleConfig = branchSchedules[branch.code];
      if (!scheduleConfig) {
        console.info(`  ${branch.code}: no schedule config found, skipping`);
        continue;
      }

      const allSlots: Array<{
        branchId: number;
        activityId: number;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }> = [];

      // Weekday slots (Mon=1 through Fri=5) -- use sesionGrupalId
      for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
        for (const time of scheduleConfig.weekdayTimes) {
          allSlots.push({
            branchId: branch.id,
            activityId: sesionGrupalId,
            dayOfWeek,
            startTime: time.start,
            endTime: time.end,
            isActive: true,
          });
        }
      }

      // Saturday slots (day=6) -- use romActivityId (Calisthenics ROM)
      for (const time of scheduleConfig.saturdayTimes) {
        allSlots.push({
          branchId: branch.id,
          activityId: romActivityId,
          dayOfWeek: 6,
          startTime: time.start,
          endTime: time.end,
          isActive: true,
        });
      }

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

      const branchSlotCount =
        scheduleConfig.weekdayTimes.length * 5 +
        scheduleConfig.saturdayTimes.length;
      console.info(`  ${branch.code}: ${branchSlotCount} slots`);
    }
    console.info(
      `Schedule slots: ${schedulesCreated} created, ${schedulesSkipped} already existed (${schedulesCreated + schedulesSkipped} total)`,
    );

    // ── Summary ───────────────────────────────────────────────────────
    console.info("\n" + "=".repeat(50));
    console.info("PRODUCTION SEED SUMMARY");
    console.info("=".repeat(50));
    console.info(
      `  Branches: ${branchesData.length} (${branchesData.filter((b) => !b.isVirtual).length} physical + 1 virtual)`,
    );
    console.info(
      `  Activities: ${activitiesData.length} (Sesion Grupal + Calisthenics ROM)`,
    );
    console.info(`  Subscription plans: ${plansData.length}`);
    console.info(
      `  Schedule slots: ${schedulesCreated + schedulesSkipped} (across ${physicalBranches.length} branches)`,
    );
    console.info("=".repeat(50));
    console.info("Production seed complete.");
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
