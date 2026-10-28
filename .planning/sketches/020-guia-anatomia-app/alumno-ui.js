// Vista "Tu cuerpo" para alumnos: hoja de zona, músculo y ficha corta de ruta. Compartido por 020 y 021.
const ALUMNO_ROL = { M: "M", S: "M", Est: "Est", Al: "Al" }; // antagonista no se muestra
const pastel = (r) =>
  r === "Al"
    ? "--c:#f6ecdf;--b:1.5px dashed var(--terra)"
    : `--c:${r === "M" ? "#a8603d" : "var(--sost)"}`;

function zonaAlumno(zona) {
  const ms = MUSCULOS.filter((m) => m.zona && m.zona.split("@")[0] === zona);
  return `<p class="kicker">${ZONA_ES[zona]}</p><h2 class="ttl">${ms.length > 1 ? `${ms.length} músculos en esta zona` : ms[0] ? ms[0].nombre : ZONA_ES[zona]}</h2>
      ${ms.map((m) => (ms.length > 1 ? musAlumno(m) : musAlumno(m).replace(`<h3>${m.nombre}</h3>`, ""))).join("")}
      <div class="avisale"><span class="material-icons">record_voice_over</span><span>¿Te molesta o te duele acá? <b>Avisale a tu profe</b> antes de seguir.</span></div>`;
}
function musAlumno(m) {
  const grupos = GRUPOS_ALUMNO.map((g) => ({
    g,
    rutas: [...new Set(g.roles.flatMap((r) => m[r] || []))],
  })).filter((x) => x.rutas.length);
  return `<div class="mus"><h3>${m.nombre}</h3><p class="hace">${QUE_HACE[m.id]}</p>
      ${grupos
        .map(
          ({
            g,
            rutas,
          }) => `<div class="gr" style="${pastel(g.color)}"><button class="gr-lbl" data-gr>${g.frase}<span class="i">i</span></button><div class="gr-def" hidden>${g.def}</div>
        <div class="pills">${rutas.map((rc) => `<button class="pill" data-ruta="${rc}">${RUTA_NOMBRE[rc]}</button>`).join("")}</div></div>`,
        )
        .join("")}</div>`;
}
function rutaAlumno(code) {
  const a = RUTA_ALUMNO[code];
  const { p } = complejoDe(code);
  const z = {};
  Object.entries(zonasDeRuta(code)).forEach(([k, r]) => {
    if (ALUMNO_ROL[r]) z[k] = ALUMNO_ROL[r];
  });
  const mr = musculosDeRuta(code);
  const nombres = (roles) => [
    ...new Set(roles.flatMap((r) => (mr[r] || []).map((m) => m.nombre))),
  ];
  const fuerte = nombres(["M", "S"]),
    sost = nombres(["Est"]);
  return `<p class="kicker">${p.nombre}</p><h2 class="ttl">${RUTA_NOMBRE[code]}</h2>${a ? `<p style="margin-top:6px;color:var(--ink-2)">${a.que}</p>` : ""}
      ${figure(z)}<div class="leg"><span style="--c:#a8603d">Trabaja fuerte</span><span style="--c:var(--sost)">Te sostiene</span></div>
      <h4>Trabaja fuerte</h4><p>${fuerte.join(" · ") || "—"}</p>
      ${sost.length ? `<h4>Te sostiene</h4><p>${sost.join(" · ")}</p>` : ""}
      ${
        a
          ? `<h4>Dónde lo tenés que sentir</h4><p>${a.siente}</p>
      <h4>Tips</h4><ul>${a.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
      <h4>Errores comunes</h4><div class="err">${a.errores.map(([t, d]) => `<div><b>${t}</b>${d}</div>`).join("")}</div>`
          : `<div class="pronto">Pronto: dónde se siente, tips y errores comunes.</div>`
      }
      <div class="avisale"><span class="material-icons">record_voice_over</span><span>Si algo te duele, <b>avisale a tu profe</b>.</span></div>`;
}
