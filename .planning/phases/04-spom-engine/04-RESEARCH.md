# Phase 4: SPOM Engine - Research

**Researched:** 2026-01-23
**Domain:** Database schema design, CSV import, periodization rules engine
**Confidence:** HIGH

## Summary

Phase 4 implements the SPOM (Sistema de Planificación de Entrenamiento) engine by importing large reference datasets (~4,500 rows total) and establishing deterministic lookup functions. The technical challenge is data migration architecture, not runtime complexity.

The standard approach is:
1. **Separate seed script** (not migrations) using Drizzle's insert API with transaction batching
2. **csv-parse with streaming** for memory-efficient CSV processing (~1870 exercise rows)
3. **Composite indexes** on multi-column lookup patterns (week+route, intensity+total_exercises)
4. **Single-row config table** with CHECK constraint for gym-wide SPOM week

**Primary recommendation:** Use TypeScript seed script with csv-parse streaming API, batch inserts in transactions (1000 rows/batch), and create composite indexes on all multi-column query patterns before seeding data.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| csv-parse | ^5.6.0 | CSV file parsing | Part of node-csv ecosystem, implements Node.js stream API, handles large files efficiently |
| drizzle-orm | 0.45.1 | Database ORM and migrations | Already in stack, supports batch inserts and transactions |
| mysql2 | 3.16.1 | MySQL driver | Already in stack, focus on performance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (built-in) | Node.js | File streaming | Reading CSV files with createReadStream |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| csv-parse | papaparse | Papaparse is faster on quoted CSVs but csv-parse integrates better with Node.js streams and has 1.4M weekly downloads vs 700k |
| csv-parse | fast-csv | Similar performance but csv-parse has better TypeScript support and more active maintenance |
| Seed script | Migration seeding | Migrations should only contain schema DDL; data seeding belongs in separate scripts for re-runnability |

**Installation:**
```bash
pnpm add csv-parse
```

## Architecture Patterns

### Recommended Project Structure
```
el-templo-api/src/
├── db/
│   ├── schema/
│   │   ├── routes.ts           # Route reference table
│   │   ├── spom-rules.ts       # SPOM periodization rules
│   │   ├── intensity-rules.ts  # Intensity mappings
│   │   ├── contraction-rules.ts # Contraction distribution
│   │   ├── weekly-rotator.ts   # Block assignments by week/day/level
│   │   ├── formats.ts          # Format definitions
│   │   ├── format-compatibility.ts # Compatibility matrix
│   │   ├── exercises.ts        # Exercise database
│   │   └── spom-config.ts      # Current SPOM week (singleton)
│   ├── migrations/             # Generated SQL migrations
│   ├── seed.ts                 # User/branch seeding (existing)
│   └── seed-spom.ts            # SPOM data seeding (NEW)
├── modules/
│   └── spom/
│       ├── routes.ts           # GET /spom/week, PUT /spom/week
│       ├── schemas.ts          # Validation schemas
│       └── service.ts          # Business logic for SPOM queries
```

### Pattern 1: Composite Index for Multi-Column Lookups

**What:** Create composite indexes on columns frequently queried together
**When to use:** Any table with multi-column WHERE clauses (week+route, intensity+total_exercises, format+block+level+intensity)

**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/indexes-constraints
import { mysqlTable, int, varchar, index } from 'drizzle-orm/mysql-core';

export const spomRules = mysqlTable('spom_rules', {
  id: int('id').primaryKey().autoincrement(),
  week: int('week').notNull(),
  routeId: int('route_id').notNull(),
  intensity: int('intensity').notNull(),
  wave: varchar('wave', { length: 50 }).notNull(),
  pattern: varchar('pattern', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
}, (table) => [
  // Composite index for (week, route_id) lookups - LEFT to RIGHT selectivity
  index('week_route_idx').on(table.week, table.routeId),
  // Foreign key column index
  index('route_idx').on(table.routeId),
]);
```

**Key principle:** Order matters! Put high-selectivity columns (unique values) first. Week (1-52) before route (PL/FL/SQ/HL) because week changes more frequently in queries.

### Pattern 2: Single-Row Config Table with CHECK Constraint

**What:** Enforce exactly one row for global configuration (gym-wide SPOM week)
**When to use:** System-wide settings where multiple rows would cause inconsistency

**Example:**
```typescript
// Source: https://www.w3tutorials.net/blog/how-to-allow-only-one-row-for-a-table/
import { mysqlTable, int, timestamp, check, sql } from 'drizzle-orm/mysql-core';

export const spomConfig = mysqlTable('spom_config', {
  id: int('id').primaryKey().default(1),
  currentWeek: int('current_week').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  check('single_row_check', sql`${table.id} = 1`),
]);
```

**Application pattern:** Always use `UPDATE` after initial `INSERT`, never insert new rows:
```typescript
// Initialize (one-time)
await db.insert(spomConfig).values({ id: 1, currentWeek: 1 });

// Update (ongoing)
await db.update(spomConfig)
  .set({ currentWeek: newWeek })
  .where(eq(spomConfig.id, 1));
```

### Pattern 3: CSV Streaming with Batch Insert

**What:** Stream-parse CSV files and batch insert in transactions
**When to use:** Large datasets (>1000 rows) that don't fit in memory

**Example:**
```typescript
// Source: https://dev.to/isalevine/parsing-csv-files-in-node-js-with-fs-createreadstream-and-csv-parser-koi
import { parse } from 'csv-parse';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/mysql2';

async function seedExercises(db: MySqlDatabase) {
  const filepath = './docs/[Planificaciones] - Base de Datos - Ejercicios.csv';
  const batchSize = 1000;
  let batch: ExerciseInsert[] = [];

  const parser = fs
    .createReadStream(filepath)
    .pipe(parse({
      columns: true,           // Parse header row as keys
      skip_empty_lines: true,  // Ignore blank rows
      trim: true,              // Remove whitespace
      relax_column_count: true // Allow inconsistent column counts
    }));

  for await (const row of parser) {
    batch.push({
      pattern: row['PATRON PRINCIPAL'],
      category: row['CATEGORIA PRINCIPAL'],
      exercise: row['Ejercicio'],
      position: row['Posicion'],
      effort: row['Esfuerzo'],
      level: row['Nivel'],
      difficulty: parseInt(row['Dificultad Relativa']),
      route: row['Ruta'],
    });

    if (batch.length >= batchSize) {
      await db.insert(exercises).values(batch);
      console.log(`Inserted ${batch.length} exercises`);
      batch = [];
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    await db.insert(exercises).values(batch);
    console.log(`Inserted ${batch.length} exercises`);
  }
}
```

**Memory efficiency:** Streaming processes one row at a time (~50KB buffer), batch inserts reduce network round trips (1 call per 1000 rows vs 1870 calls).

### Pattern 4: Transaction-Wrapped Seeding

**What:** Wrap all seeding operations in a transaction for atomicity
**When to use:** Always for seed scripts - either all data succeeds or none does

**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/transactions
async function seedSPOM() {
  await db.transaction(async (tx) => {
    console.log('Seeding routes...');
    await seedRoutes(tx);

    console.log('Seeding SPOM rules...');
    await seedSpomRules(tx);

    console.log('Seeding exercises...');
    await seedExercises(tx);

    console.log('Initializing SPOM config...');
    await tx.insert(spomConfig).values({ id: 1, currentWeek: 1 });
  }, {
    isolationLevel: 'read committed',
    accessMode: 'read write',
  });
}
```

**Rollback behavior:** If any step fails, all changes are reverted. MySQL supports nested transactions via savepoints.

### Pattern 5: Wide Table with Nullable Columns for Format Params

**What:** Store format-specific parameters in nullable columns rather than JSON
**When to use:** Fixed set of known parameters (not infinite variety)

**Example:**
```typescript
import { mysqlTable, int, varchar, mysqlEnum } from 'drizzle-orm/mysql-core';

export const formats = mysqlTable('formats', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull(),
  blockType: mysqlEnum('block_type', ['nucleus', 'deuteros1', 'deuteros2', 'plethora']).notNull(),
  type: mysqlEnum('type', ['volume-based', 'intensity-based', 'time-based']),

  // Nullable format-specific params
  sets: int('sets'),
  reps: int('reps'),
  duration: int('duration'), // seconds
  rest: int('rest'),         // seconds
  tempo: varchar('tempo', { length: 20 }), // e.g., "3-1-1-1"
});
```

**Tradeoff vs JSON:** Wide table = strong typing + easy querying + NULL for unused columns. JSON = flexible schema + requires JSON functions to query. For known parameters (sets/reps/duration), wide table wins.

### Anti-Patterns to Avoid

- **Embedding data in migrations:** Migrations should only contain DDL (CREATE/ALTER TABLE). Data seeding in migrations makes them non-idempotent and hard to maintain.
- **Loading entire CSV into memory:** `fs.readFileSync()` + array processing will crash on large files. Always use streams.
- **Individual inserts in loops:** 1870 INSERT statements = 1870 network round trips. Batch to 1000 rows per insert.
- **No indexes before seeding:** Creating indexes after inserting millions of rows is slow. Define indexes in schema before first seed.
- **JSON for known structure:** If you know the parameters (sets, reps, duration), use typed columns. JSON is for unknown/variable structure.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | String splitting, regex, manual quote handling | csv-parse | Handles edge cases: quoted commas, multiline fields, escaping, BOM, encoding |
| Batch inserts | Loop with await insert() | Drizzle's .values([array]) | Single SQL statement reduces network overhead 1000x |
| Stream processing | Read entire file, process array | fs.createReadStream + pipe | Memory stays constant regardless of file size |
| Transaction management | Manual BEGIN/COMMIT/ROLLBACK | Drizzle's db.transaction() | Handles nested transactions (savepoints), automatic rollback on error |
| Single-row enforcement | Application logic only | CHECK constraint + DEFAULT | Database enforces constraint even if app bypassed |

**Key insight:** CSV parsing seems trivial until you encounter quoted fields with commas, multiline values, or encoding issues. csv-parse handles all edge cases from the CSV RFC 4180 spec.

## Common Pitfalls

### Pitfall 1: Foreign Key Order in Seeding

**What goes wrong:** Attempting to insert spom_rules before routes table is populated
**Why it happens:** Foreign key constraints prevent orphaned references
**How to avoid:** Seed in dependency order: 1) routes, 2) intensity_rules, 3) spom_rules (references routes), 4) weekly_rotator (references routes), 5) formats, 6) format_compatibility (references formats), 7) exercises, 8) spom_config
**Warning signs:** `Error 1452 (23000): Cannot add or update a child row: a foreign key constraint fails`

### Pitfall 2: CSV Header Column Name Mismatch

**What goes wrong:** CSV headers have special characters, spaces, or Spanish names; TypeScript expects snake_case
**Why it happens:** CSV files from Excel use human-readable headers like "Patrón Principal" instead of "pattern"
**How to avoid:** Map CSV columns to database columns explicitly:
```typescript
const row = {
  pattern: csvRow['PATRON PRINCIPAL'],
  category: csvRow['CATEGORIA PRINCIPAL'],
  // ...
};
```
**Warning signs:** TypeScript errors about missing properties, or NULL values in database despite CSV having data

### Pitfall 3: JSON File vs CSV Parsing

**What goes wrong:** Contracción.txt is JSON format but treated like CSV
**Why it happens:** Mixed data sources - some CSV, one JSON
**How to avoid:** Check file extension and use appropriate parser:
```typescript
// For Contracción.txt (JSON)
const contractionData = JSON.parse(fs.readFileSync('./docs/[Planificaciones] - Base de Datos - Contracción.txt', 'utf-8'));
await db.insert(contractionRules).values(contractionData);

// For SPOM.csv (CSV)
const parser = fs.createReadStream('./docs/[Planificaciones] - Base de Datos - SPOM.csv')
  .pipe(parse({ columns: true }));
```
**Warning signs:** Parse errors like "Unexpected token" when trying to parse JSON with csv-parse

### Pitfall 4: Composite Index Column Order

**What goes wrong:** Creating index on (route_id, week) when queries are WHERE week = ? AND route_id = ?
**Why it happens:** Not understanding MySQL's leftmost prefix rule
**How to avoid:** Index columns must match query order from left to right. Query filters by week first? Week must be first column in index. High selectivity (unique values) should come first.
**Warning signs:** EXPLAIN shows "Full table scan" despite index existing

### Pitfall 5: Forgotten SPOM Week Initialization

**What goes wrong:** Application queries spom_config but table is empty
**Why it happens:** Schema creates table but doesn't insert initial row
**How to avoid:** Always insert initial row in seed script:
```typescript
await tx.insert(spomConfig).values({ id: 1, currentWeek: 1 })
  .onDuplicateKeyUpdate({ set: { id: sql`id` } }); // No-op if exists
```
**Warning signs:** "Empty result set" when querying current SPOM week

## Code Examples

Verified patterns from official sources:

### Drizzle Enum Column with Foreign Key
```typescript
// Source: https://orm.drizzle.team/docs/column-types/mysql
import { mysqlTable, int, varchar, mysqlEnum, timestamp } from 'drizzle-orm/mysql-core';

export const routes = mysqlTable('routes', {
  id: int('id').primaryKey().autoincrement(),
  code: varchar('code', { length: 10 }).notNull().unique(), // 'PL', 'FL', 'SQ', 'HL'
  displayName: varchar('display_name', { length: 100 }).notNull(),
});

export const weeklyRotator = mysqlTable('weekly_rotator', {
  id: int('id').primaryKey().autoincrement(),
  week: int('week').notNull(),
  day: mysqlEnum('day', ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']).notNull(),
  levelGroup: mysqlEnum('level_group', ['alfa_delta', 'sigma', 'omega']).notNull(),
  nucleusRouteId: int('nucleus_route_id').notNull().references(() => routes.id),
  deuteros1RouteId: int('deuteros1_route_id').notNull().references(() => routes.id),
  deuteros2RouteId: int('deuteros2_route_id').references(() => routes.id), // Nullable
}, (table) => [
  index('week_day_level_idx').on(table.week, table.day, table.levelGroup),
  index('nucleus_route_idx').on(table.nucleusRouteId),
]);
```

### Batch Insert with Transaction
```typescript
// Source: https://orm.drizzle.team/docs/transactions
async function seedWithBatching(db: MySqlDatabase, data: any[], batchSize = 1000) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await tx.insert(targetTable).values(batch);
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows`);
    }
  }, {
    isolationLevel: 'read committed',
  });
}
```

### Complex WHERE with Multiple Conditions
```typescript
// Source: https://orm.drizzle.team/docs/operators
import { and, eq, gte, inArray } from 'drizzle-orm';

// Query: Get exercises for route='FL', contraction IN ('CON', 'EXC'), level='delta', difficulty >= 2
const exercises = await db.select()
  .from(exercisesTable)
  .where(
    and(
      eq(exercisesTable.route, 'FL'),
      inArray(exercisesTable.effort, ['CON.', 'EXC.']),
      eq(exercisesTable.level, 'delta'),
      gte(exercisesTable.difficulty, 2)
    )
  );
```

### CSV Parse with Type Mapping
```typescript
// Source: https://csv.js.org/parse/
import { parse } from 'csv-parse';
import fs from 'fs';

interface CSVRow {
  'PATRON PRINCIPAL': string;
  'Nivel': string;
  'Dificultad Relativa': string;
}

async function parseExerciseCSV(filepath: string) {
  const exercises: ExerciseInsert[] = [];

  const parser = fs
    .createReadStream(filepath)
    .pipe(parse<CSVRow>({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }));

  for await (const row of parser) {
    exercises.push({
      pattern: row['PATRON PRINCIPAL'],
      level: row['Nivel'] as 'alfa' | 'delta' | 'sigma' | 'omega',
      difficulty: parseInt(row['Dificultad Relativa']) || 1,
    });
  }

  return exercises;
}
```

### Fastify Route with Query Validation
```typescript
// Source: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
import { FastifyPluginAsync } from 'fastify';

interface QueryParams {
  route: string;
  contraction: string;
  level: string;
  difficulty: number;
}

export const spomRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: QueryParams }>(
    '/exercises',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['route', 'level'],
          properties: {
            route: { type: 'string', enum: ['PL', 'FL', 'SQ', 'HL'] },
            contraction: { type: 'string', enum: ['CON', 'EXC', 'ISO'] },
            level: { type: 'string', enum: ['alfa', 'delta', 'sigma', 'omega'] },
            difficulty: { type: 'integer', minimum: 1, maximum: 3 },
          },
        },
      },
    },
    async (request, reply) => {
      const { route, contraction, level, difficulty } = request.query;

      const filters = [eq(exercises.route, route), eq(exercises.level, level)];
      if (contraction) filters.push(eq(exercises.effort, contraction + '.'));
      if (difficulty) filters.push(gte(exercises.difficulty, difficulty));

      const results = await fastify.db.select()
        .from(exercises)
        .where(and(...filters));

      return results;
    }
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Embed data in migrations | Separate seed scripts | Drizzle 0.20+ (2023) | Migrations stay pure DDL, seeds are rerunnable |
| Custom CSV parser | csv-parse package | Node.js 8+ (2017) | Handles RFC 4180 edge cases, streaming support |
| Loop individual inserts | Batch insert with array | Drizzle 0.15+ (2023) | 1000x fewer network calls, faster seeding |
| JSON columns for params | Typed nullable columns | MySQL 5.7+ (2015) | Strong typing, no JSON functions needed, better query performance |
| Application-level singleton | CHECK constraint | MySQL 8.0.16+ (2019) | Database enforces single row even if app bypassed |

**Deprecated/outdated:**
- **serial type in MySQL:** Drizzle docs warn "serial doesn't create a primary key but a unique key" - use `int().primaryKey().autoincrement()` instead
- **drizzle-seed package:** Requires drizzle-orm 0.37.0+, current project is 0.45.1, but custom seed scripts still preferred for control
- **MySQL < 8.0.16:** No CHECK constraint support - must use triggers or application logic for single-row enforcement

## Open Questions

Things that couldn't be fully resolved:

1. **Rotador Semanal CSV structure**
   - What we know: CSV has complex header structure with internal logic notes in first rows
   - What's unclear: Exact column mapping - needs manual inspection of actual file structure
   - Recommendation: Manually inspect first 20 rows, identify header row, map columns to weeklyRotator schema. May need to skip first N rows if they contain metadata.

2. **Level vs Level Group computation**
   - What we know: Store level_code (alfa/delta/sigma/omega), compute level_group (alfa_delta/sigma/omega) at runtime
   - What's unclear: Is level_group needed in database or purely computed? If computed, where - application or database view?
   - Recommendation: Store in application layer as computed property: `levelGroup = ['alfa', 'delta'].includes(level) ? 'alfa_delta' : level`

3. **Format params wide table column set**
   - What we know: Formats CSV has ~500 rows with different format types
   - What's unclear: Complete set of possible parameters - need to analyze all format rows
   - Recommendation: Parse CSV, collect all unique column names beyond core fields, create nullable columns for each. Expect: sets, reps, duration, rest, tempo, load, progression.

4. **Exercise query performance at scale**
   - What we know: 1870 exercises, queries filter by route+contraction+level+difficulty
   - What's unclear: Whether composite index on (route, effort, level, difficulty) or separate indexes perform better
   - Recommendation: Start with composite index on most selective columns (route, level, difficulty), monitor EXPLAIN plans, adjust after real query patterns emerge.

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM - Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) - Index patterns verified
- [Drizzle ORM - MySQL Column Types](https://orm.drizzle.team/docs/column-types/mysql) - Enum, varchar, int, timestamp syntax verified
- [Drizzle ORM - Transactions](https://orm.drizzle.team/docs/transactions) - Transaction API and batch patterns verified
- [Drizzle ORM - Insert](https://orm.drizzle.team/docs/insert) - Batch insert and onDuplicateKeyUpdate verified
- [CSV Parse Documentation](https://csv.js.org/parse/) - API and options verified
- [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) - Query validation patterns verified

### Secondary (MEDIUM confidence)
- [MySQL Composite Indexes Best Practices](https://www.mysqltutorial.org/mysql-index/mysql-composite-index/) - Leftmost prefix rule, column ordering
- [MySQL Foreign Key Optimization](https://dev.mysql.com/doc/refman/8.0/en/foreign-key-optimization.html) - FK indexing requirements
- [Drizzle ORM - Filters](https://orm.drizzle.team/docs/operators) - and(), or(), eq(), inArray() operators
- [Node.js CSV Parsing Comparison](https://leanylabs.com/blog/js-csv-parsers-benchmarks/) - csv-parse vs papaparse performance
- [How To Read CSV Files in Node.js](https://www.digitalocean.com/community/tutorials/how-to-read-and-write-csv-files-in-node-js-using-node-csv) - csv-parse streaming examples
- [MySQL Single Row Table Pattern](https://www.w3tutorials.net/blog/how-to-allow-only-one-row-for-a-table/) - CHECK constraint singleton pattern

### Tertiary (LOW confidence - requires validation)
- [Drizzle ORM Seeding Best Practices](https://app.studyraid.com/en/read/11288/352164/migration-best-practices) - Migration vs seed separation (needs official verification)
- [Dynamic WHERE Statements in Drizzle](https://brockherion.dev/blog/posts/dynamic-where-statements-in-drizzle/) - Community pattern, not official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - csv-parse and Drizzle patterns verified with official docs
- Architecture: HIGH - Index patterns, transaction patterns, and CSV streaming verified
- Pitfalls: HIGH - Based on official MySQL docs and Drizzle constraints
- CSV structure: MEDIUM - Need manual inspection of actual files to confirm column mappings
- Format params: LOW - Need to analyze CSV to determine complete column set

**Research date:** 2026-01-23
**Valid until:** 30 days (stable domain - MySQL and Drizzle patterns don't change rapidly)

**Planner guidance:**
- Create schema tasks before seeding tasks
- Add foreign key dependencies explicitly in task order
- Create indexes in schema definitions, not after seeding
- Separate seed script from existing seed.ts (different data domains)
- Validate CSV column mappings manually before generating parser code
