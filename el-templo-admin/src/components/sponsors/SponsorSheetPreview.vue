<!-- Vista previa de la hoja de detalle del beneficio (Fase 199, D-22, D-26).
     Réplica de solo lectura de lo que ve el socio al tocar la card (sketch 005,
     `.spsheet`): hoja blanca con radio 20 arriba, cabecera, beneficio, detalle,
     condiciones y canje (código con "Copiar" o botón "Mostrá tu carnet").
     Con `locked` muestra el estado de un socio sin plan activo.

     Sin eventos: es un dibujo. Los textos se interpolan con `{{ }}` (Vue
     escapa) — PROHIBIDA la directiva de HTML crudo de Vue (T-199-28). -->
<template>
  <div class="sps-wrap">
    <div class="sps-sheet" :style="{ '--b-bg': colors.bg, '--b-fg': colors.fg }">
      <div class="sps-grab" />

      <div class="sps-head">
        <span class="sps-logo">
          <img v-if="logoUrl" :src="logoUrl" alt="" class="sps-logo__img" />
          <q-icon v-else-if="icon" :name="icon" size="26px" />
          <template v-else>{{ initials }}</template>
        </span>
        <div>
          <b class="sps-name">{{ shownName }}</b>
          <small class="sps-cat">{{ shownCategory }}</small>
        </div>
      </div>

      <div class="sps-big">{{ shownBenefit }}</div>
      <div class="sps-det">{{ shownDetail }}</div>
      <p v-if="shownConditions" class="sps-cond">{{ shownConditions }}</p>

      <template v-if="locked">
        <div class="sps-lock">
          <q-icon name="lock" size="18px" />
          Este beneficio es para socios con plan activo.
        </div>
        <div class="sps-btn">Activá tu plan para usarlo</div>
      </template>
      <div v-else-if="redeemType === 'code'" class="sps-code">
        <b class="sps-code__value">{{ redeemCode?.trim() || 'CÓDIGO' }}</b>
        <span class="sps-btn sps-btn--inline">Copiar</span>
      </div>
      <div v-else class="sps-btn">
        <q-icon name="card_membership" size="18px" />
        Mostrá tu carnet
      </div>

      <div class="sps-close">Cerrar</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isHexColor } from 'src/utils/contrast';
import { monogram } from 'src/utils/sponsors';

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
    conditions: string | null;
    redeemType: 'code' | 'carnet';
    redeemCode: string | null;
    locked?: boolean;
  }>(),
  { locked: false }
);

// Un hex a medio escribir no puede romper el render.
const colors = computed(() => ({
  bg: isHexColor(props.bgColor) ? props.bgColor : FALLBACK_BG,
  fg: isHexColor(props.textColor) ? props.textColor : FALLBACK_FG,
}));

const shownName = computed(() => props.name.trim() || 'Nombre de la marca');
const shownCategory = computed(() => props.category.trim() || 'Rubro');
const shownBenefit = computed(() => props.benefit.trim() || '20% OFF');
const shownDetail = computed(() => props.detail.trim() || 'detalle del beneficio');
const shownConditions = computed(() => props.conditions?.trim() ?? '');
const initials = computed(() => monogram(shownName.value));
</script>

<style scoped>
/* Paleta de marca (sketch 005): ink, ink-2 y terracota. */
.sps-wrap {
  width: 360px;
  max-width: 100%;
  padding-top: 16px;
  overflow: hidden;
  background: #e9e3da;
  border-radius: 16px;
  box-sizing: border-box;
}

.sps-sheet {
  display: flex;
  flex-direction: column;
  padding: 10px 20px 16px;
  background: #fff;
  border-radius: 20px 20px 0 0;
  box-sizing: border-box;
  font-family: 'Geologica', sans-serif;
}

.sps-grab {
  align-self: center;
  width: 40px;
  height: 4px;
  margin-bottom: 14px;
  border-radius: 2px;
  background: #d9cfc1;
}

.sps-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

/* En la hoja el logo lleva los colores de la marca (no invertidos). */
.sps-logo {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--b-bg);
  color: var(--b-fg);
  font:
    800 16px 'Montserrat',
    sans-serif;
}

.sps-logo__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sps-name {
  display: block;
  font:
    800 17px 'Montserrat',
    sans-serif;
  color: #2c2318;
}

.sps-cat {
  font-size: 13px;
  color: #6b6459;
}

.sps-big {
  font:
    800 32px/1 'Montserrat',
    sans-serif;
  color: #2c2318;
}

.sps-det {
  margin: 4px 0 10px;
  font-size: 15px;
  color: #2c2318;
}

.sps-cond {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.45;
  color: #6b6459;
  white-space: pre-line;
}

.sps-code {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1.5px dashed #96593a;
  border-radius: 12px;
}

.sps-code__value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font:
    700 22px 'Courier New',
    monospace;
  letter-spacing: 0.08em;
  color: #2c2318;
}

.sps-lock {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4ece3;
  font-size: 14px;
  color: #2c2318;
}

.sps-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 48px;
  border-radius: 12px;
  background: #96593a;
  color: #fff;
  font:
    600 15px 'Geologica',
    sans-serif;
}

.sps-btn--inline {
  flex: none;
  height: 40px;
  padding: 0 16px;
}

.sps-close {
  margin: 4px auto 0;
  padding: 6px 0;
  font:
    600 14px 'Geologica',
    sans-serif;
  color: #96593a;
}
</style>
