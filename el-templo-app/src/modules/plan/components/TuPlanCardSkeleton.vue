<template>
  <!-- Pre-carga de "Tu plan": el MISMO marco degradé + línea luminosa de TuPlanCard, con el relleno
       en esqueleto (kicker, nodo actual con su marcador, nombre, dos líneas de detalle y la barra).
       Así la card ya se ve "premium" mientras carga y al llegar el dato no cambia de forma. Alto
       reservado = el de la card resuelta más común (200 px, el mismo que tenía el bloque plano). -->
  <section class="tps-frame" role="status" aria-busy="true" aria-label="Cargando tu plan">
    <div class="tps-card">
      <span class="tps-line" aria-hidden="true" />
      <div class="tps-body" aria-hidden="true">
        <q-skeleton dark animation="none" type="text" width="92px" height="14px" />
        <div class="tps-node">
          <q-skeleton dark animation="none" type="circle" size="24px" class="tps-mk" />
          <div class="tps-lines">
            <q-skeleton dark animation="none" type="text" width="62%" height="24px" />
            <q-skeleton dark animation="none" type="text" width="44%" height="16px" />
            <q-skeleton dark animation="none" type="text" width="70%" height="16px" />
            <q-skeleton dark animation="none" type="rect" width="100%" height="6px" class="tps-bar" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@import 'src/css/premium-card';

// Marco y card: idénticos a `.tp-frame` / `.tp-card` / `.tp-line` de TuPlanCard.
.tps-frame {
  @include pd-frame;
  box-shadow: 0 10px 24px rgba(44, 35, 24, 0.2);
}

.tps-card {
  @include pd-card;
  height: 197px; // 200 px con el borde de 1.5 px del marco
}

.tps-line {
  @include pd-line;
}

.tps-body {
  position: relative;
  z-index: 2;
  padding: 18px 18px 0;
}

// Misma grilla que `.tp-node` (marcador de 24 px + texto).
.tps-node {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 12px;
  padding: 18px 0 0;
}

.tps-mk {
  margin-top: 2px;
}

.tps-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tps-bar {
  margin-top: 6px;
  border-radius: 3px;
}
</style>
