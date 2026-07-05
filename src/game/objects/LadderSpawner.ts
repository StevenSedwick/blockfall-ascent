import Phaser from 'phaser';
import { Debris } from './Debris';
import { LADDER, WORLD } from '../config/constants';

// Rhythm scaffolder that drops "wall-jump ladder rungs" — tall narrow blocks
// placed one wall-jump arc above the previous rung, alternating sides around
// the player so a reachable surface is always above them.
//
// Design:
// - Maintains (lastX, lastY, lastSide). Each tick the side flips with
//   LADDER.flipChance; the new rung is placed stepX away horizontally and
//   stepY above the previous rung (with jitter).
// - Rungs spawn just above the visible camera top so they enter the play
//   field as falling debris, which lets them visually integrate with the
//   random rain instead of popping in mid-screen.
// - If the chain falls too far behind the player (out-climbed), reseed from
//   above the camera at the player's current x.
// - Placement is checked against existing debris; one retry with fresh
//   jitter, then skip the rung (random spawner fills the gap).
export class LadderSpawner {
  private nextSpawnAt = 0;
  private startTime = 0;
  // Side of the previous rung: 1 = right of player, -1 = left of player.
  private lastSide: 1 | -1 = 1;
  // Previous rung world position. y = -Infinity means "no chain yet, reseed".
  private lastX = WORLD.width / 2;
  private lastY = Number.POSITIVE_INFINITY;

  constructor(
    private scene: Phaser.Scene,
    private group: Phaser.Physics.Arcade.Group,
    private getCameraTopY: () => number,
    private getPlayerX: () => number,
    private getPlayerY: () => number
  ) {}

  start(nowMs: number): void {
    this.startTime = nowMs;
    this.nextSpawnAt = nowMs + 600;
    this.lastY = Number.POSITIVE_INFINITY;
  }

  update(nowMs: number): void {
    if (!LADDER.enabled) return;
    if (nowMs < this.nextSpawnAt) return;

    this.spawnRung();

    const secondsAlive = (nowMs - this.startTime) / 1000;
    const interval = Math.max(
      LADDER.intervalMsMin,
      LADDER.intervalMsStart - secondsAlive * LADDER.rampPerSecond
    );
    const jitter = Phaser.Math.Between(-LADDER.intervalJitterMs, LADDER.intervalJitterMs);
    this.nextSpawnAt = nowMs + interval + jitter;
  }

  private spawnRung(): void {
    const playerX = this.getPlayerX();
    const playerY = this.getPlayerY();
    const cameraTop = this.getCameraTopY();

    // Reseed conditions: no previous rung, or the previous rung has fallen
    // too far below the player (out-climbed).
    const needReseed =
      !Number.isFinite(this.lastY) ||
      this.lastY - playerY > LADDER.resetBelowPlayerPx ||
      this.lastY > playerY + LADDER.resetBelowPlayerPx;

    if (needReseed) {
      this.lastX = playerX;
      this.lastY = cameraTop + LADDER.spawnAboveCameraPx; // start above camera
      this.lastSide = Math.random() < 0.5 ? -1 : 1;
    }

    // Flip side most of the time so the player zigzags up the chain.
    if (Math.random() < LADDER.flipChance) {
      this.lastSide = (this.lastSide === 1 ? -1 : 1) as 1 | -1;
    }

    const stepX =
      LADDER.stepXBase + Phaser.Math.Between(-LADDER.stepXJitter, LADDER.stepXJitter);
    const stepY =
      LADDER.stepYBase + Phaser.Math.Between(-LADDER.stepYJitter, LADDER.stepYJitter);

    // First attempt: anchor off the previous rung.
    let targetX = this.lastX + this.lastSide * stepX;
    let targetY = this.lastY - stepY;

    // Keep the rung above the camera so it falls into view rather than popping
    // in mid-screen. Bias toward the player so the chain follows them.
    if (targetY > cameraTop - 40) {
      targetY = cameraTop - LADDER.spawnAboveCameraPx;
      targetX = playerX + this.lastSide * stepX;
    }

    // Pick a shape and clamp x to world bounds with the shape's half-width.
    const key = LADDER.shapeKeys[Phaser.Math.Between(0, LADDER.shapeKeys.length - 1)];
    const tex = this.scene.textures.get(key).getSourceImage();
    const halfW = Math.ceil(tex.width / 2);
    const minX = halfW + 8;
    const maxX = WORLD.width - halfW - 8;
    targetX = Phaser.Math.Clamp(targetX, minX, maxX);

    // Overlap check + one retry.
    if (this.collidesWithExisting(targetX, targetY, tex.width, tex.height)) {
      // Retry with the opposite side, half step.
      const retrySide = (this.lastSide === 1 ? -1 : 1) as 1 | -1;
      const retryX = Phaser.Math.Clamp(playerX + retrySide * stepX * 0.7, minX, maxX);
      if (this.collidesWithExisting(retryX, targetY, tex.width, tex.height)) {
        // Skip this beat; random spawner will keep dropping in the meantime.
        return;
      }
      targetX = retryX;
      this.lastSide = retrySide;
    }

    const d = new Debris(this.scene, targetX, targetY, key);
    this.group.add(d);
    d.reinforceBody();

    this.lastX = targetX;
    this.lastY = targetY;
  }

  // AABB sweep against currently-falling and settled debris. Cheap because
  // the group is small and we only check once per rung spawn.
  private collidesWithExisting(x: number, y: number, w: number, h: number): boolean {
    const pad = LADDER.overlapPaddingPx;
    const left = x - w / 2 - pad;
    const right = x + w / 2 + pad;
    const top = y - h / 2 - pad;
    const bottom = y + h / 2 + pad;

    const children = this.group.getChildren() as Debris[];
    for (const d of children) {
      if (!d) continue;
      const body = d.body as Phaser.Physics.Arcade.Body | null;
      if (!body) continue;
      if (body.right < left || body.left > right) continue;
      if (body.bottom < top || body.top > bottom) continue;
      return true;
    }
    return false;
  }
}
