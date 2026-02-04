# Session Generation Algorithm Guide

This guide documents how to use the session-logic files to refine and validate the session generation algorithm.

## File Overview

### Reference Data (Base de Datos)

| File | Purpose | Rows |
|------|---------|------|
| `[Planificaciones] - Base de Datos - SPOM.csv` | Week × Route → Intensity, Wave, Pattern, Category | ~1040 |
| `[Planificaciones] - Base de Datos - Rotador Semanal.csv` | Week × Day × LevelGroup → Block Routes | ~936 |
| `[Planificaciones] - Base de Datos - Ejercicios.csv` | Exercise database with metadata | ~1870 |
| `[Planificaciones] - Base de Datos - Formatos.csv` | Format compatibility (block × level × intensity) | ~500 |
| `[Planificaciones] - Base de Datos - SPOM - Intensidad.csv` | Intensity → Reps, Difficulty, Exercise Count | 9 |
| `[Planificaciones] - Base de Datos - Contracción.txt` | Intensity × ExerciseCount → CON/EXC/ISO distribution | 20 |

### Documentation

| File | Purpose |
|------|---------|
| `workbook-map-part-1.txt` | Excel workbook structure - sheets, cells, what goes where |
| `workbook-map-part-2.txt` | Main editable table structure, dropdown sources, validation |
| `coach-step-by-step-part-1.txt` | Steps 1-5: How coach reads day info, plans Initium, block order |
| `coach-step-by-step-part-2.txt` | Steps 6-11: Main table usage, filters, exercise selection, formats |
| `coach-step-by-step-part-3.txt` | Steps 12-13: Validation, difficulty criteria, rotator operation |
| `Documento de Planificación (parts 1-4)` | Original SPOM methodology documentation |

### Examples (Ground Truth)

19 weeks of coach-built sessions (Semana 3-21), each with:

| File Pattern | Contents |
|--------------|----------|
| `Semana X - DATE - Semana.csv` | Week summary: routes per level group, SPOM lookup |
| `Semana X - DATE - Lunes.csv` through `Sabado.csv` | Daily detailed planning with all exercises |
| `Semana X - DATE - Planificación Final.csv` | Consolidated final output |

---

## Algorithm Refinement Process

### Phase 1: Understand Coach Logic

Read and internalize:
1. `coach-step-by-step-part-1.txt` - The 13-step process
2. `coach-step-by-step-part-2.txt` - Filter and selection logic
3. `coach-step-by-step-part-3.txt` - Difficulty criteria and validation

**Key principles:**
- Teacher OPERATES within the system, doesn't design it
- SPOM is the "bible" - all decisions flow from it
- High intensity → strict filters → specific exercises
- Low intensity → loose filters → general exercises
- Difficulty is **relative to level** - planning Alpha uses Delta difficulty
- Block difficulty = average of exercises, ±0.5 variance allowed

### Phase 2: Analyze Examples for Patterns

For each of the 19 weeks:

1. **Read `Semana.csv`** - Get the week's routes and SPOM values
2. **Read `Lunes.csv` through `Sabado.csv`** - See actual exercise selections
3. **Look for patterns:**
   - Which exercises are chosen for each route/intensity/level combination?
   - How does contraction distribution manifest?
   - What formats are assigned and why?
   - How does difficulty average work in practice?

### Phase 3: Extract Decision Rules

Build rules by observing 19 weeks of examples:

1. **Exercise Selection**
   - How do coaches prioritize exercises within filters?
   - What's the fallback behavior when no exact match?
   - Are certain exercises "favorites" for specific routes?

2. **Difficulty Targeting**
   - Verify: Does 95% intensity really use next-level difficulty 1?
   - How is ±0.5 variance used in practice?
   - What combinations are actually chosen vs. theoretically valid?

3. **Format Assignment**
   - Which formats appear most for each block/level/intensity?
   - Are there patterns in format rounds/duration?

4. **Initium Special Logic**
   - No route, no SPOM lookup
   - Contextual to day's main stimulus
   - Typically FLOW/Movilidad exercises

### Phase 4: Compare Algorithm vs Examples

For each week in examples:

```
1. Generate session using current algorithm
2. Load actual coach session from CSV
3. Compare:
   - Routes match? (should be identical - from Rotator)
   - Intensities match? (should be identical - from SPOM)
   - Exercise count match? (should follow Intensidad rules)
   - Contraction distribution match? (should follow Contracción rules)
   - Exercises reasonable? (in same pool, even if different choices)
   - Formats compatible? (from Formatos table)
   - Difficulty average within ±0.5 of target?
```

### Phase 5: Fix Discrepancies

Document each discrepancy found:

| Category | Current Behavior | Expected Behavior | Fix |
|----------|------------------|-------------------|-----|
| Example | Algorithm does X | Coach does Y | Change to Y |

---

## Critical Rules from Documentation

### Difficulty Interpretation (Step 13)

**"Upper level 1" means:**
- If planning Alpha → use Delta difficulty 1 exercises
- If planning Delta → use Sigma difficulty 1 exercises
- If planning Sigma → use Omega difficulty 1 exercises
- If planning Omega → use Omega/Spartan difficulty 1 exercises

**Block average difficulty:**
- Target = system-defined difficulty
- Allowed range = target ±0.5
- Example: Target 2 → valid range 1.5-2.5

### Contraction Rules

From `Contracción.txt`:
- Intensity + total exercises → exact CON/EXC/ISO counts
- 95% with 2 exercises → 0 CON, 0 EXC, 2 ISO
- 95% with 3 exercises → 1 CON, 1 EXC, 1 ISO
- 65% with 4 exercises → 2 CON, 1 EXC, 1 ISO

### Filter Logic (App Script in coach-step-by-step-part-2)

Exercises filtered by:
1. Pattern (patron)
2. Category (categoria)
3. Secondary Category (catSec)
4. Effort/Contraction (esfuerzo)
5. Level (nivel)
6. Difficulty (dificultad)
7. Route (ruta)

**Key insight:** Filters are a "precision dial" - high intensity = tight filters, low intensity = loose filters.

### Weekly Rotator Operation

- Week N = Week N-1 shifted by one day
- Monday-Friday → Tuesday-Saturday
- Saturday → Monday
- Every 6 weeks: block rotation (routes shift between blocks)

### Initium Block

- No assigned route
- No fixed intensity
- Not part of rotator
- Contextual to day's main stimulus
- Typically FLOW/Movilidad pattern exercises

---

## Validation Checklist

For a generated session to be valid:

- [ ] Routes come from Weekly Rotator for (week, day, levelGroup)
- [ ] Intensities come from SPOM for (week, route)
- [ ] Exercise count follows Intensidad rules for intensity
- [ ] Contraction distribution follows Contracción rules
- [ ] Exercises match: route, pattern, level, difficulty, contraction
- [ ] Format is compatible per Formatos table
- [ ] Block difficulty average within ±0.5 of target
- [ ] No exercise repeated within same level's session
- [ ] Initium is contextual (no SPOM lookup)

---

## Next Steps

1. **Read all 19 weeks of examples** systematically
2. **Build comparison tooling** to generate vs. compare
3. **Document patterns** that appear across weeks
4. **Identify algorithm gaps** where behavior differs
5. **Implement fixes** to match coach logic
6. **Validate** against all 19 weeks

---

*Guide created: 2026-02-04*
*Purpose: Reference for Phase 13 - Session Generation Review & Improvement*
