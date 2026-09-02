<!-- Vista previa inline con el estilo REAL del aviso (Fase 193, plan 11, D-16).
     Dos variantes según `placement`:
       - popup: card oscura del pop-up de la app (colores/tamaños copiados de
         el-templo-app/src/components/RatingPromptDialog.vue).
       - tarjeta: card del carrusel premium de Mi Templo (colores/tamaños
         copiados de
         el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue).
     Solo lectura. El copy se interpola con `{{ }}` (Vue escapa por defecto) —
     PROHIBIDO `v-html` acá (T-193-42): un aviso con HTML en el título nunca
     debe ejecutarse en el admin. -->
<template>
  <div class="aviso-preview">
    <div class="aviso-preview__label">Vista previa</div>

    <!-- Popup: mismo molde que RatingPromptDialog.vue -->
    <div v-if="placement === 'popup'" class="popup-preview">
      <h3 class="popup-preview__title">{{ title || 'Título del aviso' }}</h3>
      <p class="popup-preview__body">{{ body || 'Mensaje del aviso.' }}</p>
      <div class="popup-preview__primary">{{ buttonText || 'Botón' }}</div>
      <div class="popup-preview__secondary">Ahora no</div>
      <div class="popup-preview__destination">Destino: {{ destinationLabel }}</div>
    </div>

    <!-- Tarjeta: mismo molde que ImprovementCtaCard.vue -->
    <div v-else class="tarjeta-preview-outer">
      <div class="tarjeta-preview-inner">
        <div class="tarjeta-preview__badge">Aviso</div>
        <h3 class="tarjeta-preview__title">{{ title || 'Título del aviso' }}</h3>
        <div class="tarjeta-preview__footer">
          <p class="tarjeta-preview__subtitle">{{ body || 'Mensaje del aviso.' }}</p>
          <div class="tarjeta-preview__cta">{{ buttonText || 'Botón' }}</div>
        </div>
        <div class="tarjeta-preview__destination">Destino: {{ destinationLabel }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  placement: 'popup' | 'tarjeta';
  title: string;
  body: string;
  buttonText: string;
  destinationLabel: string;
}>();
</script>

<style lang="scss" scoped>
// Constantes copiadas de el-templo-app/src/css/_brand.scss ($brand-terracotta)
// + el-templo-app/src/components/RatingPromptDialog.vue (charcoal/cream,
// radio 16px, max-width 340px) y de
// el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue
// (gradiente dorado del borde, fondo #1a1612→#2c2318→#1e1914).
$terracotta: #96593a;
$cream: #f2ede5;
$charcoal: #2e2a26;

.aviso-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}

.aviso-preview__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
}

// ── Popup (RatingPromptDialog.vue) ─────────────────────────────────────
.popup-preview {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 16px 20px;
  text-align: center;
}

.popup-preview__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.0625rem;
  margin: 0 0 8px;
  color: $cream;
}

.popup-preview__body {
  font-family: 'Geologica', sans-serif;
  font-size: 0.875rem;
  color: rgba($cream, 0.85);
  margin: 0 0 12px;
  white-space: pre-wrap;
}

.popup-preview__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%);
  color: $cream;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.08em;
  border-radius: 8px;
  padding: 10px 0;
  margin-bottom: 4px;
}

.popup-preview__secondary {
  color: rgba($cream, 0.55);
  font-family: 'Geologica', sans-serif;
  font-size: 0.8125rem;
  padding: 4px 0;
}

.popup-preview__destination {
  margin-top: 8px;
  font-size: 0.6875rem;
  color: rgba($cream, 0.45);
}

// ── Tarjeta (ImprovementCtaCard.vue) ────────────────────────────────────
.tarjeta-preview-outer {
  width: 100%;
  max-width: 340px;
  border-radius: 18px;
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(180, 140, 80, 0.3),
    rgba(196, 149, 106, 0.6) 50%,
    rgba(180, 140, 80, 0.3)
  );
}

.tarjeta-preview-inner {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  border-radius: 16.5px;
  padding: 18px;
}

.tarjeta-preview__badge {
  display: inline-block;
  background: rgba(196, 149, 106, 0.15);
  border: 0.5px solid rgba(196, 149, 106, 0.3);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 600;
  color: #c4956a;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.tarjeta-preview__title {
  font-size: 18px;
  font-weight: 600;
  color: #f0e6d6;
  margin: 0 0 10px;
}

.tarjeta-preview__footer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.tarjeta-preview__subtitle {
  font-size: 12px;
  color: rgba(240, 230, 214, 0.55);
  line-height: 1.6;
  align-self: stretch;
  margin: 0;
  white-space: pre-wrap;
  text-align: left;
}

.tarjeta-preview__cta {
  background: linear-gradient(135deg, #c4956a, #a07850);
  border-radius: 10px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.tarjeta-preview__destination {
  margin-top: 10px;
  font-size: 0.6875rem;
  color: rgba(240, 230, 214, 0.4);
}
</style>
