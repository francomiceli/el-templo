#!/usr/bin/env node
/**
 * Prebuild de la web (fase 195, D-10 / D-29).
 *
 * Trae `GET <api>/web/site-data` + slugs del blog, valida y escribe
 * `data/generated/web-data.json` (fuente unica de sedes, marca y WhatsApp de
 * ventas) y `public/llms.txt` (D-15, generado desde esos mismos datos).
 *
 * Modos:
 *   (sin flag)    API remota  -> fetch estricto: ante cualquier error o payload
 *                                invalido sale con codigo 1. NUNCA cae al
 *                                fixture (D-29: no publicar datos viejos).
 *                 API local / sin NUXT_PUBLIC_API_URL -> intenta el fetch y, si
 *                                falla, usa el fixture con un aviso visible.
 *   --if-missing  Si ya existe web-data.json no hace nada. Si no, copia el
 *                 fixture SIN red (lo usa `postinstall`: `nuxi prepare` necesita
 *                 el archivo antes de cargar nuxt.config.ts).
 *
 * Node puro, sin dependencias. Salida con process.stdout / process.stderr.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_DIR = resolve(ROOT, "data/generated");
const WEB_DATA_PATH = resolve(GENERATED_DIR, "web-data.json");
const FIXTURE_PATH = resolve(ROOT, "data/web-data.fixture.json");
const LLMS_PATH = resolve(ROOT, "public/llms.txt");

const DEFAULT_API_URL = "http://localhost:3000/api";
const SITE_URL = "https://eltemplo.org";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const REMOTE_TIMEOUT_MS = 20000;
const LOCAL_TIMEOUT_MS = 5000;
const REMOTE_RETRIES = 2;

const SLUG_RE = /^[a-z0-9-]+$/;
const BLOG_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const WHATSAPP_RE = /^[0-9]{8,15}$/;
const COUNTRIES = ["AR", "ES"];
const KINDS = ["gym", "community_space"];

function out(message) {
  process.stdout.write(`${message}\n`);
}

function err(message) {
  process.stderr.write(`${message}\n`);
}

function describeError(e) {
  return e instanceof Error ? e.message : String(e);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Validacion (T-195-10 / T-195-11)
// ---------------------------------------------------------------------------

/** Devuelve la lista de problemas del payload de site-data ([] = valido). */
export function validateSiteData(data) {
  const problems = [];
  if (typeof data !== "object" || data === null) {
    return ["la respuesta no es un objeto JSON"];
  }
  if (!isNonEmptyString(data.brand?.name)) {
    problems.push("brand.name vacio");
  }
  for (const country of COUNTRIES) {
    const n = data.countries?.[country]?.salesWhatsapp;
    if (typeof n !== "string" || !WHATSAPP_RE.test(n)) {
      problems.push(
        `countries.${country}.salesWhatsapp invalido (se esperan 8-15 digitos)`,
      );
    }
  }
  if (!Array.isArray(data.sedes) || data.sedes.length === 0) {
    problems.push("sedes vacio");
    return problems;
  }
  const slugs = new Set();
  for (const [i, s] of data.sedes.entries()) {
    const label = `sedes[${i}]${isNonEmptyString(s?.slug) ? ` (${s.slug})` : ""}`;
    if (typeof s?.slug !== "string" || !SLUG_RE.test(s.slug)) {
      problems.push(`${label}: slug invalido`);
    } else if (slugs.has(s.slug)) {
      problems.push(`${label}: slug repetido`);
    } else {
      slugs.add(s.slug);
    }
    if (!isNonEmptyString(s?.publicName)) {
      problems.push(`${label}: publicName vacio`);
    }
    if (!isNonEmptyString(s?.address?.street)) {
      problems.push(`${label}: address.street vacio`);
    }
    if (!KINDS.includes(s?.kind)) {
      problems.push(`${label}: kind invalido`);
    }
    if (!COUNTRIES.includes(s?.country)) {
      problems.push(`${label}: country invalido`);
    }
    if (!isNonEmptyString(s?.mapsUrl)) {
      problems.push(`${label}: mapsUrl vacio`);
    }
    if (!Array.isArray(s?.openingHours) || !Array.isArray(s?.schedule)) {
      problems.push(`${label}: openingHours/schedule deben ser arrays`);
    }
  }
  for (const country of COUNTRIES) {
    if (!data.sedes.some((s) => s?.kind === "gym" && s?.country === country)) {
      problems.push(`no hay ninguna sede gym de ${country}`);
    }
  }
  return problems;
}

/** Valida y normaliza `{ posts: [{slug, updatedAt|publishedAt}] }`. */
export function normalizeBlogPosts(payload) {
  if (!Array.isArray(payload?.posts)) {
    throw new Error("/blog/posts: falta el array posts");
  }
  return payload.posts.map((p, i) => {
    if (typeof p?.slug !== "string" || !BLOG_SLUG_RE.test(p.slug)) {
      throw new Error(`/blog/posts: posts[${i}].slug invalido`);
    }
    const stamp = [p.updatedAt, p.publishedAt].find(isNonEmptyString);
    return { slug: p.slug, updatedAt: stamp ?? null };
  });
}

/** Valida y normaliza `{ tags: [{slug}] }`. */
export function normalizeBlogTags(payload) {
  if (!Array.isArray(payload?.tags)) {
    throw new Error("/blog/tags: falta el array tags");
  }
  return payload.tags.map((t, i) => {
    if (typeof t?.slug !== "string" || !BLOG_SLUG_RE.test(t.slug)) {
      throw new Error(`/blog/tags: tags[${i}].slug invalido`);
    }
    return { slug: t.slug };
  });
}

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { timeoutMs, retries }) {
  let lastError = new Error("sin intentos");
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw new Error(describeError(lastError), { cause: lastError });
}

async function loadFromApi(apiUrl, opts) {
  const base = apiUrl.replace(/\/+$/, "");
  let siteData;
  try {
    siteData = await fetchJson(`${base}/web/site-data`, opts);
  } catch (e) {
    throw new Error(`/api/web/site-data: ${describeError(e)}`, { cause: e });
  }
  const problems = validateSiteData(siteData);
  if (problems.length > 0) {
    throw new Error(
      `/api/web/site-data devolvio datos invalidos: ${problems.join("; ")}`,
    );
  }
  const postsPayload = await fetchJson(`${base}/blog/posts?limit=1000`, opts);
  const tagsPayload = await fetchJson(`${base}/blog/tags`, opts);
  return {
    ...siteData,
    source: "api",
    blog: {
      posts: normalizeBlogPosts(postsPayload),
      tags: normalizeBlogTags(tagsPayload),
    },
  };
}

// ---------------------------------------------------------------------------
// llms.txt (D-15): generado desde web-data.json, sin texto duplicado a mano
// ---------------------------------------------------------------------------

function sedeUrl(sede) {
  return sede.country === "ES"
    ? `${SITE_URL}/es/sedes/${sede.slug}`
    : `${SITE_URL}/sedes/${sede.slug}`;
}

function sedeAddressLine(sede) {
  return [sede.address.street, sede.address.locality]
    .filter(isNonEmptyString)
    .join(", ");
}

export function renderLlmsTxt(data) {
  const brand = data.brand.name;
  const gyms = data.sedes.filter((s) => s.kind === "gym");
  const spaces = data.sedes.filter((s) => s.kind === "community_space");
  const ar = gyms.filter((s) => s.country === "AR");
  const es = gyms.filter((s) => s.country === "ES");
  const counts = `${gyms.length} sedes: ${ar.length} en Mar del Plata y ${es.length} en Barcelona`;

  const lines = [
    `# ${brand}`,
    "",
    `> Escuela de calistenia con método propio. Entrenamiento con peso corporal en ${gyms.length} sedes (${ar.length} en Mar del Plata y ${es.length} en Barcelona).`,
    "",
    `${brand} es una escuela de calistenia fundada en Argentina que ofrece entrenamiento funcional con peso corporal a través de un método estructurado propio. Cada sesión sigue una estructura de cuatro bloques (Initium, Nucleus, Deuteros, Athlos) y los alumnos progresan a través de 6 niveles: Alfa, Delta, Sigma, Omega, Spartan y Olympic.`,
    "",
    "## Páginas principales",
    "",
    `- [Inicio](${SITE_URL}): Página principal con información sobre el método, niveles, enfoques de entrenamiento, sedes y comunidad.`,
    `- [Franquicias](${SITE_URL}/franquicias): Información para inversores interesados en abrir una franquicia de calistenia El Templo.`,
    `- [Gladius](${SITE_URL}/gladius): Equipamiento profesional de calistenia diseñado y probado en El Templo.`,
    `- [Blog](${SITE_URL}/blog): Artículos sobre calistenia, filosofía de entrenamiento, movilidad, progresión y bienestar.`,
    "",
    "## Sedes",
    "",
    `${counts}.`,
    "",
    ...gyms.map(
      (s) =>
        `- [${brand} — ${s.publicName}](${sedeUrl(s)}): ${sedeAddressLine(s)}`,
    ),
  ];
  if (spaces.length > 0) {
    lines.push("");
    for (const s of spaces) {
      lines.push(
        `${s.publicName}: espacio de comunidad en ${sedeAddressLine(s)} (espacio de comunidad, no es una sede).`,
      );
    }
  }
  lines.push(
    "",
    "## Conceptos clave",
    "",
    "- **Calistenia**: Entrenamiento con peso corporal basado en patrones de movimiento (empujar, traccionar, sostener, moverse).",
    "- **Método El Templo**: Estructura de sesión en 4 bloques — Initium (activación), Nucleus (fuerza), Deuteros (complementario), Athlos (desafío grupal).",
    "- **6 Niveles**: Alfa, Delta, Sigma, Omega, Spartan, Olympic — progresión real basada en dominio técnico.",
    "- **5 Enfoques**: Kallós (centro), Sthenos (fuerza), Motus (movimiento), Pyros (intensidad), Dynamis (habilidades técnicas).",
    "- **Areté**: Principio filosófico griego de excelencia en todas las dimensiones que guía la filosofía de El Templo.",
    "",
    "## Contacto",
    "",
    `- Web: ${SITE_URL}`,
  );
  const wa = data.countries;
  if (wa.AR.salesWhatsapp) {
    lines.push(
      `- WhatsApp (Mar del Plata): https://wa.me/${wa.AR.salesWhatsapp}`,
    );
  }
  if (wa.ES.salesWhatsapp) {
    lines.push(`- WhatsApp (Barcelona): https://wa.me/${wa.ES.salesWhatsapp}`);
  }
  lines.push(
    "- Instagram: https://www.instagram.com/eltemplomdp/",
    "- YouTube: https://youtube.com/@ElTemplomdp/",
    "- Facebook: https://www.facebook.com/eltemplomdp/",
    "",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

function writeLlms(data) {
  writeFileSync(LLMS_PATH, renderLlmsTxt(data));
}

function writeWebData(data) {
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(WEB_DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
  writeLlms(data);
}

function loadFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function runIfMissing() {
  if (existsSync(WEB_DATA_PATH)) {
    if (!existsSync(LLMS_PATH)) {
      writeLlms(JSON.parse(readFileSync(WEB_DATA_PATH, "utf8")));
    }
    return;
  }
  mkdirSync(GENERATED_DIR, { recursive: true });
  copyFileSync(FIXTURE_PATH, WEB_DATA_PATH);
  writeLlms(loadFixture());
  out(
    "[web-data] data/generated/web-data.json no existia: copiado el fixture.",
  );
}

async function main() {
  if (process.argv.includes("--if-missing")) {
    runIfMissing();
    return;
  }

  const apiUrl = process.env.NUXT_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;
  let host;
  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    err(`NUXT_PUBLIC_API_URL no es una URL valida: ${apiUrl}`);
    process.exit(1);
  }
  const isLocal = LOCAL_HOSTS.has(host);

  if (isLocal) {
    try {
      const data = await loadFromApi(apiUrl, {
        timeoutMs: LOCAL_TIMEOUT_MS,
        retries: 0,
      });
      writeWebData(data);
      out(`[web-data] ${data.sedes.length} sedes leidas de ${host} (api).`);
    } catch (e) {
      err(
        `[web-data] AVISO: no se pudo leer la API local (${describeError(e)}): usando fixture: NO publicar este build.`,
      );
      writeWebData(loadFixture());
    }
    return;
  }

  try {
    const data = await loadFromApi(apiUrl, {
      timeoutMs: REMOTE_TIMEOUT_MS,
      retries: REMOTE_RETRIES,
    });
    writeWebData(data);
    out(
      `[web-data] ${data.sedes.length} sedes y ${data.blog.posts.length} posts leidos de ${host} (api).`,
    );
  } catch (e) {
    err(
      `No se pudo leer /api/web/site-data de ${host}: ${describeError(e)}. Revisá que el deploy de la API de esta corrida haya salido bien (la web se arma después) y volvé a disparar solo-web si la API estaba caída (deploy/ROLLOUT-195.md)`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    err(`[web-data] error inesperado: ${describeError(e)}`);
    process.exit(1);
  });
}
