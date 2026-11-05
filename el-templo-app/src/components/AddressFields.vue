<template>
  <!-- Calle y altura en una sola fila: el pop-up queda chico y se lee como "dos datos" (no un
       formulario). Mismo componente en el pop-up de Mi Templo (oscuro) y en Perfil (claro). -->
  <div class="address-fields" :class="dark ? 'address-fields--dark' : 'address-fields--light'">
    <q-input
      :model-value="street"
      class="address-fields__input address-fields__street"
      :dark="dark"
      outlined
      stack-label
      label="Calle"
      placeholder="Ej: Av. Colón"
      maxlength="200"
      autocomplete="address-line1"
      autocapitalize="words"
      :autofocus="autofocus"
      @update:model-value="(v) => emit('update:street', String(v ?? ''))"
    />
    <q-input
      :model-value="number"
      class="address-fields__input address-fields__number"
      :dark="dark"
      outlined
      stack-label
      label="Altura"
      placeholder="Ej: 2450"
      maxlength="10"
      inputmode="numeric"
      autocomplete="off"
      @update:model-value="(v) => emit('update:number', String(v ?? ''))"
      @keyup.enter="emit('submit')"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    street: string
    number: string
    /** `true` sobre la card oscura del pop-up; `false` en el diálogo claro de Perfil. */
    dark?: boolean
    autofocus?: boolean
  }>(),
  { dark: false, autofocus: false },
)

const emit = defineEmits<{
  'update:street': [value: string]
  'update:number': [value: string]
  submit: []
}>()
</script>

<style lang="scss" scoped>
// Los campos viven DENTRO de este componente, así que el `:slotted(.pd-input)` de
// PremiumDialogCard no los alcanza: se visten acá con los mismos mixins del partial.
@import 'src/css/premium-card';

.address-fields {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 14px;
}

// `:deep`: las reglas de los mixins apuntan al interior del q-input (`.q-field__control`, …),
// que no lleva el scope de este componente.
.address-fields--dark :deep(.address-fields__input) {
  @include pd-field(15px);
}

.address-fields--dark :deep(.address-fields__input.q-field--focused .q-field__control) {
  color: $pd-cream-2;
}

.address-fields--light :deep(.address-fields__input) {
  @include pd-field-light(15px);
}

.address-fields__street {
  flex: 1 1 auto;
  min-width: 0;
}

.address-fields__number {
  flex: 0 0 96px;
}
</style>
