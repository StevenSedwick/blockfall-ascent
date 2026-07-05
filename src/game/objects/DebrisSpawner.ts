import Phaser from 'phaser';
import { Debris } from './Debris';
import { DEBRIS, WORLD } from '../config/constants';

const DEBRIS_KEYS = [
  'debris_slab',
  'debris_beam',
  'debris_chunk',
  'debris_crate',
  'debris_platform',
  'debris_machinery',
  'debris_cluster'
];

// Schedules falling debris on a tempo that accelerates with survival time.
// Each piece spawns just above the visible top of the camera and falls into
// view under its own gravity. Optionally constrains the spawn x to a range
// computed from the spawn y, so debris drops INSIDE the winding corridor
// rather than landing on top of a corridor wall and never reaching the player.
export class DebrisSpawner {
  private nextSpawnAt = 0;
  private startTime = 0;

  constructor(
    private scene: Phaser.Scene,
    private group: Phaser.Physics.Arcade.Group,
    private getCameraTopY: () => number,
    private getXRangeAt?: (y: number) => { min: number; max: number }
  ) {}

  start(nowMs: number): void {
    this.startTime = nowMs;
    this.nextSpawnAt = nowMs + 600;
  }

  update(nowMs: number): void {
    if (nowMs < this.nextSpawnAt) return;
    this.spawnOne();
    const secondsAlive = (nowMs - this.startTime) / 1000;
    const interval = Math.max(
      DEBRIS.spawnIntervalMinMs,
      DEBRIS.spawnIntervalStartMs - secondsAlive * DEBRIS.spawnRampPerSecond
    );
    this.nextSpawnAt = nowMs + interval;
  }

  private spawnOne(): void {
    const key = DEBRIS_KEYS[Phaser.Math.Between(0, DEBRIS_KEYS.length - 1)];
    const tex = this.scene.textures.get(key).getSourceImage();
    const w = tex.width;
    const halfW = Math.ceil(w / 2);
    // Spawn slightly above the visible top so the piece enters view falling.
    const topY = this.getCameraTopY();
    const y = topY - 60;

    // Constrain x to the corridor passage at this y when a range provider is
    // supplied. Inset by halfW so the body doesn't spawn inside a wall.
    const range = this.getXRangeAt?.(y);
    let lo: number;
    let hi: number;
    if (range) {
      lo = Math.ceil(range.min + halfW);
      hi = Math.floor(range.max - halfW);
      if (hi < lo) {
        // Passage tighter than the piece itself: clamp to passage center.
        const mid = Math.round((range.min + range.max) / 2);
        lo = mid;
        hi = mid;
      }
    } else {
      lo = halfW + 8;
      hi = WORLD.width - halfW - 8;
    }
    const x = Phaser.Math.Between(lo, hi);

    const d = new Debris(this.scene, x, y, key);
    this.group.add(d);
    // Re-apply body settings after group.add(): the group's config defaults
    // get re-stamped on each child and will overwrite gravity/immovable.
    d.reinforceBody();
  }
}
