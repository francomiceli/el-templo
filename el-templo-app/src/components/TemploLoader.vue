<template>
  <div class="templo-loader" :class="`templo-loader--${size}`">
    <div class="templo-loader__ring"></div>
    <img src="/icons/favicon-128x128.png" alt="" class="templo-loader__icon" />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)
</script>

<style lang="scss" scoped>
@import 'src/css/quasar.variables.scss';

@keyframes breathe {
  0% {
    transform: scale(0.7);
    opacity: 0.2;
  }
  50% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(0.7);
    opacity: 0.2;
  }
}

.templo-loader {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.templo-loader__ring {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba($primary, 0.15) 0%,
    rgba($secondary, 0.1) 50%,
    transparent 70%
  );
  animation: breathe 2.4s ease-in-out infinite;
}

.templo-loader__icon {
  position: relative;
  opacity: 0.5;
}

// --- sm ---
.templo-loader--sm {
  width: 60px;
  height: 60px;

  .templo-loader__ring {
    width: 60px;
    height: 60px;
  }

  .templo-loader__icon {
    width: 38px;
    height: 38px;
  }
}

// --- md ---
.templo-loader--md {
  width: 90px;
  height: 90px;

  .templo-loader__ring {
    width: 90px;
    height: 90px;
  }

  .templo-loader__icon {
    width: 60px;
    height: 60px;
  }
}

// --- lg ---
.templo-loader--lg {
  width: 135px;
  height: 135px;

  .templo-loader__ring {
    width: 135px;
    height: 135px;
  }

  .templo-loader__icon {
    width: 90px;
    height: 90px;
  }
}
</style>
