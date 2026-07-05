import Phaser from 'phaser';
import { Coin } from './Coin';
import { COIN, WORLD } from '../config/constants';

// Drops a vertical cluster of coins into the current corridor gap on a
// fixed cadence. Coins fall slowly so the player can scoop them mid-ascent.
// Coins that reach the floor are despawned (uncollected = lost score).
export class CoinSpawner {
  private nextSpawnAt = 0;

  constructor(
    private scene: Phaser.Scene,
    private group: Phaser.Physics.Arcade.Group,
    private getCameraTopY: () => number,
    private getGapCenterX: () => number
  ) {}

  start(nowMs: number): void {
    this.nextSpawnAt = nowMs + 1500;
  }

  update(nowMs: number): void {
    if (!COIN.enabled) return;

    // Despawn coins past the floor so they don't pile up below the world.
    const floorTop = WORLD.floorY - WORLD.floorThickness / 2;
    const cutoff = floorTop + COIN.despawnBelowFloorPx;
    this.group.getChildren().forEach((obj) => {
      const c = obj as Coin;
      if (!c || c.collected) return;
      const body = c.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      if (body.bottom >= cutoff) this.group.remove(c, true, true);
    });

    if (nowMs < this.nextSpawnAt) return;
    this.spawnCluster();
    this.nextSpawnAt = nowMs + COIN.spawnIntervalMs;
  }

  private spawnCluster(): void {
    const cx = this.getGapCenterX();
    const cy = this.getCameraTopY() - COIN.spawnAboveCameraPx;
    const count = Phaser.Math.Between(COIN.clusterMin, COIN.clusterMax);
    const r = COIN.clusterSpacingPx;
    for (let i = 0; i < count; i++) {
      // Random point inside a disc around the cluster center. sqrt() on the
      // radius gives uniform area distribution instead of a center bias.
      const t = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r;
      const x = cx + Math.cos(t) * rr;
      const y = cy + Math.sin(t) * rr;
      const c = new Coin(this.scene, x, y);
      this.group.add(c);
      c.reinforceBody();
    }
  }
}
