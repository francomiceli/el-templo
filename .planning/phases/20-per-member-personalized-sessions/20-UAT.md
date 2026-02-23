---
status: testing
phase: 20-per-member-personalized-sessions
source:
  - 20-01-SUMMARY.md
  - 20-02-SUMMARY.md
  - 20-03-SUMMARY.md
  - 20-04-SUMMARY.md
  - 20-05-SUMMARY.md
  - 20-06-SUMMARY.md
  - 20-07-SUMMARY.md
started: 2026-02-20T21:00:00Z
updated: 2026-02-20T21:00:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Journey nav item in member app drawer
expected: |
Open the member app and open the side drawer. There should be a "Journey" (or "Mi Journey") nav item between Entrenamiento and Conceptos.
awaiting: user response

## Tests

### 1. Journey nav item in member app drawer

expected: Open the member app side drawer. A "Journey" nav item should appear between Entrenamiento and Conceptos.
result: [pending]

### 2. Journey Selection page shows 6 journeys grouped by tier

expected: Navigate to the Journey section. You should see 6 journey cards grouped into 3 tiers: Principiante (Tren Superior, Tren Inferior), Intermedio (Empuje, Traccion), Avanzado (Planche, Front Lever). Cards should use the cream/sand/terracotta brand palette.
result: [pending]

### 3. Journey Overview shows details

expected: Tap on any journey card. An overview page should show the journey name, targeted zones, difficulty indicator, "ideal for" description, and a CTA button to select/start the journey.
result: [pending]

### 4. Select a journey and see Duration Picker

expected: Tap the select/start button on a journey overview. The journey becomes your active journey. You should see the Duration Picker page with 3 options: 20 min, 40 min, 60 min. The 20-min card should have an encouraging message.
result: [pending]

### 5. Journey Session loads and plays through blocks

expected: Select a duration (e.g., 40 min). A splash screen appears, then the session player loads with blocks and exercises. A journey badge at the top shows the journey name and selected duration. The player should work like regular Entrenamiento sessions (timer, exercise completion, block progression).
result: [pending]

### 6. Duration-based block filtering

expected: With a 20-min duration, the session should show only 2 blocks (Initium + Nucleus). With 40 min, 3 blocks (adds Deuteros). With 60 min, all blocks. (You can test this by going back and selecting different durations.)
result: [pending]

### 7. Session completion flow (celebration, summary, progress)

expected: After completing all blocks, you should see: celebration screen -> session summary (with RPE/notes inputs) -> journey progress indicator showing per-duration semana advancement. After dismissing, you return to the Duration Picker.
result: [pending]

### 8. Mi Camino shows active journey progress

expected: Navigate to Mi Camino (progression page). Below the existing Evaluacion section, there should be a Journey section showing your active journey name, per-duration semana counters (20/40/60 min), and a "Cambiar Journey" option.
result: [pending]

### 9. Journey switching with warning dialog

expected: In Mi Camino, tap "Cambiar Journey". A warning dialog should appear about progress reset. Confirming should navigate to the Journey Selection page. If you had archived journeys, they should appear as history cards with date ranges and completion stats.
result: [pending]

### 10. Admin GeneratePage - Personalizadas tab

expected: In the admin app, go to the Generate page. There should be a "Personalizadas" tab. It should show journey types grouped by tier with colored chips, a week selector, and buttons to generate sessions per type or "Generate All".
result: [pending]

### 11. Admin SessionsPage - Personalizadas tab with journey type sub-tabs

expected: In the admin app, go to Sessions page and select the "Personalizadas" tab. You should see sub-tabs for each journey type (Tren Superior, Tren Inferior, Empuje, Traccion, Planche, Front Lever). Under each sub-tab, day cards should appear with level rows (alfa, delta, sigma, omega, spartan) - mirroring the General tab structure.
result: [pending]

### 12. Admin Edit journey session

expected: Click on a level row within a journey day card. The Session Edit page should load with a journey type badge in the header, and level tabs (alfa, delta, sigma, etc.). The back button should return to the Personalizadas tab.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0

## Gaps

[none yet]
