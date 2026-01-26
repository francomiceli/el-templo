# Phase 6: Weekly View - Research

**Researched:** 2026-01-26
**Domain:** Mobile-first horizontal calendar carousel with day navigation
**Confidence:** HIGH

## Summary

Phase 6 implements a horizontal swipe-based weekly calendar view that displays the member's 7-day training schedule (Lun-Dom) with today's session prominent and adjacent days peeking at reduced opacity. The interface combines a horizontal day carousel with a vertical block list for the centered day, allowing members to preview sessions and navigate to the Day Player.

The research focused on Quasar's carousel and touch components, CSS scroll snap for performance, date utilities for locale-aware week formatting (Spanish), expandable components for block previews, and mobile touch gesture best practices. The existing codebase uses Quasar Framework 2.16.0, Vue 3.5.22, and Pinia 3.0.4 with Composition API and TypeScript.

The standard approach is to use QCarousel for horizontal day navigation with v-model binding, CSS scroll-snap for smooth swipe behavior, QExpansionItem for expandable block lists, Quasar's date utils for Spanish locale formatting (Lunes-Domingo), and Pinia stores for managing selected day state. Performance optimizations include CSS transforms for GPU acceleration, overscroll-behavior for preventing scroll chaining, and v-memo for block list memoization.

**Primary recommendation:** Build the weekly view as a QCarousel component with controlled navigation, use CSS scroll-snap-type for smooth horizontal scrolling, implement block lists as QExpansionItem components within vertical QScrollArea, manage selected day state with Pinia store, and format dates with Quasar's date.formatDate using Spanish locale objects.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar Framework | 2.16.0 | UI components library | Already in use, provides QCarousel, QExpansionItem, touch directives |
| Vue 3 | 3.5.22 | Frontend framework | Already in use, Composition API for reactive state |
| Pinia | 3.0.4 | State management | Already in use, manages selected day and session data |
| TypeScript | 5.9.3 | Type safety | Already in use, compile-time guarantees |
| Quasar Date Utils | Built-in | Date formatting/manipulation | Built into Quasar, no external dependencies needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Quasar Touch Directives | Built-in | v-touch-swipe, v-touch-pan | Custom swipe handling if QCarousel insufficient |
| Capacitor Core | 7.4.5 | Native mobile APIs | Already in use for PWA/mobile builds |
| Axios | 1.13.2 | HTTP client | Already in use for session data fetching |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| QCarousel | Custom CSS scroll container | QCarousel provides navigation controls, autoplay, and accessibility out of the box |
| Quasar date utils | date-fns or dayjs | Quasar utils are lighter (no extra bundle), already available, support locale via third param |
| QExpansionItem | Custom v-show toggles | QExpansionItem provides animations, nested support, and accessibility |
| CSS scroll-snap | JavaScript scroll position | CSS is GPU-accelerated, smoother on mobile, less main thread work |

**Installation:**
No additional packages needed - all core functionality is already available in existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
src/modules/training/
├── pages/
│   ├── WeeklyView.vue         # Main weekly calendar page
│   ├── DayPlayer.vue           # Day player (Phase 7)
│   └── TrainingIndex.vue       # Current placeholder
├── components/
│   ├── WeekCarousel.vue        # Horizontal day carousel
│   ├── DayCard.vue             # Individual day card with state styles
│   ├── BlockList.vue           # Vertical list of blocks for centered day
│   ├── BlockCard.vue           # Expandable block card (QExpansionItem)
│   └── StartSessionButton.vue  # Fixed bottom CTA (today only)
├── composables/
│   ├── useWeekData.ts          # Fetch week session data
│   ├── useDateNavigation.ts    # Date utilities and week generation
│   └── useSessionState.ts      # Session completion state
├── stores/
│   └── weekStore.ts            # Pinia store for week/day state
└── types/
    └── session.ts              # Session, Block, Day types
```

### Pattern 1: QCarousel with v-model and Controlled Navigation
**What:** Use QCarousel with v-model binding to track centered day, disable swipe for completed/future days if needed
**When to use:** Main horizontal day carousel
**Example:**
```vue
<!-- Source: https://quasar.dev/vue-components/carousel/ -->
<template>
  <q-carousel
    v-model="selectedDay"
    animated
    swipeable
    control-color="primary"
    :autoplay="false"
    height="auto"
    class="week-carousel"
  >
    <q-carousel-slide
      v-for="day in weekDays"
      :key="day.date"
      :name="day.date"
      class="q-pa-none"
    >
      <DayCard :day="day" :is-today="isToday(day)" />
    </q-carousel-slide>
  </q-carousel>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWeekStore } from '../stores/weekStore'

const weekStore = useWeekStore()
const selectedDay = ref(weekStore.todayDate) // Auto-center on today

const weekDays = computed(() => weekStore.weekDays)

function isToday(day: Day): boolean {
  return day.date === weekStore.todayDate
}
</script>
```

### Pattern 2: CSS Scroll Snap for Smooth Horizontal Scrolling
**What:** Apply scroll-snap-type: x mandatory to carousel container for smooth, performant snapping
**When to use:** When QCarousel native swipe feels sluggish or needs fine-tuning
**Example:**
```vue
<!-- Source: https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-type -->
<template>
  <div class="day-carousel-container">
    <div
      class="day-carousel-scroll"
      @scroll="handleScroll"
    >
      <div
        v-for="day in weekDays"
        :key="day.date"
        class="day-card-snap"
      >
        <DayCard :day="day" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-carousel-scroll {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch; /* iOS momentum scrolling */
  overscroll-behavior-x: contain; /* Prevent scroll chaining */
}

.day-card-snap {
  scroll-snap-align: center;
  scroll-snap-stop: always;
  flex-shrink: 0;
  width: 85vw; /* 1-2 cards visible */
}

/* GPU acceleration for transforms */
.day-card {
  transform: translateZ(0);
  will-change: transform, opacity;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

/* Adjacent days reduced opacity */
.day-card:not(.is-centered) {
  opacity: 0.7;
}
</style>
```

### Pattern 3: QExpansionItem for Block Preview Lists
**What:** Use QExpansionItem to create expandable block cards that show exercise lists on tap
**When to use:** Block list for the centered day
**Example:**
```vue
<!-- Source: https://quasar.dev/vue-components/expansion-item/ -->
<template>
  <q-list>
    <q-expansion-item
      v-for="block in blocks"
      :key="block.id"
      :label="block.name"
      :caption="`${block.route} • ${block.exerciseCount} ejercicios • ${block.format}`"
      expand-separator
      header-class="block-header"
      :class="`block-${block.role.toLowerCase()}`"
    >
      <q-card>
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Ejercicios</div>
          <q-list dense>
            <q-item v-for="exercise in block.exercises" :key="exercise.id">
              <q-item-section>
                <q-item-label>{{ exercise.patron }}</q-item-label>
                <q-item-label caption>
                  {{ exercise.reps }} reps • {{ exercise.contraction }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </q-expansion-item>
  </q-list>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWeekStore } from '../stores/weekStore'

const weekStore = useWeekStore()
const blocks = computed(() => weekStore.selectedDayBlocks)
</script>

<style scoped>
/* Block-specific colors */
.block-initium .q-item__label { color: #03A9F4; }
.block-nucleus .q-item__label { color: #9C27B0; }
.block-deuteros_1 .q-item__label { color: #00BCD4; }
.block-deuteros_2 .q-item__label { color: #4CAF50; }
.block-athlos_epikos .q-item__label { color: #FF9800; }
</style>
```

### Pattern 4: Quasar Date Utils with Spanish Locale
**What:** Use Quasar's date.formatDate with Spanish locale object for day names (Lun-Dom)
**When to use:** Displaying day names in headers, formatting dates
**Example:**
```typescript
// Source: https://quasar.dev/quasar-utils/date-utils/
import { date } from 'quasar'

const spanishLocale = {
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  daysShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  monthsShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
}

// Generate week days array (Monday-Sunday)
export function generateWeekDays(startDate: Date): DayInfo[] {
  const weekDays: DayInfo[] = []

  // Start on Monday (day 1)
  const monday = date.startOfDate(startDate, 'week', spanishLocale)

  for (let i = 0; i < 7; i++) {
    const currentDate = date.addToDate(monday, { days: i })
    const dayName = date.formatDate(currentDate, 'ddd', spanishLocale) // Lun, Mar, etc.
    const dayNumber = date.formatDate(currentDate, 'D')

    weekDays.push({
      date: date.formatDate(currentDate, 'YYYY-MM-DD'),
      dayName,
      dayNumber,
      isToday: date.isSameDate(currentDate, new Date(), 'day')
    })
  }

  return weekDays
}

// Check if date is today
export function isToday(dateStr: string): boolean {
  const targetDate = date.extractDate(dateStr, 'YYYY-MM-DD')
  return date.isSameDate(targetDate, new Date(), 'day')
}
```

### Pattern 5: Pinia Store for Week and Selected Day State
**What:** Centralize week data, selected day, and session state in Pinia store
**When to use:** Managing week data across components, tracking selected day
**Example:**
```typescript
// Source: https://pinia.vuejs.org/core-concepts/state.html
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { date } from 'quasar'
import type { WeekSession, DaySession, Block } from '../types/session'

export const useWeekStore = defineStore('week', () => {
  // State
  const weekSession = ref<WeekSession | null>(null)
  const selectedDate = ref<string>('')
  const loading = ref(false)

  // Getters
  const todayDate = computed(() => date.formatDate(new Date(), 'YYYY-MM-DD'))

  const weekDays = computed(() => {
    if (!weekSession.value) return []
    return weekSession.value.days.map(day => ({
      date: day.date,
      dayName: day.dayName,
      sessionName: day.sessionName,
      isCompleted: day.isCompleted,
      isToday: day.date === todayDate.value
    }))
  })

  const selectedDaySession = computed(() => {
    if (!weekSession.value || !selectedDate.value) return null
    return weekSession.value.days.find(d => d.date === selectedDate.value)
  })

  const selectedDayBlocks = computed(() => {
    return selectedDaySession.value?.blocks || []
  })

  const isSelectedDayToday = computed(() => {
    return selectedDate.value === todayDate.value
  })

  // Actions
  async function fetchWeekSession(memberId: number, weekNumber: number) {
    loading.value = true
    try {
      const response = await axios.get(`/api/sessions/week/${memberId}/${weekNumber}`)
      weekSession.value = response.data
      // Auto-select today on first load
      if (!selectedDate.value) {
        selectedDate.value = todayDate.value
      }
    } catch (error) {
      console.error('Failed to fetch week session:', error)
    } finally {
      loading.value = false
    }
  }

  function selectDay(date: string) {
    selectedDate.value = date
  }

  return {
    // State
    weekSession,
    selectedDate,
    loading,
    // Getters
    todayDate,
    weekDays,
    selectedDaySession,
    selectedDayBlocks,
    isSelectedDayToday,
    // Actions
    fetchWeekSession,
    selectDay
  }
})
```

### Pattern 6: Fixed Bottom CTA with Conditional Rendering
**What:** Show "Start" button fixed at bottom only when viewing today's session
**When to use:** Navigation to Day Player
**Example:**
```vue
<template>
  <q-page class="weekly-view">
    <!-- Week carousel and block list -->
    <WeekCarousel />
    <BlockList />

    <!-- Fixed bottom button - only for today -->
    <div v-if="weekStore.isSelectedDayToday" class="fixed-bottom-cta">
      <q-btn
        color="primary"
        size="lg"
        unelevated
        class="full-width"
        label="Iniciar Sesión"
        icon-right="play_arrow"
        @click="startSession"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useWeekStore } from '../stores/weekStore'
import { useRouter } from 'vue-router'

const weekStore = useWeekStore()
const router = useRouter()

function startSession() {
  router.push({
    name: 'day-player',
    params: { date: weekStore.selectedDate }
  })
}
</script>

<style scoped>
.fixed-bottom-cta {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: linear-gradient(to top, white 70%, transparent);
  z-index: 100;
}
</style>
```

### Pattern 7: GPU-Accelerated Transforms for Smooth Animations
**What:** Use CSS transform: translateZ(0) or will-change to trigger GPU acceleration
**When to use:** Day card opacity changes, horizontal swipe animations
**Example:**
```vue
<!-- Source: https://www.lexo.ch/blog/2025/01/boost-css-performance-with-will-change-and-transform-translate3d-why-gpu-acceleration-matters/ -->
<style scoped>
.day-card {
  /* Trigger GPU layer */
  transform: translateZ(0);
  /* Only use will-change when actively animating */
  will-change: transform, opacity;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.day-card.is-today {
  transform: scale(1.05) translateZ(0);
  opacity: 1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.day-card.is-adjacent {
  transform: scale(0.95) translateZ(0);
  opacity: 0.7;
}

/* Remove will-change after animation to prevent memory issues */
.day-card:not(.animating) {
  will-change: auto;
}
</style>
```

### Anti-Patterns to Avoid
- **Overusing will-change:** Don't apply will-change to all elements. It consumes GPU memory and can degrade performance. Only use during active animations.
- **JavaScript-driven scrolling:** Don't use JS to animate scroll position. Use CSS scroll-snap for smoother, GPU-accelerated scrolling.
- **Deep reactive objects:** Don't bind entire week session object directly to template. Use computed properties to extract only needed data.
- **Recreating dates in loops:** Don't call date utils inside v-for. Precompute formatted dates in store getters.
- **Ignoring overscroll-behavior:** Don't allow horizontal carousel to trigger browser navigation gestures. Use overscroll-behavior-x: contain.
- **Missing draggable="false" on images:** Don't forget to disable native drag on images inside carousel slides to prevent interference with swipe.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Horizontal carousel | Custom scroll + touch handlers | QCarousel component | Built-in navigation, accessibility, keyboard support, autoplay |
| Touch swipe detection | addEventListener for touch events | v-touch-swipe directive | Handles mouse fallback, prevents default, works across devices |
| Date formatting | Manual date string manipulation | Quasar date.formatDate | Locale support, timezone-safe, consistent formatting |
| Week start on Monday | Manual day calculation | date.startOfDate with locale | Handles locale-specific week starts (Monday for Spanish) |
| Expandable lists | Custom v-show with animations | QExpansionItem | Animations, nested expansion, accordion mode, accessibility |
| State management | Props drilling | Pinia store | Reactive, devtools support, TypeScript inference, composable |
| Scroll position tracking | Manual scroll event handling | CSS scroll-snap with Intersection Observer | GPU-accelerated, smoother, less main thread work |

**Key insight:** Quasar Framework provides mobile-optimized components specifically designed for touch interfaces. QCarousel and QExpansionItem handle edge cases (touch cancellation, momentum scrolling, accessibility) that are easy to miss when building custom solutions. CSS scroll-snap is now widely supported (including iOS) and provides better performance than JavaScript-driven scrolling.

## Common Pitfalls

### Pitfall 1: Week Not Starting on Monday
**What goes wrong:** Default JavaScript Date.getDay() uses Sunday as week start (0), but Spanish locale expects Monday (Lunes) first
**Why it happens:** Native JS Date doesn't have locale-aware week start configuration
**How to avoid:** Use Quasar's date.startOfDate with Spanish locale object that defines Monday as week start, or manually adjust with modulo arithmetic
**Warning signs:** Week view shows Dom-Sáb instead of Lun-Dom. "Today" highlighting is off by one day on Sundays.

### Pitfall 2: Scroll Chaining to Parent/Browser Navigation
**What goes wrong:** Horizontal swipe in carousel triggers browser back/forward navigation on mobile, or parent page scrolls vertically while swiping horizontally
**Why it happens:** Default browser overscroll behavior allows gestures to "chain" to parent scrollers or trigger navigation
**How to avoid:** Add overscroll-behavior-x: contain to carousel container. Add draggable="false" to images inside slides.
**Warning signs:** Users report accidental page navigation. Vertical page scroll happens during horizontal carousel swipe.

### Pitfall 3: Performance Degradation with will-change Overuse
**What goes wrong:** App feels sluggish, memory usage increases, especially on lower-end mobile devices
**Why it happens:** will-change creates GPU layers for every element, consuming memory. Too many layers exhaust GPU resources.
**How to avoid:** Only apply will-change during active transitions. Remove it after animation completes. Limit to 3-5 elements maximum.
**Warning signs:** DevTools shows high GPU memory. Animations stutter. Device feels hot during scrolling.

### Pitfall 4: Date State Desync Between Store and Component
**What goes wrong:** Selected date in Pinia store doesn't match carousel v-model, causing mismatched block lists
**Why it happens:** v-model updates locally but doesn't sync with store, or store updates don't trigger carousel re-render
**How to avoid:** Use computed property that reads from store for v-model binding, or watch v-model changes and update store
**Warning signs:** Carousel shows one day but block list shows another. "Start" button appears on wrong days.

### Pitfall 5: Missing Mobile Viewport Considerations
**What goes wrong:** Day cards too small on mobile, carousel content clipped, buttons hidden by notch/home indicator
**Why it happens:** Using fixed pixel widths instead of viewport units, ignoring safe-area-inset
**How to avoid:** Use viewport units (vw/vh), CSS clamp() for responsive sizing, env(safe-area-inset-bottom) for bottom padding
**Warning signs:** Users report "can't tap button" on iPhone. Cards overlap on small screens.

### Pitfall 6: Timezone Confusion in Date Comparisons
**What goes wrong:** "Today" highlighting wrong, especially for users in different timezones or near midnight
**Why it happens:** Comparing Date objects without normalizing timezone, or using ISO strings with time component
**How to avoid:** Always use date.isSameDate with 'day' unit for date comparisons. Store dates as YYYY-MM-DD strings without time.
**Warning signs:** "Today" highlight disappears at midnight local time but not gym time. Wrong day highlighted for some users.

### Pitfall 7: Block List Not Resetting on Day Change
**What goes wrong:** Swiping to new day shows old day's blocks briefly, or expanded blocks stay expanded
**Why it happens:** QExpansionItem internal state persists across renders, block list not keyed properly
**How to avoid:** Use :key on block list tied to selected date. Reset expansion state when selectedDate changes.
**Warning signs:** Blocks "flash" old content before updating. Expansion states carry over between days.

### Pitfall 8: iOS Safari Rubber-Band Effect Interfering
**What goes wrong:** On iOS, horizontal swipe triggers vertical rubber-band bounce effect
**Why it happens:** iOS applies overscroll glow to all scroll containers, including horizontal ones
**How to avoid:** Set overscroll-behavior: none on html element (supported in Safari 16+), or use -webkit-overflow-scrolling: touch
**Warning signs:** iOS users report "weird bouncing" when swiping. Carousel feels "stuck" at edges.

## Code Examples

Verified patterns from official sources:

### Complete Weekly View Page Component
```vue
<!-- Source: Quasar Framework patterns + Vue 3 Composition API -->
<template>
  <q-page class="weekly-view-page">
    <!-- Header -->
    <div class="page-header q-pa-md">
      <div class="text-h5">Mi Semana</div>
      <div class="text-subtitle2 text-grey-7">Semana {{ weekStore.currentWeek }}</div>
    </div>

    <!-- Loading state -->
    <div v-if="weekStore.loading" class="q-pa-xl text-center">
      <q-spinner color="primary" size="3em" />
      <div class="q-mt-md text-grey-7">Cargando semana...</div>
    </div>

    <!-- Week carousel -->
    <q-carousel
      v-else
      v-model="selectedDay"
      animated
      swipeable
      control-color="primary"
      height="auto"
      class="week-carousel q-mb-md"
      @update:model-value="handleDayChange"
    >
      <q-carousel-slide
        v-for="day in weekStore.weekDays"
        :key="day.date"
        :name="day.date"
        class="q-pa-sm"
      >
        <DayCard
          :day="day"
          :is-centered="day.date === selectedDay"
        />
      </q-carousel-slide>
    </q-carousel>

    <!-- Block list for selected day -->
    <div class="block-list-container q-px-md">
      <div class="text-h6 q-mb-md">Bloques del día</div>
      <BlockList :blocks="weekStore.selectedDayBlocks" />
    </div>

    <!-- Fixed bottom CTA -->
    <div v-if="weekStore.isSelectedDayToday" class="fixed-bottom-cta">
      <q-btn
        color="primary"
        size="lg"
        unelevated
        class="full-width start-button"
        label="Iniciar Sesión de Hoy"
        icon-right="play_arrow"
        @click="startTodaySession"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWeekStore } from '../stores/weekStore'
import { useAuthStore } from 'stores/useAuthStore'
import DayCard from '../components/DayCard.vue'
import BlockList from '../components/BlockList.vue'

const router = useRouter()
const weekStore = useWeekStore()
const authStore = useAuthStore()

const selectedDay = ref(weekStore.todayDate)

onMounted(async () => {
  if (authStore.user?.id) {
    await weekStore.fetchWeekSession(authStore.user.id, weekStore.currentWeek)
    selectedDay.value = weekStore.todayDate // Auto-center on today
  }
})

function handleDayChange(newDate: string) {
  weekStore.selectDay(newDate)
}

function startTodaySession() {
  router.push({ name: 'day-player', params: { date: weekStore.todayDate } })
}
</script>

<style scoped>
.weekly-view-page {
  padding-bottom: 100px; /* Space for fixed button */
  overflow-x: hidden; /* Prevent horizontal page scroll */
}

.page-header {
  background: linear-gradient(135deg, var(--q-primary) 0%, var(--q-secondary) 100%);
  color: white;
}

.week-carousel {
  overscroll-behavior-x: contain; /* Prevent scroll chaining */
}

.fixed-bottom-cta {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom)); /* iOS safe area */
  background: linear-gradient(to top, white 80%, transparent);
  z-index: 100;
}

.start-button {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
```

### DayCard Component with State Styles
```vue
<!-- Source: Mobile calendar UI patterns research -->
<template>
  <q-card
    :class="dayCardClasses"
    class="day-card"
  >
    <q-card-section class="text-center">
      <!-- Day name and number -->
      <div class="day-name text-overline">{{ day.dayName }}</div>
      <div class="day-number text-h4">{{ day.dayNumber }}</div>

      <!-- Session name -->
      <div class="session-name text-subtitle2 q-mt-sm">
        {{ day.sessionName || 'Descanso' }}
      </div>

      <!-- Completion checkmark -->
      <div v-if="day.isCompleted" class="completion-badge">
        <q-icon name="check_circle" color="positive" size="sm" />
        <span class="text-caption q-ml-xs">Completado</span>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DayInfo } from '../types/session'

interface Props {
  day: DayInfo
  isCentered: boolean
}

const props = defineProps<Props>()

const dayCardClasses = computed(() => ({
  'is-today': props.day.isToday,
  'is-centered': props.isCentered,
  'is-completed': props.day.isCompleted,
  'is-adjacent': !props.isCentered
}))
</script>

<style scoped>
.day-card {
  min-height: 200px;
  transform: translateZ(0); /* GPU acceleration */
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Today highlighting */
.day-card.is-today {
  border: 2px solid var(--q-primary);
  background: linear-gradient(135deg, rgba(156, 39, 176, 0.05) 0%, rgba(103, 58, 183, 0.05) 100%);
}

/* Centered day (large and elevated) */
.day-card.is-centered {
  transform: scale(1.05) translateZ(0);
  opacity: 1;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Adjacent days (reduced opacity) */
.day-card.is-adjacent {
  opacity: 0.7;
  transform: scale(0.95) translateZ(0);
}

/* Completed state */
.day-card.is-completed {
  background: rgba(76, 175, 80, 0.1);
}

.completion-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
  color: var(--q-positive);
}

.day-name {
  font-weight: 600;
  letter-spacing: 0.5px;
}

.day-number {
  font-weight: 700;
}

.session-name {
  color: var(--q-dark);
  font-weight: 500;
  min-height: 40px;
}
</style>
```

### Date Navigation Composable
```typescript
// Source: https://quasar.dev/quasar-utils/date-utils/
import { date } from 'quasar'
import type { DayInfo } from '../types/session'

export const spanishLocale = {
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  daysShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  monthsShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
}

export function useDateNavigation() {
  /**
   * Generate 7-day week array starting from Monday (Spanish locale)
   * @param startDate - Reference date (defaults to today)
   * @returns Array of 7 DayInfo objects (Mon-Sun)
   */
  function generateWeekDays(startDate: Date = new Date()): DayInfo[] {
    const weekDays: DayInfo[] = []

    // Get Monday of the week containing startDate
    // Note: getDay() returns 0 for Sunday, 1 for Monday, etc.
    const dayOfWeek = startDate.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Sunday: 6 days back, others: day - 1
    const monday = date.subtractFromDate(startDate, { days: daysFromMonday })

    for (let i = 0; i < 7; i++) {
      const currentDate = date.addToDate(monday, { days: i })
      const dayName = date.formatDate(currentDate, 'ddd', spanishLocale) // Lun, Mar, etc.
      const dayNumber = parseInt(date.formatDate(currentDate, 'D'))
      const dateStr = date.formatDate(currentDate, 'YYYY-MM-DD')

      weekDays.push({
        date: dateStr,
        dayName,
        dayNumber,
        isToday: date.isSameDate(currentDate, new Date(), 'day'),
        sessionName: '', // Populated from API
        isCompleted: false // Populated from API
      })
    }

    return weekDays
  }

  /**
   * Check if date string is today (timezone-safe)
   */
  function isToday(dateStr: string): boolean {
    const targetDate = date.extractDate(dateStr, 'YYYY-MM-DD')
    return date.isSameDate(targetDate, new Date(), 'day')
  }

  /**
   * Get ISO week number (1-52)
   */
  function getWeekNumber(targetDate: Date = new Date()): number {
    return date.getWeekOfYear(targetDate)
  }

  /**
   * Format date for display
   */
  function formatDisplayDate(dateStr: string): string {
    const targetDate = date.extractDate(dateStr, 'YYYY-MM-DD')
    return date.formatDate(targetDate, 'dddd D [de] MMMM', spanishLocale)
  }

  return {
    generateWeekDays,
    isToday,
    getWeekNumber,
    formatDisplayDate,
    spanishLocale
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JavaScript scroll libraries | CSS scroll-snap | 2022 (Safari support) | GPU-accelerated, smoother mobile performance |
| Custom swipe handlers | QCarousel + touch directives | Quasar 2.0 | Better accessibility, keyboard support, less code |
| Moment.js for dates | Quasar date utils | 2024-2025 | Lighter bundle, no external dependencies |
| translate3d(x, y, z) hack | Native CSS scroll-snap | 2023 | Cleaner code, better browser optimization |
| Vuex | Pinia | 2023 (Vue 3 adoption) | Better TypeScript, simpler API, Vue 3 native |
| will-change: transform on all | Selective will-change only during animation | 2024-2025 | Prevents GPU memory issues on mobile |

**Deprecated/outdated:**
- **overscroll-behavior not supported on iOS**: Now supported in Safari 16+ (2022). Safe to use without fallbacks for modern iOS.
- **Touch event listeners for swipe**: QCarousel and v-touch-swipe directives handle this with better accessibility and mouse fallback.
- **Manual carousel implementations**: QCarousel provides production-ready solution with accessibility, animations, and navigation out of the box.

## Open Questions

Things that couldn't be fully resolved:

1. **Completed day summary format**
   - What we know: Tapping completed days should show read-only summary (RPE, duration, what was done)
   - What's unclear: Should this be a modal, a bottom sheet, or inline expansion? Should it be part of Phase 6 or deferred to Phase 8?
   - Recommendation: Start with simple bottom sheet (QDialog with position="bottom") showing basic stats. Full history viewer can be Phase 8 scope.

2. **Session data caching strategy**
   - What we know: Week session data needs to be fetched from API
   - What's unclear: Should week data be cached client-side, or refetched on each view? How to handle stale data?
   - Recommendation: Fetch on mount, cache in Pinia store for session duration. Refresh on pull-to-refresh gesture (QPage with pull-to-refresh enabled).

3. **Adjacent day interaction**
   - What we know: Today has "Start" button, completed days show summary
   - What's unclear: Can users tap future days? What happens if they try to start tomorrow's session early?
   - Recommendation: Allow tapping future days to preview blocks (read-only), but disable "Start" button. Phase 6 scope is view-only, execution is Phase 7.

4. **Intensity indicator decision**
   - What we know: CONTEXT.md says "No intensity indicator on weekly view (blocks have different intensities, skip aggregation)"
   - What's unclear: Is this firm or could a simple average indicator be useful?
   - Recommendation: Follow CONTEXT decision. Show intensity per-block in the expandable list, not at day level.

## Sources

### Primary (HIGH confidence)
- [Quasar QCarousel Documentation](https://quasar.dev/vue-components/carousel/) - Carousel component API, touch support, navigation
- [Quasar Touch Swipe Directive](https://quasar.dev/vue-directives/touch-swipe/) - Touch gesture detection
- [Quasar QExpansionItem](https://quasar.dev/vue-components/expansion-item/) - Expandable lists, accordion mode
- [Quasar Date Utils](https://quasar.dev/quasar-utils/date-utils/) - Date formatting, manipulation, locale support
- [MDN: overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior) - Preventing scroll chaining
- [MDN: CSS Scroll Snap](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-type) - Smooth horizontal scrolling
- [Pinia State Management](https://pinia.vuejs.org/core-concepts/state.html) - Vue 3 state management
- [Vue 3 Transition Component](https://vuejs.org/guide/built-ins/transition) - Animation best practices

### Secondary (MEDIUM confidence)
- [Calendar UI Examples](https://www.eleken.co/blog-posts/calendar-ui) - Week view patterns, today highlighting
- [Mobile UX/UI Design Patterns 2026](https://www.sanjaydey.com/mobile-ux-ui-design-patterns-2026-data-backed/) - Mobile calendar best practices
- [CSS Scroll Snap for Mobile Tabs](https://jetrockets.com/blog/css-scroll-snap-for-horizontal-tabs-navigation) - Horizontal scroll patterns
- [CSS GPU Acceleration Guide 2026](https://www.lexo.ch/blog/2025/01/boost-css-performance-with-will-change-and-transform-translate3d-why-gpu-acceleration-matters/) - will-change and transform best practices
- [Vue 3 Performance Optimization](https://medium.com/@rajithaeye/optimizing-vue-3-performance-tips-for-faster-vue-3-apps-7282e7ec1a4b) - v-memo, computed properties, mobile performance
- [Handling Large Lists in Vue 3](https://dev.to/jacobandrewsky/handling-large-lists-efficiently-in-vue-3-4im1) - Virtual scrolling, performance patterns

### Tertiary (LOW confidence)
- [Mobile Calendar Week View Example - Mobiscroll](https://demo.mobiscroll.com/calendar/week-view) - UI reference (commercial library, not using)
- [Calendar Variable Week View](https://demo.mobiscroll.com/calendar/week-view) - Design inspiration only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use (Quasar 2.16.0, Vue 3.5.22, Pinia 3.0.4), verified through package.json
- Architecture: HIGH - QCarousel, QExpansionItem, and date utils extensively documented in official Quasar docs with code examples
- Pitfalls: MEDIUM - Week start on Monday verified through research, scroll chaining well-documented, but will-change pitfalls based on general mobile performance guidance rather than Quasar-specific sources
- CSS Performance: HIGH - scroll-snap and overscroll-behavior documented in MDN with browser support tables (Safari 16+ confirmed)

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - Quasar and Vue are stable, but mobile browser capabilities evolve)
