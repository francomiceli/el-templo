<template>
  <span class="checkin-chips">
    <q-chip
      v-for="chip in chips"
      :key="chip.key"
      dense
      square
      :color="chip.color"
      :text-color="chip.textColor"
      :icon="chip.icon"
      class="checkin-chip"
    >
      {{ chip.label }}
    </q-chip>
    <span v-if="checkIn.daysAgo > 0" class="checkin-stale">
      · hace {{ checkIn.daysAgo }}d
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DayCheckIn } from 'src/types/checkin-roster';

const props = defineProps<{ checkIn: DayCheckIn }>();

interface Chip {
  key: string;
  label: string;
  color: string;
  textColor: string;
  icon: string;
}

const chips = computed<Chip[]>(() => {
  const c = props.checkIn;
  const out: Chip[] = [];

  if (c.energy) {
    const bad = c.energy === 'bajo';
    const good = c.energy === 'alto';
    out.push({
      key: 'energy',
      label: `Energía ${c.energy === 'bajo' ? 'baja' : c.energy === 'alto' ? 'alta' : 'normal'}`,
      icon: 'bolt',
      color: bad ? 'red-2' : good ? 'green-2' : 'grey-3',
      textColor: bad ? 'red-9' : good ? 'green-9' : 'grey-8',
    });
  }

  if (c.sleep) {
    const bad = c.sleep === 'mal';
    const good = c.sleep === 'bien';
    out.push({
      key: 'sleep',
      label: `Sueño ${c.sleep}`,
      icon: 'bedtime',
      color: bad ? 'red-2' : good ? 'green-2' : 'grey-3',
      textColor: bad ? 'red-9' : good ? 'green-9' : 'grey-8',
    });
  }

  if (c.soreness && c.soreness !== 'ninguna') {
    const moderada = c.soreness === 'moderada';
    const area = c.sorenessBodyArea;
    out.push({
      key: 'soreness',
      label: area
        ? `Molestia ${c.soreness} · ${area}`
        : `Molestia ${c.soreness}`,
      icon: 'healing',
      color: moderada ? 'red-2' : 'amber-3',
      textColor: moderada ? 'red-9' : 'amber-9',
    });
  } else if (c.soreness === 'ninguna') {
    out.push({
      key: 'soreness',
      label: 'Sin molestias',
      icon: 'check',
      color: 'grey-3',
      textColor: 'grey-7',
    });
  }

  return out;
});
</script>

<style scoped>
.checkin-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}
.checkin-chip {
  margin: 1px 2px 1px 0;
  font-size: 0.72rem;
}
.checkin-stale {
  font-size: 0.72rem;
  color: #9e9e9e;
  font-style: italic;
  margin-left: 2px;
}
</style>
