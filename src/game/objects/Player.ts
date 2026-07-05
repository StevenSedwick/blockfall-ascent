import Phaser from 'phaser';
import { PHYSICS, PLAYER, WEAPON } from '../config/constants';
import type { InputState } from '../config/types';
import type { Debris } from './Debris';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private jumpBufferUntil = 0;
  private coyoteUntil = 0;
  private wasOnGround = false;
  private pivotReadyAt = 0;
  private facing: 1 | -1 = 1;
  private airJumpsRemaining = 0;
  private wallJumpLockoutUntil = 0;

  // Air dodge state
  private airDodgeAvailable = true;
  private airDodgeUntil = 0;
  private airDodgeCooldownUntil = 0;

  // Special / phase teleport cooldown
  private specialCooldownUntil = 0;

  // Climb cooldown (avoid stutter from holding the button)
  private climbCooldownUntil = 0;

  // Generic invulnerability window (used by GameScene crush check)
  private iFramesUntil = 0;

  // External hook: GameScene assigns this so the climb action can scan the
  // debris group without Player needing to import the scene.
  public getSettledDebris: (() => Debris[]) | null = null;

  // External hook: GameScene wires this to spawn a bullet at the given
  // origin / direction. Player owns fire-rate gating and aim resolution.
  public onFire: ((x: number, y: number, dirX: number, dirY: number) => void) | null = null;
  private nextShotAt = 0;

  // SFX hooks. GameScene wires these to a SoundFx instance.
  public onJump: (() => void) | null = null;
  public onWallJump: (() => void) | null = null;

  // Eye overlay so the player can read which way the block is facing.
  private eyes!: Phaser.GameObjects.Graphics;
  // Frog legs overlay: hidden while grounded, springs out below the block
  // for a short window whenever the player jumps.
  private legs!: Phaser.GameObjects.Graphics;
  private legsUntil = 0;
  private legsStart = 0;
  // Smoothed 2D look direction (unit-ish). X tracks facing/stick, Y tracks
  // up/down stick input and falling. Updated in applyInput, rendered in
  // drawEyes. Smoothing avoids twitchy pupils when input crosses zero.
  private lookX = 1;
  private lookY = 0;

  // SSBM-style fast fall: once engaged mid-air, gravity is bumped and stays
  // bumped until the player lands again.
  private fastFalling = false;

  // Per-mode gravity scalar (1 = default). Stack mode uses <1 for floatier feel.
  private gravityMul = 1;

  // Per-mode horizontal-motion scalar (1 = default). Stack mode uses >1 so
  // on-screen speed matches classic mode despite the camera zoom-out.
  // Applied to max velocity, acceleration, and drag together so time-to-stop
  // stays constant.
  private speedMul = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER.width, PLAYER.height);
    body.setGravityY(PHYSICS.gravity);
    body.setMaxVelocity(PHYSICS.playerSpeed * 1.4, PHYSICS.maxFallSpeed);
    body.setDragX(PHYSICS.playerDrag);
    // Vertical world-bounds collision only - horizontal axis screen-wraps
    // (see GameScene update loop). collideWorldBounds with a partial axis
    // setup is awkward in Arcade, so we leave it off and let the wrap handle
    // both edges. Floor / ceiling are handled by the explicit floor body
    // and the kill-on-fall check.
    body.setCollideWorldBounds(false);

    this.eyes = scene.add.graphics();
    this.eyes.setDepth((this.depth ?? 0) + 1);
    // Legs render UNDER the body so the block still reads as a block. Depth
    // -1 relative to the sprite keeps the top-of-block flush.
    this.legs = scene.add.graphics();
    this.legs.setDepth((this.depth ?? 0) - 1);
  }

  isInvulnerable(timeMs: number): boolean {
    return timeMs < this.iFramesUntil;
  }

  // Set a per-mode horizontal-motion scalar. Scales max velocity,
  // acceleration, and drag together so responsiveness feels consistent
  // across camera zoom levels.
  setSpeedMul(mul: number): void {
    this.speedMul = mul;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocity(PHYSICS.playerSpeed * 1.4 * mul, PHYSICS.maxFallSpeed);
    body.setDragX(PHYSICS.playerDrag * mul);
  }

  // Set a per-mode gravity scalar. 1 = default; <1 = floatier. Applied
  // immediately and preserved across fast-fall transitions.
  setGravityMul(mul: number): void {
    this.gravityMul = mul;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const base = PHYSICS.gravity * mul;
    body.setGravityY(this.fastFalling ? base * PHYSICS.fastFallGravityMul : base);
  }

  applyInput(input: InputState, timeMs: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;
    const touchingLeft = body.blocked.left || body.touching.left;
    const touchingRight = body.blocked.right || body.touching.right;
    const onWall = !onGround && (touchingLeft || touchingRight);
    const wallDir: 1 | -1 | 0 = touchingLeft ? 1 : touchingRight ? -1 : 0; // direction to launch

    // Refill air dodge on ground contact.
    if (onGround) this.airDodgeAvailable = true;

    // Melee-style pivot: stick flick opposite to current momentum hard-cancels
    // sliding and snaps facing. Without this, drag has to bleed off the dash
    // and the player feels "sticky" when reversing direction.
    const stickDir = Math.sign(input.moveX);
    const velDir = Math.sign(body.velocity.x);
    const pivotReady = timeMs >= this.pivotReadyAt;
    const stickStrong = Math.abs(input.moveX) >= PHYSICS.pivotInputThreshold;
    const movingFast = Math.abs(body.velocity.x) >= PHYSICS.pivotVelocityThreshold;
    const opposing = stickDir !== 0 && velDir !== 0 && stickDir !== velDir;
    if (pivotReady && stickStrong && movingFast && opposing) {
      const impulse = PHYSICS.pivotImpulse * stickDir;
      if (onGround) {
        body.setVelocityX(impulse);
      } else if (PHYSICS.pivotAirCancelMul > 0) {
        body.setVelocityX(body.velocity.x * (1 - PHYSICS.pivotAirCancelMul) + impulse);
      }
      this.facing = stickDir as 1 | -1;
      this.setFlipX(this.facing === -1);
      this.pivotReadyAt = timeMs + PHYSICS.pivotCooldownMs;
    } else if (stickDir !== 0) {
      this.facing = stickDir as 1 | -1;
      this.setFlipX(this.facing === -1);
    }

    // Horizontal acceleration steered by joystick magnitude. Wall-jump and
    // air-dodge lockouts briefly disable input so launches read cleanly.
    const inputLocked =
      timeMs < this.wallJumpLockoutUntil || timeMs < this.airDodgeUntil;
    if (!inputLocked && Math.abs(input.moveX) > 0.08) {
      body.setAccelerationX(input.moveX * PHYSICS.playerAccel * this.speedMul);
    } else {
      body.setAccelerationX(0);
    }

    // Wall slide: cap fall speed while sliding down a wall mid-air.
    if (onWall && body.velocity.y > PHYSICS.wallSlideMaxFallSpeed) {
      body.setVelocityY(PHYSICS.wallSlideMaxFallSpeed);
    }

    // SSBM-style fast fall: pressing down on the stick mid-air while already
    // descending snaps fall speed to fastFallSpeed and bumps gravity until
    // landing. Disabled while air-dodging (the dodge owns velocity).
    if (onGround) {
      if (this.fastFalling) {
        this.fastFalling = false;
        body.setGravityY(PHYSICS.gravity * this.gravityMul);
      }
    } else if (
      !this.fastFalling &&
      input.moveY >= PHYSICS.fastFallInputThreshold &&
      body.velocity.y > 0 &&
      timeMs >= this.airDodgeUntil
    ) {
      this.fastFalling = true;
      body.setVelocityY(Math.max(body.velocity.y, PHYSICS.fastFallSpeed));
      body.setGravityY(PHYSICS.gravity * PHYSICS.fastFallGravityMul * this.gravityMul);
    }

    // Coyote time + air-jump refill on ground.
    if (onGround) {
      this.coyoteUntil = timeMs + PHYSICS.coyoteMs;
      this.airJumpsRemaining = PHYSICS.airJumps;
    }
    if (input.jumpPressed) {
      this.jumpBufferUntil = timeMs + PHYSICS.jumpBufferMs;
    }

    const canJump = timeMs <= this.coyoteUntil;
    const wantsJump = timeMs <= this.jumpBufferUntil;
    if (canJump && wantsJump) {
      // Crouch jump: holding down on the stick at launch multiplies the
      // initial upward velocity for a taller hop. Only applies to the
      // grounded (coyote) jump; wall / air jumps ignore it.
      const crouched =
        onGround && input.moveY >= PHYSICS.crouchJumpInputThreshold;
      const vy = crouched
        ? PHYSICS.jumpVelocity * PHYSICS.crouchJumpVelocityMul
        : PHYSICS.jumpVelocity;
      body.setVelocityY(vy);
      this.jumpBufferUntil = 0;
      this.coyoteUntil = 0;
      this.triggerLegs(timeMs);
      this.onJump?.();
    } else if (wantsJump && onWall && wallDir !== 0) {
      body.setVelocityX(PHYSICS.wallJumpVelocityX * wallDir);
      body.setVelocityY(PHYSICS.wallJumpVelocityY);
      this.facing = wallDir as 1 | -1;
      this.setFlipX(this.facing === -1);
      this.wallJumpLockoutUntil = timeMs + PHYSICS.wallJumpLockoutMs;
      this.jumpBufferUntil = 0;
      if (PHYSICS.wallJumpRefreshesAirJumps) {
        this.airJumpsRemaining = PHYSICS.airJumps;
      }
      this.triggerLegs(timeMs);
      this.onWallJump?.();
    } else if (wantsJump && this.airJumpsRemaining > 0) {
      body.setVelocityY(Math.min(body.velocity.y, 0));
      body.setVelocityY(PHYSICS.jumpVelocity * PHYSICS.airJumpVelocityMul);
      this.airJumpsRemaining -= 1;
      this.jumpBufferUntil = 0;
      this.triggerLegs(timeMs);
      this.onJump?.();
    }

    // Variable jump height: release jump early to cut upward velocity.
    if (!input.jumpHeld && body.velocity.y < -160) {
      body.setVelocityY(body.velocity.y * 0.55);
    }

    // Air dodge: directional burst, one per air, brief i-frames.
    if (
      input.airDodgePressed &&
      !onGround &&
      this.airDodgeAvailable &&
      timeMs >= this.airDodgeCooldownUntil
    ) {
      const dir = this.resolveDirection(input.moveX, input.moveY, true);
      body.setVelocity(dir.x * PHYSICS.airDodgeSpeed, dir.y * PHYSICS.airDodgeSpeed);
      this.airDodgeAvailable = false;
      this.airDodgeUntil = timeMs + PHYSICS.airDodgeDurationMs;
      this.airDodgeCooldownUntil = timeMs + PHYSICS.airDodgeCooldownMs;
      this.iFramesUntil = Math.max(this.iFramesUntil, timeMs + PHYSICS.airDodgeIFramesMs);
      this.flash(0x6cf0ff, PHYSICS.airDodgeIFramesMs);
    }

    // Special phase teleport: instant warp in stick direction (facing if neutral).
    if (input.specialPressed && timeMs >= this.specialCooldownUntil) {
      const dir = this.resolveDirection(input.moveX, input.moveY, true);
      const newX = this.x + dir.x * PHYSICS.specialDistance;
      const newY = Phaser.Math.Clamp(
        this.y + dir.y * PHYSICS.specialDistance,
        body.height / 2,
        this.scene.physics.world.bounds.height - body.height / 2
      );
      this.setPosition(newX, newY);
      body.updateFromGameObject();
      // Preserve a small portion of the dash direction as velocity so the
      // landing flows instead of stopping dead.
      body.setVelocity(dir.x * PHYSICS.airDodgeSpeed * 0.4, dir.y * PHYSICS.airDodgeSpeed * 0.4);
      this.specialCooldownUntil = timeMs + PHYSICS.specialCooldownMs;
      this.iFramesUntil = Math.max(this.iFramesUntil, timeMs + PHYSICS.specialIFramesMs);
      this.flash(0xff77ff, PHYSICS.specialIFramesMs);
    }

    // Climb / mantle: snap onto the top of a nearby settled block.
    if (input.climbPressed && timeMs >= this.climbCooldownUntil) {
      if (this.tryClimb()) {
        this.climbCooldownUntil = timeMs + PHYSICS.climbCooldownMs;
      }
    }

    // Update eye look target. Priority order:
    //   1. Active stick input (any direction) -> look that way.
    //   2. Falling fast -> look down.
    //   3. Rising fast -> look up.
    //   4. Otherwise -> look in current facing horizontally.
    let targetX: number;
    let targetY: number;
    const stickMag = Math.hypot(input.moveX, input.moveY);
    if (stickMag > 0.25) {
      targetX = input.moveX / stickMag;
      targetY = input.moveY / stickMag;
    } else if (body.velocity.y > 220) {
      targetX = this.facing * 0.4;
      targetY = 1;
    } else if (body.velocity.y < -220) {
      targetX = this.facing * 0.4;
      targetY = -1;
    } else {
      targetX = this.facing;
      targetY = 0;
    }
    // Exponential smoothing so pupils glide rather than snap.
    const smooth = 0.25;
    this.lookX = this.lookX + (targetX - this.lookX) * smooth;
    this.lookY = this.lookY + (targetY - this.lookY) * smooth;

    // Auto-fire while fire is held. Aim direction = stick if engaged,
    // otherwise current smoothed look (the same direction the eyes show).
    // 8-direction snap gives the retro fixed-shot feel.
    if (WEAPON.enabled && input.fireHeld && timeMs >= this.nextShotAt && this.onFire) {
      let aimX: number;
      let aimY: number;
      const stickMag = Math.hypot(input.moveX, input.moveY);
      if (stickMag >= WEAPON.aimDeadzone) {
        aimX = input.moveX / stickMag;
        aimY = input.moveY / stickMag;
      } else {
        const look = this.getAimDirection();
        aimX = look.x;
        aimY = look.y;
      }
      if (WEAPON.eightDirSnap) {
        const angle = Math.atan2(aimY, aimX);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        aimX = Math.cos(snapped);
        aimY = Math.sin(snapped);
      }
      const ox = this.x + aimX * WEAPON.muzzleOffsetPx;
      const oy = this.y + aimY * WEAPON.muzzleOffsetPx;
      this.onFire(ox, oy, aimX, aimY);
      this.nextShotAt = timeMs + WEAPON.cooldownMs;
    }

    this.wasOnGround = onGround;
  }

  // Returns the current 8-direction-ish aim vector (smoothed look direction
  // the eyes are using). Magnitude is ~1; horizontal-only when no Y look.
  getAimDirection(): { x: number; y: number } {
    const mag = Math.hypot(this.lookX, this.lookY);
    if (mag < 0.001) return { x: this.facing, y: 0 };
    return { x: this.lookX / mag, y: this.lookY / mag };
  }

  isOnGround(): boolean {
    return this.wasOnGround;
  }

  // Redraw the eyes every frame so they track the body and pupil offset
  // reflects current facing. Called by Phaser when the sprite is updated.
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.drawEyes();
    this.drawLegs(time);
  }

  // Kick off the leg-spring animation on the current jump.
  private triggerLegs(timeMs: number): void {
    const dur = 260;
    this.legsStart = timeMs;
    this.legsUntil = timeMs + dur;
  }

  // Jigglypuff-style limbs: little rounded nubs (not sticks) that pop out
  // of the block for the ~260ms after a jump, then retract. Feet stick out
  // the bottom, arms poke out the sides. All the same body color so it
  // still reads as one round little dude.
  private drawLegs(timeMs: number): void {
    const g = this.legs;
    if (!g) return;
    g.clear();
    if (timeMs >= this.legsUntil) return;
    const dur = this.legsUntil - this.legsStart;
    const t = Phaser.Math.Clamp((timeMs - this.legsStart) / dur, 0, 1);
    // Ease out-and-back: nubs squish out, then retract.
    const extend = Math.sin(t * Math.PI);

    const stroke = 0x6b4e00;
    g.lineStyle(1.5, stroke, 0.9);
    g.fillStyle(PLAYER.color, 1);

    // --- Feet: wide flat ovals at the bottom. Extend downward from the
    // block edge; small vertical drop of the ellipse center creates the
    // "popped out" read.
    const footW = 10;
    const footH = 5;
    const footDrop = 2 + extend * 5;
    const bottom = this.y + PLAYER.height / 2;
    const footInset = 6;
    const flx = this.x - PLAYER.width / 2 + footInset;
    const frx = this.x + PLAYER.width / 2 - footInset;
    const fy = bottom + footDrop;
    g.fillEllipse(flx, fy, footW, footH);
    g.strokeEllipse(flx, fy, footW, footH);
    g.fillEllipse(frx, fy, footW, footH);
    g.strokeEllipse(frx, fy, footW, footH);

    // --- Arms: small round nubs poking out each side, mid-body.
    const armR = 3.2;
    const armPop = extend * 4;
    const armY = this.y + 2;
    const alx = this.x - PLAYER.width / 2 - armPop;
    const arx = this.x + PLAYER.width / 2 + armPop;
    g.fillCircle(alx, armY, armR);
    g.strokeCircle(alx, armY, armR);
    g.fillCircle(arx, armY, armR);
    g.strokeCircle(arx, armY, armR);
  }

  private drawEyes(): void {
    const g = this.eyes;
    if (!g) return;
    g.clear();

    // Eyes sit in the upper third of the block.
    const cx = this.x;
    const cy = this.y - PLAYER.height * 0.22;
    const eyeSpacing = 7;
    const eyeRadius = 3.2;
    const pupilRadius = 1.6;
    // Clamp the look vector so pupils can't escape the eye whites.
    const maxOffset = eyeRadius - pupilRadius - 0.2;
    const mag = Math.hypot(this.lookX, this.lookY);
    const nx = mag > 0.001 ? this.lookX / mag : this.facing;
    const ny = mag > 0.001 ? this.lookY / mag : 0;
    // Scale offset by how strongly we're looking (smoothed mag, capped at 1).
    const strength = Math.min(1, mag);
    const offX = nx * maxOffset * strength;
    const offY = ny * maxOffset * strength;

    // Whites
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeSpacing, cy, eyeRadius);
    g.fillCircle(cx + eyeSpacing, cy, eyeRadius);

    // Pupils, offset toward look direction
    g.fillStyle(0x0a0a10, 1);
    g.fillCircle(cx - eyeSpacing + offX, cy + offY, pupilRadius);
    g.fillCircle(cx + eyeSpacing + offX, cy + offY, pupilRadius);
  }

  destroy(fromScene?: boolean): void {
    this.eyes?.destroy();
    this.legs?.destroy();
    super.destroy(fromScene);
  }

  // Resolve a unit direction from joystick input, falling back to facing if
  // the stick is neutral and `allowFacingFallback` is true.
  private resolveDirection(
    moveX: number,
    moveY: number,
    allowFacingFallback: boolean
  ): { x: number; y: number } {
    const mag = Math.hypot(moveX, moveY);
    if (mag < 0.2) {
      if (allowFacingFallback) return { x: this.facing, y: 0 };
      return { x: 0, y: 0 };
    }
    return { x: moveX / mag, y: moveY / mag };
  }

  // Find the highest settled block whose top is within climbMaxLiftPx of the
  // player's feet AND whose horizontal span overlaps the player's body
  // extended by climbReachX in the facing/stick direction. Snap player on top.
  private tryClimb(): boolean {
    const getList = this.getSettledDebris;
    if (!getList) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const feetY = body.bottom;
    const minTopY = feetY - PHYSICS.climbMaxLiftPx;
    const maxTopY = feetY; // ledge can't be below feet
    // Search range: a band extending climbReachX beyond each body edge.
    const leftSearch = body.left - PHYSICS.climbReachX;
    const rightSearch = body.right + PHYSICS.climbReachX;

    let bestTop = Number.POSITIVE_INFINITY;
    let bestCenterX: number | null = null;

    for (const d of getList()) {
      const db = d.body as Phaser.Physics.Arcade.Body;
      // Top of the settled block.
      const topY = db.top;
      if (topY < minTopY || topY >= maxTopY) continue;
      // Horizontal overlap with the search band.
      if (db.right < leftSearch || db.left > rightSearch) continue;
      if (topY < bestTop) {
        bestTop = topY;
        bestCenterX = db.center.x;
      }
    }

    if (!isFinite(bestTop) || bestCenterX === null) return false;

    // Snap player so their feet rest on the ledge top, keep current x if it
    // already overlaps the block; otherwise nudge toward the block's center
    // so the mantle visually lands on the surface.
    const targetFeetY = bestTop;
    const newY = targetFeetY - body.height / 2;
    let newX = this.x;
    if (this.x < bestCenterX - body.width) newX = bestCenterX - body.width / 2;
    else if (this.x > bestCenterX + body.width) newX = bestCenterX + body.width / 2;
    this.setPosition(newX, newY);
    body.updateFromGameObject();
    body.setVelocity(0, 0);
    this.airJumpsRemaining = PHYSICS.airJumps;
    this.airDodgeAvailable = true;
    this.flash(0xffd84a, 120);
    return true;
  }

  private flash(color: number, durationMs: number): void {
    this.setTint(color);
    this.scene.time.delayedCall(durationMs, () => this.clearTint());
  }
}
