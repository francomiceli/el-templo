<!-- Card de referidos en Mi Templo (fase 158) — primera card visible.
     Mismo molde visual que UpsellBadge (premium); CTA navega a /mis-referidos,
     donde viven el código, el share nativo y el desglose del descuento. -->
<template>
  <div class="exp-card-outer">
    <div class="exp-card-inner">
      <!-- Decorative effects -->
      <div class="exp-radial-glow" />
      <div class="exp-sparkle" />
      <div class="exp-sparkle" />
      <div class="exp-sparkle" />
      <div class="exp-bottom-line" />

      <!-- Header: badge -->
      <div class="exp-header">
        <div class="exp-badge">
          <svg class="exp-badge-icon" width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,0.5 7.5,4.2 11.5,4.5 8.5,7.2 9.3,11.2 6,9.2 2.7,11.2 3.5,7.2 0.5,4.5 4.5,4.2"
              fill="#C4956A"
              opacity=".9"
            />
          </svg>
          <span class="exp-badge-text">Referidos</span>
        </div>
      </div>

      <!-- Title -->
      <h3 class="exp-title">Entrená acompañado, pagá menos</h3>

      <!-- Subtitle + CTA row -->
      <div class="exp-footer">
        <p class="exp-subtitle">
          Invitá a alguien a entrenar. Mientras los dos sean activos, ambos obtienen descuento en su
          cuota.
        </p>
        <a href="#" class="exp-cta" @click.prevent="goToReferidos">
          <span class="exp-cta-text">Compartir código</span>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goToReferidos(): void {
  void router.push('/mis-referidos')
}
</script>

<style lang="scss" scoped>
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 0.08;
  }
  50% {
    opacity: 0.18;
  }
}

@keyframes sparkle1 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.5);
  }
  50% {
    opacity: 0.7;
    transform: scale(1);
  }
}

@keyframes sparkle2 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.4);
  }
  40% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}

@keyframes sparkle3 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.exp-card-outer {
  position: relative;
  border-radius: 18px;
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(180, 140, 80, 0.15),
    rgba(196, 149, 106, 0.4) 30%,
    rgba(220, 190, 130, 0.6) 50%,
    rgba(196, 149, 106, 0.4) 70%,
    rgba(180, 140, 80, 0.15)
  );
  background-size: 200% 200%;
  animation: shimmer 4s ease-in-out infinite;
}

.exp-card-inner {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  border-radius: 16.5px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  animation: fadeUp 0.6s ease-out both;
}

.exp-radial-glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(196, 149, 106, 0.12) 0%, transparent 70%);
  pointer-events: none;
  animation: pulseGlow 4s ease-in-out infinite;
}

.exp-sparkle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 190, 130, 0.8) 0%, transparent 70%);
  pointer-events: none;
  &:nth-child(2) {
    top: 18px;
    right: 60px;
    width: 6px;
    height: 6px;
    animation: sparkle1 3s ease-in-out infinite;
  }
  &:nth-child(3) {
    top: 50px;
    right: 30px;
    width: 4px;
    height: 4px;
    animation: sparkle2 4s ease-in-out infinite 0.8s;
  }
  &:nth-child(4) {
    top: 35px;
    right: 90px;
    width: 5px;
    height: 5px;
    animation: sparkle3 3.5s ease-in-out infinite 1.5s;
  }
}

.exp-bottom-line {
  position: absolute;
  bottom: 0;
  left: 22px;
  right: 22px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(196, 149, 106, 0.2) 20%,
    rgba(196, 149, 106, 0.35) 50%,
    rgba(196, 149, 106, 0.2) 80%,
    transparent
  );
}

.exp-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

.exp-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(196, 149, 106, 0.18), rgba(196, 149, 106, 0.08));
  border: 0.5px solid rgba(196, 149, 106, 0.3);
  border-radius: 20px;
  padding: 4px 12px 4px 8px;
}

.exp-badge-icon {
  flex-shrink: 0;
}
.exp-badge-text {
  font-size: 10px;
  font-weight: 600;
  color: #c4956a;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.exp-title {
  font-size: 20px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  margin: 0;
  animation: fadeUp 0.6s ease-out 0.15s both;
}

.exp-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.exp-subtitle {
  font-size: 12px;
  color: rgba(240, 230, 214, 0.45);
  line-height: 1.855;
  flex: 1;
  margin: 0;
  animation: fadeUp 0.6s ease-out 0.25s both;
}

.exp-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #c4956a, #a07850);
  border: none;
  border-radius: 10px;
  padding: 8px 18px;
  cursor: pointer;
  transition: all 0.25s ease;
  animation: fadeUp 0.6s ease-out 0.35s both;
  text-decoration: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.exp-cta-text {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
}

@media (prefers-reduced-motion: reduce) {
  .exp-card-outer {
    animation: none;
    background-size: 100% 100%;
  }
  .exp-card-inner,
  .exp-title,
  .exp-subtitle,
  .exp-cta {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .exp-radial-glow {
    animation: none;
    opacity: 0.12;
  }
  .exp-sparkle {
    animation: none;
    opacity: 0;
  }
}
</style>
