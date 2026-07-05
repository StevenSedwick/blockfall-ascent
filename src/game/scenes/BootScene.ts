import Phaser from 'phaser';
import { COLORS, CORRIDOR, PLAYER, DEBRIS, COIN, PIECE, WEAPON } from '../config/constants';
import { initAds } from '../services/ads';

// Generate all the simple flat-color textures the prototype needs. Keeps art
// dependencies at zero for milestone 1 - everything is a tinted rectangle.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.makeRect('player', PLAYER.width, PLAYER.height, PLAYER.color, 0x6b4e00);

    // Solid floor texture (single tile; we scale the sprite to span the world).
    this.makeRect('floor_tile', 32, 32, COLORS.floor, 0x000000);

    // Debris shape textures (logical "tile" = 32px). Names mirror DebrisSpawner.
    this.makeRect('debris_slab', 32, 114, COLORS.debrisPalette[0]);
    this.makeRect('debris_beam', 32, 146, COLORS.debrisPalette[1]);
    this.makeRect('debris_chunk', 64, 114, COLORS.debrisPalette[2]);
    this.makeRect('debris_crate', 64, 146, COLORS.debrisPalette[3]);
    this.makeRect('debris_platform', 96, 66, COLORS.debrisPalette[4]);
    this.makeRect('debris_machinery', 96, 114, COLORS.debrisPalette[5]);
    this.makeRect('debris_cluster', 80, 98, COLORS.debrisPalette[0]);

    // Gap-wall pattern block (used by GapWallSpawner). One tile of a falling row.
    this.makeRect('pattern_block', 32, 32, COLORS.debrisPalette[4], 0x000000);

    // Stack-mode piece tile. Slightly larger + stroked so multi-tile pieces
    // read as connected shapes without extra rendering work.
    this.makeRect('piece_tile', PIECE.tileSize, PIECE.tileSize, PIECE.color, PIECE.edgeColor);

    // Corridor wall slab base texture: a plain 32x32 fill with a matching
    // stroke so it stretches into smooth-edged slabs without a visible outline.
    this.makeRect('wall_block', 32, 32, CORRIDOR.wallColor, CORRIDOR.wallColor);

    // Parallax background tiles. Two starfield layers (night-sky theme) and
    // two horizontal-streak layers (industrial theme) are pre-generated so
    // the player can switch between themes at runtime without re-creating
    // textures. The plain-solid theme uses no tile sprites.
    this.makeStarfieldTile('bg_stars_far', 256, 256, 70, 1, 0.45, 1337);
    this.makeStarfieldTile('bg_stars_near', 256, 256, 28, 2, 0.95, 4242);
    this.makeStreakTile('bg_streaks_far', 128, 256, 0x223044, 0x3a4a64, 2);
    this.makeStreakTile('bg_streaks_near', 128, 192, 0x000000, 0x6f8fbf, 1);

    this.makeCoinTexture('coin', COIN.size, COIN.color, COIN.edgeColor);
    this.makeCoinTexture('bullet', WEAPON.size, WEAPON.color, WEAPON.edgeColor);
  }

  create(): void {
    // Touch the constant so the unused-import lint stays happy if we tweak later.
    void DEBRIS.shakeMs;
    // Kick off AdMob init in the background. It's a no-op on web/dev and
    // resolves after the menu is already showing on native.
    void initAds();
    this.scene.start('Menu');
  }

  private makeRect(
    key: string,
    w: number,
    h: number,
    fill: number,
    stroke: number = 0x000000
  ): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(2, stroke, 0.8);
    g.strokeRect(1, 1, w - 2, h - 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Build a starfield tile: transparent background with `count` stars of the
  // given pixel size and base alpha. Star positions and per-star brightness
  // jitter are derived from `seed` so the texture is deterministic.
  private makeStarfieldTile(
    key: string,
    w: number,
    h: number,
    count: number,
    starSize: number,
    baseAlpha: number,
    seed: number
  ): void {
    // Tiny mulberry32 PRNG so star placement is stable across reloads.
    let s = seed >>> 0;
    const rand = (): number => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const g = this.add.graphics();
    for (let i = 0; i < count; i += 1) {
      const x = Math.floor(rand() * w);
      const y = Math.floor(rand() * h);
      const brightness = 0.5 + rand() * 0.5;
      const alpha = Phaser.Math.Clamp(baseAlpha * brightness, 0.1, 1);
      // Slight color jitter: most stars white, some pale blue, a few warm.
      const tint = rand();
      let color = 0xffffff;
      if (tint < 0.18) color = 0xbfd6ff;
      else if (tint > 0.92) color = 0xffe6b8;
      g.fillStyle(color, alpha);
      g.fillRect(x, y, starSize, starSize);
      // Add a soft single-pixel halo on the brighter stars for sparkle.
      if (starSize >= 2 && brightness > 0.85) {
        g.fillStyle(color, alpha * 0.35);
        g.fillRect(x - 1, y, 1, starSize);
        g.fillRect(x + starSize, y, 1, starSize);
        g.fillRect(x, y - 1, starSize, 1);
        g.fillRect(x, y + starSize, starSize, 1);
      }
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Streak parallax tile: solid (or transparent) fill plus thin horizontal
  // lines at deterministic Y positions so vertical scrolling reads as speed
  // lines. `fill === 0x000000` => transparent background (foreground layer).
  private makeStreakTile(
    key: string,
    w: number,
    h: number,
    fill: number,
    streak: number,
    streakCount: number
  ): void {
    const g = this.add.graphics();
    if (fill !== 0x000000) {
      g.fillStyle(fill, 1);
      g.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < streakCount; i += 1) {
      const y = Math.floor(((i + 0.37) / streakCount) * h);
      g.fillStyle(streak, 0.55);
      g.fillRect(8, y, Math.floor(w * 0.55), 2);
      g.fillRect(Math.floor(w * 0.7), y + Math.floor(h * 0.13), Math.floor(w * 0.22), 2);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Coin: filled circle with a ring + inner highlight for a chunky pickup feel.
  private makeCoinTexture(key: string, size: number, fill: number, edge: number): void {
    const g = this.add.graphics();
    const r = size / 2;
    g.fillStyle(edge, 1);
    g.fillCircle(r, r, r);
    g.fillStyle(fill, 1);
    g.fillCircle(r, r, r - 2);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(r - r * 0.3, r - r * 0.3, Math.max(1, r * 0.18));
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
