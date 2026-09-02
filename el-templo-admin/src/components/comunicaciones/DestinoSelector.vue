<!-- Selector de destino común (Fase 193, D-01/D-02/D-05): reemplaza el input
     de "Ruta de destino" de texto libre en push, avisos y tarjetas. Un solo
     q-select con las secciones curadas de la app (`APP_SECTIONS`) más la
     opción "WhatsApp de ventas"; al elegir WhatsApp aparece el texto
     pre-cargado editable, con el default global como placeholder cuando
     queda vacío. La validación real (rutas fuera de lista, texto con links)
     es SIEMPRE server-side (D-05) — este componente solo ofrece opciones
     curadas, nunca un campo de texto libre para la ruta. -->
<template>
  <div>
    <q-select
      :model-value="selectedKey"
      :options="options"
      label="Destino"
      dense
      outlined
      emit-value
      map-options
      class="q-mb-sm"
      @update:model-value="onSelect"
    />
    <q-input
      v-if="modelValue.type === 'whatsapp_sales'"
      :model-value="modelValue.whatsappText ?? ''"
      label="Texto para WhatsApp"
      type="textarea"
      autogrow
      outlined
      dense
      maxlength="300"
      counter
      :placeholder="DEFAULT_WHATSAPP_TEXT"
      hint="Si lo dejás vacío se usa el mensaje por defecto"
      @update:model-value="onWhatsappTextInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { APP_SECTIONS, DEFAULT_WHATSAPP_TEXT } from 'src/config/destinations';
import type { AppSectionKey, Destination } from 'src/config/destinations';

const props = defineProps<{
  modelValue: Destination;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Destination];
}>();

const WHATSAPP_OPTION_VALUE = 'whatsapp_sales' as const;

const options = [
  ...APP_SECTIONS.map((section) => ({ label: section.label, value: section.key })),
  { label: 'WhatsApp de ventas', value: WHATSAPP_OPTION_VALUE },
];

// Clave única del q-select: la sección elegida (AppSectionKey) o el sentinel
// de WhatsApp. No colisiona: ninguna AppSectionKey vale 'whatsapp_sales'.
const selectedKey = computed<string>(() => {
  if (props.modelValue.type === 'whatsapp_sales') return WHATSAPP_OPTION_VALUE;
  return props.modelValue.section ?? APP_SECTIONS[0]!.key;
});

function onSelect(value: string | number | null): void {
  if (value === WHATSAPP_OPTION_VALUE) {
    emit('update:modelValue', {
      type: 'whatsapp_sales',
      section: null,
      whatsappText: props.modelValue.whatsappText,
    });
    return;
  }
  emit('update:modelValue', {
    type: 'app_section',
    section: value as AppSectionKey,
    whatsappText: null,
  });
}

function onWhatsappTextInput(value: string | number | null): void {
  const text = typeof value === 'string' ? value : '';
  emit('update:modelValue', {
    ...props.modelValue,
    whatsappText: text.length > 0 ? text : null,
  });
}
</script>
