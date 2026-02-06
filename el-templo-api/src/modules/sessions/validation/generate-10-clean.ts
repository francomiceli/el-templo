/**
 * Generate 10 different sessions - clean output for evaluation
 */
import 'dotenv/config';
import { createDbConnection } from '../../../db';
import { SessionGeneratorService } from '../service';

// Suppress pino logs
process.env.LOG_LEVEL = 'silent';

async function generate10Sessions() {
  const { db, pool } = await createDbConnection();
  const service = new SessionGeneratorService(db);

  console.log('═'.repeat(120));
  console.log(' 10 SESSIONS FOR EVALUATION');
  console.log('═'.repeat(120));

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

    console.log('\n' + '═'.repeat(120));
    console.log(` SESSION ${i + 1}: Week ${config.week} | ${config.day.toUpperCase().padEnd(10)} | Level: ${config.levelGroup}`);
    console.log('═'.repeat(120));

    try {
      const session = await service.generateDailySession({
        week: config.week,
        day: config.day,
        levelGroup: config.levelGroup,
        memberLevel: config.levelGroup === 'omega' ? 'omega' : config.levelGroup === 'alfa_delta' ? 'delta' : 'sigma',
      });

      for (const block of session.blocks) {
        console.log('\n┌' + '─'.repeat(118) + '┐');
        console.log(`│ ${block.role.padEnd(12)} │ Route: ${(block.route || 'N/A').padEnd(8)} │ Format: ${(block.format?.name || 'Standard').padEnd(20)} │ Intensity: ${String(block.intensity).padStart(2)}% │ Budget: ${String(block.repsBudget).padStart(3)} │`);
        console.log('├' + '─'.repeat(118) + '┤');

        for (const ex of block.exercises) {
          const metric = ex.contraction === 'ISO' ? `${String(ex.seconds).padStart(2)}s` : `${String(ex.reps).padStart(2)}r`;
          const diff = ex.dificultadLineal ? `D${ex.dificultadLineal}` : 'D?';
          const name = ex.name.substring(0, 35).padEnd(35);
          console.log(`│   ${ex.contraction} │ ${metric} │ Rest:${String(ex.rest).padStart(3)}s │ ${diff} │ ${name} │`);
        }
        console.log('└' + '─'.repeat(118) + '┘');
      }
    } catch (error) {
      console.error(`  ERROR: ${error}`);
    }
  }

  console.log('\n' + '═'.repeat(120));
  console.log(' SUMMARY: Initium Exercise Variety Check');
  console.log('═'.repeat(120));

  // Show unique Initium exercises across sessions
  const initiumExercises = new Map<string, string[]>();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const session = await service.generateDailySession({
      week: config.week,
      day: config.day,
      levelGroup: config.levelGroup,
      memberLevel: config.levelGroup === 'omega' ? 'omega' : config.levelGroup === 'alfa_delta' ? 'delta' : 'sigma',
    });

    const initium = session.blocks.find(b => b.role === 'INITIUM');
    const key = `W${config.week}-${config.day}`;
    initiumExercises.set(key, initium?.exercises.map(e => e.name) || []);
  }

  console.log('\nInitium exercises per session:');
  for (const [key, exercises] of initiumExercises) {
    console.log(`  ${key.padEnd(15)}: ${exercises.join(', ')}`);
  }

  await pool.end();
  process.exit(0);
}

generate10Sessions().catch(e => {
  console.error(e);
  process.exit(1);
});
