// Rasterize the SVG icon + splash sources into the platform-specific PNGs.
//
// Android: we do all icons + splashes with `sharp` ourselves. This avoids
// the EBUSY race condition `@capacitor/assets` hits on Windows when
// Defender scans a freshly-created XML file before the tool tries to
// overwrite it.
//
// iOS: we hand off to `@capacitor/assets`, which slices the Xcode
// asset catalog for us.
//
// Usage: `npm run assets` (after `npm i -D sharp @capacitor/assets`).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const resDir = resolve(root, 'resources');
const androidRes = resolve(root, 'android', 'app', 'src', 'main', 'res');

async function svgToPng(svg, outPath, w, h = w, bg = null) {
  // Cap SVG render density so sharp doesn't complain about the resulting
  // intermediate raster exceeding its default 268MP pixel limit for the
  // large 2732px splashes. 300dpi is more than enough detail for any
  // launcher icon or splash target.
  const png = await sharp(svg, { density: 300, unlimited: true })
    .resize(w, h, { fit: 'contain', background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, png);
  console.log(`wrote ${outPath.replace(root + '\\', '')} (${w}x${h})`);
}

await mkdir(resDir, { recursive: true });

const iconSvg = await readFile(resolve(resDir, 'icon.svg'));
const splashSvg = await readFile(resolve(resDir, 'splash.svg'));

// Reference PNGs
await svgToPng(iconSvg,   resolve(resDir, 'icon.png'),        1024);
await svgToPng(splashSvg, resolve(resDir, 'splash.png'),      2732, 2732, { r: 26, g: 0, b: 51, alpha: 1 });
await svgToPng(splashSvg, resolve(resDir, 'splash-dark.png'), 2732, 2732, { r: 26, g: 0, b: 51, alpha: 1 });

// ============================================================
// ANDROID icons + splashes
// ============================================================
const densities = [
  { dir: 'ldpi',    legacy: 36,  adaptive: 81  },
  { dir: 'mdpi',    legacy: 48,  adaptive: 108 },
  { dir: 'hdpi',    legacy: 72,  adaptive: 162 },
  { dir: 'xhdpi',   legacy: 96,  adaptive: 216 },
  { dir: 'xxhdpi',  legacy: 144, adaptive: 324 },
  { dir: 'xxxhdpi', legacy: 192, adaptive: 432 }
];

for (const { dir, legacy, adaptive } of densities) {
  const outDir = resolve(androidRes, `mipmap-${dir}`);
  await mkdir(outDir, { recursive: true });
  await svgToPng(iconSvg, resolve(outDir, 'ic_launcher.png'),            legacy);
  await svgToPng(iconSvg, resolve(outDir, 'ic_launcher_round.png'),      legacy);
  await svgToPng(iconSvg, resolve(outDir, 'ic_launcher_foreground.png'), adaptive);
  await svgToPng(iconSvg, resolve(outDir, 'ic_launcher_background.png'), adaptive);
}

const adaptiveDir = resolve(androidRes, 'mipmap-anydpi-v26');
await mkdir(adaptiveDir, { recursive: true });
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
await writeFile(resolve(adaptiveDir, 'ic_launcher.xml'), adaptiveXml);
await writeFile(resolve(adaptiveDir, 'ic_launcher_round.xml'), adaptiveXml);
console.log('wrote mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml');

const splashDensities = [
  { dir: 'mdpi',    w: 320,  h: 480,  wLand: 480,  hLand: 320 },
  { dir: 'hdpi',    w: 480,  h: 800,  wLand: 800,  hLand: 480 },
  { dir: 'xhdpi',   w: 720,  h: 1280, wLand: 1280, hLand: 720 },
  { dir: 'xxhdpi',  w: 960,  h: 1600, wLand: 1600, hLand: 960 },
  { dir: 'xxxhdpi', w: 1280, h: 1920, wLand: 1920, hLand: 1280 }
];
for (const { dir, w, h, wLand, hLand } of splashDensities) {
  const portDir = resolve(androidRes, `drawable-port-${dir}`);
  const landDir = resolve(androidRes, `drawable-land-${dir}`);
  await mkdir(portDir, { recursive: true });
  await mkdir(landDir, { recursive: true });
  await svgToPng(splashSvg, resolve(portDir, 'splash.png'), w, h,     { r: 26, g: 0, b: 51, alpha: 1 });
  await svgToPng(splashSvg, resolve(landDir, 'splash.png'), wLand, hLand, { r: 26, g: 0, b: 51, alpha: 1 });
}
const defaultDrawable = resolve(androidRes, 'drawable');
await mkdir(defaultDrawable, { recursive: true });
await svgToPng(splashSvg, resolve(defaultDrawable, 'splash.png'), 480, 320, { r: 26, g: 0, b: 51, alpha: 1 });

// ============================================================
// iOS (delegate to @capacitor/assets)
// ============================================================
console.log('\n--- Generating iOS assets via @capacitor/assets ---');
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['@capacitor/assets', 'generate', '--ios'],
  { stdio: 'inherit', cwd: root });

process.exit(r.status ?? 0);
