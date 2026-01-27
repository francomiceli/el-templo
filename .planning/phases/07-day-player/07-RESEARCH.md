# Phase 7: Day Player - Research

**Researched:** 2026-01-26
**Domain:** Mobile workout player UI with block flow, video display, and screen management
**Confidence:** HIGH

## Summary

Phase 7 implements the Day Player - a guided workout execution interface where members progress through a 5-block flow (Initium, Nucleus, Deuteros choice, Athlos) with exercise display, video placeholders, and block completion. The phase builds on existing Phase 6 infrastructure (session types, block colors, route utilities) and extends it with new session playback state management, screen wake lock, and exercise-focused UI.

Research covered four primary domains: (1) Screen wake lock implementation for keeping devices awake during workouts, (2) Video element handling for iOS Safari autoplay requirements, (3) Swipeable UI patterns for the Deuteros 1/2 choice component, and (4) Exit confirmation patterns using Vue Router navigation guards. The existing codebase already has solid foundations with Quasar components, Pinia stores, and established patterns from Phase 6 that can be extended.

The standard approach uses the native Screen Wake Lock API (94.48% browser support) with @capacitor-community/keep-awake as a Capacitor plugin fallback for native apps. For video, HTML5 `<video>` elements with `autoplay loop muted playsinline` attributes are required for iOS Safari compatibility. The Deuteros choice can be built using CSS scroll-snap (already used in WeekCarousel) or Quasar's QCarousel with exactly 2 slides. Exit confirmation uses Vue Router's `onBeforeRouteLeave` guard combined with Quasar's Dialog plugin.

**Primary recommendation:** Build the Day Player as a full-screen page component with a persistent video area at top, collapsible exercise list below, and block-specific accent colors. Use a new `useSessionPlayer` composable to manage playback state (current block, selected exercise, wake lock) and persist block-level progress for resume functionality.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar Framework | 2.16.0 | UI components (QLinearProgress, QExpansionItem, QDialog) | Already in use, provides all needed components |
| Vue 3 | 3.5.22 | Composition API, reactive state | Already in use, composable pattern established |
| Pinia | 3.0.4 | Session player state management | Already in use with weekStore pattern |
| Vue Router | 4.x | Navigation guards for exit confirmation | Already in use, onBeforeRouteLeave available |
| Screen Wake Lock API | Native | Keep screen awake during workout | 94.48% browser support, no library needed |
| @capacitor-community/keep-awake | 8.0.0 | Native screen wake lock for iOS/Android | Official Capacitor community plugin, Capacitor 7 compatible |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Quasar Dialog Plugin | Built-in | Exit confirmation dialogs | Mid-block exit warning |
| Quasar Touch Directives | Built-in | v-touch-swipe for Deuteros choice | Custom swipe handling if needed |
| CSS scroll-snap | Native | Smooth horizontal scrolling | Deuteros choice carousel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Screen Wake Lock API | NoSleep.js (video-based hack) | Wake Lock API is native, cleaner, more reliable - prefer it |
| @capacitor-community/keep-awake | @capgo/capacitor-keep-awake | Community plugin is more established, same API |
| QExpansionItem | Custom collapse | QExpansionItem handles animations and accessibility |
| CSS scroll-snap | QCarousel for Deuteros | scroll-snap is simpler for 2-item choice, already used in Phase 6 |

**Installation:**
```bash
# For native app screen wake lock
npm install @capacitor-community/keep-awake
npx cap sync
```

## Architecture Patterns

### Recommended Project Structure
```
src/modules/training/
├── pages/
│   ├── DayPlayer.vue          # Main player page (replaces placeholder)
│   └── WeeklyView.vue         # Existing (Phase 6)
├── components/
│   ├── player/                # NEW: Day Player components
│   │   ├── BlockHeader.vue    # Block title with accent color
│   │   ├── ExerciseList.vue   # Collapsible exercise list
│   │   ├── ExerciseCard.vue   # Expanded exercise detail
│   │   ├── VideoPlaceholder.vue   # Video area with placeholder
│   │   ├── DeuterosChoice.vue # Swipeable 2-option selector
│   │   ├── SplashScreen.vue   # Motivational entry splash
│   │   └── ProgressBar.vue    # 4-block progress indicator
│   └── WeekCarousel.vue       # Existing (Phase 6)
├── composables/
│   ├── useSessionPlayer.ts    # NEW: Session playback state
│   ├── useWakeLock.ts         # NEW: Screen wake lock management
│   └── useDateNavigation.ts   # Existing (Phase 6)
├── stores/
│   ├── sessionPlayerStore.ts  # NEW: Persistent player state
│   └── weekStore.ts           # Existing (Phase 6)
└── utils/
    ├── blockColors.ts         # Existing - extend for accent classes
    └── routeNames.ts          # Existing (Phase 6)
```

### Pattern 1: Session Player Composable
**What:** Centralized composable managing current block, exercise selection, elapsed time, and block completion state
**When to use:** Main DayPlayer.vue page and all player sub-components
**Example:**
```typescript
// Source: Composition API pattern from Phase 6 research
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import type { Session, Block, BlockRole } from '../types/session'

export function useSessionPlayer(session: Session) {
  const store = useSessionPlayerStore()

  // Current state
  const currentBlockIndex = ref(store.getCurrentBlockIndex(session.dayId) || 0)
  const selectedExerciseIndex = ref(0)
  const elapsedSeconds = ref(0)

  // Computed for flow (4 blocks since Deuteros is one choice)
  const blockFlow = computed(() => {
    const blocks = session.blocks
    // After Deuteros choice, filter to selected one
    const deuterosChoice = store.getDeuterosChoice(session.dayId)
    if (deuterosChoice) {
      return blocks.filter(b =>
        b.role !== 'DEUTEROS_1' && b.role !== 'DEUTEROS_2' ||
        b.role === deuterosChoice
      )
    }
    // Before choice, show all including both Deuteros for choice screen
    return blocks
  })

  const currentBlock = computed(() => blockFlow.value[currentBlockIndex.value])
  const currentExercise = computed(() =>
    currentBlock.value?.exercises[selectedExerciseIndex.value]
  )

  // Progress (out of 4 blocks)
  const completedBlocks = ref(store.getCompletedBlocks(session.dayId) || [])
  const progressPercent = computed(() =>
    (completedBlocks.value.length / 4) * 100
  )

  // Timer
  let timerInterval: ReturnType<typeof setInterval> | null = null

  function startTimer() {
    timerInterval = setInterval(() => {
      elapsedSeconds.value++
    }, 1000)
  }

  function pauseTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  // Block completion
  function completeBlock() {
    const block = currentBlock.value
    if (!block) return

    completedBlocks.value.push(block.role)
    store.saveCompletedBlock(session.dayId, block.role)

    selectedExerciseIndex.value = 0
    currentBlockIndex.value++
    store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value)
  }

  // Deuteros selection
  function selectDeuteros(choice: 'DEUTEROS_1' | 'DEUTEROS_2') {
    store.saveDeuterosChoice(session.dayId, choice)
  }

  // Cleanup
  onUnmounted(() => pauseTimer())

  return {
    currentBlock,
    currentExercise,
    blockFlow,
    completedBlocks,
    progressPercent,
    elapsedSeconds,
    selectedExerciseIndex,
    startTimer,
    pauseTimer,
    completeBlock,
    selectDeuteros,
  }
}
```

### Pattern 2: Screen Wake Lock Composable
**What:** Abstraction over Screen Wake Lock API with Capacitor fallback
**When to use:** DayPlayer.vue to keep screen awake during workout
**Example:**
```typescript
// Source: MDN Screen Wake Lock API + @capacitor-community/keep-awake
import { ref, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'

// Conditionally import Capacitor plugin
let KeepAwake: typeof import('@capacitor-community/keep-awake').KeepAwake | null = null
if (Capacitor.isNativePlatform()) {
  import('@capacitor-community/keep-awake').then(m => {
    KeepAwake = m.KeepAwake
  })
}

export function useWakeLock() {
  const isActive = ref(false)
  const isSupported = ref(false)
  let wakeLockSentinel: WakeLockSentinel | null = null

  async function requestWakeLock() {
    if (isActive.value) return

    try {
      // Native app: use Capacitor plugin
      if (Capacitor.isNativePlatform() && KeepAwake) {
        await KeepAwake.keepAwake()
        isActive.value = true
        return
      }

      // Web: use Screen Wake Lock API
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await navigator.wakeLock.request('screen')
        isActive.value = true

        wakeLockSentinel.addEventListener('release', () => {
          isActive.value = false
          wakeLockSentinel = null
        })
      }
    } catch (err) {
      console.warn('Wake lock request failed:', err)
    }
  }

  async function releaseWakeLock() {
    try {
      if (Capacitor.isNativePlatform() && KeepAwake) {
        await KeepAwake.allowSleep()
        isActive.value = false
        return
      }

      if (wakeLockSentinel) {
        await wakeLockSentinel.release()
        wakeLockSentinel = null
        isActive.value = false
      }
    } catch (err) {
      console.warn('Wake lock release failed:', err)
    }
  }

  // Re-acquire on visibility change (browser releases on tab hidden)
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && !isActive.value) {
      requestWakeLock()
    }
  }

  onMounted(() => {
    // Check support
    isSupported.value = 'wakeLock' in navigator || Capacitor.isNativePlatform()

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    releaseWakeLock()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    isActive,
    isSupported,
    requestWakeLock,
    releaseWakeLock,
  }
}
```

### Pattern 3: Exit Confirmation with Navigation Guard
**What:** Prevent accidental exit mid-block with confirmation dialog
**When to use:** DayPlayer.vue to warn user about unsaved progress
**Example:**
```vue
<!-- Source: Vue Router Composition API + Quasar Dialog -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const hasUnsavedProgress = ref(false)

// Vue Router navigation guard
onBeforeRouteLeave((to, from) => {
  if (!hasUnsavedProgress.value) return true

  return new Promise((resolve) => {
    $q.dialog({
      title: 'Salir del entrenamiento?',
      message: 'Tu progreso en este bloque se perdera. Puedes continuar desde el inicio del bloque actual mas tarde.',
      cancel: {
        label: 'Cancelar',
        flat: true,
      },
      ok: {
        label: 'Salir',
        color: 'negative',
      },
      persistent: true,
    }).onOk(() => {
      resolve(true) // Allow navigation
    }).onCancel(() => {
      resolve(false) // Block navigation
    })
  })
})

// Browser close/refresh warning
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (hasUnsavedProgress.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>
```

### Pattern 4: Video Placeholder with iOS Compatibility
**What:** Video element that auto-loops with proper iOS Safari attributes
**When to use:** Exercise video display area
**Example:**
```vue
<!-- Source: MDN Autoplay guide + iOS Safari requirements -->
<template>
  <div class="video-container">
    <!-- Placeholder when no video URL -->
    <div v-if="!videoUrl" class="video-placeholder">
      <q-icon name="videocam" size="48px" color="grey-5" />
      <div class="text-caption text-grey-6 q-mt-sm">Video proximamente</div>
    </div>

    <!-- Video element with all required attributes for iOS -->
    <video
      v-else
      ref="videoRef"
      class="video-player"
      autoplay
      loop
      muted
      playsinline
      :poster="posterUrl"
      @loadeddata="onVideoLoaded"
    >
      <source :src="videoUrl" type="video/mp4">
    </video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

interface Props {
  videoUrl?: string | null
  posterUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  videoUrl: null,
  posterUrl: '/img/video-poster-default.jpg',
})

const videoRef = ref<HTMLVideoElement | null>(null)

// Attempt programmatic play as fallback
function attemptAutoplay() {
  if (videoRef.value) {
    videoRef.value.play().catch(err => {
      console.log('Autoplay blocked:', err)
    })
  }
}

function onVideoLoaded() {
  attemptAutoplay()
}

// When video URL changes, attempt to play
watch(() => props.videoUrl, () => {
  if (props.videoUrl && videoRef.value) {
    videoRef.value.load()
    attemptAutoplay()
  }
})

onMounted(() => {
  attemptAutoplay()
})
</script>

<style scoped>
.video-container {
  width: 100%;
  height: 40vh;
  background: #000;
  position: relative;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
```

### Pattern 5: Deuteros Choice with CSS Scroll-Snap
**What:** Two-option swipeable selector for Deuteros 1 vs Deuteros 2
**When to use:** After Nucleus completion, before proceeding to Athlos
**Example:**
```vue
<!-- Source: CSS scroll-snap (used in Phase 6 WeekCarousel) -->
<template>
  <div class="deuteros-choice">
    <div class="deuteros-choice__header">
      <div class="text-h6 text-center q-mb-sm">Elige tu bloque Deuteros</div>
      <div class="text-caption text-grey-6 text-center">
        Desliza para ver las opciones
      </div>
    </div>

    <div class="deuteros-choice__cards" ref="cardsRef">
      <div
        v-for="option in options"
        :key="option.role"
        class="deuteros-choice__card"
        :class="{ 'deuteros-choice__card--selected': selected === option.role }"
        @click="selectOption(option.role)"
      >
        <div class="deuteros-choice__card-header" :class="getColorClass(option.role)">
          <div class="text-subtitle1 text-weight-bold">{{ option.label }}</div>
          <div class="text-caption">{{ option.route }}</div>
        </div>
        <div class="deuteros-choice__card-content">
          <div v-for="ex in option.exercises.slice(0, 3)" :key="ex.exerciseId" class="text-body2">
            {{ ex.exerciseName }}
          </div>
          <div v-if="option.exercises.length > 3" class="text-caption text-grey-6">
            +{{ option.exercises.length - 3 }} mas
          </div>
        </div>
      </div>
    </div>

    <div class="deuteros-choice__action q-pa-md">
      <q-btn
        color="primary"
        size="lg"
        unelevated
        :disable="!selected"
        class="full-width"
        @click="confirm"
      >
        Comenzar {{ selected === 'DEUTEROS_1' ? 'Deuteros 1' : 'Deuteros 2' }}
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Block, BlockRole } from '../types/session'
import { getBlockColorClass } from '../utils/blockColors'
import { getRouteName } from '../utils/routeNames'

interface Props {
  deuteros1: Block
  deuteros2: Block
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [choice: 'DEUTEROS_1' | 'DEUTEROS_2']
}>()

const selected = ref<'DEUTEROS_1' | 'DEUTEROS_2' | null>(null)

const options = computed(() => [
  {
    role: 'DEUTEROS_1' as const,
    label: 'Deuteros 1',
    route: getRouteName(props.deuteros1.route),
    exercises: props.deuteros1.exercises,
  },
  {
    role: 'DEUTEROS_2' as const,
    label: 'Deuteros 2',
    route: getRouteName(props.deuteros2.route),
    exercises: props.deuteros2.exercises,
  },
])

function getColorClass(role: BlockRole) {
  return getBlockColorClass(role)
}

function selectOption(role: 'DEUTEROS_1' | 'DEUTEROS_2') {
  selected.value = role
}

function confirm() {
  if (selected.value) {
    emit('select', selected.value)
  }
}
</script>

<style scoped lang="scss">
.deuteros-choice {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__cards {
    flex: 1;
    display: flex;
    gap: 16px;
    padding: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  &__card {
    flex-shrink: 0;
    width: 85%;
    border-radius: 16px;
    background: white;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    scroll-snap-align: center;
    transition: transform 0.3s ease, box-shadow 0.3s ease;

    &--selected {
      transform: scale(1.02);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    }
  }

  &__card-header {
    padding: 16px;
  }

  &__card-content {
    padding: 16px;
  }
}
</style>
```

### Pattern 6: Block-Specific Accent Colors (Extended)
**What:** Extend existing blockColors.ts with text/border accent classes
**When to use:** Block headers, progress indicators, buttons
**Example:**
```typescript
// Source: Existing blockColors.ts pattern
import type { BlockRole } from '../types/session'

// Existing background colors
export function getBlockColorClass(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'bg-light-blue-1',
    NUCLEUS: 'bg-purple-1',
    DEUTEROS_1: 'bg-cyan-1',
    DEUTEROS_2: 'bg-deep-purple-1',
    ATHLOS_EPIKOS: 'bg-amber-1',
  }
  return colorMap[role] || 'bg-grey-1'
}

// NEW: Accent colors for text/buttons
export function getBlockAccentColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'light-blue',       // Quasar color name
    NUCLEUS: 'purple',           // Primary work - purple
    DEUTEROS_1: 'cyan',
    DEUTEROS_2: 'deep-purple',
    ATHLOS_EPIKOS: 'amber',
  }
  return colorMap[role] || 'grey'
}

// NEW: CSS variable colors for dynamic styling
export function getBlockCSSColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: '#03A9F4',          // light-blue
    NUCLEUS: '#9C27B0',          // purple
    DEUTEROS_1: '#00BCD4',       // cyan
    DEUTEROS_2: '#673AB7',       // deep-purple
    ATHLOS_EPIKOS: '#FFC107',    // amber
  }
  return colorMap[role] || '#9E9E9E'
}
```

### Anti-Patterns to Avoid
- **Full session state in component:** Don't store all playback state in component refs. Use Pinia store for persistence across route navigation and app restart.
- **Forgetting iOS video attributes:** Don't omit `playsinline` or `muted`. Video won't autoplay on iOS without all four: `autoplay loop muted playsinline`.
- **Wake lock without cleanup:** Don't request wake lock without releasing on unmount. Screen stays awake indefinitely, draining battery.
- **Sync navigation guard:** Don't use async/await directly in onBeforeRouteLeave. Return a Promise that resolves to boolean.
- **Hardcoded 5-block progress:** Don't assume 5 blocks for progress bar. User completes 4 blocks (one Deuteros chosen).
- **Losing Deuteros choice:** Don't forget to persist Deuteros selection. If user exits and resumes, they shouldn't re-choose.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keep screen awake | Custom video hack (NoSleep.js pattern) | Screen Wake Lock API + Capacitor plugin | Native API is cleaner, more reliable, supported in 94.48% of browsers |
| Swipeable selector | Custom touch event handlers | CSS scroll-snap | GPU-accelerated, smooth, already used in Phase 6 |
| Exit confirmation | window.confirm() | Quasar Dialog + onBeforeRouteLeave | Better UX, consistent styling, handles both route and browser close |
| Progress indicator | Custom SVG/CSS | QLinearProgress | Built-in, themeable, accessible |
| Expandable exercise list | Custom v-show toggle | QExpansionItem | Animations, accessibility, consistent with Phase 6 BlockCard |
| Timer display | setInterval + manual formatting | Intl.DateTimeFormat or date-fns | Locale-aware, handles edge cases |
| Block state persistence | localStorage directly | Pinia with @capacitor/preferences | Cross-platform, reactive, type-safe |

**Key insight:** The existing codebase already solves many of these problems. Phase 6 established patterns with CSS scroll-snap, QExpansionItem, Pinia stores, and block color utilities. Extend rather than rebuild.

## Common Pitfalls

### Pitfall 1: Wake Lock Released on Tab Switch
**What goes wrong:** Screen wake lock is automatically released when user switches tabs or locks phone
**Why it happens:** Browser policy releases wake locks when document becomes hidden
**How to avoid:** Listen for `visibilitychange` event and re-request wake lock when document becomes visible again
**Warning signs:** Screen dims/locks during workout when user briefly checks a notification

### Pitfall 2: iOS Video Autoplay Blocked
**What goes wrong:** Exercise demonstration videos don't play on iOS Safari
**Why it happens:** iOS requires `playsinline` and `muted` attributes for autoplay. Sound videos cannot autoplay.
**How to avoid:** Always include all four attributes: `autoplay loop muted playsinline`. Use poster image for loading state.
**Warning signs:** Black video container on iOS, video plays fine on Android/desktop

### Pitfall 3: Lost Session Progress on Navigation
**What goes wrong:** User accidentally navigates away, loses all workout progress
**Why it happens:** State only in component, not persisted. No exit confirmation.
**How to avoid:** Persist block-level progress to Pinia store (with @capacitor/preferences for native). Add onBeforeRouteLeave guard with confirmation.
**Warning signs:** Users report lost progress, frustrated when accidentally tapping back

### Pitfall 4: Incorrect Block Count in Progress
**What goes wrong:** Progress bar shows 20% per block completion (5 blocks), but user only does 4
**Why it happens:** Forgetting that user chooses ONE of Deuteros 1/2, not both
**How to avoid:** Progress based on 4 blocks: Initium (25%), Nucleus (50%), Deuteros (75%), Athlos (100%)
**Warning signs:** Progress jumps from 75% to 100% after Athlos, skipping expected Deuteros 2

### Pitfall 5: Deuteros Choice Persisted Incorrectly
**What goes wrong:** User resumes session but is shown Deuteros choice again
**Why it happens:** Deuteros selection not saved, or saved to wrong session ID
**How to avoid:** Save Deuteros choice keyed by session dayId. Check on resume and skip choice screen if already selected.
**Warning signs:** Users report "choosing Deuteros again" when resuming

### Pitfall 6: Exit Confirmation Fires After Completion
**What goes wrong:** User finishes session, gets "unsaved changes" warning when leaving
**Why it happens:** `hasUnsavedProgress` flag not reset after block/session completion
**How to avoid:** Clear flag when completing a block or session. Guard should only fire mid-block.
**Warning signs:** Unnecessary confirmation dialogs when workout is complete

### Pitfall 7: Timer Continues After Exit
**What goes wrong:** Elapsed time keeps incrementing even after user leaves Day Player
**Why it happens:** setInterval not cleared on component unmount or route leave
**How to avoid:** Clear interval in onUnmounted and when pausing. Store last elapsed time to Pinia for resume.
**Warning signs:** Timer shows 45 minutes when user only worked out for 10

### Pitfall 8: Video Flicker on Exercise Change
**What goes wrong:** Video area flashes black when switching exercises
**Why it happens:** Video element removed and re-created, or src changed without proper handling
**How to avoid:** Keep video element mounted, change only :src. Use poster for loading state. Call load() then play().
**Warning signs:** Jarring black flashes during workout, feels unpolished

## Code Examples

Verified patterns from official sources:

### Session Player Store with Persistence
```typescript
// Source: Pinia Composition API + @capacitor/preferences
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import type { BlockRole } from '../types/session'

interface SessionProgress {
  currentBlockIndex: number
  completedBlocks: BlockRole[]
  deuterosChoice: 'DEUTEROS_1' | 'DEUTEROS_2' | null
  elapsedSeconds: number
}

export const useSessionPlayerStore = defineStore('sessionPlayer', () => {
  const progress = ref<Map<string, SessionProgress>>(new Map())

  // Load progress from persistent storage
  async function loadProgress(dayId: string): Promise<SessionProgress | null> {
    if (progress.value.has(dayId)) {
      return progress.value.get(dayId)!
    }

    const { value } = await Preferences.get({ key: `session_${dayId}` })
    if (value) {
      const parsed = JSON.parse(value) as SessionProgress
      progress.value.set(dayId, parsed)
      return parsed
    }
    return null
  }

  // Save progress to persistent storage
  async function saveProgress(dayId: string, data: Partial<SessionProgress>) {
    const existing = progress.value.get(dayId) || {
      currentBlockIndex: 0,
      completedBlocks: [],
      deuterosChoice: null,
      elapsedSeconds: 0,
    }
    const updated = { ...existing, ...data }
    progress.value.set(dayId, updated)

    await Preferences.set({
      key: `session_${dayId}`,
      value: JSON.stringify(updated),
    })
  }

  // Clear progress after session completion
  async function clearProgress(dayId: string) {
    progress.value.delete(dayId)
    await Preferences.remove({ key: `session_${dayId}` })
  }

  // Convenience getters
  function getCurrentBlockIndex(dayId: string): number {
    return progress.value.get(dayId)?.currentBlockIndex || 0
  }

  function getCompletedBlocks(dayId: string): BlockRole[] {
    return progress.value.get(dayId)?.completedBlocks || []
  }

  function getDeuterosChoice(dayId: string): 'DEUTEROS_1' | 'DEUTEROS_2' | null {
    return progress.value.get(dayId)?.deuterosChoice || null
  }

  // Convenience setters
  function saveCurrentBlockIndex(dayId: string, index: number) {
    saveProgress(dayId, { currentBlockIndex: index })
  }

  function saveCompletedBlock(dayId: string, block: BlockRole) {
    const completed = getCompletedBlocks(dayId)
    if (!completed.includes(block)) {
      saveProgress(dayId, { completedBlocks: [...completed, block] })
    }
  }

  function saveDeuterosChoice(dayId: string, choice: 'DEUTEROS_1' | 'DEUTEROS_2') {
    saveProgress(dayId, { deuterosChoice: choice })
  }

  return {
    progress,
    loadProgress,
    saveProgress,
    clearProgress,
    getCurrentBlockIndex,
    getCompletedBlocks,
    getDeuterosChoice,
    saveCurrentBlockIndex,
    saveCompletedBlock,
    saveDeuterosChoice,
  }
})
```

### Elapsed Time Display
```typescript
// Source: Standard time formatting pattern
export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}
```

### Progress Bar Component
```vue
<!-- Source: Quasar QLinearProgress docs -->
<template>
  <div class="session-progress">
    <q-linear-progress
      :value="progress"
      :color="currentBlockColor"
      track-color="grey-3"
      size="8px"
      rounded
      class="session-progress__bar"
    />
    <div class="session-progress__labels">
      <span
        v-for="(block, index) in blockLabels"
        :key="block"
        class="session-progress__label"
        :class="{ 'session-progress__label--completed': index < completedCount }"
      >
        {{ block }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getBlockAccentColor } from '../utils/blockColors'
import type { BlockRole } from '../types/session'

interface Props {
  completedBlocks: BlockRole[]
  currentBlock: BlockRole
}

const props = defineProps<Props>()

const blockLabels = ['Initium', 'Nucleus', 'Deuteros', 'Athlos']

const completedCount = computed(() => props.completedBlocks.length)
const progress = computed(() => completedCount.value / 4)
const currentBlockColor = computed(() => getBlockAccentColor(props.currentBlock))
</script>

<style scoped lang="scss">
.session-progress {
  padding: 8px 16px;

  &__labels {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
  }

  &__label {
    font-size: 10px;
    color: #9e9e9e;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    &--completed {
      color: var(--q-positive);
      font-weight: 600;
    }
  }
}
</style>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NoSleep.js video hack | Screen Wake Lock API | 2022 (Safari 16.4 support) | Native, cleaner, more reliable |
| Custom touch handlers | CSS scroll-snap | 2022 (Safari support) | GPU-accelerated, smoother |
| window.confirm() for exit | Quasar Dialog + route guards | Framework standard | Better UX, consistent styling |
| Component state only | Pinia + @capacitor/preferences | Pinia 3.0 | Persistent, reactive, cross-platform |
| Video without playsinline | All four attributes required | iOS policy | Required for iOS autoplay |

**Deprecated/outdated:**
- **NoSleep.js pattern (hidden video):** Screen Wake Lock API now supported in 94.48% of browsers. Use native API.
- **Custom swipe detection:** CSS scroll-snap and Quasar touch directives handle all edge cases.
- **Storing in localStorage directly:** Use @capacitor/preferences for cross-platform persistence in Capacitor apps.

## Open Questions

Things that couldn't be fully resolved:

1. **Splash screen animation details**
   - What we know: Motivational splash on entry, 3-4 seconds, auto-proceeds
   - What's unclear: Exact content, animation style, whether to show different messages
   - Recommendation: Start simple - session info + "Let's go!" message. Can enhance later.

2. **Video placeholder design**
   - What we know: ~40% screen height, persistent, shows placeholder when no video
   - What's unclear: What the placeholder should show (icon? exercise name? animation?)
   - Recommendation: Simple icon + "Video proximamente" text. Keep it minimal.

3. **Resume behavior after completion**
   - What we know: Block-level resume means resume at start of current block
   - What's unclear: What happens if user completed all blocks but didn't finish session? Can they re-enter?
   - Recommendation: Mark session complete after all 4 blocks. Entering again shows read-only summary (defer to Phase 9).

4. **Collapsed vs expanded exercise default**
   - What we know: Collapsed list with expand, first exercise auto-expanded
   - What's unclear: Should tapping another exercise collapse the current one (accordion)?
   - Recommendation: Use accordion behavior (one expanded at a time) for simplicity.

## Sources

### Primary (HIGH confidence)
- [MDN Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) - Full API documentation, lifecycle, caveats
- [Can I Use Wake Lock](https://caniuse.com/wake-lock) - Browser support (94.48%, Safari 16.4+)
- [@capacitor-community/keep-awake](https://github.com/capacitor-community/keep-awake) - Capacitor plugin v8.0.0 API
- [Quasar QCarousel](https://quasar.dev/vue-components/carousel/) - Carousel component for potential Deuteros choice
- [Quasar Dialog Plugin](https://quasar.dev/quasar-plugins/dialog/) - Exit confirmation dialogs
- [Vue Router Composition API](https://router.vuejs.org/guide/advanced/composition-api.html) - onBeforeRouteLeave guard
- [MDN Autoplay Guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) - Video autoplay policies
- Existing codebase: WeekCarousel.vue, BlockCard.vue, blockColors.ts, weekStore.ts

### Secondary (MEDIUM confidence)
- [Chrome Wake Lock Article](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock) - Implementation guidance
- [iOS Safari Autoplay Fixes](https://www.hulkapps.com/blogs/ecommerce-hub/how-to-fix-html5-video-autoplay-issues-in-safari-and-ios-devices) - playsinline requirement
- [Fitness App UX Best Practices](https://stormotion.io/blog/fitness-app-ux/) - Design patterns for workout apps

### Tertiary (LOW confidence)
- [vue3-card-stack](https://github.com/Mrjing/vue3-card-stack) - Swipeable cards (not using, CSS scroll-snap preferred)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use or verified official plugins
- Architecture: HIGH - Patterns based on existing Phase 6 code + official docs
- Pitfalls: HIGH - Wake lock lifecycle, iOS video, and navigation guards well-documented
- State management: HIGH - Pinia + @capacitor/preferences pattern established

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - Screen Wake Lock API is stable, Capacitor plugin actively maintained)
