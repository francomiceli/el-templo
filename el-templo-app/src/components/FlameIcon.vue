<template>
  <div
    :class="[
      'flame-icon',
      `flame-icon--${size}`,
      { 'flame-icon--intensify': intensify, 'flame-icon--dim': dim },
    ]"
  >
    <div class="fl fl--1"></div>
    <div class="fl fl--2"></div>
    <div class="fl fl--3"></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'xs' | 'sm' | 'md'
    intensify?: boolean
    dim?: boolean
  }>(),
  {
    size: 'sm',
    intensify: false,
    dim: false,
  },
)
</script>

<style lang="scss" scoped>
$terracotta: #c07a56;
$amber: #d4a843;
$bronze: #d4b896;
$cream: #f2ede5;

@keyframes fl-dance-1 {
  0% {
    transform: scaleX(1) scaleY(1) rotate(-2deg);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  }
  100% {
    transform: scaleX(0.85) scaleY(1.1) rotate(2deg);
    border-radius: 50% 50% 48% 52% / 62% 58% 42% 38%;
  }
}

@keyframes fl-dance-2 {
  0% {
    transform: scaleX(1) scaleY(1) rotate(1.5deg);
  }
  100% {
    transform: scaleX(0.9) scaleY(1.12) rotate(-1.5deg);
  }
}

@keyframes fl-dance-3 {
  0% {
    transform: scaleY(1) rotate(-1deg);
  }
  100% {
    transform: scaleY(1.15) rotate(1deg);
  }
}

.flame-icon {
  position: relative;
  flex-shrink: 0;
  transition:
    filter 0.6s ease,
    transform 0.6s ease;

  &--intensify {
    filter: brightness(1.5) saturate(1.3);
    transform: scale(1.2);
  }

  &--dim {
    filter: brightness(0.4) saturate(0.5);
    transform: scale(0.8);
  }
}

.fl {
  position: absolute;
  bottom: 0;
  left: 50%;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  transform-origin: center bottom;
}

// --- xs: 8x12 (loading spinners, badges) ---
.flame-icon--xs {
  width: 8px;
  height: 12px;

  .fl--1 {
    width: 6px;
    height: 11px;
    margin-left: -3px;
    background: linear-gradient(0deg, $terracotta, $amber, $bronze);
    animation: fl-dance-1 0.8s ease-in-out infinite alternate;
    opacity: 0.9;
    filter: blur(0.4px);
  }
  .fl--2 {
    width: 4px;
    height: 8px;
    margin-left: -2px;
    background: linear-gradient(0deg, $amber, $bronze, rgba($cream, 0.7));
    animation: fl-dance-2 0.6s ease-in-out infinite alternate;
    opacity: 0.8;
    filter: blur(0.2px);
  }
  .fl--3 {
    width: 2px;
    height: 5px;
    margin-left: -1px;
    background: linear-gradient(0deg, rgba($cream, 0.9), rgba($cream, 0.4));
    animation: fl-dance-3 0.5s ease-in-out infinite alternate;
    opacity: 0.85;
  }
}

// --- sm: 14x24 (titles, section dividers) ---
.flame-icon--sm {
  width: 14px;
  height: 24px;

  .fl--1 {
    width: 10px;
    height: 22px;
    margin-left: -5px;
    background: linear-gradient(0deg, $terracotta, $amber, $bronze);
    animation: fl-dance-1 0.8s ease-in-out infinite alternate;
    opacity: 0.95;
    filter: blur(0.6px);
  }
  .fl--2 {
    width: 7px;
    height: 16px;
    margin-left: -3.5px;
    background: linear-gradient(0deg, $amber, $bronze, rgba($cream, 0.7));
    animation: fl-dance-2 0.6s ease-in-out infinite alternate;
    opacity: 0.85;
    filter: blur(0.3px);
  }
  .fl--3 {
    width: 4px;
    height: 10px;
    margin-left: -2px;
    background: linear-gradient(0deg, rgba($cream, 0.9), rgba($cream, 0.4));
    animation: fl-dance-3 0.5s ease-in-out infinite alternate;
    opacity: 0.9;
  }
}

// --- md: 20x36 (empty states, hero areas) ---
.flame-icon--md {
  width: 20px;
  height: 36px;

  .fl--1 {
    width: 16px;
    height: 34px;
    margin-left: -8px;
    background: linear-gradient(0deg, $terracotta, $amber, $bronze);
    animation: fl-dance-1 0.8s ease-in-out infinite alternate;
    opacity: 0.95;
    filter: blur(0.8px);
  }
  .fl--2 {
    width: 11px;
    height: 25px;
    margin-left: -5.5px;
    background: linear-gradient(0deg, $amber, $bronze, rgba($cream, 0.8));
    animation: fl-dance-2 0.6s ease-in-out infinite alternate;
    opacity: 0.85;
    filter: blur(0.4px);
  }
  .fl--3 {
    width: 6px;
    height: 16px;
    margin-left: -3px;
    background: linear-gradient(0deg, rgba($cream, 0.9), rgba($cream, 0.5));
    animation: fl-dance-3 0.5s ease-in-out infinite alternate;
    opacity: 0.9;
  }
}
</style>
