// Global tunables. Adjust these to change game feel without hunting through files.

export const WORLD = {
  // Open horizontal arena — wide enough that edges sit off-screen on a phone,
  // so the player never sees the world boundary as a "wall". Camera follows
  // the player horizontally within this width.
  width: 1400,
  // Preferred play-area width. The scene fits WORLD.width to
  // min(viewportW - 2*minGutter, targetPlayWidth). ~555 gives ~11 tile
  // columns at PIECE.tileSize=48, so stack mode has one more spawn lane
  // than the naive viewport-minus-controls layout would allow.
  targetPlayWidth: 555,
  // World is tall enough to accommodate the tier-5 zone threshold (1M px
  // climbed) with headroom. Corridor blocks are procedurally spawned from
  // just above the camera so the vertical extent has no perf impact.
  height: 1_100_000,
  floorY: 1_099_800,
  floorThickness: 120
};

// Visible side walls flanking the climb column. Kept around for reference;
// the active scene now generates a winding interior corridor instead.
export const WALL = {
  thickness: 14,
  color: 0x1d1f28,
  highlight: 0x2c2f3a
};

// Winding corridor generated at scene start. Static slabs on each row carve
// out a smooth serpentine passage from the floor to the top of the world.
// Debris falls from above the camera, spawned inside the passage at that height,
// and tumbles down through the corridor.
export const CORRIDOR = {
  tileSize: 32,             // vertical resolution of the corridor (px per row)
  passageHalfWidthPx: 120,  // half-width of the open passage (~240px = ~7.5 tiles)
  amplitudePx: 150,         // max horizontal shift of the passage center from world midline
  freq1: 0.006,             // primary winding frequency (wavelength ~1050 px)
  freq2: 0.017,             // secondary wiggle frequency (wavelength ~370 px)
  amplitudeRatio2: 0.35,    // secondary wiggle amplitude relative to primary
  wallColor: 0x2a2d38,
  wallHighlight: 0x3a3e4d   // (reserved) for future inner edge decoration
};

export const PHYSICS = {
  gravity: 1400,
  playerSpeed: 260,
  playerAccel: 1800,
  playerDrag: 1400,
  jumpVelocity: -720,
  coyoteMs: 90,
  jumpBufferMs: 120,
  maxFallSpeed: 900,
  // Melee-style pivot: flicking the stick opposite to current ground momentum
  // hard-cancels velocity (and optionally adds a small impulse the other way)
  // instead of letting drag bleed it off. Grounded only.
  pivotInputThreshold: 0.55,    // |stickX| required to register a pivot flick
  pivotVelocityThreshold: 70,   // |bodyVelX| required for a pivot to feel meaningful
  pivotImpulse: 90,             // small starting speed in the new direction (0 = pure cancel)
  pivotCooldownMs: 140,         // prevent rapid re-triggers
  pivotAirCancelMul: 0.45,      // softer pivot when airborne (set to 0 to disable)
  // Air jumps: how many times you can jump after leaving the ground without
  // touching a surface. 1 = classic double jump. The air jump's upward kick
  // is scaled relative to the ground jump (so it feels lighter / more floaty).
  airJumps: 1,
  airJumpVelocityMul: 1.0,      // 1.0 = same height as ground jump
  // Wall jump: pressing jump while airborne and pressed against a wall (or
  // the side of any solid collider) launches the player up and away. The
  // away component briefly overrides player input so the launch reads
  // clearly and you can't immediately re-stick to the same wall.
  wallJumpVelocityY: -720,      // upward kick (negative = up) — matches ground jump
  wallJumpVelocityX: 360,       // horizontal push away from the wall
  wallJumpLockoutMs: 160,       // ms where horizontal input is ignored
  wallSlideMaxFallSpeed: 220,   // soft cap on fall speed while touching a wall (set to maxFallSpeed to disable slide)
  wallJumpRefreshesAirJumps: true, // get your air jump back on a wall jump
  // Air Dodge: a single mid-air burst in joystick direction (or facing if
  // stick is neutral). Refills on ground contact. Grants brief invulnerability
  // to falling-debris crushes so a smart dodge can save you mid-air.
  airDodgeSpeed: 520,
  airDodgeDurationMs: 160,
  airDodgeIFramesMs: 220,
  airDodgeCooldownMs: 250,      // prevents instant re-use even after a ground touch
  // Special (phase teleport): instant warp in joystick direction. Up = up,
  // down = down, side = horizontal, neutral = forward in facing direction.
  // Has a generous cooldown to keep it a tactical option, not a movement crutch.
  specialDistance: 140,
  specialIFramesMs: 180,
  specialCooldownMs: 900,
  // Climb / mantle: pulls the player onto the top of any nearby settled
  // block whose top edge is at or just above the player. Reach is measured
  // in pixels from the player's body edges — keep tight for precise edge
  // grabs (you have to be visibly next to a block, not just somewhere near).
  climbReachX: 14,              // horizontal grab range (px past body edge)
  climbMaxLiftPx: 48,           // highest ledge the mantle can grab
  climbCooldownMs: 220,
  // Fast fall (SSBM-style): tapping down on the stick mid-air while already
  // descending snaps fall speed to fastFallSpeed and bumps gravity until the
  // player lands. Lets you commit to a downward read on a falling block
  // without waiting for natural acceleration.
  fastFallInputThreshold: 0.55, // |stickY| (down) required to trigger
  fastFallSpeed: 720,           // instant fall speed when fast-fall engages
  fastFallGravityMul: 1.55,     // gravity multiplier while fast-falling
  // Crouch jump: holding down on the stick while grounded and pressing jump
  // launches with a higher initial velocity. jumpHeight = v^2 / (2g), so a
  // 1.42 velocity multiplier ~= 2x jump height.
  crouchJumpInputThreshold: 0.55, // |stickY| (down) required to arm the crouch
  crouchJumpVelocityMul: 1.42
};

export const PLAYER = {
  width: 28,
  height: 28,
  color: 0xffd84a,
  spawnX: WORLD.width / 2,
  spawnY: WORLD.floorY - 80
};

// Two-wall pattern spawner. Each spawn tick drops a matched pair of blocks:
// one on the left wall, one on the right wall, framing a player-sized gap.
// The gap CENTER drifts horizontally over time so the corridor snakes across
// the screen. The player rides upward through the moving slot.
//
// Pattern is deterministic in the spawn index (sum of two sines), so the
// corridor traces the same path every run and can be memorized.
export const PATTERN = {
  enabled: true,
  tileSize: 32,
  spawnAboveCameraPx: 80,
  // Cadence between paired drops.
  rowIntervalMsStart: 110,
  rowIntervalMsMin: 60,
  rampPerSecond: 2,
  // Gap width between the two walls, in tiles. 5 tiles = 160px - generous
  // enough for the 28px player to navigate without pixel-perfect inputs.
  gapTiles: 5,
  // Margin (in tiles) the wall pillars must keep clear of each playable
  // edge. >= 2 guarantees at least one fully-open edge column so the Pac-Man
  // horizontal wrap always lands the player in empty space, never inside a
  // wall block.
  edgeMarginTiles: 2,
  // Deterministic gap-center drift: sum of two sines over spawn index.
  driftFreq1: 0.05,
  driftFreq2: 0.013,
  driftAmplitudeRatio: 0.4,
  // Per-row cap on how far the gap center may drift from the previous row,
  // measured in tiles. Small value = the two corridors overlap = straight-up
  // path exists. Only applied on "safe" rows -- see breakChance.
  maxGapCenterDeltaTiles: 2,
  // Probability (0..1) that a row IGNORES maxGapCenterDeltaTiles and jumps to
  // wherever the drift wave wants. When it triggers, the new corridor may not
  // overlap the previous one at all -- the player has to wall-jump sideways
  // through the wall to reach the new column, or teleport across.
  breakChance: 0.5,
  // When a break DOES fire, cap the jump at this many tiles so the player
  // still has a fighting chance without teleport. Larger than
  // maxGapCenterDeltaTiles, small enough to stay wall-jumpable.
  breakMaxDeltaTiles: 6,
  // Despawn falling blocks the moment any part of them dips below the floor
  // top by this much. Keeps the floor clear of piles.
  despawnBelowFloorPx: 8,
  // Initial downward velocity for newly spawned blocks. Without this they
  // start at v=0 and crawl down under gravity, so consecutive spawns pile
  // up at the spawn line and look like a clump at the top of the screen.
  // Matches DEBRIS.maxFallSpeed (currently 280) so blocks stream cleanly.
  initialFallSpeed: 280
};

// Rising hazard from below. The kill line creeps upward over time and
// accelerates if the player falls too far behind it (catchup).
export const KILL_ZONE = {
  // How long after spawn before the line starts rising. Lets the player
  // get oriented before pressure starts.
  startDelayMs: 2500,
  // Base rise speed in px/sec.
  baseRisePxPerSec: 35,
  // If the player is below this many px above the kill line, the line
  // accelerates by catchupGain * (deficit) up to catchupMaxPxPerSec.
  comfortGapPx: 360,
  catchupGain: 0.6,
  catchupMaxPxPerSec: 220,
  // Visual band height above the kill line that fades to transparent so
  // the player can see it approaching.
  warningBandPx: 90,
  color: 0xff3322,
  warningColor: 0xff7733
};

export const DEBRIS = {
  // Random rain spawner. Disabled in pattern mode so the falling pieces
  // ONLY come from the deterministic gap-wall rows.
  enabled: false,
  // base spawn cadence in ms; gets faster over time. Dense by design: the
  // pile-up IS the timer, replacing the old rising-lava pressure.
  spawnIntervalStartMs: 260,
  spawnIntervalMinMs: 110,
  spawnRampPerSecond: 6,  // ms shaved per second of survival
  // how fast falling debris must be moving to count as a crush
  crushVelocityThreshold: 90,
  // settle when vertical speed drops below this after a downward contact
  settleVelocityThreshold: 30,
  // visual shake duration after settling
  shakeMs: 180,
  // Crush kill toggle. In pattern mode, falling = pushed back to the floor,
  // not death. Turn back on for the chaotic free-fall mode.
  crushKillsPlayer: false,
  // Debris-only gravity (independent of player gravity). Lower = floatier,
  // more time to see and react to pieces falling in.
  fallGravity: 380,
  // Cap on downward fall speed. Lower = floatier.
  maxFallSpeed: 280,
  // Telegraph: how long the warning marker is shown before the piece actually
  // drops. Higher = fairer / easier to dodge, lower = punchier / harder.
  telegraphMs: 650,
  telegraphMinMs: 350,
  telegraphRampPerSecond: 4, // shaved per second of survival
  // Visual style for the warning marker at the top of the column.
  telegraphColor: 0xff4d4d,
  telegraphFlashHz: 8
};

// Rhythm scaffolder. Runs alongside the random debris rain and inserts
// "wall-jump ladder" rungs — tall narrow blocks placed at the apex of one
// wall-jump arc above the previous rung, zigzagging horizontally so the
// player always has a reachable surface to push off of.
export const LADDER = {
  enabled: false,
  // Cadence between rungs (jitter applied per spawn).
  intervalMsStart: 900,
  intervalMsMin: 420,
  intervalJitterMs: 180,
  rampPerSecond: 4,
  // Horizontal step from current player x to next rung (px).
  stepXBase: 100,
  stepXJitter: 24,
  // Vertical step above the previous rung (px). Sized to one wall-jump arc:
  // wallJumpVelocityY^2 / (2 * gravity) ≈ 96px with current tuning.
  stepYBase: 90,
  stepYJitter: 20,
  // Probability that consecutive rungs alternate sides (1 = strict zigzag).
  flipChance: 0.85,
  // How far above the camera the first rung appears when the ladder resets
  // (e.g. on start or after the player has out-climbed the previous rung).
  spawnAboveCameraPx: 220,
  // If the previous rung is farther below the player than this, abandon the
  // chain and reseed from the top of the camera so ladders never trail too
  // far behind the player.
  resetBelowPlayerPx: 600,
  // Preferred shapes for rungs (must have decent height to provide wall
  // surface for jumps; matches keys from BootScene).
  shapeKeys: ['debris_slab', 'debris_beam', 'debris_chunk', 'debris_crate'],
  // Reject placement if it would overlap any existing debris within this
  // tolerance (px). One retry with fresh jitter, then skip.
  overlapPaddingPx: 8
};

export const CAMERA = {
  // 0 = player centered vertically. Negative values push the player toward
  // the bottom of the screen so more world above is visible. -0.35 = player
  // sits ~85% down the screen, leaving the top 85% for incoming debris.
  followOffsetYRatio: -0.35,
  lerp: 0.12,
  // Stack mode zooms the world out so more falling pieces are visible.
  // The scene sizes WORLD.width to viewportW / stackZoom so the wrap edge
  // still lines up with the canvas edge.
  stackZoom: 0.55
};

export const COLORS = {
  background: 0x05071a,
  wall: 0x1d1f28,
  floor: 0x3a2820,
  debrisPalette: [
    0x8a8d99, // concrete
    0x9a6b3a, // rusted steel
    0x6b6f7a, // machinery
    0xb0875a, // crate
    0x5e6470, // scaffolding
    0x8a8576 // industrial junk
  ]
};

// Switchable visual themes for the parallax background. The default theme
// can be cycled at runtime with the B key; selection persists via
// localStorage under THEME.storageKey.
export type ThemeId = 'stars' | 'streaks' | 'solid';
export const THEME = {
  default: 'stars' as ThemeId,
  storageKey: 'blockfall.bgTheme',
  // Per-theme background fill color used when no parallax tiles cover it.
  fillByTheme: {
    stars: 0x05071a,    // deep midnight blue
    streaks: 0x0a0a10,  // near-black industrial
    solid: 0x0a0a10     // original plain dark background
  } as Record<ThemeId, number>,
  // Names cycled in order on each B press.
  order: ['stars', 'streaks', 'solid'] as ThemeId[]
};

export const UI = {
  joystickRadius: 70,
  joystickKnobRadius: 30,
  joystickMargin: 90,
  buttonRadius: 52,
  buttonMargin: 80,
  // Opacity when the player is NOT behind the control (normal state).
  controlAlpha: 1.0,
  // Opacity when the player IS visually behind the control.
  controlAlphaOccluded: 0.18,
  // Extra pixels of buffer around a control's hit circle that still counts
  // as "behind" (so the player isn't flickering at the very edge).
  controlOcclusionPad: 14
};

// Five zones the player progresses through as climbed height grows. Each
// zone's `heightPx` is the threshold (in climbed pixels) where the zone
// becomes active. Visuals shift toward "sun rising" - the sky warms and a
// distant sun creeps up (but never actually rises past the horizon). Tier 5
// is the mythical peak: 1M height. Colors are (sky top, sky bottom).
// Thresholds curve exponentially: a decent run reaches tier 2, a great run
// tier 3, an epic run tier 4, and tier 5 is the endgame beat-drop reward.
export const ZONES = [
  { id: 1, name: 'Surface',   heightPx: 0,       skyTop: 0x000000, skyBottom: 0x0a1020, sunColor: 0x000000, sunAlpha: 0.0 },
  { id: 2, name: 'Skyline',   heightPx: 10000,   skyTop: 0x0a0a1a, skyBottom: 0x1a1030, sunColor: 0x3a1a4a, sunAlpha: 0.35 },
  { id: 3, name: 'Stratos',   heightPx: 50000,   skyTop: 0x14102a, skyBottom: 0x3a1a3a, sunColor: 0x8a2a4a, sunAlpha: 0.55 },
  { id: 4, name: 'Mesopause', heightPx: 250000,  skyTop: 0x2a1a30, skyBottom: 0x6a2a30, sunColor: 0xd04a30, sunAlpha: 0.75 },
  { id: 5, name: 'The Void',  heightPx: 1000000, skyTop: 0x4a1a3a, skyBottom: 0xd06a30, sunColor: 0xffb040, sunAlpha: 1.0  }
] as const;

// Pickups. Coins drop in the corridor gap; collecting one adds to your run
// score. They fall slower than blocks so the player can scoop them mid-jump.
export const COIN = {
  enabled: true,
  size: 14,                  // visual + body diameter in px
  color: 0xffd24a,
  edgeColor: 0xb88a14,
  // Cluster cadence (ms between cluster drops) and cluster size range.
  spawnIntervalMs: 2600,
  clusterMin: 4,
  clusterMax: 5,
  // Radius (px) of the random disc used to place cluster members around the
  // gap center. Small enough that the whole clump fits inside the corridor.
  clusterSpacingPx: 24,
  spawnAboveCameraPx: 80,
  fallSpeed: 120,            // px/s downward velocity; slow enough to catch
  despawnBelowFloorPx: 8,
  scorePerCoin: 25
};

// Boshy-style auto-fire weapon. Held SPECIAL (or F key) sprays bullets in
// the aim direction at a fixed cadence. Bullets destroy unsettled debris
// (carve through the wall) so the gun has real gameplay weight.
export const WEAPON = {
  enabled: true,
  // Pixel radius / draw size of a bullet.
  size: 6,
  color: 0xfff0a0,
  edgeColor: 0xffaa33,
  speed: 1100,             // px/s
  cooldownMs: 110,         // time between shots while holding fire
  lifetimeMs: 1100,        // self-despawn so off-screen bullets don't pile up
  // Minimum aim stick magnitude before we use stick direction; below this we
  // fall back to facing direction (horizontal only).
  aimDeadzone: 0.25,
  // Snap aim to 8 compass directions for that retro fixed-shot feel.
  eightDirSnap: true,
  // Tiny offset from player center so bullets emerge at the edge, not from
  // inside the sprite.
  muzzleOffsetPx: 10
};

// --- Stack mode ("jump between falling pieces") ---
//
// Tuning for the alternate game mode. Pieces are tetromino/pentomino-shaped
// groups of tiles that fall from above; the player jumps between them mid-
// air. There is no ground -- pieces that reach the world floor despawn.
// Every spawn is a "row" containing 1-3 pieces at the same starting Y,
// arranged such that at least 3 landable gap segments remain across the
// playable width (so RNG can never fully block progress).
export const PIECE = {
  enabled: true,
  tileSize: 48,
  // Spawn cadence. Slows to Min over the run so early game is calm.
  rowIntervalMsStart: 1400,
  rowIntervalMsMin: 700,
  rampPerSecond: 4,
  // Minimum consecutive empty columns for a segment to count as a "landable
  // gap". 2 tiles = 96px, which is comfortably wide for the 28px player.
  minGapCols: 2,
  // Required number of distinct landable gaps per row.
  minGaps: 3,
  fallSpeed: 260,          // px/s downward (constant, no gravity growth)
  color: 0x8a8d99,
  edgeColor: 0x000000,
  // Number of arrangements to try before falling back to a single centered
  // piece. 40 is plenty for typical viewport widths.
  placementAttempts: 40
};

// Piece shapes as arrays of (col, row) tile offsets. Anchor is the top-left
// of the piece's bounding box. Each entry defines one placement variant
// (rotations are included as separate shapes so the spawner treats them
// uniformly). Shape set: 2x2 square + one extra tile (P-pentomino) in each
// of the four canonical protrusions, the classic I in both orientations,
// and L/J tetrominoes in all four rotations.
export const PIECE_SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  // P-pentominoes: 2x2 + 1 extra
  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]], // extra right-bottom
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], // extra right-top
  [[0, 1], [1, 1], [0, 0], [1, 0], [0, 2]], // extra left-bottom (tall)
  [[0, 0], [1, 0], [0, 1], [1, 1], [1, 2]], // extra right-bottom (tall)
  // I-piece
  [[0, 0], [1, 0], [2, 0], [3, 0]],         // horizontal
  [[0, 0], [0, 1], [0, 2], [0, 3]],         // vertical
  // L-piece rotations
  [[0, 0], [0, 1], [0, 2], [1, 2]],         // upright L
  [[0, 0], [1, 0], [2, 0], [0, 1]],         // L flat top
  [[0, 0], [1, 0], [1, 1], [1, 2]],         // L flipped
  [[2, 0], [0, 1], [1, 1], [2, 1]],         // L flat bottom
  // J-piece rotations (mirror of L)
  [[1, 0], [1, 1], [0, 2], [1, 2]],         // upright J
  [[0, 0], [0, 1], [1, 1], [2, 1]],         // J flat bottom
  [[0, 0], [1, 0], [0, 1], [0, 2]],         // J flipped
  [[0, 0], [1, 0], [2, 0], [2, 1]]          // J flat top
] as const;

