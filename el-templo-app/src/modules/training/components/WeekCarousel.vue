<template>
  <div class="week-carousel">
    <!-- Day indicator dots -->
    <div class="week-carousel__dots">
      <button
        v-for="(day, index) in weekStore.weekDays"
        :key="day.date"
        class="week-carousel__dot"
        :class="{
          'week-carousel__dot--active': day.date === weekStore.selectedDate,
          'week-carousel__dot--today': day.state === 'today',
          'week-carousel__dot--rest': day.state === 'rest',
        }"
        @click="scrollToDay(index)"
      >
        <span class="week-carousel__dot-label">{{ day.dayName.charAt(0) }}</span>
      </button>
    </div>

    <!-- Swipeable day cards -->
    <div
      ref="carouselRef"
      class="week-carousel__container"
      @scroll="handleScroll"
    >
      <div
        v-for="(day, index) in weekStore.weekDays"
        :key="day.date"
        class="week-carousel__slide"
        :class="{ 'week-carousel__slide--center': index === centerIndex }"
        :data-index="index"
      >
        <DayCard
          :day="day"
          :is-selected="day.date === weekStore.selectedDate"
          @start="handleStart"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useWeekStore } from '../stores/weekStore';
import DayCard from './DayCard.vue';

const emit = defineEmits<{
  start: [date: string];
}>();

const weekStore = useWeekStore();
const carouselRef = ref<HTMLElement | null>(null);
const centerIndex = ref(0);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Handle scroll events to detect centered card
 */
function handleScroll() {
  if (!carouselRef.value) return;

  // Debounce scroll detection
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    detectCenteredCard();
  }, 100);
}

/**
 * Get all slide elements
 */
function getSlides(): HTMLElement[] {
  if (!carouselRef.value) return [];
  return Array.from(carouselRef.value.querySelectorAll('.week-carousel__slide'));
}

/**
 * Detect which card is centered based on scroll position
 */
function detectCenteredCard() {
  if (!carouselRef.value) return;

  const container = carouselRef.value;
  const slides = getSlides();
  if (slides.length === 0) return;

  const containerCenter = container.scrollLeft + container.offsetWidth / 2;

  // Find the slide whose center is closest to the container's center
  let closestIndex = 0;
  let closestDistance = Infinity;

  slides.forEach((slide, index) => {
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
    const distance = Math.abs(slideCenter - containerCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex !== centerIndex.value) {
    centerIndex.value = closestIndex;
    const day = weekStore.weekDays[closestIndex];
    if (day && day.date !== weekStore.selectedDate) {
      weekStore.selectDate(day.date);
    }
  }
}

/**
 * Scroll to a specific day by index
 */
function scrollToDay(index: number, behavior: 'smooth' | 'instant' | 'auto' = 'smooth') {
  if (!carouselRef.value) return;

  const container = carouselRef.value;
  const slides = getSlides();
  const slide = slides[index];

  if (!slide) return;

  // Calculate scroll position to center the slide
  const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
  const containerCenter = container.offsetWidth / 2;
  const scrollPosition = slideCenter - containerCenter;

  container.scrollTo({
    left: Math.max(0, scrollPosition),
    behavior,
  });

  centerIndex.value = index;
  const day = weekStore.weekDays[index];
  if (day) {
    weekStore.selectDate(day.date);
  }
}

/**
 * Scroll to today on mount
 */
function scrollToToday() {
  const todayIndex = weekStore.todayIndex;
  if (todayIndex >= 0) {
    // Use 'auto' for instant scroll on mount
    nextTick(() => {
      scrollToDay(todayIndex, 'auto');
    });
  } else {
    // Default to first day if today not in week
    nextTick(() => {
      scrollToDay(0, 'auto');
    });
  }
}

/**
 * Handle start button from DayCard
 */
function handleStart(date: string) {
  emit('start', date);
}

// Setup on mount
onMounted(() => {
  setTimeout(scrollToToday, 100);
});

// Cleanup
onUnmounted(() => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
});

// Re-center when weekDays change
watch(
  () => weekStore.weekDays.length,
  () => {
    if (weekStore.weekDays.length > 0) {
      setTimeout(scrollToToday, 100);
    }
  }
);
</script>

<style scoped lang="scss">
.week-carousel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  &__dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    flex-shrink: 0;
  }

  &__dot {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid #e0e0e0;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      border-color: #bdbdbd;
    }

    &--active {
      border-color: var(--q-primary);
      background: var(--q-primary);

      .week-carousel__dot-label {
        color: white;
      }
    }

    &--today:not(.week-carousel__dot--active) {
      border-color: var(--q-primary);

      .week-carousel__dot-label {
        color: var(--q-primary);
      }
    }

    &--rest {
      border-color: #e0e0e0;
      background: #f5f5f5;

      .week-carousel__dot-label {
        color: #9e9e9e;
      }
    }
  }

  &__dot-label {
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
  }

  &__container {
    flex: 1;
    display: flex;
    gap: 16px;
    padding: 8px 0;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;

    // Hide scrollbar
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
    }

    // Padding for peek effect
    padding-left: calc((100% - 85%) / 2);
    padding-right: calc((100% - 85%) / 2);
  }

  &__slide {
    flex-shrink: 0;
    width: 85%;
    height: 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    transition: transform 0.3s ease, opacity 0.3s ease;

    // Non-centered cards are smaller (80% height effect via scale)
    transform: scale(0.92);
    opacity: 0.7;

    &--center {
      transform: scale(1);
      opacity: 1;
    }
  }
}

// Desktop adjustments
@media (min-width: 768px) {
  .week-carousel {
    &__container {
      padding-left: calc((100% - 60%) / 2);
      padding-right: calc((100% - 60%) / 2);
    }

    &__slide {
      width: 60%;
      max-width: 500px;
    }
  }
}
</style>
