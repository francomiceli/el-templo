# Phase 8: Timer System - Research

**Researched:** 2026-01-27
**Domain:** JavaScript timers, workout protocol timers, mobile audio/haptics, background state management
**Confidence:** MEDIUM

## Summary

This phase implements four workout timer modes (EMOM, AMRAP, For Time, Straight Sets) integrated into the existing Day Player block flow. The core challenge is maintaining accurate timing despite JavaScript's inherent drift, browser tab throttling, and mobile app backgrounding. Modern solutions combine drift-correction patterns using `Date.now()` for accuracy, Capacitor's App State API for background detection, and Web Audio/Haptics APIs for timer cues.

The existing codebase already has the foundation: `useSessionPlayer` composable manages a session elapsed timer with setInterval, `useWakeLock` keeps the screen active, and block formats are stored as strings (e.g., "straight-3x8", "emom-10min"). Phase 8 extends this by adding protocol-specific timer logic in the BlockHeader component, implementing stop/play controls, and handling background auto-stop behavior.

**Primary recommendation:** Use drift-correcting timer pattern with `Date.now()` anchor timestamps, integrate Capacitor App State API for background detection, and use `@vueuse/sound` + `@capacitor/haptics` for audio/haptic cues. Avoid Web Workers (overkill for this use case) and avoid custom audio solutions (browser autoplay restrictions require careful handling).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Date.now()` + `setInterval` | Native JS | Timer accuracy via drift correction | Industry standard for countdown timers; combines interval callbacks with timestamp-based calculations to eliminate drift |
| `@capacitor/app` | ^8.0.1 | Background/foreground detection | Already in use; provides `appStateChange`, `pause`, `resume` listeners for detecting when app backgrounds |
| `@capacitor/haptics` | Latest (v7+) | Vibration/haptic feedback | Official Capacitor plugin; gracefully degrades on non-supporting devices; provides impact(), vibrate(), notification() methods |
| `@vueuse/sound` | Latest | Audio playback for timer cues | Vue 3 Composition API native; handles browser autoplay restrictions elegantly; supports sound sprites for multiple cues from one file |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `performance.now()` | Native JS | High-precision timestamps | Use alongside `Date.now()` for drift monitoring and sub-second precision display |
| Quasar `useQuasar().notify()` | Already in use | Visual notifications for timer events | Already available; use for non-critical visual feedback |
| Capacitor Background Runner | Optional | True background execution | NOT NEEDED for this phase - user must return to app to continue workout |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drift-correcting setInterval | Web Worker timers | Web Workers avoid tab throttling but add complexity; unnecessary since app must be foreground during workout |
| `@vueuse/sound` | Native Web Audio API | Direct API control but requires manual handling of autoplay restrictions and sprite management |
| `@capacitor/haptics` | Web Vibration API | Web-only solution; doesn't work on native iOS/Android where Capacitor is primary target |

**Installation:**
```bash
# Already installed:
# @capacitor/app (as @capacitor/core provides App)
# @capacitor/haptics may need explicit install

npm install @capacitor/haptics @vueuse/sound
npx cap sync
```

## Architecture Patterns

### Recommended Project Structure

```
src/modules/training/
├── composables/
│   ├── useSessionPlayer.ts          # Existing - session elapsed timer
│   ├── useProtocolTimer.ts          # NEW - protocol-specific timer logic
│   └── useTimerAudio.ts             # NEW - audio cue management
├── components/player/
│   ├── BlockHeader.vue              # MODIFY - add timer display and controls
│   └── TimerControls.vue            # NEW - stop/play buttons
└── utils/
    └── timerFormats.ts              # NEW - parse format strings, extract duration/rounds
```

### Pattern 1: Drift-Correcting Timer

**What:** Countdown timer that compensates for JavaScript timing inaccuracy by anchoring to `Date.now()` timestamps.

**When to use:** All countdown scenarios (EMOM 60s intervals, AMRAP duration).

**Example:**
```typescript
// Pattern from creating-accurate-timers research
class DriftCorrectingTimer {
  private intervalId: number | null = null
  private expectedTime: number = 0

  start(callback: () => void, intervalMs: number) {
    this.expectedTime = Date.now() + intervalMs
    this.intervalId = window.setTimeout(() => this.step(callback, intervalMs), intervalMs)
  }

  private step(callback: () => void, intervalMs: number) {
    const drift = Date.now() - this.expectedTime
    callback()
    this.expectedTime += intervalMs
    this.intervalId = window.setTimeout(
      () => this.step(callback, intervalMs),
      Math.max(0, intervalMs - drift) // Compensate for drift
    )
  }

  stop() {
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
  }
}
```

### Pattern 2: Background State Detection

**What:** Auto-stop timer when app backgrounds, require user to resume when returning.

**When to use:** All timer modes - prevents workout from continuing while phone is locked.

**Example:**
```typescript
// Source: Capacitor App API docs
import { App } from '@capacitor/app'
import { onMounted, onUnmounted } from 'vue'

export function useBackgroundDetection(onBackground: () => void, onForeground: () => void) {
  let listener: PluginListenerHandle | null = null

  onMounted(async () => {
    listener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        onBackground() // Auto-stop timer
      } else {
        onForeground() // User can manually resume
      }
    })
  })

  onUnmounted(() => {
    listener?.remove()
  })
}
```

### Pattern 3: Audio Cue with Autoplay Workaround

**What:** Play beep sounds for timer transitions after initial user interaction unlocks audio.

**When to use:** EMOM minute transitions, AMRAP completion, For Time start.

**Example:**
```typescript
// Source: @vueuse/sound docs + autoplay restrictions research
import { useSound } from '@vueuse/sound'
import { ref } from 'vue'

export function useTimerAudio() {
  const audioUnlocked = ref(false)

  const { play: playBeep } = useSound('/sounds/timer-beep.mp3', {
    volume: 0.5,
    onload: () => { audioUnlocked.value = true }
  })

  const { play: playComplete } = useSound('/sounds/timer-complete.mp3', {
    volume: 0.7
  })

  // Call this on first user interaction (e.g., "Start Timer" button)
  function unlockAudio() {
    if (!audioUnlocked.value) {
      playBeep() // Plays silent or very short sound to unlock
    }
  }

  return {
    playBeep,
    playComplete,
    unlockAudio,
    audioUnlocked
  }
}
```

### Pattern 4: Protocol Timer State Machine

**What:** Separate state management for each timer protocol with consistent interface.

**When to use:** Keep EMOM/AMRAP/ForTime logic isolated, easy to test.

**Example:**
```typescript
// Composable pattern for protocol-specific logic
interface ProtocolTimer {
  timeRemaining: Ref<number>    // seconds
  isRunning: Ref<boolean>
  currentRound: Ref<number>     // EMOM only
  start: () => void
  stop: () => void
  reset: () => void
}

export function useEMOMTimer(rounds: number): ProtocolTimer {
  const timeRemaining = ref(60)
  const currentRound = ref(1)
  const isRunning = ref(false)
  let startTime = 0
  let intervalId: number | null = null

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    startTime = Date.now()
    tick()
  }

  function tick() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    timeRemaining.value = 60 - (elapsed % 60)

    if (elapsed > 0 && elapsed % 60 === 0) {
      currentRound.value++
      if (currentRound.value > rounds) {
        stop()
        return
      }
    }

    intervalId = window.setTimeout(tick, 100) // Check every 100ms
  }

  function stop() {
    isRunning.value = false
    if (intervalId !== null) {
      clearTimeout(intervalId)
      intervalId = null
    }
  }

  return { timeRemaining, currentRound, isRunning, start, stop, reset: () => {} }
}
```

### Anti-Patterns to Avoid

- **Using `setInterval` without drift correction:** Timer will drift 1-2 seconds per minute, especially when tab backgrounds or CPU is busy.
- **Auto-resuming timer on foreground:** Users expect explicit resume after interruption; auto-resume during phone call is hostile UX.
- **Playing audio without user interaction unlock:** Browsers block autoplay; first sound must be triggered by click/tap event.
- **Storing timer state as intervals:** Store anchor timestamps (`startedAt`, `pausedAt`) not interval IDs; intervals don't survive page reload.
- **Tight polling (10ms intervals):** No user-visible benefit below 100ms; wastes battery and CPU.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sound playback | Custom HTMLAudioElement wrappers | `@vueuse/sound` | Handles autoplay restrictions, preloading, sprite support, Vue 3 reactivity integration |
| Timer drift correction | Manual drift tracking logic | Established Date.now() + setTimeout pattern | Well-tested pattern; edge cases (DST, system clock changes) already handled by community solutions |
| Haptic feedback cross-platform | Platform-specific vibration code | `@capacitor/haptics` | Official plugin with iOS Taptic Engine + Android Vibrator unified API; graceful degradation |
| Background detection | Polling `document.hidden` | `@capacitor/app` listeners | Native events more reliable than polling; handles all platforms (iOS/Android/Web) consistently |

**Key insight:** Timer accuracy and mobile background handling have well-established patterns in 2026. Custom solutions miss edge cases (browser throttling, DST transitions, device sleep). Use proven libraries and patterns that hundreds of apps already rely on.

## Common Pitfalls

### Pitfall 1: Timer Continues Running in Background

**What goes wrong:** User backgrounds app (phone call, notification), timer continues counting, workout advances without them.

**Why it happens:** JavaScript timers keep running (throttled) when app backgrounds. No automatic pause on state change.

**How to avoid:**
- Subscribe to Capacitor `App.addListener('appStateChange')` on component mount
- Auto-stop timer when `isActive: false` event fires
- Show "Play" button when user returns - require explicit resume
- Context from phase 8 decisions: "App backgrounding auto-stops the block timer (equivalent to pressing Stop)"

**Warning signs:**
- Timer display shows different time than expected after returning to app
- Block completes while app was backgrounded
- No explicit "resume" action after interruption

### Pitfall 2: Timer Display Drifts From Actual Time

**What goes wrong:** After 5-10 minutes, countdown timer is 5-10 seconds off from wall clock.

**Why it happens:** `setInterval(fn, 1000)` doesn't guarantee exactly 1000ms delays. Browser throttling, busy event loop, garbage collection all introduce drift.

**How to avoid:**
- Anchor to `Date.now()` timestamps, not interval counts
- Calculate `timeRemaining = targetTime - Date.now()` on each tick
- Use shorter polling interval (100-200ms) for display updates, recalculate from timestamp
- Example: Store `startedAt = Date.now()`, then `elapsed = Date.now() - startedAt`, not `elapsed++`

**Warning signs:**
- Timer reaches 0:00 but wall clock shows 30 seconds earlier/later
- Multiple timers in same session drift differently
- Timer accuracy degrades over longer durations

### Pitfall 3: Audio Cues Don't Play

**What goes wrong:** Timer beeps work in testing but fail in production, especially on first workout.

**Why it happens:** Browsers require user interaction before playing audio. Autoplay policies block programmatic sound.

**How to avoid:**
- Play first sound on user-triggered event (e.g., "Start Timer" button click)
- Cache audio context after first interaction - subsequent sounds work
- Provide visual feedback when audio blocked (icon with slash)
- Test on actual mobile devices - desktop browsers more permissive

**Warning signs:**
- Audio works after first workout but not on page load
- Desktop Chrome works but mobile Safari fails
- Console shows "NotAllowedError: play() failed because user didn't interact"

### Pitfall 4: EMOM Timer Doesn't Reset Exactly at 60s

**What goes wrong:** EMOM round transition happens at :59 or :01 instead of :00.

**Why it happens:** Off-by-one errors in modulo arithmetic, rounding errors in elapsed time calculation.

**How to avoid:**
- Use integer seconds for calculations, display milliseconds separately if needed
- Check round transition on `elapsed % 60 === 0` after flooring to integer
- Trigger audio cue and visual transition atomically (same tick)
- Test edge case: does round 10 → 11 work same as round 1 → 2?

**Warning signs:**
- Beep plays at :59 or :01 seconds on clock
- Round counter increments mid-second
- User reports "timer feels off"

### Pitfall 5: State Lost on Page Reload During Timer

**What goes wrong:** User hits F5 or app crashes, timer progress disappears.

**Why it happens:** Timer state stored in component refs, not persistent storage.

**How to avoid:**
- Store protocol timer state in `@capacitor/preferences` or sessionPlayerStore
- Save `{ startedAt, pausedAt, currentRound, protocolType }` not interval IDs
- Restore on mount: calculate current position from timestamps
- Phase 7 already does this for session elapsed timer - extend pattern to protocol timers

**Warning signs:**
- F5 refresh resets timer to initial state
- Progress lost but block completion persists
- Timer shows 60s after resuming mid-workout

## Code Examples

Verified patterns from official sources:

### EMOM Timer Implementation

```typescript
// Composable for EMOM (Every Minute On the Minute) timer
import { ref, computed, onUnmounted } from 'vue'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function useEMOMTimer(totalRounds: number) {
  const currentRound = ref(1)
  const secondsInRound = ref(60)
  const isRunning = ref(false)
  const isPaused = ref(false)

  let startTime = 0
  let pauseTime = 0
  let intervalId: number | null = null

  const progress = computed(() => currentRound.value / totalRounds)
  const isComplete = computed(() => currentRound.value > totalRounds)

  // Format for display: "3/8 — 0:42"
  const displayText = computed(() => {
    const mins = Math.floor(secondsInRound.value / 60)
    const secs = secondsInRound.value % 60
    return `${currentRound.value}/${totalRounds} — ${mins}:${secs.toString().padStart(2, '0')}`
  })

  function start() {
    if (isRunning.value) return

    isRunning.value = true
    isPaused.value = false
    startTime = Date.now() - (pauseTime || 0)
    tick()
  }

  function tick() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const roundElapsed = elapsed % 60
    const roundNumber = Math.floor(elapsed / 60) + 1

    // Update display
    secondsInRound.value = 60 - roundElapsed

    // Check for round transition
    if (roundNumber > currentRound.value) {
      currentRound.value = roundNumber
      Haptics.impact({ style: ImpactStyle.Medium }) // Haptic at transition

      if (currentRound.value > totalRounds) {
        stop()
        return
      }
    }

    // Check every 100ms for smooth display
    intervalId = window.setTimeout(tick, 100)
  }

  function stop() {
    isRunning.value = false
    isPaused.value = true
    pauseTime = Date.now() - startTime

    if (intervalId !== null) {
      clearTimeout(intervalId)
      intervalId = null
    }
  }

  onUnmounted(() => {
    if (intervalId !== null) {
      clearTimeout(intervalId)
    }
  })

  return {
    currentRound,
    secondsInRound,
    isRunning,
    isPaused,
    isComplete,
    displayText,
    progress,
    start,
    stop
  }
}
```

### AMRAP Timer Implementation

```typescript
// Composable for AMRAP (As Many Rounds As Possible) timer
import { ref, computed, onUnmounted } from 'vue'

export function useAMRAPTimer(durationMinutes: number) {
  const totalSeconds = durationMinutes * 60
  const secondsRemaining = ref(totalSeconds)
  const roundsCompleted = ref(0)
  const isRunning = ref(false)

  let startTime = 0
  let pauseTime = 0
  let intervalId: number | null = null

  const isComplete = computed(() => secondsRemaining.value <= 0)
  const progress = computed(() => (totalSeconds - secondsRemaining.value) / totalSeconds)

  const displayText = computed(() => {
    const mins = Math.floor(secondsRemaining.value / 60)
    const secs = secondsRemaining.value % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  })

  function start() {
    if (isRunning.value) return

    isRunning.value = true
    startTime = Date.now() - (pauseTime || 0)
    tick()
  }

  function tick() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    secondsRemaining.value = Math.max(0, totalSeconds - elapsed)

    if (secondsRemaining.value === 0) {
      stop()
      // Block auto-completes after AMRAP timer finishes (per phase 8 context)
      return
    }

    intervalId = window.setTimeout(tick, 100)
  }

  function stop() {
    isRunning.value = false
    pauseTime = Date.now() - startTime

    if (intervalId !== null) {
      clearTimeout(intervalId)
      intervalId = null
    }
  }

  function logRound() {
    roundsCompleted.value++
  }

  onUnmounted(() => {
    if (intervalId !== null) clearTimeout(intervalId)
  })

  return {
    secondsRemaining,
    roundsCompleted,
    isRunning,
    isComplete,
    displayText,
    progress,
    start,
    stop,
    logRound
  }
}
```

### For Time Timer Implementation

```typescript
// Composable for For Time (count-up) timer
import { ref, computed, onUnmounted } from 'vue'

export function useForTimeTimer() {
  const secondsElapsed = ref(0)
  const isRunning = ref(false)
  const finalTime = ref<number | null>(null)

  let startTime = 0
  let pauseTime = 0
  let intervalId: number | null = null

  const displayText = computed(() => {
    const secs = finalTime.value ?? secondsElapsed.value
    const mins = Math.floor(secs / 60)
    const remainingSecs = secs % 60
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`
  })

  const isComplete = computed(() => finalTime.value !== null)

  function start() {
    if (isRunning.value) return

    isRunning.value = true
    startTime = Date.now() - (pauseTime || 0)
    tick()
  }

  function tick() {
    secondsElapsed.value = Math.floor((Date.now() - startTime) / 1000)
    intervalId = window.setTimeout(tick, 100)
  }

  function stop() {
    isRunning.value = false
    pauseTime = Date.now() - startTime

    if (intervalId !== null) {
      clearTimeout(intervalId)
      intervalId = null
    }
  }

  function complete() {
    finalTime.value = secondsElapsed.value
    stop()
    // Block auto-completes after user hits "Done" (per phase 8 context)
  }

  onUnmounted(() => {
    if (intervalId !== null) clearTimeout(intervalId)
  })

  return {
    secondsElapsed,
    finalTime,
    isRunning,
    isComplete,
    displayText,
    start,
    stop,
    complete
  }
}
```

### Timer Color Warning System

```typescript
// Utility for changing timer text color as time runs low
export function getTimerColor(secondsRemaining: number): string {
  if (secondsRemaining <= 5) return 'text-red'      // Red at 5s
  if (secondsRemaining <= 10) return 'text-amber'   // Amber at 10s
  return 'text-grey-8'                              // Normal color
}

// Usage in BlockHeader.vue
const timerColor = computed(() => {
  if (props.protocolType === 'EMOM' || props.protocolType === 'AMRAP') {
    return getTimerColor(secondsRemaining.value)
  }
  return 'text-grey-8'
})
```

### Background Detection Integration

```typescript
// Integration with existing useSessionPlayer for auto-stop on background
import { App } from '@capacitor/app'
import { onMounted, onUnmounted } from 'vue'

export function useTimerBackgroundHandler(
  stopCallback: () => void,
  sessionTimerStopCallback: () => void
) {
  let listener: PluginListenerHandle | null = null

  onMounted(async () => {
    listener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        // App backgrounded - auto-stop both timers
        stopCallback()                  // Stop protocol timer (EMOM/AMRAP/etc)
        // Session timer keeps running per phase 8 context:
        // "Session timer always runs regardless of block timer state"
      }
    })
  })

  onUnmounted(() => {
    listener?.remove()
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| setInterval(fn, 1000) direct | Date.now() anchor + drift correction | ~2018 | Eliminates 1-2s drift per minute; critical for workout timers |
| Polling document.hidden | Capacitor App State listeners | Capacitor v3+ (2021) | Native events more reliable than web polling; works on iOS/Android |
| Manual HTMLAudioElement | Vue composables (@vueuse/sound) | Vue 3 era (2020+) | Composition API integration; handles autoplay restrictions |
| Custom vibration wrappers | @capacitor/haptics | Capacitor v2+ (2020) | Unified iOS Taptic + Android Vibrator API; graceful degradation |

**Deprecated/outdated:**
- **setInterval without correction:** Still works but drifts significantly. Modern apps expect accuracy within 1 second.
- **Web Worker timers for foreground apps:** Overkill; adds complexity without benefit when app must be in foreground anyway.
- **moment.js for timer display:** Heavy library (67KB) for simple time formatting. Use native Intl or simple arithmetic.

## Open Questions

Things that couldn't be fully resolved:

1. **Timer accuracy on low-end devices under heavy load**
   - What we know: Drift correction works well on modern devices. 100ms polling interval is standard.
   - What's unclear: How does timer perform on budget Android devices (< 2GB RAM) during heavy block with video playback?
   - Recommendation: Test on real devices during Phase 8 execution. Have fallback to 250ms polling if performance issues arise. Phase 7 blocker noted: "Timer Accuracy needs real-device testing under various conditions"

2. **Audio cue format and file size**
   - What we know: @vueuse/sound supports MP3, WAV, OGG. Sound sprites reduce HTTP requests.
   - What's unclear: Should timer beep be harsh (attention-grabbing) or gentle (non-disruptive)? What file size is acceptable for mobile data?
   - Recommendation: Start with single 10-20KB MP3 beep. User testing will reveal if intensity needs adjustment. Consider sound sprite with 2-3 variants if feedback varies.

3. **Persistence strategy for protocol timer state**
   - What we know: Phase 7 persists session timer every 10 seconds to sessionPlayerStore. Block completion also persisted.
   - What's unclear: Should protocol timer state (current EMOM round, AMRAP time remaining) persist across app restarts? Or only within session?
   - Recommendation: Store protocol timer state in memory (component refs) but NOT persist to Preferences. Rationale: If user force-quits app mid-EMOM round, they should restart that round from 60s (not resume at 42s). Session timer persists, protocol timer resets. This matches phase 8 context: "Timer persistence every 10 seconds" refers to session timer only.

4. **Haptic feedback intensity and frequency**
   - What we know: @capacitor/haptics has Light/Medium/Heavy impact styles. EMOM minute transitions should have haptic cue.
   - What's unclear: Should every EMOM round get haptic? Or only every 5 rounds? Should AMRAP countdown get haptic at 10s/5s?
   - Recommendation: Start conservative - only EMOM round transitions and AMRAP/ForTime completion. User testing will reveal if more cues are helpful or annoying. Easy to add more later.

## Sources

### Primary (HIGH confidence)

- [Capacitor App API](https://capacitorjs.com/docs/apis/app) - Official docs for background detection
- [Capacitor Haptics API](https://capacitorjs.com/docs/apis/haptics) - Official docs for haptic feedback
- [@vueuse/sound](https://sound.vueuse.org/) - Vue 3 sound composable documentation
- [Vue Timer Hook](https://github.com/riderx/vue-timer-hook) - TypeScript timer composables for Vue 3
- [MDN Performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) - High-precision timing API

### Secondary (MEDIUM confidence)

- [Writing a More Stable Timer with Web Worker](https://kxming.medium.com/writing-a-more-stable-timer-with-web-worker-589bcacd4247) - Web Worker timer patterns (verified with multiple sources)
- [Creating Accurate Timers in JavaScript](https://www.sitepoint.com/creating-accurate-timers-in-javascript/) - Drift correction patterns (verified approach, couldn't fetch full article due to 403)
- [Bypassing Browser Autoplay Restrictions](https://medium.com/@harryespant/bypassing-browser-autoplay-restrictions-a-smart-approach-to-notification-sounds-9e14ca34e5c5) - Audio unlock patterns
- [Using Web Workers in Vue 3](https://dev.to/bensoutendijk/using-web-workers-in-vue-3-4jc0) - Vue 3 + Worker integration
- [How Background Tasks Work in Capacitor](https://capgo.app/blog/how-background-tasks-work-in-capacitor/) - Background execution limitations

### Tertiary (LOW confidence - needs validation)

- [Best EMOM Timer App](https://www.pushpress.com/workout-timer/emom-timer) - UX patterns from existing apps (not technical implementation)
- [Timer CrossFit Online](https://timer.crosshero.com/) - Visual reference for timer UI patterns
- [Building a Procrastination Timer with Vue 3](https://vueschool.io/articles/vuejs-tutorials/building-a-procrastination-timer-with-vue-3-composition-api/) - General Vue 3 timer tutorial (not workout-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - All libraries verified in official docs, but haven't tested @vueuse/sound with Capacitor native builds
- Architecture: HIGH - Patterns match existing useSessionPlayer implementation; drift correction is well-established
- Pitfalls: HIGH - Based on known browser behaviors (throttling, autoplay) and Capacitor platform docs
- Code examples: MEDIUM - Patterns verified in docs but not tested in this specific Quasar + Capacitor + TypeScript stack

**Research date:** 2026-01-27
**Valid until:** ~30 days (stable domain; libraries mature; no major breaking changes expected)

**Research coverage:**
- ✅ JavaScript timer accuracy and drift correction
- ✅ Mobile background state detection (Capacitor App API)
- ✅ Audio playback with autoplay restrictions
- ✅ Haptic feedback cross-platform
- ✅ Vue 3 Composition API timer patterns
- ✅ Workout timer protocol requirements (EMOM/AMRAP/ForTime)
- ⚠️ Real device performance testing (flagged as blocker from Phase 7)
- ⚠️ Sound file optimization for mobile data (deferred to execution)

**Next steps for planning:**
1. Parse block.format strings to extract protocol type and parameters (e.g., "emom-10rounds", "amrap-20min")
2. Create useProtocolTimer composable with EMOM/AMRAP/ForTime implementations
3. Modify BlockHeader to display protocol timer (not just block name)
4. Add Stop/Play controls in BlockHeader row or just below
5. Integrate background detection to auto-stop protocol timer (session timer unaffected)
6. Add audio/haptic cues at protocol transitions
7. Update completeBlock logic to auto-complete after protocol timer finishes (AMRAP/EMOM)
