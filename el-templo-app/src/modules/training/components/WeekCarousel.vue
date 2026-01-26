<template>
  <div class="week-carousel">
    <div
      ref="carouselRef"
      class="week-carousel__container"
    >
      <DayCard
        v-for="day in weekStore.weekDays"
        :key="day.date"
        :day="day"
        :is-selected="day.date === weekStore.selectedDate"
        :data-date="day.date"
        class="week-carousel__card"
        @select="handleDaySelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useWeekStore } from '../stores/weekStore';
import DayCard from './DayCard.vue';

/**
 * Horizontal scrollable week carousel
 *
 * Features:
 * - CSS scroll-snap for smooth card snapping
 * - Auto-centers today's card on mount
 * - IntersectionObserver detects centered card
 * - Adjacent days peek at sides with reduced opacity
 * - Updates store.selectedDate when card becomes centered
 */

const weekStore = useWeekStore();
const carouselRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

/**
 * Handle day card selection
 * Scrolls the selected card into view
 */
function handleDaySelect(date: string) {
  weekStore.selectDate(date);

  // Scroll selected card into view
  if (carouselRef.value) {
    const cardElement = carouselRef.value.querySelector(`[data-date="${date}"]`);
    if (cardElement) {
      cardElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }
}

/**
 * Setup IntersectionObserver to detect which card is centered
 *
 * When a card crosses the center threshold (50%), it becomes selected
 * and updates the store's selectedDate.
 */
function setupIntersectionObserver() {
  if (!carouselRef.value) return;

  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Create observer that triggers when card is centered
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // When card crosses 50% visibility threshold (centered)
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const cardElement = entry.target as HTMLElement;
          const date = cardElement.getAttribute('data-date');
          if (date && date !== weekStore.selectedDate) {
            weekStore.selectDate(date);
          }
        }
      });
    },
    {
      root: carouselRef.value,
      threshold: [0, 0.5, 1],
      rootMargin: '0px',
    }
  );

  // Observe all day cards
  const cards = carouselRef.value.querySelectorAll('.week-carousel__card');
  cards.forEach((card) => observer?.observe(card));
}

/**
 * Center today's card on component mount
 */
function centerTodayCard() {
  if (!carouselRef.value) return;

  const todayIndex = weekStore.todayIndex;
  if (todayIndex === -1) {
    // Today not in current week, center middle card
    const cards = carouselRef.value.querySelectorAll('.week-carousel__card');
    const middleCard = cards[Math.floor(cards.length / 2)];
    if (middleCard) {
      (middleCard as HTMLElement).scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      });
    }
    return;
  }

  // Find today's card and scroll to it
  const todayDate = weekStore.weekDays[todayIndex]?.date;
  if (todayDate) {
    const todayCard = carouselRef.value.querySelector(`[data-date="${todayDate}"]`);
    if (todayCard) {
      // Set as selected immediately
      weekStore.selectDate(todayDate);

      // Scroll to center (use 'auto' for immediate positioning on mount)
      (todayCard as HTMLElement).scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      });
    }
  }
}

// Setup on mount
onMounted(() => {
  // Wait for next tick to ensure DOM is ready
  setTimeout(() => {
    centerTodayCard();
    setupIntersectionObserver();
  }, 100);
});

// Cleanup observer on unmount
onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

// Re-setup observer when weekDays change
watch(
  () => weekStore.weekDays.length,
  () => {
    setTimeout(() => {
      setupIntersectionObserver();
      centerTodayCard();
    }, 100);
  }
);
</script>

<style scoped lang="scss">
.week-carousel {
  width: 100%;
  overflow: hidden;
  position: relative;

  &__container {
    display: flex;
    gap: 16px;
    padding: 20px 24px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;

    // Hide scrollbar but keep functionality
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
    }

    // Add padding to allow centering of first/last cards
    &::before,
    &::after {
      content: '';
      flex-shrink: 0;
      width: calc(50vw - 70px); // Half viewport minus half card width
    }
  }

  &__card {
    scroll-snap-align: center;
    scroll-snap-stop: always;

    // Peek effect - adjacent cards have reduced opacity
    opacity: 0.7;
    transition: opacity 0.3s ease, transform 0.3s ease;

    // Card in center is fully opaque
    &[data-centered="true"] {
      opacity: 1;
    }
  }

  // Fade effect on edges
  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    pointer-events: none;
    z-index: 1;
  }

  &::before {
    left: 0;
    background: linear-gradient(to right, white, transparent);
  }

  &::after {
    right: 0;
    background: linear-gradient(to left, white, transparent);
  }
}
</style>
