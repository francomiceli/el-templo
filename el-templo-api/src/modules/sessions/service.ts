/**
 * Session Generator Service
 *
 * Main entry point for session generation. Generates complete
 * daily sessions with 5 blocks (or 4 if DEUTEROS_2 is null).
 *
 * This service does NOT persist sessions - it only generates them.
 * Persistence is handled by Plan 05-02.
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../db/schema';
import { SpomService } from '../spom/service';
import { runBlockPipeline, createInitialContext } from './pipeline';
import type { LevelGroup, BlockRole, DaySession, BlockPlan, TraceEvent } from './types';

/** All block roles in execution order */
const BLOCK_ROLES: BlockRole[] = [
  'INITIUM',
  'NUCLEUS',
  'DEUTEROS_1',
  'DEUTEROS_2',
  'ATHLOS_EPIKOS',
];

/** Input for session generation */
export interface GenerateSessionInput {
  week: number;
  day: string;
  levelGroup: LevelGroup;
}

/**
 * Session Generator Service
 *
 * Follows existing service pattern from SpomService.
 * Creates complete daily sessions from SPOM tables.
 */
export class SessionGeneratorService {
  private spomService: SpomService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
  }

  /**
   * Generate a complete daily session
   *
   * Creates 5 blocks (INITIUM through ATHLOS_EPIKOS).
   * DEUTEROS_2 is skipped if rotator has null route.
   *
   * @param input - Week, day, and level group
   * @returns Complete DaySession with all blocks
   */
  async generateDailySession(input: GenerateSessionInput): Promise<DaySession> {
    const { week, day, levelGroup } = input;
    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];

    // Check if DEUTEROS_2 should be skipped
    const rotator = await this.spomService.getWeeklyRotator(week, day, levelGroup);
    const skipDeuteros2 = !rotator || rotator.deuteros2RouteId === null;

    // Generate each block in sequence (determinism requires sequential execution)
    for (const role of BLOCK_ROLES) {
      // Skip DEUTEROS_2 if no route assigned
      if (role === 'DEUTEROS_2' && skipDeuteros2) {
        sessionTrace.push({
          ts: new Date().toISOString(),
          severity: 'INFO',
          code: 'BLOCK_SKIPPED',
          where: {
            week,
            day,
            levelGroup,
            blockId: `W${week}-${day}-${levelGroup}-${role}`,
            role,
          },
          decision: {
            reason: 'No route assigned in rotator (deuteros2RouteId is null)',
          },
        });
        continue;
      }

      // Create initial context for this block
      const initialContext = createInitialContext(week, day, levelGroup, role);

      // Run the 7-stage pipeline
      const blockPlan = await runBlockPipeline(
        initialContext,
        this.spomService,
        this.db
      );

      blocks.push(blockPlan);

      // Collect block trace into session trace
      sessionTrace.push({
        ts: new Date().toISOString(),
        severity: 'INFO',
        code: 'BLOCK_COMPLETED',
        where: {
          week,
          day,
          levelGroup,
          blockId: blockPlan.blockId,
          role,
        },
        decision: {
          route: blockPlan.route,
          intensity: blockPlan.intensity,
          format: blockPlan.format.name,
          exerciseCount: blockPlan.exercises.length,
        },
      });
    }

    // Generate session ID
    const dayId = `W${week}-${day}-${levelGroup}`;

    // Final session summary trace
    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: 'INFO',
      code: 'SESSION_GENERATED',
      where: {
        week,
        day,
        levelGroup,
        blockId: dayId,
        role: 'INITIUM', // Placeholder for session-level trace
      },
      decision: {
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
      },
    });

    const daySession: DaySession = {
      dayId,
      week,
      day,
      levelGroup,
      blocks,
      trace: sessionTrace,
    };

    return daySession;
  }
}
