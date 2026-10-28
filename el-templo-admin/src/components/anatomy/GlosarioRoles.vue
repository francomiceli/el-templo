<template>
  <q-expansion-item
    v-if="glosario"
    class="glosario"
    dense
    switch-toggle-side
    expand-icon-toggle
    label="¿Qué significa cada rol?"
    header-class="glosario__header"
  >
    <div class="glosario__body">
      <h4 class="glosario__h">Roles del músculo</h4>
      <p v-for="r in glosario.roles" :key="r.rol" class="glosario__p">
        <i class="glosario__sw" :class="`glosario__sw--${r.rol}`" aria-hidden="true" />
        <b>{{ r.titulo }}.</b> {{ r.definicion }}<br />
        <i class="glosario__ej">{{ r.ejemplo }}</i>
      </p>

      <h4 class="glosario__h">Tipos de contracción</h4>
      <p v-for="c in glosario.contracciones" :key="c.clave" class="glosario__p">
        <b class="glosario__k">{{ c.clave }}</b
        ><b>{{ c.titulo }}.</b> {{ c.definicion }}
        <i v-if="c.ejemplo" class="glosario__ej">{{ c.ejemplo }}</i>
      </p>

      <h4 class="glosario__h">Precisión de la zona en el dibujo</h4>
      <p v-for="p in glosario.precision" :key="p.clave" class="glosario__p">
        <b>{{ p.titulo }}.</b> {{ p.definicion }}
      </p>

      <p class="glosario__pie">
        Definiciones estándar de anatomía<MarcaEvidencia :marcas="MARCA_L1" />.
      </p>
    </div>
  </q-expansion-item>
</template>

<script setup lang="ts">
/**
 * Fase 200 D9/D11: glosario dentro de la ficha ("¿Qué significa cada rol?"). Roles, tipos de
 * contracción y precisión de la zona salen de `vista.glosario` del API; acá no hay definiciones
 * hardcodeadas. Todo texto va con `{{ }}`.
 */
import { computed } from 'vue';
import MarcaEvidencia from 'components/anatomy/MarcaEvidencia.vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import type { Marca } from 'src/types/anatomy';

const MARCA_L1: readonly Marca[] = ['L1'];

const anatomyStore = useAnatomyStore();

const glosario = computed(() => anatomyStore.vista?.glosario ?? null);
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.glosario {
  margin-top: 10px;
  font-size: 13px;
  color: $anat-ink;
}

// Resumen terracota como el <summary> del sketch
.glosario :deep(.glosario__header) {
  min-height: 44px;
  padding: 0 4px;
  font-weight: 600;
  color: $anat-terra;
}

.glosario__body {
  padding: 0 4px 4px;
}

.glosario__h {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: $anat-ink-2;
}

.glosario__p {
  margin: 0 0 7px;
  font-size: 13px;
  line-height: 1.45;
}

.glosario__ej {
  color: $anat-ink-2;
}

.glosario__sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 3px;
  vertical-align: -1px;
}

.glosario__sw--motor {
  background: $anat-r-motor;
}

.glosario__sw--sinergista {
  background: $anat-r-sinergista;
}

.glosario__sw--estabilizador {
  background: $anat-r-estabilizador;
}

.glosario__sw--antagonista,
.glosario__sw--estira {
  border: 1.5px dashed $anat-terra;
  background: $anat-r-estira;
}

.glosario__k {
  display: inline-block;
  min-width: 18px;
  color: $anat-terra;
}

.glosario__pie {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: $anat-ink-2;
}
</style>
