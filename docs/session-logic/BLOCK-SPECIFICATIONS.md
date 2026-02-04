# Block Specifications

This document captures the specifications for each block type in El Templo's session structure, derived from coach-built examples and system documentation.

## Overview

### Session Structure
A complete training session consists of 5 blocks:
1. **Initium** - Warmup and preparation
2. **Nucleus** - Main training focus
3. **Deuteros 1** - Secondary complementary work (option A)
4. **Deuteros 2** - Secondary complementary work (option B)
5. **Athlos/Epikos** - Challenge or play element to end session

### User Flow
Members complete 4 blocks per session:
- Initium (mandatory)
- Nucleus (mandatory)
- Deuteros 1 OR Deuteros 2 (user's choice - upper/lower body focus)
- Athlos/Epikos (mandatory)

---

## Initium Block

### Purpose
Warmup and preparation block. Elevates body temperature, activates muscle chains, and creates focus for the session ahead.

### Specifications

| Attribute | Value |
|-----------|-------|
| Route | None (uses "INITIUM" marker) |
| Pattern | FLOW or Movilidad |
| Intensity | Fixed ~30% (within INITIUM range 10-40%) |
| Reps Budget | N/A (not used per spec) |
| Exercise Count | 2-4 (no cap - warmup flexibility) |
| Contextual | Yes - relates to day's main Nucleus stimulus |
| Compatible Formats | Tabata, Interval Training, HIIT, For Time, Buy-in/Cash-out |

### Selection Logic
- **Bypasses SPOM pipeline** - No route lookup
- Uses FLOW pattern or Movilidad category exercises
- Should relate to day's Nucleus route:
  - If Nucleus is shoulder-dominant (PUSH) -> shoulder mobility and activation
  - If Nucleus is pulling-dominant (PULL) -> scapular activation
  - If Nucleus is lower body -> hip and leg mobility

### Coach Notes
> "Initium is not generic; it is contextual. If the day has a strong shoulder stimulus -> shoulder mobility and activation"

---

## Nucleus Block

### Purpose
Main training focus for the day. The structural nucleus that determines the day's primary pattern.

### Specifications

| Attribute | Value |
|-----------|-------|
| Route | From weekly rotator (SPOM lookup) |
| Primary Block | Yes - determines day's main stimulus |
| Intensity | From SPOM table (week x route) |
| Exercise Count | 2-3 (capped at 3) |
| Alfa-Delta Correlation | Same pattern, same logic, different difficulty |
| All Levels Together | Yes - planned as coherent unit |
| Difficulty Average | Within +/-0.5 of target bucket |
| Upper/Lower | Fixed for the day - not user selectable |

### Selection Logic
1. Route comes from weekly rotator
2. Intensity looked up via SPOM (week x route -> percentage)
3. Difficulty bucket derived from intensity percentage
4. Alpha and Delta exercises follow same logical progression:
   - Alpha -> base version of the exercise
   - Delta -> more complex version of the same pattern
5. Sigma and Omega may correlate or be planned separately based on pattern

### Contraction Distribution
Follows contraction rules from Contraccion.txt based on:
- Intensity percentage
- Total exercise count
- Yields: CON/EXC/ISO distribution

---

## Deuteros 1 Block

### Purpose
Secondary complementary work that complements the Nucleus stimulus.

### Specifications

| Attribute | Value |
|-----------|-------|
| Route | From weekly rotator |
| Secondary Work | Yes - complements Nucleus |
| Upper/Lower Choice | User can select focus (this or Deuteros 2) |
| Exercise Count | 3 (capped at 3) |
| Intensity | From SPOM table |
| Difficulty | Matches route's intensity bucket |

### Selection Logic
1. Route from weekly rotator
2. Provides one focus option (e.g., upper body)
3. User chooses between Deuteros 1 and Deuteros 2 based on preference
4. Exercises selected to complement, not duplicate, Nucleus stimulus

---

## Deuteros 2 Block

### Purpose
Secondary complementary work - alternative to Deuteros 1.

### Specifications

| Attribute | Value |
|-----------|-------|
| Route | From weekly rotator |
| Secondary Work | Yes - complements Nucleus |
| Upper/Lower Choice | User can select focus (this or Deuteros 1) |
| Exercise Count | 3 (capped at 3) |
| Intensity | From SPOM table |
| Difficulty | Matches route's intensity bucket |

### Selection Logic
- Same as Deuteros 1 but provides alternate focus
- If Deuteros 1 is upper body, Deuteros 2 is typically lower body
- User picks one based on their training goals for the day

---

## Athlos/Epikos Block

### Purpose
Challenge or play element to end the session with a dynamic, engaging stimulus.

### Specifications

| Attribute | Value |
|-----------|-------|
| Type Selection | Athlos (odd weeks) / Epikos (even weeks) |
| Route | From weekly rotator |
| Direction | Complementary to Nucleus |
| Exercise Count | 2-3 (capped at 3) |
| Intensity | From SPOM table |

### Athlos vs Epikos
| Aspect | Athlos | Epikos |
|--------|--------|--------|
| Focus | Structured technical challenge | Playful physical game |
| Stimulus | Stronger / more structured | More playful / game-like formats |
| Week Parity | Odd weeks (1, 3, 5...) | Even weeks (2, 4, 6...) |

### Direction Rules
Complementary to Nucleus:
- If Nucleus is superior (upper body), Athlos/Epikos is inferior (lower body)
- If Nucleus is inferior (lower body), Athlos/Epikos is superior (upper body)

---

## Exercise Count Summary

| Block | Min | Max | Notes |
|-------|-----|-----|-------|
| Initium | 2 | 4 | No cap (warmup flexibility) |
| Nucleus | 2 | 3 | Capped at 3 |
| Deuteros 1 | 3 | 3 | Capped at 3 |
| Deuteros 2 | 3 | 3 | Capped at 3 |
| Athlos/Epikos | 2 | 3 | Capped at 3 |

**Important:** The intensity rules table may suggest 4-5 exercises at low intensities (55-60%), but coach-built examples consistently show maximum 3 exercises per non-Initium block. The pipeline must cap exercise count at 3 for all blocks except Initium.

---

## Intensity to Budget Mapping

From SPOM - Intensidad.csv:

| % Intensity | Reps per Block | Difficulty Bucket | Exercises per Block |
|-------------|----------------|-------------------|---------------------|
| 55% | 160 | 1 | 4-5 |
| 60% | 140 | 1 | 4-5 |
| 65% | 120 | 2 | 3-5 |
| 70% | 100 | 2 | 3-5 |
| 75% | 80 | 3 | 3-4 |
| 80% | 60 | 3 | 3-4 |
| 85% | 40 | Nivel Superior 1 | 3-4 |
| 90% | 20 | Nivel Superior 1 | 3-4 |
| 95% | 10 | Nivel Superior 1 | 2-3 |

**Note:** Exercise count from this table is used for Initium only. Non-Initium blocks are capped at 3 regardless of what the intensity rules suggest.

---

## Contraction Distribution

All blocks except Initium follow contraction rules based on:
- Intensity percentage
- Total exercise count per block

The contraction mix (CON/EXC/ISO) is derived from the Contraccion.txt lookup table. The system queries by (intensity, exerciseCount) to get the exact distribution.

Example distributions:
| Intensity | Exercises | CON | EXC | ISO |
|-----------|-----------|-----|-----|-----|
| 55% | 4 | 2 | 1 | 1 |
| 55% | 5 | 3 | 1 | 1 |
| 65% | 3 | 1 | 1 | 1 |

---

## Level Groups and Difficulty

### Level Groups
Sessions are generated for three level groups:
- **alfa_delta** - Alfa and Delta levels train together (same exercises, different difficulty)
- **sigma** - Sigma level
- **omega** - Omega and Spartan levels

### Difficulty by Level and Intensity

| Level | Intensity Range | Difficulty Range |
|-------|-----------------|------------------|
| Alfa | 55-65% | Alfa 1 |
| Alfa | 65-75% | Alfa 2 |
| Alfa | 75-85% | Alfa 3 |
| Alfa | 85-95% | Delta 1 (Nivel Superior) |
| Delta | 55-65% | Delta 1 |
| Delta | 65-75% | Delta 2 |
| Delta | 75-85% | Delta 3 |
| Delta | 85-95% | Sigma 1 (Nivel Superior) |
| Sigma | 55-65% | Delta 3 |
| Sigma | 65-75% | Sigma 1 |
| Sigma | 75-85% | Sigma 2 |
| Sigma | 85-95% | Omega 1 (Nivel Superior) |
| Omega | 55-65% | Sigma 2 |
| Omega | 65-75% | Omega 1 |
| Omega | 75-85% | Omega 2 |
| Omega | 85-95% | Spartan 1 (Nivel Superior) |
| Spartan | 55-65% | Omega 2 |
| Spartan | 65-75% | Spartan 1 |
| Spartan | 75-85% | Spartan 2 |
| Spartan | 85-95% | Olympic (Competition) |

---

## Weekly Distribution Rules

### Nucleus Upper/Lower Balance
- 3 days per week: Nucleus superior (upper body)
- 3 days per week: Nucleus inferior (lower body)
- Distribution must be asymmetric (not fixed to specific days)

**What to avoid:**
- Lunes, Miercoles, Viernes = always superior
- Martes, Jueves, Sabado = always inferior

This prevents predictable patterns and ensures varied stimulus regardless of member attendance patterns.

### Level-Specific Distribution

**Alfa/Delta:** Alternates between all 4 pattern groups per week (Push, Pull, Inferior Knee, Inferior Hip)

**Sigma:** Patterns may repeat within group, increasing specific frequency for technical depth

**Omega:** Day can be 100% superior or 100% inferior - concentrated technical work
- Exception: Fridays and Saturdays break symmetry for structural balance

---

## Format Compatibility

Each block type has compatible formats from the Formatos table:

| Format | Initium | Nucleus | Deuteros | Athlos/Epikos |
|--------|---------|---------|----------|---------------|
| Tabata | Yes | Yes | Yes | Yes |
| EMOM | Yes | Yes | Yes | Yes |
| AMRAP | Yes | Yes | Yes | Yes |
| Complex | Yes | Yes | Yes | Yes |
| Interval Training | Yes | No | No | No |
| For Time | Yes | Yes | Yes | Yes |
| Singlet | No | Yes | Yes | Yes |
| Ladder | No | Yes | Yes | Yes |
| Cluster | No | Yes | Yes | Yes |
| Tempo Sets | No | Yes | Yes | Yes |
| Pyramid | No | Yes | Yes | Yes |
| I Go You Go | No | Yes | Yes | Yes |
| Buy-in/Cash-out | Yes | Yes | Yes | Yes |

---

## Sources

- `docs/session-logic/Documento de Planificacion` parts 1-4
- `docs/session-logic/coach-step-by-step-part-*.txt`
- `docs/session-logic/[Planificaciones] - Base de Datos - SPOM - Intensidad.csv`
- `docs/session-logic/[Planificaciones] - Base de Datos - Contraccion.txt`
- `docs/session-logic/examples/` - 19 weeks of coach-built sessions

---

*Document created: 2026-02-04*
*Last updated: 2026-02-04*
