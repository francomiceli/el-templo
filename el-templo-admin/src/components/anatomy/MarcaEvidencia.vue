<template>
  <span v-if="items.length > 0" class="marcas">
    <sup
      v-for="m in items"
      :key="m.etiqueta"
      class="cit"
      tabindex="0"
      role="note"
      :aria-label="`${m.etiqueta}: ${m.texto}`"
    >
      {{ m.etiqueta }}
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 6]" max-width="280px">
        {{ m.texto }}
      </q-tooltip>
    </sup>
  </span>
</template>

<script setup lang="ts">
/**
 * Fase 200 D11: marcas de evidencia de una afirmación. Un número o L1–L5 se resuelve contra
 * `vista.citas` (texto + lectura); C/M/R/H/N contra `vista.leyenda`. Las marcas llegan
 * estructuradas (nunca HTML) y se pintan solo con `{{ }}` (T-200-34). Sin marcas no renderiza nada.
 */
import { computed } from 'vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import type { Marca } from 'src/types/anatomy';

const props = defineProps<{
  marcas: readonly Marca[];
}>();

const anatomyStore = useAnatomyStore();

interface MarcaVista {
  etiqueta: string;
  texto: string;
}

type LetraLeyenda = 'C' | 'M' | 'R' | 'H' | 'N';

function esLetraLeyenda(m: Marca): m is LetraLeyenda {
  return m === 'C' || m === 'M' || m === 'R' || m === 'H' || m === 'N';
}

function textoDe(m: Marca): string {
  const vista = anatomyStore.vista;
  if (esLetraLeyenda(m)) return vista?.leyenda[m] ?? `Marca ${m}`;
  const cita = vista?.citas.find((c) => c.id === m);
  if (cita) return `${cita.texto} — ${cita.lectura}`;
  return typeof m === 'number' ? `Fuente [${m}] del Apéndice A` : `Marca ${m}`;
}

const items = computed<MarcaVista[]>(() =>
  props.marcas.map((m) => ({ etiqueta: String(m), texto: textoDe(m) }))
);
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.marcas {
  white-space: nowrap;
}

// Chip chico tipo cita (sketch 019 base.css sup.cit)
.cit {
  margin-left: 3px;
  padding: 0 3px;
  border: 1px solid $anat-line;
  border-radius: 4px;
  background: $anat-soft;
  font-size: 10px;
  color: $anat-clay;
  vertical-align: 2px;
  cursor: help;

  &:focus-visible {
    outline: 2px solid $anat-terra;
    outline-offset: 1px;
  }
}
</style>
