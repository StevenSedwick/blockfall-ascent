import Phaser from 'phaser';
import { DEBRIS } from '../config/constants';

// A single piece of falling industrial junk. Falls under gravity, then locks
// in place once it touches a surface below. Immovable from the start so the
// player cannot push it sideways while it's airborne.
export class Debris extends Phaser.Physics.Arcade.Sprite {
  public settled = false;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.reinforceBody();
  }

  // Apply / re-apply the physics body configuration. Call this after the
  // Debris is added to a physics group, since group.add() re-stamps default
  // body config (allowGravity, immovable, moves, etc.) over the child.
  reinforceBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.width, this.height);
    body.setOffset(0, 0);
    body.setAllowGravity(true);
    body.setGravityY(DEBRIS.fallGravity);
    body.setMaxVelocity(10000, DEBRIS.maxFallSpeed);
    // Pushable=false: the player and other debris cannot shove this body,
    // but Arcade physics CAN still separate it against static colliders
    // (the floor). We intentionally do NOT use setImmovable() here because
    // two immovable bodies (immovable debris vs static floor) cannot be
    // separated by Arcade physics, and the debris would fall right through.
    body.pushable = false;
    body.setImmovable(false);
    body.setBounce(0, 0);
    body.setDragX(0);
    body.moves = true;
    if (!this.settled && body.velocity.y === 0) {
      body.setVelocity(0, 0);
    }
  }

  isFallingDangerously(): boolean {
    if (this.settled) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    return body.velocity.y >= DEBRIS.crushVelocityThreshold;
  }

  settle(): void {
    if (this.settled) return;
    this.settled = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    body.setAllowGravity(false);
    // Lock the body in place once settled. Pushable=false already prevents
    // shoves; setImmovable(true) here additionally tells separation routines
    // not to bother moving this body for other dynamic-vs-this-body pairs.
    // (Safe because settled debris only ever collides with the player and
    // other debris - both dynamic - not with a static body.)
    body.setImmovable(true);
  }
}
