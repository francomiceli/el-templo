/**
 * Stage 1: Rotator Resolution
 *
 * Resolves the route code for a block by looking up the weekly rotator
 * and mapping the block role to the appropriate route column.
 *
 * Input: BlockContext with week, day, levelGroup, role
 * Output: BlockContextWithRoute (adds route: string)
 */

import { SpomService } from '../../spom/service';
import type { BlockContext, BlockContextWithRoute } from './context';
import { createTraceEvent, appendTrace } from './context';

/**
 * Resolve route code for a block from weekly rotator
 *
 * @param ctx - Current block context
 * @param spomService - SPOM service for data access
 * @returns Context enriched with route code
 * @throws Error if rotator entry not found or route lookup fails
 */
export async function resolveRotator(
  ctx: BlockContext,
  spomService: SpomService
): Promise<BlockContextWithRoute> {
  // Lookup rotator entry for this week/day/levelGroup
  const rotator = await spomService.getWeeklyRotator(
    ctx.week,
    ctx.day,
    ctx.levelGroup
  );

  if (!rotator) {
    throw new Error(
      `No rotator entry found for week=${ctx.week}, day=${ctx.day}, levelGroup=${ctx.levelGroup}`
    );
  }

  // Map block role to rotator column
  let routeId: number | null;
  switch (ctx.role) {
    case 'NUCLEUS':
      routeId = rotator.nucleusRouteId;
      break;
    case 'DEUTEROS_1':
      routeId = rotator.deuteros1RouteId;
      break;
    case 'DEUTEROS_2':
      routeId = rotator.deuteros2RouteId;
      break;
    case 'ATHLOS':
    case 'EPIKOS':
      // Both ATHLOS and EPIKOS use the same route from rotator
      routeId = rotator.athlosRouteId;
      break;
    default:
      throw new Error(`Unknown block role: ${ctx.role}`);
  }

  // DEUTEROS_2 can be null (skip block)
  if (routeId === null) {
    throw new Error(`Route is null for role=${ctx.role} (block should be skipped)`);
  }

  // Convert routeId FK to route code string
  const route = await spomService.getRouteById(routeId);
  if (!route) {
    throw new Error(`Route not found for routeId=${routeId}`);
  }

  const traceEvent = createTraceEvent(ctx, 'ROUTE_RESOLVED', 'INFO', {
    route: route.code,
    routeId: routeId,
    source: 'rotator',
  });

  return {
    ...appendTrace(ctx, traceEvent),
    route: route.code,
  };
}
