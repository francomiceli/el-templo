<!-- Contador de mensajes enviados (0-4) del seguimiento: botones 0..4 para fijar el
     número y "+1" para sumar uno. Lo comparten Renovaciones e Invitaciones (mismo
     gesto y misma apariencia). Solo avisa con `set`: quien lo usa hace el PATCH. -->
<template>
  <div class="row items-center no-wrap q-gutter-xs">
    <q-btn-group dense>
      <q-btn
        v-for="n in steps"
        :key="n"
        dense
        size="sm"
        :color="count === n ? 'primary' : 'grey-4'"
        :text-color="count === n ? 'white' : 'grey-8'"
        :label="String(n)"
        :disable="disabled"
        @click="onSet(n)"
      />
    </q-btn-group>
    <q-btn
      flat
      round
      dense
      size="sm"
      icon="send"
      :disable="disabled || count >= MAX_MESSAGES"
      @click="onSet(count + 1)"
    >
      <q-tooltip v-if="tooltip">Marcar mensaje enviado (+1)</q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
const MAX_MESSAGES = 4;
const steps = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => i);

const props = withDefaults(
  defineProps<{
    count: number;
    disabled?: boolean;
    /** Tooltip del "+1" (en celular, con tarjetas, va apagado). */
    tooltip?: boolean;
  }>(),
  { disabled: false, tooltip: true }
);

const emit = defineEmits<{
  /** Nuevo total de mensajes (ya validado: distinto al actual y entre 0 y 4). */
  set: [count: number];
}>();

function onSet(n: number) {
  if (n === props.count || n < 0 || n > MAX_MESSAGES) return;
  emit('set', n);
}
</script>
