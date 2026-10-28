// Hoja de zona ganadora (024 b · C, vuelta 2): pills de músculos arriba con uno elegido por defecto,
// su "qué hace" en un globo que nace de la pill elegida y, abajo, sus ejercicios por grupo.
// Los músculos que no se ven ("más adentro") entran en la zona que tienen encima.
// Compartida por 023 y 024. Va después de copy.js.

// Profundo → zona del dibujo que tiene encima (ver README de 024: por qué cada una)
window.PROFUNDO_EN = { manguito: "deltoids", serrato: "chest", psoas: "abs" };

/** Músculos de la zona: primero los que se ven, después los de adentro (con `adentro: true`). */
window.musculosDeZona = function (zona) {
  return [
    ...MUSCULOS.filter((m) => m.zona && m.zona.split("@")[0] === zona),
    ...MUSCULOS.filter((m) => !m.zona && PROFUNDO_EN[m.id] === zona).map((m) => ({ ...m, adentro: true })),
  ];
};

const zgGrupos = (m) =>
  GRUPOS_ALUMNO.map((g) => ({ g, rutas: [...new Set(g.roles.flatMap((r) => m[r] || []))] })).filter((x) => x.rutas.length);

const zgGrupoHTML = ({ g, rutas }) =>
  `<div class="gr" style="${pastel(g.color)}"><button class="gr-lbl" data-gr>${g.frase}<span class="i">i</span></button><div class="gr-def" hidden>${g.def}</div><div class="pills">${rutas.map((rc) => `<button class="pill" data-ruta="${rc}">${RUTA_NOMBRE[rc]}</button>`).join("")}</div></div>`;

window.ZG_AVISALE = `<div class="avisale"><span class="material-icons">record_voice_over</span><span>¿Te molesta o te duele acá? <b>Avisale a tu profe</b> antes de seguir.</span></div>`;

/**
 * Contenido de la hoja de una zona. `sel` = índice del músculo elegido (0 = el principal).
 * `extra` se agrega antes del aviso (p.ej. "Ver en … ›" desde Entrenar).
 */
window.zonaGanadorHTML = function (zona, sel = 0, extra = "") {
  const ms = musculosDeZona(zona);
  const m = ms[sel] || ms[0];
  const uno = ms.length === 1;
  const head = uno
    ? `<p class="kicker zg-k">${m.adentro ? "Más adentro" : ZONA_ES[zona]}</p><h2 class="zt">${m.nombre}</h2>`
    : `<p class="kicker zg-k">${ms.length} músculos</p><h2 class="zt">${ZONA_ES[zona]}</h2>`;
  const adentro = `<span class="zg-tag">más adentro</span>`;
  const globo = `<div class="zg-globo${uno ? " zg-globo--solo" : ""}">${uno ? "" : `<p class="zg-gn">${m.nombre}${m.adentro ? adentro : ""}</p>`}<p class="zg-gq">${QUE_HACE[m.id]}</p></div>`;
  const pills = uno
    ? ""
    : `<div class="zg-pills" role="tablist">${ms
        .map(
          (x, i) =>
            `<button role="tab" aria-selected="${x === m}" class="zg-pill${x === m ? " on" : ""}${x.adentro ? " in" : ""}" data-zmus="${i}">${x.nombre}${x.adentro ? `<small>adentro</small>` : ""}</button>`,
        )
        .join("")}</div>`;
  return `${head}<div class="zg">${pills}${globo}</div>
    <div class="zg-ej">${zgGrupos(m).map(zgGrupoHTML).join("")}</div>${extra}${ZG_AVISALE}`;
};

/** Apunta la flecha del globo a la pill elegida (llamar después de pintar y al scrollear las pills). */
window.alinearGlobo = function (root) {
  root.querySelectorAll(".zg").forEach((zg) => {
    const on = zg.querySelector(".zg-pill.on");
    const globo = zg.querySelector(".zg-globo");
    if (!on || !globo) return;
    // la pill elegida siempre a la vista (p.ej. el músculo de adentro, que va último)
    const row0 = zg.querySelector(".zg-pills");
    if (row0) {
      const r = row0.getBoundingClientRect();
      const p = on.getBoundingClientRect();
      if (p.right > r.right - 18) row0.scrollLeft += p.right - r.right + 18;
      else if (p.left < r.left + 18) row0.scrollLeft -= r.left + 18 - p.left;
    }
    const a = on.getBoundingClientRect();
    const b = globo.getBoundingClientRect();
    const x = Math.min(Math.max(a.left + a.width / 2 - b.left, 18), b.width - 18);
    globo.style.setProperty("--x", `${x}px`);
    const row = zg.querySelector(".zg-pills");
    if (row && !row._zg) {
      row._zg = true;
      row.addEventListener("scroll", () => alinearGlobo(zg.parentElement), { passive: true });
    }
  });
};
