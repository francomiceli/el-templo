<!--
  Input de importes es-AR (fase 207, DI-05).

  Por qué no `q-input type="number"`: con coma decimal (es-AR) el navegador
  devuelve texto vacío o descarta el valor según el idioma, y no deja escribir
  "77.570,82". Acá el input es de texto con teclado decimal (`inputmode`) y el
  texto se interpreta con `parseMoneyInput` (utils/money.ts):
  - acepta "77.570,82", "77570,82" y "77570.82"; "1.500" es mil quinientos
    (convención es-AR) y "1.50" es uno con cincuenta;
  - rechaza 3 o más decimales ("Máximo 2 decimales") y negativos/letras
    ("Importe inválido").

  v-model: `number | null`. Vacío o inválido emite `null`; la obligatoriedad la
  pone el padre con `rules` (reciben el número parseado, `null` si está vacío),
  después de la validación propia del parser. Al perder foco, si el texto es
  válido se reescribe formateado ("1234,5" -> "1.234,50") para que el usuario
  vea qué se entendió. Si el padre cambia el valor desde afuera (autocompletar,
  "Pagar todo") el texto se reescribe.

  Los atributos extra (`outlined`, `dense`, `prefix`, `suffix`, `hint`,
  `disable`, `autofocus`, `class`, `data-testid`...) pasan al `q-input`.
  `validate()` y `resetValidation()` se exponen para los diálogos que los
  llamaban sobre el ref del input.
-->
<template>
  <q-input
    ref="inputRef"
    v-bind="$attrs"
    :model-value="text"
    :label="label"
    :rules="innerRules"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    @update:model-value="onInput"
    @blur="onBlur"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QInput } from 'quasar';
import {
  formatMoneyNumber,
  moneyEquals,
  MONEY_PARSE_MESSAGES,
  parseMoneyInput,
} from 'src/utils/money';

defineOptions({ inheritAttrs: false });

type MoneyRule = (value: number | null) => true | string;

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    label?: string;
    rules?: MoneyRule[];
  }>(),
  {
    label: undefined,
    rules: () => [],
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
}>();

const inputRef = ref<InstanceType<typeof QInput> | null>(null);

function toText(value: number | null): string {
  return value === null ? '' : formatMoneyNumber(value);
}

const text = ref<string>(toText(props.modelValue));
// Último valor emitido al padre: distingue el eco de nuestro propio emit de un
// cambio externo (autocompletar, reset) que sí hay que reflejar en el texto.
let lastEmitted: number | null = props.modelValue;

function numberOrNull(raw: string): number | null {
  const parsed = parseMoneyInput(raw);
  return parsed.ok ? parsed.value : null;
}

function onInput(value: string | number | null): void {
  text.value = value === null ? '' : String(value);
  const next = numberOrNull(text.value);
  lastEmitted = next;
  emit('update:modelValue', next);
}

function onBlur(): void {
  const parsed = parseMoneyInput(text.value);
  if (parsed.ok) text.value = formatMoneyNumber(parsed.value);
}

watch(
  () => props.modelValue,
  (value) => {
    const isEcho =
      value === lastEmitted ||
      (value !== null && lastEmitted !== null && moneyEquals(value, lastEmitted));
    if (isEcho) return;
    lastEmitted = value;
    text.value = toText(value);
  }
);

// 1) el parser (vacío pasa: lo exige el padre si es obligatorio), 2) las rules
// del padre con el número parseado.
const innerRules = computed<Array<(val: string) => true | string>>(() => [
  (val) => {
    const parsed = parseMoneyInput(val ?? '');
    if (parsed.ok || parsed.reason === 'empty') return true;
    return MONEY_PARSE_MESSAGES[parsed.reason];
  },
  ...props.rules.map((rule) => (val: string) => rule(numberOrNull(val ?? ''))),
]);

defineExpose({
  validate: () => inputRef.value?.validate(),
  resetValidation: () => inputRef.value?.resetValidation(),
});
</script>
