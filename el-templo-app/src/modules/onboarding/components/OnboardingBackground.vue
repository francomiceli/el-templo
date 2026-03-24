<template>
  <div class="onboarding-bg">
    <!-- Background layers -->
    <div class="bg-texture"></div>
    <div class="bg-glow"></div>
    <div class="bg-vignette"></div>

    <!-- Dust particles -->
    <div class="dust-field">
      <div v-for="n in 40" :key="n" :class="`dust dust--${n}`"></div>
    </div>

    <!-- Logo scene -->
    <div class="logo-scene">
      <img
        src="/logo.webp"
        alt="El Templo"
        class="logo-img"
        :style="{ width: `${logoSize}px` }"
      />
      <div class="ember ember--1"></div>
      <div class="ember ember--2"></div>
      <div class="ember ember--3"></div>
      <div class="ember ember--4"></div>
      <div class="ember ember--5"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    logoSize?: number
  }>(),
  {
    logoSize: 150,
  },
)
</script>

<style lang="scss" scoped>
// =========================================================================
// Brand tokens (same as LoginPage.vue)
// =========================================================================
$terracotta: #c07a56;
$amber: #d4a843;
$bronze: #d4b896;
$cream: #f2ede5;
$charcoal: #2e2a26;
$charcoal-mid: #3d3732;

.onboarding-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

// =========================================================================
// Background layers
// =========================================================================
.bg-texture {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url('/bar-train2.webp') center center / cover no-repeat;
  filter: saturate(0.2) sepia(0.6) contrast(1.1);
  opacity: 0.45;
  pointer-events: none;
}

.bg-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba($terracotta, 0.12) 0%,
    rgba($amber, 0.06) 25%,
    rgba($charcoal-mid, 0.03) 50%,
    transparent 75%
  );
  animation: bg-breathe 6s ease-in-out infinite;
  pointer-events: none;
}

.bg-vignette {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    ellipse at 50% 45%,
    transparent 20%,
    rgba(0, 0, 0, 0.25) 50%,
    rgba(0, 0, 0, 0.55) 75%,
    rgba(0, 0, 0, 0.8) 100%
  );
  pointer-events: none;
}

// =========================================================================
// Dust particles
// =========================================================================
.dust-field {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.dust {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba($bronze, 0.3);
  animation: dust-float linear infinite;
}

// Each particle has unique position, timing, and drift
.dust--1 { left: 8%; bottom: -5%; --drift: 20px; animation-duration: 14s; animation-delay: 0s; }
.dust--2 { left: 22%; bottom: -8%; --drift: -15px; animation-duration: 18s; animation-delay: 2s; }
.dust--3 { left: 35%; bottom: -3%; --drift: 25px; animation-duration: 16s; animation-delay: 5s; }
.dust--4 { left: 50%; bottom: -10%; --drift: -10px; animation-duration: 20s; animation-delay: 1s; }
.dust--5 { left: 65%; bottom: -6%; --drift: 18px; animation-duration: 15s; animation-delay: 7s; }
.dust--6 { left: 78%; bottom: -4%; --drift: -22px; animation-duration: 17s; animation-delay: 3s; }
.dust--7 { left: 90%; bottom: -7%; --drift: 12px; animation-duration: 19s; animation-delay: 9s; }
.dust--8 { left: 15%; bottom: -9%; --drift: -18px; animation-duration: 22s; animation-delay: 4s; }
.dust--9 { left: 42%; bottom: -2%; --drift: 30px; animation-duration: 13s; animation-delay: 6s; }
.dust--10 { left: 58%; bottom: -11%; --drift: -8px; animation-duration: 21s; animation-delay: 8s; }
.dust--11 { left: 72%; bottom: -5%; --drift: 14px; animation-duration: 16s; animation-delay: 10s; }
.dust--12 { left: 5%; bottom: -8%; --drift: -25px; animation-duration: 18s; animation-delay: 12s; }
.dust--13 { left: 30%; bottom: -6%; --drift: 16px; animation-duration: 15s; animation-delay: 1.5s; }
.dust--14 { left: 48%; bottom: -4%; --drift: -20px; animation-duration: 19s; animation-delay: 3.5s; }
.dust--15 { left: 82%; bottom: -9%; --drift: 10px; animation-duration: 16s; animation-delay: 5.5s; }
.dust--16 { left: 12%; bottom: -3%; --drift: -14px; animation-duration: 20s; animation-delay: 7.5s; }
.dust--17 { left: 55%; bottom: -7%; --drift: 22px; animation-duration: 14s; animation-delay: 2.5s; }
.dust--18 { left: 68%; bottom: -10%; --drift: -12px; animation-duration: 17s; animation-delay: 9.5s; }
.dust--19 { left: 38%; bottom: -5%; --drift: 28px; animation-duration: 21s; animation-delay: 11s; }
.dust--20 { left: 85%; bottom: -2%; --drift: -18px; animation-duration: 15s; animation-delay: 0.5s; }
.dust--21 { left: 3%; bottom: -7%; --drift: 15px; animation-duration: 16s; animation-delay: 1s; }
.dust--22 { left: 18%; bottom: -4%; --drift: -22px; animation-duration: 19s; animation-delay: 6s; }
.dust--23 { left: 27%; bottom: -9%; --drift: 8px; animation-duration: 14s; animation-delay: 3s; }
.dust--24 { left: 33%; bottom: -2%; --drift: -16px; animation-duration: 21s; animation-delay: 8s; }
.dust--25 { left: 44%; bottom: -6%; --drift: 24px; animation-duration: 17s; animation-delay: 0s; }
.dust--26 { left: 52%; bottom: -11%; --drift: -9px; animation-duration: 15s; animation-delay: 4.5s; }
.dust--27 { left: 61%; bottom: -3%; --drift: 19px; animation-duration: 20s; animation-delay: 10s; }
.dust--28 { left: 70%; bottom: -8%; --drift: -13px; animation-duration: 18s; animation-delay: 2s; }
.dust--29 { left: 76%; bottom: -5%; --drift: 26px; animation-duration: 13s; animation-delay: 7s; }
.dust--30 { left: 88%; bottom: -10%; --drift: -20px; animation-duration: 16s; animation-delay: 11s; }
.dust--31 { left: 95%; bottom: -4%; --drift: 11px; animation-duration: 22s; animation-delay: 1.5s; }
.dust--32 { left: 10%; bottom: -12%; --drift: -7px; animation-duration: 19s; animation-delay: 5s; }
.dust--33 { left: 24%; bottom: -1%; --drift: 21px; animation-duration: 15s; animation-delay: 9s; }
.dust--34 { left: 40%; bottom: -8%; --drift: -17px; animation-duration: 17s; animation-delay: 3.5s; }
.dust--35 { left: 46%; bottom: -3%; --drift: 13px; animation-duration: 20s; animation-delay: 6.5s; }
.dust--36 { left: 57%; bottom: -9%; --drift: -24px; animation-duration: 14s; animation-delay: 12s; }
.dust--37 { left: 64%; bottom: -6%; --drift: 9px; animation-duration: 18s; animation-delay: 0.8s; }
.dust--38 { left: 73%; bottom: -2%; --drift: -15px; animation-duration: 21s; animation-delay: 4s; }
.dust--39 { left: 81%; bottom: -7%; --drift: 17px; animation-duration: 16s; animation-delay: 8.5s; }
.dust--40 { left: 92%; bottom: -5%; --drift: -11px; animation-duration: 19s; animation-delay: 2.5s; }

// =========================================================================
// Logo scene
// =========================================================================
.logo-scene {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  pointer-events: auto;

  // Dark halo behind logo for visibility
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 140%;
    height: 160%;
    background: radial-gradient(
      ellipse,
      rgba($charcoal, 0.85) 0%,
      rgba($charcoal, 0.55) 40%,
      transparent 70%
    );
    z-index: 0;
    pointer-events: none;
  }
}

.logo-img {
  position: relative;
  z-index: 2;
  height: auto;
  display: block;
  animation: ember-pulse 2.5s ease-in-out infinite;
  transition: width 0.3s ease;
}

// Floating embers around logo
.ember {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: $amber;
  z-index: 3;
}

.ember--1 { bottom: 60%; left: 15%; --dx: -12px; animation: ember-rise-wide 3s ease-out infinite; }
.ember--2 { bottom: 50%; right: 18%; --dx: 15px; animation: ember-rise-wide 2.8s ease-out infinite 0.6s; }
.ember--3 { bottom: 70%; left: 40%; --dx: -5px; animation: ember-rise-wide 3.5s ease-out infinite 1.2s; }
.ember--4 { bottom: 45%; left: 60%; --dx: 10px; animation: ember-rise-wide 2.6s ease-out infinite 0.3s; }
.ember--5 { bottom: 55%; left: 25%; --dx: -8px; animation: ember-rise-wide 3.2s ease-out infinite 1.8s; }

// =========================================================================
// Keyframes
// =========================================================================
@keyframes bg-breathe {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes dust-float {
  0% {
    opacity: 0;
    transform: translateY(0) translateX(0);
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-100vh) translateX(var(--drift));
  }
}

@keyframes ember-pulse {
  0%, 100% {
    filter: brightness(0.9) drop-shadow(0 0 8px rgba($terracotta, 0.4));
  }
  50% {
    filter: brightness(1.1) drop-shadow(0 0 18px rgba($amber, 0.6));
  }
}

@keyframes ember-rise-wide {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(1);
  }
  15% {
    opacity: 0.7;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), -70px) scale(0.2);
  }
}
</style>
