import type { RunStats } from '../config/types';

// Pure scoring helper. Score = climbed pixels + 2 * survival seconds. Kept
// trivial for milestone 1 so it's easy to tune.
export function computeScore(maxHeightPx: number, survivalSeconds: number): number {
  return Math.floor(maxHeightPx) + Math.floor(survivalSeconds * 2);
}

export function makeStats(maxHeightPx: number, survivalSeconds: number): RunStats {
  return {
    maxHeightPx,
    survivalSeconds,
    score: computeScore(maxHeightPx, survivalSeconds)
  };
}
