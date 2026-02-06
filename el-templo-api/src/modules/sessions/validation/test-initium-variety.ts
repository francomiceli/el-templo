/**
 * Test Initium exercise variety across different week/day combinations
 */
import 'dotenv/config';
import { SessionGeneratorService } from '../service';
import { createDbConnection } from '../../../db';
import type { BlockPlan } from '../types';

async function testInitiumVariety() {
  const { db, pool } = await createDbConnection();
  const service = new SessionGeneratorService(db);

  console.log('=== Testing Initium Exercise Variety ===\n');

  // Generate sessions for different week/day combinations
  const configs = [
    { week: 10, day: 'lunes' },
    { week: 10, day: 'martes' },
    { week: 10, day: 'miercoles' },
    { week: 11, day: 'lunes' },
    { week: 11, day: 'martes' },
    { week: 12, day: 'lunes' },
  ];

  const seenExercises = new Set<string>();

  for (const config of configs) {
    const session = await service.generateDailySession({
      week: config.week,
      day: config.day,
      levelGroup: 'sigma',
      memberLevel: 'sigma',
    });

    const initiumBlock = session.blocks.find((b: BlockPlan) => b.role === 'INITIUM');
    const exercises = initiumBlock?.exercises.map((e) => e.name) || [];

    exercises.forEach((e) => seenExercises.add(e));

    console.log(`Week ${config.week} ${config.day.padEnd(10)}: ${exercises.join(', ')}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total unique exercises seen: ${seenExercises.size}`);
  console.log(`Exercises: ${[...seenExercises].join(', ')}`);

  await pool.end();
  process.exit(0);
}

testInitiumVariety().catch((e) => {
  console.error(e);
  process.exit(1);
});
