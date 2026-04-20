import { copyFileSync, mkdirSync, existsSync, statSync, utimesSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
// Copy the ESM build because @ffmpeg/ffmpeg's worker runs as a module worker
// and loads core via dynamic `import()`, which only works with ESM.
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const dest = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] source missing: ${src}`);
  console.error('[copy-ffmpeg] run pnpm install first');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const srcPath = resolve(src, file);
  const destPath = resolve(dest, file);
  const srcStat = statSync(srcPath);

  if (existsSync(destPath)) {
    const destStat = statSync(destPath);
    if (destStat.size === srcStat.size) {
      // Same version already in place — preserve mtime so rsync skips the file on deploy
      utimesSync(destPath, srcStat.atime, srcStat.mtime);
      console.log(`[copy-ffmpeg] skipped ${file} (up to date)`);
      continue;
    }
  }

  copyFileSync(srcPath, destPath);
  utimesSync(destPath, srcStat.atime, srcStat.mtime);
  console.log(`[copy-ffmpeg] copied ${file}`);
}
