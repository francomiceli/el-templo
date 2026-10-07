#!/usr/bin/env node
/**
 * Verificador post-build de la web (fase 195, D-29 / T-195-10).
 *
 * Corre DESPUES de `pnpm run generate` sobre `.output/public` y lee
 * `data/generated/web-data.json`. Falla (exit 1) si aparece un dato prohibido
 * (direccion vieja, sedes que ya no existen, wa.me roto) o falta una pagina
 * esperada. Corre en CI (web-check) y, con `--require-api`, en el deploy
 * (195-11) para impedir publicar un build hecho con el fixture.
 *
 * Uso:
 *   node scripts/verify-seo-output.mjs [--require-api]
 *        [--public-dir=<ruta>] [--data=<ruta>]   (los dos ultimos, para tests)
 *
 * COMO AGREGAR UN CHEQUEO (planes 195-04 a 195-06): al final de la lista
 * `CHECKS` agregar `{ name: "descripcion", run: (ctx) => [...problemas] }`.
 * `run` devuelve un array de problemas ([] = OK) y puede usar:
 *   ctx.data            web-data.json parseado (WebData)
 *   ctx.exists(rel)     existe `rel` dentro de .output/public
 *   ctx.read(rel)       contenido de `rel` (utf8)
 *   ctx.htmlFiles       rutas relativas de todos los .html generados
 * Un chequeo que lanza una excepcion cuenta como FALLA.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://eltemplo.org";

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const PUBLIC_DIR = resolve(
  argValue("public-dir") ?? join(ROOT, ".output/public"),
);
const DATA_PATH = resolve(
  argValue("data") ?? join(ROOT, "data/generated/web-data.json"),
);
const REQUIRE_API = process.argv.includes("--require-api");

const FORBIDDEN = [
  "Alem 3958",
  "Chapadmalal",
  "8 sedes",
  "54223XXXXXXX",
  "logo-eltemplo.svg",
];
const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "robots.txt",
  "llms.txt",
  "sitemap.xml",
];
const AI_BOTS = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];

function out(message) {
  process.stdout.write(`${message}\n`);
}

function walkHtml(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      found.push(...walkHtml(full));
    } else if (entry.endsWith(".html")) {
      found.push(relative(PUBLIC_DIR, full));
    }
  }
  return found;
}

/** Lista de chequeos. Agregar los nuevos AL FINAL. */
const CHECKS = [
  {
    name: "existen index.html, 404.html, robots.txt, llms.txt y sitemap.xml",
    run: (ctx) =>
      REQUIRED_FILES.filter((f) => !ctx.exists(f)).map((f) => `falta ${f}`),
  },
  {
    name: "robots.txt permite los bots de busqueda IA y declara el sitemap",
    run: (ctx) => {
      const robots = ctx.read("robots.txt");
      const problems = AI_BOTS.filter(
        (bot) => !new RegExp(`^User-agent:\\s*${bot}\\s*$`, "m").test(robots),
      ).map((bot) => `robots.txt sin User-agent: ${bot}`);
      if (!/^Sitemap:\s*\S+/m.test(robots)) {
        problems.push("robots.txt sin linea Sitemap:");
      }
      return problems;
    },
  },
  {
    name: "llms.txt lista la direccion de cada sede y no menciona Chapadmalal",
    run: (ctx) => {
      const llms = ctx.read("llms.txt");
      const problems = ctx.data.sedes
        .filter((s) => !llms.includes(s.address.street))
        .map(
          (s) => `llms.txt sin la direccion de ${s.slug}: ${s.address.street}`,
        );
      if (llms.includes("Chapadmalal")) {
        problems.push("llms.txt menciona Chapadmalal");
      }
      return problems;
    },
  },
  {
    name: "ningun html ni llms.txt contiene datos prohibidos",
    run: (ctx) => {
      const problems = [];
      for (const file of [...ctx.htmlFiles, "llms.txt"]) {
        const text = ctx.read(file);
        for (const bad of FORBIDDEN) {
          if (text.includes(bad)) {
            problems.push(`${file} contiene "${bad}"`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: "todo wa.me/<numero> de los html es un WhatsApp de ventas de web-data",
    run: (ctx) => {
      const allowed = new Set(
        Object.values(ctx.data.countries)
          .map((c) => c.salesWhatsapp)
          .filter(Boolean),
      );
      const problems = [];
      for (const file of ctx.htmlFiles) {
        for (const m of ctx.read(file).matchAll(/wa\.me\/(\d+)/g)) {
          if (!allowed.has(m[1])) {
            problems.push(`${file} usa wa.me/${m[1]} (no es de web-data)`);
          }
        }
      }
      return [...new Set(problems)];
    },
  },
  {
    name: "cada post del blog tiene su pagina y esta en sitemap.xml",
    run: (ctx) => {
      const sitemap = ctx.read("sitemap.xml");
      const problems = [];
      for (const { slug } of ctx.data.blog.posts) {
        if (
          !ctx.exists(`blog/${slug}/index.html`) &&
          !ctx.exists(`blog/${slug}.html`)
        ) {
          problems.push(`falta la pagina del post ${slug}`);
        }
        if (!sitemap.includes(`<loc>${SITE_URL}/blog/${slug}</loc>`)) {
          problems.push(`sitemap.xml sin /blog/${slug}`);
        }
      }
      return problems;
    },
  },
  ...(REQUIRE_API
    ? [
        {
          name: "--require-api: web-data.json viene de la API (no del fixture)",
          run: (ctx) =>
            ctx.data.source === "api"
              ? []
              : [
                  `web-data.json tiene source "${ctx.data.source}": el build se hizo con el fixture`,
                ],
        },
      ]
    : []),
  // AGREGAR CHEQUEOS NUEVOS ABAJO (planes 195-04 a 195-06).
];

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    process.stderr.write(
      `No existe ${PUBLIC_DIR}: corré pnpm run generate antes de verificar.\n`,
    );
    process.exit(1);
  }
  if (!existsSync(DATA_PATH)) {
    process.stderr.write(`No existe ${DATA_PATH}: corré pnpm prepare-data.\n`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const ctx = {
    data,
    htmlFiles: walkHtml(PUBLIC_DIR),
    exists: (rel) => existsSync(join(PUBLIC_DIR, rel)),
    read: (rel) => readFileSync(join(PUBLIC_DIR, rel), "utf8"),
  };

  let failed = 0;
  for (const check of CHECKS) {
    let problems;
    try {
      problems = check.run(ctx);
    } catch (e) {
      problems = [`excepcion: ${e instanceof Error ? e.message : String(e)}`];
    }
    if (problems.length === 0) {
      out(`OK     ${check.name}`);
    } else {
      failed += 1;
      out(`FALLA  ${check.name}`);
      for (const p of problems.slice(0, 20)) {
        out(`         - ${p}`);
      }
      if (problems.length > 20) {
        out(`         ... y ${problems.length - 20} mas`);
      }
    }
  }
  out(
    failed === 0
      ? `verify-seo-output: ${CHECKS.length} chequeos OK`
      : `verify-seo-output: ${failed} de ${CHECKS.length} chequeos con FALLA`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main();
