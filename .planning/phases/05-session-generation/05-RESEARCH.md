# Phase 5: Session Generation - Research

**Researched:** 2026-01-24
**Domain:** Deterministic pipeline engines for workout session generation
**Confidence:** HIGH

## Summary

Phase 5 implements a deterministic 9-stage pipeline that generates complete daily training sessions from SPOM tables. The system must be fully reproducible (same inputs = identical outputs), auditable (decision traces), and resilient (graceful degradation via fallback ladders).

The research focused on deterministic algorithm patterns, multi-stage pipeline architectures, structured logging for auditability, and graceful degradation strategies. The existing codebase uses TypeScript with Fastify web framework, Drizzle ORM for database access, and a class-based service pattern.

The standard approach is to build a pure functional pipeline with immutable context objects passed through 9 sequential stages, emit structured JSON traces at each decision point, and use discriminated unions with exhaustive type checking to ensure correctness. Performance is achieved through Drizzle prepared statements and connection pooling, while auditability comes from structured logging with Pino.

**Primary recommendation:** Build the session generator as a pure class-based service with strongly-typed stage functions, use Zod for runtime schema validation of outputs, implement structured trace logging with Pino, and leverage TypeScript's discriminated unions for type-safe error handling and fallback strategies.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9.3 | Type-safe implementation | Already in use, provides compile-time guarantees for determinism |
| Drizzle ORM | 0.45.1 | SPOM table queries | Already in use, provides prepared statements for performance |
| Fastify | 5.7.1 | HTTP framework | Already in use, high-performance, plugin-based |
| Pino | Latest | Structured logging | Industry standard for high-performance JSON logging in Node.js |
| Zod | Latest | Runtime schema validation | TypeScript-first validation for output schemas, type inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/jwt | 10.0.0 | Authentication | Already in use for protected endpoints |
| tsx | 4.21.0 | Development runtime | Already in use for TypeScript execution |
| class-validator | Latest (optional) | DTO validation | Alternative to Zod if preferring decorators |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod | AJV + TypeScript | AJV is faster but Zod has better DX and type inference |
| Pino | Winston | Winston is more flexible but Pino is 5x faster for structured JSON |
| Class-based services | Functional modules | Classes better for stateful pipeline context, matches existing pattern |

**Installation:**
```bash
pnpm add zod pino pino-pretty
```

## Architecture Patterns

### Recommended Project Structure
```
src/modules/sessions/
├── service.ts              # SessionGeneratorService class
├── routes.ts               # Fastify routes for session generation
├── schemas.ts              # Zod schemas for request/response validation
├── types.ts                # TypeScript types and discriminated unions
├── pipeline/
│   ├── context.ts          # BlockContext, DayContext, WeekContext types
│   ├── stage-1-spom.ts     # SPOM resolution stage
│   ├── stage-2-budget.ts   # Budget derivation stage
│   ├── stage-3-scope.ts    # Category scope resolution stage
│   ├── stage-4-contraction.ts  # Contraction mix determination
│   ├── stage-5-format.ts   # Format selection stage
│   ├── stage-6-exercises.ts    # Exercise selection stage
│   ├── stage-7-prescription.ts # Prescription generation stage
│   ├── stage-8-assembly.ts     # Block/Day/Week assembly
│   ├── stage-9-validation.ts   # Final validation stage
│   └── index.ts            # Pipeline orchestrator
├── fallback/
│   ├── types.ts            # FallbackTier, FallbackAction types
│   ├── exercise-fallback.ts    # Exercise selection fallback ladder
│   ├── format-fallback.ts      # Format selection fallback
│   └── scope-fallback.ts       # Scope widening strategies
├── trace/
│   ├── types.ts            # TraceEvent, BlockTrace, WeekTrace types
│   ├── logger.ts           # Pino logger configuration
│   └── emitter.ts          # Trace event emission utilities
└── validators/
    ├── block-validator.ts  # P26 block executability checks
    ├── day-validator.ts    # P37 day coherence checks
    └── week-validator.ts   # P38 week balance checks
```

### Pattern 1: Immutable Pipeline Context
**What:** Each stage receives an immutable context object and returns a new context with additional data
**When to use:** All 9 pipeline stages
**Example:**
```typescript
// Source: Pipeline pattern research + TypeScript best practices
interface BlockContext {
  readonly week: number;
  readonly day: string;
  readonly levelGroup: 'alfa_delta' | 'sigma' | 'omega';
  readonly blockId: string;
  readonly role: 'INITIUM' | 'NUCLEUS' | 'DEUTEROS_1' | 'DEUTEROS_2' | 'ATHLOS_EPIKOS';
  readonly route?: string;
  readonly intensity?: number;
  readonly pattern?: string;
  readonly repsBudget?: number;
  readonly contractionMix?: { CON: number; EXC: number; ISO: number };
  readonly format?: FormatInstance;
  readonly exercises?: Exercise[];
  readonly trace: TraceEvent[];
}

type PipelineStage<In, Out> = (ctx: In) => Promise<Out>;

// Each stage is pure function
async function stage1_resolveSpom(
  ctx: BlockContext
): Promise<BlockContext & { route: string; intensity: number; pattern: string }> {
  const spomRule = await db.getSpomRule(ctx.week, ctx.route);
  return {
    ...ctx,
    route: spomRule.route,
    intensity: spomRule.intensity,
    pattern: spomRule.pattern,
    trace: [...ctx.trace, { stage: 1, code: 'SPOM_RESOLVED', data: spomRule }]
  };
}
```

### Pattern 2: Discriminated Unions for Error Handling
**What:** Use TypeScript discriminated unions to represent success/failure states with exhaustive checking
**When to use:** All fallback and validation logic
**Example:**
```typescript
// Source: TypeScript official docs - Narrowing
type StageResult<T> =
  | { status: 'success'; data: T; trace: TraceEvent[] }
  | { status: 'fallback'; data: T; tier: number; trace: TraceEvent[] }
  | { status: 'error'; code: string; message: string; trace: TraceEvent[] };

function handleResult<T>(result: StageResult<T>): T {
  switch (result.status) {
    case 'success':
      return result.data;
    case 'fallback':
      logger.warn({ tier: result.tier, trace: result.trace }, 'Fallback applied');
      return result.data;
    case 'error':
      throw new SessionGenerationError(result.code, result.message);
    default:
      // Exhaustiveness check - TypeScript ensures all cases handled
      const _exhaustive: never = result;
      throw new Error('Unhandled result type');
  }
}
```

### Pattern 3: Structured Trace Emission
**What:** Emit structured JSON trace events at every decision point for auditability
**When to use:** All stages, all fallback actions, all validations
**Example:**
```typescript
// Source: Pino documentation + system specs Part 5
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

interface TraceEvent {
  ts: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'HARD_ERROR';
  code: string;
  where: {
    week_id: string;
    day_id: string;
    level_group: string;
    block_id: string;
    slot_index?: number;
  };
  decision?: Record<string, unknown>;
  reason?: {
    rule_id: string;
    tie_breakers: string[];
  };
  metrics?: Record<string, number>;
}

function emitTrace(event: TraceEvent): void {
  const logData = {
    trace_event: event,
    where: event.where,
    code: event.code
  };

  switch (event.severity) {
    case 'INFO':
      logger.info(logData, 'Pipeline decision');
      break;
    case 'WARNING':
      logger.warn(logData, 'Pipeline warning');
      break;
    case 'ERROR':
      logger.error(logData, 'Pipeline error');
      break;
    case 'HARD_ERROR':
      logger.fatal(logData, 'Pipeline hard error');
      break;
  }
}
```

### Pattern 4: Fallback Ladder with Tiered Degradation
**What:** Implement graceful degradation through a tier system that progressively relaxes constraints
**When to use:** Exercise selection, format selection, scope resolution
**Example:**
```typescript
// Source: Resilience patterns + system specs Part 5
interface FallbackPolicy {
  max_tier: number;
  relaxation_order: ('scope' | 'difficulty' | 'level_num' | 'contraction' | 'dedup')[];
}

async function resolveWithFallback<T>(
  requirements: Requirements,
  filterFn: (req: Requirements) => Promise<T[]>,
  policy: FallbackPolicy
): Promise<{ data: T[]; tier: number; actions: FallbackAction[] }> {
  let tier = 0;
  let currentReq = requirements;
  const actions: FallbackAction[] = [];

  while (tier <= policy.max_tier) {
    const pool = await filterFn(currentReq);

    if (pool.length > 0) {
      return { data: pool, tier, actions };
    }

    // Apply next relaxation
    const relaxationType = policy.relaxation_order[tier];
    const relaxed = applyRelaxation(currentReq, relaxationType);
    actions.push({ code: `${relaxationType.toUpperCase()}_RELAXED`, tier, from: currentReq, to: relaxed });
    currentReq = relaxed;
    tier++;
  }

  throw new Error('NO_CANDIDATES_AFTER_FALLBACK');
}
```

### Pattern 5: Deterministic Tie-Breaking
**What:** Always provide explicit tie-breaker rules to ensure reproducibility when multiple options exist
**When to use:** Format selection, exercise selection, any multi-candidate decision
**Example:**
```typescript
// Source: System specs Part 5 (determinism requirements)
interface TieBreaker<T> {
  key: keyof T;
  order: 'asc' | 'desc';
}

function selectWithTieBreakers<T extends { id: string | number }>(
  candidates: T[],
  tieBreakers: TieBreaker<T>[]
): T {
  if (candidates.length === 0) {
    throw new Error('NO_CANDIDATES');
  }

  // Sort by tie-breaker cascade
  const sorted = [...candidates].sort((a, b) => {
    for (const breaker of tieBreakers) {
      const aVal = a[breaker.key];
      const bVal = b[breaker.key];
      if (aVal !== bVal) {
        const comparison = aVal < bVal ? -1 : 1;
        return breaker.order === 'asc' ? comparison : -comparison;
      }
    }
    // Final tie-breaker: always use id
    return a.id < b.id ? -1 : 1;
  });

  return sorted[0];
}
```

### Pattern 6: Zod Schema Validation for Outputs
**What:** Define Zod schemas for all output types and validate at runtime
**When to use:** Session generation endpoint responses, stored session data
**Example:**
```typescript
// Source: Zod documentation
import { z } from 'zod';

const ExercisePrescriptionSchema = z.object({
  exerciseId: z.string(),
  contraction: z.enum(['CON', 'EXC', 'ISO']),
  doseRepEquiv: z.number().int().positive(),
  reps: z.number().int().nonnegative(),
  seconds: z.number().int().nonnegative(),
  ladder: z.string().nullable(),
  tempo: z.string().nullable(),
  rest: z.number().int().positive(),
  adjustment: z.string().nullable(),
  notes: z.string().nullable(),
});

const BlockPlanSchema = z.object({
  blockId: z.string(),
  role: z.enum(['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'DEUTEROS_2', 'ATHLOS_EPIKOS']),
  route: z.string(),
  pattern: z.string(),
  intensity: z.number().int().min(0).max(100),
  repsBudget: z.number().int().positive(),
  format: z.object({
    formatId: z.string(),
    params: z.record(z.unknown()),
  }),
  exercises: z.array(ExercisePrescriptionSchema),
  trace: z.array(z.unknown()),
});

const DayPlanSchema = z.object({
  dayId: z.string(),
  levelGroup: z.enum(['alfa_delta', 'sigma', 'omega']),
  blocks: z.array(BlockPlanSchema).length(5),
});

const WeekPlanSchema = z.object({
  weekId: z.number().int().positive(),
  days: z.array(DayPlanSchema),
  engineVersion: z.string(),
  fingerprint: z.string(),
  trace: z.array(z.unknown()),
});

// Type inference from schema
type WeekPlan = z.infer<typeof WeekPlanSchema>;

// Runtime validation
function validateWeekPlan(data: unknown): WeekPlan {
  return WeekPlanSchema.parse(data); // Throws if invalid
}
```

### Anti-Patterns to Avoid
- **Random selection without determinism:** Never use `Math.random()` or shuffle arrays. Always sort by deterministic keys.
- **Mutable context mutation:** Don't modify context objects in place. Always return new objects with spread operator.
- **Silent fallback without traces:** Never apply fallback logic without emitting trace events. All degradation must be auditable.
- **Hash maps for iteration:** Don't iterate over plain objects where key order matters. Use arrays with stable sort.
- **Throwing errors without context:** Don't throw generic errors. Always include block/stage context and emit trace before throwing.
- **Direct database access in pipeline stages:** Inject data lookup functions to keep stages testable and isolated.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON logging | Custom log formatter | Pino | 5x faster than alternatives, industry standard, Fastify integration |
| Schema validation | Manual type checks | Zod | Type inference, composable schemas, clear error messages |
| Deterministic PRNG | Custom seeded random | Not needed (avoid RNG) | Pipeline should be deterministic by design, not random |
| Connection pooling | Manual pool management | Drizzle connection config | Already optimized, battle-tested |
| Prepared statements | String concatenation | Drizzle prepared queries | Prevents SQL injection, better performance |
| Pipeline orchestration | Custom promise chains | Class-based stage methods | Clearer flow, easier testing, matches existing pattern |
| Fallback retry logic | Ad-hoc loops | Tiered fallback ladder pattern | Systematic degradation, auditable, extensible |

**Key insight:** The session generation domain requires determinism and auditability more than raw performance. Use libraries that provide structure (Zod, Pino) rather than building custom solutions. The complexity is in the business logic (9 stages, fallback ladders), not in the infrastructure.

## Common Pitfalls

### Pitfall 1: Non-deterministic Array Iteration
**What goes wrong:** Iterating over database results without sorting leads to different outputs on different runs
**Why it happens:** Database row order is not guaranteed. JavaScript object property iteration order changed over versions.
**How to avoid:** Always sort arrays by deterministic keys (id, code) before iteration. Use `sort()` with explicit comparator.
**Warning signs:** Tests pass sometimes, fail other times. Session output differs on repeated calls with same inputs.

### Pitfall 2: Floating Point Budget Allocation
**What goes wrong:** Using floating point math for reps budget allocation leads to rounding errors and non-determinism
**Why it happens:** JavaScript floating point arithmetic is imprecise. `0.1 + 0.2 !== 0.3`
**How to avoid:** Keep all budget values as integers. Use integer division with explicit remainder handling.
**Warning signs:** Budget sum doesn't equal total. Occasional off-by-one errors in exercise counts.

### Pitfall 3: Unhandled Fallback Edge Cases
**What goes wrong:** Pipeline fails hard when it should degrade gracefully
**Why it happens:** Not all relaxation paths are implemented. Fallback ladder missing tiers.
**How to avoid:** Define max_tier and all relaxation types upfront. Test with intentionally sparse exercise pools.
**Warning signs:** `NO_CANDIDATES` errors in production. Works for some levels, fails for others.

### Pitfall 4: Lost Trace Context
**What goes wrong:** Trace events don't have enough context to debug issues post-mortem
**Why it happens:** Emitting traces without block_id, slot_index, or decision details
**How to avoid:** Every trace event must include `where` object with full context path
**Warning signs:** Can't answer "why did this happen?" from logs. Need to re-run to debug.

### Pitfall 5: Mutation in Pipeline Stages
**What goes wrong:** Context object gets mutated, causing side effects and non-determinism
**Why it happens:** Forgetting to use spread operator, modifying arrays in place
**How to avoid:** Use TypeScript `readonly` modifiers. Return new objects from every stage.
**Warning signs:** Tests interfere with each other. Context state leaks between calls.

### Pitfall 6: Missing Exhaustiveness Checks
**What goes wrong:** New discriminated union cases added but not handled in switch statements
**Why it happens:** TypeScript doesn't enforce exhaustiveness by default
**How to avoid:** Add `default: const _exhaustive: never = value; throw new Error()` to all switches
**Warning signs:** Runtime errors when new types added. Uncaught edge cases in production.

### Pitfall 7: Synchronous Database Queries in Loops
**What goes wrong:** Pipeline becomes slow due to sequential database queries
**Why it happens:** Awaiting queries inside loops instead of batching
**How to avoid:** Use `Promise.all()` for parallel queries. Preload all data needed for a stage.
**Warning signs:** Session generation takes >5 seconds. Database connection pool exhausted.

### Pitfall 8: Invalid JSON Schema at Runtime
**What goes wrong:** Generated session fails validation after complex pipeline execution
**Why it happens:** Assumptions about data structure don't hold after fallbacks
**How to avoid:** Validate with Zod at stage boundaries, not just at the end
**Warning signs:** Errors after hours of development. "Property X is undefined" in production.

## Code Examples

Verified patterns from official sources:

### Drizzle Prepared Statement Pattern
```typescript
// Source: https://orm.drizzle.team/docs/perf-queries
import { eq, and } from 'drizzle-orm';

// Prepared statement for frequent SPOM lookups
const preparedSpomLookup = db
  .select()
  .from(schema.spomRules)
  .where(and(
    eq(schema.spomRules.week, placeholder('week')),
    eq(schema.spomRules.routeId, placeholder('routeId'))
  ))
  .prepare();

// Execute multiple times efficiently
const rule1 = await preparedSpomLookup.execute({ week: 19, routeId: 5 });
const rule2 = await preparedSpomLookup.execute({ week: 19, routeId: 6 });
```

### Pino Structured Logging Setup
```typescript
// Source: https://signoz.io/guides/pino-logger/
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization'], // Security: redact sensitive data
});

// Child logger with context
const blockLogger = logger.child({
  blockId: 'W19-Mon-Sigma-B2',
  stage: 6
});

blockLogger.info({ poolSize: 12, tier: 2 }, 'Exercise pool resolved with fallback');
```

### Zod Schema Validation with Type Inference
```typescript
// Source: https://zod.dev/
import { z } from 'zod';

const SessionRequestSchema = z.object({
  memberId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  levelGroup: z.enum(['alfa_delta', 'sigma', 'omega']),
});

type SessionRequest = z.infer<typeof SessionRequestSchema>;

// Fastify route with validation
fastify.post<{ Body: SessionRequest }>('/sessions/generate', {
  onRequest: [fastify.authenticate],
  schema: {
    body: SessionRequestSchema,
  },
}, async (request, reply) => {
  // request.body is typed as SessionRequest
  const session = await sessionService.generateDailySession(request.body);
  return WeekPlanSchema.parse(session); // Runtime validation of output
});
```

### Discriminated Union Pattern
```typescript
// Source: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
type FallbackResult<T> =
  | { type: 'exact_match'; data: T[]; tier: 0 }
  | { type: 'scope_widened'; data: T[]; tier: number; originalScope: string; newScope: string }
  | { type: 'difficulty_relaxed'; data: T[]; tier: number; originalDiff: number; newDiff: number }
  | { type: 'no_candidates'; tier: number; attempts: FallbackAction[] };

function processExerciseResult(result: FallbackResult<Exercise>): Exercise[] {
  switch (result.type) {
    case 'exact_match':
      return result.data;
    case 'scope_widened':
      logger.warn({ originalScope: result.originalScope, newScope: result.newScope }, 'Scope widened');
      return result.data;
    case 'difficulty_relaxed':
      logger.warn({ originalDiff: result.originalDiff, newDiff: result.newDiff }, 'Difficulty relaxed');
      return result.data;
    case 'no_candidates':
      throw new SessionGenerationError('NO_EXERCISES', `Failed after ${result.tier} fallback tiers`);
    default:
      const _exhaustive: never = result;
      throw new Error('Unhandled result type');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class Validator decorators | Zod schemas | 2024-2025 | Better type inference, composable schemas, tree-shakeable |
| Winston logging | Pino logging | 2023-2024 | 5x performance improvement, better async handling |
| Manual SQL queries | Drizzle ORM | 2023-2024 | Type safety, prepared statements, migrations |
| Type-only validation | Runtime validation with Zod | 2024-2025 | Catch schema mismatches at runtime, safer APIs |
| Monolithic pipeline function | Stage-based pipeline pattern | Current | Better testability, clearer trace points |

**Deprecated/outdated:**
- **TypeORM**: Drizzle is now standard for new TypeScript projects (lighter, faster, better type inference)
- **Console.log debugging**: Structured logging with Pino is standard for production systems
- **Manual promise chains**: Async/await with proper error boundaries is clearer

## Open Questions

Things that couldn't be fully resolved:

1. **Session storage schema design**
   - What we know: Sessions need to be stored after generation for retrieval
   - What's unclear: Optimal denormalization strategy (store full JSON vs references), retention policy
   - Recommendation: Research Phase 5 sub-plan 05-02 will define storage schema. Default to storing full session JSON with week/day/level_group indexes.

2. **Concurrent session generation**
   - What we know: Multiple users might request sessions simultaneously
   - What's unclear: Whether to cache generated sessions or regenerate per request
   - Recommendation: Start with regeneration (deterministic, so safe). Add caching in later phase if needed.

3. **Engine configuration versioning**
   - What we know: Pipeline behavior controlled by EngineConfig object
   - What's unclear: How to version config changes and handle migrations
   - Recommendation: Include engine_version string in all outputs. Store config as JSON in database with version tracking.

4. **Trace retention and querying**
   - What we know: Traces should be emitted for all decisions
   - What's unclear: Where to store traces (database vs log files), how long to retain, how to query
   - Recommendation: Start with Pino file logging. Consider dedicated observability platform (DataDog, New Relic) for production.

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM Performance Queries](https://orm.drizzle.team/docs/perf-queries) - Prepared statements, connection pooling
- [Drizzle ORM Benchmarks](https://orm.drizzle.team/benchmarks) - Performance characteristics
- [TypeScript Narrowing Documentation](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - Type guards, discriminated unions
- [Zod Official Documentation](https://zod.dev/) - Schema validation, type inference
- [Pino Logger Complete Guide 2026](https://signoz.io/guides/pino-logger/) - Structured logging best practices
- System specification files (Part 5 - Motor y Tests) - Pipeline stages, trace schema, determinism requirements

### Secondary (MEDIUM confidence)
- [The Pipeline Pattern: Streamlining Data Processing](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn) - Multi-stage processing patterns
- [Mastering Structured Logging with Pino](https://www.tupescript.com/posts/mastering-structured-logging-in-typescript-with-pino-for-enhanced-application-monitoring) - Pino TypeScript integration
- [Comparing Schema Validation Libraries: AJV, Joi, Yup, and Zod](https://www.bitovi.com/blog/comparing-schema-validation-libraries-ajv-joi-yup-and-zod) - Validation library tradeoffs
- [Drizzle ORM PostgreSQL Best Practices 2025](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) - Query optimization patterns
- [Graceful Degradation: Handling Errors Without Disrupting User Experience](https://medium.com/@satyendra.jaiswal/graceful-degradation-handling-errors-without-disrupting-user-experience-fd4947a24011) - Fallback strategies
- [Fallback Mechanism Pattern](https://softwarepatternslexicon.com/machine-learning/model-maintenance-patterns/degradation-handling/fallback-mechanism/) - Resilience patterns

### Tertiary (LOW confidence)
- [TypeScript Pipeline Library](https://saniyathossain.medium.com/unleashing-typescripts-pipeline-library-f3942594ff9d) - Pipeline composition patterns (unverified)
- [Deterministic.js](https://deterministic.js.org/) - Deterministic execution patterns (may not fit Node.js use case)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing codebase already uses TypeScript, Fastify, Drizzle. Pino and Zod are industry standards verified through multiple sources.
- Architecture: HIGH - Pipeline pattern extensively documented in system specs and verified through official TypeScript/design pattern resources.
- Pitfalls: HIGH - Based on system specs requirements (determinism, auditability) and standard TypeScript/database pitfalls from official documentation.

**Research date:** 2026-01-24
**Valid until:** 2026-03-24 (60 days - stable technologies, but TypeScript/Drizzle ecosystem evolves)
