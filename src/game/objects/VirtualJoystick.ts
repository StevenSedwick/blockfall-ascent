import Phaser from 'phaser';
import { UI } from '../config/constants';

// Touch-driven analog stick anchored to a fixed screen position. The knob
// follows the active pointer within the outer ring, clamped to its radius.
// On desktop, also works with mouse drag for quick testing.
export class VirtualJoystick {
  public moveX = 0;
  public moveY = 0;

  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private activePointerId: number | null = null;
  private originX: number;
  private originY: number;

  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    private radius: number = UI.joystickRadius,
    private knobRadius: number = UI.joystickKnobRadius
  ) {
    this.originX = x;
    this.originY = y;
    this.base = scene.add
      .circle(x, y, radius, 0xffffff, 0.08)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setScrollFactor(0)
      .setDepth(1000);
    this.knob = scene.add
      .circle(x, y, knobRadius, 0xffffff, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(1001);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  reposition(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.base.setPosition(x, y);
    if (this.activePointerId === null) this.knob.setPosition(x, y);
  }

  // Underlying gameobjects so a caller (the scene) can add them to a UI
  // layer / control which cameras render them.
  getRenderables(): Phaser.GameObjects.GameObject[] {
    return [this.base, this.knob];
  }

  // Lets the scene fade the joystick when the player is behind it so the
  // character is never fully obscured by their own controls.
  setOcclusionAlpha(alpha: number): void {
    this.base.setAlpha(alpha);
    this.knob.setAlpha(alpha);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.base.destroy();
    this.knob.destroy();
  }

  // Reserves a pointer if it lands within the joystick's activation radius
  // (a bit larger than the visible ring for easier thumb targeting).
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) return;
    const dx = pointer.x - this.originX;
    const dy = pointer.y - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius * 1.8) return;
    this.activePointerId = pointer.id;
    this.updateKnob(pointer.x, pointer.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.updateKnob(pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.activePointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.knob.setPosition(this.originX, this.originY);
  }

  private updateKnob(px: number, py: number): void {
    const dx = px - this.originX;
    const dy = py - this.originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.radius);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    this.knob.setPosition(this.originX + nx * clamped, this.originY + ny * clamped);
    // Normalize axis output by full radius -> -1..1 with a small deadzone.
    const ax = (nx * clamped) / this.radius;
    const ay = (ny * clamped) / this.radius;
    this.moveX = Math.abs(ax) < 0.12 ? 0 : ax;
    this.moveY = Math.abs(ay) < 0.12 ? 0 : ay;
  }
}
