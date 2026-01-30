---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  # Timer removal
  - src/modules/training/pages/DayPlayer.vue
  - src/modules/training/components/player/BlockHeader.vue
  - src/modules/training/components/player/TimerControls.vue (DELETE)
  - src/modules/training/composables/useProtocolTimer.ts (DELETE)
  - src/modules/training/composables/useTimerAudio.ts (DELETE)
  - src/modules/training/utils/timerFormats.ts (DELETE)
  - src/modules/training/utils/__tests__/timerFormats.test.ts (DELETE)
  - src/modules/training/stores/sessionPlayerStore.ts
  - src/modules/training/composables/useSessionPlayer.ts
  # Saberes additions
  - src/modules/training/pages/Saberes.vue (NEW)
  - src/modules/training/routes.ts
  - src/layouts/MainLayout.vue
  - src/modules/training/data/formatExplanations.ts (NEW)
autonomous: true

must_haves:
  truths:
    - "No timer controls or countdown displays appear in DayPlayer"
    - "User can navigate to Saberes page from main menu"
    - "User sees info icon next to format name in BlockHeader during session"
    - "Tapping info icon shows format explanation in a dialog/bottom sheet"
  artifacts:
    - path: "src/modules/training/pages/Saberes.vue"
      provides: "Guide page explaining formats, blocks, routes, intensity"
    - path: "src/modules/training/data/formatExplanations.ts"
      provides: "Lookup table of format name -> explanation text"
  key_links:
    - from: "MainLayout.vue"
      to: "/saberes"
      via: "q-item in drawer"
    - from: "BlockHeader.vue"
      to: "formatExplanations.ts"
      via: "lookup by format prop"
---

<objective>
Remove all timer functionality from the Day Player and add educational "Saberes" features

Purpose: Simplify the workout experience by removing complex timer protocols (EMOM, AMRAP, FOR_TIME) and provide students with educational resources explaining training concepts (formats, blocks, routes, intensity).

Output:
- Timer-free DayPlayer with simple "Completar Bloque" buttons for all blocks
- New Saberes page accessible from main menu with training concept explanations
- Info icon in BlockHeader showing format explanation during active session
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/training/pages/DayPlayer.vue
@src/modules/training/components/player/BlockHeader.vue
@src/modules/training/composables/useProtocolTimer.ts
@src/modules/training/stores/sessionPlayerStore.ts
@src/layouts/MainLayout.vue
@src/modules/training/routes.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove all timer functionality</name>
  <files>
    src/modules/training/pages/DayPlayer.vue
    src/modules/training/components/player/BlockHeader.vue
    src/modules/training/stores/sessionPlayerStore.ts
    src/modules/training/composables/useSessionPlayer.ts
    src/modules/training/components/player/TimerControls.vue (DELETE)
    src/modules/training/composables/useProtocolTimer.ts (DELETE)
    src/modules/training/composables/useTimerAudio.ts (DELETE)
    src/modules/training/utils/timerFormats.ts (DELETE)
    src/modules/training/utils/__tests__/timerFormats.test.ts (DELETE)
  </files>
  <action>
    **Delete these files entirely:**
    - `src/modules/training/components/player/TimerControls.vue`
    - `src/modules/training/composables/useProtocolTimer.ts`
    - `src/modules/training/composables/useTimerAudio.ts`
    - `src/modules/training/utils/timerFormats.ts`
    - `src/modules/training/utils/__tests__/timerFormats.test.ts`

    **In DayPlayer.vue:**
    - Remove imports: `TimerControls`, `useProtocolTimer`, `useTimerAudio`, `parseProtocolType`, `getProtocolParams`
    - Remove: `timerAudio` constant, `protocolTimer` shallowRef, `timerStarted` ref, `appStateListener`
    - Remove computed: `protocolType`, `hasTimer`
    - Remove functions: `onTimerStart`, `onTimerStop`, `onTimerResume`, `onForTimeDone`, `handleTimerComplete`, `restoreProtocolTimer`, `createProtocolTimerForBlock`
    - Remove template: `<TimerControls>` component (lines 158-167), FOR_TIME "Listo!" button (lines 170-179)
    - Simplify action area: Always show single "Completar Bloque" button (remove `v-if="!hasTimer"` condition)
    - In BlockHeader usage (line 129-132): Remove `:show-timer`, `:timer-display`, `:timer-color-class` props
    - Remove watch on `currentBlockIndex` that calls `createProtocolTimerForBlock`
    - In onMounted: Remove `appStateListener` registration (App.addListener for appStateChange)
    - In onUnmounted: Remove `protocolTimer?.cleanup()` and `appStateListener?.remove()`
    - Remove `App` import from `@capacitor/app` and `PluginListenerHandle` from `@capacitor/core`

    **In BlockHeader.vue:**
    - Remove props: `showTimer`, `timerDisplay`, `timerColorClass`
    - Remove template: The entire `block-header__right` div with timer display (lines 13-17)
    - Remove associated styles: `.block-header__right`, `.block-timer`

    **In sessionPlayerStore.ts:**
    - Remove from SessionProgress interface: `protocolTimerStartedAt`, `protocolTimerAccumulatedMs`
    - In `createDefaultProgress()`: Remove those two fields from defaults

    **In useSessionPlayer.ts:**
    - Remove computed: `currentBlockFormat`
    - Remove from return statement: `currentBlockFormat`
  </action>
  <verify>
    - `npm run lint` passes (no unused imports/variables)
    - `npm run type-check` passes (no missing types)
    - Deleted files no longer exist: `ls src/modules/training/composables/useProtocolTimer.ts` returns "No such file"
  </verify>
  <done>
    - TimerControls component deleted
    - useProtocolTimer composable deleted
    - useTimerAudio composable deleted
    - timerFormats utility deleted
    - DayPlayer shows only "Completar Bloque" buttons, no timer UI
    - BlockHeader shows no timer display
    - No protocol timer state in sessionPlayerStore
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Saberes page and add navigation</name>
  <files>
    src/modules/training/pages/Saberes.vue (NEW)
    src/modules/training/routes.ts
    src/layouts/MainLayout.vue
  </files>
  <action>
    **Create `src/modules/training/pages/Saberes.vue`:**
    - Page title: "Saberes" (styled with Cinzel font like other headers)
    - Use q-expansion-item components for each section (collapsible)
    - Sections:
      1. **Bloques** - Explain INITIUM (warmup), NUCLEUS (main work), DEUTEROS (choice block), ATHLOS/EPIKOS (challenge)
      2. **Rutas** - Explain what routes are (Alfa-Delta, Alfa-Foxtrot, etc.) and that they represent movement patterns
      3. **Formatos** - Explain common formats: Straight Sets, EMOM, AMRAP, For Time, Tabata, Chipper, etc.
      4. **Intensidad** - Explain the percentage system (e.g., 85% means moderate-high effort)
    - Use Spanish language throughout
    - Apply brand colors from quasar.variables.scss ($cream background, $primary for headings, $secondary for text)
    - Include back button or rely on drawer navigation

    **In `src/modules/training/routes.ts`:**
    - Add route:
      ```ts
      {
        path: 'saberes',
        name: 'saberes',
        component: () => import('./pages/Saberes.vue'),
        meta: { requiresAuth: true }
      }
      ```

    **In `src/layouts/MainLayout.vue`:**
    - Add menu item in q-list (after "Entrenamiento", before "Mi Perfil"):
      ```vue
      <q-item clickable to="/saberes" @click="leftDrawerOpen = false">
        <q-item-section avatar>
          <q-icon name="school" />
        </q-item-section>
        <q-item-section>Saberes</q-item-section>
      </q-item>
      ```
  </action>
  <verify>
    - Navigate to `/saberes` in browser - page renders with 4 expandable sections
    - Drawer menu shows "Saberes" item with school icon
    - Clicking menu item navigates to Saberes page
  </verify>
  <done>
    - Saberes.vue page exists with educational content about blocks, routes, formats, intensity
    - Route `/saberes` is registered and navigable
    - MainLayout drawer includes "Saberes" menu item
  </done>
</task>

<task type="auto">
  <name>Task 3: Add format info icon in BlockHeader</name>
  <files>
    src/modules/training/components/player/BlockHeader.vue
    src/modules/training/data/formatExplanations.ts (NEW)
  </files>
  <action>
    **Create `src/modules/training/data/formatExplanations.ts`:**
    - Export a Record<string, { title: string; description: string }> mapping normalized format names to explanations
    - Include entries for: EMOM, AMRAP, For Time, Tabata, Straight Sets, Chipper, Complex, etc.
    - Normalize by lowercase for lookup
    - Spanish descriptions explaining what the format means and how to execute it

    **In BlockHeader.vue:**
    - Add new prop: `format?: string` (the block's format name)
    - Import `formatExplanations` from `../../data/formatExplanations`
    - Add computed `formatInfo` that looks up explanation by normalized format name
    - Add a q-btn with info icon (`info_outline`) next to block name (in block-header__left, after block-route)
    - Show button only if `formatInfo` exists for the current format
    - On click, show q-dialog with:
      - Title: format name (e.g., "EMOM")
      - Body: format explanation from formatExplanations
      - Close button
    - Style: small icon button (dense, flat), $secondary color
  </action>
  <verify>
    - Start a session, see info icon next to format name in BlockHeader
    - Tap info icon, see dialog with format explanation
    - Different blocks show appropriate format info
  </verify>
  <done>
    - formatExplanations.ts exists with lookup data
    - BlockHeader shows info icon when format prop is provided
    - Tapping icon opens dialog with format explanation
  </done>
</task>

</tasks>

<verification>
After all tasks:
1. `npm run lint` - no errors
2. `npm run type-check` - no type errors
3. Start dev server (`npm run dev`)
4. Open app, verify:
   - Timer-related files deleted (check src/modules/training/composables/, utils/)
   - DayPlayer shows "Completar Bloque" buttons only
   - No timer countdown or timer controls visible
   - Drawer has "Saberes" menu item
   - /saberes page loads with training concepts
   - BlockHeader shows info icon during session
</verification>

<success_criteria>
- All timer files deleted (TimerControls.vue, useProtocolTimer.ts, useTimerAudio.ts, timerFormats.ts)
- DayPlayer works without timers - all blocks use simple "Completar Bloque" flow
- Saberes page accessible from main navigation with educational content
- Format info icon visible in BlockHeader during active session
- No TypeScript or lint errors
</success_criteria>

<output>
After completion, create `.planning/quick/001-remove-timers-add-saberes-info/001-SUMMARY.md`
</output>
