import Phaser from 'phaser';
import { COIN } from '../config/constants';

// Collectible pickup. Falls straight down, no collision with debris (overlap
// only, against the player). Collected -> emits a brief pop and is removed
// by the owning spawner.
export class Coin extends Phaser.Physics.Arcade.Sprite {
  public collected = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'coin');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(COIN.size / 2);
    body.setAllowGravity(false);
    body.setVelocity(0, COIN.fallSpeed);
    body.setImmovable(true);
    body.pushable = false;
  }

  reinforceBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.pushable = false;
    if (Math.abs(body.velocity.y) < 1) body.setVelocityY(COIN.fallSpeed);
  }

  collect(): void {
    if (this.collected) return;
    this.collected = true;
    const scene = this.scene;
    scene.tweens.add({
      targets: this,
      scale: 1.8,
      alpha: 0,
      duration: 140,
      onComplete: () => this.destroy()
    });
  }
}
