<!-- Vista previa de la placa de aviso de TV (Fase 193, plan 16, D-16).
     Estilos calcados de `el-templo-admin/src/pages/TvScreenPage.vue`
     (pantallaAviso / avisoTitulo / avisoCuerpo, líneas ~1823-1871 y la
     paleta `--trans-*`/`--cream`/`--navy` de las variables del componente,
     líneas ~507-533) — NO se importa `render.ts` ni código del TV, esto es
     una réplica visual a escala, de solo lectura.

     Velo por modo (D-27/D-28): `flex_inicio` usa el velo crema/día
     (`.pantalla--dia`, TvScreenPage.vue ~1966); `flex_final` y `manual` usan
     el velo charcoal/noche por defecto (TvScreenPage.vue ~1673-1708) — igual
     que `avisoVeloFor` en `render.ts` resuelve "noche" para `closing` y para
     el modo manual disparado fuera de la flexibilidad inicial.

     Texto plano interpolado con `{{ }}` (Vue escapa por defecto) — PROHIBIDA
     la directiva de HTML crudo de Vue acá: un aviso con marcado en el título
     o el cuerpo nunca debe ejecutarse en el admin. -->
<template>
  <div class="tv-aviso-preview" :class="{ 'tv-aviso-preview--dia': mode === 'flex_inicio' }">
    <div class="tv-aviso-preview__label">Vista previa de la placa</div>
    <div class="tv-aviso-preview__placa">
      <div class="tv-aviso-preview__titulo">{{ title || 'Título del aviso' }}</div>
      <div class="tv-aviso-preview__cuerpo">{{ body || 'Cuerpo del aviso.' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TvAvisoMode } from 'src/composables/useCommunicationsApi';

defineProps<{
  mode: TvAvisoMode;
  title: string;
  body: string;
}>();
</script>

<style lang="scss" scoped>
// Paleta calcada de TvScreenPage.vue (`#tvScreenRoot`, líneas ~507-533).
$trans-noche: #1a1714;
$trans-crema: #f2ede5;
$trans-bronce: #d4b896;
$cream: #f2ebe1;
$navy: #3d3732;
$cinzel: 'Cinzel', Georgia, serif;

.tv-aviso-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}

.tv-aviso-preview__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
}

// Velo noche (charcoal, TvScreenPage.vue .pantalla): manual + flex_final.
.tv-aviso-preview__placa {
  width: 100%;
  max-width: 420px;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.4rem 2rem;
  background: $trans-noche;
  border-radius: 8px;
  overflow: hidden;
}

.tv-aviso-preview__titulo {
  font-family: $cinzel;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.15;
  letter-spacing: 0.12em;
  color: $trans-bronce;
  margin-bottom: 0.6rem;
  text-shadow: 0 0 0.3rem rgba(26, 23, 20, 0.9);
}

.tv-aviso-preview__cuerpo {
  font-family: $cinzel;
  font-weight: 700;
  font-size: 1.15rem;
  line-height: 1.4;
  color: $trans-crema;
  text-shadow: 0 0.06em 0.3em rgba(0, 0, 0, 0.6);
}

// Velo día (crema, TvScreenPage.vue .pantalla--dia): flex_inicio. El título y
// el cuerpo mantienen los mismos colores (bronce/crema) que en la placa real
// — TvScreenPage.vue no sobreescribe `.avisoTitulo`/`.avisoCuerpo` dentro de
// `.pantalla--dia`, solo cambia el fondo y los logos.
.tv-aviso-preview--dia .tv-aviso-preview__placa {
  background: $cream;
}
</style>
