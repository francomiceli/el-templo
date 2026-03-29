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
          <span class="exp-badge-text">Presencial</span>
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
      <h3 class="exp-title">Llevalo al siguiente nivel</h3>

      <!-- Subtitle -->
      <p class="exp-subtitle">
        Visitá nuestras sedes y entrená junto a nuestros entrenadores. Tu cuerpo te lo va a
        agradecer.
      </p>

      <!-- CTA -->
      <a href="#" class="exp-cta" @click.prevent="openWhatsApp">
        <svg class="exp-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="#fff">
          <path
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
          />
        </svg>
        <span class="exp-cta-text">Más info</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
const WHATSAPP_NUMBER = '5492235820521'

function openWhatsApp(): void {
  const message = 'Hola, me interesa entrenar de forma presencial'
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
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
.exp-header-icon {
  opacity: 0.5;
  flex-shrink: 0;
}

.exp-title {
  font-size: 20px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  margin: 0;
  animation: fadeUp 0.6s ease-out 0.15s both;
}

.exp-subtitle {
  font-size: 12px;
  color: rgba(240, 230, 214, 0.45);
  line-height: 1.45;
  max-width: 280px;
  margin-bottom: 12px;
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
.exp-cta-icon {
  flex-shrink: 0;
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
