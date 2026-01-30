# Phase 4: SPOM Engine — Context

**Created:** 2026-01-23
**Source:** Discussion with user during `/gsd:discuss-phase 4`

## Captured Decisions

### 1. Data Import Strategy
**Decision:** Migration script for one-time import

- Drizzle migrations handle schema creation
- Data import runs as part of migration (seed data embedded)
- CSVs in `/docs/` are source of truth during development
- Future Admin Panel phase will add superadmin tools for block replacement/modification

**Rationale:** Simple, reproducible, version-controlled. Admin tools deferred to dedicated phase.

### 2. SPOM Week Storage
**Decision:** Global single row

- Single `spom_config` table with one row containing `current_week` (1-52)
- All branches share the same SPOM week
- Matches "gym-wide SPOM" operational model from requirements

**Schema:**
```sql
CREATE TABLE spom_config (
  id INT PRIMARY KEY DEFAULT 1,
  current_week INT NOT NULL CHECK (current_week BETWEEN 1 AND 52),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Exercise Level Mapping
**Decision:** Store as `level_code`, compute group at runtime

- Database stores original values: `alfa`, `delta`, `sigma`, `omega`, `spartan`
- Level grouping computed in application code:
  - `ALFA_DELTA` group: alfa, delta
  - `SIGMA` group: sigma
  - `OMEGA` group: omega, spartan

**Rationale:** No data loss, grouping logic centralized in code, easy to adjust grouping rules.

### 4. Difficulty Bucket Mapping
**Decision:** Confirmed mapping from user domain knowledge

| Dificultad | Intensity Range | Bucket | Notes |
|------------|-----------------|--------|-------|
| 1 | 55-60% | Low | Basic exercises |
| 2 | 65-70% | Medium | Intermediate exercises |
| 3 | 75-80% | High | Advanced exercises |
| Nivel Superior | 85-95% | Max | Can borrow exercises from next level up |

**Implementation:**
- Store `dificultad` as integer (1-3) or string for "Nivel Superior"
- Engine maps intensity → bucket when selecting exercises
- At max intensity, allow cross-level borrowing (e.g., Delta exercises in Alfa max-intensity blocks)

### 5. Route Codes
**Decision:** Routes reference table

- Create `routes` table with `id`, `code`, `display_name`
- Route codes stored exactly as in CSV (e.g., `MN/RP`, `FL/SA`)
- All SPOM tables reference `routes.id` via foreign key

**Schema:**
```sql
CREATE TABLE routes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Rationale:** Clean foreign keys, allows adding route metadata later (descriptions, categories).

### 6. Format Parameters
**Decision:** Wide table with nullable columns

- All known format parameters as columns in `formats` table
- Parameters not applicable to a format type are NULL
- TypeScript types enforce which params are required per format type

**Known parameters:**
- `rounds` (EMOM, Tabata)
- `interval_sec` (EMOM)
- `duration_min` (AMRAP)
- `work_sec`, `rest_sec` (Tabata, intervals)
- `sets` (Singlet, sets-based)
- `ladder_direction` (Ladder: ASC/DESC/PYRAMID)
- `time_cap_sec` (For Time)

**Rationale:** Simple queries, no JSON parsing, TypeScript provides type safety.

## Future Phase: Admin Panel

**Scope:** Superadmin tools for SPOM management
- Replace blocks from generated sessions with different blocks
- Modify block parameters (exercises, format, intensity)
- Override Weekly Rotator for specific days
- Update SPOM week
- View/re-import data tables

**Note:** Add as Phase 11 after Progression & Coach Functions.

## Tables to Create (Phase 4)

1. `routes` — Route reference (code, display_name)
2. `spom_rules` — SPOM periodization (week, route_id, intensity, wave, pattern, category)
3. `intensity_rules` — Intensity mapping (intensity, reps_budget, difficulty_bucket, exercise_count)
4. `contraction_rules` — Contraction distribution (intensity, total_exercises, con, exc, iso)
5. `weekly_rotator` — Block assignments (week, day, level_group, nucleus_route, deuteros1_route, etc.)
6. `formats` — Format definitions (name, block_type, params...)
7. `format_compatibility` — Compatibility matrix (format_id, block, level, intensity, compatibility)
8. `exercises` — Exercise database (full metadata from CSV)
9. `spom_config` — Current SPOM week (single row)

## Data Sources

| Table | Source File | Approx Rows |
|-------|-------------|-------------|
| spom_rules | `[Planificaciones] - Base de Datos - SPOM.csv` | ~1040 |
| weekly_rotator | `[Planificaciones] - Base de Datos - Rotador Semanal.csv` | ~936 |
| contraction_rules | `[Planificaciones] - Base de Datos - Contracción.txt` | ~20 |
| intensity_rules | `[Planificaciones] - Base de Datos - SPOM - Intensidad.csv` | ~9 |
| format_compatibility | `[Planificaciones] - Base de Datos - Formatos.csv` | ~500 |
| exercises | `[Planificaciones] - Base de Datos - Ejercicios.csv` | ~1870 |
