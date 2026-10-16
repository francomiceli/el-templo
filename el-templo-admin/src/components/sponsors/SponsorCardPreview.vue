<!-- Vista previa de la card de patrocinador del carrusel de Mi Templo (Fase 199,
     D-23, D-26). Réplica de solo lectura de lo que ve el socio en la app
     (sketch 005, `.sp`): marco de teléfono de 360 px, la card activa al 82 % y
     una segunda card "fantasma" a escala .94 (misma marca) para mostrar el
     asomo del carrusel.

     Texto SIEMPRE sólido en el color de la marca (D-15, sin opacidad en
     textos): los placeholders usan el mismo color. Los textos se interpolan con
     `{{ }}` (Vue escapa) — PROHIBIDA la directiva de HTML crudo de Vue: una
     marca con HTML nunca debe ejecutarse en el admin (T-199-28). -->
<template>
  <div ref="phoneEl" class="spc-phone">
    <div class="spc-track">
      <article
        v-for="(ghost, i) in cards"
        :key="i"
        class="spc-card"
        :class="{ 'spc-card--ghost': ghost }"
        :style="{ '--b-bg': colors.bg, '--b-fg': colors.fg }"
        :aria-hidden="ghost ? 'true' : undefined"
      >
        <q-icon v-if="icon" :name="icon" class="spc-wm" aria-hidden="true" />
        <div class="spc-top">
          <span class="spc-logo">
            <img v-if="logoUrl" :src="logoUrl" alt="" class="spc-logo__img" />
            <q-icon v-else-if="icon" :name="icon" size="24px" />
            <template v-else>{{ initials }}</template>
          </span>
          <div class="spc-heading">
            <div class="spc-name">{{ shownName }}</div>
            <span class="spc-cat">{{ shownCategory }}</span>
          </div>
        </div>
        <div class="spc-deal">
          <div class="spc-deal__text">
            <b class="spc-benefit">{{ shownBenefit }}</b>
            <span class="spc-detail">{{ shownDetail }}</span>
          </div>
          <span class="spc-how">
            <q-icon :name="redeemPill.icon" size="14px" />
            {{ redeemPill.label }}
          </span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { isHexColor } from 'src/utils/contrast';
import {
  fitBenefitFontPx,
  monogram,
  sponsorBenefitFontPx,
  sponsorRedeemPill,
} from 'src/utils/sponsors';

const FALLBACK_BG = '#3d3732';
const FALLBACK_FG = '#f2ede5';

const props = withDefaults(
  defineProps<{
    name: string;
    category: string;
    logoUrl: string | null;
    icon: string | null;
    bgColor: string;
    textColor: string;
    benefit: string;
    detail: string;
    redeemType: 'code' | 'carnet';
    redeemCode: string | null;
    /** Socio sin plan activo: el código de canje se ve bloqueado (igual que en la app). */
    locked?: boolean;
  }>(),
  { locked: false }
);

// [card activa, card fantasma]: se renderiza la misma marca dos veces.
const cards = [false, true];

// Un hex a medio escribir no puede romper el render.
const colors = computed(() => ({
  bg: isHexColor(props.bgColor) ? props.bgColor : FALLBACK_BG,
  fg: isHexColor(props.textColor) ? props.textColor : FALLBACK_FG,
}));

const shownName = computed(() => props.name.trim() || 'Nombre de la marca');
const shownCategory = computed(() => props.category.trim() || 'Rubro');
const shownBenefit = computed(() => props.benefit.trim() || '20% OFF');
const shownDetail = computed(() => props.detail.trim() || 'detalle del beneficio');
const initials = computed(() => monogram(shownName.value));
// Misma función que la app (`sponsorRedeemPill`): con `locked` el socio sin plan ve el candado.
// Sin código cargado todavía se muestra el placeholder "CÓDIGO" (solo en la vista previa).
const redeemPill = computed(() =>
  sponsorRedeemPill(
    { redeemType: props.redeemType, redeemCode: props.redeemCode?.trim() || 'CÓDIGO' },
    !props.locked
  )
);

// ── Tamaño del beneficio: el mismo ajuste por medición que la card de la app (UAT D6) ──
// Mismo algoritmo, umbrales y piso que `SponsorsCarousel.vue` de la app (L15/L16):
// cambiar los dos juntos.
const phoneEl = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let lastWidth = -1;
let disposed = false;

function fitBenefit(): void {
  const start = sponsorBenefitFontPx(shownBenefit.value);
  phoneEl.value?.querySelectorAll<HTMLElement>('.spc-benefit').forEach((el) => {
    const px = fitBenefitFontPx(start, (candidate) => {
      el.style.fontSize = `${candidate}px`;
      return el.scrollWidth <= el.clientWidth + 1;
    });
    el.style.fontSize = `${px}px`;
  });
}

watch(shownBenefit, () => {
  void nextTick(fitBenefit);
});

onMounted(() => {
  fitBenefit();
  if (typeof ResizeObserver !== 'undefined' && phoneEl.value) {
    resizeObserver = new ResizeObserver(() => {
      // Solo el ancho cambia el ajuste: el alto cambia al achicar la letra y no debe re-medir.
      const width = phoneEl.value?.clientWidth ?? 0;
      if (width === lastWidth) return;
      lastWidth = width;
      fitBenefit();
    });
    resizeObserver.observe(phoneEl.value);
  }
  void document.fonts?.ready.then(() => {
    if (!disposed) fitBenefit();
  });
});

onUnmounted(() => {
  disposed = true;
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.spc-phone {
  width: 360px;
  max-width: 100%;
  overflow: hidden;
  background: #f2ede5;
  padding: 16px 0 16px 16px;
  border-radius: 16px;
  box-sizing: border-box;
}

.spc-track {
  display: flex;
  gap: 10px;
}

.spc-card {
  flex: 0 0 82%;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 156px;
  padding: 16px;
  border-radius: 16px;
  background: var(--b-bg);
  color: var(--b-fg);
}

.spc-card--ghost {
  transform: scale(0.94);
}

/* Marca de agua decorativa, no es texto. */
.spc-wm {
  position: absolute;
  right: -18px;
  bottom: -26px;
  font-size: 140px;
  color: var(--b-fg);
  opacity: 0.13;
  pointer-events: none;
}

.spc-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Logo en colores INVERTIDOS respecto de la card. */
.spc-logo {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--b-fg);
  color: var(--b-bg);
  font:
    800 15px 'Montserrat',
    sans-serif;
}

.spc-logo__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.spc-name {
  font:
    800 17px/1.15 'Montserrat',
    sans-serif;
}

.spc-cat {
  display: block;
  font:
    500 12px/1.3 'Geologica',
    sans-serif;
}

/* Fila del canje: la pastilla baja si no entra, el beneficio nunca se quiebra. */
.spc-deal {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
}

.spc-deal__text {
  flex: 1 1 auto;
  min-width: 96px;
  max-width: 100%;
}

/* Bajo el piso del ajuste (16 px) la app corta con elipsis: la vista previa lo muestra igual. */
.spc-benefit {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font:
    800 30px/1 'Montserrat',
    sans-serif;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.spc-detail {
  display: block;
  margin-top: 3px;
  font:
    500 12px/1.3 'Geologica',
    sans-serif;
}

.spc-how {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 99px;
  background: var(--b-fg);
  color: var(--b-bg);
  font:
    700 11px 'Montserrat',
    sans-serif;
  white-space: nowrap;
}
</style>
