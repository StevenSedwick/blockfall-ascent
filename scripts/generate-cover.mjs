// Generate a 630x500 cover image for the itch.io project page (and any
// other cover-art slot at that aspect ratio).
//
// Uses sharp to rasterize an SVG that mirrors the in-game palette:
//   background #05071a, Ascent blue #2a6fb0, Stack orange #b0602a,
//   player cyan accent #6cf0ff, coin yellow #ffd84a.
//
// Usage: node scripts/generate-cover.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'resources', 'store');
await mkdir(outDir, { recursive: true });

const W = 630;
const H = 500;

// Deterministic pseudo-random so the layout is stable across regenerations.
let seed = 1;
const rand = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

const TILE = 34;
const cols = Math.ceil(W / TILE) + 2;

// Build a scatter of falling / stacked blocks in the two mode colors.
const blocks = [];
// Bottom stack (Stack mode vibe): densely packed near the bottom.
for (let c = 0; c < cols; c++) {
  const stackH = 1 + Math.floor(rand() * 4);
  for (let r = 0; r < stackH; r++) {
    blocks.push({
      x: c * TILE - TILE,
      y: H - (r + 1) * TILE,
      color: r % 2 === 0 ? '#b0602a' : '#8a4a20',
      alpha: 0.9 - r * 0.05
    });
  }
}
// Mid-air falling blocks (Ascent mode vibe): scattered blue tiles.
for (let i = 0; i < 22; i++) {
  const gx = Math.floor(rand() * cols);
  const gy = Math.floor(rand() * 9) + 1; // rows 1..9 from the top
  blocks.push({
    x: gx * TILE - TILE,
    y: gy * TILE,
    color: rand() < 0.5 ? '#2a6fb0' : '#1a5a95',
    alpha: 0.85
  });
}

const blockRects = blocks
  .map(
    (b) =>
      `<rect x="${b.x}" y="${b.y}" width="${TILE - 2}" height="${TILE - 2}" rx="3" fill="${b.color}" opacity="${b.alpha.toFixed(2)}"/>`
  )
  .join('');

// A few coins to hint at pickups.
const coins = [];
for (let i = 0; i < 6; i++) {
  coins.push({
    cx: 40 + rand() * (W - 80),
    cy: 90 + rand() * (H - 220),
    r: 6 + rand() * 3
  });
}
const coinCircles = coins
  .map(
    (c) =>
      `<circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="${c.r.toFixed(1)}" fill="#ffd84a" opacity="0.9"/>` +
      `<circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="${(c.r + 3).toFixed(1)}" fill="#ffd84a" opacity="0.15"/>`
  )
  .join('');

// The player: a cyan-white cube on top of the stack, mid-jump.
const playerX = W / 2 - 22;
const playerY = H - 4 * TILE - 46;
const player = `
  <g transform="translate(${playerX} ${playerY})">
    <rect x="0" y="0" width="44" height="44" rx="6" fill="#e8ffff" stroke="#6cf0ff" stroke-width="3"/>
    <rect x="9" y="12" width="8" height="10" rx="2" fill="#0a0a10"/>
    <rect x="27" y="12" width="8" height="10" rx="2" fill="#0a0a10"/>
    <rect x="14" y="30" width="16" height="4" rx="2" fill="#0a0a10"/>
    <circle cx="22" cy="22" r="34" fill="#6cf0ff" opacity="0.12"/>
  </g>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#05071a"/>
      <stop offset="55%" stop-color="#0a1030"/>
      <stop offset="100%" stop-color="#050510"/>
    </linearGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#6cf0ff"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- background block grid (very faint) -->
  <g opacity="0.06" fill="#ffffff">
    ${Array.from({ length: Math.ceil(H / 40) })
      .map(
        (_, i) =>
          `<rect x="0" y="${i * 40}" width="${W}" height="1"/>`
      )
      .join('')}
    ${Array.from({ length: Math.ceil(W / 40) })
      .map(
        (_, i) =>
          `<rect x="${i * 40}" y="0" width="1" height="${H}"/>`
      )
      .join('')}
  </g>

  <!-- falling / stacked blocks -->
  ${blockRects}

  <!-- coins -->
  ${coinCircles}

  <!-- player -->
  ${player}

  <!-- title glow -->
  <g filter="url(#glow)" opacity="0.55">
    <text x="${W / 2}" y="118" text-anchor="middle"
      font-family="Impact, 'Arial Black', system-ui, sans-serif"
      font-size="78" font-weight="900" fill="#6cf0ff">BLOCKFALL</text>
  </g>

  <!-- title -->
  <text x="${W / 2}" y="118" text-anchor="middle"
    font-family="Impact, 'Arial Black', system-ui, sans-serif"
    font-size="78" font-weight="900" fill="url(#titleGrad)"
    stroke="#05071a" stroke-width="3" paint-order="stroke">BLOCKFALL</text>

  <text x="${W / 2}" y="168" text-anchor="middle"
    font-family="Impact, 'Arial Black', system-ui, sans-serif"
    font-size="52" font-weight="900" fill="#ffd84a"
    stroke="#05071a" stroke-width="3" paint-order="stroke"
    letter-spacing="6">ASCENT</text>

  <!-- tagline -->
  <text x="${W / 2}" y="200" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="15" font-weight="700" fill="#a0c8d0"
    letter-spacing="3">CLIMB . DODGE . SURVIVE</text>
</svg>`;

const outPng = resolve(outDir, 'itch-cover-630x500.png');
await sharp(Buffer.from(svg), { density: 300 })
  .resize(W, H, { fit: 'cover' })
  .png({ compressionLevel: 9 })
  .toFile(outPng);

// Also keep the SVG for future tweaking.
await writeFile(resolve(outDir, 'itch-cover-630x500.svg'), svg, 'utf8');

console.log(`Wrote ${outPng}`);
