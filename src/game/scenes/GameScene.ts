import Phaser from 'phaser';
import { CAMERA, COIN, COLORS, DEBRIS, PATTERN, PHYSICS, PLAYER, THEME, UI, WEAPON, WORLD, ZONES } from '../config/constants';
import type { ThemeId } from '../config/constants';
import { Player } from '../objects/Player';
import { Debris } from '../objects/Debris';
import { Bullet } from '../objects/Bullet';
import { Coin } from '../objects/Coin';
import { DebrisSpawner } from '../objects/DebrisSpawner';
import { GapWallSpawner } from '../objects/GapWallSpawner';
import { CoinSpawner } from '../objects/CoinSpawner';
import { LadderSpawner } from '../objects/LadderSpawner';
import { PieceSpawner } from '../objects/PieceSpawner';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { ActionButton } from '../objects/ActionButton';
import { makeStats } from '../systems/ScoreSystem';
import { SoundFx } from '../systems/SoundFx';

export type GameMode = 'ascent' | 'stack';

// On very small screens (e.g. flip-phone WebViews at 240x320) the on-screen
// joystick + button cluster would eat most of the play area. Hide them
// there and let external keyboards / D-pads drive the game. Real phones
// get the normal touch controls in either orientation.
function shouldShowTouchControls(w: number, h: number): boolean {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  return long >= 480 && short >= 300;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private floor!: Phaser.GameObjects.Rectangle;
  private debrisGroup!: Phaser.Physics.Arcade.Group;
  private bulletGroup!: Phaser.Physics.Arcade.Group;
  private coinGroup!: Phaser.Physics.Arcade.Group;
  private spawner?: DebrisSpawner;
  private ladderSpawner?: LadderSpawner;
  private gapWallSpawner?: GapWallSpawner;
  private coinSpawner?: CoinSpawner;
  private pieceSpawner?: PieceSpawner;
  private mode: GameMode = 'ascent';
  private sfx = new SoundFx();
  private coinsCollected = 0;
  private coinScore = 0;

  private joystick?: VirtualJoystick;
  private jumpButton?: ActionButton;
  private specialButton?: ActionButton;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    x: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    b: Phaser.Input.Keyboard.Key;
    f: Phaser.Input.Keyboard.Key;
    m: Phaser.Input.Keyboard.Key;
    f1: Phaser.Input.Keyboard.Key;
  };

  private hudText!: Phaser.GameObjects.Text;
  private bgFar?: Phaser.GameObjects.TileSprite;
  private bgNear?: Phaser.GameObjects.TileSprite;
  private currentTheme: ThemeId = THEME.default;
  private themeHintText?: Phaser.GameObjects.Text;
  private themeHintHideAt = 0;

  // Zone progression: sky/sun visuals + music intensity ramp toward tier 5.
  // The sun creeps upward as tiers advance but is capped short of the
  // horizon so it "never actually rises" per design intent.
  private skyTop?: Phaser.GameObjects.Rectangle;
  private skyBottom?: Phaser.GameObjects.Rectangle;
  private sun?: Phaser.GameObjects.Arc;
  private sunGlow?: Phaser.GameObjects.Arc;
  private currentZoneId = 1;
  private zoneBannerText?: Phaser.GameObjects.Text;

  // Two-camera rendering: main camera renders the world and may zoom out
  // (stack mode zooms to see more path). uiCam renders HUD/touch controls
  // at 1:1 so they stay crisp and correctly sized regardless of world zoom.
  // uiLayer holds HUD-side gameobjects; mainCam ignores it; uiCam ignores
  // the world objects.
  private uiCam?: Phaser.Cameras.Scene2D.Camera;
  private uiLayer?: Phaser.GameObjects.Layer;

  // Cached at create() so the resize handler can reuse the same offsets
  // when recomputing camera viewports and world width. Left gutter is where
  // the joystick lives; right gutter is where jump/spcl buttons live. The
  // play area (main camera viewport) sits between them.
  private leftGutter = 0;
  private rightGutter = 0;

  // F1 toggles a debug overlay: canvas outline, play-area (main camera
  // viewport) outline, UI camera outline, joystick + button hit circles,
  // a 50px grid, and a label with all the numeric coords.
  private debugOverlay?: Phaser.GameObjects.Graphics;
  private debugOverlayText?: Phaser.GameObjects.Text;

  private runStartMs = 0;
  private maxHeightPx = 0;
  private dead = false;
  private stickJumpArmed = true;
  // Flick-up-on-joystick-to-jump. Persisted across sessions so players who
  // find it annoying (fast falls fighting the intent) can disable it once.
  private stickJumpEnabled = true;
  private static readonly STICK_JUMP_KEY = 'blockfall.stickJump';

  constructor() {
    super('Game');
  }

  init(data?: { mode?: GameMode }): void {
    this.mode = data?.mode === 'stack' ? 'stack' : 'ascent';
  }

  create(): void {
    this.dead = false;
    this.maxHeightPx = 0;
    this.coinsCollected = 0;
    this.coinScore = 0;
    this.currentZoneId = 1;
    // Phaser reuses the scene instance across scene.start('Game'), so
    // instance fields still hold references to destroyed gameobjects from
    // the previous run. Clear the ones whose "already exists" guards would
    // otherwise skip recreation (uiLayer/uiCam) or double-register (banners
    // and world backdrop objects the ui camera enumerates in ignore()).
    this.uiLayer = undefined;
    this.uiCam = undefined;
    this.zoneBannerText = undefined;
    this.themeHintText = undefined;
    this.themeHintHideAt = 0;
    this.sun = undefined;
    this.sunGlow = undefined;
    this.skyTop = undefined;
    this.skyBottom = undefined;
    this.bgFar = undefined;
    this.bgNear = undefined;
    this.pieceSpawner = undefined;
    this.debugOverlay = undefined;
    this.debugOverlayText = undefined;
    // Touch controls are recreated by buildTouchControls() when enabled;
    // clear the old refs so a restart doesn't read a destroyed instance.
    this.joystick = undefined;
    this.jumpButton = undefined;
    this.specialButton = undefined;
    this.loadStickJumpSetting();
    // SoundFx persists across restarts; reset music intensity so a restart
    // begins in the calm tier-1 mix instead of wherever the last run ended.
    this.sfx.setMusicIntensity(1);

    // Pac-Man horizontal wrap: collapse the playable world width to exactly
    // the viewport width so wrapping reads as "off the right, back on the
    // left" with zero horizontal camera motion. WORLD.width is mutable; all
    // spawners and the floor read it on first use here.
    const viewportW = Math.floor(this.scale.gameSize.width);
    const viewportH = Math.floor(this.scale.gameSize.height);
    // Layout strategy: target a play-area width of WORLD.targetPlayWidth
    // (~555) so stack mode has enough columns for varied piece drops. If the
    // viewport is wider, the extra space becomes symmetric side gutters;
    // if narrower, the play area shrinks and touch controls overlap its
    // corners. minGutter guarantees the world doesn't run past the canvas
    // edge on tiny viewports.
    // Full-canvas play area: the world fills the entire viewport at the
    // current mode's zoom level. Stack mode zooms out to 0.55 so the world
    // width must be viewport / 0.55 (~1.8x wider) for the wrap edge to hit
    // the canvas edge. Ascent mode runs at 1.0 zoom = viewport width.
    //
    // Stack mode also inset-clips the walkable area between the joystick
    // (world x < 310) and the button cluster (world x > 959) so the
    // Pac-Man wrap only fires when the character reaches the visible edge
    // of the play field rather than passing behind the controls.
    const zoom = this.mode === 'stack' ? CAMERA.stackZoom : 1;
    let leftGutter = 0;
    let rightGutter = 0;
    let worldW = Math.max(320, Math.floor(viewportW / zoom));
    if (this.mode === 'stack') {
      const worldLeftInset = 310;
      const worldRightInset = worldW - 959;
      worldW = Math.max(320, worldW - worldLeftInset - Math.max(0, worldRightInset));
      leftGutter = Math.round(worldLeftInset * zoom);
      rightGutter = Math.max(0, Math.round(worldRightInset * zoom));
    }
    WORLD.width = worldW;
    this.leftGutter = leftGutter;
    this.rightGutter = rightGutter;

    // Normalize wall-gap difficulty across viewport sizes: keep the gap at
    // roughly the same *fraction* of playable width regardless of device.
    // Without this, a mobile viewport (~400px, ~12 tiles) has a 5-tile gap
    // filling ~40% of the screen while a desktop viewport (~800px, ~25
    // tiles) has the same 5 tiles filling only ~20% — mobile is trivial.
    const totalTiles = Math.floor(WORLD.width / PATTERN.tileSize);
    PATTERN.gapTiles = Phaser.Math.Clamp(Math.round(totalTiles * 0.2), 3, 6);

    // World bounds match the world rect exactly. Camera bounds match world
    // so the camera can pan with the player horizontally without revealing
    // empty space past the edges.
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    // Camera viewport shifts by leftGutter so world-x 0 renders at pixel
    // leftGutter on the canvas (creating the left gutter on mobile).
    this.cameras.main.setViewport(leftGutter, 0, WORLD.width, viewportH);
    // setBackgroundColor is handled per-theme by applyTheme(); use COLORS as
    // a fallback in case buildParallaxBackground is somehow deferred.
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Stack mode uses a pure black background (matches the "easy on the
    // eyes" look) and skips sky/sun since the main camera zooms and the
    // scrollFactor(0) sky rects would render smaller than the viewport.
    if (this.mode !== 'stack') {
      this.buildParallaxBackground();
      this.buildSkyAndSun();
    } else {
      this.cameras.main.setBackgroundColor(0x000000);
    }

    this.buildFloor();

    // Plain group: do NOT pass allowGravity/immovable defaults here.
    // Group defaults get re-applied to each child's body when added, which
    // can clobber the per-body settings we want from the Debris constructor.
    this.debrisGroup = this.physics.add.group();
    this.bulletGroup = this.physics.add.group();
    this.coinGroup = this.physics.add.group();

    this.player = new Player(this, WORLD.width / 2, PLAYER.spawnY);
    if (this.mode === 'stack') {
      // Stack mode gets a subtly floatier feel to give the player more time
      // to react to the descending pieces.
      this.player.setGravityMul(0.95);
      // Compensate for the 0.55 camera zoom so the on-screen response speed
      // roughly matches classic mode instead of feeling sluggish.
      this.player.setSpeedMul(1 / CAMERA.stackZoom);
    }
    // Give the player a way to find settled debris for the climb/mantle scan
    // without coupling Player to the scene's group references directly.
    this.player.getSettledDebris = () =>
      (this.debrisGroup.getChildren() as Debris[]).filter((d) => d && d.settled);
    // Boshy gun: Player owns fire-rate; scene spawns the bullet.
    this.player.onFire = (x, y, dx, dy) => {
      const b = new Bullet(this, x, y, dx, dy);
      this.bulletGroup.add(b);
      // group.add() re-stamps default body settings; restore the bullet's
      // velocity / no-gravity flags AFTER adding it to the group.
      b.reinforceBody();
      this.sfx.shoot();
    };
    this.player.onJump = () => this.sfx.jump();
    this.player.onWallJump = () => this.sfx.wallJump();

    // Floor is static; treat as immovable surface the player & debris collide with.
    this.physics.add.collider(this.player, this.floor);
    this.physics.add.collider(this.player, this.debrisGroup, this.onPlayerHitDebris, undefined, this);
    // Bullets pass through everything except debris, which they destroy.
    this.physics.add.overlap(this.bulletGroup, this.debrisGroup, (bulletObj, debrisObj) => {
      const b = bulletObj as Bullet;
      const d = debrisObj as Debris;
      if (!b.active || !d.active) return;
      b.destroy();
      this.debrisGroup.remove(d, true, true);
      this.sfx.blockBreak();
    });
    // Player picks up coins on overlap.
    this.physics.add.overlap(this.player, this.coinGroup, (_p, coinObj) => {
      const c = coinObj as Coin;
      if (!c.active || c.collected) return;
      c.collect();
      this.coinsCollected += 1;
      this.coinScore += COIN.scorePerCoin;
      this.sfx.coin();
    });
    // Debris vs floor: collision resolution only; the per-frame settle scan
    // in update() handles state transitions. Avoid running game logic inside
    // the collide callback, which can re-fire many times per step.
    this.physics.add.collider(this.debrisGroup, this.floor);
    // Debris vs debris: use a process callback to skip resolution entirely
    // for pairs that are both already settled (a stable stack), which avoids
    // pointless N² work and any chance of immovable-on-immovable deadlock.
    this.physics.add.collider(
      this.debrisGroup,
      this.debrisGroup,
      undefined,
      this.debrisVsDebrisProcess,
      this
    );

    // Camera follows the player both axes; the world is wide enough that
    // the edges stay off-screen on a phone, so we don't see boundary walls.
    // Camera follows only on Y (lerpX=0). Horizontal wrap means there is no
    // sensible camera target on X - locking it keeps the wrap seamless.
    this.cameras.main.startFollow(this.player, true, 0, CAMERA.lerp);
    // Camera doesn't follow on X (lerpX=0) because the world wraps
    // horizontally; only vertical offset matters here.
    this.cameras.main.setFollowOffset(0, -this.cameras.main.height * CAMERA.followOffsetYRatio);

    this.spawner = new DebrisSpawner(
      this,
      this.debrisGroup,
      () => this.cameras.main.worldView.top
    );
    this.ladderSpawner = new LadderSpawner(
      this,
      this.debrisGroup,
      () => this.cameras.main.worldView.top,
      () => this.player.x,
      () => this.player.y
    );
    this.gapWallSpawner = new GapWallSpawner(
      this,
      this.debrisGroup,
      () => this.cameras.main.worldView.top
    );
    this.coinSpawner = new CoinSpawner(
      this,
      this.coinGroup,
      () => this.cameras.main.worldView.top,
      () => this.gapWallSpawner!.getCurrentGapCenterX()
    );

    // Mode-specific spawner set. Ascent uses the corridor + coins;
    // Stack uses only the piece spawner. Player, physics, HUD, music, and
    // wrap behavior are identical across modes.
    if (this.mode === 'stack') {
      this.pieceSpawner = new PieceSpawner(
        this,
        this.debrisGroup,
        () => this.cameras.main.worldView.top
      );
      this.pieceSpawner.start(this.time.now);
    } else {
      this.spawner.start(this.time.now);
      this.ladderSpawner.start(this.time.now);
      this.gapWallSpawner.start(this.time.now);
      this.coinSpawner.start(this.time.now);
    }

    this.buildHud();
    this.buildTouchControls();
    this.bindKeyboard();
    this.bindResize();

    // Two-camera setup. Main renders world; uiCam renders HUD/controls at
    // 1:1 on top. Must run AFTER buildHud/buildTouchControls so we have
    // real UI gameobjects to add to the layer. mainCam.ignore(uiLayer)
    // and uiCam.ignore(worldObjects) achieve the split.
    this.setupUiCamera(viewportW, viewportH);

    // Stack mode zooms the world out so the player can see many rows of
    // falling pieces above them instead of just the next 2. The UI camera
    // stays at 1:1 so touch controls / HUD are unaffected.
    if (this.mode === 'stack') {
      this.cameras.main.setZoom(CAMERA.stackZoom);
    }

    // Music: start on the first user gesture so the AudioContext is allowed
    // to resume on mobile browsers.
    const startMusic = () => this.sfx.startMusic();
    this.input.once('pointerdown', startMusic);
    this.input.keyboard?.once('keydown', startMusic);

    this.runStartMs = this.time.now;
  }

  update(time: number, _delta: number): void {
    if (this.dead) return;

    // Fold keyboard + touch into a single input snapshot.
    const kbLeft = this.keys.left.isDown || this.keys.a.isDown;
    const kbRight = this.keys.right.isDown || this.keys.d.isDown;
    const kbUp = this.keys.up.isDown || this.keys.w.isDown;
    const kbDown = this.keys.down.isDown || this.keys.s.isDown;
    const stickX = this.joystick?.moveX ?? 0;
    const stickY = this.joystick?.moveY ?? 0;
    const moveX =
      stickX !== 0
        ? stickX
        : (kbRight ? 1 : 0) - (kbLeft ? 1 : 0);
    const moveY =
      stickY !== 0
        ? stickY
        : (kbDown ? 1 : 0) - (kbUp ? 1 : 0);

    this.jumpButton?.consume();
    this.specialButton?.consume();
    const keyboardJumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w);

    // Stick-up-as-jump: fire on the rising edge (must release past a low
    // threshold before it'll trigger again) so holding up doesn't spam jumps.
    // Gated by the persistent stickJumpEnabled toggle.
    const stickUpActive = moveY < -0.6;
    const stickJumpEdge = this.stickJumpEnabled && stickUpActive && this.stickJumpArmed;
    if (stickJumpEdge) this.stickJumpArmed = false;
    if (moveY > -0.25) this.stickJumpArmed = true;

    const jumpPressed =
      (this.jumpButton?.pressedThisFrame ?? false) || keyboardJumpPressed || stickJumpEdge;
    const jumpHeld =
      (this.jumpButton?.held ?? false) ||
      this.keys.up.isDown ||
      this.keys.w.isDown ||
      (this.stickJumpEnabled && stickUpActive);

    const airDodgePressed = Phaser.Input.Keyboard.JustDown(this.keys.shift);
    const specialPressed =
      (this.specialButton?.pressedThisFrame ?? false) || Phaser.Input.Keyboard.JustDown(this.keys.space);
    const climbPressed = Phaser.Input.Keyboard.JustDown(this.keys.e);
    const fireHeld =
      (this.specialButton?.held ?? false) || this.keys.f.isDown || this.keys.space.isDown;

    this.player.applyInput(
      { moveX, moveY, jumpPressed, jumpHeld, airDodgePressed, specialPressed, climbPressed, fireHeld },
      time
    );

    // Settle any debris that finished arriving at rest on a surface.
    this.debrisGroup.children.iterate((obj) => {
      const d = obj as Debris;
      if (!d || d.settled) return true;
      const body = d.body as Phaser.Physics.Arcade.Body;
      if ((body.blocked.down || body.touching.down) && Math.abs(body.velocity.y) < 40) {
        d.settle();
      }
      return true;
    });

    if (this.mode === 'stack') {
      this.pieceSpawner?.update(time);
    } else {
      if (DEBRIS.enabled) this.spawner?.update(time);
      this.ladderSpawner?.update(time);
      this.gapWallSpawner?.update(time);
      this.coinSpawner?.update(time);
    }

    // Time-out off-screen bullets and wrap horizontally.
    if (WEAPON.enabled) {
      this.bulletGroup.getChildren().forEach((obj) => {
        const b = obj as Bullet;
        if (b.tick(time)) {
          b.destroy();
          return;
        }
        this.wrapHorizontal(b);
      });
    }

    // Screen wrap: when the player crosses one edge, reappear at the other.
    // World width was collapsed to viewport width in create(), so this gives
    // a true Pac-Man wrap with no camera motion.
    this.wrapHorizontal(this.player);

    // Fade any control the player is currently behind so the character is
    // never fully hidden by their own touch UI on mobile.
    this.updateControlOcclusion();

    // Score tracking: how far above spawn the player has climbed.
    const climbed = Math.max(0, PLAYER.spawnY - this.player.y);
    if (climbed > this.maxHeightPx) this.maxHeightPx = climbed;

    // Fall-to-ground death: once the player has climbed a meaningful amount,
    // touching the floor again is fatal. Wall-jump + teleport are the core
    // verbs -- returning to the ground means the run is over. In stack mode
    // there is no meaningful ground (world floor is ~1M px below), so we
    // instead kill when the player falls off the bottom of the camera.
    // The `maxHeightPx > threshold` gate is important in BOTH modes: on the
    // very first update() the camera hasn't followed yet (worldView is at
    // 0,0 by default), so player.y is far past camBottom before the camera
    // catches up. Requiring some climbed distance first avoids that.
    const fallDeathThreshold = 120;
    if (this.maxHeightPx > fallDeathThreshold) {
      if (this.mode === 'stack') {
        const camBottom = this.cameras.main.worldView.bottom;
        if (this.player.y > camBottom + 60) this.kill();
      } else {
        const pBody = this.player.body as Phaser.Physics.Arcade.Body | null;
        const onFloor =
          pBody &&
          (pBody.blocked.down || pBody.touching.down) &&
          this.player.y > PLAYER.spawnY - 40;
        if (onFloor) this.kill();
      }
    }
    this.updateHud(time);
    this.updateParallaxBackground();
    this.updateZoneProgression();

    if (Phaser.Input.Keyboard.JustDown(this.keys.b)) this.cycleTheme();
    if (Phaser.Input.Keyboard.JustDown(this.keys.m)) this.sfx.toggleMute();
    if (Phaser.Input.Keyboard.JustDown(this.keys.f1)) this.toggleDebugOverlay();
    if (this.debugOverlay) this.drawDebugOverlay();
    if (this.themeHintText && this.themeHintHideAt > 0 && time > this.themeHintHideAt) {
      this.themeHintText.setVisible(false);
      this.themeHintHideAt = 0;
    }

    // Failsafe: if the player falls into the kill zone (shouldn't happen due to floor).
    if (this.player.y > WORLD.height + 200) this.kill();
  }

  // --------- collisions ---------

  private onPlayerHitDebris = (
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    debrisObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile
  ): void => {
    const d = debrisObj as Debris;
    if (this.dead) return;
    const pBody = this.player.body as Phaser.Physics.Arcade.Body;
    const dBody = d.body as Phaser.Physics.Arcade.Body;

    // Crush rule: the player dies only when a falling block pins them against
    // something solid below (floor or another settled block). Standing next
    // to a stack, getting bumped on the side, or even taking a falling block
    // on the head in mid-air are all survivable - you only get crushed when
    // there is no room to be pushed.
    if (d.settled) return;

    // Air dodge / special grants brief invulnerability so a well-timed dodge
    // genuinely saves you mid-air.
    if (this.player.isInvulnerable(this.time.now)) return;

    // The falling piece must be pressing down on the player from above.
    const debrisOnTop = dBody.bottom <= pBody.top + 4 ? false : dBody.center.y < pBody.center.y;
    if (!debrisOnTop) return;
    const pressingDown = pBody.touching.up || pBody.blocked.up;
    if (!pressingDown) return;

    // The player must be unable to give: grounded on the world floor or on a
    // settled block. If they're airborne, the impact just pushes them down.
    const supported = pBody.blocked.down || pBody.touching.down;
    if (!supported) return;

    // In pattern mode, crush is non-lethal: getting pinned just means you
    // get pushed back toward the floor by the next falling rows.
    if (!DEBRIS.crushKillsPlayer) return;

    this.kill();
  };

  private onDebrisLanded = (
    debrisObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile
  ): void => {
    const d = debrisObj as Debris;
    d.settle();
  };

  // Process callback: return false to cancel collision resolution. Two
  // settled (immovable, motionless) pieces don't need to be re-separated.
  private debrisVsDebrisProcess = (
    aObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    bObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile
  ): boolean => {
    const a = aObj as Debris;
    const b = bObj as Debris;
    if (a.settled && b.settled) return false;
    return true;
  };

  private onDebrisHitDebris = (
    aObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    bObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile
  ): void => {
    const a = aObj as Debris;
    const b = bObj as Debris;
    // Whichever piece is on top of a settled piece (or both falling, the upper
    // one) gets settled too if its downward motion is spent.
    const aBody = a.body as Phaser.Physics.Arcade.Body;
    const bBody = b.body as Phaser.Physics.Arcade.Body;
    if (b.settled && aBody.touching.down && Math.abs(aBody.velocity.y) < 60) a.settle();
    if (a.settled && bBody.touching.down && Math.abs(bBody.velocity.y) < 60) b.settle();
  };

  // --------- death / restart ---------

  // Classic Mario Bros / Pac-Man horizontal wrap. The instant the sprite's
  // center crosses an edge, teleport it to the opposite edge. World width
  // equals the viewport, so no camera motion is involved. We use body.reset
  // (then restore velocity) so any pending Arcade Physics collision resolves
  // are cleared -- otherwise the collider that pushed us off can push us back.
  private wrapHorizontal(obj: Phaser.Physics.Arcade.Sprite): void {
    const w = this.physics.world.bounds.width;
    if (w <= 0) return;
    const body = obj.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    if (obj.x < 0 || obj.x > w) {
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const newX = obj.x < 0 ? w : 0;
      body.reset(newX, obj.y);
      body.setVelocity(vx, vy);
    }
  }

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.sfx.hurt();
    const stats = makeStats(this.maxHeightPx, (this.time.now - this.runStartMs) / 1000);
    const finalStats = {
      ...stats,
      coins: this.coinsCollected,
      coinScore: this.coinScore,
      mode: this.mode
    };
    this.cameras.main.flash(180, 255, 80, 80);
    this.cameras.main.shake(220, 0.01);
    // Hitstop: pause physics + tweens for a beat so the death registers.
    // Handles player input freeze via this.dead guard already.
    this.physics.world.pause();
    this.tweens.pauseAll();
    this.time.delayedCall(140, () => {
      this.physics.world.resume();
      this.tweens.resumeAll();
    });
    this.time.delayedCall(400, () => {
      this.scene.start('GameOver', finalStats);
    });
  }

  // --------- world geometry ---------

  // Parallax depth cue. Builds whatever layers the active theme needs. The
  // 'solid' theme uses no tile sprites (just the camera background color).
  private buildParallaxBackground(): void {
    this.currentTheme = this.loadSavedTheme();
    this.applyTheme(this.currentTheme);
    // Resize background to match viewport on rotation / window changes.
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.bgFar?.setSize(size.width, size.height);
      this.bgNear?.setSize(size.width, size.height);
      if (this.themeHintText) this.themeHintText.setPosition(size.width / 2, 24);
    });
  }

  private applyTheme(theme: ThemeId): void {
    this.bgFar?.destroy();
    this.bgNear?.destroy();
    this.bgFar = undefined;
    this.bgNear = undefined;

    this.cameras.main.setBackgroundColor(THEME.fillByTheme[theme]);

    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    if (theme === 'stars') {
      this.bgFar = this.add
        .tileSprite(0, 0, w, h, 'bg_stars_far')
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-100)
        .setAlpha(0.9);
      this.bgNear = this.add
        .tileSprite(0, 0, w, h, 'bg_stars_near')
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-90)
        .setAlpha(0.95);
    } else if (theme === 'streaks') {
      this.bgFar = this.add
        .tileSprite(0, 0, w, h, 'bg_streaks_far')
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-100)
        .setAlpha(0.9);
      this.bgNear = this.add
        .tileSprite(0, 0, w, h, 'bg_streaks_near')
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-90)
        .setAlpha(0.85);
    }
    // 'solid' theme: no tile sprites, just the background color.
  }

  private updateParallaxBackground(): void {
    if (!this.bgFar || !this.bgNear) return;
    const scrollY = this.cameras.main.scrollY;
    this.bgFar.tilePositionY = scrollY * 0.25;
    this.bgNear.tilePositionY = scrollY * 0.7;
    const scrollX = this.cameras.main.scrollX;
    this.bgFar.tilePositionX = scrollX * 0.2;
    this.bgNear.tilePositionX = scrollX * 0.5;
  }

  // --------- UI camera split ---------

  // Creates a second camera on top of the main one, sized to the FULL
  // canvas (not just the play-area viewport). Main camera renders the
  // world (clipped to leftGutter..leftGutter+WORLD.width); UI camera
  // renders HUD/touch controls across the whole canvas so the joystick
  // and buttons can sit BESIDE the play area in the reserved gutters.
  private setupUiCamera(viewportW: number, viewportH: number): void {
    if (!this.uiLayer) this.uiLayer = this.add.layer();
    // Add any previously-registered UI objects (buildHud + buildTouchControls
    // ran before this method) to the layer now.
    // NOTE: registerUi() also adds current items to uiLayer when it exists.
    const uiCam = this.cameras.add(0, 0, viewportW, viewportH);
    uiCam.setName('ui');
    uiCam.setScroll(0, 0);
    this.uiCam = uiCam;

    // Main renders everything EXCEPT the UI layer.
    this.cameras.main.ignore(this.uiLayer);

    // UI camera renders ONLY the UI layer. Enumerate current world-ish
    // gameobjects and ignore them. Dynamic world spawns (debris, coins,
    // bullets) go through Groups which we also ignore, so members added
    // later inherit the ignore automatically.
    const worldObjs: Phaser.GameObjects.GameObject[] = [];
    const push = (o?: Phaser.GameObjects.GameObject | null) => {
      if (o) worldObjs.push(o);
    };
    push(this.player);
    push(this.floor);
    push(this.bgFar);
    push(this.bgNear);
    push(this.skyTop);
    push(this.skyBottom);
    push(this.sun);
    push(this.sunGlow);
    uiCam.ignore(worldObjs);
    uiCam.ignore(this.debrisGroup);
    uiCam.ignore(this.bulletGroup);
    uiCam.ignore(this.coinGroup);
  }

  // Add a UI gameobject to the ui layer and mark the main camera to skip
  // it. Safe to call before setupUiCamera runs (uiLayer will be created
  // there and pre-existing entries picked up).
  private registerUi(...objects: Phaser.GameObjects.GameObject[]): void {
    if (!this.uiLayer) this.uiLayer = this.add.layer();
    this.uiLayer.add(objects);
  }

  // --------- Zone progression / sunrise ---------

  // Sky and sun sit BEHIND everything (depth -200) with scrollFactor 0 so
  // they're camera-locked. The sun is a colored disc plus a fainter,
  // larger glow disc. Both start invisible and warm up as tiers advance.
  private buildSkyAndSun(): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    // Two stacked rectangles fake a top-to-bottom gradient. Cheap and
    // works on every device without shaders.
    this.skyTop = this.add
      .rectangle(0, 0, w, Math.round(h * 0.6), 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-200)
      .setAlpha(0);
    this.skyBottom = this.add
      .rectangle(0, Math.round(h * 0.6), w, Math.ceil(h * 0.4), 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-200)
      .setAlpha(0);
    // Sun anchored below screen. maxRise caps how far it can climb, so it
    // never actually crests the horizon (design intent: endless anticipation).
    const sunR = Math.round(Math.min(w, h) * 0.28);
    const glowR = Math.round(sunR * 1.9);
    const cx = Math.round(w * 0.5);
    // Start well below viewport bottom.
    const startY = h + sunR;
    this.sunGlow = this.add
      .circle(cx, startY, glowR, 0xffb040, 0)
      .setScrollFactor(0)
      .setDepth(-190);
    this.sun = this.add
      .circle(cx, startY, sunR, 0xffb040, 0)
      .setScrollFactor(0)
      .setDepth(-189);
    // Rebuild on resize (rotation / window). Simplest: destroy and re-add.
    this.scale.on('resize', () => this.rebuildSkyAndSun());
  }

  private rebuildSkyAndSun(): void {
    this.skyTop?.destroy();
    this.skyBottom?.destroy();
    this.sun?.destroy();
    this.sunGlow?.destroy();
    this.skyTop = undefined;
    this.skyBottom = undefined;
    this.sun = undefined;
    this.sunGlow = undefined;
    this.buildSkyAndSun();
  }

  // Returns [activeZoneIndex, progressToNext 0..1]. progress smoothly
  // interpolates between neighboring zone thresholds so visuals/music can
  // blend rather than snapping.
  private getZoneProgress(): { index: number; blend: number } {
    const h = this.maxHeightPx;
    let idx = 0;
    for (let i = 0; i < ZONES.length; i++) {
      if (h >= ZONES[i].heightPx) idx = i;
    }
    if (idx >= ZONES.length - 1) return { index: idx, blend: 1 };
    const cur = ZONES[idx].heightPx;
    const next = ZONES[idx + 1].heightPx;
    const t = Phaser.Math.Clamp((h - cur) / Math.max(1, next - cur), 0, 1);
    return { index: idx, blend: t };
  }

  private updateZoneProgression(): void {
    const { index, blend } = this.getZoneProgress();
    const a = ZONES[index];
    const b = ZONES[Math.min(index + 1, ZONES.length - 1)];

    // Interpolated sky colors.
    const topA = Phaser.Display.Color.ValueToColor(a.skyTop);
    const topB = Phaser.Display.Color.ValueToColor(b.skyTop);
    const botA = Phaser.Display.Color.ValueToColor(a.skyBottom);
    const botB = Phaser.Display.Color.ValueToColor(b.skyBottom);
    const skyTopColor = Phaser.Display.Color.Interpolate.ColorWithColor(topA, topB, 100, Math.round(blend * 100));
    const skyBotColor = Phaser.Display.Color.Interpolate.ColorWithColor(botA, botB, 100, Math.round(blend * 100));
    // Fade in the sky starting at tier 2 (index 1). Tier 1 keeps the pure
    // black background for that "easy on the eyes" launch feel.
    const skyAlpha = index === 0 ? blend * 0.6 : 1;
    if (this.skyTop) {
      this.skyTop.fillColor = Phaser.Display.Color.GetColor(skyTopColor.r, skyTopColor.g, skyTopColor.b);
      this.skyTop.setAlpha(skyAlpha);
    }
    if (this.skyBottom) {
      this.skyBottom.fillColor = Phaser.Display.Color.GetColor(skyBotColor.r, skyBotColor.g, skyBotColor.b);
      this.skyBottom.setAlpha(skyAlpha);
    }

    // Sun: interpolate color and creep upward. Cap the rise so the sun's
    // TOP edge never crosses the horizon line (~60% viewport height).
    if (this.sun && this.sunGlow) {
      const sunA = Phaser.Display.Color.ValueToColor(a.sunColor);
      const sunB = Phaser.Display.Color.ValueToColor(b.sunColor);
      const sunColor = Phaser.Display.Color.Interpolate.ColorWithColor(sunA, sunB, 100, Math.round(blend * 100));
      const sunHex = Phaser.Display.Color.GetColor(sunColor.r, sunColor.g, sunColor.b);
      const alpha = Phaser.Math.Linear(a.sunAlpha, b.sunAlpha, blend);
      this.sun.setFillStyle(sunHex, alpha);
      this.sunGlow.setFillStyle(sunHex, alpha * 0.35);

      const h = this.scale.gameSize.height;
      const w = this.scale.gameSize.width;
      const sunR = this.sun.radius;
      // horizon = 0.62 * h. peakY = horizon + sunR * 0.6 keeps top of sun
      // just below the horizon even at max progress. startY = h + sunR.
      const horizon = h * 0.62;
      const startY = h + sunR;
      const peakY = horizon + sunR * 0.6;
      // Global progress across all tiers (0 at tier 1 start, 1 at tier 5).
      const global = (index + blend) / (ZONES.length - 1);
      const y = Phaser.Math.Linear(startY, peakY, Phaser.Math.Clamp(global, 0, 1));
      this.sun.y = y;
      this.sunGlow.y = y;
      // Center horizontally in case of resize.
      const cx = w * 0.5;
      this.sun.x = cx;
      this.sunGlow.x = cx;
    }

    // Zone crossing: announce with a big banner and ramp music intensity.
    const newZoneId = ZONES[index].id;
    if (newZoneId !== this.currentZoneId) {
      this.currentZoneId = newZoneId;
      this.showZoneBanner(ZONES[index].name, newZoneId);
      this.sfx.setMusicIntensity(newZoneId);
    }
  }

  private showZoneBanner(name: string, tier: number): void {
    const w = this.scale.gameSize.width;
    const h = this.scale.gameSize.height;
    // Destroy any lingering banner so back-to-back transitions don't stack.
    this.zoneBannerText?.destroy();
    const isDrop = tier >= 5;
    const label = isDrop ? `TIER ${tier}\n${name.toUpperCase()}\n>>> DROP <<<` : `TIER ${tier}\n${name.toUpperCase()}`;
    const t = this.add
      .text(w / 2, h * 0.35, label, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: isDrop ? '44px' : '32px',
        color: isDrop ? '#ffdc7a' : '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(2100)
      .setAlpha(0)
      .setScale(0.6);
    this.zoneBannerText = t;
    this.registerUi(t);
    this.tweens.add({
      targets: t,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.Out'
    });
    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 500,
      delay: isDrop ? 1600 : 1100,
      onComplete: () => t.destroy()
    });
  }

  private cycleTheme(): void {
    const idx = THEME.order.indexOf(this.currentTheme);
    const next = THEME.order[(idx + 1) % THEME.order.length];
    this.currentTheme = next;
    this.applyTheme(next);
    this.saveTheme(next);
    this.showThemeHint(next);
  }

  private showThemeHint(theme: ThemeId): void {
    if (!this.themeHintText) {
      this.themeHintText = this.add
        .text(this.scale.gameSize.width / 2, 24, '', {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.45)',
          padding: { x: 10, y: 6 }
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(2001);
      this.registerUi(this.themeHintText);
    }
    this.themeHintText.setText(`Background: ${theme}  (press B to cycle)`);
    this.themeHintText.setVisible(true);
    this.themeHintHideAt = this.time.now + 1800;
  }

  private loadSavedTheme(): ThemeId {
    try {
      const saved = window.localStorage.getItem(THEME.storageKey);
      if (saved && (THEME.order as readonly string[]).includes(saved)) {
        return saved as ThemeId;
      }
    } catch {
      // localStorage may be unavailable (private mode, sandboxed iframe); fall through.
    }
    return THEME.default;
  }

  private saveTheme(theme: ThemeId): void {
    try {
      window.localStorage.setItem(THEME.storageKey, theme);
    } catch {
      // Ignore persistence failures - theme still applies for this session.
    }
  }

  private loadStickJumpSetting(): void {
    try {
      const v = window.localStorage.getItem(GameScene.STICK_JUMP_KEY);
      // Default true when nothing saved yet.
      this.stickJumpEnabled = v === null ? true : v === '1';
    } catch {
      this.stickJumpEnabled = true;
    }
  }

  private saveStickJumpSetting(): void {
    try {
      window.localStorage.setItem(GameScene.STICK_JUMP_KEY, this.stickJumpEnabled ? '1' : '0');
    } catch {
      // Ignore persistence failures - setting still applies for this session.
    }
  }

  private buildFloor(): void {
    // Build the floor as a tiny static image and refreshBody() after sizing -
    // this is the canonical, reliable Phaser path for a static collider that
    // does not match its source texture dimensions.
    const f = this.physics.add.staticImage(
      WORLD.width / 2,
      WORLD.floorY + WORLD.floorThickness / 2,
      'floor_tile'
    );
    f.setDisplaySize(WORLD.width, WORLD.floorThickness);
    f.refreshBody();
    this.floor = f as unknown as Phaser.GameObjects.Rectangle;
  }

  // --------- HUD ---------

  private buildHud(): void {
    this.hudText = this.add
      .text(16, 16, '', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.35)',
        padding: { x: 8, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(2000);
    this.registerUi(this.hudText);

    // Stick-jump toggle in the top-right. Color-codes ON (green) vs OFF
    // (grey) so it's obvious at a glance. Persists to localStorage.
    const { width } = this.scale.gameSize;
    const stjW = 68;
    const stjX0 = width - 8;
    const stjBg = this.add
      .rectangle(stjX0, 8, stjW, 22, 0x000000, 0.5)
      .setStrokeStyle(1, 0x00ff88, 0.8)
      .setOrigin(1, 0)
      .setDepth(2000)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const stjLabel = this.add
      .text(stjX0 - stjW / 2, 8 + 11, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#00ff88',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(2001)
      .setScrollFactor(0);
    const refreshStj = () => {
      const on = this.stickJumpEnabled;
      stjLabel.setText(on ? 'TAP: ON' : 'TAP: OFF');
      stjLabel.setColor(on ? '#00ff88' : '#888888');
      stjBg.setStrokeStyle(1, on ? 0x00ff88 : 0x888888, 0.8);
    };
    refreshStj();
    stjBg.on('pointerdown', () => {
      this.stickJumpEnabled = !this.stickJumpEnabled;
      this.saveStickJumpSetting();
      refreshStj();
    });
    this.registerUi(stjBg);
    this.registerUi(stjLabel);

    // Keep the button anchored to the top-right on resize.
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      const nx = size.width - 8;
      stjBg.setPosition(nx, 8);
      stjLabel.setPosition(nx - stjW / 2, 8 + 11);
    });
  }

  private updateHud(timeMs: number): void {
    const seconds = (timeMs - this.runStartMs) / 1000;
    const stats = makeStats(this.maxHeightPx, seconds);
    const w = this.physics.world.bounds.width;
    const px = Math.round(this.player.x);
    this.hudText.setText(
      `Height: ${Math.floor(this.maxHeightPx)}   Time: ${seconds.toFixed(1)}s   Coins: ${this.coinsCollected}   Score: ${stats.score + this.coinScore}\nx:${px} / w:${w}`
    );
  }

  // --------- debug overlay (F1) ---------

  // Toggles a full-canvas Graphics overlay that visualizes canvas bounds,
  // the main-camera viewport (play area), the UI-camera viewport, gutters,
  // touch-control hit circles, and a 50px grid. Sits on the UI layer so it
  // survives camera zooms and always draws in canvas coords.
  private toggleDebugOverlay(): void {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlayText?.destroy();
      this.debugOverlay = undefined;
      this.debugOverlayText = undefined;
      return;
    }
    this.debugOverlay = this.add.graphics().setDepth(3000);
    this.debugOverlayText = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#00ff88',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 6, y: 4 }
      })
      .setDepth(3001);
    this.registerUi(this.debugOverlay);
    this.registerUi(this.debugOverlayText);
  }

  private drawDebugOverlay(): void {
    if (!this.debugOverlay || !this.debugOverlayText) return;
    const g = this.debugOverlay;
    const { width: cw, height: ch } = this.scale.gameSize;
    const lg = this.leftGutter;
    const rg = this.rightGutter;
    const ww = WORLD.width;

    g.clear();

    // 50px grid across the whole canvas
    g.lineStyle(1, 0x2a2a2a, 0.7);
    for (let x = 0; x <= cw; x += 50) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, ch);
      g.strokePath();
    }
    for (let y = 0; y <= ch; y += 50) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(cw, y);
      g.strokePath();
    }

    // Canvas outline (magenta)
    g.lineStyle(2, 0xff00ff, 1);
    g.strokeRect(0, 0, cw, ch);

    // Left gutter fill (yellow tint)
    if (lg > 0) {
      g.fillStyle(0xffff00, 0.15);
      g.fillRect(0, 0, lg, ch);
    }
    // Right gutter fill (cyan tint)
    if (rg > 0) {
      g.fillStyle(0x00ffff, 0.15);
      g.fillRect(cw - rg, 0, rg, ch);
    }

    // Play area (main camera viewport) outline (bright green)
    g.lineStyle(3, 0x00ff00, 1);
    g.strokeRect(lg, 0, ww, ch);

    // Joystick hit circle (activation radius 1.8x visible)
    g.lineStyle(2, 0xff8800, 1);
    g.strokeCircle(UI.joystickMargin, ch - UI.joystickMargin, UI.joystickRadius);
    g.lineStyle(1, 0xff8800, 0.5);
    g.strokeCircle(UI.joystickMargin, ch - UI.joystickMargin, UI.joystickRadius * 1.8);

    // Button hit circles
    const btn = this.actionButtonPositions(cw, ch);
    g.lineStyle(2, 0xff8800, 1);
    g.strokeCircle(btn.jump.x, btn.jump.y, UI.buttonRadius);
    g.strokeCircle(btn.special.x, btn.special.y, UI.buttonRadius);

    // Rulers: tick every 50px along top and left with labels
    // (skipped for brevity — the grid provides the same info)

    // Info readout
    const info = [
      `canvas: ${cw} x ${ch}`,
      `play:   ${lg} .. ${lg + ww}  (w=${ww})`,
      `gutter: L=${lg}  R=${rg}`,
      `joy:    (${UI.joystickMargin}, ${Math.round(ch - UI.joystickMargin)}) r=${UI.joystickRadius}`,
      `jump:   (${btn.jump.x}, ${btn.jump.y}) r=${UI.buttonRadius}`,
      `spcl:   (${btn.special.x}, ${btn.special.y}) r=${UI.buttonRadius}`,
      `mode:   ${this.mode}`,
      `F1: hide`
    ].join('\n');
    this.debugOverlayText.setText(info);
    this.debugOverlayText.setPosition(lg + 4, 4);
  }

  // --------- touch controls ---------

  private buildTouchControls(): void {
    const { width, height } = this.scale.gameSize;
    if (!shouldShowTouchControls(width, height)) return;
    // Touch controls live on the full-canvas UI camera, so use canvas
    // (game-size) coordinates directly. leftGutter/rightGutter in the main
    // camera are sized so joystick + buttons land in the reserved margins.
    const jx = UI.joystickMargin;
    const jy = height - UI.joystickMargin;
    this.joystick = new VirtualJoystick(this, jx, jy);

    // Right-thumb cluster: JUMP + SPCL only. Climb/dodge are keyboard-only.
    const positions = this.actionButtonPositions(width, height);
    this.jumpButton = new ActionButton(this, positions.jump.x, positions.jump.y, 'JUMP', 0x6cf0ff);
    this.specialButton = new ActionButton(this, positions.special.x, positions.special.y, 'SPCL', 0xff77ff);

    // Register all touch-control gameobjects with the UI layer so they
    // render on uiCam only.
    this.registerUi(...this.joystick.getRenderables());
    this.registerUi(...this.jumpButton.getRenderables());
    this.registerUi(...this.specialButton.getRenderables());
  }

  // Layout for the two-button cluster on the bottom-right:
  //   [SPCL]
  //   [JUMP]
  private actionButtonPositions(w: number, h: number): {
    jump: { x: number; y: number };
    special: { x: number; y: number };
  } {
    const gap = 14;
    const bx = w - UI.buttonMargin;
    const by = h - UI.buttonMargin;
    const step = UI.buttonRadius * 2 + gap;
    return {
      jump: { x: bx, y: by },
      special: { x: bx, y: by - step }
    };
  }

  // Per-frame: dim any control whose screen-space hit area overlaps the
  // player's screen-space body. Without this, on narrow phones the player
  // can stand visually inside the joystick or button cluster and disappear.
  private updateControlOcclusion(): void {
    if (!this.joystick && !this.jumpButton && !this.specialButton) return;
    const cam = this.cameras.main;
    const px = this.player.x - cam.scrollX;
    const py = this.player.y - cam.scrollY;
    const pr = Math.max(PLAYER.width, PLAYER.height) * 0.5;

    const { width, height } = this.scale.gameSize;
    const jx = UI.joystickMargin;
    const jy = height - UI.joystickMargin;
    const overlaps = (cx: number, cy: number, cr: number): boolean => {
      const reach = cr + pr + UI.controlOcclusionPad;
      return Math.hypot(px - cx, py - cy) <= reach;
    };

    this.joystick?.setOcclusionAlpha(
      overlaps(jx, jy, UI.joystickRadius) ? UI.controlAlphaOccluded : UI.controlAlpha
    );

    const p = this.actionButtonPositions(width, height);
    this.jumpButton?.setOcclusionAlpha(
      overlaps(p.jump.x, p.jump.y, UI.buttonRadius) ? UI.controlAlphaOccluded : UI.controlAlpha
    );
    this.specialButton?.setOcclusionAlpha(
      overlaps(p.special.x, p.special.y, UI.buttonRadius) ? UI.controlAlphaOccluded : UI.controlAlpha
    );
  }

  private bindResize(): void {
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      const w = Math.floor(size.width);
      const h = Math.floor(size.height);
      // Full-canvas play area accounting for the current mode's zoom.
      // Stack mode insets the walkable area (see create() for rationale).
      const zoom = this.mode === 'stack' ? CAMERA.stackZoom : 1;
      let leftGutter = 0;
      let rightGutter = 0;
      let worldW = Math.max(320, Math.floor(w / zoom));
      if (this.mode === 'stack') {
        const worldLeftInset = 310;
        const worldRightInset = worldW - 959;
        worldW = Math.max(320, worldW - worldLeftInset - Math.max(0, worldRightInset));
        leftGutter = Math.round(worldLeftInset * zoom);
        rightGutter = Math.max(0, Math.round(worldRightInset * zoom));
      }
      WORLD.width = worldW;
      this.leftGutter = leftGutter;
      this.rightGutter = rightGutter;
      WORLD.width = worldW;
      this.leftGutter = leftGutter;
      this.rightGutter = rightGutter;
      this.physics.world.setBounds(0, 0, worldW, WORLD.height);
      this.cameras.main.setBounds(0, 0, worldW, WORLD.height);
      this.cameras.main.setViewport(leftGutter, 0, worldW, h);
      // UI camera covers the entire canvas so joystick / buttons render
      // outside the play area in the reserved gutters (or on top of its
      // corners when the viewport is smaller than target).
      this.uiCam?.setViewport(0, 0, w, h);
      // Reposition touch controls in CANVAS coords (not world coords).
      this.joystick?.reposition(UI.joystickMargin, h - UI.joystickMargin);
      const p = this.actionButtonPositions(w, h);
      this.jumpButton?.reposition(p.jump.x, p.jump.y);
      this.specialButton?.reposition(p.special.x, p.special.y);
      this.cameras.main.setFollowOffset(0, -h * CAMERA.followOffsetYRatio);
    });
  }

  private bindKeyboard(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      x: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      b: kb.addKey(Phaser.Input.Keyboard.KeyCodes.B),
      f: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      m: kb.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      f1: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1)
    };
  }

  shutdown(): void {
    // Music intentionally NOT stopped -- SoundFx persists across scene
    // restarts (Phaser scenes are singletons), and startMusic() no-ops if
    // already running, so the loop plays continuously through death /
    // restart cycles.
    this.joystick?.destroy();
    this.jumpButton?.destroy();
    this.specialButton?.destroy();
    void PHYSICS;
  }
}
