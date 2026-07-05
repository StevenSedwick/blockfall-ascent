import Phaser from 'phaser';
import { Debris } from './Debris';
import { PIECE, PIECE_SHAPES, WORLD } from '../config/constants';

// Stack mode spawner. Every tick emits a "row" of falling pieces above the
// camera. A row is one or more tetromino/pentomino-shaped pieces (from
// PIECE_SHAPES) placed at random tile-column positions, all falling in
// unison at PIECE.fallSpeed.
//
// The placement solver GUARANTEES the row leaves at least PIECE.minGaps
// distinct landable segments of at least PIECE.minGapCols consecutive empty
// columns each. Bad RNG can never fully close the path.
//
// Individual tiles are plain Debris instances (visually a pattern_block).
// Sub-tiles never collide with each other -- they fall in lockstep -- but
// each is a real physics body the player can collide with, so per-tile hit
// detection Just Works.
export class PieceSpawner {
  private nextSpawnAt = 0;
  private startTime = 0;

  constructor(
    private scene: Phaser.Scene,
    private group: Phaser.Physics.Arcade.Group,
    private getCameraTopY: () => number
  ) {}

  start(nowMs: number): void {
    this.startTime = nowMs;
    this.nextSpawnAt = nowMs + 500;
  }

  update(nowMs: number): void {
    if (!PIECE.enabled) return;

    // Despawn tiles that have fallen past the world floor. Stack mode has
    // no ground; pieces just fall forever, so we cull anything below the
    // camera by more than half a viewport. The extra +tileSize keeps one
    // additional row of blocks alive off-screen so debris that briefly
    // slips below the viewport isn't yanked away instantly.
    const cutoff =
      this.getCameraTopY() + this.scene.scale.gameSize.height + 200 + PIECE.tileSize;
    this.group.getChildren().forEach((obj) => {
      const d = obj as Debris;
      if (d.y > cutoff) this.group.remove(d, true, true);
    });

    if (nowMs < this.nextSpawnAt) return;
    this.spawnRow();
    const secondsAlive = (nowMs - this.startTime) / 1000;
    const interval = Math.max(
      PIECE.rowIntervalMsMin,
      PIECE.rowIntervalMsStart - secondsAlive * PIECE.rampPerSecond
    );
    this.nextSpawnAt = nowMs + interval;
  }

  // Roll a row until the invariant holds, or fall back to a single piece.
  private spawnRow(): void {
    const tile = PIECE.tileSize;
    const totalCols = Math.max(6, Math.floor(WORLD.width / tile));
    for (let attempt = 0; attempt < PIECE.placementAttempts; attempt++) {
      const placements = this.rollRow(totalCols);
      const occupied = this.footprint(placements, totalCols);
      if (this.countGapSegments(occupied) >= PIECE.minGaps) {
        this.emit(placements);
        return;
      }
    }
    // Fallback: single random piece centered horizontally.
    const shape = PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
    const w = shapeCols(shape);
    const col = Math.max(0, Math.floor((totalCols - w) / 2));
    this.emit([{ shape, col }]);
  }

  // Produce a candidate row: 1-3 non-overlapping pieces at random columns.
  private rollRow(totalCols: number): Placement[] {
    const numPieces = 1 + (Math.random() < 0.7 ? 1 : 0) + (Math.random() < 0.35 ? 1 : 0);
    const placements: Placement[] = [];
    for (let i = 0; i < numPieces; i++) {
      const shape = PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
      const w = shapeCols(shape);
      if (w > totalCols) continue;
      const col = Math.floor(Math.random() * (totalCols - w + 1));
      // Reject if this placement overlaps any existing placement (column-wise).
      if (this.wouldOverlap(placements, shape, col)) continue;
      placements.push({ shape, col });
    }
    return placements;
  }

  private wouldOverlap(existing: Placement[], shape: PieceShape, col: number): boolean {
    const cols = new Set<number>();
    for (const [dx] of shape) cols.add(col + dx);
    for (const p of existing) {
      for (const [dx] of p.shape) {
        if (cols.has(p.col + dx)) return true;
      }
    }
    return false;
  }

  // Boolean array indexed by column: true if any piece occupies that column.
  private footprint(placements: Placement[], totalCols: number): boolean[] {
    const occ: boolean[] = new Array(totalCols).fill(false);
    for (const p of placements) {
      for (const [dx] of p.shape) {
        const c = p.col + dx;
        if (c >= 0 && c < totalCols) occ[c] = true;
      }
    }
    return occ;
  }

  // Count runs of consecutive false cells with length >= minGapCols.
  private countGapSegments(occupied: boolean[]): number {
    let run = 0;
    let count = 0;
    for (const cell of occupied) {
      if (!cell) {
        run += 1;
      } else {
        if (run >= PIECE.minGapCols) count += 1;
        run = 0;
      }
    }
    if (run >= PIECE.minGapCols) count += 1;
    return count;
  }

  // Build actual Debris sub-tiles for each cell of each placement.
  private emit(placements: Placement[]): void {
    const tile = PIECE.tileSize;
    const spawnY = this.getCameraTopY() - tile * 2;
    for (const p of placements) {
      for (const [dx, dy] of p.shape) {
        const x = (p.col + dx) * tile + tile / 2;
        const y = spawnY + dy * tile + tile / 2;
        const d = new Debris(this.scene, x, y, 'piece_tile');
        this.group.add(d);
        // group.add() re-stamps default body settings; restore ours AFTER
        // adding to the group.
        d.reinforceBody();
        const body = d.body as Phaser.Physics.Arcade.Body;
        // Constant fall speed, no gravity: the whole row descends in
        // lockstep, which is what makes the "row" concept coherent.
        body.setAllowGravity(false);
        body.setVelocity(0, PIECE.fallSpeed);
        body.setMaxVelocity(10000, PIECE.fallSpeed);
      }
    }
  }
}

type PieceShape = readonly (readonly [number, number])[];
type Placement = { shape: PieceShape; col: number };

function shapeCols(shape: PieceShape): number {
  let max = 0;
  for (const [dx] of shape) if (dx > max) max = dx;
  return max + 1;
}
