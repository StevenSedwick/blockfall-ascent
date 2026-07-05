import Phaser from 'phaser';
import { Debris } from './Debris';
import { PATTERN, WORLD } from '../config/constants';

// Two-wall pattern spawner. Every tick, drops a PAIR of `pattern_block`
// debris: one on the left wall, one on the right wall, with a player-sized
// gap between them. The gap center drifts horizontally over time (sum of
// two sines on the spawn index), so the corridor snakes across the screen
// while the player climbs vertically through it.
//
// Visual shape at any moment:
//
//     l           l
//     l  PLAYER   l
//     l           l
//
// Blocks fall straight down (Debris gravity) and are despawned when they
// reach the floor so they never pile up. They remain solid mid-air, so the
// player can wall-jump off either side of the corridor.
export class GapWallSpawner {
  private nextSpawnAt = 0;
  private startTime = 0;
  private spawnIndex = 0;
  // Last actually-emitted gap center (in tiles). Tracked so we can clamp the
  // next center to within maxGapCenterDeltaTiles, guaranteeing an always-
  // passable overlap between consecutive corridors.
  private prevGapCenter = -1;

  constructor(
    private scene: Phaser.Scene,
    private group: Phaser.Physics.Arcade.Group,
    private getCameraTopY: () => number
  ) {}

  start(nowMs: number): void {
    this.startTime = nowMs;
    this.nextSpawnAt = nowMs + 600;
    this.spawnIndex = 0;
    this.prevGapCenter = -1;
  }

  // World-space X of the most recent corridor gap center. Returns the world
  // mid-X before any rows have been spawned. Used by CoinSpawner so coins
  // drop into the current gap.
  getCurrentGapCenterX(): number {
    const tile = PATTERN.tileSize;
    if (this.prevGapCenter < 0) return WORLD.width / 2;
    return tile / 2 + this.prevGapCenter * tile;
  }

  update(nowMs: number): void {
    if (!PATTERN.enabled) return;

    // Despawn blocks that have reached the floor so they don't accumulate.
    const floorTop = WORLD.floorY - WORLD.floorThickness / 2;
    const cutoff = floorTop + PATTERN.despawnBelowFloorPx;
    this.group.getChildren().forEach((obj) => {
      const d = obj as Debris;
      const body = d.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      if (body.bottom >= cutoff) {
        this.group.remove(d, true, true);
      }
    });

    if (nowMs < this.nextSpawnAt) return;
    this.spawnPair();
    const secondsAlive = (nowMs - this.startTime) / 1000;
    const interval = Math.max(
      PATTERN.rowIntervalMsMin,
      PATTERN.rowIntervalMsStart - secondsAlive * PATTERN.rampPerSecond
    );
    this.nextSpawnAt = nowMs + interval;
  }

  // Deterministic gap-center tile index for a spawn step.
  private gapCenterTile(idx: number, minCenter: number, maxCenter: number): number {
    const center = (minCenter + maxCenter) / 2;
    const halfRange = (maxCenter - minCenter) / 2;
    const a2 = PATTERN.driftAmplitudeRatio;
    const a1 = 1 - a2;
    const wave =
      a1 * Math.sin(idx * PATTERN.driftFreq1) +
      a2 * Math.sin(idx * PATTERN.driftFreq2 + 1.7);
    return Math.round(center + wave * halfRange);
  }

  private spawnPair(): void {
    const tile = PATTERN.tileSize;
    const totalTiles = Math.floor(WORLD.width / tile);
    const halfGap = Math.floor(PATTERN.gapTiles / 2);
    const minCenter = PATTERN.edgeMarginTiles + halfGap;
    const maxCenter = totalTiles - 1 - PATTERN.edgeMarginTiles - halfGap;
    if (maxCenter <= minCenter) return;

    const targetCenter = Phaser.Math.Clamp(
      this.gapCenterTile(this.spawnIndex, minCenter, maxCenter),
      minCenter,
      maxCenter
    );
    // Clamp the per-step horizontal change. On most rows, clamp tight so a
    // straight-up path exists (maxGapCenterDeltaTiles). On "break" rows,
    // allow a much larger jump -- the corridors may no longer overlap, and
    // the player has to wall-jump across the wall or teleport through.
    let gapCenter = targetCenter;
    if (this.prevGapCenter >= 0) {
      const isBreak = Math.random() < PATTERN.breakChance;
      const maxDelta = isBreak
        ? PATTERN.breakMaxDeltaTiles
        : PATTERN.maxGapCenterDeltaTiles;
      gapCenter = Phaser.Math.Clamp(
        targetCenter,
        this.prevGapCenter - maxDelta,
        this.prevGapCenter + maxDelta
      );
    }
    this.prevGapCenter = gapCenter;
    const leftTile = gapCenter - halfGap - 1;
    const rightTile = gapCenter + halfGap + 1;

    const y = this.getCameraTopY() - PATTERN.spawnAboveCameraPx;
    const baseX = tile / 2;

    if (leftTile >= 0) {
      const lx = baseX + leftTile * tile;
      const dl = new Debris(this.scene, lx, y, 'pattern_block');
      this.group.add(dl);
      dl.reinforceBody();
      (dl.body as Phaser.Physics.Arcade.Body).setVelocityY(PATTERN.initialFallSpeed);
    }
    if (rightTile <= totalTiles - 1) {
      const rx = baseX + rightTile * tile;
      const dr = new Debris(this.scene, rx, y, 'pattern_block');
      this.group.add(dr);
      dr.reinforceBody();
      (dr.body as Phaser.Physics.Arcade.Body).setVelocityY(PATTERN.initialFallSpeed);
    }

    this.spawnIndex += 1;
  }
}
