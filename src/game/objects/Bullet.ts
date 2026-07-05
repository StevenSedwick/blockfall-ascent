import Phaser from 'phaser';
import { WEAPON } from '../config/constants';

// Boshy-style projectile. Travels in a straight line at WEAPON.speed, no
// gravity. Auto-despawns after WEAPON.lifetimeMs so off-screen bullets do
// not accumulate. Overlaps (not collides) with debris so it doesn't impart
// momentum to the wall before being destroyed.
export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private dieAt = 0;
  private dirX = 1;
  private dirY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, dirX: number, dirY: number) {
    super(scene, x, y, 'bullet');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.dirX = dirX;
    this.dirY = dirY;
    this.reinforceBody();

    this.dieAt = scene.time.now + WEAPON.lifetimeMs;
    this.setDepth((this.depth ?? 0) + 5);
    // Rotate sprite to point along the travel direction so a non-circular
    // muzzle-flash look would read; harmless for the round bullet texture.
    this.setRotation(Math.atan2(dirY, dirX));
  }

  // Re-apply body config after group.add() (Arcade groups re-stamp default
  // body settings onto children, clobbering velocity / gravity flags).
  reinforceBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(WEAPON.size / 2);
    body.setImmovable(true);
    body.pushable = false;
    body.setMaxVelocity(10000, 10000);
    body.setVelocity(this.dirX * WEAPON.speed, this.dirY * WEAPON.speed);
  }

  // Called by the owning group each frame to time-out off-screen rounds.
  tick(nowMs: number): boolean {
    return nowMs >= this.dieAt;
  }
}
