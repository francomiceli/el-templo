// Compartido por index.html (ronda 1) y ronda2.html: figura, ficha de ruta, panel de zona, índice del buscador.
const SKIP = new Set([
  "hair",
  "head",
  "neck",
  "hands",
  "feet",
  "ankles",
  "knees",
]);
const ROLE_ORDER = ["M", "S", "Est", "Ant", "Al"];
const ROLE_ES = {
  M: "Motor",
  S: "Sinergista",
  Est: "Estabilizador",
  Ant: "Antagonista",
  Al: "Se estira",
};
const ROLE_VAR = {
  M: "var(--r-M)",
  S: "var(--r-S)",
  Est: "var(--r-Est)",
  Ant: "var(--r-Al)",
  Al: "var(--r-Al)",
};
const CIT = {
  L1: "Libro de texto (Neumann/Kapandji), a corroborar contra el libro",
  C: "Consenso de coaching: sin evidencia directa leída",
  M: "Derivación mecánica (física básica), no es una fuente",
  R: "Aporte del revisor kinesiólogo (agente), sin cita verificada",
  H: "Necesita kinesiólogo humano (⚑H)",
};
const cit = (c) =>
  c
    ? `<sup class="cit" title="${CIT[c] || "Fuente [" + c + "] del Apéndice A"}">${c}</sup>`
    : "";

const state = { v: "a", ruta: "FL", zona: "upper-back", c: { view: "home" } };

// ---------- ruta → zonas por rol (derivado de MUSCULOS cuando no hay ficha) ----------
const better = (a, b) =>
  !a ? b : ROLE_ORDER.indexOf(b) < ROLE_ORDER.indexOf(a) ? b : a;
function zonasDeRuta(code) {
  if (FICHAS[code]) return FICHAS[code].zonas;
  const z = {};
  MUSCULOS.forEach((m) =>
    ROLE_ORDER.forEach((r) => {
      if (m.zona && (m[r] || []).includes(code))
        z[m.zona] = better(z[m.zona], r);
    }),
  );
  return z;
}
function musculosDeRuta(code) {
  const out = {};
  MUSCULOS.forEach((m) =>
    ROLE_ORDER.forEach((r) => {
      if ((m[r] || []).includes(code)) (out[r] = out[r] || []).push(m);
    }),
  );
  return out;
}
function complejoDe(code) {
  for (const p of COMPLEJOS)
    for (const c of p.cats)
      for (const [rc, n] of c.rutas) if (rc === code) return { p, c, n };
}

// ---------- figura ----------
function figure(roles, opts = {}) {
  const one = (view, ol, cap) => {
    const groups = ANAT[view]
      .filter(([s]) => s !== "head" && s !== "hair")
      .map(([slug, ps]) => {
        const r = roles[slug + "@" + view] || roles[slug];
        const sel = opts.sel === slug ? "sel" : "";
        return `<g class="mu ${SKIP.has(slug) ? "x" : ""} ${r ? "r-" + r : ""} ${sel}" data-zona="${slug}" data-view="${view}">${ps.map((d) => `<path d="${d}"/>`).join("")}</g>`;
      })
      .join("");
    return `<figure><svg class="fig ${opts.tap ? "tap" : ""}" aria-hidden="true"><g><path class="ol" d="${ol}"/>${groups}</g></svg><figcaption>${cap}</figcaption></figure>`;
  };
  return `<div class="figs ${opts.big ? "big" : ""}">${one("front", ANAT.outline[0], "Frente")}${one("back", ANAT.outline[1], "Espalda")}</div>`;
}
const legend = (withAl = true) =>
  `<div class="legend">${["M", "S", "Est"].map((r) => `<span style="--c:${ROLE_VAR[r]}">${ROLE_ES[r]}</span>`).join("")}${withAl ? `<span style="--c:var(--r-Al);--b:1.5px dashed var(--terra)">Se estira / antagonista</span>` : ""}</div>`;
function fitFigures(root = document) {
  root.querySelectorAll("svg.fig").forEach((svg) => {
    const bb = svg.firstElementChild.getBBox();
    if (bb.width)
      svg.setAttribute(
        "viewBox",
        `${bb.x - 2} ${bb.y - 2} ${bb.width + 4} ${bb.height + 4}`,
      );
  });
}

// ---------- ficha de ruta (compartida por las 3 variantes) ----------
// Aviso "zona = grupo" con un ejemplo de la propia ruta
function grupoNota(zon) {
  const z = Object.keys(zon)
    .map((k) => k.split("@")[0])
    .find(
      (k) =>
        MUSCULOS.filter((m) => m.zona && m.zona.split("@")[0] === k).length > 1,
    );
  if (!z) return "";
  const ms = MUSCULOS.filter((m) => m.zona && m.zona.split("@")[0] === z).map(
    (m) => m.nombre.toLowerCase(),
  );
  return `<p class="note" style="margin-top:8px">Cada zona puede agrupar músculos: <b>${ZONA_ES[z]}</b> = ${ms.join(" + ")}. El detalle está en la tabla.</p>`;
}
function ficha(code) {
  const f = FICHAS[code];
  const { p, c, n } = complejoDe(code);
  const hd = `<div class="ficha-hd"><div><p class="kicker">${p.nombre} · ${c.nombre}</p><h1>${RUTA_NOMBRE[code]}</h1></div>
    <div class="meta"><span class="chip code">${code}</span><span class="chip">${n} ejercicios</span>${f ? `<span class="chip">${f.tipo}</span>${f.brazo !== "—" ? `<span class="chip">${f.brazo}</span>` : ""}` : ""}<span class="chip draft" title="Revisado por agente kinesiólogo. Falta kinesiólogo humano (D5). No mostrar a alumnos.">Borrador · sin validar</span></div></div>`;
  const zon = zonasDeRuta(code);
  const figcol = `<div class="figcol">${figure(zon)}${legend()}
      <details class="glos"><summary>¿Qué significa cada rol?</summary>${glosarioHTML()}</details>
    ${f && f.sinDibujo ? `<p class="note" style="margin-top:10px">No están en el dibujo: ${f.sinDibujo.map(([m, r]) => `<b>${m}</b> (${ROLE_ES[r].toLowerCase()})`).join(", ")}.</p>` : ""}
    ${grupoNota(zon)}</div>`;
  if (!f) {
    const mr = musculosDeRuta(code);
    return `${hd}<div class="ficha-grid">${figcol}<div>
      <div class="card sec roles-list"><h2>Músculos por rol</h2>${
        ROLE_ORDER.filter((r) => mr[r])
          .map(
            (r) =>
              `<div class="grp"><b>${ROLE_ES[r]}</b>${mr[r].map((m) => m.nombre).join(" · ")}</div>`,
          )
          .join("") || '<p class="muted">Sin datos en las tablas resumen.</p>'
      }
      <p class="muted" style="font-size:12px;margin:8px 0 0">Sale de las tablas resumen de la investigación (S8 y TI-H).</p></div>
      <div class="card prep muted">Fases, articulaciones, progresión, cues y banderas de ${RUTA_NOMBRE[code]}: <b>ficha en preparación</b>.<br><small>La investigación ya tiene el análisis; falta pasarlo al formato de ficha.</small></div>
    </div></div>`;
  }
  const secs = [
    ["musculos", "Músculos"],
    ["fases", "Fases"],
    ["progresa", "Por qué progresa"],
    ["siente", "Se siente / compensa"],
    ["cues", "Cues"],
    ["banderas", "Cuándo derivar"],
    ["gestos", "Ejercicios"],
  ];
  return `${hd}<p class="ficha-res">${f.resumen}</p>
    <div class="secnav">${secs.map(([id, t]) => `<button data-sec="${id}">${t}</button>`).join("")}</div>
    <div class="ficha-grid">${figcol}<div>
      <div class="card sec" id="sec-musculos"><h2>Articulaciones y músculos</h2>
        <table class="tbl"><thead><tr><th>Articulación</th><th>Acción</th><th>Músculos y rol</th><th>Contracción</th></tr></thead><tbody>
        ${f.articulaciones.map(([a, ac, m, k, ci]) => `<tr><td>${a}</td><td>${ac}</td><td>${m}${cit(ci)}</td><td>${k}</td></tr>`).join("")}
        </tbody></table>
        <p class="muted" style="font-size:12px;margin:8px 0 0">C concéntrica · E excéntrica · I isométrica. ${f.evidencia}</p></div>
      <div class="card sec" id="sec-fases"><h2>Fases</h2><ul class="clean">${f.fases.map(([t, d]) => `<li><b>${t}.</b> ${d}</li>`).join("")}</ul></div>
      <div class="card sec" id="sec-progresa"><h2>Por qué progresa</h2>
        <div class="steps" style="margin-bottom:10px">${f.escalones.map((s) => `<span>${s}</span>`).join("<b>→</b>")}</div>
        <ul class="clean">${f.progresa.map((t, i) => `<li>${t}${i === 0 ? cit(f.progresaCita) : ""}</li>`).join("")}</ul></div>
      <div class="card sec" id="sec-siente"><h2>Dónde se siente</h2><p style="margin:0 0 12px;font-size:14px">${f.siente}${cit("C")}</p>
        <h2>Compensaciones típicas</h2><div class="comp">${f.compensa.map(([t, d]) => `<div><b>${t}</b>${d}</div>`).join("")}</div></div>
      <div class="card sec" id="sec-cues"><h2>Cues</h2>${f.cues.map((q) => `<div class="cue">“${q}”</div>`).join("")}</div>
      <div class="card sec" id="sec-banderas"><h2>Cuándo derivar al kinesiólogo</h2>
        ${f.banderas.map(([, t, ci]) => `<div class="flag">${t}${cit(ci)}<small>No volver a cargar ese patrón hasta que lo vea un kinesiólogo.</small></div>`).join("")}
        <p class="muted" style="font-size:12px;margin:8px 0 0">Además, las urgencias generales (cortar la clase el mismo día): ver “Cuándo derivar” en la portada de la sección.</p></div>
      <div class="card sec" id="sec-gestos"><h2>Ejercicios de la ruta</h2><div class="row">${f.gestos.map((g) => `<span class="chip">${g}</span>`).join("")}</div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">En la fase: lista real del catálogo, con las excepciones por ejercicio.</p></div>
    </div></div>`;
}

// ---------- B ----------
// Cada rol se lee como frase: "<músculo> es motor en: <rutas>"
const ROLE_FRASE = {
  M: "Es motor en",
  S: "Es sinergista en",
  Est: "Estabiliza en",
  Ant: "Es antagonista en",
  Al: "Se estira en",
};
function rolerows(m, clickable = true) {
  const def = (r) => GLOSARIO.roles.find(([k]) => k === r);
  return ROLE_ORDER.filter((r) => (m[r] || []).length)
    .map(
      (
        r,
      ) => `<div class="rolerow" style="--c:${ROLE_VAR[r]};${r === "Al" || r === "Ant" ? "--b:1.5px dashed var(--terra)" : ""}"><button class="rol-i" data-rol>${ROLE_FRASE[r]}<span class="i">i</span></button><div class="row">${m[r].map((rc) => (clickable ? `<button class="chip btn rt-chip" data-open="${rc}">${RUTA_NOMBRE[rc]}${RUTA_NOMBRE[rc].toUpperCase() === rc ? "" : `<small>${rc}</small>`}</button>` : `<span class="chip rt-chip">${RUTA_NOMBRE[rc]}${RUTA_NOMBRE[rc].toUpperCase() === rc ? "" : `<small>${rc}</small>`}</span>`)).join("")}</div></div>
    <div class="rol-def" hidden><b>${def(r)[1]}:</b> ${def(r)[2]} <i>${def(r)[3]}</i></div>`,
    )
    .join("");
}
// Glosario completo: roles, contracciones, precisión de zona
function glosarioHTML() {
  const sw = (r) =>
    `<i class="sw" style="--c:${ROLE_VAR[r]};${r === "Al" || r === "Ant" ? "--b:1.5px dashed var(--terra)" : ""}"></i>`;
  return `<div class="glosario">
    <h4>Roles del músculo</h4>${GLOSARIO.roles.map(([r, t, d, ej]) => `<p>${sw(r)}<b>${t}.</b> ${d}<br><i>${ej}</i></p>`).join("")}
    <h4>Tipos de contracción</h4>${GLOSARIO.contracciones.map(([k, t, d, ej]) => `<p><b class="k">${k}</b><b>${t}.</b> ${d} <i>${ej}</i></p>`).join("")}
    <h4>Precisión de la zona en el dibujo</h4>${GLOSARIO.zonas.map(([t, d]) => `<p><b>${t}.</b> ${d}</p>`).join("")}
    <p class="muted" style="font-size:11.5px">Definiciones estándar de anatomía${cit("L1")}.</p></div>`;
}
// (i) de cada rol: abre y cierra su definición (vale para ronda 1 y ronda 2)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rol]");
  if (!b) return;
  const def = b.closest(".rolerow").nextElementSibling;
  def.hidden = !def.hidden;
  b.classList.toggle("on", !def.hidden);
});
function zonaPanel(zona) {
  const ms = MUSCULOS.filter((m) => m.zona && m.zona.split("@")[0] === zona);
  const grouped = ms.length > 1;
  return `<p class="kicker">Zona del dibujo</p><h1 style="font-size:22px;margin-bottom:8px">${ZONA_ES[zona] || zona}</h1>
    ${grouped ? `<p class="note">Esta zona es un <b>grupo</b>: el dibujo pinta igual ${ms.map((m) => m.nombre.toLowerCase()).join(", ")}. Abajo, cada uno por separado.</p>` : ""}
    ${ms.map((m) => `<div class="musc"><h3>${m.nombre}<span class="prec">${m.precision === "exacta" ? "zona exacta" : m.precision === "agrupada" ? "zona agrupada" : "zona aproximada"}</span>${m.zona.includes("@") ? `<span class="prec">${m.zona.endsWith("@front") ? "se ve de frente" : "se ve de espalda"}</span>` : ""}</h3>${rolerows(m)}${m.nota ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">${m.nota}</p>` : ""}</div>`).join("") || '<p class="muted">Sin músculos cargados para esta zona.</p>'}
    <p class="muted" style="font-size:12px">Tocá una ruta para abrir su ficha. Tocá la <span class="i">i</span> para ver qué significa cada rol.</p>`;
}
function renderB() {
  const lit = {};
  Object.keys(ZONA_ES).forEach((z) => (lit[z] = "Est"));
  const off = MUSCULOS.filter((m) => !m.zona);
  return `<p class="kicker">Anatomía</p><h1 style="margin-bottom:4px">Tocá una zona del cuerpo</h1><p class="muted" style="margin:0 0 14px">Vas a ver qué músculos hay y en qué rutas trabajan, con su rol.</p>
    <div class="b-grid"><div class="card">${figure({ ...lit, [state.zona]: "M" }, { tap: true, big: true, sel: state.zona })}
      <div class="offmap"><p class="muted" style="font-size:12.5px;margin:0 0 6px">No están en el dibujo (son profundos):</p><div class="row">${off.map((m) => `<button class="chip btn" data-musc="${m.id}">${m.nombre}</button>`).join("")}</div></div></div>
    <div class="card b-panel" id="b-panel">${zonaPanel(state.zona)}</div></div>`;
}
function muscPanel(id) {
  const m = MUSCULOS.find((x) => x.id === id);
  return `<p class="kicker">No está en el dibujo</p><h1 style="font-size:22px;margin-bottom:8px">${m.nombre}</h1><p class="note">Es un músculo profundo: el dibujo no lo puede mostrar. Se nombra en las fichas de cada ruta.</p><div class="musc">${rolerows(m)}</div>`;
}

// ---------- C ----------
function searchIndex() {
  const items = [];
  Object.entries(RUTA_NOMBRE).forEach(([rc, nm]) =>
    items.push({
      t: "Rutas",
      label: nm,
      sub: rc,
      go: { view: "ruta", code: rc },
      keys: (nm + " " + rc).toLowerCase(),
    }),
  );
  MUSCULOS.forEach((m) =>
    items.push({
      t: "Músculos",
      label: m.nombre,
      sub: m.zona ? ZONA_ES[m.zona.split("@")[0]] : "no está en el dibujo",
      go: m.zona
        ? { view: "zona", zona: m.zona.split("@")[0] }
        : { view: "musc", id: m.id },
      keys: m.nombre.toLowerCase(),
    }),
  );
  PREGUNTAS.forEach((p) =>
    items.push({
      t: "Preguntas de alumnos",
      label: p.q,
      sub: p.ruta,
      go: { view: "ruta", code: p.ruta, sec: p.sec },
      keys: p.q.toLowerCase(),
    }),
  );
  Object.entries(FICHAS).forEach(([rc, f]) =>
    f.gestos.concat(f.escalones).forEach((g) =>
      items.push({
        t: "Ejercicios y escalones",
        label: g,
        sub: RUTA_NOMBRE[rc],
        go: { view: "ruta", code: rc, sec: "gestos" },
        keys: g.toLowerCase(),
      }),
    ),
  );
  return items;
}
const IDX = searchIndex();
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
