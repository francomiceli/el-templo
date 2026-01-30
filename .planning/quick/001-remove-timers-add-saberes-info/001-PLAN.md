---
type: quick
wave: 1
autonomous: true

must_haves:
  truths:
    - "Timer functionality removed from DayPlayer and session flow"
    - "Saberes link added to navigation for educational content"
    - "Format info icon shows format name and explanation during session"
---

<objective>
Remove timer functionality and add educational features:
1. Remove all protocol timer code and UI from session player
2. Add "Saberes" link to navigation (educational guide placeholder)
3. Add format info icon in BlockHeader that explains the format
</objective>

<tasks>

<task type="code" id="remove-timers">
Remove all timer functionality from the session player:

1. **Delete timer files:**
   - `src/modules/training/composables/useProtocolTimer.ts`
   - `src/modules/training/composables/useTimerAudio.ts`
   - `src/modules/training/utils/timerFormats.ts`
   - `src/modules/training/components/player/TimerControls.vue`

2. **Clean DayPlayer.vue:**
   - Remove timer imports and setup
   - Remove timer-related template sections
   - Remove timer state and handlers
   - Keep block navigation flow intact

3. **Clean sessionPlayerStore.ts:**
   - Remove timer-related state (timerStarted, etc.)

4. **Clean useSessionPlayer.ts:**
   - Remove timer-related logic
</task>

<task type="code" id="add-saberes-link">
Add "Saberes" link to navigation:

1. **Add route in training module routes**
2. **Add navigation item in MainLayout drawer**
3. **Create placeholder Saberes.vue page** with sections for:
   - Bloques (Initium, Nucleus, Deuteros, Athlos)
   - Rutas (Strength, Power, etc.)
   - Formatos (EMOM, AMRAP, etc.)
   - Intensidad (% ranges and meaning)
</task>

<task type="code" id="add-format-info">
Add format info icon in session:

1. **Create formatExplanations.ts** with format descriptions
2. **Add info icon to BlockHeader** that opens dialog/tooltip with:
   - Format name
   - Brief explanation of how to execute
</task>

</tasks>

<verification>
- [ ] No timer imports or references remain in code
- [ ] Saberes link visible in navigation
- [ ] Format info icon visible during session
- [ ] Session flow still works (block progression, completion)
</verification>
