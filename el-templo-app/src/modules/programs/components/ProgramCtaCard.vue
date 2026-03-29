<template>
  <div class="exp-card-outer">
    <div class="exp-card-inner">
      <!-- Decorative effects -->
      <div class="exp-radial-glow" />
      <div class="exp-sparkle" />
      <div class="exp-sparkle" />
      <div class="exp-sparkle" />
      <div class="exp-corner-deco" />
      <div class="exp-bottom-line" />

      <!-- Header: badge + icon -->
      <div class="exp-header">
        <div class="exp-badge">
          <svg class="exp-badge-icon" width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,0.5 7.5,4.2 11.5,4.5 8.5,7.2 9.3,11.2 6,9.2 2.7,11.2 3.5,7.2 0.5,4.5 4.5,4.2"
              fill="#C4956A"
              opacity=".9"
            />
          </svg>
          <span class="exp-badge-text">Planes Personalizados</span>
        </div>
        <svg class="exp-header-icon" width="26" height="26" viewBox="0 0 24 24">
          <path
            d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z"
            fill="none"
            stroke="rgba(196,149,106,.7)"
            stroke-width="1"
            stroke-linejoin="round"
          />
          <path
            d="M18 3L18.8 5.5L21 6L18.8 6.5L18 9L17.2 6.5L15 6L17.2 5.5Z"
            fill="rgba(196,149,106,.4)"
            stroke="none"
          />
        </svg>
      </div>

      <!-- Title -->
      <h3 class="exp-title">Entrená con un plan<br />diseñado para vos</h3>

      <!-- Subtitle + CTA row -->
      <div class="exp-footer">
        <p class="exp-subtitle">
          Creamos programas enfocados en tus objetivos, con seguimiento personalizado
        </p>
        <a href="#" class="exp-cta" @click.prevent="openWhatsApp">
          <span class="exp-cta-text">Empezar</span>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemberSegment } from 'src/stores/useUserStore'

defineProps<{
  segment: MemberSegment | null
}>()

const WHATSAPP_NUMBER = '5492235820521'

function openWhatsApp() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola, me interesa un plan personalizado')}`
  window.open(url, '_blank')
}
</script>

<style lang="scss" scoped>
/* Shimmer del borde dorado */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

/* Fade-up para entrada escalonada */
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

/* Pulso del glow radial */
@keyframes pulseGlow {
  0%,
  100% {
    opacity: 0.08;
  }
  50% {
    opacity: 0.18;
  }
}

/* Sparkles */
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

/* Borde shimmer dorado (wrapper exterior) */
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

/* Card interior */
.exp-card-inner {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  border-radius: 16.5px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  animation: fadeUp 0.6s ease-out both;
}

/* Glow radial dorado */
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

/* Partículas de brillo */
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

/* Líneas decorativas esquina superior derecha */
.exp-corner-deco {
  position: absolute;
  top: 0;
  right: 0;
  width: 80px;
  height: 80px;
  overflow: hidden;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    top: 8px;
    right: 8px;
    width: 40px;
    height: 40px;
    border: 1px solid rgba(196, 149, 106, 0.2);
    border-radius: 0 14px 0 0;
  }

  &::after {
    content: '';
    position: absolute;
    top: 15px;
    right: 15px;
    width: 26px;
    height: 26px;
    border: 0.5px solid rgba(196, 149, 106, 0.1);
    border-radius: 0 8px 0 0;
  }
}

/* Línea inferior gradiente */
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

/* Header */
.exp-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

/* Badge */
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

.exp-header-icon {
  opacity: 0.5;
  flex-shrink: 0;
}

/* Title */
.exp-title {
  font-size: 20px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  line-height: 2.25rem;
  padding: 10px 0;
  margin: 0;
  animation: fadeUp 0.6s ease-out 0.15s both;
}

/* Footer row */
.exp-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

/* Subtitle */
.exp-subtitle {
  font-size: 12px;
  color: rgba(240, 230, 214, 0.45);
  line-height: 1.855;
  flex: 1;
  margin: 0;
  animation: fadeUp 0.6s ease-out 0.25s both;
}

/* CTA button */
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

.exp-cta-icon {
  flex-shrink: 0;
}

/* Reduced motion */
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
