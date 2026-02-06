/**
 * Generate 10 different sessions for visual evaluation
 */
import 'dotenv/config';
import { createDbConnection } from '../../../db';
import { SessionGeneratorService } from '../service';

async function generate10Sessions() {
  const { db, pool } = await createDbConnection();
  const service = new SessionGeneratorService(db);

  console.log('='.repeat(100));
  console.log('GENERATING 10 SESSIONS FOR EVALUATION');
  console.log('='.repeat(100));

  // Different week/day combinations for variety
  const configs = [
    { week: 10, day: 'lunes', levelGroup: 'sigma' as const },
    { week: 10, day: 'martes', levelGroup: 'sigma' as const },
    { week: 10, day: 'miercoles', levelGroup: 'sigma' as const },
    { week: 10, day: 'jueves', levelGroup: 'sigma' as const },
    { week: 11, day: 'lunes', levelGroup: 'sigma' as const },
    { week: 11, day: 'martes', levelGroup: 'sigma' as const },
    { week: 12, day: 'lunes', levelGroup: 'omega' as const },
    { week: 12, day: 'martes', levelGroup: 'omega' as const },
    { week: 13, day: 'lunes', levelGroup: 'alfa_delta' as const },
    { week: 13, day: 'viernes', levelGroup: 'sigma' as const },
  ];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];

    console.log('\n' + '='.repeat(100));
    console.log(`SESSION ${i + 1}: Week ${config.week} - ${config.day.toUpperCase()} - Level: ${config.levelGroup}`);
    console.log('='.repeat(100));

    try {
      const session = await service.generateDailySession({
        week: config.week,
        day: config.day,
        levelGroup: config.levelGroup,
        memberLevel: config.levelGroup === 'omega' ? 'omega' : config.levelGroup === 'alfa_delta' ? 'delta' : 'sigma',
      });

      for (const block of session.blocks) {
        console.log('\n' + '-'.repeat(80));
        console.log(`BLOCK: ${block.role}`);
        console.log('-'.repeat(80));
        console.log(`  Route: ${block.route || 'N/A'}`);
        console.log(`  Pattern: ${block.pattern || 'N/A'}`);
        console.log(`  Intensity: ${block.intensity}%`);
        console.log(`  Reps Budget: ${block.repsBudget}`);
        console.log(`  Format: ${block.format?.name || 'Standard'}`);
        console.log('');
        console.log('  EXERCISES:');

        for (const ex of block.exercises) {
          const repsOrSeconds = ex.contraction === 'ISO'
            ? `${ex.seconds}s`
            : `${ex.reps} reps`;
          console.log(`    - ${ex.name}`);
          console.log(`      Contraction: ${ex.contraction} | ${repsOrSeconds} | Rest: ${ex.rest}s | Difficulty: ${ex.dificultadLineal || 'N/A'}`);
          if (ex.notes) {
            console.log(`      Notes: ${ex.notes}`);
          }
        }
      }
    } catch (error) {
      console.error(`  ERROR generating session: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('GENERATION COMPLETE');
  console.log('='.repeat(100));

  await pool.end();
  process.exit(0);
}

generate10Sessions().catch(e => {
  console.error(e);
  process.exit(1);
});
