<!-- Vista previa de la placa de aviso de TV (Fase 193, plan 16, D-16).
     Estilos calcados de `el-templo-admin/src/pages/TvScreenPage.vue`
     (pantallaAviso / avisoTitulo / avisoCuerpo, líneas ~1823-1871 y la
     paleta `--trans-*`/`--cream`/`--navy` de las variables del componente,
     líneas ~507-533) — NO se importa `render.ts` ni código del TV, esto es
     una réplica visual a escala, de solo lectura.

     Velo por tema (2026-10-06, lo elige el admin): "claro" = velo crema de
     la flexibilidad inicial (`.pantalla--dia`), "oscuro" = charcoal del
     cierre — igual que `avisoVeloFor` en `render.ts`.

     Texto plano interpolado con `{{ }}` (Vue escapa por defecto) — PROHIBIDA
     la directiva de HTML crudo de Vue acá: un aviso con marcado en el título
     o el cuerpo nunca debe ejecutarse en el admin. -->
<template>
  <div class="tv-aviso-preview" :class="{ 'tv-aviso-preview--dia': tema === 'claro' }">
    <div class="tv-aviso-preview__label">Vista previa de la placa</div>
    <div class="tv-aviso-preview__placa">
      <div class="tv-aviso-preview__titulo">{{ title || 'Título del aviso' }}</div>
      <div class="tv-aviso-preview__cuerpo">{{ body || 'Cuerpo del aviso.' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TvAvisoTema } from 'src/composables/useCommunicationsApi';

defineProps<{
  tema: TvAvisoTema;
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
$gold: #b08d6e;
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

// Tema claro (crema, TvScreenPage.vue .pantalla--dia): colores de la
// flexibilidad inicial — título dorado, cuerpo en tinta, sin sombras
// (TvScreenPage.vue `#pantallaAviso.pantalla--dia .avisoTitulo/.avisoCuerpo`).
.tv-aviso-preview--dia .tv-aviso-preview__placa {
  background: $cream;
}
.tv-aviso-preview--dia .tv-aviso-preview__titulo {
  color: $gold;
  text-shadow: none;
}
.tv-aviso-preview--dia .tv-aviso-preview__cuerpo {
  color: $navy;
  text-shadow: none;
}
</style>
