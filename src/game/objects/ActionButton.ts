import Phaser from 'phaser';
import { UI } from '../config/constants';

// A simple round touch button. Tracks press edge and held state so callers can
// build jump-buffer / variable-jump logic on top of it.
export class ActionButton {
  public pressedThisFrame = false;
  public held = false;

  private circle: Phaser.GameObjects.Arc;
  private label: Phaser.GameObjects.Text;
  private activePointerId: number | null = null;
  private originX: number;
  private originY: number;
  private justPressed = false;

  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color: number = 0xffffff,
    private radius: number = UI.buttonRadius
  ) {
    this.originX = x;
    this.originY = y;
    this.circle = scene.add
      .circle(x, y, radius, color, 0.18)
      .setStrokeStyle(2, color, 0.55)
      .setScrollFactor(0)
      .setDepth(1000);
    this.label = scene.add
      .text(x, y, text, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '20px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  reposition(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.circle.setPosition(x, y);
    this.label.setPosition(x, y);
  }

  // Underlying gameobjects so a caller (the scene) can add them to a UI
  // layer / control which cameras render them.
  getRenderables(): Phaser.GameObjects.GameObject[] {
    return [this.circle, this.label];
  }

  // Lets the scene fade the button when the player is behind it.
  setOcclusionAlpha(alpha: number): void {
    this.circle.setAlpha(alpha);
    this.label.setAlpha(alpha);
  }

  // Call once per scene update tick to fold the press edge into pressedThisFrame.
  consume(): void {
    this.pressedThisFrame = this.justPressed;
    this.justPressed = false;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.circle.destroy();
    this.label.destroy();
  }

  private hitTest(px: number, py: number): boolean {
    return Math.hypot(px - this.originX, py - this.originY) <= this.radius * 1.25;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) return;
    if (!this.hitTest(pointer.x, pointer.y)) return;
    this.activePointerId = pointer.id;
    this.held = true;
    this.justPressed = true;
    this.circle.setFillStyle(0xffffff, 0.32);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.activePointerId = null;
    this.held = false;
    this.circle.setFillStyle(0xffffff, 0.18);
  }
}
